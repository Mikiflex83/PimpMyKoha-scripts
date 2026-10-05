/* ============================================================
   088-musicbrainz-coverart.js
   PimpMyKoha — Jaquettes musicales MusicBrainz / Cover Art Archive
   Version : 3.0.7-preplugin
   Date : 2026-09-21

   Réécriture complète :
   - MusicBrainz uniquement pour retrouver un MBID ;
   - Cover Art Archive pour l'image ;
   - file globale <= 1 requête MusicBrainz / seconde ;
   - cache local positif/négatif ;
   - détail et résultats search.pl activés par défaut ;
   - limitation du nombre de résultats et file MusicBrainz conservées ;
   - aucun appel si une vraie couverture est déjà présente ;
   - auto-enregistrement PMK;
   - compatibilité DOM Dracénie/Koha : .bookcoverimg + .imgcouv;
   - une image masquée par un autre module ne compte plus comme couverture affichée;
   - extraction EAN depuis .tech-ean / zone 073 et titre depuis .titlebib;
   - search.pl Dracénie : .titlebibresult, .ean-result, .bookcoverimg / .cover-slides;
   - création d’une cible de jaquette lorsque Koha affiche « Pas d’image disponible ».
   - v3.0.3 : démarrage fiabilisé si PMKConfig arrive après le module ;
   - relecture de la configuration PMK avant exécution ;
   - relance automatique du traitement lorsqu’une configuration change.
   - v3.0.4 : états explicites sur search.pl (waiting/loading/loaded/not-found/error) ;
   - observation continue des résultats reconstruits dynamiquement ;
   - observer IntersectionObserver persistant et rescans anti-doublon ;
   - API de diagnostic searchStatus()/rerunSearch().
   - v3.0.5 : search.pl activé par défaut dans la configuration du module.
   - v3.0.6 : migration unique des anciennes configs Firestore où searchEnabled=false ;
   - la migration active search.pl une fois, persiste ce choix, puis respecte
     les modifications manuelles ultérieures.
   - v3.0.7 : correction du blocage Firefox sur search.pl : une image lazy
     en display:none pouvait ne jamais émettre load ; préchargement hors DOM ;
   - cible search visible pour le moteur de chargement mais cachée par visibility ;
   - traitement direct des premiers résultats (plus de dépendance à IntersectionObserver) ;
   - verrou runtime versionné afin qu’une ancienne copie du 088 ne bloque pas
     l’exécution de cette version plus récente.

   Remarque : dans un script exécuté directement dans le navigateur, le
   User-Agent HTTP est celui du navigateur et n'est pas un en-tête fiable à
   personnaliser. Pour une diffusion commerciale / multi-clients, le mode
   recommandé est à terme un proxy côté plugin Koha avec User-Agent PMK.
   ============================================================ */
(function (window, document) {
    "use strict";

    if (!window || !document) return;

    const MODULE_ID = "musicbrainz-coverart";
    const MODULE_VERSION = "3.0.7-preplugin";
    const RUNTIME_KEY = "__PMK088MusicBrainzCoverArt_v307";

    // Verrou propre à cette version : une ancienne v3.0.x déjà chargée ne doit
    // plus empêcher la version courante de prendre la main.
    if (window[RUNTIME_KEY]) return;
    window[RUNTIME_KEY] = true;
    window.__PMK088MusicBrainzCoverArt = true;
    const CACHE_PREFIX = "pmk088:mb:";

    const DEFAULT_CONFIG = Object.freeze({
        enabled: true,
        detailEnabled: true,
        searchEnabled: true,
        onlyWhenMissing: true,
        searchMaxResults: 6,
        musicBrainzGapMs: 1100,
        positiveCacheDays: 30,
        negativeCacheHours: 24,
        useBarcodeFirst: true
    });

    let currentConfig = clone(DEFAULT_CONFIG);
    let unsubscribe = null;
    let bootPromise = null;
    let domReady = document.readyState !== "loading";
    let searchIntersectionObserver = null;
    let searchMutationObserver = null;
    let searchScanTimer = null;

    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function clean(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
    function normalizeConfig(raw) {
        const s = raw && typeof raw === "object" ? raw : {};
        return {
            enabled: s.enabled !== false,
            detailEnabled: s.detailEnabled !== false,
            searchEnabled: s.searchEnabled !== false,
            onlyWhenMissing: s.onlyWhenMissing !== false,
            searchMaxResults: Math.max(1, Math.min(30, Number(s.searchMaxResults) || 6)),
            musicBrainzGapMs: Math.max(1000, Math.min(10000, Number(s.musicBrainzGapMs) || 1100)),
            positiveCacheDays: Math.max(1, Math.min(365, Number(s.positiveCacheDays) || 30)),
            negativeCacheHours: Math.max(1, Math.min(168, Number(s.negativeCacheHours) || 24)),
            useBarcodeFirst: s.useBarcodeFirst !== false,
            searchDefaultMigrationV1: s.searchDefaultMigrationV1 === true
        };
    }

    async function migrateSearchDefaultIfNeeded(config) {
        const next = normalizeConfig(config);

        // Avant la v3.0.5, search.pl était désactivé par défaut. Une valeur
        // false déjà persistée dans Firestore continue d'écraser les nouveaux
        // defaults. On effectue donc une migration UNIQUE. Le marqueur caché
        // permet ensuite de respecter un futur choix manuel "désactivé".
        if (next.searchDefaultMigrationV1 === true) return next;

        next.searchEnabled = true;
        next.searchDefaultMigrationV1 = true;

        if (window.PMKConfig && typeof window.PMKConfig.saveConfig === "function") {
            try {
                const persisted = await window.PMKConfig.saveConfig(MODULE_ID, next);
                return normalizeConfig(persisted);
            } catch (error) {
                console.info("[PMK088] Migration search.pl non persistée ; activation appliquée pour cette page.", error);
            }
        }

        return next;
    }

    function ensureQueue() {
        if (window.PMKMusicBrainzQueue) return window.PMKMusicBrainzQueue;
        let tail = Promise.resolve();
        let lastStart = 0;
        window.PMKMusicBrainzQueue = {
            run: function (task, gapMs) {
                const job = tail.catch(function () {}).then(async function () {
                    const gap = Math.max(1000, Number(gapMs) || 1100);
                    const wait = Math.max(0, gap - (Date.now() - lastStart));
                    if (wait) await new Promise(function (resolve) { window.setTimeout(resolve, wait); });
                    lastStart = Date.now();
                    return task();
                });
                tail = job.catch(function () {});
                return job;
            }
        };
        return window.PMKMusicBrainzQueue;
    }

    function cacheKey(query) {
        let hash = 2166136261;
        const text = String(query || "");
        for (let i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return CACHE_PREFIX + (hash >>> 0).toString(36);
    }

    function readCache(query) {
        try {
            const raw = localStorage.getItem(cacheKey(query));
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || !data.expiresAt || Date.now() > Number(data.expiresAt)) {
                localStorage.removeItem(cacheKey(query));
                return null;
            }
            return data.value === undefined ? null : data.value;
        } catch (_) { return null; }
    }

    function writeCache(query, value) {
        try {
            const ttl = value
                ? currentConfig.positiveCacheDays * 86400000
                : currentConfig.negativeCacheHours * 3600000;
            localStorage.setItem(cacheKey(query), JSON.stringify({ expiresAt: Date.now() + ttl, value: value }));
        } catch (_) {}
    }

    function escapeQuery(value) {
        return clean(value).replace(/["\\]/g, " ");
    }

    function makeQuery(meta) {
        if (currentConfig.useBarcodeFirst && meta.barcode && /^\d{8,14}$/.test(meta.barcode)) {
            return "barcode:" + meta.barcode;
        }
        const parts = [];
        if (meta.title) parts.push('release:"' + escapeQuery(meta.title) + '"');
        if (meta.author) parts.push('artist:"' + escapeQuery(meta.author) + '"');
        return parts.join(" AND ");
    }

    async function musicBrainzLookup(meta) {
        const query = makeQuery(meta);
        if (!query) return null;
        const cached = readCache(query);
        if (cached !== null) return cached || null;

        const queue = ensureQueue();
        const result = await queue.run(async function () {
            const url = new URL("https://musicbrainz.org/ws/2/release/", window.location.href);
            url.searchParams.set("query", query);
            url.searchParams.set("fmt", "json");
            url.searchParams.set("limit", "5");
            const response = await fetch(url.toString(), {
                method: "GET",
                mode: "cors",
                credentials: "omit",
                headers: { "Accept": "application/json" }
            });
            if (!response.ok) throw new Error("MusicBrainz " + response.status);
            const payload = await response.json();
            const releases = Array.isArray(payload && payload.releases) ? payload.releases : [];
            if (!releases.length) return null;
            const best = releases.slice().sort(function (a, b) { return Number(b.score || 0) - Number(a.score || 0); })[0];
            if (!best || !best.id) return null;
            return {
                releaseId: best.id,
                releaseGroupId: best["release-group"] && best["release-group"].id ? best["release-group"].id : "",
                score: Number(best.score || 0)
            };
        }, currentConfig.musicBrainzGapMs);

        writeCache(query, result || "");
        return result;
    }

    function coverUrls(match) {
        const urls = [];
        if (match && match.releaseId) urls.push("https://coverartarchive.org/release/" + encodeURIComponent(match.releaseId) + "/front-250");
        if (match && match.releaseGroupId) urls.push("https://coverartarchive.org/release-group/" + encodeURIComponent(match.releaseGroupId) + "/front-250");
        return urls;
    }

    function isPlaceholderImage(img) {
        if (!img) return true;
        const src = clean(img.getAttribute && img.getAttribute("src"));
        if (!src) return true;
        return /no[-_ ]?image|no[-_ ]?cover|default[-_ ]?cover|placeholder|spacer|blank/i.test(src);
    }

    function isActuallyVisible(element) {
        if (!element || !element.isConnected) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
        if (style && (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0)) return false;
        return element.getClientRects ? element.getClientRects().length > 0 : true;
    }

    function targetHasCover(target) {
        if (!target) return false;
        if (target.tagName === "IMG") return isActuallyVisible(target) && !isPlaceholderImage(target);
        const style = window.getComputedStyle ? window.getComputedStyle(target) : null;
        const bg = clean((style && style.backgroundImage) || target.style.backgroundImage);
        return isActuallyVisible(target) && bg && bg !== "none" && !/no[-_ ]?image|placeholder/i.test(bg);
    }

    function detailCoverHost() {
        return document.querySelector(".bookcoverimg, #bookcoverimg, .cover-slider, #catalogue_detail_biblio") || null;
    }

    function visibleDetailCoverExists() {
        const host = detailCoverHost();
        if (!host) return false;
        return Array.from(host.querySelectorAll("img")).some(function (img) {
            if (img.classList && img.classList.contains("pmk088-cover")) return targetHasCover(img);
            return targetHasCover(img);
        });
    }

    function applyImage(target, urls) {
        return new Promise(function (resolve) {
            if (!target || !urls.length) {
                resolve(false);
                return;
            }

            const candidates = urls.slice();
            let index = 0;

            function finishWithUrl(url) {
                if (target.tagName === "IMG") {
                    target.loading = "eager";
                    target.src = url;
                    target.style.display = "block";
                    target.style.visibility = "visible";
                    target.style.opacity = "1";
                    target.dataset.pmk088Loaded = "1";
                } else {
                    target.style.backgroundImage = 'url("' + url.replace(/"/g, "%22") + '")';
                    target.style.backgroundSize = "cover";
                    target.style.backgroundPosition = "center";
                }

                const host = target.closest && target.closest(".bookcoverimg, .cover-slides, #bookcoverimg");
                if (host) {
                    host.querySelectorAll(".no-image").forEach(function (node) {
                        node.style.display = "none";
                    });
                }
                resolve(true);
            }

            function fail() {
                if (target.tagName === "IMG") {
                    delete target.dataset.pmk088Loaded;
                    if (target.classList.contains("pmk088-cover")) {
                        target.style.visibility = "hidden";
                        target.style.display = "none";
                        target.removeAttribute("src");
                    }
                }
                resolve(false);
            }

            function probeNext() {
                if (index >= candidates.length) {
                    fail();
                    return;
                }

                const url = candidates[index++];
                const probe = new Image();
                probe.loading = "eager";
                probe.decoding = "async";

                probe.onload = function () {
                    if ((probe.naturalWidth || 0) < 2 || (probe.naturalHeight || 0) < 2) {
                        probeNext();
                        return;
                    }
                    finishWithUrl(url);
                };
                probe.onerror = probeNext;
                probe.src = url;
            }

            probeNext();
        });
    }

    function numericProductCode(text) {
        const matches = String(text || "").match(/\b\d{8,14}\b/g) || [];
        return matches.length ? matches[0] : "";
    }

    function detailMeta() {
        const root = document.querySelector("#catalogue_detail_biblio, .biblio_data, #catalogue_detail, main") || document;
        const titleEl = root.querySelector(".titlebib a, strong.titlebib a, h1, h2.title, .title");
        const authorEl = root.querySelector('[title*="Zone : 700"] a, [title*="Zone : 701"] a, .author a, a[href*="q=au:"], a[href*="idx=au"], .author');
        const identifierNodes = document.querySelectorAll('.tech-ean, .detail_isbn, .isbn, .ean, [title*="Zone : 073"], [data-label*="ISBN" i], [data-label*="EAN" i]');
        let barcode = "";
        identifierNodes.forEach(function (node) { if (!barcode) barcode = numericProductCode(node.textContent); });
        return {
            title: clean(titleEl && titleEl.textContent).replace(/^Détails pour\s*/i, ""),
            author: clean(authorEl && authorEl.textContent).replace(/\s*\([^)]*\)\s*-?\s*$/, ""),
            barcode: barcode
        };
    }

    function detailTarget() {
        return document.querySelector(
            ".bookcoverimg img.pmk088-cover, " +
            ".bookcoverimg img.imgcouv:not([style*=\"display: none\"]), " +
            ".bookcoverimg img[data-pmk025-cover-controlled]:not([style*=\"display: none\"]), " +
            ".bookcoverimg img:not(.pmk086-trigger img), " +
            "#bookcoverimg img, #bookcoverimg, " +
            "#catalogue_detail_biblio img.cover-image, .bookcover img, .cover-image img"
        );
    }

    function ensureDetailTarget() {
        const existing = detailTarget();
        if (existing && existing.tagName === "IMG" && isActuallyVisible(existing)) return existing;

        const host = detailCoverHost();
        if (!host) return existing || null;

        let image = host.querySelector("img.pmk088-cover");
        if (!image) {
            image = document.createElement("img");
            image.className = "imgcouv pmk088-cover";
            image.alt = "Jaquette musicale";
            image.loading = "lazy";
            image.style.cssText = "float:none;margin-right:0;margin-bottom:8px;max-width:140px;height:auto;display:block;";
            const anchor = host.querySelector(".technique, .koha-technique-moved");
            if (anchor) host.insertBefore(image, anchor);
            else host.prepend(image);
        }
        return image;
    }

    async function enhanceDetail() {
        if (!currentConfig.detailEnabled || window.location.pathname !== "/cgi-bin/koha/catalogue/detail.pl") return;
        if (currentConfig.onlyWhenMissing && visibleDetailCoverExists()) return;

        const meta = detailMeta();
        if (!meta.title && !meta.barcode) return;

        try {
            const match = await musicBrainzLookup(meta);
            if (!match) return;
            const target = ensureDetailTarget();
            if (target) await applyImage(target, coverUrls(match));
        } catch (error) {
            console.info("[PMK088] MusicBrainz indisponible sur detail.pl", error);
        }
    }

    function searchRows() {
        const rows = Array.from(document.querySelectorAll(".result, tr[id^='row']"));
        return rows.slice(0, currentConfig.searchMaxResults);
    }

    function metaFromRow(row) {
        const titleEl = row.querySelector(
            ".titlebibresult a, .titlebibresult, .titlemikaresult a, " +
            ".firstresult strong a, .title a, a.title, h3 a, h2 a"
        );
        const authorEl = row.querySelector(
            ".kx-notice-meta-author[title*='700'] a, li[title*='Zone : 700'] a, " +
            "[title*='Zone : 700'] a, .author a, .author"
        );
        let barcode = "";
        row.querySelectorAll(
            ".ean-result, .isbn-result, .ean, .isbn, .tech-ean, " +
            "[data-label*='ISBN' i], [data-label*='EAN' i], .bookcoverimg[data-isbn]"
        ).forEach(function (node) {
            if (barcode) return;
            barcode = numericProductCode(
                node.textContent || (node.dataset && node.dataset.isbn) || node.getAttribute("data-isbn") || ""
            );
        });
        return {
            title: clean(titleEl && titleEl.textContent),
            author: clean(authorEl && authorEl.textContent).replace(/\s*\([^)]*\)\s*-?\s*$/, ""),
            barcode: barcode
        };
    }

    function searchCoverHost(row) {
        return row && row.querySelector("td.bookcoverimg, .bookcoverimg, .cover-slides, .thumbimg, .cover-image");
    }

    function visibleSearchCoverExists(row) {
        const host = searchCoverHost(row);
        if (!host) return false;
        return Array.from(host.querySelectorAll("img")).some(function (img) {
            return targetHasCover(img);
        });
    }

    function ensureSearchTarget(row) {
        const host = searchCoverHost(row);
        if (!host) return null;

        const existingPmk = host.querySelector("img.pmk088-cover");
        if (existingPmk) return existingPmk;

        const visible = Array.from(host.querySelectorAll("img")).find(function (img) { return targetHasCover(img); });
        if (visible) return visible;

        const image = document.createElement("img");
        image.className = "pmk088-cover pmk088-cover-search";
        image.alt = "Jaquette musicale";
        image.loading = "eager";
        image.style.cssText = "display:block;visibility:hidden;max-width:120px;height:auto;margin:0 auto;";

        const slides = row.querySelector(".cover-slides") || host;
        slides.appendChild(image);
        return image;
    }

    function setRowStatus(row, status, detail) {
        if (!row) return;
        row.dataset.pmk088Status = status;
        row.dataset.pmk088Version = MODULE_VERSION;
        if (detail) row.dataset.pmk088StatusDetail = String(detail).slice(0, 180);
        else delete row.dataset.pmk088StatusDetail;
    }

    function rowIsEligibleForSearch(row) {
        return !!(row && row.matches && row.matches(".result, tr[id^='row']"));
    }

    async function enhanceRow(row, force) {
        if (!row || !rowIsEligibleForSearch(row)) return;

        const status = row.dataset.pmk088Status || "";
        if (!force && ["loading", "loaded", "not-found", "existing"].includes(status) &&
            row.dataset.pmk088Version === MODULE_VERSION) {
            return;
        }

        row.dataset.pmk088Done = "1";
        setRowStatus(row, "loading");

        if (currentConfig.onlyWhenMissing && visibleSearchCoverExists(row)) {
            setRowStatus(row, "existing", "Une couverture visible existe déjà");
            return;
        }

        const meta = metaFromRow(row);
        if (!meta.title && !meta.barcode) {
            setRowStatus(row, "not-found", "Métadonnées insuffisantes");
            return;
        }

        const target = ensureSearchTarget(row);
        if (!target) {
            setRowStatus(row, "error", "Emplacement de jaquette introuvable");
            return;
        }

        try {
            const match = await musicBrainzLookup(meta);
            if (!match) {
                setRowStatus(row, "not-found", meta.barcode ? "Aucun résultat MusicBrainz pour " + meta.barcode : "Aucun résultat MusicBrainz");
                return;
            }

            const loaded = await applyImage(target, coverUrls(match));
            if (loaded) {
                setRowStatus(row, "loaded", match.id || "Cover Art Archive");
            } else {
                setRowStatus(row, "not-found", "Release trouvée mais aucune image exploitable");
            }
        } catch (error) {
            setRowStatus(row, "error", error && error.message ? error.message : String(error || "Erreur inconnue"));
            console.info("[PMK088] MusicBrainz indisponible sur search.pl", error);
        }
    }

    function scanSearchRows(force) {
        if (!currentConfig.searchEnabled || window.location.pathname !== "/cgi-bin/koha/catalogue/search.pl") return [];

        const rows = searchRows();

        rows.forEach(function (row) {
            const status = row.dataset.pmk088Status || "";
            const sameVersion = row.dataset.pmk088Version === MODULE_VERSION;

            if (force || !sameVersion || !status || status === "waiting" || status === "error") {
                setRowStatus(row, "waiting");
                // Le nombre de lignes est déjà borné par searchMaxResults et les
                // requêtes MusicBrainz restent sérialisées par la file globale.
                enhanceRow(row, !!force);
            }
        });

        return rows;
    }

    function scheduleSearchScan(force) {
        if (searchScanTimer) window.clearTimeout(searchScanTimer);
        searchScanTimer = window.setTimeout(function () {
            searchScanTimer = null;
            scanSearchRows(!!force);
        }, 80);
    }

    function ensureSearchMutationObserver() {
        if (searchMutationObserver || window.location.pathname !== "/cgi-bin/koha/catalogue/search.pl") return;

        const root =
            document.querySelector("#searchresults, #catalogue-results, table tbody, main") ||
            document.body;

        searchMutationObserver = new MutationObserver(function (mutations) {
            let relevant = false;
            for (const mutation of mutations) {
                if (mutation.type !== "childList" || !mutation.addedNodes.length) continue;
                for (const node of mutation.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (
                        rowIsEligibleForSearch(node) ||
                        node.querySelector(".result, tr[id^='row'], td.bookcoverimg, .cover-slides")
                    ) {
                        relevant = true;
                        break;
                    }
                }
                if (relevant) break;
            }
            if (relevant) scheduleSearchScan(false);
        });

        searchMutationObserver.observe(root, { childList: true, subtree: true });
    }

    function enhanceSearch(force) {
        if (!currentConfig.searchEnabled || window.location.pathname !== "/cgi-bin/koha/catalogue/search.pl") return;
        ensureSearchMutationObserver();
        scanSearchRows(!!force);
    }

    function searchStatusSummary() {
        const rows = Array.from(document.querySelectorAll(".result, tr[id^='row']"));
        const counts = {};
        const details = rows.map(function (row) {
            const status = row.dataset.pmk088Status || "unseen";
            counts[status] = (counts[status] || 0) + 1;
            return {
                id: row.id || "",
                status: status,
                detail: row.dataset.pmk088StatusDetail || "",
                version: row.dataset.pmk088Version || ""
            };
        });

        return {
            page: window.location.pathname,
            enabled: !!currentConfig.enabled,
            searchEnabled: !!currentConfig.searchEnabled,
            maxResults: currentConfig.searchMaxResults,
            totalRows: rows.length,
            counts: counts,
            rows: details.slice(0, currentConfig.searchMaxResults)
        };
    }

    function definition() {
        return {
            id: MODULE_ID,
            schemaVersion: 1,
            name: { fr: "Jaquettes musicales — MusicBrainz", en: "Music cover art — MusicBrainz" },
            description: {
                fr: "Recherche un MBID via MusicBrainz puis utilise Cover Art Archive comme source de jaquette. Le module respecte une file à une requête MusicBrainz par seconde et utilise un cache local.",
                en: "Finds an MBID through MusicBrainz then uses Cover Art Archive for cover images. The module enforces a one-request-per-second MusicBrainz queue and uses a local cache."
            },
            category: { fr: "Catalogue / couvertures", en: "Catalogue / covers" },
            supportedPages: ["catalogue.detail", "catalogue.search"],
            prerequisites: [
                { fr: "Accès HTTPS aux domaines musicbrainz.org et coverartarchive.org", en: "HTTPS access to musicbrainz.org and coverartarchive.org" }
            ],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            normalize: normalizeConfig,
            schema: [
                {
                    type: "section",
                    id: "settings",
                    label: { fr: "Réglages", en: "Settings" },
                    description: {
                        fr: "MusicBrainz indique que son Web Service est gratuit pour un usage non commercial. La recherche sur search.pl est activée par défaut, avec une limite de résultats et une file d’attente respectant environ 1 requête/s par IP.",
                        en: "MusicBrainz states that its web service is free for non-commercial use. Search-page enrichment is enabled by default with a result limit and a queue respecting roughly one request per second per IP."
                    },
                    fields: [
                        { key: "enabled", type: "boolean", label: { fr: "Activer le module", en: "Enable module" } },
                        { key: "detailEnabled", type: "boolean", label: { fr: "Chercher une jaquette sur detail.pl", en: "Look up covers on detail.pl" } },
                        { key: "searchEnabled", type: "boolean", label: { fr: "Chercher des jaquettes sur search.pl", en: "Look up covers on search.pl" } },
                        { key: "onlyWhenMissing", type: "boolean", label: { fr: "Ne compléter que si aucune vraie couverture n’est déjà affichée", en: "Only fill when no real cover is already displayed" } },
                        { key: "searchMaxResults", type: "number", label: { fr: "Nombre maximal de résultats interrogés par page", en: "Maximum search results queried per page" } },
                        { key: "useBarcodeFirst", type: "boolean", label: { fr: "Privilégier EAN/UPC lorsqu’il est détecté", en: "Prefer detected EAN/UPC" } },
                        { key: "musicBrainzGapMs", type: "number", advanced: true, label: { fr: "Intervalle minimal MusicBrainz (ms)", en: "Minimum MusicBrainz interval (ms)" } },
                        { key: "positiveCacheDays", type: "number", advanced: true, label: { fr: "Cache des correspondances réussies (jours)", en: "Successful match cache (days)" } },
                        { key: "negativeCacheHours", type: "number", advanced: true, label: { fr: "Cache des absences de résultat (heures)", en: "No-result cache (hours)" } }
                    ]
                }
            ]
        };
    }

    function runCurrentPage() {
        if (!domReady || !currentConfig.enabled) return;
        if (window.location.pathname === "/cgi-bin/koha/catalogue/detail.pl") {
            enhanceDetail();
        } else if (window.location.pathname === "/cgi-bin/koha/catalogue/search.pl") {
            enhanceSearch(false);
        }
    }

    function registerModule() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return false;
        try { window.PMKConfig.registerModule(definition()); } catch (_) { return false; }

        if (!unsubscribe && typeof window.PMKConfig.subscribe === "function") {
            try {
                unsubscribe = window.PMKConfig.subscribe(MODULE_ID, function (cfg) {
                    currentConfig = normalizeConfig(cfg);
                    runCurrentPage();
                });
            } catch (_) {}
        }
        return true;
    }

    async function boot() {
        if (!domReady) return false;
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") return false;

        if (bootPromise) return bootPromise;

        bootPromise = (async function () {
            registerModule();
            try {
                const loadedConfig = await window.PMKConfig.getConfig(MODULE_ID);
                currentConfig = await migrateSearchDefaultIfNeeded(loadedConfig);
            } catch (_) {
                currentConfig = await migrateSearchDefaultIfNeeded(currentConfig);
            }
            runCurrentPage();
            return true;
        })();

        try {
            return await bootPromise;
        } finally {
            bootPromise = null;
        }
    }

    function onDomReady() {
        domReady = true;
        boot();
    }

    function onConfigReady() {
        boot();
    }

    window.PMK088MusicBrainzCoverArt = {
        moduleId: MODULE_ID,
        version: MODULE_VERSION,
        defaults: clone(DEFAULT_CONFIG),
        status: function () {
            return {
                version: MODULE_VERSION,
                page: window.location.pathname,
                pmkReady: !!(window.PMKConfig && typeof window.PMKConfig.getConfig === "function"),
                runtimeKey: RUNTIME_KEY,
                config: clone(currentConfig)
            };
        },
        rerun: function () { return boot(); },
        rerunSearch: function () {
            if (window.location.pathname !== "/cgi-bin/koha/catalogue/search.pl") return false;
            enhanceSearch(true);
            return true;
        },
        searchStatus: function () {
            return searchStatusSummary();
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", onDomReady, { once: true });
    } else {
        domReady = true;
        boot();
    }

    window.addEventListener("pmk:config-ready", onConfigReady);

    // Filet de sécurité : certaines installations PMK ne diffusent pas
    // l'événement ou peuvent le diffuser avant ce fichier.
    if (!window.PMKConfig) {
        let retries = 0;
        const timer = window.setInterval(function () {
            retries += 1;
            if (window.PMKConfig) {
                window.clearInterval(timer);
                boot();
            } else if (retries >= 40) {
                window.clearInterval(timer);
            }
        }, 250);
    }
})(window, document);

/*
 Nom du fichier: 025-deplacer-grille-technique.js
 Dépendances: 000-pmk-config-firestore.js 0.4.41+ recommandé
 Date de dernière modification: 2026-09-19
 Auteur: Michael Mundet / refonte PimpMyKoha
 Description:
 - moteur générique de placement d'éléments Koha avec picker visuel ;
 - reprend les comportements historiques du 025 ;
 - absorbe les placements de couvertures des anciens 054 / 090 / 096 / 121 ;
 - gère les images 856 comme couverture de secours sans concurrencer
   les couvertures valides fournies par Koha / Electre / autres fournisseurs ;
 - évite les correctifs géométriques répétés : la colonne de couverture
   est organisée proprement en pile lorsque la section technique y est déplacée.
*/
(function () {
    "use strict";

    if (window.__PMK025ElementPlacementLoaded) return;
    window.__PMK025ElementPlacementLoaded = true;

    const MODULE_ID = "element-placement";
    const MODULE_VERSION = "1.3.1";
    const MOVED_ATTR = "data-pmk025-moved";
    const COVER_CONTROL_ATTR = "data-pmk025-cover-controlled";
    const COVER_STYLE_ID = "pmk025-cover-layout-style";

    const DEFAULTS = {
        enabled: true,
        observeDom: true,
        observeDelay: 120,
        presets: {
            technicalSectionUnderCover: true,
            frameworkAfterInfotech: true,
            detail856Fallback: true,
            search856Fallback: true,
            searchThumbnailBeforeTitle: true
        },
        coverOptions: {
            hide856WhenOtherCover: true,
            minNaturalSize: 20,
            detailMaxWidth: 140,
            searchMaxWidth: 0
        },
        rules: []
    };

    let currentConfig = null;
    let observer = null;
    let observerTimer = 0;
    let coverSyncQueued = false;
    const originals = new Map();

    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function merge(target, source) {
        if (!source || typeof source !== "object") return target;
        Object.keys(source).forEach(function (key) {
            const value = source[key];
            if (Array.isArray(value)) target[key] = deepClone(value);
            else if (value && typeof value === "object") {
                if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) target[key] = {};
                merge(target[key], value);
            } else target[key] = value;
        });
        return target;
    }

    function normalizeConfig(config) {
        const incoming = deepClone(config || {});
        const legacyRules = Array.isArray(incoming.rules) ? incoming.rules.slice() : [];
        const result = merge(deepClone(DEFAULTS), incoming);

        if (!result.presets || typeof result.presets !== "object") result.presets = deepClone(DEFAULTS.presets);
        if (!result.coverOptions || typeof result.coverOptions !== "object") result.coverOptions = deepClone(DEFAULTS.coverOptions);

        // Migration transparente depuis les valeurs par défaut de la v1.2.x :
        // les deux anciennes règles natives deviennent des presets lisibles,
        // sans apparaître deux fois dans le repeater des règles personnalisées.
        legacyRules.forEach(function (rule) {
            if (!rule || !rule.id) return;
            if (rule.id === "legacy-technical-section-under-cover") {
                result.presets.technicalSectionUnderCover = rule.enabled !== false;
            }
            if (rule.id === "legacy-framework-after-infotech") {
                result.presets.frameworkAfterInfotech = rule.enabled !== false;
            }
        });

        if (!Array.isArray(result.rules)) result.rules = [];
        result.rules = result.rules
            .filter(function (rule) {
                return rule
                    && rule.id !== "legacy-technical-section-under-cover"
                    && rule.id !== "legacy-framework-after-infotech";
            })
            .map(function (rule, index) {
                return merge({
                    id: "rule-" + (index + 1),
                    enabled: true,
                    label: "",
                    pages: "*",
                    sourceSelector: "",
                    sourceName: "",
                    destinationSelector: "",
                    destinationName: "",
                    position: "after",
                    wrapperTag: "none",
                    newLabelFr: "",
                    newLabelEn: "",
                    addLegacyTechnicalStyle: false
                }, rule || {});
            });

        result.observeDelay = Math.max(30, Number(result.observeDelay) || DEFAULTS.observeDelay);
        result.coverOptions.minNaturalSize = Math.max(1, Number(result.coverOptions.minNaturalSize) || DEFAULTS.coverOptions.minNaturalSize);
        result.coverOptions.detailMaxWidth = Math.max(0, Number(result.coverOptions.detailMaxWidth) || 0);
        result.coverOptions.searchMaxWidth = Math.max(0, Number(result.coverOptions.searchMaxWidth) || 0);

        return result;
    }

    function detectLanguage() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            try { return window.PMKConfig.getLanguage() === "en" ? "en" : "fr"; } catch (_) {}
        }
        return (document.documentElement.lang || "fr").toLowerCase().startsWith("en") ? "en" : "fr";
    }

    function splitPages(value) {
        if (Array.isArray(value)) return value.map(String);
        return String(value || "")
            .split(/[\n,;]+/)
            .map(function (v) { return v.trim(); })
            .filter(Boolean);
    }

    function normalizePath(value) {
        const raw = String(value || "").trim();
        if (!raw || raw === "*" || raw === "all") return raw;
        try {
            if (/^https?:\/\//i.test(raw)) return new URL(raw).pathname;
        } catch (_) {}
        if (raw.startsWith("/cgi-bin/koha/")) return raw;
        if (raw.startsWith("/")) return raw;
        return "/cgi-bin/koha/" + raw.replace(/^\/+/, "");
    }

    function pageMatches(rule) {
        const pages = splitPages(rule && rule.pages);
        if (!pages.length) return true;
        return pages.some(function (page) {
            const wanted = normalizePath(page);
            return !wanted || wanted === "*" || wanted === "all" || window.location.pathname === wanted;
        });
    }

    function firstConcretePage(rule) {
        const pages = splitPages(rule && rule.pages);
        for (let i = 0; i < pages.length; i += 1) {
            const path = normalizePath(pages[i]);
            if (path && path !== "*" && path !== "all") return path;
        }
        return "";
    }

    function cssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
        return String(value).replace(/[^a-zA-Z0-9_-]/g, function (c) { return "\\" + c; });
    }

    function localStableSelector(element) {
        if (!element || element.nodeType !== 1) return "";

        if (element.id) {
            try {
                const byId = "#" + cssEscape(element.id);
                if (document.querySelectorAll(byId).length === 1) return byId;
            } catch (_) {}
        }

        const dataAttrs = ["data-tabname", "data-bs-target", "name", "role"];
        for (let i = 0; i < dataAttrs.length; i += 1) {
            const attr = dataAttrs[i];
            const value = element.getAttribute && element.getAttribute(attr);
            if (!value) continue;
            const escaped = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
            const selector = element.tagName.toLowerCase() + "[" + attr + '=\"' + escaped + '\"]';
            try { if (document.querySelectorAll(selector).length === 1) return selector; } catch (_) {}
        }

        const classes = Array.from(element.classList || []).filter(function (name) {
            return !/^pmk|^active$|^selected$|^hover$|^focus$|^show$|^open$/.test(name);
        });
        if (classes.length) {
            const candidate = element.tagName.toLowerCase() + "." + classes.slice(0, 2).map(cssEscape).join(".");
            try { if (document.querySelectorAll(candidate).length === 1) return candidate; } catch (_) {}
        }

        const parts = [];
        let node = element;
        while (node && node !== document.body && parts.length < 6) {
            let part = node.tagName.toLowerCase();
            if (node.id) {
                part += "#" + cssEscape(node.id);
                parts.unshift(part);
                break;
            }
            const usable = Array.from(node.classList || []).filter(function (name) {
                return !/^pmk|^active$|^selected$|^hover$|^focus$|^show$|^open$/.test(name);
            });
            if (usable.length) part += "." + cssEscape(usable[0]);
            const parent = node.parentElement;
            if (parent && !usable.length) {
                const peers = Array.from(parent.children).filter(function (x) { return x.tagName === node.tagName; });
                if (peers.length > 1) part += ":nth-of-type(" + (peers.indexOf(node) + 1) + ")";
            }
            parts.unshift(part);
            node = parent;
        }
        return parts.join(" > ");
    }

    function saveOriginal(element) {
        if (!element || originals.has(element)) return;
        originals.set(element, {
            parent: element.parentNode,
            nextSibling: element.nextSibling,
            className: element.className,
            style: element.getAttribute("style"),
            labelText: (function () {
                const label = element.querySelector && element.querySelector(".label");
                return label ? label.textContent : null;
            })(),
            wrapper: null
        });
    }

    function restoreAll() {
        originals.forEach(function (original, element) {
            if (!element) return;
            try {
                const wrapper = original.wrapper;
                if (wrapper && wrapper.isConnected && wrapper.contains(element)) {
                    wrapper.parentNode.insertBefore(element, wrapper);
                    wrapper.remove();
                }
                if (original.parent && original.parent.isConnected) {
                    if (original.nextSibling && original.nextSibling.parentNode === original.parent) {
                        original.parent.insertBefore(element, original.nextSibling);
                    } else {
                        original.parent.appendChild(element);
                    }
                }
                if (original.style === null) element.removeAttribute("style");
                else element.setAttribute("style", original.style);
                element.className = original.className;
                const label = element.querySelector && element.querySelector(".label");
                if (label && original.labelText !== null) label.textContent = original.labelText;
                element.removeAttribute(MOVED_ATTR);
            } catch (_) {}
        });
        originals.clear();
    }

    function applyOptionalLabel(element, rule) {
        const replacement = detectLanguage() === "en"
            ? String(rule.newLabelEn || "").trim()
            : String(rule.newLabelFr || "").trim();
        if (!replacement) return;
        const label = element.querySelector && element.querySelector(".label");
        if (!label) return;
        const original = String(label.textContent || "");
        const suffix = /\s*:\s*$/.test(original) ? " :" : "";
        label.textContent = replacement + suffix;
    }

    function ensureLegacyTechnicalStyle(element, rule) {
        if (!rule.addLegacyTechnicalStyle || !element) return;
        element.classList.add("koha-technique-moved");
        element.style.display = "block";
        element.style.width = "100%";
        element.style.marginTop = "12px";
        element.style.boxSizing = "border-box";
        element.style.background = "#fff";
        element.style.padding = "15px";
        element.style.textAlign = "left";
        const content = element.querySelector(".content");
        if (content) content.style.display = "block";
    }

    function wrapSourceIfNeeded(source, rule) {
        const tag = String(rule.wrapperTag || "none").toLowerCase();
        if (tag === "none" || !/^(li|div|section|span)$/.test(tag)) return source;
        const original = originals.get(source);
        const wrapper = document.createElement(tag);
        wrapper.setAttribute("data-pmk025-wrapper", String(rule.id || "1"));
        source.parentNode.insertBefore(wrapper, source);
        wrapper.appendChild(source);
        if (original) original.wrapper = wrapper;
        return wrapper;
    }

    function performPlacement(movable, destination, position) {
        if (!movable || !destination || movable === destination) return false;
        if (movable.contains && movable.contains(destination)) return false;

        switch (position) {
            case "before":
                if (!destination.parentNode) return false;
                destination.parentNode.insertBefore(movable, destination);
                return true;
            case "after":
                if (!destination.parentNode) return false;
                destination.parentNode.insertBefore(movable, destination.nextSibling);
                return true;
            case "inside-start":
                destination.insertBefore(movable, destination.firstChild);
                return true;
            case "inside-end":
            default:
                destination.appendChild(movable);
                return true;
        }
    }


    function pageIsDetail() {
        return window.location.pathname === "/cgi-bin/koha/catalogue/detail.pl";
    }

    function pageIsSearch() {
        return window.location.pathname === "/cgi-bin/koha/catalogue/search.pl";
    }

    function ensureCoverLayoutStyle() {
        if (document.getElementById(COVER_STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = COVER_STYLE_ID;
        style.textContent = `
            .bookcoverimg.pmk025-cover-stack {
                display: flex;
                flex-direction: column;
                align-items: stretch;
                gap: 12px;
                overflow: visible !important;
            }
            .bookcoverimg.pmk025-cover-stack > #biblio-cover-slider,
            .bookcoverimg.pmk025-cover-stack > .cover-slides {
                position: relative;
                display: block;
                max-width: 100%;
                margin: 0 auto;
                flex: 0 0 auto;
            }
            .bookcoverimg.pmk025-cover-stack > #biblio-cover-slider img,
            .bookcoverimg.pmk025-cover-stack > .cover-slides img {
                max-width: 100%;
                height: auto;
            }
            .bookcoverimg.pmk025-cover-stack > .technique,
            .bookcoverimg.pmk025-cover-stack > .koha-technique-moved {
                clear: both;
                position: relative;
                z-index: auto;
                width: 100%;
                box-sizing: border-box;
                margin-top: 0 !important;
                flex: 0 0 auto;
            }
            .bookcoverimg .imgcouv[data-pmk025-cover-controlled="detail"],
            .bookcoverimg .imgcouvlist[data-pmk025-cover-controlled="search"] {
                height: auto;
                object-fit: contain;
                align-self: center;
            }
        `;
        document.head.appendChild(style);
    }

    function getBestImgSource(img) {
        if (!img) return "";
        return String(img.currentSrc || img.getAttribute("src") || img.src || "").trim();
    }

    function isLikelyPlaceholder(src) {
        return /no[-_ ]?cover|nocover|placeholder|cover_unavailable|no[-_ ]?image|spacer|transparent/i.test(src || "");
    }

    function isLikelyObsolete856Url(src) {
        return /electre\.com\/GetBlob\.ashx\?Ean=.*,/i.test(src || "");
    }

    function isElementVisible(element) {
        if (!element || !element.isConnected) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
        if (style) {
            if (style.display === "none" || style.visibility === "hidden") return false;
            if (parseFloat(style.opacity || "1") <= 0) return false;
        }
        return true;
    }

    function isUsableImage(img, options) {
        if (!img) return false;
        const opts = options || {};
        const src = getBestImgSource(img);
        if (!src || isLikelyPlaceholder(src)) return false;
        if (opts.rejectObsolete856 && isLikelyObsolete856Url(src)) return false;
        if (!img.complete) return false;
        const minSize = Math.max(1, Number(currentConfig && currentConfig.coverOptions && currentConfig.coverOptions.minNaturalSize) || 20);
        return (img.naturalWidth || 0) > minSize && (img.naturalHeight || 0) > minSize;
    }

    function setDisplay(element, visible) {
        if (!element) return;
        const wanted = visible ? "" : "none";
        if (element.style.display !== wanted) element.style.display = wanted;
    }

    function markCoverControlled(img, kind) {
        if (!img) return;
        saveOriginal(img);
        img.setAttribute(COVER_CONTROL_ATTR, kind);
    }

    function providerCoverBlocks(container) {
        if (!container) return [];
        return Array.from(container.querySelectorAll(".cover-image")).filter(function (block) {
            return !block.classList.contains("koha-856-cover-image")
                && !block.classList.contains("pmk025-856-cover-image");
        });
    }

    function hasValidProviderCover(container, visibleOnly) {
        return providerCoverBlocks(container).some(function (block) {
            if (visibleOnly && !isElementVisible(block)) return false;
            const img = block.querySelector("img");
            return isUsableImage(img);
        });
    }

    function chooseBest856Image(images) {
        const list = Array.from(images || []);
        const usable = list.find(function (img) {
            return isUsableImage(img, { rejectObsolete856: false });
        });
        if (usable) return usable;

        // Tant que les images sont encore en chargement, on garde la première
        // comme candidate ; l'événement load/error relancera l'arbitrage.
        return list.find(function (img) {
            const src = getBestImgSource(img);
            return src && !isLikelyPlaceholder(src) && !img.complete;
        }) || null;
    }

    function styleFallbackImage(img, kind) {
        if (!img) return;
        const opts = currentConfig && currentConfig.coverOptions || DEFAULTS.coverOptions;
        if (kind === "detail") {
            img.style.float = "none";
            img.style.marginRight = "0";
            img.style.marginBottom = "8px";
            if (Number(opts.detailMaxWidth) > 0) img.style.maxWidth = Number(opts.detailMaxWidth) + "px";
        } else {
            img.style.float = "none";
            img.style.marginRight = "0";
            if (Number(opts.searchMaxWidth) > 0) img.style.maxWidth = Number(opts.searchMaxWidth) + "px";
        }
        img.style.height = "auto";
    }

    function applyDetailTechnicalPreset() {
        if (!pageIsDetail()) return;
        const tech = document.querySelector(".technique");
        const coverCol = document.querySelector(".bookcoverimg")
            || (document.getElementById("biblio-cover-slider") && document.getElementById("biblio-cover-slider").closest(".bookcoverimg"));
        if (!tech || !coverCol || tech === coverCol || tech.contains(coverCol)) return;

        saveOriginal(tech);
        saveOriginal(coverCol);
        ensureCoverLayoutStyle();

        coverCol.classList.add("pmk025-cover-stack");
        tech.classList.add("koha-technique-moved");
        tech.style.display = "block";
        tech.style.width = "100%";
        tech.style.boxSizing = "border-box";
        tech.style.background = "#fff";
        tech.style.padding = "15px";
        tech.style.textAlign = "left";
        tech.style.clear = "both";
        tech.style.position = "relative";
        tech.style.zIndex = "auto";
        const content = tech.querySelector(".content");
        if (content) {
            saveOriginal(content);
            content.style.display = "block";
        }

        if (!coverCol.contains(tech) || coverCol.lastElementChild !== tech) {
            coverCol.appendChild(tech);
        }
        tech.setAttribute(MOVED_ATTR, "preset-technical-section-under-cover");
    }

    function applyFrameworkPreset() {
        if (!pageIsDetail()) return;
        const source = document.querySelector("#catalogue_detail_framework");
        const destination = document.querySelector("strong.infotech");
        if (!source || !destination || !destination.parentNode) return;

        saveOriginal(source);
        const rule = {
            id: "preset-framework-after-infotech",
            wrapperTag: "li",
            newLabelFr: "Grille utilisée",
            newLabelEn: "Framework used",
            addLegacyTechnicalStyle: false
        };
        applyOptionalLabel(source, rule);
        const movable = wrapSourceIfNeeded(source, rule);
        if (performPlacement(movable, destination, "after")) {
            source.setAttribute(MOVED_ATTR, "preset-framework-after-infotech");
        }
    }

    function detail856Images() {
        return Array.from(document.querySelectorAll(".imgcouv"));
    }

    function applyDetail856FallbackPreset() {
        if (!pageIsDetail()) return;

        const images = detail856Images();
        if (!images.length) return;

        const slider = document.getElementById("biblio-cover-slider")
            || document.querySelector(".bookcoverimg .cover-slides");
        const coverCol = document.querySelector(".bookcoverimg")
            || (slider && slider.closest(".bookcoverimg"))
            || document.querySelector("#catalogue_detail_biblio");
        if (!coverCol) return;

        ensureCoverLayoutStyle();
        const candidate = chooseBest856Image(images);
        const hideWhenOther = !currentConfig.coverOptions || currentConfig.coverOptions.hide856WhenOtherCover !== false;
        const visibleOther = slider ? hasValidProviderCover(slider, true) : false;

        images.forEach(function (img) {
            markCoverControlled(img, "detail");
            styleFallbackImage(img, "detail");

            if (!coverCol.contains(img)) {
                const insertBefore = slider && slider.parentNode === coverCol ? slider : coverCol.firstChild;
                coverCol.insertBefore(img, insertBefore || null);
            }

            if (img !== candidate) {
                setDisplay(img, false);
                return;
            }

            const usable = isUsableImage(img, { rejectObsolete856: false });
            if (img.complete && !usable) {
                setDisplay(img, false);
                return;
            }

            // Les anciennes URL Electre 856 restent utilisables comme fallback brut
            // si le navigateur réussit réellement à charger l'image, mais ne sont
            // jamais injectées comme slide supplémentaire.
            const showFallback = !hideWhenOther || !visibleOther;
            setDisplay(img, showFallback);
        });
    }

    function resultContainers() {
        const rows = Array.from(document.querySelectorAll("#searchresults tr[id^='row'], #searchresults tr, tr[id^='row']"));
        if (rows.length) return rows;
        return Array.from(document.querySelectorAll(".result"));
    }

    function applySearch856FallbackPreset() {
        if (!pageIsSearch()) return;

        resultContainers().forEach(function (row) {
            const coverCol = row.querySelector(".bookcoverimg");
            const images = Array.from(row.querySelectorAll(".imgcouvlist"));
            if (!coverCol || !images.length) return;

            const slider = coverCol.querySelector(".cover-slides");
            const candidate = chooseBest856Image(images);
            const hideWhenOther = !currentConfig.coverOptions || currentConfig.coverOptions.hide856WhenOtherCover !== false;
            const visibleOther = slider ? hasValidProviderCover(slider, true) : false;

            images.forEach(function (img) {
                markCoverControlled(img, "search");
                styleFallbackImage(img, "search");
                if (!coverCol.contains(img)) coverCol.appendChild(img);

                if (img !== candidate) {
                    setDisplay(img, false);
                    return;
                }

                const usable = isUsableImage(img, { rejectObsolete856: false });
                if (img.complete && !usable) {
                    setDisplay(img, false);
                    return;
                }

                setDisplay(img, !hideWhenOther || !visibleOther);
            });
        });
    }

    function applySearchThumbnailPreset() {
        if (!pageIsSearch()) return;
        document.querySelectorAll(".result").forEach(function (result) {
            const thumb = result.querySelector(".thumbimg");
            const title = result.querySelector(".title");
            if (!thumb || !title || !title.parentNode) return;
            saveOriginal(thumb);
            if (thumb.nextSibling !== title) title.parentNode.insertBefore(thumb, title);
            thumb.setAttribute(MOVED_ATTR, "preset-search-thumbnail-before-title");
        });
    }

    function applyPresets() {
        if (!currentConfig || !currentConfig.presets) return;
        const presets = currentConfig.presets;

        if (presets.technicalSectionUnderCover !== false) applyDetailTechnicalPreset();
        if (presets.frameworkAfterInfotech !== false) applyFrameworkPreset();
        if (presets.detail856Fallback !== false) applyDetail856FallbackPreset();
        if (presets.search856Fallback !== false) applySearch856FallbackPreset();
        if (presets.searchThumbnailBeforeTitle !== false) applySearchThumbnailPreset();
    }

    function applyRule(rule, index) {
        if (!rule || rule.enabled === false || !pageMatches(rule)) return;
        const sourceSelector = String(rule.sourceSelector || "").trim();
        const destinationSelector = String(rule.destinationSelector || "").trim();
        if (!sourceSelector || !destinationSelector) return;

        let sources = [];
        let destinations = [];
        try { sources = Array.from(document.querySelectorAll(sourceSelector)); } catch (_) { return; }
        try { destinations = Array.from(document.querySelectorAll(destinationSelector)); } catch (_) { return; }
        if (!sources.length || !destinations.length) return;

        sources.forEach(function (source, sourceIndex) {
            const destination = destinations[Math.min(sourceIndex, destinations.length - 1)];
            if (!source || !destination) return;
            saveOriginal(source);
            applyOptionalLabel(source, rule);
            ensureLegacyTechnicalStyle(source, rule);
            const movable = wrapSourceIfNeeded(source, rule);
            if (performPlacement(movable, destination, rule.position || "after")) {
                source.setAttribute(MOVED_ATTR, String(rule.id || index));
            }
        });
    }

    function applyAll() {
        if (!currentConfig || currentConfig.enabled === false) return;
        applyPresets();
        (currentConfig.rules || []).forEach(applyRule);
    }

    function queueCoverSync() {
        if (coverSyncQueued || !currentConfig || currentConfig.enabled === false) return;
        coverSyncQueued = true;
        const run = function () {
            coverSyncQueued = false;
            if (!currentConfig || currentConfig.enabled === false) return;
            if (pageIsDetail() && currentConfig.presets && currentConfig.presets.detail856Fallback !== false) {
                applyDetail856FallbackPreset();
            }
            if (pageIsSearch() && currentConfig.presets && currentConfig.presets.search856Fallback !== false) {
                applySearch856FallbackPreset();
            }
        };
        if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(run);
        else window.setTimeout(run, 0);
    }

    function isInternalMutationTarget(target) {
        if (!target || !target.closest) return false;
        return !!target.closest("[" + COVER_CONTROL_ATTR + "], [" + MOVED_ATTR + "]");
    }

    function stopObserver() {
        clearTimeout(observerTimer);
        observerTimer = 0;
        if (observer) observer.disconnect();
        observer = null;
    }

    function startObserver() {
        if (observer || !document.body) return;
        observer = new MutationObserver(function (mutations) {
            const external = mutations.some(function (mutation) {
                const target = mutation.target && mutation.target.nodeType === 1
                    ? mutation.target
                    : mutation.target && mutation.target.parentElement;
                if (isInternalMutationTarget(target)) return false;

                // Les insertions/suppressions peuvent concerner n'importe quelle
                // règle personnalisée. En revanche les attributs ne sont utiles
                // ici que pour les sliders/couvertures ; cela évite de retraiter
                // toute la page à chaque changement de classe Bootstrap/DataTables.
                if (mutation.type === "attributes") {
                    return !!(
                        target
                        && target.matches
                        && (
                            target.matches(".imgcouv, .imgcouvlist, .cover-image, .cover-slides, #biblio-cover-slider")
                            || target.closest(".cover-slides, #biblio-cover-slider, .bookcoverimg")
                        )
                    );
                }
                return true;
            });
            if (!external) return;

            clearTimeout(observerTimer);
            observerTimer = window.setTimeout(function () {
                stopObserver();
                restoreAll();
                applyAll();
                if (currentConfig && currentConfig.enabled !== false && currentConfig.observeDom !== false) startObserver();
            }, Math.max(30, Number(currentConfig && currentConfig.observeDelay) || 120));
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["style", "class", "src"]
        });
    }

    function refresh(config) {
        stopObserver();
        restoreAll();
        currentConfig = normalizeConfig(config);
        if (currentConfig.enabled !== false) {
            applyAll();
            if (currentConfig.observeDom !== false) startObserver();
        }
    }

    function pickerBannerText(kind) {
        const en = detectLanguage() === "en";
        if (kind === "destination") {
            return en ? "Click the destination element — Esc cancels" : "Clique sur l’élément de destination — Échap annule";
        }
        return en ? "Click the element to move — Esc cancels" : "Clique sur l’élément à déplacer — Échap annule";
    }

    function ruleIndexFromFieldPath(path) {
        if (!Array.isArray(path)) return -1;
        const pos = path.indexOf("rules");
        if (pos === -1) return -1;
        const index = Number(path[pos + 1]);
        return Number.isInteger(index) ? index : -1;
    }

    function pickerKindFromFieldPath(path) {
        const last = Array.isArray(path) ? String(path[path.length - 1] || "") : "";
        return last === "destinationSelector" ? "destination" : "source";
    }

    function registerCommonPickerAdapter() {
        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!service || typeof service.register !== "function") return false;
        service.register(MODULE_ID, {
            getOptions: function (request) {
                const kind = request && request.meta && request.meta.kind === "destination" ? "destination" : "source";
                return { bannerText: pickerBannerText(kind) };
            },
            applyPending: function (draft, pending, picked) {
                const index = ruleIndexFromFieldPath(pending && pending.fieldPath || []);
                if (!draft || !Array.isArray(draft.rules) || index < 0 || !draft.rules[index]) return draft;
                const rule = draft.rules[index];
                const kind = pending && pending.meta && pending.meta.kind === "destination" ? "destination" : "source";
                if (kind === "destination") {
                    rule.destinationName = picked && (picked.targetName || picked.selector) || rule.destinationName;
                } else {
                    rule.sourceName = picked && (picked.targetName || picked.selector) || rule.sourceName;
                    if (!String(rule.label || "").trim()) rule.label = rule.sourceName;
                }
                return draft;
            }
        });
        return true;
    }

    function stableSelector(element) {
        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        if (service && typeof service.stableSelector === "function") return service.stableSelector(element);
        return localStableSelector(element);
    }

    function pickElementOnCurrentPage(kind) {
        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!service || typeof service.pick !== "function") return Promise.reject(new Error("pmk_common_picker_unavailable"));
        registerCommonPickerAdapter();
        return service.pick({ moduleId: MODULE_ID, meta: { kind: kind || "source" } });
    }

    function pickForConfig(context) {
        const rootObject = context && context.rootObject ? context.rootObject : null;
        const fieldPath = context && Array.isArray(context.fieldPath) ? context.fieldPath : [];
        const index = ruleIndexFromFieldPath(fieldPath);
        const kind = pickerKindFromFieldPath(fieldPath);
        const rule = rootObject && Array.isArray(rootObject.rules) && index >= 0 ? rootObject.rules[index] : null;
        const wantedPage = firstConcretePage(rule) || window.location.pathname;
        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!service || typeof service.pickForConfig !== "function") return Promise.reject(new Error("pmk_common_picker_unavailable"));
        registerCommonPickerAdapter();
        return service.pickForConfig({
            moduleId: MODULE_ID,
            targetUrl: wantedPage,
            rootObject: rootObject || {},
            fieldPath: fieldPath,
            meta: { ruleIndex: index, kind: kind },
            adminContext: { ruleIndex: index }
        });
    }

    async function resumePendingPick() {
        registerCommonPickerAdapter();
        return true;
    }

    function newRule() {
        return {
            id: "rule-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
            enabled: true,
            label: "",
            pages: window.location.pathname || "*",
            sourceSelector: "",
            sourceName: "",
            destinationSelector: "",
            destinationName: "",
            position: "after",
            wrapperTag: "none",
            newLabelFr: "",
            newLabelEn: "",
            addLegacyTechnicalStyle: false
        };
    }

    function onSourcePick(rootObject, fieldPath, result) {
        const index = ruleIndexFromFieldPath(fieldPath);
        if (!rootObject || !Array.isArray(rootObject.rules) || index < 0 || !rootObject.rules[index] || !result) return;
        rootObject.rules[index].sourceName = result.targetName || result.selector || "";
        if (!String(rootObject.rules[index].label || "").trim()) rootObject.rules[index].label = rootObject.rules[index].sourceName;
    }

    function onDestinationPick(rootObject, fieldPath, result) {
        const index = ruleIndexFromFieldPath(fieldPath);
        if (!rootObject || !Array.isArray(rootObject.rules) || index < 0 || !rootObject.rules[index] || !result) return;
        rootObject.rules[index].destinationName = result.targetName || result.selector || "";
    }

    function validate(config) {
        const lang = detectLanguage();
        const fail = function (fr, en) { return { ok: false, message: lang === "en" ? en : fr }; };
        if (!config || !Array.isArray(config.rules)) return fail("La liste des déplacements est invalide.", "The placement rule list is invalid.");

        const options = config.coverOptions || {};
        if (options.minNaturalSize !== undefined && Number(options.minNaturalSize) < 1) {
            return fail("La taille minimale d'une couverture doit être supérieure à 0.", "Minimum cover size must be greater than 0.");
        }
        if (options.detailMaxWidth !== undefined && Number(options.detailMaxWidth) < 0) {
            return fail("La largeur maximale de la couverture détail ne peut pas être négative.", "Detail cover maximum width cannot be negative.");
        }
        if (options.searchMaxWidth !== undefined && Number(options.searchMaxWidth) < 0) {
            return fail("La largeur maximale de la couverture de résultat ne peut pas être négative.", "Search cover maximum width cannot be negative.");
        }

        for (let i = 0; i < config.rules.length; i += 1) {
            const rule = config.rules[i];
            if (!rule || rule.enabled === false) continue;
            if (!String(rule.pages || "").trim()) return fail("La règle " + (i + 1) + " doit avoir une page Koha.", "Rule " + (i + 1) + " must have a Koha page.");
            if (!String(rule.sourceSelector || "").trim()) return fail("La règle " + (i + 1) + " doit avoir un élément à déplacer.", "Rule " + (i + 1) + " must have an element to move.");
            if (!String(rule.destinationSelector || "").trim()) return fail("La règle " + (i + 1) + " doit avoir une destination.", "Rule " + (i + 1) + " must have a destination.");
            if (["before", "after", "inside-start", "inside-end"].indexOf(rule.position) === -1) return fail("La position de la règle " + (i + 1) + " est invalide.", "Rule " + (i + 1) + " has an invalid position.");
        }
        return { ok: true };
    }

    function registerVisualEditorAdapter() {
        const editor = window.PMKConfig && window.PMKConfig.visualEditor;
        if (!editor || typeof editor.register !== "function") return false;
        editor.register(MODULE_ID, {
            capabilities: {
                livePreview: true
            },
            previewDraft: function (draft) {
                const before = deepClone(currentConfig || DEFAULTS);
                refresh(draft);
                return function () {
                    refresh(before);
                };
            }
        });
        return true;
    }

    function registerModule() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return;
        window.PMKConfig.registerModule({
            id: MODULE_ID,
            schemaVersion: 2,
            name: { fr: "Placement d'éléments", en: "Element placement" },
            description: {
                fr: "Déplace visuellement des éléments Koha et centralise les placements historiques de couvertures. Les préréglages 856/Electre évitent les doublons et utilisent le 856 uniquement comme secours lorsqu'aucune autre couverture valide n'est disponible.",
                en: "Moves Koha interface elements and centralizes legacy cover placement. 856/provider presets avoid duplicates and use 856 only as a fallback when no other valid cover is available."
            },
            category: { fr: "Interface / mise en page", en: "Interface / layout" },
            supportedPages: ["catalogue.detail", "catalogue.search", "custom"],
            prerequisites: [],
            dependencies: [],
            defaults: deepClone(DEFAULTS),
            normalize: normalizeConfig,
            validate: validate,
            schema: [
                {
                    type: "section",
                    id: "activation",
                    label: { fr: "Activation générale", en: "General activation" },
                    fields: [
                        { key: "enabled", type: "boolean", label: { fr: "Activer le module", en: "Enable module" } },
                        {
                            key: "observeDom",
                            type: "boolean",
                            label: { fr: "Suivre les changements dynamiques de Koha", en: "Track dynamic Koha changes" },
                            help: {
                                fr: "Recommandé pour les couvertures chargées après l'affichage initial, notamment Electre et les sliders Koha.",
                                en: "Recommended for covers loaded after initial rendering, including provider covers and Koha sliders."
                            }
                        },
                        { key: "observeDelay", type: "number", advanced: true, label: { fr: "Délai de retraitement du DOM (ms)", en: "DOM reprocessing delay (ms)" } }
                    ]
                },
                {
                    type: "section",
                    id: "presets",
                    label: { fr: "Préréglages Koha", en: "Koha presets" },
                    description: {
                        fr: "Ces options remplacent les anciens scripts 054, 090, 096 et 121. Elles sont activées par défaut pour conserver le comportement Dracénie sans afficher de sélecteurs techniques.",
                        en: "These options replace legacy scripts 054, 090, 096 and 121. They are enabled by default to preserve the existing behavior without exposing technical selectors."
                    },
                    fields: [
                        {
                            key: "presets.technicalSectionUnderCover",
                            type: "boolean",
                            label: { fr: "Fiche détail — section technique sous la couverture", en: "Detail page — technical section below cover" },
                            help: {
                                fr: "Place la section technique dans la colonne de couverture et organise proprement la colonne en pile. Remplace aussi le correctif géométrique de l'ancien 121.",
                                en: "Places the technical section in the cover column and stacks the column cleanly. Also replaces the geometry workaround from legacy 121."
                            }
                        },
                        {
                            key: "presets.frameworkAfterInfotech",
                            type: "boolean",
                            label: { fr: "Fiche détail — grille utilisée après Infos notice", en: "Detail page — framework after record info" }
                        },
                        {
                            key: "presets.detail856Fallback",
                            type: "boolean",
                            label: { fr: "Fiche détail — image 856 comme couverture de secours", en: "Detail page — use 856 image as fallback cover" },
                            help: {
                                fr: "Déplace l'image 856 dans la zone de couverture et la masque dès qu'une autre couverture réellement chargée est disponible.",
                                en: "Moves the 856 image into the cover area and hides it as soon as another genuinely loaded cover is available."
                            }
                        },
                        {
                            key: "presets.search856Fallback",
                            type: "boolean",
                            label: { fr: "Résultats — image 856 comme couverture de secours", en: "Results — use 856 image as fallback cover" },
                            help: {
                                fr: "Remplace l'ancien 054 : une seule image 856 valide est conservée par résultat et elle disparaît lorsqu'une couverture Koha/Electre valide est visible.",
                                en: "Replaces legacy 054: only one valid 856 image is kept per result and it is hidden when a valid Koha/provider cover is visible."
                            }
                        },
                        {
                            key: "presets.searchThumbnailBeforeTitle",
                            type: "boolean",
                            label: { fr: "Résultats — miniature avant le titre", en: "Results — thumbnail before title" },
                            help: {
                                fr: "Conserve la branche search.pl de l'ancien 096 lorsqu'une miniature .thumbimg existe.",
                                en: "Preserves the search.pl branch of legacy 096 when a .thumbimg thumbnail exists."
                            }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "cover-options",
                    label: { fr: "Couvertures — réglages avancés", en: "Covers — advanced settings" },
                    description: {
                        fr: "Ces réglages ne sont généralement pas à modifier. Ils pilotent l'arbitrage des couvertures, pas leur fournisseur.",
                        en: "These settings normally do not need changing. They control cover arbitration, not the cover provider."
                    },
                    fields: [
                        {
                            key: "coverOptions.hide856WhenOtherCover",
                            type: "boolean",
                            advanced: true,
                            label: { fr: "Masquer le 856 lorsqu'une autre couverture valide existe", en: "Hide 856 when another valid cover exists" }
                        },
                        {
                            key: "coverOptions.minNaturalSize",
                            type: "number",
                            advanced: true,
                            label: { fr: "Taille minimale d'une image valide (px)", en: "Minimum valid image size (px)" }
                        },
                        {
                            key: "coverOptions.detailMaxWidth",
                            type: "number",
                            advanced: true,
                            label: { fr: "Largeur maximale du fallback 856 sur la fiche (px, 0 = CSS Koha)", en: "Maximum detail 856 fallback width (px, 0 = Koha CSS)" }
                        },
                        {
                            key: "coverOptions.searchMaxWidth",
                            type: "number",
                            advanced: true,
                            label: { fr: "Largeur maximale du fallback 856 dans les résultats (px, 0 = CSS Koha)", en: "Maximum result 856 fallback width (px, 0 = Koha CSS)" }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "rules",
                    label: { fr: "Déplacements personnalisés", en: "Custom placements" },
                    description: {
                        fr: "Ajoutez autant de déplacements que nécessaire. Les comportements historiques de couverture ci-dessus ne sont pas dupliqués ici.",
                        en: "Add as many placements as needed. The legacy cover behaviors above are not duplicated here."
                    },
                    fields: [
                        {
                            key: "rules",
                            type: "repeater",
                            label: { fr: "Règles de déplacement", en: "Placement rules" },
                            addLabel: { fr: "Ajouter un déplacement", en: "Add placement" },
                            emptyLabel: { fr: "Aucun déplacement personnalisé.", en: "No custom placement." },
                            reorder: true,
                            newItem: newRule,
                            itemTitle: function (item, index) {
                                return String(item && (item.label || item.sourceName || item.sourceSelector) || "").trim() || "Règle " + (index + 1);
                            },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Règle active", en: "Rule enabled" } },
                                { key: "label", type: "text", label: { fr: "Nom de la règle", en: "Rule name" } },
                                {
                                    key: "pages",
                                    type: "textarea",
                                    label: { fr: "Pages Koha actives", en: "Active Koha pages" },
                                    help: { fr: "Un chemin par ligne. Le picker navigue automatiquement vers la première page indiquée si nécessaire.", en: "One path per line. The picker automatically navigates to the first configured page when needed." }
                                },
                                {
                                    key: "sourceSelector",
                                    type: "elementPicker",
                                    label: { fr: "Élément à déplacer", en: "Element to move" },
                                    pickLabel: { fr: "Choisir l'élément sur la page", en: "Choose element on page" },
                                    emptyLabel: { fr: "Aucun élément choisi", en: "No element selected" },
                                    allowManual: true,
                                    pick: pickForConfig,
                                    onPick: onSourcePick
                                },
                                { key: "sourceName", type: "text", readOnly: true, advanced: true, label: { fr: "Élément détecté", en: "Detected element" } },
                                {
                                    key: "destinationSelector",
                                    type: "elementPicker",
                                    label: { fr: "Destination", en: "Destination" },
                                    pickLabel: { fr: "Choisir la destination sur la page", en: "Choose destination on page" },
                                    emptyLabel: { fr: "Aucune destination choisie", en: "No destination selected" },
                                    allowManual: true,
                                    pick: pickForConfig,
                                    onPick: onDestinationPick
                                },
                                { key: "destinationName", type: "text", readOnly: true, advanced: true, label: { fr: "Destination détectée", en: "Detected destination" } },
                                {
                                    key: "position",
                                    type: "select",
                                    label: { fr: "Position", en: "Position" },
                                    options: [
                                        { value: "before", label: { fr: "Avant la destination", en: "Before destination" } },
                                        { value: "after", label: { fr: "Après la destination", en: "After destination" } },
                                        { value: "inside-start", label: { fr: "Dans la destination — au début", en: "Inside destination — at start" } },
                                        { value: "inside-end", label: { fr: "Dans la destination — à la fin", en: "Inside destination — at end" } }
                                    ]
                                },
                                {
                                    key: "wrapperTag",
                                    type: "select",
                                    advanced: true,
                                    label: { fr: "Conteneur ajouté autour de la source", en: "Wrapper added around source" },
                                    options: [
                                        { value: "none", label: { fr: "Aucun", en: "None" } },
                                        { value: "li", label: { fr: "Élément de liste (li)", en: "List item (li)" } },
                                        { value: "div", label: { fr: "Bloc (div)", en: "Block (div)" } },
                                        { value: "section", label: { fr: "Section", en: "Section" } },
                                        { value: "span", label: { fr: "Élément inline (span)", en: "Inline element (span)" } }
                                    ]
                                },
                                { key: "newLabelFr", type: "text", advanced: true, label: { fr: "Nouveau libellé français du bloc (optionnel)", en: "French block label (optional)" } },
                                { key: "newLabelEn", type: "text", advanced: true, label: { fr: "Nouveau libellé anglais du bloc (optionnel)", en: "English block label (optional)" } },
                                { key: "addLegacyTechnicalStyle", type: "boolean", advanced: true, label: { fr: "Appliquer le style historique de la section technique", en: "Apply legacy technical-section presentation" } }
                            ]
                        }
                    ]
                }
            ]
        });
    }

    function loadConfig() {
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") return Promise.resolve(deepClone(DEFAULTS));
        return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
            .then(function (cfg) { return cfg || deepClone(DEFAULTS); })
            .catch(function () { return deepClone(DEFAULTS); });
    }

    function mountContextAccess() {
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;

        let anchor = null;
        let contextKey = "";
        let page = "";

        if (pageIsDetail()) {
            anchor = document.querySelector(".technique") || document.querySelector(".bookcoverimg") || document.querySelector("h1");
            contextKey = "catalogue-detail-layout";
            page = "catalogue.detail";
        } else if (pageIsSearch()) {
            // Ne jamais ancrer le bouton de configuration directement après une cellule <td>.
            // Un bouton enfant direct de <tr> peut créer une colonne anonyme dans le tableau Koha.
            anchor = document.querySelector("#searchheader")
                || document.querySelector("#searchresults h1")
                || document.querySelector("#searchresults")
                || document.querySelector("h1");
            contextKey = "catalogue-search-layout";
            page = "catalogue.search";
        } else {
            return;
        }

        if (!anchor) return;
        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "after",
                contextKey: contextKey,
                context: { page: page }
            });
        } catch (_) {}
    }

    function bindCoverImageEvents() {
        document.addEventListener("load", function (event) {
            const target = event.target;
            if (!target || target.tagName !== "IMG") return;
            if (
                target.matches(".imgcouv, .imgcouvlist")
                || target.closest(".cover-slides, #biblio-cover-slider")
            ) queueCoverSync();
        }, true);

        document.addEventListener("error", function (event) {
            const target = event.target;
            if (!target || target.tagName !== "IMG") return;
            if (
                target.matches(".imgcouv, .imgcouvlist")
                || target.closest(".cover-slides, #biblio-cover-slider")
            ) queueCoverSync();
        }, true);
    }

    function start() {
        ensureCoverLayoutStyle();
        registerVisualEditorAdapter();
        registerModule();
        loadConfig().then(refresh);
        if (window.PMKConfig && typeof window.PMKConfig.subscribe === "function") {
            try { window.PMKConfig.subscribe(MODULE_ID, function (config) { refresh(config); }); } catch (_) {}
        }
        mountContextAccess();
        resumePendingPick();
        bindCoverImageEvents();
    }

    window.PMK025ElementPlacement = {
        id: MODULE_ID,
        version: MODULE_VERSION,
        defaults: deepClone(DEFAULTS),
        refresh: refresh,
        apply: applyAll,
        restore: restoreAll,
        syncCovers: queueCoverSync,
        pickElement: pickElementOnCurrentPage,
        pickForConfig: pickForConfig,
        stableSelector: stableSelector
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
})();

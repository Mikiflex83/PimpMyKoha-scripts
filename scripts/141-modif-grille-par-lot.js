/* ============================================================
   PimpMyKoha — Modification de grille de catalogage par lot
   Module : bulk-framework-change
   Version : 1.0.2-preplugin
   Koha ciblé : 25.11+ (REST API v1)
   ------------------------------------------------------------
   Fonctions :
   - page autonome : /cgi-bin/koha/mainpage.pl?pmk_page=bulk-framework-change
   - entrée par biblionumber OU code-barres d'exemplaire
   - résolution code-barres -> item -> biblionumber
   - dédoublonnage des notices
   - aperçu avant traitement
   - récupération de la grille actuelle et des grilles disponibles
   - changement via PUT /api/v1/biblios/{id} + x-framework-id
   - conservation du MARCXML : le MARC est relu puis renvoyé à l'identique
   - vérification après modification
   - journal + export CSV
   - arrêt du traitement possible
   ============================================================ */

(function (window, document) {
    "use strict";

    if (!window || !document) return;
    if (window.__PMKBulkFrameworkChange) return;
    window.__PMKBulkFrameworkChange = true;

    const MODULE_ID = "bulk-framework-change";
    const MODULE_VERSION = "1.0.3-preplugin";
    const PAGE_PARAM = "bulk-framework-change";
    const API_BASE = "/api/v1";
    const MAX_INPUTS = 5000;
    const CONCURRENCY = 2;

    const state = {
        mode: "biblio",
        sourceValues: [],
        rows: [],
        frameworks: [],
        targetFramework: null,
        running: false,
        stopRequested: false,
        processed: 0,
        success: 0,
        skipped: 0,
        errors: 0
    };

    function qs(sel, root = document) {
        return root.querySelector(sel);
    }

    function qsa(sel, root = document) {
        return Array.from(root.querySelectorAll(sel));
    }

    function esc(v) {
        return String(v ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function normalizeText(v) {
        return String(v ?? "").replace(/\s+/g, " ").trim();
    }

    function csvCell(v) {
        const s = String(v ?? "");
        return `"${s.replace(/"/g, '""')}"`;
    }

    function getCsrfToken() {
        return (
            qs('meta[name="csrf-token"]')?.getAttribute("content") ||
            qs('input[name="csrf_token"]')?.value ||
            ""
        );
    }

    async function fetchText(url, options = {}) {
        const response = await fetch(url, {
            credentials: "same-origin",
            cache: "no-store",
            ...options
        });
        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`${response.status} ${response.statusText}${text ? " — " + normalizeText(text).slice(0, 300) : ""}`);
        }
        return response.text();
    }

    async function fetchJSON(url, options = {}) {
        const headers = new Headers(options.headers || {});
        if (!headers.has("Accept")) headers.set("Accept", "application/json");

        const response = await fetch(url, {
            credentials: "same-origin",
            cache: "no-store",
            ...options,
            headers
        });

        const text = await response.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch (_) {
            data = text;
        }

        if (!response.ok) {
            const msg =
                (data && typeof data === "object" && (data.error || data.error_code))
                    ? `${data.error || ""}${data.error_code ? " [" + data.error_code + "]" : ""}`
                    : normalizeText(text).slice(0, 300);
            throw new Error(`${response.status} ${response.statusText}${msg ? " — " + msg : ""}`);
        }

        return { data, response };
    }

    function parseHTML(html) {
        return new DOMParser().parseFromString(html, "text/html");
    }

    function isOurPage() {
        const url = new URL(window.location.href);
        return url.pathname.endsWith("/cgi-bin/koha/mainpage.pl") &&
            url.searchParams.get("pmk_page") === PAGE_PARAM;
    }

    function setStatus(message, type = "info") {
        const box = qs("#pmk-bfc-status");
        if (!box) return;
        box.className = `pmk-bfc-alert pmk-bfc-${type}`;
        box.textContent = message;
        box.hidden = !message;
    }

    function updateCounters() {
        const total = state.rows.length;
        const ready = state.rows.filter(r => r.status === "ready").length;
        const same = state.rows.filter(r => r.status === "same").length;
        const err = state.rows.filter(r => r.status === "error").length;
        const done = state.rows.filter(r => r.status === "done").length;

        const el = qs("#pmk-bfc-counters");
        if (el) {
            el.innerHTML = `
                <span><strong>${total}</strong> notice(s)</span>
                <span><strong>${ready}</strong> à modifier</span>
                <span><strong>${same}</strong> déjà sur la grille cible</span>
                <span><strong>${done}</strong> modifiée(s)</span>
                <span><strong>${err}</strong> erreur(s)</span>
            `;
        }

        const progress = qs("#pmk-bfc-progress");
        if (progress) {
            const processed = state.processed || 0;
            const denom = Math.max(1, state.rows.filter(r => ["ready", "processing", "done", "error", "same"].includes(r.status)).length);
            progress.value = Math.min(100, Math.round((processed / denom) * 100));
        }
    }

    function renderRows() {
        const tbody = qs("#pmk-bfc-table tbody");
        if (!tbody) return;

        tbody.innerHTML = state.rows.map((row, idx) => {
            let badge = "";
            const labels = {
                loading: "Analyse…",
                ready: "Prête",
                same: "Déjà conforme",
                processing: "Modification…",
                done: "Modifiée",
                error: "Erreur"
            };
            badge = `<span class="pmk-bfc-badge pmk-bfc-badge-${esc(row.status)}">${esc(labels[row.status] || row.status)}</span>`;

            return `
                <tr data-index="${idx}">
                    <td>${idx + 1}</td>
                    <td>${esc(row.sourceDisplay || "")}</td>
                    <td>
                        <a href="/cgi-bin/koha/catalogue/detail.pl?biblionumber=${encodeURIComponent(row.biblioId)}"
                           target="_blank" rel="noopener">${esc(row.biblioId)}</a>
                    </td>
                    <td>${esc(row.title || "—")}</td>
                    <td><code>${esc(row.currentFrameworkDisplay ?? "—")}</code></td>
                    <td><code>${esc(row.targetFrameworkDisplay ?? "—")}</code></td>
                    <td>${badge}</td>
                    <td class="pmk-bfc-message">${esc(row.message || "")}</td>
                </tr>
            `;
        }).join("");

        updateCounters();
    }

    function parseInput(raw) {
        const values = String(raw || "")
            .split(/[\r\n;,]+/)
            .map(v => v.trim())
            .filter(Boolean);

        return [...new Set(values)];
    }

    function titleFromMarcXML(xml) {
        try {
            const doc = new DOMParser().parseFromString(xml, "application/xml");
            const marcNs = "http://www.loc.gov/MARC21/slim";
            const fields = Array.from(doc.getElementsByTagNameNS(marcNs, "datafield"));
            const f200 = fields.find(f => f.getAttribute("tag") === "200");
            if (f200) {
                const subs = Array.from(f200.getElementsByTagNameNS(marcNs, "subfield"));
                const a = subs.find(s => s.getAttribute("code") === "a");
                const e = subs.find(s => s.getAttribute("code") === "e");
                return [a?.textContent, e?.textContent].filter(Boolean).map(normalizeText).join(" : ");
            }

            // fallback MARC21
            const f245 = fields.find(f => f.getAttribute("tag") === "245");
            if (f245) {
                const subs = Array.from(f245.getElementsByTagNameNS(marcNs, "subfield"));
                return subs
                    .filter(s => ["a", "b"].includes(s.getAttribute("code")))
                    .map(s => normalizeText(s.textContent))
                    .filter(Boolean)
                    .join(" ");
            }
        } catch (_) {}
        return "";
    }

    async function getMarcXML(biblioId) {
        const response = await fetch(`${API_BASE}/biblios/${encodeURIComponent(biblioId)}`, {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
            headers: {
                "Accept": "application/marcxml+xml"
            }
        });

        const text = await response.text();
        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText} — ${normalizeText(text).slice(0, 300)}`);
        }
        return text;
    }

    function extractFrameworkInfoFromEditPage(html) {
        const doc = parseHTML(html);

        // Koha peut rendre la grille sous forme de select ou de champ caché.
        const direct = doc.querySelector('[name="frameworkcode"]');
        let current = direct ? String(direct.value ?? "") : null;

        // On collecte aussi toutes les grilles proposées par l'éditeur.
        const options = [];
        doc.querySelectorAll('select[name="frameworkcode"] option, #frameworkcode option').forEach(opt => {
            options.push({
                code: String(opt.value ?? ""),
                label: normalizeText(opt.textContent || "") || (opt.value || "Défaut")
            });
            if (opt.selected) current = String(opt.value ?? "");
        });

        // fallback éventuel sur liens/inputs portant explicitement frameworkcode
        if (current === null) {
            const hidden = doc.querySelector('input[name="frameworkcode"]');
            if (hidden) current = String(hidden.value ?? "");
        }

        return { current, options };
    }

    async function getBiblioFrameworkInfo(biblioId) {
        const html = await fetchText(`/cgi-bin/koha/cataloguing/addbiblio.pl?biblionumber=${encodeURIComponent(biblioId)}`);
        return extractFrameworkInfoFromEditPage(html);
    }

    function extractFrameworksFromAdminPage(html) {
        const doc = parseHTML(html);
        const found = new Map();

        // La grille par défaut n'a pas de code.
        found.set("", { code: "", label: "Défaut" });

        // 1) Méthode la plus fiable : récupérer les frameworkcode présents
        // dans les liens d'action de la page Administration > Grilles bibliographiques.
        doc.querySelectorAll('a[href*="biblio_framework.pl"]').forEach(a => {
            let u;
            try { u = new URL(a.getAttribute("href"), window.location.origin); } catch (_) { return; }
            if (!u.searchParams.has("frameworkcode")) return;

            const code = String(u.searchParams.get("frameworkcode") ?? "");
            const row = a.closest("tr");
            let label = "";

            if (row) {
                const cells = Array.from(row.querySelectorAll("td"));
                // Koha affiche généralement le code puis la description.
                const clean = cells
                    .map(td => normalizeText(td.textContent || ""))
                    .filter(Boolean)
                    .filter(v => !/modifier|actions?|supprimer|marc|structure/i.test(v));

                label = clean.find(v => v !== code) || clean[0] || "";
            }

            if (!label) label = normalizeText(a.getAttribute("title") || a.textContent || "");
            if (!label || /modifier|actions?|supprimer/i.test(label)) label = code || "Défaut";

            if (!found.has(code)) found.set(code, { code, label });
        });

        // 2) Fallback : certaines versions rendent le code dans un data-* ou une cellule.
        doc.querySelectorAll('tr').forEach(row => {
            const explicit = row.querySelector('[data-frameworkcode]');
            let code = explicit ? String(explicit.getAttribute('data-frameworkcode') ?? '') : null;

            if (code === null) {
                const link = row.querySelector('a[href*="frameworkcode="]');
                if (link) {
                    try {
                        code = String(new URL(link.getAttribute('href'), window.location.origin).searchParams.get('frameworkcode') ?? '');
                    } catch (_) {}
                }
            }
            if (code === null || found.has(code)) return;

            const cells = Array.from(row.querySelectorAll('td'));
            const values = cells.map(td => normalizeText(td.textContent || '')).filter(Boolean);
            const label = values.find(v => v !== code) || code || 'Défaut';
            found.set(code, { code, label });
        });

        return Array.from(found.values());
    }

    async function loadAllFrameworks() {
        try {
            const html = await fetchText('/cgi-bin/koha/admin/biblio_framework.pl');
            const list = extractFrameworksFromAdminPage(html);
            if (list.length <= 1) {
                throw new Error('aucune grille supplémentaire détectée dans la page d’administration');
            }
            mergeFrameworks(list);
            renderFrameworkSelector();
            return list;
        } catch (err) {
            console.warn('[PMK141] Impossible de charger la liste complète des grilles', err);
            return [];
        }
    }

    async function resolveBarcode(barcode) {
        const url = `${API_BASE}/items?external_id=${encodeURIComponent(barcode)}&_match=exact&_per_page=20`;
        const { data } = await fetchJSON(url);

        if (!Array.isArray(data) || data.length === 0) {
            throw new Error(`Code-barres introuvable : ${barcode}`);
        }

        const exact = data.filter(item => String(item.external_id ?? "") === String(barcode));
        const candidates = exact.length ? exact : data;

        const uniqueBiblios = [...new Set(candidates.map(item => item.biblio_id).filter(v => v !== null && v !== undefined))];
        if (uniqueBiblios.length === 0) {
            throw new Error(`Aucune notice rattachée au code-barres ${barcode}`);
        }
        if (uniqueBiblios.length > 1) {
            throw new Error(`Le code-barres ${barcode} renvoie plusieurs notices (${uniqueBiblios.join(", ")})`);
        }

        return {
            biblioId: Number(uniqueBiblios[0]),
            itemIds: candidates.map(i => i.item_id).filter(Boolean),
            barcode
        };
    }

    async function hydrateBiblio(row) {
        row.status = "loading";
        renderRows();

        try {
            const [xml, fw] = await Promise.all([
                getMarcXML(row.biblioId),
                getBiblioFrameworkInfo(row.biblioId)
            ]);

            row.marcXML = xml;
            row.title = titleFromMarcXML(xml) || row.title || "";
            row.currentFramework = fw.current ?? "";
            row.currentFrameworkDisplay = row.currentFramework === "" ? "Défaut" : row.currentFramework;

            if (fw.options?.length) mergeFrameworks(fw.options);

            row.status = "ready";
            row.message = "";
        } catch (err) {
            row.status = "error";
            row.message = err?.message || String(err);
        }

        applyTargetToRow(row);
        renderFrameworkSelector();
        renderRows();
    }

    function mergeFrameworks(list) {
        const map = new Map(state.frameworks.map(f => [String(f.code), f]));
        for (const f of list || []) {
            const code = String(f.code ?? "");
            if (!map.has(code)) {
                map.set(code, {
                    code,
                    label: normalizeText(f.label || "") || (code || "Défaut")
                });
            }
        }
        // Toujours prévoir la grille par défaut.
        if (!map.has("")) map.set("", { code: "", label: "Défaut" });

        state.frameworks = Array.from(map.values()).sort((a, b) => {
            if (a.code === "") return -1;
            if (b.code === "") return 1;
            return a.label.localeCompare(b.label, "fr", { sensitivity: "base" });
        });
    }

    function renderFrameworkSelector() {
        const select = qs("#pmk-bfc-target-framework");
        if (!select) return;

        const selected = state.targetFramework !== null ? String(state.targetFramework) : select.value;
        select.innerHTML = `<option value="">— Grille par défaut —</option>` +
            state.frameworks
                .filter(f => f.code !== "")
                .map(f => `<option value="${esc(f.code)}">${esc(f.label)} (${esc(f.code)})</option>`)
                .join("");

        if (state.targetFramework !== null) {
            select.value = String(state.targetFramework);
        } else if (selected && state.frameworks.some(f => String(f.code) === selected)) {
            select.value = selected;
        }
    }

    function applyTargetToRow(row) {
        if (state.targetFramework === null) {
            row.targetFramework = null;
            row.targetFrameworkDisplay = "—";
            if (row.status === "same") row.status = "ready";
            return;
        }

        row.targetFramework = String(state.targetFramework);
        row.targetFrameworkDisplay = row.targetFramework === "" ? "Défaut" : row.targetFramework;

        if (["ready", "same"].includes(row.status)) {
            if (String(row.currentFramework ?? "") === row.targetFramework) {
                row.status = "same";
                row.message = "La notice utilise déjà cette grille.";
            } else {
                row.status = "ready";
                row.message = "";
            }
        }
    }

    function applyTargetToAll() {
        state.rows.forEach(applyTargetToRow);
        renderRows();
    }

    async function analyze() {
        // Si le chargement initial n'a ramené que la grille par défaut,
        // on retente juste avant l'analyse (utile après expiration de session/cache).
        if (state.frameworks.filter(f => String(f.code ?? "") !== "").length === 0) {
            await loadAllFrameworks();
        }

        const textarea = qs("#pmk-bfc-input");
        const values = parseInput(textarea?.value || "");

        if (!values.length) {
            setStatus("Saisis au moins une valeur.", "warning");
            return;
        }
        if (values.length > MAX_INPUTS) {
            setStatus(`Le lot contient ${values.length} valeurs. Limite de sécurité : ${MAX_INPUTS}.`, "danger");
            return;
        }

        state.sourceValues = values;
        state.rows = [];
        state.processed = 0;
        state.success = 0;
        state.skipped = 0;
        state.errors = 0;
        state.targetFramework = null;
        qs("#pmk-bfc-target-framework").value = "";
        qs("#pmk-bfc-target-wrap").hidden = true;
        qs("#pmk-bfc-actions-wrap").hidden = true;
        qs("#pmk-bfc-results-wrap").hidden = false;
        setStatus(`Analyse de ${values.length} valeur(s)…`, "info");

        const resolved = [];
        const resolveErrors = [];

        if (state.mode === "biblio") {
            for (const v of values) {
                if (!/^\d+$/.test(v)) {
                    resolveErrors.push({
                        sourceDisplay: v,
                        biblioId: "—",
                        title: "",
                        currentFrameworkDisplay: "—",
                        targetFrameworkDisplay: "—",
                        status: "error",
                        message: "Numéro de notice invalide."
                    });
                } else {
                    resolved.push({
                        biblioId: Number(v),
                        sourceDisplay: v,
                        sources: [v],
                        sourceType: "biblio",
                        status: "loading",
                        message: ""
                    });
                }
            }
        } else {
            const queue = [...values];
            const workers = Array.from({ length: Math.min(CONCURRENCY * 2, queue.length) }, async () => {
                while (queue.length) {
                    const barcode = queue.shift();
                    try {
                        const r = await resolveBarcode(barcode);
                        resolved.push({
                            biblioId: r.biblioId,
                            sourceDisplay: barcode,
                            sources: [barcode],
                            barcodes: [barcode],
                            itemIds: r.itemIds,
                            sourceType: "barcode",
                            status: "loading",
                            message: ""
                        });
                    } catch (err) {
                        resolveErrors.push({
                            sourceDisplay: barcode,
                            biblioId: "—",
                            title: "",
                            currentFrameworkDisplay: "—",
                            targetFrameworkDisplay: "—",
                            status: "error",
                            message: err?.message || String(err)
                        });
                    }
                }
            });
            await Promise.all(workers);
        }

        // Dédoublonnage par biblionumber
        const byBiblio = new Map();
        for (const row of resolved) {
            const key = String(row.biblioId);
            if (!byBiblio.has(key)) {
                byBiblio.set(key, row);
            } else {
                const existing = byBiblio.get(key);
                existing.sources.push(...(row.sources || []));
                existing.barcodes = [...new Set([...(existing.barcodes || []), ...(row.barcodes || [])])];
                existing.itemIds = [...new Set([...(existing.itemIds || []), ...(row.itemIds || [])])];
                existing.sourceDisplay = existing.sources.join(", ");
            }
        }

        state.rows = [...byBiblio.values(), ...resolveErrors];
        renderRows();

        const hydratable = state.rows.filter(r => r.biblioId !== "—");
        const queue = [...hydratable];
        const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
            while (queue.length) {
                const row = queue.shift();
                await hydrateBiblio(row);
            }
        });
        await Promise.all(workers);

        const okCount = state.rows.filter(r => r.status === "ready").length;
        const errCount = state.rows.filter(r => r.status === "error").length;

        qs("#pmk-bfc-target-wrap").hidden = okCount === 0;
        qs("#pmk-bfc-actions-wrap").hidden = okCount === 0;

        if (okCount) {
            setStatus(
                `${state.rows.length} ligne(s) analysée(s), ${okCount} notice(s) exploitable(s)` +
                (errCount ? `, ${errCount} erreur(s).` : ".") +
                " Choisis maintenant la grille cible.",
                errCount ? "warning" : "success"
            );
        } else {
            setStatus("Aucune notice exploitable dans ce lot.", "danger");
        }

        renderFrameworkSelector();
        updateCounters();
    }

    async function updateBiblioFramework(row, targetFramework) {
        // On relit le MARC juste avant écriture afin de ne jamais pousser
        // une version devenue obsolète depuis l'analyse.
        const xml = await getMarcXML(row.biblioId);
        const csrf = getCsrfToken();

        // IMPORTANT Koha :
        // le contrôleur REST utilise :
        //   header('x-framework-id') || $biblio->frameworkcode
        // Une chaîne vide est donc ignorée.
        // Pour basculer vers la grille par défaut, il faut envoyer "Default",
        // que ModBiblio normalise ensuite en chaîne vide.
        const frameworkHeaderValue =
            String(targetFramework ?? "") === "" ? "Default" : String(targetFramework);

        const headers = new Headers({
            "Accept": "application/json",
            "Content-Type": "application/marcxml+xml",
            "x-framework-id": frameworkHeaderValue,
            "x-record-schema": "UNIMARC",
            "x-confirm-not-duplicate": "1"
        });

        if (csrf) {
            // Koha 24.05+ vérifie le jeton CSRF pour les méthodes PUT
            // lorsqu'une authentification par cookie est utilisée.
            headers.set("X-CSRF-Token", csrf);
            headers.set("CSRF-TOKEN", csrf);
        }

        const response = await fetch(`${API_BASE}/biblios/${encodeURIComponent(row.biblioId)}`, {
            method: "PUT",
            credentials: "same-origin",
            cache: "no-store",
            headers,
            body: xml
        });

        const text = await response.text();
        if (!response.ok) {
            let msg = normalizeText(text).slice(0, 400);
            try {
                const j = JSON.parse(text);
                msg = `${j.error || msg}${j.error_code ? " [" + j.error_code + "]" : ""}`;
            } catch (_) {}
            throw new Error(`${response.status} ${response.statusText}${msg ? " — " + msg : ""}`);
        }

        return true;
    }

    async function verifyFramework(biblioId, expected) {
        const fw = await getBiblioFrameworkInfo(biblioId);
        return {
            ok: String(fw.current ?? "") === String(expected ?? ""),
            actual: String(fw.current ?? "")
        };
    }

    async function processOne(row) {
        if (state.stopRequested) return;

        if (row.status === "same") {
            state.skipped++;
            state.processed++;
            return;
        }
        if (row.status !== "ready") return;

        row.status = "processing";
        row.message = "";
        renderRows();

        try {
            await updateBiblioFramework(row, state.targetFramework);

            const verification = await verifyFramework(row.biblioId, state.targetFramework);
            if (!verification.ok) {
                throw new Error(
                    `Koha a répondu sans erreur, mais la vérification indique la grille ` +
                    `${verification.actual === "" ? "Défaut" : verification.actual || "inconnue"}.`
                );
            }

            row.currentFramework = String(state.targetFramework);
            row.currentFrameworkDisplay = row.currentFramework === "" ? "Défaut" : row.currentFramework;
            row.status = "done";
            row.message = "Grille modifiée et vérifiée.";
            state.success++;
        } catch (err) {
            row.status = "error";
            row.message = err?.message || String(err);
            state.errors++;
        } finally {
            state.processed++;
            renderRows();
        }
    }

    async function runBatch() {
        if (state.running) return;

        if (state.targetFramework === null) {
            setStatus("Choisis une grille cible avant de lancer le traitement.", "warning");
            return;
        }

        const ready = state.rows.filter(r => r.status === "ready");
        const same = state.rows.filter(r => r.status === "same");

        if (!ready.length) {
            setStatus(
                same.length
                    ? "Toutes les notices exploitables utilisent déjà la grille cible."
                    : "Aucune notice prête à être modifiée.",
                "warning"
            );
            return;
        }

        const targetLabel = state.targetFramework === "" ? "Défaut" : state.targetFramework;
        const confirmation = window.confirm(
            `Modifier la grille de ${ready.length} notice(s) vers « ${targetLabel} » ?\n\n` +
            `Le contenu MARC sera relu puis réenregistré à l'identique avec cette grille.\n` +
            `Cette opération modifie réellement les notices Koha.`
        );
        if (!confirmation) return;

        const second = window.prompt(
            `Confirmation de sécurité : tape ${ready.length} pour lancer le traitement.`
        );
        if (String(second).trim() !== String(ready.length)) {
            setStatus("Traitement annulé : confirmation incorrecte.", "warning");
            return;
        }

        state.running = true;
        state.stopRequested = false;
        state.processed = 0;
        state.success = 0;
        state.skipped = 0;
        state.errors = 0;

        qs("#pmk-bfc-run").disabled = true;
        qs("#pmk-bfc-stop").disabled = false;
        qs("#pmk-bfc-analyze").disabled = true;
        qs("#pmk-bfc-target-framework").disabled = true;

        setStatus(`Traitement en cours : ${ready.length} notice(s)…`, "info");

        const queue = [...state.rows.filter(r => ["ready", "same"].includes(r.status))];
        const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
            while (queue.length && !state.stopRequested) {
                const row = queue.shift();
                await processOne(row);
            }
        });

        await Promise.all(workers);

        state.running = false;
        qs("#pmk-bfc-run").disabled = false;
        qs("#pmk-bfc-stop").disabled = true;
        qs("#pmk-bfc-analyze").disabled = false;
        qs("#pmk-bfc-target-framework").disabled = false;

        const remaining = state.rows.filter(r => r.status === "ready").length;

        if (state.stopRequested) {
            setStatus(
                `Traitement arrêté. ${state.success} modification(s) réussie(s), ` +
                `${state.errors} erreur(s), ${remaining} restante(s).`,
                "warning"
            );
        } else if (state.errors) {
            setStatus(
                `Traitement terminé avec erreurs : ${state.success} réussite(s), ` +
                `${state.errors} erreur(s).`,
                "warning"
            );
        } else {
            setStatus(
                `Traitement terminé : ${state.success} notice(s) modifiée(s)` +
                (state.skipped ? `, ${state.skipped} déjà conforme(s)` : "") + ".",
                "success"
            );
        }

        renderRows();
    }

    function stopBatch() {
        if (!state.running) return;
        state.stopRequested = true;
        qs("#pmk-bfc-stop").disabled = true;
        setStatus("Arrêt demandé : les opérations déjà lancées vont se terminer, aucune nouvelle notice ne sera démarrée.", "warning");
    }

    function exportCSV() {
        if (!state.rows.length) return;

        const lines = [
            ["source", "biblionumber", "titre", "grille_actuelle", "grille_cible", "statut", "message"]
                .map(csvCell).join(";")
        ];

        for (const row of state.rows) {
            lines.push([
                row.sourceDisplay || "",
                row.biblioId || "",
                row.title || "",
                row.currentFrameworkDisplay || "",
                row.targetFrameworkDisplay || "",
                row.status || "",
                row.message || ""
            ].map(csvCell).join(";"));
        }

        const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
            type: "text/csv;charset=utf-8"
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `pmk-modification-grille-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function resetAll() {
        if (state.running) return;
        state.sourceValues = [];
        state.rows = [];
        state.targetFramework = null;
        state.processed = 0;
        state.success = 0;
        state.skipped = 0;
        state.errors = 0;

        qs("#pmk-bfc-input").value = "";
        qs("#pmk-bfc-target-wrap").hidden = true;
        qs("#pmk-bfc-actions-wrap").hidden = true;
        qs("#pmk-bfc-results-wrap").hidden = true;
        qs("#pmk-bfc-target-framework").value = "";
        setStatus("", "info");
        renderRows();
    }

    function installCSS() {
        if (qs("#pmk-bfc-style")) return;
        const style = document.createElement("style");
        style.id = "pmk-bfc-style";
        style.textContent = `
            #pmk-bfc-app { max-width: 1500px; margin: 0 auto; }
            #pmk-bfc-app .pmk-bfc-card {
                background: var(--bs-body-bg, #fff);
                border: 1px solid #d7dce1;
                border-radius: 8px;
                padding: 18px;
                margin: 0 0 16px;
                box-shadow: 0 1px 2px rgba(0,0,0,.04);
            }
            #pmk-bfc-app .pmk-bfc-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 20px;
                margin-bottom: 16px;
            }
            #pmk-bfc-app .pmk-bfc-header h1 { margin: 0 0 4px; font-size: 1.55rem; }
            #pmk-bfc-app .pmk-bfc-muted { color: #67727e; }
            #pmk-bfc-app .pmk-bfc-mode {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
                margin-bottom: 12px;
            }
            #pmk-bfc-app .pmk-bfc-mode label {
                border: 1px solid #cbd2d9;
                border-radius: 6px;
                padding: 9px 12px;
                cursor: pointer;
                background: #fff;
            }
            #pmk-bfc-app .pmk-bfc-mode label:has(input:checked) {
                border-color: #0b6fa4;
                box-shadow: 0 0 0 1px #0b6fa4 inset;
                background: #f2f9fc;
            }
            #pmk-bfc-app textarea {
                min-height: 170px;
                resize: vertical;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            }
            #pmk-bfc-app .pmk-bfc-toolbar {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 8px;
                margin-top: 12px;
            }
            #pmk-bfc-app .pmk-bfc-alert {
                border-radius: 6px;
                padding: 10px 12px;
                margin-bottom: 16px;
                border: 1px solid transparent;
            }
            #pmk-bfc-app .pmk-bfc-info { background:#eef7fb; border-color:#b8deed; }
            #pmk-bfc-app .pmk-bfc-success { background:#edf8f0; border-color:#b9dfc2; }
            #pmk-bfc-app .pmk-bfc-warning { background:#fff7e6; border-color:#efd79a; }
            #pmk-bfc-app .pmk-bfc-danger { background:#fdeeee; border-color:#e8b8b8; }
            #pmk-bfc-app .pmk-bfc-grid {
                display: grid;
                grid-template-columns: minmax(240px, 500px) 1fr;
                gap: 16px;
                align-items: end;
            }
            #pmk-bfc-app .pmk-bfc-counters {
                display:flex; flex-wrap:wrap; gap:10px 18px; margin: 8px 0 12px;
            }
            #pmk-bfc-app .pmk-bfc-table-wrap {
                overflow: auto;
                max-height: 62vh;
                border: 1px solid #d7dce1;
                border-radius: 6px;
            }
            #pmk-bfc-app table { margin: 0; width: 100%; }
            #pmk-bfc-app thead th {
                position: sticky;
                top: 0;
                z-index: 2;
                background: #f5f6f7;
                white-space: nowrap;
            }
            #pmk-bfc-app .pmk-bfc-badge {
                display:inline-block; border-radius:999px; padding:3px 8px; font-size:.83em; white-space:nowrap;
                background:#e9ecef;
            }
            #pmk-bfc-app .pmk-bfc-badge-ready { background:#e8f3fb; }
            #pmk-bfc-app .pmk-bfc-badge-same { background:#f1f1f1; }
            #pmk-bfc-app .pmk-bfc-badge-processing { background:#fff2c9; }
            #pmk-bfc-app .pmk-bfc-badge-done { background:#dff2e3; }
            #pmk-bfc-app .pmk-bfc-badge-error { background:#f8dada; }
            #pmk-bfc-app .pmk-bfc-message { min-width: 220px; max-width: 520px; }
            #pmk-bfc-app progress { width: 100%; height: 12px; margin-top: 8px; }
            #pmk-bfc-app code { white-space: nowrap; }
            #pmk-bfc-app .pmk-bfc-note {
                border-left: 4px solid #d19a00;
                padding: 8px 12px;
                background: #fffaf0;
                margin-top: 12px;
            }
            @media (max-width: 900px) {
                #pmk-bfc-app .pmk-bfc-grid { grid-template-columns: 1fr; }
            }
        `;
        document.head.appendChild(style);
    }

    function renderApp() {
        installCSS();

        const main =
            qs("#main") ||
            qs("main") ||
            qs(".main") ||
            qs("#content") ||
            document.body;

        // On garde autant que possible l'entête/navigation Koha mais on remplace
        // le contenu central de mainpage.
        const existing = qs("#pmk-bfc-app");
        if (existing) return existing;

        const app = document.createElement("div");
        app.id = "pmk-bfc-app";
        app.innerHTML = `
            <div class="pmk-bfc-header">
                <div>
                    <h1><i class="fa-solid fa-table-list" aria-hidden="true"></i> Modification de grille par lot</h1>
                    <div class="pmk-bfc-muted">
                        Change la grille de catalogage de plusieurs notices à partir de numéros de notice
                        ou de codes-barres d'exemplaires.
                    </div>
                </div>
                <div class="pmk-bfc-muted">PimpMyKoha · ${esc(MODULE_VERSION)}</div>
            </div>

            <div id="pmk-bfc-status" class="pmk-bfc-alert pmk-bfc-info" hidden></div>

            <section class="pmk-bfc-card">
                <h2>1. Sélectionner les notices</h2>

                <div class="pmk-bfc-mode">
                    <label>
                        <input type="radio" name="pmk_bfc_mode" value="biblio" checked>
                        <strong>Numéros de notice</strong>
                    </label>
                    <label>
                        <input type="radio" name="pmk_bfc_mode" value="barcode">
                        <strong>Codes-barres d'exemplaires</strong>
                    </label>
                </div>

                <label for="pmk-bfc-input" id="pmk-bfc-input-label">
                    Un numéro de notice par ligne
                </label>
                <textarea id="pmk-bfc-input" class="form-control"
                    placeholder="379480&#10;381245&#10;402117"></textarea>

                <div class="pmk-bfc-toolbar">
                    <button type="button" class="btn btn-primary" id="pmk-bfc-analyze">
                        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Analyser le lot
                    </button>
                    <button type="button" class="btn btn-default" id="pmk-bfc-reset">
                        Réinitialiser
                    </button>
                </div>
                <div class="pmk-bfc-muted" style="margin-top:8px">
                    Les doublons sont éliminés. Avec les codes-barres, plusieurs exemplaires d'une même notice
                    ne produiront qu'une seule modification.
                </div>
            </section>

            <section class="pmk-bfc-card" id="pmk-bfc-target-wrap" hidden>
                <h2>2. Choisir la nouvelle grille</h2>
                <div class="pmk-bfc-grid">
                    <div>
                        <label for="pmk-bfc-target-framework"><strong>Grille cible</strong></label>
                        <select id="pmk-bfc-target-framework" class="form-control">
                            <option value="">— Grille par défaut —</option>
                        </select>
                    </div>
                    <div class="pmk-bfc-note">
                        Le changement de grille ne supprime ni n'ajoute volontairement de zones MARC.
                        La notice est relue en MARCXML, puis réenregistrée avec la grille sélectionnée.
                    </div>
                </div>
            </section>

            <section class="pmk-bfc-card" id="pmk-bfc-actions-wrap" hidden>
                <h2>3. Exécuter</h2>
                <div class="pmk-bfc-counters" id="pmk-bfc-counters"></div>
                <progress id="pmk-bfc-progress" max="100" value="0"></progress>
                <div class="pmk-bfc-toolbar">
                    <button type="button" class="btn btn-danger" id="pmk-bfc-run">
                        <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
                        Modifier les grilles
                    </button>
                    <button type="button" class="btn btn-default" id="pmk-bfc-stop" disabled>
                        Arrêter
                    </button>
                    <button type="button" class="btn btn-default" id="pmk-bfc-export">
                        Exporter le rapport CSV
                    </button>
                </div>
            </section>

            <section class="pmk-bfc-card" id="pmk-bfc-results-wrap" hidden>
                <h2>Aperçu et résultat</h2>
                <div class="pmk-bfc-counters" id="pmk-bfc-counters-copy"></div>
                <div class="pmk-bfc-table-wrap">
                    <table class="table table-striped table-hover" id="pmk-bfc-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Entrée</th>
                                <th>Notice</th>
                                <th>Titre</th>
                                <th>Grille actuelle</th>
                                <th>Grille cible</th>
                                <th>État</th>
                                <th>Message</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </section>
        `;

        // On vise le conteneur de contenu sans casser les menus Koha.
        const content =
            qs("#main_intranet-main") ||
            qs(".maincontent") ||
            qs("#content") ||
            main;

        /*
         * IMPORTANT :
         * ne jamais vider globalement le conteneur de mainpage.pl.
         * IntranetNav (134) et plusieurs modules PMK injectent leurs éléments
         * dans/près de cette zone. Un content.innerHTML = "" les détruisait.
         *
         * On masque uniquement le contenu natif de l'accueil Koha déjà présent,
         * tout en conservant explicitement les zones de navigation PMK/Koha.
         */
        const protectedSelectors = [
            "#toplevelmenu",
            "#bottomActionBar",
            "#custom-tools-menu",
            "[data-pmk-intranetnav]",
            ".pmk-intranetnav",
            "[id^='pmk-intranetnav']",
            "[class*='pmk-intranetnav']"
        ].join(",");

        Array.from(content.children).forEach(child => {
            if (child === app) return;

            const isProtected =
                (child.matches && child.matches(protectedSelectors)) ||
                (child.querySelector && child.querySelector(protectedSelectors));

            if (isProtected) return;

            // Conserver les noeuds appartenant explicitement à PMK.
            const id = String(child.id || "");
            const cls = String(child.className || "");
            const isPMK =
                id.startsWith("pmk-") ||
                /(^|\s)pmk[-_]/i.test(cls);

            if (isPMK) return;

            child.dataset.pmkBfcHiddenNative = "1";
            child.style.display = "none";
        });

        content.appendChild(app);

        // Le second compteur est volontairement synchronisé par observer léger.
        const c1 = qs("#pmk-bfc-counters");
        const c2 = qs("#pmk-bfc-counters-copy");
        if (c1 && c2) {
            new MutationObserver(() => { c2.innerHTML = c1.innerHTML; })
                .observe(c1, { childList: true, subtree: true, characterData: true });
        }

        qsa('input[name="pmk_bfc_mode"]').forEach(radio => {
            radio.addEventListener("change", () => {
                if (!radio.checked) return;
                state.mode = radio.value;
                const label = qs("#pmk-bfc-input-label");
                const ta = qs("#pmk-bfc-input");
                if (state.mode === "barcode") {
                    label.textContent = "Un code-barres d'exemplaire par ligne";
                    ta.placeholder = "0000637178\n0000582144\n0000719321";
                } else {
                    label.textContent = "Un numéro de notice par ligne";
                    ta.placeholder = "379480\n381245\n402117";
                }
            });
        });

        qs("#pmk-bfc-analyze").addEventListener("click", analyze);
        qs("#pmk-bfc-reset").addEventListener("click", resetAll);
        qs("#pmk-bfc-run").addEventListener("click", runBatch);
        qs("#pmk-bfc-stop").addEventListener("click", stopBatch);
        qs("#pmk-bfc-export").addEventListener("click", exportCSV);

        qs("#pmk-bfc-target-framework").addEventListener("change", ev => {
            state.targetFramework = String(ev.target.value ?? "");
            applyTargetToAll();
        });

        return app;
    }

    async function boot() {
        if (!isOurPage()) return;
        renderApp();

        // Charge immédiatement la liste complète des grilles depuis
        // Administration > Grilles bibliographiques.
        const allFrameworks = await loadAllFrameworks();
        if (!allFrameworks.length) {
            setStatus(
                "Impossible de charger automatiquement toutes les grilles bibliographiques. " +
                "Le module utilisera les informations disponibles dans les notices analysées.",
                "warning"
            );
        }

        // Vérification informative de la présence du jeton CSRF.
        if (!getCsrfToken()) {
            setStatus(
                "Le jeton CSRF Koha n'est pas visible dans cette page. L'analyse restera possible, " +
                "mais Koha peut refuser les modifications PUT avec une erreur 403.",
                "warning"
            );
        }
    }

    window.PMKBulkFrameworkChange = {
        id: MODULE_ID,
        version: MODULE_VERSION,
        state,
        loadAllFrameworks,
        analyze,
        runBatch,
        stopBatch,
        reset: resetAll,
        open() {
            window.location.href = `/cgi-bin/koha/mainpage.pl?pmk_page=${encodeURIComponent(PAGE_PARAM)}`;
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }

})(window, document);

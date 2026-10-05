/* ============================================================
   138-authorised-values-bulk-import.js
   PimpMyKoha — Import / export en masse de valeurs autorisées
   Version : 1.1.1-preplugin

   Fonctionnalités :
   - import texte : 1 libellé par ligne ;
   - import CSV collé ou depuis un fichier ;
   - si une ligne ne contient qu'un libellé, ce libellé devient aussi l'identifiant ;
   - CSV avec ou sans entête ;
   - détection automatique du séparateur (; , ou tabulation) ;
   - prévisualisation avant import ;
   - détection des doublons déjà présents dans Koha ;
   - détection des doublons dans l'import ;
   - contrôle longueur ID/libellés ;
   - contrôle des catégories « nombres uniquement » ;
   - import avec jeton CSRF natif Koha ;
   - rapport final et progression ;
   - export CSV d'une catégorie ;
   - export CSV de toutes les catégories et de toutes leurs valeurs autorisées.

   Pages : /cgi-bin/koha/admin/authorised_values.pl
   ============================================================ */
(function (window, document) {
    "use strict";

    if (!window || !document) return;
    if (window.__PMK138AuthorisedValuesBulkImport) return;
    window.__PMK138AuthorisedValuesBulkImport = true;

    const MODULE_ID = "authorised-values-bulk-import";
    const MODULE_VERSION = "1.1.1-preplugin";
    const PAGE_PATH = "/cgi-bin/koha/admin/authorised_values.pl";
    const DIALOG_ID = "pmk138-av-import-dialog";
    const BUTTON_ID = "pmk138-av-import-button";
    const STYLE_ID = "pmk138-av-import-style";
    const MAX_PARALLEL = 4;

    const isFrench = /^fr\b/i.test(document.documentElement.lang || navigator.language || "fr");

    const I18N = {
        fr: {
            button: "Importer des valeurs",
            exportButton: "Exporter",
            exportTitle: "Exporter les valeurs autorisées",
            exportCurrent: "Exporter la catégorie affichée",
            exportAll: "Exporter toutes les catégories",
            exporting: "Export en cours…",
            exportDone: "Export terminé.",
            exportNoCurrent: "Aucune catégorie n’est actuellement affichée.",
            exportError: "Impossible d’exporter les valeurs autorisées.",
            exportPrepareCurrent: "Préparer la catégorie affichée",
            exportPrepareAll: "Préparer toutes les catégories",
            exportDownload: "Télécharger le CSV",
            exportReady: "Le fichier est prêt.",
            exportRows: "valeurs exportées",
            exportWorking: "Préparation de l’export…",
            exportClose: "Fermer",
            title: "Import en masse de valeurs autorisées",
            category: "Catégorie cible",
            loadingCategories: "Chargement des catégories…",
            source: "Source",
            linesMode: "1 valeur par ligne",
            csvMode: "CSV",
            content: "Valeurs à importer",
            linesHint: "Une ligne = un libellé. Le libellé est également utilisé comme identifiant.",
            csvHint: "CSV avec ou sans entête. Colonnes possibles : id, libelle, libelle_opac. Sans entête : 1 colonne = libellé ; 2 colonnes = id + libellé ; 3 colonnes = id + libellé + libellé OPAC.",
            file: "Charger un fichier CSV",
            copyOpac: "Copier le libellé dans le libellé OPAC lorsqu'il est vide",
            preview: "Prévisualiser",
            import: "Importer",
            close: "Fermer",
            cancel: "Annuler",
            refresh: "Actualiser la catégorie",
            previewTitle: "Prévisualisation",
            status: "État",
            id: "Identifiant",
            label: "Libellé",
            opac: "Libellé OPAC",
            ready: "Prête",
            existing: "Existe déjà",
            duplicateInput: "Doublon dans l'import",
            invalid: "Erreur",
            empty: "Aucune valeur à importer.",
            chooseCategory: "Choisissez une catégorie.",
            preparing: "Analyse en cours…",
            importing: "Import en cours…",
            done: "Import terminé.",
            success: "Ajoutée",
            error: "Erreur d'import",
            summaryReady: "à importer",
            summaryExisting: "déjà présentes",
            existingTitle: "Déjà présentes dans Koha",
            existingIntro: "Ces valeurs existent déjà dans la catégorie et ne seront pas réimportées.",
            noExisting: "Aucune valeur déjà existante détectée.",
            summaryDuplicate: "doublons dans l'import",
            summaryErrors: "erreurs",
            imported: "ajoutées",
            failed: "en erreur",
            idTooLong: "Identifiant supérieur à 80 caractères",
            labelTooLong: "Libellé supérieur à 200 caractères",
            opacTooLong: "Libellé OPAC supérieur à 200 caractères",
            invalidInteger: "Cette catégorie n'accepte que des nombres entiers de -128 à 127",
            emptyId: "Identifiant vide",
            serverError: "Koha a refusé l'ajout",
            networkError: "Erreur réseau",
            csvReadError: "Impossible de lire ce fichier.",
            noCategory: "Aucune catégorie de valeurs autorisées disponible.",
            invalidPage: "Ce module fonctionne uniquement sur l'administration des valeurs autorisées.",
            sourceChanged: "La source a changé : relancez la prévisualisation avant d'importer.",
            categoryChanged: "La catégorie a changé : relancez la prévisualisation avant d'importer.",
            exampleLines: "Roman\nPolicier\nScience-fiction",
            exampleCsv: "id;libelle;libelle_opac\nROM;Roman;Roman\nPOL;Policier;Policier\nSF;Science-fiction;Science-fiction"
        },
        en: {
            button: "Import values",
            exportButton: "Export",
            exportTitle: "Export authorised values",
            exportCurrent: "Export displayed category",
            exportAll: "Export all categories",
            exporting: "Exporting…",
            exportDone: "Export complete.",
            exportNoCurrent: "No category is currently displayed.",
            exportError: "Unable to export authorised values.",
            exportPrepareCurrent: "Prepare displayed category",
            exportPrepareAll: "Prepare all categories",
            exportDownload: "Download CSV",
            exportReady: "The file is ready.",
            exportRows: "exported values",
            exportWorking: "Preparing export…",
            exportClose: "Close",
            title: "Bulk import authorised values",
            category: "Target category",
            loadingCategories: "Loading categories…",
            source: "Source",
            linesMode: "1 value per line",
            csvMode: "CSV",
            content: "Values to import",
            linesHint: "One line = one label. The label is also used as the identifier.",
            csvHint: "CSV with or without a header. Supported columns: id, label, opac_label. Without a header: 1 column = label; 2 columns = id + label; 3 columns = id + label + OPAC label.",
            file: "Load CSV file",
            copyOpac: "Copy label to OPAC label when empty",
            preview: "Preview",
            import: "Import",
            close: "Close",
            cancel: "Cancel",
            refresh: "Refresh category",
            previewTitle: "Preview",
            status: "Status",
            id: "Identifier",
            label: "Label",
            opac: "OPAC label",
            ready: "Ready",
            existing: "Already exists",
            duplicateInput: "Duplicate in import",
            invalid: "Error",
            empty: "No value to import.",
            chooseCategory: "Choose a category.",
            preparing: "Analysing…",
            importing: "Importing…",
            done: "Import complete.",
            success: "Added",
            error: "Import error",
            summaryReady: "to import",
            summaryExisting: "already present",
            existingTitle: "Already present in Koha",
            existingIntro: "These values already exist in the category and will not be imported again.",
            noExisting: "No existing value detected.",
            summaryDuplicate: "duplicates in import",
            summaryErrors: "errors",
            imported: "added",
            failed: "failed",
            idTooLong: "Identifier is longer than 80 characters",
            labelTooLong: "Label is longer than 200 characters",
            opacTooLong: "OPAC label is longer than 200 characters",
            invalidInteger: "This category only accepts integers from -128 to 127",
            emptyId: "Empty identifier",
            serverError: "Koha rejected the value",
            networkError: "Network error",
            csvReadError: "Unable to read this file.",
            noCategory: "No authorised value category is available.",
            invalidPage: "This module only runs on the authorised values administration page.",
            sourceChanged: "The source changed: run the preview again before importing.",
            categoryChanged: "The category changed: run the preview again before importing.",
            exampleLines: "Novel\nCrime\nScience fiction",
            exampleCsv: "id;label;opac_label\nNOV;Novel;Novel\nCRI;Crime;Crime\nSF;Science fiction;Science fiction"
        }
    };

    const t = I18N[isFrench ? "fr" : "en"];

    const state = {
        categories: [],
        preview: [],
        context: null,
        previewFingerprint: "",
        importing: false
    };

    function onTargetPage() {
        return window.location.pathname === PAGE_PATH;
    }

    function normalizeSpace(value) {
        return String(value == null ? "" : value)
            .replace(/^\uFEFF/, "")
            .replace(/\r/g, "")
            .trim();
    }

    function normalizeKey(value) {
        return normalizeSpace(value).toLocaleLowerCase();
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function css() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #${DIALOG_ID}[hidden],
            #pmk138-export-dialog[hidden] { display:none !important; }
            #pmk138-export-dialog {
                position:fixed; inset:0; z-index:100000;
                background:rgba(0,0,0,.45);
                display:flex; align-items:flex-start; justify-content:center;
                padding:4vh 16px; overflow:auto;
            }
            #pmk138-export-dialog .pmk138-panel {
                width:min(720px, 100%); background:#fff; border-radius:8px;
                box-shadow:0 15px 45px rgba(0,0,0,.28); overflow:hidden;
            }
            #pmk138-export-dialog .pmk138-head {
                display:flex; align-items:center; justify-content:space-between;
                gap:1rem; padding:14px 18px; border-bottom:1px solid #ddd;
            }
            #pmk138-export-dialog .pmk138-head h2 { margin:0; font-size:1.25rem; }
            #pmk138-export-dialog .pmk138-x {
                border:0; background:transparent; font-size:1.6rem; line-height:1;
                cursor:pointer; padding:0 4px;
            }
            #pmk138-export-dialog .pmk138-body { padding:18px; }
            #pmk138-export-dialog .pmk138-actions {
                display:flex; flex-wrap:wrap; gap:8px; margin-top:14px;
            }
            #pmk138-export-dialog .pmk138-footer {
                display:flex; justify-content:flex-end; gap:8px;
                padding:12px 18px; border-top:1px solid #ddd; background:#fafafa;
            }
            #pmk138-export-dialog .pmk138-progress-bar {
                height:12px; background:#eee; border-radius:999px; overflow:hidden;
            }
            #pmk138-export-dialog .pmk138-progress-bar > span {
                display:block; height:100%; width:0%; background:#3c763d; transition:width .15s linear;
            }
            #pmk138-export-dialog .pmk138-hint { color:#666; font-size:.92em; margin-top:5px; }

            #${DIALOG_ID}[hidden] { display:none !important; }
            #${DIALOG_ID} {
                position:fixed; inset:0; z-index:100000;
                background:rgba(0,0,0,.45);
                display:flex; align-items:flex-start; justify-content:center;
                padding:4vh 16px; overflow:auto;
            }
            #${DIALOG_ID} .pmk138-panel {
                width:min(1180px, 100%); background:#fff; border-radius:8px;
                box-shadow:0 15px 45px rgba(0,0,0,.28); overflow:hidden;
            }
            #${DIALOG_ID} .pmk138-head {
                display:flex; align-items:center; justify-content:space-between;
                gap:1rem; padding:14px 18px; border-bottom:1px solid #ddd;
            }
            #${DIALOG_ID} .pmk138-head h2 { margin:0; font-size:1.25rem; }
            #${DIALOG_ID} .pmk138-x {
                border:0; background:transparent; font-size:1.6rem; line-height:1;
                cursor:pointer; padding:0 4px;
            }
            #${DIALOG_ID} .pmk138-body { padding:18px; }
            #${DIALOG_ID} .pmk138-grid {
                display:grid; grid-template-columns:minmax(220px, 1fr) minmax(0, 2fr);
                gap:16px;
            }
            #${DIALOG_ID} .pmk138-field { margin-bottom:14px; }
            #${DIALOG_ID} .pmk138-field > label,
            #${DIALOG_ID} .pmk138-field > .pmk138-label {
                display:block; font-weight:600; margin-bottom:6px;
            }
            #${DIALOG_ID} select,
            #${DIALOG_ID} textarea,
            #${DIALOG_ID} input[type="file"] { width:100%; max-width:100%; }
            #${DIALOG_ID} textarea { min-height:210px; resize:vertical; font-family:monospace; }
            #${DIALOG_ID} .pmk138-modes { display:flex; flex-wrap:wrap; gap:12px; }
            #${DIALOG_ID} .pmk138-hint { color:#666; font-size:.92em; margin-top:5px; }
            #${DIALOG_ID} .pmk138-actions {
                display:flex; flex-wrap:wrap; align-items:center; gap:8px;
                margin-top:14px;
            }
            #${DIALOG_ID} .pmk138-summary { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0; }
            #${DIALOG_ID} .pmk138-chip {
                display:inline-flex; align-items:center; border:1px solid #d9d9d9;
                border-radius:999px; padding:3px 10px; background:#f7f7f7;
            }
            #${DIALOG_ID} .pmk138-preview-wrap { overflow:auto; max-height:42vh; border:1px solid #ddd; }
            #${DIALOG_ID} table { width:100%; margin:0; border-collapse:collapse; }
            #${DIALOG_ID} th,
            #${DIALOG_ID} td { padding:7px 9px; border-bottom:1px solid #e7e7e7; vertical-align:top; }
            #${DIALOG_ID} thead th { position:sticky; top:0; background:#f5f5f5; z-index:1; }
            #${DIALOG_ID} .pmk138-status-ready { color:#1e6b34; font-weight:600; }
            #${DIALOG_ID} .pmk138-status-skip { color:#8a5b00; font-weight:600; }
            #${DIALOG_ID} .pmk138-status-error { color:#b42318; font-weight:600; }
            #${DIALOG_ID} .pmk138-progress { margin-top:14px; }
            #${DIALOG_ID} .pmk138-progress-bar { height:12px; background:#eee; border-radius:999px; overflow:hidden; }
            #${DIALOG_ID} .pmk138-progress-bar > span { display:block; height:100%; width:0%; background:#3c763d; transition:width .15s linear; }
            #${DIALOG_ID} .pmk138-log { margin-top:8px; max-height:120px; overflow:auto; font-size:.92em; }
            #${DIALOG_ID} .pmk138-footer {
                display:flex; justify-content:flex-end; flex-wrap:wrap; gap:8px;
                padding:12px 18px; border-top:1px solid #ddd; background:#fafafa;
            }
            #${DIALOG_ID} .pmk138-message { margin:10px 0; }
            @media (max-width: 780px) {
                #${DIALOG_ID} { padding:0; }
                #${DIALOG_ID} .pmk138-panel { min-height:100vh; border-radius:0; }
                #${DIALOG_ID} .pmk138-grid { grid-template-columns:1fr; }
                #${DIALOG_ID} .pmk138-preview-wrap { max-height:none; }
            }
        `;
        document.head.appendChild(style);
    }

    function getDialog() {
        return document.getElementById(DIALOG_ID);
    }

    function buildDialog() {
        if (getDialog()) return getDialog();
        css();
        const root = document.createElement("div");
        root.id = DIALOG_ID;
        root.hidden = true;
        root.setAttribute("role", "dialog");
        root.setAttribute("aria-modal", "true");
        root.setAttribute("aria-labelledby", "pmk138-title");
        root.innerHTML = `
            <div class="pmk138-panel">
                <div class="pmk138-head">
                    <h2 id="pmk138-title"><i class="fa fa-file-import" aria-hidden="true"></i> ${escapeHtml(t.title)}</h2>
                    <button type="button" class="pmk138-x" id="pmk138-close-x" aria-label="${escapeHtml(t.close)}">&times;</button>
                </div>
                <div class="pmk138-body">
                    <div id="pmk138-message" class="pmk138-message" hidden></div>
                    <div class="pmk138-grid">
                        <div>
                            <div class="pmk138-field">
                                <label for="pmk138-category">${escapeHtml(t.category)}</label>
                                <select id="pmk138-category"><option value="">${escapeHtml(t.loadingCategories)}</option></select>
                            </div>
                            <div class="pmk138-field">
                                <span class="pmk138-label">${escapeHtml(t.source)}</span>
                                <div class="pmk138-modes">
                                    <label><input type="radio" name="pmk138-mode" value="lines" checked> ${escapeHtml(t.linesMode)}</label>
                                    <label><input type="radio" name="pmk138-mode" value="csv"> ${escapeHtml(t.csvMode)}</label>
                                </div>
                            </div>
                            <div class="pmk138-field" id="pmk138-file-field" hidden>
                                <label for="pmk138-file">${escapeHtml(t.file)}</label>
                                <input type="file" id="pmk138-file" accept=".csv,text/csv,text/plain">
                            </div>
                            <div class="pmk138-field">
                                <label><input type="checkbox" id="pmk138-copy-opac"> ${escapeHtml(t.copyOpac)}</label>
                            </div>
                        </div>
                        <div>
                            <div class="pmk138-field">
                                <label for="pmk138-source">${escapeHtml(t.content)}</label>
                                <textarea id="pmk138-source" spellcheck="false" placeholder="${escapeHtml(t.exampleLines)}"></textarea>
                                <div class="pmk138-hint" id="pmk138-source-hint">${escapeHtml(t.linesHint)}</div>
                            </div>
                        </div>
                    </div>
                    <div class="pmk138-actions">
                        <button type="button" class="btn btn-primary" id="pmk138-preview-btn"><i class="fa fa-eye" aria-hidden="true"></i> ${escapeHtml(t.preview)}</button>
                        <button type="button" class="btn btn-success" id="pmk138-import-btn" disabled><i class="fa fa-file-import" aria-hidden="true"></i> ${escapeHtml(t.import)}</button>
                    </div>
                    <div id="pmk138-preview-section" hidden>
                        <h3>${escapeHtml(t.previewTitle)}</h3>
                        <div id="pmk138-summary" class="pmk138-summary"></div>

                        <div id="pmk138-existing-section" class="alert alert-warning" hidden>
                            <h4 style="margin-top:0">
                                <i class="fa fa-triangle-exclamation" aria-hidden="true"></i>
                                ${escapeHtml(t.existingTitle)}
                            </h4>
                            <p>${escapeHtml(t.existingIntro)}</p>
                            <div class="pmk138-preview-wrap" style="max-height:220px;background:#fff">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>${escapeHtml(t.id)}</th>
                                            <th>${escapeHtml(t.label)}</th>
                                            <th>${escapeHtml(t.opac)}</th>
                                        </tr>
                                    </thead>
                                    <tbody id="pmk138-existing-body"></tbody>
                                </table>
                            </div>
                        </div>

                        <div class="pmk138-preview-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>${escapeHtml(t.status)}</th>
                                        <th>${escapeHtml(t.id)}</th>
                                        <th>${escapeHtml(t.label)}</th>
                                        <th>${escapeHtml(t.opac)}</th>
                                    </tr>
                                </thead>
                                <tbody id="pmk138-preview-body"></tbody>
                            </table>
                        </div>
                    </div>
                    <div id="pmk138-progress" class="pmk138-progress" hidden>
                        <div class="pmk138-progress-bar"><span id="pmk138-progress-bar"></span></div>
                        <div id="pmk138-progress-text" class="pmk138-hint"></div>
                        <div id="pmk138-log" class="pmk138-log"></div>
                    </div>
                </div>
                <div class="pmk138-footer">
                    <button type="button" class="btn btn-default" id="pmk138-refresh" hidden><i class="fa fa-rotate" aria-hidden="true"></i> ${escapeHtml(t.refresh)}</button>
                    <button type="button" class="btn btn-default" id="pmk138-close">${escapeHtml(t.close)}</button>
                </div>
            </div>
        `;
        document.body.appendChild(root);
        bindDialogEvents(root);
        return root;
    }

    function showMessage(message, kind) {
        const el = document.getElementById("pmk138-message");
        if (!el) return;
        el.hidden = !message;
        el.className = "pmk138-message alert " + (kind === "error" ? "alert-danger" : kind === "success" ? "alert-success" : "alert-info");
        el.textContent = message || "";
    }

    function getMode() {
        const checked = document.querySelector('input[name="pmk138-mode"]:checked');
        return checked ? checked.value : "lines";
    }

    function fingerprint() {
        const category = document.getElementById("pmk138-category")?.value || "";
        const source = document.getElementById("pmk138-source")?.value || "";
        const mode = getMode();
        const copyOpac = !!document.getElementById("pmk138-copy-opac")?.checked;
        return JSON.stringify([category, mode, copyOpac, source]);
    }

    function invalidatePreview(message) {
        state.preview = [];
        state.context = null;
        state.previewFingerprint = "";
        const btn = document.getElementById("pmk138-import-btn");
        if (btn) btn.disabled = true;
        const section = document.getElementById("pmk138-preview-section");
        if (section) section.hidden = true;
        const progress = document.getElementById("pmk138-progress");
        if (progress) progress.hidden = true;
        const existingSection = document.getElementById("pmk138-existing-section");
        if (existingSection) existingSection.hidden = true;
        const refresh = document.getElementById("pmk138-refresh");
        if (refresh) refresh.hidden = true;
        if (message) showMessage(message, "info");
    }

    function bindDialogEvents(root) {
        const close = () => {
            if (state.importing) return;
            root.hidden = true;
            document.body.style.overflow = "";
        };
        root.querySelector("#pmk138-close-x").addEventListener("click", close);
        root.querySelector("#pmk138-close").addEventListener("click", close);
        root.addEventListener("click", function (event) {
            if (event.target === root) close();
        });
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && !root.hidden) close();
        });

        root.querySelectorAll('input[name="pmk138-mode"]').forEach(function (radio) {
            radio.addEventListener("change", function () {
                const csv = getMode() === "csv";
                root.querySelector("#pmk138-file-field").hidden = !csv;
                root.querySelector("#pmk138-source-hint").textContent = csv ? t.csvHint : t.linesHint;
                root.querySelector("#pmk138-source").placeholder = csv ? t.exampleCsv : t.exampleLines;
                invalidatePreview();
            });
        });

        root.querySelector("#pmk138-category").addEventListener("change", function () {
            invalidatePreview(t.categoryChanged);
        });
        root.querySelector("#pmk138-source").addEventListener("input", function () {
            invalidatePreview();
        });
        root.querySelector("#pmk138-copy-opac").addEventListener("change", function () {
            invalidatePreview();
        });

        root.querySelector("#pmk138-file").addEventListener("change", async function () {
            const file = this.files && this.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                root.querySelector("#pmk138-source").value = text;
                invalidatePreview();
            } catch (error) {
                showMessage(t.csvReadError, "error");
            }
        });

        root.querySelector("#pmk138-preview-btn").addEventListener("click", previewImport);
        root.querySelector("#pmk138-import-btn").addEventListener("click", executeImport);
        root.querySelector("#pmk138-refresh").addEventListener("click", function () {
            const category = root.querySelector("#pmk138-category").value;
            if (!category) return;
            window.location.href = PAGE_PATH + "?searchfield=" + encodeURIComponent(category);
        });
    }

    function getCategoriesFromDocument(doc) {
        const set = new Set();
        const select = doc.querySelector("#category_search");
        if (select) {
            Array.from(select.options).forEach(function (option) {
                const value = normalizeSpace(option.value);
                if (value) set.add(value);
            });
        }
        doc.querySelectorAll('a[href*="authorised_values.pl?searchfield="]').forEach(function (a) {
            try {
                const url = new URL(a.getAttribute("href"), window.location.origin);
                const value = normalizeSpace(url.searchParams.get("searchfield"));
                if (value) set.add(value);
            } catch (error) { /* noop */ }
        });
        return Array.from(set).sort(function (a, b) { return a.localeCompare(b, undefined, { sensitivity: "base" }); });
    }

    async function loadCategories() {
        let categories = getCategoriesFromDocument(document);
        if (!categories.length) {
            try {
                const response = await fetch(PAGE_PATH, { credentials: "same-origin", cache: "no-store" });
                const html = await response.text();
                const doc = new DOMParser().parseFromString(html, "text/html");
                categories = getCategoriesFromDocument(doc);
            } catch (error) { /* handled below */ }
        }
        state.categories = categories;
        return categories;
    }

    async function openDialog() {
        const root = buildDialog();
        root.hidden = false;
        document.body.style.overflow = "hidden";
        showMessage("", "info");
        const select = root.querySelector("#pmk138-category");
        select.innerHTML = `<option value="">${escapeHtml(t.loadingCategories)}</option>`;
        const categories = await loadCategories();
        if (!categories.length) {
            select.innerHTML = `<option value="">${escapeHtml(t.noCategory)}</option>`;
            showMessage(t.noCategory, "error");
            return;
        }
        select.innerHTML = '<option value=""></option>' + categories.map(function (category) {
            return `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`;
        }).join("");

        const current = new URLSearchParams(window.location.search).get("searchfield");
        if (current && categories.includes(current)) select.value = current;
    }

    function detectDelimiter(text) {
        const first = String(text || "").split(/\r?\n/).find(function (line) { return line.trim(); }) || "";
        const candidates = [";", "\t", ","];
        let best = ";";
        let bestCount = -1;
        candidates.forEach(function (delimiter) {
            let count = 0;
            let quoted = false;
            for (let i = 0; i < first.length; i += 1) {
                const ch = first[i];
                if (ch === '"') {
                    if (quoted && first[i + 1] === '"') { i += 1; continue; }
                    quoted = !quoted;
                } else if (!quoted && ch === delimiter) {
                    count += 1;
                }
            }
            if (count > bestCount) {
                best = delimiter;
                bestCount = count;
            }
        });
        return bestCount > 0 ? best : null;
    }

    function parseDelimited(text, delimiter) {
        const rows = [];
        let row = [];
        let field = "";
        let quoted = false;
        const src = String(text == null ? "" : text).replace(/^\uFEFF/, "");

        for (let i = 0; i < src.length; i += 1) {
            const ch = src[i];
            if (quoted) {
                if (ch === '"') {
                    if (src[i + 1] === '"') {
                        field += '"';
                        i += 1;
                    } else {
                        quoted = false;
                    }
                } else {
                    field += ch;
                }
            } else if (ch === '"') {
                quoted = true;
            } else if (ch === delimiter) {
                row.push(field);
                field = "";
            } else if (ch === "\n") {
                row.push(field.replace(/\r$/, ""));
                rows.push(row);
                row = [];
                field = "";
            } else {
                field += ch;
            }
        }
        row.push(field.replace(/\r$/, ""));
        rows.push(row);
        return rows.filter(function (r) { return r.some(function (cell) { return normalizeSpace(cell) !== ""; }); });
    }

    function headerIndex(header, names) {
        const normalized = header.map(function (cell) {
            return normalizeKey(cell)
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[\s-]+/g, "_");
        });
        for (let i = 0; i < normalized.length; i += 1) {
            if (names.includes(normalized[i])) return i;
        }
        return -1;
    }

    function parseCsv(text) {
        const delimiter = detectDelimiter(text);
        if (!delimiter) {
            const values = String(text || "").split(/\r?\n/)
                .map(normalizeSpace)
                .filter(Boolean);
            if (!values.length) return [];
            const first = normalizeKey(values[0])
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[\s-]+/g, "_");
            const singleColumnHeaders = [
                "label", "lib", "libelle", "description", "designation",
                "id", "code", "value", "valeur", "authorised_value",
                "authorized_value", "identifiant"
            ];
            const data = singleColumnHeaders.includes(first) ? values.slice(1) : values;
            return data.map(function (label) { return { id: label, label: label, opac: "" }; });
        }

        const rows = parseDelimited(text, delimiter);
        if (!rows.length) return [];
        const header = rows[0];
        const idIdx = headerIndex(header, ["id", "code", "value", "valeur", "authorised_value", "authorized_value", "identifiant"]);
        const labelIdx = headerIndex(header, ["label", "lib", "libelle", "description", "designation"]);
        const opacIdx = headerIndex(header, ["lib_opac", "opac", "opac_label", "label_opac", "libelle_opac", "description_opac"]);
        const hasHeader = idIdx >= 0 || labelIdx >= 0 || opacIdx >= 0;
        const data = hasHeader ? rows.slice(1) : rows;

        return data.map(function (row) {
            let id = "";
            let label = "";
            let opac = "";
            if (hasHeader) {
                if (idIdx >= 0) id = normalizeSpace(row[idIdx]);
                if (labelIdx >= 0) label = normalizeSpace(row[labelIdx]);
                if (opacIdx >= 0) opac = normalizeSpace(row[opacIdx]);
                if (!label && id) label = id;
                if (!id && label) id = label;
            } else if (row.length <= 1) {
                label = normalizeSpace(row[0]);
                id = label;
            } else {
                id = normalizeSpace(row[0]);
                label = normalizeSpace(row[1]);
                opac = normalizeSpace(row[2]);
                if (!label && id) label = id;
                if (!id && label) id = label;
            }
            return { id: id, label: label, opac: opac };
        }).filter(function (item) {
            return item.id || item.label || item.opac;
        });
    }

    function parseLines(text) {
        return String(text || "")
            .split(/\r?\n/)
            .map(normalizeSpace)
            .filter(Boolean)
            .map(function (label) {
                return { id: label, label: label, opac: "" };
            });
    }

    async function getCategoryContext(category) {
        const listUrl = PAGE_PATH + "?searchfield=" + encodeURIComponent(category);
        const formUrl = PAGE_PATH + "?op=add_form&category=" + encodeURIComponent(category);
        const [listResponse, formResponse] = await Promise.all([
            fetch(listUrl, { credentials: "same-origin", cache: "no-store" }),
            fetch(formUrl, { credentials: "same-origin", cache: "no-store" })
        ]);
        if (!listResponse.ok || !formResponse.ok) throw new Error("HTTP");
        const [listHtml, formHtml] = await Promise.all([listResponse.text(), formResponse.text()]);
        const listDoc = new DOMParser().parseFromString(listHtml, "text/html");
        const formDoc = new DOMParser().parseFromString(formHtml, "text/html");

        const existing = new Set();
        listDoc.querySelectorAll("#categoriest tbody tr").forEach(function (tr) {
            const first = tr.querySelector("td:first-child");
            if (first) {
                const value = normalizeSpace(first.textContent);
                if (value) existing.add(normalizeKey(value));
            }
        });

        const csrf = formDoc.querySelector('input[name="csrf_token"]')?.value
            || listDoc.querySelector('input[name="csrf_token"]')?.value
            || "";
        if (!csrf) throw new Error("CSRF");

        const idInput = formDoc.querySelector('#authorised_value[name="authorised_value"]');
        const integerOnly = !!(idInput && (idInput.getAttribute("inputmode") === "numeric" || idInput.hasAttribute("min")));

        return {
            category: category,
            existing: existing,
            csrf: csrf,
            integerOnly: integerOnly
        };
    }

    function validateItem(item, context, seen, copyOpac) {
        const result = {
            id: normalizeSpace(item.id),
            label: normalizeSpace(item.label),
            opac: normalizeSpace(item.opac),
            status: "ready",
            reason: ""
        };
        if (!result.label && result.id) result.label = result.id;
        if (!result.id && result.label) result.id = result.label;
        if (copyOpac && !result.opac) result.opac = result.label;

        if (!result.id) {
            result.status = "error";
            result.reason = t.emptyId;
            return result;
        }
        if (result.id.length > 80) {
            result.status = "error";
            result.reason = t.idTooLong;
            return result;
        }
        if (result.label.length > 200) {
            result.status = "error";
            result.reason = t.labelTooLong;
            return result;
        }
        if (result.opac.length > 200) {
            result.status = "error";
            result.reason = t.opacTooLong;
            return result;
        }
        if (context.integerOnly) {
            if (!/^-?\d+$/.test(result.id) || Number(result.id) < -128 || Number(result.id) > 127) {
                result.status = "error";
                result.reason = t.invalidInteger;
                return result;
            }
        }

        const key = normalizeKey(result.id);
        if (context.existing.has(key)) {
            result.status = "existing";
            result.reason = t.existing;
            return result;
        }
        if (seen.has(key)) {
            result.status = "duplicate";
            result.reason = t.duplicateInput;
            return result;
        }
        seen.add(key);
        return result;
    }

    function countPreview(rows) {
        return rows.reduce(function (acc, row) {
            acc[row.status] = (acc[row.status] || 0) + 1;
            return acc;
        }, { ready: 0, existing: 0, duplicate: 0, error: 0 });
    }

    function statusMarkup(row) {
        if (row.status === "ready") return `<span class="pmk138-status-ready">✓ ${escapeHtml(t.ready)}</span>`;
        if (row.status === "existing") return `<span class="pmk138-status-skip">↷ ${escapeHtml(t.existing)}</span>`;
        if (row.status === "duplicate") return `<span class="pmk138-status-skip">↷ ${escapeHtml(t.duplicateInput)}</span>`;
        return `<span class="pmk138-status-error">✕ ${escapeHtml(row.reason || t.invalid)}</span>`;
    }

    function renderPreview(rows) {
        const counts = countPreview(rows);
        const body = document.getElementById("pmk138-preview-body");

        body.innerHTML = rows.map(function (row) {
            return `<tr>
                <td>${statusMarkup(row)}</td>
                <td>${escapeHtml(row.id)}</td>
                <td>${escapeHtml(row.label)}</td>
                <td>${escapeHtml(row.opac)}</td>
            </tr>`;
        }).join("");

        document.getElementById("pmk138-summary").innerHTML = `
            <span class="pmk138-chip"><strong>${counts.ready}</strong>&nbsp;${escapeHtml(t.summaryReady)}</span>
            <span class="pmk138-chip"><strong>${counts.existing}</strong>&nbsp;${escapeHtml(t.summaryExisting)}</span>
            <span class="pmk138-chip"><strong>${counts.duplicate}</strong>&nbsp;${escapeHtml(t.summaryDuplicate)}</span>
            <span class="pmk138-chip"><strong>${counts.error}</strong>&nbsp;${escapeHtml(t.summaryErrors)}</span>
        `;

        const existingSection = document.getElementById("pmk138-existing-section");
        const existingBody = document.getElementById("pmk138-existing-body");
        const existingRows = rows.filter(function (row) {
            return row.status === "existing";
        });

        if (existingSection && existingBody) {
            if (existingRows.length) {
                existingBody.innerHTML = existingRows.map(function (row) {
                    return `<tr>
                        <td><strong>${escapeHtml(row.id)}</strong></td>
                        <td>${escapeHtml(row.label)}</td>
                        <td>${escapeHtml(row.opac)}</td>
                    </tr>`;
                }).join("");
                existingSection.hidden = false;
            } else {
                existingBody.innerHTML = "";
                existingSection.hidden = true;
            }
        }

        document.getElementById("pmk138-preview-section").hidden = false;
        document.getElementById("pmk138-import-btn").disabled = counts.ready === 0;
    }

    async function previewImport() {
        if (state.importing) return;
        const category = document.getElementById("pmk138-category")?.value || "";
        if (!category) {
            showMessage(t.chooseCategory, "error");
            return;
        }
        const source = document.getElementById("pmk138-source")?.value || "";
        const parsed = getMode() === "csv" ? parseCsv(source) : parseLines(source);
        if (!parsed.length) {
            showMessage(t.empty, "error");
            return;
        }

        const previewBtn = document.getElementById("pmk138-preview-btn");
        const importBtn = document.getElementById("pmk138-import-btn");
        previewBtn.disabled = true;
        importBtn.disabled = true;
        showMessage(t.preparing, "info");

        try {
            const context = await getCategoryContext(category);
            const copyOpac = !!document.getElementById("pmk138-copy-opac")?.checked;
            const seen = new Set();
            const rows = parsed.map(function (item) {
                return validateItem(item, context, seen, copyOpac);
            });
            state.context = context;
            state.preview = rows;
            state.previewFingerprint = fingerprint();
            renderPreview(rows);
            showMessage("", "info");
        } catch (error) {
            showMessage(t.networkError + " (" + (error && error.message ? error.message : "") + ")", "error");
        } finally {
            previewBtn.disabled = false;
        }
    }

    async function postValue(context, row) {
        const body = new URLSearchParams();
        body.set("csrf_token", context.csrf);
        body.set("op", "cud-add");
        body.set("category", context.category);
        body.set("authorised_value", row.id);
        body.set("lib", row.label);
        body.set("lib_opac", row.opac);
        body.set("image", "");

        try {
            const response = await fetch(PAGE_PATH, {
                method: "POST",
                credentials: "same-origin",
                cache: "no-store",
                headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
                body: body.toString()
            });
            const html = await response.text();
            if (!response.ok) {
                return { ok: false, reason: "HTTP " + response.status };
            }
            const doc = new DOMParser().parseFromString(html, "text/html");
            const errorBox = doc.querySelector(".alert-error, .alert-danger");
            if (errorBox) {
                return { ok: false, reason: normalizeSpace(errorBox.textContent) || t.serverError };
            }
            const found = Array.from(doc.querySelectorAll("#categoriest tbody tr td:first-child")).some(function (td) {
                return normalizeKey(td.textContent) === normalizeKey(row.id);
            });
            if (!found) {
                const message = doc.querySelector(".alert-message, .alert-success");
                if (!message) return { ok: false, reason: t.serverError };
            }
            return { ok: true };
        } catch (error) {
            return { ok: false, reason: t.networkError };
        }
    }

    function appendLog(html) {
        const log = document.getElementById("pmk138-log");
        if (!log) return;
        const line = document.createElement("div");
        line.innerHTML = html;
        log.appendChild(line);
        log.scrollTop = log.scrollHeight;
    }

    function updateProgress(done, total) {
        const pct = total ? Math.round((done / total) * 100) : 100;
        const bar = document.getElementById("pmk138-progress-bar");
        const text = document.getElementById("pmk138-progress-text");
        if (bar) bar.style.width = pct + "%";
        if (text) text.textContent = done + " / " + total + " (" + pct + " %)";
    }

    async function runPool(items, worker, parallel, onProgress) {
        let cursor = 0;
        let done = 0;
        const results = new Array(items.length);
        async function runOne() {
            while (true) {
                const index = cursor;
                cursor += 1;
                if (index >= items.length) return;
                results[index] = await worker(items[index], index);
                done += 1;
                if (onProgress) onProgress(done, items.length, results[index], items[index]);
            }
        }
        const jobs = [];
        const count = Math.min(Math.max(1, parallel), items.length);
        for (let i = 0; i < count; i += 1) jobs.push(runOne());
        await Promise.all(jobs);
        return results;
    }

    async function executeImport() {
        if (state.importing) return;
        if (!state.context || !state.preview.length || state.previewFingerprint !== fingerprint()) {
            showMessage(t.sourceChanged, "error");
            document.getElementById("pmk138-import-btn").disabled = true;
            return;
        }
        const ready = state.preview.filter(function (row) { return row.status === "ready"; });
        if (!ready.length) return;

        state.importing = true;
        const previewBtn = document.getElementById("pmk138-preview-btn");
        const importBtn = document.getElementById("pmk138-import-btn");
        const closeBtn = document.getElementById("pmk138-close");
        const closeX = document.getElementById("pmk138-close-x");
        previewBtn.disabled = true;
        importBtn.disabled = true;
        closeBtn.disabled = true;
        closeX.disabled = true;
        document.getElementById("pmk138-progress").hidden = false;
        document.getElementById("pmk138-log").innerHTML = "";
        updateProgress(0, ready.length);
        showMessage(t.importing, "info");

        const results = await runPool(
            ready,
            function (row) { return postValue(state.context, row); },
            MAX_PARALLEL,
            function (done, total, result, row) {
                updateProgress(done, total);
                if (result.ok) {
                    appendLog(`<span class="pmk138-status-ready">✓ ${escapeHtml(row.id)}</span> — ${escapeHtml(t.success)}`);
                } else {
                    appendLog(`<span class="pmk138-status-error">✕ ${escapeHtml(row.id)}</span> — ${escapeHtml(result.reason || t.error)}`);
                }
            }
        );

        let success = 0;
        let failed = 0;
        results.forEach(function (result, index) {
            const row = ready[index];
            if (result && result.ok) {
                success += 1;
                row.status = "imported";
            } else {
                failed += 1;
                row.status = "error";
                row.reason = result && result.reason ? result.reason : t.error;
            }
        });

        showMessage(`${t.done} ${success} ${t.imported}, ${failed} ${t.failed}.`, failed ? "info" : "success");
        document.getElementById("pmk138-refresh").hidden = false;
        closeBtn.disabled = false;
        closeX.disabled = false;
        previewBtn.disabled = false;
        state.importing = false;
        state.previewFingerprint = "";
    }


    function csvCell(value) {
        const str = String(value == null ? "" : value);
        return '"' + str.replace(/"/g, '""') + '"';
    }

    function parseCategoryRows(doc, category) {
        const rows = [];

        const table = doc.querySelector("#categoriest")
            || doc.querySelector("table[id*='categori']")
            || doc.querySelector("table");

        if (!table) return rows;

        table.querySelectorAll("tbody tr").forEach(function (tr) {
            const cells = Array.from(tr.querySelectorAll("td"));
            if (!cells.length) return;

            // On ignore la dernière cellule quand elle contient uniquement les actions.
            const id = normalizeSpace(cells[0]?.textContent || "");
            if (!id) return;

            const label = normalizeSpace(cells[1]?.textContent || "");
            const opac = normalizeSpace(cells[2]?.textContent || "");

            rows.push({
                category: category,
                id: id,
                label: label,
                opac: opac
            });
        });

        return rows;
    }

    function getCurrentCategory() {
        const params = new URLSearchParams(window.location.search);
        let current = normalizeSpace(params.get("searchfield"));

        if (!current) {
            const select = document.querySelector("#category_search");
            if (select) current = normalizeSpace(select.value);
        }

        if (!current) {
            const heading = document.querySelector("h1, h2");
            const txt = normalizeSpace(heading?.textContent || "");
            const m = txt.match(/(?:cat[ée]gorie|category)\s*[:\-]\s*(.+)$/i);
            if (m) current = normalizeSpace(m[1]);
        }

        return current;
    }

    async function fetchCategoryRows(category) {
        const url = PAGE_PATH + "?searchfield=" + encodeURIComponent(category);
        const response = await fetch(url, {
            credentials: "same-origin",
            cache: "no-store",
            redirect: "follow"
        });
        if (!response.ok) throw new Error("HTTP " + response.status);

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const rows = parseCategoryRows(doc, category);

        return rows;
    }

    function buildExportCsv(rows) {
        const lines = [
            ["categorie", "id", "libelle", "libelle_opac"].map(csvCell).join(";")
        ];
        rows.forEach(function (row) {
            lines.push([
                row.category,
                row.id,
                row.label,
                row.opac
            ].map(csvCell).join(";"));
        });
        return lines.join("\r\n");
    }

    function safeFilenamePart(value) {
        return normalizeSpace(value)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "") || "categorie";
    }

    function buildDownloadLink(filename, content) {
        const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.className = "btn btn-success";
        link.id = "pmk138-export-download";
        link.href = url;
        link.download = filename;
        link.innerHTML = `<i class="fa fa-download" aria-hidden="true"></i> ${escapeHtml(t.exportDownload)}`;
        link.dataset.objectUrl = url;
        return link;
    }

    function revokeExportUrl(root) {
        const old = root?.querySelector("#pmk138-export-download");
        const url = old?.dataset?.objectUrl;
        if (url) {
            try { URL.revokeObjectURL(url); } catch (e) { /* noop */ }
        }
    }

    function buildExportDialog() {
        let root = document.getElementById("pmk138-export-dialog");
        if (root) return root;

        css();

        root = document.createElement("div");
        root.id = "pmk138-export-dialog";
        root.hidden = true;
        root.setAttribute("role", "dialog");
        root.setAttribute("aria-modal", "true");
        root.innerHTML = `
            <div class="pmk138-panel" style="max-width:720px">
                <div class="pmk138-head">
                    <h2><i class="fa fa-file-export" aria-hidden="true"></i> ${escapeHtml(t.exportTitle)}</h2>
                    <button type="button" class="pmk138-x" id="pmk138-export-close-x" aria-label="${escapeHtml(t.exportClose)}">&times;</button>
                </div>
                <div class="pmk138-body">
                    <div id="pmk138-export-message" class="pmk138-message alert alert-info">
                        ${escapeHtml(t.exportTitle)}
                    </div>

                    <div class="pmk138-actions">
                        <button type="button" class="btn btn-primary" id="pmk138-export-prepare-current">
                            <i class="fa fa-download" aria-hidden="true"></i>
                            ${escapeHtml(t.exportPrepareCurrent)}
                        </button>

                        <button type="button" class="btn btn-default" id="pmk138-export-prepare-all">
                            <i class="fa fa-file-export" aria-hidden="true"></i>
                            ${escapeHtml(t.exportPrepareAll)}
                        </button>
                    </div>

                    <div id="pmk138-export-progress" style="margin-top:16px" hidden>
                        <div class="pmk138-progress-bar"><span id="pmk138-export-progress-bar"></span></div>
                        <div id="pmk138-export-progress-text" class="pmk138-hint" style="margin-top:6px"></div>
                    </div>

                    <div id="pmk138-export-result" style="margin-top:16px"></div>
                </div>

                <div class="pmk138-footer">
                    <button type="button" class="btn btn-default" id="pmk138-export-close">
                        ${escapeHtml(t.exportClose)}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(root);

        function close() {
            revokeExportUrl(root);
            root.hidden = true;
            document.body.style.overflow = "";
        }

        root.querySelector("#pmk138-export-close-x").addEventListener("click", close);
        root.querySelector("#pmk138-export-close").addEventListener("click", close);
        root.addEventListener("click", function (event) {
            if (event.target === root) close();
        });

        root.querySelector("#pmk138-export-prepare-current").addEventListener("click", prepareCurrentExport);
        root.querySelector("#pmk138-export-prepare-all").addEventListener("click", prepareAllExport);

        return root;
    }

    function showExportMessage(message, kind) {
        const el = document.getElementById("pmk138-export-message");
        if (!el) return;
        el.className = "pmk138-message alert " +
            (kind === "error" ? "alert-danger" : kind === "success" ? "alert-success" : "alert-info");
        el.textContent = message || "";
    }

    function setExportBusy(busy) {
        ["pmk138-export-prepare-current", "pmk138-export-prepare-all", "pmk138-export-close", "pmk138-export-close-x"]
            .forEach(function (id) {
                const el = document.getElementById(id);
                if (el) el.disabled = !!busy;
            });
    }

    function resetExportResult() {
        const root = document.getElementById("pmk138-export-dialog");
        revokeExportUrl(root);

        const result = document.getElementById("pmk138-export-result");
        if (result) result.innerHTML = "";

        const progress = document.getElementById("pmk138-export-progress");
        if (progress) progress.hidden = true;

        const bar = document.getElementById("pmk138-export-progress-bar");
        if (bar) bar.style.width = "0%";

        const txt = document.getElementById("pmk138-export-progress-text");
        if (txt) txt.textContent = "";
    }

    function showExportDownload(rows, filename) {
        const result = document.getElementById("pmk138-export-result");
        if (!result) return;

        const csv = buildExportCsv(rows);
        const link = buildDownloadLink(filename, csv);

        const info = document.createElement("div");
        info.className = "alert alert-success";
        info.style.marginBottom = "10px";
        info.textContent = `${t.exportReady} ${rows.length} ${t.exportRows}.`;

        result.innerHTML = "";
        result.appendChild(info);
        result.appendChild(link);
        showExportMessage(t.exportReady, "success");
    }

    function openExportDialog() {
        const root = buildExportDialog();
        resetExportResult();
        root.hidden = false;
        document.body.style.overflow = "hidden";

        const current = getCurrentCategory();
        showExportMessage(
            current
                ? `${t.exportTitle} — ${current}`
                : t.exportTitle,
            "info"
        );
    }

    async function prepareCurrentExport() {
        const current = getCurrentCategory();
        if (!current) {
            showExportMessage(t.exportNoCurrent, "error");
            return;
        }

        resetExportResult();
        setExportBusy(true);
        showExportMessage(t.exportWorking, "info");

        try {
            // Si la catégorie affichée correspond à la page actuelle, on privilégie
            // le DOM déjà rendu par Koha ; sinon on recharge explicitement la catégorie.
            let rows = parseCategoryRows(document, current);
            if (!rows.length) {
                rows = await fetchCategoryRows(current);
            }

            showExportDownload(
                rows,
                "koha-valeurs-autorisees-" + safeFilenamePart(current) + ".csv"
            );
        } catch (error) {
            console.error("PMK138 prepare current export", error);
            showExportMessage(t.exportError + " (" + (error?.message || "erreur") + ")", "error");
        } finally {
            setExportBusy(false);
        }
    }

    async function prepareAllExport() {
        resetExportResult();
        setExportBusy(true);
        showExportMessage(t.exportWorking, "info");

        const progress = document.getElementById("pmk138-export-progress");
        const bar = document.getElementById("pmk138-export-progress-bar");
        const txt = document.getElementById("pmk138-export-progress-text");
        if (progress) progress.hidden = false;

        try {
            const categories = state.categories.length ? state.categories : await loadCategories();
            if (!categories.length) throw new Error("Aucune catégorie");

            const allRows = [];

            for (let i = 0; i < categories.length; i += 1) {
                const category = categories[i];
                const rows = await fetchCategoryRows(category);
                allRows.push.apply(allRows, rows);

                const done = i + 1;
                const pct = Math.round((done / categories.length) * 100);
                if (bar) bar.style.width = pct + "%";
                if (txt) txt.textContent = `${done} / ${categories.length} — ${category}`;
            }

            const now = new Date();
            const stamp = [
                now.getFullYear(),
                String(now.getMonth() + 1).padStart(2, "0"),
                String(now.getDate()).padStart(2, "0")
            ].join("-");

            showExportDownload(
                allRows,
                "koha-valeurs-autorisees-toutes-categories-" + stamp + ".csv"
            );
        } catch (error) {
            console.error("PMK138 prepare all export", error);
            showExportMessage(t.exportError + " (" + (error?.message || "erreur") + ")", "error");
        } finally {
            setExportBusy(false);
        }
    }

    function findControlsHost() {
        const toolbar = document.querySelector("#toolbar.btn-toolbar, #toolbar, .btn-toolbar");
        if (toolbar) return toolbar;

        const categorySearch = document.querySelector("#category_search");
        if (categorySearch) {
            const form = categorySearch.closest("form");
            if (form && form.parentNode) {
                let host = document.getElementById("pmk138-controls-host");
                if (!host) {
                    host = document.createElement("div");
                    host.id = "pmk138-controls-host";
                    host.className = "btn-toolbar";
                    host.style.margin = "0 0 1rem 0";
                    form.parentNode.insertBefore(host, form);
                }
                return host;
            }
        }

        const main = document.querySelector("main, .main, #main, .main.container-fluid, .container-fluid");
        const heading = main ? main.querySelector("h1, h2") : document.querySelector("h1, h2");
        if (heading && heading.parentNode) {
            let host = document.getElementById("pmk138-controls-host");
            if (!host) {
                host = document.createElement("div");
                host.id = "pmk138-controls-host";
                host.className = "btn-toolbar";
                host.style.margin = "0 0 1rem 0";
                heading.insertAdjacentElement("afterend", host);
            }
            return host;
        }

        return null;
    }

    function makeButton(id, icon, label, handler) {
        let button = document.getElementById(id);
        if (button) return button;
        button = document.createElement("button");
        button.type = "button";
        button.id = id;
        button.className = "btn btn-default";
        button.style.marginRight = "6px";
        button.innerHTML = `<i class="fa ${icon}" aria-hidden="true"></i> ${escapeHtml(label)}`;
        button.addEventListener("click", handler);
        return button;
    }

    function ensureControls() {
        if (!onTargetPage()) return false;

        const host = findControlsHost();
        if (!host) return false;

        const importButton = makeButton(
            BUTTON_ID,
            "fa-file-import",
            t.button,
            openDialog
        );
        if (!importButton.isConnected) host.appendChild(importButton);

        const exportButton = makeButton(
            "pmk138-export-button",
            "fa-file-export",
            t.exportButton,
            openExportDialog
        );
        if (!exportButton.isConnected) host.appendChild(exportButton);

        return true;
    }

    function boot() {
        if (!onTargetPage()) return;

        ensureControls();

        // Koha peut construire/reconstruire certaines zones après DOMContentLoaded.
        // On réessaie quelques fois puis on observe les changements du DOM.
        [100, 300, 700, 1500, 3000].forEach(function (delay) {
            window.setTimeout(ensureControls, delay);
        });

        const observer = new MutationObserver(function () {
            if (!document.getElementById(BUTTON_ID)
                || !document.getElementById("pmk138-export-button")) {
                ensureControls();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        window.setTimeout(function () { observer.disconnect(); }, 10000);
    }

    window.PMK138AuthorisedValuesBulkImport = {
        id: MODULE_ID,
        version: MODULE_VERSION,
        open: openDialog,
        parseLines: parseLines,
        parseCsv: parseCsv,
        openExport: openExportDialog,
        prepareCurrentExport: prepareCurrentExport,
        prepareAllExport: prepareAllExport
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})(window, document);

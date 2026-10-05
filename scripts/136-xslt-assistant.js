/* PimpMyKoha — 136 Assistant XSLT — v0.3.4-preplugin
 * Import manuel (fichier ou collage), édition visuelle, XSLT complet à copier.
 * Aperçu automatique sur une notice Koha, historique local et compatibilité des projets.
 * Les références xsl:include/import sont conservées ; aucun XSLT distant n'est récupéré.
 * Aperçu : str:encode-uri dans xsl:value-of est évalué sans extension navigateur,
 * puis encodé en JavaScript ; le XSLT source et le code final ne sont pas modifiés.
 */
(function (window, document) {
    "use strict";

    if (window.__PMK136_XSLT_ASSISTANT__) return;
    window.__PMK136_XSLT_ASSISTANT__ = true;

    const MODULE_ID = "xslt-assistant";
    const MODULE_VERSION = "0.3.4-preplugin";
    const PAGE_PARAM = "xslt-assistant";
    const PAGE_URL = "/cgi-bin/koha/mainpage.pl?pmk_page=" + encodeURIComponent(PAGE_PARAM);
    const STORAGE_PREFIX = "pmk-xslt-assistant-v1:";
    const INDEX_KEY = STORAGE_PREFIX + "projects";
    const XSL_NS = "http://www.w3.org/1999/XSL/Transform";
    const MARC_NS = "http://www.loc.gov/MARC21/slim";
    const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

    const KNOWN_PREFS = [
        { id: "XSLTDetailsDisplay", label: "Pro — Détail notice", scope: "staff", kind: "biblio" },
        { id: "XSLTResultsDisplay", label: "Pro — Résultats de recherche", scope: "staff", kind: "biblio" },
        { id: "XSLTListsDisplay", label: "Pro — Listes", scope: "staff", kind: "biblio" },
        { id: "OPACXSLTDetailsDisplay", label: "OPAC — Détail notice", scope: "opac", kind: "biblio" },
        { id: "OPACXSLTResultsDisplay", label: "OPAC — Résultats de recherche", scope: "opac", kind: "biblio" },
        { id: "OPACXSLTListsDisplay", label: "OPAC — Listes", scope: "opac", kind: "biblio" },
        { id: "AuthorityXSLTDetailsDisplay", label: "Pro — Détail autorité", scope: "staff", kind: "authority" },
        { id: "AuthorityXSLTResultsDisplay", label: "Pro — Résultats autorités", scope: "staff", kind: "authority" },
        { id: "AuthorityXSLTOpacDetailsDisplay", label: "OPAC — Détail autorité", scope: "opac", kind: "authority" },
        { id: "AuthorityXSLTOpacResultsDisplay", label: "OPAC — Résultats autorités", scope: "opac", kind: "authority" }
    ];

    const DEFAULT_CONFIG = { enabled: true };

    let app = null;
    let styleNode = null;
    let currentProject = null;
    let workingDoc = null;
    let selectedNodeId = null;
    let draggedNodeId = null;
    let pointerDrag = null;
    let dragJustFinishedUntil = 0;
    let autoPreviewTimer = null;
    let autoPreviewRequest = 0;
    const marcPreviewCache = new Map();
    let projectEpoch = 0;
    let activeWorkspaceStep = "source";
    let structureFilterText = "";
    let structureFilterMode = "all";
    const collapsedTemplates = new Set();
    let suppressHistory = false;
    const projectHistories = new Map();

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function uid(prefix) {
        return (prefix || "id") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    }

    function esc(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function clean(value) {
        return String(value == null ? "" : value).trim();
    }

    function isSuperlibrarian() {
        try {
            if (window.PMKPages && typeof window.PMKPages.isSuperlibrarian === "function") {
                return window.PMKPages.isSuperlibrarian() === true;
            }
            if (window.PMKConfig && typeof window.PMKConfig.isKohaSuperlibrarian === "function") {
                if (window.PMKConfig.isKohaSuperlibrarian() === true) return true;
            }
        } catch (_) {}
        try {
            const user = document.querySelector(
                '#logged-in-info-full .loggedinusername[data-loggedinusername], ' +
                '.loggedinusername[data-loggedinusername], ' +
                '.loggedinusername[data-is-superlibrarian], ' +
                '.loggedinusername.is_superlibrarian'
            );
            if (!user) return false;
            if (user.classList && user.classList.contains('is_superlibrarian')) return true;
            const raw = String(
                (user.dataset && user.dataset.isSuperlibrarian) ||
                user.getAttribute('data-is-superlibrarian') || ''
            ).trim().toLowerCase();
            return ['is_superlibrarian','superlibrarian','1','true','yes'].includes(raw);
        } catch (_) { return false; }
    }

    function currentPreferenceMeta(project) {
        project = project || currentProject;
        const id = project && project.syspref ? project.syspref : "";
        return KNOWN_PREFS.find(function (pref) { return pref.id === id; }) || null;
    }

    function currentRecordKind() {
        const meta = currentPreferenceMeta();
        return meta && meta.kind === "authority" ? "authority" : "biblio";
    }

    function currentUiMode() {
        return currentProject && currentProject.uiMode === "advanced" ? "advanced" : "simple";
    }

    function normalizeProjectState(project) {
        if (!project) return project;
        if (project.uiMode !== "advanced") project.uiMode = "simple";
        if (project.activeStep === "test") project.activeStep = "build";
        if (!["source", "build", "publish"].includes(project.activeStep)) project.activeStep = project.workingXml ? "build" : "source";
        if (!Array.isArray(project.previewRecords)) project.previewRecords = [];
        if (!Object.prototype.hasOwnProperty.call(project, "previewBiblionumber")) project.previewBiblionumber = "";
        if (!Object.prototype.hasOwnProperty.call(project, "previewAuthorityId")) project.previewAuthorityId = "";
        if (!project.previewSearchIndex) project.previewSearchIndex = "kw";
        project.autoPreview = true;
        if (!Object.prototype.hasOwnProperty.call(project, "autoPreviewCompare")) project.autoPreviewCompare = false;
        if (!project.lastValidation || typeof project.lastValidation !== "object") project.lastValidation = null;
        return project;
    }

    function stringHash(value) {
        let hash = 5381;
        const text = String(value == null ? "" : value);
        for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
        return (hash >>> 0).toString(16).padStart(8, "0");
    }

    function projectContentFingerprint() {
        if (!currentProject) return "";
        const main = workingDoc ? serializeDoc(workingDoc, true) : clean(currentProject.workingXml || "");
        const deps = normalizeDependenciesProject().filter(function (dep) { return dep.custom; }).map(function (dep) {
            return [dep.id || "", dep.customFilename || "", dep.customXml || ""].join("\n");
        }).join("\n---DEP---\n");
        const context = [currentProject.syspref || "", currentProject.sourceUrl || "", currentRecordKind()].join("\n");
        return stringHash(context + "\n---MAIN---\n" + main + "\n---CUSTOM-DEPS---\n" + deps);
    }

    function validationFingerprint() {
        if (!currentProject) return "";
        const kind = currentRecordKind();
        const testId = kind === "authority" ? (currentProject.previewAuthorityId || "") : (currentProject.previewBiblionumber || "");
        return stringHash(projectContentFingerprint() + "\n---TEST---\n" + kind + "\n" + testId);
    }

    function historyState(projectId) {
        if (!projectHistories.has(projectId)) projectHistories.set(projectId, { undo: [], redo: [] });
        return projectHistories.get(projectId);
    }

    function recordUndoSnapshot(previousXml) {
        if (suppressHistory || !currentProject || !clean(previousXml)) return;
        const h = historyState(currentProject.id);
        if (h.undo[h.undo.length - 1] !== previousXml) h.undo.push(previousXml);
        if (h.undo.length > 40) h.undo.shift();
        h.redo = [];
    }

    function restoreHistoryXml(xml) {
        if (!currentProject || !clean(xml)) return;
        suppressHistory = true;
        try {
            const doc = parseXml(xml);
            ensureNamespaces(doc);
            restorePmkMetadataComments(doc);
            annotate(doc);
            workingDoc = doc;
            recognizeVisualDocument(doc);
            currentProject.workingXml = serializeDoc(doc, false);
            currentProject.updatedAt = new Date().toISOString();
            saveProject(currentProject);
            if (!findNode(selectedNodeId)) selectedNodeId = getLiteralNodes()[0]?.getAttribute("data-pmk-xslt-node") || null;
        } finally { suppressHistory = false; }
        renderAll();
    }

    function undoWorking() {
        if (!currentProject || !workingDoc) return;
        const h = historyState(currentProject.id);
        const xml = h.undo.pop();
        if (!xml) return toast("Aucune modification à annuler.", "info");
        h.redo.push(serializeDoc(workingDoc, false));
        restoreHistoryXml(xml);
        toast("Modification annulée.", "success");
    }

    function redoWorking() {
        if (!currentProject || !workingDoc) return;
        const h = historyState(currentProject.id);
        const xml = h.redo.pop();
        if (!xml) return toast("Aucune modification à rétablir.", "info");
        h.undo.push(serializeDoc(workingDoc, false));
        restoreHistoryXml(xml);
        toast("Modification rétablie.", "success");
    }

    function isAssistantPage() {
        try {
            const url = new URL(window.location.href);
            return url.pathname.endsWith("/cgi-bin/koha/mainpage.pl") &&
                url.searchParams.get("pmk_page") === PAGE_PARAM;
        } catch (_) {
            return false;
        }
    }

    function openAssistantPage() {
        if (!isSuperlibrarian()) {
            toast("Accès réservé aux superlibrarians Koha.", "danger");
            return;
        }
        if (isAssistantPage()) {
            openAssistant();
            return;
        }
        window.location.href = PAGE_URL;
    }

    function toast(message, type) {
        if (!app) return;
        let node = app.querySelector(".pmk135-toast");
        if (!node) {
            node = document.createElement("div");
            node.className = "pmk135-toast";
            app.appendChild(node);
        }
        node.className = "pmk135-toast is-visible " + (type || "info");
        node.textContent = message;
        window.clearTimeout(node.__hideTimer);
        node.__hideTimer = window.setTimeout(function () {
            node.classList.remove("is-visible");
        }, 3200);
    }

    function addStyles() {
        if (styleNode) return;
        styleNode = document.createElement("style");
        styleNode.id = "pmk135-xslt-assistant-style";
        styleNode.textContent = `
            .pmk135-topbar { flex-wrap:wrap; }
            .pmk136-focus-step .pmk135-main { display:block; overflow:auto; }
            .pmk136-focus-step .pmk135-pane-workspace { max-width:1050px; margin:auto; min-height:100%; }
            .pmk136-focus-step .pmk135-pane-structure, .pmk136-focus-step .pmk135-pane-inspector { display:none; }
            .pmk135-card-title strong { font-size:.93rem; overflow-wrap:anywhere; }
            .pmk135-pane-structure .pmk135-pane-head { flex-wrap:wrap; }
            .pmk135-pane-structure .pmk135-pane-head strong { flex-basis:100%; }
            .pmk136-add-options { display:grid; gap:.6rem; }
            .pmk136-add-options button { text-align:left; padding:.85rem; white-space:normal; }
            .pmk136-add-options small { display:block; margin-top:.3rem; color:#5c6870; }
            .pmk135-launch { display:flex; flex-wrap:wrap; align-items:center; gap:.6rem; padding:.75rem; border:1px solid #d8dee4; border-radius:.65rem; background:#fff; }
            .pmk135-launch p { margin:0; color:#5d6771; flex:1 1 28rem; }
            .pmk135-overlay { position:fixed; inset:0; z-index:1095; background:#f5f7f9; color:#20262d; display:flex; flex-direction:column; }
            .pmk135-topbar { min-height:58px; display:flex; align-items:center; gap:.6rem; padding:.6rem .85rem; background:#fff; border-bottom:1px solid #dfe3e7; box-shadow:0 1px 3px rgba(0,0,0,.04); }
            .pmk135-brand { display:flex; align-items:center; gap:.55rem; font-weight:700; margin-right:.35rem; white-space:nowrap; }
            .pmk135-brand i { font-size:1.1rem; }
            .pmk135-topbar select, .pmk135-topbar input { min-width:180px; }
            .pmk135-spacer { flex:1; }
            .pmk135-main { min-height:0; flex:1; display:grid; grid-template-columns:minmax(280px, 22%) minmax(520px, 1fr) minmax(320px, 28%); gap:0; }
            .pmk135-pane { min-width:0; min-height:0; overflow:auto; background:#fff; }
            .pmk135-pane + .pmk135-pane { border-left:1px solid #dfe3e7; }
            .pmk135-pane-head { position:sticky; top:0; z-index:2; display:flex; align-items:center; gap:.45rem; padding:.7rem .75rem; border-bottom:1px solid #e6eaee; background:rgba(255,255,255,.97); }
            .pmk135-pane-head strong { flex:1; }
            .pmk135-structure { padding:.6rem; }
            .pmk135-card { border:1px solid #dce2e7; border-radius:.55rem; background:#fff; padding:.55rem .6rem; margin:.36rem 0; cursor:pointer; transition:border-color .12s, box-shadow .12s, transform .12s; }
            .pmk135-card:hover { border-color:#adb5bd; box-shadow:0 2px 8px rgba(0,0,0,.05); }
            .pmk135-card.is-selected { border-color:#6c757d; box-shadow:0 0 0 2px rgba(108,117,125,.13); }
            .pmk135-card.is-dragging { opacity:.30; }
            .pmk135-card.is-drop-target { border-style:dashed; }
            .pmk135-card.is-drop-before { box-shadow:0 -4px 0 #6f8f32, 0 0 0 1px rgba(111,143,50,.18); }
            .pmk135-card.is-drop-after { box-shadow:0 4px 0 #6f8f32, 0 0 0 1px rgba(111,143,50,.18); }
            .pmk135-card.is-drop-inside { border:2px solid #6f8f32; background:#f5f9ef; }
            .pmk135-card-title { display:flex; align-items:center; gap:.4rem; font-weight:600; }
            .pmk135-drag { cursor:grab; color:#6f7d88; padding:.2rem .28rem; margin:-.2rem 0 -.2rem -.2rem; border-radius:.3rem; touch-action:none; user-select:none; }
            .pmk135-drag:hover { background:#eef2e8; color:#526d22; }
            .pmk135-drag:active { cursor:grabbing; }
            .pmk136-drag-ghost { position:fixed; z-index:1200; pointer-events:none; max-width:360px; padding:.55rem .7rem; border:1px solid #8aa252; border-radius:.5rem; background:#fff; box-shadow:0 10px 35px rgba(0,0,0,.2); font-weight:600; opacity:.96; }
            .pmk136-drag-hint { position:fixed; z-index:1201; pointer-events:none; padding:.22rem .45rem; border-radius:999px; background:#526d22; color:#fff; font-size:.75rem; font-weight:700; box-shadow:0 4px 14px rgba(0,0,0,.18); }
            .pmk135-node-meta { margin-top:.25rem; color:#6b747d; font-size:.82rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .pmk135-depth { display:inline-block; }
            .pmk135-workspace { padding:.8rem; }
            .pmk135-empty { padding:2.4rem 1.1rem; text-align:center; color:#68727c; }
            .pmk135-empty i { display:block; font-size:2rem; margin-bottom:.6rem; color:#9aa3ab; }
            .pmk135-preview { border:1px solid #dfe4e8; border-radius:.65rem; background:#fbfcfd; min-height:220px; padding:.9rem; }
            .pmk135-preview-node { border:1px dashed #c8d0d7; border-radius:.45rem; padding:.65rem; background:#fff; }
            .pmk135-preview-node .badge { margin-right:.3rem; }
            .pmk135-code { width:100%; min-height:360px; font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; white-space:pre; tab-size:2; }
            .pmk135-import-grid { display:grid; grid-template-columns:1fr auto; gap:.5rem; align-items:end; }
            .pmk135-tabs { display:flex; gap:.25rem; flex-wrap:wrap; border-bottom:1px solid #e2e6ea; padding:.55rem .65rem 0; }
            .pmk135-tabs button { border:0; background:transparent; padding:.55rem .7rem; border-radius:.4rem .4rem 0 0; color:#59636c; }
            .pmk135-tabs button.is-active { background:#f3f5f7; color:#212529; font-weight:600; }
            .pmk135-inspector { padding:.75rem; }
            .pmk135-section { border:1px solid #e0e5e9; border-radius:.55rem; padding:.7rem; margin-bottom:.65rem; }
            .pmk135-section > h4 { font-size:1rem; margin:0 0 .65rem; }
            .pmk135-field { margin-bottom:.62rem; }
            .pmk135-field:last-child { margin-bottom:0; }
            .pmk135-field label { display:block; font-size:.84rem; font-weight:600; margin-bottom:.22rem; color:#424b54; }
            .pmk135-field small { display:block; margin-top:.2rem; color:#6c757d; }
            .pmk135-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:.55rem; }
            .pmk135-condition-row { display:grid; grid-template-columns:84px 72px 62px 1fr; gap:.35rem; align-items:end; padding:.48rem; margin:.4rem 0; background:#f7f8fa; border-radius:.45rem; }
            .pmk135-condition-row .pmk135-remove-cond { align-self:center; justify-self:end; }
            .pmk135-status { font-size:.82rem; padding:.24rem .5rem; border-radius:999px; background:#eef1f3; color:#53606b; white-space:nowrap; }
            .pmk135-status.ok { background:#e8f5ec; color:#23643a; }
            .pmk135-status.warn { background:#fff4df; color:#7a5413; }
            .pmk135-status.err { background:#fbe8e8; color:#8b2c2c; }
            .pmk135-sourcebar { display:flex; align-items:center; gap:.45rem; margin-bottom:.65rem; flex-wrap:wrap; }
            .pmk135-sourcebar code { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .pmk135-toolbar { display:flex; flex-wrap:wrap; gap:.4rem; }
            .pmk135-toast { position:fixed; z-index:1110; right:1rem; bottom:1rem; max-width:min(420px, calc(100vw - 2rem)); padding:.7rem .9rem; background:#343a40; color:#fff; border-radius:.55rem; box-shadow:0 7px 28px rgba(0,0,0,.2); opacity:0; transform:translateY(8px); pointer-events:none; transition:.18s; }
            .pmk135-toast.is-visible { opacity:1; transform:translateY(0); }
            .pmk135-toast.success { background:#25633c; }
            .pmk135-toast.danger { background:#8b2c2c; }
            .pmk135-dialog-backdrop { position:fixed; inset:0; z-index:1105; background:rgba(19,25,30,.48); display:flex; align-items:center; justify-content:center; padding:1rem; }
            .pmk135-dialog { width:min(760px, 100%); max-height:90vh; overflow:auto; background:#fff; border-radius:.7rem; box-shadow:0 15px 60px rgba(0,0,0,.25); }
            .pmk135-dialog-head, .pmk135-dialog-foot { padding:.75rem .9rem; display:flex; align-items:center; gap:.5rem; }
            .pmk135-dialog-head { border-bottom:1px solid #e3e7ea; }
            .pmk135-dialog-head strong { flex:1; }
            .pmk135-dialog-body { padding:.9rem; }
            .pmk135-dialog-foot { border-top:1px solid #e3e7ea; justify-content:flex-end; }
            .pmk135-segment-list { display:flex; flex-direction:column; gap:.5rem; margin:.65rem 0; }
            .pmk135-segment-row { border:1px solid #e1e5e8; background:#fafbfc; border-radius:.5rem; padding:.55rem; }
            .pmk135-segment-head { display:flex; align-items:center; gap:.4rem; margin-bottom:.45rem; }
            .pmk135-segment-head strong { flex:1; }
            .pmk135-toggle-line { display:flex; align-items:center; gap:.45rem; margin:.45rem 0; }
            .pmk135-preview-controls { display:flex; flex-wrap:wrap; gap:.45rem; align-items:end; margin-bottom:.65rem; }
            .pmk135-preview-controls .pmk135-field { margin:0; min-width:140px; flex:1 1 150px; }
            .pmk135-real-preview { border:1px solid #dfe4e8; border-radius:.55rem; background:#fff; min-height:180px; padding:.75rem; overflow:auto; }
            .pmk136-live-preview-section { border-color:#c9d7ad; box-shadow:0 2px 9px rgba(82,109,34,.08); }
            .pmk136-live-preview-head { display:flex; align-items:center; gap:.55rem; margin-bottom:.55rem; }
            .pmk136-live-preview-head h4 { margin:0; flex:1; }
            .pmk136-live-preview-status { font-size:.78rem; color:#697680; white-space:nowrap; }
            .pmk136-live-preview { min-height:380px; max-height:58vh; padding:1rem; background:#fff; box-shadow:inset 0 0 0 1px rgba(0,0,0,.015); }
            .pmk136-live-preview [data-pmk-preview-node] { cursor:pointer; transition:outline-color .12s, box-shadow .12s, background-color .12s; }
            .pmk136-live-preview [data-pmk-preview-node]:hover { outline:2px dashed rgba(111,143,50,.65); outline-offset:2px; }
            .pmk136-live-preview [data-pmk-preview-selected="1"],
            .pmk136-live-preview .pmk136-preview-picked { outline:3px solid #6f8f32 !important; outline-offset:3px; box-shadow:0 0 0 6px rgba(111,143,50,.12); }
            .pmk136-live-preview-empty { min-height:300px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; color:#697680; }
            .pmk136-live-preview-empty i { font-size:2.2rem; color:#91a567; margin-bottom:.65rem; }
            .pmk136-live-controls { display:grid; grid-template-columns:minmax(150px,220px) auto auto auto; gap:.45rem; align-items:end; margin-bottom:.65rem; }
            .pmk136-live-controls .pmk135-field { margin:0; }
            .pmk135-preview-compare { display:grid; grid-template-columns:1fr 1fr; gap:.65rem; }
            .pmk135-preview-column { min-width:0; border:1px solid #e1e5e8; border-radius:.5rem; background:#fff; padding:.55rem; }
            .pmk135-preview-column > strong { display:block; margin-bottom:.45rem; }
            .pmk135-result-list { margin-top:.55rem; display:flex; flex-direction:column; gap:.35rem; }
            .pmk135-result { display:flex; align-items:center; gap:.45rem; border:1px solid #e3e7ea; border-radius:.45rem; padding:.4rem .5rem; background:#fff; }
            .pmk135-result span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .pmk135-style-buttons { display:flex; flex-wrap:wrap; gap:.35rem; }
            .pmk135-color { min-height:31px; padding:.12rem .2rem; }
            .pmk135-link-example { padding:.55rem; background:#f7f8fa; border-radius:.45rem; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:.8rem; overflow-wrap:anywhere; }
            .pmk135-muted { color:#6c757d; }
            .pmk136-stepbar { display:flex; gap:.4rem; flex-wrap:wrap; padding:.65rem .75rem; border-bottom:1px solid #e1e6ea; background:#f8fafb; }
            .pmk136-stepbar button { border:1px solid #cfd7dd; background:#fff; border-radius:999px; padding:.38rem .7rem; color:#52606b; }
            .pmk136-stepbar button.is-active { background:#526d22; border-color:#526d22; color:#fff; font-weight:600; }
            .pmk136-stepbar button.is-done:not(.is-active) { border-color:#8aa252; color:#526d22; }
            .pmk136-validation { display:flex; flex-direction:column; gap:.45rem; }
            .pmk136-check { display:grid; grid-template-columns:24px 1fr; gap:.45rem; align-items:start; padding:.48rem .55rem; border:1px solid #e2e6e9; border-radius:.45rem; background:#fff; }
            .pmk136-check.ok i { color:#2f7d44; }
            .pmk136-check.warn i { color:#a66b00; }
            .pmk136-check.error i { color:#a52b2b; }
            .pmk136-check small { display:block; color:#697680; margin-top:.14rem; }
            .pmk136-project-status { font-size:.78rem; color:#6c757d; white-space:nowrap; }
            .pmk136-structure-controls { display:grid; grid-template-columns:1fr auto; gap:.4rem; margin-bottom:.55rem; }
            .pmk136-template-title { margin:.75rem 0 .35rem; padding:.28rem .4rem; border-left:3px solid #8aa252; color:#4d5d2c; font-size:.82rem; font-weight:700; background:#f6f9f0; cursor:pointer; user-select:none; }
            .pmk136-mode-simple .pmk136-advanced-only { display:none !important; }
            .pmk136-source-summary { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.45rem; }
            .pmk136-source-summary > div { border:1px solid #e1e5e8; border-radius:.45rem; padding:.55rem; background:#fafbfc; }
            .pmk136-source-summary strong { display:block; font-size:.78rem; color:#6a747d; margin-bottom:.15rem; }
            @media (max-width: 1100px) {
                .pmk135-main { grid-template-columns:280px 1fr; }
                .pmk135-pane-inspector { grid-column:1 / -1; border-left:0 !important; border-top:1px solid #dfe3e7; max-height:44vh; }
            }
            @media (max-width: 760px) {
                .pmk135-topbar { flex-wrap:wrap; }
                .pmk135-topbar .pmk135-spacer { display:none; }
                .pmk135-main { display:flex; flex-direction:column; overflow:auto; }
                .pmk135-pane { overflow:visible; }
                .pmk135-pane + .pmk135-pane { border-left:0; border-top:1px solid #dfe3e7; }
                .pmk135-pane-structure { max-height:42vh; }
                .pmk135-grid2, .pmk135-import-grid, .pmk135-preview-compare, .pmk136-live-controls { grid-template-columns:1fr; }
                .pmk135-condition-row { grid-template-columns:1fr 1fr; }
            }
        `;
        document.head.appendChild(styleNode);
    }

    function loadIndex() {
        try {
            const raw = localStorage.getItem(INDEX_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    function saveIndex(index) {
        localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    }

    function saveProject(project) {
        if (!project || !project.id) return;
        localStorage.setItem(STORAGE_PREFIX + project.id, JSON.stringify(project));
        const index = loadIndex();
        const meta = {
            id: project.id,
            name: project.name || "Projet XSLT",
            syspref: project.syspref || "",
            sourceUrl: project.sourceUrl || "",
            updatedAt: new Date().toISOString(),
            previewRecords: [],
            previewBiblionumber: "",
            previewSearchIndex: "kw"
        };
        const pos = index.findIndex(function (x) { return x.id === project.id; });
        if (pos >= 0) index[pos] = meta;
        else index.push(meta);
        saveIndex(index);
    }

    function loadProject(id) {
        try {
            const raw = localStorage.getItem(STORAGE_PREFIX + id);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function deleteProject(id) {
        localStorage.removeItem(STORAGE_PREFIX + id);
        saveIndex(loadIndex().filter(function (x) { return x.id !== id; }));
    }

    function defaultProject() {
        return {
            id: uid("project"),
            name: "Nouveau XSLT",
            syspref: "",
            sourceUrl: "",
            sourceXml: "",
            workingXml: "",
            dependencies: [],
            uiMode: "simple",
            activeStep: "source",
            previewRecords: [],
            previewBiblionumber: "",
            previewAuthorityId: "",
            previewSearchIndex: "kw",
            autoPreview: true,
            autoPreviewCompare: false,
            lastValidation: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    function parserError(doc) {
        if (!doc) return "Document XML absent.";
        const err = doc.getElementsByTagName("parsererror")[0];
        return err ? clean(err.textContent).slice(0, 500) : "";
    }

    function parseXml(xml) {
        const doc = new DOMParser().parseFromString(String(xml || ""), "application/xml");
        const error = parserError(doc);
        if (error) throw new Error("XML/XSLT invalide : " + error);
        if (!doc.documentElement) throw new Error("Document XML vide.");
        return doc;
    }

    function ensureNamespaces(doc) {
        if (!doc || !doc.documentElement) return;
        // Namespace declarations are namespace nodes, not ordinary attributes.
        // Repair declarations created by previous versions without XMLNS_NS.
        Array.from(doc.getElementsByTagName("*")).forEach(function (el) {
            Array.from(el.attributes || []).forEach(function (attr) {
                if ((attr.name === "xmlns" || attr.name.indexOf("xmlns:") === 0) && attr.namespaceURI !== XMLNS_NS) {
                    const name = attr.name, value = attr.value;
                    el.removeAttributeNode(attr);
                    el.setAttributeNS(XMLNS_NS, name, value);
                }
            });
        });
        const root = doc.documentElement;
        if (!root.lookupNamespaceURI("xsl")) root.setAttributeNS(XMLNS_NS, "xmlns:xsl", XSL_NS);
        if (!root.lookupNamespaceURI("marc")) root.setAttributeNS(XMLNS_NS, "xmlns:marc", MARC_NS);
    }

    function annotate(doc) {
        if (!doc) return;
        let n = 0;
        Array.from(doc.getElementsByTagName("*")).forEach(function (el) {
            if (el.namespaceURI === XSL_NS) return;
            if (!el.getAttribute("data-pmk-xslt-node")) {
                n += 1;
                el.setAttribute("data-pmk-xslt-node", "node-" + n + "-" + Math.random().toString(36).slice(2, 5));
            }
        });
    }

    function marcRefFromXPath(select) {
        const raw = String(select || "");
        const tagMatch = raw.match(/(?:marc:)?datafield\s*\[\s*@tag\s*=\s*['\"]([^'\"]+)['\"]\s*\]/i);
        const subMatch = raw.match(/(?:marc:)?subfield\s*\[\s*@code\s*=\s*['\"]([^'\"]+)['\"]\s*\]/i);
        if (!tagMatch) return null;
        return { tag: tagMatch[1], subfield: subMatch ? subMatch[1] : "", select: raw };
    }

    function directMarcRefs(node) {
        if (!node) return [];
        const refs = [];
        Array.from(node.childNodes || []).forEach(function (child) {
            if (child.nodeType !== 1 || child.namespaceURI !== XSL_NS) return;
            if (child.localName === "value-of" || child.localName === "copy-of" || child.localName === "for-each") {
                const ref = marcRefFromXPath(child.getAttribute("select"));
                if (ref) refs.push({ element: child, tag: ref.tag, subfield: ref.subfield, select: ref.select });
            }
        });
        return refs;
    }

    function descendantMarcRefs(node) {
        if (!node) return [];
        const refs = [];
        ["value-of", "copy-of", "for-each"].forEach(function (name) {
            Array.from(node.getElementsByTagNameNS(XSL_NS, name)).forEach(function (el) {
                const ref = marcRefFromXPath(el.getAttribute("select"));
                if (ref) refs.push({ element: el, tag: ref.tag, subfield: ref.subfield, select: ref.select });
            });
        });
        return refs;
    }

    function directStaticText(node) {
        if (!node) return "";
        return Array.from(node.childNodes || []).filter(function (child) {
            return child.nodeType === 3;
        }).map(function (child) { return child.nodeValue || ""; }).join("");
    }

    function directLiteralChildren(node) {
        return Array.from(node && node.children || []).filter(function (child) { return child.namespaceURI !== XSL_NS; });
    }

    function importedConditionFor(node) {
        if (!node || !node.parentElement) return null;
        const p = node.parentElement;
        if (p.namespaceURI !== XSL_NS || p.localName !== "if") return null;
        const literalDirect = Array.from(p.children || []).filter(function (child) { return child.namespaceURI !== XSL_NS; });
        return literalDirect.length === 1 && literalDirect[0] === node ? p : null;
    }

    function inferHrefTemplate(anchor) {
        if (!anchor) return "";
        const literal = anchor.getAttribute("href");
        if (literal) return literal;
        const attr = Array.from(anchor.children || []).find(function (child) {
            return child.namespaceURI === XSL_NS && child.localName === "attribute" && child.getAttribute("name") === "href";
        });
        if (!attr) return "";
        let out = "";
        Array.from(attr.childNodes || []).forEach(function (child) {
            if (child.nodeType === 3) out += child.nodeValue || "";
            else if (child.nodeType === 1 && child.namespaceURI === XSL_NS && child.localName === "value-of") {
                const ref = marcRefFromXPath(child.getAttribute("select"));
                out += ref ? "{" + ref.tag + "$" + ref.subfield + "}" : "{XPath:" + (child.getAttribute("select") || "") + "}";
            } else if (child.nodeType === 1 && child.namespaceURI === XSL_NS && child.localName === "text") {
                out += child.textContent || "";
            }
        });
        return out;
    }

    function inferAnchorMeta(anchor) {
        const href = inferHrefTemplate(anchor);
        const meta = {
            enabled: true, mode: "fixed", index: "kw", queryType: "contains", valueTemplate: "{200$a}",
            externalTemplate: "", fixedUrl: href, target: anchor && anchor.getAttribute("target") === "_blank" ? "new" : "same",
            missingBehavior: "plain", conditionXPath: "", searchBase: "/cgi-bin/koha/catalogue/search.pl", queryPrefix: "", querySuffix: ""
        };
        if (!href) return meta;
        const koha = href.match(/^(.*\/catalogue\/search\.pl)\?[^#]*\bidx=([^&]+)&q=(.*)$/i);
        if (koha) {
            meta.mode = "koha";
            meta.searchBase = koha[1];
            meta.index = decodeURIComponent(koha[2]);
            meta.valueTemplate = decodeURIComponent(koha[3]).replace(/^%22|%22$/g, '"').replace(/^"|"$/g, "");
            meta.queryType = /%22|^"/.test(koha[3]) ? "exact" : (/\*$/.test(meta.valueTemplate) ? "starts" : "contains");
            meta.valueTemplate = meta.valueTemplate.replace(/\*$/, "");
        } else if (/\{[0-9A-Za-z]{3}\$[0-9A-Za-z]\}/.test(href)) {
            meta.mode = "external";
            meta.externalTemplate = href;
        }
        return meta;
    }

    function recognitionTitle(node) {
        if (!node) return "Élément";
        const customName = clean(node.getAttribute("data-pmk-xslt-display-name"));
        if (customName) return customName;
        const kind = node.getAttribute("data-pmk-xslt-kind") || "advanced";
        const text = clean(directStaticText(node)) || clean(Array.from(node.children || []).filter(function (el) { return el.namespaceURI === XSL_NS && el.localName === "text"; }).map(function (el) { return el.textContent; }).join(" "));
        const textLabel = text.replace(/[:;\s]+$/, "").slice(0, 65);
        const tag = (node.localName || "").toLowerCase();
        if (kind === "button") return "Bouton" + (textLabel ? " — " + textLabel : " d’action");
        if (kind === "link") return "Lien" + (textLabel ? " — " + textLabel : " cliquable");
        if (kind === "image") return "Image" + (node.getAttribute("alt") ? " — " + node.getAttribute("alt") : "");
        if (textLabel) return textLabel;
        const tokens = ((node.getAttribute("class") || "") + " " + (node.getAttribute("id") || "")).toLowerCase().split(/[\s_-]+/);
        const names = { title: "Titre", titre: "Titre", author: "Auteurs", authors: "Auteurs", auteur: "Auteurs", publisher: "Éditeur", publication: "Publication", series: "Collection", collection: "Collection", abstract: "Résumé", summary: "Résumé", notes: "Notes", subjects: "Sujets", subject: "Sujets", holdings: "Exemplaires", items: "Exemplaires", isbn: "ISBN", issn: "ISSN" };
        for (const token of tokens) if (names[token]) return names[token];
        const refs = descendantMarcRefs(node);
        const tags = Array.from(new Set(refs.map(function (r) { return r.tag; })));
        const marcNames = { "200": "Titre", "210": "Publication", "214": "Publication", "215": "Description matérielle", "225": "Collection", "330": "Résumé", "461": "Ensemble", "700": "Auteur", "701": "Auteurs", "702": "Autres responsabilités", "710": "Collectivité", "711": "Collectivités", "712": "Autres collectivités", "010": "ISBN", "011": "ISSN" };
        if (tags.length === 1 && marcNames[tags[0]]) return marcNames[tags[0]];
        if (tags.length && tags.every(function (t) { return ["700", "701", "702"].includes(t); })) return "Auteurs et responsabilités";
        if (kind === "field" && refs.length) return "Donnée MARC " + refs[0].tag + (refs[0].subfield ? "$" + refs[0].subfield : "");
        const types = { composite: "Plusieurs données regroupées", custom: "Encadré de texte", group: "Titre de section", "group-label": "Titre de section", spacer: "Espace vertical", text: "Texte", separator: "Ligne de séparation", container: "Groupe d’éléments", icon: "Icône", advanced: "Élément à réglages techniques" };
        return types[kind] || (tag === "div" ? "Section de l’affichage" : "Élément de l’affichage");
    }

    function recognizeLiteralNode(node) {
        if (!node || node.namespaceURI === XSL_NS) return;
        let kind = "advanced";
        let confidence = "advanced";
        const tag = String(node.localName || "").toLowerCase();
        const directRefs = directMarcRefs(node);
        const allRefs = descendantMarcRefs(node);
        const literalKids = directLiteralChildren(node);
        const hasXslt = Array.from(node.getElementsByTagNameNS(XSL_NS, "*")).length > 0;
        const staticText = clean(directStaticText(node));

        if (node.getAttribute("data-pmk-xslt-generic") === "custom-block") { kind = "custom"; confidence = "recognized"; }
        else if (node.getAttribute("data-pmk-xslt-composite")) { kind = "composite"; confidence = "recognized"; }
        else if (node.getAttribute("data-pmk-xslt-segment")) { kind = directRefs.length ? "field" : "text"; confidence = "recognized"; }
        else if (node.getAttribute("data-pmk-xslt-generic")) { kind = node.getAttribute("data-pmk-xslt-generic") || "container"; confidence = "recognized"; }
        else if (tag === "img") { kind = "image"; confidence = "recognized"; }
        else if (tag === "hr") { kind = "separator"; confidence = "recognized"; }
        else if (tag === "button" || (tag === "input" && /button|submit/i.test(node.getAttribute("type") || ""))) { kind = "button"; confidence = "recognized"; }
        else if (tag === "i" && /(?:^|\s)(?:fa|fas|far|fab)(?:\s|$)/.test(node.getAttribute("class") || "")) { kind = "icon"; confidence = "recognized"; }
        else if (tag === "a") { kind = "link"; confidence = "recognized"; if (!node.getAttribute("data-pmk-xslt-link-meta")) setJsonAttr(node, "data-pmk-xslt-link-meta", inferAnchorMeta(node)); }
        else if (/^h[1-6]$/.test(tag) || tag === "legend") { kind = "group"; confidence = allRefs.length <= 1 ? "recognized" : "partial"; }
        else if (directRefs.length === 1 && literalKids.length === 0) { kind = "field"; confidence = "recognized"; }
        else if (directRefs.length > 1 && literalKids.length === 0) { kind = "composite"; confidence = "recognized"; }
        else if (allRefs.length > 1) { kind = "composite"; confidence = literalKids.length <= 2 ? "partial" : "advanced"; }
        else if (allRefs.length === 1) { kind = "field"; confidence = literalKids.length === 0 ? "recognized" : "partial"; }
        else if (!hasXslt && literalKids.length === 0 && staticText) { kind = "text"; confidence = "recognized"; }
        else if (literalKids.length > 0) { kind = "container"; confidence = hasXslt ? "partial" : "recognized"; }
        else if (!hasXslt) { kind = "container"; confidence = "recognized"; }

        node.setAttribute("data-pmk-xslt-kind", kind);
        node.setAttribute("data-pmk-xslt-recognition", confidence);
        const importedIf = importedConditionFor(node);
        if (importedIf && !importedIf.getAttribute("data-pmk-xslt-condition-for")) {
            importedIf.setAttribute("data-pmk-xslt-condition-for", node.getAttribute("data-pmk-xslt-node"));
            importedIf.setAttribute("data-pmk-xslt-imported-condition", "1");
        }
        if (kind === "field" && directRefs[0]) {
            setJsonAttr(node, "data-pmk-xslt-imported-field", { tag: directRefs[0].tag, subfield: directRefs[0].subfield, select: directRefs[0].select });
        }
    }

    function recognizeVisualDocument(doc) {
        if (!doc) return { recognized: 0, partial: 0, advanced: 0, total: 0 };
        annotate(doc);
        const nodes = Array.from(doc.getElementsByTagName("*")).filter(function (el) { return el.namespaceURI !== XSL_NS && el.hasAttribute("data-pmk-xslt-node"); });
        nodes.forEach(recognizeLiteralNode);
        const stats = { recognized: 0, partial: 0, advanced: 0, total: nodes.length };
        nodes.forEach(function (node) {
            const state = node.getAttribute("data-pmk-xslt-recognition") || "advanced";
            if (state === "recognized") stats.recognized += 1;
            else if (state === "partial") stats.partial += 1;
            else stats.advanced += 1;
        });
        if (currentProject) {
            currentProject.visualRecognition = stats;
            currentProject.visualAnalyzedAt = new Date().toISOString();
        }
        return stats;
    }

    function restorePmkMetadataComments(doc) {
        if (!doc) return;
        const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_COMMENT);
        const comments = [];
        let c;
        while ((c = walker.nextNode())) comments.push(c);
        comments.forEach(function (comment) {
            const text = String(comment.nodeValue || "").trim();
            if (text.indexOf("PMK135:") !== 0) return;
            let meta = null;
            try { meta = JSON.parse(decodeURIComponent(text.slice(7))); } catch (_) { return; }
            let target = comment.nextSibling;
            while (target && target.nodeType !== 1) target = target.nextSibling;
            if (!target || target.namespaceURI === XSL_NS) return;
            Object.keys(meta || {}).forEach(function (key) {
                if (key.indexOf("data-pmk-xslt-") === 0 && key !== "data-pmk-xslt-node") target.setAttribute(key, meta[key]);
            });
            comment.remove();
        });
    }

    function addPmkMetadataComments(doc) {
        const copy = doc.cloneNode(true);
        Array.from(copy.getElementsByTagName("*")).forEach(function (el) {
            if (el.namespaceURI === XSL_NS || !el.parentNode) return;
            const meta = {};
            Array.from(el.attributes || []).forEach(function (attr) {
                if (/^data-pmk-xslt-/.test(attr.name) && attr.name !== "data-pmk-xslt-node" && !/^data-pmk-xslt-recognition$/.test(attr.name) && !/^data-pmk-xslt-kind$/.test(attr.name)) meta[attr.name] = attr.value;
            });
            if (!Object.keys(meta).length) return;
            el.parentNode.insertBefore(copy.createComment("PMK135:" + encodeURIComponent(JSON.stringify(meta))), el);
        });
        return copy;
    }

    function stripInternal(doc) {
        const copy = doc.cloneNode(true);
        Array.from(copy.getElementsByTagName("*")).forEach(function (el) {
            Array.from(el.attributes || []).forEach(function (attr) {
                if (/^data-pmk-xslt-/i.test(attr.name)) el.removeAttribute(attr.name);
            });
        });
        const walker = copy.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
        const comments = [];
        while (walker.nextNode()) if (/^PMK(?:135|136):/.test(walker.currentNode.nodeValue || "")) comments.push(walker.currentNode);
        comments.forEach(function (comment) { comment.remove(); });
        return copy;
    }

    function serializeDoc(doc, cleanOutput) {
        const target = cleanOutput ? stripInternal(doc) : doc;
        let xml = new XMLSerializer().serializeToString(target);
        if (!/^\s*<\?xml\b/.test(xml)) xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
        return xml;
    }

    function getLiteralNodes() {
        if (!workingDoc) return [];
        return Array.from(workingDoc.getElementsByTagName("*")).filter(function (el) {
            return el.namespaceURI !== XSL_NS && el.hasAttribute("data-pmk-xslt-node");
        });
    }

    function findNode(id) {
        if (!workingDoc || !id) return null;
        return getLiteralNodes().find(function (el) { return el.getAttribute("data-pmk-xslt-node") === id; }) || null;
    }

    function literalDepth(node) {
        let depth = 0;
        let p = node.parentElement;
        while (p) {
            if (p.namespaceURI !== XSL_NS) depth += 1;
            p = p.parentElement;
        }
        return depth;
    }

    function nodeSummary(node) {
        const refs = descendantMarcRefs(node);
        const fields = Array.from(new Set(refs.map(function (r) { return r.tag + (r.subfield ? "$" + r.subfield : ""); })));
        const parts = [];
        if (fields.length) parts.push("Données : " + fields.slice(0, 5).join(", ") + (fields.length > 5 ? "…" : ""));
        const text = clean(directStaticText(node));
        if (text) parts.push('Texte : « ' + text.slice(0, 65) + ' »');
        if (!parts.length) {
            const count = directLiteralChildren(node).length;
            if (count) parts.push(count + " élément(s) regroupé(s)");
            else if (node.localName === "img") parts.push(node.getAttribute("alt") || "Image de l’affichage");
            else parts.push("Cliquez pour modifier cet élément");
        }
        return parts.join(" · ");
    }

    function conditionWrapperFor(node) {
        if (!node || !node.parentElement) return null;
        const p = node.parentElement;
        if (p.namespaceURI === XSL_NS && p.localName === "if" && p.getAttribute("data-pmk-xslt-condition-for") === node.getAttribute("data-pmk-xslt-node")) return p;
        return null;
    }

    function movableUnit(node) {
        return conditionWrapperFor(node) || node;
    }

    function movableParent(node) {
        const unit = movableUnit(node);
        return unit ? unit.parentNode : null;
    }

    function getConditionMeta(node) {
        const wrapper = conditionWrapperFor(node);
        if (!wrapper) return { enabled: false, join: "and", rules: [] };
        try {
            const raw = wrapper.getAttribute("data-pmk-xslt-condition-meta");
            if (raw) return JSON.parse(decodeURIComponent(raw));
        } catch (_) {}
        return { enabled: true, join: "and", rules: [{ source: "xpath", xpath: wrapper.getAttribute("test") || "", operator: "custom", value: "" }] };
    }

    function fieldXPath(tag, subfield) {
        tag = clean(tag).replace(/[^0-9A-Za-z]/g, "");
        subfield = clean(subfield).replace(/[^0-9A-Za-z]/g, "");
        if (!tag) return "";
        let path = "marc:datafield[@tag='" + tag + "']";
        if (subfield) path += "/marc:subfield[@code='" + subfield + "']";
        return path;
    }

    function quoteXPathLiteral(value) {
        value = String(value == null ? "" : value);
        if (value.indexOf("'") === -1) return "'" + value + "'";
        if (value.indexOf('"') === -1) return '"' + value + '"';
        return "concat('" + value.split("'").join("',\"'\",'") + "')";
    }

    function conditionRuleToXPath(rule) {
        const source = rule.source === "xpath" ? clean(rule.xpath) : fieldXPath(rule.tag, rule.subfield);
        if (!source) return "";
        const op = rule.operator || "not-empty";
        const value = quoteXPathLiteral(rule.value || "");
        switch (op) {
            case "empty": return "not(normalize-space(string(" + source + ")))";
            case "equals": return "normalize-space(string(" + source + ")) = " + value;
            case "not-equals": return "normalize-space(string(" + source + ")) != " + value;
            case "contains": return "contains(normalize-space(string(" + source + ")), " + value + ")";
            case "starts-with": return "starts-with(normalize-space(string(" + source + ")), " + value + ")";
            case "exists": return "boolean(" + source + ")";
            case "custom": return source;
            case "not-empty":
            default: return "normalize-space(string(" + source + ")) != ''";
        }
    }

    function applyCondition(node, meta) {
        if (!node) return;
        let wrapper = conditionWrapperFor(node);
        if (!meta || !meta.enabled || !Array.isArray(meta.rules) || !meta.rules.length) {
            if (wrapper && wrapper.parentNode) {
                wrapper.parentNode.insertBefore(node, wrapper);
                wrapper.remove();
            }
            return;
        }
        const expressions = meta.rules.map(conditionRuleToXPath).filter(Boolean);
        if (!expressions.length) {
            if (wrapper && wrapper.parentNode) {
                wrapper.parentNode.insertBefore(node, wrapper);
                wrapper.remove();
            }
            return;
        }
        const join = meta.join === "or" ? " or " : " and ";
        const test = expressions.map(function (x) { return "(" + x + ")"; }).join(join);
        if (!wrapper) {
            wrapper = workingDoc.createElementNS(XSL_NS, "xsl:if");
            wrapper.setAttribute("data-pmk-xslt-condition-for", node.getAttribute("data-pmk-xslt-node"));
            const parent = node.parentNode;
            parent.insertBefore(wrapper, node);
            wrapper.appendChild(node);
        }
        wrapper.setAttribute("test", test);
        wrapper.setAttribute("data-pmk-xslt-condition-meta", encodeURIComponent(JSON.stringify(meta)));
    }

    function parseStyle(styleText) {
        const out = {};
        String(styleText || "").split(";").forEach(function (part) {
            const idx = part.indexOf(":");
            if (idx < 0) return;
            const key = clean(part.slice(0, idx)).toLowerCase();
            const value = clean(part.slice(idx + 1));
            if (key && value) out[key] = value;
        });
        return out;
    }

    function writeStyle(node, map) {
        const text = Object.keys(map || {}).filter(function (key) { return clean(map[key]); }).map(function (key) {
            return key + ": " + clean(map[key]);
        }).join("; ");
        if (text) node.setAttribute("style", text + ";");
        else node.removeAttribute("style");
    }

    function setStyleValue(node, key, value) {
        const map = parseStyle(node.getAttribute("style") || "");
        if (clean(value)) map[key] = clean(value); else delete map[key];
        writeStyle(node, map);
    }

    function getStyleValue(node, key) {
        return parseStyle(node.getAttribute("style") || "")[key] || "";
    }

    function getJsonAttr(node, name, fallback) {
        try {
            const raw = node && node.getAttribute(name);
            return raw ? JSON.parse(decodeURIComponent(raw)) : clone(fallback);
        } catch (_) {
            return clone(fallback);
        }
    }

    function setJsonAttr(node, name, value) {
        if (!node) return;
        if (value == null) node.removeAttribute(name);
        else node.setAttribute(name, encodeURIComponent(JSON.stringify(value)));
    }

    function templateParts(template) {
        const parts = [];
        const rx = /\{([0-9A-Za-z]{3})\$([0-9A-Za-z])\}/g;
        let last = 0;
        let match;
        while ((match = rx.exec(String(template || "")))) {
            if (match.index > last) parts.push({ type: "text", value: template.slice(last, match.index) });
            parts.push({ type: "field", tag: match[1], subfield: match[2], xpath: fieldXPath(match[1], match[2]) + "[1]" });
            last = rx.lastIndex;
        }
        if (last < String(template || "").length) parts.push({ type: "text", value: String(template || "").slice(last) });
        return parts;
    }

    function linkConditionFromTemplate(template) {
        const fields = templateParts(template).filter(function (p) { return p.type === "field"; });
        if (!fields.length) return "true()";
        return fields.map(function (p) { return "normalize-space(string(" + p.xpath + ")) != ''"; }).join(" and ");
    }

    function appendTemplateTo(node, template) {
        templateParts(template).forEach(function (part) {
            if (part.type === "text") node.appendChild(workingDoc.createTextNode(part.value));
            else {
                const value = workingDoc.createElementNS(XSL_NS, "xsl:value-of");
                value.setAttribute("select", part.xpath);
                node.appendChild(value);
            }
        });
    }

    function directLinkWrapper(node) {
        if (!node) return null;
        return Array.from(node.childNodes || []).find(function (child) {
            return child.nodeType === 1 && child.namespaceURI !== XSL_NS && child.localName === "a" && child.getAttribute("data-pmk-xslt-link-wrap") === "1";
        }) || null;
    }

    function unwrapLink(node) {
        const link = directLinkWrapper(node);
        if (!link) return;
        Array.from(link.childNodes).forEach(function (child) {
            if (child.nodeType === 1 && child.getAttribute && child.getAttribute("data-pmk-xslt-link-generated") === "1") child.remove();
            else node.insertBefore(child, link);
        });
        link.remove();
    }

    function getLinkMeta(node) {
        if (node && node.localName === "a" && node.namespaceURI !== XSL_NS && !node.getAttribute("data-pmk-xslt-link-meta")) {
            return inferAnchorMeta(node);
        }
        return getJsonAttr(node, "data-pmk-xslt-link-meta", {
            enabled: false,
            mode: "koha",
            index: "kw",
            queryType: "contains",
            valueTemplate: "{200$a}",
            externalTemplate: "https://example.org/?q={200$a}",
            fixedUrl: "",
            target: "same",
            missingBehavior: "plain",
            conditionXPath: "",
            searchBase: "/cgi-bin/koha/catalogue/search.pl",
            queryPrefix: "",
            querySuffix: ""
        });
    }

    function buildHrefTemplate(meta) {
        if (meta.mode === "fixed") return clean(meta.fixedUrl);
        if (meta.mode === "external") return String(meta.externalTemplate || "");
        const index = clean(meta.index) || "kw";
        const q = String(meta.valueTemplate || "{200$a}");
        let before = clean(meta.searchBase) || "/cgi-bin/koha/catalogue/search.pl";
        before += "?idx=" + index + "&q=";
        let after = "";
        if (meta.queryType === "exact") { before += "%22"; after = "%22"; }
        else if (meta.queryType === "starts") after = "*";
        else if (meta.queryType === "custom") { before += String(meta.queryPrefix || ""); after = String(meta.querySuffix || ""); }
        return before + q + after;
    }

    function applyLink(node, meta) {
        if (!node) return;
        if (node.localName === "a" && node.namespaceURI !== XSL_NS && !node.getAttribute("data-pmk-xslt-link-wrap")) {
            Array.from(node.children || []).filter(function (child) {
                return child.namespaceURI === XSL_NS && child.localName === "attribute" && child.getAttribute("name") === "href";
            }).forEach(function (child) { child.remove(); });
            node.removeAttribute("href");
            if (!meta || !meta.enabled) { node.removeAttribute("data-pmk-xslt-link-meta"); saveWorking(); return; }
            if (meta.target === "new") { node.setAttribute("target", "_blank"); node.setAttribute("rel", "noopener noreferrer"); }
            else { node.removeAttribute("target"); node.removeAttribute("rel"); }
            const template = buildHrefTemplate(meta);
            const hasDynamic = /\{[0-9A-Za-z]{3}\$[0-9A-Za-z]\}/.test(template);
            if (hasDynamic) {
                const attr = workingDoc.createElementNS(XSL_NS, "xsl:attribute"); attr.setAttribute("name", "href"); appendTemplateTo(attr, template); node.insertBefore(attr, node.firstChild);
            } else if (clean(template)) node.setAttribute("href", clean(template));
            setJsonAttr(node, "data-pmk-xslt-link-meta", meta);
            return;
        }
        unwrapLink(node);
        node.removeAttribute("data-pmk-xslt-link-meta");
        if (!meta || !meta.enabled) return;

        const content = Array.from(node.childNodes);
        const anchor = workingDoc.createElement("a");
        anchor.setAttribute("data-pmk-xslt-link-wrap", "1");
        if (meta.target === "new") {
            anchor.setAttribute("target", "_blank");
            anchor.setAttribute("rel", "noopener noreferrer");
        }
        content.forEach(function (child) { anchor.appendChild(child); });
        node.appendChild(anchor);

        const template = buildHrefTemplate(meta);
        const hasDynamic = /\{[0-9A-Za-z]{3}\$[0-9A-Za-z]\}/.test(template);
        if (!hasDynamic) {
            if (clean(template)) anchor.setAttribute("href", clean(template));
        } else {
            let cond = linkConditionFromTemplate(template);
            if (clean(meta.conditionXPath)) cond = "(" + cond + ") and (" + clean(meta.conditionXPath) + ")";
            const conditional = workingDoc.createElementNS(XSL_NS, "xsl:if");
            conditional.setAttribute("test", cond);
            conditional.setAttribute("data-pmk-xslt-link-generated", "1");
            const attr = workingDoc.createElementNS(XSL_NS, "xsl:attribute");
            attr.setAttribute("name", "href");
            appendTemplateTo(attr, template);
            conditional.appendChild(attr);
            anchor.insertBefore(conditional, anchor.firstChild);
            if (meta.missingBehavior === "hide") {
                const hideIf = workingDoc.createElementNS(XSL_NS, "xsl:if");
                hideIf.setAttribute("test", "not(" + cond + ")");
                hideIf.setAttribute("data-pmk-xslt-link-generated", "1");
                const styleAttr = workingDoc.createElementNS(XSL_NS, "xsl:attribute");
                styleAttr.setAttribute("name", "style");
                styleAttr.appendChild(workingDoc.createTextNode("display:none"));
                hideIf.appendChild(styleAttr);
                anchor.insertBefore(hideIf, anchor.firstChild);
            }
        }
        setJsonAttr(node, "data-pmk-xslt-link-meta", meta);
    }

    function getIconMeta(node) {
        return getJsonAttr(node, "data-pmk-xslt-icon-meta", { type: "none", value: "", position: "before", size: "" });
    }

    function clearDecorations(node) {
        Array.from(node.querySelectorAll('[data-pmk-xslt-decoration="1"]')).forEach(function (el) { el.remove(); });
    }

    function applyIcon(node, meta) {
        clearDecorations(node);
        node.removeAttribute("data-pmk-xslt-icon-meta");
        if (!meta || meta.type === "none" || !clean(meta.value)) return;
        let el;
        if (meta.type === "image") {
            el = workingDoc.createElement("img");
            el.setAttribute("src", clean(meta.value));
            el.setAttribute("alt", "");
            if (clean(meta.size)) {
                el.setAttribute("width", clean(meta.size));
                el.setAttribute("height", clean(meta.size));
            }
        } else {
            el = workingDoc.createElement("i");
            el.setAttribute("class", clean(meta.value));
            el.setAttribute("aria-hidden", "true");
            if (clean(meta.size)) el.setAttribute("style", "font-size:" + clean(meta.size) + "px;");
        }
        el.setAttribute("data-pmk-xslt-decoration", "1");
        if (meta.position === "after") node.appendChild(el);
        else node.insertBefore(el, node.firstChild);
        setJsonAttr(node, "data-pmk-xslt-icon-meta", meta);
    }

    function normalizePreviewProject() {
        if (!currentProject) return;
        normalizeProjectState(currentProject);
    }

    function currentPageRecordId(kind) {
        try {
            const params = new URL(window.location.href).searchParams;
            return kind === "authority" ? (params.get("authid") || params.get("authority_id") || "") : (params.get("biblionumber") || "");
        } catch (_) { return ""; }
    }

    async function fetchMarcXml(recordId, kind) {
        kind = kind === "authority" ? "authority" : "biblio";
        const id = clean(recordId).replace(/\D/g, "");
        if (!id) throw new Error(kind === "authority" ? "Numéro d’autorité invalide." : "Numéro de notice invalide.");
        const urls = kind === "authority"
            ? ["/api/v1/authorities/" + id]
            : ["/api/v1/biblios/" + id, "/api/v1/public/biblios/" + id];
        let lastError = "";
        for (const url of urls) {
            try {
                const response = await fetch(url, {
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: { "Accept": "application/marcxml+xml" }
                });
                if (!response.ok) { lastError = "HTTP " + response.status; continue; }
                const text = await response.text();
                const doc = parseXml(text);
                if (doc.documentElement) return doc;
            } catch (e) { lastError = e.message; }
        }
        throw new Error("Impossible de récupérer le MARCXML " + (kind === "authority" ? "de l’autorité " : "de la notice ") + id + (lastError ? " : " + lastError : ""));
    }

    async function fetchMarcXmlCached(recordId, kind, force) {
        kind = kind === "authority" ? "authority" : "biblio";
        const id = clean(recordId).replace(/\D/g, "");
        const key = kind + ":" + id;
        if (!force && marcPreviewCache.has(key)) return marcPreviewCache.get(key);
        const doc = await fetchMarcXml(id, kind);
        marcPreviewCache.set(key, doc);
        return doc;
    }

    function parsePreviewUriCall(expression, node) {
        const text = clean(expression);
        const match = text.match(/^([A-Za-z_][\w.-]*):encode-uri\s*\(/);
        if (!match || node.lookupNamespaceURI(match[1]) !== "http://exslt.org/strings") return null;
        const args = []; let start = match[0].length, depth = 0, quote = "";
        for (let i = start; i < text.length; i += 1) {
            const c = text[i];
            if (quote) { if (c === quote) quote = ""; continue; }
            if (c === "'" || c === '"') { quote = c; continue; }
            if (c === "(") { depth += 1; continue; }
            if (c === ")") {
                if (depth) { depth -= 1; continue; }
                if (clean(text.slice(i + 1))) return null;
                args.push(clean(text.slice(start, i)));
                return args;
            }
            if (c === "," && depth === 0) { args.push(clean(text.slice(start, i))); start = i + 1; }
        }
        return null;
    }

    function adaptUriEncodingForPreview(doc) {
        const markers = [];
        Array.from(doc.getElementsByTagNameNS(XSL_NS, "value-of")).forEach(function (node) {
            const args = parsePreviewUriCall(node.getAttribute("select") || "", node);
            if (!args) return;
            if (args.length < 2 || args.length > 3 || args.some(function (arg) { return !arg; })) throw new Error("Appel str:encode-uri non reconnu pour l’aperçu.");
            if (args.length === 3 && !/^(['"])utf-8\1$/i.test(args[2])) throw new Error("L’aperçu de str:encode-uri prend en charge l’encodage UTF-8. Le XSLT final conserve sa fonction d’origine.");
            const token = uid("pmk136uri");
            const start = "__" + token + "_start__", end = "__" + token + "_end__";
            // The browser evaluates the original XPath in the original context.
            // JS applies URI encoding to the result, after transformation only.
            // boolean(arg2) also preserves old Koha calls using 'UTF-8' as arg2.
            node.setAttribute("select", "concat('" + start + "', substring('01', 1 + number(boolean(" + args[1] + ")), 1), '_', string(" + args[0] + "), '" + end + "')");
            markers.push({ start: start, end: end });
        });
        return markers;
    }

    function finishUriEncodingPreview(fragment, markers) {
        if (!fragment || !markers || !markers.length) return fragment;
        function finish(value) {
            let result = String(value || "");
            markers.forEach(function (marker) {
                let position = 0;
                while (position < result.length) {
                    const begin = result.indexOf(marker.start, position);
                    if (begin < 0) break;
                    const content = begin + marker.start.length;
                    const end = result.indexOf(marker.end, content + 2);
                    if (end < 0) break;
                    const flag = result.slice(content, content + 2);
                    if (flag !== "0_" && flag !== "1_") { position = content; continue; }
                    const value = result.slice(content + 2, end);
                    const encoded = flag === "1_" ? encodeURIComponent(value) : encodeURI(value);
                    result = result.slice(0, begin) + encoded + result.slice(end + marker.end.length);
                    position = begin + encoded.length;
                }
            });
            return result;
        }
        const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.nodeType === 3) node.nodeValue = finish(node.nodeValue);
            else Array.from(node.attributes || []).forEach(function (attr) { const value = finish(attr.value); if (value !== attr.value) attr.value = value; });
        }
        return fragment;
    }

    function prepareXsltForBrowser(xsltDoc, options) {
        options = options || {};
        const annotated = xsltDoc.cloneNode(true);
        ensureNamespaces(annotated);
        if (options.interactive) {
            Array.from(annotated.getElementsByTagName("*")).forEach(function (el) {
                if (el.namespaceURI === XSL_NS) return;
                const nodeId = el.getAttribute("data-pmk-xslt-node");
                if (!nodeId) return;
                el.setAttribute("data-pmk-preview-node", nodeId);
                if (nodeId === selectedNodeId) el.setAttribute("data-pmk-preview-selected", "1");
            });
        }
        const copy = stripInternal(annotated);
        const base = resolveSourceUrl(currentProject && currentProject.sourceUrl || "") || window.location.href;
        inlineKnownDependenciesForPreview(copy, base, 0);
        const missing = Array.from(copy.getElementsByTagNameNS(XSL_NS, "include")).concat(Array.from(copy.getElementsByTagNameNS(XSL_NS, "import")));
        if (missing.length) throw new Error("Ce XSLT utilise un fichier complémentaire : " + missing.map(function (el) { return el.getAttribute("href"); }).join(", ") + ". Ajoutez son contenu manuellement dans « Importer mon XSLT » pour l’aperçu. Les références restent conservées dans le XSLT final.");
        ensureNamespaces(copy);
        const uriMarkers = adaptUriEncodingForPreview(copy);
        // Reparse the preview copy so XPath prefixes and namespace nodes have
        // the same bindings as in a stylesheet loaded from an XML file.
        const prepared = parseXml(new XMLSerializer().serializeToString(copy));
        prepared.__pmk136UriMarkers = uriMarkers;
        return prepared;
    }

    function transformRecord(xsltDoc, marcDoc, options) {
        if (typeof XSLTProcessor === "undefined") throw new Error("Ce navigateur ne fournit pas XSLTProcessor.");
        let stage = "préparation du XSLT";
        try {
            const prepared = prepareXsltForBrowser(xsltDoc, options);
            const source = parseXml(new XMLSerializer().serializeToString(marcDoc));
            const proc = new XSLTProcessor();
            stage = "compilation du XSLT";
            proc.importStylesheet(prepared);
            stage = "création de l’aperçu";
            try {
                const fragment = proc.transformToFragment(source, document);
                if (!fragment) throw new Error("Le navigateur n’a pas pu produire l’aperçu de ce XSLT.");
                return finishUriEncodingPreview(fragment, prepared.__pmk136UriMarkers);
            } catch (e) {
                // Some Firefox transformations cannot create namespaced output
                // directly in the HTML owner document. Render in a separate
                // document and parse only the resulting markup for the preview.
                const namespaceError = e && (e.name === "NamespaceError" || e.code === 14 || /namespace/i.test(e.message || ""));
                if (!namespaceError || typeof proc.transformToDocument !== "function") throw e;
                stage = "création de l’aperçu dans un document séparé";
                const outputDoc = proc.transformToDocument(source);
                if (!outputDoc || !outputDoc.documentElement) throw new Error("Le navigateur n’a pas pu produire un document d’aperçu.");
                const output = Array.from(prepared.getElementsByTagNameNS(XSL_NS, "output")).pop();
                if (output && output.getAttribute("method") === "text") {
                    const fragment = document.createDocumentFragment();
                    fragment.appendChild(document.createTextNode(outputDoc.documentElement.textContent || ""));
                    return finishUriEncodingPreview(fragment, prepared.__pmk136UriMarkers);
                }
                const template = document.createElement("template");
                template.innerHTML = new XMLSerializer().serializeToString(outputDoc);
                return finishUriEncodingPreview(template.content, prepared.__pmk136UriMarkers);
            }
        } catch (e) {
            throw new Error("Échec pendant la " + stage + " : " + (e && e.message || String(e)));
        }
    }

    function updateLivePreviewSelection(target, nodeId) {
        if (!target) return;
        Array.from(target.querySelectorAll(".pmk136-preview-picked")).forEach(function (el) { el.classList.remove("pmk136-preview-picked"); });
        if (!nodeId) return;
        try {
            Array.from(target.querySelectorAll('[data-pmk-preview-node="' + CSS.escape(nodeId) + '"]')).forEach(function (el) { el.classList.add("pmk136-preview-picked"); });
        } catch (_) {}
    }

    function bindLivePreviewInteractions(target) {
        if (!target || target.__pmk136InteractiveBound) return;
        target.__pmk136InteractiveBound = true;
        target.addEventListener("click", function (event) {
            const hit = event.target && event.target.closest ? event.target.closest("[data-pmk-preview-node]") : null;
            if (!hit || !target.contains(hit)) return;
            const nodeId = hit.getAttribute("data-pmk-preview-node");
            if (!nodeId || !findNode(nodeId)) return;
            event.preventDefault();
            event.stopPropagation();
            selectedNodeId = nodeId;
            updateLivePreviewSelection(target, nodeId);
            renderStructure();
            renderInspector();
            toast("Élément sélectionné depuis l’aperçu.", "success");
        }, true);
    }

    async function searchPreviewRecords(term, index) {
        term = clean(term);
        if (!term) return [];
        if (currentRecordKind() === "authority") return [];
        const url = "/cgi-bin/koha/catalogue/search.pl?idx=" + encodeURIComponent(clean(index) || "kw") + "&q=" + encodeURIComponent(term);
        const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw new Error("Recherche Koha impossible (HTTP " + response.status + ").");
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const out = [];
        const seen = new Set();
        Array.from(doc.querySelectorAll('a[href*="catalogue/detail.pl?biblionumber="]')).forEach(function (a) {
            try {
                const u = new URL(a.href, window.location.origin);
                const id = u.searchParams.get("biblionumber");
                if (!id || seen.has(id)) return;
                seen.add(id);
                out.push({ id: id, label: clean(a.textContent) || ("Notice " + id) });
            } catch (_) {}
        });
        return out.slice(0, 12);
    }

    async function renderRecordPreview(target, recordId, compare, options) {
        if (!target) return;
        options = options || {};
        const kind = currentRecordKind();
        const requestProjectId = currentProject && currentProject.id;
        const requestEpoch = projectEpoch;
        const requestFingerprint = projectContentFingerprint();
        const requestToken = {}; target.__pmkPreviewRequest = requestToken;
        const isCurrent = function () { return target.isConnected && target.__pmkPreviewRequest === requestToken && currentProject && currentProject.id === requestProjectId && projectEpoch === requestEpoch && projectContentFingerprint() === requestFingerprint; };
        target.innerHTML = '<div class="pmk135-muted"><i class="fa fa-spinner fa-spin"></i> Chargement ' + (kind === "authority" ? "de l’autorité" : "de la notice") + '…</div>';
        try {
            const marc = await fetchMarcXmlCached(recordId, kind, !!options.forceMarcReload);
            if (!isCurrent()) return;
            target.innerHTML = "";
            if (compare && currentProject && currentProject.sourceXml) {
                const grid = document.createElement("div");
                grid.className = "pmk135-preview-compare";
                const before = document.createElement("div");
                before.className = "pmk135-preview-column";
                before.innerHTML = "<strong>Avant — XSLT importé</strong>";
                const after = document.createElement("div");
                after.className = "pmk135-preview-column";
                after.innerHTML = "<strong>Après — vos modifications</strong>";
                try { before.appendChild(transformRecord(parseXml(currentProject.sourceXml), marc, { interactive: false })); }
                catch (e) { before.insertAdjacentHTML("beforeend", '<div class="alert alert-warning">' + esc(e.message) + '</div>'); }
                try { after.appendChild(transformRecord(workingDoc, marc, { interactive: !!options.interactive })); }
                catch (e) { after.insertAdjacentHTML("beforeend", '<div class="alert alert-warning">' + esc(e.message) + '</div>'); }
                grid.appendChild(before); grid.appendChild(after); target.appendChild(grid);
            } else {
                target.appendChild(transformRecord(workingDoc, marc, { interactive: !!options.interactive }));
            }
            if (options.interactive) {
                bindLivePreviewInteractions(target);
                updateLivePreviewSelection(target, selectedNodeId);
            }
            const status = app && app.querySelector("#pmk136-live-preview-status");
            if (status && options.live) status.textContent = "Mis à jour à " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        } catch (e) {
            if (!isCurrent()) return;
            target.innerHTML = '<div class="alert alert-warning"><strong>Aperçu réel indisponible.</strong><br>' + esc(e.message) + '<br><small>Le XSLT reste éditable et copiable. Certains XSLT Koha dépendent de paramètres ou inclusions fournis par Koha et ne peuvent pas être reproduits intégralement dans le navigateur.</small></div>';
            const status = app && app.querySelector("#pmk136-live-preview-status");
            if (status && options.live) status.textContent = "Aperçu en erreur";
        }
    }

    function scheduleAutoPreview(immediate) {
        if (autoPreviewTimer) { window.clearTimeout(autoPreviewTimer); autoPreviewTimer = null; }
        if (!app || !currentProject || !workingDoc || activeWorkspaceStep !== "build" || currentProject.autoPreview === false) return;
        const kind = currentRecordKind();
        const idKey = kind === "authority" ? "previewAuthorityId" : "previewBiblionumber";
        const id = clean(currentProject[idKey] || "").replace(/\D/g, "");
        const target = app.querySelector("#pmk136-live-preview");
        if (!target) return;
        if (!id) {
            target.innerHTML = '<div class="pmk136-live-preview-empty"><i class="fa fa-eye" aria-hidden="true"></i><strong>Voir le résultat de vos modifications</strong><span>Indiquez ' + (kind === "authority" ? "un numéro d’autorité" : "un numéro de notice") + ' ci-dessus. PMK réutilisera ensuite cette ' + (kind === "authority" ? "autorité" : "notice") + ' après chaque modification.</span></div>';
            const status = app.querySelector("#pmk136-live-preview-status");
            if (status) status.textContent = "En attente d’un document test";
            return;
        }
        const delay = immediate ? 0 : 180;
        const requestNo = ++autoPreviewRequest;
        autoPreviewTimer = window.setTimeout(async function () {
            autoPreviewTimer = null;
            const currentTarget = app && app.querySelector("#pmk136-live-preview");
            if (!currentTarget || requestNo !== autoPreviewRequest) return;
            const status = app.querySelector("#pmk136-live-preview-status");
            if (status) status.textContent = "Mise à jour…";
            await renderRecordPreview(currentTarget, id, !!currentProject.autoPreviewCompare, { interactive: true, live: true });
        }, delay);
    }

    function saveWorking() {
        if (!currentProject || !workingDoc) return;
        const previousXml = currentProject.workingXml || "";
        const nextXml = serializeDoc(workingDoc, false);
        if (nextXml !== previousXml) {
            recordUndoSnapshot(previousXml);
            currentProject.workingXml = nextXml;
            currentProject.updatedAt = new Date().toISOString();
        }
        saveProject(currentProject);
        updateTopbarStatus();
        scheduleAutoPreview(false);
    }

    function setWorkingXml(xml, sourceToo) {
        const previousXml = currentProject && currentProject.workingXml ? currentProject.workingXml : "";
        if (!sourceToo && previousXml && previousXml !== xml) recordUndoSnapshot(previousXml);
        const doc = parseXml(xml);
        ensureNamespaces(doc);
        restorePmkMetadataComments(doc);
        annotate(doc);
        projectEpoch += 1;
        workingDoc = doc;
        recognizeVisualDocument(doc);
        if (sourceToo) currentProject.sourceXml = xml;
        currentProject.workingXml = serializeDoc(doc, false);
        if (sourceToo) currentProject.dependencies = [];
        currentProject.activeStep = "build";
        activeWorkspaceStep = "build";
        saveProject(currentProject);
        selectedNodeId = getLiteralNodes()[0]?.getAttribute("data-pmk-xslt-node") || null;
        renderAll();
        const epoch = projectEpoch;
        const projectId = currentProject.id;
        window.setTimeout(function () {
            loadDependencyTree(false).then(function () {
                if (app && currentProject && currentProject.id === projectId && projectEpoch === epoch) renderWorkspace();
            }).catch(function () {});
        }, 0);
    }

    function resolveSourceUrl(value) {
        value = clean(value);
        if (!value || value === "default") return "";
        try {
            return new URL(value, window.location.origin).href;
        } catch (_) {
            return value;
        }
    }

    function readLocalXsltFile(file) {
        return new Promise(function (resolve, reject) {
            if (!file) return reject(new Error("Aucun fichier sélectionné."));
            const reader = new FileReader();
            reader.onerror = function () { reject(new Error("Impossible de lire le fichier sélectionné.")); };
            reader.onload = function () {
                try {
                    const xml = String(reader.result || "");
                    parseXml(xml);
                    resolve(xml);
                } catch (e) { reject(e); }
            };
            reader.readAsText(file, "UTF-8");
        });
    }


    function normalizeDependenciesProject() {
        if (!currentProject) return [];
        if (!Array.isArray(currentProject.dependencies)) currentProject.dependencies = [];
        return currentProject.dependencies;
    }

    function dependencyBasename(value) {
        value = clean(value).split(/[?#]/)[0];
        const bits = value.split('/');
        return bits[bits.length - 1] || 'dependency.xsl';
    }

    function resolveDependencyUrl(href, baseUrl) {
        href = clean(href);
        if (!href) return '';
        try { return new URL(href, baseUrl || window.location.href).href; }
        catch (_) { return href; }
    }

    function dependencyRefsFromDoc(doc, baseUrl, parentId) {
        if (!doc) return [];
        const refs = [];
        ['import','include'].forEach(function (kind) {
            Array.from(doc.getElementsByTagNameNS(XSL_NS, kind)).forEach(function (el) {
                const href = clean(el.getAttribute('href'));
                if (!href) return;
                refs.push({
                    kind: kind,
                    href: href,
                    originalHref: href,
                    resolvedUrl: resolveDependencyUrl(href, baseUrl),
                    parentId: parentId || '',
                    topLevel: !parentId
                });
            });
        });
        return refs;
    }

    function dependencyTemplateNames(xml) {
        if (!clean(xml)) return [];
        try {
            const doc = parseXml(xml);
            return Array.from(doc.getElementsByTagNameNS(XSL_NS, 'template'))
                .map(function (el) { return clean(el.getAttribute('name')); })
                .filter(Boolean);
        } catch (_) { return []; }
    }

    function dependencyCalls(dep) {
        if (!workingDoc || !dep) return [];
        const names = new Set(dep.templates || dependencyTemplateNames(dep.customXml || dep.sourceXml));
        if (!names.size) return [];
        return Array.from(workingDoc.getElementsByTagNameNS(XSL_NS, 'call-template')).map(function (el) {
            return clean(el.getAttribute('name'));
        }).filter(function (name) { return names.has(name); });
    }

    function countDependencyCalls(dep) {
        return dependencyCalls(dep).length;
    }

    function syncDependencyUsage() {
        normalizeDependenciesProject().forEach(function (dep) {
            dep.templates = dependencyTemplateNames(dep.customXml || dep.sourceXml);
            dep.calledTemplates = Array.from(new Set(dependencyCalls(dep)));
            dep.usageCount = dep.calledTemplates.reduce(function(total, name){
                return total + Array.from(workingDoc ? workingDoc.getElementsByTagNameNS(XSL_NS, 'call-template') : []).filter(function(el){ return clean(el.getAttribute('name')) === name; }).length;
            }, 0);
        });
    }

    function dependencyByHref(href, baseUrl) {
        href = clean(href);
        const resolved = resolveDependencyUrl(href, baseUrl);
        return normalizeDependenciesProject().find(function (dep) {
            return clean(dep.href) === href || clean(dep.customFilename) === href || clean(dep.resolvedUrl) === resolved;
        }) || null;
    }

    function inlineKnownDependenciesForPreview(doc, baseUrl, depth) {
        if (!doc || depth > 5) return doc;
        const refs = Array.from(doc.getElementsByTagNameNS(XSL_NS, 'include')).concat(Array.from(doc.getElementsByTagNameNS(XSL_NS, 'import')));
        refs.forEach(function (el) {
            const href = clean(el.getAttribute('href'));
            const dep = dependencyByHref(href, baseUrl);
            const xml = dep && clean(dep.customXml || dep.sourceXml);
            if (!xml) return;
            try {
                const depDoc = parseXml(xml);
                inlineKnownDependenciesForPreview(depDoc, dep.resolvedUrl || baseUrl, depth + 1);
                const root = depDoc.documentElement;
                const parent = el.parentNode;
                if (!parent || !root) return;
                Array.from(root.childNodes).forEach(function (child) {
                    if (child.nodeType === 1 && child.namespaceURI === XSL_NS && ['output','strip-space','preserve-space'].indexOf(child.localName) >= 0) return;
                    const imported = doc.importNode(child, true);
                    // An imported template may use prefixes only in XPath
                    // strings. Keep declarations inherited from its old root.
                    if (imported.nodeType === 1) {
                        Array.from(root.attributes || []).forEach(function (attr) {
                            if (attr.namespaceURI !== XMLNS_NS) return;
                            if (!imported.hasAttributeNS(XMLNS_NS, attr.localName)) imported.setAttributeNS(XMLNS_NS, attr.name, attr.value);
                        });
                    }
                    parent.insertBefore(imported, el);
                });
                parent.removeChild(el);
            } catch (_) {}
        });
        return doc;
    }

    async function loadDependencyTree() {
        if (!currentProject || !workingDoc) return [];
        const previous = normalizeDependenciesProject();
        const queue = dependencyRefsFromDoc(workingDoc, window.location.href, "");
        const result = [], seen = new Set();
        while (queue.length) {
            const ref = queue.shift();
            const key = ref.resolvedUrl || ref.href;
            if (seen.has(key)) continue;
            seen.add(key);
            const old = previous.find(function (dep) { return (dep.resolvedUrl || dep.href) === key || dep.href === ref.href; });
            const dep = Object.assign({}, old || {}, ref, { id: old && old.id || uid("dep") });
            dep.status = clean(dep.customXml || dep.sourceXml) ? "loaded-local" : "manual";
            dep.templates = dependencyTemplateNames(dep.customXml || dep.sourceXml);
            result.push(dep);
            if (clean(dep.customXml || dep.sourceXml) && result.length < 100) {
                try { dependencyRefsFromDoc(parseXml(dep.customXml || dep.sourceXml), dep.resolvedUrl, dep.id).forEach(function (child) { queue.push(child); }); }
                catch (_) {}
            }
        }
        currentProject.dependencies = result;
        syncDependencyUsage();
        saveProject(currentProject);
        return result;
    }

    function dependencyById(id) {
        return normalizeDependenciesProject().find(function (dep) { return dep.id === id; }) || null;
    }

    function importDependencyManually(dep) {
        if (!dep) return;
        const wrap = document.createElement('div');
        wrap.innerHTML = '<div class="alert alert-light">Collez le contenu complet du fichier <code>' + esc(dep.href) + '</code>.</div>';
        const fileInput = document.createElement('input'); fileInput.type='file'; fileInput.className='form-control form-control-sm'; fileInput.accept='.xsl,.xslt,.xml,application/xml,text/xml,application/xslt+xml,text/xsl';
        wrap.appendChild(makeField('Fichier local', fileInput, 'Ou collez le contenu ci-dessous. Ce fichier sert uniquement à l’aperçu.'));
        const ta = document.createElement('textarea'); ta.className='form-control'; ta.rows=18; ta.spellcheck=false; wrap.appendChild(ta);
        fileInput.addEventListener('change', async function(){
            if (!fileInput.files || !fileInput.files[0]) return;
            try { ta.value = await readLocalXsltFile(fileInput.files[0]); toast('Dépendance chargée depuis le fichier local.', 'success'); }
            catch(e) { toast(e.message,'danger'); }
        });
        dialog('Ajouter un fichier pour l’aperçu', wrap, [
            {label:'Annuler',className:'btn btn-sm btn-outline-secondary',icon:'fa fa-times',run:function(box){box.remove();}},
            {label:'Ajouter pour l’aperçu',className:'btn btn-sm btn-primary',icon:'fa fa-save',run:function(box){
                try { parseXml(ta.value); dep.sourceXml=ta.value; if(!dep.originalSourceXml)dep.originalSourceXml=ta.value; dep.status='loaded-local'; dep.error=''; dep.templates=dependencyTemplateNames(dep.sourceXml); syncDependencyUsage(); saveProject(currentProject); box.remove(); loadDependencyTree(false).then(function () { renderWorkspace(); scheduleAutoPreview(true); }); toast('Fichier ajouté pour l’aperçu.', 'success'); }
                catch(e){ toast(e.message,'danger'); }
            }}
        ]);
    }

    function renderProjectOptions(select) {
        const index = loadIndex();
        select.innerHTML = "";
        if (!index.length) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "Aucun projet";
            select.appendChild(option);
            return;
        }
        index.sort(function (a, b) { return String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")); });
        index.forEach(function (meta) {
            const option = document.createElement("option");
            option.value = meta.id;
            option.textContent = meta.name || meta.syspref || "Projet XSLT";
            if (currentProject && meta.id === currentProject.id) option.selected = true;
            select.appendChild(option);
        });
    }

    function createButton(label, cls, handler, icon) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = cls || "btn btn-sm btn-outline-secondary";
        button.innerHTML = (icon ? '<i class="' + esc(icon) + '" aria-hidden="true"></i> ' : "") + esc(label);
        button.addEventListener("click", handler);
        return button;
    }

    function updateTopbarStatus() {
        if (!app || !currentProject) return;
        const node = app.querySelector(".pmk136-project-status");
        if (!node) return;
        const updated = currentProject.updatedAt ? new Date(currentProject.updatedAt) : null;
        let label = updated && !Number.isNaN(updated.getTime()) ? "Enregistré à " + updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Projet local";
        if (currentProject.lastValidation) {
            const stale = currentProject.lastValidation.fingerprint !== validationFingerprint();
            if (stale) label += " · validation à refaire";
            else if (currentProject.lastValidation.status === "ok") label += " · validé";
            else if (currentProject.lastValidation.status === "warn") label += " · validé avec avertissements";
            else label += " · erreurs de validation";
        }
        node.textContent = label;
    }

    function duplicateCurrentProject() {
        if (!currentProject) return;
        const copy = clone(currentProject);
        copy.id = uid("project");
        copy.name = (currentProject.name || "Projet XSLT") + " — copie";
        copy.createdAt = new Date().toISOString();
        copy.updatedAt = copy.createdAt;
        copy.lastValidation = null;
        if (copy.publication) {
            copy.publication.backupAcknowledgedRevision = "";
            copy.publication.backupAcknowledgedAt = "";
            copy.publication.backupAcknowledgedFingerprint = "";
            copy.publication.lastExportFingerprint = "";
            copy.publication.lastExportRevision = 0;
            copy.publication.lastExportAt = "";
        }
        saveProject(copy);
        openProject(copy);
        toast("Projet dupliqué.", "success");
    }

    function deleteCurrentProjectFromUi() {
        if (!currentProject) return;
        if (!window.confirm("Supprimer le projet « " + (currentProject.name || "Projet XSLT") + " » de ce navigateur ?")) return;
        const id = currentProject.id;
        deleteProject(id);
        projectHistories.delete(id);
        const index = loadIndex();
        const next = index.length ? loadProject(index[index.length - 1].id) : defaultProject();
        if (!index.length) saveProject(next);
        openProject(next);
        toast("Projet supprimé.", "success");
    }

    function openProjectActionsDialog() {
        const wrap = document.createElement("div");
        const input = document.createElement("input"); input.className = "form-control"; input.value = currentProject.name || "";
        wrap.appendChild(makeField("Nom du document dans l’éditeur", input));
        input.addEventListener("input", function () { currentProject.name = clean(input.value) || "Mon XSLT"; saveProject(currentProject); renderTopbar(); });
        const tools = document.createElement("div"); tools.className = "pmk135-toolbar";
        tools.appendChild(createButton("Ouvrir un nouveau XSLT", "btn btn-outline-primary", function () { const p = defaultProject(); saveProject(p); document.querySelector(".pmk135-dialog-backdrop")?.remove(); openProject(p); openPasteDialog(); }));
        tools.appendChild(createButton("Dupliquer ce document", "btn btn-outline-secondary", function () { document.querySelector(".pmk135-dialog-backdrop")?.remove(); duplicateCurrentProject(); }));
        tools.appendChild(createButton("Supprimer ce brouillon", "btn btn-outline-danger", function () { document.querySelector(".pmk135-dialog-backdrop")?.remove(); deleteCurrentProjectFromUi(); }));
        wrap.appendChild(tools);
        dialog("Mes documents XSLT", wrap, [{ label: "Fermer", className: "btn btn-outline-secondary", run: function (box) { box.remove(); } }]);
    }

    function renderTopbar() {
        if (!app) return;
        const bar = app.querySelector(".pmk135-topbar");
        if (!bar) return;
        bar.innerHTML = "";
        app.classList.toggle("pmk136-mode-simple", currentUiMode() === "simple");
        app.classList.toggle("pmk136-mode-advanced", currentUiMode() === "advanced");

        const brand = document.createElement("div");
        brand.className = "pmk135-brand";
        brand.innerHTML = '<i class="fa fa-code" aria-hidden="true"></i><span>Assistant XSLT</span><span class="pmk135-status">' + esc(MODULE_VERSION) + '</span>';
        bar.appendChild(brand);

        const projectSelect = document.createElement("select");
        projectSelect.className = "form-control form-control-sm";
        renderProjectOptions(projectSelect);
        projectSelect.addEventListener("change", function () {
            const project = loadProject(projectSelect.value);
            if (project) openProject(project);
        });
        bar.appendChild(projectSelect);
        bar.appendChild(createButton("Mes XSLT", "btn btn-sm btn-outline-secondary", openProjectActionsDialog, "fa fa-folder-open"));

        if (workingDoc) {
            bar.appendChild(createButton("Annuler", "btn btn-sm btn-outline-secondary", undoWorking, "fa fa-undo"));
            bar.lastChild.title = "Annuler";
            bar.appendChild(createButton("Rétablir", "btn btn-sm btn-outline-secondary", redoWorking, "fa fa-redo"));
            bar.lastChild.title = "Rétablir";
        }

        bar.appendChild(createButton(currentUiMode() === "advanced" ? "Masquer les options techniques" : "Options techniques", "btn btn-sm btn-outline-secondary", function () {
            if (!currentProject) return;
            currentProject.uiMode = currentUiMode() === "advanced" ? "simple" : "advanced";
            saveProject(currentProject);
            const workspace = app.querySelector(".pmk135-pane-workspace"); if (workspace) workspace.dataset.step = "";
            renderAll();
        }, currentUiMode() === "advanced" ? "fa fa-tools" : "fa fa-leaf"));

        const spacer = document.createElement("div");
        spacer.className = "pmk135-spacer";
        bar.appendChild(spacer);
        const status = document.createElement("span");
        status.className = "pmk136-project-status";
        bar.appendChild(status);

        if (workingDoc) {
            bar.appendChild(createButton("Copier mon XSLT", "btn btn-sm btn-primary", function () { setWorkspaceStep("publish"); }, "fa fa-copy"));
        }
        bar.appendChild(createButton("Fermer", "btn btn-sm btn-outline-secondary", closeAssistant, "fa fa-times"));
        updateTopbarStatus();
    }

    function openProject(project) {
        if (autoPreviewTimer) { window.clearTimeout(autoPreviewTimer); autoPreviewTimer = null; }
        autoPreviewRequest += 1;
        projectEpoch += 1;
        currentProject = normalizeProjectState(project);
        activeWorkspaceStep = currentProject.activeStep || (currentProject.workingXml ? "build" : "source");
        workingDoc = null;
        selectedNodeId = null;
        normalizeDependenciesProject();
        if (project.workingXml) {
            try {
                workingDoc = parseXml(project.workingXml);
                ensureNamespaces(workingDoc);
                restorePmkMetadataComments(workingDoc);
                annotate(workingDoc);
                recognizeVisualDocument(workingDoc);
                syncDependencyUsage();
                selectedNodeId = getLiteralNodes()[0]?.getAttribute("data-pmk-xslt-node") || null;
            } catch (e) {
                toast("Le brouillon local est invalide : " + e.message, "danger");
            }
        }
        const pane = app && app.querySelector(".pmk135-pane-workspace"); if (pane) pane.dataset.step = "";
        renderAll();
        if (workingDoc) {
            const epoch = projectEpoch;
            const projectId = currentProject.id;
            window.setTimeout(function(){
                loadDependencyTree(false).then(function(){
                    if(app && currentProject && currentProject.id === projectId && projectEpoch === epoch) renderWorkspace();
                }).catch(function(){});
            },0);
        }
    }

    function renderVisualRecognitionSummary() {
        const stats = currentProject && currentProject.visualRecognition ? currentProject.visualRecognition : recognizeVisualDocument(workingDoc);
        const box = document.createElement("div");
        box.className = "pmk135-section";
        box.innerHTML = '<h4><i class="fa fa-eye" aria-hidden="true"></i> Analyse de l’interface générée</h4>' +
            '<div class="alert alert-light">' +
            '<strong>' + (stats.recognized || 0) + ' élément(s) éditable(s)</strong><br>' +
            '<span class="badge badge-success">' + (stats.recognized || 0) + ' reconnus</span> ' +
            '<span class="badge badge-warning">' + (stats.partial || 0) + ' partiellement éditables</span> ' +
            '<span class="badge badge-dark">' + (stats.advanced || 0) + ' blocs XSLT avancés préservés</span>' +
            '<div class="pmk135-muted" style="margin-top:.45rem">Les blocs avancés sont conservés sans réécriture automatique tant que vous ne les modifiez pas.</div></div>';
        return box;
    }

    function templateLabelForNode(node) {
        const template = xsltTemplateForNode(node);
        if (!template) return "Autres éléments";
        const name = clean(template.getAttribute("name"));
        const match = clean(template.getAttribute("match"));
        const mode = clean(template.getAttribute("mode"));
        if (currentUiMode() === "advanced") return (name ? "Modèle : " + name : "Modèle pour : " + match) + (mode ? " · " + mode : "");
        if (match === "/") return "Affichage principal";
        if (match && /record/.test(match)) return "Affichage de la notice" + (mode ? " — " + mode : "");
        if (name) return "Section — " + name.replace(/[_-]+/g, " ");
        return "Section de l’affichage — " + (match || "sans nom");
    }

    function xsltTemplateForNode(node) {
        let p = node;
        while (p) {
            if (p.nodeType === 1 && p.namespaceURI === XSL_NS && p.localName === "template") return p;
            p = p.parentNode;
        }
        return null;
    }

    function canContainDroppedNode(node) {
        if (!node || node.nodeType !== 1 || node.namespaceURI === XSL_NS) return false;
        const tag = String(node.localName || "").toLowerCase();
        return !["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"].includes(tag);
    }

    function clearDropIndicators(root) {
        if (!root) return;
        Array.from(root.querySelectorAll(".is-drop-target,.is-drop-before,.is-drop-after,.is-drop-inside")).forEach(function (el) {
            el.classList.remove("is-drop-target", "is-drop-before", "is-drop-after", "is-drop-inside");
        });
    }

    function pointerDropAllowed(dragged, target, position) {
        if (!dragged || !target || dragged === target) return false;
        const draggedUnit = movableUnit(dragged);
        const targetUnit = movableUnit(target);
        if (!draggedUnit || !targetUnit || !targetUnit.parentNode) return false;
        if (draggedUnit.contains && draggedUnit.contains(targetUnit)) return false;
        const a = xsltTemplateForNode(dragged);
        const b = xsltTemplateForNode(target);
        if (a !== b) return false;
        if (position === "inside" && !canContainDroppedNode(target)) return false;
        const destination = position === "inside" ? target : targetUnit.parentNode;
        if (draggedUnit.contains && draggedUnit.contains(destination)) return false;
        return true;
    }

    function performPointerDrop(dragged, target, position) {
        if (!pointerDropAllowed(dragged, target, position)) return false;
        const draggedUnit = movableUnit(dragged);
        const targetUnit = movableUnit(target);
        if (position === "inside") {
            target.appendChild(draggedUnit);
        } else if (position === "before") {
            targetUnit.parentNode.insertBefore(draggedUnit, targetUnit);
        } else {
            targetUnit.parentNode.insertBefore(draggedUnit, targetUnit.nextSibling);
        }
        return true;
    }

    function startPointerStructureDrag(event, nodeId, card, body) {
        if (activeWorkspaceStep !== "build" || event.button !== 0) return;
        if (event.target && event.target.closest && event.target.closest("button,input,select,textarea,a")) return;
        const dragged = findNode(nodeId);
        if (!dragged) return;
        const startX = event.clientX;
        const startY = event.clientY;
        const state = {
            nodeId: nodeId, card: card, body: body, pointerId: event.pointerId,
            startX: startX, startY: startY, active: false, ghost: null, hint: null,
            targetId: "", position: ""
        };
        pointerDrag = state;

        function activate() {
            if (state.active) return;
            state.active = true;
            draggedNodeId = nodeId;
            card.classList.add("is-dragging");
            document.documentElement.style.userSelect = "none";
            const ghost = document.createElement("div");
            ghost.className = "pmk136-drag-ghost";
            ghost.innerHTML = '<i class="fa fa-grip-vertical" aria-hidden="true"></i> ' + esc(recognitionTitle(dragged));
            document.body.appendChild(ghost);
            state.ghost = ghost;
            const hint = document.createElement("div");
            hint.className = "pmk136-drag-hint";
            hint.textContent = "Déplacer";
            document.body.appendChild(hint);
            state.hint = hint;
        }

        function moveFloating(x, y) {
            if (state.ghost) { state.ghost.style.left = (x + 16) + "px"; state.ghost.style.top = (y + 14) + "px"; }
            if (state.hint) { state.hint.style.left = (x + 18) + "px"; state.hint.style.top = (y - 20) + "px"; }
        }

        function onMove(ev) {
            if (pointerDrag !== state || ev.pointerId !== state.pointerId) return;
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (!state.active && Math.hypot(dx, dy) < 5) return;
            activate();
            ev.preventDefault();
            moveFloating(ev.clientX, ev.clientY);
            clearDropIndicators(body);
            state.targetId = ""; state.position = "";
            const hit = document.elementFromPoint(ev.clientX, ev.clientY);
            const targetCard = hit && hit.closest ? hit.closest(".pmk135-card[data-node-id]") : null;
            if (!targetCard || targetCard === card || !body.contains(targetCard)) {
                if (state.hint) state.hint.textContent = "Déplacement interdit";
                return;
            }
            const targetId = targetCard.dataset.nodeId || "";
            const target = findNode(targetId);
            if (!target) return;
            const rect = targetCard.getBoundingClientRect();
            const ratio = rect.height ? (ev.clientY - rect.top) / rect.height : .5;
            let position = ratio < .30 ? "before" : (ratio > .70 ? "after" : "inside");
            if (!pointerDropAllowed(dragged, target, position) && position === "inside") {
                position = ratio < .5 ? "before" : "after";
            }
            if (!pointerDropAllowed(dragged, target, position)) {
                if (state.hint) state.hint.textContent = "Déplacement interdit";
                return;
            }
            state.targetId = targetId;
            state.position = position;
            targetCard.classList.add("is-drop-target", position === "before" ? "is-drop-before" : (position === "after" ? "is-drop-after" : "is-drop-inside"));
            if (state.hint) state.hint.textContent = position === "before" ? "Placer avant" : (position === "after" ? "Placer après" : "Placer à l’intérieur");
        }

        function cleanup() {
            window.removeEventListener("pointermove", onMove, true);
            window.removeEventListener("pointerup", onUp, true);
            window.removeEventListener("pointercancel", onCancel, true);
            clearDropIndicators(body);
            card.classList.remove("is-dragging");
            if (state.ghost) state.ghost.remove();
            if (state.hint) state.hint.remove();
            document.documentElement.style.userSelect = "";
            draggedNodeId = null;
            pointerDrag = null;
        }

        function finish(ev, cancelled) {
            if (pointerDrag !== state) return;
            const wasActive = state.active;
            const targetId = state.targetId;
            const position = state.position;
            cleanup();
            if (!wasActive || cancelled) return;
            dragJustFinishedUntil = Date.now() + 250;
            const source = findNode(nodeId);
            const target = findNode(targetId);
            if (!source || !target || !performPointerDrop(source, target, position)) {
                toast("Déplacement impossible à cet endroit.", "info");
                return;
            }
            selectedNodeId = nodeId;
            saveWorking();
            renderStructure();
            renderInspector();
            renderWorkspace();
            toast(position === "inside" ? "Bloc déplacé à l’intérieur." : (position === "before" ? "Bloc déplacé avant." : "Bloc déplacé après."), "success");
        }

        function onUp(ev) { if (ev.pointerId === state.pointerId) finish(ev, false); }
        function onCancel(ev) { if (ev.pointerId === state.pointerId) finish(ev, true); }
        window.addEventListener("pointermove", onMove, { capture:true, passive:false });
        window.addEventListener("pointerup", onUp, true);
        window.addEventListener("pointercancel", onCancel, true);
    }

    function renderStructure() {
        if (!app) return;
        const pane = app.querySelector(".pmk135-pane-structure");
        if (!pane) return;
        pane.innerHTML = "";
        const head = document.createElement("div");
        head.className = "pmk135-pane-head";
        head.innerHTML = "<strong>Éléments de l’affichage</strong>";
        if (workingDoc && activeWorkspaceStep === "build") head.appendChild(createButton("Ajouter un élément", "btn btn-sm btn-primary", openAddElementMenu, "fa fa-plus"));
        pane.appendChild(head);

        const body = document.createElement("div");
        body.className = "pmk135-structure";
        pane.appendChild(body);

        if (!workingDoc) {
            body.innerHTML = '<div class="pmk135-empty"><i class="fa fa-sitemap"></i>Chargez un XSLT pour afficher sa structure.</div>';
            return;
        }

        const controls = document.createElement("div");
        controls.className = "pmk136-structure-controls";
        const search = document.createElement("input");
        search.type = "search";
        search.id = "pmk136-structure-search";
        search.className = "form-control form-control-sm";
        search.placeholder = "Rechercher un titre, un auteur, une zone MARC…";
        search.value = structureFilterText;
        const mode = document.createElement("select");
        mode.className = "form-control form-control-sm";
        mode.innerHTML = '<option value="all">Tous</option><option value="editable">Éditables</option><option value="advanced">Avancés</option>';
        mode.value = structureFilterMode;
        search.addEventListener("input", function () {
            structureFilterText = search.value;
            const pos = search.selectionStart;
            renderStructure();
            window.setTimeout(function () {
                const next = app && app.querySelector("#pmk136-structure-search");
                if (!next) return;
                next.focus();
                try { next.setSelectionRange(pos, pos); } catch (_) {}
            }, 0);
        });
        mode.addEventListener("change", function () { structureFilterMode = mode.value; renderStructure(); });
        controls.appendChild(search);
        controls.appendChild(mode);
        body.appendChild(controls);

        let nodes = getLiteralNodes();
        if (!nodes.length) {
            body.insertAdjacentHTML("beforeend", '<div class="pmk135-empty">Aucun élément de sortie HTML détecté.</div>');
            return;
        }

        const q = clean(structureFilterText).toLowerCase();
        nodes = nodes.filter(function (node) {
            const state = node.getAttribute("data-pmk-xslt-recognition") || "advanced";
            if (structureFilterMode === "editable" && state === "advanced") return false;
            if (structureFilterMode === "advanced" && state !== "advanced") return false;
            if (!q) return true;
            const haystack = [recognitionTitle(node), nodeSummary(node), node.getAttribute("class") || "", templateLabelForNode(node)]
                .join(" ").toLowerCase();
            return haystack.indexOf(q) >= 0;
        });

        if (!nodes.length) {
            body.insertAdjacentHTML("beforeend", '<div class="pmk135-empty">Aucun bloc ne correspond au filtre.</div>');
            return;
        }

        let lastTemplate = null;
        nodes.forEach(function (node) {
            const templateLabel = templateLabelForNode(node);
            if (templateLabel !== lastTemplate) {
                const title = document.createElement("div");
                title.className = "pmk136-template-title";
                title.innerHTML = '<i class="fa ' + (collapsedTemplates.has(templateLabel) ? 'fa-chevron-right' : 'fa-chevron-down') + ' fa-fw" aria-hidden="true"></i> ' + esc(templateLabel);
                title.title = "Replier / déplier cette section";
                title.addEventListener("click", function () {
                    if (collapsedTemplates.has(templateLabel)) collapsedTemplates.delete(templateLabel);
                    else collapsedTemplates.add(templateLabel);
                    renderStructure();
                });
                body.appendChild(title);
                lastTemplate = templateLabel;
            }
            if (collapsedTemplates.has(templateLabel)) return;

            const id = node.getAttribute("data-pmk-xslt-node");
            const card = document.createElement("div");
            card.className = "pmk135-card" + (id === selectedNodeId ? " is-selected" : "");
            card.draggable = false;
            card.dataset.nodeId = id;
            const depth = Math.min(8, literalDepth(node));
            card.style.marginLeft = (depth * 10) + "px";
            const condition = conditionWrapperFor(node);
            const state = node.getAttribute("data-pmk-xslt-recognition") || "advanced";
            card.innerHTML = '<div class="pmk135-card-title"><span class="pmk135-drag" title="Glisser pour déplacer cet élément"><i class="fa fa-grip-vertical" aria-hidden="true"></i></span><strong>' + esc(recognitionTitle(node)) + '</strong></div><div class="pmk135-node-meta">' + esc(nodeSummary(node)) + '</div>';
            if (condition) card.insertAdjacentHTML("beforeend", '<small class="pmk135-muted">Affiché sous condition</small>');
            if (currentUiMode() === "advanced") card.insertAdjacentHTML("beforeend", '<div class="pmk135-node-meta">&lt;' + esc(node.localName) + '&gt; · ' + esc(node.getAttribute("class") || "") + ' · ' + esc(state) + '</div>');
            card.setAttribute("role", "button"); card.tabIndex = 0;
            card.setAttribute("aria-label", recognitionTitle(node) + ". " + nodeSummary(node));
            card.addEventListener("keydown", function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); card.click(); } });
            card.addEventListener("click", function () {
                if (Date.now() < dragJustFinishedUntil) return;
                selectedNodeId = id;
                renderStructure();
                renderInspector();
                if (activeWorkspaceStep === "build") {
                    const live = app && app.querySelector("#pmk136-live-preview");
                    updateLivePreviewSelection(live, selectedNodeId);
                }
            });
            card.addEventListener("pointerdown", function (event) {
                startPointerStructureDrag(event, id, card, body);
            });
            body.appendChild(card);
        });
    }

    function openAddElementMenu() {
        const wrap = document.createElement("div"); wrap.className = "pmk136-add-options";
        const choices = [
            ["Une donnée de la notice", "Exemple : le titre en 200$a, le résumé en 330$a ou un auteur en 700$a.", openAddFieldDialog],
            ["Un encadré avec du texte", "Un titre et un texte que vous rédigez, avec des données de la notice si besoin.", openCustomBlockDialog],
            ["Plusieurs données ensemble", "Exemple : collection, numéro de volume et séparateurs sur une même ligne.", openCompositeDialog],
            ["Un titre, une image ou un bouton", "Ajouter un élément de présentation et régler son apparence.", openGenericElementDialog]
        ];
        choices.forEach(function (choice) {
            const button = createButton(choice[0], "btn btn-outline-secondary", function () { box.remove(); choice[2](); });
            const help = document.createElement("small"); help.textContent = choice[1]; button.appendChild(help); wrap.appendChild(button);
        });
        const box = dialog("Que souhaitez-vous ajouter ?", wrap, [{ label: "Annuler", className: "btn btn-outline-secondary", run: function (box) { box.remove(); } }]);
    }

    function sourceControl() {
        const wrap = document.createElement("div");
        wrap.className = "pmk135-section";
        wrap.innerHTML = '<h4>Votre XSLT</h4><p>Choisissez un fichier sur votre ordinateur ou collez son contenu complet. Vous pourrez ensuite modifier l’affichage et copier le résultat.</p>';
        const use = document.createElement("select");
        use.className = "form-control";
        use.innerHTML = '<option value="">Notice bibliographique — usage général</option>' + KNOWN_PREFS.map(function (pref) { return '<option value="' + esc(pref.id) + '">' + esc(pref.label) + '</option>'; }).join("");
        use.value = currentProject.syspref || "";
        use.addEventListener("change", function () { currentProject.syspref = use.value; saveProject(currentProject); });
        wrap.appendChild(makeField("Quel affichage modifiez-vous ?", use, "Ce choix détermine le type de notice utilisé pour l’aperçu."));
        wrap.appendChild(createButton(workingDoc ? "Remplacer par un autre XSLT" : "Choisir un fichier ou coller mon XSLT", "btn btn-primary", function () { openPasteDialog(); }, "fa fa-file-import"));
        if (workingDoc) {
            const info = document.createElement("p");
            info.style.marginTop = "1rem";
            info.textContent = "XSLT chargé : " + (currentProject.importedFilename || currentProject.name || "contenu collé");
            wrap.appendChild(info);
            const tools = document.createElement("div");
            tools.className = "pmk135-toolbar";
            tools.appendChild(createButton("Reprendre les modifications", "btn btn-primary", function () { setWorkspaceStep("build"); }, "fa fa-arrow-right"));
            tools.appendChild(createButton("Revenir au XSLT importé", "btn btn-outline-secondary", function () {
                if (!currentProject.sourceXml) return;
                if (window.confirm("Annuler les modifications et revenir au contenu importé ?")) setWorkingXml(currentProject.sourceXml, false);
            }, "fa fa-undo"));
            wrap.appendChild(tools);
            const deps = normalizeDependenciesProject();
            if (deps.length) {
                const extra = document.createElement("details");
                extra.style.marginTop = "1rem";
                extra.innerHTML = '<summary>Fichiers complémentaires pour l’aperçu (facultatif)</summary><p>Si l’aperçu réclame un fichier comme Utils.xsl, collez son contenu ici. Le XSLT final conserve ses références d’origine.</p>';
                deps.forEach(function (dep) {
                    const row = document.createElement("div"); row.className = "pmk135-toolbar";
                    const name = document.createElement("span"); name.textContent = dependencyBasename(dep.href) + (clean(dep.customXml || dep.sourceXml) ? " — ajouté" : " — non ajouté");
                    row.appendChild(name);
                    row.appendChild(createButton("Ajouter le contenu", "btn btn-sm btn-outline-secondary", function () { importDependencyManually(dep); }));
                    extra.appendChild(row);
                });
                wrap.appendChild(extra);
            }
        }
        return wrap;
    }

    function setWorkspaceStep(step) {
        if (!["source", "build", "publish"].includes(step)) return;
        if (!workingDoc && step !== "source") step = "source";
        activeWorkspaceStep = step;
        if (currentProject) {
            currentProject.activeStep = step;
            saveProject(currentProject);
        }
        renderWorkspace();
        renderStructure();
        renderInspector();
    }

    function renderStepBar() {
        const bar = document.createElement("div"); bar.className = "pmk136-stepbar";
        [["source", "1. Importer mon XSLT"], ["build", "2. Modifier l’affichage"], ["publish", "3. Copier le XSLT"]].forEach(function (item) {
            const button = createButton(item[1], "", function () { setWorkspaceStep(item[0]); });
            button.classList.toggle("is-active", activeWorkspaceStep === item[0]);
            button.disabled = !workingDoc && item[0] !== "source";
            bar.appendChild(button);
        });
        return bar;
    }

    function renderBuildStep(body) {
        const kind = currentRecordKind();
        const noun = kind === "authority" ? "autorité" : "notice";
        const idKey = kind === "authority" ? "previewAuthorityId" : "previewBiblionumber";
        const knownRecords = currentProject.previewRecords.filter(function (r) { return (r.kind || "biblio") === kind; });
        if (!currentProject[idKey]) {
            const fromPage = currentPageRecordId(kind);
            const fallback = fromPage || (knownRecords[0] && knownRecords[0].id) || "";
            if (fallback) { currentProject[idKey] = fallback; saveProject(currentProject); }
        }

        const live = document.createElement("div");
        live.className = "pmk135-section pmk136-live-preview-section";
        const liveHead = document.createElement("div");
        liveHead.className = "pmk136-live-preview-head";
        liveHead.innerHTML = '<h4><i class="fa fa-eye" aria-hidden="true"></i> Aperçu en direct</h4><span id="pmk136-live-preview-status" class="pmk136-live-preview-status">Automatique</span>';
        live.appendChild(liveHead);

        const controls = document.createElement("div");
        controls.className = "pmk136-live-controls";
        const idInput = document.createElement("input");
        idInput.className = "form-control form-control-sm";
        idInput.inputMode = "numeric";
        idInput.placeholder = kind === "authority" ? "Numéro d’autorité" : "Numéro de notice, ex. 380818";
        idInput.value = currentProject[idKey] || "";
        idInput.addEventListener("input", function () {
            currentProject[idKey] = clean(idInput.value).replace(/\D/g, "");
            saveProject(currentProject);
            scheduleAutoPreview(false);
        });
        controls.appendChild(makeField(kind === "authority" ? "Autorité de test" : "Notice de test", idInput, "Conservée pour les prochaines modifications."));

        const compareWrap = document.createElement("label");
        compareWrap.className = "pmk135-toggle-line";
        const compare = document.createElement("input");
        compare.type = "checkbox";
        compare.checked = !!currentProject.autoPreviewCompare;
        compare.addEventListener("change", function () {
            currentProject.autoPreviewCompare = compare.checked;
            saveProject(currentProject);
            scheduleAutoPreview(true);
        });
        compareWrap.appendChild(compare);
        compareWrap.appendChild(document.createTextNode(" Avant / après"));
        controls.appendChild(compareWrap);

        const previewTools = document.createElement("div");
        previewTools.className = "pmk135-toolbar";
        previewTools.appendChild(createButton("Actualiser", "btn btn-sm btn-primary", function () {
            const id = clean(idInput.value).replace(/\D/g, "");
            currentProject[idKey] = id;
            saveProject(currentProject);
            if (id) marcPreviewCache.delete(kind + ":" + id);
            scheduleAutoPreview(true);
        }, "fa fa-sync"));
        if (kind === "biblio") {
            previewTools.appendChild(createButton("Choisir une notice", "btn btn-sm btn-outline-secondary", function () {
                openPreviewSearchDialog(idInput, livePreview, { auto: true });
            }, "fa fa-search"));
        } else {
            previewTools.appendChild(createButton("Recherche autorités", "btn btn-sm btn-outline-secondary", function () {
                window.open('/cgi-bin/koha/authorities/authorities-home.pl', '_blank', 'noopener');
            }, "fa fa-search"));
        }
        controls.appendChild(previewTools);
        live.appendChild(controls);

        const hint = document.createElement("div");
        hint.className = "alert alert-light";
        hint.innerHTML = '<strong>Édition visuelle :</strong> l’aperçu se met à jour après chaque changement. Survolez puis cliquez directement sur un élément du rendu pour sélectionner le bloc XSLT qui le génère.';
        live.appendChild(hint);

        const livePreview = document.createElement("div");
        livePreview.id = "pmk136-live-preview";
        livePreview.className = "pmk135-real-preview pmk136-live-preview";
        live.appendChild(livePreview);
        body.appendChild(live);

        scheduleAutoPreview(true);
    }

    function renderPublishStep(body) {
        const section = document.createElement("div"); section.className = "pmk135-section";
        section.innerHTML = '<h4>Votre XSLT complet à copier</h4><p>Copiez ce code puis collez-le dans votre fichier XSLT. Il contient l’ensemble de la feuille, avec vos modifications.</p>';
        const tools = document.createElement("div"); tools.className = "pmk135-toolbar";
        tools.appendChild(createButton("Copier tout le XSLT", "btn btn-primary", copyOutput, "fa fa-copy"));
        const ta = document.createElement("textarea");
        ta.id = "pmk136-output"; ta.className = "form-control pmk135-code"; ta.rows = 24;
        ta.readOnly = true; ta.spellcheck = false; ta.value = serializeDoc(workingDoc, true);
        ta.setAttribute("aria-label", "XSLT complet prêt à copier");
        tools.appendChild(createButton("Sélectionner tout le code", "btn btn-outline-secondary", function () { ta.focus(); ta.select(); }));
        tools.appendChild(createButton("Retour aux modifications", "btn btn-outline-secondary", function () { setWorkspaceStep("build"); }));
        section.appendChild(tools);
        const status = document.createElement("p"); status.id = "pmk136-copy-status"; status.setAttribute("role", "status"); section.appendChild(status);
        section.appendChild(ta);
        const checks = document.createElement("details"); checks.style.marginTop = "1rem";
        checks.innerHTML = '<summary>Vérifier le XSLT (facultatif)</summary>';
        checks.appendChild(createButton("Vérifier le code et l’aperçu", "btn btn-sm btn-outline-secondary", validateCurrent));
        checks.appendChild(renderValidationReport()); section.appendChild(checks);
        body.appendChild(section);
    }

    function renderWorkspace() {
        if (!app || !currentProject) return;
        normalizePreviewProject();
        if (!workingDoc) activeWorkspaceStep = "source";
        app.classList.toggle("pmk136-focus-step", activeWorkspaceStep !== "build");
        const pane = app.querySelector(".pmk135-pane-workspace");
        // Input changes keep the preview and its controls in place.
        if (activeWorkspaceStep === "build" && pane.dataset.step === "build" && pane.dataset.project === currentProject.id && pane.querySelector("#pmk136-live-preview")) {
            scheduleAutoPreview(false); return;
        }
        pane.innerHTML = "";
        pane.dataset.step = activeWorkspaceStep; pane.dataset.project = currentProject.id;
        pane.appendChild(renderStepBar());
        const body = document.createElement("div"); body.className = "pmk135-workspace"; pane.appendChild(body);
        if (activeWorkspaceStep === "source") body.appendChild(sourceControl());
        else if (activeWorkspaceStep === "build") renderBuildStep(body);
        else renderPublishStep(body);
    }

    function tabButton(label, id, active) {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.tab = id;
        b.textContent = label;
        if (active) b.classList.add("is-active");
        return b;
    }

    function makeField(label, control, help) {
        const wrap = document.createElement("div");
        wrap.className = "pmk135-field";
        const l = document.createElement("label");
        l.textContent = label;
        if (control && /^(INPUT|SELECT|TEXTAREA)$/.test(control.tagName)) { if (!control.id) control.id = uid("pmk136-input"); l.htmlFor = control.id; }
        if (/^(Classes? CSS|ID HTML|Classe responsive|Classe d’infobulle|Position souhaitée|Balise)/.test(label)) wrap.classList.add("pmk136-advanced-only");
        wrap.appendChild(l);
        wrap.appendChild(control);
        if (help) {
            const small = document.createElement("small");
            small.textContent = help;
            wrap.appendChild(small);
        }
        return wrap;
    }

    function renderInspector(tab) {
        if (!app) return;
        const pane = app.querySelector(".pmk135-pane-inspector");
        if (!pane) return;
        const wantedTab = tab || pane.dataset.activeTab || "properties";
        pane.dataset.activeTab = wantedTab;
        pane.innerHTML = "";

        const head = document.createElement("div");
        head.className = "pmk135-pane-head";
        head.innerHTML = "<strong>Modifier l’élément sélectionné</strong>";
        pane.appendChild(head);

        if (!workingDoc) {
            pane.insertAdjacentHTML("beforeend", '<div class="pmk135-empty">Les propriétés apparaîtront après chargement d’un XSLT.</div>');
            return;
        }
        if (activeWorkspaceStep !== "build") {
            pane.insertAdjacentHTML("beforeend", '<div class="pmk135-empty"><i class="fa fa-sliders-h"></i>Cliquez sur un élément dans « Modifier l’affichage » pour accéder à ses réglages.</div>');
            return;
        }

        const tabs = document.createElement("div");
        tabs.className = "pmk135-tabs";
        const inspectorTabs = [
            ["Contenu", "properties"],
            ["Quand l’afficher", "conditions"],
            ["Au clic", "link"],
            ["Mise en forme", "style"],
            ["Texte au survol", "tooltip"]
        ];
        if (currentUiMode() === "advanced") inspectorTabs.push(["Avancé", "raw"]);
        if (wantedTab === "raw" && currentUiMode() !== "advanced") pane.dataset.activeTab = "properties";
        inspectorTabs.forEach(function (t) {
            const b = tabButton(t[0], t[1], wantedTab === t[1]);
            b.addEventListener("click", function () { renderInspector(t[1]); });
            tabs.appendChild(b);
        });
        pane.appendChild(tabs);

        const body = document.createElement("div");
        body.className = "pmk135-inspector";
        pane.appendChild(body);

        const effectiveTab = (wantedTab === "raw" && currentUiMode() !== "advanced") ? "properties" : wantedTab;
        const node = findNode(selectedNodeId);
        if (effectiveTab !== "raw" && !node) {
            body.innerHTML = '<div class="pmk135-empty">Sélectionnez un bloc.</div>';
            return;
        }

        if (effectiveTab === "properties") renderPropertiesTab(body, node);
        else if (effectiveTab === "conditions") renderConditionsTab(body, node);
        else if (effectiveTab === "link") renderLinkTab(body, node);
        else if (effectiveTab === "style") renderStyleTab(body, node);
        else if (effectiveTab === "tooltip") renderTooltipTab(body, node);
        else renderRawTab(body);
    }

    function renderPropertiesTab(body, node) {
        const section = document.createElement("div");
        section.className = "pmk135-section";
        section.innerHTML = '<h4>Élément sélectionné</h4>';
        const info = document.createElement("div");
        info.innerHTML = '<strong>' + esc(recognitionTitle(node)) + '</strong><p class="pmk135-muted">' + esc(nodeSummary(node)) + '</p>';
        if (currentUiMode() === "advanced") info.insertAdjacentHTML("beforeend", '<p>Balise HTML : &lt;' + esc(node.localName) + '&gt;</p>');
        section.appendChild(info);
        const name = document.createElement("input"); name.className = "form-control form-control-sm";
        name.value = node.getAttribute("data-pmk-xslt-display-name") || ""; name.placeholder = recognitionTitle(node);
        name.addEventListener("input", function () { if (clean(name.value)) node.setAttribute("data-pmk-xslt-display-name", name.value); else node.removeAttribute("data-pmk-xslt-display-name"); saveWorking(); renderStructure(); });
        section.appendChild(makeField("Nom dans la liste des éléments", name, "Un repère pour vous : ce nom n’apparaît pas dans Koha."));
        const display = document.createElement("select");
        display.className = "form-control form-control-sm";
        display.innerHTML = '<option value="">Valeur du XSLT / CSS existant</option><option value="inline">En ligne</option><option value="inline-block">En ligne avec dimensions</option><option value="block">Bloc / nouvelle ligne</option><option value="none">Masqué</option>';
        display.value = getStyleValue(node, "display");
        display.addEventListener("change", function () { setStyleValue(node, "display", display.value); saveWorking(); renderWorkspace(); });
        section.appendChild(makeField("Disposition", display, "Permet de forcer l’affichage sur la même ligne ou en bloc sans modifier la structure XSLT."));

        const visualKind = node.getAttribute("data-pmk-xslt-kind") || "advanced";
        if (visualKind === "field") {
            const refs = directMarcRefs(node);
            if (refs.length === 1) {
                const fieldBox = document.createElement("div"); fieldBox.className = "pmk135-section"; fieldBox.style.marginTop = ".75rem"; fieldBox.innerHTML = "<h4>Donnée de la notice</h4>";
                const fg = document.createElement("div"); fg.className = "pmk135-grid2";
                const tagInput = document.createElement("input"); tagInput.className = "form-control form-control-sm"; tagInput.value = refs[0].tag;
                const subInput = document.createElement("input"); subInput.className = "form-control form-control-sm"; subInput.value = refs[0].subfield;
                function updateImportedField() {
                    const tag = clean(tagInput.value).replace(/[^0-9A-Za-z]/g, "");
                    const sub = clean(subInput.value).replace(/[^0-9A-Za-z]/g, "");
                    if (!tag) return;
                    refs[0].element.setAttribute("select", fieldXPath(tag, sub) + (refs[0].select && /\[1\]\s*$/.test(refs[0].select) ? "[1]" : ""));
                    recognizeVisualDocument(workingDoc); saveWorking(); renderStructure(); renderWorkspace();
                }
                tagInput.addEventListener("input", updateImportedField); subInput.addEventListener("input", updateImportedField);
                fg.appendChild(makeField("Zone", tagInput)); fg.appendChild(makeField("Sous-zone", subInput)); fieldBox.appendChild(fg);
                section.appendChild(fieldBox);
            }
        } else if (visualKind === "composite") {
            const refs = descendantMarcRefs(node);
            if (refs.length) {
                const compBox = document.createElement("div"); compBox.className = "pmk135-section"; compBox.style.marginTop = ".75rem"; compBox.innerHTML = "<h4>Zones du groupe de données détecté</h4>";
                refs.slice(0, 12).forEach(function (ref, index) {
                    const row = document.createElement("div"); row.className = "pmk135-grid2";
                    const tagInput = document.createElement("input"); tagInput.className="form-control form-control-sm"; tagInput.value=ref.tag;
                    const subInput = document.createElement("input"); subInput.className="form-control form-control-sm"; subInput.value=ref.subfield;
                    function updateRef() { const t=clean(tagInput.value).replace(/[^0-9A-Za-z]/g,""); const sf=clean(subInput.value).replace(/[^0-9A-Za-z]/g,""); if(!t)return; ref.element.setAttribute("select",fieldXPath(t,sf)+(ref.select&&/\[1\]\s*$/.test(ref.select)?"[1]":"")); recognizeVisualDocument(workingDoc); saveWorking(); renderStructure(); renderWorkspace(); }
                    tagInput.addEventListener("input",updateRef); subInput.addEventListener("input",updateRef);
                    row.appendChild(makeField("Zone " + (index+1),tagInput)); row.appendChild(makeField("Sous-zone",subInput)); compBox.appendChild(row);
                });
                const textNodes = Array.from(node.childNodes || []).filter(function (c) { return c.nodeType === 3; });
                if (textNodes.length) {
                    const sep = document.createElement("textarea"); sep.className="form-control"; sep.rows=3; sep.value=textNodes.map(function(c){return c.nodeValue||"";}).join("⟦séparation⟧");
                    sep.addEventListener("input",function(){ const vals=sep.value.split("⟦séparation⟧"); textNodes.forEach(function(c,i){ c.nodeValue=vals[i] != null ? vals[i] : c.nodeValue; }); saveWorking(); renderStructure(); renderWorkspace(); });
                    compBox.appendChild(makeField("Textes / séparateurs",sep,"Les textes directs du bloc sont séparés par ⟦séparation⟧ pour ne pas les fusionner."));
                }
                section.appendChild(compBox);
            }
        } else if (["text", "group", "group-label", "button", "link"].includes(visualKind)) {
            const textNodes = Array.from(node.childNodes || []).filter(function (c) { return c.nodeType === 3; });
            if (textNodes.length && descendantMarcRefs(node).length === 0) {
                const textBox=document.createElement("div"); textBox.className="pmk135-section"; textBox.style.marginTop=".75rem"; textBox.innerHTML="<h4>Texte détecté</h4>";
                const ta=document.createElement("textarea"); ta.className="form-control"; ta.rows=4; ta.value=textNodes.map(function(c){return c.nodeValue||"";}).join("");
                ta.addEventListener("input",function(){ textNodes[0].nodeValue=ta.value; textNodes.slice(1).forEach(function(c){c.remove();}); saveWorking(); renderStructure(); renderWorkspace(); });
                textBox.appendChild(ta); section.appendChild(textBox);
            }
        } else if (visualKind === "image" && node.localName === "img") {
            const imageBox=document.createElement("div"); imageBox.className="pmk135-section"; imageBox.style.marginTop=".75rem"; imageBox.innerHTML="<h4>Image détectée</h4>";
            const ig=document.createElement("div"); ig.className="pmk135-grid2";
            const src=document.createElement("input"); src.className="form-control form-control-sm"; src.value=node.getAttribute("src")||"";
            const alt=document.createElement("input"); alt.className="form-control form-control-sm"; alt.value=node.getAttribute("alt")||"";
            src.addEventListener("input",function(){ if(clean(src.value))node.setAttribute("src",src.value);else node.removeAttribute("src");saveWorking();renderWorkspace(); });
            alt.addEventListener("input",function(){ node.setAttribute("alt",alt.value);saveWorking(); });
            ig.appendChild(makeField("Source",src)); ig.appendChild(makeField("Texte alternatif",alt)); imageBox.appendChild(ig); section.appendChild(imageBox);
        }

        if (node.getAttribute("data-pmk-xslt-generic") === "custom-block") {
            const custom = document.createElement("div");
            custom.className = "pmk135-section";
            custom.style.marginTop = ".75rem";
            custom.innerHTML = "<h4>Contenu du bloc personnalisé</h4>";

            function directCustomRole(role) {
                return Array.from(node.children || []).find(function (child) {
                    return child.getAttribute && child.getAttribute("data-pmk-xslt-custom-role") === role;
                }) || null;
            }
            function templateFromNode(target) {
                if (!target) return "";
                let out = "";
                Array.from(target.childNodes || []).forEach(function (child) {
                    if (child.nodeType === 3) out += child.nodeValue || "";
                    else if (child.nodeType === 1 && child.namespaceURI === XSL_NS && child.localName === "value-of") {
                        const select = child.getAttribute("select") || "";
                        const m = select.match(/datafield\[@tag='([^']+)'\]\/marc:subfield\[@code='([^']+)'\]/);
                        if (m) out += "{" + m[1] + "$" + m[2] + "}";
                    }
                });
                return out;
            }
            function replaceTemplateContent(target, value) {
                if (!target) return;
                while (target.firstChild) target.removeChild(target.firstChild);
                appendTemplateTo(target, value || "");
            }

            let heading = directCustomRole("title");
            const content = directCustomRole("body");

            const titleEdit = document.createElement("input");
            titleEdit.className = "form-control form-control-sm";
            titleEdit.value = templateFromNode(heading);
            titleEdit.placeholder = "Titre facultatif";
            titleEdit.addEventListener("input", function () {
                const value = titleEdit.value;
                if (!heading && clean(value)) {
                    heading = workingDoc.createElement("h4");
                    heading.setAttribute("data-pmk-xslt-custom-role", "title");
                    node.insertBefore(heading, node.firstChild);
                }
                if (heading) {
                    if (clean(value)) replaceTemplateContent(heading, value);
                    else { heading.remove(); heading = null; }
                }
                annotate(workingDoc);
                saveWorking();
                renderStructure();
                renderWorkspace();
            });
            custom.appendChild(makeField("Titre", titleEdit, "Peut contenir des placeholders MARC comme {200$a}."));

            const textEdit = document.createElement("textarea");
            textEdit.className = "form-control";
            textEdit.rows = 7;
            textEdit.value = templateFromNode(content);
            textEdit.addEventListener("input", function () {
                replaceTemplateContent(content, textEdit.value);
                saveWorking();
                renderStructure();
                renderWorkspace();
            });
            custom.appendChild(makeField("Texte", textEdit, "Texte multiligne éditable. Les placeholders MARC sont autorisés."));
            section.appendChild(custom);
        }

        const actions = document.createElement("div");
        actions.className = "pmk135-toolbar";
        actions.style.marginTop = ".7rem";
        actions.appendChild(createButton("Dupliquer", "btn btn-sm btn-outline-secondary", function () {
            const cloneNode = node.cloneNode(true);
            Array.from(cloneNode.querySelectorAll("[data-pmk-xslt-node]")).concat([cloneNode]).forEach(function (el) {
                if (el.nodeType === 1) el.removeAttribute("data-pmk-xslt-node");
            });
            const unit = movableUnit(node);
            unit.parentNode.insertBefore(cloneNode, unit.nextSibling);
            annotate(workingDoc);
            selectedNodeId = cloneNode.getAttribute("data-pmk-xslt-node");
            saveWorking();
            renderAll();
        }, "fa fa-clone"));
        actions.appendChild(createButton("Supprimer", "btn btn-sm btn-outline-danger", function () {
            if (!window.confirm("Supprimer ce bloc du XSLT ?")) return;
            const wrapper = conditionWrapperFor(node);
            if (wrapper) wrapper.remove();
            else node.remove();
            selectedNodeId = getLiteralNodes()[0]?.getAttribute("data-pmk-xslt-node") || null;
            saveWorking();
            renderAll();
        }, "fa fa-trash"));
        section.appendChild(actions);
        body.appendChild(section);
    }

    function renderStyleTab(body, node) {
        const section = document.createElement("div");
        section.className = "pmk135-section";
        section.innerHTML = '<h4>Présentation visuelle</h4>';

        const cls = document.createElement("input");
        cls.type = "text"; cls.className = "form-control form-control-sm";
        cls.value = node.getAttribute("class") || "";
        cls.placeholder = "ex. pmk-auteur text-muted";
        cls.addEventListener("input", function () {
            const v = clean(cls.value); if (v) node.setAttribute("class", v); else node.removeAttribute("class");
            saveWorking(); renderStructure(); renderWorkspace();
        });
        section.appendChild(makeField("Classes CSS", cls, "Classes libres. Elles peuvent être ciblées ensuite dans IntranetUserCSS / OPACUserCSS."));

        const id = document.createElement("input");
        id.type = "text"; id.className = "form-control form-control-sm"; id.value = node.getAttribute("id") || "";
        id.addEventListener("input", function () { const v = clean(id.value); if (v) node.setAttribute("id", v); else node.removeAttribute("id"); saveWorking(); });
        section.appendChild(makeField("ID HTML", id));

        const grid = document.createElement("div"); grid.className = "pmk135-grid2";
        function styleInput(label, prop, placeholder, type) {
            const i = document.createElement("input"); i.className = "form-control form-control-sm"; i.type = type || "text"; i.value = getStyleValue(node, prop); i.placeholder = placeholder || "";
            i.addEventListener("input", function () { setStyleValue(node, prop, i.value); saveWorking(); renderWorkspace(); });
            grid.appendChild(makeField(label, i)); return i;
        }
        styleInput("Couleur du texte", "color", "#212529", "color");
        styleInput("Couleur de fond", "background-color", "#ffffff", "color");
        styleInput("Taille", "font-size", "16px");
        styleInput("Graisse", "font-weight", "400 / 600 / bold");
        styleInput("Marges", "margin", "0 .5rem");
        styleInput("Espacement interne", "padding", ".25rem .5rem");
        styleInput("Largeur", "width", "auto / 100% / 240px");
        styleInput("Rayon bordure", "border-radius", ".4rem");
        styleInput("Couleur bordure", "border-color", "#ced4da", "color");
        styleInput("Épaisseur bordure", "border-width", "1px");
        section.appendChild(grid);

        const borderStyle = document.createElement("select"); borderStyle.className = "form-control form-control-sm";
        borderStyle.innerHTML = '<option value="">Aucune / existante</option><option value="solid">Continue</option><option value="dashed">Tirets</option><option value="dotted">Pointillée</option><option value="double">Double</option>';
        borderStyle.value = getStyleValue(node, "border-style");
        borderStyle.addEventListener("change", function () { setStyleValue(node, "border-style", borderStyle.value); saveWorking(); renderWorkspace(); });
        section.appendChild(makeField("Style de bordure", borderStyle));

        const align = document.createElement("select"); align.className = "form-control form-control-sm";
        align.innerHTML = '<option value="">Par défaut</option><option value="left">Gauche</option><option value="center">Centré</option><option value="right">Droite</option><option value="justify">Justifié</option>';
        align.value = getStyleValue(node, "text-align");
        align.addEventListener("change", function () { setStyleValue(node, "text-align", align.value); saveWorking(); renderWorkspace(); });
        section.appendChild(makeField("Alignement", align));

        const buttons = document.createElement("div"); buttons.className = "pmk135-style-buttons";
        function toggleStyle(label, prop, onValue, offValue) {
            const b = createButton(label, "btn btn-sm btn-outline-secondary", function () {
                const active = getStyleValue(node, prop) === onValue;
                setStyleValue(node, prop, active ? (offValue || "") : onValue); saveWorking(); renderInspector("style"); renderWorkspace();
            });
            if (getStyleValue(node, prop) === onValue) b.classList.add("active"); buttons.appendChild(b);
        }
        toggleStyle("Gras", "font-weight", "bold");
        toggleStyle("Italique", "font-style", "italic");
        toggleStyle("Souligné", "text-decoration", "underline");
        toggleStyle("Barré", "text-decoration", "line-through");
        section.appendChild(makeField("Raccourcis", buttons));

        const responsive = document.createElement("input"); responsive.className = "form-control form-control-sm";
        responsive.value = node.getAttribute("data-pmk-xslt-responsive-class") || ""; responsive.placeholder = "ex. pmk-hide-mobile";
        responsive.addEventListener("input", function () {
            const old = node.getAttribute("data-pmk-xslt-responsive-class") || "";
            let classes = (node.getAttribute("class") || "").split(/\s+/).filter(Boolean).filter(function (c) { return c !== old; });
            const v = clean(responsive.value); if (v) classes.push(v);
            if (classes.length) node.setAttribute("class", Array.from(new Set(classes)).join(" ")); else node.removeAttribute("class");
            if (v) node.setAttribute("data-pmk-xslt-responsive-class", v); else node.removeAttribute("data-pmk-xslt-responsive-class");
            saveWorking(); renderStructure();
        });
        section.appendChild(makeField("Classe responsive / hover", responsive, "Pour les règles dépendant de la taille d’écran ou du :hover, utilise une classe définie dans le CSS Koha."));

        const icon = getIconMeta(node);
        const iconGrid = document.createElement("div"); iconGrid.className = "pmk135-grid2";
        const iconType = document.createElement("select"); iconType.className = "form-control form-control-sm"; iconType.innerHTML = '<option value="none">Aucune</option><option value="fa">Font Awesome</option><option value="image">Image</option>'; iconType.value = icon.type || "none";
        const iconValue = document.createElement("input"); iconValue.className = "form-control form-control-sm"; iconValue.value = icon.value || ""; iconValue.placeholder = "fa fa-book ou URL image";
        const iconPos = document.createElement("select"); iconPos.className = "form-control form-control-sm"; iconPos.innerHTML = '<option value="before">Avant</option><option value="after">Après</option>'; iconPos.value = icon.position || "before";
        const iconSize = document.createElement("input"); iconSize.className = "form-control form-control-sm"; iconSize.type = "number"; iconSize.min = "8"; iconSize.max = "96"; iconSize.value = icon.size || ""; iconSize.placeholder = "16";
        function updateIcon() { applyIcon(node, { type: iconType.value, value: iconValue.value, position: iconPos.value, size: iconSize.value }); saveWorking(); renderWorkspace(); }
        [iconType,iconValue,iconPos,iconSize].forEach(function (c) { c.addEventListener(c.tagName === "SELECT" ? "change" : "input", updateIcon); });
        iconGrid.appendChild(makeField("Icône", iconType)); iconGrid.appendChild(makeField("Classe / URL", iconValue)); iconGrid.appendChild(makeField("Position", iconPos)); iconGrid.appendChild(makeField("Taille px", iconSize));
        section.appendChild(iconGrid);
        body.appendChild(section);
    }

    function renderTooltipTab(body, node) {
        const section = document.createElement("div");
        section.className = "pmk135-section";
        section.innerHTML = '<h4>Infobulle et accessibilité</h4>';

        const text = document.createElement("textarea"); text.className = "form-control form-control-sm"; text.rows = 3;
        text.value = node.getAttribute("title") || ""; text.placeholder = "Texte affiché au survol…";
        text.addEventListener("input", function () { const v = clean(text.value); if (v) node.setAttribute("title", v); else node.removeAttribute("title"); saveWorking(); renderStructure(); renderWorkspace(); });
        section.appendChild(makeField("Texte de l’infobulle", text, "Utilise title : fonctionne sans bibliothèque JavaScript supplémentaire."));

        const aria = document.createElement("input"); aria.type = "text"; aria.className = "form-control form-control-sm"; aria.value = node.getAttribute("aria-label") || ""; aria.placeholder = "Libellé accessible";
        aria.addEventListener("input", function () { const v = clean(aria.value); if (v) node.setAttribute("aria-label", v); else node.removeAttribute("aria-label"); saveWorking(); });
        section.appendChild(makeField("aria-label", aria));

        const position = document.createElement("select"); position.className = "form-control form-control-sm";
        position.innerHTML = '<option value="auto">Automatique</option><option value="top">Haut</option><option value="right">Droite</option><option value="bottom">Bas</option><option value="left">Gauche</option>';
        position.value = node.getAttribute("data-pmk-xslt-tooltip-position") || "auto";
        position.addEventListener("change", function () { node.setAttribute("data-pmk-xslt-tooltip-position", position.value); saveWorking(); });
        section.appendChild(makeField("Position souhaitée", position, "Mémorisée pour un futur moteur d’infobulles PMK ; title natif reste le repli universel."));

        const tipClass = document.createElement("input"); tipClass.type = "text"; tipClass.className = "form-control form-control-sm"; tipClass.value = node.getAttribute("data-tooltip-class") || ""; tipClass.placeholder = "ex. pmk-tooltip-important";
        tipClass.addEventListener("input", function () { const v = clean(tipClass.value); if (v) node.setAttribute("data-tooltip-class", v); else node.removeAttribute("data-tooltip-class"); saveWorking(); });
        section.appendChild(makeField("Classe d’infobulle avancée", tipClass, "Cette classe reste dans le HTML exporté et peut recevoir ton propre rendu CSS/JS."));
        body.appendChild(section);
    }

    function conditionEditorRow(meta, index, rerender) {
        const rule = meta.rules[index];
        const row = document.createElement("div");
        row.className = "pmk135-condition-row";

        const source = document.createElement("select");
        source.className = "form-control form-control-sm";
        source.innerHTML = '<option value="marc">Champ MARC</option>' + ((currentUiMode() === "advanced" || rule.source === "xpath") ? '<option value="xpath">XPath avancé</option>' : '');
        source.value = rule.source || "marc";
        source.addEventListener("change", function () { rule.source = source.value; rerender(); });
        row.appendChild(source);

        const tag = document.createElement("input");
        tag.className = "form-control form-control-sm";
        tag.placeholder = "200";
        tag.value = rule.tag || "";
        tag.title = "Zone MARC";
        tag.disabled = source.value === "xpath";
        tag.addEventListener("input", function () { rule.tag = tag.value; saveConditionDraft(meta); });
        row.appendChild(tag);

        const sub = document.createElement("input");
        sub.className = "form-control form-control-sm";
        sub.placeholder = "a";
        sub.value = rule.subfield || "";
        sub.title = "Sous-zone";
        sub.disabled = source.value === "xpath";
        sub.addEventListener("input", function () { rule.subfield = sub.value; saveConditionDraft(meta); });
        row.appendChild(sub);

        const operator = document.createElement("select");
        operator.className = "form-control form-control-sm";
        const operatorOptions = [
            ["not-empty", "n’est pas vide"],
            ["empty", "est vide"],
            ["exists", "existe"],
            ["equals", "est égal à"],
            ["not-equals", "est différent de"],
            ["contains", "contient"],
            ["starts-with", "commence par"]
        ];
        if (currentUiMode() === "advanced" || rule.operator === "custom") operatorOptions.push(["custom", "XPath personnalisé"]);
        operator.innerHTML = operatorOptions.map(function (x) { return '<option value="' + x[0] + '">' + x[1] + '</option>'; }).join("");
        operator.value = rule.operator || "not-empty";
        operator.addEventListener("change", function () { rule.operator = operator.value; rerender(); });
        row.appendChild(operator);

        const second = document.createElement("div");
        second.style.gridColumn = "1 / -1";
        second.className = "pmk135-grid2";

        if (source.value === "xpath") {
            const xp = document.createElement("input");
            xp.className = "form-control form-control-sm";
            xp.placeholder = "normalize-space(marc:datafield[@tag='200']/marc:subfield[@code='a']) != ''";
            xp.value = rule.xpath || "";
            xp.addEventListener("input", function () { rule.xpath = xp.value; saveConditionDraft(meta); });
            second.appendChild(makeField("XPath", xp));
        }
        if (["equals", "not-equals", "contains", "starts-with"].includes(operator.value)) {
            const value = document.createElement("input");
            value.className = "form-control form-control-sm";
            value.placeholder = "Valeur";
            value.value = rule.value || "";
            value.addEventListener("input", function () { rule.value = value.value; saveConditionDraft(meta); });
            second.appendChild(makeField("Valeur", value));
        }
        row.appendChild(second);

        const remove = createButton("Retirer", "btn btn-sm btn-outline-danger pmk135-remove-cond", function () {
            meta.rules.splice(index, 1);
            rerender();
        }, "fa fa-times");
        remove.style.gridColumn = "1 / -1";
        row.appendChild(remove);
        return row;
    }

    function saveConditionDraft(meta) {
        const node = findNode(selectedNodeId);
        if (!node) return;
        applyCondition(node, meta);
        saveWorking();
        renderStructure();
        renderWorkspace();
    }

    function renderConditionsTab(body, node) {
        const meta = getConditionMeta(node);
        if (!Array.isArray(meta.rules)) meta.rules = [];

        const section = document.createElement("div");
        section.className = "pmk135-section";
        section.innerHTML = '<h4>Affichage conditionnel</h4>';

        const enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.checked = !!meta.enabled;
        const enabledWrap = document.createElement("label");
        enabledWrap.style.display = "flex";
        enabledWrap.style.gap = ".45rem";
        enabledWrap.style.alignItems = "center";
        enabledWrap.appendChild(enabled);
        enabledWrap.appendChild(document.createTextNode("Afficher ce bloc seulement si les conditions sont vraies"));
        section.appendChild(enabledWrap);

        const join = document.createElement("select");
        join.className = "form-control form-control-sm";
        join.innerHTML = '<option value="and">Toutes les conditions (ET)</option><option value="or">Au moins une condition (OU)</option>';
        join.value = meta.join || "and";
        section.appendChild(makeField("Combinaison", join));

        const list = document.createElement("div");
        section.appendChild(list);

        function rerenderRows() {
            meta.enabled = enabled.checked;
            meta.join = join.value;
            list.innerHTML = "";
            if (!meta.rules.length) {
                const empty = document.createElement("div");
                empty.className = "pmk135-muted";
                empty.textContent = "Aucune condition. Exemple conseillé : 200$a n’est pas vide.";
                list.appendChild(empty);
            }
            meta.rules.forEach(function (_, index) {
                list.appendChild(conditionEditorRow(meta, index, rerenderRows));
            });
            applyCondition(node, meta);
            saveWorking();
            renderStructure();
            renderWorkspace();
        }

        enabled.addEventListener("change", rerenderRows);
        join.addEventListener("change", rerenderRows);
        section.appendChild(createButton("Ajouter une condition", "btn btn-sm btn-outline-primary", function () {
            meta.rules.push({ source: "marc", tag: "200", subfield: "a", operator: "not-empty", value: "", xpath: "" });
            meta.enabled = true;
            enabled.checked = true;
            rerenderRows();
        }, "fa fa-plus"));

        const explanation = document.createElement("div");
        explanation.className = "alert alert-light";
        explanation.style.marginTop = ".7rem";
        explanation.innerHTML = '<strong>Libellé vide :</strong> la condition entoure le bloc complet. Si le bloc contient par exemple « Auteur : » + la valeur MARC, ni le libellé ni l’espace ne seront affichés lorsque le champ est vide.';
        section.appendChild(explanation);

        body.appendChild(section);
        rerenderRows();
    }

    function renderLinkTab(body, node) {
        const meta = getLinkMeta(node);
        const section = document.createElement("div");
        section.className = "pmk135-section";
        section.innerHTML = '<h4>Lien du bloc / segment</h4>';

        const enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.checked = !!meta.enabled;
        const enabledLabel = document.createElement("label");
        enabledLabel.className = "pmk135-toggle-line";
        enabledLabel.appendChild(enabled);
        enabledLabel.appendChild(document.createTextNode("Rendre ce bloc ou segment cliquable"));
        section.appendChild(enabledLabel);

        const mode = document.createElement("select");
        mode.className = "form-control form-control-sm";
        mode.innerHTML = '<option value="koha">Recherche catalogue Koha</option><option value="external">URL externe dynamique</option><option value="fixed">URL fixe</option>';
        mode.value = meta.mode || "koha";
        section.appendChild(makeField("Type de lien", mode));

        const dynamic = document.createElement("div");
        section.appendChild(dynamic);

        function renderDynamic() {
            dynamic.innerHTML = "";
            if (mode.value === "koha") {
                const g = document.createElement("div"); g.className = "pmk135-grid2";
                const index = document.createElement("input"); index.className = "form-control form-control-sm"; index.value = meta.index || "kw"; index.setAttribute("list", "pmk135-koha-indexes"); index.placeholder = "kw, au, ti, su, se…";
                const dl = document.createElement("datalist"); dl.id = "pmk135-koha-indexes"; ["kw","ti","au","su","se","nb","bc","callnum","pb","yr","itype","branch"].forEach(function (v) { const o=document.createElement("option");o.value=v;dl.appendChild(o); });
                const qtype = document.createElement("select"); qtype.className = "form-control form-control-sm"; qtype.innerHTML = '<option value="contains">Recherche normale</option><option value="exact">Expression exacte</option><option value="starts">Commence par</option><option value="custom">Syntaxe personnalisée</option>'; qtype.value = meta.queryType || "contains";
                const tpl = document.createElement("input"); tpl.className = "form-control form-control-sm"; tpl.value = meta.valueTemplate || "{200$a}"; tpl.placeholder = "{700$a} ou {225$a} {225$v}";
                g.appendChild(makeField("Index Koha", index, "Liste proposée + saisie libre : tout index accepté."));
                g.appendChild(makeField("Type de recherche", qtype));
                dynamic.appendChild(g); dynamic.appendChild(makeField("Valeur / requête", tpl, "Utilise des placeholders MARC : {700$a}, {225$a}, etc. Plusieurs zones peuvent être combinées.")); dynamic.appendChild(dl);
                const base = document.createElement("input"); base.className = "form-control form-control-sm"; base.value = meta.searchBase || "/cgi-bin/koha/catalogue/search.pl";
                dynamic.appendChild(makeField("Chemin de recherche", base, "Modifiable pour rester compatible avec des routes Koha spécifiques."));
                if (qtype.value === "custom") {
                    const cg = document.createElement("div"); cg.className = "pmk135-grid2";
                    const pre = document.createElement("input"); pre.className = "form-control form-control-sm"; pre.value = meta.queryPrefix || ""; pre.placeholder = "préfixe";
                    const suf = document.createElement("input"); suf.className = "form-control form-control-sm"; suf.value = meta.querySuffix || ""; suf.placeholder = "suffixe";
                    pre.addEventListener("input", function () { meta.queryPrefix = pre.value; save(); }); suf.addEventListener("input", function () { meta.querySuffix = suf.value; save(); });
                    cg.appendChild(makeField("Préfixe de requête", pre)); cg.appendChild(makeField("Suffixe de requête", suf)); dynamic.appendChild(cg);
                }
                index.addEventListener("input", function () { meta.index = index.value; save(); });
                qtype.addEventListener("change", function () { meta.queryType = qtype.value; renderDynamic(); save(); });
                tpl.addEventListener("input", function () { meta.valueTemplate = tpl.value; save(); });
                base.addEventListener("input", function () { meta.searchBase = base.value; save(); });
            } else if (mode.value === "external") {
                const tpl = document.createElement("input"); tpl.className = "form-control form-control-sm"; tpl.value = meta.externalTemplate || "https://example.org/?q={200$a}"; tpl.placeholder = "https://service.example/?isbn={010$a}";
                dynamic.appendChild(makeField("Modèle d’URL", tpl, "Les placeholders {zone$sous-zone} sont remplacés par la valeur de la notice."));
                tpl.addEventListener("input", function () { meta.externalTemplate = tpl.value; save(); });
            } else {
                const fixed = document.createElement("input"); fixed.className = "form-control form-control-sm"; fixed.value = meta.fixedUrl || ""; fixed.placeholder = "https://…";
                dynamic.appendChild(makeField("URL fixe", fixed));
                fixed.addEventListener("input", function () { meta.fixedUrl = fixed.value; save(); });
            }

            const target = document.createElement("select"); target.className = "form-control form-control-sm"; target.innerHTML = '<option value="same">Même onglet</option><option value="new">Nouvel onglet</option>'; target.value = meta.target || "same";
            const missing = document.createElement("select"); missing.className = "form-control form-control-sm"; missing.innerHTML = '<option value="plain">Si donnée absente : garder le texte non cliquable</option><option value="hide">Si donnée absente : masquer le contenu lié</option>'; missing.value = meta.missingBehavior || "plain";
            dynamic.appendChild(makeField("Ouverture", target)); dynamic.appendChild(makeField("Donnée manquante", missing));
            const extraCondition = document.createElement("input"); extraCondition.className = "form-control form-control-sm"; extraCondition.value = meta.conditionXPath || ""; extraCondition.placeholder = "XPath optionnel, ex. marc:datafield[@tag='099']/marc:subfield[@code='a']";
            dynamic.appendChild(makeField("Condition supplémentaire du lien", extraCondition, "Le lien n’est créé que si les données dynamiques et cette condition XPath sont vraies."));
            target.addEventListener("change", function () { meta.target = target.value; save(); });
            missing.addEventListener("change", function () { meta.missingBehavior = missing.value; save(); });
            extraCondition.addEventListener("input", function () { meta.conditionXPath = extraCondition.value; save(); });

            const ex = document.createElement("div"); ex.className = "pmk135-link-example"; ex.textContent = "Sortie : " + buildHrefTemplate(meta); dynamic.appendChild(ex);
        }

        function save() {
            meta.enabled = enabled.checked;
            meta.mode = mode.value;
            applyLink(node, meta);
            saveWorking();
            renderStructure();
            renderWorkspace();
        }
        enabled.addEventListener("change", save);
        mode.addEventListener("change", function () { meta.mode = mode.value; renderDynamic(); save(); });
        renderDynamic();

        const help = document.createElement("div"); help.className = "alert alert-light"; help.style.marginTop = ".65rem";
        help.innerHTML = '<strong>Exemples :</strong> <code>{700$a}</code> vers l’index auteur, <code>{225$a}</code> vers l’index collection, ou <code>https://…?isbn={010$a}</code> vers un service externe.';
        section.appendChild(help);
        body.appendChild(section);
    }

    function renderRawTab(body) {
        const section = document.createElement("div");
        section.className = "pmk135-section";
        section.innerHTML = '<h4>XSLT complet</h4>';
        const ta = document.createElement("textarea");
        ta.className = "form-control pmk135-code";
        ta.spellcheck = false;
        ta.value = serializeDoc(workingDoc, true);
        section.appendChild(ta);
        const tools = document.createElement("div");
        tools.className = "pmk135-toolbar";
        tools.style.marginTop = ".6rem";
        tools.appendChild(createButton("Appliquer le code brut", "btn btn-sm btn-outline-danger", function () {
            try {
                setWorkingXml(ta.value, false);
                toast("Code brut appliqué.", "success");
            } catch (e) {
                toast(e.message, "danger");
            }
        }, "fa fa-code"));
        tools.appendChild(createButton("Copier", "btn btn-sm btn-primary", copyOutput, "fa fa-copy"));
        section.appendChild(tools);
        body.appendChild(section);
    }

    function dialog(title, bodyNode, actions) {
        const backdrop = document.createElement("div");
        backdrop.className = "pmk135-dialog-backdrop";
        const box = document.createElement("div");
        box.className = "pmk135-dialog";
        const head = document.createElement("div");
        head.className = "pmk135-dialog-head";
        head.innerHTML = "<strong>" + esc(title) + "</strong>";
        head.appendChild(createButton("Fermer", "btn btn-sm btn-outline-secondary", function () { backdrop.remove(); }, "fa fa-times"));
        box.appendChild(head);
        const body = document.createElement("div");
        body.className = "pmk135-dialog-body";
        body.appendChild(bodyNode);
        box.appendChild(body);
        const foot = document.createElement("div");
        foot.className = "pmk135-dialog-foot";
        actions.forEach(function (a) {
            foot.appendChild(createButton(a.label, a.className, function () { a.run(backdrop); }, a.icon));
        });
        box.appendChild(foot);
        backdrop.appendChild(box);
        document.body.appendChild(backdrop);
        return backdrop;
    }

    function openPasteDialog() {
        const projectId = currentProject && currentProject.id;
        const epoch = projectEpoch;
        const wrap = document.createElement("div");
        wrap.innerHTML = '<p>Ouvrez un fichier XSLT ou collez le code complet ci-dessous.</p>';
        const file = document.createElement("input");
        file.type = "file"; file.className = "form-control";
        file.accept = ".xsl,.xslt,.xml,.txt,application/xml,text/xml,text/plain";
        wrap.appendChild(makeField("Choisir mon fichier XSLT", file));
        const ta = document.createElement("textarea");
        ta.className = "form-control pmk135-code"; ta.rows = 16; ta.spellcheck = false;
        ta.placeholder = "Collez ici le XSLT complet, de <?xml… jusqu’à </xsl:stylesheet>.";
        wrap.appendChild(makeField("Ou coller mon XSLT", ta));
        const status = document.createElement("p"); status.className = "pmk135-muted"; wrap.appendChild(status);
        let filename = "", readNo = 0, reading = false;
        function belongsToProject() { return currentProject && currentProject.id === projectId && projectEpoch === epoch; }
        file.addEventListener("change", async function () {
            const chosen = file.files && file.files[0]; if (!chosen) return;
            const request = ++readNo; reading = true; status.textContent = "Lecture du fichier…";
            try {
                const xml = await readLocalXsltFile(chosen);
                if (request !== readNo || !belongsToProject() || !wrap.isConnected) return;
                ta.value = xml; filename = chosen.name; status.textContent = chosen.name + " — prêt à ouvrir";
            } catch (e) { if (request === readNo && wrap.isConnected) status.textContent = e.message; }
            finally { if (request === readNo) reading = false; }
        });
        ta.addEventListener("input", function () { readNo += 1; reading = false; filename = ""; status.textContent = "Contenu collé ou modifié"; });
        dialog("Importer mon XSLT", wrap, [
            { label: "Annuler", className: "btn btn-outline-secondary", run: function (box) { readNo += 1; box.remove(); } },
            { label: "Ouvrir dans l’éditeur", className: "btn btn-primary", icon: "fa fa-arrow-right", run: function (box) {
                if (!belongsToProject()) return toast("Le document courant a changé. Rouvrez l’import.", "warning");
                if (reading) return toast("Le fichier est encore en cours de lecture.", "info");
                try {
                    const doc = parseXml(ta.value); const root = doc.documentElement;
                    if (root.namespaceURI !== XSL_NS || !["stylesheet", "transform"].includes(root.localName)) throw new Error("Collez une feuille XSLT complète : la racine doit être xsl:stylesheet ou xsl:transform.");
                    if (workingDoc && !window.confirm("Remplacer le XSLT actuellement ouvert par ce contenu ?")) return;
                    currentProject.sourceUrl = ""; currentProject.importedFilename = filename;
                    currentProject.name = filename || "XSLT collé";
                    projectHistories.delete(currentProject.id);
                    setWorkingXml(ta.value, true);
                    box.remove(); toast("XSLT ouvert. Choisissez une notice pour l’aperçu.", "success");
                } catch (e) { status.textContent = e.message; toast(e.message, "danger"); }
            } }
        ]);
        ta.focus();
    }

    function canSafelyContainAddedBlocks(node) {
        if (!node || node.namespaceURI === XSL_NS) return false;
        return ["div", "section", "article", "aside", "main", "nav", "header", "footer", "li", "ul", "ol", "td", "th", "dd", "dt"].includes(String(node.localName || "").toLowerCase());
    }

    function createInsertionChooser() {
        const selected = findNode(selectedNodeId) || getLiteralNodes()[0] || null;
        if (!selected) return null;
        const select = document.createElement("select");
        select.className = "form-control form-control-sm";
        select.innerHTML = '<option value="after">Après le bloc sélectionné</option><option value="before">Avant le bloc sélectionné</option>' +
            (canSafelyContainAddedBlocks(selected) ? '<option value="inside">À l’intérieur du bloc sélectionné</option>' : '');
        const field = makeField("Emplacement", select, "Par défaut, le nouveau bloc est ajouté après le bloc sélectionné. L’ajout à l’intérieur n’est proposé que pour les conteneurs adaptés.");
        return { selected: selected, select: select, field: field };
    }

    function insertNewNodeAtSelection(node, chooser) {
        if (!node || !chooser || !chooser.selected) throw new Error("Aucun emplacement d’insertion valide.");
        const selected = chooser.selected;
        const mode = chooser.select.value || "after";
        if (mode === "inside") {
            if (!canSafelyContainAddedBlocks(selected)) throw new Error("Ce bloc ne peut pas recevoir de nouvel élément à l’intérieur.");
            selected.appendChild(node);
            return;
        }
        const unit = movableUnit(selected);
        if (!unit || !unit.parentNode) throw new Error("Impossible de déterminer le parent du bloc sélectionné.");
        unit.parentNode.insertBefore(node, mode === "before" ? unit : unit.nextSibling);
    }

    function openAddFieldDialog() {
        if (!workingDoc) return;
        const insertion = createInsertionChooser();
        if (!insertion) return toast("Sélectionnez un bloc près duquel ajouter le champ.", "info");

        const wrap = document.createElement("div");
        wrap.appendChild(insertion.field);
        const grid = document.createElement("div");
        grid.className = "pmk135-grid2";
        wrap.appendChild(grid);

        function input(value, placeholder) {
            const i = document.createElement("input");
            i.className = "form-control form-control-sm";
            i.value = value || "";
            i.placeholder = placeholder || "";
            return i;
        }

        const tag = input("200", "200");
        const sub = input("a", "a");
        const label = input("", "ex. Titre :");
        const cls = input("", "ex. pmk-zone-titre");
        const tooltip = input("", "Texte d’aide au survol");
        const separator = input(" ; ", " ; ");
        const wrapperTag = document.createElement("select");
        wrapperTag.className = "form-control form-control-sm";
        wrapperTag.innerHTML = '<option value="span">Sur la même ligne</option><option value="div">Sur une nouvelle ligne</option><option value="li">Élément de liste</option><option value="p">Paragraphe</option>';
        const repeat = document.createElement("select");
        repeat.className = "form-control form-control-sm";
        repeat.innerHTML = '<option value="first">Première valeur</option><option value="all">Toutes les valeurs</option>';
        const hideEmpty = document.createElement("input");
        hideEmpty.type = "checkbox";
        hideEmpty.checked = true;

        grid.appendChild(makeField("Zone MARC", tag));
        grid.appendChild(makeField("Sous-zone", sub));
        grid.appendChild(makeField("Libellé", label));
        grid.appendChild(makeField("Classe CSS", cls));
        grid.appendChild(makeField("Balise HTML", wrapperTag));
        grid.appendChild(makeField("Répétitions", repeat));
        grid.appendChild(makeField("Séparateur", separator));
        grid.appendChild(makeField("Infobulle", tooltip));
        const c = document.createElement("label");
        c.style.display = "flex";
        c.style.alignItems = "center";
        c.style.gap = ".45rem";
        c.appendChild(hideEmpty);
        c.appendChild(document.createTextNode("Ne pas afficher le bloc ni son libellé si la zone est vide"));
        wrap.appendChild(c);

        dialog("Ajouter une donnée de la notice", wrap, [
            { label: "Annuler", className: "btn btn-sm btn-outline-secondary", icon: "fa fa-times", run: function (d) { d.remove(); } },
            { label: "Ajouter", className: "btn btn-sm btn-primary", icon: "fa fa-plus", run: function (d) {
                try {
                    const path = fieldXPath(tag.value, sub.value);
                    if (!path) throw new Error("La zone MARC est obligatoire.");
                    const el = workingDoc.createElement(wrapperTag.value || "span");
                    if (clean(cls.value)) el.setAttribute("class", clean(cls.value));
                    if (clean(tooltip.value)) el.setAttribute("title", clean(tooltip.value));
                    el.setAttribute("data-pmk-xslt-node", uid("node"));
                    if (label.value) el.appendChild(workingDoc.createTextNode(label.value));

                    if (repeat.value === "all") {
                        const each = workingDoc.createElementNS(XSL_NS, "xsl:for-each");
                        each.setAttribute("select", path);
                        const val = workingDoc.createElementNS(XSL_NS, "xsl:value-of");
                        val.setAttribute("select", ".");
                        each.appendChild(val);
                        const ifMore = workingDoc.createElementNS(XSL_NS, "xsl:if");
                        ifMore.setAttribute("test", "position() != last()");
                        ifMore.appendChild(workingDoc.createTextNode(separator.value || " ; "));
                        each.appendChild(ifMore);
                        el.appendChild(each);
                    } else {
                        const val = workingDoc.createElementNS(XSL_NS, "xsl:value-of");
                        val.setAttribute("select", path + "[1]");
                        el.appendChild(val);
                    }
                    insertNewNodeAtSelection(el, insertion);
                    if (hideEmpty.checked) {
                        applyCondition(el, {
                            enabled: true,
                            join: "and",
                            rules: [{ source: "marc", tag: clean(tag.value), subfield: clean(sub.value), operator: "not-empty", value: "", xpath: "" }]
                        });
                    }
                    annotate(workingDoc);
                    selectedNodeId = el.getAttribute("data-pmk-xslt-node");
                    saveWorking();
                    d.remove();
                    renderAll();
                    toast("Bloc MARC ajouté.", "success");
                } catch (e) { toast(e.message, "danger"); }
            } }
        ]);
    }

    function setTemplateAttribute(node, name, template) {
        if (!node || !name) return;
        const value = String(template || "");
        node.removeAttribute(name);
        Array.from(node.childNodes || []).forEach(function (child) {
            if (child.nodeType === 1 && child.namespaceURI === XSL_NS && child.localName === "attribute" && child.getAttribute("data-pmk-xslt-generic-attr") === name) child.remove();
        });
        if (!/\{[0-9A-Za-z]{3}\$[0-9A-Za-z]\}/.test(value)) {
            if (clean(value)) node.setAttribute(name, value);
            return;
        }
        const attr = workingDoc.createElementNS(XSL_NS, "xsl:attribute");
        attr.setAttribute("name", name);
        attr.setAttribute("data-pmk-xslt-generic-attr", name);
        appendTemplateTo(attr, value);
        node.insertBefore(attr, node.firstChild);
    }

    function openCustomBlockDialog() {
        if (!workingDoc) return;
        const insertion = createInsertionChooser();
        if (!insertion) return toast("Sélectionnez un bloc près duquel ajouter le nouveau bloc.", "info");

        const wrap = document.createElement("div");
        wrap.appendChild(insertion.field);
        const intro = document.createElement("div");
        intro.className = "alert alert-light";
        intro.innerHTML = '<strong>Encadré avec titre et texte.</strong> Créez un encadré ou une zone éditoriale indépendante de la notice, avec un titre facultatif et du texte multiligne. Les placeholders MARC comme <code>{200$a}</code> restent possibles si vous souhaitez mêler texte fixe et donnée dynamique.';
        wrap.appendChild(intro);

        function input(value, placeholder) {
            const i = document.createElement("input");
            i.className = "form-control form-control-sm";
            i.value = value || "";
            i.placeholder = placeholder || "";
            return i;
        }

        const grid = document.createElement("div");
        grid.className = "pmk135-grid2";
        const titleInput = input("", "ex. À savoir");
        const wrapper = document.createElement("select");
        wrapper.className = "form-control form-control-sm";
        wrapper.innerHTML = '<option value="div">div</option><option value="section">section</option><option value="aside">aside</option>';
        const titleTag = document.createElement("select");
        titleTag.className = "form-control form-control-sm";
        titleTag.innerHTML = '<option value="h3">h3</option><option value="h4" selected>h4</option><option value="h5">h5</option><option value="strong">strong</option><option value="div">div</option>';
        const bodyTag = document.createElement("select");
        bodyTag.className = "form-control form-control-sm";
        bodyTag.innerHTML = '<option value="div">div</option><option value="p">p</option>';
        const cls = input("pmk-xslt-custom-block", "classe CSS du bloc");
        const htmlId = input("", "id HTML optionnel");
        const tooltip = input("", "infobulle du bloc");

        grid.appendChild(makeField("Titre facultatif", titleInput));
        grid.appendChild(makeField("Balise HTML (technique)", wrapper));
        grid.appendChild(makeField("Balise du titre", titleTag));
        grid.appendChild(makeField("Balise du texte", bodyTag));
        grid.appendChild(makeField("Classe CSS", cls));
        grid.appendChild(makeField("ID HTML", htmlId));
        grid.appendChild(makeField("Infobulle", tooltip));
        wrap.appendChild(grid);

        const bodyText = document.createElement("textarea");
        bodyText.className = "form-control";
        bodyText.rows = 7;
        bodyText.placeholder = "Saisissez ici le texte du bloc.\nLes retours à la ligne seront conservés.\nVous pouvez aussi utiliser {200$a}, {700$a}, etc.";
        wrap.appendChild(makeField("Texte du bloc", bodyText, "Texte fixe ou mixte avec placeholders MARC. Les retours à la ligne sont conservés."));

        const preserveLines = document.createElement("input");
        preserveLines.type = "checkbox";
        preserveLines.checked = true;
        const preserveLabel = document.createElement("label");
        preserveLabel.className = "pmk135-toggle-line";
        preserveLabel.appendChild(preserveLines);
        preserveLabel.appendChild(document.createTextNode("Conserver les retours à la ligne du texte"));
        wrap.appendChild(preserveLabel);

        dialog("Ajouter un bloc personnalisé", wrap, [
            { label: "Annuler", className: "btn btn-sm btn-outline-secondary", icon: "fa fa-times", run: function (d) { d.remove(); } },
            { label: "Ajouter le bloc", className: "btn btn-sm btn-primary", icon: "fa fa-plus", run: function (d) {
                try {
                    const block = workingDoc.createElement(wrapper.value || "div");
                    block.setAttribute("data-pmk-xslt-node", uid("node"));
                    block.setAttribute("data-pmk-xslt-generic", "custom-block");
                    block.setAttribute("data-pmk-xslt-custom-block", "1");
                    if (clean(cls.value)) block.setAttribute("class", clean(cls.value));
                    if (clean(htmlId.value)) block.setAttribute("id", clean(htmlId.value));
                    if (clean(tooltip.value)) block.setAttribute("title", clean(tooltip.value));

                    if (clean(titleInput.value)) {
                        const heading = workingDoc.createElement(titleTag.value || "h4");
                        heading.setAttribute("data-pmk-xslt-custom-role", "title");
                        appendTemplateTo(heading, titleInput.value);
                        block.appendChild(heading);
                    }

                    const content = workingDoc.createElement(bodyTag.value || "div");
                    content.setAttribute("data-pmk-xslt-custom-role", "body");
                    appendTemplateTo(content, bodyText.value || "");
                    if (preserveLines.checked) setStyleValue(content, "white-space", "pre-line");
                    block.appendChild(content);

                    insertNewNodeAtSelection(block, insertion);
                    annotate(workingDoc);
                    selectedNodeId = block.getAttribute("data-pmk-xslt-node");
                    saveWorking();
                    d.remove();
                    renderAll();
                    toast("Encadré de texte ajouté.", "success");
                } catch (e) {
                    toast(e.message, "danger");
                }
            } }
        ]);
    }

    function openGenericElementDialog() {
        if (!workingDoc) return;
        const insertion = createInsertionChooser();
        if (!insertion) return toast("Sélectionnez un bloc près duquel ajouter l’élément.", "info");

        const wrap = document.createElement("div");
        wrap.appendChild(insertion.field);
        const intro = document.createElement("div");
        intro.className = "alert alert-light";
        intro.innerHTML = '<strong>Éléments sans données de notice.</strong> Ajoutez des titres de groupe, textes, images, icônes, boutons, séparateurs, espacements ou conteneurs. Ils restent ensuite configurables dans les onglets Au clic, Mise en forme, Texte au survol et Quand l’afficher.';
        wrap.appendChild(intro);

        const grid = document.createElement("div"); grid.className = "pmk135-grid2"; wrap.appendChild(grid);
        function input(value, placeholder) { const i=document.createElement("input"); i.className="form-control form-control-sm"; i.value=value||""; i.placeholder=placeholder||""; return i; }

        const type=document.createElement("select"); type.className="form-control form-control-sm";
        type.innerHTML='<option value="custom-block">Encadré avec titre et texte</option><option value="group-label">Titre de section</option><option value="text">Texte libre</option><option value="image">Image</option><option value="icon">Icône Font Awesome</option><option value="button">Bouton</option><option value="separator">Ligne de séparation</option><option value="spacer">Espacement</option><option value="container">Groupe vide pour regrouper des éléments</option>';
        const textValue=input("","Texte affiché");
        const cls=input("","classe CSS libre");
        const htmlId=input("","id HTML optionnel");
        const tooltip=input("","infobulle");
        const tag=document.createElement("select"); tag.className="form-control form-control-sm";
        tag.innerHTML='<option value="h3">Titre de section</option><option value="h4">Sous-titre</option><option value="div">Zone sur une nouvelle ligne</option><option value="span">Texte sur la même ligne</option><option value="p">Paragraphe</option><option value="strong">Texte en gras</option>';
        grid.appendChild(makeField("Type",type)); grid.appendChild(makeField("Présentation",tag));
        grid.appendChild(makeField("Texte",textValue)); grid.appendChild(makeField("Classe CSS",cls));
        grid.appendChild(makeField("ID HTML",htmlId)); grid.appendChild(makeField("Infobulle",tooltip));

        const detail=document.createElement("div"); wrap.appendChild(detail);
        const linkBox=document.createElement("div"); linkBox.className="pmk135-section"; linkBox.innerHTML='<h4>Lien initial (facultatif)</h4>'; wrap.appendChild(linkBox);
        const linkEnabled=document.createElement("input"); linkEnabled.type="checkbox";
        const linkEnabledLabel=document.createElement("label"); linkEnabledLabel.className="pmk135-toggle-line"; linkEnabledLabel.appendChild(linkEnabled); linkEnabledLabel.appendChild(document.createTextNode("Rendre l’élément cliquable dès sa création")); linkBox.appendChild(linkEnabledLabel);
        const linkMode=document.createElement("select"); linkMode.className="form-control form-control-sm"; linkMode.innerHTML='<option value="fixed">URL fixe</option><option value="external">URL externe dynamique</option><option value="koha">Recherche catalogue Koha</option>';
        const linkValue=input("","https://… ou modèle {200$a}");
        const linkIndex=input("kw","kw / ti / au / index libre");
        const linkTarget=document.createElement("select"); linkTarget.className="form-control form-control-sm"; linkTarget.innerHTML='<option value="same">Même onglet</option><option value="new">Nouvel onglet</option>';
        const linkGrid=document.createElement("div"); linkGrid.className="pmk135-grid2"; linkGrid.appendChild(makeField("Type de lien",linkMode)); linkGrid.appendChild(makeField("URL / valeur",linkValue,"Les placeholders MARC comme {700$a} sont autorisés.")); linkGrid.appendChild(makeField("Index Koha",linkIndex)); linkGrid.appendChild(makeField("Ouverture",linkTarget)); linkBox.appendChild(linkGrid);

        function renderDetail(){
            detail.innerHTML="";
            const t=type.value;
            if(t==="image"){
                const g=document.createElement("div"); g.className="pmk135-grid2";
                const src=input("","https://…/image.png ou URL avec {010$a}"); const alt=input("","Texte alternatif"); const width=input("","ex. 48px ou 48"); const height=input("","ex. 48px ou 48");
                src.dataset.role="image-src"; alt.dataset.role="image-alt"; width.dataset.role="image-width"; height.dataset.role="image-height";
                g.appendChild(makeField("Source image",src,"Peut être fixe ou dynamique avec placeholders MARC.")); g.appendChild(makeField("Texte alternatif",alt)); g.appendChild(makeField("Largeur",width)); g.appendChild(makeField("Hauteur",height)); detail.appendChild(g);
            } else if(t==="icon"){
                const g=document.createElement("div"); g.className="pmk135-grid2";
                const icon=input("fa fa-star","fa fa-star"); const aria=input("","Libellé accessible"); const size=input("","ex. 18px"); icon.dataset.role="icon-class"; aria.dataset.role="icon-aria"; size.dataset.role="icon-size";
                g.appendChild(makeField("Classe d’icône",icon)); g.appendChild(makeField("Libellé accessible",aria)); g.appendChild(makeField("Taille",size)); detail.appendChild(g);
            } else if(t==="button"){
                const g=document.createElement("div"); g.className="pmk135-grid2";
                const btnClass=input("btn btn-sm btn-outline-primary","classes du bouton"); btnClass.dataset.role="button-class"; g.appendChild(makeField("Classes CSS du bouton",btnClass)); detail.appendChild(g);
            } else if(t==="separator"){
                const g=document.createElement("div"); g.className="pmk135-grid2";
                const thickness=input("1px","1px"); const style=document.createElement("select"); style.className="form-control form-control-sm"; style.innerHTML='<option value="solid">Continu</option><option value="dashed">Tirets</option><option value="dotted">Pointillé</option><option value="double">Double</option>'; const color=input("#ced4da","#ced4da"); thickness.dataset.role="sep-thickness"; style.dataset.role="sep-style"; color.dataset.role="sep-color";
                g.appendChild(makeField("Épaisseur",thickness)); g.appendChild(makeField("Style",style)); g.appendChild(makeField("Couleur",color)); detail.appendChild(g);
            } else if(t==="spacer"){
                const height=input("1rem","1rem"); height.dataset.role="spacer-height"; detail.appendChild(makeField("Hauteur de l’espace",height));
            } else if(t==="container"){
                const note=document.createElement("div"); note.className="pmk135-muted"; note.textContent="Crée un conteneur vide dans lequel vous pourrez ensuite ajouter d’autres blocs et les déplacer."; detail.appendChild(note);
            }
        }
        type.addEventListener("change",renderDetail); renderDetail();

        dialog("Ajouter un élément de présentation",wrap,[
            {label:"Annuler",className:"btn btn-sm btn-outline-secondary",icon:"fa fa-times",run:function(d){d.remove();}},
            {label:"Ajouter",className:"btn btn-sm btn-primary",icon:"fa fa-plus",run:function(d){
                try{
                    const t=type.value; let el;
                    if(t==="custom-block"){
                        d.remove();
                        openCustomBlockDialog();
                        return;
                    }
                    if(t==="image"){
                        el=workingDoc.createElement("span");
                        const image=workingDoc.createElement("img");
                        const src=detail.querySelector('[data-role="image-src"]'); const alt=detail.querySelector('[data-role="image-alt"]'); const width=detail.querySelector('[data-role="image-width"]'); const height=detail.querySelector('[data-role="image-height"]');
                        setTemplateAttribute(image,"src",src?src.value:""); image.setAttribute("alt",alt?alt.value:"");
                        if(width && clean(width.value)) setStyleValue(image,"width",/^\d+$/.test(clean(width.value))?clean(width.value)+"px":clean(width.value));
                        if(height && clean(height.value)) setStyleValue(image,"height",/^\d+$/.test(clean(height.value))?clean(height.value)+"px":clean(height.value));
                        el.appendChild(image);
                    } else if(t==="icon"){
                        el=workingDoc.createElement("span");
                        const iconNode=workingDoc.createElement("i"); const icon=detail.querySelector('[data-role="icon-class"]'); const aria=detail.querySelector('[data-role="icon-aria"]'); const size=detail.querySelector('[data-role="icon-size"]');
                        iconNode.setAttribute("class",clean(icon&&icon.value)||"fa fa-star"); if(clean(aria&&aria.value)){iconNode.setAttribute("aria-label",clean(aria.value));iconNode.removeAttribute("aria-hidden");}else iconNode.setAttribute("aria-hidden","true"); if(size&&clean(size.value)) setStyleValue(iconNode,"font-size",clean(size.value));
                        el.appendChild(iconNode);
                    } else if(t==="separator"){
                        el=workingDoc.createElement("hr"); const th=detail.querySelector('[data-role="sep-thickness"]'); const st=detail.querySelector('[data-role="sep-style"]'); const co=detail.querySelector('[data-role="sep-color"]'); setStyleValue(el,"border-top-width",clean(th&&th.value)||"1px"); setStyleValue(el,"border-top-style",clean(st&&st.value)||"solid"); setStyleValue(el,"border-top-color",clean(co&&co.value)||"#ced4da");
                    } else if(t==="spacer"){
                        el=workingDoc.createElement("div"); const h=detail.querySelector('[data-role="spacer-height"]'); setStyleValue(el,"height",clean(h&&h.value)||"1rem"); el.setAttribute("aria-hidden","true");
                    } else {
                        const chosen=t==="container"?"div":tag.value||"span"; el=workingDoc.createElement(chosen);
                        if(t==="button") { const bc=detail.querySelector('[data-role="button-class"]'); el.setAttribute("class",clean(bc&&bc.value)||"btn btn-sm btn-outline-primary"); }
                        if(t!=="container" && textValue.value) el.appendChild(workingDoc.createTextNode(textValue.value));
                    }
                    el.setAttribute("data-pmk-xslt-node",uid("node")); el.setAttribute("data-pmk-xslt-generic",t);
                    if(t!=="button" && clean(cls.value)) el.setAttribute("class",clean(cls.value)); else if(t==="button" && clean(cls.value)) el.setAttribute("class",((el.getAttribute("class")||"")+" "+clean(cls.value)).trim());
                    if(clean(htmlId.value)) el.setAttribute("id",clean(htmlId.value)); if(clean(tooltip.value)) el.setAttribute("title",clean(tooltip.value));
                    insertNewNodeAtSelection(el, insertion);
                    if(linkEnabled.checked){
                        const meta=getLinkMeta(el); meta.enabled=true; meta.mode=linkMode.value; meta.target=linkTarget.value; meta.index=clean(linkIndex.value)||"kw";
                        if(meta.mode==="fixed") meta.fixedUrl=clean(linkValue.value); else if(meta.mode==="external") meta.externalTemplate=linkValue.value; else meta.valueTemplate=linkValue.value||"{200$a}";
                        applyLink(el,meta);
                    }
                    annotate(workingDoc); selectedNodeId=el.getAttribute("data-pmk-xslt-node"); saveWorking(); d.remove(); renderAll(); toast("Élément ajouté.","success");
                }catch(e){toast(e.message,"danger");}
            }}
        ]);
    }

    function openCompositeDialog() {
        if (!workingDoc) return;
        const insertion = createInsertionChooser();
        if (!insertion) return toast("Sélectionnez un bloc près duquel ajouter le groupe de données.", "info");

        const wrap = document.createElement("div");
        wrap.appendChild(insertion.field);
        const top = document.createElement("div"); top.className = "pmk135-grid2";
        function input(value, placeholder) { const i=document.createElement("input"); i.className="form-control form-control-sm"; i.value=value||""; i.placeholder=placeholder||""; return i; }
        const blockLabel=input("", "ex. Collection : ");
        const blockClass=input("pmk-xslt-composite", "classe CSS");
        const tooltip=input("", "infobulle du bloc");
        const layout=document.createElement("select"); layout.className="form-control form-control-sm"; layout.innerHTML='<option value="inline">Même ligne</option><option value="lines">Une ligne par segment</option>';
        const wrapper=document.createElement("select"); wrapper.className="form-control form-control-sm"; wrapper.innerHTML='<option value="span">Sur la même ligne</option><option value="div">Sur une nouvelle ligne</option><option value="p">Paragraphe</option><option value="li">Élément de liste</option>';
        const hideEmpty=document.createElement("input"); hideEmpty.type="checkbox"; hideEmpty.checked=true;
        top.appendChild(makeField("Texte avant les données",blockLabel)); top.appendChild(makeField("Classe CSS",blockClass)); top.appendChild(makeField("Disposition",layout)); top.appendChild(makeField("Balise HTML (technique)",wrapper)); top.appendChild(makeField("Infobulle",tooltip));
        const he=document.createElement("label"); he.className="pmk135-toggle-line"; he.appendChild(hideEmpty); he.appendChild(document.createTextNode("Masquer le bloc complet et son libellé si toutes les zones sont vides")); top.appendChild(he); wrap.appendChild(top);

        const intro=document.createElement("div"); intro.className="alert alert-light"; intro.innerHTML='Chaque segment peut avoir sa propre zone/sous-zone, son libellé, son séparateur de répétition et son séparateur avant. Les séparateurs sont générés conditionnellement pour éviter les <strong>« ; » orphelins</strong>.'; wrap.appendChild(intro);
        const list=document.createElement("div"); list.className="pmk135-segment-list"; wrap.appendChild(list);
        const segments=[
            {type:"marc",tag:"225",subfield:"a",label:"",before:"",repeat:"first",repeatSeparator:" ; ",className:""},
            {type:"marc",tag:"225",subfield:"v",label:"",before:" ; ",repeat:"first",repeatSeparator:" ; ",className:""}
        ];

        function renderSegments() {
            list.innerHTML="";
            segments.forEach(function(seg,index){
                const row=document.createElement("div"); row.className="pmk135-segment-row";
                const head=document.createElement("div"); head.className="pmk135-segment-head"; head.innerHTML='<i class="fa fa-grip-vertical"></i><strong>Segment '+(index+1)+'</strong>';
                head.appendChild(createButton("↑","btn btn-sm btn-outline-secondary",function(){ if(index>0){ const x=segments.splice(index,1)[0]; segments.splice(index-1,0,x); renderSegments(); }}));
                head.appendChild(createButton("↓","btn btn-sm btn-outline-secondary",function(){ if(index<segments.length-1){ const x=segments.splice(index,1)[0]; segments.splice(index+1,0,x); renderSegments(); }}));
                head.appendChild(createButton("","btn btn-sm btn-outline-danger",function(){ segments.splice(index,1); renderSegments(); },"fa fa-times")); row.appendChild(head);
                const g=document.createElement("div"); g.className="pmk135-grid2";
                const type=document.createElement("select"); type.className="form-control form-control-sm"; type.innerHTML='<option value="marc">Zone MARC</option><option value="text">Texte fixe</option><option value="break">Retour à la ligne</option>'; type.value=seg.type;
                type.addEventListener("change",function(){seg.type=type.value;renderSegments();}); g.appendChild(makeField("Type",type));
                if(seg.type==="marc"){
                    const tag=input(seg.tag||"","200"); const sub=input(seg.subfield||"","a"); const lab=input(seg.label||"","libellé propre"); const before=input(seg.before||""," ; "); const repSep=input(seg.repeatSeparator||" ; "," ; "); const cls=input(seg.className||"","classe CSS du segment");
                    const repeat=document.createElement("select"); repeat.className="form-control form-control-sm"; repeat.innerHTML='<option value="first">Première valeur</option><option value="all">Toutes les occurrences</option>'; repeat.value=seg.repeat||"first";
                    [[tag,"tag"],[sub,"subfield"],[lab,"label"],[before,"before"],[repSep,"repeatSeparator"],[cls,"className"]].forEach(function(pair){pair[0].addEventListener("input",function(){seg[pair[1]]=pair[0].value;});}); repeat.addEventListener("change",function(){seg.repeat=repeat.value;});
                    g.appendChild(makeField("Zone",tag)); g.appendChild(makeField("Sous-zone",sub)); g.appendChild(makeField("Libellé segment",lab)); g.appendChild(makeField("Séparateur avant",before,"Émis uniquement si ce segment et un segment précédent ont une valeur.")); g.appendChild(makeField("Répétitions",repeat)); g.appendChild(makeField("Séparateur entre occurrences",repSep)); g.appendChild(makeField("Classe CSS",cls));
                } else if(seg.type==="text"){
                    const txt=input(seg.text||"","texte libre"); txt.addEventListener("input",function(){seg.text=txt.value;}); g.appendChild(makeField("Texte",txt));
                } else {
                    const note=document.createElement("div"); note.className="pmk135-muted"; note.textContent="Insère un <br/> dans le bloc."; g.appendChild(note);
                }
                row.appendChild(g); list.appendChild(row);
            });
        }
        renderSegments();
        const adds=document.createElement("div"); adds.className="pmk135-toolbar";
        adds.appendChild(createButton("Zone MARC","btn btn-sm btn-outline-primary",function(){segments.push({type:"marc",tag:"200",subfield:"a",label:"",before:" ; ",repeat:"first",repeatSeparator:" ; ",className:""});renderSegments();},"fa fa-plus"));
        adds.appendChild(createButton("Texte libre","btn btn-sm btn-outline-secondary",function(){segments.push({type:"text",text:""});renderSegments();},"fa fa-font"));
        adds.appendChild(createButton("Retour ligne","btn btn-sm btn-outline-secondary",function(){segments.push({type:"break"});renderSegments();},"fa fa-level-down")); wrap.appendChild(adds);

        dialog("Ajouter un groupe de données",wrap,[
            {label:"Annuler",className:"btn btn-sm btn-outline-secondary",icon:"fa fa-times",run:function(d){d.remove();}},
            {label:"Créer le bloc",className:"btn btn-sm btn-primary",icon:"fa fa-check",run:function(d){
                try{
                    if(!segments.length) throw new Error("Ajoutez au moins un segment.");
                    const container=workingDoc.createElement(wrapper.value||"span"); container.setAttribute("data-pmk-xslt-node",uid("node")); container.setAttribute("data-pmk-xslt-composite","1");
                    if(clean(blockClass.value)) container.setAttribute("class",clean(blockClass.value)); if(clean(tooltip.value)) container.setAttribute("title",clean(tooltip.value));
                    if(blockLabel.value) container.appendChild(workingDoc.createTextNode(blockLabel.value));
                    insertNewNodeAtSelection(container, insertion);
                    const fields=[]; const previous=[];
                    segments.forEach(function(seg){
                        if(seg.type==="break"){ container.appendChild(workingDoc.createElement("br")); return; }
                        if(seg.type==="text"){ container.appendChild(workingDoc.createTextNode(seg.text||"")); return; }
                        const path=fieldXPath(seg.tag,seg.subfield); if(!path) return;
                        fields.push({tag:clean(seg.tag),subfield:clean(seg.subfield),path:path});
                        const nonEmpty="normalize-space(string("+path+")) != ''";
                        const segment=workingDoc.createElement("span"); segment.setAttribute("data-pmk-xslt-node",uid("segment")); segment.setAttribute("data-pmk-xslt-segment","1");
                        setJsonAttr(segment,"data-pmk-xslt-segment-meta",seg); if(clean(seg.className)) segment.setAttribute("class",clean(seg.className)); if(seg.label) segment.appendChild(workingDoc.createTextNode(seg.label));
                        if(seg.repeat==="all"){
                            const each=workingDoc.createElementNS(XSL_NS,"xsl:for-each"); each.setAttribute("select",path); const val=workingDoc.createElementNS(XSL_NS,"xsl:value-of"); val.setAttribute("select","."); each.appendChild(val);
                            const more=workingDoc.createElementNS(XSL_NS,"xsl:if"); more.setAttribute("test","position() != last()"); more.appendChild(workingDoc.createTextNode(seg.repeatSeparator||" ; ")); each.appendChild(more); segment.appendChild(each);
                        } else { const val=workingDoc.createElementNS(XSL_NS,"xsl:value-of"); val.setAttribute("select",path+"[1]"); segment.appendChild(val); }
                        container.appendChild(segment);
                        applyCondition(segment,{enabled:true,join:"and",rules:[{source:"marc",tag:clean(seg.tag),subfield:clean(seg.subfield),operator:"not-empty",value:"",xpath:""}]});
                        const segmentWrapper=conditionWrapperFor(segment);
                        if(segmentWrapper && previous.length){
                            const beforeIf=workingDoc.createElementNS(XSL_NS,"xsl:if"); beforeIf.setAttribute("test","("+previous.join(" or ")+")");
                            if(layout.value==="lines") beforeIf.appendChild(workingDoc.createElement("br"));
                            else if(clean(seg.before)) beforeIf.appendChild(workingDoc.createTextNode(seg.before));
                            if(beforeIf.childNodes.length) segmentWrapper.insertBefore(beforeIf,segment);
                        }
                        previous.push(nonEmpty);
                    });
                    if(hideEmpty.checked && fields.length){ applyCondition(container,{enabled:true,join:"or",rules:fields.map(function(f){return {source:"marc",tag:f.tag,subfield:f.subfield,operator:"not-empty",value:"",xpath:""};})}); }
                    annotate(workingDoc); selectedNodeId=container.getAttribute("data-pmk-xslt-node"); saveWorking(); d.remove(); renderAll(); toast("Plusieurs données sur une ligne ajouté.","success");
                }catch(e){toast(e.message,"danger");}
            }}
        ]);
    }

    function openPreviewSearchDialog(targetInput, previewTarget, options) {
        options = options || {};
        normalizePreviewProject();
        const wrap=document.createElement("div"); const g=document.createElement("div"); g.className="pmk135-grid2";
        const term=document.createElement("input"); term.className="form-control form-control-sm"; term.placeholder="titre, auteur, ISBN, code-barres…";
        const index=document.createElement("input"); index.className="form-control form-control-sm"; index.value=currentProject.previewSearchIndex||"kw"; index.placeholder="kw / ti / au / nb / bc / index libre";
        g.appendChild(makeField("Recherche",term)); g.appendChild(makeField("Index Koha",index)); wrap.appendChild(g);
        const results=document.createElement("div"); results.className="pmk135-result-list"; wrap.appendChild(results);
        const d=dialog("Choisir une vraie notice",wrap,[
            {label:"Fermer",className:"btn btn-sm btn-outline-secondary",icon:"fa fa-times",run:function(x){x.remove();}},
            {label:"Rechercher",className:"btn btn-sm btn-primary",icon:"fa fa-search",run:async function(){
                results.innerHTML='<div class="pmk135-muted"><i class="fa fa-spinner fa-spin"></i> Recherche…</div>';
                try{
                    currentProject.previewSearchIndex=clean(index.value)||"kw"; saveProject(currentProject);
                    const rows=await searchPreviewRecords(term.value,index.value); results.innerHTML="";
                    if(!rows.length){results.innerHTML='<div class="pmk135-muted">Aucune notice trouvée.</div>';return;}
                    rows.forEach(function(r){ const row=document.createElement("div"); row.className="pmk135-result"; const label=document.createElement("span"); label.textContent=r.label+" — "+r.id; row.appendChild(label);
                        row.appendChild(createButton("Choisir","btn btn-sm btn-outline-primary",async function(){ targetInput.value=r.id; currentProject.previewBiblionumber=r.id; if(!currentProject.previewRecords.some(function(x){return x.id===r.id && (x.kind || "biblio") === "biblio";})) currentProject.previewRecords.push({ id:r.id, label:r.label, kind:"biblio" }); saveProject(currentProject); d.remove(); if(options.auto){ scheduleAutoPreview(true); } else { await renderRecordPreview(previewTarget,r.id,true); } },"fa fa-check")); results.appendChild(row); });
                }catch(e){results.innerHTML='<div class="alert alert-warning">'+esc(e.message)+'</div>';}
            }}
        ]);
        window.setTimeout(function(){term.focus();},0);
    }

    function validationCheck(level, label, detail) {
        return { level: level, label: label, detail: detail || "" };
    }

    function validationDocuments() {
        const docs = [];
        if (workingDoc) docs.push({ name: "XSLT principal", doc: workingDoc });
        normalizeDependenciesProject().forEach(function (dep) {
            const xml = clean(dep.customXml || dep.sourceXml);
            if (!xml) return;
            try { docs.push({ name: dep.customFilename || dep.href || "Dépendance", doc: parseXml(xml) }); }
            catch (_) {}
        });
        return docs;
    }

    function namedTemplateAudit() {
        const defined = new Set();
        const called = new Set();
        validationDocuments().forEach(function (entry) {
            Array.from(entry.doc.getElementsByTagNameNS(XSL_NS, "template")).forEach(function (el) {
                const name = clean(el.getAttribute("name"));
                if (name) defined.add(name);
            });
            Array.from(entry.doc.getElementsByTagNameNS(XSL_NS, "call-template")).forEach(function (el) {
                const name = clean(el.getAttribute("name"));
                if (name) called.add(name);
            });
        });
        return Array.from(called).filter(function (name) { return !defined.has(name); }).sort();
    }

    async function runValidation() {
        const validationProject = currentProject;
        const validationEpoch = projectEpoch;
        const startedFingerprint = currentProject && workingDoc ? validationFingerprint() : "";
        const checks = [];
        if (!workingDoc || !currentProject) {
            return { status: "error", checks: [validationCheck("error", "Aucun XSLT chargé", "Importez d’abord une feuille XSLT.")], fingerprint: "", at: new Date().toISOString() };
        }

        try {
            const xml = serializeDoc(workingDoc, true);
            const doc = parseXml(xml);
            const root = doc.documentElement;
            if (!(root.namespaceURI === XSL_NS && ["stylesheet", "transform"].includes(root.localName))) {
                checks.push(validationCheck("error", "Racine XSLT invalide", "La racine doit être xsl:stylesheet ou xsl:transform."));
            } else {
                checks.push(validationCheck("ok", "XML lisible et racine XSLT reconnue", "La feuille principale est sérialisable et possède une racine XSLT valide."));
            }
        } catch (e) {
            checks.push(validationCheck("error", "XML/XSLT principal invalide", e.message));
        }

        const deps = normalizeDependenciesProject();
        const invalidCustom = [];
        deps.forEach(function (dep) {
            if (!dep.custom || !clean(dep.customXml)) return;
            try { parseXml(dep.customXml); }
            catch (e) { invalidCustom.push((dep.customFilename || dep.href || "Dépendance") + " : " + e.message); }
        });
        if (invalidCustom.length) checks.push(validationCheck("error", "Dépendances personnalisées invalides", invalidCustom.join(" · ")));
        else if (deps.some(function (d) { return d.custom; })) checks.push(validationCheck("ok", "Dépendances personnalisées valides", deps.filter(function (d) { return d.custom; }).length + " fichier(s) contrôlé(s)."));

        const unresolved = deps.filter(function (dep) { return !clean(dep.customXml || dep.sourceXml); });
        if (unresolved.length) {
            checks.push(validationCheck("warn", "Dépendances non lisibles dans le navigateur", unresolved.map(function (d) { return dependencyBasename(d.href); }).join(", ") + ". Koha peut néanmoins les résoudre côté serveur ; vérifiez-les avant copie."));
        } else if (deps.length) {
            checks.push(validationCheck("ok", "Dépendances disponibles", deps.length + " dépendance(s) chargée(s) pour les contrôles navigateur."));
        }

        const missingTemplates = namedTemplateAudit();
        if (missingTemplates.length) {
            checks.push(validationCheck(unresolved.length ? "warn" : "error", "Templates appelés non trouvés", missingTemplates.slice(0, 12).join(", ") + (missingTemplates.length > 12 ? "…" : "")));
        } else {
            checks.push(validationCheck("ok", "Appels de templates nommés cohérents", "Aucun xsl:call-template orphelin détecté dans les fichiers actuellement disponibles."));
        }

        if (typeof XSLTProcessor === "undefined") {
            checks.push(validationCheck("warn", "Compilation navigateur indisponible", "Ce navigateur ne fournit pas XSLTProcessor."));
        } else {
            try {
                const proc = new XSLTProcessor();
                proc.importStylesheet(prepareXsltForBrowser(workingDoc));
                checks.push(validationCheck("ok", "Compilation navigateur réussie", "Le navigateur accepte la feuille préparée avec les dépendances connues."));
            } catch (e) {
                checks.push(validationCheck("warn", "Compilation navigateur non concluante", e.message));
            }
        }

        normalizePreviewProject();
        const kind = currentRecordKind();
        const testId = kind === "authority" ? clean(currentProject.previewAuthorityId) : clean(currentProject.previewBiblionumber);
        if (!testId) {
            checks.push(validationCheck("warn", "Aucun enregistrement de test", "Ajoutez " + (kind === "authority" ? "un numéro d’autorité" : "un numéro de notice") + " pour vérifier une transformation réelle."));
        } else {
            try {
                const marc = await fetchMarcXml(testId, kind);
                transformRecord(workingDoc, marc);
                checks.push(validationCheck("ok", (kind === "authority" ? "Autorité" : "Notice") + " test transformée", "Identifiant " + testId + "."));
            } catch (e) {
                checks.push(validationCheck("warn", "Transformation navigateur non concluante sur l’enregistrement de test", e.message + " Le rendu serveur Koha peut dépendre de paramètres supplémentaires ; vérifiez le résultat dans Koha avant copie."));
            }
        }

        const status = checks.some(function (c) { return c.level === "error"; }) ? "error" :
            (checks.some(function (c) { return c.level === "warn"; }) ? "warn" : "ok");
        const result = { status: status, checks: checks, fingerprint: startedFingerprint, at: new Date().toISOString() };
        if (currentProject !== validationProject || projectEpoch !== validationEpoch || validationFingerprint() !== startedFingerprint) {
            return { status: "warn", checks: [validationCheck("warn", "Contrôle interrompu", "Le document a changé pendant la vérification. Relancez-la sur le document courant.")], fingerprint: "", at: result.at };
        }
        currentProject.lastValidation = result;
        saveProject(currentProject);
        updateTopbarStatus();
        return result;
    }

    function renderValidationReport() {
        const wrap = document.createElement("div");
        wrap.style.marginTop = ".65rem";
        if (!currentProject || !currentProject.lastValidation) {
            wrap.innerHTML = '<div class="alert alert-info">Aucun contrôle complet n’a encore été exécuté sur cette version du projet.</div>';
            return wrap;
        }
        const result = currentProject.lastValidation;
        const stale = result.fingerprint !== validationFingerprint();
        if (stale) {
            wrap.innerHTML = '<div class="alert alert-warning"><strong>Validation obsolète.</strong> Le XSLT ou une dépendance a été modifié depuis les derniers contrôles.</div>';
            return wrap;
        }
        const summary = document.createElement("div");
        summary.className = result.status === "ok" ? "alert alert-success" : (result.status === "warn" ? "alert alert-warning" : "alert alert-danger");
        summary.innerHTML = result.status === "ok" ? '<strong>Contrôles disponibles réussis.</strong> Aucun problème détecté par les contrôles disponibles.' :
            (result.status === "warn" ? '<strong>Validation avec avertissements.</strong> Relisez les points ci-dessous avant copie.' : '<strong>Erreurs détectées.</strong> Corrigez les erreurs ci-dessous.');
        wrap.appendChild(summary);
        const list = document.createElement("div");
        list.className = "pmk136-validation";
        (result.checks || []).forEach(function (check) {
            const row = document.createElement("div");
            row.className = "pmk136-check " + check.level;
            const icon = check.level === "ok" ? "fa fa-check-circle" : (check.level === "warn" ? "fa fa-exclamation-triangle" : "fa fa-times-circle");
            row.innerHTML = '<i class="' + icon + '" aria-hidden="true"></i><div><strong>' + esc(check.label) + '</strong>' + (check.detail ? '<small>' + esc(check.detail) + '</small>' : '') + '</div>';
            list.appendChild(row);
        });
        wrap.appendChild(list);
        return wrap;
    }

    async function validateCurrent() {
        const result = await runValidation();
        if (app && activeWorkspaceStep === "publish") { const details = app.querySelector(".pmk135-workspace details"); const wasOpen = details && details.open; renderWorkspace(); const next = app.querySelector(".pmk135-workspace details"); if (next) next.open = wasOpen; }
        if (result.status === "ok") toast("Validation terminée : aucun problème détecté.", "success");
        else if (result.status === "warn") toast("Validation terminée avec avertissements.", "warning");
        else toast("Validation terminée : des erreurs doivent être corrigées.", "danger");
        return result;
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_) {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand("copy");
            ta.remove();
            return ok;
        }
    }

    async function copyOutput() {
        if (!workingDoc || !currentProject) return;
        try {
            const xml = serializeDoc(workingDoc, true);
            const doc = parseXml(xml);
            if (doc.documentElement.namespaceURI !== XSL_NS || !["stylesheet", "transform"].includes(doc.documentElement.localName)) throw new Error("La feuille XSLT n’a pas une racine valide.");
            const ok = await copyText(xml);
            const status = app && app.querySelector("#pmk136-copy-status");
            if (status) status.textContent = ok ? "XSLT complet copié. Vous pouvez le coller dans votre fichier." : "Sélectionnez tout le code ci-dessous puis utilisez Ctrl+C.";
            if (!ok) { const ta = app && app.querySelector("#pmk136-output"); if (ta) { ta.focus(); ta.select(); } }
            toast(ok ? "XSLT complet copié." : "Utilisez « Sélectionner tout le code », puis Ctrl+C.", ok ? "success" : "info");
        } catch (e) { toast(e.message, "danger"); }
    }

    function renderAll() {
        renderTopbar();
        renderStructure();
        renderWorkspace();
        renderInspector();
    }

    function openAssistant() {
        addStyles();
        if (app) return;
        app = document.createElement("div");
        app.className = "pmk135-overlay";
        app.innerHTML = '<div class="pmk135-topbar"></div>' +
            '<div class="pmk135-main">' +
            '<section class="pmk135-pane pmk135-pane-structure"></section>' +
            '<section class="pmk135-pane pmk135-pane-workspace"></section>' +
            '<section class="pmk135-pane pmk135-pane-inspector"></section>' +
            '</div>';
        document.body.appendChild(app);
        document.documentElement.style.overflow = "hidden";

        const index = loadIndex();
        if (index.length) {
            const p = loadProject(index[index.length - 1].id) || loadProject(index[0].id);
            if (p) currentProject = p;
        }
        if (!currentProject) {
            currentProject = defaultProject();
            saveProject(currentProject);
        }
        openProject(currentProject);
    }

    function closeAssistant() {
        if (!app) return;
        if (autoPreviewTimer) { window.clearTimeout(autoPreviewTimer); autoPreviewTimer = null; }
        autoPreviewRequest += 1;
        saveWorking();
        app.remove();
        app = null;
        document.documentElement.style.overflow = "";
        if (isAssistantPage()) {
            window.location.href = "/cgi-bin/koha/mainpage.pl?pmk_page=hub";
        }
    }

    function renderLauncher() {
        const wrap = document.createElement("div");
        wrap.className = "pmk135-launch";
        const p = document.createElement("p");
        p.textContent = "Importez manuellement votre XSLT, modifiez les éléments dans l’aperçu puis copiez le XSLT complet. L’aperçu se met à jour à chaque modification.";
        wrap.appendChild(p);
        wrap.appendChild(createButton("Ouvrir l’assistant XSLT", "btn btn-primary", openAssistantPage, "fa fa-code"));
        return wrap;
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 1,
            name: { fr: "Assistant XSLT", en: "XSLT assistant" },
            description: {
                fr: "Import manuel d’un XSLT, modification visuelle avec aperçu automatique et copie du XSLT complet.",
                en: "Visual builder to import, reorganize and enrich Koha XSLT files, then copy the complete output without hand-editing XML."
            },
            category: { fr: "Catalogue / XSLT", en: "Catalog / XSLT" },
            supportedPages: ["*"],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            validate: function (cfg) {
                if (!cfg || typeof cfg.enabled !== "boolean") return { ok: false, message: "Configuration invalide." };
                return { ok: true };
            },
            schema: [
                {
                    type: "section",
                    id: "assistant",
                    label: { fr: "Assistant XSLT", en: "XSLT assistant" },
                    description: {
                        fr: "Le travail XSLT est conservé localement dans ce navigateur pendant la phase pré-plugin.",
                        en: "XSLT work is stored locally in this browser during the pre-plugin phase."
                    },
                    fields: [
                        { key: "enabled", type: "boolean", label: { fr: "Activer le module", en: "Enable module" } },
                        { type: "custom", render: renderLauncher }
                    ]
                }
            ]
        };
    }

    function registerModule() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return false;
        try {
            window.PMKConfig.registerModule(moduleDefinition());
            return true;
        } catch (_) {
            return false;
        }
    }

    function start() {
        addStyles();

        // Enregistrement PMK : indépendant de l'ouverture de la page autonome.
        if (!registerModule()) {
            window.addEventListener("pmk:config-ready", registerModule, { once: true });
            window.setTimeout(registerModule, 5000);
        }

        // Route virtuelle autonome, sur le même principe que les autres pages PMK.
        if (isAssistantPage()) {
            try { document.documentElement.classList.add("pmk136-xslt-route"); } catch (_) {}
            window.setTimeout(function () {
                if (window.PMKPages && typeof window.PMKPages.isSuperlibrarian === "function" && !isSuperlibrarian()) {
                    const denied = document.createElement("div");
                    denied.className = "pmk135-overlay";
                    denied.innerHTML = '<div style="max-width:760px;margin:60px auto;padding:22px;border:1px solid #e1b5b5;border-radius:8px;background:#fff1f1;color:#822929"><strong>Accès réservé.</strong><br>L’Assistant XSLT est accessible uniquement aux superlibrarians Koha.<div style="margin-top:1rem"><a class="btn btn-default btn-sm" href="/cgi-bin/koha/mainpage.pl"><i class="fa fa-home"></i> Accueil Koha</a></div></div>';
                    document.body.appendChild(denied);
                    return;
                }
                openAssistant();
                document.title = "Assistant XSLT — Koha";
            }, 100);
        }
    }

    const publicApi = {
        moduleId: MODULE_ID,
        version: MODULE_VERSION,
        pageParam: PAGE_PARAM,
        pageUrl: PAGE_URL,
        open: openAssistantPage,
        openPage: openAssistantPage,
        openOverlay: openAssistant,
        close: closeAssistant,
        knownPreferences: clone(KNOWN_PREFS),
        validateProject: runValidation,
        validateXml: function (xml) {
            try { parseXml(xml); return { ok: true }; }
            catch (e) { return { ok: false, message: e.message }; }
        }
    };
    window.PMK136XsltAssistant = publicApi;
    window.PMK135XsltAssistant = publicApi; // compatibilité avec les versions 0.2.x

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
})(window, document);

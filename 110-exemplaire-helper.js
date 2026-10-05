/*
 Nom du fichier : 110-exemplaire-helper.js
 Version : 3.1.2-preplugin
 Date : 2026-09-20

 PimpMyKoha — Assistant de saisie des exemplaires

 Principes :
 - conserve le rendu et le profil Dracénie historique par défaut ;
 - reste totalement autonome du 102 "Boutons modèles exemplaires" ;
 - ne soumet JAMAIS le formulaire Koha et n'enregistre jamais un exemplaire automatiquement ;
 - fonctionne sur additem.pl et batchMod.pl ;
 - accepte un nombre libre de champs exemplaire configurés par kohafield / sélecteur ;
 - conserve "Copier au + nombreux" avec le calcul historique : majorité stricte, au moins 2 occurrences, pas d'égalité ;
 - respecte le mécanisme natif Koha disable_input sur batchMod.pl pour les vidages ;
 - source les choix par formulaire Koha, valeurs autorisées, API Koha ou liste manuelle avec repli sûr ;
 - valide toujours les valeurs finales contre les contrôles réellement présents dans Koha ;
 - synchronise input/change et Select2 ;
 - conserve les mémorisations Firebase historiques et ajoute des modes commun / compte Koha sans les imposer ;
 - français / anglais ; responsive ; fail-safe.
*/
(function () {
    "use strict";

    if (window.__PMK110_ITEM_ENTRY_ASSISTANT__) return;
    window.__PMK110_ITEM_ENTRY_ASSISTANT__ = true;

    const MODULE_ID = "item-entry-assistant";
    const MODULE_VERSION = "3.1.2-preplugin";
    const PANEL_ID = "koha_items_assistant_panel";
    const CACHE_KEY = "koha_items_assistant_last";
    const PRESETS_KEY = "koha_items_assistant_presets";
    const PANEL_STATE_KEY = "koha_items_assistant_panel_state";
    const PANEL_POSITION_KEY = "koha_items_assistant_panel_position";
    const SELECTED_OWNER_KEY = "koha_items_assistant_selected_owner";
    const PRESET_CONTROLS_KEY = "koha_items_assistant_preset_controls_open";

    const PAGE_DEFINITIONS = [
        { id: "cataloguing.additem", path: "/cgi-bin/koha/cataloguing/additem.pl", labelFr: "Création / modification d’exemplaire", labelEn: "Item creation / editing", enabled: true },
        { id: "tools.batchmod", path: "/cgi-bin/koha/tools/batchMod.pl", labelFr: "Modification d’exemplaires par lot", labelEn: "Batch item modification", enabled: true }
    ];

    const DEFAULT_FIREBASE_CONFIG = {
        apiKey: "YOUR_FIREBASE_APIKEY",
        authDomain: "YOUR_FIREBASE_AUTHDOMAIN",
        projectId: "YOUR_FIREBASE_PROJECTID",
        storageBucket: "YOUR_FIREBASE_STORAGEBUCKET",
        messagingSenderId: "YOUR_FIREBASE_MESSAGINGSENDERID",
        appId: "YOUR_FIREBASE_APPID"
    };

    const DEFAULT_FIELDS = [
        { id:"b", legacyCode:"b", enabled:true, kohafield:"items.homebranch", marcTag:"995", marcSubfield:"b", labelFr:"Site Prop.", labelEn:"Home library", type:"select", allowClear:true, copyEligible:true, normalize:"none", selector:"" },
        { id:"c", legacyCode:"c", enabled:true, kohafield:"items.holdingbranch", marcTag:"995", marcSubfield:"c", labelFr:"Site actuel", labelEn:"Current library", type:"select", allowClear:true, copyEligible:true, normalize:"none", selector:"" },
        { id:"s", legacyCode:"s", enabled:true, kohafield:"items.enumchron", marcTag:"995", marcSubfield:"s", labelFr:"Etage", labelEn:"Level", type:"select", allowClear:true, copyEligible:true, normalize:"none", selector:"" },
        { id:"e", legacyCode:"e", enabled:true, kohafield:"items.location", marcTag:"995", marcSubfield:"e", labelFr:"Localisation", labelEn:"Location", type:"select", allowClear:true, copyEligible:true, normalize:"none", selector:"" },
        { id:"j", legacyCode:"j", enabled:true, kohafield:"items.copynumber", marcTag:"995", marcSubfield:"j", labelFr:"Sous local.", labelEn:"Sub-location", type:"select", allowClear:true, copyEligible:true, normalize:"none", selector:"" },
        { id:"k", legacyCode:"k", enabled:true, kohafield:"items.itemcallnumber", marcTag:"995", marcSubfield:"k", labelFr:"Cote", labelEn:"Call number", type:"input", allowClear:true, copyEligible:true, normalize:"none", selector:"" },
        { id:"f", legacyCode:"f", enabled:true, kohafield:"items.barcode", marcTag:"995", marcSubfield:"f", labelFr:"Code barre", labelEn:"Barcode", type:"input", allowClear:true, copyEligible:false, normalize:"none", selector:"" },
        { id:"r", legacyCode:"r", enabled:true, kohafield:"items.itype", marcTag:"995", marcSubfield:"r", labelFr:"Type doc.", labelEn:"Item type", type:"select", allowClear:true, copyEligible:true, normalize:"none", selector:"" },
        { id:"3", legacyCode:"3", enabled:true, kohafield:"items.ccode", marcTag:"995", marcSubfield:"3", labelFr:"Collection", labelEn:"Collection", type:"select", allowClear:true, copyEligible:true, normalize:"none", selector:"" },
        { id:"q", legacyCode:"q", enabled:true, kohafield:"items.more_subfields_xml_q", marcTag:"995", marcSubfield:"q", labelFr:"Public", labelEn:"Audience", type:"select", allowClear:true, copyEligible:true, normalize:"none", selector:"" },
        { id:"o", legacyCode:"o", enabled:true, kohafield:"items.notforloan", marcTag:"995", marcSubfield:"o", labelFr:"Statut", labelEn:"Status", type:"select", allowClear:true, copyEligible:true, normalize:"none", selector:"" },
        { id:"2", legacyCode:"2", enabled:true, kohafield:"items.itemlost", marcTag:"995", marcSubfield:"2", labelFr:"Motif exclu", labelEn:"Lost status", type:"select", allowClear:true, copyEligible:true, normalize:"none", selector:"" },
        { id:"t", legacyCode:"t", enabled:true, kohafield:"items.more_subfields_xml_t", marcTag:"995", marcSubfield:"t", labelFr:"Achat/don", labelEn:"Purchase / gift", type:"select", allowClear:true, copyEligible:true, normalize:"none", selector:"" },
        { id:"A", legacyCode:"A", enabled:true, kohafield:"items.more_subfields_xml_A", marcTag:"995", marcSubfield:"A", labelFr:"Fournisseur", labelEn:"Vendor", type:"input", allowClear:true, copyEligible:true, normalize:"none", selector:"" },
        { id:"p", legacyCode:"p", enabled:true, kohafield:"items.replacementprice", marcTag:"995", marcSubfield:"p", labelFr:"Prix", labelEn:"Replacement price", type:"input", allowClear:true, copyEligible:true, normalize:"price", selector:"" },
        { id:"u", legacyCode:"u", enabled:true, kohafield:"items.itemnotes_nonpublic", marcTag:"995", marcSubfield:"u", labelFr:"Note interne", labelEn:"Internal note", type:"input", allowClear:true, copyEligible:true, normalize:"none", selector:"" },
        { id:"x", legacyCode:"x", enabled:true, kohafield:"items.itemnotes", marcTag:"995", marcSubfield:"x", labelFr:"Note OPAC", labelEn:"OPAC note", type:"input", allowClear:true, copyEligible:true, normalize:"none", selector:"" }
    ];

    /* Les sources restent neutres par défaut : Auto sans source externe = comportement historique du formulaire Koha. */
    DEFAULT_FIELDS.forEach(function (field) {
        field.sourceMode = "auto";
        field.source = {
            authorisedValueCategory:"",
            authorisedValueCategoryCustom:"",
            apiEndpoint:"",
            apiArrayPath:"",
            apiValuePath:"value",
            apiLabelPath:"description",
            fallbackToForm:true,
            manualValues:[]
        };
    });

    const DEFAULT_CONFIG = {
        enabled: true,
        pages: PAGE_DEFINITIONS.map(function (p) { return { id:p.id, path:p.path, enabled:p.enabled }; }),
        panel: {
            widthPx: 420,
            collapsedByDefault: true,
            rememberStateAndPosition: true,
            refreshOptionsMs: 5000
        },
        fields: DEFAULT_FIELDS,
        copyMajority: {
            enabled: true,
            minOccurrences: 2,
            thresholdPercent: 50,
            strictGreaterThanThreshold: true,
            rejectTies: true,
            requireExistingItems: true
        },
        presets: {
            enabled: true,
            maxPresets: 20,
            mode: "legacyNamed",
            collection: "koha_items_assistant_presets",
            rememberSelectedList: true
        },
        firebase: {
            enabled: true,
            sdkVersion: "11.5.0",
            config: DEFAULT_FIREBASE_CONFIG
        }
    };

    let currentConfig = clone(DEFAULT_CONFIG);
    let configRegistered = false;
    let unsubscribeConfig = null;
    let renderTimer = null;
    let refreshTimer = null;
    let firebaseDb = null;
    let firebaseApi = null;
    let firebaseBootPromise = null;

    const sourceValueCache = new Map();
    let authorisedValueCategoryCache = [];
    let authorisedValueCategoryPromise = null;

    function clone(value) {
        return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }

    function deepMerge(base, incoming) {
        if (Array.isArray(base)) return Array.isArray(incoming) ? clone(incoming) : clone(base);
        if (!base || typeof base !== "object") return incoming === undefined ? base : incoming;
        const out = clone(base);
        if (!incoming || typeof incoming !== "object") return out;
        Object.keys(incoming).forEach(function (key) {
            const value = incoming[key];
            if (Array.isArray(value)) out[key] = clone(value);
            else if (value && typeof value === "object" && out[key] && typeof out[key] === "object" && !Array.isArray(out[key])) out[key] = deepMerge(out[key], value);
            else if (value !== undefined) out[key] = value;
        });
        return out;
    }

    function norm(s) {
        return String(s || "")
            .replace(/\u00a0/g, " ")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, function (char) {
            return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char];
        });
    }

    function getJSON(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || "null");
            return value === null ? fallback : value;
        } catch (_) {
            return fallback;
        }
    }

    function setJSON(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
    }

    function language() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            try { return window.PMKConfig.getLanguage() === "en" ? "en" : "fr"; } catch (_) {}
        }
        const value = String(document.documentElement.lang || navigator.language || "fr").toLowerCase();
        return value.startsWith("en") ? "en" : "fr";
    }

    function tr(fr, en) {
        return language() === "en" ? (en || fr || "") : (fr || en || "");
    }

    function fieldLabel(field) {
        return tr(field && field.labelFr, field && field.labelEn) || String(field && (field.kohafield || field.id) || "");
    }

    function supportedPage() {
        return PAGE_DEFINITIONS.some(function (p) { return p.path === location.pathname; });
    }

    function pageEnabled() {
        if (currentConfig.enabled === false) return false;
        const page = (Array.isArray(currentConfig.pages) ? currentConfig.pages : []).find(function (p) { return p && p.path === location.pathname; });
        return !page || page.enabled !== false;
    }

    function activeFields() {
        const fields = Array.isArray(currentConfig.fields) ? currentConfig.fields : DEFAULT_FIELDS;
        return fields.filter(function (f) { return f && f.enabled !== false && (f.kohafield || f.selector); });
    }

    function normalizeFieldId(value, fallbackIndex) {
        const raw = String(value || "").trim();
        if (raw) return raw;
        return "field_" + (fallbackIndex + 1);
    }

    function normalizeConfig(config) {
        const merged = deepMerge(DEFAULT_CONFIG, config || {});
        const seen = new Set();
        merged.fields = (Array.isArray(merged.fields) ? merged.fields : clone(DEFAULT_FIELDS)).map(function (f, index) {
            const base = deepMerge({
                id:"", legacyCode:"", enabled:true, kohafield:"", marcTag:"", marcSubfield:"",
                labelFr:"", labelEn:"", type:"auto", allowClear:true, copyEligible:true, normalize:"none", selector:"",
                sourceMode:"auto",
                source:{
                    authorisedValueCategory:"",
                    authorisedValueCategoryCustom:"",
                    apiEndpoint:"",
                    apiArrayPath:"",
                    apiValuePath:"value",
                    apiLabelPath:"description",
                    fallbackToForm:true,
                    manualValues:[]
                }
            }, f || {});
            let id = normalizeFieldId(base.id || base.legacyCode, index);
            if (seen.has(id)) {
                let n = 2;
                while (seen.has(id + "_" + n)) n++;
                id = id + "_" + n;
            }
            seen.add(id);
            base.id = id;
            if (!base.legacyCode) base.legacyCode = id;
            if (!["auto","form","authorised_values","koha_api","manual"].includes(base.sourceMode)) base.sourceMode = "auto";
            base.source = deepMerge({
                authorisedValueCategory:"",
                authorisedValueCategoryCustom:"",
                apiEndpoint:"",
                apiArrayPath:"",
                apiValuePath:"value",
                apiLabelPath:"description",
                fallbackToForm:true,
                manualValues:[]
            }, base.source || {});
            if (!Array.isArray(base.source.manualValues)) base.source.manualValues = [];
            return base;
        });
        merged.panel.widthPx = Math.max(300, Math.min(760, Number(merged.panel.widthPx) || 420));
        merged.panel.refreshOptionsMs = Math.max(1000, Math.min(60000, Number(merged.panel.refreshOptionsMs) || 5000));
        merged.copyMajority.minOccurrences = Math.max(1, Math.min(999, Number(merged.copyMajority.minOccurrences) || 2));
        merged.copyMajority.thresholdPercent = Math.max(0, Math.min(100, Number(merged.copyMajority.thresholdPercent) || 50));
        merged.presets.maxPresets = Math.max(1, Math.min(500, Number(merged.presets.maxPresets) || 20));
        if (!["legacyNamed","common","kohaUser"].includes(merged.presets.mode)) merged.presets.mode = "legacyNamed";
        return merged;
    }

    function currentPageId() {
        const def = PAGE_DEFINITIONS.find(function (p) { return p.path === location.pathname; });
        return def ? def.id : "";
    }

    function waitForBody() {
        return new Promise(function (resolve) {
            if (document.body) return resolve();
            const timer = setInterval(function () {
                if (document.body) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    }

    const ensureStyle = () => {
        if (document.getElementById("koha_items_assistant_style"))
            return;
        const s = document.createElement("style");
        s.id = "koha_items_assistant_style";
        s.textContent = `
        #${PANEL_ID}{
            position:fixed;z-index:999999;
            background:#ffffff;border:1px solid #dfe6df;border-radius:14px;
            box-shadow:0 14px 42px rgba(24,39,27,.16),0 3px 10px rgba(20,20,40,.07);
            width:420px;font:12.5px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
            color:#1f2430;overflow:hidden;user-select:none;
        }
        #${PANEL_ID} *{box-sizing:border-box;user-select:text}
        #${PANEL_ID}.collapsed .body{display:none}
        #${PANEL_ID} .head{
            display:flex;justify-content:space-between;align-items:center;gap:8px;
            padding:11px 12px;cursor:move;font-weight:700;font-size:13px;
            background:linear-gradient(135deg,#3f8340 0%,#438d43 100%);color:#fff;
            letter-spacing:.2px;border-bottom:1px solid rgba(0,0,0,.08);
        }
        #${PANEL_ID} .head .title{display:flex;align-items:center;gap:8px;font-size:13.5px}
        #${PANEL_ID} .head .subtitle{
            display:inline-block;font-size:10.5px;font-weight:500;color:rgba(255,255,255,.94);
            margin-left:22px;margin-top:3px;letter-spacing:0;
            background:rgba(255,255,255,.12);padding:1px 6px;border-radius:999px;
        }
        #${PANEL_ID} .head .subtitle:empty{display:none}
        #${PANEL_ID} .head-btns{display:flex;gap:4px}
        #${PANEL_ID} .head-btns button{
            background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.08);color:#fff;width:24px;height:24px;
            border-radius:7px;cursor:pointer;font-size:13px;line-height:1;
            display:flex;align-items:center;justify-content:center;transition:background .15s,border-color .15s;
        }
        #${PANEL_ID} .head-btns button:hover{background:rgba(255,255,255,.30);border-color:rgba(255,255,255,.18)}
        #${PANEL_ID} .body{
            padding:10px 12px 12px;max-height:78vh;overflow-y:auto;overflow-x:hidden;
            background:linear-gradient(180deg,#ffffff 0%,#fbfcfb 100%);
            scrollbar-width:thin;scrollbar-color:#cfd8d0 transparent;
        }
        #${PANEL_ID} .body > *,#${PANEL_ID} .actions,#${PANEL_ID} .preset-list,#${PANEL_ID} .preset-controls{max-width:100%;min-width:0}
        #${PANEL_ID} .row{
            margin:0 0 5px;
            display:flex;
            align-items:center;
            gap:8px;
            flex-wrap:nowrap;
        }
        #${PANEL_ID} .row label{
            font-weight:700;color:#566258;font-size:10.5px;
            text-transform:uppercase;letter-spacing:.42px;
            white-space:nowrap;
            flex:0 0 110px;
            min-width:80px;
        }
        #${PANEL_ID} .row .combo-wrap{
            position:relative;
            flex:1 1 auto;
            min-width:0;
        }
        #${PANEL_ID} .clear-checkbox{
            display:flex;
            align-items:center;
            gap:5px;
            font-size:10px;
            color:#7b837c;
            cursor:pointer;
            padding:0 3px;
            white-space:nowrap;
            flex:0 0 64px;
            justify-content:flex-end;
            box-sizing:border-box;
        }
        #${PANEL_ID} .row .clear-checkbox input[type="checkbox"]{
            margin:0;
            cursor:pointer;
            width:13px;
            height:13px;
            flex-shrink:0;
            accent-color:#408540;
        }
        #${PANEL_ID} .combo-wrap{position:relative;flex:1 1 auto;min-width:0}
        #${PANEL_ID} .combo-input{
            width:100%;padding:5.5px 34px 5.5px 8px;border:1.3px solid #d7dfd8;border-radius:8px;
            font:inherit;background:#fff;transition:border-color .15s,background .15s,box-shadow .15s;
            font-size:12px;color:#1f2430;box-shadow:0 1px 1px rgba(20,35,22,.02);
        }
        #${PANEL_ID} .combo-input::placeholder{
            color:#87908a;
            opacity:1;
        }
        #${PANEL_ID} .combo-input:hover:not(:disabled){border-color:#c4cec5}
        #${PANEL_ID} .combo-input:focus{
            outline:none;border-color:#4b924c;background:#fff;
            box-shadow:0 0 0 2px rgba(64,133,64,.12);
        }
        #${PANEL_ID} .combo-input:disabled{background:#f0f2f0;color:#9aa1a0;cursor:not-allowed}
        #${PANEL_ID} select.combo-input:has(option:checked:not([value=""])),
        #${PANEL_ID} input.combo-input:not(:placeholder-shown){
            background:#fbfefb;border-color:#c8d8c9;
        }
        #${PANEL_ID} .combo-clear{
            position:absolute;right:7px;top:50%;transform:translateY(-50%);
            border:none;background:transparent;color:#8f9891;cursor:pointer;font-size:14px;
            width:23px;height:23px;border-radius:999px;display:flex;align-items:center;justify-content:center;
            opacity:.38;transition:opacity .15s,background .15s,color .15s;
        }
        #${PANEL_ID} .combo-wrap:hover .combo-clear,#${PANEL_ID} .combo-clear:focus{opacity:.85}
        #${PANEL_ID} .combo-clear:hover{background:#eef1ee;color:#4d5850;opacity:1}
        #${PANEL_ID} .combo-menu{
            position:absolute;left:0;right:0;top:calc(100% + 4px);background:#fff;
            border:1px solid #dbe0e8;border-radius:9px;box-shadow:0 8px 24px rgba(20,20,40,.16);
            max-height:180px;overflow-y:auto;z-index:10;display:none;
        }
        #${PANEL_ID} .combo-item{padding:5px 10px;cursor:pointer;font-size:12px;display:flex;flex-direction:column;gap:2px}
        #${PANEL_ID} .combo-item:hover,#${PANEL_ID} .combo-item.active{background:#e9f5ea;color:#408540}
        #${PANEL_ID} .combo-item-label{font-size:12px;color:#1f2430}
        #${PANEL_ID} .combo-empty{padding:6px 10px;color:#9aa1b3;font-style:italic}
        #${PANEL_ID} .actions{
            display:flex;gap:6px;margin-top:9px;padding-top:9px;flex-wrap:wrap;
            border-top:1px solid #e8ece8;
        }
        #${PANEL_ID} .actions button{
            flex:1 1 0;padding:6.5px 7px;cursor:pointer;font:inherit;font-weight:700;border-radius:8px;
            border:1px solid transparent;transition:filter .15s,background .15s,border-color .15s,box-shadow .15s,transform .08s;
            font-size:11.5px;min-width:0;max-width:100%;white-space:normal;line-height:1.15;text-align:center;
            min-height:38px;display:flex;align-items:center;justify-content:center;
        }
        #${PANEL_ID} .actions button:active{transform:translateY(1px)}
        #${PANEL_ID} .btn-primary{
            background:#408540;color:#fff;border-color:#397a39;
            box-shadow:0 2px 5px rgba(64,133,64,.20);
        }
        #${PANEL_ID} .btn-primary:hover{filter:brightness(1.06);box-shadow:0 3px 7px rgba(64,133,64,.24)}
        #${PANEL_ID} .btn-secondary{background:#eef7ef;color:#347336;border-color:#d8ead9}
        #${PANEL_ID} .btn-secondary:hover{background:#e4f2e5;border-color:#c8e1ca}
        #${PANEL_ID} .btn-ghost{background:#f5f6f5;color:#646d66;border-color:#e8ebe8}
        #${PANEL_ID} .btn-ghost:hover{background:#ecefec;border-color:#dce1dc}
        #${PANEL_ID} .btn-copy{background:#edf5fa;color:#246f9b;border-color:#d9e9f3}
        #${PANEL_ID} .btn-copy:hover{background:#dfedf6;border-color:#c8deeb}
        #${PANEL_ID} .status{
            font-size:10.5px;color:#536056;margin-top:7px;white-space:pre-wrap;line-height:1.45;
            background:#f7f9f7;border-radius:8px;padding:7px 9px;border:1px solid #e5eae5;
            border-left:3px solid #a9baa9;max-height:100px;overflow-y:auto;
        }
        #${PANEL_ID} .status:empty{display:none}
        #${PANEL_ID} .divider{border:none;border-top:1px solid #e3e8e3;margin:10px 0 8px}
        #${PANEL_ID} .presets-title{
            font-weight:800;font-size:10.5px;text-transform:uppercase;letter-spacing:.55px;
            color:#566258;margin-bottom:5px;display:flex;justify-content:space-between;align-items:center;
        }
        #${PANEL_ID} .presets-count{
            color:#7d887f;font-weight:700;text-transform:none;letter-spacing:0;
            background:#eef2ee;border:1px solid #e2e7e2;border-radius:999px;padding:1px 6px;
        }
        #${PANEL_ID} .presets-actions{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px}
        #${PANEL_ID} .presets-actions .note-presets{font-size:10px;color:#7a837c;flex:1;}
        #${PANEL_ID} .btn-small{padding:4px 8px;font-size:10.5px;border-radius:7px;}
        #${PANEL_ID} .preset-controls{
            padding:7px 7px 1px;margin-bottom:6px;display:none;
            background:#f7f9f7;border:1px solid #e8ece8;border-radius:8px;
        }
        #${PANEL_ID} .preset-controls.open{display:block}
        #${PANEL_ID} .preset-controls .row{margin:0 0 7px;min-width:0}
        #${PANEL_ID} .preset-controls .row > div{flex:1 1 auto;min-width:0;max-width:100%}
        #${PANEL_ID} .preset-list{display:flex;flex-direction:column;gap:5px;max-height:132px;overflow-y:auto;padding-right:2px}
        #${PANEL_ID} .preset-item{
            display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #e3e8e3;
            border-radius:8px;padding:6px 7px;cursor:pointer;transition:background .15s,border-color .15s,box-shadow .15s;
        }
        #${PANEL_ID} .preset-item:hover{
            background:#f7fcf7;border-color:#bed8c0;box-shadow:0 1px 3px rgba(64,133,64,.07);
        }
        #${PANEL_ID} .preset-text{flex:1;min-width:0;font-size:11px;color:#1f2430;line-height:1.25}
        #${PANEL_ID} .preset-text b{
            display:block;color:#397c3b;font-size:11.5px;font-weight:800;margin-bottom:2px;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        }
        #${PANEL_ID} .preset-fields{
            display:block;color:#737d75;font-size:10px;line-height:1.3;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        }
        #${PANEL_ID} .preset-del{
            border:none;background:transparent;color:#b0b8b1;cursor:pointer;font-size:13px;
            width:20px;height:20px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
        }
        #${PANEL_ID} .preset-del:hover{background:#ffe8e8;color:#d9473f}
        #${PANEL_ID} .preset-empty{color:#919991;font-style:italic;font-size:10.5px;padding:5px 2px}
        #${PANEL_ID} .field-modified {
            border-color:#2a7a2a !important;
            background:#eaf6ea !important;
            box-shadow:0 0 0 2px rgba(42,122,42,.20) !important;
            transition:all .3s;
        }
        #${PANEL_ID} .field-modified-highlight {
            animation:flash-green 1.5s ease 3;
        }
        @keyframes flash-green {
            0%,100%{background:#eaf6ea;border-color:#2a7a2a}
            50%{background:#d2edd3;border-color:#1b5e1b}
        }
        #${PANEL_ID} .row .combo-input.text-input{
            background:#fff;border-color:#d7dfd8;
        }
        #${PANEL_ID} .row .combo-input.text-input:focus{
            background:#fff;border-color:#4b924c;
        }
        /* Styles uniques pour les modaux de l'assistant - complètement isolés de Koha */
        #${PANEL_ID}_modal_backdrop {
            position:fixed;
            inset:0;
            background:rgba(2,6,23,.72);
            z-index:2147483646;
            display:flex;
            align-items:center;
            justify-content:center;
            padding:24px;
            box-sizing:border-box;
            font-family:Arial,Helvetica,sans-serif;
            pointer-events:auto;
        }
        #${PANEL_ID}_modal_content {
            background:white;
            padding:22px;
            border-radius:15px;
            box-shadow:0 24px 70px rgba(0,0,0,.35);
            z-index:2147483647;
            max-width:min(92vw,560px);
            max-height:min(84vh,760px);
            overflow-y:auto;
            width:100%;
            box-sizing:border-box;
            border:1px solid #dfe6df;
            isolation:isolate;
            transform:translateZ(0);
        }
        #${PANEL_ID}_modal_content h3 {
            margin:0 0 10px;
            color:#26332a;
            font-size:16px;
        }
        #${PANEL_ID}_modal_content ul {
            list-style:none;
            padding:0;
            margin:12px 0;
            border:1px solid #edf0ed;border-radius:9px;overflow:hidden;
        }
        #${PANEL_ID}_modal_content ul li {
            padding:7px 9px;
            border-bottom:1px solid #f0f2f0;
            font-size:12.5px;
            background:#fff;
        }
        #${PANEL_ID}_modal_content ul li:last-child{border-bottom:none}
        #${PANEL_ID}_modal_content ul li strong {
            color:#408540;
        }
        #${PANEL_ID}_modal_content .modal-actions {
            display:flex;
            gap:8px;
            margin-top:15px;
            justify-content:flex-end;
        }
        #${PANEL_ID}_modal_content .modal-actions button {
            padding:8px 18px;
            border-radius:8px;
            border:1px solid #dbe0e8;
            cursor:pointer;
            font-weight:700;
            font-size:12.5px;
        }
        #${PANEL_ID}_modal_content .modal-actions .btn-confirm {
            background:#408540;
            color:white;
            border-color:#397a39;
            box-shadow:0 2px 5px rgba(64,133,64,.16);
        }
        #${PANEL_ID}_modal_content .modal-actions .btn-confirm:hover {
            filter:brightness(1.06);
        }
        #${PANEL_ID}_modal_content .modal-actions .btn-cancel {
            background:#f4f6f4;
            color:#5a665d;
            border-color:#e3e7e3;
        }
        #${PANEL_ID}_modal_content .modal-actions .btn-cancel:hover {
            background:#ebefeb;
        }
        #${PANEL_ID}_modal_content .modal-note {
            font-size:11px;
            color:#69736b;
            margin-top:10px;
            padding:8px 9px;
            background:#f7f9f7;
            border:1px solid #e7ebe7;
            border-radius:7px;
        }
        #${PANEL_ID}_modal_content .preset-name-input {
            width:100%;
            padding:8px 11px;
            border:1.3px solid #d7dfd8;
            border-radius:8px;
            font-size:13px;
            margin:8px 0;
        }
        #${PANEL_ID}_modal_content .preset-name-input:focus {
            outline:none;
            border-color:#4b924c;
            box-shadow:0 0 0 2px rgba(64,133,64,.12);
        }
`;
        document.head.appendChild(s);
    };

    function ensureResponsiveStyle() {
        if (document.getElementById("koha_items_assistant_responsive_style")) return;
        const style = document.createElement("style");
        style.id = "koha_items_assistant_responsive_style";
        style.textContent = `
            #${PANEL_ID}{max-width:calc(100vw - 24px)}
            #${PANEL_ID} .pmk110-config-anchor{display:inline-flex;align-items:center;justify-content:center;min-width:0}
            @media (max-width: 576px){
                #${PANEL_ID}{left:8px !important;right:8px !important;top:58px !important;width:auto !important;max-width:none}
                #${PANEL_ID} .body{max-height:calc(100vh - 115px)}
                #${PANEL_ID} .row{flex-wrap:wrap}
                #${PANEL_ID} .row label{flex:1 0 100%;min-width:0}
                #${PANEL_ID} .clear-checkbox{flex:0 0 auto}
            }
        `;
        document.head.appendChild(style);
    }

    function cssEscapeValue(value) {
        const raw = String(value == null ? "" : value);
        if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(raw);
        return raw.replace(/([\"'\\.#[\]:(),>+~*= ])/g, "\\$1");
    }

    function selectorCandidates(field) {
        const list = [];
        const custom = String(field && field.selector || "").trim();
        if (custom) list.push(custom);
        const kohafield = String(field && field.kohafield || "").trim();
        if (kohafield) {
            const escaped = cssEscapeValue(kohafield);
            list.push(`[name="${escaped}"]`);
            if (kohafield.startsWith("items.")) {
                const bare = kohafield.slice(6);
                const escapedBare = cssEscapeValue(bare);
                list.push(`[name="${escapedBare}"]`, `[name="items[${escapedBare}]"]`);
            }
        }
        return Array.from(new Set(list));
    }

    function getFieldElement(field) {
        if (!field) return null;
        const candidates = selectorCandidates(field);
        for (const selector of candidates) {
            let matches = [];
            try {
                matches = Array.from(document.querySelectorAll(selector)).filter(function (el) {
                    return el && el.type !== "hidden" && !el.closest("#" + PANEL_ID);
                });
            } catch (_) {}
            if (matches.length === 1) return matches[0];
            if (matches.length > 1) {
                const visible = matches.filter(function (el) { return el.offsetParent !== null || el.getClientRects().length > 0; });
                if (visible.length === 1) return visible[0];
                const enabled = visible.find(function (el) { return !el.disabled; });
                if (enabled) return enabled;
            }
        }
        return null;
    }

    async function findFieldElementWithRetry(field, attempt) {
        attempt = attempt || 0;
        const el = getFieldElement(field);
        if (el || attempt >= 8) return el;
        await new Promise(function (resolve) { setTimeout(resolve, 180); });
        return findFieldElementWithRetry(field, attempt + 1);
    }

    function fieldType(field, el) {
        if (el) {
            if (el.tagName === "SELECT") return "select";
            if (el.tagName === "TEXTAREA") return "input";
            if (el.tagName === "INPUT") return "input";
        }
        return field && field.type === "select" ? "select" : "input";
    }

    function getFieldValue(el) {
        return el && "value" in el ? String(el.value || "") : "";
    }

    function getSelectOptions(el) {
        if (!el || el.tagName !== "SELECT") return [];
        return Array.from(el.options || []).map(function (opt) {
            return { value:String(opt.value || ""), label:String(opt.textContent || "").trim() };
        });
    }

    function getPathValue(object, path) {
        const cleanPath = String(path || "").trim();
        if (!cleanPath) return object;
        return cleanPath.split(".").reduce(function (value, key) {
            if (value == null) return undefined;
            return value[key];
        }, object);
    }

    function uniqueOptions(options) {
        const result = [];
        const seen = new Set();
        (Array.isArray(options) ? options : []).forEach(function (option) {
            if (!option) return;
            const value = String(option.value == null ? "" : option.value);
            const label = String(option.label == null ? value : option.label).trim();
            const key = value + "\u0000" + label;
            if (seen.has(key)) return;
            seen.add(key);
            result.push({ value:value, label:label });
        });
        return result;
    }

    async function kohaApiFetch(endpoint) {
        const raw = String(endpoint || "").trim();
        if (!raw) throw new Error("missing_endpoint");
        const url = new URL(raw, window.location.origin);
        if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/v1/")) {
            throw new Error("invalid_koha_api_endpoint");
        }
        const response = await fetch(url.href, {
            method: "GET",
            credentials: "same-origin",
            headers: { "Accept":"application/json" }
        });
        if (!response.ok) throw new Error("koha_api_" + response.status);
        return response.json();
    }

    function effectiveAuthorisedValueCategory(field) {
        const source = field && field.source || {};
        const selected = String(source.authorisedValueCategory || "").trim();
        if (selected === "__custom__") return String(source.authorisedValueCategoryCustom || "").trim();
        return selected;
    }

    function manualOptions(field) {
        const values = field && field.source && Array.isArray(field.source.manualValues)
            ? field.source.manualValues
            : [];
        return uniqueOptions(values.filter(function (item) {
            return item && item.enabled !== false && String(item.value || "").trim() !== "";
        }).map(function (item) {
            const value = String(item.value || "").trim();
            return {
                value:value,
                label:tr(String(item.labelFr || value), String(item.labelEn || item.labelFr || value))
            };
        }));
    }

    async function loadAuthorisedValueCategories(force) {
        if (!force && authorisedValueCategoryCache.length) return authorisedValueCategoryCache.slice();
        if (!force && authorisedValueCategoryPromise) return authorisedValueCategoryPromise;
        authorisedValueCategoryPromise = (async function () {
            try {
                const data = await kohaApiFetch("/api/v1/authorised_value_categories?_per_page=1000&_order_by=%2Bcategory_name");
                const categories = (Array.isArray(data) ? data : []).map(function (item) {
                    return String(item && (item.category_name || item.name) || "").trim();
                }).filter(Boolean);
                authorisedValueCategoryCache = Array.from(new Set(categories)).sort(function (a,b) {
                    return a.localeCompare(b, language());
                });
            } catch (_) {
                authorisedValueCategoryCache = [];
            } finally {
                authorisedValueCategoryPromise = null;
            }
            return authorisedValueCategoryCache.slice();
        })();
        return authorisedValueCategoryPromise;
    }

    function fieldFromConfigPath(rootObject, fieldPath) {
        if (!rootObject || !Array.isArray(fieldPath)) return null;
        const idx = fieldPath.indexOf("fields");
        if (idx < 0) return null;
        const index = Number(fieldPath[idx + 1]);
        if (!Number.isInteger(index)) return null;
        return Array.isArray(rootObject.fields) ? rootObject.fields[index] || null : null;
    }

    function authorisedValueCategoryOptions(rootObject, fieldPath) {
        const currentField = fieldFromConfigPath(rootObject, fieldPath);
        const current = currentField ? String(currentField.source && currentField.source.authorisedValueCategory || "") : "";
        const options = [{ value:"", label:{ fr:"— Aucune catégorie —", en:"— No category —" } }];
        const names = authorisedValueCategoryCache.slice();
        if (current && current !== "__custom__" && !names.includes(current)) names.push(current);
        names.sort(function (a,b) { return a.localeCompare(b, language()); });
        names.forEach(function (name) {
            options.push({ value:name, label:{ fr:name, en:name } });
        });
        options.push({ value:"__custom__", label:{ fr:"Autre catégorie / saisie manuelle…", en:"Other category / manual entry…" } });
        return options;
    }

    async function loadAuthorisedValueOptions(field) {
        const category = effectiveAuthorisedValueCategory(field);
        if (!category) throw new Error("missing_authorised_value_category");
        const key = "av:" + category;
        if (sourceValueCache.has(key)) return clone(sourceValueCache.get(key));
        const endpoint = "/api/v1/authorised_value_categories/" +
            encodeURIComponent(category) + "/authorised_values?_per_page=1000&_order_by=%2Bdescription";
        const data = await kohaApiFetch(endpoint);
        const options = uniqueOptions((Array.isArray(data) ? data : []).map(function (item) {
            const value = String(item && item.value != null ? item.value : "").trim();
            const description = String(item && (item.description || item.opac_description || item.value) || "").trim();
            return value ? { value:value, label:description || value } : null;
        }).filter(Boolean));
        sourceValueCache.set(key, clone(options));
        return options;
    }

    async function loadGenericApiOptions(field) {
        const source = field && field.source || {};
        const endpoint = String(source.apiEndpoint || "").trim();
        if (!endpoint) throw new Error("missing_api_endpoint");
        const key = "api:" + endpoint + "|" + String(source.apiArrayPath || "") + "|" +
            String(source.apiValuePath || "") + "|" + String(source.apiLabelPath || "");
        if (sourceValueCache.has(key)) return clone(sourceValueCache.get(key));
        const payload = await kohaApiFetch(endpoint);
        const list = source.apiArrayPath ? getPathValue(payload, source.apiArrayPath) : payload;
        if (!Array.isArray(list)) throw new Error("api_result_is_not_array");
        const valuePath = String(source.apiValuePath || "value").trim();
        const labelPath = String(source.apiLabelPath || source.apiValuePath || "description").trim();
        const options = uniqueOptions(list.map(function (item) {
            const rawValue = getPathValue(item, valuePath);
            const rawLabel = getPathValue(item, labelPath);
            if (rawValue == null || String(rawValue).trim() === "") return null;
            return {
                value:String(rawValue).trim(),
                label:String(rawLabel == null || rawLabel === "" ? rawValue : rawLabel).trim()
            };
        }).filter(Boolean));
        sourceValueCache.set(key, clone(options));
        return options;
    }

    function fieldHasConfiguredListSource(field) {
        if (!field) return false;
        const mode = String(field.sourceMode || "auto");
        const source = field.source || {};
        if (mode === "manual" || mode === "authorised_values" || mode === "koha_api") return true;
        if (mode !== "auto") return false;
        return !!(
            effectiveAuthorisedValueCategory(field) ||
            String(source.apiEndpoint || "").trim() ||
            (Array.isArray(source.manualValues) && source.manualValues.some(function (item) {
                return item && item.enabled !== false && String(item.value || "").trim() !== "";
            }))
        );
    }

    async function loadFieldOptions(field, formElement) {
        const mode = String(field && field.sourceMode || "auto");
        const source = field && field.source || {};
        const formOptions = getSelectOptions(formElement);
        const fallback = source.fallbackToForm !== false;

        if (mode === "form") return formOptions;
        if (mode === "manual") {
            const list = manualOptions(field);
            return list.length || !fallback ? list : formOptions;
        }
        if (mode === "authorised_values") {
            try {
                const list = await loadAuthorisedValueOptions(field);
                return list.length || !fallback ? list : formOptions;
            } catch (_) {
                return fallback ? formOptions : [];
            }
        }
        if (mode === "koha_api") {
            try {
                const list = await loadGenericApiOptions(field);
                return list.length || !fallback ? list : formOptions;
            } catch (_) {
                return fallback ? formOptions : [];
            }
        }

        /* Auto : VA explicite > API explicite > valeurs manuelles > formulaire Koha. */
        if (effectiveAuthorisedValueCategory(field)) {
            try {
                const list = await loadAuthorisedValueOptions(field);
                if (list.length) return list;
            } catch (_) {}
        }
        if (String(source.apiEndpoint || "").trim()) {
            try {
                const list = await loadGenericApiOptions(field);
                if (list.length) return list;
            } catch (_) {}
        }
        const manual = manualOptions(field);
        if (manual.length) return manual;
        return formOptions;
    }

    function triggerNativeAndJQuery(element) {
        if (!element) return;
        const dispatch = function () {
            try { element.dispatchEvent(new Event("input", { bubbles:true })); } catch (_) {}
            try { element.dispatchEvent(new Event("change", { bubbles:true })); } catch (_) {}
            if (window.jQuery) {
                try {
                    const $el = window.jQuery(element);
                    $el.trigger("input");
                    $el.trigger("change");
                    if ($el.data("select2")) $el.trigger("change.select2");
                } catch (_) {}
            }
        };
        dispatch();
        setTimeout(dispatch, 40);
    }

    function normalizeFieldValue(field, value) {
        let result = String(value == null ? "" : value).trim();
        if (field && field.normalize === "price") result = result.replace(/,/g, ".");
        return result;
    }

    function resolveSelectOptionValue(selectEl, targetValue) {
        if (!selectEl || selectEl.tagName !== "SELECT") return null;
        const wanted = norm(targetValue);
        const match = Array.from(selectEl.options || []).find(function (opt) {
            return norm(opt.value) === wanted || norm(opt.textContent) === wanted;
        });
        return match ? String(match.value) : null;
    }

    function setFieldValue(field, el, value) {
        if (!el) return false;
        const clean = normalizeFieldValue(field, value);
        if (el.tagName === "SELECT") {
            const resolved = resolveSelectOptionValue(el, clean);
            if (resolved === null) return false;
            Array.from(el.options || []).forEach(function (opt) { opt.selected = String(opt.value) === resolved; });
            el.value = resolved;
        } else {
            el.value = clean;
        }
        triggerNativeAndJQuery(el);
        return true;
    }

    function subfieldRow(el) {
        return el && el.closest ? el.closest(".subfield_line") : null;
    }

    function isFieldMandatory(el) {
        const row = subfieldRow(el);
        if (!row) return false;
        const mandatory = row.querySelector('input[name="mandatory"]');
        return !!mandatory && String(mandatory.value) === "1";
    }

    function isBatchModPage() {
        return /\/cgi-bin\/koha\/tools\/batchMod\.pl/i.test(location.pathname);
    }

    function isAddItemPage() {
        return /\/cgi-bin\/koha\/cataloguing\/additem\.pl/i.test(location.pathname);
    }

    function findNativeBatchClearCheckbox(el) {
        if (!el || !isBatchModPage()) return null;
        const fieldName = String(el.getAttribute("name") || el.name || "");
        if (!fieldName) return null;
        const form = el.closest("form") || document.querySelector("form");
        if (!form) return null;
        const boxes = Array.from(form.querySelectorAll('input[type="checkbox"][name="disable_input"]'));
        return boxes.find(function (cb) {
            const v = String(cb.value || "");
            return v === fieldName || norm(v) === norm(fieldName);
        }) || null;
    }

    function canClearField(field, el) {
        if (!field || field.allowClear === false || !el) return false;
        if (isBatchModPage()) return !!findNativeBatchClearCheckbox(el);
        if (isFieldMandatory(el)) return false;
        if (el.tagName === "SELECT") return Array.from(el.options || []).some(function (o) { return String(o.value) === ""; });
        return !el.readOnly && !el.disabled;
    }

    function setBatchModClearFlag(el, shouldClear) {
        const checkbox = findNativeBatchClearCheckbox(el);
        if (!checkbox) return false;
        if (checkbox.checked !== !!shouldClear) {
            try { checkbox.click(); } catch (_) {
                checkbox.checked = !!shouldClear;
                try { checkbox.dispatchEvent(new Event("change", { bubbles:true })); } catch (_) {}
            }
        }
        /* Le 031 peut demander une confirmation asynchrone : le clic natif a bien été transmis à Koha. */
        return true;
    }

    function clearFieldThroughKoha(field, el) {
        if (!field || !el || field.allowClear === false) return false;
        if (isBatchModPage()) return setBatchModClearFlag(el, true);
        if (!canClearField(field, el)) return false;
        if (el.tagName === "SELECT") {
            const blank = Array.from(el.options || []).find(function (o) { return String(o.value) === ""; });
            if (!blank) return false;
            el.value = "";
        } else {
            el.value = "";
        }
        triggerNativeAndJQuery(el);
        return true;
    }

    function cancelKohaClear(field, el) {
        if (!field || !el) return;
        if (isBatchModPage()) {
            const checkbox = findNativeBatchClearCheckbox(el);
            if (checkbox && checkbox.checked) {
                try { checkbox.click(); } catch (_) { checkbox.checked = false; }
            }
        }
    }

    function tableFieldMatch(source, field, allowText) {
        if (!source || !field) return false;
        const col = String(source.dataset && source.dataset.colname || source.getAttribute && source.getAttribute("data-colname") || "");
        const text = String(source.textContent || "").trim();
        const kohafield = String(field.kohafield || "");
        const bare = kohafield.startsWith("items.") ? kohafield.slice(6) : kohafield;
        const candidates = [field.id, field.legacyCode, kohafield, bare, field.marcSubfield].filter(Boolean).map(norm);
        if (col && candidates.includes(norm(col))) return true;
        if (allowText) {
            const labels = [field.labelFr, field.labelEn, bare, kohafield].filter(Boolean).map(norm);
            if (text && labels.includes(norm(text))) return true;
        }
        return false;
    }

    function fieldForSource(source, allowText) {
        return activeFields().find(function (field) { return field.copyEligible !== false && tableFieldMatch(source, field, allowText); }) || null;
    }

    function getItemValuesFromTableRow(row) {
        const values = {};
        const headers = Array.from(document.querySelectorAll("#itemst thead th"));
        Array.from(row.querySelectorAll("td")).forEach(function (cell, index) {
            const text = String(cell.textContent || "").trim();
            if (!text || cell.querySelector('input[type="checkbox"]') || cell.querySelector(".btn-group")) return;
            const field = fieldForSource(headers[index], true) || fieldForSource(cell, false);
            if (field) values[field.id] = text;
        });
        return values;
    }

    function getExistingItems() {
        const table = document.querySelector("#itemst");
        if (!table) return [];
        return Array.from(table.querySelectorAll("tbody tr")).map(getItemValuesFromTableRow).filter(function (v) { return Object.keys(v).length > 0; });
    }

    function computeMostCommonValues(items) {
        const result = {};
        const countsByField = {};
        activeFields().forEach(function (field) {
            if (field.copyEligible !== false) countsByField[field.id] = {};
        });
        items.forEach(function (item) {
            Object.entries(item).forEach(function (entry) {
                const id = entry[0], value = String(entry[1] || "").trim();
                if (!value || !countsByField[id]) return;
                countsByField[id][value] = (countsByField[id][value] || 0) + 1;
            });
        });
        const cfg = currentConfig.copyMajority || {};
        const minOccurrences = Math.max(1, Number(cfg.minOccurrences) || 2);
        const threshold = Math.max(0, Math.min(100, Number(cfg.thresholdPercent) || 50));
        Object.entries(countsByField).forEach(function (entry) {
            const id = entry[0], counts = entry[1];
            let max = 0, best = "", tied = false;
            Object.entries(counts).forEach(function (pair) {
                const value = pair[0], count = pair[1];
                if (count > max) { max = count; best = value; tied = false; }
                else if (count === max && count > 0) tied = true;
            });
            if (!best || max < minOccurrences) return;
            if (cfg.rejectTies !== false && tied) return;
            const percent = items.length ? (max * 100 / items.length) : 0;
            const thresholdOk = cfg.strictGreaterThanThreshold !== false ? percent > threshold : percent >= threshold;
            if (thresholdOk) result[id] = best;
        });
        return result;
    }

    function makeCombo(row, field, options, isInput, showClearCheckbox) {
        const placeholder = isInput ? fieldLabel(field) : tr("Rechercher ", "Search ") + fieldLabel(field) + "…";
        const normalOptions = Array.isArray(options) ? options.map(function (o) { return Object.assign({}, o); }) : [];
        const hasEmpty = normalOptions.some(function (o) { return String(o.value) === ""; });
        row.innerHTML = `
            <div class="combo-wrap">
                ${isInput
                    ? `<input type="text" class="combo-input text-input" placeholder="${escapeHTML(placeholder)}" autocomplete="off">`
                    : `<select class="combo-input">${!hasEmpty ? `<option value="">${escapeHTML(placeholder)}</option>` : ""}${normalOptions.map(function (o) { return `<option value="${escapeHTML(o.value)}">${escapeHTML(o.label || o.value)}</option>`; }).join("")}</select>`}
                <button type="button" class="combo-clear" tabindex="-1" title="${escapeHTML(tr("Vider le champ du panneau", "Clear the panel field"))}">×</button>
            </div>
            ${showClearCheckbox ? `<label class="clear-checkbox" title="${escapeHTML(tr("Cocher pour demander à Koha d’effacer ce champ lors de l’application", "Check to ask Koha to clear this field when applying"))}"><input type="checkbox" class="clear-checkbox-input"><span>${escapeHTML(tr("Vider", "Clear"))}</span></label>` : ""}
        `;
        const input = row.querySelector(".combo-input");
        const clearBtn = row.querySelector(".combo-clear");
        const clearCheckbox = row.querySelector(".clear-checkbox-input");
        let value = "";
        let onChangeCb = function () {};

        function updateSelectValue(newValue, silent) {
            const wanted = norm(newValue);
            const options = Array.from(input.options || []);
            const match = options.find(function (opt) { return norm(opt.value) === wanted || norm(opt.textContent) === wanted; });
            if (match) {
                input.value = match.value;
                value = String(match.value || "");
            } else if (!wanted) {
                const blank = options.find(function (opt) { return String(opt.value) === ""; });
                if (blank) { input.value = ""; value = ""; }
            }
            if (!silent) onChangeCb(value);
        }

        if (isInput) {
            input.addEventListener("input", function () { value = input.value; onChangeCb(value); });
        } else {
            input.addEventListener("change", function () { value = input.value || ""; onChangeCb(value); });
        }
        clearBtn.addEventListener("click", function () {
            if (input.disabled) return;
            value = "";
            input.value = "";
            onChangeCb(value);
            input.focus();
        });

        return {
            setItems: function (items) {
                if (!input || input.tagName !== "SELECT") return;
                const existing = input.value;
                const list = Array.isArray(items) ? items : [];
                const empty = list.some(function (o) { return String(o.value) === ""; });
                input.innerHTML = (!empty ? `<option value="">${escapeHTML(placeholder)}</option>` : "") + list.map(function (o) { return `<option value="${escapeHTML(o.value)}">${escapeHTML(o.label || o.value)}</option>`; }).join("");
                if (existing && Array.from(input.options).some(function (o) { return String(o.value) === String(existing); })) input.value = existing;
            },
            setValue: function (newValue, silent) {
                value = String(newValue == null ? "" : newValue);
                if (input.tagName === "SELECT") updateSelectValue(value, silent);
                else { input.value = value; if (!silent) onChangeCb(value); }
            },
            getValue: function () { return value; },
            onChange: function (fn) { onChangeCb = typeof fn === "function" ? fn : function () {}; },
            getClearFlag: function () { return !!(clearCheckbox && clearCheckbox.checked); },
            setClearFlag: function (checked) { if (clearCheckbox) clearCheckbox.checked = !!checked; }
        };
    }

    function canConfigure() {
        if (window.PMKConfig && typeof window.PMKConfig.isKohaSuperlibrarian === "function") {
            try { return !!window.PMKConfig.isKohaSuperlibrarian(); } catch (_) {}
        }
        const el = document.querySelector('#logged-in-info-full .loggedinusername[data-loggedinusername], .loggedinusername[data-loggedinusername]');
        if (!el) return false;
        return el.dataset.isSuperlibrarian === "is_superlibrarian" || el.classList.contains("is_superlibrarian");
    }

    function mountContextButton(root) {
        if (!root || !canConfigure() || !window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        const anchor = root.querySelector(".pmk110-config-anchor");
        if (!anchor) return;
        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "append",
                contextKey: "item-entry-assistant",
                context: { pageId: currentPageId(), sectionId: "fields" }
            });
        } catch (_) {}
    }

    function readLoggedInUsername() {
        const el = document.querySelector('#logged-in-info-full .loggedinusername[data-loggedinusername], .loggedinusername[data-loggedinusername]');
        if (el) {
            const data = String(el.getAttribute("data-loggedinusername") || "").trim();
            if (data) return data;
            const text = String(el.textContent || "").trim();
            if (text) return text;
        }
        return "";
    }

    function safeOwnerId(value) {
        return norm(value).replace(/\s+/g, "_").replace(/[^a-z0-9_.-]/g, "").slice(0, 120);
    }

    async function ensureFirebase() {
        if (firebaseDb && firebaseApi) return true;
        if (firebaseBootPromise) return firebaseBootPromise;
        const cfg = currentConfig.firebase || {};
        if (cfg.enabled === false) return false;
        const fb = cfg.config || {};
        if (!fb.apiKey || !fb.projectId || /VOTRE|votre-projet/i.test(String(fb.apiKey) + String(fb.projectId))) return false;
        firebaseBootPromise = (async function () {
            try {
                const version = String(cfg.sdkVersion || "11.5.0").replace(/[^0-9.]/g, "") || "11.5.0";
                const appModule = await import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`);
                const firestore = await import(`https://www.gstatic.com/firebasejs/${version}/firebase-firestore.js`);
                const appName = "pmk110-" + safeOwnerId(fb.projectId || "items");
                let app = appModule.getApps ? appModule.getApps().find(function (candidate) { return candidate.name === appName; }) : null;
                if (!app) app = appModule.initializeApp(fb, appName);
                firebaseDb = firestore.getFirestore(app);
                firebaseApi = firestore;
                return true;
            } catch (_) {
                firebaseDb = null;
                firebaseApi = null;
                return false;
            } finally {
                firebaseBootPromise = null;
            }
        })();
        return firebaseBootPromise;
    }

    function presetCollectionName() {
        return String(currentConfig.presets && currentConfig.presets.collection || "koha_items_assistant_presets");
    }

    function maxPresets() {
        return Math.max(1, Number(currentConfig.presets && currentConfig.presets.maxPresets) || 20);
    }

    async function listFirebaseOwners() {
        if (!(await ensureFirebase())) return [];
        const snap = await firebaseApi.getDocs(firebaseApi.collection(firebaseDb, presetCollectionName()));
        return snap.docs
            .filter(function (d) { return !String(d.id).startsWith("__pmk110_"); })
            .map(function (d) { const data = d.data() || {}; return { id:d.id, ownerName:data.ownerName || d.id }; })
            .sort(function (a,b) { return String(a.ownerName).localeCompare(String(b.ownerName), language()); });
    }

    async function readFirebasePresetDoc(ownerId) {
        if (!(await ensureFirebase()) || !ownerId) return { ownerName:"", presets:[] };
        const ref = firebaseApi.doc(firebaseDb, presetCollectionName(), ownerId);
        const snap = await firebaseApi.getDoc(ref);
        if (!snap.exists()) return { ownerName:"", presets:[] };
        const data = snap.data() || {};
        return { ownerName:data.ownerName || ownerId, presets:Array.isArray(data.presets) ? data.presets : [] };
    }

    async function writeFirebasePresetDoc(ownerId, ownerName, presets) {
        if (!(await ensureFirebase()) || !ownerId) return false;
        const ref = firebaseApi.doc(firebaseDb, presetCollectionName(), ownerId);
        await firebaseApi.setDoc(ref, { ownerName:ownerName, presets:presets, updatedAt:firebaseApi.serverTimestamp() }, { merge:true });
        return true;
    }

    async function deleteFirebasePresetDoc(ownerId) {
        if (!(await ensureFirebase()) || !ownerId) return false;
        await firebaseApi.deleteDoc(firebaseApi.doc(firebaseDb, presetCollectionName(), ownerId));
        return true;
    }

    function presetIdentityForAutomaticMode() {
        const mode = String(currentConfig.presets && currentConfig.presets.mode || "legacyNamed");
        if (mode === "common") return { id:"__pmk110_common__", name:tr("Listes communes", "Shared presets") };
        if (mode === "kohaUser") {
            const username = readLoggedInUsername();
            if (!username) return null;
            return { id:"__pmk110_user_" + safeOwnerId(username), name:username };
        }
        return null;
    }

    function createPanel() {
        const old = document.getElementById(PANEL_ID);
        if (old) old.remove();
        if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
        if (!supportedPage() || !pageEnabled()) return;

        ensureStyle();
        ensureResponsiveStyle();

        const remember = currentConfig.panel.rememberStateAndPosition !== false;
        const savedPanelState = remember ? getJSON(PANEL_STATE_KEY, { collapsed: currentConfig.panel.collapsedByDefault !== false }) : { collapsed: currentConfig.panel.collapsedByDefault !== false };
        const savedPosition = remember ? getJSON(PANEL_POSITION_KEY, { left:null, top:70, right:20 }) : { left:null, top:70, right:20 };
        const fields = activeFields();
        const root = document.createElement("div");
        root.id = PANEL_ID;
        root.style.width = Math.max(300, Number(currentConfig.panel.widthPx) || 420) + "px";
        if (savedPanelState.collapsed) root.classList.add("collapsed");
        if (savedPosition.left !== null && window.innerWidth > 576) {
            root.style.left = savedPosition.left + "px";
            root.style.top = savedPosition.top + "px";
            root.style.right = "auto";
        } else {
            root.style.top = (savedPosition.top == null ? 70 : savedPosition.top) + "px";
            root.style.right = (savedPosition.right == null ? 20 : savedPosition.right) + "px";
        }

        const rowsHtml = fields.map(function (field) {
            return `<div class="row" data-row="${escapeHTML(field.id)}"><label>${escapeHTML(fieldLabel(field))}</label></div>`;
        }).join("");
        const legacyMode = String(currentConfig.presets.mode || "legacyNamed") === "legacyNamed";
        root.innerHTML = `
            <div class="head">
                <span><span class="title">${escapeHTML(tr("Assistance exemplaires", "Item assistance"))}</span><span class="subtitle" id="koha_items_current_list"></span></span>
                <div class="head-btns"><span class="pmk110-config-anchor"></span><button type="button" data-pmk110-act="collapse" title="${escapeHTML(tr("Réduire", "Collapse"))}">–</button></div>
            </div>
            <div class="body">
                ${rowsHtml}
                <div class="actions">
                    <button type="button" class="btn-primary" data-act="apply">${escapeHTML(tr("Appliquer", "Apply"))}</button>
                    <button type="button" class="btn-ghost" data-act="clearAll" title="${escapeHTML(tr("Vide uniquement les valeurs préparées dans le panneau", "Clears only values prepared in the panel"))}">${escapeHTML(tr("Vider", "Clear"))}</button>
                    <button type="button" class="btn-copy" data-act="copyFromOthers">${escapeHTML(tr("Copier au + nombreux", "Copy majority"))}</button>
                    <button type="button" class="btn-secondary" data-act="save">${escapeHTML(tr("Mémoriser", "Save preset"))}</button>
                </div>
                <div class="status" id="koha_items_status"></div>
                <hr class="divider">
                <div class="presets-title"><span>${escapeHTML(tr("Mémorisations", "Presets"))}</span><span class="presets-count" id="koha_items_presets_count"></span></div>
                <div class="presets-actions"><span class="note-presets">${escapeHTML(legacyMode ? tr("Sélectionnez une liste ou créez-en une.", "Select or create a list.") : tr("La liste est déterminée automatiquement par le mode configuré.", "The list is selected automatically by the configured mode."))}</span><div style="display:flex;gap:6px;align-items:center"><button type="button" class="btn-secondary btn-small" data-act="togglePresetControls">${escapeHTML(tr("Options", "Options"))}</button></div></div>
                <div class="preset-controls" id="koha_items_preset_controls">
                    ${legacyMode ? `<div class="row" data-row="ownerSelect"><label>${escapeHTML(tr("Liste nominative", "Named list"))}</label><select class="combo-input" data-owner-select style="width:100%"></select></div><div class="row" data-row="owner"><label>${escapeHTML(tr("Créer une liste", "Create list"))}</label><div style="display:flex;gap:8px;align-items:center"><input type="text" class="combo-input" data-owner-input placeholder="${escapeHTML(tr("Nom Prénom (requis)", "Full name (required)"))}"><button type="button" class="btn-secondary btn-small" data-act="createList">${escapeHTML(tr("Créer liste", "Create list"))}</button></div></div>` : `<div class="modal-note">${escapeHTML(currentConfig.presets.mode === "kohaUser" ? tr("Mémorisations liées automatiquement au compte Koha connecté.", "Presets automatically linked to the signed-in Koha account.") : tr("Mémorisations communes à tous les utilisateurs.", "Presets shared by all users."))}</div>`}
                </div>
                <div class="preset-list" id="koha_items_presets"></div>
            </div>
        `;
        document.body.appendChild(root);

        // Isoler les interactions du volet 110 des gestionnaires délégués
        // d'autres scripts Koha/PMK (plusieurs modules utilisent des data-act
        // génériques comme "collapse"). Les gestionnaires internes des
        // contrôles s'exécutent normalement, puis le clic ne remonte pas au
        // document.
        root.addEventListener("click", function (event) {
            event.stopPropagation();
        });

        mountContextButton(root);

        const status = root.querySelector("#koha_items_status");
        const presetsList = root.querySelector("#koha_items_presets");
        const presetsCount = root.querySelector("#koha_items_presets_count");
        const currentListLabel = root.querySelector("#koha_items_current_list");
        const ownerInput = root.querySelector("[data-owner-input]");
        const ownerSelect = root.querySelector("[data-owner-select]");
        const createListBtn = root.querySelector('[data-act="createList"]');
        const combos = {};
        const state = {};

        function savePosition() {
            if (!remember) return;
            const rect = root.getBoundingClientRect();
            setJSON(PANEL_POSITION_KEY, { left:Math.round(rect.left), top:Math.round(rect.top), right:null });
        }

        (function installDrag() {
            const head = root.querySelector(".head");
            let dragging = false, offX = 0, offY = 0;
            head.addEventListener("mousedown", function (event) {
                if (window.innerWidth <= 576 || event.target.closest(".head-btns")) return;
                dragging = true;
                const rect = root.getBoundingClientRect();
                offX = event.clientX - rect.left;
                offY = event.clientY - rect.top;
                root.style.right = "auto";
            });
            document.addEventListener("mousemove", function (event) {
                if (!dragging) return;
                root.style.left = Math.max(0, Math.min(window.innerWidth - root.offsetWidth, event.clientX - offX)) + "px";
                root.style.top = Math.max(0, event.clientY - offY) + "px";
            });
            document.addEventListener("mouseup", function () { if (dragging) { dragging = false; savePosition(); } });
        })();

        fields.forEach(function (field) {
            const row = root.querySelector(`[data-row="${cssEscapeValue(field.id)}"]`);
            if (!row) return;
            const el = getFieldElement(field);
            const targetType = fieldType(field, el);
            const useList = targetType === "select" || fieldHasConfiguredListSource(field);
            const immediateOptions = useList
                ? (String(field.sourceMode || "auto") === "manual" ? manualOptions(field) : getSelectOptions(el))
                : [];
            const combo = makeCombo(row, field, immediateOptions, !useList, !!el && canClearField(field, el));
            combos[field.id] = combo;
            const value = el ? normalizeFieldValue(field, getFieldValue(el)) : "";
            state[field.id] = value;
            combo.setValue(value, true);
            combo.onChange(function (value) { state[field.id] = value; });

            if (useList) {
                loadFieldOptions(field, el).then(function (options) {
                    if (!document.body.contains(root) || !combos[field.id]) return;
                    combos[field.id].setItems(options);
                    combos[field.id].setValue(state[field.id], true);
                }).catch(function () {});
            }
        });

        function clearPanel() {
            fields.forEach(function (field) {
                state[field.id] = "";
                if (combos[field.id]) {
                    combos[field.id].setValue("", true);
                    combos[field.id].setClearFlag(false);
                }
            });
            status.textContent = tr("✅ Tous les champs du panneau ont été vidés.", "✅ All panel fields were cleared.");
        }

        async function applyValues() {
            const changes = [], skipped = [], modifiedEls = [];
            for (const field of fields) {
                const combo = combos[field.id];
                if (!combo) continue;
                const rawValue = String(state[field.id] || "");
                const value = normalizeFieldValue(field, rawValue);
                const clearRequested = combo.getClearFlag() && !value;
                const el = await findFieldElementWithRetry(field, 0);
                if (!el) {
                    if (value || clearRequested) skipped.push(fieldLabel(field) + " (" + tr("champ introuvable", "field not found") + ")");
                    continue;
                }
                const current = getFieldValue(el);
                if (clearRequested) {
                    const ok = clearFieldThroughKoha(field, el);
                    if (ok) {
                        changes.push(`${fieldLabel(field)}: "${current}" → (${tr("vidage demandé à Koha", "clear requested through Koha")})`);
                        modifiedEls.push(el);
                    } else skipped.push(fieldLabel(field) + " (" + tr("vidage impossible avec les contrôles natifs Koha", "cannot be cleared with native Koha controls") + ")");
                    continue;
                }
                if (value) {
                    cancelKohaClear(field, el);
                    if (norm(current) !== norm(value)) {
                        const ok = setFieldValue(field, el, value);
                        if (ok) { changes.push(`${fieldLabel(field)}: "${current}" → "${value}"`); modifiedEls.push(el); }
                        else skipped.push(fieldLabel(field) + " (" + tr("valeur absente ou non applicable", "value missing or not applicable") + ")");
                    }
                }
                await new Promise(function (resolve) { setTimeout(resolve, 20); });
            }
            modifiedEls.forEach(function (el) {
                el.classList.add("field-modified", "field-modified-highlight");
                setTimeout(function () { el.classList.remove("field-modified-highlight"); }, 4500);
            });
            if (changes.length) status.textContent = `✅ ${changes.length} ${tr("champ(s) préparé(s)", "field(s) prepared")}:\n${changes.join("\n")}` + (skipped.length ? `\n⚠️ ${skipped.join(", ")}` : "");
            else if (skipped.length) status.textContent = `⚠️ ${tr("Aucun champ modifié", "No field changed")}. ${skipped.join(", ")}`;
            else status.textContent = tr("Aucun champ modifié (valeurs déjà présentes ou identiques).", "No field changed (values already present or identical).");
        }

        function copyFromOthers() {
            if (currentConfig.copyMajority && currentConfig.copyMajority.enabled === false) {
                status.textContent = tr("La fonction « Copier au + nombreux » est désactivée.", "Copy majority is disabled.");
                return;
            }
            const items = getExistingItems();
            if (!items.length) { status.textContent = tr("❌ Aucun exemplaire existant trouvé dans le tableau.", "❌ No existing item found in the table."); return; }
            const values = computeMostCommonValues(items);
            const ids = Object.keys(values);
            if (!ids.length) { status.textContent = tr("❌ Aucune donnée commune significative trouvée parmi les exemplaires.", "❌ No significant common value found among existing items."); return; }
            const modal = document.createElement("div");
            modal.className = PANEL_ID + "_modal_backdrop";
            modal.id = PANEL_ID + "_modal_backdrop";
            modal.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.72);z-index:2147483646;padding:24px;box-sizing:border-box";
            const box = document.createElement("div");
            box.className = PANEL_ID + "_modal_content";
            box.id = PANEL_ID + "_modal_content";
            box.style.cssText = "width:100%;max-width:560px;max-height:84vh;box-sizing:border-box;position:relative;isolation:isolate;transform:translateZ(0)";
            box.innerHTML = `<h3>${escapeHTML(tr("📋 Confirmer la copie depuis les exemplaires existants", "📋 Confirm copy from existing items"))}</h3><p style="color:#475069;font-size:13px">${escapeHTML(tr("Les valeurs suivantes seront préparées dans le panneau. Vous pourrez ensuite les transférer dans Koha avec le bouton Appliquer du panneau :", "The following values will be prepared in the panel. You can then transfer them to Koha with Apply:"))}</p><ul>${ids.map(function (id) { const field = fields.find(function (f) { return f.id === id; }); return `<li><strong>${escapeHTML(fieldLabel(field))}</strong> → <span style="color:#408540;font-weight:600">"${escapeHTML(values[id])}"</span></li>`; }).join("")}</ul><div class="modal-note">${escapeHTML(tr("Règle par défaut : majorité stricte, au moins 2 occurrences, aucune égalité.", "Default rule: strict majority, at least 2 occurrences, no tie."))}</div><div class="modal-actions"><button class="btn-cancel" data-act="modalCancel">${escapeHTML(tr("Annuler", "Cancel"))}</button><button class="btn-confirm" data-act="modalConfirm">${escapeHTML(tr("Préparer", "Prepare"))}</button></div>`;
            modal.appendChild(box); document.body.appendChild(modal);
            box.querySelector('[data-act="modalCancel"]').addEventListener("click", function () { modal.remove(); status.textContent = tr("Copie annulée.", "Copy cancelled."); });
            box.querySelector('[data-act="modalConfirm"]').addEventListener("click", function () {
                fields.forEach(function (field) { if (combos[field.id]) combos[field.id].setClearFlag(false); });
                Object.entries(values).forEach(function (entry) {
                    const field = fields.find(function (f) { return f.id === entry[0]; });
                    if (!field || !combos[field.id]) return;
                    const clean = normalizeFieldValue(field, entry[1]);
                    state[field.id] = clean;
                    combos[field.id].setValue(clean, true);
                });
                modal.remove();
                status.textContent = tr("✅ Valeurs préparées. Utilisez le bouton Appliquer du panneau pour les transférer dans Koha.", "✅ Values prepared. Use Apply to transfer them to Koha.");
            });
        }

        let currentOwnerId = "";
        let currentOwnerName = "";
        let firebasePresets = [];

        function renderPresets() {
            const presets = currentOwnerId ? firebasePresets : getJSON(PRESETS_KEY, []);
            presetsCount.textContent = `${presets.length}/${maxPresets()}`;
            if (!presets.length) { presetsList.innerHTML = `<div class="preset-empty">${escapeHTML(tr("Aucune mémorisation pour l'instant.", "No preset yet."))}</div>`; return; }
            presetsList.innerHTML = presets.map(function (preset, index) {
                const name = preset.presetName || tr("Mémorisation ", "Preset ") + (index + 1);
                const summary = fields.filter(function (field) { return preset[field.id] !== undefined; }).map(function (field) { return fieldLabel(field) + ": " + normalizeFieldValue(field, preset[field.id]); }).join(" | ");
                return `<div class="preset-item" data-idx="${index}"><span class="preset-text"><b>${escapeHTML(name)}</b><span class="preset-fields">${escapeHTML(summary)}</span></span><button type="button" class="preset-del" data-del="${index}" title="${escapeHTML(tr("Supprimer", "Delete"))}">×</button></div>`;
            }).join("");
        }

        async function loadLegacyOwners() {
            if (!ownerSelect) return;
            ownerSelect.innerHTML = `<option value="">${escapeHTML(tr("Sélectionnez votre nom...", "Select your name..."))}</option>`;
            const ok = await ensureFirebase();
            if (!ok) { status.textContent = tr("Firebase indisponible : l’assistant reste fonctionnel, mais les listes partagées ne peuvent pas être chargées.", "Firebase unavailable: the assistant still works, but shared lists cannot be loaded."); return; }
            try {
                const owners = await listFirebaseOwners();
                ownerSelect.innerHTML += owners.map(function (o) { return `<option value="${escapeHTML(o.id)}">${escapeHTML(o.ownerName)}</option>`; }).join("");
                const saved = currentConfig.presets.rememberSelectedList !== false ? getJSON(SELECTED_OWNER_KEY, "") : "";
                if (saved && owners.some(function (o) { return o.id === saved; })) { ownerSelect.value = saved; await loadPresetOwner(saved); }
                else status.textContent = tr(`Listes nominatives chargées (${owners.length}).`, `Named lists loaded (${owners.length}).`);
            } catch (_) { status.textContent = tr("Erreur lors du chargement des listes Firebase.", "Error loading Firebase lists."); }
        }

        async function loadPresetOwner(ownerId, ownerNameOverride) {
            currentOwnerId = ownerId || "";
            if (!currentOwnerId) {
                currentOwnerName = ""; firebasePresets = []; renderPresets(); currentListLabel.textContent = ""; return;
            }
            try {
                const data = await readFirebasePresetDoc(currentOwnerId);
                currentOwnerName = data.ownerName || ownerNameOverride || currentOwnerId;
                firebasePresets = data.presets || [];
                if (ownerInput) ownerInput.value = currentOwnerName;
                currentListLabel.textContent = tr("Liste de : ", "List: ") + currentOwnerName;
                if (currentConfig.presets.rememberSelectedList !== false) setJSON(SELECTED_OWNER_KEY, currentOwnerId);
                renderPresets();
                status.textContent = tr(`Mémorisations pour ${currentOwnerName} chargées (${firebasePresets.length}).`, `Presets for ${currentOwnerName} loaded (${firebasePresets.length}).`);
            } catch (_) { status.textContent = tr("Erreur lors de la lecture des mémorisations Firebase.", "Error reading Firebase presets."); }
        }

        async function initializePresetMode() {
            if (currentConfig.presets.enabled === false) {
                root.querySelector(".presets-title").style.display = "none";
                root.querySelector(".presets-actions").style.display = "none";
                root.querySelector("#koha_items_preset_controls").style.display = "none";
                presetsList.style.display = "none";
                root.querySelector('[data-act="save"]').style.display = "none";
                return;
            }
            if (legacyMode) return loadLegacyOwners();
            const identity = presetIdentityForAutomaticMode();
            if (!identity) { status.textContent = tr("Impossible d’identifier le compte Koha connecté : les mémorisations utilisateur sont indisponibles.", "Unable to identify the signed-in Koha account: user presets are unavailable."); return; }
            if (!(await ensureFirebase())) { status.textContent = tr("Firebase indisponible : l’assistant reste fonctionnel, mais les mémorisations ne peuvent pas être chargées.", "Firebase unavailable: the assistant still works, but presets cannot be loaded."); return; }
            await loadPresetOwner(identity.id, identity.name);
            if (!currentOwnerName) { currentOwnerName = identity.name; currentListLabel.textContent = identity.name; }
        }

        function presetDataFromState(name) {
            const data = { presetName:name, createdAt:new Date().toISOString() };
            let hasData = false;
            fields.forEach(function (field) {
                const value = normalizeFieldValue(field, state[field.id]);
                if (value) { data[field.id] = value; hasData = true; }
            });
            return hasData ? data : null;
        }

        async function savePreset() {
            if (currentConfig.presets.enabled === false) return;
            if (!(await ensureFirebase())) { status.textContent = tr("Firebase non disponible.", "Firebase unavailable."); return; }
            let identity;
            if (legacyMode) {
                const name = String(ownerInput && ownerInput.value || currentOwnerName || "").trim();
                if (!name) { status.textContent = tr("Entrez votre nom et prénom avant de mémoriser.", "Enter your full name before saving a preset."); if (ownerInput) ownerInput.focus(); return; }
                identity = { id:safeOwnerId(name), name:name };
            } else {
                identity = presetIdentityForAutomaticMode();
                if (!identity) { status.textContent = tr("Compte Koha introuvable.", "Koha account not found."); return; }
            }
            const probe = presetDataFromState("");
            if (!probe) { status.textContent = tr("Rien à mémoriser : au moins un champ doit être rempli.", "Nothing to save: at least one field must be filled."); return; }
            const modal = document.createElement("div");
            modal.className = PANEL_ID + "_modal_backdrop";
            modal.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.72);z-index:2147483646;padding:24px;box-sizing:border-box";
            const box = document.createElement("div"); box.className = PANEL_ID + "_modal_content"; box.id = PANEL_ID + "_modal_content";
            box.innerHTML = `<h3>${escapeHTML(tr("💾 Nommer la mémorisation", "💾 Name preset"))}</h3><p style="color:#475069;font-size:13px">${escapeHTML(tr("Donnez un nom à cette mémorisation pour la retrouver facilement :", "Give this preset a name:"))}</p><input type="text" class="preset-name-input" id="presetNameInput" placeholder="${escapeHTML(tr("Ex: Livre jeunesse, BD, DVD...", "E.g. Children book, comics, DVD..."))}" value="${escapeHTML(tr("Mémorisation ", "Preset ") + (firebasePresets.length + 1))}"><div class="modal-actions"><button class="btn-cancel" data-act="modalCancel">${escapeHTML(tr("Annuler", "Cancel"))}</button><button class="btn-confirm" data-act="modalConfirm">${escapeHTML(tr("Enregistrer", "Save"))}</button></div>`;
            modal.appendChild(box); document.body.appendChild(modal);
            const nameInput = box.querySelector("#presetNameInput"); nameInput.focus(); nameInput.select();
            box.querySelector('[data-act="modalCancel"]').addEventListener("click", function () { modal.remove(); status.textContent = tr("Mémorisation annulée.", "Preset cancelled."); });
            box.querySelector('[data-act="modalConfirm"]').addEventListener("click", async function () {
                const presetName = String(nameInput.value || "").trim() || tr("Mémorisation ", "Preset ") + (firebasePresets.length + 1);
                modal.remove();
                try {
                    const existingData = await readFirebasePresetDoc(identity.id);
                    const existing = Array.isArray(existingData.presets) ? existingData.presets.slice() : [];
                    const duplicate = existing.findIndex(function (p) { return String(p.presetName || "") === presetName; });
                    if (duplicate !== -1 && !window.confirm(tr(`Une mémorisation nommée "${presetName}" existe déjà. Voulez-vous la remplacer ?`, `A preset named "${presetName}" already exists. Replace it?`))) { status.textContent = tr("Mémorisation annulée.", "Preset cancelled."); return; }
                    if (duplicate !== -1) existing.splice(duplicate, 1);
                    existing.unshift(presetDataFromState(presetName));
                    while (existing.length > maxPresets()) existing.pop();
                    await writeFirebasePresetDoc(identity.id, identity.name, existing);
                    currentOwnerId = identity.id; currentOwnerName = identity.name; firebasePresets = existing;
                    if (currentConfig.presets.rememberSelectedList !== false) setJSON(SELECTED_OWNER_KEY, currentOwnerId);
                    currentListLabel.textContent = tr("Liste de : ", "List: ") + currentOwnerName;
                    renderPresets();
                    if (legacyMode) {
                        await loadLegacyOwners();
                        if (ownerSelect) ownerSelect.value = currentOwnerId;
                    }
                    status.textContent = tr(`✅ Mémorisation "${presetName}" enregistrée pour ${identity.name}.`, `✅ Preset "${presetName}" saved for ${identity.name}.`);
                } catch (e) { status.textContent = tr("Erreur lors de l'enregistrement Firebase : ", "Firebase save error: ") + (e && e.message || e); }
            });
        }

        async function deletePreset(index) {
            if (!currentOwnerId || !firebasePresets[index]) return;
            const name = firebasePresets[index].presetName || tr("Mémorisation", "Preset");
            if (!window.confirm(tr(`Supprimer "${name}" ?`, `Delete "${name}"?`))) return;
            const next = firebasePresets.slice(); next.splice(index, 1);
            try {
                if (!next.length && legacyMode) {
                    const removeList = window.confirm(tr("La liste nominative est désormais vide. Voulez-vous supprimer la liste elle-même ?", "The named list is now empty. Delete the list itself?"));
                    if (removeList) {
                        await deleteFirebasePresetDoc(currentOwnerId);
                        currentOwnerId = ""; currentOwnerName = ""; firebasePresets = [];
                        if (ownerSelect) ownerSelect.value = ""; if (ownerInput) ownerInput.value = "";
                        setJSON(SELECTED_OWNER_KEY, ""); await loadLegacyOwners(); renderPresets(); currentListLabel.textContent = "";
                        status.textContent = tr("Liste vide supprimée.", "Empty list deleted."); return;
                    }
                }
                await writeFirebasePresetDoc(currentOwnerId, currentOwnerName, next);
                firebasePresets = next; renderPresets();
                status.textContent = tr(`✅ Mémorisation "${name}" supprimée.`, `✅ Preset "${name}" deleted.`);
            } catch (_) { status.textContent = tr("Erreur lors de la suppression Firebase.", "Firebase deletion error."); }
        }

        if (ownerSelect) ownerSelect.addEventListener("change", function () { loadPresetOwner(ownerSelect.value); });
        if (createListBtn) createListBtn.addEventListener("click", async function () {
            const name = String(ownerInput && ownerInput.value || "").trim();
            if (!name) { status.textContent = tr("Entrez un nom complet pour créer la liste.", "Enter a full name to create the list."); ownerInput.focus(); return; }
            if (!(await ensureFirebase())) { status.textContent = tr("Firebase non disponible.", "Firebase unavailable."); return; }
            const id = safeOwnerId(name);
            const existing = await readFirebasePresetDoc(id);
            await writeFirebasePresetDoc(id, name, existing.presets || []);
            await loadLegacyOwners();
            if (ownerSelect) ownerSelect.value = id;
            await loadPresetOwner(id, name);
            status.textContent = tr(`✅ Liste "${name}" créée et sélectionnée.`, `✅ List "${name}" created and selected.`);
        });

        presetsList.addEventListener("click", function (event) {
            const del = event.target.closest("[data-del]");
            if (del) { deletePreset(Number(del.dataset.del)); return; }
            const item = event.target.closest(".preset-item");
            if (!item) return;
            const presets = currentOwnerId ? firebasePresets : getJSON(PRESETS_KEY, []);
            const preset = presets[Number(item.dataset.idx)];
            if (!preset) return;
            fields.forEach(function (field) { state[field.id] = ""; if (combos[field.id]) { combos[field.id].setValue("", true); combos[field.id].setClearFlag(false); } });
            fields.forEach(function (field) {
                let value = preset[field.id];
                if (value === undefined && field.legacyCode && preset[field.legacyCode] !== undefined) value = preset[field.legacyCode];
                if (value === undefined) return;
                const clean = normalizeFieldValue(field, value);
                state[field.id] = clean;
                if (combos[field.id]) combos[field.id].setValue(clean, true);
            });
            status.textContent = tr(`✅ Mémorisation "${preset.presetName || ""}" chargée. Cliquez sur "Appliquer" pour l'utiliser.`, `✅ Preset "${preset.presetName || ""}" loaded. Click Apply to use it.`);
        });

        const presetControls = root.querySelector("#koha_items_preset_controls");
        const togglePresetControlsBtn = root.querySelector('[data-act="togglePresetControls"]');
        function updatePresetControlsLabel() { togglePresetControlsBtn.textContent = presetControls.classList.contains("open") ? tr("Masquer", "Hide") : tr("Options", "Options"); }
        togglePresetControlsBtn.addEventListener("click", function () { presetControls.classList.toggle("open"); updatePresetControlsLabel(); setJSON(PRESET_CONTROLS_KEY, presetControls.classList.contains("open")); });
        if (getJSON(PRESET_CONTROLS_KEY, false)) presetControls.classList.add("open");
        updatePresetControlsLabel();

        root.querySelector('[data-act="apply"]').addEventListener("click", applyValues);
        root.querySelector('[data-act="clearAll"]').addEventListener("click", clearPanel);
        root.querySelector('[data-act="copyFromOthers"]').addEventListener("click", copyFromOthers);
        root.querySelector('[data-act="save"]').addEventListener("click", savePreset);
        const collapseBtn = root.querySelector('[data-pmk110-act="collapse"]');
        collapseBtn.textContent = savedPanelState.collapsed ? "+" : "–";
        collapseBtn.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            root.classList.toggle("collapsed");
            const collapsed = root.classList.contains("collapsed");
            collapseBtn.textContent = collapsed ? "+" : "–";
            if (remember) setJSON(PANEL_STATE_KEY, { collapsed:collapsed });
            savePosition();
        });
        window.addEventListener("beforeunload", savePosition, { once:true });

        renderPresets();
        initializePresetMode();

        refreshTimer = setInterval(function () {
            fields.forEach(function (field) {
                const el = getFieldElement(field), combo = combos[field.id];
                if (!combo) return;
                const hasExternal = fieldHasConfiguredListSource(field);
                if (!hasExternal && el && el.tagName === "SELECT") {
                    combo.setItems(getSelectOptions(el));
                    combo.setValue(state[field.id], true);
                    return;
                }
                if (String(field.sourceMode || "auto") === "manual") {
                    combo.setItems(manualOptions(field));
                    combo.setValue(state[field.id], true);
                }
            });
        }, currentConfig.panel.refreshOptionsMs);
    }

    function newField() {
        const id = "field_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,6);
        return {
            id:id, legacyCode:id, enabled:true, kohafield:"items.", marcTag:"995", marcSubfield:"",
            labelFr:"Nouveau champ", labelEn:"New field", type:"auto", allowClear:true, copyEligible:true,
            normalize:"none", selector:"", sourceMode:"auto",
            source:{
                authorisedValueCategory:"", authorisedValueCategoryCustom:"", apiEndpoint:"", apiArrayPath:"",
                apiValuePath:"value", apiLabelPath:"description", fallbackToForm:true, manualValues:[]
            }
        };
    }

    function validateConfig(config) {
        return normalizeConfig(config);
    }

    function registerWithPMK() {
        if (!window.PMKConfig || configRegistered) return false;
        configRegistered = true;
        window.PMKConfig.registerModule({
            id: MODULE_ID,
            schemaVersion: 4,
            name: { fr:"Assistant de saisie des exemplaires", en:"Item entry assistant" },
            description: {
                fr:"Assistant repliable sur additem.pl et batchMod.pl : préparation contrôlée de champs exemplaire, mémorisations et reprise des valeurs majoritaires des exemplaires existants.",
                en:"Collapsible assistant on additem.pl and batchMod.pl for controlled item-field preparation, presets, and majority values from existing items."
            },
            category: { fr:"Catalogue / exemplaires", en:"Catalog / items" },
            supportedPages: ["cataloguing.additem","tools.batchmod"],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            validate: validateConfig,
            schema: [
                { type:"section", id:"activation", label:{fr:"Activation",en:"Activation"}, description:{fr:"Le 110 reste autonome du 102. Il ne soumet jamais le formulaire Koha.",en:"110 remains separate from 102. It never submits the Koha form."}, fields:[
                    { key:"enabled", type:"boolean", label:{fr:"Activer l’assistant exemplaires",en:"Enable item assistant"} },
                    { key:"pages", type:"repeater", label:{fr:"Pages Koha",en:"Koha pages"}, reorder:false, removable:false, canAdd:function(){return false;}, itemTitle:function(item,index,lang){ const d=PAGE_DEFINITIONS[index]; return d ? (lang==="en"?d.labelEn:d.labelFr) : String(item&&item.path||"Page"); }, fields:[
                        {key:"enabled",type:"boolean",label:{fr:"Activer sur cette page",en:"Enable on this page"}},
                        {key:"id",type:"text",readOnly:true,advanced:true,label:{fr:"Identifiant page",en:"Page identifier"}},
                        {key:"path",type:"text",readOnly:true,label:{fr:"Chemin Koha",en:"Koha path"}}
                    ]}
                ]},
                { type:"section", id:"panel", label:{fr:"Panneau",en:"Panel"}, description:{fr:"420 px et panneau replié restent les valeurs historiques par défaut. Sur petit écran la largeur s’adapte automatiquement.",en:"420 px and collapsed state remain the historical defaults. Width adapts automatically on small screens."}, fields:[
                    {key:"panel.widthPx",type:"number",min:300,max:760,label:{fr:"Largeur du panneau (px)",en:"Panel width (px)"}},
                    {key:"panel.collapsedByDefault",type:"boolean",label:{fr:"Panneau replié par défaut",en:"Collapsed by default"}},
                    {key:"panel.rememberStateAndPosition",type:"boolean",label:{fr:"Mémoriser état et position sur ce navigateur",en:"Remember state and position in this browser"}},
                    {key:"panel.refreshOptionsMs",type:"number",min:1000,max:60000,advanced:true,label:{fr:"Rafraîchissement des listes Koha (ms)",en:"Koha list refresh interval (ms)"}}
                ]},
                { type:"section", id:"fields", label:{fr:"Champs de l’assistant",en:"Assistant fields"}, description:{fr:"Les 17 champs Dracénie historiques restent dans le même ordre. Pour chaque champ, la source des choix peut venir du formulaire Koha, d’une catégorie de valeurs autorisées, d’un endpoint REST Koha ou d’une liste manuelle. Le mode Auto garde le formulaire comme repli sûr.",en:"The 17 historical Dracénie fields remain in the same order. Each field can source choices from the Koha form, an authorised-value category, a Koha REST endpoint or a manual list. Auto mode keeps the form as a safe fallback."}, fields:[
                    {key:"fields",type:"repeater",label:{fr:"Champs",en:"Fields"},addLabel:{fr:"Ajouter un champ exemplaire",en:"Add item field"},reorder:true,newItem:newField,liveTitleKey:"labelFr",itemTitle:function(item,index,lang){return lang==="en"?String(item&&item.labelEn||item&&item.labelFr||("Field "+(index+1))):String(item&&item.labelFr||item&&item.labelEn||("Champ "+(index+1)));},fields:[
                        {key:"enabled",type:"boolean",label:{fr:"Champ actif",en:"Field enabled"}},
                        {key:"id",type:"text",readOnly:true,advanced:true,label:{fr:"Identifiant stable",en:"Stable identifier"}},
                        {key:"labelFr",type:"text",label:{fr:"Libellé français",en:"French label"}},
                        {key:"labelEn",type:"text",label:{fr:"Libellé anglais",en:"English label"}},
                        {key:"kohafield",type:"text",label:{fr:"Kohafield exemplaire",en:"Item kohafield"},help:{fr:"Ex. items.homebranch, items.location, items.more_subfields_xml_q. C’est la cible réellement modifiée par l’assistant.",en:"E.g. items.homebranch, items.location, items.more_subfields_xml_q. This is the field actually changed by the assistant."}},
                        {key:"marcTag",type:"text",advanced:true,label:{fr:"Zone UNIMARC (information)",en:"UNIMARC tag (information)"}},
                        {key:"marcSubfield",type:"text",advanced:true,label:{fr:"Sous-zone UNIMARC (information)",en:"UNIMARC subfield (information)"}},
                        {key:"selector",type:"text",advanced:true,label:{fr:"Sélecteur CSS de secours",en:"Fallback CSS selector"},help:{fr:"À laisser vide normalement. Utiliser uniquement lorsqu’un champ local n’est pas accessible par son kohafield.",en:"Normally leave blank. Use only when a local field cannot be reached by its kohafield."}},
                        {key:"type",type:"select",advanced:true,label:{fr:"Type du champ cible",en:"Target field type"},options:[{value:"auto",label:{fr:"Détection automatique",en:"Automatic detection"}},{value:"select",label:{fr:"Liste",en:"Select"}},{value:"input",label:{fr:"Champ texte",en:"Text field"}}]},
                        {key:"sourceMode",type:"select",label:{fr:"Source des choix dans l’assistant",en:"Source for assistant choices"},help:{fr:"Auto est recommandé : VA/API configurée si disponible, sinon liste manuelle, sinon options du formulaire Koha.",en:"Auto is recommended: configured AV/API when available, then manual values, then Koha form options."},options:[
                            {value:"auto",label:{fr:"Automatique — recommandé",en:"Automatic — recommended"}},
                            {value:"form",label:{fr:"Formulaire Koha",en:"Koha form"}},
                            {value:"authorised_values",label:{fr:"Valeurs autorisées Koha",en:"Koha authorised values"}},
                            {value:"koha_api",label:{fr:"API REST Koha",en:"Koha REST API"}},
                            {value:"manual",label:{fr:"Liste manuelle",en:"Manual list"}}
                        ]},
                        {key:"source.authorisedValueCategory",type:"select",label:{fr:"Catégorie de valeurs autorisées",en:"Authorised-value category"},options:authorisedValueCategoryOptions,help:{fr:"La liste est chargée automatiquement via l’API Koha quand le compte connecté possède le droit catalogue. Si l’API est indisponible, choisissez « Autre catégorie ».",en:"The list is loaded automatically through the Koha API when the signed-in account has catalogue permission. If unavailable, choose “Other category”."}},
                        {key:"source.authorisedValueCategoryCustom",type:"text",advanced:true,label:{fr:"Catégorie VA saisie manuellement",en:"Manually entered AV category"},help:{fr:"Utilisée uniquement si « Autre catégorie / saisie manuelle… » est sélectionné ci-dessus.",en:"Used only when “Other category / manual entry…” is selected above."}},
                        {key:"source.apiEndpoint",type:"text",advanced:true,label:{fr:"Endpoint API Koha",en:"Koha API endpoint"},help:{fr:"Endpoint REST du même Koha, commençant par /api/v1/. Les endpoints externes sont refusés.",en:"REST endpoint on the same Koha, starting with /api/v1/. External endpoints are rejected."}},
                        {key:"source.apiArrayPath",type:"text",advanced:true,label:{fr:"Chemin du tableau JSON (facultatif)",en:"JSON array path (optional)"},help:{fr:"Laisser vide si la réponse API est directement un tableau. Exemple : data.items pour une réponse imbriquée.",en:"Leave blank if the API response is directly an array. Example: data.items for a nested response."}},
                        {key:"source.apiValuePath",type:"text",advanced:true,label:{fr:"Propriété JSON contenant la valeur",en:"JSON property containing value"},help:{fr:"Ex. library_id, item_type_id, value.",en:"E.g. library_id, item_type_id, value."}},
                        {key:"source.apiLabelPath",type:"text",advanced:true,label:{fr:"Propriété JSON contenant le libellé",en:"JSON property containing label"},help:{fr:"Ex. name, description. Si vide, la valeur est utilisée comme libellé.",en:"E.g. name, description. If blank, the value is also used as label."}},
                        {key:"source.fallbackToForm",type:"boolean",label:{fr:"Revenir aux options du formulaire si la source échoue",en:"Fall back to form options if the source fails"}},
                        {key:"source.manualValues",type:"repeater",label:{fr:"Valeurs manuelles",en:"Manual values"},addLabel:{fr:"Ajouter une valeur",en:"Add value"},reorder:true,newItem:function(){return {enabled:true,value:"",labelFr:"",labelEn:""};},itemTitle:function(item,index,lang){if(!item)return "#"+(index+1);return String((lang==="en"?item.labelEn:item.labelFr)||item.labelFr||item.labelEn||item.value||("#"+(index+1)));},fields:[
                            {key:"enabled",type:"boolean",label:{fr:"Valeur active",en:"Value enabled"}},
                            {key:"value",type:"text",label:{fr:"Valeur stockée",en:"Stored value"}},
                            {key:"labelFr",type:"text",label:{fr:"Libellé français",en:"French label"}},
                            {key:"labelEn",type:"text",label:{fr:"Libellé anglais",en:"English label"}}
                        ]},
                        {key:"allowClear",type:"boolean",label:{fr:"Autoriser le vidage si Koha le permet",en:"Allow clearing when Koha allows it"}},
                        {key:"copyEligible",type:"boolean",label:{fr:"Inclure dans « Copier au + nombreux »",en:"Include in Copy majority"}},
                        {key:"normalize",type:"select",advanced:true,label:{fr:"Normalisation",en:"Normalization"},options:[{value:"none",label:{fr:"Aucune",en:"None"}},{value:"price",label:{fr:"Prix : virgule vers point",en:"Price: comma to dot"}}]}
                    ]}
                ]},
                { type:"section", id:"majority", label:{fr:"Copier au + nombreux",en:"Copy majority"}, description:{fr:"Les valeurs historiques sont conservées : au moins 2 occurrences, plus de 50 % des exemplaires et aucune égalité.",en:"Historical defaults are preserved: at least 2 occurrences, more than 50% of items and no tie."}, fields:[
                    {key:"copyMajority.enabled",type:"boolean",label:{fr:"Activer la fonction",en:"Enable feature"}},
                    {key:"copyMajority.minOccurrences",type:"number",min:1,max:999,advanced:true,label:{fr:"Nombre minimal d’occurrences",en:"Minimum occurrences"}},
                    {key:"copyMajority.thresholdPercent",type:"number",min:0,max:100,advanced:true,label:{fr:"Seuil de majorité (%)",en:"Majority threshold (%)"}},
                    {key:"copyMajority.strictGreaterThanThreshold",type:"boolean",advanced:true,label:{fr:"Exiger strictement plus que le seuil",en:"Require strictly more than threshold"}},
                    {key:"copyMajority.rejectTies",type:"boolean",advanced:true,label:{fr:"Ne rien reprendre en cas d’égalité",en:"Copy nothing on ties"}}
                ]},
                { type:"section", id:"presets", label:{fr:"Mémorisations",en:"Presets"}, description:{fr:"Le mode « listes nominatives historiques » reste le défaut afin de conserver tes listes Firebase actuelles. Les modes commun et compte Koha sont disponibles pour la migration, sans modifier l’usage actuel tant qu’ils ne sont pas sélectionnés.",en:"Historical named lists remain the default to preserve existing Firebase data. Shared and Koha-account modes are available for migration without changing current use until selected."}, fields:[
                    {key:"presets.enabled",type:"boolean",label:{fr:"Activer les mémorisations",en:"Enable presets"}},
                    {key:"presets.mode",type:"select",label:{fr:"Mode des listes",en:"Preset list mode"},options:[
                        {value:"legacyNamed",label:{fr:"Listes nominatives historiques (compatibilité production)",en:"Historical named lists (production compatibility)"}},
                        {value:"common",label:{fr:"Une liste commune à tous",en:"One shared list for everyone"}},
                        {value:"kohaUser",label:{fr:"Liste selon le compte Koha connecté",en:"List for signed-in Koha account"}}
                    ]},
                    {key:"presets.maxPresets",type:"number",min:1,max:500,label:{fr:"Nombre maximum de mémorisations",en:"Maximum presets"}},
                    {key:"presets.rememberSelectedList",type:"boolean",advanced:true,label:{fr:"Mémoriser la liste nominative sélectionnée",en:"Remember selected named list"}},
                    {key:"presets.collection",type:"text",advanced:true,label:{fr:"Collection Firebase des mémorisations",en:"Firebase preset collection"}}
                ]},
                { type:"section", id:"legacy-storage", label:{fr:"Stockage Firebase provisoire",en:"Temporary Firebase storage"}, description:{fr:"Compatibilité transitoire avec la production actuelle. Lors du passage au plugin natif, les mémorisations devront être stockées côté Koha.",en:"Temporary compatibility with current production. In the native plugin, presets should be stored in Koha."}, fields:[
                    {key:"firebase.enabled",type:"boolean",advanced:true,label:{fr:"Activer Firebase pour les mémorisations",en:"Enable Firebase for presets"}},
                    {key:"firebase.sdkVersion",type:"text",advanced:true,label:{fr:"Version SDK Firebase",en:"Firebase SDK version"}},
                    {key:"firebase.config.apiKey",type:"text",advanced:true,label:{fr:"Firebase apiKey",en:"Firebase apiKey"}},
                    {key:"firebase.config.authDomain",type:"text",advanced:true,label:{fr:"Firebase authDomain",en:"Firebase authDomain"}},
                    {key:"firebase.config.projectId",type:"text",advanced:true,label:{fr:"Firebase projectId",en:"Firebase projectId"}},
                    {key:"firebase.config.storageBucket",type:"text",advanced:true,label:{fr:"Firebase storageBucket",en:"Firebase storageBucket"}},
                    {key:"firebase.config.messagingSenderId",type:"text",advanced:true,label:{fr:"Firebase messagingSenderId",en:"Firebase messagingSenderId"}},
                    {key:"firebase.config.appId",type:"text",advanced:true,label:{fr:"Firebase appId",en:"Firebase appId"}}
                ]}
            ]
        });

        window.PMKConfig.getConfig(MODULE_ID).then(function (cfg) {
            currentConfig = normalizeConfig(cfg || {});
            scheduleRender(0);
        }).catch(function () {
            currentConfig = normalizeConfig(DEFAULT_CONFIG);
            scheduleRender(0);
        });
        if (typeof window.PMKConfig.subscribe === "function") {
            unsubscribeConfig = window.PMKConfig.subscribe(MODULE_ID, function (cfg) {
                currentConfig = normalizeConfig(cfg || {});
                scheduleRender(0);
            });
        }
        return true;
    }

    function scheduleRender(delay) {
        if (!supportedPage()) return;
        if (renderTimer) clearTimeout(renderTimer);
        renderTimer = setTimeout(function () { waitForBody().then(createPanel); }, delay == null ? 100 : delay);
    }

    function bootstrap() {
        currentConfig = normalizeConfig(DEFAULT_CONFIG);
        if (supportedPage()) loadAuthorisedValueCategories(false).catch(function () {});
        if (registerWithPMK()) {
            if (supportedPage()) scheduleRender(0);
            return;
        }
        window.addEventListener("pmk:config-ready", function () { registerWithPMK(); }, { once:true });
        /* Non-régression : si PMK n'est pas encore disponible, l'assistant historique reste utilisable avec ses défauts. */
        if (supportedPage()) scheduleRender(500);
    }

    window.PMK110ItemEntryAssistant = Object.freeze({
        version: MODULE_VERSION,
        defaults: clone(DEFAULT_CONFIG),
        getConfig: function () { return clone(currentConfig); },
        refresh: function () { scheduleRender(0); },
        refreshAuthorisedValueCategories: function () { return loadAuthorisedValueCategories(true); },
        getAuthorisedValueCategories: function () { return authorisedValueCategoryCache.slice(); },
        loadFieldOptions: function (fieldId) {
            const field = activeFields().find(function (candidate) { return candidate.id === fieldId; });
            if (!field) return Promise.resolve([]);
            return loadFieldOptions(field, getFieldElement(field));
        },
        detectFields: function () {
            return activeFields().map(function (field) {
                const el = getFieldElement(field);
                return { id:field.id, kohafield:field.kohafield, found:!!el, tagName:el ? el.tagName : null, type:el ? fieldType(field,el) : null };
            });
        }
    });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootstrap, { once:true });
    else bootstrap();
})();

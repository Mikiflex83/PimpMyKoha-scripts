/*
 Nom du fichier : 068-blinking-barcode.js
 Module PMK      : Repérage des codes-barres
 ID PMK          : barcode-highlights
 Version         : 3.0.0-pmk-isolated
 Date            : 2026-09-20

 Objectif :
 - conserver les usages historiques du 068 ;
 - fonctionner indépendamment du 036 ;
 - distinguer clairement :
   1) le dernier code-barres recherché ;
   2) les codes-barres mémorisés depuis une liste d'exemplaires ;
 - permettre pour chacun : couleurs, clignotement oui/non et vitesse ;
 - ne jamais réécrire innerHTML pour surligner du texte.
*/
(function (window, document) {
    "use strict";

    const MODULE_ID = "barcode-highlights";
    const VERSION = "3.0.0-pmk-isolated";
    const STYLE_ID = "pmk068-barcode-style";
    const GENERATED_ATTR = "data-pmk068-generated";
    const SEARCH_KEY = "searchbox_value";
    const CODES_KEY = "codesBarres";
    const NUMERIC_RX = /^\d{10,}$/;
    const DR_RX = /^DR\d{10,}$/i;
    const SEARCH_RX = /^(?:\d{6,}|DR\d{6,})$/i;

    const DEFAULTS = {
        enabled: true,
        lastSearch: {
            enabled: true,
            backgroundColor: "#fff36a",
            textColor: "#202020",
            blink: false,
            speedMs: 1050
        },
        remembered: {
            enabled: true,
            backgroundColor: "#ffae2b",
            textColor: "#111111",
            blink: true,
            speedMs: 1050
        },
        selectors: {
            collectedTable: "#item_table",
            detailTable: "#holdings_table",
            holdsQueueTable: "#holds_table"
        }
    };

    let config = clone(DEFAULTS);
    let unsubscribe = null;
    const observers = new Map();

    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function clamp(value, fallback, min, max) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, n));
    }
    function merge(base, extra) {
        const out = clone(base);
        if (!extra || typeof extra !== "object") return out;
        Object.keys(extra).forEach(function (key) {
            const v = extra[key];
            if (v && typeof v === "object" && !Array.isArray(v) && out[key] && typeof out[key] === "object" && !Array.isArray(out[key])) {
                out[key] = merge(out[key], v);
            } else if (v !== undefined) out[key] = v;
        });
        return out;
    }
    function normalize(raw) {
        const cfg = merge(DEFAULTS, raw || {});
        cfg.enabled = cfg.enabled !== false;
        ["lastSearch", "remembered"].forEach(function (key) {
            cfg[key].enabled = cfg[key].enabled !== false;
            cfg[key].blink = cfg[key].blink === true;
            cfg[key].speedMs = clamp(cfg[key].speedMs, 1050, 150, 10000);
            cfg[key].backgroundColor = String(cfg[key].backgroundColor || DEFAULTS[key].backgroundColor);
            cfg[key].textColor = String(cfg[key].textColor || DEFAULTS[key].textColor);
        });
        cfg.selectors = merge(DEFAULTS.selectors, cfg.selectors || {});
        return cfg;
    }
    function safeGet(key, fallback) {
        try { const v = localStorage.getItem(key); return v == null ? fallback : v; }
        catch (_) { return fallback; }
    }
    function safeSet(key, value) {
        try { localStorage.setItem(key, value); return true; }
        catch (_) { return false; }
    }
    function readCodes() {
        try {
            const arr = JSON.parse(safeGet(CODES_KEY, "[]"));
            return Array.isArray(arr) ? Array.from(new Set(arr.map(String).map(function (x) { return x.trim(); }).filter(Boolean))) : [];
        } catch (_) { return []; }
    }
    function escapeRx(value) { return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

    function unwrapGenerated() {
        document.querySelectorAll("[" + GENERATED_ATTR + "]").forEach(function (span) {
            const parent = span.parentNode;
            if (!parent) return;
            parent.replaceChild(document.createTextNode(span.textContent || ""), span);
            parent.normalize();
        });
    }
    function textNodes(root) {
        if (!root) return [];
        const out = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                const p = node.parentElement;
                if (!p || p.closest("script,style,noscript,textarea,input,select,option,button,svg,[contenteditable='true'],[" + GENERATED_ATTR + "]")) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        let n; while ((n = walker.nextNode())) out.push(n);
        return out;
    }
    function highlight(root, term, className) {
        if (!root || !term) return 0;
        const rx = new RegExp(escapeRx(term), "gi");
        let count = 0;
        textNodes(root).forEach(function (node) {
            const text = node.nodeValue || "";
            if (!rx.test(text)) { rx.lastIndex = 0; return; }
            rx.lastIndex = 0;
            const frag = document.createDocumentFragment();
            let last = 0, match;
            while ((match = rx.exec(text))) {
                if (match.index > last) frag.appendChild(document.createTextNode(text.slice(last, match.index)));
                const span = document.createElement("span");
                span.setAttribute(GENERATED_ATTR, "1");
                span.className = className;
                span.textContent = match[0];
                frag.appendChild(span);
                last = match.index + match[0].length;
                count += 1;
                if (!match[0].length) rx.lastIndex += 1;
            }
            if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
            node.parentNode.replaceChild(frag, node);
            rx.lastIndex = 0;
        });
        return count;
    }

    function injectStyle() {
        let style = document.getElementById(STYLE_ID);
        if (!style) { style = document.createElement("style"); style.id = STYLE_ID; document.head.appendChild(style); }
        const l = config.lastSearch;
        const r = config.remembered;
        style.textContent = `
            @keyframes pmk068LastBlink { 0%,100%{opacity:1} 50%{opacity:.35} }
            @keyframes pmk068RememberedBlink { 0%,100%{opacity:1;box-shadow:0 0 0 1px rgba(0,0,0,.15)} 50%{opacity:.38;box-shadow:0 0 8px 2px rgba(0,0,0,.18)} }
            .pmk068-last-search { background:${l.backgroundColor}; color:${l.textColor}; border-radius:3px; padding:0 .16em; ${l.blink ? `animation:pmk068LastBlink ${l.speedMs}ms ease-in-out infinite;` : ""} }
            .pmk068-remembered { background:${r.backgroundColor}; color:${r.textColor}; border-radius:3px; padding:0 .16em; font-weight:700; ${r.blink ? `animation:pmk068RememberedBlink ${r.speedMs}ms ease-in-out infinite;` : ""} }
            @media (prefers-reduced-motion: reduce) { .pmk068-last-search,.pmk068-remembered { animation:none !important; opacity:1 !important; } }
        `;
    }

    function collectCodes() {
        const path = location.pathname || "";
        if (!path.endsWith("itemsearch.pl") && !path.endsWith("moremember.pl")) return;
        const table = document.querySelector(config.selectors.collectedTable);
        if (!table) return;
        const codes = [];
        table.querySelectorAll("a").forEach(function (a) {
            const value = String(a.textContent || "").trim();
            if ((path.endsWith("itemsearch.pl") && NUMERIC_RX.test(value)) || (path.endsWith("moremember.pl") && (NUMERIC_RX.test(value) || DR_RX.test(value)))) codes.push(value);
        });
        safeSet(CODES_KEY, JSON.stringify(Array.from(new Set(codes))));
    }

    function captureSearchFromForm(event) {
        const form = event && event.target;
        if (!form || form.nodeType !== 1) return;
        const input = form.querySelector("#search-form, input[name='q'], input[type='search'], #findborrower, #findborrower_main");
        const value = input ? String(input.value || "").trim() : "";
        if (SEARCH_RX.test(value)) safeSet(SEARCH_KEY, value);
    }

    function applyHighlights() {
        unwrapGenerated();
        if (config.enabled === false) return;
        injectStyle();
        collectCodes();
        const path = location.pathname || "";
        const search = String(safeGet(SEARCH_KEY, "") || "").trim();
        if (path.endsWith("detail.pl")) {
            const table = document.querySelector(config.selectors.detailTable);
            if (!table) return;
            if (config.remembered.enabled !== false) readCodes().sort(function (a,b){return b.length-a.length;}).forEach(function (code) { highlight(table, code, "pmk068-remembered"); });
            if (config.lastSearch.enabled !== false && SEARCH_RX.test(search)) highlight(table, search, "pmk068-last-search");
        } else if (path.endsWith("view_holdsqueue.pl")) {
            const table = document.querySelector(config.selectors.holdsQueueTable);
            if (table && config.lastSearch.enabled !== false && SEARCH_RX.test(search)) highlight(table, search, "pmk068-last-search");
        }
    }

    function observe(selector) {
        const root = document.querySelector(selector);
        if (!root || observers.has(root)) return;
        let timer = null;
        const obs = new MutationObserver(function (mutations) {
            if (!mutations.some(function (m) { return m.type === "childList" && (m.addedNodes.length || m.removedNodes.length); })) return;
            clearTimeout(timer); timer = setTimeout(applyHighlights, 100);
        });
        obs.observe(root, { childList: true, subtree: true });
        observers.set(root, obs);
    }

    function validate(raw) {
        const cfg = normalize(raw);
        if (cfg.lastSearch.speedMs < 150 || cfg.remembered.speedMs < 150) return { ok:false, message:"La vitesse de clignotement doit être au moins de 150 ms." };
        return { ok:true };
    }

    function definition() {
        return {
            id: MODULE_ID,
            schemaVersion: 1,
            name: { fr:"Repérage des codes-barres", en:"Barcode highlighting" },
            description: { fr:"Repère visuellement le dernier code-barres recherché et les codes-barres mémorisés. Le module fonctionne indépendamment du 036.", en:"Highlights the last searched barcode and remembered barcodes. This module works independently from module 036." },
            category: { fr:"Catalogue / circulation", en:"Catalog / circulation" },
            supportedPages:["catalogue.detail","catalogue.itemsearch","members.moremember","circ.holdsqueue"],
            prerequisites:[], dependencies:[], defaults:clone(DEFAULTS), normalize:normalize, validate:validate,
            schema:[
                { type:"section", id:"general", label:{fr:"Activation",en:"Activation"}, fields:[{key:"enabled",type:"boolean",label:{fr:"Activer le repérage des codes-barres",en:"Enable barcode highlighting"}}] },
                { type:"section", id:"lastSearch", label:{fr:"Dernier code-barres recherché",en:"Last searched barcode"}, description:{fr:"Repère le code-barres de la dernière recherche. Cette fonction ne dépend pas du module 036 : le 068 mémorise lui-même les recherches code-barres qu’il observe.",en:"Highlights the last barcode search. This does not depend on module 036; module 068 records barcode searches itself when observed."}, fields:[
                    {key:"lastSearch.enabled",type:"boolean",label:{fr:"Activer ce repérage",en:"Enable this highlight"}},
                    {key:"lastSearch.backgroundColor",type:"color",label:{fr:"Couleur de fond",en:"Background color"}},
                    {key:"lastSearch.textColor",type:"color",label:{fr:"Couleur du texte",en:"Text color"}},
                    {key:"lastSearch.blink",type:"boolean",label:{fr:"Faire clignoter",en:"Blink"}},
                    {key:"lastSearch.speedMs",type:"number",min:150,max:10000,label:{fr:"Vitesse du clignotement (ms)",en:"Blink speed (ms)"}}
                ]},
                { type:"section", id:"remembered", label:{fr:"Codes-barres mémorisés",en:"Remembered barcodes"}, description:{fr:"Repère les codes collectés depuis itemsearch.pl ou moremember.pl. Par défaut, ceux-ci clignotent alors que le dernier code recherché reste fixe.",en:"Highlights codes collected from itemsearch.pl or moremember.pl. By default these blink while the last searched barcode stays fixed."}, fields:[
                    {key:"remembered.enabled",type:"boolean",label:{fr:"Activer ce repérage",en:"Enable this highlight"}},
                    {key:"remembered.backgroundColor",type:"color",label:{fr:"Couleur de fond",en:"Background color"}},
                    {key:"remembered.textColor",type:"color",label:{fr:"Couleur du texte",en:"Text color"}},
                    {key:"remembered.blink",type:"boolean",label:{fr:"Faire clignoter",en:"Blink"}},
                    {key:"remembered.speedMs",type:"number",min:150,max:10000,label:{fr:"Vitesse du clignotement (ms)",en:"Blink speed (ms)"}}
                ]},
                { type:"section", id:"advanced", advanced:true, label:{fr:"Sélecteurs techniques",en:"Technical selectors"}, fields:[
                    {key:"selectors.collectedTable",type:"text",label:{fr:"Table de collecte",en:"Collection table"}},
                    {key:"selectors.detailTable",type:"text",label:{fr:"Table exemplaires détail",en:"Detail holdings table"}},
                    {key:"selectors.holdsQueueTable",type:"text",label:{fr:"Table file de réservations",en:"Holds queue table"}}
                ]}
            ]
        };
    }

    function apply(raw) {
        config = normalize(raw);
        applyHighlights();
        observe(config.selectors.collectedTable);
        observe(config.selectors.detailTable);
        observe(config.selectors.holdsQueueTable);
    }
    function register() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return false;
        try { window.PMKConfig.registerModule(definition()); } catch (_) {}
        if (typeof window.PMKConfig.subscribe === "function" && !unsubscribe) {
            try { unsubscribe = window.PMKConfig.subscribe(MODULE_ID, apply); } catch (_) {}
        }
        return true;
    }
    function load() {
        register();
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") return Promise.resolve(clone(DEFAULTS));
        return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID)).then(normalize).catch(function(){ return clone(DEFAULTS); });
    }
    function start() {
        document.addEventListener("submit", captureSearchFromForm, true);
        if (register()) load().then(apply); else apply(DEFAULTS);
        window.addEventListener("pmk:config-ready", function(){ load().then(apply); }, { once:true });
        setTimeout(applyHighlights, 400);
        setTimeout(applyHighlights, 1400);
    }

    window.PMK068BarcodeHighlights = { moduleId:MODULE_ID, version:VERSION, refresh:function(){return load().then(apply);} };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once:true }); else start();
})(window, document);

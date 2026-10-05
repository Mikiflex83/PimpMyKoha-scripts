/*
 Nom du fichier : 071-history-system-pmk-loader.js
 Version : 1.1.0-consolidated
 Date : 2026-09-20

 Rôle :
 - ne modifie pas 071-history-system.js ;
 - enregistre « Historique récent » dans PMK ;
 - charge le runtime historique seulement si le module est actif ;
 - expose window.PMKHistory071 pour IntranetNav 134.
*/
(function (window, document) {
    "use strict";
    if (window.__PMK071_HISTORY_LOADER__) return;
    window.__PMK071_HISTORY_LOADER__ = true;

    const MODULE_ID = "recent-history";
    const SCRIPT_URL = "/public/koha-scripts/071-history-system.js";
    const SCRIPT_ID = "pmk-071-history-runtime";
    const DISABLED_CLASS = "pmk-071-disabled";
    const STYLE_ID = "pmk-071-disabled-style";
    let config = { enabled: true };
    let loading = null;
    let unsubscribe = null;

    function runtimeReady() {
        return !!(window.KOHA_HISTORY && typeof window.KOHA_HISTORY.open === "function") || typeof window.openNav === "function";
    }
    function installMask() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `html.${DISABLED_CLASS} #customSidebar, html.${DISABLED_CLASS} #bottomActionBar #historique { display:none !important; }`;
        document.head.appendChild(style);
    }
    function closePanel() {
        try {
            if (window.KOHA_HISTORY && typeof window.KOHA_HISTORY.close === "function") window.KOHA_HISTORY.close();
            else if (typeof window.closeNav === "function") window.closeNav();
        } catch (_) {}
        const panel = document.getElementById("customSidebar");
        if (panel) {
            panel.classList.remove("is-open");
            panel.setAttribute("aria-hidden", "true");
            panel.style.width = "0px";
        }
    }
    function setDisabled(disabled) {
        installMask();
        document.documentElement.classList.toggle(DISABLED_CLASS, !!disabled);
        if (disabled) closePanel();
    }
    function dispatch(reason) {
        try {
            window.dispatchEvent(new CustomEvent("pmk:history-state", { detail:{ moduleId:MODULE_ID, enabled:config.enabled !== false, loaded:runtimeReady(), reason:reason || "state" } }));
        } catch (_) {}
    }
    function existingScript() {
        return document.getElementById(SCRIPT_ID) || Array.from(document.scripts || []).find(function (s) { return /(?:^|\/)071-history-system\.js(?:\?|$)/.test(String(s.src || "")); }) || null;
    }
    function waitRuntime(timeout) {
        return new Promise(function (resolve) {
            if (runtimeReady()) return resolve(true);
            const start = Date.now();
            const timer = setInterval(function () {
                if (runtimeReady()) { clearInterval(timer); resolve(true); }
                else if (Date.now() - start > timeout) { clearInterval(timer); resolve(false); }
            }, 50);
        });
    }
    function loadRuntime() {
        if (config.enabled === false) { setDisabled(true); dispatch("disabled"); return Promise.resolve(false); }
        setDisabled(false);
        if (runtimeReady()) return Promise.resolve(true);
        if (loading) return loading;
        const existing = existingScript();
        if (existing && existing.id !== SCRIPT_ID) {
            loading = waitRuntime(5000).then(function (ok) { loading = null; dispatch(ok ? "legacy-loaded" : "legacy-timeout"); return ok; });
            return loading;
        }
        loading = new Promise(function (resolve) {
            const script = existing || document.createElement("script");
            script.id = SCRIPT_ID;
            script.src = SCRIPT_URL;
            script.async = true;
            script.dataset.pmkControlled = "1";
            script.addEventListener("load", function () {
                waitRuntime(3000).then(function (ok) { loading = null; setDisabled(config.enabled === false); dispatch(ok ? "loaded" : "runtime-not-ready"); resolve(ok); });
            }, { once:true });
            script.addEventListener("error", function () { loading = null; dispatch("load-error"); resolve(false); }, { once:true });
            if (!script.isConnected) document.head.appendChild(script);
        });
        return loading;
    }
    async function open() {
        if (config.enabled === false) return false;
        if (!(await loadRuntime())) return false;
        try {
            if (window.KOHA_HISTORY && typeof window.KOHA_HISTORY.open === "function") { window.KOHA_HISTORY.open(); return true; }
            if (typeof window.openNav === "function") { window.openNav(); return true; }
        } catch (_) {}
        return false;
    }
    async function toggle() {
        if (config.enabled === false) return false;
        if (!(await loadRuntime())) return false;
        try {
            if (window.KOHA_HISTORY && typeof window.KOHA_HISTORY.toggle === "function") { window.KOHA_HISTORY.toggle(); return true; }
            return open();
        } catch (_) { return false; }
    }
    function definition() {
        return {
            id:MODULE_ID, schemaVersion:1,
            name:{fr:"Historique récent",en:"Recent history"},
            description:{fr:"Active ou désactive le module historique 071 sans modifier sa logique métier. L’accès peut être placé dans IntranetNav 134.",en:"Enables or disables historical module 071 without changing its business logic. Its entry point can be placed in IntranetNav 134."},
            category:{fr:"Interface & outils",en:"Interface & tools"}, supportedPages:["*"], prerequisites:[], dependencies:[], defaults:{enabled:true},
            schema:[{type:"section",id:"activation",label:{fr:"Activation",en:"Activation"},fields:[{key:"enabled",type:"boolean",label:{fr:"Activer l’historique récent",en:"Enable recent history"}}]}]
        };
    }
    function apply(raw) {
        config = Object.assign({ enabled:true }, raw || {});
        setDisabled(config.enabled === false);
        if (config.enabled !== false) loadRuntime();
        dispatch("config");
        window.PMKHistory071.enabled = config.enabled !== false;
    }
    function register() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return false;
        try { window.PMKConfig.registerModule(definition()); } catch (_) {}
        if (typeof window.PMKConfig.subscribe === "function" && !unsubscribe) {
            try { unsubscribe = window.PMKConfig.subscribe(MODULE_ID, apply); } catch (_) {}
        }
        return true;
    }
    function loadConfig() {
        register();
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") return Promise.resolve({enabled:true});
        return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID)).catch(function(){return {enabled:true};});
    }

    window.PMKHistory071 = { moduleId:MODULE_ID, enabled:true, open:open, toggle:toggle, close:closePanel, load:loadRuntime };
    function start() {
        if (register()) loadConfig().then(apply); else apply({enabled:true});
        window.addEventListener("pmk:config-ready", function(){ loadConfig().then(apply); }, { once:true });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once:true }); else start();
})(window, document);

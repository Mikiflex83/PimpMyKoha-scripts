/* ============================================================
   125-double_clic_resrvation.js
   PimpMyKoha — Protection double validation des réservations
   Version : 2.0.0-preplugin
   ============================================================ */
(function (window, document, $) {
    "use strict";

    if (!window || !document) return;
    if (window.__PMK125HoldSubmitGuard) return;
    window.__PMK125HoldSubmitGuard = true;

    const MODULE_ID = "hold-submit-guard";
    const MODULE_VERSION = "2.0.0-preplugin";
    const DEFAULT_CONFIG = Object.freeze({
        enabled: true,
        buttonSelector: "#hold_grp_btn",
        pendingTextFr: "Réservation en cours…",
        pendingTextEn: "Placing hold…"
    });

    let currentConfig = clone(DEFAULT_CONFIG);
    let unsubscribe = null;
    let nativeBound = false;

    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function lang() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") return window.PMKConfig.getLanguage();
        return String(document.documentElement.lang || navigator.language || "fr").toLowerCase().startsWith("en") ? "en" : "fr";
    }
    function normalizeConfig(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        return {
            enabled: source.enabled !== false,
            buttonSelector: String(source.buttonSelector || DEFAULT_CONFIG.buttonSelector),
            pendingTextFr: String(source.pendingTextFr || DEFAULT_CONFIG.pendingTextFr),
            pendingTextEn: String(source.pendingTextEn || DEFAULT_CONFIG.pendingTextEn)
        };
    }

    function pendingMarkup() {
        const text = lang() === "en" ? currentConfig.pendingTextEn : currentConfig.pendingTextFr;
        return '<i class="fa fa-spinner fa-spin" aria-hidden="true"></i> ' + text;
    }

    function findButton(form) {
        try { return form.querySelector(currentConfig.buttonSelector); } catch (_) { return null; }
    }

    function guardSubmit(event) {
        if (currentConfig.enabled === false) return;
        const form = event.target && event.target.closest ? event.target.closest("form") : null;
        if (!form) return;
        const button = findButton(form);
        if (!button) return;

        if (form.dataset.pmk125Submitting === "true") {
            event.preventDefault();
            event.stopImmediatePropagation();
            return false;
        }

        form.dataset.pmk125Submitting = "true";
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
        button.innerHTML = pendingMarkup();
        return true;
    }

    function bindRuntime() {
        if (nativeBound) return;
        nativeBound = true;
        // Capture : la protection s'exécute avant les gestionnaires applicatifs
        // sans empêcher la première soumission légitime.
        document.addEventListener("submit", guardSubmit, true);
    }

    function definition() {
        return {
            id: MODULE_ID,
            schemaVersion: 1,
            name: { fr: "Protection double validation — réservations", en: "Hold double-submit protection" },
            description: { fr: "Empêche un double clic ou une double soumission lors de la validation d’une réservation.", en: "Prevents double-clicks and duplicate submissions when placing a hold." },
            category: { fr: "Circulation / réservations", en: "Circulation / holds" },
            supportedPages: ["reserve.request"],
            defaults: clone(DEFAULT_CONFIG),
            schema: [
                { type: "section", id: "settings", label: { fr: "Réglages", en: "Settings" }, fields: [
                    { key: "enabled", type: "boolean", label: { fr: "Activer la protection", en: "Enable protection" } },
                    { key: "pendingTextFr", type: "text", label: { fr: "Texte pendant l’enregistrement — français", en: "Pending text — French" } },
                    { key: "pendingTextEn", type: "text", label: { fr: "Texte pendant l’enregistrement — anglais", en: "Pending text — English" } },
                    { key: "buttonSelector", type: "text", advanced: true, label: { fr: "Sélecteur du bouton Koha", en: "Koha button selector" } }
                ]}
            ]
        };
    }

    function registerModule() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return false;
        try { window.PMKConfig.registerModule(definition()); } catch (_) { return false; }
        if (!unsubscribe && typeof window.PMKConfig.subscribe === "function") {
            try { unsubscribe = window.PMKConfig.subscribe(MODULE_ID, function (cfg) { currentConfig = normalizeConfig(cfg); }); } catch (_) {}
        }
        return true;
    }

    async function start() {
        registerModule();
        if (window.PMKConfig && typeof window.PMKConfig.getConfig === "function") {
            try { currentConfig = normalizeConfig(await window.PMKConfig.getConfig(MODULE_ID)); } catch (_) {}
        }
        bindRuntime();
    }

    window.PMK125HoldSubmitGuard = { moduleId: MODULE_ID, version: MODULE_VERSION };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
    if (!window.PMKConfig) window.addEventListener("pmk:config-ready", registerModule, { once: true });
})(window, document, window.jQuery);

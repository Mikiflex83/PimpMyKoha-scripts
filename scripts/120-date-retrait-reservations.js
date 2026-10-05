/* ============================================================
   120-date-retrait-reservations.js
   PimpMyKoha — Date limite de retrait des réservations
   Version : 2.0.0-preplugin
   Date : 2026-09-21

   - affiche la date limite de retrait dans les modales de retour ;
   - utilise prioritairement expiration_date renvoyé par Koha ;
   - repli calculé depuis waiting_date, puis depuis la date courante ;
   - aucun champ lié à l'expiration du lecteur n'est utilisé ;
   - auto-enregistrement PMK.
   ============================================================ */
(function (window, document) {
    "use strict";

    if (!window || !document) return;
    if (window.__PMK120HoldPickupExpiration) return;
    window.__PMK120HoldPickupExpiration = true;

    const MODULE_ID = "hold-pickup-expiration";
    const MODULE_VERSION = "2.0.0-preplugin";
    const PAGE_PATH = "/cgi-bin/koha/circ/returns.pl";
    const PAGE_ID = "circ.returns";
    const INFO_CLASS = "pmk120-hold-expiration-info";

    const DEFAULT_CONFIG = Object.freeze({
        enabled: true,
        fallbackDays: 11,
        excludeSundays: true,
        markFallbackAsEstimate: true,
        labelFr: "Mise de côté jusqu’au :",
        labelEn: "Hold available until:"
    });

    let currentConfig = clone(DEFAULT_CONFIG);
    let unsubscribe = null;
    let observer = null;
    const holdCache = new Map();
    const processedForms = new WeakMap();

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function language() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            return window.PMKConfig.getLanguage();
        }
        return String(document.documentElement.lang || navigator.language || "fr").toLowerCase().startsWith("en") ? "en" : "fr";
    }

    function normalizeConfig(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        return {
            enabled: source.enabled !== false,
            fallbackDays: Math.max(0, Math.min(60, Number(source.fallbackDays) || 11)),
            excludeSundays: source.excludeSundays !== false,
            markFallbackAsEstimate: source.markFallbackAsEstimate !== false,
            labelFr: String(source.labelFr || DEFAULT_CONFIG.labelFr),
            labelEn: String(source.labelEn || DEFAULT_CONFIG.labelEn)
        };
    }

    function parseKohaDate(value) {
        const raw = String(value || "").trim();
        if (!raw) return null;

        // Les dates Koha de type YYYY-MM-DD sont interprétées en heure locale
        // afin d'éviter un décalage d'un jour dû à UTC.
        const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateOnly) {
            const parsed = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12, 0, 0, 0);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }

        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function formatDate(date) {
        return new Intl.DateTimeFormat(language() === "en" ? "en-GB" : "fr-FR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        }).format(date);
    }

    function addFallbackDays(baseDate, days, excludeSundays) {
        const result = new Date(baseDate.getTime());
        result.setHours(12, 0, 0, 0);
        let remaining = Math.max(0, Number(days) || 0);
        while (remaining > 0) {
            result.setDate(result.getDate() + 1);
            if (excludeSundays && result.getDay() === 0) continue;
            remaining -= 1;
        }
        return result;
    }

    function resolveExpiration(hold) {
        if (!hold || typeof hold !== "object") return null;

        // expiration_date est le champ REST Koha documenté pour la fin du hold.
        const exact = parseKohaDate(hold.expiration_date || hold.waiting_expires_on || hold.expirationdate);
        if (exact) {
            return { date: exact, estimated: false, source: hold.expiration_date ? "expiration_date" : "legacy-expiration" };
        }

        const waiting = parseKohaDate(hold.waiting_date);
        const base = waiting || new Date();
        return {
            date: addFallbackDays(base, currentConfig.fallbackDays, currentConfig.excludeSundays),
            estimated: true,
            source: waiting ? "waiting_date+fallback" : "today+fallback"
        };
    }

    async function fetchHold(holdId) {
        const id = String(holdId || "").trim();
        if (!id) throw new Error("hold_id absent");
        if (holdCache.has(id)) return holdCache.get(id);

        const promise = (async function () {
            const url = new URL("/api/v1/holds", window.location.origin);
            url.searchParams.set("hold_id", id);
            url.searchParams.set("_per_page", "1");
            const response = await fetch(url.toString(), {
                method: "GET",
                credentials: "same-origin",
                headers: { "Accept": "application/json" }
            });
            if (!response.ok) throw new Error("Koha REST " + response.status);
            const rows = await response.json();
            if (!Array.isArray(rows) || !rows.length) throw new Error("Réservation introuvable : " + id);
            return rows[0];
        })().catch(function (error) {
            holdCache.delete(id);
            throw error;
        });

        holdCache.set(id, promise);
        return promise;
    }

    function modalBodyFor(form) {
        if (!form) return null;
        return form.querySelector(".modal-body, #hold-found-modal-body") ||
            (form.closest(".modal-content") && form.closest(".modal-content").querySelector(".modal-body")) ||
            form.closest(".modal-body") ||
            form;
    }

    function removeExisting(body) {
        if (!body) return;
        body.querySelectorAll("." + INFO_CLASS).forEach(function (node) { node.remove(); });
    }

    function injectLine(form, holdId, resolved) {
        const body = modalBodyFor(form);
        if (!body || !resolved || !resolved.date) return;
        removeExisting(body);

        const box = document.createElement("div");
        box.className = "alert alert-info " + INFO_CLASS;
        box.dataset.holdId = String(holdId);
        box.dataset.source = resolved.source;
        box.style.margin = "10px 0";
        box.style.padding = "8px 12px";

        const label = language() === "en" ? currentConfig.labelEn : currentConfig.labelFr;
        const estimate = resolved.estimated && currentConfig.markFallbackAsEstimate
            ? (language() === "en" ? " (estimated)" : " (estimation)")
            : "";
        box.innerHTML = '<strong><i class="fa-regular fa-calendar" aria-hidden="true"></i> ' +
            escapeHtml(label) + '</strong> ' + escapeHtml(formatDate(resolved.date) + estimate);

        const title = body.querySelector("h1, h2, h3, h4, .modal-title");
        if (title && title.parentNode) title.insertAdjacentElement("afterend", box);
        else body.prepend(box);

        if (window.PMKConfig && typeof window.PMKConfig.mountContextButton === "function") {
            try {
                window.PMKConfig.mountContextButton({
                    moduleId: MODULE_ID,
                    anchor: box,
                    position: "append",
                    contextKey: "pmk120-hold-expiration"
                });
            } catch (_) {}
        }
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
            return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char];
        });
    }

    function reserveIdFor(form) {
        if (!form) return "";
        const input = form.querySelector('input[name="reserve_id"], input[name="hold_id"], #reserve_id');
        return input ? String(input.value || "").trim() : "";
    }

    async function processForm(form) {
        if (!form || currentConfig.enabled === false) return;
        const holdId = reserveIdFor(form);
        if (!holdId) return;
        if (processedForms.get(form) === holdId) return;
        processedForms.set(form, holdId);

        try {
            const hold = await fetchHold(holdId);
            const resolved = resolveExpiration(hold);
            if (resolved) injectLine(form, holdId, resolved);
        } catch (error) {
            // Le workflow Koha ne doit jamais être bloqué si l'information
            // complémentaire ne peut pas être calculée.
            console.warn("[PMK120] Date de retrait indisponible", error);
        }
    }

    function candidateForms(root) {
        const scope = root && root.querySelectorAll ? root : document;
        const forms = Array.from(scope.querySelectorAll(
            "#hold-found-modal-form, form.confirm, .modal form"
        ));
        if (root && root.matches && root.matches("form")) forms.unshift(root);
        return Array.from(new Set(forms));
    }

    function scan(root) {
        if (window.location.pathname !== PAGE_PATH || currentConfig.enabled === false) return;
        candidateForms(root).forEach(processForm);
    }

    function installObserver() {
        if (observer || typeof MutationObserver !== "function") return;
        observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (node && node.nodeType === 1) scan(node);
                });
            });
        });
        observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }

    function validate(config) {
        const cfg = normalizeConfig(config);
        if (!Number.isFinite(cfg.fallbackDays) || cfg.fallbackDays < 0) {
            return { ok: false, message: "Le nombre de jours de repli est invalide." };
        }
        return { ok: true };
    }

    function definition() {
        return {
            id: MODULE_ID,
            schemaVersion: 1,
            name: { fr: "Date limite de retrait des réservations", en: "Hold pickup expiration date" },
            description: {
                fr: "Affiche dans les fenêtres de retour la date limite de mise à disposition. Utilise expiration_date Koha et calcule seulement un repli si Koha ne fournit aucune date.",
                en: "Displays the pickup expiration date in check-in dialogs. Uses Koha expiration_date and only computes a fallback when Koha does not provide one."
            },
            category: { fr: "Circulation / réservations", en: "Circulation / holds" },
            supportedPages: [PAGE_ID],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            normalize: normalizeConfig,
            validate: validate,
            schema: [
                {
                    type: "section",
                    id: "settings",
                    label: { fr: "Réglages", en: "Settings" },
                    fields: [
                        { key: "enabled", type: "boolean", label: { fr: "Activer l’affichage", en: "Enable display" } },
                        {
                            key: "fallbackDays",
                            type: "number",
                            label: { fr: "Nombre de jours de repli", en: "Fallback days" },
                            help: { fr: "Utilisé uniquement si Koha ne renvoie pas expiration_date. Valeur Dracénie historique : 11.", en: "Used only when Koha does not return expiration_date. Historical Dracénie value: 11." }
                        },
                        { key: "excludeSundays", type: "boolean", label: { fr: "Ne pas compter les dimanches dans le repli", en: "Exclude Sundays from fallback" } },
                        { key: "markFallbackAsEstimate", type: "boolean", label: { fr: "Indiquer qu’une date calculée est une estimation", en: "Mark computed dates as estimated" } },
                        { key: "labelFr", type: "text", label: { fr: "Libellé — français", en: "Label — French" } },
                        { key: "labelEn", type: "text", label: { fr: "Libellé — anglais", en: "Label — English" } }
                    ]
                }
            ]
        };
    }

    function registerModule() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return false;
        try { window.PMKConfig.registerModule(definition()); } catch (_) { return false; }
        if (!unsubscribe && typeof window.PMKConfig.subscribe === "function") {
            try {
                unsubscribe = window.PMKConfig.subscribe(MODULE_ID, function (config) {
                    currentConfig = normalizeConfig(config);
                    if (currentConfig.enabled) scan(document);
                    else document.querySelectorAll("." + INFO_CLASS).forEach(function (node) { node.remove(); });
                });
            } catch (_) {}
        }
        return true;
    }

    async function loadConfig() {
        registerModule();
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") return clone(DEFAULT_CONFIG);
        try { return normalizeConfig(await window.PMKConfig.getConfig(MODULE_ID)); }
        catch (_) { return clone(DEFAULT_CONFIG); }
    }

    async function start() {
        currentConfig = await loadConfig();
        if (window.location.pathname !== PAGE_PATH) return;
        installObserver();
        scan(document);
    }

    window.PMK120HoldPickupExpiration = {
        moduleId: MODULE_ID,
        version: MODULE_VERSION,
        refresh: function () { return loadConfig().then(function (cfg) { currentConfig = cfg; scan(document); }); }
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();

    if (!window.PMKConfig) {
        window.addEventListener("pmk:config-ready", function () { registerModule(); }, { once: true });
    }
})(window, document);

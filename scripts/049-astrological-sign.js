/*
 Nom du fichier: 049-astrological-sign.js
 Version: 2.0.0-pmk-isolated
 Date de dernière modification: 2026-09-19
 Auteur: Michael Mundet
 Description:
   Affiche le signe astrologique occidental calculé depuis la date de naissance
   sur la fiche lecteur Koha (moremember.pl).

   Refonte préparatoire PimpMyKoha :
   - conserve les bornes historiques des 12 signes ;
   - s'appuie sur l'âge natif Koha (.age_years), sans recalculer l'âge ;
   - vrai affichage/masquage accessible au clavier ;
   - FR/EN ;
   - détection prudente des formats de date Koha courants ;
   - idempotent, sans doublon d'élément ni d'événement ;
   - MutationObserver limité au bloc lecteur ;
   - configuration via PMKConfig, avec valeurs par défaut locales en secours ;
   - aucun console.* et aucun appel réseau propre au module.
*/
(function () {
    "use strict";

    const MODULE_ID = "patron-astrological-sign";
    const PAGE_ID = "members.moremember";
    const PAGE_PATH = "/cgi-bin/koha/members/moremember.pl";
    const SCRIPT_GUARD = "__pmk049AstrologicalSignV2";
    const SIGN_ATTR = "data-koha-astro-sign";
    const TOGGLE_ATTR = "data-koha-astro-toggle";
    const BOUND_ATTR = "data-koha-astro-bound";
    const STYLE_ID = "pmk-049-astrological-sign-style";

    if (window[SCRIPT_GUARD]) return;
    window[SCRIPT_GUARD] = true;

    /*
     * Important : sur une page non concernée, retour immédiat.
     * La définition d'administration du module est pré-enregistrée par le 000 PMK.
     */
    if (window.location.pathname !== PAGE_PATH) return;

    const DEFAULTS = {
        enabled: true,
        page: {
            enabled: true,
            pageId: PAGE_ID,
            path: PAGE_PATH
        },
        displayMode: "toggle",
        language: "auto"
    };

    const SIGNS = [
        { key: "capricorn", fr: "Capricorne", en: "Capricorn" },
        { key: "aquarius", fr: "Verseau", en: "Aquarius" },
        { key: "pisces", fr: "Poissons", en: "Pisces" },
        { key: "aries", fr: "Bélier", en: "Aries" },
        { key: "taurus", fr: "Taureau", en: "Taurus" },
        { key: "gemini", fr: "Gémeaux", en: "Gemini" },
        { key: "cancer", fr: "Cancer", en: "Cancer" },
        { key: "leo", fr: "Lion", en: "Leo" },
        { key: "virgo", fr: "Vierge", en: "Virgo" },
        { key: "libra", fr: "Balance", en: "Libra" },
        { key: "scorpio", fr: "Scorpion", en: "Scorpio" },
        { key: "sagittarius", fr: "Sagittaire", en: "Sagittarius" }
    ];

    const SIGN_BY_KEY = SIGNS.reduce(function (map, sign) {
        map[sign.key] = sign;
        return map;
    }, Object.create(null));

    const boundElements = new Map();
    let observer = null;
    let currentConfig = clone(DEFAULTS);
    let refreshQueued = false;

    function clone(value) {
        try {
            if (typeof structuredClone === "function") return structuredClone(value);
        } catch (_) {}
        return JSON.parse(JSON.stringify(value));
    }

    function mergeConfig(base, extra) {
        const out = clone(base);
        const src = extra && typeof extra === "object" ? extra : {};

        Object.keys(src).forEach(function (key) {
            if (
                src[key] &&
                typeof src[key] === "object" &&
                !Array.isArray(src[key]) &&
                out[key] &&
                typeof out[key] === "object" &&
                !Array.isArray(out[key])
            ) {
                out[key] = Object.assign({}, out[key], src[key]);
            } else {
                out[key] = src[key];
            }
        });

        return out;
    }

    function normalizeConfig(config) {
        const value = mergeConfig(DEFAULTS, config || {});
        value.enabled = value.enabled !== false;
        value.page = Object.assign({}, DEFAULTS.page, value.page || {});
        value.page.enabled = value.page.enabled !== false;
        value.page.pageId = PAGE_ID;
        value.page.path = PAGE_PATH;
        if (!["toggle", "always"].includes(value.displayMode)) value.displayMode = DEFAULTS.displayMode;
        if (!["auto", "fr", "en"].includes(value.language)) value.language = DEFAULTS.language;
        return value;
    }

    function pmkApi() {
        return window.PMKConfig && typeof window.PMKConfig === "object" ? window.PMKConfig : null;
    }

    function languageOf(config) {
        if (config.language === "fr" || config.language === "en") return config.language;

        const api = pmkApi();
        if (api && typeof api.getLanguage === "function") {
            try {
                const detected = String(api.getLanguage() || "").toLowerCase();
                if (detected.startsWith("en")) return "en";
                if (detected.startsWith("fr")) return "fr";
            } catch (_) {}
        }

        const htmlLang = String(document.documentElement.getAttribute("lang") || "").toLowerCase();
        return htmlLang.startsWith("en") ? "en" : "fr";
    }

    function labels(config) {
        const lang = languageOf(config);
        return lang === "en"
            ? {
                title: "Show / hide astrological sign",
                show: "Show astrological sign",
                hide: "Hide astrological sign"
            }
            : {
                title: "Afficher / masquer le signe astrologique",
                show: "Afficher le signe astrologique",
                hide: "Masquer le signe astrologique"
            };
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .pmk-astro049-toggle {
                cursor: pointer;
                text-decoration-line: underline;
                text-decoration-style: dotted;
                text-decoration-thickness: from-font;
                text-underline-offset: .14em;
            }
            .pmk-astro049-toggle:focus-visible {
                outline: 2px solid currentColor;
                outline-offset: 2px;
                border-radius: .2rem;
            }
            .pmk-astro049-sign {
                display: inline;
                margin-inline-start: .3rem;
                white-space: normal;
            }
            .pmk-astro049-sign[hidden] {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    function removeStylesIfUnused() {
        if (document.querySelector("[" + SIGN_ATTR + "]")) return;
        const style = document.getElementById(STYLE_ID);
        if (style) style.remove();
    }

    function rawKohaDateFormat() {
        const candidates = [
            window.dateformat,
            window.DateFormat,
            window.kohaDateFormat,
            document.documentElement.getAttribute("data-dateformat"),
            document.body && document.body.getAttribute("data-dateformat")
        ];

        for (let i = 0; i < candidates.length; i += 1) {
            const value = String(candidates[i] == null ? "" : candidates[i]).trim().toLowerCase();
            if (value) return value;
        }
        return "";
    }

    function preferredDateOrder() {
        const value = rawKohaDateFormat();
        if (/(^|[^a-z])(us|mdy|mm[\/.-]dd)([^a-z]|$)/.test(value)) return "mdy";
        if (/(iso|rfc|ymd|yyyy)/.test(value)) return "ymd";
        if (/(metric|dmy|dd[\/.-]mm|dmydot)/.test(value)) return "dmy";
        return "dmy";
    }

    function makeValidatedDate(year, month, day) {
        year = Number(year);
        month = Number(month);
        day = Number(day);

        if (!Number.isInteger(year) || year < 1000 || year > 9999) return null;
        if (!Number.isInteger(month) || month < 1 || month > 12) return null;
        if (!Number.isInteger(day) || day < 1 || day > 31) return null;

        const date = new Date(year, month - 1, day);
        if (
            date.getFullYear() !== year ||
            date.getMonth() !== month - 1 ||
            date.getDate() !== day
        ) return null;

        return { year: year, month: month, day: day };
    }

    function parseDateFromText(text) {
        const source = String(text || "").replace(/\u00a0/g, " ");

        /* Formats année en premier : 2026-09-19, 2026/09/19, 2026.09.19 */
        let match = source.match(/(?:^|\D)(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})(?!\d)/);
        if (match) return makeValidatedDate(match[1], match[2], match[3]);

        /* Formats jour/mois ou mois/jour. */
        match = source.match(/(?:^|\D)(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})(?!\d)/);
        if (!match) return null;

        const first = Number(match[1]);
        const second = Number(match[2]);
        const year = Number(match[3]);
        let month;
        let day;

        if (first > 12 && second <= 12) {
            day = first;
            month = second;
        } else if (second > 12 && first <= 12) {
            month = first;
            day = second;
        } else if (preferredDateOrder() === "mdy") {
            month = first;
            day = second;
        } else {
            day = first;
            month = second;
        }

        return makeValidatedDate(year, month, day);
    }

    function birthDateForAge(ageSpan) {
        const row = ageSpan.closest("li") || ageSpan.parentElement;
        if (!row) return null;

        const cloneNode = row.cloneNode(true);
        cloneNode.querySelectorAll(
            ".age_years, [" + SIGN_ATTR + "], .pmk-context-config"
        ).forEach(function (element) {
            element.remove();
        });

        return parseDateFromText(cloneNode.textContent || "");
    }

    function signKeyFor(day, month) {
        if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return "aquarius";
        if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return "pisces";
        if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return "aries";
        if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return "taurus";
        if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return "gemini";
        if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return "cancer";
        if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return "leo";
        if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return "virgo";
        if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return "libra";
        if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return "scorpio";
        if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return "sagittarius";
        if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return "capricorn";
        return null;
    }

    function signText(key, config) {
        const sign = SIGN_BY_KEY[key];
        if (!sign) return "";
        return languageOf(config) === "en" ? sign.en : sign.fr;
    }

    function uniqueSignId(ageSpan) {
        const existingId = ageSpan.getAttribute("data-pmk-astro-sign-id");
        if (existingId && !document.getElementById(existingId)) return existingId;

        const base = "pmk-astro049-sign";
        let n = 1;
        let candidate = base;
        while (document.getElementById(candidate)) {
            n += 1;
            candidate = base + "-" + n;
        }
        ageSpan.setAttribute("data-pmk-astro-sign-id", candidate);
        return candidate;
    }

    function setVisible(ageSpan, signSpan, visible, config) {
        const ui = labels(config);
        signSpan.hidden = !visible;
        signSpan.setAttribute("aria-hidden", visible ? "false" : "true");
        ageSpan.setAttribute("aria-expanded", visible ? "true" : "false");
        ageSpan.setAttribute("aria-label", visible ? ui.hide : ui.show);
        ageSpan.title = ui.title;
    }

    function restoreAttribute(element, name, value) {
        if (value == null) element.removeAttribute(name);
        else element.setAttribute(name, value);
    }

    function clearBinding(ageSpan) {
        const binding = boundElements.get(ageSpan);
        if (binding) {
            try { ageSpan.removeEventListener("click", binding.click); } catch (_) {}
            try { ageSpan.removeEventListener("keydown", binding.keydown); } catch (_) {}

            restoreAttribute(ageSpan, "role", binding.original.role);
            restoreAttribute(ageSpan, "tabindex", binding.original.tabindex);
            restoreAttribute(ageSpan, "aria-expanded", binding.original.ariaExpanded);
            restoreAttribute(ageSpan, "aria-controls", binding.original.ariaControls);
            restoreAttribute(ageSpan, "aria-label", binding.original.ariaLabel);
            restoreAttribute(ageSpan, "title", binding.original.title);
            boundElements.delete(ageSpan);
        } else if (ageSpan.hasAttribute(BOUND_ATTR)) {
            ageSpan.removeAttribute("role");
            ageSpan.removeAttribute("tabindex");
            ageSpan.removeAttribute("aria-expanded");
            ageSpan.removeAttribute("aria-controls");
            ageSpan.removeAttribute("aria-label");
            ageSpan.removeAttribute("title");
        }

        ageSpan.removeAttribute(TOGGLE_ATTR);
        ageSpan.removeAttribute(BOUND_ATTR);
        ageSpan.removeAttribute("data-pmk-astro-sign-id");
        ageSpan.classList.remove("pmk-astro049-toggle");
    }

    function removeExistingSign(ageSpan) {
        const row = ageSpan.closest("li") || ageSpan.parentElement;
        if (!row) return;
        row.querySelectorAll("[" + SIGN_ATTR + "]").forEach(function (sign) {
            sign.remove();
        });
    }

    function cleanup() {
        Array.from(boundElements.keys()).forEach(clearBinding);
        document.querySelectorAll(".age_years[" + TOGGLE_ATTR + "]").forEach(clearBinding);
        document.querySelectorAll("[" + SIGN_ATTR + "]").forEach(function (sign) {
            sign.remove();
        });
        removeStylesIfUnused();
    }

    function decorate(ageSpan, config) {
        if (!ageSpan || !(ageSpan instanceof Element)) return;

        clearBinding(ageSpan);
        removeExistingSign(ageSpan);

        const birth = birthDateForAge(ageSpan);
        if (!birth) return;

        const key = signKeyFor(birth.day, birth.month);
        const value = signText(key, config);
        if (!key || !value) return;

        injectStyles();

        const signSpan = document.createElement("span");
        const signId = uniqueSignId(ageSpan);
        signSpan.id = signId;
        signSpan.className = "pmk-astro049-sign";
        signSpan.setAttribute(SIGN_ATTR, "1");
        signSpan.setAttribute("data-koha-astro-key", key);
        signSpan.textContent = value;

        ageSpan.insertAdjacentElement("afterend", signSpan);

        if (config.displayMode === "always") {
            signSpan.hidden = false;
            signSpan.setAttribute("aria-hidden", "false");
            return;
        }

        ageSpan.setAttribute(TOGGLE_ATTR, "1");
        ageSpan.setAttribute(BOUND_ATTR, "1");
        ageSpan.setAttribute("role", "button");
        ageSpan.setAttribute("tabindex", "0");
        ageSpan.setAttribute("aria-controls", signId);
        ageSpan.classList.add("pmk-astro049-toggle");

        const original = {
            role: ageSpan.getAttribute("role"),
            tabindex: ageSpan.getAttribute("tabindex"),
            ariaExpanded: ageSpan.getAttribute("aria-expanded"),
            ariaControls: ageSpan.getAttribute("aria-controls"),
            ariaLabel: ageSpan.getAttribute("aria-label"),
            title: ageSpan.getAttribute("title")
        };

        const toggle = function () {
            setVisible(ageSpan, signSpan, signSpan.hidden, config);
        };
        const keydown = function (event) {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            toggle();
        };
        const click = function (event) {
            event.preventDefault();
            toggle();
        };

        ageSpan.addEventListener("click", click);
        ageSpan.addEventListener("keydown", keydown);
        boundElements.set(ageSpan, { click: click, keydown: keydown, original: original });
        setVisible(ageSpan, signSpan, false, config);
    }

    function refresh() {
        cleanup();

        if (!currentConfig.enabled || !currentConfig.page || currentConfig.page.enabled === false) {
            stopObserver();
            return;
        }

        document.querySelectorAll(".age_years").forEach(function (ageSpan) {
            decorate(ageSpan, currentConfig);
        });

        startObserver();
    }

    function scheduleRefresh() {
        if (refreshQueued) return;
        refreshQueued = true;
        Promise.resolve().then(function () {
            refreshQueued = false;
            refresh();
        });
    }

    function startObserver() {
        if (observer) return;
        const root = document.getElementById("patron-information");
        if (!root) return;

        observer = new MutationObserver(function (mutations) {
            let needsRefresh = false;

            for (let i = 0; i < mutations.length && !needsRefresh; i += 1) {
                const added = mutations[i].addedNodes;
                for (let j = 0; j < added.length; j += 1) {
                    const node = added[j];
                    if (!(node instanceof Element)) continue;
                    if (node.matches(".age_years") || node.querySelector(".age_years")) {
                        needsRefresh = true;
                        break;
                    }
                }
            }

            if (needsRefresh) scheduleRefresh();
        });

        observer.observe(root, { childList: true, subtree: true });
    }

    function stopObserver() {
        if (!observer) return;
        try { observer.disconnect(); } catch (_) {}
        observer = null;
    }

    function mountConfigShortcut() {
        const api = pmkApi();
        if (!api || typeof api.mountContextButton !== "function") return;

        const heading = document.querySelector("#patron-information .patroninfo-heading");
        if (!heading) return;

        api.mountContextButton({
            moduleId: MODULE_ID,
            anchor: heading,
            position: "append",
            contextKey: PAGE_ID,
            context: {
                sectionId: "display",
                pageId: PAGE_ID
            }
        });
    }

    function useConfig(config) {
        currentConfig = normalizeConfig(config);
        refresh();
        mountConfigShortcut();
    }

    function connectPmkConfig() {
        const api = pmkApi();
        if (!api || typeof api.getConfig !== "function") {
            useConfig(DEFAULTS);
            return false;
        }

        mountConfigShortcut();

        try {
            if (typeof api.subscribe === "function") {
                api.subscribe(MODULE_ID, function (config) {
                    useConfig(config);
                });
            }
        } catch (_) {}

        api.getConfig(MODULE_ID)
            .then(useConfig)
            .catch(function () {
                useConfig(DEFAULTS);
            });

        return true;
    }

    function start() {
        if (!connectPmkConfig()) {
            window.addEventListener("pmk:config-ready", function onReady() {
                window.removeEventListener("pmk:config-ready", onReady);
                connectPmkConfig();
            }, { once: true });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();

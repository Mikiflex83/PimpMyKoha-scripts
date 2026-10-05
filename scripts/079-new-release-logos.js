/*
 Nom du fichier: 079-new-release-logos.js
 Module PMK: Indicateurs de nouveauté
 Version: 3.0.0-pmk-isolated
 Date de dernière modification: 2026-09-20
 Auteur: Michael Mundet / refactorisation PimpMyKoha

 Fonction:
 - affiche un seul badge de nouveauté par notice ;
 - le badge est calculé à partir de la date d'acquisition de l'exemplaire le plus récent ;
 - fonctionne sur catalogue/search.pl et catalogue/detail.pl ;
 - conserve les seuils historiques 3 mois / 6 mois / 1 an par défaut ;
 - conserve .date_achat comme source historique Dracénie sur search.pl ;
 - utilise dateaccessioned / acquisition_date sur detail.pl ;
 - s'intègre directement à PMK sans modification du socle 000 ;
 - FR/EN, responsive, idempotent, sans dépendance jQuery.
*/

(function () {
    "use strict";

    const MODULE_ID = "new-release-indicators";
    const MODULE_VERSION = "3.0.0-pmk-isolated";
    const SCRIPT_GUARD = "__pmk079NewReleaseIndicatorsV3";
    const STYLE_ID = "pmk079-new-release-style";
    const GENERATED_ATTR = "data-pmk079-generated";

    const SEARCH_PATH = "/cgi-bin/koha/catalogue/search.pl";
    const DETAIL_PATH = "/cgi-bin/koha/catalogue/detail.pl";
    const SEARCH_PAGE_ID = "catalogue.search.results";
    const DETAIL_PAGE_ID = "catalogue.detail";

    if (window[SCRIPT_GUARD]) return;
    window[SCRIPT_GUARD] = true;

    const DEFAULTS = {
        enabled: true,
        pages: {
            search: {
                enabled: true,
                pageId: SEARCH_PAGE_ID,
                path: SEARCH_PATH,
                rowSelector: 'tr[id^="row"]',
                dateSelector: ".date_achat",
                preferredTargetSelector: ".bookcoverimg"
            },
            detail: {
                enabled: true,
                pageId: DETAIL_PAGE_ID,
                path: DETAIL_PATH,
                rowSelector: "#holdings_table tbody tr",
                dateSelector: 'td.dateaccessioned, td[data-colname="acquisition_date"]',
                preferredTargetSelector: "#catalogue_detail_biblio p.first"
            }
        },
        thresholds: {
            recent: {
                days: 90,
                labelFr: "3m",
                labelEn: "3m",
                color: "#008000",
                tooltipFr: "Nouveauté de moins de 3 mois",
                tooltipEn: "New acquisition less than 3 months old"
            },
            medium: {
                days: 180,
                labelFr: "6m",
                labelEn: "6m",
                color: "#ffa500",
                tooltipFr: "Nouveauté de moins de 6 mois",
                tooltipEn: "New acquisition less than 6 months old"
            },
            year: {
                days: 365,
                labelFr: "1a",
                labelEn: "1y",
                color: "#ff0000",
                tooltipFr: "Nouveauté de moins de 1 an",
                tooltipEn: "New acquisition less than 1 year old"
            }
        },
        appearance: {
            showIcon: true,
            icon: "★",
            fontSizePx: 14,
            compact: true
        },
        behavior: {
            observeDynamicChanges: true,
            observeDelayMs: 120
        }
    };

    let currentConfig = clone(DEFAULTS);
    let unsubscribe = null;
    let observer = null;
    let observerTimer = null;
    let pmkRegistered = false;
    let started = false;

    function clone(value) {
        try {
            if (typeof structuredClone === "function") return structuredClone(value);
        } catch (_) {}
        return JSON.parse(JSON.stringify(value));
    }

    function object(value) {
        return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    }

    function merge(base, extra) {
        const out = clone(base);
        const src = object(extra);
        Object.keys(src).forEach(function (key) {
            const incoming = src[key];
            if (
                incoming && typeof incoming === "object" && !Array.isArray(incoming) &&
                out[key] && typeof out[key] === "object" && !Array.isArray(out[key])
            ) {
                out[key] = merge(out[key], incoming);
            } else {
                out[key] = clone(incoming);
            }
        });
        return out;
    }

    function integer(value, fallback, min, max) {
        let n = Number(value);
        if (!Number.isFinite(n)) n = fallback;
        n = Math.round(n);
        if (Number.isFinite(min)) n = Math.max(min, n);
        if (Number.isFinite(max)) n = Math.min(max, n);
        return n;
    }

    function cleanText(value, fallback) {
        const text = String(value == null ? "" : value).trim();
        return text || String(fallback == null ? "" : fallback);
    }

    function normalizeColor(value, fallback) {
        const candidate = String(value || "").trim();
        return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toLowerCase() : fallback;
    }

    function normalizeConfig(config) {
        const value = merge(DEFAULTS, object(config));

        value.enabled = value.enabled !== false;
        value.pages = merge(DEFAULTS.pages, object(value.pages));
        value.pages.search = merge(DEFAULTS.pages.search, object(value.pages.search));
        value.pages.detail = merge(DEFAULTS.pages.detail, object(value.pages.detail));
        value.pages.search.enabled = value.pages.search.enabled !== false;
        value.pages.detail.enabled = value.pages.detail.enabled !== false;
        value.pages.search.pageId = SEARCH_PAGE_ID;
        value.pages.detail.pageId = DETAIL_PAGE_ID;
        value.pages.search.path = SEARCH_PATH;
        value.pages.detail.path = DETAIL_PATH;

        value.thresholds = merge(DEFAULTS.thresholds, object(value.thresholds));
        ["recent", "medium", "year"].forEach(function (key) {
            value.thresholds[key] = merge(DEFAULTS.thresholds[key], object(value.thresholds[key]));
        });

        value.thresholds.recent.days = integer(value.thresholds.recent.days, 90, 1, 3650);
        value.thresholds.medium.days = integer(value.thresholds.medium.days, 180, 1, 3650);
        value.thresholds.year.days = integer(value.thresholds.year.days, 365, 1, 3650);

        ["recent", "medium", "year"].forEach(function (key) {
            const base = DEFAULTS.thresholds[key];
            const tier = value.thresholds[key];
            tier.labelFr = cleanText(tier.labelFr, base.labelFr);
            tier.labelEn = cleanText(tier.labelEn, base.labelEn);
            tier.tooltipFr = cleanText(tier.tooltipFr, base.tooltipFr);
            tier.tooltipEn = cleanText(tier.tooltipEn, base.tooltipEn);
            tier.color = normalizeColor(tier.color, base.color);
        });

        value.appearance = merge(DEFAULTS.appearance, object(value.appearance));
        value.appearance.showIcon = value.appearance.showIcon !== false;
        value.appearance.icon = cleanText(value.appearance.icon, DEFAULTS.appearance.icon);
        value.appearance.fontSizePx = integer(value.appearance.fontSizePx, 14, 9, 28);
        value.appearance.compact = value.appearance.compact !== false;

        value.behavior = merge(DEFAULTS.behavior, object(value.behavior));
        value.behavior.observeDynamicChanges = value.behavior.observeDynamicChanges !== false;
        value.behavior.observeDelayMs = integer(value.behavior.observeDelayMs, 120, 50, 2000);

        value.pages.search.rowSelector = cleanText(
            value.pages.search.rowSelector,
            DEFAULTS.pages.search.rowSelector
        );
        value.pages.search.dateSelector = cleanText(
            value.pages.search.dateSelector,
            DEFAULTS.pages.search.dateSelector
        );
        value.pages.search.preferredTargetSelector = cleanText(
            value.pages.search.preferredTargetSelector,
            DEFAULTS.pages.search.preferredTargetSelector
        );
        value.pages.detail.rowSelector = cleanText(
            value.pages.detail.rowSelector,
            DEFAULTS.pages.detail.rowSelector
        );
        value.pages.detail.dateSelector = cleanText(
            value.pages.detail.dateSelector,
            DEFAULTS.pages.detail.dateSelector
        );
        value.pages.detail.preferredTargetSelector = cleanText(
            value.pages.detail.preferredTargetSelector,
            DEFAULTS.pages.detail.preferredTargetSelector
        );

        return value;
    }

    function validateConfig(config) {
        const value = normalizeConfig(config);
        const lang = language();
        const fail = function (fr, en) {
            return { ok: false, message: lang === "en" ? en : fr };
        };

        if (!(value.thresholds.recent.days < value.thresholds.medium.days)) {
            return fail(
                "Le premier seuil doit être inférieur au deuxième.",
                "The first threshold must be lower than the second."
            );
        }
        if (!(value.thresholds.medium.days < value.thresholds.year.days)) {
            return fail(
                "Le deuxième seuil doit être inférieur au troisième.",
                "The second threshold must be lower than the third."
            );
        }
        return { ok: true };
    }

    function pmkApi() {
        return window.PMKConfig && typeof window.PMKConfig === "object"
            ? window.PMKConfig
            : null;
    }

    function language() {
        const api = pmkApi();
        if (api && typeof api.getLanguage === "function") {
            try { return api.getLanguage() === "en" ? "en" : "fr"; } catch (_) {}
        }
        const htmlLang = (document.documentElement.getAttribute("lang") || "").toLowerCase();
        if (htmlLang.startsWith("en")) return "en";
        const navLang = (navigator.language || "").toLowerCase();
        return navLang.startsWith("en") ? "en" : "fr";
    }

    function registerPmkDefinition() {
        const api = pmkApi();
        if (!api || typeof api.registerModule !== "function") return false;
        if (pmkRegistered) return true;

        try {
            api.registerModule({
                id: MODULE_ID,
                schemaVersion: 1,
                name: {
                    fr: "Indicateurs de nouveauté",
                    en: "New acquisition indicators"
                },
                description: {
                    fr: "Affiche un badge de nouveauté calculé à partir de la date d’acquisition de l’exemplaire le plus récent, sur les résultats de recherche et la notice détaillée.",
                    en: "Displays a new-acquisition badge calculated from the most recent item acquisition date on search results and record detail pages."
                },
                category: {
                    fr: "Catalogue / affichage",
                    en: "Catalog / display"
                },
                supportedPages: [SEARCH_PAGE_ID, DETAIL_PAGE_ID],
                prerequisites: [
                    {
                        fr: "Sur search.pl, la configuration Dracénie utilise la classe .date_achat produite par le rendu/XSLT local. Sur une autre installation, renseigner le sélecteur qui contient les dates d’acquisition.",
                        en: "On search.pl, the Dracénie defaults use the .date_achat class produced by the local XSLT/output. On another installation, set the selector containing acquisition dates."
                    }
                ],
                dependencies: [],
                defaults: clone(DEFAULTS),
                normalize: normalizeConfig,
                validate: validateConfig,
                schema: [
                    {
                        type: "section",
                        id: "general",
                        label: { fr: "Fonctionnement", en: "Behavior" },
                        description: {
                            fr: "Une notice reçoit au maximum un badge. Le calcul retient uniquement l’exemplaire dont la date d’acquisition est la plus récente. Les dates futures et invalides sont ignorées.",
                            en: "A record receives at most one badge. The calculation only uses the item with the most recent acquisition date. Future and invalid dates are ignored."
                        },
                        fields: [
                            {
                                key: "enabled",
                                type: "boolean",
                                label: { fr: "Activer le module", en: "Enable module" }
                            }
                        ]
                    },
                    {
                        type: "section",
                        id: "pages",
                        label: { fr: "Pages actives", en: "Enabled pages" },
                        description: {
                            fr: "Les deux pages historiques sont actives par défaut et peuvent être désactivées indépendamment.",
                            en: "Both historical pages are enabled by default and can be disabled independently."
                        },
                        fields: [
                            {
                                key: "pages.search.enabled",
                                type: "boolean",
                                label: { fr: "Résultats de recherche — search.pl", en: "Search results — search.pl" }
                            },
                            {
                                key: "pages.detail.enabled",
                                type: "boolean",
                                label: { fr: "Détail de notice — detail.pl", en: "Record detail — detail.pl" }
                            }
                        ]
                    },
                    {
                        type: "section",
                        id: "thresholds",
                        label: { fr: "Seuils de nouveauté", en: "New acquisition thresholds" },
                        description: {
                            fr: "Valeurs historiques : 90 jours = 3m, 180 jours = 6m, 365 jours = 1a. Les seuils doivent rester croissants.",
                            en: "Historical defaults: 90 days = 3m, 180 days = 6m, 365 days = 1y. Thresholds must remain increasing."
                        },
                        fields: [
                            { key: "thresholds.recent.days", type: "number", min: 1, max: 3650, label: { fr: "Premier seuil — jours", en: "First threshold — days" } },
                            { key: "thresholds.recent.labelFr", type: "text", label: { fr: "Premier badge — libellé FR", en: "First badge — French label" } },
                            { key: "thresholds.recent.labelEn", type: "text", label: { fr: "Premier badge — libellé EN", en: "First badge — English label" } },
                            { key: "thresholds.recent.color", type: "color", label: { fr: "Premier badge — couleur", en: "First badge — color" } },
                            { key: "thresholds.recent.tooltipFr", type: "text", label: { fr: "Premier badge — infobulle FR", en: "First badge — French tooltip" } },
                            { key: "thresholds.recent.tooltipEn", type: "text", label: { fr: "Premier badge — infobulle EN", en: "First badge — English tooltip" } },

                            { key: "thresholds.medium.days", type: "number", min: 1, max: 3650, label: { fr: "Deuxième seuil — jours", en: "Second threshold — days" } },
                            { key: "thresholds.medium.labelFr", type: "text", label: { fr: "Deuxième badge — libellé FR", en: "Second badge — French label" } },
                            { key: "thresholds.medium.labelEn", type: "text", label: { fr: "Deuxième badge — libellé EN", en: "Second badge — English label" } },
                            { key: "thresholds.medium.color", type: "color", label: { fr: "Deuxième badge — couleur", en: "Second badge — color" } },
                            { key: "thresholds.medium.tooltipFr", type: "text", label: { fr: "Deuxième badge — infobulle FR", en: "Second badge — French tooltip" } },
                            { key: "thresholds.medium.tooltipEn", type: "text", label: { fr: "Deuxième badge — infobulle EN", en: "Second badge — English tooltip" } },

                            { key: "thresholds.year.days", type: "number", min: 1, max: 3650, label: { fr: "Troisième seuil — jours", en: "Third threshold — days" } },
                            { key: "thresholds.year.labelFr", type: "text", label: { fr: "Troisième badge — libellé FR", en: "Third badge — French label" } },
                            { key: "thresholds.year.labelEn", type: "text", label: { fr: "Troisième badge — libellé EN", en: "Third badge — English label" } },
                            { key: "thresholds.year.color", type: "color", label: { fr: "Troisième badge — couleur", en: "Third badge — color" } },
                            { key: "thresholds.year.tooltipFr", type: "text", label: { fr: "Troisième badge — infobulle FR", en: "Third badge — French tooltip" } },
                            { key: "thresholds.year.tooltipEn", type: "text", label: { fr: "Troisième badge — infobulle EN", en: "Third badge — English tooltip" } }
                        ]
                    },
                    {
                        type: "section",
                        id: "appearance",
                        label: { fr: "Apparence", en: "Appearance" },
                        description: {
                            fr: "Le rendu reste volontairement compact et proche de Koha. Les couleurs historiques restent les valeurs par défaut.",
                            en: "The display remains intentionally compact and close to Koha. Historical colors remain the defaults."
                        },
                        fields: [
                            { key: "appearance.showIcon", type: "boolean", label: { fr: "Afficher l’icône", en: "Show icon" } },
                            {
                                key: "appearance.icon",
                                type: "text",
                                label: { fr: "Icône / caractère", en: "Icon / character" },
                                when: function (root) { return root.appearance && root.appearance.showIcon !== false; }
                            },
                            { key: "appearance.fontSizePx", type: "number", min: 9, max: 28, label: { fr: "Taille du texte (px)", en: "Text size (px)" } },
                            { key: "appearance.compact", type: "boolean", label: { fr: "Rendu compact", en: "Compact display" } }
                        ]
                    },
                    {
                        type: "section",
                        id: "advanced",
                        label: { fr: "Compatibilité / réglages avancés", en: "Compatibility / advanced settings" },
                        description: {
                            fr: "Ces sélecteurs permettent d’adapter le module à une autre installation sans modifier le code. Les valeurs Dracénie historiques sont préchargées.",
                            en: "These selectors let the module adapt to another installation without code changes. Historical Dracénie values are preloaded."
                        },
                        fields: [
                            { key: "pages.search.rowSelector", type: "text", advanced: true, label: { fr: "Search — sélecteur d’une ligne de résultat", en: "Search — result row selector" } },
                            { key: "pages.search.dateSelector", type: "text", advanced: true, label: { fr: "Search — sélecteur des dates d’acquisition", en: "Search — acquisition date selector" }, help: { fr: "Valeur Dracénie historique : .date_achat", en: "Historical Dracénie value: .date_achat" } },
                            { key: "pages.search.preferredTargetSelector", type: "text", advanced: true, label: { fr: "Search — cible d’affichage préférée", en: "Search — preferred display target" } },
                            { key: "pages.detail.rowSelector", type: "text", advanced: true, label: { fr: "Detail — sélecteur des lignes d’exemplaires", en: "Detail — item row selector" } },
                            { key: "pages.detail.dateSelector", type: "text", advanced: true, label: { fr: "Detail — sélecteur de la date d’acquisition", en: "Detail — acquisition date selector" } },
                            { key: "pages.detail.preferredTargetSelector", type: "text", advanced: true, label: { fr: "Detail — cible d’affichage préférée", en: "Detail — preferred display target" } },
                            { key: "behavior.observeDynamicChanges", type: "boolean", advanced: true, label: { fr: "Retraiter les contenus ajoutés dynamiquement", en: "Reprocess dynamically added content" } },
                            { key: "behavior.observeDelayMs", type: "number", min: 50, max: 2000, advanced: true, label: { fr: "Délai de retraitement (ms)", en: "Reprocessing delay (ms)" } }
                        ]
                    }
                ],
                focusContext: function (main, context) {
                    if (!main) return;
                    const wanted = context && context.sectionId ? context.sectionId : "general";
                    const section = main.querySelector('[data-pmk-section-id="' + wanted + '"]');
                    if (!section) return;
                    window.setTimeout(function () {
                        try { section.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (_) {}
                    }, 60);
                }
            });
            pmkRegistered = true;
            return true;
        } catch (_) {
            return false;
        }
    }

    if (!registerPmkDefinition()) {
        window.addEventListener("pmk:config-ready", function () {
            registerPmkDefinition();
        }, { once: true });
    }

    function parseDate(value) {
        const raw = String(value == null ? "" : value).trim();
        if (!raw) return null;

        let match = raw.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:\D.*)?$/);
        if (match) {
            return validLocalDate(Number(match[1]), Number(match[2]), Number(match[3]));
        }

        match = raw.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?:\D.*)?$/);
        if (match) {
            return validLocalDate(Number(match[3]), Number(match[2]), Number(match[1]));
        }

        const native = new Date(raw);
        if (Number.isNaN(native.getTime())) return null;
        return new Date(native.getFullYear(), native.getMonth(), native.getDate(), 12, 0, 0, 0);
    }

    function validLocalDate(year, month, day) {
        if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
        const date = new Date(year, month - 1, day, 12, 0, 0, 0);
        if (
            date.getFullYear() !== year ||
            date.getMonth() !== month - 1 ||
            date.getDate() !== day
        ) return null;
        return date;
    }

    function todayNoon() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    }

    function newestValidDate(elements) {
        const today = todayNoon();
        let newest = null;

        Array.from(elements || []).forEach(function (node) {
            const date = parseDate(node && node.textContent);
            if (!date) return;
            if (date.getTime() > today.getTime()) return;
            if (!newest || date.getTime() > newest.getTime()) newest = date;
        });

        return newest;
    }

    function ageInDays(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
        const diff = todayNoon().getTime() - date.getTime();
        if (diff < 0) return null;
        return Math.floor(diff / 86400000);
    }

    function indicatorFor(date) {
        const days = ageInDays(date);
        if (days === null) return null;

        const thresholds = currentConfig.thresholds;
        if (days <= thresholds.recent.days) return thresholds.recent;
        if (days <= thresholds.medium.days) return thresholds.medium;
        if (days <= thresholds.year.days) return thresholds.year;
        return null;
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .pmk079-wrapper {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: .3rem;
                margin: .35rem 0;
                max-width: 100%;
            }
            .pmk079-wrapper.pmk079-search {
                justify-content: flex-start;
            }
            .pmk079-badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: .28rem;
                color: #fff;
                font-weight: 600;
                line-height: 1.25;
                white-space: nowrap;
                border-radius: 999px;
                padding: .23rem .52rem;
                box-shadow: 0 1px 3px rgba(0,0,0,.18);
                vertical-align: middle;
                cursor: default;
                transition: opacity .15s ease, filter .15s ease;
            }
            .pmk079-wrapper:not(.pmk079-compact) .pmk079-badge {
                padding: .32rem .68rem;
            }
            .pmk079-badge:hover,
            .pmk079-badge:focus-visible {
                opacity: .88;
                filter: saturate(.94);
            }
            .pmk079-icon {
                line-height: 1;
                flex: 0 0 auto;
            }
            @media (max-width: 576px) {
                .pmk079-wrapper { margin: .28rem 0; }
                .pmk079-badge { max-width: 100%; }
            }
        `;
        document.head.appendChild(style);
    }

    function clearGenerated() {
        document.querySelectorAll("[" + GENERATED_ATTR + '="1"]').forEach(function (node) {
            try { node.remove(); } catch (_) {}
        });
    }

    function makeBadge(indicator, pageKind) {
        const lang = language();
        const badge = document.createElement("span");
        badge.className = "pmk079-badge";
        badge.style.backgroundColor = indicator.color;
        badge.style.fontSize = currentConfig.appearance.fontSizePx + "px";
        badge.setAttribute("role", "img");

        const tooltip = lang === "en" ? indicator.tooltipEn : indicator.tooltipFr;
        const suffix = pageKind === "detail"
            ? (lang === "en"
                ? " — most recent item acquisition date"
                : " — date d’acquisition de l’exemplaire le plus récent")
            : "";
        badge.title = tooltip + suffix;
        badge.setAttribute("aria-label", badge.title);

        if (currentConfig.appearance.showIcon) {
            const icon = document.createElement("span");
            icon.className = "pmk079-icon";
            icon.setAttribute("aria-hidden", "true");
            icon.textContent = currentConfig.appearance.icon;
            badge.appendChild(icon);
        }

        const label = document.createElement("span");
        label.textContent = lang === "en" ? indicator.labelEn : indicator.labelFr;
        badge.appendChild(label);
        return badge;
    }

    function makeWrapper(indicator, pageKind) {
        const wrapper = document.createElement("div");
        wrapper.className = "pmk079-wrapper pmk079-" + pageKind;
        if (currentConfig.appearance.compact) wrapper.classList.add("pmk079-compact");
        wrapper.setAttribute(GENERATED_ATTR, "1");
        wrapper.appendChild(makeBadge(indicator, pageKind));
        return wrapper;
    }

    function safeQuery(root, selector) {
        if (!root || !selector) return null;
        try { return root.querySelector(selector); } catch (_) { return null; }
    }

    function safeQueryAll(root, selector) {
        if (!root || !selector) return [];
        try { return root.querySelectorAll(selector); } catch (_) { return []; }
    }

    function searchTarget(row) {
        const preferred = safeQuery(row, currentConfig.pages.search.preferredTargetSelector);
        if (preferred) return preferred;

        const title = safeQuery(row, ".bibliotitle, a.title, .title");
        if (title && title.closest("td")) return title.closest("td");

        const cells = safeQueryAll(row, "td");
        if (cells.length > 1) return cells[1];
        if (cells.length === 1) return cells[0];
        return null;
    }

    function processSearch() {
        if (!currentConfig.pages.search.enabled) return;

        const rows = safeQueryAll(document, currentConfig.pages.search.rowSelector);
        Array.from(rows).forEach(function (row) {
            const dates = safeQueryAll(row, currentConfig.pages.search.dateSelector);
            const newest = newestValidDate(dates);
            if (!newest) return;

            const indicator = indicatorFor(newest);
            if (!indicator) return;

            const target = searchTarget(row);
            if (!target) return;

            const wrapper = makeWrapper(indicator, "search");
            target.appendChild(wrapper);
        });
    }

    function detailTarget() {
        const preferred = safeQuery(document, currentConfig.pages.detail.preferredTargetSelector);
        if (preferred && preferred.parentNode) {
            return { node: preferred, mode: "before" };
        }

        const heading = safeQuery(document, "#catalogue_detail_biblio h1, #catalogue_detail_biblio h2");
        if (heading && heading.parentNode) return { node: heading, mode: "after" };

        const section = safeQuery(document, "#catalogue_detail_biblio .page-section, #catalogue_detail_biblio");
        if (section) return { node: section, mode: "prepend" };

        return null;
    }

    function processDetail() {
        if (!currentConfig.pages.detail.enabled) return;

        const rows = safeQueryAll(document, currentConfig.pages.detail.rowSelector);
        const dates = [];
        Array.from(rows).forEach(function (row) {
            Array.from(safeQueryAll(row, currentConfig.pages.detail.dateSelector)).forEach(function (cell) {
                dates.push(cell);
            });
        });

        const newest = newestValidDate(dates);
        if (!newest) return;

        const indicator = indicatorFor(newest);
        if (!indicator) return;

        const target = detailTarget();
        if (!target) return;

        const wrapper = makeWrapper(indicator, "detail");
        if (target.mode === "before") {
            target.node.parentNode.insertBefore(wrapper, target.node);
        } else if (target.mode === "after") {
            target.node.parentNode.insertBefore(wrapper, target.node.nextSibling);
        } else {
            target.node.insertBefore(wrapper, target.node.firstChild);
        }
    }

    function currentPageKind() {
        const path = window.location.pathname || "";
        if (path === SEARCH_PATH) return "search";
        if (path === DETAIL_PATH) return "detail";
        return "";
    }

    function mountContextAccess(pageKind) {
        const api = pmkApi();
        if (!api || typeof api.mountContextButton !== "function") return;

        let anchor = null;
        let pageId = "";
        if (pageKind === "search") {
            anchor = safeQuery(document, "#searchresults h1, #searchresults h2, #searchresults h3, h1, h2");
            pageId = SEARCH_PAGE_ID;
        } else if (pageKind === "detail") {
            anchor = safeQuery(document, "#catalogue_detail_biblio h1, #catalogue_detail_biblio h2, #catalogue_detail_biblio p.first");
            pageId = DETAIL_PAGE_ID;
        }
        if (!anchor) return;

        try {
            api.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "append",
                contextKey: pageId,
                context: {
                    sectionId: "general",
                    pageId: pageId
                }
            });
        } catch (_) {}
    }

    function stopObserver() {
        if (observer) {
            try { observer.disconnect(); } catch (_) {}
            observer = null;
        }
        if (observerTimer) {
            window.clearTimeout(observerTimer);
            observerTimer = null;
        }
    }

    function startObserver() {
        stopObserver();
        if (!currentConfig.behavior.observeDynamicChanges) return;
        if (!document.body || typeof MutationObserver !== "function") return;

        observer = new MutationObserver(function (mutations) {
            const relevant = Array.from(mutations || []).some(function (mutation) {
                if (!mutation) return false;
                const target = mutation.target && mutation.target.nodeType === 1
                    ? mutation.target
                    : mutation.target && mutation.target.parentElement;
                if (target && target.closest && target.closest("[" + GENERATED_ATTR + '=\"1\"]')) return false;
                return mutation.addedNodes && mutation.addedNodes.length > 0;
            });
            if (!relevant) return;

            if (observerTimer) window.clearTimeout(observerTimer);
            observerTimer = window.setTimeout(function () {
                observerTimer = null;
                applyConfig(currentConfig, true);
            }, currentConfig.behavior.observeDelayMs);
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function applyConfig(config, fromObserver) {
        currentConfig = normalizeConfig(config || DEFAULTS);
        const pageKind = currentPageKind();

        if (observer && !fromObserver) stopObserver();
        if (observer && fromObserver) {
            try { observer.disconnect(); } catch (_) {}
        }

        clearGenerated();

        if (currentConfig.enabled && pageKind) {
            injectStyles();
            if (pageKind === "search" && currentConfig.pages.search.enabled) processSearch();
            if (pageKind === "detail" && currentConfig.pages.detail.enabled) processDetail();
            mountContextAccess(pageKind);
        }

        if (pageKind) startObserver();
    }

    function connectPmkConfig() {
        registerPmkDefinition();
        const api = pmkApi();
        if (!api || typeof api.getConfig !== "function") {
            applyConfig(DEFAULTS);
            return false;
        }

        api.getConfig(MODULE_ID)
            .then(function (config) {
                applyConfig(config || DEFAULTS);
            })
            .catch(function () {
                applyConfig(DEFAULTS);
            });

        if (!unsubscribe && typeof api.subscribe === "function") {
            try {
                unsubscribe = api.subscribe(MODULE_ID, function (config) {
                    applyConfig(config || DEFAULTS);
                });
            } catch (_) {}
        }

        return true;
    }

    function start() {
        if (started) return;
        started = true;

        if (!currentPageKind()) return;

        if (!connectPmkConfig()) {
            window.addEventListener("pmk:config-ready", function onReady() {
                window.removeEventListener("pmk:config-ready", onReady);
                connectPmkConfig();
            }, { once: true });
        }

        window.setTimeout(function () { applyConfig(currentConfig); }, 250);
        window.setTimeout(function () { applyConfig(currentConfig); }, 900);
    }

    window.PMK079NewReleaseIndicators = {
        version: MODULE_VERSION,
        moduleId: MODULE_ID,
        defaults: clone(DEFAULTS),
        normalizeConfig: normalizeConfig,
        validateConfig: validateConfig,
        parseDate: parseDate,
        newestValidDate: newestValidDate,
        indicatorFor: indicatorFor,
        applyConfig: applyConfig,
        clearGenerated: clearGenerated
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();

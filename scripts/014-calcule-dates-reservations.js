/*
 Nom du fichier: 014-calcule-dates-reservations.js
 Dépendances: 000-pmk-config-firestore.js recommandé, mais fonctionnement autonome possible
 Date de dernière modification: 2026-09-17
 Auteur: Michael Mundet
 Version PMK préparatoire: 2.0.0
 Description:
 - affiche l'ancienneté de mise en attente des réservations sur waitingreserves.pl ;
 - ne modifie plus les numéros de téléphone (fonction à rattacher au module 043) ;
 - ne tente pas de recalculer l'expiration métier Koha ;
 - configuration centralisée via PMKConfig lorsqu'il est disponible ;
 - traitement idempotent et compatible avec les redraws DataTables.
*/

(function () {
    "use strict";

    if (window.__PMK014ReservationAgeLoaded) return;
    window.__PMK014ReservationAgeLoaded = true;

    const MODULE_ID = "waiting-holds-age";
    const PAGE_ID = "circ.waitingreserves";
    const SCRIPT_VERSION = "2.1.0";

    const DEFAULTS = {
        enabled: true,
        pages: [
            {
                pageId: PAGE_ID,
                enabled: true,
                path: "circ/waitingreserves.pl"
            }
        ],
        displayMode: "days-only",
        warning: {
            enabled: true,
            thresholdDays: 35
        },
        tabs: {
            waiting: true,
            expired: true,
            cancelled: true
        },
        columns: {
            waitingSince: true,
            holdDate: false,
            expirationDate: false
        }
    };

    const TABLES = [
        { id: "holdst", tabKey: "waiting" },
        { id: "holdso", tabKey: "expired" },
        { id: "holdscr", tabKey: "cancelled" }
    ];

    const DATE_COLUMNS = [
        {
            key: "waitingSince",
            aliases: {
                fr: [
                    "En attente depuis le",
                    "En attente depuis",
                    "Date de mise en attente",
                    "Attente depuis"
                ],
                en: [
                    "Waiting since",
                    "Waiting since date"
                ]
            },
            fallbackIndex: 1,
            relation: "past"
        },
        {
            key: "holdDate",
            aliases: {
                fr: [
                    "Date de la réservation",
                    "Date de réservation"
                ],
                en: [
                    "Date hold placed",
                    "Hold date",
                    "Date of hold"
                ]
            },
            fallbackIndex: 2,
            relation: "past"
        },
        {
            key: "expirationDate",
            aliases: {
                fr: [
                    "Date d'expiration",
                    "Expiration"
                ],
                en: [
                    "Expiration date",
                    "Expiry date",
                    "Expiration"
                ]
            },
            fallbackIndex: 3,
            relation: "relative"
        }
    ];

    let currentConfig = clone(DEFAULTS);
    let observer = null;
    let rerenderTimer = null;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function deepMerge(base, override) {
        if (Array.isArray(base)) {
            return Array.isArray(override) ? clone(override) : clone(base);
        }
        if (!base || typeof base !== "object") {
            return override === undefined ? clone(base) : clone(override);
        }

        const out = clone(base);
        if (!override || typeof override !== "object" || Array.isArray(override)) return out;

        Object.keys(override).forEach(function (key) {
            if (
                out[key] &&
                typeof out[key] === "object" &&
                !Array.isArray(out[key]) &&
                override[key] &&
                typeof override[key] === "object" &&
                !Array.isArray(override[key])
            ) {
                out[key] = deepMerge(out[key], override[key]);
            } else {
                out[key] = clone(override[key]);
            }
        });

        return out;
    }

    function getLanguage() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            return window.PMKConfig.getLanguage();
        }
        const htmlLang = (document.documentElement.getAttribute("lang") || "").toLowerCase();
        if (htmlLang.startsWith("fr")) return "fr";
        if (htmlLang.startsWith("en")) return "en";
        return (navigator.language || "").toLowerCase().startsWith("fr") ? "fr" : "en";
    }

    function isTargetPage() {
        return window.location.pathname === "/cgi-bin/koha/circ/waitingreserves.pl";
    }

    function pageEnabled(config) {
        if (!config || config.enabled === false) return false;
        const pages = Array.isArray(config.pages) ? config.pages : [];
        const page = pages.find(function (entry) {
            return entry && entry.pageId === PAGE_ID;
        });
        return !page || page.enabled !== false;
    }

    function buildDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 1,
            name: {
                fr: "Ancienneté des réservations",
                en: "Waiting hold age"
            },
            description: {
                fr: "Affiche depuis combien de jours une réservation est en attente de retrait, sans modifier les règles d'expiration de Koha.",
                en: "Shows how many days a hold has been waiting for pickup without changing Koha expiration rules."
            },
            category: {
                fr: "Circulation / réservations",
                en: "Circulation / holds"
            },
            supportedPages: [PAGE_ID],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULTS),
            validate: function (config) {
                if (!config || typeof config !== "object") {
                    return {
                        ok: false,
                        message: getLanguage() === "en"
                            ? "The module configuration is invalid."
                            : "La configuration du module est invalide."
                    };
                }

                const threshold = Number(config.warning && config.warning.thresholdDays);
                if (!Number.isFinite(threshold) || threshold < 0 || threshold > 3650) {
                    return {
                        ok: false,
                        message: getLanguage() === "en"
                            ? "The warning threshold must be between 0 and 3650 days."
                            : "Le seuil d'alerte doit être compris entre 0 et 3650 jours."
                    };
                }

                if (!["days-only", "since"].includes(config.displayMode)) {
                    return {
                        ok: false,
                        message: getLanguage() === "en"
                            ? "The display mode is invalid."
                            : "Le mode d'affichage est invalide."
                    };
                }

                return { ok: true };
            },
            schema: [
                {
                    type: "section",
                    id: "activation",
                    label: { fr: "Activation", en: "Activation" },
                    fields: [
                        {
                            key: "enabled",
                            type: "boolean",
                            label: {
                                fr: "Activer l'indicateur d'ancienneté",
                                en: "Enable waiting-age indicator"
                            }
                        },
                        {
                            key: "pages",
                            type: "repeater",
                            label: { fr: "Pages configurées", en: "Configured pages" },
                            reorder: false,
                            removable: false,
                            canAdd: function () { return false; },
                            itemTitle: function () {
                                return getLanguage() === "en"
                                    ? "Holds awaiting pickup"
                                    : "Réservations en attente de retrait";
                            },
                            fields: [
                                {
                                    key: "enabled",
                                    type: "boolean",
                                    label: {
                                        fr: "Activer sur cette page",
                                        en: "Enable on this page"
                                    }
                                },
                                {
                                    key: "pageId",
                                    type: "text",
                                    readOnly: true,
                                    advanced: true,
                                    label: {
                                        fr: "Identifiant page",
                                        en: "Page identifier"
                                    }
                                },
                                {
                                    key: "path",
                                    type: "text",
                                    readOnly: true,
                                    label: {
                                        fr: "Chemin Koha",
                                        en: "Koha path"
                                    }
                                }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "display",
                    label: { fr: "Affichage", en: "Display" },
                    description: {
                        fr: "Le complément est ajouté sous les colonnes de date choisies dans la section « Colonnes de date ».",
                        en: "The indicator is added below the date columns selected in the “Date columns” section."
                    },
                    fields: [
                        {
                            key: "displayMode",
                            type: "select",
                            label: {
                                fr: "Texte affiché",
                                en: "Displayed text"
                            },
                            options: [
                                {
                                    value: "days-only",
                                    label: {
                                        fr: "« 12 jours » — comportement historique",
                                        en: "“12 days” — historical behavior"
                                    }
                                },
                                {
                                    value: "since",
                                    label: {
                                        fr: "« depuis 12 jours »",
                                        en: "“12 days ago”"
                                    }
                                }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "warning",
                    label: { fr: "Mise en évidence", en: "Highlighting" },
                    description: {
                        fr: "Ce seuil est uniquement visuel. Il ne remplace jamais la date d'expiration calculée par Koha.",
                        en: "This threshold is visual only. It never replaces the expiration date calculated by Koha."
                    },
                    fields: [
                        {
                            key: "warning.enabled",
                            type: "boolean",
                            label: {
                                fr: "Mettre en évidence les attentes longues",
                                en: "Highlight long waiting periods"
                            }
                        },
                        {
                            key: "warning.thresholdDays",
                            type: "number",
                            label: {
                                fr: "Alerte au-delà de X jours",
                                en: "Warn after X days"
                            }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "columns",
                    label: { fr: "Colonnes de date", en: "Date columns" },
                    description: {
                        fr: "Choisissez les colonnes sur lesquelles afficher un calcul. Le module reconnaît les colonnes fonctionnelles de Koha, sans dépendre de leur position.",
                        en: "Choose the columns on which a calculation is displayed. The module recognizes Koha functional columns without relying on their position."
                    },
                    fields: [
                        {
                            key: "columns.waitingSince",
                            type: "boolean",
                            label: {
                                fr: "En attente depuis le",
                                en: "Waiting since"
                            }
                        },
                        {
                            key: "columns.holdDate",
                            type: "boolean",
                            label: {
                                fr: "Date de la réservation",
                                en: "Date hold placed"
                            }
                        },
                        {
                            key: "columns.expirationDate",
                            type: "boolean",
                            label: {
                                fr: "Date d'expiration",
                                en: "Expiration date"
                            }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "tabs",
                    label: { fr: "Onglets concernés", en: "Affected tabs" },
                    description: {
                        fr: "Les trois onglets restent activés par défaut pour conserver la portée historique du script.",
                        en: "All three tabs are enabled by default to preserve the historical scope of the script."
                    },
                    fields: [
                        {
                            key: "tabs.waiting",
                            type: "boolean",
                            label: {
                                fr: "Réservations en attente",
                                en: "Waiting holds"
                            }
                        },
                        {
                            key: "tabs.expired",
                            type: "boolean",
                            label: {
                                fr: "Réservations ayant dépassé leur expiration",
                                en: "Holds past expiration"
                            }
                        },
                        {
                            key: "tabs.cancelled",
                            type: "boolean",
                            label: {
                                fr: "Demandes d'annulation",
                                en: "Cancellation requests"
                            }
                        }
                    ]
                }
            ],
            focusContext: function (main, context) {
                if (!main || !context || context.pageId !== PAGE_ID) return;
                const wanted = context.sectionId || "display";
                const section =
                    main.querySelector('[data-pmk-section-id="' + wanted + '"]') ||
                    main.querySelector('[data-pmk-section-id="display"]');
                if (!section) return;
                window.setTimeout(function () {
                    section.scrollIntoView({ block: "start", behavior: "smooth" });
                }, 0);
            }
        };
    }

    function registerModule() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return;
        window.PMKConfig.registerModule(buildDefinition());
    }

    function ensureStyles() {
        if (document.getElementById("pmk014-styles")) return;

        const style = document.createElement("style");
        style.id = "pmk014-styles";
        style.textContent = `
            .pmk014-age {
                display: block;
                margin-top: .18rem;
                font-size: .88em;
                line-height: 1.2;
                font-style: italic;
                color: var(--bs-secondary-color, #6c757d);
                white-space: normal;
            }
            .pmk014-age.text-danger {
                color: var(--bs-danger, #dc3545) !important;
                font-weight: 600;
            }
        `;
        document.head.appendChild(style);
    }

    function parseDateParts(value) {
        const raw = String(value || "").trim();
        if (!raw) return null;

        let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/);
        if (match) {
            const year = Number(match[1]);
            const month = Number(match[2]);
            const day = Number(match[3]);
            if (validYmd(year, month, day)) return { year: year, month: month, day: day };
        }

        match = raw.match(/^(\d{4})\/(\d{2})\/(\d{2})(?:\s|$)/);
        if (match) {
            const year = Number(match[1]);
            const month = Number(match[2]);
            const day = Number(match[3]);
            if (validYmd(year, month, day)) return { year: year, month: month, day: day };
        }

        const parsed = new Date(raw);
        if (!Number.isFinite(parsed.getTime())) return null;

        return {
            year: parsed.getFullYear(),
            month: parsed.getMonth() + 1,
            day: parsed.getDate()
        };
    }

    function validYmd(year, month, day) {
        if (!Number.isInteger(year) || year < 1900 || year > 2200) return false;
        if (!Number.isInteger(month) || month < 1 || month > 12) return false;
        if (!Number.isInteger(day) || day < 1 || day > 31) return false;

        const check = new Date(Date.UTC(year, month - 1, day));
        return (
            check.getUTCFullYear() === year &&
            check.getUTCMonth() === month - 1 &&
            check.getUTCDate() === day
        );
    }

    function calendarDaysSince(value) {
        const parts = parseDateParts(value);
        if (!parts) return null;

        const today = new Date();
        const todayUtc = Date.UTC(
            today.getFullYear(),
            today.getMonth(),
            today.getDate()
        );
        const targetUtc = Date.UTC(
            parts.year,
            parts.month - 1,
            parts.day
        );

        const days = Math.floor((todayUtc - targetUtc) / 86400000);
        return Number.isFinite(days) && days >= 0 ? days : null;
    }

    function normalizeText(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function matchesColumnHeader(text, columnDef) {
        const value = normalizeText(text);
        const aliases = []
            .concat((columnDef.aliases && columnDef.aliases.fr) || [])
            .concat((columnDef.aliases && columnDef.aliases.en) || []);

        return aliases.some(function (alias) {
            const normalizedAlias = normalizeText(alias);
            return value === normalizedAlias || value.includes(normalizedAlias);
        });
    }

    function resolveDateColumn(table, columnDef) {
        if (!table || !table.tHead || !table.tHead.rows.length || !columnDef) return null;

        const headers = Array.from(table.tHead.rows[0].cells || []);
        if (!headers.length) return null;

        const byLabel = headers.findIndex(function (header) {
            return matchesColumnHeader(header.textContent, columnDef);
        });
        if (byLabel >= 0) return byLabel;

        /*
         * Fallback structurel strict pour les trois tableaux natifs de
         * waitingreserves.pl. Il n'est utilisé que si les entêtes ne sont
         * pas reconnaissables mais que la structure Koha attendue est bien
         * présente.
         */
        if (!["holdst", "holdso", "holdscr"].includes(table.id)) return null;
        if (!table.classList.contains("holds_table")) return null;
        if (headers.length < 5) return null;

        const firstHeader = headers[0];
        const hasSelectControl = Boolean(
            firstHeader.querySelector('input[type="checkbox"], .select_hold_all')
        );
        if (!hasSelectControl) return null;

        const index = Number(columnDef.fallbackIndex);
        if (!Number.isInteger(index) || index < 0 || index >= headers.length) return null;
        return index;
    }

    function calendarDayDifference(value) {
        const parts = parseDateParts(value);
        if (!parts) return null;

        const today = new Date();
        const todayUtc = Date.UTC(
            today.getFullYear(),
            today.getMonth(),
            today.getDate()
        );
        const targetUtc = Date.UTC(
            parts.year,
            parts.month - 1,
            parts.day
        );

        const diff = Math.round((todayUtc - targetUtc) / 86400000);
        return Number.isFinite(diff) ? diff : null;
    }

    function formatPastAge(days, mode, lang) {
        if (days < 0) return null;
        const singular = days === 1;

        if (lang === "en") {
            if (mode === "since") return singular ? "1 day ago" : days + " days ago";
            return singular ? "1 day" : days + " days";
        }

        if (mode === "since") return singular ? "depuis 1 jour" : "depuis " + days + " jours";
        return singular ? "1 jour" : days + " jours";
    }

    function formatRelativeDate(days, mode, lang) {
        if (days === 0) {
            return lang === "en" ? "today" : "aujourd’hui";
        }

        if (days > 0) {
            const singular = days === 1;
            if (lang === "en") {
                return singular ? "1 day ago" : days + " days ago";
            }
            return singular ? "depuis 1 jour" : "depuis " + days + " jours";
        }

        const future = Math.abs(days);
        const singular = future === 1;
        if (lang === "en") {
            return singular ? "in 1 day" : "in " + future + " days";
        }
        return singular ? "dans 1 jour" : "dans " + future + " jours";
    }

    function formatColumnValue(days, relation, mode, lang) {
        if (relation === "relative") return formatRelativeDate(days, mode, lang);
        return formatPastAge(days, mode, lang);
    }

    function clearTable(table) {
        if (!table) return;
        table.querySelectorAll(".pmk014-age").forEach(function (node) {
            node.remove();
        });
        table.querySelectorAll("[data-pmk014-age]").forEach(function (cell) {
            cell.removeAttribute("data-pmk014-age");
        });
    }

    function clearAll() {
        TABLES.forEach(function (entry) {
            clearTable(document.getElementById(entry.id));
        });
    }

    function annotateTable(table, config, tabKey) {
        if (!table) return;
        clearTable(table);

        if (!config.tabs || config.tabs[tabKey] === false) return;

        const lang = getLanguage();
        const warningEnabled = Boolean(config.warning && config.warning.enabled);
        const threshold = Number(config.warning && config.warning.thresholdDays);
        const mode = config.displayMode === "since" ? "since" : "days-only";
        const selectedColumns = config.columns || {};

        DATE_COLUMNS.forEach(function (columnDef) {
            if (selectedColumns[columnDef.key] !== true) return;

            const columnIndex = resolveDateColumn(table, columnDef);
            if (columnIndex === null) return;

            Array.from(table.tBodies || []).forEach(function (tbody) {
                Array.from(tbody.rows || []).forEach(function (row) {
                    const cell = row.cells && row.cells[columnIndex];
                    if (!cell) return;

                    const rawDate = cell.getAttribute("data-order");
                    const days = calendarDayDifference(rawDate);
                    if (days === null) return;

                    const textValue = formatColumnValue(
                        days,
                        columnDef.relation,
                        mode,
                        lang
                    );
                    if (!textValue) return;

                    const indicator = document.createElement("span");
                    indicator.className = "pmk014-age";
                    indicator.textContent = textValue;

                    /*
                     * Le seuil d'alerte ne colore en rouge que les dates
                     * passées depuis plus de X jours. Une expiration future
                     * n'est donc jamais considérée comme une anomalie.
                     */
                    if (
                        warningEnabled &&
                        Number.isFinite(threshold) &&
                        days > threshold
                    ) {
                        indicator.classList.add("text-danger");
                    }

                    indicator.setAttribute("data-pmk014-version", SCRIPT_VERSION);
                    indicator.setAttribute("data-pmk014-column", columnDef.key);
                    cell.appendChild(indicator);
                    cell.setAttribute("data-pmk014-age", "true");
                });
            });
        });
    }

    function render() {
        if (!isTargetPage()) return;

        ensureStyles();
        clearAll();

        if (!pageEnabled(currentConfig)) return;

        TABLES.forEach(function (entry) {
            annotateTable(
                document.getElementById(entry.id),
                currentConfig,
                entry.tabKey
            );
        });
    }

    function scheduleRender() {
        window.clearTimeout(rerenderTimer);
        rerenderTimer = window.setTimeout(render, 30);
    }

    function bindDataTables() {
        if (!window.jQuery) return;

        const $ = window.jQuery;
        $(".holds_table")
            .off("draw.dt.pmk014")
            .on("draw.dt.pmk014", scheduleRender);
    }

    function bindObserver() {
        if (observer) observer.disconnect();

        const host = document.getElementById("resultlist");
        if (!host || typeof MutationObserver === "undefined") return;

        observer = new MutationObserver(function (mutations) {
            const relevant = mutations.some(function (mutation) {
                return Array.from(mutation.addedNodes || []).some(function (node) {
                    return (
                        node &&
                        node.nodeType === 1 &&
                        (
                            node.matches?.("tbody, tr, td, .holds_table") ||
                            node.querySelector?.("tbody, tr, td, .holds_table")
                        )
                    );
                });
            });

            if (relevant) scheduleRender();
        });

        observer.observe(host, { childList: true, subtree: true });
    }

    function mountContextButton() {
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;

        const heading = document.querySelector("main h1, #main h1, h1");
        if (!heading) return;

        window.PMKConfig.mountContextButton({
            moduleId: MODULE_ID,
            anchor: heading,
            position: "append",
            contextKey: PAGE_ID,
            context: {
                pageId: PAGE_ID,
                sectionId: "display"
            }
        });
    }

    async function loadConfig() {
        registerModule();

        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") {
            currentConfig = clone(DEFAULTS);
            return;
        }

        try {
            const config = await window.PMKConfig.getConfig(MODULE_ID);
            currentConfig = deepMerge(DEFAULTS, config || {});
        } catch (_) {
            currentConfig = clone(DEFAULTS);
        }

        if (typeof window.PMKConfig.subscribe === "function") {
            window.PMKConfig.subscribe(MODULE_ID, function (config) {
                currentConfig = deepMerge(DEFAULTS, config || {});
                scheduleRender();
            });
        }
    }

    async function init() {
        if (!isTargetPage()) return;

        await loadConfig();
        render();
        bindDataTables();
        bindObserver();
        mountContextButton();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();

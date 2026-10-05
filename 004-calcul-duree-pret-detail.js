/* ============================================================
   PimpMyKoha - Pré-plugin
   Fichier : 004-calcul-duree-pret-detail.js
   Version : 2.1.0-isolated

   Module fonctionnel : Échéance de prêt des exemplaires

   Fonction :
   - sur catalogue/detail.pl, affiche un indicateur relatif à l'échéance
     d'un exemplaire actuellement prêté ;
   - utilise les données techniques DataTables/Koha (checkout.due_date)
     plutôt que le texte visible FR/EN ;
   - prend en charge les tableaux holdings et otherholdings ;
   - configuration utilisateur volontairement simplifiée ;
   - affichage français / anglais avec choix Automatique, Français, English ;
   - responsive, idempotent, fail-safe ;
   - configuration partagée via 000-pmk-config-firestore.js ;
   - aucune dépendance directe à Firebase dans la logique métier.

   IMPORTANT :
   - la fonction historique « collection cliquable » est gérée par
     021-code-collection-search-results.js ;
   - les chemins Koha, sélecteurs DOM et identifiants techniques restent
     internes au module et ne sont pas exposés à l'utilisateur.
   ============================================================ */
(function () {
    "use strict";

    if (window.__PMK_004_LOAN_DURATION_DETAIL__) return;
    window.__PMK_004_LOAN_DURATION_DETAIL__ = true;

    const MODULE_ID = "loan-duration-detail";
    const PAGE_ID = "catalogue.detail";
    const PAGE_PATH = "/cgi-bin/koha/catalogue/detail.pl";
    const STYLE_ID = "pmk-loan-duration-detail-style";
    const INDICATOR_CLASS = "pmk-loan-duration-indicator";

    const TABLES = [
        {
            id: "holdings",
            configKey: "showHoldings",
            selector: "#holdings_table",
            controlsSelector: ".holdings_table_table_controls",
            label: {
                fr: "Exemplaires",
                en: "Holdings"
            }
        },
        {
            id: "otherholdings",
            configKey: "showOtherHoldings",
            selector: "#otherholdings_table",
            controlsSelector: ".otherholdings_table_table_controls",
            label: {
                fr: "Autres exemplaires",
                en: "Other holdings"
            }
        }
    ];

    const DEFAULT_CONFIG = {
        enabled: true,
        displayLanguage: "auto",
        showFuture: true,
        showToday: true,
        showOverdue: true,
        showHoldings: true,
        showOtherHoldings: true
    };

    let currentConfig = null;
    let coreRegistered = false;
    let fallbackStarted = false;
    let dataTableHooksInstalled = false;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function detectLanguage() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            return window.PMKConfig.getLanguage();
        }
        const lang = (document.documentElement.getAttribute("lang") || navigator.language || "").toLowerCase();
        return lang.startsWith("fr") ? "fr" : "en";
    }

    function text(value, lang) {
        const currentLang = lang || detectLanguage();
        if (typeof value === "string") return value;
        if (!value || typeof value !== "object") return "";
        return value[currentLang] || value.fr || value.en || "";
    }

    function getDisplayLanguage(config) {
        if (config && (config.displayLanguage === "fr" || config.displayLanguage === "en")) {
            return config.displayLanguage;
        }
        return detectLanguage();
    }

    function isTargetPage() {
        return window.location.pathname === PAGE_PATH;
    }

    function getDataTableApi(table) {
        if (!table || !window.jQuery || !window.jQuery.fn || !window.jQuery.fn.dataTable) return null;
        if (typeof window.jQuery.fn.dataTable.isDataTable !== "function") return null;
        if (!window.jQuery.fn.dataTable.isDataTable(table)) return null;
        try {
            return window.jQuery(table).DataTable();
        } catch (_) {
            return null;
        }
    }

    function resolveColumnIndex(api, table, colname) {
        if (!api || !table || !colname) return null;

        const header = table.querySelector('thead tr:first-child th[data-colname="' + colname + '"]');
        if (!header) return null;

        try {
            const index = api.column(header).index();
            return Number.isInteger(index) ? index : null;
        } catch (_) {
            const headers = Array.from(table.querySelectorAll("thead tr:first-child th"));
            const index = headers.indexOf(header);
            return index >= 0 ? index : null;
        }
    }

    function parseCalendarDate(value) {
        if (!value) return null;
        const match = String(value).match(/(\d{4})-(\d{2})-(\d{2})/);
        if (!match) return null;

        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;

        const stamp = Date.UTC(year, month - 1, day);
        const check = new Date(stamp);
        if (
            check.getUTCFullYear() !== year ||
            check.getUTCMonth() !== month - 1 ||
            check.getUTCDate() !== day
        ) return null;

        return stamp;
    }

    function calendarDayDifference(dueValue) {
        const dueStamp = parseCalendarDate(dueValue);
        if (dueStamp === null) return null;

        const now = new Date();
        const todayStamp = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
        return Math.round((dueStamp - todayStamp) / 86400000);
    }

    function indicatorText(diffDays, config) {
        const lang = getDisplayLanguage(config);

        if (diffDays === 0) {
            return lang === "fr" ? "Retour aujourd’hui" : "Due today";
        }

        if (diffDays > 0) {
            if (lang === "fr") {
                return diffDays === 1 ? "1 jour restant" : diffDays + " jours restants";
            }
            return diffDays === 1 ? "1 day remaining" : diffDays + " days remaining";
        }

        const late = Math.abs(diffDays);
        if (lang === "fr") {
            return late === 1 ? "1 jour de retard" : late + " jours de retard";
        }
        return late === 1 ? "1 day overdue" : late + " days overdue";
    }

    function shouldDisplay(config, diffDays) {
        if (diffDays === 0) return config.showToday !== false;
        if (diffDays > 0) return config.showFuture !== false;
        return config.showOverdue !== false;
    }

    function isTableEnabled(config, tableDef) {
        if (!config || !tableDef || !tableDef.configKey) return false;
        return config[tableDef.configKey] !== false;
    }

    function removeIndicators(table) {
        if (!table) return;
        table.querySelectorAll("." + INDICATOR_CLASS).forEach(function (element) {
            element.remove();
        });
    }

    function createIndicator(diffDays, config) {
        const span = document.createElement("span");
        span.className = INDICATOR_CLASS + " d-block small";
        span.setAttribute("data-pmk-module", MODULE_ID);
        span.textContent = indicatorText(diffDays, config);

        if (diffDays < 0) span.classList.add("text-danger", "fw-semibold");
        else if (diffDays === 0) span.classList.add("text-warning", "fw-semibold");
        else span.classList.add("text-success");

        return span;
    }

    function applyTable(config, tableDef) {
        if (!tableDef) return;

        const table = document.querySelector(tableDef.selector);
        if (!table) return;

        removeIndicators(table);

        if (!config || config.enabled === false) return;
        if (!isTableEnabled(config, tableDef)) return;

        const api = getDataTableApi(table);
        if (!api) return;

        const statusColumnIndex = resolveColumnIndex(api, table, "status");
        if (statusColumnIndex === null) return;

        try {
            api.rows({ page: "current" }).every(function () {
                const rowData = this.data();
                const rowNode = this.node();
                if (!rowData || !rowNode) return;

                const statuses = Array.isArray(rowData._status) ? rowData._status : [];
                const isLoaned = statuses.includes("checked_out") || statuses.includes("local_use");
                if (!isLoaned || !rowData.checkout || !rowData.checkout.due_date) return;

                const diffDays = calendarDayDifference(rowData.checkout.due_date);
                if (diffDays === null || !shouldDisplay(config, diffDays)) return;

                let statusCell = null;
                try {
                    statusCell = api.cell(this.index(), statusColumnIndex).node();
                } catch (_) {
                    statusCell = rowNode.querySelector("td.status");
                }
                if (!statusCell) return;

                statusCell.appendChild(createIndicator(diffDays, config));
            });
        } catch (_) {
            /* Fail-safe : aucune modification si la structure Koha ne correspond plus. */
        }
    }

    function applyConfig(config) {
        if (!isTargetPage()) return;
        TABLES.forEach(function (tableDef) {
            applyTable(config, tableDef);
        });
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .${INDICATOR_CLASS} {
                margin-top: .15rem;
                line-height: 1.25;
                white-space: normal;
                overflow-wrap: anywhere;
            }
            @media (max-width: 576px) {
                .${INDICATOR_CLASS} {
                    margin-top: .2rem;
                    font-size: .82em;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function waitForTargetTable(timeoutMs) {
        return new Promise(function (resolve) {
            const find = function () {
                return TABLES.map(function (table) {
                    return document.querySelector(table.selector);
                }).find(Boolean) || null;
            };

            const existing = find();
            if (existing) {
                resolve(existing);
                return;
            }

            const root = document.body || document.documentElement;
            if (!root) {
                resolve(null);
                return;
            }

            let finished = false;
            const observer = new MutationObserver(function () {
                const table = find();
                if (!table || finished) return;
                finished = true;
                observer.disconnect();
                resolve(table);
            });

            observer.observe(root, { childList: true, subtree: true });

            window.setTimeout(function () {
                if (finished) return;
                finished = true;
                observer.disconnect();
                resolve(find());
            }, timeoutMs || 4000);
        });
    }

    function installDataTableHooks() {
        if (dataTableHooksInstalled || !window.jQuery) return;
        dataTableHooksInstalled = true;

        const selector = TABLES.map(function (table) { return table.selector; }).join(", ");

        window.jQuery(document)
            .off(
                "draw.dt.pmkLoanDuration004 init.dt.pmkLoanDuration004 column-visibility.dt.pmkLoanDuration004",
                selector
            )
            .on(
                "draw.dt.pmkLoanDuration004 init.dt.pmkLoanDuration004 column-visibility.dt.pmkLoanDuration004",
                selector,
                function () {
                    if (!currentConfig) return;
                    const tableElement = this;
                    const tableDef = TABLES.find(function (candidate) {
                        return tableElement.matches(candidate.selector);
                    });
                    window.setTimeout(function () {
                        applyTable(currentConfig, tableDef);
                    }, 0);
                }
            );
    }

    function mountContextAccess() {
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;

        const tableDef = TABLES.find(function (candidate) {
            return document.querySelector(candidate.selector);
        }) || TABLES[0];

        const anchor = document.querySelector(tableDef.controlsSelector) ||
            document.querySelector(tableDef.selector) ||
            document.querySelector("#holdings_panel");

        if (!anchor) return;

        window.PMKConfig.mountContextButton({
            moduleId: MODULE_ID,
            anchor: anchor,
            position: anchor.matches("table") ? "before" : "after",
            contextKey: PAGE_ID,
            context: {
                pageId: PAGE_ID,
                sectionId: "locations"
            }
        });
    }

    function validateConfig(config) {
        const lang = detectLanguage();

        if (!config || typeof config !== "object") {
            return {
                ok: false,
                message: lang === "fr" ? "Configuration invalide." : "Invalid configuration."
            };
        }

        if (!["auto", "fr", "en"].includes(config.displayLanguage || "auto")) {
            return {
                ok: false,
                message: lang === "fr"
                    ? "La langue d’affichage sélectionnée n’est pas valide."
                    : "The selected display language is invalid."
            };
        }

        return { ok: true };
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 2,
            name: {
                fr: "Échéance de prêt des exemplaires",
                en: "Item loan due dates"
            },
            description: {
                fr: "Ajoute, dans les tableaux d’exemplaires de la fiche notice, une indication simple : jours restants, retour aujourd’hui ou jours de retard.",
                en: "Adds a simple due-date indicator to item tables on the record detail page: days remaining, due today, or days overdue."
            },
            category: {
                fr: "Circulation / catalogue",
                en: "Circulation / catalog"
            },
            supportedPages: [PAGE_ID],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            validate: validateConfig,
            schema: [
                {
                    type: "section",
                    id: "display",
                    label: {
                        fr: "Ce que le module doit afficher",
                        en: "What the module should display"
                    },
                    description: {
                        fr: "Choisis simplement les informations utiles aux agents. Les réglages techniques sont gérés automatiquement.",
                        en: "Choose only the information staff need. Technical settings are handled automatically."
                    },
                    fields: [
                        {
                            key: "displayLanguage",
                            type: "select",
                            label: {
                                fr: "Langue des messages",
                                en: "Message language"
                            },
                            help: {
                                fr: "Automatique suit la langue de l’interface Koha. Tu peux aussi forcer le français ou l’anglais.",
                                en: "Automatic follows the Koha interface language. You can also force French or English."
                            },
                            options: [
                                {
                                    value: "auto",
                                    label: {
                                        fr: "Automatique — langue de Koha",
                                        en: "Automatic — Koha language"
                                    }
                                },
                                {
                                    value: "fr",
                                    label: {
                                        fr: "Français",
                                        en: "French"
                                    }
                                },
                                {
                                    value: "en",
                                    label: {
                                        fr: "Anglais",
                                        en: "English"
                                    }
                                }
                            ]
                        },
                        {
                            key: "showFuture",
                            type: "boolean",
                            label: {
                                fr: "Afficher les jours restants",
                                en: "Show days remaining"
                            },
                            help: {
                                fr: "Exemple : « 5 jours restants ».",
                                en: "Example: “5 days remaining”."
                            }
                        },
                        {
                            key: "showToday",
                            type: "boolean",
                            label: {
                                fr: "Signaler les retours prévus aujourd’hui",
                                en: "Highlight items due today"
                            },
                            help: {
                                fr: "Affiche « Retour aujourd’hui ».",
                                en: "Displays “Due today”."
                            }
                        },
                        {
                            key: "showOverdue",
                            type: "boolean",
                            label: {
                                fr: "Afficher les jours de retard",
                                en: "Show days overdue"
                            },
                            help: {
                                fr: "Exemple : « 3 jours de retard ».",
                                en: "Example: “3 days overdue”."
                            }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "locations",
                    label: {
                        fr: "Où afficher l’indicateur",
                        en: "Where to show the indicator"
                    },
                    description: {
                        fr: "Le module agit uniquement sur la page Détail d’une notice. Choisis les tableaux concernés.",
                        en: "The module only runs on the record detail page. Choose which item tables should display the indicator."
                    },
                    fields: [
                        {
                            key: "showHoldings",
                            type: "boolean",
                            label: {
                                fr: "Tableau Exemplaires",
                                en: "Holdings table"
                            },
                            help: {
                                fr: "Tableau principal des exemplaires de la notice.",
                                en: "Main holdings table for the record."
                            }
                        },
                        {
                            key: "showOtherHoldings",
                            type: "boolean",
                            label: {
                                fr: "Tableau Autres exemplaires",
                                en: "Other holdings table"
                            },
                            help: {
                                fr: "Utilisé lorsque Koha sépare certains exemplaires dans un second tableau.",
                                en: "Used when Koha separates some items into a second holdings table."
                            }
                        }
                    ]
                }
            ],
            focusContext: function (main, context) {
                if (!main || !context || context.pageId !== PAGE_ID) return;
                const section = main.querySelector('[data-pmk-section-id="locations"]');
                if (section) {
                    window.setTimeout(function () {
                        section.scrollIntoView({ block: "start", behavior: "smooth" });
                    }, 0);
                }
            }
        };
    }

    async function startWithCore() {
        if (!window.PMKConfig) return;

        if (!coreRegistered) {
            window.PMKConfig.registerModule(moduleDefinition());
            coreRegistered = true;
        }

        if (!isTargetPage()) return;

        const table = await waitForTargetTable(4000);
        if (!table) return;

        injectStyles();
        installDataTableHooks();
        currentConfig = await window.PMKConfig.getConfig(MODULE_ID);
        applyConfig(currentConfig);
        mountContextAccess();

        window.PMKConfig.subscribe(MODULE_ID, function (newConfig) {
            currentConfig = clone(newConfig);
            applyConfig(currentConfig);
            mountContextAccess();
        });
    }

    async function startWithoutCore() {
        if (fallbackStarted || !isTargetPage()) return;
        fallbackStarted = true;

        const table = await waitForTargetTable(4000);
        if (!table) return;

        injectStyles();
        installDataTableHooks();
        currentConfig = clone(DEFAULT_CONFIG);
        applyConfig(currentConfig);
    }

    function onDomReady(callback) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback, { once: true });
        } else {
            callback();
        }
    }

    onDomReady(function () {
        if (window.PMKConfig) {
            startWithCore();
        } else {
            startWithoutCore();
            window.addEventListener("pmk:config-ready", function () {
                startWithCore();
            }, { once: true });
        }
    });
})();

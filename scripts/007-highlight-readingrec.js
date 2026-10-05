/* ============================================================
   007-highlight-readingrec.js
   Module fonctionnel : Indicateurs de l'historique de prêt
   Identifiant        : history-row-highlights
   Phase              : script isolé préparatoire à PimpMyKoha
   Version            : 2.4.0
   Date               : 2026-09-17

   Fonction :
   - enrichit les historiques de circulation d'un lecteur et d'une notice sans modifier les données ;
   - calcule les durées à partir des dates techniques Koha ;
   - indique la durée d'un prêt rendu, la durée d'un prêt en cours et son retard ;
   - conserve la mise en couleur historique du script 007 d'origine :
     vert clair pour un prêt normal, rouge clair pour un prêt en retard ;
   - conserve l'icône livre sur les prêts encore en cours ;
   - peut également signaler un retour tardif ou une incohérence chronologique ;
   - fournit des libellés français et anglais entièrement modifiables ;
   - permet de personnaliser visuellement les couleurs de fond et de l'icône ;
   - conserve une détection de colonnes en français et en anglais ;
   - possède des adaptateurs Koha distincts pour readingrec.pl et issuehistory.pl ;
   - utilise les fallbacks historiques 8/11/12 sur readingrec.pl et 5/6/7 sur issuehistory.pl ;
   - conserve la compatibilité avec les anciennes configurations Firestore du 007 ;
   - réagit proprement aux redraws DataTables ;
   - fonctionne en français et en anglais ;
   - n'impose aucun tri et n'ajoute aucune colonne ;
   - s'enregistre dans l'administration PMK sur toutes les pages Koha ;
   - utilise la configuration commune window.PMKConfig lorsqu'elle est disponible ;
   - fonctionne avec ses valeurs par défaut si le socle n'est pas chargé.

   Fail-safe :
   - hors pages readingrec.pl et issuehistory.pl : retour immédiat ;
   - table ou colonnes non identifiées avec une confiance suffisante : aucune modification ;
   - date invalide : aucune règle dépendante de cette date n'est appliquée.
   ============================================================ */

(function () {
    "use strict";

    const GLOBAL_GUARD = "__PMK_007_HISTORY_ROW_HIGHLIGHTS__";
    const MODULE_ID = "history-row-highlights";
    const MODULE_VERSION = "2.4.0";
    const STYLE_ID = "pmk-007-history-row-highlights-style";

    const PAGES = {
        "members.readingrec": {
            id: "members.readingrec",
            path: "/cgi-bin/koha/members/readingrec.pl",
            tableId: "table_readingrec",
            labelFr: "Historique d'un lecteur",
            labelEn: "Patron circulation history",
            fallback: { checkout: 8, due: 11, returned: 12 },
            headingSelectors: ["body#pat_readingrec h1", "main h1", "h1"]
        },
        "catalogue.issuehistory": {
            id: "catalogue.issuehistory",
            path: "/cgi-bin/koha/catalogue/issuehistory.pl",
            tableId: "table_issues",
            labelFr: "Historique des prêts d'une notice",
            labelEn: "Bibliographic record loan history",
            fallback: { checkout: 5, due: 6, returned: 7 },
            headingSelectors: ["body#catalog_issuehistory h1", "main h1", "h1"]
        }
    };
    const CONTAINER_CLASS = "pmk-history-indicators";
    const INDICATOR_CLASS = "pmk-history-indicator";
    const CURRENT_ICON_CLASS = "pmk-history-current-icon";
    const BG_OK_CLASS = "pmk-history-bg-ok";
    const BG_DANGER_CLASS = "pmk-history-bg-danger";

    if (window[GLOBAL_GUARD]) return;

    window[GLOBAL_GUARD] = {
        id: MODULE_ID,
        version: MODULE_VERSION,
        initialized: false,
        table: null,
        unsubscribe: null
    };

    const RULES = {
        "loan-duration-returned": {
            tone: "neutral",
            labelFr: "Durée du prêt : {days}",
            labelEn: "Loan duration: {days}"
        },
        "loan-duration-current": {
            tone: "neutral",
            labelFr: "Durée du prêt : {days}",
            labelEn: "Loan duration: {days}"
        },
        "overdue-current": {
            tone: "danger",
            labelFr: "Retard : {days}",
            labelEn: "Overdue: {days}"
        },
        "returned-late": {
            tone: "warning",
            labelFr: "Retour après échéance : {days}",
            labelEn: "Returned after due date: {days}"
        },
        "return-before-checkout": {
            tone: "danger",
            labelFr: "Incohérence : retour antérieur à l'emprunt",
            labelEn: "Inconsistency: return date precedes checkout"
        }
    };

    const DEFAULT_CONFIG = {
        enabled: true,

        /*
         * Réglages métier exposés dans l'administration PMK.
         * La structure pages/indicators reste interne pour préserver la
         * compatibilité avec les versions préparatoires précédentes.
         */
        language: "auto",
        highlightBackground: true,
        normalBackgroundColor: "#d4f8d4",
        overdueBackgroundColor: "#f8d4d4",
        currentLoanIconColor: "#4caf50",

        enableReadingrec: true,
        enableIssuehistory: true,

        returnedDurationLabelFr: RULES["loan-duration-returned"].labelFr,
        returnedDurationLabelEn: RULES["loan-duration-returned"].labelEn,
        currentDurationLabelFr: RULES["loan-duration-current"].labelFr,
        currentDurationLabelEn: RULES["loan-duration-current"].labelEn,
        currentOverdueLabelFr: RULES["overdue-current"].labelFr,
        currentOverdueLabelEn: RULES["overdue-current"].labelEn,
        returnedLateLabelFr: RULES["returned-late"].labelFr,
        returnedLateLabelEn: RULES["returned-late"].labelEn,
        chronologyWarningLabelFr: RULES["return-before-checkout"].labelFr,
        chronologyWarningLabelEn: RULES["return-before-checkout"].labelEn,

        showReturnedDuration: true,
        showCurrentDuration: true,
        showCurrentOverdue: true,
        showReturnedLate: true,
        showChronologyWarning: true,

        pages: [
            {
                id: "members.readingrec",
                enabled: true,
                path: "/cgi-bin/koha/members/readingrec.pl",
                labelFr: "Historique d'un lecteur",
                labelEn: "Patron circulation history",
                indicators: [
                    { id: "loan-duration-returned", enabled: true, labelFr: RULES["loan-duration-returned"].labelFr, labelEn: RULES["loan-duration-returned"].labelEn },
                    { id: "loan-duration-current", enabled: true, labelFr: RULES["loan-duration-current"].labelFr, labelEn: RULES["loan-duration-current"].labelEn },
                    { id: "overdue-current", enabled: true, labelFr: RULES["overdue-current"].labelFr, labelEn: RULES["overdue-current"].labelEn },
                    { id: "returned-late", enabled: true, labelFr: RULES["returned-late"].labelFr, labelEn: RULES["returned-late"].labelEn },
                    { id: "return-before-checkout", enabled: true, labelFr: RULES["return-before-checkout"].labelFr, labelEn: RULES["return-before-checkout"].labelEn }
                ]
            },
            {
                id: "catalogue.issuehistory",
                enabled: true,
                path: "/cgi-bin/koha/catalogue/issuehistory.pl",
                labelFr: "Historique des prêts d'une notice",
                labelEn: "Bibliographic record loan history",
                indicators: [
                    { id: "loan-duration-returned", enabled: true, labelFr: RULES["loan-duration-returned"].labelFr, labelEn: RULES["loan-duration-returned"].labelEn },
                    { id: "loan-duration-current", enabled: true, labelFr: RULES["loan-duration-current"].labelFr, labelEn: RULES["loan-duration-current"].labelEn },
                    { id: "overdue-current", enabled: true, labelFr: RULES["overdue-current"].labelFr, labelEn: RULES["overdue-current"].labelEn },
                    { id: "returned-late", enabled: true, labelFr: RULES["returned-late"].labelFr, labelEn: RULES["returned-late"].labelEn },
                    { id: "return-before-checkout", enabled: true, labelFr: RULES["return-before-checkout"].labelFr, labelEn: RULES["return-before-checkout"].labelEn }
                ]
            }
        ]
    };

    let currentConfig = clone(DEFAULT_CONFIG);
    let currentPageConfig = null;
    let currentPage = null;
    let coreRegistered = false;
    let coreStarted = false;
    let fallbackStarted = false;
    let tableState = null;
    let unsubscribeConfig = null;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function detectLanguage() {
        const configured =
            currentConfig &&
            typeof currentConfig.language === "string"
                ? currentConfig.language.toLowerCase()
                : "auto";

        if (configured === "fr" || configured === "en") {
            return configured;
        }

        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            const coreLanguage = String(window.PMKConfig.getLanguage() || "").toLowerCase();
            if (coreLanguage.startsWith("fr")) return "fr";
            if (coreLanguage.startsWith("en")) return "en";
        }

        const lang = (
            document.documentElement.getAttribute("lang") ||
            navigator.language ||
            ""
        ).toLowerCase();

        return lang.startsWith("fr") ? "fr" : "en";
    }

    function normalizeText(value) {
        return String(value === undefined || value === null ? "" : value)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\u00a0/g, " ")
            .replace(/[^a-zA-Z0-9]+/g, " ")
            .trim()
            .toLowerCase();
    }

    function detectCurrentPage() {
        const path = window.location.pathname;
        return Object.values(PAGES).find(function (page) {
            return page.path === path;
        }) || null;
    }

    function isTargetPage() {
        return !!detectCurrentPage();
    }

    function getPageConfig(config) {
        if (!config || config.enabled === false || !Array.isArray(config.pages)) return null;
        const page = currentPage || detectCurrentPage();
        if (!page) return null;

        const pageConfig = config.pages.find(function (item) {
            return item && item.id === page.id;
        });
        if (!pageConfig || pageConfig.enabled === false) return null;
        return pageConfig;
    }

    function normalizeConfig(config) {
        const incoming = config && typeof config === "object" ? config : {};
        const result = clone(DEFAULT_CONFIG);

        if (incoming.enabled === false) result.enabled = false;

        if (["auto", "fr", "en"].includes(String(incoming.language || "").toLowerCase())) {
            result.language = String(incoming.language).toLowerCase();
        }

        result.highlightBackground = incoming.highlightBackground !== false;

        const normalizeHexColor = function (value, fallback) {
            const candidate = String(value || "").trim().toLowerCase();
            return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback;
        };

        result.normalBackgroundColor = normalizeHexColor(
            incoming.normalBackgroundColor,
            DEFAULT_CONFIG.normalBackgroundColor
        );
        result.overdueBackgroundColor = normalizeHexColor(
            incoming.overdueBackgroundColor,
            DEFAULT_CONFIG.overdueBackgroundColor
        );
        result.currentLoanIconColor = normalizeHexColor(
            incoming.currentLoanIconColor,
            DEFAULT_CONFIG.currentLoanIconColor
        );

        result.enableReadingrec = incoming.enableReadingrec !== false;
        result.enableIssuehistory = incoming.enableIssuehistory !== false;

        const incomingPages = Array.isArray(incoming.pages) ? incoming.pages : [];

        result.pages.forEach(function (page) {
            const sourcePage = incomingPages.find(function (candidate) {
                return candidate && candidate.id === page.id;
            });

            // Les nouveaux switches explicites sont la source de vérité.
            page.enabled = page.id === "members.readingrec"
                ? result.enableReadingrec
                : result.enableIssuehistory;

            if (sourcePage) {
                if (typeof sourcePage.labelFr === "string" && sourcePage.labelFr.trim()) {
                    page.labelFr = sourcePage.labelFr.trim();
                }
                if (typeof sourcePage.labelEn === "string" && sourcePage.labelEn.trim()) {
                    page.labelEn = sourcePage.labelEn.trim();
                }

                if (Array.isArray(sourcePage.indicators)) {
                    const savedById = new Map();
                    sourcePage.indicators.forEach(function (rule) {
                        if (rule && RULES[rule.id]) savedById.set(rule.id, rule);
                    });

                    page.indicators = page.indicators.map(function (defaultRule) {
                        const saved = savedById.get(defaultRule.id);
                        if (!saved) return defaultRule;
                        const base = RULES[defaultRule.id];
                        return {
                            id: defaultRule.id,
                            enabled: saved.enabled !== false,
                            labelFr: typeof saved.labelFr === "string" && saved.labelFr.trim()
                                ? saved.labelFr.trim()
                                : base.labelFr,
                            labelEn: typeof saved.labelEn === "string" && saved.labelEn.trim()
                                ? saved.labelEn.trim()
                                : base.labelEn
                        };
                    });
                }
            }
        });

        const directSettings = [
            ["showReturnedDuration", "loan-duration-returned"],
            ["showCurrentDuration", "loan-duration-current"],
            ["showCurrentOverdue", "overdue-current"],
            ["showReturnedLate", "returned-late"],
            ["showChronologyWarning", "return-before-checkout"]
        ];

        directSettings.forEach(function (entry) {
            const settingKey = entry[0];
            const ruleId = entry[1];

            let enabled = DEFAULT_CONFIG[settingKey] !== false;
            if (Object.prototype.hasOwnProperty.call(incoming, settingKey)) {
                enabled = incoming[settingKey] !== false;
            }
            result[settingKey] = enabled;

            result.pages.forEach(function (page) {
                const rule = page.indicators.find(function (candidate) {
                    return candidate.id === ruleId;
                });
                if (rule) rule.enabled = enabled;
            });
        });

        const labelSettings = [
            ["returnedDurationLabelFr", "loan-duration-returned", "labelFr"],
            ["returnedDurationLabelEn", "loan-duration-returned", "labelEn"],
            ["currentDurationLabelFr", "loan-duration-current", "labelFr"],
            ["currentDurationLabelEn", "loan-duration-current", "labelEn"],
            ["currentOverdueLabelFr", "overdue-current", "labelFr"],
            ["currentOverdueLabelEn", "overdue-current", "labelEn"],
            ["returnedLateLabelFr", "returned-late", "labelFr"],
            ["returnedLateLabelEn", "returned-late", "labelEn"],
            ["chronologyWarningLabelFr", "return-before-checkout", "labelFr"],
            ["chronologyWarningLabelEn", "return-before-checkout", "labelEn"]
        ];

        labelSettings.forEach(function (entry) {
            const settingKey = entry[0];
            const ruleId = entry[1];
            const property = entry[2];
            const incomingValue = Object.prototype.hasOwnProperty.call(incoming, settingKey)
                ? String(incoming[settingKey] || "").trim()
                : "";

            const value = incomingValue || RULES[ruleId][property];
            result[settingKey] = value;

            result.pages.forEach(function (page) {
                const rule = page.indicators.find(function (candidate) {
                    return candidate.id === ruleId;
                });
                if (rule) rule[property] = value;
            });
        });

        return result;
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .pmk-history-table .${CONTAINER_CLASS} {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: .25rem .35rem;
                margin-top: .25rem;
                max-width: 100%;
            }
            .pmk-history-table .${INDICATOR_CLASS} {
                max-width: 100%;
                white-space: normal;
                overflow-wrap: anywhere;
                line-height: 1.25;
            }
            .pmk-history-table .${INDICATOR_CLASS}.pmk-history-neutral {
                display: block;
                color: var(--bs-secondary-color, #6c757d);
                font-size: .88em;
            }
            .pmk-history-table .${INDICATOR_CLASS}.badge {
                font-size: .78em;
                font-weight: 600;
            }
            .pmk-history-table td.${BG_OK_CLASS} {
                background-color: var(--pmk-history-normal-bg, #d4f8d4) !important;
                transition: background-color .3s ease;
            }
            .pmk-history-table td.${BG_DANGER_CLASS} {
                background-color: var(--pmk-history-overdue-bg, #f8d4d4) !important;
                transition: background-color .3s ease;
            }
            .pmk-history-table .${CURRENT_ICON_CLASS} {
                margin-left: .5em;
                color: var(--pmk-history-current-icon, #4caf50) !important;
            }
            @media (max-width: 768px) {
                .pmk-history-table .${CONTAINER_CLASS} {
                    align-items: flex-start;
                    flex-direction: column;
                    gap: .2rem;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function parseTechnicalDate(value) {
        const text = String(value || "").trim();
        if (!text || normalizeText(text) === "checked out") return null;

        let match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
        if (match) {
            const date = new Date(
                Number(match[1]),
                Number(match[2]) - 1,
                Number(match[3]),
                Number(match[4] || 0),
                Number(match[5] || 0),
                Number(match[6] || 0)
            );
            return Number.isNaN(date.getTime()) ? null : date;
        }

        const parsed = new Date(text);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function parseVisibleDate(value) {
        const text = String(value || "").replace(/\u00a0/g, " ").trim();
        if (!text) return null;

        const lang = detectLanguage();
        const numeric = text.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (!numeric) return null;

        const a = Number(numeric[1]);
        const b = Number(numeric[2]);
        const year = Number(numeric[3]);

        /*
         * Si une composante dépasse 12, le sens est non ambigu.
         * Sinon on suit la langue d'interface (FR = JJ/MM, EN = MM/JJ).
         */
        let day;
        let month;
        if (a > 12 && b <= 12) {
            day = a;
            month = b;
        } else if (b > 12 && a <= 12) {
            day = b;
            month = a;
        } else {
            day = lang === "fr" ? a : b;
            month = lang === "fr" ? b : a;
        }

        const date = new Date(
            year,
            month - 1,
            day,
            Number(numeric[4] || 0),
            Number(numeric[5] || 0),
            Number(numeric[6] || 0)
        );
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function parseCellDate(cell) {
        if (!cell) return null;
        const order = cell.getAttribute("data-order");
        return parseTechnicalDate(order) || parseVisibleDate(cell.textContent || "");
    }

    function toUtcDay(date) {
        return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    }

    function daysBetween(startDate, endDate) {
        if (!(startDate instanceof Date) || !(endDate instanceof Date)) return null;
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
        return Math.floor((toUtcDay(endDate) - toUtcDay(startDate)) / 86400000);
    }

    function headerLabel(th) {
        if (!th) return "";
        const cloneNode = th.cloneNode(true);
        cloneNode.querySelectorAll(".dt-column-order, .DataTables_sort_icon, .sorting_1").forEach(function (node) {
            node.remove();
        });
        return normalizeText(cloneNode.textContent || th.getAttribute("aria-label") || "");
    }

    const COLUMN_ALIASES = {
        checkout: [
            "prete le",
            "date de pret",
            "date d emprunt",
            "emprunte le",
            "emprunt",
            "checked out on",
            "checked out",
            "checkout on",
            "checkout date",
            "loan date"
        ],
        due: [
            "retour prevu",
            "date de retour prevue",
            "date d echeance",
            "echeance",
            "date due",
            "due date"
        ],
        returned: [
            "rendu le",
            "date de retour effective",
            "retour effectif",
            "return date",
            "returned on",
            "checked in on",
            "checkin on",
            "check in on",
            "checkin date",
            "check in date"
        ]
    };

    function matchesAlias(label, aliases) {
        return aliases.some(function (alias) {
            return label === alias || label.includes(alias);
        });
    }

    function resolveColumns(table) {
        const headers = Array.from(table.querySelectorAll("thead th"));
        if (!headers.length) return null;

        const labels = headers.map(headerLabel);

        const findAll = function (kind) {
            const indexes = [];
            labels.forEach(function (label, index) {
                if (matchesAlias(label, COLUMN_ALIASES[kind])) indexes.push(index);
            });
            return indexes;
        };

        const chooseUnique = function (kind) {
            const indexes = findAll(kind);
            return indexes.length === 1 ? indexes[0] : -1;
        };

        let checkout = chooseUnique("checkout");
        let due = chooseUnique("due");
        let returned = chooseUnique("returned");

        const fallback = currentPage && currentPage.fallback
            ? currentPage.fallback
            : null;

        if (fallback) {
            if (checkout < 0 && headers.length > fallback.checkout) checkout = fallback.checkout;
            if (due < 0 && headers.length > fallback.due) due = fallback.due;
            if (returned < 0 && headers.length > fallback.returned) returned = fallback.returned;
        }

        if (checkout < 0 || due < 0 || returned < 0) return null;
        if (checkout === due || checkout === returned || due === returned) return null;

        return {
            checkout: checkout,
            due: due,
            returned: returned
        };
    }

    function isStillCheckedOut(returnCell) {
        if (!returnCell) return false;

        const order = normalizeText(returnCell.getAttribute("data-order"));
        const visible = normalizeText(returnCell.textContent || "");

        const states = [
            "checked out",
            "on loan",
            "prete",
            "en pret",
            "emprunte"
        ];

        if (states.some(function (state) {
            return order === state || order.includes(state);
        })) {
            return true;
        }

        if (states.some(function (state) {
            return visible === state || visible.includes(state);
        })) {
            return true;
        }

        if (returnCell.querySelector(".checked-out-badge, .onloan, .on-loan")) {
            return true;
        }

        return false;
    }

    function getEnabledRules(pageConfig) {
        if (!pageConfig || !Array.isArray(pageConfig.indicators)) return [];
        return pageConfig.indicators.filter(function (rule) {
            return rule && rule.enabled !== false && RULES[rule.id];
        });
    }

    function formattedDays(count) {
        const value = Math.abs(Number(count));
        if (!Number.isFinite(value)) return "";
        const lang = detectLanguage();
        if (lang === "fr") return value + (value === 1 ? " jour" : " jours");
        return value + (value === 1 ? " day" : " days");
    }

    function renderTemplate(template, values) {
        return String(template || "").replace(/\{([a-z]+)\}/gi, function (_match, key) {
            return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : "";
        });
    }

    function createIndicator(rule, days) {
        const def = RULES[rule.id];
        if (!def) return null;

        const lang = detectLanguage();
        const template = lang === "fr" ? rule.labelFr : rule.labelEn;
        const text = renderTemplate(template || (lang === "fr" ? def.labelFr : def.labelEn), {
            days: days === null || days === undefined ? "" : formattedDays(days)
        }).trim();
        if (!text) return null;

        const element = document.createElement(def.tone === "neutral" ? "small" : "span");
        element.className = INDICATOR_CLASS;
        element.textContent = text;

        if (def.tone === "neutral") {
            element.classList.add("pmk-history-neutral");
        } else if (def.tone === "danger") {
            element.classList.add("badge", "bg-danger");
        } else if (def.tone === "warning") {
            element.classList.add("badge", "bg-warning", "text-dark");
        }

        return element;
    }

    function clearRow(row) {
        if (!row) return;

        row.querySelectorAll("." + CONTAINER_CLASS).forEach(function (node) {
            node.remove();
        });

        row.querySelectorAll("." + CURRENT_ICON_CLASS).forEach(function (node) {
            node.remove();
        });

        /*
         * Compatibilité avec le 007 historique : évite doublons d'icône et de
         * texte si une ancienne version a déjà touché le tableau.
         */
        row.querySelectorAll(".readingrec-note, .readingrec-book-icon").forEach(function (node) {
            node.remove();
        });

        row.querySelectorAll("." + BG_OK_CLASS + ", ." + BG_DANGER_CLASS).forEach(function (cell) {
            cell.classList.remove(BG_OK_CLASS, BG_DANGER_CLASS);
            cell.style.removeProperty("background-color");
        });
    }

    function addCurrentLoanIcon(returnCell) {
        if (!returnCell || returnCell.querySelector("." + CURRENT_ICON_CLASS)) return;

        const icon = document.createElement("i");
        icon.className = "fa-solid fa-book " + CURRENT_ICON_CLASS;
        icon.setAttribute("aria-hidden", "true");
        icon.title = detectLanguage() === "fr"
            ? "Prêt en cours"
            : "Currently checked out";
        returnCell.appendChild(icon);
    }

    function applyCellBackground(returnCell, cssClass, color) {
        if (!returnCell) return;
        returnCell.classList.remove(BG_OK_CLASS, BG_DANGER_CLASS);
        returnCell.classList.add(cssClass);

        /*
         * L'inline reprend le comportement du script 007 historique et garantit
         * que la couleur reste visible face aux styles DataTables/Koha.
         */
        if (color) {
            returnCell.style.setProperty("background-color", color, "important");
        }
    }

    function applyHistoricalBackground(returnCell, checkoutDate, dueDate, returnedDate, current) {
        if (!returnCell) return;

        returnCell.style.removeProperty("background-color");

        if (currentConfig.highlightBackground === false) return;

        const today = new Date();
        const okColor = currentConfig.normalBackgroundColor || DEFAULT_CONFIG.normalBackgroundColor;
        const dangerColor = currentConfig.overdueBackgroundColor || DEFAULT_CONFIG.overdueBackgroundColor;

        if (returnedDate) {
            const chronology = daysBetween(checkoutDate, returnedDate);

            if (chronology !== null && chronology < 0) {
                applyCellBackground(returnCell, BG_DANGER_CLASS, dangerColor);
                return;
            }

            /*
             * Comportement historique : un prêt rendu reçoit le fond vert de
             * durée, y compris s'il a été rendu après l'échéance.
             */
            applyCellBackground(returnCell, BG_OK_CLASS, okColor);
            return;
        }

        if (current) {
            const late = daysBetween(dueDate, today);
            if (late !== null && late > 0) {
                applyCellBackground(returnCell, BG_DANGER_CLASS, dangerColor);
            } else {
                applyCellBackground(returnCell, BG_OK_CLASS, okColor);
            }
        }
    }

    function appendRule(container, rule, days) {
        const element = createIndicator(rule, days);
        if (element) container.appendChild(element);
    }

    function processRow(row, columns, rules) {
        if (!row || row.classList.contains("child")) return;
        const cells = row.querySelectorAll(":scope > td");
        if (!cells.length) return;

        const maxIndex = Math.max(columns.checkout, columns.due, columns.returned);
        if (cells.length <= maxIndex) return;

        clearRow(row);

        const checkoutCell = cells[columns.checkout];
        const dueCell = cells[columns.due];
        const returnCell = cells[columns.returned];

        const checkoutDate = parseCellDate(checkoutCell);
        const dueDate = parseCellDate(dueCell);
        const returnedDate = parseCellDate(returnCell);
        const current = isStillCheckedOut(returnCell) && !returnedDate;

        if (!checkoutDate || !dueDate) return;
        if (!current && !returnedDate) return;

        if (current) {
            addCurrentLoanIcon(returnCell);
        }

        applyHistoricalBackground(
            returnCell,
            checkoutDate,
            dueDate,
            returnedDate,
            current
        );

        const byId = new Map(rules.map(function (rule) { return [rule.id, rule]; }));
        const container = document.createElement("div");
        container.className = CONTAINER_CLASS;

        rules.forEach(function (rule) {
            if (rule.id === "return-before-checkout") {
                if (!returnedDate) return;
                const duration = daysBetween(checkoutDate, returnedDate);
                if (duration !== null && duration < 0) appendRule(container, rule, null);
                return;
            }

            if (rule.id === "loan-duration-returned") {
                if (!returnedDate) return;
                const duration = daysBetween(checkoutDate, returnedDate);
                if (duration !== null && duration >= 0) appendRule(container, rule, duration);
                return;
            }

            if (rule.id === "returned-late") {
                if (!returnedDate) return;
                const late = daysBetween(dueDate, returnedDate);
                if (late !== null && late > 0) appendRule(container, rule, late);
                return;
            }

            if (rule.id === "loan-duration-current") {
                if (!current) return;
                const today = new Date();
                const late = daysBetween(dueDate, today);
                if (late !== null && late > 0 && byId.has("overdue-current") && byId.get("overdue-current").enabled !== false) {
                    return;
                }
                const duration = daysBetween(checkoutDate, today);
                if (duration !== null && duration >= 0) appendRule(container, rule, duration);
                return;
            }

            if (rule.id === "overdue-current") {
                if (!current) return;
                const late = daysBetween(dueDate, new Date());
                if (late !== null && late > 0) appendRule(container, rule, late);
            }
        });

        if (container.childNodes.length) returnCell.appendChild(container);
    }

    function processTable() {
        const state = tableState;
        if (!state || !state.table || !document.body.contains(state.table)) return;

        const columns = resolveColumns(state.table);
        if (!columns) {
            state.columns = null;
            window[GLOBAL_GUARD].runtime = {
                active: false,
                reason: "columns-not-found",
                rows: state.table.querySelectorAll("tbody tr").length
            };
            state.table.querySelectorAll("tbody tr").forEach(clearRow);
            return;
        }
        state.columns = columns;

        const rules = getEnabledRules(currentPageConfig);
        const rows = state.table.querySelectorAll("tbody tr");
        rows.forEach(function (row) {
            processRow(row, columns, rules);
        });

        window[GLOBAL_GUARD].runtime = {
            active: true,
            reason: "ok",
            pageId: currentPage ? currentPage.id : null,
            columns: {
                checkout: columns.checkout,
                due: columns.due,
                returned: columns.returned
            },
            rows: rows.length,
            rules: rules.map(function (rule) { return rule.id; })
        };
    }

    function bindDataTables(table) {
        if (!window.jQuery || !window.jQuery.fn) return;
        const $table = window.jQuery(table);
        $table.off("draw.dt.pmk007");
        $table.on("draw.dt.pmk007", function () {
            window.requestAnimationFrame(processTable);
        });
    }

    function unbindDataTables() {
        if (!tableState || !tableState.table || !window.jQuery || !window.jQuery.fn) return;
        window.jQuery(tableState.table).off("draw.dt.pmk007");
    }

    function clearInjectedIndicators() {
        Object.values(PAGES).forEach(function (page) {
            const table = document.getElementById(page.tableId);
            if (!table) return;

            table.querySelectorAll("tbody tr").forEach(function (row) {
                clearRow(row);
            });

            table.classList.remove("pmk-history-table");
            table.style.removeProperty("--pmk-history-normal-bg");
            table.style.removeProperty("--pmk-history-overdue-bg");
            table.style.removeProperty("--pmk-history-current-icon");
        });
    }

    function mountContextAccess() {
        if (!currentPage || !window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;

        let heading = null;
        (currentPage.headingSelectors || []).some(function (selector) {
            heading = document.querySelector(selector);
            return !!heading;
        });
        if (!heading) return;

        window.PMKConfig.mountContextButton({
            moduleId: MODULE_ID,
            anchor: heading,
            position: "append",
            contextKey: currentPage.id,
            context: {
                pageId: currentPage.id,
                sectionId: "pages"
            }
        });
    }

    function setupTable(table) {
        if (!currentPage || !table || table.id !== currentPage.tableId) return false;

        if (tableState && tableState.table !== table) {
            unbindDataTables();
        }

        tableState = { table: table, columns: null, pageId: currentPage.id };
        window[GLOBAL_GUARD].table = table;
        window[GLOBAL_GUARD].pageId = currentPage.id;
        injectStyles();
        table.classList.add("pmk-history-table");

        table.style.setProperty(
            "--pmk-history-normal-bg",
            currentConfig.normalBackgroundColor || DEFAULT_CONFIG.normalBackgroundColor
        );
        table.style.setProperty(
            "--pmk-history-overdue-bg",
            currentConfig.overdueBackgroundColor || DEFAULT_CONFIG.overdueBackgroundColor
        );
        table.style.setProperty(
            "--pmk-history-current-icon",
            currentConfig.currentLoanIconColor || DEFAULT_CONFIG.currentLoanIconColor
        );

        bindDataTables(table);
        processTable();
        mountContextAccess();
        return true;
    }

    function waitForTable(timeoutMs) {
        if (!currentPage) return Promise.resolve(null);

        const existing = document.getElementById(currentPage.tableId);
        if (existing) return Promise.resolve(existing);

        return new Promise(function (resolve) {
            let finished = false;
            const observer = new MutationObserver(function () {
                const table = document.getElementById(currentPage.tableId);
                if (!table || finished) return;
                finished = true;
                observer.disconnect();
                resolve(table);
            });

            observer.observe(document.documentElement, { childList: true, subtree: true });
            window.setTimeout(function () {
                if (finished) return;
                finished = true;
                observer.disconnect();
                resolve(document.getElementById(currentPage.tableId));
            }, timeoutMs || 4000);
        });
    }

    async function applyConfig(config) {
        currentPage = detectCurrentPage();
        currentConfig = normalizeConfig(config);
        currentPageConfig = getPageConfig(currentConfig);

        if (!currentPageConfig) {
            clearInjectedIndicators();
            unbindDataTables();
            return;
        }

        const table = await waitForTable(4000);
        if (!table) {
            clearInjectedIndicators();
            return;
        }

        setupTable(table);
    }

    function validateModuleConfig(config) {
        if (!config || typeof config !== "object") {
            return {
                ok: false,
                message: detectLanguage() === "fr"
                    ? "La configuration du module est invalide."
                    : "The module configuration is invalid."
            };
        }

        if (
            Object.prototype.hasOwnProperty.call(config, "language") &&
            !["auto", "fr", "en"].includes(String(config.language || "").toLowerCase())
        ) {
            return {
                ok: false,
                message: detectLanguage() === "fr"
                    ? "La langue choisie n’est pas valide."
                    : "The selected language is invalid."
            };
        }

        const colorKeys = [
            "normalBackgroundColor",
            "overdueBackgroundColor",
            "currentLoanIconColor"
        ];

        for (const key of colorKeys) {
            if (
                Object.prototype.hasOwnProperty.call(config, key) &&
                !/^#[0-9a-f]{6}$/i.test(String(config[key] || "").trim())
            ) {
                return {
                    ok: false,
                    message: detectLanguage() === "fr"
                        ? "Une couleur doit être saisie au format #RRGGBB."
                        : "Colors must use the #RRGGBB format."
                };
            }
        }

        const labelKeys = [
            "returnedDurationLabelFr",
            "returnedDurationLabelEn",
            "currentDurationLabelFr",
            "currentDurationLabelEn",
            "currentOverdueLabelFr",
            "currentOverdueLabelEn",
            "returnedLateLabelFr",
            "returnedLateLabelEn",
            "chronologyWarningLabelFr",
            "chronologyWarningLabelEn"
        ];

        for (const key of labelKeys) {
            if (
                Object.prototype.hasOwnProperty.call(config, key) &&
                !String(config[key] || "").trim()
            ) {
                return {
                    ok: false,
                    message: detectLanguage() === "fr"
                        ? "Les libellés français et anglais ne peuvent pas être vides."
                        : "French and English labels cannot be empty."
                };
            }
        }

        return { ok: true };
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 5,
            name: {
                fr: "Indicateurs de l’historique de prêt",
                en: "Loan history indicators"
            },
            description: {
                fr: "Ajoute des indicateurs de durée, de retard et de cohérence dans les historiques de prêt d’un lecteur et d’une notice.",
                en: "Adds duration, overdue and consistency indicators to patron and bibliographic-record loan histories."
            },
            category: {
                fr: "Circulation / historique",
                en: "Circulation / history"
            },
            supportedPages: ["members.readingrec", "catalogue.issuehistory"],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            validate: validateModuleConfig,
            schema: [
                {
                    type: "section",
                    id: "presentation",
                    label: {
                        fr: "Langue et présentation",
                        en: "Language and presentation"
                    },
                    description: {
                        fr: "Réglages généraux des indicateurs affichés dans l’historique.",
                        en: "General settings for indicators shown in the circulation history."
                    },
                    fields: [
                        {
                            key: "language",
                            type: "select",
                            label: {
                                fr: "Langue des indicateurs",
                                en: "Indicator language"
                            },
                            options: [
                                {
                                    value: "auto",
                                    label: {
                                        fr: "Automatique — suivre la langue de Koha",
                                        en: "Automatic — follow Koha language"
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
                            key: "highlightBackground",
                            type: "boolean",
                            label: {
                                fr: "Conserver la mise en couleur historique",
                                en: "Keep the original background highlighting"
                            },
                            help: {
                                fr: "Applique une couleur de fond à la cellule de retour, comme dans le script 007 d’origine.",
                                en: "Applies a background color to the return cell, as in the original 007 script."
                            }
                        },
                        {
                            key: "normalBackgroundColor",
                            type: "color",
                            label: {
                                fr: "Couleur — prêt normal",
                                en: "Color — normal loan"
                            },
                            when: function (rootObject) {
                                return rootObject.highlightBackground !== false;
                            }
                        },
                        {
                            key: "overdueBackgroundColor",
                            type: "color",
                            label: {
                                fr: "Couleur — prêt en retard",
                                en: "Color — overdue loan"
                            },
                            when: function (rootObject) {
                                return rootObject.highlightBackground !== false;
                            }
                        },
                        {
                            key: "currentLoanIconColor",
                            type: "color",
                            label: {
                                fr: "Couleur de l’icône prêt en cours",
                                en: "Current-loan icon color"
                            }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "pages",
                    label: {
                        fr: "Pages actives",
                        en: "Active pages"
                    },
                    description: {
                        fr: "Le même module pilote les indicateurs sur les deux historiques Koha. Chaque page peut être activée indépendamment.",
                        en: "The same module controls indicators on both Koha history pages. Each page can be enabled independently."
                    },
                    fields: [
                        {
                            key: "enableReadingrec",
                            type: "boolean",
                            label: {
                                fr: "Historique d'un lecteur — members/readingrec.pl",
                                en: "Patron history — members/readingrec.pl"
                            }
                        },
                        {
                            key: "enableIssuehistory",
                            type: "boolean",
                            label: {
                                fr: "Historique des prêts d'une notice — catalogue/issuehistory.pl",
                                en: "Bibliographic record loan history — catalogue/issuehistory.pl"
                            }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "display",
                    label: {
                        fr: "Indicateurs et libellés",
                        en: "Indicators and labels"
                    },
                    description: {
                        fr: "Chaque indicateur peut être activé séparément. Les textes français et anglais sont modifiables. Utilise {days} à l’endroit où le nombre de jours doit apparaître.",
                        en: "Each indicator can be enabled separately. French and English texts are editable. Use {days} where the day count should appear."
                    },
                    fields: [
                        {
                            type: "section",
                            id: "returned-duration",
                            label: {
                                fr: "Durée des prêts rendus",
                                en: "Duration of returned loans"
                            },
                            fields: [
                                {
                                    key: "showReturnedDuration",
                                    type: "boolean",
                                    label: { fr: "Afficher cet indicateur", en: "Show this indicator" }
                                },
                                {
                                    key: "returnedDurationLabelFr",
                                    type: "text",
                                    label: { fr: "Libellé français", en: "French label" },
                                    placeholder: { fr: "Durée du prêt : {days}", en: "Durée du prêt : {days}" }
                                },
                                {
                                    key: "returnedDurationLabelEn",
                                    type: "text",
                                    label: { fr: "Libellé anglais", en: "English label" },
                                    placeholder: { fr: "Loan duration: {days}", en: "Loan duration: {days}" }
                                }
                            ]
                        },
                        {
                            type: "section",
                            id: "current-duration",
                            label: {
                                fr: "Durée des prêts en cours",
                                en: "Duration of current loans"
                            },
                            fields: [
                                {
                                    key: "showCurrentDuration",
                                    type: "boolean",
                                    label: { fr: "Afficher cet indicateur", en: "Show this indicator" }
                                },
                                {
                                    key: "currentDurationLabelFr",
                                    type: "text",
                                    label: { fr: "Libellé français", en: "French label" }
                                },
                                {
                                    key: "currentDurationLabelEn",
                                    type: "text",
                                    label: { fr: "Libellé anglais", en: "English label" }
                                }
                            ]
                        },
                        {
                            type: "section",
                            id: "current-overdue",
                            label: {
                                fr: "Retard des prêts en cours",
                                en: "Overdue current loans"
                            },
                            fields: [
                                {
                                    key: "showCurrentOverdue",
                                    type: "boolean",
                                    label: { fr: "Afficher cet indicateur", en: "Show this indicator" }
                                },
                                {
                                    key: "currentOverdueLabelFr",
                                    type: "text",
                                    label: { fr: "Libellé français", en: "French label" }
                                },
                                {
                                    key: "currentOverdueLabelEn",
                                    type: "text",
                                    label: { fr: "Libellé anglais", en: "English label" }
                                }
                            ]
                        },
                        {
                            type: "section",
                            id: "returned-late",
                            label: {
                                fr: "Retour après échéance",
                                en: "Returned after due date"
                            },
                            fields: [
                                {
                                    key: "showReturnedLate",
                                    type: "boolean",
                                    label: { fr: "Afficher cet indicateur", en: "Show this indicator" }
                                },
                                {
                                    key: "returnedLateLabelFr",
                                    type: "text",
                                    label: { fr: "Libellé français", en: "French label" }
                                },
                                {
                                    key: "returnedLateLabelEn",
                                    type: "text",
                                    label: { fr: "Libellé anglais", en: "English label" }
                                }
                            ]
                        },
                        {
                            type: "section",
                            id: "chronology-warning",
                            label: {
                                fr: "Incohérence chronologique",
                                en: "Date inconsistency"
                            },
                            fields: [
                                {
                                    key: "showChronologyWarning",
                                    type: "boolean",
                                    label: { fr: "Afficher cet indicateur", en: "Show this indicator" }
                                },
                                {
                                    key: "chronologyWarningLabelFr",
                                    type: "text",
                                    label: { fr: "Libellé français", en: "French label" }
                                },
                                {
                                    key: "chronologyWarningLabelEn",
                                    type: "text",
                                    label: { fr: "Libellé anglais", en: "English label" }
                                }
                            ]
                        }
                    ]
                }
            ],
            focusContext: function (main, context) {
                if (!main || !context || !PAGES[context.pageId]) return;
                const sectionId = context.sectionId || "pages";
                const section = main.querySelector('[data-pmk-section-id="' + sectionId + '"]')
                    || main.querySelector('[data-pmk-section-id="display"]');
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

        /*
         * Enregistrement volontairement effectué sur TOUTES les pages Koha :
         * le module doit toujours être visible dans l'administration PMK,
         * même si son exécution fonctionnelle reste limitée à readingrec.pl et issuehistory.pl.
         */
        if (!coreRegistered) {
            window.PMKConfig.registerModule(moduleDefinition());
            coreRegistered = true;
        }

        if (coreStarted || !isTargetPage()) return;
        coreStarted = true;

        try {
            const config = await window.PMKConfig.getConfig(MODULE_ID);
            await applyConfig(config);
        } catch (_) {
            await applyConfig(DEFAULT_CONFIG);
        }

        if (typeof window.PMKConfig.subscribe === "function" && !unsubscribeConfig) {
            unsubscribeConfig = window.PMKConfig.subscribe(MODULE_ID, function (newConfig) {
                applyConfig(newConfig);
            });
            window[GLOBAL_GUARD].unsubscribe = unsubscribeConfig;
        }

        window[GLOBAL_GUARD].initialized = true;
    }

    async function startWithoutCore() {
        if (fallbackStarted || !isTargetPage()) return;
        fallbackStarted = true;
        await applyConfig(DEFAULT_CONFIG);
        window[GLOBAL_GUARD].initialized = true;
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
            /*
             * Sans socle PMK, le comportement reste autonome sur
             * readingrec.pl et issuehistory.pl. Si le socle arrive ensuite, on enregistre alors
             * le module dans l'administration centrale.
             */
            if (isTargetPage()) {
                startWithoutCore();
            }

            window.addEventListener("pmk:config-ready", function () {
                startWithCore();
            }, { once: true });
        }
    });
})();

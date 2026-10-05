/*
 Nom du fichier : 101-koha-log.js
 Module PMK      : Journal Koha
 ID PMK          : log-viewer
 Version         : 2.0.0-pmk-isolated
 Date            : 2026-09-20

 Objectif :
 - améliorer la lisibilité de /tools/viewlog.pl sans remplacer les rendus natifs Koha ;
 - conserver les couleurs, badges et filtres rapides du 101 historique ;
 - utiliser les codes stables Koha pour les modules/actions ;
 - conserver les parseurs historiques $VAR1 / MARC uniquement comme fallbacks ;
 - respecter la colonne Diff native et les rendus structurés natifs des versions récentes ;
 - s'enregistrer directement dans PMK sans modification du socle 000.

 Principe impératif :
   KOHA NATIF D'ABORD -> AMELIORATION PMK -> FALLBACK LEGACY EN DERNIER.
*/
(function () {
    "use strict";

    const MODULE_ID = "log-viewer";
    const MODULE_VERSION = "2.0.0-pmk-isolated";
    const SCRIPT_GUARD = "__pmk101KohaLogV2";
    const STYLE_ID = "pmk101-koha-log-style";
    const PAGE_PATH = "/cgi-bin/koha/tools/viewlog.pl";
    const PAGE_ID = "tools.viewlog";
    const TOOLBAR_ID = "pmk101-log-toolbar";
    const GENERATED_ATTR = "data-pmk101-generated";

    if (window[SCRIPT_GUARD]) return;
    window[SCRIPT_GUARD] = true;

    /*
     * Valeurs historiques du 101.
     * Les actions sont maintenant identifiées par leurs codes Koha,
     * pas par leurs traductions visibles.
     */
    const ACTION_STYLE_KEY = {
        "ADD": "add",
        "CREATE": "create",
        "ADD_BASKET": "add",
        "CREATE_ORDER": "add",
        "CREATE_INVOICE_ADJUSTMENT": "add",
        "CREATE_FUND": "add",
        "CREATE_RESTRICTION": "delete",
        "ADDCIRCMESSAGE": "add",

        "DELETE": "delete",
        "CANCEL_ORDER": "delete",
        "DELETE_INVOICE_ADJUSTMENT": "delete",
        "DELETE_FUND": "delete",
        "DELCIRCMESSAGE": "delete",

        "MODIFY": "modify",
        "MODIFY_BASKET": "modify",
        "MODIFY_BASKET_HEADER": "modify",
        "MODIFY_BASKET_USERS": "modify",
        "MODIFY_ORDER": "modify",
        "UPDATE_INVOICE_ADJUSTMENT": "modify",
        "MODIFY_BUDGET": "modify",
        "MODIFY_FUND": "modify",
        "MODIFY_RESTRICTION": "modify",
        "MODCIRCMESSAGE": "modify",
        "MODIFY_CARDNUMBER": "modify",
        "CHANGE PASS": "modify",
        "RESET PASS": "modify",
        "RESET 2FA": "modify",
        "EDIT_MAPPINGS": "modify",
        "RESET_MAPPINGS": "modify",

        "ISSUE": "issue",
        "RENEW": "issue",
        "RENEWAL": "issue",

        "RETURN": "return",
        "RECEIVE_ORDER": "return",

        "CANCEL": "cancel",
        "SUSPEND": "cancel",

        "FILL": "create",
        "RESUME": "return",
        "Run": "cron",
        "RUN": "cron",
        "End": "cron",
        "END": "cron"
    };

    const DEFAULTS = {
        enabled: true,
        pages: {
            viewlog: {
                enabled: true,
                pageId: PAGE_ID,
                path: PAGE_PATH
            }
        },

        presentation: {
            colorRows: true,
            actionBadges: true,
            moduleBadges: true,
            compactInfo: true
        },

        filters: {
            enabled: true,
            showClearButton: true,
            showCronToggle: true,
            cronFilterTarget: "interface",
            moduleButtons: [
                { id: "cron", enabled: true, code: "CRONJOBS", labelFr: "Cron", labelEn: "Cron" },
                { id: "holds", enabled: true, code: "HOLDS", labelFr: "Réservations", labelEn: "Holds" },
                { id: "circulation", enabled: true, code: "CIRCULATION", labelFr: "Circulation", labelEn: "Circulation" },
                { id: "members", enabled: true, code: "MEMBERS", labelFr: "Adhérents", labelEn: "Patrons" },
                { id: "cataloguing", enabled: true, code: "CATALOGUING", labelFr: "Catalogage", labelEn: "Cataloging" },
                { id: "system-preferences", enabled: true, code: "SYSTEMPREFERENCE", labelFr: "Préf. système", labelEn: "System prefs" },
                { id: "acquisitions", enabled: true, code: "ACQUISITIONS", labelFr: "Acquisitions", labelEn: "Acquisitions" }
            ],
            actionButtons: [
                { id: "adds", enabled: true, codes: "ADD|CREATE", labelFr: "＋ Ajouts", labelEn: "＋ Adds" },
                { id: "deletes", enabled: true, codes: "DELETE", labelFr: "✕ Suppressions", labelEn: "✕ Deletes" },
                { id: "modifies", enabled: true, codes: "MODIFY", labelFr: "✎ Modifications", labelEn: "✎ Modifications" }
            ]
        },

        legacy: {
            enabled: true,
            parsePerlDump: true,
            parseMarcBeforeAfter: true,
            hideRawWhenEnhanced: true,
            minMarcTags: 8
        },

        colors: {
            rowAdd: "#d4edda",
            rowDelete: "#f8d7da",
            rowModify: "#fff3cd",
            rowCreate: "#cce5ff",
            rowIssue: "#d1ecf1",
            rowReturn: "#e8f5e9",
            rowCron: "#f3e5f5",
            rowCancel: "#f5f5f5",

            badgeAdd: "#28a745",
            badgeDelete: "#dc3545",
            badgeModify: "#fd7e14",
            badgeCreate: "#007bff",
            badgeIssue: "#17a2b8",
            badgeReturn: "#20c997",
            badgeCron: "#6f42c1",
            badgeCancel: "#868e96",

            moduleBorderAlpha: "55"
        },

        moduleStyles: [
            { code: "CRONJOBS", bg: "#e8eaf6", fg: "#3949ab" },
            { code: "HOLDS", bg: "#e3f2fd", fg: "#1565c0" },
            { code: "MEMBERS", bg: "#f3e5f5", fg: "#6a1b9a" },
            { code: "CATALOGUING", bg: "#e8f5e9", fg: "#2e7d32" },
            { code: "CIRCULATION", bg: "#fff8e1", fg: "#e65100" },
            { code: "SYSTEMPREFERENCE", bg: "#fce4ec", fg: "#ad1457" },
            { code: "ACQUISITIONS", bg: "#e0f2f1", fg: "#00695c" },
            { code: "AUTHORITIES", bg: "#f1f8e9", fg: "#558b2f" },
            { code: "AUTH", bg: "#fff3e0", fg: "#bf360c" },
            { code: "FINES", bg: "#efebe9", fg: "#4e342e" },
            { code: "SERIAL", bg: "#e8eaf6", fg: "#283593" },
            { code: "NOTICES", bg: "#f9fbe7", fg: "#827717" },
            { code: "REPORTS", bg: "#e0f7fa", fg: "#006064" },
            { code: "NEWS", bg: "#fffde7", fg: "#f57f17" },
            { code: "SUGGESTION", bg: "#fbe9e7", fg: "#bf360c" },
            { code: "ILL", bg: "#f0f4c3", fg: "#827717" },
            { code: "CLAIMS", bg: "#fce4ec", fg: "#880e4f" },
            { code: "RECALLS", bg: "#e1f5fe", fg: "#01579b" },
            { code: "SEARCHENGINE", bg: "#ede7f6", fg: "#4527a0" }
        ],

        behavior: {
            initDelayMs: 150,
            retryDelayMs: 300,
            retryCount: 20,
            observeMutations: true
        }
    };

    let currentConfig = clone(DEFAULTS);
    let pmkRegistered = false;
    let unsubscribe = null;
    let mutationObserver = null;
    let retryTimer = null;
    let started = false;
    let boundTableNode = null;

    const LEGACY_MODULE_LABELS = {
        "tâches cron": "CRONJOBS",
        "taches cron": "CRONJOBS",
        "cron jobs": "CRONJOBS",
        "réservations": "HOLDS",
        "reservations": "HOLDS",
        "holds": "HOLDS",
        "adhérents": "MEMBERS",
        "adherents": "MEMBERS",
        "patrons": "MEMBERS",
        "catalogage": "CATALOGUING",
        "cataloging": "CATALOGUING",
        "circulation": "CIRCULATION",
        "préférences système": "SYSTEMPREFERENCE",
        "preferences systeme": "SYSTEMPREFERENCE",
        "system preferences": "SYSTEMPREFERENCE",
        "acquisitions": "ACQUISITIONS",
        "autorités": "AUTHORITIES",
        "autorites": "AUTHORITIES",
        "authorities": "AUTHORITIES",
        "authentification": "AUTH",
        "authentication": "AUTH",
        "amendes": "FINES",
        "fines": "FINES",
        "périodiques": "SERIAL",
        "periodiques": "SERIAL",
        "serials": "SERIAL",
        "rapports": "REPORTS",
        "reports": "REPORTS",
        "annonces": "NEWS",
        "additional content": "NEWS",
        "suggestions": "SUGGESTION",
        "prêt entre bibliothèques": "ILL",
        "pret entre bibliotheques": "ILL",
        "interlibrary loans": "ILL",
        "réclamations": "CLAIMS",
        "reclamations": "CLAIMS",
        "claims": "CLAIMS",
        "rappels": "RECALLS",
        "recalls": "RECALLS",
        "moteur de recherche": "SEARCHENGINE",
        "search engine": "SEARCHENGINE"
    };

    const LEGACY_ACTION_LABELS = {
        "ajouter": "ADD",
        "add": "ADD",
        "créer": "CREATE",
        "creer": "CREATE",
        "create": "CREATE",
        "supprimer": "DELETE",
        "delete": "DELETE",
        "modifier": "MODIFY",
        "modify": "MODIFY",
        "prêt": "ISSUE",
        "pret": "ISSUE",
        "checkout": "ISSUE",
        "retour": "RETURN",
        "check-in": "RETURN",
        "check in": "RETURN",
        "renouveler": "RENEW",
        "renew": "RENEW",
        "annuler": "CANCEL",
        "cancel": "CANCEL",
        "remplir": "FILL",
        "fill": "FILL",
        "suspendre": "SUSPEND",
        "suspend": "SUSPEND",
        "reprendre": "RESUME",
        "resume": "RESUME",
        "exécuter": "Run",
        "executer": "Run",
        "run": "Run",
        "date de fin": "End",
        "end": "End",
        "changer le mot de passe": "CHANGE PASS",
        "change password": "CHANGE PASS",
        "réinitialiser le mot de passe": "RESET PASS",
        "reinitialiser le mot de passe": "RESET PASS",
        "reset password": "RESET PASS",
        "ajouter un message de circulation": "ADDCIRCMESSAGE",
        "add circulation message": "ADDCIRCMESSAGE",
        "modifier un message de circulation": "MODCIRCMESSAGE",
        "modify circulation message": "MODCIRCMESSAGE",
        "supprimer un message de circulation": "DELCIRCMESSAGE",
        "delete circulation message": "DELCIRCMESSAGE",
        "recevoir une commande": "RECEIVE_ORDER",
        "receive an order": "RECEIVE_ORDER",
        "ajouter une commande": "CREATE_ORDER",
        "create an order": "CREATE_ORDER",
        "annuler une commande": "CANCEL_ORDER",
        "cancel an order": "CANCEL_ORDER",
        "modifier une commande": "MODIFY_ORDER",
        "modify an order": "MODIFY_ORDER"
    };

    const KEY_FIELDS = [
        "borrowernumber", "biblionumber", "itemnumber",
        "reserve_id", "branchcode", "timestamp",
        "reservedate", "issuedate", "returndate", "date_due"
    ];

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function object(value) {
        return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    }

    function merge(base, extra) {
        const out = clone(base);
        if (!extra || typeof extra !== "object") return out;
        Object.keys(extra).forEach(function (key) {
            const incoming = extra[key];
            if (Array.isArray(incoming)) {
                out[key] = clone(incoming);
            } else if (
                incoming && typeof incoming === "object" && !Array.isArray(incoming) &&
                out[key] && typeof out[key] === "object" && !Array.isArray(out[key])
            ) {
                out[key] = merge(out[key], incoming);
            } else if (incoming !== undefined) {
                out[key] = incoming;
            }
        });
        return out;
    }

    function clean(value) {
        return String(value == null ? "" : value).trim();
    }

    function normalizeText(value) {
        const raw = clean(value).toLowerCase();
        if (!raw) return "";
        try {
            return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
        } catch (_) {
            return raw.replace(/\s+/g, " ");
        }
    }

    function normalizeCode(value) {
        return clean(value).toUpperCase();
    }

    function validColor(value, fallback) {
        const v = clean(value);
        return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback;
    }

    function clamp(value, min, max, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, Math.round(n)));
    }

    function language() {
        const api = pmkApi();
        if (api && typeof api.getLanguage === "function") {
            try { return api.getLanguage() === "en" ? "en" : "fr"; } catch (_) {}
        }
        const htmlLang = clean(document.documentElement.getAttribute("lang")).toLowerCase();
        return htmlLang.indexOf("en") === 0 ? "en" : "fr";
    }

    function labelFor(item, fallbackCode) {
        const lang = language();
        const specific = lang === "en" ? clean(item && item.labelEn) : clean(item && item.labelFr);
        if (specific) return specific;
        return nativeModuleLabel(fallbackCode) || nativeActionLabel(fallbackCode) || fallbackCode;
    }

    function normalizeModuleButton(item, index) {
        const src = object(item);
        return {
            id: clean(src.id) || "module-" + (index + 1),
            enabled: src.enabled !== false,
            code: normalizeCode(src.code),
            labelFr: clean(src.labelFr),
            labelEn: clean(src.labelEn)
        };
    }

    function normalizeActionButton(item, index) {
        const src = object(item);
        const codes = clean(src.codes)
            .split("|")
            .map(function (v) { return normalizeCode(v); })
            .filter(Boolean)
            .join("|");
        return {
            id: clean(src.id) || "action-" + (index + 1),
            enabled: src.enabled !== false,
            codes: codes,
            labelFr: clean(src.labelFr),
            labelEn: clean(src.labelEn)
        };
    }

    function normalizeModuleStyle(item) {
        const src = object(item);
        return {
            code: normalizeCode(src.code),
            bg: validColor(src.bg, "#e9ecef"),
            fg: validColor(src.fg, "#495057")
        };
    }

    function normalizeConfig(config) {
        const cfg = merge(DEFAULTS, object(config));

        cfg.enabled = cfg.enabled !== false;
        cfg.pages = merge(DEFAULTS.pages, object(cfg.pages));
        cfg.pages.viewlog = merge(DEFAULTS.pages.viewlog, object(cfg.pages.viewlog));
        cfg.pages.viewlog.enabled = cfg.pages.viewlog.enabled !== false;
        cfg.pages.viewlog.pageId = PAGE_ID;
        cfg.pages.viewlog.path = PAGE_PATH;

        cfg.presentation = merge(DEFAULTS.presentation, object(cfg.presentation));
        cfg.presentation.colorRows = cfg.presentation.colorRows !== false;
        cfg.presentation.actionBadges = cfg.presentation.actionBadges !== false;
        cfg.presentation.moduleBadges = cfg.presentation.moduleBadges !== false;
        cfg.presentation.compactInfo = cfg.presentation.compactInfo !== false;

        cfg.filters = merge(DEFAULTS.filters, object(cfg.filters));
        cfg.filters.enabled = cfg.filters.enabled !== false;
        cfg.filters.showClearButton = cfg.filters.showClearButton !== false;
        cfg.filters.showCronToggle = cfg.filters.showCronToggle !== false;
        cfg.filters.cronFilterTarget = cfg.filters.cronFilterTarget === "module" ? "module" : "interface";
        cfg.filters.moduleButtons = Array.isArray(cfg.filters.moduleButtons)
            ? cfg.filters.moduleButtons.map(normalizeModuleButton)
            : clone(DEFAULTS.filters.moduleButtons);
        cfg.filters.actionButtons = Array.isArray(cfg.filters.actionButtons)
            ? cfg.filters.actionButtons.map(normalizeActionButton)
            : clone(DEFAULTS.filters.actionButtons);

        cfg.legacy = merge(DEFAULTS.legacy, object(cfg.legacy));
        cfg.legacy.enabled = cfg.legacy.enabled !== false;
        cfg.legacy.parsePerlDump = cfg.legacy.parsePerlDump !== false;
        cfg.legacy.parseMarcBeforeAfter = cfg.legacy.parseMarcBeforeAfter !== false;
        cfg.legacy.hideRawWhenEnhanced = cfg.legacy.hideRawWhenEnhanced !== false;
        cfg.legacy.minMarcTags = clamp(cfg.legacy.minMarcTags, 2, 100, DEFAULTS.legacy.minMarcTags);

        cfg.colors = merge(DEFAULTS.colors, object(cfg.colors));
        Object.keys(DEFAULTS.colors).forEach(function (key) {
            if (key === "moduleBorderAlpha") return;
            cfg.colors[key] = validColor(cfg.colors[key], DEFAULTS.colors[key]);
        });
        cfg.colors.moduleBorderAlpha = /^[0-9a-f]{2}$/i.test(clean(cfg.colors.moduleBorderAlpha))
            ? clean(cfg.colors.moduleBorderAlpha).toLowerCase()
            : DEFAULTS.colors.moduleBorderAlpha;

        cfg.moduleStyles = Array.isArray(cfg.moduleStyles)
            ? cfg.moduleStyles.map(normalizeModuleStyle).filter(function (x) { return x.code; })
            : clone(DEFAULTS.moduleStyles);

        cfg.behavior = merge(DEFAULTS.behavior, object(cfg.behavior));
        cfg.behavior.initDelayMs = clamp(cfg.behavior.initDelayMs, 0, 5000, DEFAULTS.behavior.initDelayMs);
        cfg.behavior.retryDelayMs = clamp(cfg.behavior.retryDelayMs, 50, 3000, DEFAULTS.behavior.retryDelayMs);
        cfg.behavior.retryCount = clamp(cfg.behavior.retryCount, 1, 100, DEFAULTS.behavior.retryCount);
        cfg.behavior.observeMutations = cfg.behavior.observeMutations !== false;

        return cfg;
    }

    function validateConfig(config) {
        const cfg = normalizeConfig(config);
        const ids = {};
        for (let i = 0; i < cfg.filters.moduleButtons.length; i += 1) {
            const item = cfg.filters.moduleButtons[i];
            if (!item.enabled) continue;
            if (!item.code) return { ok: false, message: "Chaque filtre de module actif doit avoir un code Koha." };
            if (ids["m:" + item.id]) return { ok: false, message: "Chaque filtre de module doit avoir un identifiant unique." };
            ids["m:" + item.id] = true;
        }
        for (let i = 0; i < cfg.filters.actionButtons.length; i += 1) {
            const item = cfg.filters.actionButtons[i];
            if (!item.enabled) continue;
            if (!item.codes) return { ok: false, message: "Chaque filtre d’action actif doit contenir au moins un code Koha." };
            if (ids["a:" + item.id]) return { ok: false, message: "Chaque filtre d’action doit avoir un identifiant unique." };
            ids["a:" + item.id] = true;
        }
        return { ok: true };
    }

    function pmkApi() {
        return window.PMKConfig && typeof window.PMKConfig === "object" ? window.PMKConfig : null;
    }

    function newModuleFilter() {
        return {
            id: "module-" + Date.now().toString(36),
            enabled: true,
            code: "",
            labelFr: "",
            labelEn: ""
        };
    }

    function newActionFilter() {
        return {
            id: "action-" + Date.now().toString(36),
            enabled: true,
            codes: "",
            labelFr: "",
            labelEn: ""
        };
    }

    function newModuleStyle() {
        return {
            code: "",
            bg: "#e9ecef",
            fg: "#495057"
        };
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
                    fr: "Journal Koha",
                    en: "Koha log viewer"
                },
                description: {
                    fr: "Améliore la lisibilité du visualiseur de logs sans remplacer les fonctions natives de Koha. Les rendus structurés et la colonne Diff natives restent prioritaires ; les parseurs historiques ne servent qu’en fallback.",
                    en: "Improves the Koha log viewer without replacing native features. Native structured rendering and Diff stay authoritative; historical parsers are fallback-only."
                },
                category: {
                    fr: "Outils / administration",
                    en: "Tools / administration"
                },
                supportedPages: [PAGE_ID],
                prerequisites: [],
                dependencies: [],
                defaults: clone(DEFAULTS),
                normalize: normalizeConfig,
                validate: validateConfig,
                schema: [
                    {
                        type: "section",
                        id: "activation",
                        label: { fr: "Activation", en: "Activation" },
                        fields: [
                            { key: "enabled", type: "boolean", label: { fr: "Activer le module", en: "Enable module" } },
                            { key: "pages.viewlog.enabled", type: "boolean", label: { fr: "Activer sur le visualiseur des logs", en: "Enable on log viewer" } },
                            { key: "pages.viewlog.path", type: "readonly", advanced: true, label: { fr: "Page Koha", en: "Koha page" } }
                        ]
                    },
                    {
                        type: "section",
                        id: "presentation",
                        label: { fr: "Présentation", en: "Presentation" },
                        description: {
                            fr: "Ces réglages reprennent par défaut le rendu historique du 101, sans toucher aux contenus natifs Koha.",
                            en: "Defaults preserve the historical 101 appearance without replacing native Koha content."
                        },
                        fields: [
                            { key: "presentation.colorRows", type: "boolean", label: { fr: "Colorer les lignes selon l’action", en: "Color rows by action" } },
                            { key: "presentation.actionBadges", type: "boolean", label: { fr: "Afficher les actions sous forme de badges", en: "Show action badges" } },
                            { key: "presentation.moduleBadges", type: "boolean", label: { fr: "Afficher les modules sous forme de badges", en: "Show module badges" } },
                            { key: "presentation.compactInfo", type: "boolean", label: { fr: "Limiter la largeur de la zone Info", en: "Keep Info area compact" } }
                        ]
                    },
                    {
                        type: "section",
                        id: "filters",
                        label: { fr: "Filtres rapides", en: "Quick filters" },
                        description: {
                            fr: "Les filtres utilisent les codes Koha stables et non les traductions affichées. Vous pouvez ajouter vos propres modules/actions.",
                            en: "Filters use stable Koha codes rather than displayed translations. You can add your own modules/actions."
                        },
                        fields: [
                            { key: "filters.enabled", type: "boolean", label: { fr: "Afficher la barre de filtres", en: "Show filter toolbar" } },
                            { key: "filters.showClearButton", type: "boolean", label: { fr: "Afficher « Effacer les filtres »", en: "Show “Clear filters”" } },
                            { key: "filters.showCronToggle", type: "boolean", label: { fr: "Afficher « Masquer cron »", en: "Show “Hide cron”" } },
                            {
                                key: "filters.cronFilterTarget",
                                type: "select",
                                advanced: true,
                                label: { fr: "Ce que « Masquer cron » filtre", en: "What “Hide cron” filters" },
                                options: [
                                    { value: "interface", label: { fr: "Interface CRON (comportement historique)", en: "CRON interface (historical behavior)" } },
                                    { value: "module", label: { fr: "Module CRONJOBS", en: "CRONJOBS module" } }
                                ]
                            },
                            {
                                key: "filters.moduleButtons",
                                type: "repeater",
                                label: { fr: "Boutons de modules", en: "Module buttons" },
                                addLabel: { fr: "Ajouter un module", en: "Add module" },
                                emptyLabel: { fr: "Aucun filtre de module.", en: "No module filter." },
                                reorder: true,
                                newItem: newModuleFilter,
                                itemTitle: function (item, index, lang) {
                                    const label = lang === "en" ? clean(item && item.labelEn) : clean(item && item.labelFr);
                                    return label || clean(item && item.code) || ((lang === "en" ? "Module " : "Module ") + (index + 1));
                                },
                                fields: [
                                    { key: "enabled", type: "boolean", label: { fr: "Actif", en: "Enabled" } },
                                    { key: "code", type: "text", label: { fr: "Code Koha", en: "Koha code" }, help: { fr: "Ex. CATALOGUING, MEMBERS, HOLDS.", en: "E.g. CATALOGUING, MEMBERS, HOLDS." } },
                                    { key: "labelFr", type: "text", label: { fr: "Libellé FR (vide = libellé Koha)", en: "French label (blank = Koha label)" } },
                                    { key: "labelEn", type: "text", label: { fr: "Libellé EN (vide = libellé Koha)", en: "English label (blank = Koha label)" } }
                                ]
                            },
                            {
                                key: "filters.actionButtons",
                                type: "repeater",
                                label: { fr: "Boutons d’actions", en: "Action buttons" },
                                addLabel: { fr: "Ajouter un filtre d’action", en: "Add action filter" },
                                emptyLabel: { fr: "Aucun filtre d’action.", en: "No action filter." },
                                reorder: true,
                                newItem: newActionFilter,
                                itemTitle: function (item, index, lang) {
                                    const label = lang === "en" ? clean(item && item.labelEn) : clean(item && item.labelFr);
                                    return label || clean(item && item.codes) || ((lang === "en" ? "Action " : "Action ") + (index + 1));
                                },
                                fields: [
                                    { key: "enabled", type: "boolean", label: { fr: "Actif", en: "Enabled" } },
                                    { key: "codes", type: "text", label: { fr: "Codes Koha", en: "Koha codes" }, help: { fr: "Séparer plusieurs codes par |. Ex. ADD|CREATE.", en: "Separate multiple codes with |. E.g. ADD|CREATE." } },
                                    { key: "labelFr", type: "text", label: { fr: "Libellé FR", en: "French label" } },
                                    { key: "labelEn", type: "text", label: { fr: "Libellé EN", en: "English label" } }
                                ]
                            }
                        ]
                    },
                    {
                        type: "section",
                        id: "legacy",
                        label: { fr: "Compatibilité avec les anciens logs", en: "Legacy log compatibility" },
                        description: {
                            fr: "Ces fonctions ne s’activent que lorsque Koha n’a pas déjà fourni un rendu structuré ou un Diff natif.",
                            en: "These functions activate only when Koha has not already supplied structured rendering or a native Diff."
                        },
                        fields: [
                            { key: "legacy.enabled", type: "boolean", label: { fr: "Activer les fallbacks historiques", en: "Enable historical fallbacks" } },
                            { key: "legacy.parsePerlDump", type: "boolean", label: { fr: "Structurer les anciens dumps $VAR1", en: "Structure old $VAR1 dumps" } },
                            { key: "legacy.parseMarcBeforeAfter", type: "boolean", label: { fr: "Comparer les anciens blocs MARC BEFORE/AFTER", en: "Compare old MARC BEFORE/AFTER blocks" } },
                            { key: "legacy.hideRawWhenEnhanced", type: "boolean", label: { fr: "Masquer le texte brut lorsqu’un fallback lisible est disponible", en: "Hide raw text when a readable fallback is available" } },
                            { key: "legacy.minMarcTags", type: "number", advanced: true, min: 2, max: 100, label: { fr: "Nombre minimal de tags MARC pour reconnaître un bloc", en: "Minimum MARC tags to recognize a block" } }
                        ]
                    },
                    {
                        type: "section",
                        id: "colors",
                        label: { fr: "Couleurs", en: "Colors" },
                        description: {
                            fr: "Valeurs par défaut identiques au 101 historique.",
                            en: "Default values match the historical 101."
                        },
                        fields: [
                            { key: "colors.rowAdd", type: "color", label: { fr: "Ligne — ajout", en: "Row — add" } },
                            { key: "colors.rowDelete", type: "color", label: { fr: "Ligne — suppression", en: "Row — delete" } },
                            { key: "colors.rowModify", type: "color", label: { fr: "Ligne — modification", en: "Row — modify" } },
                            { key: "colors.rowCreate", type: "color", label: { fr: "Ligne — création", en: "Row — create" } },
                            { key: "colors.rowIssue", type: "color", label: { fr: "Ligne — prêt/renouvellement", en: "Row — checkout/renewal" } },
                            { key: "colors.rowReturn", type: "color", label: { fr: "Ligne — retour", en: "Row — check-in" } },
                            { key: "colors.rowCron", type: "color", label: { fr: "Ligne — cron", en: "Row — cron" } },
                            { key: "colors.rowCancel", type: "color", label: { fr: "Ligne — annulation/suspension", en: "Row — cancel/suspend" } },

                            { key: "colors.badgeAdd", type: "color", advanced: true, label: { fr: "Badge — ajout", en: "Badge — add" } },
                            { key: "colors.badgeDelete", type: "color", advanced: true, label: { fr: "Badge — suppression", en: "Badge — delete" } },
                            { key: "colors.badgeModify", type: "color", advanced: true, label: { fr: "Badge — modification", en: "Badge — modify" } },
                            { key: "colors.badgeCreate", type: "color", advanced: true, label: { fr: "Badge — création", en: "Badge — create" } },
                            { key: "colors.badgeIssue", type: "color", advanced: true, label: { fr: "Badge — prêt", en: "Badge — checkout" } },
                            { key: "colors.badgeReturn", type: "color", advanced: true, label: { fr: "Badge — retour", en: "Badge — check-in" } },
                            { key: "colors.badgeCron", type: "color", advanced: true, label: { fr: "Badge — cron", en: "Badge — cron" } },
                            { key: "colors.badgeCancel", type: "color", advanced: true, label: { fr: "Badge — annulation", en: "Badge — cancel" } }
                        ]
                    },
                    {
                        type: "section",
                        id: "modules",
                        label: { fr: "Couleurs des modules", en: "Module colors" },
                        fields: [
                            {
                                key: "moduleStyles",
                                type: "repeater",
                                label: { fr: "Styles des modules", en: "Module styles" },
                                addLabel: { fr: "Ajouter un module", en: "Add module" },
                                emptyLabel: { fr: "Aucun style spécifique.", en: "No specific style." },
                                reorder: true,
                                newItem: newModuleStyle,
                                itemTitle: function (item, index) {
                                    return clean(item && item.code) || ("Module " + (index + 1));
                                },
                                fields: [
                                    { key: "code", type: "text", label: { fr: "Code Koha", en: "Koha code" } },
                                    { key: "bg", type: "color", label: { fr: "Fond", en: "Background" } },
                                    { key: "fg", type: "color", label: { fr: "Texte / bordure", en: "Text / border" } }
                                ]
                            }
                        ]
                    },
                    {
                        type: "section",
                        id: "behavior",
                        label: { fr: "Compatibilité technique", en: "Technical compatibility" },
                        fields: [
                            { key: "behavior.observeMutations", type: "boolean", label: { fr: "Suivre les reconstructions du tableau", en: "Watch table rebuilds" } },
                            { key: "behavior.initDelayMs", type: "number", advanced: true, min: 0, max: 5000, label: { fr: "Délai initial (ms)", en: "Initial delay (ms)" } },
                            { key: "behavior.retryDelayMs", type: "number", advanced: true, min: 50, max: 3000, label: { fr: "Délai entre tentatives (ms)", en: "Retry delay (ms)" } },
                            { key: "behavior.retryCount", type: "number", advanced: true, min: 1, max: 100, label: { fr: "Nombre maximal de tentatives", en: "Maximum retry count" } }
                        ]
                    }
                ],
                focusContext: function (main, context) {
                    if (!main) return;
                    const wanted = context && context.sectionId ? context.sectionId : "presentation";
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

    function onTargetPage() {
        return (window.location.pathname || "").indexOf("/tools/viewlog.pl") !== -1;
    }

    function cssVars(config) {
        const c = config.colors;
        return [
            "--pmk101-row-add:" + c.rowAdd,
            "--pmk101-row-delete:" + c.rowDelete,
            "--pmk101-row-modify:" + c.rowModify,
            "--pmk101-row-create:" + c.rowCreate,
            "--pmk101-row-issue:" + c.rowIssue,
            "--pmk101-row-return:" + c.rowReturn,
            "--pmk101-row-cron:" + c.rowCron,
            "--pmk101-row-cancel:" + c.rowCancel,

            "--pmk101-badge-add:" + c.badgeAdd,
            "--pmk101-badge-delete:" + c.badgeDelete,
            "--pmk101-badge-modify:" + c.badgeModify,
            "--pmk101-badge-create:" + c.badgeCreate,
            "--pmk101-badge-issue:" + c.badgeIssue,
            "--pmk101-badge-return:" + c.badgeReturn,
            "--pmk101-badge-cron:" + c.badgeCron,
            "--pmk101-badge-cancel:" + c.badgeCancel
        ].join(";");
    }

    function ensureStyle(config) {
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement("style");
            style.id = STYLE_ID;
            document.head.appendChild(style);
        }

        style.textContent = [
            ":root{" + cssVars(config) + "}",
            "#logst tbody tr.pmk101-row-add{background-color:var(--pmk101-row-add)!important}",
            "#logst tbody tr.pmk101-row-delete{background-color:var(--pmk101-row-delete)!important}",
            "#logst tbody tr.pmk101-row-modify{background-color:var(--pmk101-row-modify)!important}",
            "#logst tbody tr.pmk101-row-create{background-color:var(--pmk101-row-create)!important}",
            "#logst tbody tr.pmk101-row-issue{background-color:var(--pmk101-row-issue)!important}",
            "#logst tbody tr.pmk101-row-return{background-color:var(--pmk101-row-return)!important}",
            "#logst tbody tr.pmk101-row-cron{background-color:var(--pmk101-row-cron)!important}",
            "#logst tbody tr.pmk101-row-cancel{background-color:var(--pmk101-row-cancel)!important}",
            "#logst tbody tr[class*='pmk101-row-']:hover{filter:brightness(.96)}",

            ".pmk101-action-badge,.pmk101-module-badge{display:inline-flex;align-items:center;max-width:100%;padding:.16rem .48rem;border-radius:.28rem;font-size:.82em;font-weight:650;line-height:1.25;white-space:normal}",
            ".pmk101-action-badge{color:#fff;border:1px solid transparent}",
            ".pmk101-action-add{background:var(--pmk101-badge-add)}",
            ".pmk101-action-delete{background:var(--pmk101-badge-delete)}",
            ".pmk101-action-modify{background:var(--pmk101-badge-modify)}",
            ".pmk101-action-create{background:var(--pmk101-badge-create)}",
            ".pmk101-action-issue{background:var(--pmk101-badge-issue)}",
            ".pmk101-action-return{background:var(--pmk101-badge-return)}",
            ".pmk101-action-cron{background:var(--pmk101-badge-cron)}",
            ".pmk101-action-cancel{background:var(--pmk101-badge-cancel)}",

            ".pmk101-info-compact{max-width:420px}",
".pmk101-plain-info{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,\"Liberation Mono\",monospace;font-size:.82em;background:#f8f9fa;padding:.2rem .45rem;border:1px solid #dee2e6;border-radius:.25rem;white-space:pre-wrap;word-break:break-word}",
            ".pmk101-legacy-raw-hidden>.pmk101-native-raw{display:none}",
            ".pmk101-legacy-helper{margin-top:.35rem}",
            ".pmk101-legacy-actions{display:flex;gap:.35rem;flex-wrap:wrap;margin:.25rem 0}",
            ".pmk101-toggle{font-size:.78em;padding:.12rem .45rem;border:1px solid #adb5bd;border-radius:.25rem;background:var(--bs-body-bg,#fff);color:inherit;cursor:pointer}",
            ".pmk101-toggle:hover{background:rgba(0,0,0,.05)}",
            ".pmk101-chips{display:flex;flex-wrap:wrap;gap:.25rem;margin:.25rem 0}",
            ".pmk101-chip{background:#e9ecef;padding:.08rem .38rem;border-radius:.22rem;font-size:.8em;line-height:1.65}",
            ".pmk101-detail-table{font-size:.82em;border-collapse:collapse;width:100%;margin-top:.35rem}",
            ".pmk101-detail-table td{padding:.15rem .45rem;border-bottom:1px solid #eee;vertical-align:top}",
            ".pmk101-detail-table td:first-child{color:#6c757d;white-space:nowrap;font-weight:600;width:1%}",
            ".pmk101-raw{font-size:.78em;margin-top:.3rem;padding:.35rem .5rem;background:#f8f9fa;border:1px solid #dee2e6;border-radius:.25rem;max-height:180px;overflow:auto;white-space:pre-wrap;word-break:break-word}",
            ".pmk101-marc{border:1px solid #d7dde4;border-radius:.45rem;background:#fcfdff;overflow:hidden;margin-top:.35rem}",
            ".pmk101-marc-head{display:flex;justify-content:space-between;gap:.5rem;padding:.4rem .55rem;background:#f4f7fb;border-bottom:1px solid #e5e9ef;font-size:.82em}",
            ".pmk101-marc-title{font-weight:700}",
            ".pmk101-marc-stats{color:#64748b}",
            ".pmk101-marc-compare{display:grid;grid-template-columns:64px 1fr 1fr}",
            ".pmk101-marc-compare>div{padding:.35rem .48rem;border-top:1px dotted #edf2f7;min-width:0;word-break:break-word}",
            ".pmk101-marc-compare .pmk101-tag{font-weight:700;color:#1d4ed8}",
            ".pmk101-diff-added{background:#e8f8ec}",
            ".pmk101-diff-removed{background:#fdecee}",
            ".pmk101-diff-changed{background:#fff9e7}",
            ".pmk101-marc-colhead{font-size:.78em;font-weight:700;color:#475569;background:#f8fafc;border-top:0!important}",

            "#" + TOOLBAR_ID + "{margin:.5rem 0 .65rem;padding:.5rem .65rem;background:rgba(0,0,0,.025);border:1px solid #dee2e6;border-radius:.35rem;display:flex;flex-wrap:wrap;gap:.28rem;align-items:center}",
            "#" + TOOLBAR_ID + " .pmk101-lbl{font-size:.8em;font-weight:700;color:#6c757d;margin-right:.08rem}",
            "#" + TOOLBAR_ID + " .pmk101-sep{border-left:1px solid #ced4da;height:1.15rem;margin:0 .25rem}",
            "#" + TOOLBAR_ID + " button{font-size:.8em;padding:.17rem .5rem}",
            "#" + TOOLBAR_ID + " button.pmk101-active{background:#343a40;color:#fff;border-color:#343a40}",
            "@media(max-width:768px){#"+TOOLBAR_ID+"{align-items:stretch}.pmk101-marc-compare{grid-template-columns:48px 1fr 1fr}.pmk101-info-compact{max-width:none}}"
        ].join("\n");
    }

    function nativeModuleLabel(code) {
        const c = normalizeCode(code);
        try {
            if (window.module_labels && window.module_labels[c]) {
                const tmp = document.createElement("div");
                tmp.innerHTML = String(window.module_labels[c]);
                return clean(tmp.textContent) || c;
            }
        } catch (_) {}
        return "";
    }

    function nativeActionLabel(code) {
        const c = clean(code);
        try {
            if (window.action_labels) {
                if (window.action_labels[c]) {
                    const tmp = document.createElement("div");
                    tmp.innerHTML = String(window.action_labels[c]);
                    return clean(tmp.textContent) || c;
                }
                const upper = normalizeCode(c);
                if (window.action_labels[upper]) {
                    const tmp2 = document.createElement("div");
                    tmp2.innerHTML = String(window.action_labels[upper]);
                    return clean(tmp2.textContent) || upper;
                }
            }
        } catch (_) {}
        return "";
    }

    function reverseLookupLabel(mapObject, visibleText) {
        if (!mapObject || typeof mapObject !== "object") return "";
        const wanted = normalizeText(visibleText);
        const keys = Object.keys(mapObject);
        for (let i = 0; i < keys.length; i += 1) {
            const tmp = document.createElement("div");
            tmp.innerHTML = String(mapObject[keys[i]]);
            if (normalizeText(tmp.textContent) === wanted) return keys[i];
        }
        return "";
    }

    function inferModuleCode(visibleText) {
        try {
            const code = reverseLookupLabel(window.module_labels, visibleText);
            if (code) return normalizeCode(code);
        } catch (_) {}
        return LEGACY_MODULE_LABELS[normalizeText(visibleText)] || normalizeCode(visibleText);
    }

    function inferActionCode(visibleText) {
        try {
            const code = reverseLookupLabel(window.action_labels, visibleText);
            if (code) return clean(code);
        } catch (_) {}
        return LEGACY_ACTION_LABELS[normalizeText(visibleText)] || clean(visibleText);
    }

    function getDT() {
        try {
            if (
                window.jQuery &&
                window.jQuery.fn &&
                window.jQuery.fn.dataTable &&
                window.jQuery.fn.dataTable.isDataTable("#logst")
            ) {
                return window.jQuery("#logst").DataTable();
            }
        } catch (_) {}
        return null;
    }

    function columnIndexByData(dt, key, fallback) {
        try {
            if (dt && dt.settings) {
                const settings = dt.settings()[0];
                const columns = settings && settings.aoColumns ? settings.aoColumns : [];
                for (let i = 0; i < columns.length; i += 1) {
                    const dataKey = columns[i].mData != null ? columns[i].mData : columns[i].data;
                    if (dataKey === key) return i;
                }
            }
        } catch (_) {}

        const table = document.querySelector("#logst");
        if (table) {
            const headers = Array.from(table.querySelectorAll("thead th"));
            const aliases = {
                module: ["module"],
                action: ["action"],
                info: ["info"],
                interface: ["interface"],
                diff: ["diff"]
            };
            for (let i = 0; i < headers.length; i += 1) {
                const dataColname = clean(headers[i].getAttribute("data-colname")).toLowerCase();
                if (dataColname === key) return i;
                const text = normalizeText(headers[i].textContent);
                if ((aliases[key] || []).some(function (a) { return text === a; })) return i;
            }
        }
        return fallback;
    }

    function rowData(dt, row) {
        try {
            if (dt) return dt.row(row).data() || null;
        } catch (_) {}
        return null;
    }

    function unwrapGenerated(root) {
        const scope = root || document;
        Array.from(scope.querySelectorAll("[" + GENERATED_ATTR + "='badge']")).forEach(function (node) {
            const parent = node.parentNode;
            if (!parent) return;
            while (node.firstChild) parent.insertBefore(node.firstChild, node);
            parent.removeChild(node);
        });
        Array.from(scope.querySelectorAll("[" + GENERATED_ATTR + "='legacy']")).forEach(function (node) {
            try { node.remove(); } catch (_) {
                if (node.parentNode) node.parentNode.removeChild(node);
            }
        });
        Array.from(scope.querySelectorAll(".pmk101-native-raw")).forEach(function (node) {
            node.classList.remove("pmk101-native-raw");
            node.style.display = "";
        });
        Array.from(scope.querySelectorAll(".pmk101-legacy-raw-hidden")).forEach(function (node) {
            node.classList.remove("pmk101-legacy-raw-hidden");
        });
        Array.from(scope.querySelectorAll(".pmk101-info-compact")).forEach(function (node) {
            node.classList.remove("pmk101-info-compact");
        });
        Array.from(scope.querySelectorAll(".pmk101-plain-info")).forEach(function (node) {
            node.classList.remove("pmk101-plain-info");
        });
        Array.from(scope.querySelectorAll("#logst tbody tr")).forEach(function (row) {
            [
                "pmk101-row-add", "pmk101-row-delete", "pmk101-row-modify", "pmk101-row-create",
                "pmk101-row-issue", "pmk101-row-return", "pmk101-row-cron", "pmk101-row-cancel",
                "pmk101-enhanced"
            ].forEach(function (cls) { row.classList.remove(cls); });
        });
    }

    function wrapCellBadge(cell, className, style) {
        if (!cell || cell.querySelector("[" + GENERATED_ATTR + "='badge']")) return;
        const span = document.createElement("span");
        span.setAttribute(GENERATED_ATTR, "badge");
        span.className = className;
        if (style) {
            if (style.background) span.style.background = style.background;
            if (style.color) span.style.color = style.color;
            if (style.borderColor) span.style.borderColor = style.borderColor;
        }
        while (cell.firstChild) span.appendChild(cell.firstChild);
        cell.appendChild(span);
    }

    function moduleStyleFor(code, config) {
        const wanted = normalizeCode(code);
        for (let i = 0; i < config.moduleStyles.length; i += 1) {
            if (normalizeCode(config.moduleStyles[i].code) === wanted) return config.moduleStyles[i];
        }
        return null;
    }

    function actionStyleKey(code) {
        const raw = clean(code);
        return ACTION_STYLE_KEY[raw] || ACTION_STYLE_KEY[normalizeCode(raw)] || "";
    }

    function enhanceRow(row, dt, config) {
        if (!row || !config.enabled) return;
        const cells = row.querySelectorAll("td");
        if (!cells.length) return;

        const moduleIndex = columnIndexByData(dt, "module", 2);
        const actionIndex = columnIndexByData(dt, "action", 3);
        const infoIndex = columnIndexByData(dt, "info", 5);
        const diffIndex = columnIndexByData(dt, "diff", 7);

        const data = rowData(dt, row);
        const moduleCell = cells[moduleIndex];
        const actionCell = cells[actionIndex];
        const infoCell = cells[infoIndex];
        const diffCell = cells[diffIndex];

        const moduleCode = data && data.module != null
            ? normalizeCode(data.module)
            : inferModuleCode(moduleCell ? moduleCell.textContent : "");
        const actionCode = data && data.action != null
            ? clean(data.action)
            : inferActionCode(actionCell ? actionCell.textContent : "");
        const styleKey = actionStyleKey(actionCode);

        if (config.presentation.colorRows && styleKey) {
            row.classList.add("pmk101-row-" + styleKey);
        }

        if (config.presentation.actionBadges && actionCell && styleKey) {
            wrapCellBadge(actionCell, "pmk101-action-badge pmk101-action-" + styleKey);
        }

        if (config.presentation.moduleBadges && moduleCell && moduleCode) {
            const moduleStyle = moduleStyleFor(moduleCode, config);
            if (moduleStyle) {
                wrapCellBadge(moduleCell, "pmk101-module-badge", {
                    background: moduleStyle.bg,
                    color: moduleStyle.fg,
                    borderColor: moduleStyle.fg + config.colors.moduleBorderAlpha
                });
            }
        }

        if (config.presentation.compactInfo && infoCell) {
            const logInfo = infoCell.querySelector(".loginfo") || infoCell;
            logInfo.classList.add("pmk101-info-compact");
        }

        if (config.legacy.enabled && infoCell) {
            enhanceLegacyInfo(row, infoCell, diffCell, data, config);
        }

        row.classList.add("pmk101-enhanced");
    }

    function enhanceAllRows(config) {
        if (!onTargetPage()) return;
        const table = document.querySelector("#logst");
        if (!table) return;
        const dt = getDT();
        Array.from(table.querySelectorAll("tbody tr")).forEach(function (row) {
            // Les redraws remplacent souvent les lignes. Pour une ligne existante,
            // repartir proprement permet d'appliquer immédiatement une nouvelle config.
            if (row.classList.contains("pmk101-enhanced")) {
                unwrapGenerated(row);
            }
            enhanceRow(row, dt, config);
        });
    }

    function isNativeStructured(logInfo) {
        if (!logInfo) return false;
        return Boolean(
            logInfo.querySelector(
                ".loginfo-struct, .forced, .confirmed, .struct-diff, table.struct-diff"
            )
        );
    }

    function hasNativeDiff(row, diffCell, data) {
        if (data && clean(data.diff)) return true;
        if (!diffCell) return false;
        if (diffCell.querySelector(".struct-diff, table, ins, del")) return true;
        return clean(diffCell.textContent).length > 0;
    }

    function rawTextFromLogInfo(logInfo) {
        if (!logInfo) return "";
        const cloneNode = logInfo.cloneNode(true);
        Array.from(cloneNode.querySelectorAll("[" + GENERATED_ATTR + "]")).forEach(function (n) { n.remove(); });
        return clean(cloneNode.textContent);
    }

    function parsePerlDump(raw) {
        const out = {};
        const text = String(raw || "");
        const re = /['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?\s*=>\s*(?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)"|(undef|-?\d+(?:\.\d+)?))/g;
        let match;
        while ((match = re.exec(text))) {
            const key = match[1];
            let value = match[2] != null ? match[2] : (match[3] != null ? match[3] : match[4]);
            if (value === "undef") value = null;
            if (!(key in out)) out[key] = value;
        }
        return out;
    }

    function buildPerlHelper(raw, config) {
        const parsed = parsePerlDump(raw);
        const keys = Object.keys(parsed);
        if (!keys.length) return null;

        const wrap = document.createElement("div");
        wrap.className = "pmk101-legacy-helper";
        wrap.setAttribute(GENERATED_ATTR, "legacy");

        const chips = document.createElement("div");
        chips.className = "pmk101-chips";
        let hasChips = false;
        KEY_FIELDS.forEach(function (key) {
            if (!(key in parsed) || parsed[key] == null) return;
            hasChips = true;
            const chip = document.createElement("span");
            chip.className = "pmk101-chip";
            const b = document.createElement("b");
            b.textContent = key + ": ";
            chip.appendChild(b);
            chip.appendChild(document.createTextNode(String(parsed[key])));
            chips.appendChild(chip);
        });
        if (hasChips) wrap.appendChild(chips);

        const actions = document.createElement("div");
        actions.className = "pmk101-legacy-actions";

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "btn btn-default btn-xs pmk101-toggle";
        toggle.textContent = language() === "en" ? "▼ details" : "▼ détails";

        const rawBtn = document.createElement("button");
        rawBtn.type = "button";
        rawBtn.className = "btn btn-default btn-xs pmk101-toggle";
        rawBtn.textContent = language() === "en" ? "{ raw }" : "{ brut }";

        actions.appendChild(toggle);
        actions.appendChild(rawBtn);
        wrap.appendChild(actions);

        const detail = document.createElement("div");
        detail.style.display = "none";
        const table = document.createElement("table");
        table.className = "pmk101-detail-table";
        const tbody = document.createElement("tbody");
        keys.forEach(function (key) {
            if (parsed[key] == null) return;
            const tr = document.createElement("tr");
            const td1 = document.createElement("td");
            const td2 = document.createElement("td");
            td1.textContent = key;
            td2.textContent = String(parsed[key]);
            tr.appendChild(td1);
            tr.appendChild(td2);
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        detail.appendChild(table);
        wrap.appendChild(detail);

        const rawPre = document.createElement("pre");
        rawPre.className = "pmk101-raw";
        rawPre.textContent = raw;
        rawPre.style.display = "none";
        wrap.appendChild(rawPre);

        toggle.addEventListener("click", function () {
            const open = detail.style.display !== "none";
            detail.style.display = open ? "none" : "block";
            toggle.textContent = language() === "en"
                ? (open ? "▼ details" : "▲ collapse")
                : (open ? "▼ détails" : "▲ réduire");
        });

        rawBtn.addEventListener("click", function () {
            const open = rawPre.style.display !== "none";
            rawPre.style.display = open ? "none" : "block";
            rawBtn.textContent = language() === "en"
                ? (open ? "{ raw }" : "{ hide raw }")
                : (open ? "{ brut }" : "{ masquer brut }");
        });

        return wrap;
    }

    function extractBeforeAfterSections(raw) {
        const rawText = String(raw || "");
        const markerRe = /(BEFORE|AFTER)\s*=\s*>/ig;
        const markers = [];
        let match;

        while ((match = markerRe.exec(rawText)) !== null) {
            markers.push({
                type: match[1].toUpperCase(),
                start: match.index,
                contentStart: match.index + match[0].length
            });
        }

        const out = {
            contextLabel: "",
            beforeText: "",
            afterText: "",
            hasBefore: false,
            hasAfter: false
        };

        if (!markers.length) return out;

        out.contextLabel = clean(rawText.slice(0, markers[0].start));

        for (let i = 0; i < markers.length; i += 1) {
            const marker = markers[i];
            const chunkEnd = (i + 1 < markers.length) ? markers[i + 1].start : rawText.length;
            const chunk = clean(rawText.slice(marker.contentStart, chunkEnd));
            if (!chunk) continue;

            if (marker.type === "BEFORE") {
                out.hasBefore = true;
                out.beforeText += (out.beforeText ? "\n" : "") + chunk;
            } else {
                out.hasAfter = true;
                out.afterText += (out.afterText ? "\n" : "") + chunk;
            }
        }

        return out;
    }

    function parseMarcLines(text) {
        /*
         * Reprend volontairement la logique historique du 101 :
         * beaucoup d'anciens logs MARC ont été aplatis sur une seule ligne.
         * Une lecture strictement "une ligne = un champ" perdrait donc des tags.
         */
        const normalized = String(text || "").replace(/\s+/g, " ").trim();
        const out = [];
        const re = /(LDR|\d{3})\s([\s\S]*?)(?=(?:\s(?:LDR|\d{3})\s)|$)/g;
        let match;
        while ((match = re.exec(normalized)) !== null) {
            const tag = clean(match[1]).toUpperCase();
            const value = clean(match[2]);
            if (!tag || !value) continue;
            out.push({ tag: tag, value: value });
        }
        return out;
    }

    function countMarcTags(text) {
        const matches = String(text || "").match(/(?:\bLDR\b|\b\d{3}\b)\s/g);
        return matches ? matches.length : 0;
    }

    function groupMarc(rows) {
        const map = {};
        const order = [];
        rows.forEach(function (row) {
            if (!map[row.tag]) {
                map[row.tag] = [];
                order.push(row.tag);
            }
            map[row.tag].push(row.value);
        });
        return { map: map, order: order };
    }

    function buildMarcHelper(raw) {
        const sections = extractBeforeAfterSections(raw);
        let beforeRows = parseMarcLines(sections.beforeText);
        let afterRows = parseMarcLines(sections.afterText);

        if (!beforeRows.length && !afterRows.length) {
            const allRows = parseMarcLines(raw);
            if (!allRows.length) return null;
            afterRows = allRows;
        }

        const before = groupMarc(beforeRows);
        const after = groupMarc(afterRows);
        const order = before.order.slice();
        after.order.forEach(function (tag) {
            if (order.indexOf(tag) < 0) order.push(tag);
        });

        let changed = 0, added = 0, removed = 0, same = 0;

        const wrap = document.createElement("div");
        wrap.className = "pmk101-legacy-helper";
        wrap.setAttribute(GENERATED_ATTR, "legacy");

        const actions = document.createElement("div");
        actions.className = "pmk101-legacy-actions";

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "btn btn-default btn-xs pmk101-toggle";
        toggle.textContent = language() === "en" ? "▼ structured record" : "▼ notice structurée";

        const rawBtn = document.createElement("button");
        rawBtn.type = "button";
        rawBtn.className = "btn btn-default btn-xs pmk101-toggle";
        rawBtn.textContent = language() === "en" ? "{ raw }" : "{ brut }";

        actions.appendChild(toggle);
        actions.appendChild(rawBtn);
        wrap.appendChild(actions);

        const box = document.createElement("div");
        box.className = "pmk101-marc";
        box.style.display = "none";

        const head = document.createElement("div");
        head.className = "pmk101-marc-head";
        const title = document.createElement("div");
        title.className = "pmk101-marc-title";
        if (sections.contextLabel) {
            title.textContent = (language() === "en" ? "Record " : "Notice ") + sections.contextLabel;
        } else {
            title.textContent = language() === "en" ? "Structured MARC (legacy fallback)" : "MARC structuré (fallback historique)";
        }
        const stats = document.createElement("div");
        stats.className = "pmk101-marc-stats";
        head.appendChild(title);
        head.appendChild(stats);
        box.appendChild(head);

        const grid = document.createElement("div");
        grid.className = "pmk101-marc-compare";

        const hTag = document.createElement("div");
        hTag.className = "pmk101-marc-colhead";
        hTag.textContent = "Tag";
        const hBefore = document.createElement("div");
        hBefore.className = "pmk101-marc-colhead";
        hBefore.textContent = language() === "en" ? "Before" : "Avant";
        const hAfter = document.createElement("div");
        hAfter.className = "pmk101-marc-colhead";
        hAfter.textContent = language() === "en" ? "After / content" : "Après / contenu";
        grid.appendChild(hTag);
        grid.appendChild(hBefore);
        grid.appendChild(hAfter);

        order.forEach(function (tag) {
            const bArr = before.map[tag] || [];
            const aArr = after.map[tag] || [];
            const maxLen = Math.max(bArr.length, aArr.length);

            for (let i = 0; i < maxLen; i += 1) {
                const b = bArr[i];
                const a = aArr[i];

                const tagCell = document.createElement("div");
                tagCell.className = "pmk101-tag";
                tagCell.textContent = tag + (maxLen > 1 ? " #" + (i + 1) : "");

                const beforeCell = document.createElement("div");
                const afterCell = document.createElement("div");
                beforeCell.textContent = b || "—";
                afterCell.textContent = a || "—";

                if (!b && a) {
                    afterCell.classList.add("pmk101-diff-added");
                    added += 1;
                } else if (b && !a) {
                    beforeCell.classList.add("pmk101-diff-removed");
                    removed += 1;
                } else if (b === a) {
                    same += 1;
                } else {
                    beforeCell.classList.add("pmk101-diff-changed");
                    afterCell.classList.add("pmk101-diff-changed");
                    changed += 1;
                }

                grid.appendChild(tagCell);
                grid.appendChild(beforeCell);
                grid.appendChild(afterCell);
            }
        });

        stats.textContent = language() === "en"
            ? changed + " changed, " + added + " added, " + removed + " removed, " + same + " unchanged"
            : changed + " modifié(s), " + added + " ajouté(s), " + removed + " supprimé(s), " + same + " identique(s)";

        box.appendChild(grid);
        wrap.appendChild(box);

        const rawPre = document.createElement("pre");
        rawPre.className = "pmk101-raw";
        rawPre.textContent = raw;
        rawPre.style.display = "none";
        wrap.appendChild(rawPre);

        toggle.addEventListener("click", function () {
            const open = box.style.display !== "none";
            box.style.display = open ? "none" : "block";
            toggle.textContent = language() === "en"
                ? (open ? "▼ structured record" : "▲ collapse record")
                : (open ? "▼ notice structurée" : "▲ réduire la notice");
        });

        rawBtn.addEventListener("click", function () {
            const open = rawPre.style.display !== "none";
            rawPre.style.display = open ? "none" : "block";
            rawBtn.textContent = language() === "en"
                ? (open ? "{ raw }" : "{ hide raw }")
                : (open ? "{ brut }" : "{ masquer brut }");
        });

        return wrap;
    }

    function markRawNode(logInfo, config) {
        // On ne détruit jamais le nœud natif : on le marque seulement.
        logInfo.classList.add("pmk101-native-raw");
        if (config.legacy.hideRawWhenEnhanced) {
            logInfo.parentElement && logInfo.parentElement.classList.add("pmk101-legacy-raw-hidden");
        }
    }

    function enhanceLegacyInfo(row, infoCell, diffCell, data, config) {
        const logInfo = infoCell.querySelector(".loginfo");
        if (!logInfo) return;

        // Koha moderne a déjà fait le travail : on ne touche pas au contenu.
        if (isNativeStructured(logInfo)) return;

        const existingHelper = infoCell.querySelector("[" + GENERATED_ATTR + "='legacy']");
        if (existingHelper) return;

        const raw = data && data.info != null ? clean(data.info) : rawTextFromLogInfo(logInfo);
        if (!raw) return;

        if (config.legacy.parsePerlDump && raw.indexOf("$VAR1") !== -1) {
            const helper = buildPerlHelper(raw, config);
            if (helper) {
                markRawNode(logInfo, config);
                infoCell.appendChild(helper);
                return;
            }
        }

        if (
            config.legacy.parseMarcBeforeAfter &&
            !hasNativeDiff(row, diffCell, data) &&
            (
                /(?:BEFORE|AFTER)\s*=>/i.test(raw) ||
                countMarcTags(raw) >= config.legacy.minMarcTags
            )
        ) {
            const helper = buildMarcHelper(raw);
            if (helper) {
                markRawNode(logInfo, config);
                infoCell.appendChild(helper);
                return;
            }
        }

        // Ancien 101 : les informations textuelles simples étaient présentées
        // dans un bloc monospace. Ici on applique seulement une classe au
        // contenu natif, sans le vider ni le reconstruire.
        if (config.presentation.compactInfo) {
            logInfo.classList.add("pmk101-plain-info");
        }
    }

    function escapeRegex(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function codesRegex(codes) {
        const values = String(codes || "")
            .split("|")
            .map(function (v) { return clean(v); })
            .filter(Boolean)
            .map(escapeRegex);
        if (!values.length) return "";
        return "^(?:" + values.join("|") + ")$";
    }

    function applyColumnSearch(dt, dataKey, regex) {
        if (!dt) return;
        const idx = columnIndexByData(
            dt,
            dataKey,
            dataKey === "module" ? 2 :
            dataKey === "action" ? 3 :
            dataKey === "interface" ? 6 : -1
        );
        if (idx < 0) return;
        try {
            dt.column(idx).search(regex || "", true, false);
        } catch (_) {}
    }

    function currentToolbarState(toolbar) {
        if (!toolbar.__pmk101State) {
            toolbar.__pmk101State = {
                moduleCode: "",
                actionCodes: "",
                cronHidden: false
            };
        }
        return toolbar.__pmk101State;
    }

    function redrawWithFilters(toolbar, config) {
        const dt = getDT();
        if (!dt) return;
        const state = currentToolbarState(toolbar);

        applyColumnSearch(dt, "module", state.moduleCode ? codesRegex(state.moduleCode) : "");
        applyColumnSearch(dt, "action", state.actionCodes ? codesRegex(state.actionCodes) : "");

        if (config.filters.showCronToggle && state.cronHidden) {
            if (config.filters.cronFilterTarget === "module") {
                // Si un filtre de module est déjà actif, conserver ce filtre.
                if (!state.moduleCode) {
                    applyColumnSearch(dt, "module", "^(?!CRONJOBS$).*$");
                }
            } else {
                applyColumnSearch(dt, "interface", "^(?!cron$).*$");
            }
        } else if (config.filters.cronFilterTarget === "interface") {
            applyColumnSearch(dt, "interface", "");
        }

        try { dt.draw(); } catch (_) {}
    }

    function button(text, extraClass) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn-default btn-xs " + (extraClass || "");
        b.textContent = text;
        return b;
    }

    function sep(toolbar) {
        const s = document.createElement("span");
        s.className = "pmk101-sep";
        toolbar.appendChild(s);
    }

    function label(toolbar, text) {
        const s = document.createElement("span");
        s.className = "pmk101-lbl";
        s.textContent = text;
        toolbar.appendChild(s);
    }

    function removeToolbar() {
        const old = document.getElementById(TOOLBAR_ID);
        if (old) old.remove();
    }

    function buildToolbar(config) {
        removeToolbar();
        if (!config.enabled || !config.filters.enabled || !onTargetPage()) return;

        const table = document.querySelector("#logst");
        if (!table) return;

        const toolbar = document.createElement("div");
        toolbar.id = TOOLBAR_ID;
        toolbar.setAttribute(GENERATED_ATTR, "toolbar");

        const state = currentToolbarState(toolbar);
        const lang = language();

        label(toolbar, lang === "en" ? "Module:" : "Module :");

        const allModules = button(lang === "en" ? "All" : "Tous", "pmk101-module-filter pmk101-active");
        allModules.dataset.code = "";
        toolbar.appendChild(allModules);

        const moduleButtons = [allModules];
        config.filters.moduleButtons.filter(function (x) {
            return x.enabled && x.code;
        }).forEach(function (item) {
            const b = button(labelFor(item, item.code), "pmk101-module-filter");
            b.dataset.code = item.code;
            toolbar.appendChild(b);
            moduleButtons.push(b);
        });

        moduleButtons.forEach(function (b) {
            b.addEventListener("click", function () {
                moduleButtons.forEach(function (x) { x.classList.remove("pmk101-active"); });
                b.classList.add("pmk101-active");
                state.moduleCode = b.dataset.code || "";
                redrawWithFilters(toolbar, config);
            });
        });

        const activeActions = config.filters.actionButtons.filter(function (x) {
            return x.enabled && x.codes;
        });

        if (activeActions.length) {
            sep(toolbar);
            label(toolbar, lang === "en" ? "Action:" : "Action :");

            const actionButtons = [];
            activeActions.forEach(function (item) {
                const b = button(labelFor(item, item.codes), "pmk101-action-filter");
                b.dataset.codes = item.codes;
                toolbar.appendChild(b);
                actionButtons.push(b);
            });

            actionButtons.forEach(function (b) {
                b.addEventListener("click", function () {
                    const wasActive = b.classList.contains("pmk101-active");
                    actionButtons.forEach(function (x) { x.classList.remove("pmk101-active"); });
                    if (wasActive) {
                        state.actionCodes = "";
                    } else {
                        b.classList.add("pmk101-active");
                        state.actionCodes = b.dataset.codes || "";
                    }
                    redrawWithFilters(toolbar, config);
                });
            });
        }

        if (config.filters.showCronToggle) {
            sep(toolbar);
            label(toolbar, lang === "en" ? "Display:" : "Affichage :");
            const cron = button(lang === "en" ? "Hide cron" : "Masquer cron", "pmk101-cron-filter");
            toolbar.appendChild(cron);
            cron.addEventListener("click", function () {
                state.cronHidden = !state.cronHidden;
                cron.classList.toggle("pmk101-active", state.cronHidden);
                redrawWithFilters(toolbar, config);
            });
        }

        if (config.filters.showClearButton) {
            sep(toolbar);
            const clear = button(lang === "en" ? "Clear filters" : "Effacer les filtres", "pmk101-clear-filter");
            toolbar.appendChild(clear);
            clear.addEventListener("click", function () {
                state.moduleCode = "";
                state.actionCodes = "";
                state.cronHidden = false;
                Array.from(toolbar.querySelectorAll("button")).forEach(function (b) {
                    b.classList.remove("pmk101-active");
                });
                allModules.classList.add("pmk101-active");
                const dt = getDT();
                if (dt) {
                    applyColumnSearch(dt, "module", "");
                    applyColumnSearch(dt, "action", "");
                    applyColumnSearch(dt, "interface", "");
                    try { dt.draw(); } catch (_) {}
                }
            });
        }

        const wrapper = document.querySelector("#logst_wrapper");
        if (wrapper && wrapper.parentNode) {
            wrapper.parentNode.insertBefore(toolbar, wrapper);
        } else if (table.parentNode) {
            table.parentNode.insertBefore(toolbar, table);
        }
    }

    function detachTableEvents() {
        if (!window.jQuery || !boundTableNode) return;
        try {
            window.jQuery(boundTableNode).off(".pmk101");
        } catch (_) {}
        boundTableNode = null;
    }

    function bindTableEvents(config) {
        detachTableEvents();
        const table = document.querySelector("#logst");
        if (!table || !window.jQuery) return;
        boundTableNode = table;

        try {
            window.jQuery(table).on("draw.dt.pmk101", function () {
                window.setTimeout(function () {
                    enhanceAllRows(currentConfig);
                }, 0);
            });
            window.jQuery(table).on("init.dt.pmk101", function () {
                window.setTimeout(function () {
                    buildToolbar(currentConfig);
                    enhanceAllRows(currentConfig);
                    mountContextAccess();
                }, 0);
            });
        } catch (_) {}
    }

    function stopMutationObserver() {
        if (mutationObserver) {
            try { mutationObserver.disconnect(); } catch (_) {}
            mutationObserver = null;
        }
    }

    function startMutationObserver(config) {
        stopMutationObserver();
        if (!config.behavior.observeMutations) return;
        const table = document.querySelector("#logst");
        if (!table) return;

        mutationObserver = new MutationObserver(function (mutations) {
            const relevant = mutations.some(function (mutation) {
                return Array.from(mutation.addedNodes || []).some(function (node) {
                    return node.nodeType === 1 && !(node.getAttribute && node.getAttribute(GENERATED_ATTR));
                });
            });
            if (!relevant) return;
            window.setTimeout(function () {
                enhanceAllRows(currentConfig);
            }, 0);
        });

        mutationObserver.observe(table, { childList: true, subtree: true });
    }

    function mountContextAccess() {
        const api = pmkApi();
        if (!api || typeof api.mountContextButton !== "function") return;
        if (!onTargetPage()) return;
        const anchor = document.querySelector("#logst_wrapper, #logst");
        if (!anchor) return;
        try {
            api.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "before",
                contextKey: PAGE_ID,
                context: { sectionId: "presentation", pageId: PAGE_ID }
            });
        } catch (_) {}
    }

    function applyConfig(config) {
        currentConfig = normalizeConfig(config || DEFAULTS);

        removeToolbar();
        unwrapGenerated(document);
        stopMutationObserver();
        detachTableEvents();

        if (!onTargetPage()) return;
        if (!currentConfig.enabled || !currentConfig.pages.viewlog.enabled) return;

        ensureStyle(currentConfig);
        bindTableEvents(currentConfig);
        buildToolbar(currentConfig);
        enhanceAllRows(currentConfig);
        startMutationObserver(currentConfig);
        mountContextAccess();
    }

    function connectPmkConfig() {
        registerPmkDefinition();
        const api = pmkApi();
        if (!api || typeof api.getConfig !== "function") {
            applyConfig(DEFAULTS);
            return false;
        }

        api.getConfig(MODULE_ID)
            .then(function (config) { applyConfig(config || DEFAULTS); })
            .catch(function () { applyConfig(DEFAULTS); });

        if (!unsubscribe && typeof api.subscribe === "function") {
            try {
                unsubscribe = api.subscribe(MODULE_ID, function (config) {
                    applyConfig(config || DEFAULTS);
                });
            } catch (_) {}
        }
        return true;
    }

    function retryInit(config) {
        if (retryTimer) window.clearInterval(retryTimer);
        let tries = 0;

        retryTimer = window.setInterval(function () {
            tries += 1;

            if (!currentConfig.enabled || !currentConfig.pages.viewlog.enabled) {
                window.clearInterval(retryTimer);
                retryTimer = null;
                return;
            }

            const table = document.querySelector("#logst");
            if (table) {
                bindTableEvents(currentConfig);
                buildToolbar(currentConfig);
                enhanceAllRows(currentConfig);
                startMutationObserver(currentConfig);
                mountContextAccess();

                const dt = getDT();
                if (dt || table.querySelector("tbody tr") || tries >= config.behavior.retryCount) {
                    window.clearInterval(retryTimer);
                    retryTimer = null;
                }
            } else if (tries >= config.behavior.retryCount) {
                window.clearInterval(retryTimer);
                retryTimer = null;
            }
        }, config.behavior.retryDelayMs);
    }

    const publicApi = {
        version: MODULE_VERSION,
        moduleId: MODULE_ID,
        defaults: clone(DEFAULTS),
        normalizeConfig: normalizeConfig,
        validateConfig: validateConfig,
        refresh: function () {
            applyConfig(currentConfig);
        },
        enhanceAllRows: function () {
            enhanceAllRows(currentConfig);
        },
        parsePerlDump: parsePerlDump,
        parseMarcLines: parseMarcLines,
        nativeFirst: true
    };

    window.PMK101KohaLog = publicApi;

    function start() {
        if (started) return;
        started = true;

        if (!onTargetPage()) {
            registerPmkDefinition();
            return;
        }

        if (!connectPmkConfig()) {
            window.addEventListener("pmk:config-ready", function onReady() {
                window.removeEventListener("pmk:config-ready", onReady);
                connectPmkConfig();
            }, { once: true });
        }

        window.setTimeout(function () {
            applyConfig(currentConfig);
            retryInit(currentConfig);
        }, currentConfig.behavior.initDelayMs);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();

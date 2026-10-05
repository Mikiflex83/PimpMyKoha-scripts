/* ============================================================
   008-issuehistory-timeline.js
   Module fonctionnel : Historique de circulation
   Identifiant PMK     : loan-history-timeline
   Phase               : script isolé préparatoire à PimpMyKoha
   Version             : 3.0.0
   Date                : 2026-09-17

   Remplace l'ancien 008 D3 et prépare la convergence fonctionnelle
   avec 128-timeline-historiques-pret.js.

   Pages prises en charge :
   - /cgi-bin/koha/catalogue/issuehistory.pl
   - /cgi-bin/koha/members/readingrec.pl

   Principes :
   - aucune dépendance D3 ou CDN ;
   - conserve les tableaux Koha comme source et vue de référence ;
   - identification des colonnes par identité/labels FR+EN, jamais par
     position seule ;
   - enrichissements API facultatifs : la timeline reste utilisable si
     l'API est indisponible ;
   - configuration unique PMK, enregistrée sur toutes les pages Koha ;
   - libellés d'interface FR/EN entièrement personnalisables ;
   - rendu responsive intégré visuellement à Koha ;
   - idempotent, DataTables-aware et fail-safe ;
   - aucune trace console en production.

   Stockage :
   - configuration : window.PMKConfig si disponible ;
   - fallback : valeurs par défaut embarquées ;
   - Firestore reste géré uniquement par le socle PMK pré-plugin.
   ============================================================ */

(function () {
    "use strict";

    const GLOBAL_GUARD = "__PMK_008_LOAN_HISTORY_TIMELINE__";
    const MODULE_ID = "loan-history-timeline";
    const MODULE_VERSION = "3.0.1";
    const STYLE_ID = "pmk-008-loan-history-timeline-style";
    const PANEL_ID_BIBLIO = "pmk-lht-biblio-timeline";
    const PANEL_ID_READER = "pmk-lht-reader-timeline";
    const RETURN_INFO_CLASS = "pmk-lht-return-library";
    const LEGACY_128_GUARD = "__kohaCirculationTimelineLoaded";

    const PAGE_DEFINITIONS = {
        "catalogue.issuehistory": {
            id: "catalogue.issuehistory",
            path: "/cgi-bin/koha/catalogue/issuehistory.pl",
            tableSelector: "#table_issues",
            kind: "biblio"
        },
        "members.readingrec": {
            id: "members.readingrec",
            path: "/cgi-bin/koha/members/readingrec.pl",
            tableSelector: "#table_readingrec",
            kind: "reader"
        }
    };

    const DEFAULT_TEXTS = {
        panelTitleBiblio: {
            fr: "Parcours des exemplaires",
            en: "Item circulation history"
        },
        panelSubtitleBiblio: {
            fr: "Prêts, retours et événements connus sur une même échelle temporelle.",
            en: "Loans, returns and known item events on a shared timeline."
        },
        panelTitleReader: {
            fr: "Parcours des prêts du lecteur",
            en: "Patron loan history"
        },
        panelSubtitleReader: {
            fr: "Une lecture chronologique des emprunts, retours et renouvellements.",
            en: "A chronological view of checkouts, returns and renewals."
        },
        hide: { fr: "Masquer", en: "Hide" },
        show: { fr: "Afficher", en: "Show" },
        filterPlaceholder: {
            fr: "Filtrer par titre, code-barres ou site…",
            en: "Filter by title, barcode or library…"
        },
        clearFilter: { fr: "Effacer", en: "Clear" },
        rangeAuto: { fr: "Auto", en: "Auto" },
        range6m: { fr: "6 mois", en: "6 months" },
        range1y: { fr: "1 an", en: "1 year" },
        range3y: { fr: "3 ans", en: "3 years" },
        rangeAll: { fr: "Tout", en: "All" },
        legendCompleted: { fr: "prêt terminé", en: "completed loan" },
        legendCurrent: { fr: "prêt en cours", en: "current loan" },
        legendCross: { fr: "retour inter-sites", en: "returned at another library" },
        legendRenewal: { fr: "renouvellement", en: "renewal" },
        legendAcquisition: { fr: "acquisition", en: "acquisition" },
        legendTransfer: { fr: "transfert", en: "transfer" },
        legendLastSeen: { fr: "dernière activité", en: "last activity" },
        axisItem: { fr: "Exemplaire", en: "Item" },
        axisDocument: { fr: "Document", en: "Document" },
        summaryItemsBiblio: { fr: "exemplaire(s)", en: "item(s)" },
        summaryLoansBiblio: { fr: "prêt(s)", en: "loan(s)" },
        summaryLoansReader: { fr: "prêt(s) dans l’historique", en: "loan(s) in history" },
        summaryItemsReader: { fr: "exemplaire(s) différent(s)", en: "distinct item(s)" },
        summaryCurrent: { fr: "prêt(s) en cours", en: "current loan(s)" },
        summaryCross: { fr: "retour(s) inter-sites", en: "cross-library return(s)" },
        statusCurrent: { fr: "Prêt en cours", en: "Current loan" },
        statusCompleted: { fr: "Prêt terminé", en: "Completed loan" },
        tooltipCheckout: { fr: "Prêt", en: "Checkout" },
        tooltipCheckoutLibrary: { fr: "Site de prêt", en: "Checkout library" },
        tooltipReturn: { fr: "Retour", en: "Check-in" },
        tooltipReturnLibrary: { fr: "Site de retour", en: "Check-in library" },
        tooltipDuration: { fr: "Durée", en: "Duration" },
        tooltipRenewals: { fr: "Renouvellement(s)", en: "Renewal(s)" },
        tooltipLastRenewed: { fr: "Dernier renouvellement", en: "Last renewal" },
        tooltipCurrentReturn: { fr: "en cours", en: "current" },
        tooltipCrossWarning: { fr: "Retour dans un autre site", en: "Returned at another library" },
        returnLibraryLabel: { fr: "Lieu de retour", en: "Check-in library" },
        acquisitionEvent: { fr: "Acquisition / entrée dans Koha", en: "Acquisition / added to Koha" },
        lastSeenEvent: { fr: "Dernière activité connue", en: "Last known activity" },
        transferRequestedEvent: { fr: "Transfert demandé", en: "Transfer requested" },
        transferSentEvent: { fr: "Transfert envoyé", en: "Transfer sent" },
        transferArrivedEvent: { fr: "Transfert arrivé", en: "Transfer arrived" },
        transferCancelledEvent: { fr: "Transfert annulé", en: "Transfer cancelled" },
        eventDate: { fr: "Date", en: "Date" },
        eventLibrary: { fr: "Site", en: "Library" },
        eventReason: { fr: "Motif", en: "Reason" },
        emptyPeriod: { fr: "Aucun prêt sur cette période.", en: "No loans in this period." },
        emptyFilter: {
            fr: "Aucun prêt ne correspond au filtre sur cette période.",
            en: "No loans match the filter in this period."
        },
        limitNote: {
            fr: "Pour préserver la lisibilité, les {limit} prêts les plus récents sont affichés ({total} au total). Le tableau Koha reste complet.",
            en: "For readability, the {limit} most recent loans are displayed ({total} total). The Koha table remains complete."
        },
        itemPrefix: { fr: "Exemplaire", en: "Item" },
        daySingular: { fr: "jour", en: "day" },
        dayPlural: { fr: "jours", en: "days" },
        legacyBlocked: {
            fr: "Une autre timeline de circulation est déjà active sur cette page.",
            en: "Another circulation timeline is already active on this page."
        }
    };

    function textDefault(key, lang) {
        const entry = DEFAULT_TEXTS[key] || {};
        return entry[lang] || entry.fr || entry.en || key;
    }

    const DEFAULT_CONFIG = {
        enabled: true,
        language: "auto",

        issuehistoryEnabled: true,
        readingrecEnabled: true,
        issuehistoryPathInfo: "/cgi-bin/koha/catalogue/issuehistory.pl",
        readingrecPathInfo: "/cgi-bin/koha/members/readingrec.pl",

        defaultRange: "auto",
        maxReaderRows: 120,
        showSummary: true,
        showFilter: true,
        showLegend: true,
        showCollapseButton: true,
        showReturnLibraryInTable: true,
        showRenewals: true,
        highlightCrossLibraryReturns: true,
        hideNativeIssuehistoryTimeline: true,

        enrichWithApi: true,
        showAcquisition: true,
        showTransfers: false,
        showLastSeen: true,
        transferReportId: 0,

        primaryColor: "#2f78a8",
        crossLibraryColor: "#b26a16",
        renewalColor: "#6b4f9d",
        acquisitionColor: "#568132",
        transferColor: "#4b78a0",
        lastSeenColor: "#7a6597",
        cancelledColor: "#a24e47",

        panelTitleBiblioFr: textDefault("panelTitleBiblio", "fr"),
        panelTitleBiblioEn: textDefault("panelTitleBiblio", "en"),
        panelSubtitleBiblioFr: textDefault("panelSubtitleBiblio", "fr"),
        panelSubtitleBiblioEn: textDefault("panelSubtitleBiblio", "en"),
        panelTitleReaderFr: textDefault("panelTitleReader", "fr"),
        panelTitleReaderEn: textDefault("panelTitleReader", "en"),
        panelSubtitleReaderFr: textDefault("panelSubtitleReader", "fr"),
        panelSubtitleReaderEn: textDefault("panelSubtitleReader", "en"),

        hideLabelFr: textDefault("hide", "fr"),
        hideLabelEn: textDefault("hide", "en"),
        showLabelFr: textDefault("show", "fr"),
        showLabelEn: textDefault("show", "en"),
        filterPlaceholderFr: textDefault("filterPlaceholder", "fr"),
        filterPlaceholderEn: textDefault("filterPlaceholder", "en"),
        clearFilterLabelFr: textDefault("clearFilter", "fr"),
        clearFilterLabelEn: textDefault("clearFilter", "en"),

        rangeAutoLabelFr: textDefault("rangeAuto", "fr"),
        rangeAutoLabelEn: textDefault("rangeAuto", "en"),
        range6mLabelFr: textDefault("range6m", "fr"),
        range6mLabelEn: textDefault("range6m", "en"),
        range1yLabelFr: textDefault("range1y", "fr"),
        range1yLabelEn: textDefault("range1y", "en"),
        range3yLabelFr: textDefault("range3y", "fr"),
        range3yLabelEn: textDefault("range3y", "en"),
        rangeAllLabelFr: textDefault("rangeAll", "fr"),
        rangeAllLabelEn: textDefault("rangeAll", "en"),

        legendCompletedLabelFr: textDefault("legendCompleted", "fr"),
        legendCompletedLabelEn: textDefault("legendCompleted", "en"),
        legendCurrentLabelFr: textDefault("legendCurrent", "fr"),
        legendCurrentLabelEn: textDefault("legendCurrent", "en"),
        legendCrossLabelFr: textDefault("legendCross", "fr"),
        legendCrossLabelEn: textDefault("legendCross", "en"),
        legendRenewalLabelFr: textDefault("legendRenewal", "fr"),
        legendRenewalLabelEn: textDefault("legendRenewal", "en"),
        legendAcquisitionLabelFr: textDefault("legendAcquisition", "fr"),
        legendAcquisitionLabelEn: textDefault("legendAcquisition", "en"),
        legendTransferLabelFr: textDefault("legendTransfer", "fr"),
        legendTransferLabelEn: textDefault("legendTransfer", "en"),
        legendLastSeenLabelFr: textDefault("legendLastSeen", "fr"),
        legendLastSeenLabelEn: textDefault("legendLastSeen", "en"),

        axisItemLabelFr: textDefault("axisItem", "fr"),
        axisItemLabelEn: textDefault("axisItem", "en"),
        axisDocumentLabelFr: textDefault("axisDocument", "fr"),
        axisDocumentLabelEn: textDefault("axisDocument", "en"),

        summaryItemsBiblioLabelFr: textDefault("summaryItemsBiblio", "fr"),
        summaryItemsBiblioLabelEn: textDefault("summaryItemsBiblio", "en"),
        summaryLoansBiblioLabelFr: textDefault("summaryLoansBiblio", "fr"),
        summaryLoansBiblioLabelEn: textDefault("summaryLoansBiblio", "en"),
        summaryLoansReaderLabelFr: textDefault("summaryLoansReader", "fr"),
        summaryLoansReaderLabelEn: textDefault("summaryLoansReader", "en"),
        summaryItemsReaderLabelFr: textDefault("summaryItemsReader", "fr"),
        summaryItemsReaderLabelEn: textDefault("summaryItemsReader", "en"),
        summaryCurrentLabelFr: textDefault("summaryCurrent", "fr"),
        summaryCurrentLabelEn: textDefault("summaryCurrent", "en"),
        summaryCrossLabelFr: textDefault("summaryCross", "fr"),
        summaryCrossLabelEn: textDefault("summaryCross", "en"),

        statusCurrentLabelFr: textDefault("statusCurrent", "fr"),
        statusCurrentLabelEn: textDefault("statusCurrent", "en"),
        statusCompletedLabelFr: textDefault("statusCompleted", "fr"),
        statusCompletedLabelEn: textDefault("statusCompleted", "en"),
        tooltipCheckoutLabelFr: textDefault("tooltipCheckout", "fr"),
        tooltipCheckoutLabelEn: textDefault("tooltipCheckout", "en"),
        tooltipCheckoutLibraryLabelFr: textDefault("tooltipCheckoutLibrary", "fr"),
        tooltipCheckoutLibraryLabelEn: textDefault("tooltipCheckoutLibrary", "en"),
        tooltipReturnLabelFr: textDefault("tooltipReturn", "fr"),
        tooltipReturnLabelEn: textDefault("tooltipReturn", "en"),
        tooltipReturnLibraryLabelFr: textDefault("tooltipReturnLibrary", "fr"),
        tooltipReturnLibraryLabelEn: textDefault("tooltipReturnLibrary", "en"),
        tooltipDurationLabelFr: textDefault("tooltipDuration", "fr"),
        tooltipDurationLabelEn: textDefault("tooltipDuration", "en"),
        tooltipRenewalsLabelFr: textDefault("tooltipRenewals", "fr"),
        tooltipRenewalsLabelEn: textDefault("tooltipRenewals", "en"),
        tooltipLastRenewedLabelFr: textDefault("tooltipLastRenewed", "fr"),
        tooltipLastRenewedLabelEn: textDefault("tooltipLastRenewed", "en"),
        tooltipCurrentReturnLabelFr: textDefault("tooltipCurrentReturn", "fr"),
        tooltipCurrentReturnLabelEn: textDefault("tooltipCurrentReturn", "en"),
        tooltipCrossWarningLabelFr: textDefault("tooltipCrossWarning", "fr"),
        tooltipCrossWarningLabelEn: textDefault("tooltipCrossWarning", "en"),
        returnLibraryLabelFr: textDefault("returnLibraryLabel", "fr"),
        returnLibraryLabelEn: textDefault("returnLibraryLabel", "en"),

        acquisitionEventLabelFr: textDefault("acquisitionEvent", "fr"),
        acquisitionEventLabelEn: textDefault("acquisitionEvent", "en"),
        lastSeenEventLabelFr: textDefault("lastSeenEvent", "fr"),
        lastSeenEventLabelEn: textDefault("lastSeenEvent", "en"),
        transferRequestedEventLabelFr: textDefault("transferRequestedEvent", "fr"),
        transferRequestedEventLabelEn: textDefault("transferRequestedEvent", "en"),
        transferSentEventLabelFr: textDefault("transferSentEvent", "fr"),
        transferSentEventLabelEn: textDefault("transferSentEvent", "en"),
        transferArrivedEventLabelFr: textDefault("transferArrivedEvent", "fr"),
        transferArrivedEventLabelEn: textDefault("transferArrivedEvent", "en"),
        transferCancelledEventLabelFr: textDefault("transferCancelledEvent", "fr"),
        transferCancelledEventLabelEn: textDefault("transferCancelledEvent", "en"),
        eventDateLabelFr: textDefault("eventDate", "fr"),
        eventDateLabelEn: textDefault("eventDate", "en"),
        eventLibraryLabelFr: textDefault("eventLibrary", "fr"),
        eventLibraryLabelEn: textDefault("eventLibrary", "en"),
        eventReasonLabelFr: textDefault("eventReason", "fr"),
        eventReasonLabelEn: textDefault("eventReason", "en"),

        emptyPeriodLabelFr: textDefault("emptyPeriod", "fr"),
        emptyPeriodLabelEn: textDefault("emptyPeriod", "en"),
        emptyFilterLabelFr: textDefault("emptyFilter", "fr"),
        emptyFilterLabelEn: textDefault("emptyFilter", "en"),
        limitNoteLabelFr: textDefault("limitNote", "fr"),
        limitNoteLabelEn: textDefault("limitNote", "en"),
        itemPrefixLabelFr: textDefault("itemPrefix", "fr"),
        itemPrefixLabelEn: textDefault("itemPrefix", "en"),
        daySingularLabelFr: textDefault("daySingular", "fr"),
        daySingularLabelEn: textDefault("daySingular", "en"),
        dayPluralLabelFr: textDefault("dayPlural", "fr"),
        dayPluralLabelEn: textDefault("dayPlural", "en")
    };

    if (window[GLOBAL_GUARD]) return;

    const state = {
        config: null,
        page: null,
        table: null,
        rows: [],
        panel: null,
        tooltip: null,
        libraries: { byCode: new Map(), byName: new Map() },
        apiCheckouts: [],
        lifeByItem: new Map(),
        drawBound: false,
        refreshTimer: null,
        requestTail: Promise.resolve(),
        lastRequestEnd: 0,
        coreRegistered: false,
        coreStarted: false,
        fallbackStarted: false,
        unsubscribe: null,
        legacyGuardClaimed: false,
        blockedByExistingTimeline: false
    };

    window[GLOBAL_GUARD] = {
        id: MODULE_ID,
        version: MODULE_VERSION,
        initialized: false,
        runtime: null,
        destroy: destroyRuntime,
        refresh: scheduleRefresh
    };

    function deepClone(value) {
        return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }

    function isObject(value) {
        return value && typeof value === "object" && !Array.isArray(value);
    }

    function deepMerge(base, override) {
        if (Array.isArray(base)) return Array.isArray(override) ? deepClone(override) : deepClone(base);
        if (!isObject(base)) return override === undefined ? deepClone(base) : deepClone(override);
        const out = deepClone(base) || {};
        if (!isObject(override)) return out;
        Object.keys(override).forEach(function (key) {
            if (Array.isArray(override[key])) out[key] = deepClone(override[key]);
            else if (isObject(override[key]) && isObject(out[key])) out[key] = deepMerge(out[key], override[key]);
            else out[key] = deepClone(override[key]);
        });
        return out;
    }

    function normalizeText(value) {
        return String(value == null ? "" : value)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\u00a0/g, " ")
            .replace(/[\u200B-\u200D\uFEFF]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function cleanText(value) {
        return String(value == null ? "" : value)
            .replace(/\u00a0/g, " ")
            .replace(/[\u200B-\u200D\uFEFF]/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function detectPage() {
        const path = window.location.pathname || "";
        return Object.values(PAGE_DEFINITIONS).find(function (page) {
            return page.path === path;
        }) || null;
    }

    function detectLanguage(config) {
        const requested = String(config && config.language || "auto").toLowerCase();
        if (requested === "fr" || requested === "en") return requested;

        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            const coreLang = String(window.PMKConfig.getLanguage() || "").toLowerCase();
            if (coreLang.startsWith("en")) return "en";
            if (coreLang.startsWith("fr")) return "fr";
        }

        const htmlLang = String(document.documentElement.lang || "").toLowerCase();
        if (htmlLang.startsWith("en")) return "en";
        return "fr";
    }

    function cfgText(key) {
        const lang = detectLanguage(state.config || DEFAULT_CONFIG);
        const suffix = lang === "en" ? "En" : "Fr";
        const value = state.config && state.config[key + suffix];
        if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();

        const defaultValue = DEFAULT_CONFIG[key + suffix];
        if (defaultValue !== undefined && defaultValue !== null) return String(defaultValue);
        return key;
    }

    function replaceTokens(template, values) {
        return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, key) {
            return Object.prototype.hasOwnProperty.call(values || {}, key) ? String(values[key]) : "{" + key + "}";
        });
    }

    function isPageEnabled(config, page) {
        if (!config || config.enabled === false || !page) return false;
        if (page.id === "catalogue.issuehistory") return config.issuehistoryEnabled !== false;
        if (page.id === "members.readingrec") return config.readingrecEnabled !== false;
        return false;
    }

    function createEl(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined && text !== null) el.textContent = String(text);
        return el;
    }

    function parseKohaDate(value) {
        if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
        if (!value) return null;
        const raw = cleanText(value);
        if (!raw || /^(checked out|en cours|current)$/i.test(raw)) return null;

        let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
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

        match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
        if (match) {
            const date = new Date(
                Number(match[3]),
                Number(match[2]) - 1,
                Number(match[1]),
                Number(match[4] || 0),
                Number(match[5] || 0),
                Number(match[6] || 0)
            );
            return Number.isNaN(date.getTime()) ? null : date;
        }

        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function formatDateTime(date) {
        if (!date) return "—";
        const locale = detectLanguage(state.config) === "en" ? "en-GB" : "fr-FR";
        try {
            return new Intl.DateTimeFormat(locale, {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            }).format(date);
        } catch (_) {
            return date.toLocaleString();
        }
    }

    function formatAxisDate(date, rangeKey) {
        if (!date) return "";
        const locale = detectLanguage(state.config) === "en" ? "en-GB" : "fr-FR";
        const options = (rangeKey === "6m" || rangeKey === "1y")
            ? { month: "short", year: "2-digit" }
            : { month: "short", year: "numeric" };
        try {
            return new Intl.DateTimeFormat(locale, options).format(date).replace(".", "");
        } catch (_) {
            return date.toLocaleDateString();
        }
    }

    function daysBetween(start, end) {
        if (!start || !end) return null;
        return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
    }

    function durationText(days) {
        if (!Number.isFinite(days)) return "";
        const key = Math.abs(days) === 1 ? "daySingularLabel" : "dayPluralLabel";
        return days + " " + cfgText(key);
    }

    function getCellValue(cell) {
        if (!cell) return "";
        return cleanText(
            cell.dataset.order ||
            cell.getAttribute("data-sort") ||
            cell.getAttribute("data-order") ||
            cell.textContent ||
            ""
        );
    }

    const COLUMN_DEFS = {
        title: {
            technical: ["title", "biblio_title", "bibliographic_title"],
            aliases: ["titre", "title", "document", "bibliographic record"]
        },
        barcode: {
            technical: ["barcode", "external_id", "item_barcode"],
            aliases: ["code a barres", "code-barres", "barcode", "bar code"]
        },
        checkoutSite: {
            technical: ["checkout_library", "library", "library_id", "branch"],
            aliases: ["emprunte a", "emprunté à", "site de pret", "site de prêt", "checked out from", "checkout library", "library"]
        },
        checkoutDate: {
            technical: ["checkout_date", "issuedate", "issue_date"],
            aliases: ["emprunte le", "emprunté le", "date de pret", "date de prêt", "checked out on", "checkout date", "checkout"]
        },
        dueDate: {
            technical: ["due_date", "date_due", "duedate"],
            aliases: ["retour prevu", "retour prévu", "date de retour prevue", "date de retour prévue", "due date", "expected return"]
        },
        returnDate: {
            technical: ["checkin_date", "return_date", "returndate", "checkin_on"],
            aliases: ["retour effectif", "rendu le", "retourne le", "retourné le", "returned on", "check-in date", "checkin date", "actual return"]
        },
        renewals: {
            technical: ["renewals", "renewals_count", "renewed"],
            aliases: ["renouvele", "renouvelé", "nombre de renouvellements", "renewals", "renewed"]
        }
    };

    function headerIdentity(th) {
        const values = [
            th.dataset.colname,
            th.dataset.column,
            th.getAttribute("data-colname"),
            th.getAttribute("data-column"),
            th.getAttribute("name"),
            th.id,
            th.getAttribute("aria-label"),
            th.querySelector(".dt-column-title")?.textContent,
            th.textContent
        ].filter(Boolean).map(normalizeText);
        return values;
    }

    function resolveColumn(table, defKey) {
        const def = COLUMN_DEFS[defKey];
        if (!def) return -1;
        const technical = def.technical.map(normalizeText);
        const aliases = def.aliases.map(normalizeText);
        const headers = Array.from(table.querySelectorAll("thead tr:first-child th"));

        let index = headers.findIndex(function (th) {
            const identities = headerIdentity(th);
            return identities.some(function (identity) {
                return technical.some(function (key) {
                    return identity === key || identity.includes(key);
                });
            });
        });
        if (index >= 0) return index;

        index = headers.findIndex(function (th) {
            const identities = headerIdentity(th);
            return identities.some(function (identity) {
                return aliases.some(function (alias) {
                    return identity === alias || identity.startsWith(alias + ":") || identity.includes(alias);
                });
            });
        });
        return index;
    }

    function resolveColumns(table, page) {
        const columns = {
            title: page.kind === "reader" ? resolveColumn(table, "title") : -1,
            barcode: resolveColumn(table, "barcode"),
            checkoutSite: resolveColumn(table, "checkoutSite"),
            checkoutDate: resolveColumn(table, "checkoutDate"),
            dueDate: resolveColumn(table, "dueDate"),
            returnDate: resolveColumn(table, "returnDate"),
            renewals: resolveColumn(table, "renewals")
        };

        if (columns.barcode < 0 || columns.checkoutDate < 0 || columns.returnDate < 0) return null;
        if (page.kind === "reader" && columns.title < 0) return null;
        return columns;
    }

    function getItemnumber(row) {
        const link = row.querySelector('a[href*="itemnumber="], a[href*="item_id="]');
        if (!link) return null;
        try {
            const url = new URL(link.getAttribute("href"), window.location.origin);
            return url.searchParams.get("itemnumber") || url.searchParams.get("item_id");
        } catch (_) {
            return null;
        }
    }

    function getBiblioPageTitle() {
        const selectors = [
            "#catalogue_detail_biblio h1",
            "main h1",
            "#main_intranet-main h1",
            "h1"
        ];
        for (const selector of selectors) {
            const value = cleanText(document.querySelector(selector)?.textContent || "");
            if (value) return value;
        }
        return "";
    }

    function parseRows(table, page) {
        const columns = resolveColumns(table, page);
        if (!columns) return [];
        const rows = [];
        const pageTitle = page.kind === "biblio" ? getBiblioPageTitle() : "";

        table.querySelectorAll("tbody tr").forEach(function (tr, index) {
            const cells = tr.cells;
            if (!cells || !cells.length) return;
            const barcodeCell = cells[columns.barcode];
            const checkoutCell = cells[columns.checkoutDate];
            const returnCell = cells[columns.returnDate];
            if (!barcodeCell || !checkoutCell || !returnCell) return;

            const start = parseKohaDate(getCellValue(checkoutCell));
            if (!start) return;

            const end = parseKohaDate(getCellValue(returnCell));
            const current = !end;
            const itemId = getItemnumber(tr);
            const barcode = cleanText(barcodeCell.textContent) || itemId || String(index + 1);
            const title = page.kind === "reader"
                ? cleanText(cells[columns.title]?.querySelector(".biblio-title")?.textContent || cells[columns.title]?.textContent || "")
                : pageTitle;
            const checkoutSite = columns.checkoutSite >= 0 ? cleanText(cells[columns.checkoutSite]?.textContent || "") : "";
            const dueDate = columns.dueDate >= 0 ? parseKohaDate(getCellValue(cells[columns.dueDate])) : null;
            const renewalsRaw = columns.renewals >= 0 ? cleanText(cells[columns.renewals]?.textContent || "") : "";
            let renewalsCount = 0;
            if (/^\d+$/.test(renewalsRaw)) renewalsCount = Number(renewalsRaw);
            else if (/^(oui|yes|true)\b/i.test(renewalsRaw)) renewalsCount = 1;

            rows.push({
                rowElement: tr,
                returnCell: returnCell,
                itemId: itemId ? String(itemId) : null,
                barcode: barcode,
                title: title,
                checkoutSite: checkoutSite,
                checkoutSiteCode: null,
                returnSite: "",
                returnSiteCode: null,
                start: start,
                dueDate: dueDate,
                end: end,
                current: current,
                renewalsCount: renewalsCount,
                lastRenewedDate: null,
                apiCheckout: null
            });
        });

        return rows;
    }

    function waitForTable(selector, timeoutMs) {
        const timeout = Number.isFinite(timeoutMs) ? timeoutMs : 12000;
        return new Promise(function (resolve) {
            const start = Date.now();
            const find = function () {
                const table = document.querySelector(selector);
                if (!table) return null;
                const hasRows = Array.from(table.querySelectorAll("tbody tr")).some(function (row) {
                    return row.cells && row.cells.length > 1;
                });
                return hasRows ? table : null;
            };

            const immediate = find();
            if (immediate) {
                resolve(immediate);
                return;
            }

            const observer = new MutationObserver(function () {
                const found = find();
                if (found || Date.now() - start >= timeout) {
                    observer.disconnect();
                    resolve(found || document.querySelector(selector));
                }
            });

            observer.observe(document.documentElement, { childList: true, subtree: true });
            window.setTimeout(function () {
                observer.disconnect();
                resolve(find() || document.querySelector(selector));
            }, timeout);
        });
    }

    function queueRequest(task) {
        const MIN_GAP = 250;
        const job = state.requestTail.catch(function () {}).then(async function () {
            const wait = Math.max(0, MIN_GAP - (Date.now() - state.lastRequestEnd));
            if (wait) await new Promise(function (resolve) { window.setTimeout(resolve, wait); });
            try {
                return await task();
            } finally {
                state.lastRequestEnd = Date.now();
            }
        });
        state.requestTail = job.catch(function () {});
        return job;
    }

    async function fetchJson(url, options) {
        const opts = options || {};
        return queueRequest(async function () {
            const response = await fetch(url, {
                method: "GET",
                credentials: "same-origin",
                headers: Object.assign({ Accept: "application/json" }, opts.headers || {})
            });
            if (!response.ok) {
                const error = new Error("koha_api_error");
                error.status = response.status;
                throw error;
            }
            return { response: response, data: await response.json() };
        });
    }

    async function fetchPaged(baseUrl) {
        const output = [];
        const perPage = 100;
        let page = 1;
        while (page <= 100) {
            const url = new URL(baseUrl, window.location.origin);
            url.searchParams.set("_page", String(page));
            url.searchParams.set("_per_page", String(perPage));
            const result = await fetchJson(url.toString());
            if (!Array.isArray(result.data)) break;
            output.push.apply(output, result.data);
            const total = Number(result.response.headers.get("X-Total-Count") || 0);
            if ((total && output.length >= total) || result.data.length < perPage) break;
            page += 1;
        }
        return output;
    }

    async function loadLibraries() {
        try {
            const result = await fetchJson("/api/v1/public/libraries");
            const list = Array.isArray(result.data) ? result.data : [];
            const byCode = new Map();
            const byName = new Map();
            list.forEach(function (library) {
                if (!library || !library.library_id) return;
                const code = String(library.library_id);
                const name = library.name || code;
                byCode.set(code, name);
                byName.set(normalizeText(code), code);
                byName.set(normalizeText(name), code);
            });
            return { byCode: byCode, byName: byName };
        } catch (_) {
            return { byCode: new Map(), byName: new Map() };
        }
    }

    async function loadHistoricalCheckouts(page) {
        if (!state.config.enrichWithApi) return [];
        const params = new URLSearchParams(window.location.search);

        if (page.kind === "biblio") {
            const biblioId = params.get("biblionumber");
            if (!biblioId) return [];
            try {
                return await fetchPaged("/api/v1/biblios/" + encodeURIComponent(biblioId) + "/checkouts?checked_in=true");
            } catch (_) {
                return [];
            }
        }

        const patronId = params.get("borrowernumber");
        if (!patronId) return [];

        try {
            return await fetchPaged("/api/v1/checkouts?patron_id=" + encodeURIComponent(patronId) + "&checked_in=true");
        } catch (_) {
            try {
                return await fetchPaged("/api/v1/patrons/" + encodeURIComponent(patronId) + "/checkouts");
            } catch (_) {
                return [];
            }
        }
    }

    async function loadBiblioItems(page) {
        if (!state.config.enrichWithApi || page.kind !== "biblio") return [];
        if (!state.config.showAcquisition && !state.config.showLastSeen) return [];
        const biblioId = new URLSearchParams(window.location.search).get("biblionumber");
        if (!biblioId) return [];
        try {
            return await fetchPaged("/api/v1/public/biblios/" + encodeURIComponent(biblioId) + "/items");
        } catch (_) {
            return [];
        }
    }

    async function loadBiblioTransfers(page) {
        if (!state.config.enrichWithApi || page.kind !== "biblio") return [];
        if (!state.config.showTransfers) return [];
        const reportId = Number(state.config.transferReportId || 0);
        if (!Number.isInteger(reportId) || reportId <= 0) return [];

        const biblioId = new URLSearchParams(window.location.search).get("biblionumber");
        if (!biblioId) return [];
        const all = [];
        let cursor = 0;
        let lots = 0;

        try {
            while (lots < 200) {
                lots += 1;
                const url = new URL("/cgi-bin/koha/svc/report", window.location.origin);
                url.searchParams.set("id", String(reportId));
                url.searchParams.set("annotated", "1");
                url.searchParams.append("param_names", "Biblionumber");
                url.searchParams.append("sql_params", String(biblioId));
                url.searchParams.append("param_names", "Après ID");
                url.searchParams.append("sql_params", String(cursor));
                const result = await fetchJson(url.toString());
                if (!Array.isArray(result.data) || !result.data.length) break;
                all.push.apply(all, result.data);
                const last = Number(
                    result.data[result.data.length - 1].Transfer_ID ??
                    result.data[result.data.length - 1].transfer_id ??
                    0
                );
                if (!Number.isFinite(last) || last <= cursor) break;
                cursor = last;
                if (result.data.length < 500) break;
            }
        } catch (_) {
            return [];
        }
        return all;
    }

    function dateMs(value) {
        const date = value instanceof Date ? value : parseKohaDate(value);
        return date ? date.getTime() : null;
    }

    function matchCheckout(row, checkouts) {
        if (!row.itemId || !Array.isArray(checkouts) || !checkouts.length) return null;
        const sameItem = checkouts.filter(function (checkout) {
            return String(checkout && checkout.item_id) === String(row.itemId);
        });
        if (!sameItem.length) return null;

        const startMs = row.start.getTime();
        const endMs = row.end ? row.end.getTime() : null;
        return sameItem.map(function (checkout) {
            const apiStart = dateMs(checkout.checkout_date);
            const apiEnd = dateMs(checkout.checkin_date);
            let score = apiStart === null ? 1000000000 : Math.abs(apiStart - startMs);
            if (endMs !== null) score += apiEnd === null ? 1000000000 : Math.abs(apiEnd - endMs);
            return { checkout: checkout, score: score };
        }).sort(function (a, b) {
            return a.score - b.score;
        })[0].checkout;
    }

    function enrichRows(rows, checkouts, libraries) {
        rows.forEach(function (row) {
            if (row.checkoutSite) {
                row.checkoutSiteCode = libraries.byName.get(normalizeText(row.checkoutSite)) || null;
            }
            const checkout = matchCheckout(row, checkouts);
            if (!checkout) return;
            row.apiCheckout = checkout;

            if (checkout.checkin_library_id) {
                row.returnSiteCode = String(checkout.checkin_library_id);
                row.returnSite = libraries.byCode.get(row.returnSiteCode) || row.returnSiteCode;
            }
            if (!row.checkoutSiteCode && checkout.library_id) row.checkoutSiteCode = String(checkout.library_id);
            if (!row.checkoutSite && row.checkoutSiteCode) {
                row.checkoutSite = libraries.byCode.get(row.checkoutSiteCode) || row.checkoutSiteCode;
            }
            const apiRenewals = Number(checkout.renewals_count);
            if (Number.isFinite(apiRenewals)) row.renewalsCount = apiRenewals;
            row.lastRenewedDate = parseKohaDate(checkout.last_renewed_date);
        });
    }

    function itemValue(item) {
        const keys = Array.prototype.slice.call(arguments, 1);
        for (const key of keys) {
            if (item && item[key] !== undefined && item[key] !== null && item[key] !== "") return item[key];
        }
        return null;
    }

    function buildLifeByItem(items, transfers, libraries) {
        const map = new Map();
        (items || []).forEach(function (item) {
            const itemId = String(itemValue(item, "item_id", "itemnumber") || "");
            if (!itemId) return;
            map.set(itemId, {
                acquisition: parseKohaDate(itemValue(item, "acquisition_date", "dateaccessioned")),
                lastSeen: parseKohaDate(itemValue(item, "last_seen_date", "datelastseen")),
                homeCode: String(itemValue(item, "home_library_id", "homebranch") || ""),
                holdingCode: String(itemValue(item, "holding_library_id", "holdingbranch") || ""),
                points: []
            });
        });

        (transfers || []).forEach(function (transfer) {
            const itemId = String(transfer.Item_ID ?? transfer.item_id ?? transfer.itemnumber ?? "");
            if (!itemId) return;
            if (!map.has(itemId)) {
                map.set(itemId, { acquisition: null, lastSeen: null, homeCode: "", holdingCode: "", points: [] });
            }
            const target = map.get(itemId);
            const from = String(transfer.From_Site ?? transfer.from_site ?? transfer.frombranch ?? "");
            const to = String(transfer.To_Site ?? transfer.to_site ?? transfer.tobranch ?? "");
            const route = [from, to].filter(Boolean).map(function (code) {
                return libraries.byCode.get(code) || code;
            }).join(" → ");
            const reason = String(transfer.Raison ?? transfer.reason ?? "");
            const cancelledReason = String(transfer.Raison_annulation ?? transfer.cancellation_reason ?? "");

            function add(dateValue, type, labelKey, extra) {
                const date = parseKohaDate(dateValue);
                if (!date) return;
                target.points.push({
                    date: date,
                    type: type,
                    labelKey: labelKey,
                    site: route,
                    extra: extra || ""
                });
            }

            add(transfer.Demande_le ?? transfer.daterequested, "transfer", "transferRequestedEventLabel", reason);
            add(transfer.Envoye_le ?? transfer.datesent, "transfer", "transferSentEventLabel", reason);
            add(transfer.Arrive_le ?? transfer.datearrived, "transfer", "transferArrivedEventLabel", reason);
            add(transfer.Annule_le ?? transfer.datecancelled, "cancelled", "transferCancelledEventLabel", cancelledReason || reason);
        });

        map.forEach(function (life) {
            if (state.config.showAcquisition && life.acquisition) {
                const site = life.homeCode ? (libraries.byCode.get(life.homeCode) || life.homeCode) : "";
                life.points.push({ date: life.acquisition, type: "acquisition", labelKey: "acquisitionEventLabel", site: site, extra: "" });
            }
            if (state.config.showLastSeen && life.lastSeen) {
                const code = life.holdingCode || life.homeCode;
                const site = code ? (libraries.byCode.get(code) || code) : "";
                life.points.push({ date: life.lastSeen, type: "seen", labelKey: "lastSeenEventLabel", site: site, extra: "" });
            }
            life.points.sort(function (a, b) { return a.date - b.date; });
        });
        return map;
    }

    function isCrossLibrary(row) {
        if (!row.end || !row.returnSite) return false;
        if (row.checkoutSiteCode && row.returnSiteCode) return row.checkoutSiteCode !== row.returnSiteCode;
        if (!row.checkoutSite) return false;
        return normalizeText(row.checkoutSite) !== normalizeText(row.returnSite);
    }

    function clearReturnAnnotations() {
        document.querySelectorAll("." + RETURN_INFO_CLASS).forEach(function (el) { el.remove(); });
    }

    function annotateReturnCells(rows) {
        clearReturnAnnotations();
        if (!state.config.showReturnLibraryInTable) return;
        rows.forEach(function (row) {
            if (!row.end || !row.returnSite || !row.returnCell) return;
            const info = createEl("div", RETURN_INFO_CLASS);
            info.appendChild(document.createTextNode(cfgText("returnLibraryLabel") + " : "));
            const strong = createEl("strong", "", row.returnSite);
            info.appendChild(strong);
            if (row.returnSiteCode) info.title = row.returnSiteCode;
            row.returnCell.appendChild(info);
        });
    }

    function computeRange(rangeKey, rows) {
        const now = new Date();
        let start = new Date(now);

        if (rangeKey === "6m") start.setMonth(start.getMonth() - 6);
        else if (rangeKey === "1y") start.setFullYear(start.getFullYear() - 1);
        else if (rangeKey === "3y") start.setFullYear(start.getFullYear() - 3);
        else {
            let earliest = now.getTime();
            rows.forEach(function (row) { earliest = Math.min(earliest, row.start.getTime()); });
            if (state.page && state.page.kind === "biblio") {
                state.lifeByItem.forEach(function (life) {
                    (life.points || []).forEach(function (point) {
                        earliest = Math.min(earliest, point.date.getTime());
                    });
                });
            }

            if (rangeKey === "all") {
                start = new Date(earliest);
                start.setDate(start.getDate() - 7);
            } else {
                /*
                 * Zoom automatique : conserve toute l'histoire lorsqu'elle
                 * tient dans trois ans ; au-delà, ouvre sur les trois dernières
                 * années. Le bouton « Tout » reste disponible pour remonter plus loin.
                 */
                const threeYearsAgo = new Date(now);
                threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
                start = earliest >= threeYearsAgo.getTime() ? new Date(earliest) : threeYearsAgo;
                if (earliest >= threeYearsAgo.getTime()) start.setDate(start.getDate() - 7);
            }
        }

        const end = new Date(now);
        end.setDate(end.getDate() + 2);
        return { start: start, end: end };
    }

    function rowIntersects(row, range) {
        const rowEnd = row.end || new Date();
        return row.start <= range.end && rowEnd >= range.start;
    }

    function positionPct(date, range) {
        const total = range.end.getTime() - range.start.getTime();
        if (total <= 0) return 0;
        return Math.max(0, Math.min(100, ((date.getTime() - range.start.getTime()) / total) * 100));
    }

    function makeTicks(range, count) {
        const output = [];
        const total = range.end.getTime() - range.start.getTime();
        const safeCount = Math.max(2, count || 6);
        for (let index = 0; index <= safeCount; index += 1) {
            output.push(new Date(range.start.getTime() + total * index / safeCount));
        }
        return output;
    }

    function groupRows(rows, range) {
        const visible = rows.filter(function (row) { return rowIntersects(row, range); });
        if (state.page.kind === "biblio") {
            const map = new Map();
            visible.forEach(function (row) {
                const key = row.itemId || row.barcode;
                if (!map.has(key)) {
                    map.set(key, {
                        key: key,
                        main: row.barcode,
                        sub: row.itemId ? cfgText("itemPrefixLabel") + " " + row.itemId : "",
                        events: [],
                        points: state.lifeByItem.get(String(row.itemId || ""))?.points || []
                    });
                }
                map.get(key).events.push(row);
            });
            return Array.from(map.values()).sort(function (a, b) {
                return a.main.localeCompare(b.main, detectLanguage(state.config), { numeric: true });
            });
        }

        return visible.sort(function (a, b) { return b.start - a.start; })
            .slice(0, Math.max(1, Number(state.config.maxReaderRows || 120)))
            .map(function (row, index) {
                return {
                    key: String(row.itemId || row.barcode) + "-" + row.start.getTime() + "-" + index,
                    main: row.title || row.barcode,
                    sub: row.title ? row.barcode : (row.itemId ? cfgText("itemPrefixLabel") + " " + row.itemId : ""),
                    events: [row],
                    points: []
                };
            });
    }

    function summaryValues(rows) {
        const distinctItems = new Set(rows.map(function (row) { return row.itemId || row.barcode; })).size;
        const current = rows.filter(function (row) { return row.current; }).length;
        const hasReturnSite = rows.some(function (row) { return Boolean(row.returnSite); });
        const cross = rows.filter(isCrossLibrary).length;
        const crossValue = hasReturnSite ? cross : "—";

        if (state.page.kind === "biblio") {
            return [
                [distinctItems, cfgText("summaryItemsBiblioLabel")],
                [rows.length, cfgText("summaryLoansBiblioLabel")],
                [current, cfgText("summaryCurrentLabel")],
                [crossValue, cfgText("summaryCrossLabel")]
            ];
        }
        return [
            [rows.length, cfgText("summaryLoansReaderLabel")],
            [distinctItems, cfgText("summaryItemsReaderLabel")],
            [current, cfgText("summaryCurrentLabel")],
            [crossValue, cfgText("summaryCrossLabel")]
        ];
    }

    function buildLoanTooltip(row) {
        const lines = [];
        lines.push(row.current ? cfgText("statusCurrentLabel") : cfgText("statusCompletedLabel"));
        lines.push(cfgText("tooltipCheckoutLabel") + " : " + formatDateTime(row.start));
        if (row.checkoutSite) lines.push(cfgText("tooltipCheckoutLibraryLabel") + " : " + row.checkoutSite);
        if (row.end) {
            lines.push(cfgText("tooltipReturnLabel") + " : " + formatDateTime(row.end));
            if (row.returnSite) lines.push(cfgText("tooltipReturnLibraryLabel") + " : " + row.returnSite);
            const duration = daysBetween(row.start, row.end);
            if (duration !== null) lines.push(cfgText("tooltipDurationLabel") + " : " + durationText(duration));
        } else {
            lines.push(cfgText("tooltipReturnLabel") + " : " + cfgText("tooltipCurrentReturnLabel"));
        }
        if (state.config.showRenewals && row.renewalsCount > 0) {
            lines.push(cfgText("tooltipRenewalsLabel") + " : " + row.renewalsCount);
        }
        if (state.config.showRenewals && row.lastRenewedDate) {
            lines.push(cfgText("tooltipLastRenewedLabel") + " : " + formatDateTime(row.lastRenewedDate));
        }
        if (state.config.highlightCrossLibraryReturns && isCrossLibrary(row)) {
            lines.push("⚠ " + cfgText("tooltipCrossWarningLabel"));
        }
        return lines.join("\n");
    }

    function buildPointTooltip(point) {
        const lines = [cfgText(point.labelKey)];
        lines.push(cfgText("eventDateLabel") + " : " + formatDateTime(point.date));
        if (point.site) lines.push(cfgText("eventLibraryLabel") + " : " + point.site);
        if (point.extra) lines.push(cfgText("eventReasonLabel") + " : " + point.extra);
        return lines.join("\n");
    }

    function injectStyles() {
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement("style");
            style.id = STYLE_ID;
            document.head.appendChild(style);
        }
        const config = state.config || DEFAULT_CONFIG;
        style.textContent = `
            .pmk-lht-panel {
                --pmk-lht-primary: ${config.primaryColor};
                --pmk-lht-cross: ${config.crossLibraryColor};
                --pmk-lht-renewal: ${config.renewalColor};
                --pmk-lht-acquisition: ${config.acquisitionColor};
                --pmk-lht-transfer: ${config.transferColor};
                --pmk-lht-seen: ${config.lastSeenColor};
                --pmk-lht-cancelled: ${config.cancelledColor};
                margin: 1rem 0;
                border: 1px solid var(--bs-border-color, #d6dde3);
                border-radius: .35rem;
                background: var(--bs-body-bg, #fff);
                color: var(--bs-body-color, #212529);
                box-shadow: 0 1px 2px rgba(0,0,0,.04);
                overflow: hidden;
            }
            .pmk-lht-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: .75rem;
                padding: .75rem 1rem;
                border-bottom: 1px solid var(--bs-border-color, #dee2e6);
                background: var(--bs-tertiary-bg, #f8f9fa);
            }
            .pmk-lht-title-wrap { min-width: 0; flex: 1; }
            .pmk-lht-title { margin: 0; font-size: 1.05rem; font-weight: 700; color: inherit; }
            .pmk-lht-subtitle { margin-top: .15rem; color: var(--bs-secondary-color, #6c757d); font-size: .86rem; }
            .pmk-lht-header-actions { display: flex; align-items: center; gap: .25rem; flex: 0 0 auto; }
            .pmk-lht-body[hidden] { display: none !important; }
            .pmk-lht-summary {
                display: grid;
                grid-template-columns: repeat(4, minmax(110px, 1fr));
                gap: .5rem;
                padding: .75rem 1rem .25rem;
            }
            .pmk-lht-card {
                min-width: 0;
                padding: .55rem .65rem;
                border: 1px solid var(--bs-border-color, #e3e8ed);
                border-radius: .3rem;
                background: var(--bs-body-bg, #fff);
            }
            .pmk-lht-card-value { display: block; font-size: 1.12rem; line-height: 1.1; font-weight: 700; }
            .pmk-lht-card-label { display: block; margin-top: .2rem; color: var(--bs-secondary-color, #6c757d); font-size: .76rem; }
            .pmk-lht-toolbar {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: space-between;
                gap: .55rem 1rem;
                padding: .65rem 1rem .75rem;
            }
            .pmk-lht-filter { display: flex; align-items: center; gap: .35rem; flex: 1 1 260px; max-width: 480px; }
            .pmk-lht-filter input { min-width: 0; }
            .pmk-lht-toolbar-right { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: .45rem .8rem; }
            .pmk-lht-ranges { display: flex; flex-wrap: wrap; gap: .25rem; }
            .pmk-lht-ranges .btn.is-active { color: #fff; background: var(--pmk-lht-primary); border-color: var(--pmk-lht-primary); }
            .pmk-lht-legend { display: flex; flex-wrap: wrap; gap: .35rem .7rem; color: var(--bs-secondary-color, #6c757d); font-size: .76rem; }
            .pmk-lht-legend-item { white-space: nowrap; }
            .pmk-lht-dot, .pmk-lht-line { display: inline-block; vertical-align: middle; margin-right: .25rem; }
            .pmk-lht-dot { width: .55rem; height: .55rem; border-radius: 50%; background: var(--pmk-lht-primary); }
            .pmk-lht-line { width: 1.2rem; height: .25rem; border-radius: 1rem; background: var(--pmk-lht-primary); }
            .pmk-lht-line.current { background: repeating-linear-gradient(90deg,var(--pmk-lht-primary) 0 6px,transparent 6px 10px); }
            .pmk-lht-line.cross { background: var(--pmk-lht-cross); }
            .pmk-lht-scroll { overflow-x: auto; overscroll-behavior-inline: contain; padding: 0 1rem .8rem; }
            .pmk-lht-chart { min-width: 900px; }
            .pmk-lht-axis, .pmk-lht-row { display: grid; grid-template-columns: 210px minmax(650px, 1fr); }
            .pmk-lht-axis { position: sticky; top: 0; z-index: 4; background: var(--bs-body-bg, #fff); border-block: 1px solid var(--bs-border-color, #e1e5e8); }
            .pmk-lht-axis-label { padding: .55rem .5rem .45rem 0; color: var(--bs-secondary-color, #6c757d); font-size: .75rem; font-weight: 600; }
            .pmk-lht-axis-track { position: relative; height: 36px; }
            .pmk-lht-tick, .pmk-lht-grid-line { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--bs-border-color-translucent, #e8ecef); pointer-events: none; }
            .pmk-lht-tick-label { position: absolute; top: .45rem; transform: translateX(-50%); white-space: nowrap; color: var(--bs-secondary-color, #6c757d); font-size: .7rem; }
            .pmk-lht-tick-label.first { transform: none; }
            .pmk-lht-tick-label.last { transform: translateX(-100%); }
            .pmk-lht-row { min-height: 56px; border-bottom: 1px solid var(--bs-border-color-translucent, #eef1f4); }
            .pmk-lht-row-label { min-width: 0; padding: .45rem .65rem .4rem 0; }
            .pmk-lht-row-main, .pmk-lht-row-sub { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .pmk-lht-row-main { font-size: .83rem; font-weight: 600; }
            .pmk-lht-row-sub { margin-top: .1rem; color: var(--bs-secondary-color, #6c757d); font-size: .7rem; }
            .pmk-lht-track { position: relative; min-height: 56px; background-image: linear-gradient(to bottom, transparent 27px, var(--bs-border-color-translucent, #eff2f4) 28px, transparent 29px); }
            .pmk-lht-event { position: absolute; top: 17px; height: 22px; min-width: 5px; cursor: pointer; }
            .pmk-lht-event-line { position: absolute; inset: 8px 0 auto; height: 5px; border-radius: 1rem; background: var(--pmk-lht-primary); opacity: .92; }
            .pmk-lht-event.cross .pmk-lht-event-line { background: var(--pmk-lht-cross); }
            .pmk-lht-event.current .pmk-lht-event-line { background: repeating-linear-gradient(90deg,var(--pmk-lht-primary) 0 8px,transparent 8px 12px); }
            .pmk-lht-event-start, .pmk-lht-event-end {
                position: absolute; top: 4px; width: 12px; height: 12px;
                border: 2px solid var(--bs-body-bg, #fff); border-radius: 50%;
                background: var(--pmk-lht-primary); box-shadow: 0 0 0 1px var(--pmk-lht-primary);
            }
            .pmk-lht-event-start { left: -5px; }
            .pmk-lht-event-end { right: -5px; }
            .pmk-lht-event.cross .pmk-lht-event-end { background: var(--pmk-lht-cross); box-shadow: 0 0 0 1px var(--pmk-lht-cross); }
            .pmk-lht-event.current .pmk-lht-event-end {
                width: 0; height: 0; top: 2px; right: -3px; border-radius: 0;
                border-top: 8px solid transparent; border-bottom: 8px solid transparent;
                border-left: 10px solid var(--pmk-lht-primary); border-right: 0; background: transparent; box-shadow: none;
            }
            .pmk-lht-renewal { position: absolute; top: -7px; transform: translateX(-50%); color: var(--pmk-lht-renewal); font-size: .78rem; font-weight: 800; line-height: 1; }
            .pmk-lht-event-site { position: absolute; top: 20px; white-space: nowrap; color: var(--bs-secondary-color, #6c757d); font-size: .64rem; }
            .pmk-lht-event-site.start { left: -4px; }
            .pmk-lht-event-site.end { right: -4px; text-align: right; }
            .pmk-lht-event-warning { position: absolute; top: -8px; right: -8px; font-size: .7rem; }
            .pmk-lht-point { position: absolute; top: 7px; width: 14px; height: 14px; transform: translateX(-50%); border: 2px solid var(--bs-body-bg, #fff); border-radius: 50%; box-shadow: 0 0 0 1px currentColor; cursor: pointer; z-index: 3; }
            .pmk-lht-point.acquisition { color: var(--pmk-lht-acquisition); background: var(--pmk-lht-acquisition); }
            .pmk-lht-point.transfer { color: var(--pmk-lht-transfer); background: var(--pmk-lht-transfer); border-radius: 3px; transform: translateX(-50%) rotate(45deg); }
            .pmk-lht-point.seen { color: var(--pmk-lht-seen); background: var(--pmk-lht-seen); }
            .pmk-lht-point.cancelled { color: var(--pmk-lht-cancelled); background: var(--pmk-lht-cancelled); }
            .pmk-lht-empty, .pmk-lht-limit { padding: .8rem 1rem; color: var(--bs-secondary-color, #6c757d); font-size: .82rem; }
            .pmk-lht-limit { border-top: 1px solid var(--bs-border-color-translucent, #eef1f4); background: var(--bs-tertiary-bg, #fafbfc); }
            .pmk-lht-tooltip {
                position: fixed; z-index: 1090; max-width: min(330px, calc(100vw - 24px)); pointer-events: none;
                border: 1px solid rgba(20,32,42,.15); border-radius: .35rem; background: rgba(30,39,47,.96); color: #fff;
                padding: .45rem .6rem; box-shadow: 0 .35rem 1rem rgba(0,0,0,.2); font-size: .76rem; line-height: 1.4; white-space: pre-line;
            }
            .pmk-lht-tooltip[hidden] { display: none !important; }
            .${RETURN_INFO_CLASS} { margin-top: .2rem; color: var(--bs-secondary-color, #5c6770); font-size: .84em; line-height: 1.25; }
            .${RETURN_INFO_CLASS} strong { color: var(--pmk-lht-primary, ${config.primaryColor}); font-weight: 600; }
            .${RETURN_INFO_CLASS}::before { content: "↳ "; color: var(--bs-secondary-color, #6c757d); }
            @media (max-width: 900px) {
                .pmk-lht-summary { grid-template-columns: repeat(2, minmax(110px, 1fr)); }
                .pmk-lht-header { align-items: center; }
            }
            @media (max-width: 600px) {
                .pmk-lht-header { padding: .65rem .75rem; }
                .pmk-lht-summary { grid-template-columns: 1fr 1fr; padding: .65rem .75rem .2rem; }
                .pmk-lht-toolbar { padding: .55rem .75rem .65rem; align-items: stretch; }
                .pmk-lht-filter, .pmk-lht-toolbar-right { max-width: none; width: 100%; }
                .pmk-lht-toolbar-right { justify-content: flex-start; }
                .pmk-lht-scroll { padding-inline: .75rem; }
                .pmk-lht-event-site { display: none; }
            }
            @media (max-width: 420px) {
                .pmk-lht-summary { grid-template-columns: 1fr; }
                .pmk-lht-filter { flex-wrap: wrap; }
                .pmk-lht-filter .btn { width: 100%; }
            }
        `;
    }

    function getPanelTitleKey() {
        return state.page.kind === "reader" ? "panelTitleReader" : "panelTitleBiblio";
    }

    function getPanelSubtitleKey() {
        return state.page.kind === "reader" ? "panelSubtitleReader" : "panelSubtitleBiblio";
    }

    function buildLegend() {
        const legend = createEl("div", "pmk-lht-legend");
        function addLine(className, label) {
            const item = createEl("span", "pmk-lht-legend-item");
            item.append(createEl("span", "pmk-lht-line " + className), document.createTextNode(label));
            legend.appendChild(item);
        }
        function addDot(className, label) {
            const item = createEl("span", "pmk-lht-legend-item");
            const dot = createEl("span", "pmk-lht-dot");
            if (className === "acquisition") dot.style.background = state.config.acquisitionColor;
            if (className === "transfer") dot.style.background = state.config.transferColor;
            if (className === "seen") dot.style.background = state.config.lastSeenColor;
            item.append(dot, document.createTextNode(label));
            legend.appendChild(item);
        }
        addLine("", cfgText("legendCompletedLabel"));
        addLine("current", cfgText("legendCurrentLabel"));
        if (state.config.highlightCrossLibraryReturns) addLine("cross", cfgText("legendCrossLabel"));
        if (state.config.showRenewals) {
            const item = createEl("span", "pmk-lht-legend-item", "↻ " + cfgText("legendRenewalLabel"));
            legend.appendChild(item);
        }
        if (state.page.kind === "biblio") {
            if (state.config.showAcquisition) addDot("acquisition", cfgText("legendAcquisitionLabel"));
            if (state.config.showTransfers && Number(state.config.transferReportId) > 0) addDot("transfer", cfgText("legendTransferLabel"));
            if (state.config.showLastSeen) addDot("seen", cfgText("legendLastSeenLabel"));
        }
        return legend;
    }

    function ensureTooltip() {
        if (state.tooltip && document.body.contains(state.tooltip)) return state.tooltip;
        const tooltip = createEl("div", "pmk-lht-tooltip");
        tooltip.hidden = true;
        tooltip.setAttribute("role", "tooltip");
        document.body.appendChild(tooltip);
        state.tooltip = tooltip;
        return tooltip;
    }

    function hideTooltip() {
        const tooltip = ensureTooltip();
        tooltip.hidden = true;
    }

    function moveTooltip(event) {
        const tooltip = ensureTooltip();
        if (tooltip.hidden) return;
        const margin = 12;
        const rect = tooltip.getBoundingClientRect();
        let x = Number(event.clientX || 0) + 12;
        let y = Number(event.clientY || 0) + 12;
        if (x + rect.width > window.innerWidth - margin) x = Number(event.clientX || 0) - rect.width - 12;
        if (y + rect.height > window.innerHeight - margin) y = Number(event.clientY || 0) - rect.height - 12;
        tooltip.style.left = Math.max(margin, x) + "px";
        tooltip.style.top = Math.max(margin, y) + "px";
    }

    function showTooltip(event, text) {
        const tooltip = ensureTooltip();
        tooltip.textContent = text;
        tooltip.hidden = false;
        moveTooltip(event);
    }

    function bindTooltipTarget(target, text) {
        target.tabIndex = 0;
        target.setAttribute("aria-label", String(text).replace(/\n/g, ". "));
        target.addEventListener("pointerenter", function (event) { showTooltip(event, text); });
        target.addEventListener("pointermove", moveTooltip);
        target.addEventListener("pointerleave", hideTooltip);
        target.addEventListener("focus", function () {
            const rect = target.getBoundingClientRect();
            showTooltip({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }, text);
        });
        target.addEventListener("blur", hideTooltip);
        target.addEventListener("click", function (event) {
            event.stopPropagation();
            const tooltip = ensureTooltip();
            if (!tooltip.hidden && tooltip.textContent === text) hideTooltip();
            else showTooltip(event, text);
        });
    }

    function createTimelinePanel(rows) {
        const panel = createEl("section", "page-section pmk-lht-panel");
        panel.id = state.page.kind === "reader" ? PANEL_ID_READER : PANEL_ID_BIBLIO;
        panel.dataset.pmkModule = MODULE_ID;
        panel.dataset.pmkPage = state.page.id;

        const header = createEl("div", "pmk-lht-header");
        const titleWrap = createEl("div", "pmk-lht-title-wrap");
        titleWrap.append(
            createEl("h3", "pmk-lht-title", cfgText(getPanelTitleKey())),
            createEl("div", "pmk-lht-subtitle", cfgText(getPanelSubtitleKey()))
        );
        const headerActions = createEl("div", "pmk-lht-header-actions");
        let collapse = null;
        if (state.config.showCollapseButton) {
            collapse = createEl("button", "btn btn-sm btn-outline-secondary pmk-lht-collapse", cfgText("hideLabel"));
            collapse.type = "button";
            collapse.setAttribute("aria-expanded", "true");
            headerActions.appendChild(collapse);
        }
        header.append(titleWrap, headerActions);

        const body = createEl("div", "pmk-lht-body");
        const summary = createEl("div", "pmk-lht-summary");
        const toolbar = createEl("div", "pmk-lht-toolbar");
        const scroll = createEl("div", "pmk-lht-scroll");
        const chart = createEl("div", "pmk-lht-chart");
        scroll.appendChild(chart);

        const filter = createEl("div", "pmk-lht-filter");
        const filterInput = createEl("input", "form-control form-control-sm pmk-lht-filter-input");
        filterInput.type = "search";
        filterInput.placeholder = cfgText("filterPlaceholder");
        filterInput.setAttribute("aria-label", cfgText("filterPlaceholder"));
        const filterClear = createEl("button", "btn btn-sm btn-outline-secondary pmk-lht-filter-clear", cfgText("clearFilterLabel"));
        filterClear.type = "button";
        filterClear.hidden = true;
        filter.append(filterInput, filterClear);

        const toolbarRight = createEl("div", "pmk-lht-toolbar-right");
        const ranges = createEl("div", "pmk-lht-ranges");
        [
            ["auto", "rangeAutoLabel"],
            ["6m", "range6mLabel"],
            ["1y", "range1yLabel"],
            ["3y", "range3yLabel"],
            ["all", "rangeAllLabel"]
        ].forEach(function (entry) {
            const button = createEl("button", "btn btn-sm btn-outline-secondary", cfgText(entry[1]));
            button.type = "button";
            button.dataset.range = entry[0];
            ranges.appendChild(button);
        });
        toolbarRight.appendChild(ranges);
        if (state.config.showLegend) toolbarRight.appendChild(buildLegend());
        if (state.config.showFilter) toolbar.append(filter, toolbarRight);
        else toolbar.appendChild(toolbarRight);

        if (state.config.showSummary) body.appendChild(summary);
        body.append(toolbar, scroll);
        panel.append(header, body);

        let currentRange = ["auto", "6m", "1y", "3y", "all"].includes(state.config.defaultRange)
            ? state.config.defaultRange
            : "auto";

        function rowMatchesFilter(row, query) {
            if (!query) return true;
            return normalizeText([
                row.title,
                row.barcode,
                row.itemId,
                row.checkoutSite,
                row.checkoutSiteCode,
                row.returnSite,
                row.returnSiteCode
            ].filter(Boolean).join(" ")).includes(query);
        }

        function renderSummary(filteredRows) {
            if (!state.config.showSummary) return;
            summary.replaceChildren();
            summaryValues(filteredRows).forEach(function (entry) {
                const card = createEl("div", "pmk-lht-card");
                card.append(
                    createEl("span", "pmk-lht-card-value", entry[0]),
                    createEl("span", "pmk-lht-card-label", entry[1])
                );
                summary.appendChild(card);
            });
        }

        function render(rangeKey) {
            currentRange = rangeKey || currentRange;
            chart.replaceChildren();
            hideTooltip();

            ranges.querySelectorAll("button[data-range]").forEach(function (button) {
                button.classList.toggle("is-active", button.dataset.range === currentRange);
                button.setAttribute("aria-pressed", button.dataset.range === currentRange ? "true" : "false");
            });

            const query = normalizeText(filterInput.value);
            const filteredRows = rows.filter(function (row) { return rowMatchesFilter(row, query); });
            filterClear.hidden = !query;
            renderSummary(filteredRows);

            const rangeBase = filteredRows.length ? filteredRows : rows;
            const range = computeRange(currentRange, rangeBase);
            const groups = groupRows(filteredRows, range);
            const ticks = makeTicks(range, 6);

            const axis = createEl("div", "pmk-lht-axis");
            axis.appendChild(createEl("div", "pmk-lht-axis-label", state.page.kind === "reader" ? cfgText("axisDocumentLabel") : cfgText("axisItemLabel")));
            const axisTrack = createEl("div", "pmk-lht-axis-track");
            ticks.forEach(function (tick, index) {
                const pct = positionPct(tick, range);
                const line = createEl("div", "pmk-lht-tick");
                line.style.left = pct + "%";
                axisTrack.appendChild(line);
                const label = createEl("div", "pmk-lht-tick-label", formatAxisDate(tick, currentRange));
                label.style.left = pct + "%";
                if (index === 0) label.classList.add("first");
                if (index === ticks.length - 1) label.classList.add("last");
                axisTrack.appendChild(label);
            });
            axis.appendChild(axisTrack);
            chart.appendChild(axis);

            if (!groups.length) {
                chart.appendChild(createEl("div", "pmk-lht-empty", query ? cfgText("emptyFilterLabel") : cfgText("emptyPeriodLabel")));
                return;
            }

            groups.forEach(function (group) {
                const rowEl = createEl("div", "pmk-lht-row");
                const label = createEl("div", "pmk-lht-row-label");
                label.append(
                    createEl("span", "pmk-lht-row-main", group.main),
                    createEl("span", "pmk-lht-row-sub", group.sub)
                );
                const track = createEl("div", "pmk-lht-track");
                ticks.forEach(function (tick) {
                    const grid = createEl("div", "pmk-lht-grid-line");
                    grid.style.left = positionPct(tick, range) + "%";
                    track.appendChild(grid);
                });

                group.events.forEach(function (loan) {
                    const visualStart = loan.start < range.start ? range.start : loan.start;
                    const rawEnd = loan.end || new Date();
                    const visualEnd = rawEnd > range.end ? range.end : rawEnd;
                    const left = positionPct(visualStart, range);
                    const right = positionPct(visualEnd, range);
                    const width = Math.max(.55, right - left);
                    const event = createEl("div", "pmk-lht-event");
                    event.style.left = left + "%";
                    event.style.width = width + "%";
                    if (loan.current) event.classList.add("current");
                    if (state.config.highlightCrossLibraryReturns && isCrossLibrary(loan)) event.classList.add("cross");
                    event.append(
                        createEl("span", "pmk-lht-event-line"),
                        createEl("span", "pmk-lht-event-start"),
                        createEl("span", "pmk-lht-event-end")
                    );

                    const startSite = loan.checkoutSiteCode || loan.checkoutSite;
                    const endSite = loan.returnSiteCode || loan.returnSite;
                    if (startSite) event.appendChild(createEl("span", "pmk-lht-event-site start", startSite));
                    if (endSite && !loan.current && width >= 4) event.appendChild(createEl("span", "pmk-lht-event-site end", endSite));

                    if (state.config.showRenewals && loan.renewalsCount > 0) {
                        const renewal = createEl("span", "pmk-lht-renewal", loan.renewalsCount > 1 ? "↻" + loan.renewalsCount : "↻");
                        if (loan.lastRenewedDate && loan.lastRenewedDate >= visualStart && loan.lastRenewedDate <= visualEnd) {
                            const globalPct = positionPct(loan.lastRenewedDate, range);
                            const localPct = width > 0 ? ((globalPct - left) / width) * 100 : 50;
                            renewal.style.left = Math.max(0, Math.min(100, localPct)) + "%";
                        } else renewal.style.left = "50%";
                        event.appendChild(renewal);
                    }
                    if (state.config.highlightCrossLibraryReturns && isCrossLibrary(loan)) {
                        event.appendChild(createEl("span", "pmk-lht-event-warning", "⚠"));
                    }
                    bindTooltipTarget(event, buildLoanTooltip(loan));
                    track.appendChild(event);
                });

                if (state.page.kind === "biblio" && Array.isArray(group.points)) {
                    group.points.forEach(function (point) {
                        if (point.date < range.start || point.date > range.end) return;
                        if (point.type === "acquisition" && !state.config.showAcquisition) return;
                        if (point.type === "seen" && !state.config.showLastSeen) return;
                        if ((point.type === "transfer" || point.type === "cancelled") && !state.config.showTransfers) return;
                        const marker = createEl("span", "pmk-lht-point " + point.type);
                        marker.style.left = positionPct(point.date, range) + "%";
                        bindTooltipTarget(marker, buildPointTooltip(point));
                        track.appendChild(marker);
                    });
                }

                rowEl.append(label, track);
                chart.appendChild(rowEl);
            });

            if (state.page.kind === "reader") {
                const totalVisible = filteredRows.filter(function (row) { return rowIntersects(row, range); }).length;
                const limit = Math.max(1, Number(state.config.maxReaderRows || 120));
                if (totalVisible > limit) {
                    chart.appendChild(createEl(
                        "div",
                        "pmk-lht-limit",
                        replaceTokens(cfgText("limitNoteLabel"), { limit: limit, total: totalVisible })
                    ));
                }
            }
        }

        ranges.addEventListener("click", function (event) {
            const button = event.target.closest("button[data-range]");
            if (!button) return;
            render(button.dataset.range);
        });
        filterInput.addEventListener("input", function () { render(currentRange); });
        filterClear.addEventListener("click", function () {
            filterInput.value = "";
            filterInput.focus();
            render(currentRange);
        });
        if (collapse) {
            collapse.addEventListener("click", function () {
                body.hidden = !body.hidden;
                collapse.textContent = body.hidden ? cfgText("showLabel") : cfgText("hideLabel");
                collapse.setAttribute("aria-expanded", body.hidden ? "false" : "true");
            });
        }

        const params = new URLSearchParams(window.location.search);
        const requestedBarcode = cleanText(params.get("krt_barcode") || params.get("pmk_barcode") || "");
        const requestedItem = cleanText(params.get("krt_itemnumber") || params.get("pmk_itemnumber") || "");
        if (state.page.kind === "biblio" && (requestedBarcode || requestedItem)) {
            filterInput.value = requestedBarcode || requestedItem;
        }

        render(currentRange);
        state.panel = panel;
        window.setTimeout(function () { mountContextButton(headerActions); }, 0);
        return panel;
    }

    function findNativeTimeline() {
        if (!state.page || state.page.kind !== "biblio") return null;
        const candidates = Array.from(document.querySelectorAll(".searchresults .timeline-container-wrapper"));
        return candidates.find(function (el) {
            return !el.closest(".pmk-lht-panel") && !el.dataset.pmkModule;
        }) || null;
    }

    function hideNativeTimelineIfConfigured() {
        const native = findNativeTimeline();
        if (!native) return;
        if (state.config.hideNativeIssuehistoryTimeline) {
            if (!native.hasAttribute("data-pmk-lht-original-display")) {
                native.setAttribute("data-pmk-lht-original-display", native.style.display || "");
            }
            native.dataset.pmkLhtHidden = "1";
            native.style.display = "none";
        } else if (native.dataset.pmkLhtHidden === "1") {
            native.style.display = native.getAttribute("data-pmk-lht-original-display") || "";
            delete native.dataset.pmkLhtHidden;
        }
    }

    function restoreNativeTimeline() {
        document.querySelectorAll('[data-pmk-lht-hidden="1"]').forEach(function (native) {
            native.style.display = native.getAttribute("data-pmk-lht-original-display") || "";
            delete native.dataset.pmkLhtHidden;
        });
    }

    function insertPanel(panel, table) {
        if (!panel || !table) return false;
        if (state.page.kind === "biblio") {
            const native = findNativeTimeline();
            if (native && native.parentNode) {
                native.parentNode.insertBefore(panel, native);
                hideNativeTimelineIfConfigured();
                return true;
            }
        }
        const wrapper = table.closest(".dt-container") || table.closest(".page-section") || table.closest(".dataTables_wrapper") || table;
        wrapper.insertAdjacentElement("afterend", panel);
        return true;
    }

    function removePanel() {
        document.getElementById(PANEL_ID_BIBLIO)?.remove();
        document.getElementById(PANEL_ID_READER)?.remove();
        state.panel = null;
        if (state.tooltip) {
            state.tooltip.remove();
            state.tooltip = null;
        }
    }

    function unbindDataTable() {
        if (!state.table || !window.jQuery || !window.jQuery.fn || !window.jQuery.fn.dataTable) return;
        try {
            window.jQuery(state.table).off("draw.dt.pmkLoanHistoryTimeline");
        } catch (_) {}
        state.drawBound = false;
    }

    function bindDataTable() {
        if (!state.table || !window.jQuery || !window.jQuery.fn || !window.jQuery.fn.dataTable) return;
        try {
            window.jQuery(state.table)
                .off("draw.dt.pmkLoanHistoryTimeline")
                .on("draw.dt.pmkLoanHistoryTimeline", function () {
                    scheduleRefresh(80);
                });
            state.drawBound = true;
        } catch (_) {}
    }

    function scheduleRefresh(delay) {
        if (state.refreshTimer) window.clearTimeout(state.refreshTimer);
        state.refreshTimer = window.setTimeout(function () {
            state.refreshTimer = null;
            refreshFromDom();
        }, Number.isFinite(Number(delay)) ? Number(delay) : 80);
    }

    function refreshFromDom() {
        if (!state.table || !state.page || !state.config || !isPageEnabled(state.config, state.page)) return;
        const rows = parseRows(state.table, state.page);
        if (!rows.length) return;
        state.rows = rows;
        enrichRows(state.rows, state.apiCheckouts, state.libraries);
        annotateReturnCells(state.rows);
        removePanel();
        const panel = createTimelinePanel(state.rows);
        insertPanel(panel, state.table);
    }

    function mountContextButton(anchor) {
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        if (!anchor) return;
        window.PMKConfig.mountContextButton({
            moduleId: MODULE_ID,
            anchor: anchor,
            position: "inside",
            contextKey: state.page ? state.page.id : "timeline",
            context: {
                pageId: state.page ? state.page.id : null,
                sectionId: state.page && state.page.kind === "reader" ? "page-readingrec" : "page-issuehistory"
            }
        });
    }

    function detectExisting128Timeline() {
        return Boolean(
            document.getElementById("krt-biblio-timeline") ||
            document.getElementById("krt-reader-timeline")
        );
    }

    function destroyRuntime(options) {
        const opts = options || {};
        if (state.refreshTimer) {
            window.clearTimeout(state.refreshTimer);
            state.refreshTimer = null;
        }
        unbindDataTable();
        removePanel();
        clearReturnAnnotations();
        if (!opts.keepNativeHidden) restoreNativeTimeline();
        state.table = null;
        state.rows = [];
        state.apiCheckouts = [];
        state.lifeByItem = new Map();
        state.blockedByExistingTimeline = false;
        window[GLOBAL_GUARD].runtime = { active: false };
    }

    async function initializeFunctionalPage(config) {
        state.page = detectPage();
        state.config = deepMerge(DEFAULT_CONFIG, config || {});
        injectStyles();

        if (!state.page || !isPageEnabled(state.config, state.page)) {
            destroyRuntime();
            return;
        }

        /*
         * Migration douce : si le 128 a déjà rendu sa timeline avant nous,
         * on ne détruit pas sa vue ni ses gestionnaires. Dans l'ordre de
         * chargement recommandé, 008 est placé avant 128 et revendique le
         * guard de compatibilité après initialisation, ce qui évite le doublon.
         */
        if (detectExisting128Timeline() && !state.legacyGuardClaimed) {
            state.blockedByExistingTimeline = true;
            window[GLOBAL_GUARD].runtime = {
                active: false,
                reason: "legacy-128-already-active",
                pageId: state.page.id
            };
            return;
        }

        const table = await waitForTable(state.page.tableSelector, 12000);
        if (!table) {
            destroyRuntime();
            window[GLOBAL_GUARD].runtime = { active: false, reason: "table-not-found", pageId: state.page.id };
            return;
        }

        const rows = parseRows(table, state.page);
        if (!rows.length) {
            destroyRuntime();
            window[GLOBAL_GUARD].runtime = { active: false, reason: "columns-or-rows-not-recognized", pageId: state.page.id };
            return;
        }

        destroyRuntime({ keepNativeHidden: true });
        state.page = detectPage();
        state.config = deepMerge(DEFAULT_CONFIG, config || {});
        state.table = table;
        state.rows = rows;
        injectStyles();

        state.libraries = state.config.enrichWithApi ? await loadLibraries() : { byCode: new Map(), byName: new Map() };
        state.apiCheckouts = await loadHistoricalCheckouts(state.page);
        enrichRows(state.rows, state.apiCheckouts, state.libraries);

        if (state.page.kind === "biblio") {
            const items = await loadBiblioItems(state.page);
            const transfers = await loadBiblioTransfers(state.page);
            state.lifeByItem = buildLifeByItem(items, transfers, state.libraries);
        } else {
            state.lifeByItem = new Map();
        }

        annotateReturnCells(state.rows);
        const panel = createTimelinePanel(state.rows);
        if (!insertPanel(panel, state.table)) {
            destroyRuntime();
            return;
        }
        bindDataTable();

        /* Compatibilité avec le 128 chargé plus tard dans l'ancien loader. */
        window[LEGACY_128_GUARD] = true;
        state.legacyGuardClaimed = true;

        window[GLOBAL_GUARD].initialized = true;
        window[GLOBAL_GUARD].runtime = {
            active: true,
            pageId: state.page.id,
            rows: state.rows.length,
            apiEnriched: state.apiCheckouts.length > 0,
            moduleId: MODULE_ID,
            version: MODULE_VERSION
        };
    }

    async function applyConfig(config) {
        const merged = deepMerge(DEFAULT_CONFIG, config || {});
        state.config = merged;
        await initializeFunctionalPage(merged);
    }

    function validateModuleConfig(config) {
        if (!config || typeof config !== "object") {
            return { ok: false, message: "Configuration invalide / Invalid configuration." };
        }
        const language = String(config.language || "auto").toLowerCase();
        if (!["auto", "fr", "en"].includes(language)) {
            return { ok: false, message: language === "fr" ? "Langue invalide." : "Invalid language." };
        }
        if (!["auto", "6m", "1y", "3y", "all"].includes(String(config.defaultRange || "auto"))) {
            return { ok: false, message: detectLanguage(config) === "fr" ? "Période initiale invalide." : "Invalid default range." };
        }
        const maxReaderRows = Number(config.maxReaderRows);
        if (!Number.isInteger(maxReaderRows) || maxReaderRows < 10 || maxReaderRows > 1000) {
            return { ok: false, message: detectLanguage(config) === "fr" ? "Le nombre maximal de prêts lecteur doit être compris entre 10 et 1000." : "Maximum patron loans must be between 10 and 1000." };
        }
        const reportId = Number(config.transferReportId || 0);
        if (!Number.isInteger(reportId) || reportId < 0) {
            return { ok: false, message: detectLanguage(config) === "fr" ? "L’identifiant du rapport de transferts doit être 0 ou un entier positif." : "Transfer report ID must be 0 or a positive integer." };
        }
        [
            "primaryColor", "crossLibraryColor", "renewalColor", "acquisitionColor",
            "transferColor", "lastSeenColor", "cancelledColor"
        ].forEach(function (key) {
            if (!/^#[0-9a-f]{6}$/i.test(String(config[key] || ""))) {
                throw Object.assign(new Error("invalid_color"), { configKey: key });
            }
        });

        const labelKeys = Object.keys(DEFAULT_CONFIG).filter(function (key) {
            return /(?:LabelFr|LabelEn|TitleBiblioFr|TitleBiblioEn|SubtitleBiblioFr|SubtitleBiblioEn|TitleReaderFr|TitleReaderEn|SubtitleReaderFr|SubtitleReaderEn)$/.test(key);
        });
        for (const key of labelKeys) {
            if (!String(config[key] == null ? "" : config[key]).trim()) {
                return { ok: false, message: detectLanguage(config) === "fr" ? "Les libellés français et anglais ne peuvent pas être vides." : "French and English labels cannot be empty." };
            }
        }
        return { ok: true };
    }

    function safeValidate(config) {
        try {
            return validateModuleConfig(config);
        } catch (_) {
            return {
                ok: false,
                message: detectLanguage(config) === "fr"
                    ? "Les couleurs doivent utiliser le format #RRGGBB."
                    : "Colors must use the #RRGGBB format."
            };
        }
    }

    function labelPairFields(baseKey, labelFr, labelEn, help) {
        return [
            {
                key: baseKey + "Fr",
                type: "text",
                label: { fr: labelFr + " — français", en: labelEn + " — French" },
                help: help || undefined
            },
            {
                key: baseKey + "En",
                type: "text",
                label: { fr: labelFr + " — anglais", en: labelEn + " — English" },
                help: help || undefined
            }
        ];
    }

    function moduleDefinition() {
        const schema = [
            {
                type: "section",
                id: "general",
                label: { fr: "Général", en: "General" },
                description: {
                    fr: "Réglages communs au module Historique de circulation. L’affichage reste un complément au tableau Koha.",
                    en: "Settings shared by the Circulation history module. The timeline remains an enhancement to the Koha table."
                },
                fields: [
                    { key: "enabled", type: "boolean", label: { fr: "Module actif", en: "Module enabled" } },
                    {
                        key: "language",
                        type: "select",
                        label: { fr: "Langue de l’interface ajoutée", en: "Language of the added interface" },
                        options: [
                            { value: "auto", label: { fr: "Automatique — suivre Koha", en: "Automatic — follow Koha" } },
                            { value: "fr", label: { fr: "Français", en: "French" } },
                            { value: "en", label: { fr: "Anglais", en: "English" } }
                        ]
                    },
                    {
                        key: "defaultRange",
                        type: "select",
                        label: { fr: "Période affichée au départ", en: "Default displayed range" },
                        options: [
                            { value: "auto", label: { fr: "Automatique — tout si ≤ 3 ans, sinon 3 ans", en: "Automatic — all if ≤ 3 years, otherwise 3 years" } },
                            { value: "6m", label: { fr: "6 mois", en: "6 months" } },
                            { value: "1y", label: { fr: "1 an", en: "1 year" } },
                            { value: "3y", label: { fr: "3 ans", en: "3 years" } },
                            { value: "all", label: { fr: "Tout", en: "All" } }
                        ]
                    },
                    { key: "showSummary", type: "boolean", label: { fr: "Afficher le résumé chiffré", en: "Show summary cards" } },
                    { key: "showFilter", type: "boolean", label: { fr: "Afficher le filtre", en: "Show filter" } },
                    { key: "showLegend", type: "boolean", label: { fr: "Afficher la légende", en: "Show legend" } },
                    { key: "showCollapseButton", type: "boolean", label: { fr: "Permettre de replier la timeline", en: "Allow timeline collapse" } }
                ]
            },
            {
                type: "section",
                id: "pages",
                label: { fr: "Pages configurées", en: "Configured pages" },
                description: {
                    fr: "Les deux adaptateurs partagent la même configuration du module. Les chemins sont informatifs et ne sont pas modifiables.",
                    en: "Both adapters share the same module configuration. Paths are informative and are not editable."
                },
                fields: [
                    {
                        type: "section",
                        id: "page-issuehistory",
                        label: { fr: "Historique d’une notice", en: "Bibliographic record loan history" },
                        fields: [
                            { key: "issuehistoryEnabled", type: "boolean", label: { fr: "Actif sur cette page", en: "Enabled on this page" } },
                            { key: "issuehistoryPathInfo", type: "readonly", label: { fr: "Page Koha", en: "Koha page" }, default: PAGE_DEFINITIONS["catalogue.issuehistory"].path },
                            { key: "hideNativeIssuehistoryTimeline", type: "boolean", label: { fr: "Masquer la timeline native de Koha lorsqu’elle existe", en: "Hide Koha's native timeline when present" } },
                            { key: "showAcquisition", type: "boolean", label: { fr: "Afficher l’acquisition", en: "Show acquisition" } },
                            { key: "showLastSeen", type: "boolean", label: { fr: "Afficher la dernière activité connue", en: "Show last known activity" } },
                            { key: "showTransfers", type: "boolean", label: { fr: "Afficher les transferts historiques", en: "Show historical transfers" } },
                            {
                                key: "transferReportId",
                                type: "number",
                                min: 0,
                                step: 1,
                                label: { fr: "ID du rapport SQL des transferts", en: "Transfer SQL report ID" },
                                help: { fr: "0 = désactivé. Le rapport reste propre à l’installation ; aucun ID n’est imposé aux autres Koha.", en: "0 = disabled. This report is installation-specific; no report ID is imposed on other Koha instances." },
                                when: function (root) { return root.showTransfers === true; }
                            }
                        ]
                    },
                    {
                        type: "section",
                        id: "page-readingrec",
                        label: { fr: "Historique d’un lecteur", en: "Patron circulation history" },
                        fields: [
                            { key: "readingrecEnabled", type: "boolean", label: { fr: "Actif sur cette page", en: "Enabled on this page" } },
                            { key: "readingrecPathInfo", type: "readonly", label: { fr: "Page Koha", en: "Koha page" }, default: PAGE_DEFINITIONS["members.readingrec"].path },
                            { key: "maxReaderRows", type: "number", min: 10, max: 1000, step: 10, label: { fr: "Nombre maximal de prêts affichés", en: "Maximum displayed loans" } }
                        ]
                    }
                ]
            },
            {
                type: "section",
                id: "data",
                label: { fr: "Données et enrichissements", en: "Data and enrichments" },
                description: {
                    fr: "La timeline fonctionne d’abord avec le tableau Koha. Les API ajoutent les sites de retour, renouvellements et événements d’exemplaire lorsqu’ils sont accessibles.",
                    en: "The timeline first works from the Koha table. APIs add check-in libraries, renewals and item events when available."
                },
                fields: [
                    { key: "enrichWithApi", type: "boolean", label: { fr: "Enrichir avec les API Koha", en: "Enrich with Koha APIs" } },
                    { key: "showReturnLibraryInTable", type: "boolean", label: { fr: "Afficher le lieu de retour dans le tableau Koha", en: "Show check-in library in the Koha table" } },
                    { key: "showRenewals", type: "boolean", label: { fr: "Afficher les renouvellements", en: "Show renewals" } },
                    { key: "highlightCrossLibraryReturns", type: "boolean", label: { fr: "Signaler les retours dans un autre site", en: "Highlight returns at another library" } }
                ]
            },
            {
                type: "section",
                id: "appearance",
                label: { fr: "Couleurs", en: "Colors" },
                description: {
                    fr: "Les valeurs par défaut sont sobres et compatibles avec l’interface Koha. Elles peuvent être adaptées à la charte locale.",
                    en: "Default colors are deliberately restrained and Koha-friendly. They can be adapted to local branding."
                },
                fields: [
                    { key: "primaryColor", type: "color", label: { fr: "Prêts", en: "Loans" } },
                    { key: "crossLibraryColor", type: "color", label: { fr: "Retours inter-sites", en: "Cross-library returns" } },
                    { key: "renewalColor", type: "color", label: { fr: "Renouvellements", en: "Renewals" } },
                    { key: "acquisitionColor", type: "color", label: { fr: "Acquisitions", en: "Acquisitions" } },
                    { key: "transferColor", type: "color", label: { fr: "Transferts", en: "Transfers" } },
                    { key: "lastSeenColor", type: "color", label: { fr: "Dernière activité", en: "Last activity" } },
                    { key: "cancelledColor", type: "color", label: { fr: "Transferts annulés", en: "Cancelled transfers" } }
                ]
            }
        ];

        function pushTextSection(id, frLabel, enLabel, fields) {
            schema.push({
                type: "section",
                id: id,
                label: { fr: frLabel, en: enLabel },
                description: {
                    fr: "Tous les textes visibles sont disponibles en français et en anglais. Ils peuvent être adaptés sans modifier le JavaScript.",
                    en: "All visible texts are available in French and English and can be changed without editing JavaScript."
                },
                fields: fields
            });
        }

        pushTextSection("labels-headings", "Libellés — titres et commandes", "Labels — headings and controls", [].concat(
            labelPairFields("panelTitleBiblio", "Titre — historique notice", "Title — record history"),
            labelPairFields("panelSubtitleBiblio", "Sous-titre — historique notice", "Subtitle — record history"),
            labelPairFields("panelTitleReader", "Titre — historique lecteur", "Title — patron history"),
            labelPairFields("panelSubtitleReader", "Sous-titre — historique lecteur", "Subtitle — patron history"),
            labelPairFields("hideLabel", "Bouton Masquer", "Hide button"),
            labelPairFields("showLabel", "Bouton Afficher", "Show button"),
            labelPairFields("filterPlaceholder", "Champ de filtre", "Filter field"),
            labelPairFields("clearFilterLabel", "Bouton Effacer", "Clear button")
        ));

        pushTextSection("labels-ranges", "Libellés — périodes et légende", "Labels — ranges and legend", [].concat(
            labelPairFields("rangeAutoLabel", "Période Auto", "Auto range"),
            labelPairFields("range6mLabel", "Période 6 mois", "6-month range"),
            labelPairFields("range1yLabel", "Période 1 an", "1-year range"),
            labelPairFields("range3yLabel", "Période 3 ans", "3-year range"),
            labelPairFields("rangeAllLabel", "Période Tout", "All range"),
            labelPairFields("legendCompletedLabel", "Légende prêt terminé", "Completed-loan legend"),
            labelPairFields("legendCurrentLabel", "Légende prêt en cours", "Current-loan legend"),
            labelPairFields("legendCrossLabel", "Légende retour inter-sites", "Cross-library legend"),
            labelPairFields("legendRenewalLabel", "Légende renouvellement", "Renewal legend"),
            labelPairFields("legendAcquisitionLabel", "Légende acquisition", "Acquisition legend"),
            labelPairFields("legendTransferLabel", "Légende transfert", "Transfer legend"),
            labelPairFields("legendLastSeenLabel", "Légende dernière activité", "Last-activity legend")
        ));

        pushTextSection("labels-summary", "Libellés — axes et résumé", "Labels — axes and summary", [].concat(
            labelPairFields("axisItemLabel", "Axe exemplaire", "Item axis"),
            labelPairFields("axisDocumentLabel", "Axe document", "Document axis"),
            labelPairFields("summaryItemsBiblioLabel", "Résumé exemplaires — notice", "Item summary — record"),
            labelPairFields("summaryLoansBiblioLabel", "Résumé prêts — notice", "Loan summary — record"),
            labelPairFields("summaryLoansReaderLabel", "Résumé prêts — lecteur", "Loan summary — patron"),
            labelPairFields("summaryItemsReaderLabel", "Résumé exemplaires — lecteur", "Item summary — patron"),
            labelPairFields("summaryCurrentLabel", "Résumé prêts en cours", "Current-loan summary"),
            labelPairFields("summaryCrossLabel", "Résumé retours inter-sites", "Cross-library summary")
        ));

        pushTextSection("labels-tooltips", "Libellés — infobulles et retour", "Labels — tooltips and check-in", [].concat(
            labelPairFields("statusCurrentLabel", "Statut prêt en cours", "Current-loan status"),
            labelPairFields("statusCompletedLabel", "Statut prêt terminé", "Completed-loan status"),
            labelPairFields("tooltipCheckoutLabel", "Infobulle — prêt", "Tooltip — checkout"),
            labelPairFields("tooltipCheckoutLibraryLabel", "Infobulle — site de prêt", "Tooltip — checkout library"),
            labelPairFields("tooltipReturnLabel", "Infobulle — retour", "Tooltip — check-in"),
            labelPairFields("tooltipReturnLibraryLabel", "Infobulle — site de retour", "Tooltip — check-in library"),
            labelPairFields("tooltipDurationLabel", "Infobulle — durée", "Tooltip — duration"),
            labelPairFields("tooltipRenewalsLabel", "Infobulle — renouvellements", "Tooltip — renewals"),
            labelPairFields("tooltipLastRenewedLabel", "Infobulle — dernier renouvellement", "Tooltip — last renewal"),
            labelPairFields("tooltipCurrentReturnLabel", "Infobulle — retour en cours", "Tooltip — current return"),
            labelPairFields("tooltipCrossWarningLabel", "Avertissement retour inter-sites", "Cross-library warning"),
            labelPairFields("returnLibraryLabel", "Libellé du lieu de retour dans le tableau", "Check-in library label in table")
        ));

        pushTextSection("labels-events", "Libellés — événements d’exemplaire", "Labels — item events", [].concat(
            labelPairFields("acquisitionEventLabel", "Événement acquisition", "Acquisition event"),
            labelPairFields("lastSeenEventLabel", "Événement dernière activité", "Last-activity event"),
            labelPairFields("transferRequestedEventLabel", "Transfert demandé", "Transfer requested"),
            labelPairFields("transferSentEventLabel", "Transfert envoyé", "Transfer sent"),
            labelPairFields("transferArrivedEventLabel", "Transfert arrivé", "Transfer arrived"),
            labelPairFields("transferCancelledEventLabel", "Transfert annulé", "Transfer cancelled"),
            labelPairFields("eventDateLabel", "Champ Date", "Date field"),
            labelPairFields("eventLibraryLabel", "Champ Site", "Library field"),
            labelPairFields("eventReasonLabel", "Champ Motif", "Reason field")
        ));

        pushTextSection("labels-misc", "Libellés — messages et unités", "Labels — messages and units", [].concat(
            labelPairFields("emptyPeriodLabel", "Aucun prêt sur la période", "No loans in range"),
            labelPairFields("emptyFilterLabel", "Aucun résultat du filtre", "No filter result"),
            labelPairFields("limitNoteLabel", "Message de limitation lecteur", "Patron limit note", {
                fr: "Variables disponibles : {limit}, {total}.",
                en: "Available placeholders: {limit}, {total}."
            }),
            labelPairFields("itemPrefixLabel", "Préfixe exemplaire", "Item prefix"),
            labelPairFields("daySingularLabel", "Unité jour — singulier", "Day unit — singular"),
            labelPairFields("dayPluralLabel", "Unité jour — pluriel", "Day unit — plural")
        ));

        return {
            id: MODULE_ID,
            schemaVersion: 1,
            name: { fr: "Historique de circulation", en: "Circulation history" },
            description: {
                fr: "Ajoute une timeline des prêts et de la vie des exemplaires sur les historiques notice et lecteur, sans remplacer les tableaux Koha.",
                en: "Adds a loan and item-life timeline to record and patron history pages without replacing Koha tables."
            },
            category: { fr: "Circulation / historiques", en: "Circulation / history" },
            supportedPages: ["catalogue.issuehistory", "members.readingrec"],
            prerequisites: [],
            dependencies: [],
            defaults: deepClone(DEFAULT_CONFIG),
            validate: safeValidate,
            schema: schema,
            focusContext: function (main, context) {
                if (!main || !context) return;
                const sectionId = context.sectionId || (
                    context.pageId === "members.readingrec" ? "page-readingrec" :
                    context.pageId === "catalogue.issuehistory" ? "page-issuehistory" : null
                );
                if (!sectionId) return;
                const section = main.querySelector('[data-pmk-section-id="' + sectionId + '"]');
                if (section) {
                    window.setTimeout(function () {
                        section.scrollIntoView({ block: "start", behavior: "smooth" });
                    }, 0);
                }
            }
        };
    }

    function registerWithCore() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return false;
        if (state.coreRegistered) return true;
        const registered = window.PMKConfig.registerModule(moduleDefinition());
        state.coreRegistered = registered !== false;
        return state.coreRegistered;
    }

    async function startWithCore() {
        if (!registerWithCore()) return;
        if (state.coreStarted) return;
        state.coreStarted = true;

        if (detectPage()) {
            try {
                const config = await window.PMKConfig.getConfig(MODULE_ID);
                await applyConfig(config);
            } catch (_) {
                await applyConfig(DEFAULT_CONFIG);
            }
        }

        if (typeof window.PMKConfig.subscribe === "function" && !state.unsubscribe) {
            state.unsubscribe = window.PMKConfig.subscribe(MODULE_ID, function (newConfig) {
                applyConfig(newConfig);
            });
            window[GLOBAL_GUARD].unsubscribe = state.unsubscribe;
        }
    }

    async function startWithoutCore() {
        if (state.fallbackStarted || !detectPage()) return;
        state.fallbackStarted = true;
        await applyConfig(DEFAULT_CONFIG);
    }

    function onReady(callback) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback, { once: true });
        } else callback();
    }

    document.addEventListener("click", function (event) {
        if (!state.tooltip || state.tooltip.hidden) return;
        if (event.target.closest(".pmk-lht-event, .pmk-lht-point, .pmk-lht-tooltip")) return;
        hideTooltip();
    });

    window.addEventListener("resize", hideTooltip);

    /*
     * Enregistrement PMK immédiat : la fiche doit être visible dans
     * l'administration même avant DOMContentLoaded et hors pages fonctionnelles.
     */
    if (window.PMKConfig) {
        registerWithCore();
    } else {
        window.addEventListener("pmk:config-ready", function () {
            registerWithCore();
            if (document.readyState !== "loading") startWithCore();
        }, { once: true });
    }

    onReady(function () {
        if (window.PMKConfig) {
            startWithCore();
        } else {
            startWithoutCore();
        }
    });

    window.PMK008LoanHistoryTimeline = {
        id: MODULE_ID,
        version: MODULE_VERSION,
        defaults: deepClone(DEFAULT_CONFIG),
        getRuntime: function () { return deepClone(window[GLOBAL_GUARD].runtime); },
        refresh: function () { scheduleRefresh(0); },
        destroy: function () { destroyRuntime(); }
    };
})();

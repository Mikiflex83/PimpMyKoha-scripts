/*
 Nom du fichier : 114-renew-modif.js
 Module PMK : renewal-enhancements
 Version : 3.2.0-preplugin
 Date : 2026-09-21

 Fusion canonique des scripts historiques :
   - 114-renew-modif.js
   - 089-renewal-column-enhancements.js (absorbé ; à décharger après recette)

 Principes :
   - conserve physiquement les contrôles natifs Koha ; aucune checkbox de renouvellement n'est recréée ;
   - réintègre par défaut la checkbox native Koha dans la carte PMK, en déplaçant le nœud existant sans le cloner ;
   - restaure sa position DOM d'origine si le module est désactivé ou reconfiguré ;
   - ne déclenche AUCUN renouvellement via API ; l'action reste intégralement native Koha ;
   - enrichit facultativement l'affichage via GET /api/v1/checkouts/{checkout_id}/allows_renewal ;
   - fonctionne immédiatement à partir du DOM, même si l'API est absente/interdite ;
   - reprend la présentation historique R / N / « renouvelé » du 089 ;
   - supprime définitivement le faux bouton historique « Renouveler la sélection » du 089 ;
   - limite l'exécution aux pages de circulation/historique configurées ;
   - observer ciblé sur les tableaux / la zone principale, jamais un traitement aveugle de tout le body.
   - v3.2 : le DOM Koha explicite et le quota priment sur la checkbox et sur l’API ; la checkbox n’est affichée que si le renouvellement est réellement permis.
   - v3.2 : renew_<itemnumber> n’est plus utilisé comme checkout_id REST ; sans vrai identifiant de prêt, aucun appel API erroné n’est lancé.
*/
(function (window, document) {
    "use strict";

    if (!window || !document) return;
    if (window.__PMK114RenewalEnhancementsV3) return;
    window.__PMK114RenewalEnhancementsV3 = true;

    const MODULE_ID = "renewal-enhancements";
    const MODULE_VERSION = "3.2.0-preplugin";
    const STYLE_ID = "pmk114-renewal-styles";
    const CONTEXT_KEY = "pmk114-renewal";

    const DEFAULT_REASON_LABELS = [
        { enabled:true, code:"too_many", fr:"Nombre maximal de renouvellements atteint", en:"Maximum number of renewals reached" },
        { enabled:true, code:"on_reserve", fr:"Une réservation empêche le renouvellement", en:"A hold prevents renewal" },
        { enabled:true, code:"norenew_overdue", fr:"Renouvellement interdit en raison du retard", en:"Renewal blocked because the item is overdue" },
        { enabled:true, code:"too_unseen", fr:"Le document doit être présenté à la bibliothèque", en:"The item must be seen by the library" },
        { enabled:true, code:"too_soon", fr:"Renouvellement encore trop tôt", en:"Too soon to renew" },
        { enabled:true, code:"auto_too_late", fr:"Le document n'est plus renouvelable", en:"The item is no longer renewable" },
        { enabled:true, code:"auto_too_much_owing", fr:"Des frais impayés empêchent le renouvellement automatique", en:"Outstanding charges prevent automatic renewal" },
        { enabled:true, code:"auto_account_expired", fr:"Le compte lecteur est expiré", en:"The patron account is expired" },
        { enabled:true, code:"item_denied_renewal", fr:"Les règles de l'exemplaire interdisent le renouvellement", en:"Item rules deny renewal" },
        { enabled:true, code:"restriction", fr:"Une restriction empêche le renouvellement", en:"A restriction prevents renewal" }
    ];

    const DEFAULT_CONFIG = {
        enabled: true,
        pages: [
            {
                id: "circ.circulation",
                enabled: true,
                path: "/cgi-bin/koha/circ/circulation.pl",
                mode: "active",
                labelFr: "Circulation — prêts actifs",
                labelEn: "Circulation — active checkouts"
            },
            {
                id: "members.moremember",
                enabled: true,
                path: "/cgi-bin/koha/members/moremember.pl",
                mode: "active",
                labelFr: "Fiche lecteur — prêts actifs",
                labelEn: "Patron details — active checkouts"
            },
            {
                id: "members.memberhistory",
                enabled: true,
                path: "/cgi-bin/koha/members/memberhistory.pl",
                mode: "history",
                labelFr: "Historique lecteur",
                labelEn: "Patron history"
            },
            {
                id: "circ.returns",
                enabled: true,
                path: "/cgi-bin/koha/circ/returns.pl",
                mode: "history",
                labelFr: "Retours",
                labelEn: "Check in"
            }
        ],
        active: {
            enabled: true,
            showStatus: true,
            showCounts: true,
            showReason: true,
            showUnseenRenewals: true,
            integrateCheckboxInCard: true,
            showCheckboxLabel: true,
            hideKnownNativeText: true,
            countFormat: "remaining-total",
            statusSource: "api-preferred"
        },
        api: {
            enabled: true,
            endpointTemplate: "/api/v1/checkouts/{id}/allows_renewal",
            concurrency: 3,
            timeoutMs: 4000,
            cacheMs: 60000,
            stopAfterForbidden: true,
            trustCheckboxValueWhenNamedIssue: true,
            trustCheckboxValueWhenNamedRenew: false
        },
        history: {
            enabled: true,
            useLegacyLabelClasses: true,
            renewedPatterns: "^R$;renouvelé;renouvele;renewed",
            notRenewedPatterns: "^N$;non renouvelé;non renouvele;not renewed",
            renewedTooltipFr: "Renouvellement détecté",
            renewedTooltipEn: "Renewal detected",
            notRenewedTooltipFr: "Non renouvelé",
            notRenewedTooltipEn: "Not renewed"
        },
        labels: {
            renewableFr: "Renouvellement possible",
            renewableEn: "Renewal available",
            impossibleFr: "Renouvellement impossible",
            impossibleEn: "Renewal unavailable",
            blockedFr: "Renouvellement impossible",
            blockedEn: "Renewal blocked",
            unknownFr: "État de renouvellement",
            unknownEn: "Renewal status",
            renewFr: "Renouveler",
            renewEn: "Renew",
            renewedUnavailableFr: "Nouveau renouvellement indisponible",
            renewedUnavailableEn: "No further renewal available",
            renewedQuotaFr: "Quota de renouvellements atteint",
            renewedQuotaEn: "Renewal limit reached",
            remainingFr: "{remaining}/{total} renouvellements restants",
            remainingEn: "{remaining}/{total} renewals remaining",
            usedFr: "{current}/{total} renouvellements utilisés",
            usedEn: "{current}/{total} renewals used",
            unseenFr: "{count} renouvellement(s) non vu(s)",
            unseenEn: "{count} unseen renewal(s)"
        },
        icons: {
            renewable: "✅",
            impossible: "⛔",
            blocked: "🔒",
            unknown: "ℹ️"
        },
        appearance: {
            compact: false,
            animation: true,
            minWidthPx: 180,
            mobileMinWidthPx: 140,
            successText: "#155724",
            successBg: "#d4edda",
            successBorder: "#b7d7c2",
            dangerText: "#721c24",
            dangerBg: "#f8d7da",
            dangerBorder: "#f5c6cb",
            neutralText: "#495057",
            neutralBg: "#f8f9fa",
            neutralBorder: "#dee2e6"
        },
        advanced: {
            renewalHeaderWords: "renouvel;renew",
            activeCellSelectors: ".renewcol, td.renew, td[class*=\"renew\"]",
            historyCellSelectors: ".renewcol, td.renew, td[class*=\"renew\"]",
            mainRootSelectors: "main, #main, #patron_detail, #patronissues, .main",
            initialScanDelayMs: 150,
            mutationDebounceMs: 100,
            tableDiscoveryMs: 10000,
            diagnostics: false
        },
        reasonLabels: DEFAULT_REASON_LABELS
    };

    let currentConfig = deepClone(DEFAULT_CONFIG);
    let unsubscribeConfig = null;
    let rootObserver = null;
    let discoveryTimer = 0;
    let mutationTimer = 0;
    let apiForbidden = false;
    let activeApi = 0;
    const apiQueue = [];
    const apiCache = new Map();
    const apiFailureCache = new Map();
    const apiPending = new Map();
    const tableObservers = new Map();
    const enhancedCells = new Set();
    const movedNativeControls = new Set();

    function deepClone(value) {
        if (value == null) return value;
        return JSON.parse(JSON.stringify(value));
    }

    function isPlainObject(value) {
        return value && typeof value === "object" && !Array.isArray(value);
    }

    function merge(base, incoming) {
        if (Array.isArray(base)) return Array.isArray(incoming) ? deepClone(incoming) : deepClone(base);
        if (!isPlainObject(base)) return incoming === undefined ? base : incoming;
        const out = {};
        Object.keys(base).forEach(function (key) {
            out[key] = isPlainObject(base[key])
                ? merge(base[key], incoming && isPlainObject(incoming[key]) ? incoming[key] : undefined)
                : Array.isArray(base[key])
                    ? (incoming && Array.isArray(incoming[key]) ? deepClone(incoming[key]) : deepClone(base[key]))
                    : (incoming && incoming[key] !== undefined ? incoming[key] : base[key]);
        });
        if (incoming && isPlainObject(incoming)) {
            Object.keys(incoming).forEach(function (key) {
                if (!(key in out)) out[key] = deepClone(incoming[key]);
            });
        }
        return out;
    }

    function normalizeConfig(config) {
        const out = merge(DEFAULT_CONFIG, config || {});
        out.api.concurrency = clampNumber(out.api.concurrency, 1, 8, 3);
        out.api.timeoutMs = clampNumber(out.api.timeoutMs, 1000, 20000, 4000);
        out.api.cacheMs = clampNumber(out.api.cacheMs, 0, 3600000, 60000);
        out.advanced.initialScanDelayMs = clampNumber(out.advanced.initialScanDelayMs, 0, 5000, 150);
        out.advanced.mutationDebounceMs = clampNumber(out.advanced.mutationDebounceMs, 20, 2000, 100);
        out.advanced.tableDiscoveryMs = clampNumber(out.advanced.tableDiscoveryMs, 1000, 60000, 10000);
        return out;
    }

    function clampNumber(value, min, max, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, n));
    }

    function lang() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            try { return window.PMKConfig.getLanguage() === "en" ? "en" : "fr"; } catch (_) {}
        }
        const htmlLang = String(document.documentElement.getAttribute("lang") || "").toLowerCase();
        if (htmlLang.indexOf("en") === 0) return "en";
        return "fr";
    }

    function local(fr, en) {
        return lang() === "en" ? en : fr;
    }

    function debug() {
        if (!currentConfig.advanced.diagnostics || !window.console || typeof console.debug !== "function") return;
        const args = Array.prototype.slice.call(arguments);
        args.unshift("[PMK114]");
        console.debug.apply(console, args);
    }

    function splitRules(value) {
        return String(value || "")
            .split(/[;\n]+/)
            .map(function (item) { return item.trim(); })
            .filter(Boolean);
    }

    function currentPage() {
        const path = window.location && window.location.pathname ? window.location.pathname : "";
        const pages = Array.isArray(currentConfig.pages) ? currentConfig.pages : [];
        return pages.find(function (page) {
            return page && page.enabled !== false && String(page.path || "") === path;
        }) || null;
    }

    function safeQuery(root, selector) {
        try { return root.querySelector(selector); } catch (_) { return null; }
    }

    function safeQueryAll(root, selector) {
        try { return Array.from(root.querySelectorAll(selector)); } catch (_) { return []; }
    }

    function cleanText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function elementVisible(element) {
        if (!element || !element.isConnected) return false;
        if (element.hidden) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
        if (style && (style.display === "none" || style.visibility === "hidden")) return false;
        return true;
    }

    function pageModeIs(page, wanted) {
        if (!page) return false;
        return page.mode === "both" || page.mode === wanted;
    }

    function findMainRoot() {
        const selectors = splitRules(String(currentConfig.advanced.mainRootSelectors || "").replace(/,/g, ";"));
        for (let i = 0; i < selectors.length; i += 1) {
            const el = safeQuery(document, selectors[i]);
            if (el) return el;
        }
        return document.body;
    }

    function headerWords() {
        return splitRules(currentConfig.advanced.renewalHeaderWords).map(function (x) { return x.toLowerCase(); });
    }

    function headerMatches(text) {
        const normalized = cleanText(text).toLowerCase();
        return headerWords().some(function (word) { return word && normalized.indexOf(word) !== -1; });
    }

    function findColumnIndex(table) {
        const rows = safeQueryAll(table, "thead tr, tr");
        for (let r = 0; r < Math.min(rows.length, 5); r += 1) {
            const cells = Array.from(rows[r].children || []).filter(function (el) { return /^(TH|TD)$/.test(el.tagName); });
            for (let i = 0; i < cells.length; i += 1) {
                if (headerMatches(cells[i].textContent)) return i;
            }
        }
        return -1;
    }

    function tableHasRenewalCells(table, mode) {
        const selector = mode === "history" ? currentConfig.advanced.historyCellSelectors : currentConfig.advanced.activeCellSelectors;
        return Boolean(safeQuery(table, selector));
    }

    function findTables(page) {
        if (!page) return [];
        const root = findMainRoot();
        return safeQueryAll(root, "table").filter(function (table) {
            if (!table || !table.isConnected) return false;
            if (table.getAttribute("data-pmk114-ignore") === "1") return false;
            const mode = page.mode === "both" ? "active" : page.mode;
            return findColumnIndex(table) >= 0 || tableHasRenewalCells(table, mode);
        });
    }

    function getCell(row, columnIndex, mode) {
        const selector = mode === "history" ? currentConfig.advanced.historyCellSelectors : currentConfig.advanced.activeCellSelectors;
        const direct = safeQuery(row, selector);
        if (direct && direct.tagName === "TD") return direct;
        const cells = Array.from(row.children || []).filter(function (el) { return el.tagName === "TD"; });
        return columnIndex >= 0 && cells[columnIndex] ? cells[columnIndex] : null;
    }

    function nativeText(cell) {
        if (!cell) return "";
        const clone = cell.cloneNode(true);
        safeQueryAll(clone, ".pmk114-card, .pmk114-checkbox-label").forEach(function (el) { el.remove(); });
        return cleanText(clone.textContent);
    }

    function findNativeCheckbox(cell) {
        const selectors = [
            'input[type="checkbox"].renew',
            'input[type="checkbox"][name="renew"]',
            'input[type="checkbox"][name="renew[]"]',
            'input[type="checkbox"][name="renew_checked"]',
            'input[type="checkbox"][name="renew_checked[]"]',
            'input[type="checkbox"][name="issue"]',
            'input[type="checkbox"][name="issue[]"]',
            'input[type="checkbox"][id^="renew_"]',
            'input[type="checkbox"]'
        ];
        for (let i = 0; i < selectors.length; i += 1) {
            const input = safeQuery(cell, selectors[i]);
            if (input) return input;
        }
        return null;
    }

    function parseCounts(text) {
        const source = cleanText(text);
        let m = source.match(/il\s+reste\s+(\d+)\s+renouvellements?\s+sur\s+(\d+)/i);
        if (m) return { remaining:Number(m[1]), total:Number(m[2]), current:Math.max(0, Number(m[2]) - Number(m[1])), source:"dom" };

        m = source.match(/(\d+)\s*(?:\/|sur)\s*(\d+)\s+renouvellements?\s+restants?/i);
        if (m) return { remaining:Number(m[1]), total:Number(m[2]), current:Math.max(0, Number(m[2]) - Number(m[1])), source:"dom" };

        m = source.match(/(\d+)\s+of\s+(\d+)\s+renewals?\s+remaining/i);
        if (m) return { remaining:Number(m[1]), total:Number(m[2]), current:Math.max(0, Number(m[2]) - Number(m[1])), source:"dom" };

        return null;
    }

    function parseUnseen(text) {
        const source = cleanText(text);
        let m = source.match(/(\d+)\s+(?:renouvellements?\s+)?(?:non\s+vus?|avant\s+que\s+le\s+document\s+doive\s+être\s+vu)/i);
        if (m) return Number(m[1]);
        m = source.match(/(\d+)\s+of\s+\d+\s+renewals?\s+left\s+before\s+the\s+item\s+must\s+be\s+seen/i);
        if (m) return Number(m[1]);
        return null;
    }

    function domReason(text, cell) {
        /*
         * Les classes Koha spécifiques sont plus fiables qu'un texte générique
         * « Non renouvelable ». On les teste donc en premier afin de conserver
         * un motif précis (réservation, retard, etc.) lorsqu'il existe.
         */
        const knownClassChecks = [
            [".no-renew-hold", "on_reserve"],
            [".no-renew-too-many", "too_many"],
            [".no-renew-unseen", "too_unseen"],
            [".no-renew-overdue", "norenew_overdue"],
            [".no-renew-too-late", "auto_too_late"],
            [".no-renewal-before", "too_soon"],
            [".auto-renew-fines", "auto_too_much_owing"],
            [".auto-renew-expired", "auto_account_expired"]
        ];
        for (let i = 0; i < knownClassChecks.length; i += 1) {
            if (firstActiveMarker(cell, [knownClassChecks[i][0]])) return knownClassChecks[i][1];
        }

        const source = cleanText(text).toLowerCase();
        if (/réserv|reserv|on hold|hold/.test(source)) return "on_reserve";
        if (/retard|overdue/.test(source)) return "norenew_overdue";
        if (/trop tôt|trop tot|too soon|no renewal before/.test(source)) return "too_soon";
        if (/doit.*(?:vu|présent|present)|must be.*seen/.test(source)) return "too_unseen";
        if (/plus.*renouvel|no renewals left|maximum|maximal/.test(source)) return "too_many";
        if (/expir/.test(source)) return "auto_account_expired";
        if (/amende|frais|fine|owing|charge/.test(source)) return "auto_too_much_owing";
        if (/not allowed|non renouvelable|renouvellement impossible|renewal not allowed/.test(source)) return "restriction";
        return "";
    }

    function reasonLabel(code) {
        if (!code) return "";
        const list = Array.isArray(currentConfig.reasonLabels) ? currentConfig.reasonLabels : [];
        const found = list.find(function (item) { return item && item.enabled !== false && String(item.code || "") === String(code); });
        if (found) return lang() === "en" ? (found.en || found.fr || code) : (found.fr || found.en || code);
        return String(code).replace(/_/g, " ");
    }

    function nativeMarkerActive(element) {
        if (!element) return false;
        if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
        if (element.style && String(element.style.display || "").toLowerCase() === "none") return false;

        /*
         * Après le premier rendu, PMK masque les marqueurs Koha avec sa propre
         * classe .pmk114-hide-native. Cette classe ne doit pas faire disparaître
         * l'information métier lors des scans suivants. En revanche, une classe
         * Koha/CSS qui masquait déjà le marqueur avant PMK doit être respectée.
         */
        if (!element.classList.contains("pmk114-hide-native")) {
            try {
                if (window.getComputedStyle(element).display === "none") return false;
            } catch (_) {}
        }
        return true;
    }

    function firstActiveMarker(cell, selectors) {
        for (let i = 0; i < selectors.length; i += 1) {
            const nodes = safeQueryAll(cell, selectors[i]);
            for (let j = 0; j < nodes.length; j += 1) {
                if (nativeMarkerActive(nodes[j])) return nodes[j];
            }
        }
        return null;
    }

    function domState(cell) {
        const text = nativeText(cell);
        const checkbox = findNativeCheckbox(cell);
        const counts = parseCounts(text);
        const reason = domReason(text, cell);

        const preciseBlockedSelectors = [
            ".no-renew-hold",
            ".no-renew-too-many",
            ".no-renew-unseen",
            ".no-renew-overdue",
            ".no-renew-too-late",
            ".no-renewal-before",
            ".auto-renew-fines",
            ".auto-renew-expired"
        ];
        const preciseBlockedElement = firstActiveMarker(cell, preciseBlockedSelectors);
        const genericBlockedElement = firstActiveMarker(cell, [".renewals-disabled"]);
        const allowedElement = firstActiveMarker(cell, [".renewals-allowed"]);

        const negativeText = /non\s+renouvelable|renouvellement\s+impossible|not\s+renewable|not\s+allowed|no\s+renewals?\s+left/i.test(text);
        const quotaExhausted = Boolean(
            counts &&
            Number.isFinite(Number(counts.total)) && Number(counts.total) > 0 &&
            Number.isFinite(Number(counts.remaining)) && Number(counts.remaining) <= 0
        );
        const quotaAvailable = Boolean(
            counts &&
            Number.isFinite(Number(counts.remaining)) && Number(counts.remaining) > 0
        );
        const checkboxUsable = Boolean(checkbox && !checkbox.disabled && elementVisible(checkbox));
        const checkboxBlocked = Boolean(checkbox && checkbox.disabled);

        /*
         * Priorité de décision v3.2 :
         * 1. blocage explicite Koha / quota à zéro ;
         * 2. autorisation explicite Koha / quota positif ;
         * 3. checkbox seulement en dernier recours.
         *
         * La simple présence d'une checkbox ne peut donc plus transformer
         * « Non renouvelable » + « 0/1 restant » en « Renouvellement possible ».
         */
        let allowsRenewal = null;
        let authority = "none";

        if (preciseBlockedElement || genericBlockedElement || quotaExhausted || checkboxBlocked) {
            allowsRenewal = false;
            authority = quotaExhausted ? "dom-quota" : "dom-blocked";
        } else if (allowedElement || quotaAvailable) {
            allowsRenewal = true;
            authority = quotaAvailable ? "dom-quota" : "dom-allowed";
        } else if (negativeText) {
            allowsRenewal = false;
            authority = "dom-text";
        } else if (checkboxUsable) {
            allowsRenewal = true;
            authority = "dom-checkbox-fallback";
        }

        return {
            source:"dom",
            allowsRenewal:allowsRenewal,
            authoritative:authority !== "none" && authority !== "dom-checkbox-fallback",
            authority:authority,
            checkbox:checkbox,
            counts:counts,
            unseen:parseUnseen(text),
            reason:reason,
            quotaExhausted:quotaExhausted,
            rawText:text
        };
    }

    function numeric(value) {
        return /^\d+$/.test(String(value || "").trim()) ? String(value).trim() : "";
    }

    function dataCandidate(element, names) {
        if (!element) return "";
        for (let i = 0; i < names.length; i += 1) {
            const attr = element.getAttribute(names[i]);
            const n = numeric(attr);
            if (n) return n;
        }
        return "";
    }

    function extractCheckoutId(row, cell, checkbox) {
        const attrs = ["data-checkout-id", "data-checkoutid", "data-issue-id", "data-issueid", "data-issue"];
        const direct = dataCandidate(checkbox, attrs) || dataCandidate(cell, attrs) || dataCandidate(row, attrs);
        if (direct) return direct;

        const withData = safeQuery(row, "[data-checkout-id],[data-checkoutid],[data-issue-id],[data-issueid],[data-issue]");
        const nested = dataCandidate(withData, attrs);
        if (nested) return nested;

        const hidden = safeQuery(row, 'input[type="hidden"][name="checkout_id"],input[type="hidden"][name="issue_id"],input[type="hidden"][name="issue"]');
        const hiddenValue = hidden ? numeric(hidden.value) : "";
        if (hiddenValue) return hiddenValue;

        const links = safeQueryAll(row, "a[href], a[data-issue], a[data-issueid], a[data-checkout-id]");
        for (let i = 0; i < links.length; i += 1) {
            const fromData = dataCandidate(links[i], attrs);
            if (fromData) return fromData;
            try {
                const url = new URL(links[i].getAttribute("href"), window.location.origin);
                const fromUrl = numeric(url.searchParams.get("checkout_id")) || numeric(url.searchParams.get("issue_id")) || numeric(url.searchParams.get("issue"));
                if (fromUrl) return fromUrl;
            } catch (_) {}
        }

        if (checkbox) {
            /*
             * IMPORTANT : dans Koha, id="renew_12345" / value="12345" désigne
             * généralement l'ITEMNUMBER, pas le checkout_id de l'API REST.
             * On ne transforme donc jamais l'id renew_* en identifiant de prêt.
             */
            const name = String(checkbox.name || "").toLowerCase();
            const value = numeric(checkbox.value);
            if (value && currentConfig.api.trustCheckboxValueWhenNamedIssue !== false && /^issue(?:\[\])?$/.test(name)) return value;
            if (value && currentConfig.api.trustCheckboxValueWhenNamedRenew === true && /^renew(?:\[\])?$/.test(name)) return value;
        }
        return "";
    }

    function cacheGet(id) {
        const hit = apiCache.get(String(id));
        if (!hit) return null;
        if (Date.now() - hit.at > currentConfig.api.cacheMs) {
            apiCache.delete(String(id));
            return null;
        }
        return deepClone(hit.value);
    }

    function cacheSet(id, value) {
        apiCache.set(String(id), { at:Date.now(), value:deepClone(value) });
        apiFailureCache.delete(String(id));
    }

    function failureCacheActive(id) {
        const key = String(id);
        const at = apiFailureCache.get(key);
        if (!at) return false;
        if (Date.now() - at > currentConfig.api.cacheMs) {
            apiFailureCache.delete(key);
            return false;
        }
        return true;
    }

    function markApiFailure(id) {
        apiFailureCache.set(String(id), Date.now());
    }

    function apiFetch(checkoutId) {
        const cached = cacheGet(checkoutId);
        if (cached) return Promise.resolve(cached);
        if (failureCacheActive(checkoutId)) return Promise.resolve(null);
        if (!currentConfig.api.enabled || apiForbidden) return Promise.resolve(null);
        const key = String(checkoutId);
        if (apiPending.has(key)) return apiPending.get(key);

        const pending = new Promise(function (resolve) {
            apiQueue.push({ id:key, resolve:resolve });
            pumpApiQueue();
        }).finally(function () {
            apiPending.delete(key);
        });
        apiPending.set(key, pending);
        return pending;
    }

    function pumpApiQueue() {
        const max = currentConfig.api.concurrency;
        while (activeApi < max && apiQueue.length) {
            const job = apiQueue.shift();
            activeApi += 1;
            doApiFetch(job.id)
                .then(job.resolve)
                .catch(function () { job.resolve(null); })
                .finally(function () {
                    activeApi -= 1;
                    pumpApiQueue();
                });
        }
    }

    function doApiFetch(checkoutId) {
        const endpoint = String(currentConfig.api.endpointTemplate || DEFAULT_CONFIG.api.endpointTemplate).replace("{id}", encodeURIComponent(checkoutId));
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        let timer = 0;
        if (controller) timer = window.setTimeout(function () { try { controller.abort(); } catch (_) {} }, currentConfig.api.timeoutMs);

        return window.fetch(endpoint, {
            method:"GET",
            credentials:"same-origin",
            cache:"no-store",
            headers:{ Accept:"application/json" },
            signal:controller ? controller.signal : undefined
        }).then(function (response) {
            if (timer) window.clearTimeout(timer);
            if (response.status === 401 || response.status === 403) {
                if (currentConfig.api.stopAfterForbidden !== false) apiForbidden = true;
                markApiFailure(checkoutId);
                debug("API renewal forbidden; DOM fallback retained", response.status);
                return null;
            }
            if (!response.ok) {
                markApiFailure(checkoutId);
                return null;
            }
            return response.json();
        }).then(function (data) {
            if (!data || typeof data !== "object") {
                markApiFailure(checkoutId);
                return null;
            }
            const normalized = {
                source:"api",
                allowsRenewal:typeof data.allows_renewal === "boolean" ? data.allows_renewal : null,
                maxRenewals:Number.isFinite(Number(data.max_renewals)) ? Number(data.max_renewals) : null,
                currentRenewals:Number.isFinite(Number(data.current_renewals)) ? Number(data.current_renewals) : null,
                unseenRenewals:Number.isFinite(Number(data.unseen_renewals)) ? Number(data.unseen_renewals) : null,
                error:data.error == null ? "" : String(data.error)
            };
            if (normalized.maxRenewals != null && normalized.currentRenewals != null) {
                normalized.remainingRenewals = Math.max(0, normalized.maxRenewals - normalized.currentRenewals);
            } else {
                normalized.remainingRenewals = null;
            }
            cacheSet(checkoutId, normalized);
            return normalized;
        }).catch(function (error) {
            if (timer) window.clearTimeout(timer);
            markApiFailure(checkoutId);
            if (error && error.name !== "AbortError") debug("allows_renewal failed", checkoutId, error);
            return null;
        });
    }

    function formatTemplate(template, vars) {
        return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, key) {
            return vars[key] == null ? "" : String(vars[key]);
        });
    }

    function resolvedState(dom, api) {
        const preferApi = currentConfig.active.statusSource !== "dom-only";

        /*
         * Le DOM Koha est prioritaire lorsqu'il contient une décision explicite
         * (blocage, autorisation ou quota). L'API ne peut pas renverser cet état ;
         * elle sert uniquement à compléter un DOM indéterminé ou à enrichir les
         * informations absentes.
         */
        let allows = dom && typeof dom.allowsRenewal === "boolean" ? dom.allowsRenewal : null;
        let source = dom && dom.authority ? dom.authority : "dom";

        if (!(dom && dom.authoritative) && preferApi && api && typeof api.allowsRenewal === "boolean") {
            allows = api.allowsRenewal;
            source = "api";
        }

        let counts = dom && dom.counts ? dom.counts : null;
        if (!counts && api && api.maxRenewals != null && api.currentRenewals != null) {
            counts = {
                remaining:api.remainingRenewals,
                total:api.maxRenewals,
                current:api.currentRenewals,
                source:"api"
            };
        }

        const unseen = dom && dom.unseen != null
            ? dom.unseen
            : (api && api.unseenRenewals != null ? api.unseenRenewals : null);

        let reason = dom && dom.reason ? dom.reason : (api && api.error ? api.error : "");
        if (allows === false && isGenericRestrictionReason(reason)) reason = "";

        const remainingRenewals = counts && Number.isFinite(Number(counts.remaining)) ? Number(counts.remaining) : null;
        const totalRenewals = counts && Number.isFinite(Number(counts.total)) ? Number(counts.total) : null;
        const currentRenewals = counts && Number.isFinite(Number(counts.current)) ? Number(counts.current) : 0;
        const quotaReached = Boolean(
            totalRenewals != null && totalRenewals > 0 &&
            remainingRenewals != null && remainingRenewals <= 0
        );

        // Le quota DOM à zéro reste impératif même si une API répondrait true.
        if (quotaReached && dom && dom.counts) {
            allows = false;
            source = "dom-quota";
        }

        return {
            allowsRenewal:allows,
            counts:counts,
            unseen:unseen,
            reason:reason,
            hasRenewed:currentRenewals > 0,
            quotaReached:quotaReached,
            source:source
        };
    }

    function applyAppearanceVars(card) {
        const a = currentConfig.appearance;
        card.style.setProperty("--pmk114-success-text", String(a.successText || DEFAULT_CONFIG.appearance.successText));
        card.style.setProperty("--pmk114-success-bg", String(a.successBg || DEFAULT_CONFIG.appearance.successBg));
        card.style.setProperty("--pmk114-success-border", String(a.successBorder || DEFAULT_CONFIG.appearance.successBorder));
        card.style.setProperty("--pmk114-danger-text", String(a.dangerText || DEFAULT_CONFIG.appearance.dangerText));
        card.style.setProperty("--pmk114-danger-bg", String(a.dangerBg || DEFAULT_CONFIG.appearance.dangerBg));
        card.style.setProperty("--pmk114-danger-border", String(a.dangerBorder || DEFAULT_CONFIG.appearance.dangerBorder));
        card.style.setProperty("--pmk114-neutral-text", String(a.neutralText || DEFAULT_CONFIG.appearance.neutralText));
        card.style.setProperty("--pmk114-neutral-bg", String(a.neutralBg || DEFAULT_CONFIG.appearance.neutralBg));
        card.style.setProperty("--pmk114-neutral-border", String(a.neutralBorder || DEFAULT_CONFIG.appearance.neutralBorder));
        card.style.setProperty("--pmk114-min-width", String(clampNumber(a.minWidthPx, 100, 600, 180)) + "px");
        card.style.setProperty("--pmk114-mobile-min-width", String(clampNumber(a.mobileMinWidthPx, 80, 400, 140)) + "px");
        card.classList.toggle("is-compact", Boolean(a.compact));
        card.classList.toggle("no-animation", a.animation === false);
    }

    function ensureCard(cell) {
        let card = safeQuery(cell, ":scope > .pmk114-card");
        if (!card) {
            card = document.createElement("div");
            card.className = "pmk114-card";
            card.setAttribute("data-pmk114-owned", "1");

            const status = document.createElement("div");
            status.className = "pmk114-status";
            const icon = document.createElement("span");
            icon.className = "pmk114-icon";
            icon.setAttribute("aria-hidden", "true");
            const text = document.createElement("span");
            text.className = "pmk114-status-text";
            status.appendChild(icon);
            status.appendChild(text);
            card.appendChild(status);

            const renewChoice = document.createElement("div");
            renewChoice.className = "pmk114-renew-choice";
            renewChoice.hidden = true;
            card.appendChild(renewChoice);

            const count = document.createElement("span");
            count.className = "pmk114-count";
            card.appendChild(count);

            const unseen = document.createElement("span");
            unseen.className = "pmk114-unseen";
            card.appendChild(unseen);

            const reason = document.createElement("span");
            reason.className = "pmk114-reason";
            card.appendChild(reason);

            cell.insertBefore(card, cell.firstChild);
        }
        applyAppearanceVars(card);
        enhancedCells.add(cell);
        cell.classList.add("pmk114-enhanced");
        return card;
    }

    function labelState(card, state, loading) {
        const icon = safeQuery(card, ".pmk114-icon");
        const text = safeQuery(card, ".pmk114-status-text");
        card.classList.remove("is-ok", "is-blocked", "is-unknown");

        if (state.allowsRenewal === true) {
            card.classList.add("is-ok");
            if (icon) icon.textContent = currentConfig.icons.renewable || "✅";
            if (text) text.textContent = local(currentConfig.labels.renewableFr, currentConfig.labels.renewableEn);
        } else if (state.allowsRenewal === false) {
            card.classList.add("is-blocked");
            if (icon) icon.textContent = currentConfig.icons.impossible || "⛔";
            if (text) text.textContent = state.quotaReached
                ? local(
                    currentConfig.labels.renewedQuotaFr || "Quota de renouvellements atteint",
                    currentConfig.labels.renewedQuotaEn || "Renewal limit reached"
                )
                : local(currentConfig.labels.impossibleFr, currentConfig.labels.impossibleEn);
        } else {
            card.classList.add("is-unknown");
            if (icon) icon.textContent = currentConfig.icons.unknown || "ℹ️";
            if (text) text.textContent = local(currentConfig.labels.unknownFr, currentConfig.labels.unknownEn);
        }

        card.classList.toggle("is-loading", Boolean(loading));
        card.setAttribute("data-source", state.source || "dom");
    }

    function renderCount(card, state) {
        const el = safeQuery(card, ".pmk114-count");
        if (!el) return;
        if (!currentConfig.active.showCounts || !state.counts || !Number.isFinite(Number(state.counts.total))) {
            el.hidden = true;
            el.textContent = "";
            return;
        }
        const vars = {
            remaining:Number(state.counts.remaining) || 0,
            current:Number(state.counts.current) || 0,
            total:Number(state.counts.total) || 0
        };
        const useUsed = currentConfig.active.countFormat === "used-total";
        const template = useUsed
            ? local(currentConfig.labels.usedFr, currentConfig.labels.usedEn)
            : local(currentConfig.labels.remainingFr, currentConfig.labels.remainingEn);
        el.textContent = formatTemplate(template, vars);
        el.hidden = false;
    }

    function renderUnseen(card, state) {
        const el = safeQuery(card, ".pmk114-unseen");
        if (!el) return;
        if (!currentConfig.active.showUnseenRenewals || state.unseen == null || Number(state.unseen) <= 0) {
            el.hidden = true;
            el.textContent = "";
            return;
        }
        el.textContent = formatTemplate(local(currentConfig.labels.unseenFr, currentConfig.labels.unseenEn), { count:Number(state.unseen) });
        el.hidden = false;
    }


    function isGenericRestrictionReason(reason) {
        const value = cleanText(reason).toLowerCase();
        if (!value) return false;
        return (
            value === "restriction" ||
            value === "not_allowed" ||
            value === "not allowed" ||
            /renewal\s+not\s+allowed/.test(value) ||
            /renouvellement\s+impossible/.test(value) ||
            /non\s+renouvelable/.test(value) ||
            /restriction.*renouvel/.test(value)
        );
    }

    function renderReason(card, state) {
        const el = safeQuery(card, ".pmk114-reason");
        if (!el) return;

        /*
         * Un motif générique "restriction" n'apporte rien au statut rouge
         * "Renouvellement impossible" et peut faire croire qu'un renouvellement
         * qui vient de réussir a échoué. On ne l'affiche jamais.
         * Les motifs réellement explicatifs (réservation, retard, quota, etc.)
         * restent disponibles.
         */
        if (
            !currentConfig.active.showReason ||
            !state.reason ||
            isGenericRestrictionReason(state.reason)
        ) {
            el.hidden = true;
            el.textContent = "";
            return;
        }

        const label = reasonLabel(state.reason);
        if (!label || isGenericRestrictionReason(label)) {
            el.hidden = true;
            el.textContent = "";
            return;
        }

        el.textContent = label;
        el.hidden = false;
    }

    function restoreNativeControl(checkbox) {
        if (!checkbox) return;
        const state = checkbox.__pmk114MoveState;
        if (!state) {
            checkbox.classList.remove("pmk114-native-checkbox");
            return;
        }

        const carrier = state.carrier;
        if (carrier) {
            safeQueryAll(carrier, ".pmk114-checkbox-label[data-pmk114-owned=\"1\"]").forEach(function (el) { el.remove(); });
        }

        const parent = state.originalParent;
        const next = state.originalNextSibling;
        if (parent && parent.isConnected) {
            try {
                if (state.generatedWrapper) {
                    if (next && next.parentNode === parent) parent.insertBefore(checkbox, next);
                    else parent.appendChild(checkbox);
                } else if (carrier) {
                    if (next && next.parentNode === parent) parent.insertBefore(carrier, next);
                    else parent.appendChild(carrier);
                }
            } catch (_) {}
        }

        if (carrier && !state.generatedWrapper) {
            carrier.classList.remove("pmk114-native-control");
            carrier.removeAttribute("data-pmk114-native-moved");
        }
        checkbox.classList.remove("pmk114-native-checkbox");
        checkbox.removeAttribute("data-pmk114-native-moved");
        try { delete checkbox.__pmk114MoveState; } catch (_) { checkbox.__pmk114MoveState = null; }
        movedNativeControls.delete(checkbox);
    }

    function checkboxLabelRoot(checkbox) {
        if (!checkbox) return null;
        const state = checkbox.__pmk114MoveState;
        if (state && state.carrier) return state.carrier;
        return checkbox.closest("label") || checkbox.parentElement;
    }

    function syncCheckboxLabel(checkbox) {
        if (!checkbox) return;
        const root = checkboxLabelRoot(checkbox);
        if (!root) return;

        let existingGenerated = safeQuery(root, ".pmk114-checkbox-label[data-pmk114-owned=\"1\"]");
        if (!currentConfig.active.showCheckboxLabel) {
            if (existingGenerated) existingGenerated.remove();
            return;
        }

        const clone = root.cloneNode(true);
        safeQueryAll(clone, ".pmk114-checkbox-label").forEach(function (el) { el.remove(); });
        const alreadyLabeled = /renouvel|renew/i.test(cleanText(clone.textContent));
        if (alreadyLabeled || existingGenerated) return;

        const label = document.createElement("span");
        label.className = "pmk114-checkbox-label";
        label.setAttribute("data-pmk114-owned", "1");
        label.textContent = local(currentConfig.labels.renewFr, currentConfig.labels.renewEn);
        root.appendChild(label);
    }

    function moveNativeControlIntoCard(cell, card, checkbox) {
        if (!cell || !card || !checkbox) return;
        const zone = safeQuery(card, ".pmk114-renew-choice");
        if (!zone) return;

        let state = checkbox.__pmk114MoveState;
        if (!state) {
            const nativeLabel = checkbox.closest("label");
            const movableNativeLabel = nativeLabel && cell.contains(nativeLabel) && !nativeLabel.closest(".pmk114-card");
            if (movableNativeLabel) {
                state = {
                    carrier:nativeLabel,
                    originalParent:nativeLabel.parentNode,
                    originalNextSibling:nativeLabel.nextSibling,
                    generatedWrapper:false
                };
                nativeLabel.classList.add("pmk114-native-control");
                nativeLabel.setAttribute("data-pmk114-native-moved", "1");
                zone.appendChild(nativeLabel);
            } else {
                const originalParent = checkbox.parentNode;
                const originalNextSibling = checkbox.nextSibling;
                const wrapper = document.createElement("label");
                wrapper.className = "pmk114-native-control pmk114-native-control-generated";
                wrapper.setAttribute("data-pmk114-owned", "1");
                wrapper.setAttribute("data-pmk114-native-moved", "1");
                state = {
                    carrier:wrapper,
                    originalParent:originalParent,
                    originalNextSibling:originalNextSibling,
                    generatedWrapper:true
                };
                wrapper.appendChild(checkbox);
                zone.appendChild(wrapper);
            }
            checkbox.__pmk114MoveState = state;
            checkbox.setAttribute("data-pmk114-native-moved", "1");
            movedNativeControls.add(checkbox);
        } else if (state.carrier && state.carrier.parentNode !== zone) {
            zone.appendChild(state.carrier);
        }

        zone.hidden = false;
        zone.classList.toggle("is-disabled", Boolean(checkbox.disabled));
        zone.setAttribute("aria-disabled", checkbox.disabled ? "true" : "false");
        syncCheckboxLabel(checkbox);
    }

    function styleNativeControl(cell, card, checkbox) {
        const zone = card ? safeQuery(card, ".pmk114-renew-choice") : null;
        if (!checkbox) {
            if (zone) zone.hidden = true;
            return;
        }

        checkbox.classList.add("pmk114-native-checkbox");

        if (currentConfig.active.integrateCheckboxInCard !== false && card) {
            moveNativeControlIntoCard(cell, card, checkbox);
            return;
        }

        if (checkbox.__pmk114MoveState) restoreNativeControl(checkbox);
        checkbox.classList.add("pmk114-native-checkbox");
        const parent = checkbox.closest("label") || checkbox.parentElement;
        if (parent && parent !== cell) parent.classList.add("pmk114-native-control");
        if (zone) zone.hidden = true;
        syncCheckboxLabel(checkbox);
    }

    function syncNativeControlAvailability(card, checkbox, state) {
        const zone = card ? safeQuery(card, ".pmk114-renew-choice") : null;
        if (!zone) return;

        const canRenew = Boolean(state && state.allowsRenewal === true && checkbox && !checkbox.disabled);
        zone.hidden = !canRenew;
        zone.classList.toggle("is-disabled", !canRenew);
        zone.setAttribute("aria-disabled", canRenew ? "false" : "true");

        /*
         * On ne désactive pas artificiellement la checkbox native Koha : elle
         * reste intacte pour préserver le fonctionnement du formulaire. On la
         * retire simplement de l'interface PMK quand Koha dit non renouvelable.
         */
    }

    function hideKnownNativeElements(cell) {
        safeQueryAll(cell, ".pmk114-hide-native").forEach(function (el) { el.classList.remove("pmk114-hide-native"); });
        if (!currentConfig.active.hideKnownNativeText) return;

        const selectors = [
            ".renewals-info",
            ".renewals-disabled",
            ".renewals",
            ".no-renew-hold",
            ".no-renew-too-many",
            ".no-renew-unseen",
            ".no-renew-overdue",
            ".no-renew-too-late",
            ".no-renewal-before",
            ".auto-renew-fines",
            ".auto-renew-expired"
        ];
        selectors.forEach(function (selector) {
            safeQueryAll(cell, selector).forEach(function (el) {
                if (el.closest(".pmk114-card")) return;
                if (safeQuery(el, 'input[type="checkbox"]')) return;
                el.classList.add("pmk114-hide-native");
            });
        });

        /*
         * Koha peut laisser un compteur numérique brut dans un <span> imbriqué
         * (ex. "0") à côté du texte .renewals-info. Une fois ce dernier repris
         * dans la carte PMK, ce nombre isolé devient un reliquat visuel.
         * On ne masque que les spans numériques/vides hors carte et sans contrôle.
         */
        safeQueryAll(cell, "span").forEach(function (el) {
            if (el.closest(".pmk114-card")) return;
            if (safeQuery(el, 'input,button,select,textarea,a[href]')) return;

            const text = cleanText(el.textContent);
            const hasMeaningfulChild = Array.from(el.children || []).some(function (child) {
                if (child.classList && child.classList.contains("pmk114-hide-native")) return false;
                const childText = cleanText(child.textContent);
                return childText && !/^\d+$/.test(childText);
            });

            if (!hasMeaningfulChild && (/^\d+$/.test(text) || text === "")) {
                el.classList.add("pmk114-hide-native");
            }
        });
    }

    function renderActiveCell(row, cell) {
        if (!cell || !cell.isConnected) return;
        const dom = domState(cell);
        if (!dom.checkbox && dom.allowsRenewal == null && !dom.rawText) return;

        const card = ensureCard(cell);
        card.hidden = false;
        const statusLine = safeQuery(card, ".pmk114-status");
        if (statusLine) statusLine.hidden = !currentConfig.active.showStatus;
        hideKnownNativeElements(cell);
        styleNativeControl(cell, card, dom.checkbox);

        const initial = resolvedState(dom, null);
        syncNativeControlAvailability(card, dom.checkbox, initial);
        labelState(card, initial, false);
        renderCount(card, initial);
        renderUnseen(card, initial);
        renderReason(card, initial);

        if (!currentConfig.api.enabled || apiForbidden) return;
        const checkoutId = extractCheckoutId(row, cell, dom.checkbox);
        if (!checkoutId) {
            card.setAttribute("data-api", "no-checkout-id");
            return;
        }

        const cached = cacheGet(checkoutId);
        if (cached) {
            const state = resolvedState(dom, cached);
            syncNativeControlAvailability(card, dom.checkbox, state);
            labelState(card, state, false);
            renderCount(card, state);
            renderUnseen(card, state);
            renderReason(card, state);
            card.setAttribute("data-api", "cache");
            return;
        }

        if (failureCacheActive(checkoutId)) {
            labelState(card, initial, false);
            card.setAttribute("data-api", "fallback-dom-cached");
            return;
        }

        // Si Koha donne déjà un état exploitable dans le DOM, l'API enrichit
        // silencieusement en arrière-plan : aucun spinner ne doit clignoter.
        // Le spinner n'est affiché que lorsque le DOM ne permet vraiment pas
        // de déterminer l'état du renouvellement.
        const needsVisibleLoading = initial.allowsRenewal == null;
        labelState(card, initial, needsVisibleLoading);
        card.setAttribute("data-api", needsVisibleLoading ? "loading" : "loading-silent");
        apiFetch(checkoutId).then(function (api) {
            if (!cell.isConnected || !card.isConnected) return;
            const freshDom = domState(cell);
            const state = resolvedState(freshDom, api);
            syncNativeControlAvailability(card, freshDom.checkbox, state);
            labelState(card, state, false);
            renderCount(card, state);
            renderUnseen(card, state);
            renderReason(card, state);
            card.setAttribute("data-api", api ? "ok" : "fallback-dom");
        });
    }

    function compilePatterns(raw) {
        return splitRules(raw).map(function (pattern) {
            try { return new RegExp(pattern, "i"); } catch (_) { return null; }
        }).filter(Boolean);
    }

    function historyMatch(text, patterns) {
        const value = cleanText(text);
        return patterns.some(function (rx) { return rx.test(value); });
    }

    function clearHistoryClasses(cell) {
        cell.classList.remove("pmk114-history-renewed", "pmk114-history-not-renewed");
        if (cell.getAttribute("data-pmk114-label-owned") === "1") {
            cell.classList.remove("label", "label-success", "label-default");
            cell.removeAttribute("data-pmk114-label-owned");
        }
        if (cell.getAttribute("data-pmk114-title-owned") === "1") {
            const original = cell.__pmk114OriginalTitle;
            if (original == null) cell.removeAttribute("title");
            else cell.setAttribute("title", original);
            cell.removeAttribute("data-pmk114-title-owned");
            try { delete cell.__pmk114OriginalTitle; } catch (_) { cell.__pmk114OriginalTitle = undefined; }
        }
    }

    function renderHistoryCell(cell) {
        if (!cell || !currentConfig.history.enabled) return;
        const text = nativeText(cell);
        if (!text) return;

        clearHistoryClasses(cell);
        const renewed = historyMatch(text, compilePatterns(currentConfig.history.renewedPatterns));
        const notRenewed = !renewed && historyMatch(text, compilePatterns(currentConfig.history.notRenewedPatterns));

        if (renewed) {
            cell.classList.add("pmk114-history-renewed");
            if (currentConfig.history.useLegacyLabelClasses) {
                cell.classList.add("label", "label-success");
                cell.setAttribute("data-pmk114-label-owned", "1");
            }
            cell.__pmk114OriginalTitle = cell.getAttribute("title");
            cell.title = local(currentConfig.history.renewedTooltipFr, currentConfig.history.renewedTooltipEn);
            cell.setAttribute("data-pmk114-title-owned", "1");
        } else if (notRenewed) {
            cell.classList.add("pmk114-history-not-renewed");
            if (currentConfig.history.useLegacyLabelClasses) {
                cell.classList.add("label", "label-default");
                cell.setAttribute("data-pmk114-label-owned", "1");
            }
            cell.__pmk114OriginalTitle = cell.getAttribute("title");
            cell.title = local(currentConfig.history.notRenewedTooltipFr, currentConfig.history.notRenewedTooltipEn);
            cell.setAttribute("data-pmk114-title-owned", "1");
        }
        enhancedCells.add(cell);
    }

    function processTable(table, page) {
        if (!table || !table.isConnected || !page) return;
        const columnIndex = findColumnIndex(table);
        const mode = page.mode || "active";
        const rows = safeQueryAll(table, "tbody tr");

        rows.forEach(function (row) {
            const lookupMode = mode === "history" ? "history" : "active";
            const cell = getCell(row, columnIndex, lookupMode);
            if (!cell) return;
            if (mode === "active" && currentConfig.active.enabled) renderActiveCell(row, cell);
            else if (mode === "history" && currentConfig.history.enabled) renderHistoryCell(cell);
            else if (mode === "both") {
                const state = domState(cell);
                if ((state.checkbox || state.allowsRenewal != null) && currentConfig.active.enabled) renderActiveCell(row, cell);
                else if (currentConfig.history.enabled) renderHistoryCell(cell);
            }
        });

        mountContextAccess(table, page);
        observeTable(table, page);
    }

    function observeTable(table, page) {
        if (tableObservers.has(table) || typeof MutationObserver !== "function") return;
        const target = safeQuery(table, "tbody") || table;
        const observer = new MutationObserver(function (mutations) {
            const meaningful = mutations.some(function (mutation) {
                if (mutation.type !== "childList") return false;
                return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
            });
            if (!meaningful) return;
            window.clearTimeout(mutationTimer);
            mutationTimer = window.setTimeout(function () { processTable(table, page); }, currentConfig.advanced.mutationDebounceMs);
        });
        observer.observe(target, { childList:true, subtree:true });
        tableObservers.set(table, observer);
    }


    function removeLegacy089SimulationButton() {
        // Le 089 historique ajoutait un bouton qui ne renouvelait rien : il simulait seulement le rendu.
        // Suppression défensive pendant la période de migration si 089 est encore chargé par erreur.
        safeQueryAll(document, "#selection_ops button, #selection_ops input[type=button], #selection_ops input[type=submit]").forEach(function (button) {
            const text = cleanText(button.textContent || button.value);
            if (text === "Renouveler la sélection" || text === "Renew selection") {
                button.remove();
            }
        });
    }

    function scan() {
        const page = currentPage();
        if (!currentConfig.enabled || !page) return 0;
        removeLegacy089SimulationButton();
        const tables = findTables(page);
        tables.forEach(function (table) { processTable(table, page); });
        return tables.length;
    }

    function startRootDiscovery() {
        stopRootDiscovery();
        if (typeof MutationObserver !== "function") return;
        const root = findMainRoot();
        if (!root) return;

        rootObserver = new MutationObserver(function (mutations) {
            const foundTableChange = mutations.some(function (mutation) {
                return Array.from(mutation.addedNodes || []).some(function (node) {
                    return node && node.nodeType === 1 && (node.tagName === "TABLE" || safeQuery(node, "table"));
                });
            });
            if (!foundTableChange) return;
            window.clearTimeout(mutationTimer);
            mutationTimer = window.setTimeout(scan, currentConfig.advanced.mutationDebounceMs);
        });
        rootObserver.observe(root, { childList:true, subtree:true });
        discoveryTimer = window.setTimeout(stopRootDiscovery, currentConfig.advanced.tableDiscoveryMs);
    }

    function stopRootDiscovery() {
        if (rootObserver) rootObserver.disconnect();
        rootObserver = null;
        if (discoveryTimer) window.clearTimeout(discoveryTimer);
        discoveryTimer = 0;
    }

    function mountContextAccess(table, page) {
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        const anchor = safeQuery(table, "thead th") || table;
        if (!anchor || anchor.getAttribute("data-pmk114-config-anchor") === "1") return;
        anchor.setAttribute("data-pmk114-config-anchor", "1");
        try {
            window.PMKConfig.mountContextButton({
                moduleId:MODULE_ID,
                anchor:anchor,
                position:"append",
                contextKey:CONTEXT_KEY + "-" + (page ? page.id : "page"),
                context:{ sectionId:"activation", pageId:page ? page.id : "" }
            });
        } catch (_) {}
    }

    function addStyles() {
        let style = document.getElementById(STYLE_ID);
        if (style) return;
        style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .pmk114-enhanced { padding: 6px 8px !important; }
            .pmk114-card {
                --pmk114-success-text:#155724;
                --pmk114-success-bg:#d4edda;
                --pmk114-success-border:#b7d7c2;
                --pmk114-danger-text:#721c24;
                --pmk114-danger-bg:#f8d7da;
                --pmk114-danger-border:#f5c6cb;
                --pmk114-neutral-text:#495057;
                --pmk114-neutral-bg:#f8f9fa;
                --pmk114-neutral-border:#dee2e6;
                --pmk114-min-width:180px;
                --pmk114-mobile-min-width:140px;
                box-sizing:border-box;
                display:flex;
                flex-direction:column;
                align-items:flex-start;
                gap:4px;
                min-width:var(--pmk114-min-width);
                padding:4px 8px;
                margin:0 0 4px 0;
                border:1px solid var(--pmk114-neutral-border);
                border-radius:6px;
                background:var(--pmk114-neutral-bg);
                color:var(--pmk114-neutral-text);
                font:inherit;
            }
            .pmk114-card:not(.no-animation) { animation:pmk114Fade .22s ease-out; }
            @keyframes pmk114Fade { from{opacity:0;transform:translateY(-3px)} to{opacity:1;transform:none} }
            .pmk114-card.is-ok { border-color:var(--pmk114-neutral-border); background:var(--pmk114-neutral-bg); color:var(--pmk114-success-text); }
            .pmk114-card.is-blocked { border-color:var(--pmk114-neutral-border); background:var(--pmk114-neutral-bg); color:var(--pmk114-danger-text); }
            .pmk114-card.is-unknown { border-color:var(--pmk114-neutral-border); background:var(--pmk114-neutral-bg); color:var(--pmk114-neutral-text); }
            .pmk114-status { display:flex; align-items:center; gap:5px; font-weight:600; line-height:1.25; }
            .pmk114-icon { flex:0 0 auto; }
            .pmk114-count {
                display:inline-block;
                padding:2px 9px;
                border:1px solid currentColor;
                border-radius:999px;
                font-size:.85em;
                font-weight:500;
                opacity:.96;
            }
            .pmk114-card.is-ok .pmk114-count { background:var(--pmk114-success-bg); border-color:var(--pmk114-success-border); color:var(--pmk114-success-text); }
            .pmk114-card.is-blocked .pmk114-count { background:var(--pmk114-danger-bg); border-color:var(--pmk114-danger-border); color:var(--pmk114-danger-text); }
            .pmk114-unseen,.pmk114-reason { font-size:.84em; line-height:1.3; }
            .pmk114-reason { font-weight:500; }
            .pmk114-card.is-loading::after { content:""; width:10px; height:10px; border:2px solid currentColor; border-right-color:transparent; border-radius:50%; animation:pmk114Spin .7s linear infinite; position:absolute; margin-left:calc(var(--pmk114-min-width) - 30px); margin-top:2px; opacity:.55; }
            @keyframes pmk114Spin { to{transform:rotate(360deg)} }
            .pmk114-card { position:relative; }
            .pmk114-renew-choice {
                display:flex;
                align-items:center;
                width:100%;
                box-sizing:border-box;
                margin:1px 0 2px 0;
                padding:4px 7px;
                border:1px solid var(--pmk114-neutral-border);
                border-radius:6px;
                background:rgba(255,255,255,.58);
            }
            .pmk114-renew-choice[hidden] { display:none !important; }
            .pmk114-card.is-ok .pmk114-renew-choice { border-color:var(--pmk114-success-border); background:var(--pmk114-success-bg); }
            .pmk114-card.is-blocked .pmk114-renew-choice { border-color:var(--pmk114-danger-border); background:var(--pmk114-danger-bg); }
            .pmk114-renew-choice.is-disabled { opacity:.68; }
            .pmk114-native-control {
                display:inline-flex !important;
                align-items:center;
                gap:7px;
                width:100%;
                margin:0 !important;
                padding:0 !important;
                border:0 !important;
                border-radius:0 !important;
                background:transparent !important;
                cursor:pointer;
                font-weight:600;
                line-height:1.3;
            }
            .pmk114-renew-choice.is-disabled .pmk114-native-control { cursor:not-allowed; }
            .pmk114-native-checkbox {
                flex:0 0 auto;
                width:1.05rem;
                height:1.05rem;
                margin:0 !important;
                accent-color:var(--pmk114-success-text);
                cursor:pointer;
            }
            .pmk114-native-checkbox:disabled { cursor:not-allowed; }
            .pmk114-checkbox-label { margin:0; font-size:.9em; font-weight:600; }
            .pmk114-hide-native { display:none !important; }
            .pmk114-history-renewed { font-weight:600; }
            .pmk114-history-not-renewed { font-weight:500; }
            .pmk114-card.is-compact { gap:2px; padding:3px 6px; font-size:.9em; }
            @media (max-width:768px) {
                .pmk114-card { min-width:var(--pmk114-mobile-min-width); font-size:.86em; padding:3px 6px; }
                .pmk114-count { padding:1px 7px; font-size:.8em; }
            }
            @media (prefers-reduced-motion:reduce) {
                .pmk114-card, .pmk114-card::after { animation:none !important; }
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function restoreRuntime() {
        stopRootDiscovery();
        window.clearTimeout(mutationTimer);
        mutationTimer = 0;
        tableObservers.forEach(function (observer) { try { observer.disconnect(); } catch (_) {} });
        tableObservers.clear();
        apiFailureCache.clear();

        Array.from(movedNativeControls).forEach(function (checkbox) {
            try { restoreNativeControl(checkbox); } catch (_) {}
        });
        movedNativeControls.clear();

        enhancedCells.forEach(function (cell) {
            if (!cell || !cell.isConnected) return;
            safeQueryAll(cell, ".pmk114-card, .pmk114-checkbox-label").forEach(function (el) {
                if (el.getAttribute("data-pmk114-owned") === "1") el.remove();
            });
            safeQueryAll(cell, ".pmk114-hide-native").forEach(function (el) { el.classList.remove("pmk114-hide-native"); });
            safeQueryAll(cell, ".pmk114-native-checkbox").forEach(function (el) { el.classList.remove("pmk114-native-checkbox"); });
            safeQueryAll(cell, ".pmk114-native-control").forEach(function (el) { el.classList.remove("pmk114-native-control"); });
            clearHistoryClasses(cell);
            cell.classList.remove("pmk114-enhanced");
        });
        enhancedCells.clear();
        safeQueryAll(document, "[data-pmk114-config-anchor=\"1\"]").forEach(function (el) { el.removeAttribute("data-pmk114-config-anchor"); });
    }

    function validateConfig(config) {
        const cfg = normalizeConfig(config);
        if (!Array.isArray(cfg.pages) || !cfg.pages.length) return { ok:false, message:local("Le module doit conserver au moins une page configurée.", "The module must keep at least one configured page.") };
        if (cfg.api.concurrency < 1 || cfg.api.concurrency > 8) return { ok:false, message:local("La concurrence API doit être comprise entre 1 et 8.", "API concurrency must be between 1 and 8.") };
        return { ok:true };
    }

    function buildModuleDefinition() {
        return {
            id:MODULE_ID,
            schemaVersion:3,
            name:{ fr:"Améliorations des renouvellements", en:"Renewal enhancements" },
            description:{
                fr:"Module maître issu des 114 et 089 : améliore l'affichage des renouvellements sans remplacer les contrôles Koha, enrichit les états via l'API et présente l'historique R/N.",
                en:"Master module from legacy 114 and 089: improves renewal display without replacing Koha controls, enriches states through the API and presents R/N history."
            },
            category:{ fr:"Circulation & historique", en:"Circulation & history" },
            supportedPages:["circ.circulation","members.moremember","members.memberhistory","circ.returns"],
            prerequisites:[],
            dependencies:[],
            defaults:deepClone(DEFAULT_CONFIG),
            validate:validateConfig,
            schema:[
                {
                    type:"section", id:"activation", label:{fr:"Activation et pages",en:"Activation and pages"},
                    fields:[
                        {key:"enabled",type:"boolean",label:{fr:"Activer les améliorations de renouvellement",en:"Enable renewal enhancements"}},
                        {
                            key:"pages", type:"repeater", reorder:false, removable:false,
                            label:{fr:"Pages Koha",en:"Koha pages"},
                            itemTitle:function (item, index, language) { return language === "en" ? (item.labelEn || item.path) : (item.labelFr || item.path); },
                            fields:[
                                {key:"enabled",type:"boolean",label:{fr:"Activer sur cette page",en:"Enable on this page"}},
                                {key:"path",type:"text",readOnly:true,label:{fr:"Chemin",en:"Path"}},
                                {key:"mode",type:"select",label:{fr:"Fonction de la page",en:"Page role"},options:[
                                    {value:"active",label:{fr:"Prêts actifs",en:"Active checkouts"}},
                                    {value:"history",label:{fr:"Historique / état R-N",en:"History / R-N state"}},
                                    {value:"both",label:{fr:"Les deux",en:"Both"}}
                                ]}
                            ]
                        }
                    ]
                },
                {
                    type:"section", id:"active", label:{fr:"Prêts actifs",en:"Active checkouts"},
                    description:{fr:"Les contrôles natifs Koha sont toujours conservés. Le module ajoute uniquement une présentation autour d'eux.",en:"Native Koha controls are always preserved. The module only adds presentation around them."},
                    fields:[
                        {key:"active.enabled",type:"boolean",label:{fr:"Améliorer les cellules de renouvellement",en:"Enhance renewal cells"}},
                        {key:"active.showStatus",type:"boolean",label:{fr:"Afficher l'état possible / impossible",en:"Show available / unavailable status"}},
                        {key:"active.showCounts",type:"boolean",label:{fr:"Afficher les compteurs de renouvellement",en:"Show renewal counters"}},
                        {key:"active.countFormat",type:"select",label:{fr:"Présentation du compteur",en:"Counter format"},options:[
                            {value:"remaining-total",label:{fr:"Restants / maximum — historique",en:"Remaining / maximum — historical"}},
                            {value:"used-total",label:{fr:"Utilisés / maximum",en:"Used / maximum"}}
                        ]},
                        {key:"active.showReason",type:"boolean",label:{fr:"Afficher le motif de blocage",en:"Show blocking reason"}},
                        {key:"active.showUnseenRenewals",type:"boolean",label:{fr:"Afficher les renouvellements non vus",en:"Show unseen renewals"}},
                        {key:"active.integrateCheckboxInCard",type:"boolean",label:{fr:"Intégrer la case Koha dans la carte de renouvellement",en:"Integrate the Koha checkbox into the renewal card"},help:{fr:"Déplace uniquement le contrôle natif existant : aucune case n'est recréée et l'action Koha reste inchangée.",en:"Moves only the existing native control: no checkbox is recreated and Koha's action remains unchanged."}},
                        {key:"active.showCheckboxLabel",type:"boolean",label:{fr:"Ajouter « Renouveler » si la case Koha n'a pas de libellé visible",en:"Add “Renew” when Koha checkbox has no visible label"}},
                        {key:"active.hideKnownNativeText",type:"boolean",label:{fr:"Masquer les textes Koha redondants déjà repris dans la carte",en:"Hide redundant Koha text already represented in the card"}},
                        {key:"active.statusSource",type:"select",advanced:true,label:{fr:"Source de l'état",en:"Status source"},options:[
                            {value:"api-preferred",label:{fr:"API Koha si disponible, sinon DOM — recommandé",en:"Koha API when available, otherwise DOM — recommended"}},
                            {value:"dom-only",label:{fr:"DOM Koha uniquement",en:"Koha DOM only"}}
                        ]}
                    ]
                },
                {
                    type:"section", id:"api", label:{fr:"API Koha — enrichissement",en:"Koha API — enrichment"},
                    description:{fr:"Lecture uniquement de allows_renewal. Aucun POST de renouvellement n'est effectué par ce module.",en:"Read-only use of allows_renewal. This module never sends renewal POST requests."},
                    fields:[
                        {key:"api.enabled",type:"boolean",label:{fr:"Enrichir avec l'API Koha",en:"Enrich with Koha API"}},
                        {key:"api.concurrency",type:"number",min:1,max:8,label:{fr:"Appels simultanés maximum",en:"Maximum concurrent calls"}},
                        {key:"api.timeoutMs",type:"number",min:1000,max:20000,advanced:true,label:{fr:"Délai maximal d'un appel (ms)",en:"Request timeout (ms)"}},
                        {key:"api.cacheMs",type:"number",min:0,max:3600000,advanced:true,label:{fr:"Durée du cache (ms)",en:"Cache duration (ms)"}},
                        {key:"api.endpointTemplate",type:"text",advanced:true,label:{fr:"Endpoint allows_renewal",en:"allows_renewal endpoint"}},
                        {key:"api.stopAfterForbidden",type:"boolean",advanced:true,label:{fr:"Après un 401/403, rester en mode DOM jusqu'au prochain chargement",en:"After 401/403, stay in DOM mode until next page load"}},
                        {key:"api.trustCheckboxValueWhenNamedIssue",type:"boolean",advanced:true,label:{fr:"Accepter la valeur d'une case Koha nommée issue comme checkout_id",en:"Accept a Koha checkbox named issue as checkout_id"}},
                        {key:"api.trustCheckboxValueWhenNamedRenew",type:"boolean",advanced:true,label:{fr:"Accepter la valeur d'une case nommée renew comme checkout_id",en:"Accept a checkbox named renew as checkout_id"}}
                    ]
                },
                {
                    type:"section", id:"history", label:{fr:"Historique — héritage du 089",en:"History — legacy 089"},
                    description:{fr:"Reprend sans action simulée la mise en évidence R / N / « renouvelé » du script 089.",en:"Preserves the R / N / “renewed” presentation from script 089 without its simulated action."},
                    fields:[
                        {key:"history.enabled",type:"boolean",label:{fr:"Mettre en évidence l'état de renouvellement dans l'historique",en:"Highlight renewal state in history"}},
                        {key:"history.useLegacyLabelClasses",type:"boolean",label:{fr:"Conserver les classes visuelles historiques label-success / label-default",en:"Keep historical label-success / label-default classes"}},
                        {key:"history.renewedPatterns",type:"textarea",advanced:true,label:{fr:"Motifs considérés comme renouvelé (séparés par ;)",en:"Patterns considered renewed (separated by ;)"}},
                        {key:"history.notRenewedPatterns",type:"textarea",advanced:true,label:{fr:"Motifs considérés comme non renouvelé",en:"Patterns considered not renewed"}},
                        {key:"history.renewedTooltipFr",type:"text",label:{fr:"Infobulle renouvelé — FR",en:"Renewed tooltip — FR"}},
                        {key:"history.renewedTooltipEn",type:"text",label:{fr:"Infobulle renouvelé — EN",en:"Renewed tooltip — EN"}},
                        {key:"history.notRenewedTooltipFr",type:"text",label:{fr:"Infobulle non renouvelé — FR",en:"Not renewed tooltip — FR"}},
                        {key:"history.notRenewedTooltipEn",type:"text",label:{fr:"Infobulle non renouvelé — EN",en:"Not renewed tooltip — EN"}}
                    ]
                },
                {
                    type:"section", id:"labels", label:{fr:"Textes et icônes",en:"Labels and icons"},
                    fields:[
                        {key:"icons.renewable",type:"text",label:{fr:"Icône renouvellement possible",en:"Renewable icon"}},
                        {key:"icons.impossible",type:"text",label:{fr:"Icône renouvellement impossible",en:"Unavailable icon"}},
                        {key:"icons.blocked",type:"text",label:{fr:"Icône renouvellement bloqué",en:"Blocked icon"}},
                        {key:"labels.renewableFr",type:"text",label:{fr:"Texte possible — FR",en:"Available text — FR"}},
                        {key:"labels.renewableEn",type:"text",label:{fr:"Texte possible — EN",en:"Available text — EN"}},
                        {key:"labels.impossibleFr",type:"text",label:{fr:"Texte impossible — FR",en:"Unavailable text — FR"}},
                        {key:"labels.impossibleEn",type:"text",label:{fr:"Texte impossible — EN",en:"Unavailable text — EN"}},
                        {key:"labels.blockedFr",type:"text",label:{fr:"Texte bloqué — FR",en:"Blocked text — FR"}},
                        {key:"labels.blockedEn",type:"text",label:{fr:"Texte bloqué — EN",en:"Blocked text — EN"}},
                        {key:"labels.renewedUnavailableFr",type:"text",label:{fr:"Texte après renouvellement — FR",en:"Post-renewal text — FR"},help:{fr:"Affiché lorsqu'au moins un renouvellement a réussi mais qu'un nouveau renouvellement n'est pas disponible.",en:"Shown when at least one renewal has succeeded but another renewal is not available."}},
                        {key:"labels.renewedUnavailableEn",type:"text",label:{fr:"Texte après renouvellement — EN",en:"Post-renewal text — EN"}},
                        {key:"labels.renewedQuotaFr",type:"text",label:{fr:"Texte quota atteint — FR",en:"Renewal limit text — FR"}},
                        {key:"labels.renewedQuotaEn",type:"text",label:{fr:"Texte quota atteint — EN",en:"Renewal limit text — EN"}},
                        {key:"labels.remainingFr",type:"text",advanced:true,label:{fr:"Format compteur restants — FR",en:"Remaining counter format — FR"}},
                        {key:"labels.remainingEn",type:"text",advanced:true,label:{fr:"Format compteur restants — EN",en:"Remaining counter format — EN"}}
                    ]
                },
                {
                    type:"section", id:"reasons", label:{fr:"Motifs de blocage",en:"Blocking reasons"}, advanced:true,
                    fields:[
                        {
                            key:"reasonLabels",type:"repeater",label:{fr:"Libellés des motifs API/DOM",en:"API/DOM reason labels"},
                            fields:[
                                {key:"enabled",type:"boolean",label:{fr:"Actif",en:"Enabled"}},
                                {key:"code",type:"text",label:{fr:"Code",en:"Code"}},
                                {key:"fr",type:"text",label:{fr:"Libellé FR",en:"FR label"}},
                                {key:"en",type:"text",label:{fr:"Libellé EN",en:"EN label"}}
                            ]
                        }
                    ]
                },
                {
                    type:"section", id:"appearance", label:{fr:"Apparence",en:"Appearance"},
                    fields:[
                        {key:"appearance.compact",type:"boolean",label:{fr:"Mode compact",en:"Compact mode"}},
                        {key:"appearance.animation",type:"boolean",label:{fr:"Animation légère à l'apparition",en:"Light entrance animation"}},
                        {key:"appearance.minWidthPx",type:"number",min:100,max:600,label:{fr:"Largeur minimale carte (px)",en:"Card minimum width (px)"}},
                        {key:"appearance.mobileMinWidthPx",type:"number",min:80,max:400,label:{fr:"Largeur minimale mobile (px)",en:"Mobile minimum width (px)"}},
                        {key:"appearance.successText",type:"color",label:{fr:"Texte possible",en:"Available text"}},
                        {key:"appearance.successBg",type:"color",label:{fr:"Fond possible",en:"Available background"}},
                        {key:"appearance.dangerText",type:"color",label:{fr:"Texte impossible",en:"Unavailable text"}},
                        {key:"appearance.dangerBg",type:"color",label:{fr:"Fond impossible",en:"Unavailable background"}}
                    ]
                },
                {
                    type:"section", id:"advanced", label:{fr:"Ciblage et diagnostic",en:"Targeting and diagnostics"}, advanced:true,
                    fields:[
                        {key:"advanced.renewalHeaderWords",type:"text",advanced:true,label:{fr:"Mots reconnus dans l'en-tête de colonne",en:"Words recognized in renewal header"}},
                        {key:"advanced.activeCellSelectors",type:"text",advanced:true,label:{fr:"Sélecteurs cellules prêts actifs",en:"Active checkout cell selectors"}},
                        {key:"advanced.historyCellSelectors",type:"text",advanced:true,label:{fr:"Sélecteurs cellules historique",en:"History cell selectors"}},
                        {key:"advanced.mainRootSelectors",type:"text",advanced:true,label:{fr:"Zones dans lesquelles rechercher les tableaux",en:"Roots in which tables are searched"}},
                        {key:"advanced.mutationDebounceMs",type:"number",min:20,max:2000,advanced:true,label:{fr:"Délai après redessin tableau (ms)",en:"Delay after table redraw (ms)"}},
                        {key:"advanced.tableDiscoveryMs",type:"number",min:1000,max:60000,advanced:true,label:{fr:"Durée de surveillance d'apparition des tableaux (ms)",en:"Table discovery watch duration (ms)"}},
                        {key:"advanced.diagnostics",type:"boolean",advanced:true,label:{fr:"Diagnostic console",en:"Console diagnostics"}}
                    ]
                }
            ],
            focusContext:function (main, context) {
                if (!main) return;
                const wanted = context && context.sectionId ? context.sectionId : "activation";
                const section = main.querySelector('[data-pmk-section-id="' + wanted + '"]') || main.querySelector('[data-pmk-section-id="activation"]');
                if (section) window.setTimeout(function () { section.scrollIntoView({ block:"start", behavior:"smooth" }); }, 0);
            }
        };
    }

    function registerModule() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return false;
        try { window.PMKConfig.registerModule(buildModuleDefinition()); } catch (error) { debug("registerModule failed", error); return false; }
        if (typeof window.PMKConfig.subscribe === "function" && !unsubscribeConfig) {
            try {
                unsubscribeConfig = window.PMKConfig.subscribe(MODULE_ID, function (cfg) { applyConfig(cfg); });
            } catch (_) {}
        }
        return true;
    }

    function loadConfig() {
        registerModule();
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") return Promise.resolve(deepClone(DEFAULT_CONFIG));
        return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
            .then(normalizeConfig)
            .catch(function () { return deepClone(DEFAULT_CONFIG); });
    }

    function applyConfig(config) {
        restoreRuntime();
        currentConfig = normalizeConfig(config);
        addStyles();
        apiForbidden = false;
        apiQueue.splice(0, apiQueue.length);
        if (!currentConfig.enabled || !currentPage()) return false;
        window.setTimeout(function () {
            scan();
            startRootDiscovery();
        }, currentConfig.advanced.initialScanDelayMs);
        return true;
    }

    function start() {
        if (registerModule()) {
            loadConfig().then(applyConfig);
            return;
        }

        applyConfig(DEFAULT_CONFIG);
        const ready = function () {
            window.removeEventListener("pmk:config-ready", ready);
            loadConfig().then(applyConfig);
        };
        window.addEventListener("pmk:config-ready", ready, { once:true });
        window.setTimeout(function () {
            if (window.PMKConfig) loadConfig().then(applyConfig);
        }, 6000);
    }

    window.PMK114RenewalEnhancements = {
        moduleId:MODULE_ID,
        version:MODULE_VERSION,
        defaults:deepClone(DEFAULT_CONFIG),
        refresh:function () { return loadConfig().then(applyConfig); },
        scan:scan,
        parseCounts:parseCounts,
        extractCheckoutId:extractCheckoutId,
        clearApiCache:function () { apiCache.clear(); apiForbidden = false; },
        destroy:restoreRuntime
    };

    // Compatibilité historique : l'ancien 114 exposait cette fonction.
    window.refreshRenewalDisplay = scan;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once:true });
    } else {
        start();
    }
})(window, document);

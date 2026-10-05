/*
 Nom du fichier : 113-autocomplete-elestic.js
 Module PMK : search-autocomplete-performance
 Version : 3.1.0-preplugin
 Date : 2026-09-21
 Description :
   Autocomplétion catalogue Koha enrichie issue du script historique 113.
   Conserve le scoring, les 20 résultats, les 8 enrichissements automatiques,
   la disponibilité locale/ailleurs, la cote, les couvertures Electre et
   le bouton de recherche classique.

   Évolutions 3.0 :
   - recherche code-barres exemplaire via /api/v1/items?external_id=... ;
   - fusion des résultats exemplaire + notice par biblio_id ;
   - priorité maximale au CB exact ;
   - réutilisation facultative du moteur de reconnaissance du module 036 ;
   - cache recherche / disponibilité / code-barres / couverture ;
   - disponibilité groupée via /api/v1/items, avec repli par notice ;
   - concurrence bornée pour les enrichissements ;
   - configuration PMK complète, FR/EN, responsive et rendu Koha intégré ;
   - annulation stricte des recherches devenues obsolètes.
   - constructeur accessible de formats de codes-barres (sans regex obligatoire) ;
   - preset Dracénie DR + 9 chiffres et test visuel des exemples ;
   - la regex reste disponible uniquement pour les formats experts.

 IMPORTANT :
   - aucune écriture dans Koha ;
   - aucune recherche externe Google Books ;
   - la recherche classique Koha reste la référence exhaustive.
*/
(function (window, document, $) {
    "use strict";

    const MODULE_ID = "search-autocomplete-performance";
    const MODULE_VERSION = "3.1.0-preplugin";
    const OWNED_DATA_KEY = "pmk113Owned";
    const STYLE_ID = "pmk113-autocomplete-styles";
    const PREVIEW_ID = "pmk113-cover-preview";
    const CONTEXT_KEY = "pmk113-search-autocomplete";

    if (!window || !document || !$) return;
    if (window.__PMK113AutocompleteV3) return;
    window.__PMK113AutocompleteV3 = true;

    const HISTORICAL_INDEX_MAPPINGS = [
        { enabled:true, indexCode:"au", fields:"author" },
        { enabled:true, indexCode:"pn", fields:"author" },
        { enabled:true, indexCode:"ti", fields:"title,unititle" },
        { enabled:true, indexCode:"se", fields:"title" },
        { enabled:true, indexCode:"nb", fields:"isbn" },
        { enabled:true, indexCode:"ns", fields:"issn" },
        { enabled:true, indexCode:"pb", fields:"publisher" },
        { enabled:true, indexCode:"pl", fields:"publication_place" },
        { enabled:true, indexCode:"nt", fields:"notes" },
        { enabled:true, indexCode:"callnum", fields:"cn_sort" },
        { enabled:true, indexCode:"yr", fields:"publication_year" }
    ];

    const DEFAULT_CONFIG = {
        enabled: true,
        scope: {
            inputSelector: "#search-form",
            indexSelector: "#idx_0",
            pageMode: "where-input-exists",
            pages: [
                { enabled:true, path:"/cgi-bin/koha/mainpage.pl", labelFr:"Accueil Koha", labelEn:"Koha home" },
                { enabled:true, path:"/cgi-bin/koha/catalogue/search.pl", labelFr:"Recherche catalogue", labelEn:"Catalogue search" }
            ]
        },
        search: {
            minLength: 3,
            delayMs: 180,
            resultsCount: 20,
            keywordFields: "title,author,unititle",
            indexMappings: HISTORICAL_INDEX_MAPPINGS,
            replaceExistingAutocomplete: true,
            classicSearchEnabled: true,
            warningEnabled: true,
            warningFr: "Attention, toutes les zones des notices ne sont pas interrogées par ce système. N’hésitez pas à lancer quand même une recherche classique.",
            warningEn: "Not all record fields are searched by these suggestions. Use the full Koha search when needed.",
            zonesFr: "Zones interrogées : titre, sous-titre, auteur, éditeur, année, ISBN, ISSN, notes, cote, lieu de publication et code-barres d’exemplaire.",
            zonesEn: "Searched fields: title, subtitle, author, publisher, year, ISBN, ISSN, notes, call number, publication place and item barcode.",
            classicButtonFr: "Lancer une recherche classique",
            classicButtonEn: "Run full Koha search"
        },
        barcode: {
            enabled: true,
            use036Recognizer: true,
            accepted036ProfileIds: "koha-barcode-index,isbn13,isbn10,issn,ean13,upca,ean8,dr-prefix,numeric-10,generic-numeric,generic-alphanumeric,aim-code128,aim-code39,aim-ean-upc",
            forcedIndexCodes: "bc,barcode",
            exactEnabled: true,
            prefixEnabled: true,
            prefixMinLength: 8,
            maxMatches: 10,
            displayBarcode: true,
            exactScoreBonus: 5000,
            prefixScoreBonus: 1800,
            fallbackProfiles: [
                {
                    id: "dr-9-digits",
                    enabled: true,
                    labelFr: "Dracénie — DR + 9 chiffres",
                    labelEn: "Dracénie — DR + 9 digits",
                    mode: "prefix-digits",
                    prefix: "DR",
                    minLength: 9,
                    maxLength: 9,
                    example: "DR100007790",
                    regex: ""
                },
                {
                    id: "numeric-library-barcode",
                    enabled: true,
                    labelFr: "Code-barres numérique",
                    labelEn: "Numeric barcode",
                    mode: "digits",
                    prefix: "",
                    minLength: 8,
                    maxLength: 40,
                    example: "90405001081712",
                    regex: ""
                },
                {
                    id: "alphanumeric-library-barcode",
                    enabled: true,
                    labelFr: "Code-barres alphanumérique générique",
                    labelEn: "Generic alphanumeric barcode",
                    mode: "alphanumeric",
                    prefix: "",
                    minLength: 8,
                    maxLength: 40,
                    example: "A12345678",
                    regex: ""
                }
            ]
        },
        scoring: {
            titleTerm: 120,
            authorTerm: 90,
            unititleTerm: 70,
            publisherTerm: 35,
            yearTerm: 15,
            itemTypeTerm: 10,
            isbnTerm: 25,
            eanTerm: 25,
            titleExact: 900,
            titlePrefix: 500,
            titleContains: 220,
            authorExact: 650,
            authorPrefix: 350,
            unititleExact: 400,
            allTermsInTitle: 350,
            isbnExact: 1200,
            eanExact: 1200
        },
        availability: {
            enabled: true,
            autoEnrichCount: 8,
            strategy: "bulk-then-queue",
            concurrency: 3,
            bulkMaxItems: 500,
            showHereElsewhere: true,
            showCallnumber: true,
            cacheTtlMs: 60000
        },
        covers: {
            enabled: true,
            autoLoad: true,
            autoEnrichCount: 8,
            provider: "electre",
            endpoint: "/api/v1/contrib/electre/image",
            useFallbackUrl: true,
            concurrency: 1,
            cacheTtlMs: 3600000,
            previewEnabled: true,
            previewWidthPx: 220,
            previewHeightPx: 320,
            thumbWidthPx: 40,
            thumbHeightPx: 55
        },
        performance: {
            searchCacheTtlMs: 30000,
            barcodeCacheTtlMs: 60000,
            maxSearchCacheEntries: 80,
            abortObsoleteRequests: true
        },
        display: {
            kohaIntegrated: true,
            maxHeightPx: 500,
            menuWidthMode: "input",
            fixedWidthPx: 520,
            showAuthor: true,
            showPublisher: true,
            showYear: true,
            showItemType: true,
            responsiveBreakpointPx: 576
        }
    };

    let currentConfig = deepClone(DEFAULT_CONFIG);
    let configRegistered = false;
    let unsubscribeConfig = null;
    let $input = $();
    let searchGeneration = 0;
    let activeSearchXhrs = [];
    let currentItemMap = new Map();
    let searchCache = new Map();
    let barcodeCache = new Map();
    let availabilityCache = new Map();
    let coverCache = new Map();
    let availabilityQueue = [];
    let availabilityRunning = 0;
    let availabilityQueuedKeys = new Set();
    let coverQueue = [];
    let coverRunning = 0;
    let coverQueuedKeys = new Set();
    let previewBound = false;
    let lazyBound = false;
    let moduleStarted = false;

    function deepClone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function isObject(value) {
        return !!value && typeof value === "object" && !Array.isArray(value);
    }

    function mergeDeep(base, patch) {
        if (Array.isArray(base)) {
            return Array.isArray(patch) ? deepClone(patch) : deepClone(base);
        }
        if (!isObject(base)) return patch === undefined ? base : deepClone(patch);
        const out = {};
        Object.keys(base).forEach(function (key) {
            out[key] = deepClone(base[key]);
        });
        if (isObject(patch)) {
            Object.keys(patch).forEach(function (key) {
                if (isObject(base[key]) && isObject(patch[key])) out[key] = mergeDeep(base[key], patch[key]);
                else out[key] = deepClone(patch[key]);
            });
        }
        return out;
    }

    function clampNumber(value, fallback, min, max) {
        let n = Number(value);
        if (!Number.isFinite(n)) n = Number(fallback);
        if (Number.isFinite(min)) n = Math.max(min, n);
        if (Number.isFinite(max)) n = Math.min(max, n);
        return n;
    }

    function splitCsv(value) {
        return String(value || "")
            .split(/[,\n;]+/)
            .map(function (s) { return s.trim(); })
            .filter(Boolean);
    }

    function escapeRegexLiteral(value) {
        return String(value == null ? "" : value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function normalizeBarcodeProfile(profile, index) {
        profile = profile && typeof profile === "object" ? profile : {};
        let mode = String(profile.mode || "").trim();
        if (["digits", "alphanumeric", "prefix-digits", "prefix-alphanumeric", "expert"].indexOf(mode) === -1) {
            mode = profile.regex ? "expert" : "alphanumeric";
        }
        let minLength = clampNumber(profile.minLength, mode === "expert" ? 1 : 8, 0, 128);
        let maxLength = clampNumber(profile.maxLength, mode === "expert" ? Math.max(minLength, 128) : Math.max(minLength, 40), 0, 128);
        if (maxLength < minLength) maxLength = minLength;
        return {
            id: String(profile.id || ("barcode-" + String(index + 1))).trim(),
            enabled: profile.enabled !== false,
            labelFr: String(profile.labelFr || profile.label || "Format de code-barres").trim(),
            labelEn: String(profile.labelEn || profile.label || "Barcode format").trim(),
            mode: mode,
            prefix: String(profile.prefix || ""),
            minLength: minLength,
            maxLength: maxLength,
            example: String(profile.example || "").trim(),
            regex: String(profile.regex || "").trim()
        };
    }

    function barcodeProfileRegexSource(profile) {
        const p = normalizeBarcodeProfile(profile, 0);
        if (p.mode === "expert") return p.regex;

        const min = Math.max(0, Number(p.minLength) || 0);
        const max = Math.max(min, Number(p.maxLength) || min);
        const quantifier = min === max ? "{" + min + "}" : "{" + min + "," + max + "}";
        const prefix = escapeRegexLiteral(p.prefix || "");

        if (p.mode === "digits") return "^[0-9]" + quantifier + "$";
        if (p.mode === "prefix-digits") return "^" + prefix + "[0-9]" + quantifier + "$";
        if (p.mode === "prefix-alphanumeric") return "^" + prefix + "(?=[A-Za-z0-9*._-]" + quantifier + "$)(?=.*[0-9])[A-Za-z0-9*._-]+$";
        return "^(?=[A-Za-z0-9*._-]" + quantifier + "$)(?=.*[0-9])[A-Za-z0-9*._-]+$";
    }

    function barcodeProfileRegex(profile) {
        return safeRegex(barcodeProfileRegexSource(profile));
    }

    function getBarcodeProfileFromPath(root, path) {
        if (!root || !Array.isArray(path) || !root.barcode || !Array.isArray(root.barcode.fallbackProfiles)) return null;
        const pos = path.indexOf("fallbackProfiles");
        if (pos === -1) return null;
        const index = Number(path[pos + 1]);
        return Number.isInteger(index) ? root.barcode.fallbackProfiles[index] : null;
    }

    function barcodeProfileUsesPrefix(root, path) {
        const p = getBarcodeProfileFromPath(root, path);
        return Boolean(p && (p.mode === "prefix-digits" || p.mode === "prefix-alphanumeric"));
    }

    function barcodeProfileUsesBuilder(root, path) {
        const p = getBarcodeProfileFromPath(root, path);
        return Boolean(p && p.mode !== "expert");
    }

    function barcodeProfileIsExpert(root, path) {
        const p = getBarcodeProfileFromPath(root, path);
        return Boolean(p && p.mode === "expert");
    }

    function renderBarcodeProfilePreview(context) {
        const root = context && context.rootObject;
        const path = context && Array.isArray(context.fieldPath) ? context.fieldPath : [];
        const p = getBarcodeProfileFromPath(root, path);
        const node = document.createElement("div");
        node.style.cssText = "padding:8px 10px;border:1px solid #d8dee4;border-radius:6px;background:#f8f9fa;font-size:13px";
        if (!p) {
            node.textContent = tr("Format indisponible.", "Format unavailable.");
            return node;
        }
        const source = barcodeProfileRegexSource(p);
        const rx = safeRegex(source);
        const example = String(p.example || "").trim();
        const ok = Boolean(example && rx && rx.test(example));

        const summary = document.createElement("div");
        summary.style.fontWeight = "600";
        if (p.mode === "prefix-digits") {
            summary.textContent = tr("Format : préfixe « " + p.prefix + " » + " + p.minLength + (p.minLength === p.maxLength ? " chiffres" : " à " + p.maxLength + " chiffres"),
                "Format: prefix “" + p.prefix + "” + " + p.minLength + (p.minLength === p.maxLength ? " digits" : " to " + p.maxLength + " digits"));
        } else if (p.mode === "prefix-alphanumeric") {
            summary.textContent = tr("Format : préfixe « " + p.prefix + " » + caractères alphanumériques", "Format: prefix “" + p.prefix + "” + alphanumeric characters");
        } else if (p.mode === "digits") {
            summary.textContent = tr("Format : chiffres uniquement", "Format: digits only");
        } else if (p.mode === "alphanumeric") {
            summary.textContent = tr("Format : lettres, chiffres et séparateurs usuels", "Format: letters, digits and common separators");
        } else {
            summary.textContent = tr("Format expert", "Expert format");
        }
        node.appendChild(summary);

        const test = document.createElement("div");
        test.style.marginTop = "5px";
        if (!example) {
            test.textContent = tr("Ajoutez un exemple pour vérifier le format.", "Add an example to test the format.");
        } else {
            test.textContent = (ok ? "✓ " : "✗ ") + example + " — " + (ok ? tr("reconnu", "recognized") : tr("non reconnu", "not recognized"));
            test.style.fontWeight = "600";
        }
        node.appendChild(test);

        const technical = document.createElement("code");
        technical.textContent = source || "—";
        technical.style.cssText = "display:block;margin-top:6px;white-space:normal;word-break:break-all;color:#586069";
        node.appendChild(technical);
        return node;
    }

    function normalizeConfig(config) {
        const cfg = mergeDeep(DEFAULT_CONFIG, config || {});
        cfg.enabled = cfg.enabled !== false;
        cfg.search.minLength = clampNumber(cfg.search.minLength, 3, 1, 20);
        cfg.search.delayMs = clampNumber(cfg.search.delayMs, 180, 0, 3000);
        cfg.search.resultsCount = clampNumber(cfg.search.resultsCount, 20, 1, 100);
        cfg.barcode.prefixMinLength = clampNumber(cfg.barcode.prefixMinLength, 8, 1, 128);
        cfg.barcode.maxMatches = clampNumber(cfg.barcode.maxMatches, 10, 1, 100);
        cfg.barcode.exactScoreBonus = clampNumber(cfg.barcode.exactScoreBonus, 5000, 0, 100000);
        cfg.barcode.prefixScoreBonus = clampNumber(cfg.barcode.prefixScoreBonus, 1800, 0, 100000);
        cfg.availability.autoEnrichCount = clampNumber(cfg.availability.autoEnrichCount, 8, 0, 100);
        cfg.availability.concurrency = clampNumber(cfg.availability.concurrency, 3, 1, 8);
        cfg.availability.bulkMaxItems = clampNumber(cfg.availability.bulkMaxItems, 500, 20, 2000);
        cfg.availability.cacheTtlMs = clampNumber(cfg.availability.cacheTtlMs, 60000, 0, 3600000);
        cfg.covers.autoEnrichCount = clampNumber(cfg.covers.autoEnrichCount, 8, 0, 100);
        cfg.covers.concurrency = clampNumber(cfg.covers.concurrency, 1, 1, 4);
        cfg.covers.cacheTtlMs = clampNumber(cfg.covers.cacheTtlMs, 3600000, 0, 86400000);
        cfg.covers.previewWidthPx = clampNumber(cfg.covers.previewWidthPx, 220, 80, 600);
        cfg.covers.previewHeightPx = clampNumber(cfg.covers.previewHeightPx, 320, 100, 900);
        cfg.covers.thumbWidthPx = clampNumber(cfg.covers.thumbWidthPx, 40, 20, 120);
        cfg.covers.thumbHeightPx = clampNumber(cfg.covers.thumbHeightPx, 55, 20, 180);
        cfg.performance.searchCacheTtlMs = clampNumber(cfg.performance.searchCacheTtlMs, 30000, 0, 3600000);
        cfg.performance.barcodeCacheTtlMs = clampNumber(cfg.performance.barcodeCacheTtlMs, 60000, 0, 3600000);
        cfg.performance.maxSearchCacheEntries = clampNumber(cfg.performance.maxSearchCacheEntries, 80, 5, 500);
        cfg.display.maxHeightPx = clampNumber(cfg.display.maxHeightPx, 500, 150, 1000);
        cfg.display.fixedWidthPx = clampNumber(cfg.display.fixedWidthPx, 520, 280, 1200);
        cfg.display.responsiveBreakpointPx = clampNumber(cfg.display.responsiveBreakpointPx, 576, 320, 1200);

        if (!Array.isArray(cfg.search.indexMappings) || !cfg.search.indexMappings.length) {
            cfg.search.indexMappings = deepClone(HISTORICAL_INDEX_MAPPINGS);
        }
        if (!Array.isArray(cfg.barcode.fallbackProfiles)) {
            cfg.barcode.fallbackProfiles = deepClone(DEFAULT_CONFIG.barcode.fallbackProfiles);
        }
        cfg.barcode.fallbackProfiles = cfg.barcode.fallbackProfiles.map(normalizeBarcodeProfile);
        if (!Array.isArray(cfg.scope.pages)) {
            cfg.scope.pages = deepClone(DEFAULT_CONFIG.scope.pages);
        }
        return cfg;
    }

    function language() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            try { return window.PMKConfig.getLanguage() === "en" ? "en" : "fr"; } catch (_) {}
        }
        const html = String(document.documentElement.getAttribute("lang") || "").toLowerCase();
        return html.indexOf("en") === 0 ? "en" : "fr";
    }

    function tr(fr, en) {
        return language() === "en" ? en : fr;
    }

    function normalizeText(value) {
        return (value == null ? "" : String(value))
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }

    function digitsOnly(value) {
        return (value == null ? "" : String(value)).replace(/[^0-9Xx]/g, "").toUpperCase();
    }

    function safeRegex(pattern) {
        if (!pattern) return null;
        try { return new RegExp(String(pattern)); } catch (_) { return null; }
    }

    function pathAllowed() {
        if (!currentConfig.enabled) return false;
        const mode = String(currentConfig.scope.pageMode || "where-input-exists");
        if (mode === "where-input-exists") return true;
        if (mode === "configured-pages") {
            const path = window.location.pathname;
            return currentConfig.scope.pages.some(function (page) {
                return page && page.enabled !== false && String(page.path || "") === path;
            });
        }
        return true;
    }

    function getInput() {
        let selector = String(currentConfig.scope.inputSelector || "#search-form");
        try { return $(selector).first(); } catch (_) { return $("#search-form").first(); }
    }

    function getIndexValue() {
        let selector = String(currentConfig.scope.indexSelector || "#idx_0");
        try {
            const $idx = $(selector).first();
            return $idx.length ? String($idx.val() || "kw") : "kw";
        } catch (_) {
            return "kw";
        }
    }

    function currentBranch() {
        return String(
            $(".logged-in-branch-code").attr("data-logged-in-branch-code") ||
            $(".logged-in-branch-code").data("logged-in-branch-code") ||
            ""
        );
    }

    function cacheGet(cache, key, ttlMs) {
        const entry = cache.get(key);
        if (!entry) return null;
        if (ttlMs > 0 && Date.now() - entry.at > ttlMs) {
            cache.delete(key);
            return null;
        }
        return deepClone(entry.value);
    }

    function cacheSet(cache, key, value, maxEntries) {
        cache.set(key, { at: Date.now(), value: deepClone(value) });
        if (maxEntries && cache.size > maxEntries) {
            const first = cache.keys().next();
            if (!first.done) cache.delete(first.value);
        }
    }

    function abortSearchRequests() {
        if (currentConfig.performance.abortObsoleteRequests === false) {
            activeSearchXhrs = [];
            return;
        }
        activeSearchXhrs.forEach(function (xhr) {
            try { if (xhr && typeof xhr.abort === "function") xhr.abort(); } catch (_) {}
        });
        activeSearchXhrs = [];
    }

    function jqRequest(options) {
        const xhr = $.ajax(options);
        activeSearchXhrs.push(xhr);
        return new Promise(function (resolve, reject) {
            xhr.done(function (data, textStatus, jqXHR) {
                activeSearchXhrs = activeSearchXhrs.filter(function (x) { return x !== xhr; });
                resolve({ data:data, xhr:jqXHR || xhr });
            });
            xhr.fail(function (jqXHR, status, error) {
                activeSearchXhrs = activeSearchXhrs.filter(function (x) { return x !== xhr; });
                if (status === "abort") {
                    const e = new Error("abort");
                    e.aborted = true;
                    reject(e);
                    return;
                }
                const e = new Error(error || status || ("HTTP " + (jqXHR && jqXHR.status)));
                e.status = jqXHR && jqXHR.status;
                e.responseText = jqXHR && jqXHR.responseText;
                reject(e);
            });
        });
    }

    function isbn13to10(isbn13) {
        const clean = digitsOnly(isbn13).replace(/X/g, "");
        if (!/^978\d{10}$/.test(clean)) return null;
        const core = clean.substring(3, 12);
        let sum = 0;
        for (let i = 0; i < 9; i += 1) sum += (10 - i) * parseInt(core[i], 10);
        const check = (11 - (sum % 11)) % 11;
        return core + (check === 10 ? "X" : String(check));
    }

    function fieldsForIndex(idxValue) {
        const baseIdx = String(idxValue || "kw").split(",")[0];
        const mapping = currentConfig.search.indexMappings.find(function (row) {
            return row && row.enabled !== false && String(row.indexCode || "").trim() === baseIdx;
        });
        if (mapping) return splitCsv(mapping.fields);
        return splitCsv(currentConfig.search.keywordFields || "title,author,unititle");
    }

    function buildQueryConditions(terms, idxValue) {
        const fields = fieldsForIndex(idxValue);
        return terms.map(function (word) {
            return {
                "-or": fields.map(function (field) {
                    const cond = {};
                    cond["me." + field] = { "-like": "%" + word + "%" };
                    return cond;
                })
            };
        });
    }

    function scoreResult(item, terms, rawQuery) {
        const s = currentConfig.scoring;
        let score = 0;
        const normalizedQuery = normalizeText(rawQuery);
        const title = normalizeText(item.title);
        const author = normalizeText(item.author);
        const unititle = normalizeText(item.unititle);
        const isbn = digitsOnly(item.isbn);
        const ean = digitsOnly(item.ean);
        const queryDigits = digitsOnly(rawQuery);

        const haystacks = [
            { value:item.title || "", weight:s.titleTerm },
            { value:item.author || "", weight:s.authorTerm },
            { value:item.unititle || "", weight:s.unititleTerm },
            { value:item.publisher || "", weight:s.publisherTerm },
            { value:item.publication_year || "", weight:s.yearTerm },
            { value:item.item_type || "", weight:s.itemTypeTerm },
            { value:item.isbn || "", weight:s.isbnTerm },
            { value:item.ean || "", weight:s.eanTerm }
        ];

        terms.forEach(function (term) {
            const normalizedTerm = normalizeText(term);
            haystacks.forEach(function (entry) {
                const value = normalizeText(entry.value);
                if (value && normalizedTerm && value.indexOf(normalizedTerm) !== -1) score += Number(entry.weight) || 0;
            });
        });

        if (normalizedQuery) {
            if (title === normalizedQuery) score += Number(s.titleExact) || 0;
            else if (title.indexOf(normalizedQuery) === 0) score += Number(s.titlePrefix) || 0;
            else if (title.indexOf(normalizedQuery) !== -1) score += Number(s.titleContains) || 0;

            if (author === normalizedQuery) score += Number(s.authorExact) || 0;
            else if (author.indexOf(normalizedQuery) === 0) score += Number(s.authorPrefix) || 0;

            if (unititle === normalizedQuery) score += Number(s.unititleExact) || 0;

            const allTermsInTitle = terms.length > 1 && terms.every(function (term) {
                return title.indexOf(normalizeText(term)) !== -1;
            });
            if (allTermsInTitle) score += Number(s.allTermsInTitle) || 0;
        }

        if (queryDigits.length >= 8) {
            if (isbn && queryDigits === isbn) score += Number(s.isbnExact) || 0;
            if (ean && queryDigits === ean) score += Number(s.eanExact) || 0;
        }

        if (item.barcodeMatch === "exact") score += Number(currentConfig.barcode.exactScoreBonus) || 0;
        else if (item.barcodeMatch === "prefix") score += Number(currentConfig.barcode.prefixScoreBonus) || 0;

        return score;
    }

    function sortResults(items, terms, rawQuery) {
        return items.slice().sort(function (a, b) {
            const scoreA = scoreResult(a, terms, rawQuery);
            const scoreB = scoreResult(b, terms, rawQuery);
            if (scoreA !== scoreB) return scoreB - scoreA;
            return String(a.title || "").localeCompare(String(b.title || ""), "fr", { sensitivity:"base" });
        });
    }

    function normalizeBiblio(item) {
        item = item || {};
        return {
            label: item.title || "",
            value: item.title || "",
            title: item.title || "",
            author: item.author || "",
            unititle: item.unititle || "",
            year: item.publication_year || "",
            publisher: item.publisher || "",
            item_type: item.item_type || "",
            isbn: item.isbn || "",
            ean: item.ean || "",
            fallback_url: item.url || "",
            biblio_id: item.biblio_id,
            matchedBarcodes: [],
            barcodeMatch: ""
        };
    }

    function biblioFromEmbeddedItem(item) {
        const b = item && (item.biblio || (item._embedded && item._embedded.biblio));
        if (b) {
            const out = normalizeBiblio(b);
            if (out.biblio_id == null && item && item.biblio_id != null) out.biblio_id = item.biblio_id;
            return out;
        }
        return normalizeBiblio({
            biblio_id: item && item.biblio_id,
            title: tr("Notice #", "Record #") + String(item && item.biblio_id || "")
        });
    }

    function forcedBarcodeIndex(idxValue) {
        const base = String(idxValue || "").split(",")[0];
        return splitCsv(currentConfig.barcode.forcedIndexCodes).indexOf(base) !== -1;
    }

    function recognizeWith036(raw, idxValue) {
        if (currentConfig.barcode.use036Recognizer === false) return null;
        const api = window.PMK036CatalogueSearch;
        if (!api || typeof api.evaluateValue !== "function") return null;
        try {
            const result = api.evaluateValue(raw, idxValue || "");
            if (!result || !result.matched) return { matched:false, source:"036" };
            const id = String(result.profile && result.profile.id || "");
            const accepted = splitCsv(currentConfig.barcode.accepted036ProfileIds);
            return {
                matched: accepted.indexOf(id) !== -1 || forcedBarcodeIndex(idxValue),
                normalizedValue: String(result.normalizedValue || raw || ""),
                source: "036",
                profileId: id
            };
        } catch (_) {
            return null;
        }
    }

    function recognizeBarcode(raw, idxValue) {
        if (currentConfig.barcode.enabled === false) return { matched:false, value:String(raw || "") };
        const value = String(raw || "").trim();
        if (!value) return { matched:false, value:value };

        if (forcedBarcodeIndex(idxValue)) {
            return { matched:true, value:value, normalizedValue:value, source:"forced-index" };
        }

        const from036 = recognizeWith036(value, idxValue);
        if (from036 && from036.matched) {
            return Object.assign({ value:value }, from036);
        }

        const profiles = currentConfig.barcode.fallbackProfiles || [];
        for (let i = 0; i < profiles.length; i += 1) {
            const p = profiles[i];
            if (!p || p.enabled === false) continue;
            const rx = barcodeProfileRegex(p);
            if (rx && rx.test(value)) {
                return {
                    matched:true,
                    value:value,
                    normalizedValue:value,
                    source:"113",
                    profileId:String(p.id || "")
                };
            }
        }
        return { matched:false, value:value };
    }

    function searchBiblios(rawQuery, terms, idxValue) {
        const key = "biblio|" + idxValue + "|" + normalizeText(rawQuery);
        const cached = cacheGet(searchCache, key, currentConfig.performance.searchCacheTtlMs);
        if (cached) return Promise.resolve(cached);

        const andConditions = buildQueryConditions(terms, idxValue);
        if (!andConditions.length) return Promise.resolve([]);

        return jqRequest({
            url: "/api/v1/biblios",
            method: "GET",
            dataType: "json",
            headers: { "Accept":"application/json" },
            data: {
                q: JSON.stringify({ "-and":andConditions }),
                _per_page: currentConfig.search.resultsCount
            }
        }).then(function (result) {
            const items = $.map(Array.isArray(result.data) ? result.data : [], normalizeBiblio);
            cacheSet(searchCache, key, items, currentConfig.performance.maxSearchCacheEntries);
            return items;
        });
    }

    function barcodeRequest(value, matchMode) {
        const key = "barcode|" + matchMode + "|" + value;
        const cached = cacheGet(barcodeCache, key, currentConfig.performance.barcodeCacheTtlMs);
        if (cached) return Promise.resolve(cached);

        return jqRequest({
            url: "/api/v1/items",
            method: "GET",
            dataType: "json",
            headers: {
                "Accept":"application/json",
                "x-koha-embed":"biblio"
            },
            data: {
                external_id: value,
                _match: matchMode,
                _per_page: currentConfig.barcode.maxMatches
            }
        }).then(function (result) {
            const rows = Array.isArray(result.data) ? result.data : [];
            cacheSet(barcodeCache, key, rows, currentConfig.performance.maxSearchCacheEntries);
            return rows;
        });
    }

    async function searchBarcodes(rawQuery, idxValue, recognition) {
        if (!recognition || !recognition.matched) return [];
        const value = String(recognition.normalizedValue || rawQuery || "").trim();
        if (!value) return [];

        let rows = [];
        if (currentConfig.barcode.exactEnabled !== false) {
            rows = await barcodeRequest(value, "exact");
            if (rows.length) {
                rows.forEach(function (row) { row.__pmk113BarcodeMatch = "exact"; });
                return rows;
            }
        }

        if (currentConfig.barcode.prefixEnabled !== false && value.length >= currentConfig.barcode.prefixMinLength) {
            rows = await barcodeRequest(value, "starts_with");
            rows.forEach(function (row) {
                row.__pmk113BarcodeMatch = String(row.external_id || "") === value ? "exact" : "prefix";
            });
            return rows;
        }
        return [];
    }

    function mergeSearchResults(biblios, barcodeItems) {
        const map = new Map();

        (biblios || []).forEach(function (item) {
            if (!item || item.biblio_id == null) return;
            map.set(String(item.biblio_id), item);
        });

        (barcodeItems || []).forEach(function (row) {
            if (!row || row.biblio_id == null) return;
            const key = String(row.biblio_id);
            let item = map.get(key);
            if (!item) {
                item = biblioFromEmbeddedItem(row);
                map.set(key, item);
            }
            if (!Array.isArray(item.matchedBarcodes)) item.matchedBarcodes = [];
            const bc = String(row.external_id || "");
            if (bc && item.matchedBarcodes.indexOf(bc) === -1) item.matchedBarcodes.push(bc);
            const match = row.__pmk113BarcodeMatch || "";
            if (match === "exact") item.barcodeMatch = "exact";
            else if (!item.barcodeMatch && match) item.barcodeMatch = match;
            if (!item.barcodeMatchedItem || match === "exact") item.barcodeMatchedItem = row;
        });

        return Array.from(map.values());
    }

    function isItemAvailable(item) {
        return item &&
            Number(item.not_for_loan_status) === 0 &&
            !item.checked_out_date &&
            Number(item.lost_status) === 0 &&
            Number(item.withdrawn) === 0;
    }

    function getItemCallnumber(item) {
        return item && (item.itemcallnumber || item.callnumber || item.call_num || item.cn_sort || item.cote || "") || "";
    }

    function summarizeAvailability(items) {
        items = Array.isArray(items) ? items : [];
        const branch = currentBranch();
        const availableHere = items.some(function (it) {
            return isItemAvailable(it) && String(it.holding_library_id || "") === branch;
        });
        const availableElsewhere = items.some(function (it) {
            return isItemAvailable(it) && String(it.holding_library_id || "") !== branch;
        });

        let callnumber = "";
        const priorities = [
            function (it) { return isItemAvailable(it) && String(it.holding_library_id || "") === branch; },
            function (it) { return isItemAvailable(it); },
            function () { return true; }
        ];
        for (let p = 0; p < priorities.length && !callnumber; p += 1) {
            for (let i = 0; i < items.length; i += 1) {
                if (!priorities[p](items[i])) continue;
                const c = getItemCallnumber(items[i]);
                if (c) { callnumber = c; break; }
            }
        }

        return {
            availableHere:availableHere,
            availableElsewhere:availableElsewhere,
            available:availableHere || availableElsewhere,
            callnumber:callnumber,
            itemsCount:items.length
        };
    }

    function getMenu() {
        try {
            return $input.autocomplete("widget").addClass("kx-catalog-autocomplete pmk113-menu");
        } catch (_) {
            return $();
        }
    }

    function findRow(biblioId) {
        return getMenu().find('li[data-kx-biblio-id="' + String(biblioId) + '"]');
    }

    function availabilityLabel(summary) {
        if (!summary) return tr("Indisponible", "Unavailable");
        if (summary.available) {
            if (currentConfig.availability.showHereElsewhere === false) return tr("Disponible", "Available");
            if (summary.availableHere) return tr("Disponible ici", "Available here");
            if (summary.availableElsewhere) return tr("Disponible ailleurs", "Available elsewhere");
        }
        return tr("Indisponible", "Unavailable");
    }

    function applyAvailabilityToRow(item, summary) {
        if (!item || item.biblio_id == null) return;
        const $row = findRow(item.biblio_id);
        if (!$row.length) return;

        const $dot = $row.find(".ac-avail-dot");
        const $label = $row.find(".ac-avail-label");
        const $call = $row.find(".ac-callnumber");

        $dot.removeClass("loading available unavailable here elsewhere");
        $label.removeClass("loading available unavailable deferred here elsewhere");

        if (summary && summary.availableHere) {
            $dot.addClass("available here");
            $label.addClass("available here").text(availabilityLabel(summary));
        } else if (summary && summary.availableElsewhere) {
            $dot.addClass("available elsewhere");
            $label.addClass("available elsewhere").text(availabilityLabel(summary));
        } else {
            $dot.addClass("unavailable");
            $label.addClass("unavailable").text(availabilityLabel(summary));
        }

        if (currentConfig.availability.showCallnumber !== false && summary && summary.callnumber) {
            $call.text(tr("Cote : ", "Call number: ") + summary.callnumber).show();
        } else {
            $call.hide();
        }

        $row.attr("data-kx-availability-loaded", "1");
        updateRowEnrichedState($row);
    }

    function updateRowEnrichedState($row) {
        if (!$row || !$row.length) return;
        const availabilityDone = currentConfig.availability.enabled === false || $row.attr("data-kx-availability-loaded") === "1";
        const coverDone = currentConfig.covers.enabled === false || $row.attr("data-kx-cover-loaded") === "1";
        if (availabilityDone && coverDone) $row.attr("data-kx-enriched", "1");
    }

    function resetEnrichment() {
        availabilityQueue = [];
        availabilityRunning = 0;
        availabilityQueuedKeys.clear();
        coverQueue = [];
        coverRunning = 0;
        coverQueuedKeys.clear();
    }

    function availabilityQueueKey(item, generation) {
        return generation + ":" + String(item.biblio_id);
    }

    function enqueueAvailability(item, generation, priority) {
        if (currentConfig.availability.enabled === false || !item || item.biblio_id == null || generation !== searchGeneration) return;

        const cached = cacheGet(availabilityCache, String(item.biblio_id), currentConfig.availability.cacheTtlMs);
        if (cached) {
            applyAvailabilityToRow(item, cached);
            if (priority || currentConfig.covers.autoLoad !== false) enqueueCover(item, generation, !!priority);
            return;
        }

        const $row = findRow(item.biblio_id);
        if (!$row.length || $row.attr("data-kx-availability-loaded") === "1") {
            if (priority || currentConfig.covers.autoLoad !== false) enqueueCover(item, generation, !!priority);
            return;
        }

        const key = availabilityQueueKey(item, generation);
        if (availabilityQueuedKeys.has(key)) return;
        availabilityQueuedKeys.add(key);

        const job = { item:item, generation:generation, key:key, priority:!!priority };
        if (priority) availabilityQueue.unshift(job);
        else availabilityQueue.push(job);
        pumpAvailabilityQueue();
    }

    function pumpAvailabilityQueue() {
        const max = currentConfig.availability.concurrency;
        while (availabilityRunning < max && availabilityQueue.length) {
            const job = availabilityQueue.shift();
            if (!job || job.generation !== searchGeneration) continue;
            availabilityRunning += 1;
            loadAvailabilitySingle(job.item, job.generation, job.priority)
                .catch(function () {})
                .finally(function () {
                    availabilityQueuedKeys.delete(job.key);
                    availabilityRunning = Math.max(0, availabilityRunning - 1);
                    pumpAvailabilityQueue();
                });
        }
    }

    function loadAvailabilitySingle(item, generation, priority) {
        const cached = cacheGet(availabilityCache, String(item.biblio_id), currentConfig.availability.cacheTtlMs);
        if (cached) {
            if (generation === searchGeneration) applyAvailabilityToRow(item, cached);
            if (priority || currentConfig.covers.autoLoad !== false) enqueueCover(item, generation, !!priority);
            return Promise.resolve(cached);
        }

        return jqRequest({
            url: "/api/v1/biblios/" + encodeURIComponent(item.biblio_id) + "/items",
            method: "GET",
            dataType: "json",
            headers: { "Accept":"application/json" },
            data: { _per_page:currentConfig.availability.bulkMaxItems }
        }).then(function (result) {
            const summary = summarizeAvailability(Array.isArray(result.data) ? result.data : []);
            cacheSet(availabilityCache, String(item.biblio_id), summary);
            if (generation === searchGeneration) applyAvailabilityToRow(item, summary);
            if (priority || currentConfig.covers.autoLoad !== false) enqueueCover(item, generation, !!priority);
            return summary;
        }).catch(function (error) {
            if (error && error.aborted) return null;
            const summary = summarizeAvailability([]);
            cacheSet(availabilityCache, String(item.biblio_id), summary);
            if (generation === searchGeneration) applyAvailabilityToRow(item, summary);
            if (priority || currentConfig.covers.autoLoad !== false) enqueueCover(item, generation, !!priority);
            return summary;
        });
    }

    async function bulkEnrichAvailability(items, generation) {
        if (currentConfig.availability.enabled === false || generation !== searchGeneration) return false;
        if (currentConfig.availability.strategy !== "bulk-then-queue") return false;

        const missing = (items || []).filter(function (item) {
            if (!item || item.biblio_id == null) return false;
            const cached = cacheGet(availabilityCache, String(item.biblio_id), currentConfig.availability.cacheTtlMs);
            if (cached) {
                applyAvailabilityToRow(item, cached);
                if (currentConfig.covers.autoLoad !== false) enqueueCover(item, generation, false);
                return false;
            }
            return true;
        });
        if (!missing.length) return true;

        const ors = missing.map(function (item) {
            return { "me.biblio_id":Number(item.biblio_id) };
        });
        try {
            const result = await jqRequest({
                url: "/api/v1/items",
                method: "GET",
                dataType: "json",
                headers: { "Accept":"application/json" },
                data: {
                    q: JSON.stringify({ "-or":ors }),
                    _per_page:currentConfig.availability.bulkMaxItems
                }
            });
            if (generation !== searchGeneration) return true;
            const rows = Array.isArray(result.data) ? result.data : [];
            const grouped = new Map();
            rows.forEach(function (row) {
                const key = String(row.biblio_id);
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key).push(row);
            });
            missing.forEach(function (item) {
                const summary = summarizeAvailability(grouped.get(String(item.biblio_id)) || []);
                cacheSet(availabilityCache, String(item.biblio_id), summary);
                applyAvailabilityToRow(item, summary);
                if (currentConfig.covers.autoLoad !== false) enqueueCover(item, generation, false);
            });
            return true;
        } catch (error) {
            if (error && error.aborted) return true;
            return false;
        }
    }

    function renderCoverImage($zone, url) {
        $zone.empty();
        const $img = $("<img>", { src:url, alt:tr("Couverture", "Cover") });
        $img.on("error", function () {
            $zone.text(tr("Pas de couverture", "No cover"));
        });
        $zone.append($img);
    }

    function useFallbackCover($zone, item) {
        if (currentConfig.covers.useFallbackUrl !== false && item.fallback_url) renderCoverImage($zone, item.fallback_url);
        else $zone.text(tr("Pas de couverture", "No cover"));
    }

    function coverQueueKey(item, generation) {
        return generation + ":" + String(item.biblio_id);
    }

    function enqueueCover(item, generation, priority) {
        if (currentConfig.covers.enabled === false || !item || item.biblio_id == null || generation !== searchGeneration) return;
        const $row = findRow(item.biblio_id);
        if (!$row.length || $row.attr("data-kx-cover-loaded") === "1") return;

        const cached = cacheGet(coverCache, String(item.biblio_id), currentConfig.covers.cacheTtlMs);
        if (cached) {
            const $zone = $row.find(".ac-cover-zone");
            if (cached.url) renderCoverImage($zone, cached.url);
            else useFallbackCover($zone, item);
            $row.attr("data-kx-cover-loaded", "1");
            updateRowEnrichedState($row);
            return;
        }

        const key = coverQueueKey(item, generation);
        if (coverQueuedKeys.has(key)) return;
        coverQueuedKeys.add(key);
        const job = { item:item, generation:generation, key:key };
        if (priority) coverQueue.unshift(job);
        else coverQueue.push(job);
        pumpCoverQueue();
    }

    function pumpCoverQueue() {
        const max = currentConfig.covers.concurrency;
        while (coverRunning < max && coverQueue.length) {
            const job = coverQueue.shift();
            if (!job || job.generation !== searchGeneration) continue;
            coverRunning += 1;
            loadCover(job.item, job.generation)
                .catch(function () {})
                .finally(function () {
                    coverQueuedKeys.delete(job.key);
                    coverRunning = Math.max(0, coverRunning - 1);
                    pumpCoverQueue();
                });
        }
    }

    function loadCover(item, generation) {
        const $row = findRow(item.biblio_id);
        if (!$row.length) return Promise.resolve(null);
        const $zone = $row.find(".ac-cover-zone");

        const cached = cacheGet(coverCache, String(item.biblio_id), currentConfig.covers.cacheTtlMs);
        if (cached) {
            if (cached.url) renderCoverImage($zone, cached.url);
            else useFallbackCover($zone, item);
            $row.attr("data-kx-cover-loaded", "1");
            updateRowEnrichedState($row);
            return Promise.resolve(cached);
        }

        if (currentConfig.covers.provider !== "electre") {
            useFallbackCover($zone, item);
            cacheSet(coverCache, String(item.biblio_id), { url:"" });
            $row.attr("data-kx-cover-loaded", "1");
            updateRowEnrichedState($row);
            return Promise.resolve(null);
        }

        const rawIsbn = String(item.isbn || "").split(/[\s,;]+/)[0] || "";
        const isbn10 = isbn13to10(rawIsbn) || digitsOnly(rawIsbn);
        if (!isbn10) {
            useFallbackCover($zone, item);
            cacheSet(coverCache, String(item.biblio_id), { url:"" });
            $row.attr("data-kx-cover-loaded", "1");
            updateRowEnrichedState($row);
            return Promise.resolve(null);
        }

        return jqRequest({
            url: String(currentConfig.covers.endpoint || "/api/v1/contrib/electre/image"),
            method: "GET",
            dataType: "text",
            data: { isbn10:isbn10, side:"staff", result_page:true }
        }).then(function (result) {
            if (generation !== searchGeneration) return null;
            let coverUrl = result.data;
            if (typeof coverUrl === "string") coverUrl = coverUrl.trim().replace(/^"|"$/g, "");
            if (coverUrl) renderCoverImage($zone, coverUrl);
            else useFallbackCover($zone, item);
            cacheSet(coverCache, String(item.biblio_id), { url:coverUrl || "" });
            $row.attr("data-kx-cover-loaded", "1");
            updateRowEnrichedState($row);
            return coverUrl;
        }).catch(function (error) {
            if (error && error.aborted) return null;
            useFallbackCover($zone, item);
            cacheSet(coverCache, String(item.biblio_id), { url:"" });
            $row.attr("data-kx-cover-loaded", "1");
            updateRowEnrichedState($row);
            return null;
        });
    }

    function injectSearchActions($menu) {
        $menu.find(".ac-menu-actions").remove();
        const queryValue = String($input.val() || "");
        const idxValue = getIndexValue();
        const $actions = $("<div>", { class:"ac-menu-actions" });

        if (currentConfig.search.warningEnabled !== false) {
            $("<div>", { class:"ac-info-banner" })
                .text(tr(currentConfig.search.warningFr, currentConfig.search.warningEn))
                .appendTo($actions);
            $("<ul>", { class:"ac-zones-list" })
                .append($("<li>").text(tr(currentConfig.search.zonesFr, currentConfig.search.zonesEn)))
                .appendTo($actions);
        }

        if (currentConfig.search.classicSearchEnabled !== false) {
            const $form = $("<form>", {
                action:"/cgi-bin/koha/catalogue/search.pl",
                method:"get",
                class:"ac-search-form"
            });
            if (queryValue) $("<input>", { type:"hidden", name:"q", value:queryValue }).appendTo($form);
            $("<input>", { type:"hidden", name:"idx", value:idxValue }).appendTo($form);
            $("<button>", { type:"submit", class:"btn btn-default btn-sm ac-search-cta" })
                .text(tr(currentConfig.search.classicButtonFr, currentConfig.search.classicButtonEn))
                .appendTo($form);
            $form.appendTo($actions);
        }

        if ($actions.children().length) $menu.prepend($actions);
    }

    function addStyles() {
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement("style");
            style.id = STYLE_ID;
            (document.head || document.documentElement).appendChild(style);
        }
        const d = currentConfig.display;
        const c = currentConfig.covers;
        style.textContent = `
            .pmk113-menu.kx-catalog-autocomplete{
                max-height:${d.maxHeightPx}px;
                overflow-y:auto;
                overflow-x:hidden;
                z-index:10000;
                padding:0;
                background:var(--bs-body-bg,#fff);
                color:var(--bs-body-color,#212529);
                border:1px solid #d4d9dd;
                border-radius:4px;
                box-shadow:0 4px 14px rgba(0,0,0,.14);
            }
            .pmk113-menu .ui-menu-item{margin:0;padding:0;}
            .pmk113-menu .autocomplete-item{
                display:flex;align-items:flex-start;gap:10px;padding:7px 10px;
                border-bottom:1px solid #e8ebed;color:inherit;text-decoration:none;
                background:#fff;
            }
            .pmk113-menu .ui-state-active .autocomplete-item,
            .pmk113-menu .autocomplete-item:hover{background:#f0f5f8;color:inherit;}
            .pmk113-menu .ac-cover-zone{
                width:${c.thumbWidthPx}px;height:${c.thumbHeightPx}px;flex:0 0 ${c.thumbWidthPx}px;
                background:#f1f3f4;border:1px solid #d7dcdf;border-radius:3px;
                display:flex;align-items:center;justify-content:center;
                font-size:.68em;color:#6c757d;text-align:center;overflow:hidden;
            }
            .pmk113-menu .ac-cover-zone img{width:100%;height:100%;object-fit:cover;cursor:${c.previewEnabled !== false ? "zoom-in" : "default"};}
            .pmk113-menu .ac-text{display:flex;flex-direction:column;min-width:0;flex:1;}
            .pmk113-menu .ac-title-row{display:flex;align-items:center;gap:6px;min-width:0;}
            .pmk113-menu .ac-title{font-weight:700;color:#2b3a42;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            .pmk113-menu .ac-author{font-size:.9em;color:#495057;}
            .pmk113-menu .ac-meta,.pmk113-menu .ac-callnumber,.pmk113-menu .ac-barcode{font-size:.78em;color:#6c757d;margin-top:2px;}
            .pmk113-menu .ac-barcode{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#475569;}
            .pmk113-menu .ac-menu-actions{position:sticky;top:0;z-index:2;background:#fff;padding:7px 0 1px;border-bottom:1px solid #e6e9eb;}
            .pmk113-menu .ac-info-banner{margin:0 10px 7px;padding:6px 8px;border-left:3px solid #e0a800;background:#fff8df;color:#6d5817;font-size:.8em;line-height:1.35;border-radius:3px;}
            .pmk113-menu .ac-zones-list{margin:0 10px 7px;padding-left:18px;font-size:.78em;color:#6c757d;}
            .pmk113-menu .ac-search-form{margin:0 10px 8px;}
            .pmk113-menu .ac-search-cta{display:block;width:100%;}
            .pmk113-menu .ac-empty-state{display:none!important;}
            .pmk113-menu .ac-avail-dot{display:inline-block;width:9px;height:9px;border-radius:50%;flex:0 0 9px;background:#adb5bd;}
            .pmk113-menu .ac-avail-dot.available.here{background:#198754;}
            .pmk113-menu .ac-avail-dot.available.elsewhere{background:#0d6efd;}
            .pmk113-menu .ac-avail-dot.unavailable{background:#dc3545;}
            .pmk113-menu .ac-avail-label{font-size:.78em;margin-top:2px;}
            .pmk113-menu .ac-avail-label.available.here{color:#146c43;}
            .pmk113-menu .ac-avail-label.available.elsewhere{color:#0a58ca;}
            .pmk113-menu .ac-avail-label.unavailable{color:#b02a37;}
            .pmk113-menu .ac-avail-label.deferred,.pmk113-menu .ac-avail-label.loading{color:#6c757d;}
            #${PREVIEW_ID}{position:fixed;display:none;z-index:20000;border:3px solid #fff;box-shadow:0 4px 20px rgba(0,0,0,.35);border-radius:4px;pointer-events:none;max-width:${c.previewWidthPx}px;max-height:${c.previewHeightPx}px;background:#fff;}
            #${PREVIEW_ID} img{display:block;max-width:${c.previewWidthPx}px;max-height:${c.previewHeightPx}px;border-radius:2px;}
            @media(max-width:${d.responsiveBreakpointPx}px){
                .pmk113-menu.kx-catalog-autocomplete{position:fixed!important;left:8px!important;right:8px!important;width:auto!important;max-height:min(${d.maxHeightPx}px,65vh)!important;}
                .pmk113-menu .autocomplete-item{padding:8px;}
                .pmk113-menu .ac-cover-zone{width:${Math.max(32, Math.min(c.thumbWidthPx, 44))}px;height:${Math.max(44, Math.min(c.thumbHeightPx, 62))}px;flex-basis:${Math.max(32, Math.min(c.thumbWidthPx, 44))}px;}
                #${PREVIEW_ID}{display:none!important;}
            }
        `;
    }

    function ensurePreview() {
        if (currentConfig.covers.previewEnabled === false) {
            $("#" + PREVIEW_ID).remove();
            return;
        }
        let $preview = $("#" + PREVIEW_ID);
        if (!$preview.length) {
            $preview = $("<div>", { id:PREVIEW_ID }).append($("<img>", { alt:"" })).appendTo("body");
        }
        if (previewBound) return;
        previewBound = true;

        $(document)
            .off(".pmk113CoverPreview")
            .on("mouseenter.pmk113CoverPreview", ".pmk113-menu .ac-cover-zone img", function () {
                if (currentConfig.covers.previewEnabled === false) return;
                const src = $(this).attr("src");
                if (!src) return;
                const $p = $("#" + PREVIEW_ID);
                $p.find("img").attr("src", src);
                $p.show();
                positionPreview($(this), $p);
            })
            .on("mouseleave.pmk113CoverPreview", ".pmk113-menu .ac-cover-zone img", function () {
                $("#" + PREVIEW_ID).hide();
            });
    }

    function positionPreview($thumb, $preview) {
        if (!$thumb.length || !$preview.length) return;
        const rect = $thumb[0].getBoundingClientRect();
        const width = currentConfig.covers.previewWidthPx;
        const height = currentConfig.covers.previewHeightPx;
        const offset = 10;
        let left = rect.right + offset;
        let top = rect.top;
        if (left + width > window.innerWidth - 10) left = rect.left - width - offset;
        if (top + height > window.innerHeight - 10) top = window.innerHeight - height - 10;
        top = Math.max(10, top);
        left = Math.max(10, left);
        $preview.css({ left:left + "px", top:top + "px" });
    }

    function setupLazyHandler() {
        if (lazyBound) return;
        lazyBound = true;
        $(document)
            .off(".pmk113LazyEnrichment")
            .on("mouseenter.pmk113LazyEnrichment focusin.pmk113LazyEnrichment", ".pmk113-menu li[data-kx-biblio-id]", function () {
                const $row = $(this);
                const id = String($row.attr("data-kx-biblio-id") || "");
                if (!id) return;
                const item = currentItemMap.get(id);
                if (!item) return;
                if ($row.attr("data-kx-availability-loaded") !== "1") enqueueAvailability(item, searchGeneration, true);
                if (currentConfig.covers.enabled !== false && $row.attr("data-kx-cover-loaded") !== "1") enqueueCover(item, searchGeneration, true);
            });
    }

    async function runSearch(rawQuery, idxValue, generation) {
        const terms = rawQuery.split(/\s+/).filter(Boolean);
        const recognition = recognizeBarcode(rawQuery, idxValue);
        const barcodeOnly = forcedBarcodeIndex(idxValue);

        const biblioPromise = barcodeOnly ? Promise.resolve([]) : searchBiblios(rawQuery, terms, idxValue);
        const barcodePromise = recognition.matched ? searchBarcodes(rawQuery, idxValue, recognition).catch(function () { return []; }) : Promise.resolve([]);

        const results = await Promise.all([biblioPromise.catch(function () { return []; }), barcodePromise]);
        if (generation !== searchGeneration) return [];

        const merged = mergeSearchResults(results[0], results[1]);
        const ranked = sortResults(merged, terms, rawQuery).slice(0, currentConfig.search.resultsCount);
        ranked.forEach(function (item, index) {
            item.rank = index;
            item.searchGeneration = generation;
            currentItemMap.set(String(item.biblio_id), item);
        });
        return ranked;
    }

    function configureAutocomplete() {
        if (!$input.length || typeof $input.autocomplete !== "function") return false;

        const existing = $input.autocomplete("instance");
        if (existing) {
            if ($input.data(OWNED_DATA_KEY)) {
                try { $input.autocomplete("destroy"); } catch (_) {}
            } else if (currentConfig.search.replaceExistingAutocomplete !== false) {
                try { $input.autocomplete("destroy"); } catch (_) {}
            } else {
                return false;
            }
        }

        $input.data(OWNED_DATA_KEY, true);
        $input.autocomplete({
            minLength: currentConfig.search.minLength,
            delay: currentConfig.search.delayMs,

            create: function () {
                getMenu();
            },

            open: function () {
                const $menu = getMenu();
                if (currentConfig.display.menuWidthMode === "fixed") {
                    $menu.width(currentConfig.display.fixedWidthPx);
                } else if (currentConfig.display.menuWidthMode === "viewport") {
                    $menu.css({ width:"min(760px, calc(100vw - 16px))" });
                } else {
                    $menu.width($input.outerWidth());
                }
            },

            close: function () {
                $("#" + PREVIEW_ID).hide();
            },

            select: function (event, ui) {
                event.preventDefault();
                if (ui.item && ui.item.biblio_id) {
                    window.location.href = "/cgi-bin/koha/catalogue/detail.pl?biblionumber=" + encodeURIComponent(ui.item.biblio_id);
                }
                return false;
            },

            source: function (request, response) {
                const rawQuery = String(request.term || "").trim();
                const idxValue = getIndexValue();
                const generation = ++searchGeneration;
                currentItemMap.clear();
                resetEnrichment();
                abortSearchRequests();

                runSearch(rawQuery, idxValue, generation)
                    .then(function (rankedItems) {
                        if (generation !== searchGeneration) return;
                        const responseItems = rankedItems.length
                            ? rankedItems
                            : [{ label:"", value:"", isEmptyState:true, searchGeneration:generation }];
                        response(responseItems);

                        window.setTimeout(async function () {
                            if (generation !== searchGeneration) return;
                            const $menu = getMenu();
                            injectSearchActions($menu);

                            const autoAvailability = rankedItems.slice(0, currentConfig.availability.autoEnrichCount);
                            let bulkDone = false;
                            if (currentConfig.availability.enabled !== false && autoAvailability.length) {
                                bulkDone = await bulkEnrichAvailability(autoAvailability, generation);
                            }
                            if (!bulkDone && generation === searchGeneration) {
                                autoAvailability.forEach(function (item) { enqueueAvailability(item, generation, false); });
                            }

                            if (currentConfig.covers.enabled !== false && currentConfig.covers.autoLoad !== false) {
                                rankedItems.slice(0, currentConfig.covers.autoEnrichCount).forEach(function (item) {
                                    if (currentConfig.availability.enabled === false) enqueueCover(item, generation, false);
                                });
                            }
                        }, 0);
                    })
                    .catch(function (error) {
                        if (error && error.aborted) return;
                        if (generation !== searchGeneration) return;
                        response([{ label:"", value:"", isEmptyState:true, searchGeneration:generation }]);
                    });
            }
        });

        const instance = $input.autocomplete("instance");
        if (!instance) return false;

        instance._renderItem = function (ul, item) {
            if (item.isEmptyState) return $("<li>").addClass("ac-empty-state").appendTo(ul);

            const detailUrl = "/cgi-bin/koha/catalogue/detail.pl?biblionumber=" + encodeURIComponent(item.biblio_id);
            const $li = $("<li>").attr({
                "data-kx-biblio-id":item.biblio_id,
                "data-kx-enriched":"0",
                "data-kx-availability-loaded": currentConfig.availability.enabled === false ? "1" : "0",
                "data-kx-cover-loaded": currentConfig.covers.enabled === false ? "1" : "0"
            });

            const $link = $("<a>", { href:detailUrl, class:"autocomplete-item" }).appendTo($li);
            const $cover = $("<div>", { class:"ac-cover-zone" }).appendTo($link);
            const $text = $("<div>", { class:"ac-text" }).appendTo($link);
            const $titleRow = $("<div>", { class:"ac-title-row" }).appendTo($text);

            if (currentConfig.availability.enabled !== false) $("<span>", { class:"ac-avail-dot loading", "aria-hidden":"true" }).appendTo($titleRow);
            $("<span>", { class:"ac-title" }).text(item.label || tr("Notice sans titre", "Untitled record")).appendTo($titleRow);

            if (currentConfig.display.showAuthor !== false && item.author) $("<span>", { class:"ac-author" }).text(item.author).appendTo($text);

            const meta = [];
            if (currentConfig.display.showPublisher !== false && item.publisher) meta.push(item.publisher);
            if (currentConfig.display.showYear !== false && item.year) meta.push(item.year);
            if (currentConfig.display.showItemType !== false && item.item_type) meta.push(item.item_type);
            if (meta.length) $("<span>", { class:"ac-meta" }).text(meta.join(" · ")).appendTo($text);

            if (currentConfig.barcode.displayBarcode !== false && item.matchedBarcodes && item.matchedBarcodes.length) {
                const text = tr("CB : ", "Barcode: ") + item.matchedBarcodes[0] + (item.matchedBarcodes.length > 1 ? " +" + (item.matchedBarcodes.length - 1) : "");
                $("<span>", { class:"ac-barcode" }).text(text).appendTo($text);
            }

            $("<span>", { class:"ac-callnumber" }).hide().appendTo($text);

            if (currentConfig.availability.enabled !== false) {
                if (item.rank < currentConfig.availability.autoEnrichCount) {
                    $("<span>", { class:"ac-avail-label loading" }).text(tr("Vérification…", "Checking…")).appendTo($text);
                } else {
                    $("<span>", { class:"ac-avail-label deferred" })
                        .text(tr("Survolez pour vérifier disponibilité et cote", "Hover to check availability and call number"))
                        .appendTo($text);
                }
            }

            if (currentConfig.covers.enabled !== false) {
                if (currentConfig.covers.autoLoad !== false && item.rank < currentConfig.covers.autoEnrichCount) $cover.text(tr("Chargement…", "Loading…"));
                else $cover.text(tr("Survol", "Hover"));
            } else {
                $cover.hide();
            }

            return $li.appendTo(ul);
        };

        return true;
    }

    function canConfigure() {
        if (window.PMKConfig && typeof window.PMKConfig.isKohaSuperlibrarian === "function") {
            try { return !!window.PMKConfig.isKohaSuperlibrarian(); } catch (_) {}
        }
        const el = document.querySelector("#logged-in-info-full .loggedinusername[data-loggedinusername], .loggedinusername[data-loggedinusername]");
        return !!(el && (el.dataset.isSuperlibrarian === "is_superlibrarian" || el.classList.contains("is_superlibrarian")));
    }

    function mountContextAccess() {
        if (!canConfigure() || !window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function" || !$input.length) return;
        const anchor = $input.closest(".form-content, #cat-search-block, form").first()[0] || $input.parent()[0];
        if (!anchor) return;
        try {
            window.PMKConfig.mountContextButton({
                moduleId:MODULE_ID,
                anchor:anchor,
                position:"after",
                contextKey:CONTEXT_KEY,
                context:{ sectionId:"search" }
            });
        } catch (_) {}
    }

    function newIndexMapping() {
        return { enabled:true, indexCode:"", fields:"title" };
    }

    function newBarcodeProfile() {
        return {
            id:"barcode-" + Date.now().toString(36),
            enabled:true,
            labelFr:"Nouveau format CB",
            labelEn:"New barcode format",
            mode:"digits",
            prefix:"",
            minLength:8,
            maxLength:14,
            example:"",
            regex:""
        };
    }

    function validateConfig(config) {
        const cfg = normalizeConfig(config);
        if (!cfg.scope.inputSelector) return { ok:false, message:tr("Le sélecteur de la barre de recherche est obligatoire.", "Search input selector is required.") };
        try { document.createDocumentFragment().querySelector(cfg.scope.inputSelector); } catch (_) {
            return { ok:false, message:tr("Le sélecteur de la barre de recherche n’est pas valide.", "Search input selector is invalid.") };
        }
        const ids = new Set();
        for (const p of cfg.barcode.fallbackProfiles) {
            if (!p || p.enabled === false) continue;
            const id = String(p.id || "").trim();
            if (!id || ids.has(id)) return { ok:false, message:tr("Chaque format de code-barres actif doit avoir un identifiant unique.", "Each enabled barcode format must have a unique id.") };
            ids.add(id);
            const source = barcodeProfileRegexSource(p);
            if (!safeRegex(source)) return { ok:false, message:tr("Format de code-barres invalide : ", "Invalid barcode format: ") + String(p.labelFr || p.id || "") };
            if (p.mode !== "expert" && Number(p.maxLength) < Number(p.minLength)) {
                return { ok:false, message:tr("La longueur maximale d’un format CB doit être supérieure ou égale à la longueur minimale.", "A barcode format maximum length must be greater than or equal to its minimum length.") };
            }
        }
        return { ok:true };
    }

    function registerModule() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function" || configRegistered) return false;
        configRegistered = true;
        window.PMKConfig.registerModule({
            id:MODULE_ID,
            schemaVersion:4,
            name:{ fr:"Autocomplétion catalogue enrichie", en:"Enriched catalogue autocomplete" },
            description:{
                fr:"Suggestions rapides issues du catalogue Koha avec classement local, disponibilité, cote, couverture et recherche par code-barres exemplaire. La recherche classique Koha reste la référence exhaustive.",
                en:"Fast suggestions from the Koha catalogue with local ranking, availability, call number, cover and item-barcode lookup. Full Koha search remains authoritative."
            },
            category:{ fr:"Catalogue / recherche", en:"Catalogue / search" },
            supportedPages:["staff.searchbar","catalogue.search","mainpage"],
            prerequisites:[],
            dependencies:[],
            defaults:deepClone(DEFAULT_CONFIG),
            validate:validateConfig,
            schema:[
                {
                    type:"section", id:"activation", label:{fr:"Activation et portée",en:"Activation and scope"},
                    fields:[
                        {key:"enabled",type:"boolean",label:{fr:"Activer l’autocomplétion catalogue",en:"Enable catalogue autocomplete"}},
                        {key:"scope.pageMode",type:"select",label:{fr:"Pages actives",en:"Active pages"},options:[
                            {value:"where-input-exists",label:{fr:"Toutes les pages où la barre Koha existe — comportement historique",en:"Every page where the Koha search bar exists — historical behavior"}},
                            {value:"configured-pages",label:{fr:"Uniquement les pages configurées",en:"Only configured pages"}}
                        ]},
                        {key:"scope.pages",type:"repeater",label:{fr:"Pages configurées",en:"Configured pages"},addLabel:{fr:"Ajouter une page",en:"Add page"},reorder:true,newItem:function(){return {enabled:true,path:window.location.pathname,labelFr:"Nouvelle page",labelEn:"New page"};},itemTitle:function(item,index,lang){return String(lang==="en"?(item&&item.labelEn||item&&item.path):(item&&item.labelFr||item&&item.path)||("Page "+(index+1)));},fields:[
                            {key:"enabled",type:"boolean",label:{fr:"Active",en:"Enabled"}},
                            {key:"labelFr",type:"text",label:{fr:"Nom français",en:"French name"}},
                            {key:"labelEn",type:"text",label:{fr:"Nom anglais",en:"English name"}},
                            {key:"path",type:"text",label:{fr:"Chemin Koha",en:"Koha path"}}
                        ]},
                        {key:"scope.inputSelector",type:"text",advanced:true,label:{fr:"Sélecteur du champ de recherche",en:"Search input selector"}},
                        {key:"scope.indexSelector",type:"text",advanced:true,label:{fr:"Sélecteur de l’index Koha",en:"Koha index selector"}}
                    ]
                },
                {
                    type:"section", id:"search", label:{fr:"Recherche catalogue",en:"Catalogue search"},
                    description:{fr:"Les valeurs historiques restent 3 caractères minimum, 20 propositions et classement local pondéré.",en:"Historical defaults remain 3 minimum characters, 20 suggestions and weighted local ranking."},
                    fields:[
                        {key:"search.minLength",type:"number",min:1,max:20,label:{fr:"Nombre minimum de caractères",en:"Minimum characters"}},
                        {key:"search.delayMs",type:"number",min:0,max:3000,label:{fr:"Délai avant recherche (ms)",en:"Search delay (ms)"}},
                        {key:"search.resultsCount",type:"number",min:1,max:100,label:{fr:"Nombre maximum de propositions",en:"Maximum suggestions"}},
                        {key:"search.keywordFields",type:"text",advanced:true,label:{fr:"Champs utilisés en mode mots-clés",en:"Fields used in keyword mode"},help:{fr:"Liste séparée par des virgules. Défaut historique : title,author,unititle.",en:"Comma-separated list. Historical default: title,author,unititle."}},
                        {key:"search.indexMappings",type:"repeater",advanced:true,label:{fr:"Correspondance index Koha → champs API",en:"Koha index → API fields mapping"},addLabel:{fr:"Ajouter une correspondance",en:"Add mapping"},reorder:true,newItem:newIndexMapping,itemTitle:function(item){return String(item&&item.indexCode||"Index");},fields:[
                            {key:"enabled",type:"boolean",label:{fr:"Active",en:"Enabled"}},
                            {key:"indexCode",type:"text",label:{fr:"Code index Koha",en:"Koha index code"}},
                            {key:"fields",type:"text",label:{fr:"Champs API séparés par virgules",en:"Comma-separated API fields"}}
                        ]},
                        {key:"search.replaceExistingAutocomplete",type:"boolean",advanced:true,label:{fr:"Remplacer un autocomplete déjà présent sur cette barre",en:"Replace an existing autocomplete on this search bar"}},
                        {key:"search.warningEnabled",type:"boolean",label:{fr:"Afficher l’avertissement sur la recherche rapide",en:"Show fast-search warning"}},
                        {key:"search.classicSearchEnabled",type:"boolean",label:{fr:"Afficher le bouton Recherche classique",en:"Show full Koha search button"}},
                        {key:"search.warningFr",type:"text",label:{fr:"Avertissement français",en:"French warning"}},
                        {key:"search.warningEn",type:"text",label:{fr:"Avertissement anglais",en:"English warning"}},
                        {key:"search.zonesFr",type:"text",label:{fr:"Description des zones — français",en:"Searched fields — French"}},
                        {key:"search.zonesEn",type:"text",label:{fr:"Description des zones — anglais",en:"Searched fields — English"}},
                        {key:"search.classicButtonFr",type:"text",label:{fr:"Bouton classique — français",en:"Full search button — French"}},
                        {key:"search.classicButtonEn",type:"text",label:{fr:"Bouton classique — anglais",en:"Full search button — English"}}
                    ]
                },
                {
                    type:"section", id:"barcode", label:{fr:"Recherche par code-barres exemplaire",en:"Item barcode search"},
                    description:{fr:"Le CB est recherché via /api/v1/items puis fusionné avec les résultats notice. Les formats courants se configurent sans regex : préfixe, type de caractères, longueur et exemple de test.",en:"Barcodes are searched through /api/v1/items and merged with record results. Common formats are configured without regex: prefix, character type, length and a test example."},
                    fields:[
                        {key:"barcode.enabled",type:"boolean",label:{fr:"Intégrer les codes-barres aux recherches",en:"Include item barcodes in searches"}},
                        {key:"barcode.use036Recognizer",type:"boolean",label:{fr:"Réutiliser la reconnaissance du module 036 si disponible",en:"Reuse module 036 recognition when available"}},
                        {key:"barcode.accepted036ProfileIds",type:"text",advanced:true,label:{fr:"Profils 036 considérés comme codes-barres",en:"036 profiles treated as barcodes"}},
                        {key:"barcode.forcedIndexCodes",type:"text",label:{fr:"Index Koha qui forcent une recherche CB",en:"Koha indexes that force barcode lookup"},help:{fr:"Ex. bc,barcode. Sur ces index, la branche notice classique n’est pas lancée.",en:"E.g. bc,barcode. On these indexes the regular record branch is skipped."}},
                        {key:"barcode.exactEnabled",type:"boolean",label:{fr:"Chercher d’abord le CB exact",en:"Search exact barcode first"}},
                        {key:"barcode.prefixEnabled",type:"boolean",label:{fr:"Si aucun exact : chercher les CB commençant par la saisie",en:"If no exact match: search barcodes starting with input"}},
                        {key:"barcode.prefixMinLength",type:"number",min:1,max:128,label:{fr:"Longueur minimale pour la recherche par début de CB",en:"Minimum length for barcode prefix search"}},
                        {key:"barcode.maxMatches",type:"number",min:1,max:100,label:{fr:"Nombre maximum d’exemplaires retournés par recherche CB",en:"Maximum items returned by barcode lookup"}},
                        {key:"barcode.displayBarcode",type:"boolean",label:{fr:"Afficher le CB correspondant dans la proposition",en:"Show matching barcode in suggestion"}},
                        {key:"barcode.exactScoreBonus",type:"number",advanced:true,label:{fr:"Bonus de score CB exact",en:"Exact barcode score bonus"}},
                        {key:"barcode.prefixScoreBonus",type:"number",advanced:true,label:{fr:"Bonus de score CB partiel",en:"Prefix barcode score bonus"}},
                        {key:"barcode.fallbackProfiles",type:"repeater",label:{fr:"Formats de codes-barres reconnus",en:"Recognized barcode formats"},addLabel:{fr:"Ajouter un format de code-barres",en:"Add barcode format"},reorder:true,newItem:newBarcodeProfile,itemTitle:function(item,index,lang){return String(lang==="en"?(item&&item.labelEn||item&&item.id):(item&&item.labelFr||item&&item.id)||("CB "+(index+1)));},help:{fr:"Aucune expression régulière n’est nécessaire pour les formats courants. Exemple Dracénie préconfiguré : préfixe DR + 9 chiffres.",en:"No regular expression is required for common formats. Dracénie preset example: DR prefix + 9 digits."},fields:[
                            {key:"enabled",type:"boolean",label:{fr:"Format actif",en:"Format enabled"}},
                            {key:"labelFr",type:"text",label:{fr:"Nom du format",en:"Format name (French)"}},
                            {key:"labelEn",type:"text",advanced:true,label:{fr:"Nom anglais",en:"English name"}},
                            {key:"mode",type:"select",refreshOnChange:true,label:{fr:"Structure du code-barres",en:"Barcode structure"},options:[
                                {value:"digits",label:{fr:"Chiffres uniquement",en:"Digits only"}},
                                {value:"alphanumeric",label:{fr:"Lettres + chiffres (et séparateurs usuels)",en:"Letters + digits (and common separators)"}},
                                {value:"prefix-digits",label:{fr:"Préfixe fixe + chiffres",en:"Fixed prefix + digits"}},
                                {value:"prefix-alphanumeric",label:{fr:"Préfixe fixe + lettres/chiffres",en:"Fixed prefix + letters/digits"}},
                                {value:"expert",label:{fr:"Format expert (expression régulière)",en:"Expert format (regular expression)"}}
                            ]},
                            {key:"prefix",type:"text",refreshOnChange:true,label:{fr:"Préfixe fixe",en:"Fixed prefix"},placeholder:{fr:"DR",en:"DR"},when:barcodeProfileUsesPrefix},
                            {key:"minLength",type:"number",min:0,max:128,refreshOnChange:true,label:{fr:"Nombre minimum de caractères après le préfixe",en:"Minimum characters after prefix"},when:barcodeProfileUsesBuilder},
                            {key:"maxLength",type:"number",min:0,max:128,refreshOnChange:true,label:{fr:"Nombre maximum de caractères après le préfixe",en:"Maximum characters after prefix"},when:barcodeProfileUsesBuilder},
                            {key:"example",type:"text",refreshOnChange:true,label:{fr:"Exemple de code-barres à tester",en:"Example barcode to test"},placeholder:{fr:"DR100007790",en:"DR100007790"}},
                            {type:"custom",label:{fr:"Vérification du format",en:"Format check"},render:renderBarcodeProfilePreview},
                            {key:"regex",type:"text",label:{fr:"Expression régulière",en:"Regular expression"},when:barcodeProfileIsExpert,help:{fr:"Réservé aux formats complexes. Les autres modes construisent automatiquement cette règle.",en:"For complex formats only. Other modes build this rule automatically."}},
                            {key:"id",type:"text",advanced:true,label:{fr:"Identifiant technique",en:"Technical identifier"}}
                        ]}
                    ]
                },
                {
                    type:"section", id:"availability", label:{fr:"Disponibilité et cote",en:"Availability and call number"},
                    description:{fr:"Le mode par défaut tente une requête groupée, puis retombe sur 3 requêtes simultanées maximum si nécessaire. Il remplace le séquentiel historique sans revenir aux dizaines d’appels simultanés.",en:"Default mode tries one bulk request, then falls back to at most 3 concurrent requests when needed. It replaces the historical serial queue without returning to dozens of simultaneous calls."},
                    fields:[
                        {key:"availability.enabled",type:"boolean",label:{fr:"Afficher la disponibilité",en:"Show availability"}},
                        {key:"availability.autoEnrichCount",type:"number",min:0,max:100,label:{fr:"Nombre de premières propositions enrichies automatiquement",en:"Number of first suggestions enriched automatically"}},
                        {key:"availability.strategy",type:"select",label:{fr:"Stratégie de chargement",en:"Loading strategy"},options:[
                            {value:"bulk-then-queue",label:{fr:"Groupée puis file parallèle — recommandé",en:"Bulk then bounded queue — recommended"}},
                            {value:"queue",label:{fr:"File parallèle uniquement",en:"Bounded queue only"}}
                        ]},
                        {key:"availability.concurrency",type:"number",min:1,max:8,label:{fr:"Requêtes disponibilité simultanées maximum",en:"Maximum concurrent availability requests"}},
                        {key:"availability.bulkMaxItems",type:"number",min:20,max:2000,advanced:true,label:{fr:"Maximum d’exemplaires dans la requête groupée",en:"Maximum items in bulk request"}},
                        {key:"availability.showHereElsewhere",type:"boolean",label:{fr:"Distinguer Disponible ici / ailleurs",en:"Distinguish Available here / elsewhere"}},
                        {key:"availability.showCallnumber",type:"boolean",label:{fr:"Afficher la cote",en:"Show call number"}},
                        {key:"availability.cacheTtlMs",type:"number",advanced:true,label:{fr:"Durée du cache disponibilité (ms)",en:"Availability cache duration (ms)"}}
                    ]
                },
                {
                    type:"section", id:"covers", label:{fr:"Couvertures",en:"Covers"},
                    fields:[
                        {key:"covers.enabled",type:"boolean",label:{fr:"Afficher les couvertures",en:"Show covers"}},
                        {key:"covers.autoLoad",type:"boolean",label:{fr:"Charger automatiquement les premières couvertures",en:"Automatically load first covers"}},
                        {key:"covers.autoEnrichCount",type:"number",min:0,max:100,label:{fr:"Nombre de couvertures chargées automatiquement",en:"Number of covers loaded automatically"}},
                        {key:"covers.provider",type:"select",label:{fr:"Source principale",en:"Primary source"},options:[
                            {value:"electre",label:{fr:"Electre via endpoint Koha historique",en:"Electre through historical Koha endpoint"}},
                            {value:"fallback",label:{fr:"Uniquement l’URL déjà fournie par la notice",en:"Only URL already supplied by the record"}}
                        ]},
                        {key:"covers.endpoint",type:"text",advanced:true,label:{fr:"Endpoint couverture Electre",en:"Electre cover endpoint"}},
                        {key:"covers.useFallbackUrl",type:"boolean",label:{fr:"Utiliser l’URL de repli de la notice",en:"Use record fallback URL"}},
                        {key:"covers.previewEnabled",type:"boolean",label:{fr:"Agrandir la couverture au survol",en:"Enlarge cover on hover"}},
                        {key:"covers.thumbWidthPx",type:"number",min:20,max:120,label:{fr:"Largeur vignette (px)",en:"Thumbnail width (px)"}},
                        {key:"covers.thumbHeightPx",type:"number",min:20,max:180,label:{fr:"Hauteur vignette (px)",en:"Thumbnail height (px)"}},
                        {key:"covers.previewWidthPx",type:"number",min:80,max:600,advanced:true,label:{fr:"Largeur aperçu (px)",en:"Preview width (px)"}},
                        {key:"covers.previewHeightPx",type:"number",min:100,max:900,advanced:true,label:{fr:"Hauteur aperçu (px)",en:"Preview height (px)"}},
                        {key:"covers.concurrency",type:"number",min:1,max:4,advanced:true,label:{fr:"Couvertures simultanées maximum",en:"Maximum concurrent cover requests"}},
                        {key:"covers.cacheTtlMs",type:"number",advanced:true,label:{fr:"Durée du cache couverture (ms)",en:"Cover cache duration (ms)"}}
                    ]
                },
                {
                    type:"section", id:"display", label:{fr:"Affichage",en:"Display"},
                    fields:[
                        {key:"display.showAuthor",type:"boolean",label:{fr:"Afficher l’auteur",en:"Show author"}},
                        {key:"display.showPublisher",type:"boolean",label:{fr:"Afficher l’éditeur",en:"Show publisher"}},
                        {key:"display.showYear",type:"boolean",label:{fr:"Afficher l’année",en:"Show year"}},
                        {key:"display.showItemType",type:"boolean",label:{fr:"Afficher le type de document",en:"Show item type"}},
                        {key:"display.maxHeightPx",type:"number",min:150,max:1000,label:{fr:"Hauteur maximale du menu (px)",en:"Maximum menu height (px)"}},
                        {key:"display.menuWidthMode",type:"select",label:{fr:"Largeur du menu",en:"Menu width"},options:[
                            {value:"input",label:{fr:"Même largeur que la barre — historique",en:"Same width as search input — historical"}},
                            {value:"fixed",label:{fr:"Largeur fixe",en:"Fixed width"}},
                            {value:"viewport",label:{fr:"Largeur adaptée à l’écran",en:"Viewport-adaptive width"}}
                        ]},
                        {key:"display.fixedWidthPx",type:"number",min:280,max:1200,label:{fr:"Largeur fixe (px)",en:"Fixed width (px)"}},
                        {key:"display.responsiveBreakpointPx",type:"number",min:320,max:1200,advanced:true,label:{fr:"Seuil responsive (px)",en:"Responsive breakpoint (px)"}}
                    ]
                },
                {
                    type:"section", id:"performance", label:{fr:"Performance et cache",en:"Performance and cache"},
                    fields:[
                        {key:"performance.searchCacheTtlMs",type:"number",advanced:true,label:{fr:"Cache recherches notices (ms)",en:"Record search cache (ms)"}},
                        {key:"performance.barcodeCacheTtlMs",type:"number",advanced:true,label:{fr:"Cache recherches CB (ms)",en:"Barcode search cache (ms)"}},
                        {key:"performance.maxSearchCacheEntries",type:"number",min:5,max:500,advanced:true,label:{fr:"Nombre maximal d’entrées de cache",en:"Maximum cache entries"}},
                        {key:"performance.abortObsoleteRequests",type:"boolean",advanced:true,label:{fr:"Annuler les requêtes devenues obsolètes",en:"Abort obsolete requests"}}
                    ]
                },
                {
                    type:"section", id:"scoring", label:{fr:"Classement avancé",en:"Advanced ranking"},
                    description:{fr:"Pondérations historiques. À modifier uniquement si l’ordre des propositions doit réellement changer.",en:"Historical weights. Change only when suggestion ordering genuinely needs adjustment."},
                    fields:[
                        {key:"scoring.titleTerm",type:"number",advanced:true,label:{fr:"Titre contient un terme",en:"Title contains a term"}},
                        {key:"scoring.authorTerm",type:"number",advanced:true,label:{fr:"Auteur contient un terme",en:"Author contains a term"}},
                        {key:"scoring.unititleTerm",type:"number",advanced:true,label:{fr:"Titre uniforme contient un terme",en:"Uniform title contains a term"}},
                        {key:"scoring.publisherTerm",type:"number",advanced:true,label:{fr:"Éditeur contient un terme",en:"Publisher contains a term"}},
                        {key:"scoring.titleExact",type:"number",advanced:true,label:{fr:"Titre exact",en:"Exact title"}},
                        {key:"scoring.titlePrefix",type:"number",advanced:true,label:{fr:"Titre commence par",en:"Title starts with"}},
                        {key:"scoring.authorExact",type:"number",advanced:true,label:{fr:"Auteur exact",en:"Exact author"}},
                        {key:"scoring.authorPrefix",type:"number",advanced:true,label:{fr:"Auteur commence par",en:"Author starts with"}},
                        {key:"scoring.isbnExact",type:"number",advanced:true,label:{fr:"ISBN exact",en:"Exact ISBN"}},
                        {key:"scoring.eanExact",type:"number",advanced:true,label:{fr:"EAN exact",en:"Exact EAN"}}
                    ]
                }
            ],
            focusContext:function (main, context) {
                if (!main) return;
                const wanted = context && context.sectionId ? context.sectionId : "search";
                const section = main.querySelector('[data-pmk-section-id="' + wanted + '"]');
                if (section) window.setTimeout(function () { section.scrollIntoView({ block:"start", behavior:"smooth" }); }, 0);
            }
        });

        if (typeof window.PMKConfig.subscribe === "function") {
            try {
                unsubscribeConfig = window.PMKConfig.subscribe(MODULE_ID, function (cfg) {
                    applyConfig(cfg);
                });
            } catch (_) {}
        }
        return true;
    }

    function loadConfig() {
        registerModule();
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") return Promise.resolve(deepClone(DEFAULT_CONFIG));
        return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
            .then(function (cfg) { return normalizeConfig(cfg); })
            .catch(function () { return deepClone(DEFAULT_CONFIG); });
    }

    function destroyRuntime() {
        abortSearchRequests();
        resetEnrichment();
        currentItemMap.clear();
        $("#" + PREVIEW_ID).hide();

        if ($input && $input.length && $input.data(OWNED_DATA_KEY)) {
            try { $input.autocomplete("destroy"); } catch (_) {}
            $input.removeData(OWNED_DATA_KEY);
        }
        $input = $();
    }

    function applyConfig(config) {
        currentConfig = normalizeConfig(config);
        destroyRuntime();
        addStyles();
        ensurePreview();
        setupLazyHandler();
        if (!currentConfig.enabled || !pathAllowed()) return false;
        $input = getInput();
        if (!$input.length || typeof $input.autocomplete !== "function") return false;
        const ok = configureAutocomplete();
        if (ok) mountContextAccess();
        moduleStarted = ok;
        return ok;
    }

    function activateFromPMKOrDefaults() {
        registerModule();
        loadConfig().then(applyConfig);
    }

    function start() {
        if (registerModule()) {
            loadConfig().then(applyConfig);
            return;
        }

        // Le 113 doit rester utilisable même si le socle PMK arrive après lui.
        applyConfig(DEFAULT_CONFIG);

        const onReady = function () {
            window.removeEventListener("pmk:config-ready", onReady);
            activateFromPMKOrDefaults();
        };
        window.addEventListener("pmk:config-ready", onReady, { once:true });
        window.setTimeout(function () {
            if (!configRegistered && window.PMKConfig) activateFromPMKOrDefaults();
        }, 6000);
    }

    window.PMK113SearchAutocomplete = {
        moduleId:MODULE_ID,
        version:MODULE_VERSION,
        defaults:deepClone(DEFAULT_CONFIG),
        getConfig:function () { return deepClone(currentConfig); },
        refresh:function () { return loadConfig().then(applyConfig); },
        recognizeBarcode:function (value, index) { return recognizeBarcode(value, index || getIndexValue()); },
        scoreResult:function (item, terms, query) { return scoreResult(item || {}, terms || [], query || ""); },
        clearCaches:function () {
            searchCache.clear();
            barcodeCache.clear();
            availabilityCache.clear();
            coverCache.clear();
        },
        destroy:destroyRuntime
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once:true });
    } else {
        start();
    }
})(window, document, window.jQuery);

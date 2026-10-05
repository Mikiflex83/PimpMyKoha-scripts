/* ============================================================
   099-efficiency-indicators.js
   Version : 3.0.0-pmk-isolated
   Date : 2026-09-20
   Auteur historique : Michael Mundet

   Indicateurs d'efficacité des exemplaires et des notices.

   Refonte préparatoire PimpMyKoha :
   - aucune dépendance obligatoire à 129 ;
   - API Koha comme source principale ;
   - fonctionnement autonome sur detail.pl et search.pl ;
   - conservation des icônes historiques : 👑 🔥 ✅ ⚠️ 🛏️ ❌ ;
   - conservation du calcul historique et de ses valeurs par défaut ;
   - domaines, localisations, pondérations, seuils et couleurs configurables ;
   - 099$a utilisé par défaut comme source MARC du domaine ;
   - page d'aide historique reconstruite dynamiquement depuis la configuration ;
   - aucun délai fixe de 5 secondes ;
   - idempotent et compatible avec les redraw DataTables de detail.pl.
   ============================================================ */
(function () {
    "use strict";

    const MODULE_ID = "efficiency-indicators";
    const MODULE_VERSION = "3.0.0";
    const GLOBAL_GUARD = "__PMK_099_EFFICIENCY_V3__";
    const DETAIL_PATH = "/cgi-bin/koha/catalogue/detail.pl";
    const SEARCH_PATH = "/cgi-bin/koha/catalogue/search.pl";
    const STYLE_ID = "pmk-099-efficiency-style";
    const HELP_CLASS = "pmk-099-help-link";
    const ITEM_INDICATOR_CLASS = "pmk-099-item-indicator";
    const GLOBAL_INDICATOR_CLASS = "global-efficiency-indicator"; // classe historique conservée
    const GLOBAL_OWN_CLASS = "pmk-099-global-indicator";
    const DONE_ATTR = "data-pmk099-done";

    if (window[GLOBAL_GUARD]) return;
    window[GLOBAL_GUARD] = {
        id: MODULE_ID,
        version: MODULE_VERSION,
        config: null,
        itemCache: new Map(),
        marcCache: new Map(),
        biblioCache: new Map(),
        running: false,
        refreshTimer: null
    };

    const state = window[GLOBAL_GUARD];

    const ICONS = Object.freeze({
        exceptional: "👑",
        excellent: "🔥",
        good: "✅",
        medium: "⚠️",
        dormant: "🛏️",
        low: "❌"
    });

    const DEFAULTS = {
        enabled: true,
        language: "auto",
        pages: {
            detail: { enabled: true, path: DETAIL_PATH },
            search: { enabled: true, path: SEARCH_PATH }
        },
        api: {
            perPage: 100,
            maxPages: 20,
            concurrency: 4,
            requestTimeoutMs: 10000,
            useStrings: true
        },
        sources: {
            domainMode: "marc_api_then_dom",
            domainMarcTag: "099",
            domainMarcSubfield: "a",
            domDomainFallback: true,
            fallbackToBiblioCreationDate: true,
            domCreationDateFallback: true,
            itemRuleFields: "location\nholding_library_id\nhome_library_id"
        },
        calculation: {
            minAgeYears: 1,
            recentLoanDays: 365,
            middleLoanDays: 1095,
            recentWeight: 1,
            middleWeight: 0.5,
            oldWeight: 0.2,
            neverLoanedWeight: 0.2,
            decimals: 2
        },
        exclusions: {
            ignoredKeywords: [
                "tri", "Zone de tri", "Magasin", "Magasin/reserve",
                "MBA-BIB", "Bibliothèque", "MBA-J", "Espace Jeunesse",
                "MBA-R1", "Réserve 1", "MBA-R2", "Réserve 2",
                "Espace consultation", "Collectivités", "conservation",
                "Conservation", "bureaux", "Bureaux", "anim", "Animations",
                "Service archéologique"
            ].join("\n"),
            specialKeywords: [
                "Parents et compagnie", "parents-enfants", "réservoir",
                "reserv_", "parents", "réserv", "reservoir adulte",
                "reservoir jeunesse", "Réservoir Jeunesse", "Réservoir Adulte"
            ].join("\n")
        },
        domains: {
            lowRotation: [
                "Littérature", "Les Arts", "Arts", "Arts du spectacle",
                "Poésie et Théâtre", "Musique à lire", "Vie pratique",
                "Hommes et Société", "Sciences et Techniques",
                "Les civilisations", "Le Var", "La Région Sud"
            ].join("\n"),
            normalRotation: [
                "Bande dessinée", "Romans Ados", "Romans adultes",
                "Romans jeunesse", "Albums", "Contes", "Cinéma",
                "Musique", "Vivre ensemble", "Découvrir le monde",
                "Mon quotidien", "Parents et compagnie", "Objets",
                "Grandeur nature", "Informatique", "Lire autrement",
                "Pop-Up", "V.O"
            ].join("\n")
        },
        thresholds: {
            low: { exceptional: 10, excellent: 3, good: 1, medium: 0.3 },
            normal: { exceptional: 20, excellent: 7, good: 2, medium: 0.5 },
            fallback: { exceptional: 15, excellent: 5, good: 1.5, medium: 0.4 },
            special: { exceptional: 10, excellent: 3, good: 1, medium: 0.3 }
        },
        display: {
            showItemIndicatorsOnDetail: true,
            showNoticeIndicator: true,
            showHelpQuestion: true,
            showApproximationMarker: true,
            showExcludedLock: true,
            helpNewTab: true,
            colors: {
                exceptionalBg: "#fffdf0",
                exceptionalBorder: "#ffd700",
                excellentBg: "#f0fff0",
                excellentBorder: "#8fbc8f",
                goodBg: "#f0f8ff",
                goodBorder: "#add8e6",
                mediumBg: "#fffdf0",
                mediumBorder: "#e6e6a0",
                dormantBg: "#ffe0c2",
                dormantBorder: "#ffb564",
                lowBg: "#fff0f0",
                lowBorder: "#e6a0a0",
                approximation: "#1976d2",
                special: "#ff9800",
                lowDomain: "#9c27b0",
                normalDomain: "#4caf50",
                excluded: "#4caf50"
            }
        }
    };

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function isObject(value) {
        return value && typeof value === "object" && !Array.isArray(value);
    }

    function merge(base, extra) {
        const out = clone(base);
        if (!isObject(extra)) return out;
        Object.keys(extra).forEach(function (key) {
            if (Array.isArray(extra[key])) out[key] = clone(extra[key]);
            else if (isObject(extra[key]) && isObject(out[key])) out[key] = merge(out[key], extra[key]);
            else if (extra[key] !== undefined) out[key] = extra[key];
        });
        return out;
    }

    function clampNumber(value, min, max, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    }

    function clampInteger(value, min, max, fallback) {
        return Math.round(clampNumber(value, min, max, fallback));
    }

    function normalizeListString(value, fallback) {
        if (Array.isArray(value)) return value.map(String).join("\n");
        if (value == null) return fallback;
        return String(value);
    }

    function normalizeConfig(input) {
        const cfg = merge(DEFAULTS, isObject(input) ? input : {});
        cfg.enabled = cfg.enabled !== false;
        cfg.language = ["auto", "fr", "en"].includes(cfg.language) ? cfg.language : "auto";

        cfg.pages.detail.enabled = cfg.pages.detail.enabled !== false;
        cfg.pages.search.enabled = cfg.pages.search.enabled !== false;
        cfg.pages.detail.path = DETAIL_PATH;
        cfg.pages.search.path = SEARCH_PATH;

        cfg.api.perPage = clampInteger(cfg.api.perPage, 10, 500, DEFAULTS.api.perPage);
        cfg.api.maxPages = clampInteger(cfg.api.maxPages, 1, 100, DEFAULTS.api.maxPages);
        cfg.api.concurrency = clampInteger(cfg.api.concurrency, 1, 10, DEFAULTS.api.concurrency);
        cfg.api.requestTimeoutMs = clampInteger(cfg.api.requestTimeoutMs, 1500, 60000, DEFAULTS.api.requestTimeoutMs);
        cfg.api.useStrings = cfg.api.useStrings !== false;

        cfg.sources.domainMode = ["marc_api_then_dom", "dom_then_marc_api", "marc_api", "dom", "none"].includes(cfg.sources.domainMode)
            ? cfg.sources.domainMode : DEFAULTS.sources.domainMode;
        cfg.sources.domainMarcTag = String(cfg.sources.domainMarcTag || DEFAULTS.sources.domainMarcTag).trim().padStart(3, "0").slice(-3);
        cfg.sources.domainMarcSubfield = String(cfg.sources.domainMarcSubfield || DEFAULTS.sources.domainMarcSubfield).trim().slice(0, 1) || "a";
        cfg.sources.domDomainFallback = cfg.sources.domDomainFallback !== false;
        cfg.sources.fallbackToBiblioCreationDate = cfg.sources.fallbackToBiblioCreationDate !== false;
        cfg.sources.domCreationDateFallback = cfg.sources.domCreationDateFallback !== false;
        cfg.sources.itemRuleFields = normalizeListString(cfg.sources.itemRuleFields, DEFAULTS.sources.itemRuleFields);

        cfg.calculation.minAgeYears = clampNumber(cfg.calculation.minAgeYears, 0.01, 100, DEFAULTS.calculation.minAgeYears);
        cfg.calculation.recentLoanDays = clampInteger(cfg.calculation.recentLoanDays, 1, 36500, DEFAULTS.calculation.recentLoanDays);
        cfg.calculation.middleLoanDays = clampInteger(cfg.calculation.middleLoanDays, cfg.calculation.recentLoanDays, 36500, DEFAULTS.calculation.middleLoanDays);
        cfg.calculation.recentWeight = clampNumber(cfg.calculation.recentWeight, 0, 100, DEFAULTS.calculation.recentWeight);
        cfg.calculation.middleWeight = clampNumber(cfg.calculation.middleWeight, 0, 100, DEFAULTS.calculation.middleWeight);
        cfg.calculation.oldWeight = clampNumber(cfg.calculation.oldWeight, 0, 100, DEFAULTS.calculation.oldWeight);
        cfg.calculation.neverLoanedWeight = clampNumber(cfg.calculation.neverLoanedWeight, 0, 100, DEFAULTS.calculation.neverLoanedWeight);
        cfg.calculation.decimals = clampInteger(cfg.calculation.decimals, 0, 6, DEFAULTS.calculation.decimals);

        cfg.exclusions.ignoredKeywords = normalizeListString(cfg.exclusions.ignoredKeywords, DEFAULTS.exclusions.ignoredKeywords);
        cfg.exclusions.specialKeywords = normalizeListString(cfg.exclusions.specialKeywords, DEFAULTS.exclusions.specialKeywords);
        cfg.domains.lowRotation = normalizeListString(cfg.domains.lowRotation, DEFAULTS.domains.lowRotation);
        cfg.domains.normalRotation = normalizeListString(cfg.domains.normalRotation, DEFAULTS.domains.normalRotation);

        ["low", "normal", "fallback", "special"].forEach(function (key) {
            const def = DEFAULTS.thresholds[key];
            const t = cfg.thresholds[key] || {};
            t.exceptional = clampNumber(t.exceptional, 0, 1000000, def.exceptional);
            t.excellent = clampNumber(t.excellent, 0, t.exceptional, def.excellent);
            t.good = clampNumber(t.good, 0, t.excellent, def.good);
            t.medium = clampNumber(t.medium, 0, t.good, def.medium);
            cfg.thresholds[key] = t;
        });

        cfg.display.showItemIndicatorsOnDetail = cfg.display.showItemIndicatorsOnDetail !== false;
        cfg.display.showNoticeIndicator = cfg.display.showNoticeIndicator !== false;
        cfg.display.showHelpQuestion = cfg.display.showHelpQuestion !== false;
        cfg.display.showApproximationMarker = cfg.display.showApproximationMarker !== false;
        cfg.display.showExcludedLock = cfg.display.showExcludedLock !== false;
        cfg.display.helpNewTab = cfg.display.helpNewTab !== false;
        cfg.display.colors = merge(DEFAULTS.display.colors, cfg.display.colors || {});
        return cfg;
    }

    function splitList(value) {
        return String(value || "")
            .split(/[\n;,]+/)
            .map(function (v) { return v.trim(); })
            .filter(Boolean);
    }

    function norm(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function language(cfg) {
        if (cfg.language === "fr" || cfg.language === "en") return cfg.language;
        try {
            if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
                return window.PMKConfig.getLanguage() === "en" ? "en" : "fr";
            }
        } catch (_) {}
        const htmlLang = String(document.documentElement.lang || "").toLowerCase();
        return htmlLang.startsWith("en") ? "en" : "fr";
    }

    function roundScore(value, cfg) {
        const p = Math.pow(10, cfg.calculation.decimals);
        return Math.round((Number(value) + Number.EPSILON) * p) / p;
    }

    function parseDate(value) {
        if (!value) return null;
        if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
        const raw = String(value).trim();
        if (!raw) return null;
        const iso = raw.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
        if (iso) return validatedDate(iso[1], iso[2], iso[3]);
        const dmy = raw.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
        if (dmy) return validatedDate(dmy[3], dmy[2], dmy[1]);
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function validatedDate(y, m, d) {
        const year = Number(y), month = Number(m), day = Number(d);
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
        return date;
    }

    function ageInYears(date, cfg) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
        const rawAge = (Date.now() - date.getTime()) / 31557600000;
        return Math.max(rawAge, cfg.calculation.minAgeYears);
    }

    function inactivityWeight(lastLoanDate, cfg) {
        if (!(lastLoanDate instanceof Date) || Number.isNaN(lastLoanDate.getTime())) return cfg.calculation.neverLoanedWeight;
        const diffDays = (Date.now() - lastLoanDate.getTime()) / 86400000;
        if (diffDays <= cfg.calculation.recentLoanDays) return cfg.calculation.recentWeight;
        if (diffDays <= cfg.calculation.middleLoanDays) return cfg.calculation.middleWeight;
        return cfg.calculation.oldWeight;
    }

    function getString(item, key) {
        const v = item && item._strings ? item._strings[key] : null;
        if (typeof v === "string") return v;
        if (v && typeof v === "object") return String(v.str || v.description || v.name || "");
        return "";
    }

    function itemFieldValues(item, cfg) {
        const fields = splitList(cfg.sources.itemRuleFields);
        const values = [];
        fields.forEach(function (field) {
            let raw = "";
            if (field === "holding_library_id") raw = getString(item, field) || item.holding_library?.name || item.holding_library_id || "";
            else if (field === "home_library_id") raw = getString(item, field) || item.home_library?.name || item.home_library_id || "";
            else raw = getString(item, field) || item[field] || "";
            if (raw !== null && raw !== undefined && String(raw).trim()) values.push(String(raw).trim());
        });
        return values;
    }

    function anyKeyword(values, keywords) {
        const normalizedKeywords = keywords.map(norm).filter(Boolean);
        return values.some(function (value) {
            const v = norm(value);
            return normalizedKeywords.some(function (k) { return v.includes(k); });
        });
    }

    function isIgnored(item, cfg) {
        return anyKeyword(itemFieldValues(item, cfg), splitList(cfg.exclusions.ignoredKeywords));
    }

    function isSpecial(item, cfg) {
        return anyKeyword(itemFieldValues(item, cfg), splitList(cfg.exclusions.specialKeywords));
    }

    function domainProfile(domain, hasSpecial, cfg) {
        if (hasSpecial) return "special";
        const d = norm(domain);
        if (d && splitList(cfg.domains.lowRotation).some(function (v) { return norm(v) === d; })) return "low";
        if (d && splitList(cfg.domains.normalRotation).some(function (v) { return norm(v) === d; })) return "normal";
        return "fallback";
    }

    function classify(score, profile, cfg) {
        const t = cfg.thresholds[profile] || cfg.thresholds.fallback;
        if (score >= t.exceptional) return { key: "exceptional", icon: ICONS.exceptional };
        if (score >= t.excellent) return { key: "excellent", icon: ICONS.excellent };
        if (score >= t.good) return { key: "good", icon: ICONS.good };
        if (score >= t.medium) return { key: "medium", icon: ICONS.medium };
        if (score > 0) return { key: "dormant", icon: ICONS.dormant };
        return { key: "low", icon: ICONS.low };
    }

    function qualitativeLabel(key, cfg) {
        const en = language(cfg) === "en";
        const labels = {
            exceptional: en ? "Exceptional" : "Exceptionnel",
            excellent: en ? "Excellent" : "Excellent",
            good: en ? "Good" : "Bon",
            medium: en ? "Average" : "Moyen",
            dormant: en ? "Dormant" : "Dormant",
            low: en ? "Low" : "Faible"
        };
        return labels[key] || key;
    }

    function indicatorText(classification, cfg) {
        return classification.icon + " " + qualitativeLabel(classification.key, cfg);
    }

    function apiHeaders(cfg, accept) {
        const headers = { Accept: accept || "application/json" };
        if ((accept || "application/json") === "application/json" && cfg.api.useStrings) headers["x-koha-embed"] = "+strings";
        return headers;
    }

    async function fetchWithTimeout(url, options, timeoutMs) {
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = controller ? window.setTimeout(function () { controller.abort(); }, timeoutMs) : null;
        try {
            return await fetch(url, Object.assign({}, options || {}, controller ? { signal: controller.signal } : {}));
        } finally {
            if (timer) window.clearTimeout(timer);
        }
    }

    async function fetchItemsPage(biblioNumber, page, cfg, withStrings) {
        const url = `/api/v1/biblios/${encodeURIComponent(biblioNumber)}/items?_page=${page}&_per_page=${cfg.api.perPage}`;
        const headers = { Accept: "application/json" };
        if (withStrings) headers["x-koha-embed"] = "+strings";
        const response = await fetchWithTimeout(url, { credentials: "same-origin", headers: headers }, cfg.api.requestTimeoutMs);
        if (!response.ok) throw new Error(`Koha API items ${response.status}`);
        return {
            items: await response.json(),
            total: Number(response.headers.get("x-total-count") || 0)
        };
    }

    async function fetchAllItems(biblioNumber, cfg) {
        const cacheKey = String(biblioNumber);
        if (state.itemCache.has(cacheKey)) return clone(state.itemCache.get(cacheKey));

        async function load(withStrings) {
            const all = [];
            for (let page = 1; page <= cfg.api.maxPages; page += 1) {
                const result = await fetchItemsPage(biblioNumber, page, cfg, withStrings);
                const items = Array.isArray(result.items) ? result.items : [];
                all.push.apply(all, items);
                const total = result.total || all.length;
                if (items.length < cfg.api.perPage || all.length >= total) break;
            }
            return all;
        }

        let items;
        try { items = await load(cfg.api.useStrings); }
        catch (e) {
            if (!cfg.api.useStrings) throw e;
            items = await load(false);
        }
        state.itemCache.set(cacheKey, clone(items));
        return items;
    }

    async function fetchMarc(biblioNumber, cfg) {
        const key = String(biblioNumber);
        if (state.marcCache.has(key)) return clone(state.marcCache.get(key));
        const response = await fetchWithTimeout(`/api/v1/biblios/${encodeURIComponent(biblioNumber)}`, {
            credentials: "same-origin",
            headers: { Accept: "application/marc-in-json" }
        }, cfg.api.requestTimeoutMs);
        if (!response.ok) throw new Error(`Koha API MARC ${response.status}`);
        const marc = await response.json();
        state.marcCache.set(key, clone(marc));
        return marc;
    }

    async function fetchBiblioJson(biblioNumber, cfg) {
        const key = String(biblioNumber);
        if (state.biblioCache.has(key)) return clone(state.biblioCache.get(key));
        const response = await fetchWithTimeout(`/api/v1/biblios/${encodeURIComponent(biblioNumber)}`, {
            credentials: "same-origin",
            headers: { Accept: "application/json" }
        }, cfg.api.requestTimeoutMs);
        if (!response.ok) throw new Error(`Koha API biblio ${response.status}`);
        const obj = await response.json();
        state.biblioCache.set(key, clone(obj));
        return obj;
    }

    function marcSubfield(marc, tag, code) {
        const fields = marc && Array.isArray(marc.fields) ? marc.fields : [];
        for (const field of fields) {
            const value = field && field[tag];
            if (!value) continue;
            const subfields = Array.isArray(value.subfields) ? value.subfields : [];
            for (const subfield of subfields) {
                if (subfield && subfield[code] !== undefined) return String(subfield[code]).trim();
            }
        }
        return "";
    }

    function domainFromDom(scope) {
        const root = scope || document;
        const direct = root.querySelector('.kx-notice-meta-acquisition a[href*="idx=f099a"], .technique-text a[href*="idx=f099a"], a[href*="idx=f099a"]');
        if (direct && direct.textContent.trim()) return direct.textContent.trim();
        const candidates = root.querySelectorAll("li");
        for (const li of candidates) {
            const text = String(li.textContent || "").replace(/\s+/g, " ").trim();
            const match = text.match(/Domaine\s*:\s*(.+?)(?:\s{2,}|$)/i);
            if (match && match[1]) return match[1].trim();
        }
        return "";
    }

    async function resolveDomain(biblioNumber, scope, cfg) {
        const mode = cfg.sources.domainMode;
        const dom = function () { return cfg.sources.domDomainFallback ? domainFromDom(scope) : ""; };
        const marc = async function () {
            try {
                const record = await fetchMarc(biblioNumber, cfg);
                return marcSubfield(record, cfg.sources.domainMarcTag, cfg.sources.domainMarcSubfield);
            } catch (_) { return ""; }
        };
        if (mode === "none") return "";
        if (mode === "dom") return dom();
        if (mode === "marc_api") return await marc();
        if (mode === "dom_then_marc_api") return dom() || await marc();
        return (await marc()) || dom();
    }

    function creationDateFromDom(scope) {
        const root = scope || document;
        const selectors = ["li.date-creation-tech", ".date-creation-tech", "[data-pmk-biblio-created]"];
        for (const selector of selectors) {
            for (const el of root.querySelectorAll(selector)) {
                const text = String(el.textContent || "");
                const m = text.match(/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}|\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2})/);
                if (m) return parseDate(m[1]);
            }
        }
        return null;
    }

    async function resolveBiblioCreationDate(biblioNumber, scope, cfg) {
        if (!cfg.sources.fallbackToBiblioCreationDate) return null;
        try {
            const b = await fetchBiblioJson(biblioNumber, cfg);
            const candidates = [b.creation_date, b.datecreated, b.created_on, b.created_at, b.timestamp];
            for (const value of candidates) {
                const d = parseDate(value);
                if (d) return d;
            }
        } catch (_) {}
        return cfg.sources.domCreationDateFallback ? creationDateFromDom(scope) : null;
    }

    function getBiblioNumberFromPage() {
        const url = new URL(window.location.href);
        const q = url.searchParams.get("biblionumber") || url.searchParams.get("biblio_id");
        if (q && /^\d+$/.test(q)) return q;
        const candidate = document.querySelector('[data-biblionumber], input[name="biblionumber"], a[href*="biblionumber="]');
        if (candidate) {
            const data = candidate.getAttribute("data-biblionumber") || candidate.value || "";
            if (/^\d+$/.test(data)) return data;
            const href = candidate.getAttribute("href");
            if (href) {
                try {
                    const n = new URL(href, window.location.origin).searchParams.get("biblionumber");
                    if (n && /^\d+$/.test(n)) return n;
                } catch (_) {}
            }
        }
        return "";
    }

    function calculateItem(item, biblioCreationDate, domain, cfg) {
        const ignored = isIgnored(item, cfg);
        const special = isSpecial(item, cfg);
        if (ignored) return { ignored: true, special: special, item: item };

        const loansRaw = item.checkouts_count;
        const hasLoansValue = loansRaw !== null && loansRaw !== undefined && String(loansRaw).trim() !== "" && Number.isFinite(Number(loansRaw));
        if (!hasLoansValue) return { error: "loans", special: special, item: item };
        const loans = Number(loansRaw);

        let acquisition = parseDate(item.acquisition_date);
        let approximate = false;
        if (!acquisition && biblioCreationDate) {
            acquisition = biblioCreationDate;
            approximate = true;
        }
        if (!acquisition) return { error: "acquisition", loans: loans, special: special, item: item };

        const age = ageInYears(acquisition, cfg);
        if (!age) return { error: "age", loans: loans, special: special, item: item };
        const lastLoan = parseDate(item.last_checkout_date);
        const weight = inactivityWeight(lastLoan, cfg);
        const score = roundScore((loans / age) * weight, cfg);
        const profile = domainProfile(domain, special, cfg);
        const classification = classify(score, profile, cfg);

        return {
            ignored: false,
            error: null,
            item: item,
            loans: loans,
            acquisition: acquisition,
            lastLoan: lastLoan,
            age: age,
            weight: weight,
            score: score,
            profile: profile,
            classification: classification,
            special: special,
            approximate: approximate,
            values: itemFieldValues(item, cfg)
        };
    }

    function aggregate(results, domain, cfg) {
        const counted = results.filter(function (r) { return !r.ignored && !r.error; });
        const ignored = results.filter(function (r) { return r.ignored; });
        const errors = results.filter(function (r) { return !r.ignored && r.error; });
        const special = counted.some(function (r) { return r.special; });
        const approximate = counted.some(function (r) { return r.approximate; });
        if (!counted.length) return { counted: counted, ignored: ignored, errors: errors, special: special, approximate: approximate, domain: domain };

        const sum = function (key) { return counted.reduce(function (acc, r) { return acc + Number(r[key] || 0); }, 0); };
        const score = roundScore(sum("score") / counted.length, cfg); // moyenne des scores déjà arrondis : comportement historique
        const profile = domainProfile(domain, special, cfg);
        return {
            counted: counted,
            ignored: ignored,
            errors: errors,
            special: special,
            approximate: approximate,
            domain: domain,
            loans: sum("loans"),
            averageAge: sum("age") / counted.length,
            averageWeight: sum("weight") / counted.length,
            averageLoans: sum("loans") / counted.length,
            score: score,
            profile: profile,
            classification: classify(score, profile, cfg)
        };
    }

    function profileName(profile, cfg) {
        const en = language(cfg) === "en";
        if (profile === "low") return en ? "low rotation" : "rotation faible";
        if (profile === "normal") return en ? "normal rotation" : "rotation normale";
        if (profile === "special") return en ? "special location / low rotation" : "localisation spéciale / rotation faible";
        return en ? "default" : "par défaut";
    }

    function scaleText(profile, domain, cfg) {
        const t = cfg.thresholds[profile] || cfg.thresholds.fallback;
        const en = language(cfg) === "en";
        if (en) {
            return `Evaluation scale (${profileName(profile, cfg)}${domain ? ` — ${domain}` : ""})\nScore ≥${t.exceptional} | ${ICONS.exceptional} Exceptional\nScore ≥${t.excellent} and <${t.exceptional} | ${ICONS.excellent} Excellent\nScore ≥${t.good} and <${t.excellent} | ${ICONS.good} Good\nScore ≥${t.medium} and <${t.good} | ${ICONS.medium} Average\nScore >0 and <${t.medium} | ${ICONS.dormant} Dormant\nScore ≤0 | ${ICONS.low} Low`;
        }
        return `Échelle d'évaluation (${profileName(profile, cfg)}${domain ? ` — ${domain}` : ""})\nScore ≥${t.exceptional} | ${ICONS.exceptional} Exceptionnel\nScore ≥${t.excellent} et <${t.exceptional} | ${ICONS.excellent} Excellent\nScore ≥${t.good} et <${t.excellent} | ${ICONS.good} Bon\nScore ≥${t.medium} et <${t.good} | ${ICONS.medium} Moyen\nScore >0 et <${t.medium} | ${ICONS.dormant} Dormant\nScore ≤0 | ${ICONS.low} Faible`;
    }

    function itemTooltip(result, domain, cfg) {
        const en = language(cfg) === "en";
        if (result.ignored) {
            return en
                ? `🔒 Item excluded from efficiency calculation\nMatched values: ${result.values?.join(" / ") || itemFieldValues(result.item, cfg).join(" / ") || "—"}`
                : `🔒 Exemplaire non pris en compte\nValeurs détectées : ${result.values?.join(" / ") || itemFieldValues(result.item, cfg).join(" / ") || "—"}\nCes exemplaires ne sont pas inclus dans le calcul d'efficacité.`;
        }
        if (result.error) {
            return en ? `Calculation impossible (${result.error}).` : `🚫 Calcul impossible pour cet exemplaire (${result.error}).`;
        }
        const source = result.approximate ? (en ? "bibliographic record creation date (approximation)" : "date de création de la notice (approximation)") : (en ? "item acquisition date" : "date d'acquisition");
        return en
            ? `📊 Item efficiency${result.approximate ? " (approximate)" : ""}\n${domain ? `📌 Domain: ${domain}\n` : ""}${result.special ? "📍 Special location\n" : ""}- Cumulative checkouts: ${result.loans}\n- Item age: ${result.age.toFixed(2)} years\n- Age source: ${source}\n- Inactivity weight: ${result.weight}\n- Score: ${result.score}\n- Indicator: ${indicatorText(result.classification, cfg)}\n\n${scaleText(result.profile, domain, cfg)}`
            : `📊 Efficacité de l'exemplaire${result.approximate ? " (approximative)" : " (indicatif)"}\n${domain ? `📌 Domaine : ${domain}\n` : ""}${result.special ? "📍 Localisation spéciale\n" : ""}- Nombre de prêts (cumulés) : ${result.loans}\n- Âge de l'exemplaire : ${result.age.toFixed(2)} ans\n- Source de l'âge : ${source}\n- Pondération d'inactivité appliquée : ${result.weight}\n- Efficacité = (Prêts / Âge) × Pondération\n  → Score calculé : ${result.score}\n- Indicateur qualitatif : ${indicatorText(result.classification, cfg)}\n\n${scaleText(result.profile, domain, cfg)}\n⚠️ Score indicatif. À interpréter avec le contexte du fonds, de la politique documentaire et des spécificités du public.`;
    }

    function globalTooltip(agg, cfg) {
        const en = language(cfg) === "en";
        if (!agg.counted.length) {
            return en
                ? `No item could be evaluated. Excluded: ${agg.ignored.length}; errors: ${agg.errors.length}.`
                : `Aucun exemplaire n'a pu être évalué. Exemplaires ignorés : ${agg.ignored.length} ; erreurs : ${agg.errors.length}.`;
        }
        return en
            ? `📊 Average item efficiency for the record${agg.approximate ? " (approximate)" : ""}\n${agg.domain ? `📌 Domain: ${agg.domain}\n` : ""}${agg.special ? "📍 Special location detected\n" : ""}- Items included: ${agg.counted.length}\n- Items excluded: ${agg.ignored.length}\n- Total checkouts: ${agg.loans}\n- Average age: ${agg.averageAge.toFixed(2)} years\n- Average inactivity weight: ${agg.averageWeight.toFixed(2)}\n- Average checkouts per item: ${agg.averageLoans.toFixed(2)}\n- Average efficiency score: ${agg.score}\n- Indicator: ${indicatorText(agg.classification, cfg)}\n\n${scaleText(agg.profile, agg.domain, cfg)}`
            : `📊 Efficacité moyenne des exemplaires de la notice${agg.approximate ? " (approximative)" : " (indicatif)"}\n${agg.domain ? `📌 Domaine : ${agg.domain}\n` : ""}${agg.special ? "📍 Localisation spéciale détectée\n" : ""}${agg.ignored.length ? `⚠️ ${agg.ignored.length} exemplaire(s) ignoré(s)\n` : ""}${agg.approximate ? "≈ Calcul utilisant la date de création de notice pour au moins un exemplaire\n" : ""}\nNotion clé : ce score est une MOYENNE PAR EXEMPLAIRE.\nIl est comparable entre notices avec 1 exemplaire et celles avec plusieurs.\n\nDonnées agrégées :\n- Nombre d'exemplaires pris en compte : ${agg.counted.length}\n- Exemplaires ignorés : ${agg.ignored.length}\n- Nombre total de prêts : ${agg.loans}\n- Âge moyen des exemplaires : ${agg.averageAge.toFixed(2)} ans\n- Pondération moyenne d'inactivité : ${agg.averageWeight.toFixed(2)}\n- Prêts moyens par exemplaire : ${agg.averageLoans.toFixed(2)}\n\nCalcul :\n- Efficacité exemplaire = (Prêts / Âge) × Pondération d'inactivité.\n- Efficacité moyenne notice = moyenne des efficacités des exemplaires.\n  → Score calculé : ${agg.score}\n  → Indicateur qualitatif : ${indicatorText(agg.classification, cfg)}\n\n${scaleText(agg.profile, agg.domain, cfg)}\n⚠️ Score indicatif. Il doit être confronté aux usages locaux, à la politique documentaire, à la saisonnalité et au rôle du titre dans le fonds.`;
    }

    function injectStyles(cfg) {
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement("style");
            style.id = STYLE_ID;
            document.head.appendChild(style);
        }
        style.textContent = `
.${ITEM_INDICATOR_CLASS}{margin-top:15px;display:inline-flex;align-items:center;gap:.22rem;margin-left:5px;cursor:help;vertical-align:middle}
.${GLOBAL_OWN_CLASS}{margin:5px 5px;padding:4px 6px;border-radius:3px;font-weight:bold;font-size:12px;color:#333;display:inline-flex;align-items:center;gap:.28rem;max-width:100%;box-sizing:border-box}
.${GLOBAL_OWN_CLASS}.pmk099-detail{margin:10px 0;padding:8px;font-size:inherit}
.${HELP_CLASS}{font-size:.8em;margin-left:5px;text-decoration:none!important;color:#007bff!important;opacity:.7;cursor:pointer;font-weight:normal;border:0;background:transparent;padding:0 .1rem;line-height:1}
.${HELP_CLASS}:hover,.${HELP_CLASS}:focus{opacity:1;text-decoration:underline!important}
.pmk099-approx{font-weight:bold;color:${cssColor(cfg.display.colors.approximation, "#1976d2")}}
.pmk099-excluded{color:${cssColor(cfg.display.colors.excluded, "#4caf50")};font-weight:bold}
@media(max-width:768px){.${GLOBAL_OWN_CLASS}{white-space:normal;overflow-wrap:anywhere}}
        `;
    }

    function cssColor(value, fallback) {
        const v = String(value || "").trim();
        return /^#[0-9a-f]{3,8}$/i.test(v) || /^(rgb|hsl)a?\(/i.test(v) || /^[a-z]+$/i.test(v) ? v : fallback;
    }

    function resultColors(classification, cfg) {
        const c = cfg.display.colors;
        const key = classification?.key || "low";
        const map = {
            exceptional: [c.exceptionalBg, c.exceptionalBorder],
            excellent: [c.excellentBg, c.excellentBorder],
            good: [c.goodBg, c.goodBorder],
            medium: [c.mediumBg, c.mediumBorder],
            dormant: [c.dormantBg, c.dormantBorder],
            low: [c.lowBg, c.lowBorder]
        };
        return map[key] || map.low;
    }

    function decorateDomainBorders(el, profile, special, approximate, cfg, detailMode) {
        const c = cfg.display.colors;
        if (profile === "low") el.style[detailMode ? "borderTop" : "borderLeft"] = `3px solid ${cssColor(c.lowDomain, "#9c27b0")}`;
        if (profile === "normal") el.style[detailMode ? "borderTop" : "borderLeft"] = `3px solid ${cssColor(c.normalDomain, "#4caf50")}`;
        if (special) {
            el.style.borderRight = `3px solid ${cssColor(c.special, "#ff9800")}`;
            el.style.backgroundColor = "#fff8e1";
        }
        if (approximate && detailMode) {
            el.style.borderLeft = `4px solid ${cssColor(c.approximation, "#1976d2")}`;
            el.style.fontStyle = "italic";
        }
    }

    function createHelpLink(cfg) {
        if (!cfg.display.showHelpQuestion) return null;
        const a = document.createElement("a");
        a.href = "#";
        a.className = HELP_CLASS;
        a.textContent = "?";
        a.title = language(cfg) === "en" ? "Efficiency indicator help" : "Aide sur l'indicateur d'efficacité";
        a.setAttribute("aria-label", a.title);
        a.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            openDynamicHelp(cfg);
        });
        return a;
    }

    function createItemIndicator(result, domain, cfg) {
        const span = document.createElement("span");
        span.className = ITEM_INDICATOR_CLASS;
        span.setAttribute("data-pmk099-item-id", String(result.item.item_id || result.item.itemnumber || result.item.item_id || ""));
        if (result.ignored) {
            if (!cfg.display.showExcludedLock) return null;
            span.classList.add("pmk099-excluded");
            span.textContent = "🔒";
        } else if (result.error) {
            span.textContent = ICONS.low;
            span.style.color = "#d32f2f";
            span.style.fontWeight = "bold";
        } else {
            span.textContent = result.classification.icon + (result.approximate && cfg.display.showApproximationMarker ? " ≈" : "");
            if (result.approximate) span.classList.add("pmk099-approx");
            if (result.special) {
                span.style.borderLeft = `2px solid ${cssColor(cfg.display.colors.special, "#ff9800")}`;
                span.style.paddingLeft = "3px";
            }
        }
        span.title = itemTooltip(result, domain, cfg);
        const help = createHelpLink(cfg);
        if (help) span.appendChild(help);
        return span;
    }

    function createGlobalIndicator(agg, cfg, detailMode) {
        const div = document.createElement("div");
        div.className = `${GLOBAL_INDICATOR_CLASS} ${GLOBAL_OWN_CLASS}${detailMode ? " pmk099-detail" : ""}`;
        div.setAttribute(DONE_ATTR, "1");

        if (agg.counted.length) {
            const colors = resultColors(agg.classification, cfg);
            div.style.backgroundColor = cssColor(colors[0], "#f9f9f9");
            div.style.border = `1px solid ${cssColor(colors[1], "#ccc")}`;
            decorateDomainBorders(div, agg.profile, agg.special, agg.approximate, cfg, detailMode);
            const prefix = detailMode ? `${agg.approximate && cfg.display.showApproximationMarker ? "≈ " : ""}📊 Eff. moyenne ex. notice : ` : "";
            div.appendChild(document.createTextNode(`${prefix}${agg.score} (${indicatorText(agg.classification, cfg)})`));
        } else if (agg.ignored.length && agg.ignored.length === agg.ignored.length + agg.errors.length) {
            div.style.cssText += `;background:#e8f5e8;border:2px solid ${cssColor(cfg.display.colors.excluded,"#4caf50")};color:#2e7d32`;
            div.appendChild(document.createTextNode(detailMode ? "🔒 Tous les exemplaires sont en magasin/réserve/consultation" : "🔒 Hors calcul (magasin/réserve)"));
        } else {
            div.style.cssText += ";background:#fff0f0;border:2px solid #d32f2f;color:#d32f2f";
            div.appendChild(document.createTextNode(`${ICONS.low} Calcul impossible`));
        }
        div.title = globalTooltip(agg, cfg);
        const help = createHelpLink(cfg);
        if (help) div.appendChild(help);
        return div;
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function formatNum(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return "—";
        return String(n).replace(".", ",");
    }

    function helpHtml(cfg) {
        const tLow = cfg.thresholds.low;
        const tNormal = cfg.thresholds.normal;
        const calc = cfg.calculation;
        const lowExample = splitList(cfg.domains.lowRotation)[0] || "Arts";
        const normalExample = splitList(cfg.domains.normalRotation)[0] || "Romans";
        const specialExample = splitList(cfg.exclusions.specialKeywords)[0] || "Parents";
        const ignored = splitList(cfg.exclusions.ignoredKeywords).slice(0, 6).join(", ") || "—";
        const c = cfg.display.colors;
        return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Outil d'Évaluation de l'Efficacité des Documents</title></head><body style="margin:0;padding:10px;background:#fff;">
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; padding: 15px; border: 1px solid #ddd; border-radius: 6px; max-width: 900px; margin: 10px auto; background-color: #f9f9f9;">
<h1 style="color: #004d99; border-bottom: 3px solid #004d99; padding-bottom: 10px; font-size: 24px;">🛠️ Outil d'Évaluation de l'Efficacité des Documents (Koha)</h1>
<p>Cet outil vise à fournir une <strong>mesure quantitative</strong> de la performance de circulation (rotation) de chaque exemplaire et de chaque notice bibliographique. Il vous aide à identifier rapidement les documents qui circulent bien et ceux qui sont sous-utilisés (dormants) afin de faciliter la gestion des collections.</p>
<hr style="border:0;height:1px;background:#ccc;margin:15px 0;">
<h2 style="color:#007bff;border-bottom:1px solid #ccc;padding-bottom:5px;margin-top:25px;font-size:20px;">📊 Score d'Efficacité : La Logique de l'Outil</h2>
<h3 style="color:#28a745;margin-top:20px;font-size:18px;">1. La Formule de l'Efficacité (Par Exemplaire)</h3>
<p>Le Score d'Efficacité est un <strong>indice de rotation annuel pondéré</strong>. Il répond à la question : « Combien de fois cet exemplaire est-il prêté par an, en tenant compte de son âge et de son activité récente ? »</p>
<div style="font-size:1.1em;background:#e9f7ff;padding:15px;border-radius:5px;text-align:center;margin:20px 0;border:1px solid #b3e0ff;"><strong style="font-style:italic;">Efficacité</strong> = <span style="display:inline-block;vertical-align:middle;text-align:center;margin:0 10px;padding:0 5px;"><span style="border-bottom:1px solid #333;padding-bottom:3px;display:block;white-space:nowrap;">Nombre de Prêts cumulés</span><span style="padding-top:3px;display:block;white-space:nowrap;">Âge en Années</span></span> × Pondération d'Inactivité</div>
<h3 style="color:#28a745;margin-top:20px;font-size:18px;">2. Les Facteurs du Calcul</h3>
<table style="width:100%;border-collapse:collapse;margin:15px 0;font-size:.9em;"><thead><tr style="background:#f2f2f2;"><th style="border:1px solid #ddd;padding:10px;text-align:left;">Facteur</th><th style="border:1px solid #ddd;padding:10px;text-align:left;">Description</th><th style="border:1px solid #ddd;padding:10px;text-align:left;">Rôle dans le Calcul</th></tr></thead><tbody>
<tr><td style="border:1px solid #ddd;padding:10px;"><strong>Âge en Années</strong></td><td style="border:1px solid #ddd;padding:10px;">Temps écoulé depuis la Date d'Acquisition (min. ${escapeHtml(formatNum(calc.minAgeYears))} an${calc.minAgeYears > 1 ? "s" : ""}).</td><td style="border:1px solid #ddd;padding:10px;"><strong>Normalisation par le temps</strong> (Dénominateur).</td></tr>
<tr><td style="border:1px solid #ddd;padding:10px;"><strong>Pondération d'Inactivité</strong></td><td style="border:1px solid #ddd;padding:10px;">Facteur ajusté qui pénalise les documents n'ayant pas circulé récemment.</td><td style="border:1px solid #ddd;padding:10px;"><strong>Mesure de la pertinence actuelle</strong>.</td></tr></tbody></table>
<h3 style="color:#28a745;margin-top:20px;font-size:18px;">3. Les Seuils de la Pondération d'Inactivité</h3>
<table style="width:100%;border-collapse:collapse;margin:15px 0;font-size:.9em;"><thead><tr style="background:#f2f2f2;"><th style="border:1px solid #ddd;padding:10px;text-align:left;">Dernier Prêt</th><th style="border:1px solid #ddd;padding:10px;text-align:left;">Pondération</th><th style="border:1px solid #ddd;padding:10px;text-align:left;">Signification</th></tr></thead><tbody>
<tr><td style="border:1px solid #ddd;padding:10px;"><strong>≤ ${calc.recentLoanDays} jours</strong></td><td style="border:1px solid #ddd;padding:10px;"><strong>${formatNum(calc.recentWeight)}</strong></td><td style="border:1px solid #ddd;padding:10px;">Circulation active. Pas de pénalité.</td></tr>
<tr><td style="border:1px solid #ddd;padding:10px;"><strong>&gt; ${calc.recentLoanDays} et ≤ ${calc.middleLoanDays} jours</strong></td><td style="border:1px solid #ddd;padding:10px;"><strong>${formatNum(calc.middleWeight)}</strong></td><td style="border:1px solid #ddd;padding:10px;">Circulation faible mais récente. Pénalité modérée.</td></tr>
<tr><td style="border:1px solid #ddd;padding:10px;"><strong>&gt; ${calc.middleLoanDays} jours</strong> ou <strong>Jamais prêté</strong></td><td style="border:1px solid #ddd;padding:10px;"><strong>${formatNum(calc.oldWeight)}</strong> / jamais prêté : <strong>${formatNum(calc.neverLoanedWeight)}</strong></td><td style="border:1px solid #ddd;padding:10px;">Dormant. Score fortement réduit.</td></tr></tbody></table>
<hr style="border:0;height:1px;background:#ccc;margin:15px 0;">
<h2 style="color:#007bff;border-bottom:1px solid #ccc;padding-bottom:5px;margin-top:25px;font-size:20px;">📚 Interprétation du Score et Échelles d'Évaluation</h2>
<p>L'outil affiche un <strong>Indicateur Qualitatif</strong> (émoji) qui classe le score d'efficacité selon deux types de rotation : <strong>Normale</strong> (haute demande) ou <strong>Faible</strong> (référence/patrimoine).</p>
<h3 style="color:#28a745;margin-top:20px;font-size:18px;">Échelle d'Interprétation Détaillée</h3>
<table style="width:100%;border-collapse:collapse;margin:15px 0;font-size:.9em;"><thead><tr style="background:#f2f2f2;"><th style="border:1px solid #ddd;padding:10px;text-align:left;">Indicateur Qualitatif</th><th style="border:1px solid #ddd;padding:10px;text-align:left;">Seuil Rotation Faible (Ex: ${escapeHtml(lowExample)})</th><th style="border:1px solid #ddd;padding:10px;text-align:left;">Seuil Rotation Normale (Ex: ${escapeHtml(normalExample)})</th><th style="border:1px solid #ddd;padding:10px;text-align:left;">Signification</th></tr></thead><tbody>
${helpThresholdRow(ICONS.exceptional,"Exceptionnel",`Score ≥ ${tLow.exceptional}`,`Score ≥ ${tNormal.exceptional}`,"Rotation très élevée, succès majeur.")}
${helpThresholdRow(ICONS.excellent,"Excellent",`Score ≥ ${tLow.excellent}`,`Score ≥ ${tNormal.excellent}`,"Rotation forte, supérieure à la moyenne.")}
${helpThresholdRow(ICONS.good,"Bon",`Score ≥ ${tLow.good}`,`Score ≥ ${tNormal.good}`,"Circulation saine, atteint les attentes du domaine.")}
${helpThresholdRow(ICONS.medium,"Moyen",`Score ≥ ${tLow.medium}`,`Score ≥ ${tNormal.medium}`,"Circulation faible, mais évite le statut de dormant.")}
${helpThresholdRow(ICONS.dormant,"Dormant",`Score > 0 et < ${tLow.medium}`,`Score > 0 et < ${tNormal.medium}`,"Circulation critique (très faible). Cible de désherbage potentiel.")}
${helpThresholdRow(ICONS.low,"Faible","Score = 0","Score = 0","Jamais prêté (ou prêts annulés) et âge supérieur au minimum configuré.")}
</tbody></table>
<hr style="border:0;height:1px;background:#ccc;margin:15px 0;">
<h2 style="color:#007bff;border-bottom:1px solid #ccc;padding-bottom:5px;margin-top:25px;font-size:20px;">💻 Affichage des Résultats dans Koha</h2>
<h3 style="color:#28a745;margin-top:20px;font-size:18px;">1. Sur la Page de Détail de la Notice (<code style="background:#eee;padding:2px 4px;border-radius:3px;">/catalogue/detail.pl</code>)</h3>
<ul style="padding-left:20px;"><li style="margin-bottom:8px;"><strong>Indicateur par Exemplaire :</strong> Émoji et score ajoutés à côté du nombre de prêts. La souris affiche l'info-bulle détaillée.</li><li style="margin-bottom:8px;"><strong>Score Global de la Notice :</strong> Un encadré affiche l'<strong>Efficacité Moyenne des Exemplaires</strong> pour l'ensemble du titre.</li></ul>
<h3 style="color:#28a745;margin-top:20px;font-size:18px;">2. Mises en Garde et Symboles</h3>
<ul style="padding-left:20px;"><li style="margin-bottom:8px;">Symbole <strong style="color:${cssColor(c.approximation,"#1976d2")};">≈</strong> : Indique une approximation (la Date de Création de la Notice a été utilisée comme date d'acquisition).</li><li style="margin-bottom:8px;">Émoji <span style="font-size:1.2em;">🔒</span> : Indique que l'exemplaire est <strong>ignoré</strong> et n'est pas inclus dans la moyenne. Mots-clés actuels : ${escapeHtml(ignored)}.</li></ul>
<h3 style="color:#28a745;margin-top:20px;font-size:18px;">3. Signification des Couleurs de Bordure / Fond</h3>
<p>La couleur des indicateurs est un indice visuel rapide de la performance du document par rapport à son domaine ou à sa localisation spéciale :</p>
<table style="width:100%;border-collapse:collapse;margin:15px 0;font-size:.9em;"><thead><tr style="background:#f2f2f2;"><th style="border:1px solid #ddd;padding:10px;text-align:left;">Couleur / Emplacement</th><th style="border:1px solid #ddd;padding:10px;text-align:left;">Signification & des Informations Complémentaires</th></tr></thead><tbody>
<tr><td style="border:1px solid #ddd;padding:10px;background:#e9f7ff;border-left:5px solid ${cssColor(c.approximation,"#1976d2")};"><strong>Bordure Gauche (Bleu)</strong></td><td style="border:1px solid #ddd;padding:10px;"><strong>Approximation d'Âge</strong> : date de création de la notice utilisée en l'absence de date d'acquisition.</td></tr>
<tr><td style="border:1px solid #ddd;padding:10px;background:#fff8e1;border-right:5px solid ${cssColor(c.special,"#ff9800")};"><strong>Bordure Droite (Orange) / Fond Jaune</strong></td><td style="border:1px solid #ddd;padding:10px;"><strong>Localisation Spéciale</strong> : règle spécifique détectée (ex. « ${escapeHtml(specialExample)} »). L'échelle spéciale configurée est appliquée.</td></tr>
<tr><td style="border:1px solid #ddd;padding:10px;background:#e6ffe6;border-top:5px solid ${cssColor(c.normalDomain,"#4CAF50")};"><strong>Bordure Sup. (Vert)</strong></td><td style="border:1px solid #ddd;padding:10px;"><strong>Domaine de Haute Rotation</strong> : échelle de Rotation Normale.</td></tr>
<tr><td style="border:1px solid #ddd;padding:10px;background:#f2f2f2;border-top:5px solid ${cssColor(c.lowDomain,"#9c27b0")};"><strong>Bordure Sup. (Violet)</strong></td><td style="border:1px solid #ddd;padding:10px;"><strong>Domaine de Faible Rotation</strong> : échelle de Rotation Faible.</td></tr>
</tbody></table>
<hr style="border:0;height:1px;background:#ccc;margin:15px 0;">
<h3 style="color:#28a745;margin-top:20px;font-size:18px;">4. Couleurs de l'Indicateur Qualitatif (Score)</h3>
<p>Applicable au score global de la notice et aux scores par exemplaire :</p>
<table style="width:100%;border-collapse:collapse;margin:15px 0;font-size:.9em;"><thead><tr style="background:#f2f2f2;"><th style="border:1px solid #ddd;padding:10px;text-align:left;">Couleur du Résultat</th><th style="border:1px solid #ddd;padding:10px;text-align:left;">Indicateurs Qualitatifs (Émojis)</th><th style="border:1px solid #ddd;padding:10px;text-align:left;">Signification</th></tr></thead><tbody>
<tr><td style="border:1px solid #ddd;padding:10px;background:${cssColor(c.goodBg,"#e6ffe6")};"><strong>Vert / Bleu clair</strong></td><td style="border:1px solid #ddd;padding:10px;"><span style="font-size:1.2em;">${ICONS.exceptional}</span> <strong>Exceptionnel</strong>, <span style="font-size:1.2em;">${ICONS.excellent}</span> <strong>Excellent</strong>, <span style="font-size:1.2em;">${ICONS.good}</span> <strong>Bon</strong></td><td style="border:1px solid #ddd;padding:10px;"><strong>Circulation saine & forte</strong>. Le document est performant selon l'échelle de son domaine.</td></tr>
<tr><td style="border:1px solid #ddd;padding:10px;background:${cssColor(c.mediumBg,"#fff8e1")};"><strong>Jaune / Orange</strong></td><td style="border:1px solid #ddd;padding:10px;"><span style="font-size:1.2em;">${ICONS.medium}</span> <strong>Moyen</strong></td><td style="border:1px solid #ddd;padding:10px;"><strong>Circulation faible/irrégulière</strong>. À surveiller ou évaluer.</td></tr>
<tr><td style="border:1px solid #ddd;padding:10px;background:${cssColor(c.lowBg,"#ffebe6")};"><strong>Rouge / Rose</strong></td><td style="border:1px solid #ddd;padding:10px;"><span style="font-size:1.2em;">${ICONS.dormant}</span> <strong>Dormant</strong>, <span style="font-size:1.2em;">${ICONS.low}</span> <strong>Faible</strong></td><td style="border:1px solid #ddd;padding:10px;"><strong>Circulation critique</strong>. Cible à étudier en priorité pour le désherbage ou le transfert en magasin.</td></tr>
</tbody></table>
<hr style="border:0;height:1px;background:#ccc;margin:15px 0;">
<div style="padding:10px;margin:15px 0;border-left:5px solid #ffc107;background:#fff3cd;color:#856404;border-radius:3px;"><strong>⚠️ RAPPEL IMPORTANT :</strong> Le Score d'Efficacité est une <strong>aide à la décision</strong> et non une règle absolue. Un score faible pour un fonds de référence est souvent normal.</div>
</div></body></html>`;
    }

    function helpThresholdRow(icon, label, low, normal, meaning) {
        return `<tr><td style="border:1px solid #ddd;padding:10px;"><span style="font-size:1.2em;margin-right:5px;">${icon}</span> <strong>${escapeHtml(label)}</strong></td><td style="border:1px solid #ddd;padding:10px;">${escapeHtml(low)}</td><td style="border:1px solid #ddd;padding:10px;">${escapeHtml(normal)}</td><td style="border:1px solid #ddd;padding:10px;">${escapeHtml(meaning)}</td></tr>`;
    }

    function openDynamicHelp(cfg) {
        const html = helpHtml(cfg);
        const target = cfg.display.helpNewTab ? "_blank" : "pmk099-help";
        const w = window.open("", target);
        if (w && w.document) {
            w.document.open();
            w.document.write(html);
            w.document.close();
            try { w.focus(); } catch (_) {}
            return;
        }
        // Repli si le navigateur bloque l'onglet.
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;inset:0;z-index:20000;background:rgba(0,0,0,.45);padding:2vh;overflow:auto";
        const box = document.createElement("div");
        box.style.cssText = "background:#fff;max-width:980px;margin:auto;border-radius:6px;position:relative";
        const close = document.createElement("button");
        close.type = "button";
        close.textContent = "×";
        close.style.cssText = "position:sticky;top:8px;float:right;margin:8px;font-size:24px;z-index:2";
        close.addEventListener("click", function () { overlay.remove(); });
        const content = document.createElement("div");
        content.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] || html;
        box.appendChild(close);
        box.appendChild(content);
        overlay.appendChild(box);
        overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    function clearInjected(root) {
        (root || document).querySelectorAll(`.${ITEM_INDICATOR_CLASS}, .${GLOBAL_OWN_CLASS}`).forEach(function (el) { el.remove(); });
    }

    function findNativeItemsTable() {
        return document.querySelector("#holdings_table, #holdingst, table.items_table, table.holdingst, table#items");
    }

    function rowDataFromDataTable(table, row) {
        try {
            if (window.jQuery && window.jQuery.fn && window.jQuery.fn.dataTable && window.jQuery.fn.dataTable.isDataTable(table)) {
                const api = window.jQuery(table).DataTable();
                return api.row(row).data() || null;
            }
        } catch (_) {}
        return null;
    }

    function itemId(item) {
        return String(item?.item_id ?? item?.itemnumber ?? item?.item_number ?? "").trim();
    }

    function barcode(item) {
        return String(item?.external_id ?? item?.barcode ?? "").trim();
    }

    function findResultForRow(row, results, table) {
        const data = rowDataFromDataTable(table, row);
        const dataId = itemId(data);
        if (dataId) {
            const byId = results.find(function (r) { return itemId(r.item) === dataId; });
            if (byId) return byId;
        }
        const idFromDom = row.getAttribute("data-item-id") || row.dataset.itemnumber || row.dataset.itemId || "";
        if (idFromDom) {
            const byId = results.find(function (r) { return itemId(r.item) === String(idFromDom); });
            if (byId) return byId;
        }
        const rowText = String(row.textContent || "");
        const byBarcode = results.find(function (r) { const b = barcode(r.item); return b && rowText.includes(b); });
        return byBarcode || null;
    }

    function insertDetailItemIndicators(table, results, domain, cfg) {
        if (!cfg.display.showItemIndicatorsOnDetail || !table) return;
        const rows = Array.from(table.querySelectorAll("tbody tr"));
        rows.forEach(function (row) {
            row.querySelectorAll(`.${ITEM_INDICATOR_CLASS}`).forEach(function (el) { el.remove(); });
            const result = findResultForRow(row, results, table);
            if (!result) return;
            const cell = row.querySelector("td.issues") || findCellByHeader(table, row, ["nombre de prêts", "checkouts", "issues"]);
            if (!cell) return;
            const el = createItemIndicator(result, domain, cfg);
            if (!el) return;
            cell.appendChild(document.createElement("br"));
            cell.appendChild(el);
        });
    }

    function findCellByHeader(table, row, labels) {
        const headers = Array.from(table.querySelectorAll("thead th"));
        const wanted = labels.map(norm);
        const index = headers.findIndex(function (th) {
            const text = norm(th.textContent);
            return wanted.some(function (x) { return text.includes(x); });
        });
        return index >= 0 ? row.children[index] || null : null;
    }

    function insertDetailGlobal(table, agg, cfg) {
        if (!cfg.display.showNoticeIndicator || !table) return;
        table.parentElement?.querySelectorAll(`:scope > .${GLOBAL_OWN_CLASS}`).forEach(function (el) { el.remove(); });
        const div = createGlobalIndicator(agg, cfg, true);
        table.parentNode.insertBefore(div, table);
        mountConfigButton(div, "detail");
    }

    function mountConfigButton(anchor, contextKey) {
        try {
            if (window.PMKConfig && typeof window.PMKConfig.mountContextButton === "function") {
                window.PMKConfig.mountContextButton({
                    moduleId: MODULE_ID,
                    anchor: anchor,
                    position: "append",
                    contextKey: `catalogue.${contextKey}`,
                    context: { sectionId: "calculation", pageId: `catalogue.${contextKey}` }
                });
            }
        } catch (_) {}
    }

    async function runDetail(cfg) {
        const biblioNumber = getBiblioNumberFromPage();
        if (!biblioNumber) return;
        const table = await waitForElement(function () { return findNativeItemsTable(); }, 20000);
        if (!table) return;
        const [items, domain] = await Promise.all([
            fetchAllItems(biblioNumber, cfg).catch(function () { return []; }),
            resolveDomain(biblioNumber, document, cfg)
        ]);
        if (!items.length) return runDetailDomFallback(table, domain, cfg);
        const needsFallback = cfg.sources.fallbackToBiblioCreationDate && items.some(function (i) { return !parseDate(i.acquisition_date); });
        const creationDate = needsFallback ? await resolveBiblioCreationDate(biblioNumber, document, cfg) : null;
        const results = items.map(function (item) { return calculateItem(item, creationDate, domain, cfg); });
        const agg = aggregate(results, domain, cfg);
        injectStyles(cfg);
        clearInjected(document);
        insertDetailGlobal(table, agg, cfg);
        insertDetailItemIndicators(table, results, domain, cfg);
        bindDataTableRedraw(table, results, domain, cfg);
        dispatchResults("detail", biblioNumber, agg, results);
    }

    function bindDataTableRedraw(table, results, domain, cfg) {
        try {
            if (!window.jQuery) return;
            const $table = window.jQuery(table);
            $table.off("draw.dt.pmk099").on("draw.dt.pmk099", function () {
                insertDetailItemIndicators(table, results, domain, cfg);
            });
        } catch (_) {}
    }

    function legacyDomItemFromRow(row, table) {
        const loansCell = row.querySelector("td.issues") || findCellByHeader(table, row, ["prêt", "checkouts", "issues"]);
        const acqCell = row.querySelector("td.dateaccessioned") || findCellByHeader(table, row, ["acquisition", "date acquired"]);
        const lastCell = row.querySelector("td.datelastborrowed") || findCellByHeader(table, row, ["dernier emprunt", "date last borrowed"]);
        const location = row.querySelector("td.location")?.textContent || row.querySelector("span.shelvingloc")?.textContent || "";
        const home = row.querySelector("td.homebranch")?.textContent || "";
        const holding = row.querySelector("td.holdingbranch")?.textContent || "";
        const loanText = String(loansCell?.childNodes?.[0]?.textContent || loansCell?.textContent || "").trim();
        const loans = /^\s*\d+/.test(loanText) ? Number(loanText.match(/\d+/)[0]) : null;
        return {
            item_id: row.dataset.itemnumber || "",
            checkouts_count: loans,
            acquisition_date: acqCell?.textContent?.trim() || null,
            last_checkout_date: lastCell?.textContent?.trim() || null,
            location: location.trim(),
            home_library_id: home.trim(),
            holding_library_id: holding.trim(),
            _pmkRow: row
        };
    }

    async function runDetailDomFallback(table, domain, cfg) {
        const biblioNumber = getBiblioNumberFromPage();
        const items = Array.from(table.querySelectorAll("tbody tr")).map(function (row) { return legacyDomItemFromRow(row, table); });
        const creationDate = cfg.sources.fallbackToBiblioCreationDate ? await resolveBiblioCreationDate(biblioNumber, document, cfg) : null;
        const results = items.map(function (item) { return calculateItem(item, creationDate, domain, cfg); });
        const agg = aggregate(results, domain, cfg);
        injectStyles(cfg);
        clearInjected(document);
        insertDetailGlobal(table, agg, cfg);
        if (cfg.display.showItemIndicatorsOnDetail) {
            results.forEach(function (r) {
                const row = r.item._pmkRow;
                const cell = row ? (row.querySelector("td.issues") || findCellByHeader(table, row, ["prêt", "checkouts"])) : null;
                const el = cell ? createItemIndicator(r, domain, cfg) : null;
                if (cell && el) { cell.appendChild(document.createElement("br")); cell.appendChild(el); }
            });
        }
        dispatchResults("detail-dom-fallback", biblioNumber, agg, results);
    }

    function searchRows() {
        return Array.from(document.querySelectorAll('#searchresults tr[id^="row"], tr[id^="row"]')).filter(function (row) { return /^row\d+$/.test(row.id || ""); });
    }

    function biblioNumberFromRow(row) {
        const m = String(row.id || "").match(/^row(\d+)$/);
        return m ? m[1] : "";
    }

    function searchIndicatorAnchor(row) {
        return row.querySelector("td:nth-child(3) .kx-notice-cell") || row.querySelector("td:nth-child(3)") || row.querySelector("td");
    }

    function insertSearchGlobal(row, agg, cfg) {
        if (!cfg.display.showNoticeIndicator) return;
        row.querySelectorAll(`.${GLOBAL_OWN_CLASS}`).forEach(function (el) { el.remove(); });
        const anchor = searchIndicatorAnchor(row);
        if (!anchor) return;
        const div = createGlobalIndicator(agg, cfg, false);
        const copy = anchor.querySelector("span.copy-ean-result");
        if (copy && copy.parentNode) copy.parentNode.insertBefore(div, copy.nextSibling);
        else anchor.appendChild(div);
        mountConfigButton(div, "search");
    }

    async function processSearchRow(row, cfg) {
        const biblioNumber = biblioNumberFromRow(row);
        if (!biblioNumber) return;
        const [items, domain] = await Promise.all([
            fetchAllItems(biblioNumber, cfg).catch(function () { return []; }),
            resolveDomain(biblioNumber, row, cfg)
        ]);
        if (!items.length) return runSearchLegacyDomFallback(row, domain, cfg);
        const needsFallback = cfg.sources.fallbackToBiblioCreationDate && items.some(function (i) { return !parseDate(i.acquisition_date); });
        const creationDate = needsFallback ? await resolveBiblioCreationDate(biblioNumber, row, cfg) : null;
        const results = items.map(function (item) { return calculateItem(item, creationDate, domain, cfg); });
        const agg = aggregate(results, domain, cfg);
        insertSearchGlobal(row, agg, cfg);
        dispatchResults("search", biblioNumber, agg, results);
    }

    async function runSearchLegacyDomFallback(row, domain, cfg) {
        const blocks = Array.from(row.querySelectorAll(".bloc-exemplaire, .kxri-item"));
        if (!blocks.length) return;
        const items = blocks.map(function (block) {
            const labels = {};
            block.querySelectorAll("li, .kxri-detail-label").forEach(function (node) {
                if (node.classList.contains("kxri-detail-label")) {
                    const value = node.nextElementSibling;
                    labels[norm(node.textContent)] = value ? value.textContent.trim() : "";
                } else {
                    const strong = node.querySelector("strong");
                    if (strong) labels[norm(strong.textContent.replace(/[:\s]+$/, ""))] = node.textContent.replace(strong.textContent, "").trim();
                }
            });
            const get = function (names) {
                for (const name of names) if (labels[norm(name)] !== undefined) return labels[norm(name)];
                return "";
            };
            return {
                item_id: block.dataset.itemId || "",
                checkouts_count: get(["Nombre de prêts", "Prêts", "Checkouts"]),
                acquisition_date: get(["Date de création", "Création", "Date d'acquisition"]),
                last_checkout_date: get(["Dernier emprunt", "Last checkout"]),
                location: get(["Localisation", "Location"]),
                holding_library_id: get(["Site actuel", "Holding library"]),
                home_library_id: get(["Site propriétaire", "Home library"])
            };
        });
        const biblioNumber = biblioNumberFromRow(row);
        const creationDate = cfg.sources.fallbackToBiblioCreationDate ? await resolveBiblioCreationDate(biblioNumber, row, cfg) : null;
        const results = items.map(function (item) { return calculateItem(item, creationDate, domain, cfg); });
        const agg = aggregate(results, domain, cfg);
        insertSearchGlobal(row, agg, cfg);
        dispatchResults("search-dom-fallback", biblioNumber, agg, results);
    }

    async function runSearch(cfg) {
        const rows = await waitForRows(20000);
        if (!rows.length) return;
        injectStyles(cfg);
        document.querySelectorAll(`.${GLOBAL_OWN_CLASS}`).forEach(function (el) { el.remove(); });
        await mapLimit(rows, cfg.api.concurrency, function (row) { return processSearchRow(row, cfg); });
    }

    async function mapLimit(values, limit, worker) {
        let index = 0;
        const runners = Array.from({ length: Math.min(limit, values.length) }, async function () {
            while (index < values.length) {
                const i = index++;
                try { await worker(values[i], i); } catch (_) {}
            }
        });
        await Promise.all(runners);
    }

    function waitForElement(getter, maxWaitMs) {
        return new Promise(function (resolve) {
            const existing = getter();
            if (existing) return resolve(existing);
            let done = false;
            const observer = new MutationObserver(function () {
                const el = getter();
                if (!el || done) return;
                done = true;
                observer.disconnect();
                resolve(el);
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });
            window.setTimeout(function () {
                if (done) return;
                done = true;
                observer.disconnect();
                resolve(getter() || null);
            }, maxWaitMs || 10000);
        });
    }

    async function waitForRows(maxWaitMs) {
        const el = await waitForElement(function () { return searchRows()[0] || null; }, maxWaitMs);
        return el ? searchRows() : [];
    }

    function dispatchResults(page, biblioNumber, agg, results) {
        try {
            window.dispatchEvent(new CustomEvent("pmk:efficiency-results", {
                detail: {
                    moduleId: MODULE_ID,
                    page: page,
                    biblioNumber: String(biblioNumber || ""),
                    aggregate: clone(agg),
                    items: clone(results.map(function (r) {
                        return {
                            itemId: itemId(r.item),
                            score: r.score ?? null,
                            ignored: !!r.ignored,
                            error: r.error || null,
                            approximate: !!r.approximate,
                            special: !!r.special,
                            profile: r.profile || null,
                            classification: r.classification ? clone(r.classification) : null
                        };
                    }))
                }
            }));
        } catch (_) {}
    }

    async function applyConfig(input) {
        const cfg = normalizeConfig(input);
        state.config = cfg;
        clearInjected(document);
        if (!cfg.enabled) return;
        if (window.location.pathname === DETAIL_PATH && cfg.pages.detail.enabled) await runDetail(cfg);
        if (window.location.pathname === SEARCH_PATH && cfg.pages.search.enabled) await runSearch(cfg);
    }

    function scheduleRefresh() {
        if (state.refreshTimer) window.clearTimeout(state.refreshTimer);
        state.refreshTimer = window.setTimeout(function () {
            if (state.config) applyConfig(state.config).catch(function () {});
        }, 80);
    }

    function connectConfig() {
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") {
            applyConfig(DEFAULTS).catch(function () {});
            return;
        }
        try {
            if (typeof window.PMKConfig.subscribe === "function") {
                window.PMKConfig.subscribe(MODULE_ID, function (cfg) { applyConfig(cfg).catch(function () {}); });
            }
        } catch (_) {}
        window.PMKConfig.getConfig(MODULE_ID).then(applyConfig).catch(function () { return applyConfig(DEFAULTS); });
    }

    function start() {
        if (window.location.pathname !== DETAIL_PATH && window.location.pathname !== SEARCH_PATH) return;
        connectConfig();
        // Les résultats de recherche peuvent être redessinés par d'autres modules ;
        // le 099 reste autonome et se recalcule sans dépendre de leur présence.
        const root = window.location.pathname === SEARCH_PATH ? (document.getElementById("searchresults") || document.body) : document.body;
        const observer = new MutationObserver(function (mutations) {
            const relevant = mutations.some(function (m) {
                return Array.from(m.addedNodes || []).some(function (n) {
                    return n instanceof Element && !n.closest?.(`.${GLOBAL_OWN_CLASS}`) && (n.matches?.('tr[id^="row"], table.items_table, #holdings_table') || n.querySelector?.('tr[id^="row"], table.items_table, #holdings_table'));
                });
            });
            if (relevant) scheduleRefresh();
        });
        observer.observe(root, { childList: true, subtree: true });
    }

    // API publique minimale, utile pour recette et future intégration plugin.
    window.PMK099Efficiency = Object.freeze({
        version: MODULE_VERSION,
        icons: ICONS,
        defaults: clone(DEFAULTS),
        normalizeConfig: normalizeConfig,
        calculateItem: function (item, creationDate, domain, cfg) { return calculateItem(item, creationDate, domain, normalizeConfig(cfg || DEFAULTS)); },
        helpHtml: function (cfg) { return helpHtml(normalizeConfig(cfg || state.config || DEFAULTS)); },
        refresh: scheduleRefresh
    });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
})();

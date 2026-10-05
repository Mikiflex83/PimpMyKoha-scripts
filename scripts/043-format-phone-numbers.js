/*
 Nom du fichier: 043-format-phone-numbers.js
 Dépendances: 000-pmk-config-firestore.js (optionnelle au runtime ; valeurs par défaut intégrées)
 Date de dernière modification: 2026-09-18
 Version: 043.2.1 — picker répétable tableaux / multi-règles / formats configurables
 Auteur: Michael Mundet / refonte PimpMyKoha
 Description:
   Formate visuellement les numéros de téléphone dans Koha sans modifier les données
   ni casser les liens tel:. Le comportement historique du 043 est fourni comme valeur
   par défaut. Des règles supplémentaires peuvent être ajoutées sans limite via le
   picker commun PMK.
*/
(function () {
    'use strict';

    const MODULE_ID = 'phone-number-formatting';
    const DEFAULT_GROUPS = '2,2,2,2,2';

    const DEFAULTS = {
        enabled: true,
        observeDom: true,
        observeDelay: 80,
        rules: [
            {
                id: 'legacy-member-circulation-phones',
                enabled: true,
                label: 'Téléphones lecteur — fiche et circulation',
                targetName: 'Téléphones affichés sur la fiche lecteur et en circulation',
                pages: 'members/moremember.pl\ncirc/circulation.pl',
                selector: 'li.patronphone, a[href^="tel:"]',
                excludeSelector: '#issues-table, #issues-table *',
                format: 'space',
                groups: DEFAULT_GROUPS,
                customSeparator: ' ',
                preservePlus: true
            },
            {
                id: 'waiting-holds-phone',
                enabled: true,
                label: 'Téléphones — réservations en attente',
                targetName: 'Téléphone du lecteur dans les réservations en attente',
                pages: 'circ/waitingreserves.pl',
                selector: '.patron_phone',
                excludeSelector: '',
                format: 'space',
                groups: DEFAULT_GROUPS,
                customSeparator: ' ',
                preservePlus: true
            }
        ]
    };

    let currentConfig = null;
    let observer = null;
    let observerTimer = 0;
    let applying = false;

    // Les valeurs originales sont gardées par nœud texte : aucun innerHTML n'est réécrit.
    const originalText = new Map();
    const selfMutatedTextNodes = new WeakSet();

    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function merge(target, source) {
        if (!source || typeof source !== 'object') return target;
        Object.keys(source).forEach(function (key) {
            const value = source[key];
            if (Array.isArray(value)) {
                target[key] = deepClone(value);
            } else if (value && typeof value === 'object') {
                if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
                    target[key] = {};
                }
                merge(target[key], value);
            } else {
                target[key] = value;
            }
        });
        return target;
    }

    function normalizeRule(rule, index) {
        const base = {
            id: 'rule-' + (index + 1),
            enabled: true,
            label: '',
            targetName: '',
            pages: '',
            selector: '',
            excludeSelector: '',
            format: 'space',
            groups: DEFAULT_GROUPS,
            customSeparator: ' ',
            preservePlus: true
        };
        return merge(base, rule || {});
    }

    function normalizeConfig(config) {
        const result = merge(deepClone(DEFAULTS), config || {});
        if (!Array.isArray(result.rules)) result.rules = deepClone(DEFAULTS.rules);
        result.rules = result.rules.map(normalizeRule);
        return result;
    }

    function cleanPath(path) {
        return String(path || '')
            .trim()
            .replace(/^https?:\/\/[^/]+/i, '')
            .replace(/^\/cgi-bin\/koha\//, '')
            .replace(/^\/+/, '');
    }

    function pathMatches(rule) {
        const rawPages = Array.isArray(rule.pages)
            ? rule.pages
            : String(rule.pages || '').split(/[\n,;]+/);
        const pages = rawPages.map(function (v) { return String(v || '').trim(); }).filter(Boolean);
        if (!pages.length) return true;

        const current = cleanPath(window.location.pathname);
        return pages.some(function (page) {
            if (page === '*' || String(page).toLowerCase() === 'all') return true;
            const wanted = cleanPath(page).split('?')[0];
            return Boolean(wanted && current === wanted);
        });
    }

    function parseGroups(value) {
        const parts = String(value || '')
            .trim()
            .split(/[^0-9]+/)
            .filter(Boolean)
            .map(function (v) { return Number(v); });

        if (!parts.length || parts.some(function (n) { return !Number.isInteger(n) || n < 1 || n > 32; })) {
            return null;
        }
        const total = parts.reduce(function (sum, n) { return sum + n; }, 0);
        if (total < 2 || total > 64) return null;
        return parts;
    }

    function separatorFor(rule) {
        switch (String(rule.format || 'space')) {
            case 'dot': return '.';
            case 'dash': return '-';
            case 'slash': return '/';
            case 'compact': return '';
            case 'custom': return String(rule.customSeparator === undefined ? '' : rule.customSeparator);
            case 'space':
            default: return ' ';
        }
    }

    function expectedDigits(rule) {
        const groups = parseGroups(rule.groups || DEFAULT_GROUPS);
        if (!groups) return null;
        return groups.reduce(function (sum, n) { return sum + n; }, 0);
    }

    function formatDigits(raw, rule) {
        const groups = parseGroups(rule.groups || DEFAULT_GROUPS);
        if (!groups) return null;

        const rawText = String(raw || '').trim();
        const digits = rawText.replace(/\D/g, '');
        const total = groups.reduce(function (sum, n) { return sum + n; }, 0);
        if (digits.length !== total) return null;

        let cursor = 0;
        const out = groups.map(function (size) {
            const group = digits.slice(cursor, cursor + size);
            cursor += size;
            return group;
        });

        const prefix = rule.preservePlus !== false && /^\s*\+/.test(rawText) ? '+' : '';
        return prefix + out.join(separatorFor(rule));
    }

    function candidateRegexFor(rule) {
        const count = expectedDigits(rule);
        if (!count) return null;

        // Le candidat peut déjà contenir espaces, points, tirets, slashs ou parenthèses.
        // Les frontières évitent de prendre un morceau d'un identifiant numérique plus long.
        const tailCount = Math.max(0, count - 1);
        return new RegExp('(^|[^\\d])((?:\\+\\s*)?(?:\\d[\\s.\\-\\/()]*){' + tailCount + '}\\d)(?!\\d)', 'g');
    }

    function formatTextValue(value, rule) {
        const source = String(value || '');
        if (!source.trim()) return source;

        const re = candidateRegexFor(rule);
        if (!re) return source;

        let changed = false;
        const output = source.replace(re, function (whole, before, candidate) {
            const formatted = formatDigits(candidate, rule);
            if (formatted === null) return whole;
            if (candidate === formatted) return whole;
            changed = true;
            return String(before || '') + formatted;
        });

        return changed ? output : source;
    }

    function textNodes(root) {
        const out = [];
        if (!root) return out;

        if (root.nodeType === Node.TEXT_NODE) {
            out.push(root);
            return out;
        }

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest('script,style,textarea,input,select,option')) return NodeFilter.FILTER_REJECT;
                if (parent.closest('#pmk-config-overlay, #pmk-config-admin')) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        let node;
        while ((node = walker.nextNode())) out.push(node);
        return out;
    }

    function carrierElements(element) {
        if (!element || element.nodeType !== 1) return [];

        if (element.matches('a[href^="tel:"]')) return [element];

        const phoneLinks = Array.from(element.querySelectorAll('a[href^="tel:"]'));
        if (phoneLinks.length) return phoneLinks;

        return [element];
    }

    function cssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
        return String(value).replace(/[^a-zA-Z0-9_-]/g, function (c) { return '\\' + c; });
    }

    function stableTableSelector(table) {
        if (!table || table.nodeType !== 1) return '';
        if (table.id && !/^pmk-/i.test(table.id)) return '#' + cssEscape(table.id);

        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        if (service && typeof service.stableSelector === 'function') {
            const selector = service.stableSelector(table);
            if (selector) return selector;
        }
        return '';
    }

    /*
     * Compatibilité avec les règles créées avant le picker répétable :
     * si un pick a enregistré une cellule unique de tableau
     * (ex. tr:nth-of-type(4) > td:nth-of-type(4)), on reconnaît sa colonne
     * et on traite toutes les cellules équivalentes du même tableau.
     * Cette généralisation est volontairement limitée aux <td> d'un <tbody>.
     */
    function repeatedTableColumnSelector(element, rule) {
        if (!element || !element.closest) return '';
        const cell = element.closest('td');
        if (!cell) return '';
        const tbody = cell.closest('tbody');
        const table = cell.closest('table');
        const row = cell.parentElement;
        if (!tbody || !table || !row || !tbody.contains(row)) return '';

        const cells = Array.from(row.children).filter(function (child) {
            return child && child.tagName === 'TD';
        });
        const index = cells.indexOf(cell);
        if (index < 0) return '';

        const tableSelector = stableTableSelector(table);
        if (!tableSelector) return '';

        const selector = tableSelector + ' tbody > tr > td:nth-child(' + (index + 1) + ')';
        let matches;
        try { matches = Array.from(document.querySelectorAll(selector)); }
        catch (_) { return ''; }
        if (matches.length < 2) return '';

        // Sécurité spécifique au module téléphone : on ne généralise la colonne
        // que si au moins deux cellules contiennent un candidat du bon nombre de chiffres.
        const digitCount = expectedDigits(rule);
        if (!digitCount) return '';
        const plausible = matches.filter(function (candidate) {
            const digits = String(candidate.textContent || '').replace(/\D/g, '');
            return digits.length === digitCount;
        });
        if (plausible.length < 2) return '';

        return selector;
    }

    function resolveRuleElements(selector, rule) {
        let elements;
        try { elements = Array.from(document.querySelectorAll(selector)); }
        catch (_) { return []; }

        if (elements.length === 1) {
            const repeatedSelector = repeatedTableColumnSelector(elements[0], rule);
            if (repeatedSelector) {
                try {
                    const repeated = Array.from(document.querySelectorAll(repeatedSelector));
                    if (repeated.length > 1) return repeated;
                } catch (_) {}
            }
        }
        return elements;
    }

    function excluded(element, rule) {
        const selector = String(rule.excludeSelector || '').trim();
        if (!selector || !element || !element.matches) return false;
        try {
            return element.matches(selector) || Boolean(element.closest(selector));
        } catch (_) {
            // Un sélecteur d'exclusion invalide ne doit jamais élargir le traitement.
            return true;
        }
    }

    function rememberOriginal(node) {
        if (!originalText.has(node)) originalText.set(node, node.nodeValue || '');
    }

    function applyToCarrier(carrier, rule) {
        if (!carrier || excluded(carrier, rule)) return false;
        let changed = false;

        textNodes(carrier).forEach(function (node) {
            const before = node.nodeValue || '';
            const after = formatTextValue(before, rule);
            if (after === before) return;
            rememberOriginal(node);
            selfMutatedTextNodes.add(node);
            node.nodeValue = after;
            changed = true;
        });

        return changed;
    }

    function applyRule(rule) {
        if (!rule || rule.enabled === false || !pathMatches(rule)) return;
        const selector = String(rule.selector || '').trim();
        if (!selector) return;

        const elements = resolveRuleElements(selector, rule);
        if (!elements.length) return;

        const seen = new Set();
        elements.forEach(function (element) {
            if (!element || element.closest('#pmk-config-overlay, #pmk-config-admin')) return;
            carrierElements(element).forEach(function (carrier) {
                if (!carrier || seen.has(carrier)) return;
                seen.add(carrier);
                applyToCarrier(carrier, rule);
            });
        });
    }

    function applyAll() {
        if (!currentConfig || currentConfig.enabled === false) return;
        applying = true;
        try {
            (currentConfig.rules || []).forEach(applyRule);
        } finally {
            applying = false;
        }
    }

    function restoreAll() {
        applying = true;
        try {
            originalText.forEach(function (value, node) {
                if (node && node.isConnected) node.nodeValue = value;
            });
            originalText.clear();
        } finally {
            applying = false;
        }
    }

    function stopObserver() {
        clearTimeout(observerTimer);
        observerTimer = 0;
        if (observer) observer.disconnect();
        observer = null;
    }

    function startObserver() {
        if (observer || !document.body) return;

        observer = new MutationObserver(function (mutations) {
            if (applying) return;

            let externalMutation = false;

            // Les mutations produites par le module sont ignorées. Si Koha modifie ensuite
            // un texte déjà suivi, cette nouvelle valeur devient la référence à restaurer.
            mutations.forEach(function (mutation) {
                if (mutation.type === 'characterData' && selfMutatedTextNodes.has(mutation.target)) {
                    selfMutatedTextNodes.delete(mutation.target);
                    return;
                }

                externalMutation = true;
                if (mutation.type === 'characterData' && originalText.has(mutation.target)) {
                    originalText.set(mutation.target, mutation.target.nodeValue || '');
                }
            });

            if (!externalMutation) return;

            clearTimeout(observerTimer);
            observerTimer = window.setTimeout(function () {
                applyAll();
            }, Math.max(20, Number(currentConfig && currentConfig.observeDelay) || 80));
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    function refresh(config) {
        stopObserver();
        restoreAll();
        currentConfig = normalizeConfig(config);

        if (currentConfig.enabled !== false) {
            applyAll();
            if (currentConfig.observeDom !== false) startObserver();
        }
    }

    function ruleFromContext(context) {
        const root = context && context.rootObject;
        const path = context && Array.isArray(context.fieldPath) ? context.fieldPath : [];
        const pos = path.indexOf('rules');
        const index = pos >= 0 ? Number(path[pos + 1]) : -1;
        if (!root || !Array.isArray(root.rules) || !Number.isInteger(index)) return null;
        return root.rules[index] || null;
    }

    function firstPickerPage(context) {
        const rule = ruleFromContext(context);
        const pages = Array.isArray(rule && rule.pages)
            ? rule.pages
            : String(rule && rule.pages || '').split(/[\n,;]+/);

        for (let i = 0; i < pages.length; i += 1) {
            const raw = String(pages[i] || '').trim();
            if (!raw || raw === '*' || raw.toLowerCase() === 'all') continue;
            if (raw.startsWith('/')) return raw;
            return '/cgi-bin/koha/' + raw.replace(/^\/+/, '');
        }
        return window.location.pathname + window.location.search;
    }

    function registerCommonPickerAdapter() {
        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!service || typeof service.register !== 'function') return false;

        service.register(MODULE_ID, {
            getOptions: function () {
                const lang = window.PMKConfig && typeof window.PMKConfig.getLanguage === 'function'
                    ? window.PMKConfig.getLanguage()
                    : 'fr';
                return {
                    bannerText: lang === 'en'
                        ? 'Click the element containing the phone number — Esc cancels'
                        : 'Clique sur l’élément contenant le numéro de téléphone — Échap annule',
                    // Le moteur commun peut transformer un pick de cellule en colonne répétée.
                    generalizeTableColumn: true
                };
            },
            applyPending: function (draft, pending, picked) {
                const path = pending && Array.isArray(pending.fieldPath) ? pending.fieldPath : [];
                const pos = path.indexOf('rules');
                const index = pos >= 0 ? Number(path[pos + 1]) : -1;
                if (!draft || !Array.isArray(draft.rules) || !Number.isInteger(index) || !draft.rules[index]) {
                    return draft;
                }

                const rule = draft.rules[index];
                if (picked && picked.targetName) {
                    if (!String(rule.targetName || '').trim()) rule.targetName = picked.targetName;
                    if (!String(rule.label || '').trim()) rule.label = picked.targetName;
                }
                return draft;
            }
        });
        return true;
    }

    function pickElement(context) {
        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!service || typeof service.pickForConfig !== 'function') {
            return Promise.reject(new Error('pmk_common_picker_unavailable'));
        }

        registerCommonPickerAdapter();
        const ctx = context || {};
        return service.pickForConfig({
            moduleId: MODULE_ID,
            targetUrl: firstPickerPage(ctx),
            rootObject: ctx.rootObject || {},
            fieldPath: Array.isArray(ctx.fieldPath) ? ctx.fieldPath : [],
            adminContext: { sectionId: 'rules' }
        });
    }

    function stableSelector(element) {
        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        return service && typeof service.stableSelector === 'function'
            ? service.stableSelector(element)
            : '';
    }

    function loadConfig() {
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== 'function') {
            return Promise.resolve(deepClone(DEFAULTS));
        }

        return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
            .then(function (cfg) { return cfg || deepClone(DEFAULTS); })
            .catch(function () { return deepClone(DEFAULTS); });
    }

    function start() {
        registerCommonPickerAdapter();
        loadConfig().then(refresh);

        if (window.PMKConfig && typeof window.PMKConfig.subscribe === 'function') {
            try {
                window.PMKConfig.subscribe(MODULE_ID, function (cfg) {
                    refresh(cfg);
                });
            } catch (_) {}
        }
    }

    window.PMK043PhoneNumberFormatting = {
        id: MODULE_ID,
        defaults: deepClone(DEFAULTS),
        refresh: refresh,
        apply: applyAll,
        restore: restoreAll,
        pickElement: pickElement,
        stableSelector: stableSelector,
        formatDigits: formatDigits,
        parseGroups: parseGroups
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();

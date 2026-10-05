/*
 Nom du fichier: 018-element-formatting.js
 Ancien nom: 018-underline-last-four-digits.js
 Dépendances: 000-pmk-config-firestore.js (facultatif : valeurs par défaut intégrées)
 Date de dernière modification: 2026-09-17
 Version: 018.6.0 — moteur visuel commun PMK / multi-éléments
 Auteur: Michael Mundet / refonte PimpMyKoha
 Description: Moteur générique multi-règles de mise en forme ciblée d'éléments Koha.
              Chaque règle peut cibler un élément différent avec sa propre mise en forme.
              Le nombre de règles n'est pas limité par le module.
              Le comportement historique du 018 reste fourni comme règle par défaut.
*/
(function () {
    'use strict';

    const MODULE_ID = 'element-formatting';
    const STYLE_ID = 'pmk018-element-formatting-style';
    const MARK_ATTR = 'data-pmk018-format';
    const ORIGINAL_ATTR = 'data-pmk018-original-html';

    const DEFAULTS = {
        enabled: true,
        observeDom: true,
        observeDelay: 80,
        rules: [
            {
                id: 'legacy-patron-last-four',
                enabled: true,
                label: '4 derniers chiffres carte lecteur',
                pages: ['circ/circulation.pl', 'members/moremember.pl'],
                selector: 'div.patroninfo.is-not-staff h5, .circ_barcode, .col-sm-12 h1, h4:has(.patron-title)',
                matchMode: 'regex',
                regex: '\\((\\d+)\\)',
                regexFlags: '',
                regexGroup: 1,
                portion: 'last',
                count: 4,
                offset: 0,
                start: 0,
                length: 0,
                trim: false,
                style: {
                    bold: true,
                    italic: false,
                    color: '#008000',
                    backgroundColor: '',
                    fontSize: '',
                    letterSpacing: '1px',
                    underline: true,
                    underlineStyle: 'dotted',
                    underlineThickness: '',
                    underlineColor: '',
                    strike: false,
                    textTransform: 'none',
                    opacity: 1
                }
            }
        ]
    };

    let currentConfig = null;
    let observer = null;
    let observerTimer = 0;

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
                if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
                merge(target[key], value);
            } else {
                target[key] = value;
            }
        });
        return target;
    }

    function normalizeConfig(config) {
        const result = merge(deepClone(DEFAULTS), config || {});
        if (!Array.isArray(result.rules)) result.rules = deepClone(DEFAULTS.rules);
        result.rules = result.rules.map(function (rule, index) {
            const base = {
                id: 'rule-' + (index + 1), enabled: true, label: '', pages: [], selector: '',
                matchMode: 'whole', regex: '', regexFlags: '', regexGroup: 0,
                portion: 'whole', count: 4, offset: 0, start: 0, length: 0, trim: false,
                style: {
                    bold: false, italic: false, color: '', backgroundColor: '', fontSize: '',
                    letterSpacing: '', underline: false, underlineStyle: 'solid',
                    underlineThickness: '', underlineColor: '', strike: false,
                    textTransform: 'none', opacity: 1
                }
            };
            return merge(base, rule || {});
        });
        return result;
    }

    function pathMatches(rule) {
        const pages = Array.isArray(rule.pages) ? rule.pages : String(rule.pages || '').split(/[\n,;]+/);
        const clean = pages.map(function (v) { return String(v || '').trim(); }).filter(Boolean);
        if (!clean.length) return true;
        const pathname = window.location.pathname;
        return clean.some(function (page) {
            if (page === '*' || page === 'all') return true;
            return pathname.indexOf(page) !== -1;
        });
    }

    function safeRegex(pattern, flags) {
        try { return new RegExp(pattern, flags || ''); }
        catch (_) { return null; }
    }

    function portionBounds(text, portion, count, offset, start, length) {
        const total = text.length;
        switch (portion) {
            case 'first': {
                const n = Math.max(0, Math.min(total, Number(count) || 0));
                const o = Math.max(0, Math.min(total, Number(offset) || 0));
                const from = Math.min(total, o);
                return [from, Math.min(total, from + n)];
            }
            case 'last': {
                const n = Math.max(0, Math.min(total, Number(count) || 0));
                const o = Math.max(0, Math.min(total, Number(offset) || 0));
                const to = Math.max(0, total - o);
                return [Math.max(0, to - n), to];
            }
            case 'range': {
                const s = Math.max(0, Math.min(total, Number(start) || 0));
                const l = Math.max(0, Number(length) || 0);
                return [s, Math.min(total, s + l)];
            }
            default:
                return [0, total];
        }
    }

    function buildStyle(rule) {
        const s = rule.style || {};
        const declarations = [];
        if (s.bold) declarations.push('font-weight:700');
        if (s.italic) declarations.push('font-style:italic');
        if (String(s.color || '').trim()) declarations.push('color:' + String(s.color).trim());
        if (String(s.backgroundColor || '').trim()) declarations.push('background-color:' + String(s.backgroundColor).trim());
        if (String(s.fontSize || '').trim()) declarations.push('font-size:' + String(s.fontSize).trim());
        if (String(s.letterSpacing || '').trim()) declarations.push('letter-spacing:' + String(s.letterSpacing).trim());
        if (s.underline || s.strike) {
            const lines = [];
            if (s.underline) lines.push('underline');
            if (s.strike) lines.push('line-through');
            declarations.push('text-decoration-line:' + lines.join(' '));
            if (s.underline) {
                declarations.push('text-decoration-style:' + (s.underlineStyle || 'solid'));
                if (String(s.underlineThickness || '').trim()) declarations.push('text-decoration-thickness:' + String(s.underlineThickness).trim());
                if (String(s.underlineColor || '').trim()) declarations.push('text-decoration-color:' + String(s.underlineColor).trim());
            }
        }
        if (s.textTransform && s.textTransform !== 'none') declarations.push('text-transform:' + s.textTransform);
        if (s.opacity !== undefined && s.opacity !== null && s.opacity !== '') {
            const opacity = Math.max(0, Math.min(1, Number(s.opacity)));
            if (Number.isFinite(opacity) && opacity !== 1) declarations.push('opacity:' + opacity);
        }
        declarations.push('display:inline-block');
        return declarations.join(';');
    }

    function makeSpan(text, rule, ruleIndex) {
        const span = document.createElement('span');
        span.setAttribute(MARK_ATTR, String(ruleIndex));
        span.className = 'pmk018-formatted';
        span.style.cssText = buildStyle(rule);
        span.textContent = text;
        return span;
    }

    function replaceRangeInTextNode(textNode, start, end, rule, ruleIndex) {
        if (!textNode || start >= end) return false;
        const text = textNode.nodeValue || '';
        if (start < 0 || end > text.length) return false;
        const fragment = document.createDocumentFragment();
        if (start > 0) fragment.appendChild(document.createTextNode(text.slice(0, start)));
        fragment.appendChild(makeSpan(text.slice(start, end), rule, ruleIndex));
        if (end < text.length) fragment.appendChild(document.createTextNode(text.slice(end)));
        textNode.parentNode.replaceChild(fragment, textNode);
        return true;
    }

    function textNodes(root) {
        const out = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest('script,style,textarea,input,select,option')) return NodeFilter.FILTER_REJECT;
                if (parent.closest('[' + MARK_ATTR + ']')) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        let node;
        while ((node = walker.nextNode())) out.push(node);
        return out;
    }

    function applyWholeElementText(element, rule, ruleIndex) {
        const nodes = textNodes(element);
        if (!nodes.length) return false;

        // Pour "whole", on applique la mise en forme à tous les nœuds texte sans détruire les liens/icônes enfants.
        if (rule.matchMode === 'whole' && rule.portion === 'whole') {
            let changed = false;
            nodes.forEach(function (node) {
                const t = node.nodeValue || '';
                if (!t) return;
                changed = replaceRangeInTextNode(node, 0, t.length, rule, ruleIndex) || changed;
            });
            return changed;
        }

        // Les autres modes travaillent sur le texte concaténé en conservant les éléments HTML existants.
        const chunks = [];
        let cursor = 0;
        nodes.forEach(function (node) {
            const value = node.nodeValue || '';
            chunks.push({ node: node, start: cursor, end: cursor + value.length });
            cursor += value.length;
        });
        const fullText = nodes.map(function (n) { return n.nodeValue || ''; }).join('');

        let baseStart = 0;
        let baseEnd = fullText.length;
        if (rule.matchMode === 'regex') {
            const re = safeRegex(rule.regex, String(rule.regexFlags || '').replace(/g/g, ''));
            if (!re) return false;
            const match = re.exec(fullText);
            if (!match) return false;
            const group = Math.max(0, Number(rule.regexGroup) || 0);
            const groupText = match[group];
            if (groupText === undefined) return false;
            if (group === 0) {
                baseStart = match.index;
            } else {
                const relative = match[0].indexOf(groupText);
                if (relative < 0) return false;
                baseStart = match.index + relative;
            }
            baseEnd = baseStart + groupText.length;
        }

        let source = fullText.slice(baseStart, baseEnd);
        if (rule.trim) {
            const leading = source.length - source.replace(/^\s+/, '').length;
            const trailing = source.length - source.replace(/\s+$/, '').length;
            baseStart += leading;
            baseEnd -= trailing;
            source = fullText.slice(baseStart, baseEnd);
        }

        // Pour les sélections partielles, ne pas compter les espaces/retours à la ligne
        // invisibles placés par le HTML autour du texte. Ainsi N = N caractères visibles.
        let countOffset = 0;
        let countSource = source;
        if (rule.portion !== 'whole') {
            const leadingInvisible = countSource.length - countSource.replace(/^\s+/, '').length;
            const trailingInvisible = countSource.length - countSource.replace(/\s+$/, '').length;
            countOffset = leadingInvisible;
            countSource = countSource.slice(leadingInvisible, Math.max(leadingInvisible, countSource.length - trailingInvisible));
        }

        const bounds = portionBounds(countSource, rule.portion, rule.count, rule.offset, rule.start, rule.length);
        const wantedStart = baseStart + countOffset + bounds[0];
        const wantedEnd = baseStart + countOffset + bounds[1];
        if (wantedStart >= wantedEnd) return false;

        // Appliquer de droite à gauche pour ne pas invalider les références aux nœuds précédents.
        let changed = false;
        chunks.slice().reverse().forEach(function (chunk) {
            const start = Math.max(wantedStart, chunk.start);
            const end = Math.min(wantedEnd, chunk.end);
            if (start >= end || !chunk.node.parentNode) return;
            changed = replaceRangeInTextNode(chunk.node, start - chunk.start, end - chunk.start, rule, ruleIndex) || changed;
        });
        return changed;
    }

    function restoreElement(element) {
        if (!element || !element.hasAttribute(ORIGINAL_ATTR)) return;
        try {
            element.innerHTML = element.getAttribute(ORIGINAL_ATTR) || '';
        } catch (_) {}
        element.removeAttribute(ORIGINAL_ATTR);
        element.removeAttribute('data-pmk018-applied');
    }

    function restoreAll() {
        document.querySelectorAll('[' + ORIGINAL_ATTR + ']').forEach(restoreElement);
    }

    function applyRule(rule, ruleIndex) {
        if (!rule || rule.enabled === false || !pathMatches(rule)) return;
        const selector = String(rule.selector || '').trim();
        if (!selector) return;
        let elements;
        try { elements = document.querySelectorAll(selector); }
        catch (_) { return; }

        elements.forEach(function (element) {
            if (!element || element.closest('#pmk-config-admin')) return;
            const token = String(rule.id || ruleIndex);
            const applied = String(element.getAttribute('data-pmk018-applied') || '').split(',').filter(Boolean);
            if (applied.indexOf(token) !== -1) return;
            if (!element.hasAttribute(ORIGINAL_ATTR)) element.setAttribute(ORIGINAL_ATTR, element.innerHTML);
            if (applyWholeElementText(element, rule, ruleIndex)) {
                applied.push(token);
                element.setAttribute('data-pmk018-applied', applied.join(','));
            }
        });
    }

    function applyAll() {
        if (!currentConfig || currentConfig.enabled === false) return;
        (currentConfig.rules || []).forEach(applyRule);
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

    function startObserver() {
        if (observer || !document.body) return;
        observer = new MutationObserver(function (mutations) {
            // Ignorer les mutations produites uniquement par le module lui-même.
            const external = mutations.some(function (mutation) {
                const target = mutation.target && mutation.target.nodeType === 1 ? mutation.target : mutation.target && mutation.target.parentElement;
                return !(target && target.closest && target.closest('[' + MARK_ATTR + ']'));
            });
            if (!external) return;
            clearTimeout(observerTimer);
            observerTimer = window.setTimeout(applyAll, Math.max(20, Number(currentConfig.observeDelay) || 80));
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    function stopObserver() {
        clearTimeout(observerTimer);
        observerTimer = 0;
        if (observer) observer.disconnect();
        observer = null;
    }

    function cssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
        return String(value).replace(/[^a-zA-Z0-9_-]/g, function (c) { return '\\' + c; });
    }

    function firstPickerPage(context) {
        const rootObject = context && context.rootObject ? context.rootObject : null;
        const path = context && Array.isArray(context.fieldPath) ? context.fieldPath : [];
        const pos = path.indexOf('rules');
        const index = pos >= 0 ? Number(path[pos + 1]) : -1;
        const rule = rootObject && Array.isArray(rootObject.rules) && Number.isInteger(index) ? rootObject.rules[index] : null;
        const pages = Array.isArray(rule && rule.pages) ? rule.pages : String(rule && rule.pages || '').split(/[\n,;]+/);
        for (let i = 0; i < pages.length; i += 1) {
            const raw = String(pages[i] || '').trim();
            if (!raw || raw === '*' || raw === 'all') continue;
            if (raw.startsWith('/')) return raw;
            return '/cgi-bin/koha/' + raw.replace(/^\/+/, '');
        }
        return window.location.pathname;
    }

    function registerCommonPickerAdapter() {
        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!service || typeof service.register !== 'function') return false;
        service.register(MODULE_ID, {
            getOptions: function () {
                return {
                    bannerText: (window.PMKConfig && window.PMKConfig.getLanguage && window.PMKConfig.getLanguage() === 'en')
                        ? 'Click the element to format — Esc cancels'
                        : 'Clique sur l’élément à mettre en forme — Échap annule'
                };
            },
            applyPending: function (draft, pending, picked) {
                const path = pending && Array.isArray(pending.fieldPath) ? pending.fieldPath : [];
                const pos = path.indexOf('rules');
                const index = pos >= 0 ? Number(path[pos + 1]) : -1;
                if (!draft || !Array.isArray(draft.rules) || !Number.isInteger(index) || !draft.rules[index]) return draft;
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

    function stableSelector(element) {
        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        return service && typeof service.stableSelector === 'function' ? service.stableSelector(element) : '';
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

    function visualRuleFromPath(rootObject, fieldPath) {
        const path = Array.isArray(fieldPath) ? fieldPath : [];
        const pos = path.indexOf('rules');
        const index = pos >= 0 ? Number(path[pos + 1]) : -1;
        return rootObject && Array.isArray(rootObject.rules) && Number.isInteger(index)
            ? rootObject.rules[index]
            : null;
    }

    function registerVisualEditorAdapter() {
        const editor = window.PMKConfig && window.PMKConfig.visualEditor;
        if (!editor || typeof editor.register !== 'function') return false;
        editor.register(MODULE_ID, {
            capabilities: {
                inlinePreview: true,
                styleEyedropper: true,
                livePreview: true
            },
            previewModel: function (context) {
                const rule = visualRuleFromPath(context && context.rootObject, context && context.fieldPath) || {};
                const s = rule.style || {};
                let decoration = [];
                if (s.underline) decoration.push('underline');
                if (s.strike) decoration.push('line-through');
                return {
                    text: rule.targetName || rule.label || 'Aperçu 90405001081712',
                    style: {
                        fontWeight: s.bold ? '700' : '400',
                        fontStyle: s.italic ? 'italic' : 'normal',
                        color: s.color || '',
                        backgroundColor: s.backgroundColor || '',
                        fontSize: s.fontSize || '',
                        letterSpacing: s.letterSpacing || '',
                        textDecorationLine: decoration.join(' ') || 'none',
                        textDecorationStyle: s.underlineStyle || 'solid',
                        textDecorationColor: s.underlineColor || '',
                        textDecorationThickness: s.underlineThickness || '',
                        textTransform: s.textTransform || 'none',
                        opacity: s.opacity == null ? '1' : String(s.opacity)
                    }
                };
            },
            styleTargetUrl: function (context) {
                const rule = visualRuleFromPath(context && context.rootObject, context && context.fieldPath);
                if (!rule) return window.location.pathname;
                const pages = Array.isArray(rule.pages) ? rule.pages : String(rule.pages || '').split(/[\n,;]+/);
                for (let i = 0; i < pages.length; i += 1) {
                    const raw = String(pages[i] || '').trim();
                    if (!raw || raw === '*' || raw === 'all') continue;
                    if (raw.startsWith('/')) return raw;
                    return '/cgi-bin/koha/' + raw.replace(/^\/+/, '');
                }
                return window.location.pathname;
            },
            applyStyleSample: function (context) {
                const rule = visualRuleFromPath(context && context.rootObject, context && context.fieldPath);
                const sample = context && context.sample;
                if (!rule || !sample) return { rootObject: context && context.rootObject };
                const visual = window.PMKConfig && window.PMKConfig.visualEditor;
                const toHex = visual && typeof visual.colorToHex === 'function'
                    ? visual.colorToHex
                    : function () { return ''; };
                const style = rule.style || (rule.style = {});
                style.bold = (parseInt(sample.fontWeight, 10) || 0) >= 600 || /bold/i.test(String(sample.fontWeight || ''));
                style.italic = /italic|oblique/i.test(String(sample.fontStyle || ''));
                style.color = toHex(sample.color) || '';
                style.backgroundColor = toHex(sample.backgroundColor) || '';
                style.fontSize = String(sample.fontSize || '');
                style.letterSpacing = String(sample.letterSpacing || '');
                const lines = String(sample.textDecorationLine || sample.textDecoration || '');
                style.underline = /underline/i.test(lines);
                style.strike = /line-through/i.test(lines);
                if (sample.textDecorationStyle) style.underlineStyle = String(sample.textDecorationStyle);
                style.underlineColor = toHex(sample.textDecorationColor) || '';
                style.underlineThickness = String(sample.textDecorationThickness || '');
                style.textTransform = ['none','uppercase','lowercase','capitalize'].includes(String(sample.textTransform || ''))
                    ? String(sample.textTransform)
                    : 'none';
                const opacity = parseFloat(sample.opacity);
                if (Number.isFinite(opacity)) style.opacity = Math.max(0, Math.min(1, opacity));
                return { rootObject: context && context.rootObject };
            },
            previewDraft: function (draft) {
                const before = deepClone(currentConfig || DEFAULTS);
                refresh(draft);
                return function () {
                    refresh(before);
                };
            }
        });
        return true;
    }

    function loadConfig() {
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== 'function') {
            return Promise.resolve(deepClone(DEFAULTS));
        }
        return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
            .then(function (cfg) { return cfg || deepClone(DEFAULTS); })
            .catch(function () { return deepClone(DEFAULTS); });
    }

    function registerRuntimeConfig() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== 'function') return;
        // Le schéma complet est pré-enregistré par 000-pmk-config-firestore.js.
        // On ne remplace pas ici la définition centrale lorsqu'elle existe.
    }

    function start() {
        registerRuntimeConfig();
        registerCommonPickerAdapter();
        registerVisualEditorAdapter();
        loadConfig().then(refresh);
        if (window.PMKConfig && typeof window.PMKConfig.subscribe === 'function') {
            try {
                window.PMKConfig.subscribe(MODULE_ID, function (cfg) { refresh(cfg); });
            } catch (_) {}
        }
    }

    window.PMK018ElementFormatting = {
        id: MODULE_ID,
        defaults: deepClone(DEFAULTS),
        refresh: refresh,
        apply: applyAll,
        restore: restoreAll,
        pickElement: pickElement,
        stableSelector: stableSelector
    };

    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = '.pmk018-formatted{box-decoration-break:clone;-webkit-box-decoration-break:clone;}';
        document.head.appendChild(style);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();

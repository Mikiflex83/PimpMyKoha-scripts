/*
 Nom du fichier: 027-genre-icons-detail.js
 Dépendances: 000-pmk-config-firestore.js recommandé (fallback autonome inclus)
 Date de dernière modification: 2026-09-17
 Auteur: Michael Mundet
 Description: Affiche des repères visuels configurables à partir de textes présents dans un bloc de la notice.
              Le bloc analysé et la destination sont sélectionnables visuellement depuis la configuration PMK.
*/
(function () {
    'use strict';

    const MODULE_ID = 'bibliographic-markers';
    const MODULE_VERSION = '2026.09.18.2';
    const PAGE_PATH = '/cgi-bin/koha/catalogue/detail.pl';
    const OWNER_ATTR = 'data-pmk027-owner';

    const DEFAULT_RULES = [
        { id: 'films-se-detendre', enabled: true, label: 'Films-Se détendre', searchText: 'Sujet - Indexation: Films-Se détendre', iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/Detente-ptif.png' },
        { id: 'film-drame', enabled: true, label: 'Film-Drame', searchText: 'Sujet - Indexation: Film-Drame', iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/drame.png' },
        { id: 'films-aventure', enabled: true, label: 'Films-Aventure', searchText: 'Sujet - Indexation: Films-Aventure', iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/Aventure.png' },
        { id: 'film-vintage', enabled: true, label: 'Film-Vintage', searchText: 'Sujet - Indexation: Film-Vintage', iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/Vintage-Enfant-ptif.png' },
        { id: 'film-famille', enabled: true, label: 'Film Famille', searchText: 'Sujet - Indexation: Film Famille', iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/En-Famille-ptif.png' },
        { id: 'films-historiques', enabled: true, label: 'Films historiques', searchText: 'Sujet - Indexation: Films historiques', iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/Historique-ptif.png' },
        { id: 'films-regards-de-femmes', enabled: true, label: 'Films-Regards de femmes', searchText: 'Sujet - Indexation: Films-Regards de femmes', iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/Female-gaze-ptif.png' },
        { id: 'films-muets', enabled: true, label: 'Films muets', searchText: 'Sujet - Indexation: Films muets', iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/Films-Muets-ptif.png' },
        { id: 'films-musicaux', enabled: true, label: 'Films musicaux', searchText: 'Sujet - Indexation: Films musicaux', iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/Musicaux-ptif.png' },
        { id: 'films-noirs', enabled: true, label: 'Films noirs', searchText: 'Sujet - Indexation: Films noirs', iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/Films-Noirs-ptif.png' },
        { id: 'films-grands-classiques', enabled: true, label: 'Films-Grands classiques', searchText: 'Sujet - Indexation: Films-Grands classiques', iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/Grands-Classiques-ptif.png' },
        { id: 'films-japanimation', enabled: true, label: 'Japanimation', searchText: 'Sujet - Indexation: Films-Japanimation', iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/Japanimation-ptif.png' },
        { id: 'films-science-fiction', enabled: true, label: 'Science-fiction', searchText: 'Sujet - Indexation: Films-Science-fiction', iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/Science-fiction-ptif.png' },
        { id: 'films-western', enabled: true, label: 'Western', searchText: 'Sujet - Indexation: Films-Western', iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/Western-ptif.png' },
        { id: 'series-courtes', enabled: true, label: 'Séries courtes', searchText: 'Sujet - Indexation: Séries courtes', iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/series-courtes.png' },
        { id: 'films-vintage', enabled: true, label: 'Films-Vintage', searchText: 'Sujet - Indexation: Films-Vintage', iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/Vintage-Enfant-ptif.png' },
        { id: 'comics', enabled: true, label: 'Comics', searchText: 'Sujet - Indexation: Comics', iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/Comics-ptif.png' },
        { id: 'films-action', enabled: true, label: 'Films-Action', searchText: 'Sujet - Indexation: Films-Action', iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/action.png' },
        { id: 'films-courts-metrages', enabled: true, label: 'Court metrage', searchText: 'Sujet - Indexation: Films-Courts métrages', iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/Court-metrage-ptif.png' },
        { id: 'films-horreur', enabled: true, label: 'Horreur', searchText: "Sujet - Indexation: Films d'horreur", iconUrl: 'https://catalogue.example.org/userfiles/image/zPortailElems/genres_cine/Horreur-ptif.png' }
    ];

    const DEFAULTS = {
        enabled: true,
        pagePath: PAGE_PATH,
        sourceSelector: '#catalogue_detail_biblio',
        sourceName: 'Bloc principal de la notice',
        destinationSelector: 'strong.titlebib',
        destinationName: 'Titre de la notice',
        destinationPosition: 'prepend',
        showLabel: true,
        iconSize: 30,
        maxIcons: 1,
        caseSensitive: true,
        normalizeWhitespace: true,
        rules: DEFAULT_RULES
    };

    let currentConfig = null;

    function deepClone(value) {
        try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
    }

    function normalizePath(path) {
        let value = String(path || '').trim();
        if (!value) return '';
        try {
            if (/^https?:\/\//i.test(value)) value = new URL(value).pathname;
        } catch (_) {}
        if (!value.startsWith('/')) value = '/' + value;
        return value.replace(/\/{2,}/g, '/');
    }

    function normalizeConfig(raw) {
        const cfg = Object.assign({}, deepClone(DEFAULTS), raw || {});
        cfg.enabled = cfg.enabled !== false;
        cfg.pagePath = normalizePath(cfg.pagePath || PAGE_PATH) || PAGE_PATH;
        cfg.sourceSelector = String(cfg.sourceSelector || DEFAULTS.sourceSelector).trim();
        cfg.sourceName = String(cfg.sourceName || '').trim();
        cfg.destinationSelector = String(cfg.destinationSelector || DEFAULTS.destinationSelector).trim();
        cfg.destinationName = String(cfg.destinationName || '').trim();
        cfg.destinationPosition = ['prepend', 'append', 'before', 'after'].includes(cfg.destinationPosition) ? cfg.destinationPosition : 'prepend';
        cfg.showLabel = cfg.showLabel !== false;
        cfg.iconSize = Math.max(12, Math.min(160, Number(cfg.iconSize) || 30));
        cfg.maxIcons = Math.max(0, Math.floor(Number(cfg.maxIcons) || 0));
        cfg.caseSensitive = cfg.caseSensitive !== false;
        cfg.normalizeWhitespace = cfg.normalizeWhitespace !== false;
        cfg.rules = Array.isArray(raw && raw.rules) ? raw.rules.map(function (rule, index) {
            return {
                id: String(rule && rule.id || ('rule-' + (index + 1))).trim(),
                enabled: !rule || rule.enabled !== false,
                label: String(rule && rule.label || '').trim(),
                searchText: String(rule && rule.searchText || ''),
                iconUrl: String(rule && rule.iconUrl || '').trim()
            };
        }) : deepClone(DEFAULT_RULES);
        return cfg;
    }

    function normalizeText(value, cfg) {
        let out = String(value || '');
        if (cfg.normalizeWhitespace) out = out.replace(/\s+/g, ' ').trim();
        if (!cfg.caseSensitive) out = out.toLocaleLowerCase();
        return out;
    }

    function matchesText(haystack, needle, cfg) {
        const wanted = normalizeText(needle, cfg);
        if (!wanted) return false;
        return normalizeText(haystack, cfg).includes(wanted);
    }

    function getSourceText(cfg) {
        if (!cfg.sourceSelector) return '';
        let nodes = [];
        try { nodes = Array.from(document.querySelectorAll(cfg.sourceSelector)); } catch (_) { return ''; }
        return nodes.map(function (node) { return node.innerText || node.textContent || ''; }).join('\n');
    }

    function findDestination(cfg) {
        if (!cfg.destinationSelector) return null;
        try { return document.querySelector(cfg.destinationSelector); } catch (_) { return null; }
    }

    function clearRendered() {
        document.querySelectorAll('[' + OWNER_ATTR + '="' + MODULE_ID + '"]').forEach(function (node) {
            node.remove();
        });
    }

    function ensureStyles() {
        if (document.getElementById('pmk027-runtime-style')) return;
        const style = document.createElement('style');
        style.id = 'pmk027-runtime-style';
        style.textContent = [
            '.pmk027-marker-group{display:inline-flex;align-items:flex-start;flex-wrap:wrap;gap:.45rem;vertical-align:middle}',
            '.pmk027-marker{display:inline-flex;flex-direction:column;align-items:center;justify-content:flex-start;max-width:7rem;text-align:center;line-height:1.05}',
            '.pmk027-marker img{display:block;max-width:100%;height:auto;object-fit:contain}',
            '.pmk027-marker-label{display:block;margin-top:.12rem;font-size:.58em;line-height:1.1;overflow-wrap:anywhere}',
            '@media (max-width:767.98px){.pmk027-marker-group{gap:.3rem}.pmk027-marker-label{font-size:.64em}}'
        ].join('');
        document.head.appendChild(style);
    }

    function createMarker(rule, cfg) {
        const marker = document.createElement('span');
        marker.className = 'pmk027-marker';
        marker.dataset.pmk027RuleId = rule.id;
        marker.title = rule.label || rule.searchText || rule.id;

        if (rule.iconUrl) {
            const img = document.createElement('img');
            img.src = rule.iconUrl;
            img.alt = rule.label || '';
            img.width = cfg.iconSize;
            img.height = cfg.iconSize;
            img.style.width = cfg.iconSize + 'px';
            img.style.height = cfg.iconSize + 'px';
            img.loading = 'lazy';
            img.addEventListener('error', function () {
                img.style.display = 'none';
                marker.classList.add('pmk027-icon-error');
            }, { once: true });
            marker.appendChild(img);
        }

        if (cfg.showLabel && rule.label) {
            const caption = document.createElement('span');
            caption.className = 'pmk027-marker-label';
            caption.textContent = rule.label;
            marker.appendChild(caption);
        }
        return marker;
    }

    function insertGroup(destination, group, position) {
        if (position === 'append') destination.appendChild(group);
        else if (position === 'before') destination.parentNode && destination.parentNode.insertBefore(group, destination);
        else if (position === 'after') destination.parentNode && destination.parentNode.insertBefore(group, destination.nextSibling);
        else destination.prepend(group);
    }

    function apply(config) {
        const cfg = normalizeConfig(config);
        currentConfig = cfg;
        clearRendered();

        if (!cfg.enabled) return { ok: false, reason: 'disabled' };
        if (window.location.pathname !== cfg.pagePath) return { ok: false, reason: 'wrong_page' };

        const destination = findDestination(cfg);
        if (!destination) return { ok: false, reason: 'destination_missing' };

        const sourceText = getSourceText(cfg);
        if (!sourceText) return { ok: false, reason: 'source_missing' };

        const found = [];
        const seenIds = new Set();

        for (let i = 0; i < cfg.rules.length; i += 1) {
            const rule = cfg.rules[i];
            if (!rule || rule.enabled === false || !rule.searchText) continue;
            if (seenIds.has(rule.id)) continue;
            if (!matchesText(sourceText, rule.searchText, cfg)) continue;

            seenIds.add(rule.id);
            found.push(rule);

            if (cfg.maxIcons > 0 && found.length >= cfg.maxIcons) break;
        }

        if (!found.length) return { ok: false, reason: 'no_match' };

        ensureStyles();

        const group = document.createElement('span');
        group.className = 'pmk027-marker-group';
        group.setAttribute(OWNER_ATTR, MODULE_ID);
        group.dataset.pmk027Version = MODULE_VERSION;

        found.forEach(function (rule) {
            group.appendChild(createMarker(rule, cfg));
        });

        insertGroup(destination, group, cfg.destinationPosition);

        return {
            ok: true,
            reason: 'rendered',
            count: found.length
        };
    }

    function refresh(config) {
        const result = apply(config || currentConfig || DEFAULTS);
        mountContextAccess();
        return result;
    }

    let readinessObserver = null;
    let readinessTimer = null;
    let readinessDeadlineTimer = null;

    function stopReadinessObserver() {
        if (readinessObserver) {
            readinessObserver.disconnect();
            readinessObserver = null;
        }
        if (readinessTimer) {
            window.clearTimeout(readinessTimer);
            readinessTimer = null;
        }
        if (readinessDeadlineTimer) {
            window.clearTimeout(readinessDeadlineTimer);
            readinessDeadlineTimer = null;
        }
    }

    function scheduleReadinessRefresh() {
        if (readinessTimer) window.clearTimeout(readinessTimer);
        readinessTimer = window.setTimeout(function () {
            readinessTimer = null;
            const result = refresh(currentConfig || DEFAULTS);
            if (result && result.ok) stopReadinessObserver();
        }, 80);
    }

    function watchUntilReady() {
        stopReadinessObserver();

        const first = refresh(currentConfig || DEFAULTS);
        if (first && first.ok) return;

        readinessObserver = new MutationObserver(function () {
            scheduleReadinessRefresh();
        });

        readinessObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true
        });

        readinessDeadlineTimer = window.setTimeout(function () {
            stopReadinessObserver();
            refresh(currentConfig || DEFAULTS);
        }, 12000);
    }

    function fieldKind(context) {
        const path = context && Array.isArray(context.fieldPath) ? context.fieldPath : [];
        const key = path[path.length - 1];
        return key === 'sourceSelector' ? 'source' : 'destination';
    }

    function registerCommonPickerAdapter() {
        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!service || typeof service.register !== 'function') return false;
        service.register(MODULE_ID, {
            getOptions: function (request) {
                const kind = request && request.meta && request.meta.kind === 'source' ? 'source' : 'destination';
                return {
                    bannerText: kind === 'source'
                        ? 'Cliquez sur le bloc dans lequel le module doit rechercher les textes — Échap annule'
                        : 'Cliquez sur l’élément qui doit recevoir les icônes — Échap annule'
                };
            },
            applyPending: function (draft, pending, picked) {
                const kind = pending && pending.meta && pending.meta.kind === 'source' ? 'source' : 'destination';
                if (kind === 'source') draft.sourceName = picked && (picked.targetName || picked.selector) || draft.sourceName;
                else draft.destinationName = picked && (picked.targetName || picked.selector) || draft.destinationName;
                return draft;
            }
        });
        return true;
    }

    function stableSelector(element) {
        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        return service && typeof service.stableSelector === 'function' ? service.stableSelector(element) : '';
    }

    function pickElementOnCurrentPage(kind) {
        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!service || typeof service.pick !== 'function') return Promise.reject(new Error('pmk_common_picker_unavailable'));
        registerCommonPickerAdapter();
        return service.pick({ moduleId: MODULE_ID, meta: { kind: kind === 'source' ? 'source' : 'destination' } });
    }

    function pickForConfig(context) {
        const rootObject = context && context.rootObject ? context.rootObject : null;
        const kind = fieldKind(context);
        const wantedPage = normalizePath(rootObject && rootObject.pagePath || PAGE_PATH) || PAGE_PATH;
        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!service || typeof service.pickForConfig !== 'function') return Promise.reject(new Error('pmk_common_picker_unavailable'));
        registerCommonPickerAdapter();
        return service.pickForConfig({
            moduleId: MODULE_ID,
            targetUrl: wantedPage,
            rootObject: rootObject || {},
            fieldPath: context && Array.isArray(context.fieldPath) ? context.fieldPath : [],
            meta: { kind: kind },
            adminContext: { sectionId: 'placement' }
        });
    }

    async function resumePendingPick() {
        registerCommonPickerAdapter();
        return true;
    }

    function mountContextAccess() {
        if (window.location.pathname !== PAGE_PATH) return;
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== 'function') return;
        const anchor = document.querySelector('strong.titlebib') || document.querySelector('#catalogue_detail_biblio h1') || document.querySelector('h1');
        if (!anchor) return;
        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: 'after',
                contextKey: 'catalogue-detail-bibliographic-markers',
                context: { page: 'catalogue.detail', sectionId: 'placement' }
            });
        } catch (_) {}
    }

    function registerVisualEditorAdapter() {
        const editor = window.PMKConfig && window.PMKConfig.visualEditor;
        if (!editor || typeof editor.register !== 'function') return false;
        editor.register(MODULE_ID, {
            capabilities: {
                inlinePreview: true,
                livePreview: true
            },
            canPreview: function () { return window.location.pathname === PAGE_PATH; },
            previewModel: function (context) {
                const cfg = normalizeConfig(context && context.rootObject || currentConfig || DEFAULTS);
                const first = (cfg.rules || []).find(function (rule) {
                    return rule && rule.enabled !== false;
                }) || {};
                return {
                    text: cfg.showLabel === false
                        ? 'Repère bibliographique'
                        : (first.label || first.searchText || 'Repère bibliographique'),
                    icon: first.iconUrl ? {
                        type: 'image',
                        url: first.iconUrl,
                        size: Number(cfg.iconSize) || 30,
                        position: 'before'
                    } : null
                };
            },
            previewDraft: function (draft) {
                if (window.location.pathname !== PAGE_PATH) throw new Error('visual_preview_wrong_page');
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
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== 'function') return Promise.resolve(deepClone(DEFAULTS));
        return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
            .then(function (cfg) { return cfg || deepClone(DEFAULTS); })
            .catch(function () { return deepClone(DEFAULTS); });
    }

    function start() {
        registerVisualEditorAdapter();
        loadConfig().then(function (cfg) {
            currentConfig = normalizeConfig(cfg || DEFAULTS);
            watchUntilReady();
        });

        if (window.PMKConfig && typeof window.PMKConfig.subscribe === 'function') {
            try {
                window.PMKConfig.subscribe(MODULE_ID, function (cfg) {
                    currentConfig = normalizeConfig(cfg || DEFAULTS);
                    watchUntilReady();
                });
            } catch (_) {}
        }

        resumePendingPick();
        mountContextAccess();
    }

    window.PMK027BibliographicMarkers = {
        id: MODULE_ID,
        version: MODULE_VERSION,
        defaults: deepClone(DEFAULTS),
        refresh: refresh,
        apply: apply,
        clear: clearRendered,
        pickElement: pickElementOnCurrentPage,
        pickForConfig: pickForConfig,
        stableSelector: stableSelector,
        diagnose: function () {
            const cfg = normalizeConfig(currentConfig || DEFAULTS);
            const source = cfg.sourceSelector ? document.querySelector(cfg.sourceSelector) : null;
            const destination = cfg.destinationSelector ? document.querySelector(cfg.destinationSelector) : null;
            const sourceText = source ? (source.innerText || source.textContent || '') : '';
            const matches = cfg.rules.filter(function (rule) {
                return rule && rule.enabled !== false && rule.searchText && matchesText(sourceText, rule.searchText, cfg);
            }).map(function (rule) {
                return { id: rule.id, label: rule.label, searchText: rule.searchText };
            });
            return {
                page: window.location.pathname,
                expectedPage: cfg.pagePath,
                enabled: cfg.enabled,
                sourceSelector: cfg.sourceSelector,
                sourceFound: Boolean(source),
                destinationSelector: cfg.destinationSelector,
                destinationFound: Boolean(destination),
                matches: matches
            };
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();

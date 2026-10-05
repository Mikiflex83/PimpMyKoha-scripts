/*
 Nom du fichier : 135-guides-training-pmk-loader.js
 Version : 1.1.1-preplugin
 Date : 2026-09-22

 Module PimpMyKoha : Guides & formation
 PMK id : guides-training

 Rôle :
 - rend le dispositif de guides totalement autonome de 066-067 ;
 - enregistre « Guides & formation » dans PimpMyKoha ;
 - charge séquentiellement les runtimes historiques de guides ;
 - expose une API stable à IntranetNav 134 ;
 - permet de lancer directement le guide de l'écran courant, le catalogue
   des parcours et le mode accompagnement ;
 - masque le lanceur de secours généré par le core pour éviter les doublons ;
 - ne modifie pas les guides métier existants.
*/
(function (window, document) {
    'use strict';

    if (window.__PMK135_GUIDES_TRAINING_LOADER__) return;
    window.__PMK135_GUIDES_TRAINING_LOADER__ = true;

    const MODULE_ID = 'guides-training';
    const VERSION = '1.1.1-preplugin';
    const SCRIPT_ID_PREFIX = 'pmk-135-guide-runtime-';
    const STYLE_ID = 'pmk-135-guides-training-style';
    const DISABLED_CLASS = 'pmk-guides-training-disabled';
    const MANAGED_CLASS = 'pmk-guides-training-managed';
    const ASSIST_KEY = 'kohaGuideAssistEnabled';

    const GUIDE_FILES = [
        '000-guides-core.js',
        '000b-guide-bibliotheconomie.js',
        '001-guide-search.js',
        '002-guide-detail.js',
        '003-guide-guided-reports.js',
        '004-guide-home.js',
        '005-guide-circulation-home.js',
        '006-guide-stage-marc-import.js',
        '007-guide-extended.js',
        '000c-guide-parcours.js',
        '000d-guide-accompagnement.js'
    ];

    const DEFAULTS = {
        enabled: true,
        currentGuideEnabled: true,
        catalogueEnabled: true,
        assistFeatureEnabled: true,
        assistDefault: false
    };

    let currentConfig = Object.assign({}, DEFAULTS);
    let loadingPromise = null;
    let registered = false;
    let unsubscribe = null;
    let lastError = null;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function currentScriptElement() {
        if (document.currentScript && /135-guides-training-pmk-loader\.js/i.test(document.currentScript.src || '')) {
            return document.currentScript;
        }
        return Array.from(document.scripts || []).reverse().find(function (script) {
            return /135-guides-training-pmk-loader\.js/i.test(script.src || '');
        }) || null;
    }

    function resolveRuntimeBase() {
        const script = currentScriptElement();
        if (script && script.src) {
            try {
                const url = new URL(script.src, window.location.href);
                url.pathname = url.pathname.replace(/135-guides-training-pmk-loader\.js$/i, 'guides/');
                url.search = '';
                url.hash = '';
                return url.href;
            } catch (_) {}
        }
        return '/public/koha-scripts/guides/';
    }

    function cacheSuffix() {
        const script = currentScriptElement();
        if (!script || !script.src) return '';
        try {
            const url = new URL(script.src, window.location.href);
            const v = url.searchParams.get('v');
            if (v) return '?v=' + encodeURIComponent(v);
            const rel = url.searchParams.get('rel');
            if (rel) return '?rel=' + encodeURIComponent(rel);
        } catch (_) {}
        return '';
    }

    const RUNTIME_BASE = resolveRuntimeBase();
    const CACHE_SUFFIX = cacheSuffix();

    function guideUrl(file) {
        return RUNTIME_BASE + file + CACHE_SUFFIX;
    }


    /*
     * Compatibilité avec les guides historiques Dracénie.
     *
     * Les guides 000b / 001..007 utilisent l'ancien contrat KOHA_GUIDES :
     *   - register(function(ctx){ return [steps...]; })
     *   - registerFirst(function(ctx){ return [steps...]; })
     *   - stepAny(...)
     *   - compactSteps(...)
     *   - firstVisible(...)
     *
     * Le core v2.0.4 ne fournit plus directement ce contrat. Sans cette
     * couche, les fonctions sont enregistrées comme des définitions vides :
     * currentGuide() trouve bien "quelque chose", mais aucune étape ne peut
     * être lancée.
     *
     * On rétablit ici ce contrat sans modifier les fichiers guides métier.
     * Tous les fournisseurs historiques sont agrégés dans UNE définition
     * dynamique compatible avec le core v2.
     */
    function installLegacyGuideCompatibility() {
        const k = window.KOHA_GUIDES;
        if (!k || k.__pmkLegacyProvidersCompatV1) return !!k;
        k.__pmkLegacyProvidersCompatV1 = true;

        const coreVisible = k.helpers && typeof k.helpers.visible === 'function'
            ? k.helpers.visible
            : function (el) {
                if (!el || !(el instanceof Element)) return false;
                const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
                if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
                    return false;
                }
                return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
            };

        function selectorsList(selectors) {
            if (Array.isArray(selectors)) return selectors;
            if (selectors == null) return [];
            return [selectors];
        }

        function firstVisible(selectors) {
            for (const candidate of selectorsList(selectors)) {
                if (!candidate) continue;

                if (candidate instanceof Element) {
                    if (coreVisible(candidate)) return candidate;
                    continue;
                }

                if (typeof candidate === 'function') {
                    try {
                        const el = candidate();
                        if (el && coreVisible(el)) return el;
                    } catch (_) {}
                    continue;
                }

                if (typeof candidate === 'string') {
                    let nodes = [];
                    try { nodes = Array.from(document.querySelectorAll(candidate)); } catch (_) {}
                    const visibleNode = nodes.find(coreVisible);
                    if (visibleNode) return visibleNode;
                }
            }
            return null;
        }

        function compactSteps(steps) {
            return (Array.isArray(steps) ? steps : []).filter(Boolean);
        }

        function stepElement(target, title, intro, position) {
            if (!target) return null;
            return {
                element: target,
                title: title || '',
                intro: intro || '',
                position: position || 'bottom'
            };
        }

        function stepAny(selectors, title, intro, position, note, warning) {
            const target = firstVisible(selectors);
            if (!target) return null;

            let body = String(intro == null ? '' : intro);

            if (note) {
                body += '<div class="kg-success"><strong>À retenir :</strong> ' +
                    String(note) +
                    '</div>';
            }

            if (warning) {
                body += '<div class="kg-danger"><strong>Attention :</strong> ' +
                    String(warning) +
                    '</div>';
            }

            return stepElement(target, title, body, position);
        }

        if (typeof k.firstVisible !== 'function') k.firstVisible = firstVisible;
        if (typeof k.compactSteps !== 'function') k.compactSteps = compactSteps;
        if (typeof k.stepElement !== 'function') k.stepElement = stepElement;
        if (typeof k.stepAny !== 'function') k.stepAny = stepAny;

        const originalRegister = typeof k.register === 'function'
            ? k.register.bind(k)
            : null;

        if (!originalRegister) return false;

        const providersFirst = [];
        const providersNormal = [];
        let syntheticDefinition = null;

        function context() {
            if (k.helpers && typeof k.helpers.buildContext === 'function') {
                try { return k.helpers.buildContext(); } catch (_) {}
            }
            return {
                api: k,
                path: window.location.pathname,
                search: window.location.search,
                url: window.location.href,
                bodyId: document.body ? document.body.id : '',
                qs: function (selector, root) {
                    try { return (root || document).querySelector(selector); } catch (_) { return null; }
                },
                qsa: function (selector, root) {
                    try { return Array.from((root || document).querySelectorAll(selector)); } catch (_) { return []; }
                },
                visible: coreVisible
            };
        }

        function safeProviderSteps(provider, ctx) {
            try {
                const result = provider(ctx || context());
                return compactSteps(result);
            } catch (error) {
                console.error('[PMK 135] Fournisseur de guide en erreur :', error);
                return [];
            }
        }

        function aggregateSteps(ctx) {
            const c = ctx || context();
            let steps = [];

            providersFirst.forEach(function (provider) {
                steps = steps.concat(safeProviderSteps(provider, c));
            });

            providersNormal.forEach(function (provider) {
                steps = steps.concat(safeProviderSteps(provider, c));
            });

            return compactSteps(steps);
        }

        function aggregateMatches(ctx) {
            return aggregateSteps(ctx).length > 0;
        }

        function ensureSyntheticDefinition() {
            if (syntheticDefinition) return syntheticDefinition;

            syntheticDefinition = originalRegister({
                id: 'pmk-dracenie-guides-legacy',
                title: 'Guide interactif',
                priority: 10,
                match: aggregateMatches,
                steps: aggregateSteps
            });

            return syntheticDefinition;
        }

        function registerProvider(provider, first) {
            const list = first ? providersFirst : providersNormal;
            if (!list.includes(provider)) list.push(provider);
            ensureSyntheticDefinition();
            return syntheticDefinition;
        }

        function compatibleRegister(arg1, arg2) {
            /*
             * Ancien format :
             * KOHA_GUIDES.register(function(ctx){ return steps; })
             */
            if (typeof arg1 === 'function' && typeof arg2 === 'undefined') {
                return registerProvider(arg1, false);
            }

            /*
             * Formats natifs du core v2 : inchangés.
             */
            return originalRegister(arg1, arg2);
        }

        k.register = compatibleRegister;
        k.registerGuide = compatibleRegister;
        k.addGuide = compatibleRegister;

        k.registerFirst = function (provider) {
            if (typeof provider !== 'function') return null;
            return registerProvider(provider, true);
        };

        /*
         * Utile pour 000c et pour le diagnostic console.
         */
        k.__pmkLegacyProviders = {
            first: providersFirst,
            normal: providersNormal,
            aggregateSteps: aggregateSteps
        };

        return true;
    }

    function runtimeCoreReady() {
        return !!(window.KOHA_GUIDES && typeof window.KOHA_GUIDES.start === 'function');
    }

    function catalogueReady() {
        return !!(window.KOHA_GUIDES && typeof window.KOHA_GUIDES.openCatalogue === 'function');
    }

    function assistReady() {
        return !!(
            window.KOHA_GUIDES &&
            window.KOHA_GUIDES.assist &&
            typeof window.KOHA_GUIDES.assist.enabled === 'function' &&
            typeof window.KOHA_GUIDES.assist.setEnabled === 'function'
        );
    }

    function currentGuide() {
        if (!runtimeCoreReady() || typeof window.KOHA_GUIDES.currentGuide !== 'function') return null;
        try { return window.KOHA_GUIDES.currentGuide() || null; } catch (_) { return null; }
    }

    function assistEnabled() {
        if (assistReady()) {
            try { return !!window.KOHA_GUIDES.assist.enabled(); } catch (_) {}
        }
        try { return window.localStorage.getItem(ASSIST_KEY) === '1'; } catch (_) { return false; }
    }

    function canStartCurrent() {
        return currentConfig.enabled !== false &&
            currentConfig.currentGuideEnabled !== false &&
            !!currentGuide();
    }

    function canOpenCatalogue() {
        return currentConfig.enabled !== false &&
            currentConfig.catalogueEnabled !== false &&
            catalogueReady();
    }

    function canUseAssist() {
        return currentConfig.enabled !== false &&
            currentConfig.assistFeatureEnabled !== false &&
            assistReady();
    }

    function dispatchState(extra) {
        const detail = Object.assign({
            moduleId: MODULE_ID,
            version: VERSION,
            enabled: currentConfig.enabled !== false,
            loaded: runtimeCoreReady(),
            currentGuideAvailable: canStartCurrent(),
            currentGuideId: currentGuide() && currentGuide().id ? String(currentGuide().id) : '',
            catalogueAvailable: canOpenCatalogue(),
            assistAvailable: canUseAssist(),
            assistEnabled: assistEnabled(),
            error: lastError ? String(lastError.message || lastError) : ''
        }, extra || {});

        try {
            window.dispatchEvent(new CustomEvent('pmk:guides-training-state', { detail: detail }));
        } catch (_) {}
    }

    function notify(message, kind) {
        let box = document.getElementById('pmk-guides-training-notice');
        if (box) box.remove();
        box = document.createElement('div');
        box.id = 'pmk-guides-training-notice';
        box.className = 'alert ' + (kind === 'error' ? 'alert-danger' : 'alert-info');
        box.setAttribute('role', 'status');
        box.textContent = String(message || '');
        box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483001;max-width:min(430px,calc(100vw - 32px));box-shadow:0 .25rem 1rem rgba(0,0,0,.18);margin:0;';
        document.body.appendChild(box);
        window.setTimeout(function () {
            if (box && box.isConnected) box.remove();
        }, 4500);
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            html.${MANAGED_CLASS} .koha-guide-launcher {
                display: none !important;
            }
            html.${DISABLED_CLASS} #bottomActionBar #tutoriel,
            html.${DISABLED_CLASS} .koha-guide-launcher,
            html.${DISABLED_CLASS} [data-koha-guide-launcher] {
                display: none !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function removeCoreFallbackLauncher() {
        document.querySelectorAll('.koha-guide-launcher[data-koha-guide-launcher], .koha-guide-launcher').forEach(function (node) {
            if (node && node.id !== 'tutoriel') node.remove();
        });
    }

    function setDisabledMask(disabled) {
        document.documentElement.classList.add(MANAGED_CLASS);
        document.documentElement.classList.toggle(DISABLED_CLASS, !!disabled);
        if (disabled) removeCoreFallbackLauncher();
    }

    function scriptAlreadyPresent(file) {
        const wanted = '/' + file.replace(/^\/+/, '');
        return Array.from(document.scripts || []).some(function (script) {
            try {
                const url = new URL(script.src || '', window.location.href);
                return url.pathname.endsWith('/guides' + wanted) || url.pathname.endsWith(wanted);
            } catch (_) {
                return String(script.src || '').includes('/guides/' + file);
            }
        });
    }

    function loadOne(file, index) {
        if (scriptAlreadyPresent(file)) return Promise.resolve();

        return new Promise(function (resolve, reject) {
            const script = document.createElement('script');
            script.id = SCRIPT_ID_PREFIX + String(index).padStart(2, '0');
            script.src = guideUrl(file);
            script.async = false;
            script.dataset.pmkGuidesRuntime = file;
            script.onload = function () { resolve(); };
            script.onerror = function () {
                try { script.remove(); } catch (_) {}
                reject(new Error('Impossible de charger guides/' + file));
            };
            (document.head || document.documentElement).appendChild(script);
        });
    }

    function initialiseAssistDefault() {
        try {
            if (window.localStorage.getItem(ASSIST_KEY) === null) {
                window.localStorage.setItem(ASSIST_KEY, currentConfig.assistDefault === true ? '1' : '0');
            }
        } catch (_) {}
    }

    function loadRuntime() {
        if (loadingPromise) return loadingPromise;
        if (currentConfig.enabled === false) return Promise.resolve(false);

        initialiseAssistDefault();
        lastError = null;

        /*
         * Le core doit être chargé seul en premier. On installe ensuite la
         * compatibilité historique AVANT 000b / 001..007.
         */
        loadingPromise = loadOne(GUIDE_FILES[0], 0)
            .then(function () {
                if (!runtimeCoreReady()) {
                    throw new Error('Le noyau KOHA_GUIDES ne s’est pas initialisé.');
                }
                installLegacyGuideCompatibility();
                return GUIDE_FILES.slice(1).reduce(function (promise, file, offset) {
                    return promise.then(function () {
                        return loadOne(file, offset + 1);
                    });
                }, Promise.resolve());
            })
            .then(function () {
                removeCoreFallbackLauncher();
                if (currentConfig.assistFeatureEnabled === false && assistReady()) {
                    try { window.KOHA_GUIDES.assist.setEnabled(false); } catch (_) {}
                }
                dispatchState({ reason: 'runtime-loaded' });
                return runtimeCoreReady();
            })
            .catch(function (error) {
                lastError = error;
                console.error('[PMK 135] Guides & formation :', error);
                dispatchState({ reason: 'runtime-error' });
                loadingPromise = null;
                return false;
            });

        return loadingPromise;
    }

    function ensureLoaded() {
        if (runtimeCoreReady() && catalogueReady() && assistReady()) {
            return Promise.resolve(true);
        }
        return loadRuntime();
    }

    async function startCurrentGuide() {
        if (currentConfig.enabled === false || currentConfig.currentGuideEnabled === false) return false;
        await ensureLoaded();
        const guide = currentGuide();
        if (!guide) {
            notify('Aucun guide interactif n’est disponible pour cet écran.', 'info');
            dispatchState({ reason: 'no-current-guide' });
            return false;
        }
        try {
            const result = await Promise.resolve(
                window.KOHA_GUIDES.start(guide.id || undefined)
            );

            if (result === false) {
                notify('Le guide de cet écran ne contient actuellement aucune étape visible.', 'info');
                dispatchState({ reason: 'current-guide-empty' });
                return false;
            }

            dispatchState({ reason: 'current-guide-started' });
            return true;
        } catch (error) {
            lastError = error;
            console.error('[PMK 135] Démarrage du guide impossible :', error);
            notify('Impossible de démarrer le guide interactif sur cet écran.', 'error');
            dispatchState({ reason: 'current-guide-error' });
            return false;
        }
    }

    async function openCatalogue() {
        if (currentConfig.enabled === false || currentConfig.catalogueEnabled === false) return false;
        await ensureLoaded();
        if (!catalogueReady()) {
            notify('Le catalogue des parcours de formation n’est pas disponible.', 'error');
            return false;
        }
        try {
            window.KOHA_GUIDES.openCatalogue();
            dispatchState({ reason: 'catalogue-opened' });
            return true;
        } catch (error) {
            lastError = error;
            console.error('[PMK 135] Ouverture du catalogue impossible :', error);
            notify('Impossible d’ouvrir les parcours de formation.', 'error');
            dispatchState({ reason: 'catalogue-error' });
            return false;
        }
    }

    async function setAssistEnabled(value) {
        if (currentConfig.enabled === false || currentConfig.assistFeatureEnabled === false) return false;
        await ensureLoaded();
        if (!assistReady()) return false;
        try {
            window.KOHA_GUIDES.assist.setEnabled(!!value);
            if (typeof window.KOHA_GUIDES.assist.refresh === 'function') {
                window.KOHA_GUIDES.assist.refresh();
            }
            dispatchState({ reason: 'assist-changed', assistEnabled: !!value });
            return true;
        } catch (error) {
            lastError = error;
            console.error('[PMK 135] Mode accompagnement :', error);
            dispatchState({ reason: 'assist-error' });
            return false;
        }
    }

    async function toggleAssist() {
        return setAssistEnabled(!assistEnabled());
    }

    async function openHub() {
        /* Point d'entrée générique : le catalogue présente déjà le sommaire,
           les niveaux et le mode accompagnement. */
        return openCatalogue();
    }

    function stopWhenDisabled() {
        if (runtimeCoreReady()) {
            try {
                if (typeof window.KOHA_GUIDES.stopPractice === 'function') {
                    window.KOHA_GUIDES.stopPractice(true);
                }
            } catch (_) {}
        }
        if (assistReady()) {
            try { window.KOHA_GUIDES.assist.setEnabled(false); } catch (_) {}
        }
        removeCoreFallbackLauncher();
    }

    function applyConfig(config) {
        currentConfig = Object.assign({}, DEFAULTS, config || {});
        const disabled = currentConfig.enabled === false;
        setDisabledMask(disabled);

        if (disabled) {
            stopWhenDisabled();
            dispatchState({ reason: 'disabled' });
            return;
        }

        if (currentConfig.assistFeatureEnabled === false && assistReady()) {
            try { window.KOHA_GUIDES.assist.setEnabled(false); } catch (_) {}
        }

        loadRuntime().then(function () {
            dispatchState({ reason: 'config' });
        });
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 1,
            name: {
                fr: 'Guides & formation',
                en: 'Guides & training'
            },
            description: {
                fr: 'Pilote les guides interactifs Koha, les parcours de formation et le mode accompagnement. Le module est autonome du gestionnaire de listes et peut être exposé directement dans Menu IntranetNav.',
                en: 'Controls Koha interactive guides, training paths and contextual assistance. This module is independent from the lists manager and can be exposed directly in IntranetNav Menu.'
            },
            category: {
                fr: 'Aide et formation',
                en: 'Help and training'
            },
            defaults: clone(DEFAULTS),
            schema: [
                {
                    key: 'currentGuideEnabled',
                    type: 'boolean',
                    label: { fr: 'Autoriser le guide de l’écran courant', en: 'Enable current-screen guide' },
                    help: { fr: 'Permet de lancer le guide correspondant automatiquement à la page Koha affichée.', en: 'Allows launching the guide matching the current Koha page.' }
                },
                {
                    key: 'catalogueEnabled',
                    type: 'boolean',
                    label: { fr: 'Autoriser les parcours de formation', en: 'Enable training catalogue' },
                    help: { fr: 'Donne accès au sommaire complet des parcours et niveaux de formation.', en: 'Provides access to the complete catalogue of training paths and levels.' }
                },
                {
                    key: 'assistFeatureEnabled',
                    type: 'boolean',
                    label: { fr: 'Autoriser le mode accompagnement', en: 'Enable contextual assistance mode' },
                    help: { fr: 'Permet d’afficher des points d’aide contextuelle sur les écrans Koha.', en: 'Allows contextual help points to be displayed on Koha screens.' }
                },
                {
                    key: 'assistDefault',
                    type: 'boolean',
                    label: { fr: 'Mode accompagnement actif par défaut au premier usage', en: 'Contextual assistance enabled by default on first use' },
                    help: { fr: 'Désactivé par défaut. Ce réglage initialise uniquement les postes qui n’ont encore aucun choix enregistré.', en: 'Disabled by default. This only initializes browsers that do not yet have a saved choice.' }
                }
            ]
        };
    }

    function registerWithPMK() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== 'function' || registered) return false;
        registered = true;

        try { window.PMKConfig.registerModule(moduleDefinition()); } catch (error) {
            console.error('[PMK 135] Enregistrement PMK impossible :', error);
        }

        if (typeof window.PMKConfig.getConfig === 'function') {
            Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
                .then(applyConfig)
                .catch(function () { applyConfig(clone(DEFAULTS)); });
        } else {
            applyConfig(clone(DEFAULTS));
        }

        if (typeof window.PMKConfig.subscribe === 'function') {
            try { unsubscribe = window.PMKConfig.subscribe(MODULE_ID, applyConfig); } catch (_) {}
        }
        return true;
    }

    window.PMKGuidesTraining = {
        moduleId: MODULE_ID,
        version: VERSION,
        guideFiles: GUIDE_FILES.slice(),
        get enabled() { return currentConfig.enabled !== false; },
        get loaded() { return runtimeCoreReady(); },
        get assistEnabled() { return assistEnabled(); },
        ensureLoaded: ensureLoaded,
        load: loadRuntime,
        open: openHub,
        startCurrent: startCurrentGuide,
        openCatalogue: openCatalogue,
        toggleAssist: toggleAssist,
        setAssistEnabled: setAssistEnabled,
        canStartCurrent: canStartCurrent,
        canOpenCatalogue: canOpenCatalogue,
        canUseAssist: canUseAssist,
        currentGuide: currentGuide,
        refreshState: function () { dispatchState({ reason: 'manual-refresh' }); },
        diagnostics: function () {
            const k = window.KOHA_GUIDES;
            let steps = [];
            try {
                if (k && k.__pmkLegacyProviders && typeof k.__pmkLegacyProviders.aggregateSteps === 'function') {
                    steps = k.__pmkLegacyProviders.aggregateSteps();
                }
            } catch (_) {}
            return {
                moduleVersion: VERSION,
                enabled: currentConfig.enabled !== false,
                coreReady: runtimeCoreReady(),
                registryCount: k && Array.isArray(k.registry) ? k.registry.length : 0,
                legacyFirstProviders: k && k.__pmkLegacyProviders ? k.__pmkLegacyProviders.first.length : 0,
                legacyNormalProviders: k && k.__pmkLegacyProviders ? k.__pmkLegacyProviders.normal.length : 0,
                currentGuide: currentGuide() && currentGuide().id ? currentGuide().id : null,
                currentSteps: Array.isArray(steps) ? steps.length : 0,
                catalogueReady: catalogueReady(),
                assistReady: assistReady(),
                lastError: lastError ? String(lastError.message || lastError) : ''
            };
        }
    };

    function bootstrap() {
        injectStyles();
        document.documentElement.classList.add(MANAGED_CLASS);

        if (registerWithPMK()) return;

        window.addEventListener('pmk:config-ready', registerWithPMK, { once: true });

        let tries = 0;
        const timer = window.setInterval(function () {
            tries += 1;
            if (registerWithPMK() || tries >= 100) {
                window.clearInterval(timer);
                if (!registered) applyConfig(clone(DEFAULTS));
            }
        }, 50);
    }

    document.addEventListener('koha-guides-assist-toggle', function () {
        dispatchState({ reason: 'assist-event' });
    });

    window.addEventListener('storage', function (event) {
        if (event.key === ASSIST_KEY) dispatchState({ reason: 'assist-storage' });
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
    } else {
        bootstrap();
    }

    window.addEventListener('beforeunload', function () {
        if (typeof unsubscribe === 'function') {
            try { unsubscribe(); } catch (_) {}
        }
    }, { once: true });
})(window, document);

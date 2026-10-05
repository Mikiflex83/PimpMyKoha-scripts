/*
 Nom du fichier : 075-advanced-search-pmk-loader.js
 Version : 1.0.0
 Date : 2026-09-19

 Rôle :
 - NE MODIFIE PAS le module autonome 075-advanced-search-sidebar.js ;
 - enregistre dans PimpMyKoha un interrupteur Activer / Désactiver ;
 - charge le script 075 uniquement lorsque le module PMK est actif ;
 - masque/ferme immédiatement son interface lorsque le module est désactivé ;
 - bloque ALT+clic et l'événement koha:toggleAdvancedSearch quand le module est désactivé ;
 - expose une passerelle stable pour 134-intranetnav-menu.js.

 Important :
 - ce loader remplace le chargement direct de 075-advanced-search-sidebar.js
   dans IntranetUserJS ;
 - 075-advanced-search-sidebar.js reste inchangé.
*/
(function () {
    'use strict';

    if (window.__PMK_ADVANCED_SEARCH_LOADER__) return;
    window.__PMK_ADVANCED_SEARCH_LOADER__ = true;

    const MODULE_ID = 'advanced-search-sidebar';
    const RUNTIME_SCRIPT_ID = 'pmk-advanced-search-runtime-script';
    const DISABLED_STYLE_ID = 'pmk-advanced-search-disabled-style';
    const DISABLED_CLASS = 'pmk-advanced-search-disabled';
    const SCRIPT_URL = '/public/koha-scripts/075-advanced-search-sidebar.js';

    let currentConfig = { enabled: true };
    let configRegistered = false;
    let loadingPromise = null;
    let unsubscribe = null;

    function isLoaded() {
        return !!window.__kohaAdvancedSearchSidebarV2 ||
            typeof window.openAdvancedSearchSidebar === 'function' ||
            typeof window.toggleAdvancedSearchSidebar === 'function';
    }

    function isAvailable() {
        return currentConfig.enabled !== false;
    }

    function dispatchState(extra) {
        try {
            window.dispatchEvent(new CustomEvent('pmk:advanced-search-state', {
                detail: Object.assign({
                    moduleId: MODULE_ID,
                    enabled: isAvailable(),
                    loaded: isLoaded(),
                    available: isAvailable()
                }, extra || {})
            }));
        } catch (_) {}
    }

    function installDisabledMask() {
        if (document.getElementById(DISABLED_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = DISABLED_STYLE_ID;
        style.textContent = `
            html.${DISABLED_CLASS} #kohaAdvancedSearchSidebar,
            html.${DISABLED_CLASS} #kohaAdvancedSearchToast,
            html.${DISABLED_CLASS} #bottomActionBar #advancedSearch {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    function closeRuntimePanel() {
        try {
            if (typeof window.closeAdvancedSearchSidebar === 'function') {
                window.closeAdvancedSearchSidebar();
                return;
            }
            const panel = document.getElementById('kohaAdvancedSearchSidebar');
            if (panel) panel.classList.remove('open');
        } catch (_) {}
    }

    function setDisabledMask(disabled) {
        installDisabledMask();
        document.documentElement.classList.toggle(DISABLED_CLASS, !!disabled);
        if (disabled) closeRuntimePanel();
    }

    /*
     * Le 075 historique installe un ALT+clic global et écoute
     * koha:toggleAdvancedSearch. Comme on ne touche pas à son code, le loader
     * neutralise uniquement ces deux points d'entrée lorsque PMK le désactive.
     */
    document.addEventListener('click', function (event) {
        if (currentConfig.enabled !== false || !event.altKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);

    document.addEventListener('koha:toggleAdvancedSearch', function (event) {
        if (currentConfig.enabled !== false) return;
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (event && typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    }, true);

    function existingRuntimeScript() {
        return document.getElementById(RUNTIME_SCRIPT_ID) ||
            Array.from(document.scripts || []).find(function (script) {
                return /(?:^|\/)075-advanced-search-sidebar\.js(?:\?|$)/.test(String(script.src || ''));
            }) || null;
    }

    function waitForRuntime(timeout) {
        const limit = Number(timeout) > 0 ? Number(timeout) : 5000;
        return new Promise(function (resolve) {
            if (isLoaded()) return resolve(true);
            const started = Date.now();
            const timer = window.setInterval(function () {
                if (isLoaded()) {
                    window.clearInterval(timer);
                    resolve(true);
                    return;
                }
                if (Date.now() - started >= limit) {
                    window.clearInterval(timer);
                    resolve(false);
                }
            }, 50);
        });
    }

    function loadHistoricalModule() {
        if (currentConfig.enabled === false) {
            setDisabledMask(true);
            dispatchState({ reason: 'disabled' });
            return Promise.resolve(false);
        }

        setDisabledMask(false);

        if (isLoaded()) {
            dispatchState({ reason: 'already-loaded' });
            return Promise.resolve(true);
        }

        if (loadingPromise) return loadingPromise;

        const existing = existingRuntimeScript();
        if (existing && existing.id !== RUNTIME_SCRIPT_ID) {
            loadingPromise = waitForRuntime(5000).then(function (loaded) {
                loadingPromise = null;
                dispatchState({ reason: loaded ? 'legacy-direct-load' : 'legacy-load-timeout' });
                return loaded;
            });
            return loadingPromise;
        }

        loadingPromise = new Promise(function (resolve) {
            const script = existing || document.createElement('script');
            script.id = RUNTIME_SCRIPT_ID;
            script.src = SCRIPT_URL;
            script.async = true;
            script.dataset.pmkControlled = '1';

            script.addEventListener('load', function () {
                waitForRuntime(3000).then(function (loaded) {
                    loadingPromise = null;
                    setDisabledMask(currentConfig.enabled === false);
                    dispatchState({ reason: loaded ? 'loaded' : 'runtime-not-ready' });
                    resolve(loaded);
                });
            }, { once: true });

            script.addEventListener('error', function () {
                loadingPromise = null;
                dispatchState({ reason: 'load-error' });
                resolve(false);
            }, { once: true });

            if (!script.isConnected) document.head.appendChild(script);
        });

        return loadingPromise;
    }

    async function openAdvancedSearch() {
        if (currentConfig.enabled === false) return false;
        const loaded = await loadHistoricalModule();
        if (!loaded) return false;

        if (typeof window.openAdvancedSearchSidebar === 'function') {
            window.openAdvancedSearchSidebar();
            return true;
        }
        if (typeof window.toggleAdvancedSearchSidebar === 'function') {
            window.toggleAdvancedSearchSidebar();
            return true;
        }
        try {
            document.dispatchEvent(new CustomEvent('koha:toggleAdvancedSearch'));
            return true;
        } catch (_) {
            return false;
        }
    }

    async function toggleAdvancedSearch() {
        if (currentConfig.enabled === false) return false;
        const loaded = await loadHistoricalModule();
        if (!loaded) return false;

        if (typeof window.toggleAdvancedSearchSidebar === 'function') {
            window.toggleAdvancedSearchSidebar();
            return true;
        }
        return openAdvancedSearch();
    }

    function applyConfig(config) {
        currentConfig = Object.assign({ enabled: true }, config || {});
        const disabled = currentConfig.enabled === false;
        setDisabledMask(disabled);

        if (!disabled) loadHistoricalModule();
        dispatchState({ reason: 'config' });
    }

    function registerWithPMK() {
        if (!window.PMKConfig || configRegistered) return false;
        configRegistered = true;

        window.PMKConfig.registerModule({
            id: MODULE_ID,
            schemaVersion: 1,
            name: {
                fr: 'Recherche avancée',
                en: 'Advanced search'
            },
            description: {
                fr: 'Active ou désactive le module autonome de recherche avancée sans modifier son fonctionnement interne. L’accès peut être placé dans le Menu IntranetNav.',
                en: 'Enables or disables the standalone advanced-search module without changing its internal behavior. Its entry point can be placed in the IntranetNav menu.'
            },
            category: {
                fr: 'Catalogue / recherche',
                en: 'Catalogue / search'
            },
            defaults: {
                enabled: true
            },
            schema: []
        });

        window.PMKConfig.getConfig(MODULE_ID)
            .then(applyConfig)
            .catch(function () {
                applyConfig({ enabled: true });
            });

        if (typeof window.PMKConfig.subscribe === 'function') {
            unsubscribe = window.PMKConfig.subscribe(MODULE_ID, applyConfig);
        }

        return true;
    }

    window.PMKAdvancedSearch = {
        moduleId: MODULE_ID,
        scriptUrl: SCRIPT_URL,
        get enabled() {
            return currentConfig.enabled !== false;
        },
        get loaded() {
            return isLoaded();
        },
        ensureLoaded: loadHistoricalModule,
        open: openAdvancedSearch,
        toggle: toggleAdvancedSearch,
        close: closeRuntimePanel,
        refreshState: function () {
            dispatchState({ reason: 'manual-refresh' });
        }
    };

    function bootstrap() {
        installDisabledMask();

        if (registerWithPMK()) return;

        window.addEventListener('pmk:config-ready', registerWithPMK, { once: true });

        let tries = 0;
        const timer = window.setInterval(function () {
            tries += 1;
            if (registerWithPMK() || tries >= 100) {
                window.clearInterval(timer);
                if (!configRegistered) {
                    /* PMK absent : comportement historique conservé par défaut. */
                    currentConfig = { enabled: true };
                    setDisabledMask(false);
                    loadHistoricalModule();
                }
            }
        }, 50);
    }

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
})();

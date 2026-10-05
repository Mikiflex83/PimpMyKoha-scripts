/*
 Nom du fichier : 066-067-lists-manager-pmk-loader.js
 Version : 1.1.0
 Date : 2026-10-01

 Rôle :
 - pilote le chargement du module historique 066-067 ;
 - conserve l'activation/désactivation via PimpMyKoha ;
 - expose une passerelle stable PMKPersonalLists ;
 - relaie l'API runtime du gestionnaire pour les autres modules PMK,
   notamment 142 Bibliographies & publications.
*/
(function () {
    'use strict';

    if (window.__PMK_PERSONAL_LISTS_LOADER__) return;
    window.__PMK_PERSONAL_LISTS_LOADER__ = true;

    const MODULE_ID = 'personal-lists-manager';
    const RUNTIME_SCRIPT_ID = 'pmk-personal-lists-runtime-script';
    const DISABLED_STYLE_ID = 'pmk-personal-lists-disabled-style';
    const SCRIPT_URL = '/public/koha-scripts/066-067-lists-manager.js';

    let currentConfig = { enabled: true };
    let configRegistered = false;
    let loadingPromise = null;
    let unsubscribe = null;

    function runtime() {
        return window.PMKPersonalListsRuntime || null;
    }

    function dispatchState(extra) {
        try {
            window.dispatchEvent(new CustomEvent('pmk:personal-lists-state', {
                detail: Object.assign({
                    moduleId: MODULE_ID,
                    enabled: currentConfig.enabled !== false,
                    loaded: !!window.__KX_TEMP_LISTS_MANAGER__,
                    available: typeof window.toggleSidebar5 === 'function',
                    runtimeAvailable: !!runtime(),
                    runtimeVersion: runtime()?.version || ''
                }, extra || {})
            }));
        } catch (_) {}
    }

    function setDisabledMask(disabled) {
        let style = document.getElementById(DISABLED_STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = DISABLED_STYLE_ID;
            style.textContent = `
                html.pmk-personal-lists-disabled #kx-temp-lists-panel,
                html.pmk-personal-lists-disabled #bottomActionBar #sidebar5,
                html.pmk-personal-lists-disabled .kx-temp-list-toggle,
                html.pmk-personal-lists-disabled .kx-temp-list-menu,
                html.pmk-personal-lists-disabled .kx-temp-lists-menu,
                html.pmk-personal-lists-disabled [data-kx-temp-list-action] {
                    display: none !important;
                }
            `;
            document.head.appendChild(style);
        }

        document.documentElement.classList.toggle('pmk-personal-lists-disabled', !!disabled);

        if (disabled) {
            const panel = document.getElementById('kx-temp-lists-panel');
            if (panel) {
                panel.classList.remove('is-open');
                panel.setAttribute('aria-hidden', 'true');
            }
        }
    }

    function existingRuntimeScript() {
        return document.getElementById(RUNTIME_SCRIPT_ID) ||
            Array.from(document.scripts || []).find(function (script) {
                return /(?:^|\/)066-067-lists-manager\.js(?:\?|$)/.test(String(script.src || ''));
            }) || null;
    }

    function waitForRuntime(timeoutMs) {
        if (runtime()) return Promise.resolve(runtime());

        return new Promise(function (resolve) {
            const started = Date.now();
            let timer = null;

            function finish(value) {
                if (timer) clearInterval(timer);
                window.removeEventListener('pmk:personal-lists-runtime-ready', onReady);
                resolve(value || null);
            }

            function onReady() {
                finish(runtime());
            }

            window.addEventListener('pmk:personal-lists-runtime-ready', onReady);

            timer = setInterval(function () {
                if (runtime()) return finish(runtime());
                if (Date.now() - started >= (timeoutMs || 12000)) finish(null);
            }, 60);
        });
    }

    function loadHistoricalModule() {
        if (currentConfig.enabled === false) {
            setDisabledMask(true);
            dispatchState({ reason: 'disabled' });
            return Promise.resolve(false);
        }

        setDisabledMask(false);

        if (window.__KX_TEMP_LISTS_MANAGER__) {
            dispatchState({ reason: 'already-loaded' });
            return Promise.resolve(true);
        }

        if (loadingPromise) return loadingPromise;

        const existing = existingRuntimeScript();
        if (existing && existing.id !== RUNTIME_SCRIPT_ID) {
            loadingPromise = new Promise(function (resolve) {
                let attempts = 0;
                const timer = window.setInterval(function () {
                    attempts += 1;
                    if (window.__KX_TEMP_LISTS_MANAGER__ || attempts >= 100) {
                        window.clearInterval(timer);
                        loadingPromise = null;
                        dispatchState({
                            reason: window.__KX_TEMP_LISTS_MANAGER__ ? 'legacy-direct-load' : 'legacy-load-timeout'
                        });
                        resolve(!!window.__KX_TEMP_LISTS_MANAGER__);
                    }
                }, 50);
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
                loadingPromise = null;
                setDisabledMask(currentConfig.enabled === false);
                dispatchState({ reason: 'loaded' });
                resolve(true);
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

    async function ensureRuntime() {
        if (currentConfig.enabled === false) return null;
        const loaded = await loadHistoricalModule();
        if (!loaded) return null;
        return await waitForRuntime(12000);
    }

    async function openLists() {
        if (currentConfig.enabled === false) return false;
        const loaded = await loadHistoricalModule();
        if (!loaded) return false;

        if (typeof window.toggleSidebar5 === 'function') {
            window.toggleSidebar5();
            return true;
        }
        return false;
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
            name: { fr: 'Gestionnaire de listes personnelles', en: 'Personal lists manager' },
            description: {
                fr: 'Active ou désactive le gestionnaire de listes personnelles synchronisées. Fournit aussi une passerelle de données aux autres modules PimpMyKoha.',
                en: 'Enables or disables synchronized personal lists and exposes a data bridge to other PimpMyKoha modules.'
            },
            category: { fr: 'Outils', en: 'Tools' },
            defaults: { enabled: true },
            schema: []
        });

        window.PMKConfig.getConfig(MODULE_ID)
            .then(applyConfig)
            .catch(function () { applyConfig({ enabled: true }); });

        if (typeof window.PMKConfig.subscribe === 'function') {
            unsubscribe = window.PMKConfig.subscribe(MODULE_ID, applyConfig);
        }
        return true;
    }

    window.PMKPersonalLists = {
        moduleId: MODULE_ID,
        scriptUrl: SCRIPT_URL,

        get enabled() { return currentConfig.enabled !== false; },
        get loaded() { return !!window.__KX_TEMP_LISTS_MANAGER__; },
        get runtimeAvailable() { return !!runtime(); },

        ensureLoaded: loadHistoricalModule,
        ensureRuntime: ensureRuntime,
        open: openLists,

        async getState() {
            const api = await ensureRuntime();
            return api?.getState?.() || null;
        },

        async getCurrentUser() {
            const api = await ensureRuntime();
            return api?.getCurrentUser?.() || null;
        },

        async getLists(type) {
            const api = await ensureRuntime();
            return api?.getLists?.(type) || [];
        },

        async getList(listId) {
            const api = await ensureRuntime();
            return api?.getList?.(listId) || null;
        },

        async getEntries(listId) {
            const api = await ensureRuntime();
            return api?.getEntries?.(listId) || [];
        },

        async getActiveList(type) {
            const api = await ensureRuntime();
            return api?.getActiveList?.(type) || null;
        },

        async getActiveEntries(type) {
            const api = await ensureRuntime();
            return api?.getActiveEntries?.(type) || [];
        },

        async getFirestoreContext() {
            const api = await ensureRuntime();
            if (!api) return null;
            const modules = api.firestore?.getModules?.();
            return {
                db: api.firestore?.getDb?.() || null,
                auth: api.firestore?.getAuth?.() || null,
                user: api.firestore?.getUser?.() || null,
                firestoreMod: modules?.firestoreMod || null,
                authMod: modules?.authMod || null,
                appMod: modules?.appMod || null
            };
        },

        refreshState: function () {
            dispatchState({ reason: 'manual-refresh' });
        }
    };

    function bootstrap() {
        if (registerWithPMK()) return;

        window.addEventListener('pmk:config-ready', registerWithPMK, { once: true });

        let tries = 0;
        const timer = window.setInterval(function () {
            tries += 1;
            if (registerWithPMK() || tries >= 100) {
                window.clearInterval(timer);
                if (!configRegistered) {
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

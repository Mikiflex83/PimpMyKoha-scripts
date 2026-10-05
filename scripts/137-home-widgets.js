/* ============================================================
   PimpMyKoha 137 — Widgets & blocs d’accueil
   v1.0.2-preplugin — 24/09/2026

   Rôle :
   - module PMK unique pour les widgets de la page d'accueil ;
   - activation/désactivation individuelle ;
   - ordre par glisser-déposer dans PMK (deux zones séparées) ;
   - chargement des widgets depuis des fichiers JS distincts ;
   - aucun réglage métier des widgets n'est déplacé dans PMK.

   Fichiers enfants attendus :
   /137-widgets/137-widget-frequency-nedap.js
   /137-widgets/137-widget-doodle-koha.js
   /137-widgets/137-widget-circulation-abonnements.js
   /137-widgets/137-widget-planning-services.js
   /137-widgets/137-widget-liens-utiles.js
   ============================================================ */
(function (window, document) {
    'use strict';

    if (window.PMKHomeWidgets && window.PMKHomeWidgets.version) return;

    const MODULE_ID = 'home-widgets';
    const VERSION = '1.0.2-preplugin';
    const currentScript = document.currentScript;
    const selfUrl = currentScript && currentScript.src
        ? new URL(currentScript.src, window.location.href)
        : new URL('/public/koha-scripts/137-home-widgets.js', window.location.origin);
    const release = selfUrl.searchParams.get('v') || '20260924-pmk137-homewidgets-v102';

    const WIDGET_FILES = [
        './137-widgets/137-widget-frequency-nedap.js',
        './137-widgets/137-widget-doodle-koha.js',
        './137-widgets/137-widget-circulation-abonnements.js',
        './137-widgets/137-widget-planning-services.js',
        './137-widgets/137-widget-liens-utiles.js'
    ];

    const DEFAULT_CONFIG = {
        enabled: true,
        announcementsWidgets: [
            { id: 'frequency-nedap', labelFr: 'Fréquentation NEDAP', labelEn: 'NEDAP attendance', enabled: true },
            { id: 'doodle-koha', labelFr: 'Rendez-vous', labelEn: 'Appointments', enabled: true },
            { id: 'circulation-abonnements', labelFr: 'Circulation & abonnements', labelEn: 'Circulation & subscriptions', enabled: true },
            { id: 'liens-utiles', labelFr: 'Liens utiles', labelEn: 'Useful links', enabled: true }
        ],
        mainBlockWidgets: [
            { id: 'planning-services', labelFr: 'Planning des services', labelEn: 'Services schedule', enabled: true }
        ]
    };

    const registry = new Map();
    const mounted = new Set();
    const loadedScripts = new Map();
    let config = clone(DEFAULT_CONFIG);
    let configReady = false;
    let modulesRequested = false;
    let initialConfigSignature = '';

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function isHomePage() {
        return document.body?.id === 'main_intranet-main'
            || /(?:^|\/)mainpage\.pl$/i.test(window.location.pathname)
            || window.location.pathname === '/cgi-bin/koha/'
            || window.location.pathname === '/cgi-bin/koha';
    }

    function isSuperlibrarian() {
        try {
            if (window.PMKConfig && typeof window.PMKConfig.isKohaSuperlibrarian === 'function') {
                return !!window.PMKConfig.isKohaSuperlibrarian();
            }
        } catch (_) {}

        try {
            const user = document.querySelector('.loggedinusername[data-is-superlibrarian], .loggedinusername.is_superlibrarian');
            if (!user) return false;
            if (user.classList.contains('is_superlibrarian')) return true;
            const raw = String(user.getAttribute('data-is-superlibrarian') || '').trim().toLowerCase();
            return ['is_superlibrarian', 'superlibrarian', '1', 'true', 'yes'].includes(raw);
        } catch (_) {
            return false;
        }
    }

    function normalizeList(saved, defaults) {
        const byId = new Map((Array.isArray(saved) ? saved : []).filter(Boolean).map(item => [item.id, item]));
        const output = [];

        (Array.isArray(saved) ? saved : []).forEach(item => {
            const def = defaults.find(candidate => candidate.id === item?.id);
            if (!def) return;
            output.push(Object.assign({}, def, item, { id: def.id }));
        });

        defaults.forEach(def => {
            if (!output.some(item => item.id === def.id)) output.push(clone(def));
        });
        return output;
    }

    function normalizeConfig(raw) {
        raw = raw && typeof raw === 'object' ? raw : {};
        return {
            enabled: raw.enabled !== false,
            announcementsWidgets: normalizeList(raw.announcementsWidgets, DEFAULT_CONFIG.announcementsWidgets),
            mainBlockWidgets: normalizeList(raw.mainBlockWidgets, DEFAULT_CONFIG.mainBlockWidgets)
        };
    }

    function widgetSettings(id) {
        const all = [...config.announcementsWidgets, ...config.mainBlockWidgets];
        return all.find(item => item.id === id) || null;
    }

    function widgetTarget(id) {
        if (config.announcementsWidgets.some(item => item.id === id)) return 'announcements-column';
        if (config.mainBlockWidgets.some(item => item.id === id)) return 'intranet-main-userblock';
        return null;
    }

    function orderedIds(target) {
        const list = target === 'announcements-column' ? config.announcementsWidgets : config.mainBlockWidgets;
        return list.filter(item => item.enabled !== false).map(item => item.id);
    }

    function ensureAnnouncementsZone() {
        let zone = document.getElementById('pmk137-announcements-widgets');
        if (zone) return zone;

        const news = document.getElementById('area-news');
        const column = news?.closest('.col-md-3, .col-sm-3, [class*="col-"]')
            || document.querySelector('#container-main > .row > .col-md-3.order-sm-2')
            || document.querySelector('#container-main .col-md-3');
        if (!column) return null;

        zone = document.createElement('div');
        zone.id = 'pmk137-announcements-widgets';
        zone.className = 'pmk137-widget-zone pmk137-announcements-zone';

        if (news?.parentNode === column) news.insertAdjacentElement('afterend', zone);
        else column.prepend(zone);
        return zone;
    }

    function ensureMainBlockZone() {
        let zone = document.getElementById('pmk137-main-userblock-widgets');
        if (zone) return zone;

        const native = document.getElementById('IntranetmainUserblock');
        if (native) {
            zone = document.createElement('div');
            zone.id = 'pmk137-main-userblock-widgets';
            zone.className = 'pmk137-widget-zone pmk137-mainblock-zone';
            native.appendChild(zone);
            return zone;
        }

        const mainColumn = document.querySelector('#container-main .col-md-9.order-md-2')
            || document.querySelector('#container-main .col-md-9');
        if (!mainColumn) return null;

        const row = document.createElement('div');
        row.className = 'row pmk137-mainblock-row';
        const col = document.createElement('div');
        col.className = 'col-sm-12';
        const section = document.createElement('div');
        section.className = 'page-section pmk137-mainblock-section';
        zone = document.createElement('div');
        zone.id = 'pmk137-main-userblock-widgets';
        zone.className = 'pmk137-widget-zone pmk137-mainblock-zone';

        section.appendChild(zone);
        col.appendChild(section);
        row.appendChild(col);

        const versionRow = document.getElementById('koha_version')?.closest('.row');
        if (versionRow?.parentNode === mainColumn) mainColumn.insertBefore(row, versionRow);
        else mainColumn.appendChild(row);
        return zone;
    }

    function zoneFor(target) {
        if (target === 'announcements-column') return ensureAnnouncementsZone();
        if (target === 'intranet-main-userblock') return ensureMainBlockZone();
        return null;
    }

    function ensureSlot(id, target) {
        const zone = zoneFor(target);
        if (!zone) return null;

        let slot = zone.querySelector(`[data-pmk137-widget="${CSS.escape(id)}"]`);
        if (!slot) {
            slot = document.createElement('div');
            slot.className = 'pmk137-widget-slot';
            slot.dataset.pmk137Widget = id;
            zone.appendChild(slot);
        }
        return slot;
    }

    function sortZone(target) {
        const zone = zoneFor(target);
        if (!zone) return;
        orderedIds(target).forEach(id => {
            const slot = zone.querySelector(`[data-pmk137-widget="${CSS.escape(id)}"]`);
            if (slot) zone.appendChild(slot);
        });
    }

    async function mountWidget(id) {
        if (!isHomePage() || config.enabled === false) return;
        const settings = widgetSettings(id);
        if (!settings || settings.enabled === false || mounted.has(id)) return;

        const def = registry.get(id);
        if (!def || typeof def.mount !== 'function') return;
        const target = widgetTarget(id) || def.target;
        const slot = ensureSlot(id, target);
        if (!slot) return;

        try {
            await def.mount(slot, {
                moduleId: MODULE_ID,
                widgetId: id,
                target,
                labelFr: settings.labelFr || def.name || id,
                labelEn: settings.labelEn || settings.labelFr || def.name || id,
                isSuperlibrarian,
                loadScript
            });
            mounted.add(id);
            sortZone(target);
        } catch (error) {
            console.error(`PMK137 — erreur montage ${id}:`, error);
            slot.innerHTML = '<div class="alert alert-warning">Widget indisponible.</div>';
        }
    }

    function reconcile() {
        if (!isHomePage() || !configReady || config.enabled === false) return;
        [...config.announcementsWidgets, ...config.mainBlockWidgets].forEach(item => {
            if (item.enabled !== false) mountWidget(item.id);
        });
        sortZone('announcements-column');
        sortZone('intranet-main-userblock');
    }

    function register(widget) {
        if (!widget || !widget.id) return false;
        registry.set(widget.id, widget);
        if (configReady) mountWidget(widget.id);
        return true;
    }

    function loadScript(url) {
        const absolute = new URL(url, window.location.href).href;
        if (loadedScripts.has(absolute)) return loadedScripts.get(absolute);

        const promise = new Promise((resolve, reject) => {
            const existing = [...document.scripts].find(s => s.src === absolute);
            if (existing && existing.dataset.pmk137Loaded === '1') return resolve(existing);

            const script = existing || document.createElement('script');
            if (!existing) {
                script.src = absolute;
                script.async = true;
                document.head.appendChild(script);
            }
            script.addEventListener('load', () => {
                script.dataset.pmk137Loaded = '1';
                resolve(script);
            }, { once: true });
            script.addEventListener('error', () => reject(new Error(`Chargement impossible : ${absolute}`)), { once: true });
        });
        loadedScripts.set(absolute, promise);
        return promise;
    }

    async function importWidgets() {
        if (modulesRequested || !isHomePage()) return;
        modulesRequested = true;

        for (const relative of WIDGET_FILES) {
            try {
                const url = new URL(relative, selfUrl);
                url.searchParams.set('v', release);
                await import(url.href);
            } catch (error) {
                console.error('PMK137 — chargement widget impossible :', relative, error);
            }
        }
        reconcile();
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 1,
            name: { fr: 'Widgets & blocs d’accueil', en: 'Home widgets & blocks' },
            description: {
                fr: 'Centralise les widgets par défaut placés dans les annonces et IntranetmainUserblock. PMK pilote uniquement leur activation et leur ordre ; chaque widget conserve son propre fonctionnement et sa propre configuration accessible uniquement pour les superlibrarian directement sur le widget.',
                en: 'Centralizes the default widgets placed in announcements and IntranetmainUserblock. PMK only controls activation and order; each widget keeps its own behavior and configuration, available only to superlibrarians directly from the widget.'
            },
            category: { fr: 'Accueil / interface', en: 'Home / interface' },
            supportedPages: ['*'],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            validate: function (cfg) {
                if (!cfg || typeof cfg.enabled !== 'boolean') return { ok: false, message: 'Configuration invalide.' };
                if (!Array.isArray(cfg.announcementsWidgets) || !Array.isArray(cfg.mainBlockWidgets)) return { ok: false, message: 'Liste de widgets invalide.' };
                return { ok: true };
            },
            schema: [
                {
                    type: 'section',
                    id: 'activation',
                    label: { fr: 'Activation', en: 'Activation' },
                    fields: [
                        { key: 'enabled', type: 'boolean', label: { fr: 'Activer les widgets d’accueil', en: 'Enable home widgets' } }
                    ]
                },
                {
                    type: 'section',
                    id: 'announcements',
                    label: { fr: 'Colonne des annonces', en: 'Announcements column' },
                    description: { fr: 'Activez les widgets et faites-les glisser pour modifier leur ordre.', en: 'Enable widgets and drag them to change their order.' },
                    fields: [
                        {
                            key: 'announcementsWidgets',
                            type: 'repeater',
                            reorder: true,
                            removable: false,
                            canAdd: function () { return false; },
                            itemTitle: function (item) { return item?.labelFr || item?.id || 'Widget'; },
                            fields: [
                                { key: 'enabled', type: 'boolean', label: { fr: 'Afficher ce widget', en: 'Show this widget' } },
                                { key: 'labelFr', type: 'text', label: { fr: 'Nom du widget — français', en: 'Widget name — French' }, help: { fr: 'Nom utilisé par PimpMyKoha pour présenter ce widget. Le widget peut conserver ses propres titres internes dans sa configuration.', en: 'Name used by PimpMyKoha to present this widget. The widget may keep its own internal titles in its own configuration.' } },
                                { key: 'labelEn', type: 'text', label: { fr: 'Nom du widget — anglais', en: 'Widget name — English' } }
                            ]
                        }
                    ]
                },
                {
                    type: 'section',
                    id: 'mainblock',
                    label: { fr: 'Zone IntranetmainUserblock', en: 'IntranetmainUserblock area' },
                    description: { fr: 'Widgets affichés sous les modules principaux de l’accueil.', en: 'Widgets displayed below the main home modules.' },
                    fields: [
                        {
                            key: 'mainBlockWidgets',
                            type: 'repeater',
                            reorder: true,
                            removable: false,
                            canAdd: function () { return false; },
                            itemTitle: function (item) { return item?.labelFr || item?.id || 'Widget'; },
                            fields: [
                                { key: 'enabled', type: 'boolean', label: { fr: 'Afficher ce widget', en: 'Show this widget' } },
                                { key: 'labelFr', type: 'text', label: { fr: 'Nom du widget — français', en: 'Widget name — French' }, help: { fr: 'Nom utilisé par PimpMyKoha pour présenter ce widget. Le widget peut conserver ses propres titres internes dans sa configuration.', en: 'Name used by PimpMyKoha to present this widget. The widget may keep its own internal titles in its own configuration.' } },
                                { key: 'labelEn', type: 'text', label: { fr: 'Nom du widget — anglais', en: 'Widget name — English' } }
                            ]
                        }
                    ]
                }
            ]
        };
    }

    function applyConfig(next, initial) {
        const normalized = normalizeConfig(next);
        const signature = JSON.stringify(normalized);

        if (!initial && configReady && initialConfigSignature && signature !== initialConfigSignature && isHomePage()) {
            window.location.reload();
            return;
        }

        config = normalized;
        initialConfigSignature = signature;
        configReady = true;
        if (isHomePage()) {
            importWidgets();
            reconcile();
        }
    }

    function registerPmk() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== 'function') return false;
        try {
            window.PMKConfig.registerModule(moduleDefinition());
            Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
                .then(cfg => applyConfig(cfg, true))
                .catch(() => applyConfig(clone(DEFAULT_CONFIG), true));

            if (typeof window.PMKConfig.subscribe === 'function') {
                window.PMKConfig.subscribe(MODULE_ID, cfg => applyConfig(cfg, false));
            }
            return true;
        } catch (error) {
            console.error('PMK137 — enregistrement PMK impossible :', error);
            return false;
        }
    }

    window.PMKHomeWidgets = {
        version: VERSION,
        moduleId: MODULE_ID,
        register,
        isSuperlibrarian,
        loadScript,
        reconcile,
        getConfig: () => clone(config)
    };

    function start() {
        if (!registerPmk()) {
            window.addEventListener('pmk:config-ready', registerPmk, { once: true });
            window.setTimeout(() => {
                if (!configReady) applyConfig(clone(DEFAULT_CONFIG), true);
                registerPmk();
            }, 5000);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})(window, document);

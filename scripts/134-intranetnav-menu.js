/*
 Nom du fichier : 134-intranetnav-menu.js
 Version : 1.5.4
 Date : 2026-09-25

 Module PimpMyKoha : Menu IntranetNav

 Objectifs :
 - injecter autant de menus principaux que nécessaire dans #toplevelmenu ;
 - créer autant d'entrées, groupes et sous-menus que nécessaire ;
 - profondeur de sous-menus non limitée par le moteur ;
 - choisir une icône Font Awesome ;
 - choisir l'accès : tous / superlibrarian / hérité du parent ;
 - gérer des liens et des actions PMK ;
 - intégrer l'accès aux modules autonomes 066-067, 071, 075 et 135 sans modifier leur logique métier ;
 - proposer des sous-menus latéraux, déroulés ou méga-menu ;
 - fournir un accès direct aux guides, parcours de formation et mode accompagnement ;
 - intégrer le compteur fréquentation Médiabus (139) comme action PMK uniquement sur MEDIABUS ;
 - masquer les anciens boutons de la barre basse seulement lorsque l'action correspondante
   est réellement disponible dans le nouveau menu ;
 - supprimer le menu Outils historique #custom-tools-menu pour éviter les doublons.
*/
(function () {
    'use strict';

    if (window.__PMK_INTRAnET_NAV_MENU__) return;
    window.__PMK_INTRAnET_NAV_MENU__ = true;

    const MODULE_ID = 'intranet-nav-menu';
    const STYLE_ID = 'pmk-intranet-nav-menu-styles';
    const LEGACY_LISTS_CLASS = 'pmk-hide-legacy-lists-entry';
    const LEGACY_HISTORY_CLASS = 'pmk-hide-legacy-history-entry';
    const LEGACY_ADVANCED_CLASS = 'pmk-hide-legacy-advanced-search-entry';
    const LEGACY_GUIDES_CLASS = 'pmk-hide-legacy-guides-entry';
    const OWN_CLASS = 'pmk-intranet-nav-menu';

    let currentConfig = null;
    let registered = false;
    let unsubscribe = null;
    let observer = null;
    let renderQueued = false;
    let rendering = false;
    let builderSelectedMenuId = null;
    let builderSelectedItemId = null;
    const builderCollapsedIds = new Set();

    const ICON_OPTIONS = [
        ['', { fr: 'Aucune icône', en: 'No icon' }],
        ['fa-wrench', { fr: 'Outils', en: 'Tools' }],
        ['fa-bookmark', { fr: 'Marque-page / listes', en: 'Bookmark / lists' }],
        ['fa-list', { fr: 'Liste', en: 'List' }],
        ['fa-folder-open', { fr: 'Dossier', en: 'Folder' }],
        ['fa-sitemap', { fr: 'Arborescence', en: 'Tree' }],
        ['fa-dashboard', { fr: 'Tableau de bord', en: 'Dashboard' }],
        ['fa-search', { fr: 'Recherche', en: 'Search' }],
        ['fa-search-plus', { fr: 'Recherche avancée', en: 'Advanced search' }],
        ['fa-clock-o', { fr: 'Historique', en: 'History' }],
        ['fa-graduation-cap', { fr: 'Formation', en: 'Training' }],
        ['fa-question-circle', { fr: 'Aide', en: 'Help' }],
        ['fa-compass', { fr: 'Guide', en: 'Guide' }],
        ['fa-life-ring', { fr: 'Accompagnement', en: 'Assistance' }],
        ['fa-calendar', { fr: 'Calendrier', en: 'Calendar' }],
        ['fa-check-circle', { fr: 'Contrôle / qualité', en: 'Check / quality' }],
        ['fa-home', { fr: 'Accueil', en: 'Home' }],
        ['fa-book', { fr: 'Notice / livre', en: 'Record / book' }],
        ['fa-barcode', { fr: 'Code-barres / exemplaire', en: 'Barcode / item' }],
        ['fa-user-circle', { fr: 'Utilisateur / autorité', en: 'User / authority' }],
        ['fa-users', { fr: 'Usagers', en: 'Patrons' }],
        ['fa-hand-paper-o', { fr: 'Réservation', en: 'Hold' }],
        ['fa-exchange', { fr: 'Transfert', en: 'Transfer' }],
        ['fa-retweet', { fr: 'Prêt / retour', en: 'Loan / return' }],
        ['fa-clipboard', { fr: 'Inventaire', en: 'Inventory' }],
        ['fa-trash', { fr: 'Suppression', en: 'Delete' }],
        ['fa-medkit', { fr: 'Restauration', en: 'Repair' }],
        ['fa-map-marker', { fr: 'Localisation', en: 'Location' }],
        ['fa-newspaper-o', { fr: 'Périodiques', en: 'Serials' }],
        ['fa-flask', { fr: 'Test / laboratoire', en: 'Test / lab' }],
        ['fa-cog', { fr: 'Configuration', en: 'Settings' }],
        ['fa-link', { fr: 'Lien', en: 'Link' }]
    ];

    function uid(prefix) {
        const p = String(prefix || 'nav').replace(/[^a-z0-9_-]/gi, '-');
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return p + '-' + window.crypto.randomUUID();
        }
        return p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
    }

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function language() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === 'function') {
            return window.PMKConfig.getLanguage();
        }
        const value = String(document.documentElement.lang || navigator.language || 'fr').toLowerCase();
        return value.startsWith('en') ? 'en' : 'fr';
    }

    function tr(fr, en) {
        return language() === 'en' ? en : fr;
    }

    function labelOf(entry) {
        if (!entry) return '';
        const lang = language();
        const primary = lang === 'en' ? entry.labelEn : entry.labelFr;
        const fallback = lang === 'en' ? entry.labelFr : entry.labelEn;
        return String(primary || fallback || '').trim();
    }

    function effectiveIcon(entry) {
        const custom = String(entry && entry.iconCustom || '').trim();
        if (custom) return custom;
        return String(entry && entry.icon || '').trim();
    }

    function iconClass(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const parts = raw.split(/\s+/).filter(Boolean);
        const hasStyle = parts.some(function (part) {
            return part === 'fa' || /^fa-(?:solid|regular|brands|light|thin|duotone)$/.test(part);
        });
        if (!hasStyle) parts.unshift('fa');
        if (!parts.includes('fa-fw')) parts.push('fa-fw');
        return parts.join(' ');
    }

    function appendIcon(target, entry) {
        const cls = iconClass(effectiveIcon(entry));
        if (!cls) return;
        const i = document.createElement('i');
        i.className = cls;
        i.setAttribute('aria-hidden', 'true');
        target.appendChild(i);
    }

    function isSuperlibrarian() {
        if (window.PMKConfig && typeof window.PMKConfig.isKohaSuperlibrarian === 'function') {
            try { return !!window.PMKConfig.isKohaSuperlibrarian(); } catch (_) {}
        }

        const userEl = document.querySelector(
            '#logged-in-info-full .loggedinusername[data-loggedinusername], ' +
            '.loggedinusername[data-loggedinusername]'
        );
        if (!userEl) return false;
        return userEl.dataset.isSuperlibrarian === 'is_superlibrarian' ||
            userEl.classList.contains('is_superlibrarian');
    }

    function canSee(audience, parentAudience) {
        const requested = audience === 'all' || audience === 'superlibrarian'
            ? audience
            : (parentAudience || 'all');
        if (requested === 'superlibrarian') return isSuperlibrarian();
        return true;
    }

    function inheritedAudience(audience, parentAudience) {
        const own = audience === 'all' || audience === 'superlibrarian'
            ? audience
            : (parentAudience || 'all');
        if (parentAudience === 'superlibrarian') return 'superlibrarian';
        return own;
    }

    function menuAtPath(root, path) {
        const menuIndex = Array.isArray(path) && path[0] === 'menus' ? Number(path[1]) : NaN;
        return Number.isInteger(menuIndex) && root && Array.isArray(root.menus)
            ? root.menus[menuIndex]
            : null;
    }

    function itemAtPath(root, path) {
        const menu = menuAtPath(root, path);
        const itemsIndex = Array.isArray(path) ? path.indexOf('items') : -1;
        if (!menu || itemsIndex < 0) return null;
        const itemIndex = Number(path[itemsIndex + 1]);
        return Number.isInteger(itemIndex) && Array.isArray(menu.items)
            ? menu.items[itemIndex]
            : null;
    }

    function descendantsOf(items, id) {
        const result = new Set();
        let changed = true;
        while (changed) {
            changed = false;
            (items || []).forEach(function (candidate) {
                if (!candidate || !candidate.id || result.has(candidate.id)) return;
                if (candidate.parentId === id || result.has(candidate.parentId)) {
                    result.add(candidate.id);
                    changed = true;
                }
            });
        }
        return result;
    }

    function parentOptions(root, fieldPath) {
        const menu = menuAtPath(root, fieldPath);
        const current = itemAtPath(root, fieldPath);
        const items = menu && Array.isArray(menu.items) ? menu.items : [];
        const forbidden = current ? descendantsOf(items, current.id) : new Set();
        if (current && current.id) forbidden.add(current.id);

        const options = [{
            value: '',
            label: { fr: 'Racine du menu', en: 'Menu root' }
        }];

        items.forEach(function (item) {
            if (!item || !item.id || forbidden.has(item.id)) return;
            if (item.kind !== 'submenu' && item.kind !== 'group') return;
            const kind = item.kind === 'submenu'
                ? { fr: 'Sous-menu', en: 'Submenu' }
                : { fr: 'Groupe', en: 'Group' };
            const frLabel = String(item.labelFr || item.labelEn || item.id);
            const enLabel = String(item.labelEn || item.labelFr || item.id);
            options.push({
                value: item.id,
                label: {
                    fr: kind.fr + ' — ' + frLabel,
                    en: kind.en + ' — ' + enLabel
                }
            });
        });

        return options;
    }

    function itemKind(root, path) {
        const item = itemAtPath(root, path);
        return item ? item.kind : '';
    }

    function makeItem(kind, values) {
        return Object.assign({
            id: uid('item'),
            enabled: true,
            kind: kind || 'link',
            parentId: '',
            labelFr: '',
            labelEn: '',
            icon: '',
            iconCustom: '',
            audience: 'inherit',
            url: '',
            target: 'same',
            actionId: '',
            presentation: 'side',
            megaColumns: 3
        }, values || {});
    }

    function defaultItems() {
        return [
            makeItem('group', {
                id: 'tools-group',
                labelFr: 'Outils',
                labelEn: 'Tools',
                audience: 'all'
            }),
            makeItem('link', {
                id: 'collections-tree', parentId: 'tools-group',
                labelFr: 'Arborescence des collections', labelEn: 'Collections tree',
                icon: 'fa-sitemap', url: '/cgi-bin/koha/tools/page.pl?page_id=114', target: 'new'
            }),
            makeItem('action', {
                id: 'dashboard', parentId: 'tools-group',
                labelFr: 'Tableau de bord', labelEn: 'Dashboard',
                icon: 'fa-dashboard', actionId: 'dashboard',
                url: '/cgi-bin/koha/circ/circulation.pl#', target: 'same'
            }),
            makeItem('link', {
                id: 'item-search', parentId: 'tools-group',
                labelFr: "Recherche d'exemplaires", labelEn: 'Item search',
                icon: 'fa-search', url: '/cgi-bin/koha/reports/guided_reports.pl?id=4323&op=run', target: 'same'
            }),
            makeItem('link', {
                id: 'appointments', parentId: 'tools-group',
                labelFr: 'RDV et sondages', labelEn: 'Appointments and surveys',
                icon: 'fa-calendar', url: '/cgi-bin/koha/mainpage.pl?pmk_page=appointments', target: 'new'
            }),

            makeItem('separator', { id: 'sep-my-tools', audience: 'all' }),
            makeItem('group', {
                id: 'my-tools-group',
                labelFr: 'Mes outils', labelEn: 'My tools', audience: 'all'
            }),
            makeItem('action', {
                id: 'personal-lists', parentId: 'my-tools-group',
                labelFr: 'Listes personnelles', labelEn: 'Personal lists',
                icon: 'fa-bookmark', actionId: 'personal-lists', audience: 'inherit'
            }),
            makeItem('action', {
                id: 'recent-history', parentId: 'my-tools-group',
                labelFr: 'Historique récent', labelEn: 'Recent history',
                icon: 'fa-clock-o', actionId: 'recent-history', audience: 'inherit'
            }),
            makeItem('action', {
                id: 'advanced-search', parentId: 'my-tools-group',
                labelFr: 'Recherche avancée', labelEn: 'Advanced search',
                icon: 'fa-search-plus', actionId: 'advanced-search', audience: 'inherit'
            }),
            makeItem('action', {
                id: 'attendance-mediabus', parentId: 'my-tools-group',
                labelFr: 'Compteur fréquentation Médiabus', labelEn: 'Mediabus attendance counter',
                icon: 'fa-plus-square', actionId: 'attendance-mediabus', audience: 'inherit'
            }),
            makeItem('submenu', {
                id: 'guides-training-menu', parentId: 'my-tools-group',
                labelFr: 'Aide & formation', labelEn: 'Help & training',
                icon: 'fa-graduation-cap', audience: 'inherit',
                presentation: 'side'
            }),
            makeItem('action', {
                id: 'guides-current', parentId: 'guides-training-menu',
                labelFr: 'Guide de cet écran', labelEn: 'Guide for this screen',
                icon: 'fa-compass', actionId: 'guides-current', audience: 'inherit'
            }),
            makeItem('action', {
                id: 'guides-catalogue', parentId: 'guides-training-menu',
                labelFr: 'Parcours de formation', labelEn: 'Training paths',
                icon: 'fa-graduation-cap', actionId: 'guides-catalogue', audience: 'inherit'
            }),
            makeItem('action', {
                id: 'guides-assist-toggle', parentId: 'guides-training-menu',
                labelFr: 'Mode accompagnement', labelEn: 'Contextual assistance',
                icon: 'fa-life-ring', actionId: 'guides-assist-toggle', audience: 'inherit'
            }),

            makeItem('separator', { id: 'sep-admin', audience: 'superlibrarian' }),
            makeItem('group', {
                id: 'admin-group',
                labelFr: 'Administration', labelEn: 'Administration', audience: 'superlibrarian'
            }),
            makeItem('link', {
                id: 'internal-pages-hub', parentId: 'admin-group',
                labelFr: 'Pages & outils internes', labelEn: 'Internal pages & tools',
                icon: 'fa-th-large', url: '/cgi-bin/koha/mainpage.pl?pmk_page=hub', target: 'new'
            }),
            makeItem('link', {
                id: 'attendance-report', parentId: 'admin-group',
                labelFr: 'Fréquentation — rapports', labelEn: 'Attendance — reports',
                icon: 'fa-bar-chart', url: '/cgi-bin/koha/mainpage.pl?pmk_page=attendance-counter', target: 'new'
            }),
            makeItem('submenu', {
                id: 'quality-center', parentId: 'admin-group',
                labelFr: 'Centre qualité', labelEn: 'Quality center',
                icon: 'fa-check-circle', audience: 'inherit'
            }),
            makeItem('link', {
                id: 'quality-home', parentId: 'quality-center',
                labelFr: 'Ouvrir le Centre qualité', labelEn: 'Open Quality center',
                icon: 'fa-home', url: '/cgi-bin/koha/mainpage.pl?pmk_page=quality-center', target: 'new'
            }),
            makeItem('separator', { id: 'quality-sep', parentId: 'quality-center' }),
            makeItem('link', {
                id: 'quality-notices', parentId: 'quality-center',
                labelFr: 'Notices', labelEn: 'Records', icon: 'fa-book',
                url: '/cgi-bin/koha/mainpage.pl?pmk_page=biblios', target: 'new'
            }),
            makeItem('link', {
                id: 'quality-items', parentId: 'quality-center',
                labelFr: 'Exemplaires', labelEn: 'Items', icon: 'fa-barcode',
                url: '/cgi-bin/koha/mainpage.pl?pmk_page=items', target: 'new'
            }),
            makeItem('link', {
                id: 'quality-authorities', parentId: 'quality-center',
                labelFr: 'Autorités', labelEn: 'Authorities', icon: 'fa-user-circle',
                url: '/cgi-bin/koha/mainpage.pl?pmk_page=authorities', target: 'new'
            }),
            makeItem('link', {
                id: 'quality-holds', parentId: 'quality-center',
                labelFr: 'Réservations', labelEn: 'Holds', icon: 'fa-hand-paper-o',
                url: '/cgi-bin/koha/mainpage.pl?pmk_page=reservations', target: 'new'
            }),
            makeItem('link', {
                id: 'quality-transfers', parentId: 'quality-center',
                labelFr: 'Transferts', labelEn: 'Transfers', icon: 'fa-exchange',
                url: '/cgi-bin/koha/mainpage.pl?pmk_page=transfers', target: 'new'
            }),
            makeItem('link', {
                id: 'quality-loans', parentId: 'quality-center',
                labelFr: 'Prêts & litiges', labelEn: 'Loans & disputes', icon: 'fa-retweet',
                url: '/cgi-bin/koha/mainpage.pl?pmk_page=loans', target: 'new'
            }),
            makeItem('link', {
                id: 'quality-patrons', parentId: 'quality-center',
                labelFr: 'Comptes lecteurs', labelEn: 'Patron accounts', icon: 'fa-users',
                url: '/cgi-bin/koha/mainpage.pl?pmk_page=patrons', target: 'new'
            }),
            makeItem('link', {
                id: 'quality-serials', parentId: 'quality-center',
                labelFr: 'Périodiques', labelEn: 'Serials', icon: 'fa-newspaper-o',
                url: '/cgi-bin/koha/mainpage.pl?pmk_page=serials', target: 'new'
            }),
            makeItem('separator', { id: 'quality-sep-rules', parentId: 'quality-center' }),
            makeItem('link', {
                id: 'quality-rules', parentId: 'quality-center',
                labelFr: 'Règles & apprentissage', labelEn: 'Rules & learning', icon: 'fa-flask',
                url: '/cgi-bin/koha/mainpage.pl?pmk_page=rulelab', target: 'new'
            }),
            makeItem('link', {
                id: 'inventory', parentId: 'admin-group',
                labelFr: 'Inventaire', labelEn: 'Inventory', icon: 'fa-clipboard',
                url: '/cgi-bin/koha/mainpage.pl?pmk_page=inventory', target: 'new'
            }),
            makeItem('link', {
                id: 'weeding', parentId: 'admin-group',
                labelFr: 'Désherbage', labelEn: 'Weeding', icon: 'fa-trash',
                url: '/cgi-bin/koha/mainpage.pl?pmk_page=weeding', target: 'new'
            }),
            makeItem('link', {
                id: 'restoration', parentId: 'admin-group',
                labelFr: 'Restauration', labelEn: 'Restoration', icon: 'fa-medkit',
                url: '/cgi-bin/koha/mainpage.pl?pmk_page=restore-deleted-items', target: 'new'
            }),
            makeItem('link', {
                id: 'patron-map', parentId: 'admin-group',
                labelFr: 'Carto adhérents', labelEn: 'Patron map', icon: 'fa-map-marker',
                url: '/cgi-bin/koha/tools/page.pl?page_id=130', target: 'new'
            }),
            makeItem('link', {
                id: 'heritage-funds', parentId: 'admin-group',
                labelFr: 'Suivi Fonds Pat.', labelEn: 'Heritage funds follow-up', icon: 'fa-book',
                url: '/cgi-bin/koha/tools/page.pl?page_id=119', target: 'new'
            }),
            makeItem('link', {
                id: 'serials-delete', parentId: 'admin-group',
                labelFr: 'Périodiques à supprimer', labelEn: 'Serials to delete', icon: 'fa-newspaper-o',
                url: '/cgi-bin/koha/reports/guided_reports.pl?id=5056&param_name=Site%7Cbranches%3Aall&sql_params=%25&op=run', target: 'new'
            }),
            makeItem('link', {
                id: 'test-base', parentId: 'admin-group',
                labelFr: 'Base de test', labelEn: 'Test database', icon: 'fa-flask',
                url: 'https://koha-test.example.org/', target: 'new'
            })
        ];
    }

    function makeMenu(values) {
        return Object.assign({
            id: uid('menu'),
            enabled: true,
            labelFr: 'Nouveau menu',
            labelEn: 'New menu',
            icon: 'fa-wrench',
            iconCustom: '',
            audience: 'all',
            items: []
        }, values || {});
    }

    const DEFAULTS = {
        enabled: true,
        migrationVersion: 7,
        removeLegacyHardcodedMenu: true,
        hideLegacyListsButton: true,
        hideLegacyHistoryButton: true,
        hideLegacyAdvancedSearchButton: true,
        hideLegacyGuidesButton: true,
        collapseLabelsOnSmallScreens: true,
        menus: [
            makeMenu({
                id: 'tools',
                labelFr: 'Outils',
                labelEn: 'Tools',
                icon: 'fa-wrench',
                audience: 'all',
                items: defaultItems()
            })
        ]
    };

    function newMenu() {
        return makeMenu();
    }

    function newItem() {
        return makeItem('link', {
            labelFr: 'Nouvel élément',
            labelEn: 'New item',
            icon: 'fa-link'
        });
    }

    function iconOptions() {
        return ICON_OPTIONS.map(function (entry) {
            return { value: entry[0], label: entry[1] };
        });
    }

    function builderEnsureStyles() {
        if (document.getElementById('pmk-intranet-nav-builder-styles')) return;
        const style = document.createElement('style');
        style.id = 'pmk-intranet-nav-builder-styles';
        style.textContent = `
            [data-pmk-field-path="_builderSignal"] { display:none !important; }
            .pmk-inav-builder { border:1px solid #d9dee5; border-radius:12px; background:#f8f9fb; overflow:hidden; }
            .pmk-inav-builder * { box-sizing:border-box; }
            .pmk-inav-builder-top { padding:14px; background:#fff; border-bottom:1px solid #e1e5ea; }
            .pmk-inav-builder-title { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
            .pmk-inav-builder-title strong { font-size:1rem; }
            .pmk-inav-menu-tabs { display:flex; flex-wrap:wrap; gap:7px; align-items:center; }
            .pmk-inav-menu-tab { display:inline-flex; align-items:center; gap:7px; min-height:34px; padding:6px 9px; border:1px solid #cfd5dc; border-radius:8px; background:#fff; cursor:pointer; }
            .pmk-inav-menu-tab.is-selected { border-color:#5b7fa3; box-shadow:0 0 0 2px rgba(91,127,163,.13); }
            .pmk-inav-menu-tab.is-disabled { opacity:.55; }
            .pmk-inav-menu-tab[draggable=true] { cursor:grab; }
            .pmk-inav-menu-tab.is-dragging { opacity:.35; }
            .pmk-inav-menu-grip, .pmk-inav-grip { cursor:grab; color:#6c757d; }
            .pmk-inav-menu-label { white-space:nowrap; }
            .pmk-inav-menu-drop { width:8px; min-height:32px; border-radius:5px; }
            .pmk-inav-menu-drop.is-over { background:#5b7fa3; }
            .pmk-inav-menu-settings { display:grid; grid-template-columns:minmax(180px,1.5fr) minmax(150px,1fr) minmax(150px,1fr) auto; gap:8px; margin-top:12px; align-items:end; }
            .pmk-inav-mini-field { display:flex; flex-direction:column; gap:4px; min-width:0; }
            .pmk-inav-mini-field > span { font-size:.76rem; font-weight:600; color:#5f6670; }
            .pmk-inav-mini-field input, .pmk-inav-mini-field select { width:100%; min-height:34px; }
            .pmk-inav-state-switch { display:inline-flex; align-items:center; gap:8px; min-height:34px; cursor:pointer; user-select:none; }
            .pmk-inav-state-switch input { position:absolute !important; opacity:0 !important; width:1px !important; height:1px !important; pointer-events:none; }
            .pmk-inav-state-track { position:relative; display:inline-flex; align-items:center; width:44px; height:24px; flex:0 0 44px; border:1px solid #b9c1ca; border-radius:999px; background:#dfe3e8; transition:background .15s,border-color .15s,box-shadow .15s; }
            .pmk-inav-state-thumb { position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.28); transition:transform .15s; }
            .pmk-inav-state-switch input:checked + .pmk-inav-state-track { background:#4f8a62; border-color:#477b58; }
            .pmk-inav-state-switch input:checked + .pmk-inav-state-track .pmk-inav-state-thumb { transform:translateX(20px); }
            .pmk-inav-state-switch input:focus-visible + .pmk-inav-state-track { box-shadow:0 0 0 3px rgba(43,109,168,.18); }
            .pmk-inav-state-text { min-width:48px; font-size:.78rem; font-weight:600; color:#6c757d; }
            .pmk-inav-state-switch.is-active .pmk-inav-state-text { color:#3e7651; }
            .pmk-inav-builder-body { display:grid; grid-template-columns:minmax(340px,1.5fr) minmax(290px,1fr); min-height:390px; }
            .pmk-inav-tree-pane { padding:14px; border-right:1px solid #e1e5ea; background:#fbfcfd; overflow:auto; }
            .pmk-inav-properties { padding:14px; background:#fff; overflow:auto; }
            .pmk-inav-toolbar { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
            .pmk-inav-toolbar .btn { white-space:nowrap; }
            .pmk-inav-tree { min-width:290px; }
            .pmk-inav-node-wrap { position:relative; }
            .pmk-inav-node { display:flex; align-items:center; gap:7px; min-height:38px; margin:3px 0; padding:6px 8px; border:1px solid #d8dde4; border-radius:8px; background:#fff; cursor:pointer; transition:border-color .12s, box-shadow .12s, opacity .12s; }
            .pmk-inav-node:hover { border-color:#aeb8c3; }
            .pmk-inav-node.is-selected { border-color:#5b7fa3; box-shadow:0 0 0 2px rgba(91,127,163,.12); }
            .pmk-inav-node.is-disabled { opacity:.5; }
            .pmk-inav-node.is-dragging { opacity:.3; }
            .pmk-inav-node.is-container { background:#f4f7fa; }
            .pmk-inav-node.is-group { background:#eef1f4; font-weight:600; }
            .pmk-inav-node.is-separator { min-height:28px; border:0; background:transparent; padding-top:3px; padding-bottom:3px; }
            .pmk-inav-node.is-separator .pmk-inav-separator-line { flex:1; border-top:1px solid #bbc2ca; }
            .pmk-inav-collapse { width:24px; height:24px; border:0; background:transparent; padding:0; color:#5f6670; }
            .pmk-inav-collapse-placeholder { width:24px; flex:0 0 24px; }
            .pmk-inav-node-icon { width:20px; text-align:center; color:#495057; }
            .pmk-inav-node-main { min-width:0; flex:1; }
            .pmk-inav-node-label { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .pmk-inav-node-meta { display:flex; flex-wrap:wrap; gap:4px; margin-top:2px; }
            .pmk-inav-badge { display:inline-flex; align-items:center; min-height:17px; padding:1px 5px; border-radius:8px; background:#e9edf2; color:#5b626b; font-size:.68rem; font-weight:500; }
            .pmk-inav-node-actions { display:flex; gap:2px; opacity:.25; }
            .pmk-inav-node:hover .pmk-inav-node-actions, .pmk-inav-node.is-selected .pmk-inav-node-actions { opacity:1; }
            .pmk-inav-node-actions .btn { padding:2px 5px; }
            .pmk-inav-children { margin-left:25px; padding-left:11px; border-left:1px dashed #cbd2da; }
            .pmk-inav-children.is-collapsed { display:none; }
            .pmk-inav-dropzone { height:7px; margin:0 3px; border-radius:5px; position:relative; }
            .pmk-inav-dropzone::after { content:''; position:absolute; left:0; right:0; top:3px; height:2px; border-radius:2px; background:transparent; }
            .pmk-inav-dropzone.is-over::after { background:#2b6da8; }
            .pmk-inav-inside-drop { display:none; margin:4px 0 4px 25px; padding:6px 8px; border:1px dashed #9aa6b2; border-radius:7px; color:#65717d; font-size:.75rem; text-align:center; }
            .pmk-inav-node-wrap.is-drag-target > .pmk-inav-inside-drop { display:block; }
            .pmk-inav-inside-drop.is-over { display:block; border-style:solid; border-color:#2b6da8; background:#f2f7fb; }
            .pmk-inav-empty { padding:24px 12px; text-align:center; border:1px dashed #c7ced6; border-radius:8px; color:#6b747d; background:#fff; }
            .pmk-inav-props-empty { color:#6b747d; padding:20px 4px; }
            .pmk-inav-props-title { display:flex; align-items:center; justify-content:space-between; gap:8px; padding-bottom:9px; margin-bottom:10px; border-bottom:1px solid #e2e6ea; }
            .pmk-inav-props-grid { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
            .pmk-inav-props-grid .is-wide { grid-column:1 / -1; }
            .pmk-inav-props-actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:13px; padding-top:11px; border-top:1px solid #e5e8ec; }
            .pmk-inav-builder-hint { margin-top:10px; color:#68717b; font-size:.78rem; }
            .pmk-inav-root-label { display:flex; align-items:center; gap:6px; margin:7px 0 5px; color:#69737d; font-size:.72rem; font-weight:600; text-transform:uppercase; letter-spacing:.03em; }
            @media (max-width: 1000px) {
                .pmk-inav-builder-body { grid-template-columns:1fr; }
                .pmk-inav-tree-pane { border-right:0; border-bottom:1px solid #e1e5ea; }
                .pmk-inav-menu-settings { grid-template-columns:1fr 1fr; }
            }
            @media (max-width: 650px) {
                .pmk-inav-menu-settings, .pmk-inav-props-grid { grid-template-columns:1fr; }
                .pmk-inav-props-grid .is-wide { grid-column:auto; }
            }
        `;
        document.head.appendChild(style);
    }

    function builderMarkDirty(node) {
        const overlay = node && node.closest ? node.closest('.pmk-config-overlay, .modal, [role="dialog"]') : null;
        const scope = overlay || document;
        const control = scope.querySelector('[data-pmk-field-path]');
        if (control) {
            control.dispatchEvent(new Event('input', { bubbles: true }));
            control.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function builderChildren(items, parentId) {
        return (items || []).filter(function (item) {
            return String(item && item.parentId || '') === String(parentId || '');
        });
    }

    function builderNormalizeOrder(items) {
        const source = Array.isArray(items) ? items.slice() : [];
        const seen = new Set();
        const output = [];
        function visit(parentId) {
            source.forEach(function (item) {
                if (!item || seen.has(item.id)) return;
                if (String(item.parentId || '') !== String(parentId || '')) return;
                seen.add(item.id);
                output.push(item);
                visit(item.id);
            });
        }
        visit('');
        source.forEach(function (item) {
            if (!item || seen.has(item.id)) return;
            item.parentId = '';
            seen.add(item.id);
            output.push(item);
            visit(item.id);
        });
        items.splice(0, items.length);
        output.forEach(function (item) { items.push(item); });
    }

    function builderMoveItem(items, draggedId, newParentId, beforeId) {
        const draggedIndex = items.findIndex(function (item) { return item && item.id === draggedId; });
        if (draggedIndex < 0) return false;
        const dragged = items[draggedIndex];
        const forbidden = descendantsOf(items, draggedId);
        if (newParentId === draggedId || forbidden.has(newParentId)) return false;
        if (newParentId) {
            const parent = items.find(function (item) { return item && item.id === newParentId; });
            if (!parent || (parent.kind !== 'submenu' && parent.kind !== 'group')) return false;
        }
        items.splice(draggedIndex, 1);
        dragged.parentId = newParentId || '';
        let insertAt = items.length;
        if (beforeId) {
            const candidateIndex = items.findIndex(function (item) { return item && item.id === beforeId; });
            if (candidateIndex >= 0 && String(items[candidateIndex].parentId || '') === String(dragged.parentId || '')) {
                insertAt = candidateIndex;
            }
        }
        items.splice(insertAt, 0, dragged);
        builderNormalizeOrder(items);
        return true;
    }

    function builderDuplicateItem(menu, sourceId) {
        const items = menu.items || [];
        const source = items.find(function (item) { return item && item.id === sourceId; });
        if (!source) return null;
        const descendants = descendantsOf(items, sourceId);
        const bundle = items.filter(function (item) {
            return item === source || descendants.has(item.id);
        });
        const idMap = new Map();
        bundle.forEach(function (item) { idMap.set(item.id, uid('item')); });
        const copies = bundle.map(function (item) {
            const copy = clone(item);
            copy.id = idMap.get(item.id);
            if (item.id === sourceId) {
                copy.parentId = source.parentId || '';
                if (copy.labelFr) copy.labelFr += ' — copie';
                if (copy.labelEn) copy.labelEn += ' — copy';
            } else if (idMap.has(item.parentId)) {
                copy.parentId = idMap.get(item.parentId);
            }
            return copy;
        });
        const sourceIndex = items.indexOf(source);
        let afterBundle = sourceIndex + 1;
        while (afterBundle < items.length && descendants.has(items[afterBundle].id)) afterBundle += 1;
        items.splice.apply(items, [afterBundle, 0].concat(copies));
        builderNormalizeOrder(items);
        return copies[0];
    }

    function builderRemoveItem(menu, id) {
        const items = menu.items || [];
        const removeIds = descendantsOf(items, id);
        removeIds.add(id);
        menu.items = items.filter(function (item) { return !item || !removeIds.has(item.id); });
    }

    function builderIconOptions(select, value) {
        ICON_OPTIONS.forEach(function (entry) {
            const option = document.createElement('option');
            option.value = entry[0];
            option.textContent = language() === 'en' ? entry[1].en : entry[1].fr;
            if (String(entry[0]) === String(value || '')) option.selected = true;
            select.appendChild(option);
        });
    }

    function builderActionOptions(select, value) {
        const options = [
            ['', tr('Choisir une action', 'Choose an action')],
            ['personal-lists', tr('Listes personnelles (066-067)', 'Personal lists (066-067)')],
            ['recent-history', tr('Historique récent (071)', 'Recent history (071)')],
            ['advanced-search', tr('Recherche avancée (075)', 'Advanced search (075)')],
            ['attendance-mediabus', tr('Compteur fréquentation Médiabus (139)', 'Mediabus attendance counter (139)')],
            ['guides-current', tr('Guide de cet écran (135)', 'Guide for this screen (135)')],
            ['guides-catalogue', tr('Parcours de formation (135)', 'Training paths (135)')],
            ['guides-assist-toggle', tr('Mode accompagnement (135)', 'Context assistance (135)')],
            ['dashboard', tr('Tableau de bord', 'Dashboard')]
        ];
        options.forEach(function (entry) {
            const option = document.createElement('option');
            option.value = entry[0];
            option.textContent = entry[1];
            if (entry[0] === String(value || '')) option.selected = true;
            select.appendChild(option);
        });
    }

    function builderField(label, control, wide) {
        const wrap = document.createElement('label');
        wrap.className = 'pmk-inav-mini-field' + (wide ? ' is-wide' : '');
        const caption = document.createElement('span');
        caption.textContent = label;
        wrap.append(caption, control);
        return wrap;
    }

    function builderStateSwitch(checked, onChange) {
        const wrap = document.createElement('label');
        wrap.className = 'pmk-inav-state-switch' + (checked ? ' is-active' : '');

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!checked;
        input.setAttribute('aria-label', tr('Activer ou désactiver', 'Enable or disable'));

        const track = document.createElement('span');
        track.className = 'pmk-inav-state-track';
        track.setAttribute('aria-hidden', 'true');

        const thumb = document.createElement('span');
        thumb.className = 'pmk-inav-state-thumb';
        track.appendChild(thumb);

        const state = document.createElement('span');
        state.className = 'pmk-inav-state-text';

        function refresh() {
            wrap.classList.toggle('is-active', input.checked);
            state.textContent = input.checked ? tr('Actif', 'Enabled') : tr('Inactif', 'Disabled');
        }

        input.addEventListener('change', function () {
            refresh();
            if (typeof onChange === 'function') onChange(input.checked);
        });

        refresh();
        wrap.append(input, track, state);
        return wrap;
    }

    function renderIntranetNavBuilder(context) {
        builderEnsureStyles();
        const root = context.rootObject || {};
        if (!Array.isArray(root.menus)) root.menus = [];
        const host = document.createElement('div');
        host.className = 'pmk-inav-builder';
        let dragItemId = '';
        let dragMenuId = '';

        function selectedMenu() {
            let menu = root.menus.find(function (entry) { return entry && entry.id === builderSelectedMenuId; });
            if (!menu) menu = root.menus[0] || null;
            if (menu) builderSelectedMenuId = menu.id;
            return menu;
        }

        function mutate(callback) {
            callback();
            builderMarkDirty(host);
            paint();
        }

        function addItem(kind, parentId) {
            const menu = selectedMenu();
            if (!menu) return;
            const names = {
                link: [tr('Nouveau lien', 'New link'), 'fa-link'],
                submenu: [tr('Nouveau sous-menu', 'New submenu'), 'fa-folder-open'],
                group: [tr('Nouveau groupe', 'New group'), ''],
                separator: ['', ''],
                action: [tr('Nouvelle action', 'New action'), 'fa-wrench']
            };
            const spec = names[kind] || names.link;
            const item = makeItem(kind, {
                parentId: parentId || '',
                labelFr: kind === 'separator' ? '' : spec[0],
                labelEn: kind === 'separator' ? '' : spec[0],
                icon: spec[1]
            });
            menu.items.push(item);
            builderNormalizeOrder(menu.items);
            builderSelectedItemId = item.id;
        }

        function paint() {
            host.innerHTML = '';
            const top = document.createElement('div');
            top.className = 'pmk-inav-builder-top';
            const title = document.createElement('div');
            title.className = 'pmk-inav-builder-title';
            title.innerHTML = '<strong><i class="fa fa-sitemap" aria-hidden="true"></i> ' +
                tr('Structure réelle de IntranetNav', 'Actual IntranetNav structure') + '</strong>';
            const addMenuBtn = document.createElement('button');
            addMenuBtn.type = 'button';
            addMenuBtn.className = 'btn btn-sm btn-outline-primary';
            addMenuBtn.innerHTML = '<i class="fa fa-plus" aria-hidden="true"></i> ' + tr('Ajouter un menu', 'Add menu');
            addMenuBtn.addEventListener('click', function () {
                mutate(function () {
                    const menu = makeMenu({
                        labelFr: tr('Nouveau menu', 'New menu'),
                        labelEn: tr('Nouveau menu', 'New menu'),
                        icon: 'fa-wrench'
                    });
                    root.menus.push(menu);
                    builderSelectedMenuId = menu.id;
                    builderSelectedItemId = null;
                });
            });
            title.appendChild(addMenuBtn);
            top.appendChild(title);

            const tabs = document.createElement('div');
            tabs.className = 'pmk-inav-menu-tabs';
            root.menus.forEach(function (menu, index) {
                const drop = document.createElement('div');
                drop.className = 'pmk-inav-menu-drop';
                drop.addEventListener('dragover', function (event) {
                    if (!dragMenuId) return;
                    event.preventDefault();
                    drop.classList.add('is-over');
                });
                drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
                drop.addEventListener('drop', function (event) {
                    if (!dragMenuId) return;
                    event.preventDefault();
                    drop.classList.remove('is-over');
                    mutate(function () {
                        const from = root.menus.findIndex(function (entry) { return entry && entry.id === dragMenuId; });
                        if (from < 0) return;
                        const moved = root.menus.splice(from, 1)[0];
                        let to = root.menus.findIndex(function (entry) { return entry && entry.id === menu.id; });
                        if (to < 0) to = root.menus.length;
                        root.menus.splice(to, 0, moved);
                    });
                    dragMenuId = '';
                });
                tabs.appendChild(drop);

                const tab = document.createElement('button');
                tab.type = 'button';
                tab.className = 'pmk-inav-menu-tab' + (menu.id === builderSelectedMenuId ? ' is-selected' : '') + (menu.enabled === false ? ' is-disabled' : '');
                tab.draggable = true;
                const icon = effectiveIcon(menu);
                tab.innerHTML = '<span class="pmk-inav-menu-grip" title="' + tr('Glisser pour réordonner', 'Drag to reorder') + '"><i class="fa fa-bars"></i></span>' +
                    (icon ? '<i class="' + iconClass(icon) + '" aria-hidden="true"></i>' : '') +
                    '<span class="pmk-inav-menu-label"></span>';
                tab.querySelector('.pmk-inav-menu-label').textContent = labelOf(menu) || tr('Menu sans nom', 'Unnamed menu');
                tab.addEventListener('click', function () {
                    builderSelectedMenuId = menu.id;
                    builderSelectedItemId = null;
                    paint();
                });
                tab.addEventListener('dragstart', function (event) {
                    dragMenuId = menu.id;
                    tab.classList.add('is-dragging');
                    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
                });
                tab.addEventListener('dragend', function () {
                    dragMenuId = '';
                    tab.classList.remove('is-dragging');
                    host.querySelectorAll('.pmk-inav-menu-drop.is-over').forEach(function (el) { el.classList.remove('is-over'); });
                });
                tabs.appendChild(tab);
            });
            const endDrop = document.createElement('div');
            endDrop.className = 'pmk-inav-menu-drop';
            endDrop.addEventListener('dragover', function (event) { if (dragMenuId) { event.preventDefault(); endDrop.classList.add('is-over'); } });
            endDrop.addEventListener('dragleave', function () { endDrop.classList.remove('is-over'); });
            endDrop.addEventListener('drop', function (event) {
                if (!dragMenuId) return;
                event.preventDefault();
                mutate(function () {
                    const from = root.menus.findIndex(function (entry) { return entry && entry.id === dragMenuId; });
                    if (from < 0) return;
                    root.menus.push(root.menus.splice(from, 1)[0]);
                });
                dragMenuId = '';
            });
            tabs.appendChild(endDrop);
            top.appendChild(tabs);

            const menu = selectedMenu();
            if (menu) {
                const settings = document.createElement('div');
                settings.className = 'pmk-inav-menu-settings';
                const name = document.createElement('input');
                name.type = 'text'; name.className = 'form-control form-control-sm'; name.value = menu.labelFr || '';
                name.addEventListener('input', function () { menu.labelFr = name.value; builderMarkDirty(host); });
                settings.appendChild(builderField(tr('Nom du menu', 'Menu name'), name));
                const iconSelect = document.createElement('select');
                iconSelect.className = 'form-control form-control-sm'; builderIconOptions(iconSelect, menu.icon);
                iconSelect.addEventListener('change', function () { mutate(function () { menu.icon = iconSelect.value; }); });
                settings.appendChild(builderField(tr('Icône', 'Icon'), iconSelect));
                const audience = document.createElement('select'); audience.className='form-control form-control-sm';
                [['all',tr('Tous les agents','All staff')],['superlibrarian',tr('Superlibrarian uniquement','Superlibrarian only')]].forEach(function (entry) {
                    const o=document.createElement('option'); o.value=entry[0]; o.textContent=entry[1]; o.selected=menu.audience===entry[0]; audience.appendChild(o);
                });
                audience.addEventListener('change', function () { mutate(function () { menu.audience=audience.value; }); });
                settings.appendChild(builderField(tr('Accès', 'Access'), audience));
                const menuStateSwitch=builderStateSwitch(menu.enabled!==false,function(checked){
                    mutate(function(){menu.enabled=checked;});
                });
                settings.appendChild(builderField(tr('État','State'),menuStateSwitch));
                top.appendChild(settings);
            }
            host.appendChild(top);

            if (!menu) {
                const empty=document.createElement('div'); empty.className='pmk-inav-empty'; empty.style.margin='14px'; empty.textContent=tr('Aucun menu. Ajoute un menu pour commencer.','No menu. Add one to start.'); host.appendChild(empty); return;
            }

            if (!Array.isArray(menu.items)) menu.items=[];
            const body=document.createElement('div'); body.className='pmk-inav-builder-body';
            const treePane=document.createElement('div'); treePane.className='pmk-inav-tree-pane';
            const toolbar=document.createElement('div'); toolbar.className='pmk-inav-toolbar';
            [
                ['link','fa-link',tr('Lien','Link')],
                ['submenu','fa-folder-open',tr('Sous-menu','Submenu')],
                ['group','fa-font',tr('Groupe','Group')],
                ['separator','fa-minus',tr('Séparateur','Separator')],
                ['action','fa-bolt',tr('Action PMK','PMK action')]
            ].forEach(function (entry) {
                const button=document.createElement('button'); button.type='button'; button.className='btn btn-sm btn-outline-secondary';
                button.innerHTML='<i class="fa '+entry[1]+'" aria-hidden="true"></i> '+entry[2];
                button.addEventListener('click',function(){ mutate(function(){ addItem(entry[0], ''); }); });
                toolbar.appendChild(button);
            });
            treePane.appendChild(toolbar);
            const rootLabel=document.createElement('div'); rootLabel.className='pmk-inav-root-label'; rootLabel.innerHTML='<i class="fa fa-level-down" aria-hidden="true"></i> '+tr('Racine du menu — ordre affiché dans Koha','Menu root — order shown in Koha'); treePane.appendChild(rootLabel);
            const tree=document.createElement('div'); tree.className='pmk-inav-tree';

            function clearDragTargets() {
                tree.querySelectorAll('.is-over').forEach(function (el) { el.classList.remove('is-over'); });
                tree.querySelectorAll('.is-drag-target').forEach(function (el) { el.classList.remove('is-drag-target'); });
            }

            function createDropzone(parentId, beforeId) {
                const zone=document.createElement('div'); zone.className='pmk-inav-dropzone';
                zone.addEventListener('dragover',function(event){ if (!dragItemId) return; event.preventDefault(); clearDragTargets(); zone.classList.add('is-over'); });
                zone.addEventListener('dragleave',function(){ zone.classList.remove('is-over'); });
                zone.addEventListener('drop',function(event){
                    if (!dragItemId) return; event.preventDefault();
                    mutate(function(){ builderMoveItem(menu.items, dragItemId, parentId || '', beforeId || ''); builderSelectedItemId=dragItemId; });
                    dragItemId=''; clearDragTargets();
                });
                return zone;
            }

            function renderLevel(parentId, parentNode) {
                const siblings=builderChildren(menu.items,parentId);
                siblings.forEach(function(item){
                    parentNode.appendChild(createDropzone(parentId,item.id));
                    const wrap=document.createElement('div'); wrap.className='pmk-inav-node-wrap';
                    const node=document.createElement('div');
                    const isContainer=item.kind==='submenu'||item.kind==='group';
                    node.className='pmk-inav-node'+(isContainer?' is-container':'')+(item.kind==='group'?' is-group':'')+(item.kind==='separator'?' is-separator':'')+(item.enabled===false?' is-disabled':'')+(item.id===builderSelectedItemId?' is-selected':'');
                    node.draggable=true; node.dataset.itemId=item.id;
                    const grip=document.createElement('span'); grip.className='pmk-inav-grip'; grip.title=tr('Glisser-déposer','Drag and drop'); grip.innerHTML='<i class="fa fa-bars" aria-hidden="true"></i>'; node.appendChild(grip);
                    if (isContainer) {
                        const collapse=document.createElement('button'); collapse.type='button'; collapse.className='pmk-inav-collapse';
                        collapse.innerHTML='<i class="fa '+(builderCollapsedIds.has(item.id)?'fa-chevron-right':'fa-chevron-down')+'" aria-hidden="true"></i>';
                        collapse.addEventListener('click',function(event){ event.stopPropagation(); if(builderCollapsedIds.has(item.id))builderCollapsedIds.delete(item.id);else builderCollapsedIds.add(item.id); paint(); });
                        node.appendChild(collapse);
                    } else { const ph=document.createElement('span'); ph.className='pmk-inav-collapse-placeholder'; node.appendChild(ph); }
                    if (item.kind==='separator') {
                        const line=document.createElement('span'); line.className='pmk-inav-separator-line'; node.appendChild(line);
                    } else {
                        const icon=document.createElement('span'); icon.className='pmk-inav-node-icon'; const cls=iconClass(effectiveIcon(item)); icon.innerHTML=cls?'<i class="'+cls+'" aria-hidden="true"></i>':''; node.appendChild(icon);
                        const main=document.createElement('span'); main.className='pmk-inav-node-main';
                        const label=document.createElement('span'); label.className='pmk-inav-node-label'; label.textContent=labelOf(item)||tr('Sans libellé','No label'); main.appendChild(label);
                        const meta=document.createElement('span'); meta.className='pmk-inav-node-meta';
                        if(item.kind==='submenu'){ const b=document.createElement('span'); b.className='pmk-inav-badge'; b.textContent=({side:tr('latéral','side'),dropdown:tr('déroulé','dropdown'),mega:tr('méga-menu','mega')})[item.presentation]||tr('latéral','side'); meta.appendChild(b); }
                        if(item.kind==='action'){ const b=document.createElement('span'); b.className='pmk-inav-badge'; b.textContent='PMK'; meta.appendChild(b); }
                        if(item.audience==='superlibrarian'){ const b=document.createElement('span'); b.className='pmk-inav-badge'; b.innerHTML='<i class="fa fa-lock" aria-hidden="true"></i> '+tr('superlibrarian','superlibrarian'); meta.appendChild(b); }
                        if(item.enabled===false){ const b=document.createElement('span'); b.className='pmk-inav-badge'; b.textContent=tr('inactif','disabled'); meta.appendChild(b); }
                        main.appendChild(meta); node.appendChild(main);
                    }
                    const actions=document.createElement('span'); actions.className='pmk-inav-node-actions';
                    if(isContainer){ const add=document.createElement('button'); add.type='button'; add.className='btn btn-sm btn-link'; add.title=tr('Ajouter un lien dans ce niveau','Add a link inside'); add.innerHTML='<i class="fa fa-plus" aria-hidden="true"></i>'; add.addEventListener('click',function(event){ event.stopPropagation(); mutate(function(){ addItem('link',item.id); builderCollapsedIds.delete(item.id); }); }); actions.appendChild(add); }
                    const edit=document.createElement('button'); edit.type='button'; edit.className='btn btn-sm btn-link'; edit.title=tr('Modifier','Edit'); edit.innerHTML='<i class="fa fa-pencil" aria-hidden="true"></i>'; edit.addEventListener('click',function(event){event.stopPropagation();builderSelectedItemId=item.id;paint();}); actions.appendChild(edit);
                    node.appendChild(actions);
                    node.addEventListener('click',function(){builderSelectedItemId=item.id;paint();});
                    node.addEventListener('dragstart',function(event){ dragItemId=item.id; node.classList.add('is-dragging'); if(event.dataTransfer)event.dataTransfer.effectAllowed='move'; });
                    node.addEventListener('dragend',function(){dragItemId='';node.classList.remove('is-dragging');clearDragTargets();});
                    if(isContainer){
                        node.addEventListener('dragover',function(event){
                            if(!dragItemId||dragItemId===item.id)return;
                            const forbidden=descendantsOf(menu.items,dragItemId); if(forbidden.has(item.id))return;
                            event.preventDefault(); clearDragTargets(); wrap.classList.add('is-drag-target');
                        });
                    }
                    wrap.appendChild(node);
                    if(isContainer){
                        const inside=document.createElement('div'); inside.className='pmk-inav-inside-drop'; inside.textContent=tr('Déposer ici pour placer dans « '+(labelOf(item)||'…')+' »','Drop here to place inside “'+(labelOf(item)||'…')+'”');
                        inside.addEventListener('dragover',function(event){if(!dragItemId)return;event.preventDefault();inside.classList.add('is-over');});
                        inside.addEventListener('drop',function(event){ if(!dragItemId)return;event.preventDefault(); mutate(function(){builderMoveItem(menu.items,dragItemId,item.id,'');builderSelectedItemId=dragItemId;builderCollapsedIds.delete(item.id);});dragItemId='';clearDragTargets(); });
                        wrap.appendChild(inside);
                        const children=document.createElement('div'); children.className='pmk-inav-children'+(builderCollapsedIds.has(item.id)?' is-collapsed':''); renderLevel(item.id,children); wrap.appendChild(children);
                    }
                    parentNode.appendChild(wrap);
                });
                parentNode.appendChild(createDropzone(parentId,''));
            }
            renderLevel('',tree);
            if(!menu.items.length){ const empty=document.createElement('div'); empty.className='pmk-inav-empty'; empty.textContent=tr('Le menu est vide. Utilise les boutons ci-dessus pour commencer.','This menu is empty. Use the buttons above to start.'); tree.appendChild(empty); }
            treePane.appendChild(tree);
            const hint=document.createElement('div'); hint.className='pmk-inav-builder-hint'; hint.innerHTML='<i class="fa fa-info-circle" aria-hidden="true"></i> '+tr('Les retraits représentent exactement les niveaux. Glisse un élément sur un sous-menu/groupe pour l’y placer, ou sur une ligne d’insertion pour choisir sa position exacte.','Indentation exactly represents levels. Drag an item onto a submenu/group to nest it, or onto an insertion line for its exact position.'); treePane.appendChild(hint);
            body.appendChild(treePane);

            const props=document.createElement('div'); props.className='pmk-inav-properties';
            const item=menu.items.find(function(entry){return entry&&entry.id===builderSelectedItemId;});
            if(!item){ const empty=document.createElement('div'); empty.className='pmk-inav-props-empty'; empty.innerHTML='<strong>'+tr('Propriétés','Properties')+'</strong><p>'+tr('Sélectionne un élément du menu pour modifier son libellé, son type, son icône, son accès ou son comportement.','Select a menu item to edit its label, type, icon, access or behavior.')+'</p>'; props.appendChild(empty); }
            else {
                const ptitle=document.createElement('div'); ptitle.className='pmk-inav-props-title'; const strong=document.createElement('strong'); strong.textContent=item.kind==='separator'?tr('Séparateur','Separator'):(labelOf(item)||tr('Élément','Item')); ptitle.appendChild(strong); const idbadge=document.createElement('span'); idbadge.className='pmk-inav-badge'; idbadge.textContent=item.kind; ptitle.appendChild(idbadge); props.appendChild(ptitle);
                const grid=document.createElement('div'); grid.className='pmk-inav-props-grid';
                const itemStateSwitch=builderStateSwitch(item.enabled!==false,function(checked){
                    mutate(function(){item.enabled=checked;});
                });
                grid.appendChild(builderField(tr('État','State'),itemStateSwitch));
                const kind=document.createElement('select'); kind.className='form-control form-control-sm'; [['link',tr('Lien','Link')],['submenu',tr('Sous-menu','Submenu')],['group',tr('Groupe / titre','Group / heading')],['separator',tr('Séparateur','Separator')],['action',tr('Action PMK','PMK action')]].forEach(function(entry){const o=document.createElement('option');o.value=entry[0];o.textContent=entry[1];o.selected=item.kind===entry[0];kind.appendChild(o);});
                kind.addEventListener('change',function(){ mutate(function(){ const wasContainer=item.kind==='submenu'||item.kind==='group'; const willContainer=kind.value==='submenu'||kind.value==='group'; item.kind=kind.value; if(wasContainer&&!willContainer){menu.items.forEach(function(child){if(child&&child.parentId===item.id)child.parentId=item.parentId||'';});} if(item.kind==='submenu'&&!item.presentation)item.presentation='side'; builderNormalizeOrder(menu.items); }); }); grid.appendChild(builderField(tr('Type','Type'),kind));
                if(item.kind!=='separator'){
                    const fr=document.createElement('input');fr.type='text';fr.className='form-control form-control-sm';fr.value=item.labelFr||'';fr.addEventListener('input',function(){item.labelFr=fr.value;builderMarkDirty(host);strong.textContent=fr.value||item.labelEn||tr('Élément','Item');});grid.appendChild(builderField(tr('Libellé français','French label'),fr,true));
                    const en=document.createElement('input');en.type='text';en.className='form-control form-control-sm';en.value=item.labelEn||'';en.addEventListener('input',function(){item.labelEn=en.value;builderMarkDirty(host);});grid.appendChild(builderField(tr('Libellé anglais','English label'),en,true));
                }
                if(item.kind!=='separator'&&item.kind!=='group'){
                    const icon=document.createElement('select');icon.className='form-control form-control-sm';builderIconOptions(icon,item.icon);icon.addEventListener('change',function(){mutate(function(){item.icon=icon.value;});});grid.appendChild(builderField(tr('Icône','Icon'),icon));
                    const custom=document.createElement('input');custom.type='text';custom.className='form-control form-control-sm';custom.value=item.iconCustom||'';custom.placeholder='fa-solid fa-star';custom.addEventListener('input',function(){item.iconCustom=custom.value;builderMarkDirty(host);});grid.appendChild(builderField(tr('Icône personnalisée','Custom icon'),custom));
                }
                const audience=document.createElement('select');audience.className='form-control form-control-sm';[['inherit',tr('Hériter du parent','Inherit from parent')],['all',tr('Tous les agents','All staff')],['superlibrarian',tr('Superlibrarian uniquement','Superlibrarian only')]].forEach(function(entry){const o=document.createElement('option');o.value=entry[0];o.textContent=entry[1];o.selected=(item.audience||'inherit')===entry[0];audience.appendChild(o);});audience.addEventListener('change',function(){mutate(function(){item.audience=audience.value;});});grid.appendChild(builderField(tr('Accès','Access'),audience,true));
                if(item.kind==='submenu'){
                    const presentation=document.createElement('select');presentation.className='form-control form-control-sm';[['side',tr('Latéral','Side')],['dropdown',tr('Déroulé vertical','Vertical dropdown')],['mega',tr('Méga-menu','Mega menu')]].forEach(function(entry){const o=document.createElement('option');o.value=entry[0];o.textContent=entry[1];o.selected=(item.presentation||'side')===entry[0];presentation.appendChild(o);});presentation.addEventListener('change',function(){mutate(function(){item.presentation=presentation.value;});});grid.appendChild(builderField(tr('Présentation','Presentation'),presentation));
                    if((item.presentation||'side')==='mega'){const cols=document.createElement('select');cols.className='form-control form-control-sm';[2,3,4].forEach(function(v){const o=document.createElement('option');o.value=String(v);o.textContent=v+' '+tr('colonnes','columns');o.selected=Number(item.megaColumns||3)===v;cols.appendChild(o);});cols.addEventListener('change',function(){mutate(function(){item.megaColumns=Number(cols.value);});});grid.appendChild(builderField(tr('Colonnes','Columns'),cols));}
                }
                if(item.kind==='link'||(item.kind==='action'&&item.actionId==='dashboard')){
                    const url=document.createElement('input');url.type='text';url.className='form-control form-control-sm';url.value=item.url||'';url.addEventListener('input',function(){item.url=url.value;builderMarkDirty(host);});grid.appendChild(builderField('URL',url,true));
                    const target=document.createElement('select');target.className='form-control form-control-sm';[['same',tr('Même onglet','Same tab')],['new',tr('Nouvel onglet','New tab')]].forEach(function(entry){const o=document.createElement('option');o.value=entry[0];o.textContent=entry[1];o.selected=(item.target||'same')===entry[0];target.appendChild(o);});target.addEventListener('change',function(){mutate(function(){item.target=target.value;});});grid.appendChild(builderField(tr('Ouverture','Open in'),target,true));
                }
                if(item.kind==='action'){
                    const action=document.createElement('select');action.className='form-control form-control-sm';builderActionOptions(action,item.actionId);action.addEventListener('change',function(){mutate(function(){item.actionId=action.value;});});grid.appendChild(builderField(tr('Action PMK','PMK action'),action,true));
                }
                props.appendChild(grid);
                const actions=document.createElement('div');actions.className='pmk-inav-props-actions';
                const duplicate=document.createElement('button');duplicate.type='button';duplicate.className='btn btn-sm btn-outline-secondary';duplicate.innerHTML='<i class="fa fa-copy" aria-hidden="true"></i> '+tr('Dupliquer','Duplicate');duplicate.addEventListener('click',function(){mutate(function(){const copy=builderDuplicateItem(menu,item.id);if(copy)builderSelectedItemId=copy.id;});});actions.appendChild(duplicate);
                if(item.kind==='submenu'||item.kind==='group'){const addChild=document.createElement('button');addChild.type='button';addChild.className='btn btn-sm btn-outline-primary';addChild.innerHTML='<i class="fa fa-plus" aria-hidden="true"></i> '+tr('Ajouter dedans','Add inside');addChild.addEventListener('click',function(){mutate(function(){addItem('link',item.id);builderCollapsedIds.delete(item.id);});});actions.appendChild(addChild);}
                const remove=document.createElement('button');remove.type='button';remove.className='btn btn-sm btn-outline-danger';remove.innerHTML='<i class="fa fa-trash" aria-hidden="true"></i> '+tr('Supprimer','Delete');remove.addEventListener('click',function(){const count=descendantsOf(menu.items,item.id).size;const msg=count?tr('Supprimer cet élément et ses '+count+' élément(s) enfant(s) ?','Delete this item and its '+count+' child item(s)?'):tr('Supprimer cet élément ?','Delete this item?');if(!window.confirm(msg))return;mutate(function(){builderRemoveItem(menu,item.id);builderSelectedItemId=null;});});actions.appendChild(remove);
                props.appendChild(actions);
            }
            body.appendChild(props); host.appendChild(body);
        }
        paint();
        return host;
    }

    function moduleSchema() {
        return [
            {
                key: 'removeLegacyHardcodedMenu',
                type: 'boolean',
                label: {
                    fr: 'Remplacer le menu Outils historique de IntranetNav',
                    en: 'Replace the historical IntranetNav Tools menu'
                },
                help: {
                    fr: 'Supprime #custom-tools-menu pour éviter les doublons pendant la migration. Activé par défaut.',
                    en: 'Removes #custom-tools-menu to avoid duplicates during migration. Enabled by default.'
                }
            },
            {
                key: 'hideLegacyListsButton',
                type: 'boolean',
                label: {
                    fr: 'Masquer l’ancien bouton « Listes » de la barre basse',
                    en: 'Hide the old Lists button from the bottom bar'
                },
                help: {
                    fr: 'Le bouton #sidebar5 n’est masqué que si une action « Listes personnelles » active existe dans un menu visible.',
                    en: 'The #sidebar5 button is hidden only when an active Personal lists action exists in a visible menu.'
                }
            },
            {
                key: 'hideLegacyHistoryButton',
                type: 'boolean',
                label: {
                    fr: 'Masquer l’ancien bouton « Historique » de la barre basse',
                    en: 'Hide the old History button from the bottom bar'
                },
                help: {
                    fr: 'Le bouton #historique n’est masqué que si une action « Historique récent » active existe dans un menu visible et que le module 071 est disponible.',
                    en: 'The #historique button is hidden only when a visible Recent history action exists and module 071 is available.'
                }
            },
            {
                key: 'hideLegacyAdvancedSearchButton',
                type: 'boolean',
                label: {
                    fr: 'Masquer l’ancien bouton « Recherche avancée » de la barre basse',
                    en: 'Hide the old Advanced search button from the bottom bar'
                },
                help: {
                    fr: 'Le bouton #advancedSearch n’est masqué que si une action « Recherche avancée » active existe dans un menu visible et que le module 075 est disponible.',
                    en: 'The #advancedSearch button is hidden only when a visible Advanced search action exists and module 075 is available.'
                }
            },
            {
                key: 'hideLegacyGuidesButton',
                type: 'boolean',
                label: {
                    fr: 'Masquer l’ancien bouton « Aide & formation » de la barre basse',
                    en: 'Hide the old Help & training button from the bottom bar'
                },
                help: {
                    fr: 'Le bouton #tutoriel n’est masqué que si au moins un accès Guides & formation actif existe dans un menu visible et que le module 135 est disponible.',
                    en: 'The #tutoriel button is hidden only when at least one visible Guides & training action exists and module 135 is available.'
                }
            },
            {
                key: 'collapseLabelsOnSmallScreens',
                type: 'boolean',
                label: {
                    fr: 'N’afficher que les icônes des menus principaux sur petit écran',
                    en: 'Show only top-level menu icons on small screens'
                }
            },
            {
                key: '_builderSignal',
                type: 'text',
                label: { fr: 'Signal interne du constructeur', en: 'Builder internal signal' }
            },
            {
                type: 'custom',
                label: { fr: 'Composition visuelle du menu', en: 'Visual menu builder' },
                render: renderIntranetNavBuilder,
                help: {
                    fr: 'Cette vue représente les niveaux, séparateurs, groupes, sous-menus et l’ordre réellement utilisés dans IntranetNav. Glisse-dépose les éléments pour les réordonner ou changer de niveau. Les réglages techniques complets restent disponibles dans Réglages avancés.',
                    en: 'This view represents the actual levels, separators, groups, submenus and order used in IntranetNav. Drag and drop items to reorder or move them between levels. Full technical settings remain available in Advanced settings.'
                }
            },
            {
                key: 'menus',
                type: 'repeater',
                advanced: true,
                label: { fr: 'Menus IntranetNav', en: 'IntranetNav menus' },
                addLabel: { fr: 'Ajouter un menu', en: 'Add menu' },
                reorder: true,
                newItem: newMenu,
                liveTitleKey: 'labelFr',
                itemTitle: function (item, index, lang) {
                    const value = lang === 'en'
                        ? String(item && (item.labelEn || item.labelFr) || '')
                        : String(item && (item.labelFr || item.labelEn) || '');
                    return value.trim() || (lang === 'en' ? 'Menu ' : 'Menu ') + (index + 1);
                },
                fields: [
                    { key: 'enabled', type: 'boolean', label: { fr: 'Menu actif', en: 'Menu enabled' } },
                    { key: 'labelFr', type: 'text', label: { fr: 'Nom — français', en: 'Name — French' } },
                    { key: 'labelEn', type: 'text', label: { fr: 'Nom — anglais', en: 'Name — English' } },
                    {
                        key: 'icon', type: 'select', label: { fr: 'Icône', en: 'Icon' }, options: iconOptions
                    },
                    {
                        key: 'iconCustom', type: 'text', label: { fr: 'Icône personnalisée', en: 'Custom icon' },
                        advanced: true,
                        placeholder: { fr: 'Ex. fa-solid fa-star', en: 'E.g. fa-solid fa-star' },
                        help: {
                            fr: 'Optionnel. Si renseigné, remplace l’icône choisie ci-dessus.',
                            en: 'Optional. When filled, overrides the icon selected above.'
                        }
                    },
                    {
                        key: 'audience', type: 'select', label: { fr: 'Accès', en: 'Access' },
                        options: [
                            { value: 'all', label: { fr: 'Tous les agents', en: 'All staff' } },
                            { value: 'superlibrarian', label: { fr: 'Superlibrarian uniquement', en: 'Superlibrarian only' } }
                        ]
                    },
                    { key: 'id', type: 'text', readOnly: true, advanced: true, label: { fr: 'Identifiant technique', en: 'Technical ID' } },
                    {
                        key: 'items',
                        type: 'repeater',
                        label: { fr: 'Éléments du menu', en: 'Menu items' },
                        addLabel: { fr: 'Ajouter un élément', en: 'Add item' },
                        reorder: true,
                        newItem: newItem,
                        liveTitleKey: 'labelFr',
                        itemTitle: function (item, index, lang) {
                            if (item && item.kind === 'separator') return lang === 'en' ? 'Separator' : 'Séparateur';
                            const value = lang === 'en'
                                ? String(item && (item.labelEn || item.labelFr) || '')
                                : String(item && (item.labelFr || item.labelEn) || '');
                            return value.trim() || (lang === 'en' ? 'Item ' : 'Élément ') + (index + 1);
                        },
                        fields: [
                            { key: 'enabled', type: 'boolean', label: { fr: 'Élément actif', en: 'Item enabled' } },
                            {
                                key: 'kind', type: 'select', refreshOnChange: true,
                                label: { fr: 'Type', en: 'Type' },
                                options: [
                                    { value: 'link', label: { fr: 'Lien', en: 'Link' } },
                                    { value: 'submenu', label: { fr: 'Sous-menu', en: 'Submenu' } },
                                    { value: 'group', label: { fr: 'Groupe / titre', en: 'Group / heading' } },
                                    { value: 'separator', label: { fr: 'Séparateur', en: 'Separator' } },
                                    { value: 'action', label: { fr: 'Action PMK', en: 'PMK action' } }
                                ]
                            },
                            {
                                key: 'parentId', type: 'select',
                                label: { fr: 'Placer dans', en: 'Place inside' },
                                options: parentOptions,
                                help: {
                                    fr: 'Choisis la racine, un groupe ou n’importe quel sous-menu. Cette relation permet une profondeur de sous-menus libre.',
                                    en: 'Choose the root, a group, or any submenu. This relation allows unrestricted submenu depth.'
                                }
                            },
                            {
                                key: 'labelFr', type: 'text', label: { fr: 'Libellé — français', en: 'Label — French' },
                                when: function (root, path) { return itemKind(root, path) !== 'separator'; }
                            },
                            {
                                key: 'labelEn', type: 'text', label: { fr: 'Libellé — anglais', en: 'Label — English' },
                                when: function (root, path) { return itemKind(root, path) !== 'separator'; }
                            },
                            {
                                key: 'icon', type: 'select', label: { fr: 'Icône', en: 'Icon' }, options: iconOptions,
                                when: function (root, path) {
                                    const kind = itemKind(root, path);
                                    return kind !== 'separator' && kind !== 'group';
                                }
                            },
                            {
                                key: 'iconCustom', type: 'text', label: { fr: 'Icône personnalisée', en: 'Custom icon' },
                                advanced: true,
                                placeholder: { fr: 'Ex. fa-solid fa-star', en: 'E.g. fa-solid fa-star' },
                                when: function (root, path) {
                                    const kind = itemKind(root, path);
                                    return kind !== 'separator' && kind !== 'group';
                                }
                            },
                            {
                                key: 'presentation', type: 'select', refreshOnChange: true,
                                label: { fr: 'Présentation du sous-menu', en: 'Submenu presentation' },
                                when: function (root, path) { return itemKind(root, path) === 'submenu'; },
                                options: [
                                    { value: 'side', label: { fr: 'Latéral', en: 'Side' } },
                                    { value: 'dropdown', label: { fr: 'Déroulé vertical', en: 'Vertical dropdown' } },
                                    { value: 'mega', label: { fr: 'Méga-menu', en: 'Mega menu' } }
                                ],
                                help: {
                                    fr: 'Latéral conserve le comportement historique. Déroulé développe le contenu dans le menu courant. Méga-menu ouvre un panneau large en colonnes.',
                                    en: 'Side preserves the historical behavior. Vertical dropdown expands inside the current menu. Mega menu opens a wide multi-column panel.'
                                }
                            },
                            {
                                key: 'megaColumns', type: 'select',
                                label: { fr: 'Colonnes du méga-menu', en: 'Mega menu columns' },
                                when: function (root, path) {
                                    const item = itemAtPath(root, path);
                                    return itemKind(root, path) === 'submenu' && item && item.presentation === 'mega';
                                },
                                options: [
                                    { value: 2, label: { fr: '2 colonnes', en: '2 columns' } },
                                    { value: 3, label: { fr: '3 colonnes', en: '3 columns' } },
                                    { value: 4, label: { fr: '4 colonnes', en: '4 columns' } }
                                ]
                            },
                            {
                                key: 'audience', type: 'select', label: { fr: 'Accès', en: 'Access' },
                                options: [
                                    { value: 'inherit', label: { fr: 'Hériter du parent', en: 'Inherit from parent' } },
                                    { value: 'all', label: { fr: 'Tous les agents', en: 'All staff' } },
                                    { value: 'superlibrarian', label: { fr: 'Superlibrarian uniquement', en: 'Superlibrarian only' } }
                                ]
                            },
                            {
                                key: 'url', type: 'text', label: { fr: 'URL', en: 'URL' },
                                when: function (root, path) {
                                    const kind = itemKind(root, path);
                                    if (kind === 'link') return true;
                                    const item = itemAtPath(root, path);
                                    return kind === 'action' && item && item.actionId === 'dashboard';
                                }
                            },
                            {
                                key: 'target', type: 'select', label: { fr: 'Ouverture', en: 'Open in' },
                                when: function (root, path) {
                                    const kind = itemKind(root, path);
                                    if (kind === 'link') return true;
                                    const item = itemAtPath(root, path);
                                    return kind === 'action' && item && item.actionId === 'dashboard';
                                },
                                options: [
                                    { value: 'same', label: { fr: 'Même onglet', en: 'Same tab' } },
                                    { value: 'new', label: { fr: 'Nouvel onglet', en: 'New tab' } }
                                ]
                            },
                            {
                                key: 'actionId', type: 'select', refreshOnChange: true,
                                label: { fr: 'Action', en: 'Action' },
                                when: function (root, path) { return itemKind(root, path) === 'action'; },
                                options: [
                                    { value: '', label: { fr: 'Choisir une action', en: 'Choose an action' } },
                                    { value: 'personal-lists', label: { fr: 'Ouvrir les listes personnelles (066-067)', en: 'Open personal lists (066-067)' } },
                                    { value: 'recent-history', label: { fr: 'Ouvrir l’historique récent (071)', en: 'Open recent history (071)' } },
                                    { value: 'advanced-search', label: { fr: 'Ouvrir la recherche avancée (075)', en: 'Open advanced search (075)' } },
                                    { value: 'attendance-mediabus', label: { fr: 'Afficher le compteur Médiabus (139)', en: 'Show Mediabus counter (139)' } },
                                    { value: 'guides-current', label: { fr: 'Lancer le guide de cet écran (135)', en: 'Start guide for this screen (135)' } },
                                    { value: 'guides-catalogue', label: { fr: 'Ouvrir les parcours de formation (135)', en: 'Open training paths (135)' } },
                                    { value: 'guides-assist-toggle', label: { fr: 'Activer / désactiver le mode accompagnement (135)', en: 'Toggle contextual assistance (135)' } },
                                    { value: 'dashboard', label: { fr: 'Ouvrir le tableau de bord', en: 'Open dashboard' } }
                                ]
                            },
                            { key: 'id', type: 'text', readOnly: true, advanced: true, label: { fr: 'Identifiant technique', en: 'Technical ID' } }
                        ]
                    }
                ]
            }
        ];
    }

    function validateConfig(config) {
        const lang = language();
        const menus = Array.isArray(config && config.menus) ? config.menus : [];
        const menuIds = new Set();

        for (const menu of menus) {
            const menuId = String(menu && menu.id || '').trim();
            if (!menuId || menuIds.has(menuId)) {
                return { ok: false, message: lang === 'en' ? 'Each main menu must have a unique technical ID.' : 'Chaque menu principal doit avoir un identifiant technique unique.' };
            }
            menuIds.add(menuId);

            const items = Array.isArray(menu.items) ? menu.items : [];
            const byId = new Map();
            for (const item of items) {
                const id = String(item && item.id || '').trim();
                if (!id || byId.has(id)) {
                    return { ok: false, message: lang === 'en' ? 'Each menu item must have a unique technical ID.' : 'Chaque élément de menu doit avoir un identifiant technique unique.' };
                }
                byId.set(id, item);
            }

            for (const item of items) {
                const parentId = String(item.parentId || '').trim();
                if (!parentId) continue;
                const parent = byId.get(parentId);
                if (!parent || (parent.kind !== 'submenu' && parent.kind !== 'group')) {
                    return { ok: false, message: lang === 'en' ? 'A menu item references an invalid parent.' : 'Un élément de menu référence un parent invalide.' };
                }

                const visited = new Set([item.id]);
                let cursor = parent;
                while (cursor) {
                    if (visited.has(cursor.id)) {
                        return { ok: false, message: lang === 'en' ? 'A cycle was detected in the menu hierarchy.' : 'Une boucle a été détectée dans l’arborescence du menu.' };
                    }
                    visited.add(cursor.id);
                    cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
                }
            }
        }

        return { ok: true };
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .${OWN_CLASS} .dropdown-menu {
                background-color: #fff;
                color: #212529;
                border: 1px solid rgba(0,0,0,.15);
                box-shadow: 0 .25rem .75rem rgba(0,0,0,.12);
            }
            .${OWN_CLASS} .dropdown-item {
                color: #212529;
            }
            .${OWN_CLASS} .dropdown-item:hover,
            .${OWN_CLASS} .dropdown-item:focus {
                color: #16181b;
                background-color: #f1f3f5;
            }
            .${OWN_CLASS} .dropdown-header {
                color: #6c757d;
                font-weight: 600;
            }
            .${OWN_CLASS} .dropdown-divider {
                border-color: #dee2e6;
            }
            .${OWN_CLASS} .pmk-nav-submenu {
                position: relative;
            }
            .${OWN_CLASS} .pmk-nav-submenu > .pmk-submenu-toggle {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: .75rem;
                width: 100%;
                border: 0;
                background: transparent;
                text-align: left;
            }
            .${OWN_CLASS} .pmk-submenu-label {
                display: inline-flex;
                align-items: center;
                gap: .25rem;
                min-width: 0;
            }
            .${OWN_CLASS} .pmk-submenu-caret {
                margin-left: auto;
                transition: transform .15s ease;
            }
            .${OWN_CLASS} .pmk-nav-submenu.show > .pmk-submenu-toggle .pmk-submenu-caret {
                transform: rotate(90deg);
            }
            .${OWN_CLASS} .pmk-nav-submenu.pmk-submenu-side > .dropdown-menu {
                top: 0;
                left: 100%;
                margin-top: -.35rem;
                margin-left: .15rem;
                min-width: 250px;
            }
            .${OWN_CLASS} .pmk-nav-submenu.pmk-submenu-dropdown > .dropdown-menu {
                position: static !important;
                float: none !important;
                transform: none !important;
                margin: .15rem .4rem .35rem 1rem;
                border: 0;
                border-left: 2px solid #dee2e6;
                border-radius: 0;
                box-shadow: none;
                min-width: 0;
                padding-top: .15rem;
                padding-bottom: .15rem;
            }
            .${OWN_CLASS} .pmk-nav-submenu.pmk-submenu-dropdown > .pmk-submenu-toggle .pmk-submenu-caret {
                transform: rotate(90deg);
            }
            .${OWN_CLASS} .pmk-nav-submenu.pmk-submenu-dropdown.show > .pmk-submenu-toggle .pmk-submenu-caret {
                transform: rotate(270deg);
            }
            .${OWN_CLASS} .pmk-nav-submenu.pmk-submenu-mega > .dropdown-menu {
                top: 0;
                left: 100%;
                margin-top: -.35rem;
                margin-left: .15rem;
                width: min(760px, 72vw);
                min-width: 520px;
                padding: .65rem;
                display: none;
                grid-template-columns: repeat(var(--pmk-mega-columns, 3), minmax(0,1fr));
                gap: .2rem .65rem;
            }
            .${OWN_CLASS} .pmk-nav-submenu.pmk-submenu-mega > .dropdown-menu.show {
                display: grid;
            }
            .${OWN_CLASS} .pmk-nav-submenu.pmk-submenu-mega > .dropdown-menu > li {
                min-width: 0;
            }
            .${OWN_CLASS} .pmk-nav-submenu > .dropdown-menu.show {
                display: block;
            }
            .${OWN_CLASS} .pmk-nav-submenu.pmk-submenu-mega > .dropdown-menu.show {
                display: grid;
            }
            .${OWN_CLASS} .pmk-nav-group-children > .dropdown-item {
                padding-left: 1.55rem;
            }
            html.${LEGACY_LISTS_CLASS} #bottomActionBar #sidebar5 {
                display: none !important;
            }
            html.${LEGACY_HISTORY_CLASS} #bottomActionBar #historique {
                display: none !important;
            }
            html.${LEGACY_ADVANCED_CLASS} #bottomActionBar #advancedSearch {
                display: none !important;
            }
            html.${LEGACY_GUIDES_CLASS} #bottomActionBar #tutoriel {
                display: none !important;
            }
            @media (max-width: 991.98px) {
                .${OWN_CLASS} .pmk-nav-submenu > .dropdown-menu {
                    position: static !important;
                    float: none;
                    transform: none !important;
                    margin: .15rem .4rem .35rem 1rem;
                    border: 0;
                    border-left: 2px solid #dee2e6;
                    border-radius: 0;
                    box-shadow: none;
                    min-width: 0;
                }
                .${OWN_CLASS} .pmk-nav-submenu.pmk-submenu-mega > .dropdown-menu,
                .${OWN_CLASS} .pmk-nav-submenu.pmk-submenu-mega > .dropdown-menu.show {
                    width: auto;
                    min-width: 0;
                    display: block;
                    grid-template-columns: 1fr;
                }
                .${OWN_CLASS}.pmk-collapse-label .nav-label {
                    display: none !important;
                }
                .${OWN_CLASS}.pmk-collapse-label > .nav-link i {
                    margin-right: 0 !important;
                }
                .${OWN_CLASS}.pmk-collapse-label > .nav-link {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding-left: .65rem;
                    padding-right: .65rem;
                }
                .${OWN_CLASS}.pmk-collapse-label > .dropdown-toggle::after {
                    display: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function removeOwnMenus() {
        document.querySelectorAll('.' + OWN_CLASS).forEach(function (node) { node.remove(); });
    }

    function removeLegacyMenu() {
        const legacy = document.getElementById('custom-tools-menu');
        if (legacy) legacy.remove();
    }

    function topLevelMenu() {
        return document.getElementById('toplevelmenu');
    }

    function moreMenuItem(ul) {
        return Array.from((ul && ul.children) || []).find(function (item) {
            return !!item.querySelector('a.nav-link i.fa-bars, a.nav-link i.fa-solid.fa-bars');
        }) || null;
    }

    function listActionAvailable() {
        if (window.PMKPersonalLists) return window.PMKPersonalLists.enabled !== false;
        return true;
    }

    function historyActionAvailable() {
        if (window.PMKHistory071) return window.PMKHistory071.enabled !== false;
        if (window.PMKRecentHistory) return window.PMKRecentHistory.enabled !== false;
        if (window.PMKHistory) return window.PMKHistory.enabled !== false;
        return !!((window.KOHA_HISTORY && typeof window.KOHA_HISTORY.open === 'function') || typeof window.openNav === 'function');
    }

    function advancedSearchActionAvailable() {
        if (window.PMKAdvancedSearch) return window.PMKAdvancedSearch.enabled !== false;
        return !!(window.__kohaAdvancedSearchSidebarV2 || typeof window.openAdvancedSearchSidebar === 'function' || typeof window.toggleAdvancedSearchSidebar === 'function');
    }

    function attendanceMediabusActionAvailable() {
        const bridge = window.PMKAttendanceMediabus;
        return !!(bridge && bridge.available === true && bridge.enabled !== false && typeof bridge.open === 'function');
    }

    function guidesModuleAvailable() {
        if (window.PMKGuidesTraining) return window.PMKGuidesTraining.enabled !== false;
        return !!window.KOHA_GUIDES;
    }

    function guidesCurrentActionAvailable() {
        if (!guidesModuleAvailable()) return false;
        if (window.PMKGuidesTraining && typeof window.PMKGuidesTraining.canStartCurrent === 'function') {
            try { return !!window.PMKGuidesTraining.canStartCurrent(); } catch (_) { return false; }
        }
        try {
            return !!(window.KOHA_GUIDES && typeof window.KOHA_GUIDES.currentGuide === 'function' && window.KOHA_GUIDES.currentGuide());
        } catch (_) { return false; }
    }

    function guidesCatalogueActionAvailable() {
        if (!guidesModuleAvailable()) return false;
        if (window.PMKGuidesTraining && typeof window.PMKGuidesTraining.canOpenCatalogue === 'function') {
            try { return !!window.PMKGuidesTraining.canOpenCatalogue(); } catch (_) { return false; }
        }
        return !!(window.KOHA_GUIDES && typeof window.KOHA_GUIDES.openCatalogue === 'function');
    }

    function guidesAssistActionAvailable() {
        if (!guidesModuleAvailable()) return false;
        if (window.PMKGuidesTraining && typeof window.PMKGuidesTraining.canUseAssist === 'function') {
            try { return !!window.PMKGuidesTraining.canUseAssist(); } catch (_) { return false; }
        }
        return !!(window.KOHA_GUIDES && window.KOHA_GUIDES.assist && typeof window.KOHA_GUIDES.assist.setEnabled === 'function');
    }

    function hasVisibleAction(config, actionId, availableFn) {
        if (!config || config.enabled === false) return false;
        if (typeof availableFn === 'function' && !availableFn()) return false;

        return (config.menus || []).some(function (menu) {
            if (!menu || menu.enabled === false || !canSee(menu.audience, 'all')) return false;
            const byId = new Map((menu.items || []).map(function (item) { return [item.id, item]; }));

            function visibleThroughParents(item) {
                let audience = menu.audience || 'all';
                let cursor = item;
                const visited = new Set();
                const chain = [];
                while (cursor) {
                    if (visited.has(cursor.id)) return false;
                    visited.add(cursor.id);
                    chain.unshift(cursor);
                    cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
                }
                for (const node of chain) {
                    if (!node || node.enabled === false) return false;
                    audience = inheritedAudience(node.audience, audience);
                    if (!canSee(audience, audience)) return false;
                }
                return true;
            }

            return (menu.items || []).some(function (item) {
                return item && item.kind === 'action' && item.actionId === actionId && visibleThroughParents(item);
            });
        });
    }

    function syncLegacyButtons(config) {
        const enabled = !!(config && config.enabled !== false);

        const hideLists = !!(
            enabled &&
            config.hideLegacyListsButton !== false &&
            hasVisibleAction(config, 'personal-lists', listActionAvailable)
        );
        const hideHistory = !!(
            enabled &&
            config.hideLegacyHistoryButton !== false &&
            hasVisibleAction(config, 'recent-history', historyActionAvailable)
        );
        const hideAdvanced = !!(
            enabled &&
            config.hideLegacyAdvancedSearchButton !== false &&
            hasVisibleAction(config, 'advanced-search', advancedSearchActionAvailable)
        );
        const hideGuides = !!(
            enabled &&
            config.hideLegacyGuidesButton !== false &&
            (
                hasVisibleAction(config, 'guides-current', guidesCurrentActionAvailable) ||
                hasVisibleAction(config, 'guides-catalogue', guidesCatalogueActionAvailable) ||
                hasVisibleAction(config, 'guides-assist-toggle', guidesAssistActionAvailable)
            )
        );

        document.documentElement.classList.toggle(LEGACY_LISTS_CLASS, hideLists);
        document.documentElement.classList.toggle(LEGACY_HISTORY_CLASS, hideHistory);
        document.documentElement.classList.toggle(LEGACY_ADVANCED_CLASS, hideAdvanced);
        document.documentElement.classList.toggle(LEGACY_GUIDES_CLASS, hideGuides);
    }

    function childrenOf(items, parentId) {
        const wanted = String(parentId || '');
        return (items || []).filter(function (item) {
            return item && String(item.parentId || '') === wanted;
        });
    }

    function closeSiblingSubmenus(li) {
        const parent = li && li.parentElement;
        if (!parent) return;
        Array.from(parent.children).forEach(function (sibling) {
            if (sibling === li || !sibling.classList) return;
            if (sibling.classList.contains('pmk-nav-submenu')) {
                sibling.classList.remove('show');
                const menu = sibling.querySelector(':scope > .dropdown-menu');
                const toggle = sibling.querySelector(':scope > .pmk-submenu-toggle');
                if (menu) menu.classList.remove('show');
                if (toggle) toggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    function closeAllSubmenus(root) {
        if (!root) return;
        root.querySelectorAll('.pmk-nav-submenu.show').forEach(function (li) {
            li.classList.remove('show');
            const menu = li.querySelector(':scope > .dropdown-menu');
            const toggle = li.querySelector(':scope > .pmk-submenu-toggle');
            if (menu) menu.classList.remove('show');
            if (toggle) toggle.setAttribute('aria-expanded', 'false');
        });
    }

    function closeTopDropdown(node) {
        const root = node && node.closest ? node.closest('.' + OWN_CLASS) : null;
        const toggle = root && root.querySelector(':scope > .nav-link.dropdown-toggle');
        if (!toggle) return;
        try {
            if (window.bootstrap && window.bootstrap.Dropdown) {
                window.bootstrap.Dropdown.getOrCreateInstance(toggle).hide();
            }
        } catch (_) {}
    }

    function runAction(item, event) {
        const actionId = String(item.actionId || '');
        if (actionId === 'personal-lists') {
            if (event) event.preventDefault();
            const bridge = window.PMKPersonalLists;
            if (bridge && typeof bridge.open === 'function') {
                bridge.open();
            } else if (typeof window.toggleSidebar5 === 'function') {
                window.toggleSidebar5();
            } else {
                try { document.dispatchEvent(new CustomEvent('pmk:open-personal-lists')); } catch (_) {}
            }
            closeTopDropdown(event && event.currentTarget);
            return;
        }

        if (actionId === 'recent-history') {
            if (event) event.preventDefault();

            const bridges = [
                window.PMKHistory071,
                window.PMKRecentHistory,
                window.PMKHistory
            ].filter(Boolean);
            const bridge = bridges.find(function (candidate) {
                return candidate && candidate.enabled !== false && typeof candidate.open === 'function';
            });

            if (bridge) {
                bridge.open();
            } else if (window.KOHA_HISTORY && typeof window.KOHA_HISTORY.open === 'function') {
                window.KOHA_HISTORY.open();
            } else if (typeof window.openNav === 'function') {
                window.openNav();
            } else {
                try { document.dispatchEvent(new CustomEvent('koha:requestOpenHistory')); } catch (_) {}
            }
            closeTopDropdown(event && event.currentTarget);
            return;
        }

        if (actionId === 'advanced-search') {
            if (event) event.preventDefault();

            const bridge = window.PMKAdvancedSearch;
            if (bridge && bridge.enabled !== false && typeof bridge.open === 'function') {
                bridge.open();
            } else if (typeof window.openAdvancedSearchSidebar === 'function') {
                window.openAdvancedSearchSidebar();
            } else if (typeof window.toggleAdvancedSearchSidebar === 'function') {
                window.toggleAdvancedSearchSidebar();
            } else {
                try { document.dispatchEvent(new CustomEvent('koha:toggleAdvancedSearch')); } catch (_) {}
            }
            closeTopDropdown(event && event.currentTarget);
            return;
        }

        if (actionId === 'attendance-mediabus') {
            if (event) event.preventDefault();
            const bridge = window.PMKAttendanceMediabus;
            if (bridge && bridge.available === true && bridge.enabled !== false && typeof bridge.open === 'function') {
                Promise.resolve(bridge.open()).finally(queueRender);
            }
            closeTopDropdown(event && event.currentTarget);
            return;
        }

        if (actionId === 'guides-current') {
            if (event) event.preventDefault();
            const bridge = window.PMKGuidesTraining;
            if (bridge && bridge.enabled !== false && typeof bridge.startCurrent === 'function') {
                bridge.startCurrent();
            } else if (window.KOHA_GUIDES && typeof window.KOHA_GUIDES.start === 'function') {
                window.KOHA_GUIDES.start();
            }
            closeTopDropdown(event && event.currentTarget);
            return;
        }

        if (actionId === 'guides-catalogue') {
            if (event) event.preventDefault();
            const bridge = window.PMKGuidesTraining;
            if (bridge && bridge.enabled !== false && typeof bridge.openCatalogue === 'function') {
                bridge.openCatalogue();
            } else if (window.KOHA_GUIDES && typeof window.KOHA_GUIDES.openCatalogue === 'function') {
                window.KOHA_GUIDES.openCatalogue();
            } else {
                try { document.dispatchEvent(new CustomEvent('koha:openGuideCatalogue')); } catch (_) {}
            }
            closeTopDropdown(event && event.currentTarget);
            return;
        }

        if (actionId === 'guides-assist-toggle') {
            if (event) event.preventDefault();
            const bridge = window.PMKGuidesTraining;
            if (bridge && bridge.enabled !== false && typeof bridge.toggleAssist === 'function') {
                Promise.resolve(bridge.toggleAssist()).finally(queueRender);
            } else if (window.KOHA_GUIDES && window.KOHA_GUIDES.assist) {
                try {
                    const on = typeof window.KOHA_GUIDES.assist.enabled === 'function' && window.KOHA_GUIDES.assist.enabled();
                    window.KOHA_GUIDES.assist.setEnabled(!on);
                    if (typeof window.KOHA_GUIDES.assist.refresh === 'function') window.KOHA_GUIDES.assist.refresh();
                } catch (_) {}
                queueRender();
            }
            return;
        }

        if (actionId === 'dashboard') {
            if (event) event.preventDefault();
            if (typeof window.loadDashboardKoha === 'function') {
                window.loadDashboardKoha();
                closeTopDropdown(event && event.currentTarget);
                return;
            }
            const url = String(item.url || '/cgi-bin/koha/circ/circulation.pl#');
            if (item.target === 'new') window.open(url, '_blank', 'noopener');
            else window.location.href = url;
            closeTopDropdown(event && event.currentTarget);
        }
    }

    function buildLink(item) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = 'dropdown-item';
        a.href = String(item.url || '#');
        if (item.target === 'new') {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
        }
        appendIcon(a, item);
        a.appendChild(document.createTextNode(labelOf(item)));
        li.appendChild(a);
        return li;
    }

    function buildAction(item) {
        if (item.actionId === 'personal-lists' && !listActionAvailable()) return null;
        if (item.actionId === 'recent-history' && !historyActionAvailable()) return null;
        if (item.actionId === 'advanced-search' && !advancedSearchActionAvailable()) return null;
        if (item.actionId === 'attendance-mediabus' && !attendanceMediabusActionAvailable()) return null;
        if (item.actionId === 'guides-current' && !guidesCurrentActionAvailable()) return null;
        if (item.actionId === 'guides-catalogue' && !guidesCatalogueActionAvailable()) return null;
        if (item.actionId === 'guides-assist-toggle' && !guidesAssistActionAvailable()) return null;
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = 'dropdown-item';
        a.href = item.actionId === 'dashboard' ? String(item.url || '/cgi-bin/koha/circ/circulation.pl#') : '#';
        if (item.actionId === 'dashboard' && item.target === 'new') {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
        }
        appendIcon(a, item);
        let actionLabel = labelOf(item);
        if (item.actionId === 'guides-assist-toggle') {
            let on = false;
            try {
                if (window.PMKGuidesTraining) on = !!window.PMKGuidesTraining.assistEnabled;
                else if (window.KOHA_GUIDES && window.KOHA_GUIDES.assist && typeof window.KOHA_GUIDES.assist.enabled === 'function') on = !!window.KOHA_GUIDES.assist.enabled();
            } catch (_) {}
            actionLabel += on ? tr(' : activé', ' : on') : tr(' : désactivé', ' : off');
        }
        a.appendChild(document.createTextNode(actionLabel));
        a.addEventListener('click', function (event) { runAction(item, event); });
        li.appendChild(a);
        return li;
    }

    function buildSeparator() {
        const li = document.createElement('li');
        const hr = document.createElement('hr');
        hr.className = 'dropdown-divider';
        li.appendChild(hr);
        return li;
    }

    function buildGroup(item, items, audience, stack) {
        const fragment = document.createDocumentFragment();
        const headerLi = document.createElement('li');
        const h = document.createElement('h6');
        h.className = 'dropdown-header';
        h.textContent = labelOf(item);
        headerLi.appendChild(h);
        fragment.appendChild(headerLi);

        const groupAudience = inheritedAudience(item.audience, audience);
        const childNodes = renderChildren(items, item.id, groupAudience, stack.concat(item.id));
        Array.from(childNodes.childNodes).forEach(function (node) {
            if (node.classList) node.classList.add('pmk-nav-group-children');
            fragment.appendChild(node);
        });
        return fragment;
    }

    function buildSubmenu(item, items, audience, stack) {
        const li = document.createElement('li');
        const presentation = ['side', 'dropdown', 'mega'].includes(String(item.presentation || ''))
            ? String(item.presentation)
            : 'side';
        li.className = 'pmk-nav-submenu pmk-submenu-' + presentation;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dropdown-item pmk-submenu-toggle';
        button.setAttribute('aria-expanded', 'false');

        const label = document.createElement('span');
        label.className = 'pmk-submenu-label';
        appendIcon(label, item);
        label.appendChild(document.createTextNode(labelOf(item)));
        button.appendChild(label);

        const caret = document.createElement('i');
        caret.className = 'fa fa-angle-right pmk-submenu-caret';
        caret.setAttribute('aria-hidden', 'true');
        button.appendChild(caret);

        const menu = document.createElement('ul');
        menu.className = 'dropdown-menu';
        if (presentation === 'mega') {
            const columns = Math.max(2, Math.min(4, Number(item.megaColumns) || 3));
            menu.style.setProperty('--pmk-mega-columns', String(columns));
        }

        const submenuAudience = inheritedAudience(item.audience, audience);
        const renderedChildren = renderChildren(items, item.id, submenuAudience, stack.concat(item.id));
        if (!renderedChildren.childNodes.length) return null;
        menu.appendChild(renderedChildren);

        button.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            closeSiblingSubmenus(li);
            const opening = !li.classList.contains('show');
            li.classList.toggle('show', opening);
            menu.classList.toggle('show', opening);
            button.setAttribute('aria-expanded', opening ? 'true' : 'false');
        });
        menu.addEventListener('click', function (event) {
            if (event.target.closest('.pmk-submenu-toggle')) return;
            event.stopPropagation();
        });

        li.append(button, menu);
        return li;
    }

    function renderChildren(items, parentId, parentAudience, stack) {
        const fragment = document.createDocumentFragment();
        const branch = childrenOf(items, parentId);

        branch.forEach(function (item) {
            if (!item || item.enabled === false) return;
            if (stack.includes(item.id)) return;

            const audience = inheritedAudience(item.audience, parentAudience);
            if (!canSee(audience, audience)) return;

            let node = null;
            if (item.kind === 'separator') node = buildSeparator();
            else if (item.kind === 'group') node = buildGroup(item, items, audience, stack);
            else if (item.kind === 'submenu') node = buildSubmenu(item, items, audience, stack);
            else if (item.kind === 'action') node = buildAction(item);
            else node = buildLink(item);

            if (node) fragment.appendChild(node);
        });

        return fragment;
    }

    function buildTopMenu(menuConfig) {
        const li = document.createElement('li');
        li.className = 'nav-item dropdown ' + OWN_CLASS;
        if (currentConfig && currentConfig.collapseLabelsOnSmallScreens !== false) {
            li.classList.add('pmk-collapse-label');
        }
        li.dataset.pmkMenuId = menuConfig.id;

        const toggle = document.createElement('a');
        toggle.className = 'nav-link dropdown-toggle';
        toggle.href = '#';
        toggle.role = 'button';
        toggle.setAttribute('data-bs-toggle', 'dropdown');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.title = labelOf(menuConfig);
        appendIcon(toggle, menuConfig);

        const label = document.createElement('span');
        label.className = 'nav-label';
        label.textContent = labelOf(menuConfig);
        toggle.appendChild(label);

        const dropdown = document.createElement('ul');
        dropdown.className = 'dropdown-menu';
        dropdown.appendChild(renderChildren(menuConfig.items || [], '', menuConfig.audience || 'all', []));

        li.append(toggle, dropdown);
        li.addEventListener('hidden.bs.dropdown', function () { closeAllSubmenus(li); });
        return li;
    }

    function normalizeOrphans(menu) {
        if (!menu || !Array.isArray(menu.items)) return menu;
        const ids = new Set(menu.items.map(function (item) { return item && item.id; }).filter(Boolean));
        menu.items.forEach(function (item) {
            if (item && item.parentId && !ids.has(item.parentId)) item.parentId = '';
        });
        return menu;
    }

    function render() {
        if (rendering) return;
        rendering = true;
        try {
            injectStyles();
            removeOwnMenus();

            const config = currentConfig || clone(DEFAULTS);
            if (config.removeLegacyHardcodedMenu !== false) removeLegacyMenu();

            syncLegacyButtons(config);

            if (config.enabled === false) return;

            const ul = topLevelMenu();
            if (!ul) return;
            const more = moreMenuItem(ul);

            (config.menus || []).forEach(function (sourceMenu) {
                if (!sourceMenu || sourceMenu.enabled === false) return;
                if (!canSee(sourceMenu.audience, 'all')) return;
                const menu = normalizeOrphans(sourceMenu);
                const node = buildTopMenu(menu);
                if (more) more.before(node);
                else ul.appendChild(node);
            });
        } finally {
            rendering = false;
        }
    }

    function queueRender() {
        if (renderQueued) return;
        renderQueued = true;
        window.requestAnimationFrame(function () {
            renderQueued = false;
            render();
        });
    }

    function watchDom() {
        if (observer) return;
        const root = document.documentElement;
        if (!root) return;
        observer = new MutationObserver(function (mutations) {
            if (rendering) return;
            let relevant = false;
            for (const mutation of mutations) {
                if (!mutation.addedNodes || !mutation.addedNodes.length) continue;
                for (const node of mutation.addedNodes) {
                    if (!node || node.nodeType !== 1) continue;
                    if (
                        node.id === 'custom-tools-menu' ||
                        node.id === 'toplevelmenu' ||
                        node.id === 'sidebar5' ||
                        node.id === 'historique' ||
                        node.id === 'advancedSearch' ||
                        node.id === 'tutoriel' ||
                        (node.querySelector && (
                            node.querySelector('#custom-tools-menu') ||
                            node.querySelector('#toplevelmenu') ||
                            node.querySelector('#sidebar5') ||
                            node.querySelector('#historique') ||
                            node.querySelector('#advancedSearch') ||
                            node.querySelector('#tutoriel')
                        ))
                    ) {
                        relevant = true;
                        break;
                    }
                }
                if (relevant) break;
            }
            if (relevant) queueRender();
        });
        observer.observe(root, { childList: true, subtree: true });
    }

    function hasAction(config, actionId) {
        return (config.menus || []).some(function (menu) {
            return Array.isArray(menu && menu.items) && menu.items.some(function (item) {
                return item && item.kind === 'action' && item.actionId === actionId;
            });
        });
    }

    function defaultActionItem(actionId) {
        const items = defaultItems();
        return items.find(function (item) {
            return item && item.kind === 'action' && item.actionId === actionId;
        }) || null;
    }

    function insertMigratedAction(config, actionId) {
        if (hasAction(config, actionId)) return false;

        const menus = Array.isArray(config.menus) ? config.menus : [];
        let menu = menus.find(function (entry) { return entry && entry.id === 'tools'; }) || menus[0];
        if (!menu) {
            menu = clone(DEFAULTS.menus[0]);
            config.menus = [menu];
        }
        if (!Array.isArray(menu.items)) menu.items = [];

        const source = defaultActionItem(actionId);
        if (!source) return false;

        const hasMyTools = menu.items.some(function (item) {
            return item && item.id === 'my-tools-group';
        });
        const migrated = clone(source);
        if (!hasMyTools) migrated.parentId = '';
        menu.items.push(migrated);
        return true;
    }

    function ensureSubmenuPresentation(config) {
        let changed = false;
        (config.menus || []).forEach(function (menu) {
            (menu && Array.isArray(menu.items) ? menu.items : []).forEach(function (item) {
                if (!item || item.kind !== 'submenu') return;
                if (!['side', 'dropdown', 'mega'].includes(String(item.presentation || ''))) {
                    item.presentation = 'side';
                    changed = true;
                }
                if (!item.megaColumns) {
                    item.megaColumns = 3;
                    changed = true;
                }
            });
        });
        return changed;
    }

    function insertGuidesTrainingBundle(config) {
        const menus = Array.isArray(config.menus) ? config.menus : [];
        let menu = menus.find(function (entry) { return entry && entry.id === 'tools'; }) || menus[0];
        if (!menu) {
            menu = clone(DEFAULTS.menus[0]);
            config.menus = [menu];
            return true;
        }
        if (!Array.isArray(menu.items)) menu.items = [];

        const alreadyHasGuides = menu.items.some(function (item) {
            return item && item.kind === 'action' && ['guides-current', 'guides-catalogue', 'guides-assist-toggle'].includes(item.actionId);
        });
        if (alreadyHasGuides) return false;

        const defaults = defaultItems();
        const ids = new Set(['guides-training-menu', 'guides-current', 'guides-catalogue', 'guides-assist-toggle']);
        const additions = defaults.filter(function (item) { return item && ids.has(item.id); }).map(clone);
        const hasMyTools = menu.items.some(function (item) { return item && item.id === 'my-tools-group'; });
        if (!hasMyTools) {
            additions.forEach(function (item) {
                if (item.id === 'guides-training-menu') item.parentId = '';
            });
        }
        menu.items.push.apply(menu.items, additions);
        return additions.length > 0;
    }


    function migrateGuidesSubmenuToSide(config) {
        let changed = false;

        (config.menus || []).forEach(function (menu) {
            (menu.items || []).forEach(function (item) {
                if (!item || item.id !== 'guides-training-menu') return;

                /*
                 * La présentation historique attendue pour Aide & formation
                 * est latérale : le sous-menu s'ouvre à droite du menu parent,
                 * pas à l'intérieur de celui-ci.
                 */
                if (item.presentation !== 'side') {
                    item.presentation = 'side';
                    changed = true;
                }
            });
        });

        return changed;
    }


    function migratePmk138VirtualPages(config) {
        let changed = false;
        const byId = {
            'appointments':'/cgi-bin/koha/mainpage.pl?pmk_page=appointments',
            'quality-home':'/cgi-bin/koha/mainpage.pl?pmk_page=quality-center',
            'quality-notices':'/cgi-bin/koha/mainpage.pl?pmk_page=biblios',
            'quality-items':'/cgi-bin/koha/mainpage.pl?pmk_page=items',
            'quality-authorities':'/cgi-bin/koha/mainpage.pl?pmk_page=authorities',
            'quality-holds':'/cgi-bin/koha/mainpage.pl?pmk_page=reservations',
            'quality-transfers':'/cgi-bin/koha/mainpage.pl?pmk_page=transfers',
            'quality-loans':'/cgi-bin/koha/mainpage.pl?pmk_page=loans',
            'quality-patrons':'/cgi-bin/koha/mainpage.pl?pmk_page=patrons',
            'quality-rules':'/cgi-bin/koha/mainpage.pl?pmk_page=rulelab',
            'inventory':'/cgi-bin/koha/mainpage.pl?pmk_page=inventory',
            'weeding':'/cgi-bin/koha/mainpage.pl?pmk_page=weeding',
            'restoration':'/cgi-bin/koha/mainpage.pl?pmk_page=restore-deleted-items'
        };
        (config.menus || []).forEach(function(menu){
            const items = Array.isArray(menu.items) ? menu.items : [];
            items.forEach(function(item){
                if (!item || !byId[item.id]) return;
                if (item.url !== byId[item.id]) { item.url = byId[item.id]; changed = true; }
            });
            const admin = items.find(function(item){ return item && item.id === 'admin-group'; });
            if (admin && !items.some(function(item){ return item && item.id === 'internal-pages-hub'; })) {
                items.push(makeItem('link', {
                    id:'internal-pages-hub', parentId:'admin-group',
                    labelFr:'Pages & outils internes', labelEn:'Internal pages & tools',
                    icon:'fa-th-large', url:'/cgi-bin/koha/mainpage.pl?pmk_page=hub', target:'new', audience:'inherit'
                }));
                changed = true;
            }
            const quality = items.find(function(item){ return item && item.id === 'quality-center'; });
            if (quality && !items.some(function(item){ return item && item.id === 'quality-serials'; })) {
                items.push(makeItem('link', {
                    id:'quality-serials', parentId:'quality-center',
                    labelFr:'Périodiques', labelEn:'Serials', icon:'fa-newspaper-o',
                    url:'/cgi-bin/koha/mainpage.pl?pmk_page=serials', target:'new', audience:'inherit'
                }));
                changed = true;
            }
        });
        return changed;
    }

    function insertAttendanceReportLink(config) {
        const menus = Array.isArray(config.menus) ? config.menus : [];
        let menu = menus.find(function(entry){ return entry && entry.id === 'tools'; }) || menus[0];
        if (!menu) {
            menu = clone(DEFAULTS.menus[0]);
            config.menus = [menu];
            return true;
        }
        if (!Array.isArray(menu.items)) menu.items = [];
        if (menu.items.some(function(item){ return item && (item.id === 'attendance-report' || String(item.url || '').includes('pmk_page=attendance-counter')); })) return false;
        const source = defaultItems().find(function(item){ return item && item.id === 'attendance-report'; });
        if (!source) return false;
        const migrated = clone(source);
        if (!menu.items.some(function(item){ return item && item.id === 'admin-group'; })) migrated.parentId = '';
        menu.items.push(migrated);
        return true;
    }

    function migrateConfig(config) {
        const supplied = config && typeof config === 'object' ? clone(config) : {};
        const cfg = Object.assign(clone(DEFAULTS), supplied);
        if (!Array.isArray(cfg.menus)) cfg.menus = clone(DEFAULTS.menus);

        let version = Number(supplied.migrationVersion || 0);
        let changed = false;

        if (version < 1) {
            changed = insertMigratedAction(cfg, 'recent-history') || changed;
            version = 1;
        }
        if (version < 2) {
            changed = insertMigratedAction(cfg, 'advanced-search') || changed;
            version = 2;
        }
        if (version < 3) {
            changed = ensureSubmenuPresentation(cfg) || changed;
            version = 3;
        }
        if (version < 4) {
            changed = insertGuidesTrainingBundle(cfg) || changed;
            version = 4;
        }

        /*
         * v5 : le sous-menu « Aide & formation » passe en présentation
         * latérale. Cette migration s'applique aussi aux configurations
         * 134 v1.4.0 déjà enregistrées avec presentation = "dropdown".
         */
        if (version < 5) {
            changed = migrateGuidesSubmenuToSide(cfg) || changed;
            version = 5;
        }
        if (version < 6) {
            changed = migratePmk138VirtualPages(cfg) || changed;
            version = 6;
        }

        if (version < 7) {
            changed = insertMigratedAction(cfg, 'attendance-mediabus') || changed;
            changed = insertAttendanceReportLink(cfg) || changed;
            version = 7;
        }

        if (cfg.migrationVersion !== version) {
            cfg.migrationVersion = version;
            changed = true;
        }

        return { config: cfg, changed: changed };
    }

    let migrationSaveInFlight = false;

    function applyConfig(config) {
        const migrated = migrateConfig(config);
        currentConfig = migrated.config;
        queueRender();

        if (
            migrated.changed &&
            !migrationSaveInFlight &&
            window.PMKConfig &&
            typeof window.PMKConfig.saveConfig === 'function'
        ) {
            migrationSaveInFlight = true;
            Promise.resolve(window.PMKConfig.saveConfig(MODULE_ID, currentConfig))
                .catch(function () {})
                .finally(function () { migrationSaveInFlight = false; });
        }
    }

    function registerWithPMK() {
        if (!window.PMKConfig || registered) return false;
        registered = true;

        window.PMKConfig.registerModule({
            id: MODULE_ID,
            schemaVersion: 8,
            name: {
                fr: 'Menu IntranetNav',
                en: 'IntranetNav menu'
            },
            description: {
                fr: 'Construit des menus Koha configurables dans IntranetNav avec un éditeur visuel fidèle au menu réel : liens, groupes, séparateurs, niveaux, sous-menus latéraux/déroulés/méga-menu, glisser-déposer, icônes, actions PMK et accès réservé aux superlibrarians. Intègre directement Listes, Historique, Recherche avancée, Guides & formation et le compteur Médiabus.',
                en: 'Builds configurable Koha IntranetNav menus with a visual editor matching the real menu structure: links, groups, separators, levels, side/dropdown/mega submenus, drag and drop, icons, PMK actions and superlibrarian-only access. Directly integrates Lists, History, Advanced search, Guides & training and the Mediabus counter.'
            },
            category: {
                fr: 'Navigation et interface',
                en: 'Navigation and interface'
            },
            defaults: clone(DEFAULTS),
            schema: moduleSchema(),
            validate: validateConfig
        });

        window.PMKConfig.getConfig(MODULE_ID)
            .then(applyConfig)
            .catch(function () { applyConfig(clone(DEFAULTS)); });

        if (typeof window.PMKConfig.subscribe === 'function') {
            unsubscribe = window.PMKConfig.subscribe(MODULE_ID, applyConfig);
        }

        return true;
    }

    function bootstrap() {
        watchDom();

        if (!registerWithPMK()) {
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

        window.addEventListener('pmk:personal-lists-state', queueRender);
        window.addEventListener('pmk:history-state', queueRender);
        window.addEventListener('pmk:advanced-search-state', queueRender);
        window.addEventListener('pmk:guides-training-state', queueRender);
        document.addEventListener('pmk:attendance-mediabus-state', queueRender);
        document.addEventListener('koha-guides-assist-toggle', queueRender);
        queueRender();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
    } else {
        bootstrap();
    }

    window.addEventListener('beforeunload', function () {
        if (observer) {
            try { observer.disconnect(); } catch (_) {}
            observer = null;
        }
        if (typeof unsubscribe === 'function') {
            try { unsubscribe(); } catch (_) {}
        }
    }, { once: true });
})();

/* ============================================================================
 * 111-internal-share.js
 * PimpMyKoha — Partage interne
 * Version : 4.0.0-preplugin
 * Date    : 2026-09-20
 *
 * Objectifs :
 * - conserver le comportement métier historique du 111 ;
 * - rendre les paramètres utiles administrables dans PMK ;
 * - adopter un design plus intégré à Koha ;
 * - abstraire totalement le stockage afin de remplacer Firebase RTDB par
 *   l'API/BDD du futur plugin sans réécrire l'interface ni la logique métier ;
 * - conserver Firebase uniquement comme adaptateur de compatibilité isolé.
 *
 * IMPORTANT : ce module ne modifie jamais une donnée métier Koha.
 * Il partage uniquement un lien interne Koha + du contexte + un statut.
 * ========================================================================== */
(function () {
    'use strict';

    if (window.__PMK111_INTERNAL_SHARE__) return;
    window.__PMK111_INTERNAL_SHARE__ = true;

    const MODULE_ID = 'internal-share';
    const VERSION = '4.0.0-preplugin';
    const STYLE_ID = 'pmk111-styles';
    const ROOT_ID = 'pmk111-root';
    const MODAL_ID = 'pmk111-share-modal';
    const STATUS_MODAL_ID = 'pmk111-status-modal';
    const DIAG_ID = 'pmk111-diagnostics';
    const SESSION_USER_KEY = 'pmk111-session-user-id';
    const COLLAPSE_PREFIX = 'pmk111-collapsed-';
    const DIAG_KEY = 'pmk111-connection-log';

    const PAGE_DEFINITIONS = [
        {
            id: 'catalogue.detail', path: '/cgi-bin/koha/catalogue/detail.pl', enabled: true,
            shareMode: 'page', placementMode: 'auto', selector: '#toolbar', position: 'append',
            labelFr: 'Notice détaillée', labelEn: 'Bibliographic detail',
            titleTemplateFr: '{title}', titleTemplateEn: '{title}'
        },
        {
            id: 'catalogue.search', path: '/cgi-bin/koha/catalogue/search.pl', enabled: true,
            shareMode: 'page', placementMode: 'auto', selector: '#selection_ops', position: 'append',
            labelFr: 'Résultats catalogue', labelEn: 'Catalog results',
            titleTemplateFr: 'Recherche : {query}', titleTemplateEn: 'Search: {query}'
        },
        {
            id: 'members.moremember', path: '/cgi-bin/koha/members/moremember.pl', enabled: true,
            shareMode: 'page', placementMode: 'auto', selector: '#toolbar.btn-toolbar, #toolbar', position: 'append',
            labelFr: 'Fiche lecteur', labelEn: 'Patron details',
            titleTemplateFr: 'Fiche : {name}', titleTemplateEn: 'Patron: {name}'
        },
        {
            id: 'circ.circulation', path: '/cgi-bin/koha/circ/circulation.pl', enabled: true,
            shareMode: 'page', placementMode: 'auto', selector: '#toolbar.btn-toolbar, #toolbar', position: 'append',
            labelFr: 'Prêt', labelEn: 'Circulation',
            titleTemplateFr: 'Prêt : {name}', titleTemplateEn: 'Circulation: {name}'
        },
        {
            id: 'members.readingrec', path: '/cgi-bin/koha/members/readingrec.pl', enabled: true,
            shareMode: 'page', placementMode: 'auto', selector: '#toolbar.btn-toolbar, #toolbar', position: 'append',
            labelFr: 'Historique de lecture', labelEn: 'Reading history',
            titleTemplateFr: 'Hist. lecture : {name}', titleTemplateEn: 'Reading history: {name}'
        },
        {
            id: 'members.holdshistory', path: '/cgi-bin/koha/members/holdshistory.pl', enabled: true,
            shareMode: 'page', placementMode: 'auto', selector: '#toolbar.btn-toolbar, #toolbar', position: 'append',
            labelFr: 'Historique des réservations', labelEn: 'Hold history',
            titleTemplateFr: 'Hist. réserv. : {name}', titleTemplateEn: 'Hold history: {name}'
        },
        {
            id: 'members.notices', path: '/cgi-bin/koha/members/notices.pl', enabled: true,
            shareMode: 'page', placementMode: 'auto', selector: '#toolbar.btn-toolbar, #toolbar', position: 'append',
            labelFr: 'Notifications lecteur', labelEn: 'Patron notices',
            titleTemplateFr: 'Notifications : {name}', titleTemplateEn: 'Notices: {name}'
        },
        {
            id: 'cataloguing.additem', path: '/cgi-bin/koha/cataloguing/additem.pl', enabled: true,
            shareMode: 'page', placementMode: 'auto', selector: 'h1', position: 'append',
            labelFr: 'Exemplaires', labelEn: 'Items',
            titleTemplateFr: '{title}', titleTemplateEn: '{title}'
        },
        {
            id: 'cataloguing.addbiblio', path: '/cgi-bin/koha/cataloguing/addbiblio.pl', enabled: true,
            shareMode: 'page', placementMode: 'auto', selector: '#toolbar, .main-toolbar, #breadcrumbs', position: 'append',
            labelFr: 'Catalogage notice', labelEn: 'Cataloging',
            titleTemplateFr: '{catalogingTitle}', titleTemplateEn: '{catalogingTitle}'
        },
        {
            id: 'reserve.request', path: '/cgi-bin/koha/reserve/request.pl', enabled: true,
            shareMode: 'reservationRows', placementMode: 'auto', selector: '', position: 'append',
            labelFr: 'Réservations', labelEn: 'Holds',
            titleTemplateFr: 'Réservation : {patron}', titleTemplateEn: 'Hold: {patron}',
            noteTemplateFr: 'Lecteur : {patron}\nPriorité/Statut : {priority}',
            noteTemplateEn: 'Patron: {patron}\nPriority/status: {priority}'
        }
    ];

    const DEFAULT_STATUSES = [
        {
            id: 'trouve', enabled: true, variant: 'success', icon: 'fa-check', terminal: false,
            commentPolicy: 'optional',
            labelFr: 'Résolu', labelEn: 'Resolved',
            reservationLabelFr: 'Trouvé', reservationLabelEn: 'Found',
            textFr: 'Résolu', textEn: 'Resolved',
            reservationTextFr: 'Document trouvé', reservationTextEn: 'Document found'
        },
        {
            id: 'non_trouve', enabled: true, variant: 'danger', icon: 'fa-times', terminal: false,
            commentPolicy: 'optional',
            labelFr: 'Non résolu', labelEn: 'Unresolved',
            reservationLabelFr: 'Introuvable', reservationLabelEn: 'Not found',
            textFr: 'Non résolu', textEn: 'Unresolved',
            reservationTextFr: 'Introuvable', reservationTextEn: 'Not found'
        },
        {
            id: 'transmis', enabled: true, variant: 'info', icon: 'fa-arrow-right', terminal: false,
            commentPolicy: 'optional',
            labelFr: 'Transmis', labelEn: 'Forwarded',
            reservationLabelFr: 'Transmis', reservationLabelEn: 'Handed over',
            textFr: 'Transmis', textEn: 'Forwarded',
            reservationTextFr: 'Transmis au lecteur', reservationTextEn: 'Handed to patron'
        },
        {
            id: 'autre', enabled: true, variant: 'warning', icon: 'fa-tag', terminal: false,
            commentPolicy: 'required',
            labelFr: 'Autre…', labelEn: 'Other…',
            reservationLabelFr: 'Autre…', reservationLabelEn: 'Other…',
            textFr: 'Autre statut', textEn: 'Other status',
            reservationTextFr: 'Autre statut', reservationTextEn: 'Other status'
        }
    ];

    const DEFAULT_FIREBASE_CONFIG = {
        apiKey: 'YOUR_FIREBASE_APIKEY',
        authDomain: 'YOUR_FIREBASE_AUTHDOMAIN',
        databaseURL: 'YOUR_FIREBASE_DATABASEURL',
        projectId: 'YOUR_FIREBASE_PROJECTID',
        storageBucket: 'YOUR_FIREBASE_STORAGEBUCKET',
        messagingSenderId: 'YOUR_FIREBASE_MESSAGINGSENDERID',
        appId: 'YOUR_FIREBASE_APPID'
    };

    const DEFAULT_CONFIG = {
        enabled: true,
        sites: [
            {
                id: 'draguignan', enabled: true,
                labelFr: 'Draguignan', labelEn: 'Draguignan',
                matchName: 'DRAGUIGNAN', matchCode: 'DRA',
                canSend: true, canReceive: true, channel: 'draguignan'
            }
        ],
        pages: PAGE_DEFINITIONS.map(clone),
        routing: {
            mode: 'broadcastSite',
            acceptLegacyUntargeted: true,
            allowFreeRecipient: true,
            recipientRequired: false,
            targets: []
        },
        lifetime: {
            ttlMinutes: 5,
            showCountdown: true,
            warningBeforeSeconds: 60,
            cleanupExpired: true,
            deleteOnTerminal: false,
            deleteAfterTerminalSeconds: 0
        },
        workflow: {
            initialStatus: 'en_attente',
            initialTextFr: 'En attente',
            initialTextEn: 'Pending',
            statuses: DEFAULT_STATUSES.map(clone)
        },
        permissions: {
            statusUpdatePolicy: 'anyViewer',
            deletePolicy: 'creator',
            allowSuperlibrarianDelete: true
        },
        appearance: {
            mode: 'koha',
            position: 'bottom-right',
            widthPx: 390,
            maxVisible: 0,
            newestFirst: false,
            rememberCollapsed: true,
            collapsedByDefault: false,
            compactOnMobile: true,
            mobileBreakpointPx: 576,
            showCreator: true,
            showSenderSite: false,
            showUsageCount: true,
            showConnectionStatus: true,
            showDiagnostics: true,
            buttonLabelFr: 'Partage interne',
            buttonLabelEn: 'Internal share',
            modalTitleFr: 'Partager cette page',
            modalTitleEn: 'Share this page',
            recipientLabelFr: 'Destinataire (optionnel)',
            recipientLabelEn: 'Recipient (optional)',
            recipientPlaceholderFr: 'Ex. Bureau, Accueil, prénom…',
            recipientPlaceholderEn: 'e.g. Desk, Front desk, name…',
            noteLabelFr: 'Informations supplémentaires (optionnel)',
            noteLabelEn: 'Additional information (optional)',
            notePlaceholderFr: 'Ex. À rechercher pour le comptoir…',
            notePlaceholderEn: 'e.g. Please locate for the desk…'
        },
        identity: {
            preferKohaUsername: true,
            fallbackToSessionId: true,
            usernameSelector: '#logged-in-info-full .loggedinusername[data-loggedinusername], .loggedinusername[data-loggedinusername]'
        },
        storage: {
            mode: 'firebaseLegacy',
            firebaseLegacy: {
                enabled: true,
                sdkVersion: '10.7.1',
                appName: 'pmk111-internal-share',
                sharesPath: 'shares',
                usagePath: 'stats/usage_count',
                config: clone(DEFAULT_FIREBASE_CONFIG)
            },
            pluginApi: {
                basePath: '/api/v1/contrib/pimpmykoha/internal-share',
                pollingMs: 4000,
                stopWhenHidden: true,
                credentials: 'same-origin'
            }
        },
        diagnostics: {
            enabled: true,
            maxEntries: 50,
            logToConsole: false
        }
    };

    let currentConfig = clone(DEFAULT_CONFIG);
    let currentSite = null;
    let currentIdentity = null;
    let currentStore = null;
    let currentPage = null;
    let configRegistered = false;
    let unsubscribeConfig = null;
    let injectionObserver = null;
    let injectionTimer = null;
    let runtimeGeneration = 0;
    let usageCount = 0;
    let shareMap = new Map();
    let timerMap = new Map();
    let processingShare = false;
    let processingStatus = false;
    let pendingShareContext = null;
    let pendingStatus = null;

    function clone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function deepMerge(base, incoming) {
        if (Array.isArray(base)) return Array.isArray(incoming) ? clone(incoming) : clone(base);
        if (!base || typeof base !== 'object') return incoming === undefined ? base : incoming;
        const out = clone(base);
        if (!incoming || typeof incoming !== 'object') return out;
        Object.keys(incoming).forEach(function (key) {
            const value = incoming[key];
            if (Array.isArray(value)) out[key] = clone(value);
            else if (value && typeof value === 'object' && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) out[key] = deepMerge(out[key], value);
            else if (value !== undefined) out[key] = value;
        });
        return out;
    }

    function normalizeConfig(config) {
        const merged = deepMerge(DEFAULT_CONFIG, config || {});
        merged.pages = Array.isArray(config && config.pages) ? config.pages.map(function (page, i) {
            return deepMerge(PAGE_DEFINITIONS[i] || {}, page || {});
        }) : PAGE_DEFINITIONS.map(clone);
        if (!merged.pages.length) merged.pages = PAGE_DEFINITIONS.map(clone);
        merged.workflow.statuses = Array.isArray(merged.workflow.statuses) && merged.workflow.statuses.length
            ? merged.workflow.statuses.map(function (status, i) { return deepMerge(DEFAULT_STATUSES[i] || {}, status || {}); })
            : DEFAULT_STATUSES.map(clone);
        merged.sites = Array.isArray(merged.sites) ? merged.sites : clone(DEFAULT_CONFIG.sites);
        merged.routing.targets = Array.isArray(merged.routing.targets) ? merged.routing.targets : [];
        merged.lifetime.ttlMinutes = clampNumber(merged.lifetime.ttlMinutes, 1, 1440, 5);
        merged.lifetime.warningBeforeSeconds = clampNumber(merged.lifetime.warningBeforeSeconds, 0, 86400, 60);
        merged.appearance.widthPx = clampNumber(merged.appearance.widthPx, 280, 760, 390);
        merged.appearance.maxVisible = clampNumber(merged.appearance.maxVisible, 0, 100, 0);
        merged.appearance.mobileBreakpointPx = clampNumber(merged.appearance.mobileBreakpointPx, 320, 1200, 576);
        merged.storage.pluginApi.pollingMs = clampNumber(merged.storage.pluginApi.pollingMs, 1000, 60000, 4000);
        merged.diagnostics.maxEntries = clampNumber(merged.diagnostics.maxEntries, 10, 500, 50);
        return merged;
    }

    function clampNumber(value, min, max, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    }

    function lang() {
        const raw = String(document.documentElement.lang || '').toLowerCase();
        return raw.indexOf('en') === 0 ? 'en' : 'fr';
    }

    function tr(fr, en) {
        return lang() === 'en' ? (en || fr || '') : (fr || en || '');
    }

    function clean(value) {
        return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    }

    function norm(value) {
        return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }


    function cssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
        return String(value).replace(/[^a-zA-Z0-9_-]/g, function (ch) { return '\\' + ch; });
    }

    function safeId(value) {
        return norm(value).replace(/\s+/g, '-').replace(/[^a-z0-9_.-]/g, '').slice(0, 120);
    }

    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
        });
    }

    function safeInternalUrl(value) {
        try {
            const url = new URL(String(value || ''), window.location.origin);
            if (!/^https?:$/.test(url.protocol) || url.origin !== window.location.origin) return null;
            return url.href;
        } catch (_) {
            return null;
        }
    }

    function currentPath() {
        return window.location.pathname;
    }

    function pageConfigForPath(pathname) {
        const pages = currentConfig.pages || [];
        return pages.find(function (p) { return p && p.enabled !== false && p.path === pathname; }) || null;
    }

    function branchInfo() {
        let name = '';
        let code = '';
        const nameEl = document.querySelector('.logged-in-branch-name, #logged-in-info-full .logged-in-branch-name');
        if (nameEl) name = clean(nameEl.textContent);
        const codeEl = document.querySelector('.logged-in-branch-code, [data-branchcode], [data-branch-code]');
        if (codeEl) code = clean(codeEl.getAttribute('data-branchcode') || codeEl.getAttribute('data-branch-code') || codeEl.textContent);
        return { name:name, code:code };
    }

    function resolveSite(info) {
        if (!info) return null;
        const nName = norm(info.name);
        const nCode = norm(info.code);
        return (currentConfig.sites || []).find(function (site) {
            if (!site || site.enabled === false) return false;
            const names = [site.matchName, site.labelFr, site.labelEn].filter(Boolean).map(norm);
            const codes = [site.matchCode, site.id].filter(Boolean).map(norm);
            return (!!nName && names.indexOf(nName) !== -1) || (!!nCode && codes.indexOf(nCode) !== -1);
        }) || null;
    }

    function readKohaUsername() {
        const selector = clean(currentConfig.identity && currentConfig.identity.usernameSelector) || DEFAULT_CONFIG.identity.usernameSelector;
        let el = null;
        try { el = document.querySelector(selector); } catch (_) {}
        if (!el) return '';
        return clean(el.getAttribute('data-loggedinusername') || el.textContent);
    }

    function sessionIdentity() {
        let value = '';
        try { value = sessionStorage.getItem(SESSION_USER_KEY) || ''; } catch (_) {}
        if (!value) {
            const randomPart = window.crypto && typeof window.crypto.randomUUID === 'function'
                ? window.crypto.randomUUID()
                : Math.random().toString(36).slice(2) + Date.now().toString(36);
            value = 'session:' + randomPart;
            try { sessionStorage.setItem(SESSION_USER_KEY, value); } catch (_) {}
        }
        return value;
    }

    function resolveIdentity() {
        const username = currentConfig.identity.preferKohaUsername !== false ? readKohaUsername() : '';
        if (username) return { id:'koha:' + safeId(username), username:username, label:username, source:'koha' };
        if (currentConfig.identity.fallbackToSessionId !== false) {
            const id = sessionIdentity();
            return { id:id, username:'', label:tr('Cette session', 'This session'), source:'session' };
        }
        return { id:'anonymous', username:'', label:tr('Utilisateur', 'User'), source:'anonymous' };
    }

    function isSuperlibrarian() {
        if (window.PMKConfig && typeof window.PMKConfig.isKohaSuperlibrarian === 'function') {
            try { return !!window.PMKConfig.isKohaSuperlibrarian(); } catch (_) {}
        }
        const el = document.querySelector('#logged-in-info-full .loggedinusername[data-loggedinusername], .loggedinusername[data-loggedinusername]');
        if (!el) return false;
        return el.dataset.isSuperlibrarian === 'is_superlibrarian' || el.classList.contains('is_superlibrarian');
    }

    function addDiagnostic(status, message, details) {
        if (!(currentConfig.diagnostics && currentConfig.diagnostics.enabled)) return;
        const entry = {
            timestamp: new Date().toISOString(),
            time: new Date().toLocaleTimeString(),
            status: status || 'info',
            message: clean(message),
            details: clean(details),
            page: currentPath()
        };
        let list = [];
        try { list = JSON.parse(localStorage.getItem(DIAG_KEY) || '[]') || []; } catch (_) {}
        list.unshift(entry);
        list.length = Math.min(list.length, currentConfig.diagnostics.maxEntries || 50);
        try { localStorage.setItem(DIAG_KEY, JSON.stringify(list)); } catch (_) {}
        if (currentConfig.diagnostics.logToConsole && window.console) {
            try { console.info('[PMK111]', status, message, details || ''); } catch (_) {}
        }
        renderDiagnostics();
    }

    function readDiagnostics() {
        try { return JSON.parse(localStorage.getItem(DIAG_KEY) || '[]') || []; } catch (_) { return []; }
    }

    function clearDiagnostics() {
        try { localStorage.removeItem(DIAG_KEY); } catch (_) {}
        renderDiagnostics();
    }

    function statusById(id) {
        return (currentConfig.workflow.statuses || []).find(function (s) { return s && s.enabled !== false && s.id === id; }) || null;
    }

    function isReservationShare(data) {
        return String(data && data.kind || '') === 'reservation' || /^Réservation\s*:/i.test(String(data && data.title || ''));
    }

    function statusDisplay(data) {
        const status = String(data && data.status || currentConfig.workflow.initialStatus || 'en_attente');
        if (status === currentConfig.workflow.initialStatus || status === 'en_attente') {
            return {
                id: status,
                variant: 'default',
                icon: 'fa-clock-o',
                text: tr(currentConfig.workflow.initialTextFr, currentConfig.workflow.initialTextEn),
                label: tr(currentConfig.workflow.initialTextFr, currentConfig.workflow.initialTextEn)
            };
        }
        const cfg = statusById(status);
        if (!cfg) return { id:status, variant:'default', icon:'fa-info-circle', text:status, label:status };
        const reservation = isReservationShare(data);
        return {
            id: cfg.id,
            variant: cfg.variant || 'default',
            icon: cfg.icon || 'fa-circle',
            text: reservation
                ? tr(cfg.reservationTextFr || cfg.textFr, cfg.reservationTextEn || cfg.textEn)
                : tr(cfg.textFr, cfg.textEn),
            label: reservation
                ? tr(cfg.reservationLabelFr || cfg.labelFr, cfg.reservationLabelEn || cfg.labelEn)
                : tr(cfg.labelFr, cfg.labelEn)
        };
    }

    function shareExpiry(data) {
        const explicit = Number(data && data.expiresAt);
        if (Number.isFinite(explicit) && explicit > 0) return explicit;
        const ts = Number(data && data.timestamp);
        if (!Number.isFinite(ts)) return 0;
        return ts + currentConfig.lifetime.ttlMinutes * 60000;
    }

    function isExpired(data) {
        const expiry = shareExpiry(data);
        return !expiry || Date.now() >= expiry;
    }

    function targetVisible(data) {
        const target = data && data.target;
        if (!target || !target.type) {
            if (!currentConfig.routing.acceptLegacyUntargeted) return false;
            if (!data.sender && !data.senderSiteId) return true;
            const sender = norm(data.senderSiteId || data.sender || '');
            return [currentSite.id, currentSite.matchCode, currentSite.matchName, currentSite.labelFr, currentSite.labelEn].filter(Boolean).map(norm).indexOf(sender) !== -1;
        }
        const type = String(target.type);
        const value = norm(target.value || '');
        if (type === 'all') return true;
        if (type === 'site') {
            return [currentSite.id, currentSite.matchCode, currentSite.matchName, currentSite.labelFr, currentSite.labelEn].filter(Boolean).map(norm).indexOf(value) !== -1;
        }
        if (type === 'channel') return norm(currentSite.channel || currentSite.id) === value;
        if (type === 'user') return currentIdentity && [currentIdentity.id, currentIdentity.username].filter(Boolean).map(norm).indexOf(value) !== -1;
        return false;
    }

    function canUpdateStatus(data) {
        const policy = currentConfig.permissions.statusUpdatePolicy;
        if (policy === 'creator') return data && data.createdBy === currentIdentity.id;
        if (policy === 'superlibrarian') return isSuperlibrarian();
        return true;
    }

    function canDelete(data) {
        const creator = data && data.createdBy === currentIdentity.id;
        if (currentConfig.permissions.allowSuperlibrarianDelete && isSuperlibrarian()) return true;
        const policy = currentConfig.permissions.deletePolicy;
        if (policy === 'anyViewer') return true;
        if (policy === 'superlibrarian') return isSuperlibrarian();
        return creator;
    }

    function currentTargetForNewShare(selectedTargetId) {
        const mode = currentConfig.routing.mode;
        if (mode === 'broadcastAll') return { type:'all', value:'all', label:tr('Tous', 'All') };
        if (mode === 'broadcastChannel') return { type:'channel', value:currentSite.channel || currentSite.id, label:currentSite.labelFr || currentSite.id };
        if (mode === 'targeted') {
            const target = (currentConfig.routing.targets || []).find(function (t) { return t && t.enabled !== false && t.id === selectedTargetId; });
            if (!target) return null;
            return { type:target.type || 'site', value:target.value || target.id, label:tr(target.labelFr, target.labelEn) };
        }
        return { type:'site', value:currentSite.id, label:tr(currentSite.labelFr, currentSite.labelEn) };
    }

    function positionClass() {
        const p = String(currentConfig.appearance.position || 'bottom-right');
        return ['bottom-right','bottom-left','top-right','top-left'].indexOf(p) !== -1 ? p : 'bottom-right';
    }

    function ensureStyles() {
        let style = document.getElementById(STYLE_ID);
        if (style) style.remove();
        style = document.createElement('style');
        style.id = STYLE_ID;
        const width = currentConfig.appearance.widthPx;
        const mobile = currentConfig.appearance.mobileBreakpointPx;
        style.textContent = `
#${ROOT_ID}{position:fixed;z-index:1040;width:min(${width}px,calc(100vw - 24px));display:flex;flex-direction:column;gap:8px;pointer-events:none;}
#${ROOT_ID}.bottom-right{right:16px;bottom:16px;align-items:flex-end;}#${ROOT_ID}.bottom-left{left:16px;bottom:16px;align-items:flex-start;}#${ROOT_ID}.top-right{right:16px;top:72px;align-items:flex-end;}#${ROOT_ID}.top-left{left:16px;top:72px;align-items:flex-start;}
.pmk111-card{pointer-events:auto;width:100%;background:#fff;color:#212529;border:1px solid #d8dee4;border-left:4px solid #6c757d;border-radius:.35rem;box-shadow:0 2px 8px rgba(0,0,0,.14);overflow:hidden;}
.pmk111-card[data-variant="success"]{border-left-color:#398439}.pmk111-card[data-variant="danger"]{border-left-color:#ac2925}.pmk111-card[data-variant="info"]{border-left-color:#269abc}.pmk111-card[data-variant="warning"]{border-left-color:#d58512}
.pmk111-card-head{display:flex;align-items:flex-start;gap:.5rem;padding:.6rem .7rem .35rem;background:#f8f9fa;border-bottom:1px solid #e5e7e9}.pmk111-card-title{flex:1;min-width:0;font-weight:600;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pmk111-card-head .btn{padding:1px 6px;line-height:1.25}.pmk111-body{padding:.55rem .7rem}.pmk111-meta{font-size:.86em;color:#6c757d;margin-bottom:.25rem}.pmk111-recipient{font-weight:600;margin-bottom:.25rem}.pmk111-note,.pmk111-comment{padding:.4rem .5rem;background:#f8f9fa;border-left:3px solid #ced4da;border-radius:.2rem;white-space:pre-wrap;overflow-wrap:anywhere;margin:.35rem 0}.pmk111-statusline{display:flex;align-items:center;gap:.35rem;font-weight:600;margin:.3rem 0}.pmk111-actions{display:flex;align-items:center;flex-wrap:wrap;gap:.35rem;margin-top:.45rem}.pmk111-actions .btn{font-size:12px;padding:3px 7px}.pmk111-footer{display:flex;justify-content:space-between;gap:.5rem;align-items:center;margin-top:.45rem;font-size:.82em;color:#6c757d}.pmk111-footer a{font-weight:600}.pmk111-timer.is-ending{color:#8a6d3b;font-weight:600}.pmk111-collapsed .pmk111-body{display:none}.pmk111-collapse-handle{pointer-events:auto;border-radius:50%;width:32px;height:32px;padding:0;display:none}.pmk111-collapsed .pmk111-collapse-handle{display:inline-flex;align-items:center;justify-content:center}.pmk111-collapsed .pmk111-card{display:none}.pmk111-item{width:100%;display:flex;flex-direction:column;align-items:inherit;gap:4px}.pmk111-row-share{margin-left:6px;padding:1px 5px;font-size:11px;vertical-align:middle}.pmk111-config-anchor{display:inline-flex;align-items:center;margin-left:.35rem}
.pmk111-overlay{position:fixed;inset:0;z-index:1060;background:rgba(0,0,0,.42);display:none;align-items:center;justify-content:center;padding:1rem}.pmk111-overlay.is-open{display:flex}.pmk111-dialog{width:min(520px,100%);max-height:calc(100vh - 2rem);overflow:auto;background:#fff;border:1px solid rgba(0,0,0,.2);border-radius:.35rem;box-shadow:0 5px 15px rgba(0,0,0,.35)}.pmk111-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:12px 15px;border-bottom:1px solid #e5e5e5}.pmk111-dialog-head h3{font-size:18px;margin:0}.pmk111-dialog-body{padding:15px}.pmk111-dialog-foot{display:flex;justify-content:flex-end;gap:.5rem;padding:10px 15px;border-top:1px solid #e5e5e5;background:#f8f9fa}.pmk111-dialog label{font-weight:600}.pmk111-dialog .form-control{width:100%}.pmk111-statusbox{display:flex;align-items:center;gap:.45rem;font-size:12px;color:#6c757d}.pmk111-dot{width:8px;height:8px;border-radius:50%;display:inline-block;background:#999}.pmk111-dot.connected{background:#398439}.pmk111-dot.connecting{background:#d58512}.pmk111-dot.error{background:#ac2925}.pmk111-diagnostics{position:fixed;z-index:1065;right:18px;bottom:18px;width:min(620px,calc(100vw - 36px));max-height:55vh;overflow:auto;background:#fff;border:1px solid #ccc;border-radius:.35rem;box-shadow:0 4px 16px rgba(0,0,0,.2);display:none}.pmk111-diagnostics.is-open{display:block}.pmk111-diag-head{display:flex;justify-content:space-between;align-items:center;padding:.55rem .7rem;border-bottom:1px solid #ddd;background:#f8f9fa}.pmk111-diag-list{font-family:monospace;font-size:11px}.pmk111-diag-row{display:grid;grid-template-columns:72px 82px minmax(120px,1fr) minmax(100px,1fr);gap:.4rem;padding:.35rem .55rem;border-bottom:1px solid #eee}.pmk111-empty{padding:1rem;color:#6c757d;text-align:center}
.pmk111-legacy .pmk111-card{background:#2c3e50;color:#fff;border-color:#2c3e50}.pmk111-legacy .pmk111-card-head{background:#34495e;border-bottom-color:rgba(255,255,255,.12)}.pmk111-legacy .pmk111-meta,.pmk111-legacy .pmk111-footer{color:#bdc3c7}.pmk111-legacy .pmk111-note,.pmk111-legacy .pmk111-comment{background:rgba(0,0,0,.2);border-left-color:#95a5a6}.pmk111-legacy .pmk111-footer a{color:#7fd37f}
@media(max-width:${mobile}px){#${ROOT_ID}{left:8px!important;right:8px!important;top:auto!important;bottom:8px!important;width:auto}.pmk111-dialog{max-height:calc(100vh - 1rem)}.pmk111-dialog-body{padding:12px}.pmk111-actions .btn{flex:1 1 auto}.pmk111-diag-row{grid-template-columns:64px 72px 1fr}.pmk111-diag-row span:last-child{grid-column:1/-1}.pmk111-row-share{min-width:30px}.pmk111-compact-mobile .pmk111-note,.pmk111-compact-mobile .pmk111-comment{max-height:5.2em;overflow:auto}}
        `;
        document.head.appendChild(style);
    }

    function ensureRoot() {
        let root = document.getElementById(ROOT_ID);
        if (!root) {
            root = document.createElement('div');
            root.id = ROOT_ID;
            document.body.appendChild(root);
        }
        root.className = positionClass();
        if (currentConfig.appearance.mode === 'legacyDark') root.classList.add('pmk111-legacy');
        if (currentConfig.appearance.compactOnMobile) root.classList.add('pmk111-compact-mobile');
        return root;
    }

    function mountConfigButton(anchor, sectionId) {
        if (!anchor || !isSuperlibrarian() || !window.PMKConfig || typeof window.PMKConfig.mountContextButton !== 'function') return;
        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: 'append',
                contextKey: 'internal-share',
                context: { pageId: currentPage && currentPage.id || '', sectionId: sectionId || 'activation' }
            });
        } catch (_) {}
    }

    function ensureModals() {
        let overlay = document.getElementById(MODAL_ID);
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = MODAL_ID;
            overlay.className = 'pmk111-overlay';
            overlay.innerHTML = `
<div class="pmk111-dialog" role="dialog" aria-modal="true" aria-labelledby="pmk111-share-title">
 <div class="pmk111-dialog-head"><h3 id="pmk111-share-title"><i class="fa fa-share-alt" aria-hidden="true"></i> <span data-role="title"></span><span class="pmk111-config-anchor"></span></h3><button type="button" class="close" data-act="close" aria-label="Fermer"><span aria-hidden="true">×</span></button></div>
 <div class="pmk111-dialog-body">
  <div class="pmk111-statusbox" data-role="connection"><span class="pmk111-dot"></span><span data-role="connection-text"></span><button type="button" class="btn btn-link btn-xs" data-act="diagnostics" style="display:none"></button></div>
  <div class="form-group" data-role="target-wrap" style="display:none"><label data-role="target-label"></label><select class="form-control" data-role="target"></select></div>
  <div class="form-group" data-role="recipient-wrap"><label data-role="recipient-label"></label><input type="text" class="form-control" data-role="recipient"></div>
  <div class="form-group"><label data-role="note-label"></label><textarea class="form-control" rows="3" data-role="note"></textarea></div>
  <div class="text-muted" style="font-size:12px" data-role="usage"></div>
 </div>
 <div class="pmk111-dialog-foot"><button type="button" class="btn btn-default" data-act="cancel"></button><button type="button" class="btn btn-primary" data-act="confirm"><i class="fa fa-share-alt" aria-hidden="true"></i> <span></span></button></div>
</div>`;
            document.body.appendChild(overlay);
            overlay.addEventListener('click', function (e) { if (e.target === overlay && !processingShare) closeShareModal(); });
            overlay.querySelector('[data-act="close"]').addEventListener('click', closeShareModal);
            overlay.querySelector('[data-act="cancel"]').addEventListener('click', closeShareModal);
            overlay.querySelector('[data-act="confirm"]').addEventListener('click', executeShareFromModal);
            overlay.querySelector('[data-act="diagnostics"]').addEventListener('click', toggleDiagnostics);
        }

        let statusModal = document.getElementById(STATUS_MODAL_ID);
        if (!statusModal) {
            statusModal = document.createElement('div');
            statusModal.id = STATUS_MODAL_ID;
            statusModal.className = 'pmk111-overlay';
            statusModal.innerHTML = `
<div class="pmk111-dialog" role="dialog" aria-modal="true" aria-labelledby="pmk111-status-title">
 <div class="pmk111-dialog-head"><h3 id="pmk111-status-title"><i class="fa fa-info-circle" aria-hidden="true"></i> <span data-role="title"></span></h3><button type="button" class="close" data-act="close"><span aria-hidden="true">×</span></button></div>
 <div class="pmk111-dialog-body"><div class="form-group"><label data-role="comment-label"></label><textarea class="form-control" rows="3" data-role="comment"></textarea><p class="help-block" data-role="help"></p></div></div>
 <div class="pmk111-dialog-foot"><button type="button" class="btn btn-default" data-act="cancel"></button><button type="button" class="btn btn-primary" data-act="confirm"></button></div>
</div>`;
            document.body.appendChild(statusModal);
            statusModal.addEventListener('click', function (e) { if (e.target === statusModal && !processingStatus) closeStatusModal(); });
            statusModal.querySelector('[data-act="close"]').addEventListener('click', closeStatusModal);
            statusModal.querySelector('[data-act="cancel"]').addEventListener('click', closeStatusModal);
            statusModal.querySelector('[data-act="confirm"]').addEventListener('click', executeStatusFromModal);
        }

        document.addEventListener('keydown', onEscape, { passive:false });
        configureModalLabels();
        mountConfigButton(overlay.querySelector('.pmk111-config-anchor'), 'appearance');
    }

    function configureModalLabels() {
        const overlay = document.getElementById(MODAL_ID);
        if (!overlay) return;
        overlay.querySelector('[data-role="title"]').textContent = tr(currentConfig.appearance.modalTitleFr, currentConfig.appearance.modalTitleEn);
        overlay.querySelector('[data-role="recipient-label"]').textContent = tr(currentConfig.appearance.recipientLabelFr, currentConfig.appearance.recipientLabelEn);
        overlay.querySelector('[data-role="recipient"]').placeholder = tr(currentConfig.appearance.recipientPlaceholderFr, currentConfig.appearance.recipientPlaceholderEn);
        overlay.querySelector('[data-role="note-label"]').textContent = tr(currentConfig.appearance.noteLabelFr, currentConfig.appearance.noteLabelEn);
        overlay.querySelector('[data-role="note"]').placeholder = tr(currentConfig.appearance.notePlaceholderFr, currentConfig.appearance.notePlaceholderEn);
        overlay.querySelector('[data-act="cancel"]').textContent = tr('Annuler', 'Cancel');
        overlay.querySelector('[data-act="confirm"] span').textContent = tr('Partager', 'Share');
        overlay.querySelector('[data-role="target-label"]').textContent = tr('Diffuser à', 'Send to');
        overlay.querySelector('[data-act="diagnostics"]').textContent = tr('Diagnostic', 'Diagnostics');
    }

    function onEscape(e) {
        if (e.key !== 'Escape') return;
        if (document.getElementById(STATUS_MODAL_ID) && document.getElementById(STATUS_MODAL_ID).classList.contains('is-open') && !processingStatus) closeStatusModal();
        else if (document.getElementById(MODAL_ID) && document.getElementById(MODAL_ID).classList.contains('is-open') && !processingShare) closeShareModal();
        else if (document.getElementById(DIAG_ID) && document.getElementById(DIAG_ID).classList.contains('is-open')) toggleDiagnostics();
    }

    function connectionUI(status, message) {
        const overlay = document.getElementById(MODAL_ID);
        if (!overlay) return;
        const box = overlay.querySelector('[data-role="connection"]');
        if (!currentConfig.appearance.showConnectionStatus) { box.style.display = 'none'; return; }
        box.style.display = 'flex';
        const dot = box.querySelector('.pmk111-dot');
        dot.className = 'pmk111-dot ' + (status || '');
        box.querySelector('[data-role="connection-text"]').textContent = message || '';
        const diag = box.querySelector('[data-act="diagnostics"]');
        diag.style.display = currentConfig.appearance.showDiagnostics && currentConfig.diagnostics.enabled ? '' : 'none';
    }

    function openShareModal(context) {
        pendingShareContext = context || { kind:'page', title:generatePageTitle(currentPage), note:'' };
        const overlay = document.getElementById(MODAL_ID);
        if (!overlay) return;
        configureModalLabels();
        const recipient = overlay.querySelector('[data-role="recipient"]');
        const note = overlay.querySelector('[data-role="note"]');
        recipient.value = pendingShareContext.recipient || '';
        note.value = pendingShareContext.note || '';
        const recipientWrap = overlay.querySelector('[data-role="recipient-wrap"]');
        recipientWrap.style.display = currentConfig.routing.allowFreeRecipient ? '' : 'none';

        const targetWrap = overlay.querySelector('[data-role="target-wrap"]');
        const targetSelect = overlay.querySelector('[data-role="target"]');
        if (currentConfig.routing.mode === 'targeted') {
            targetWrap.style.display = '';
            targetSelect.innerHTML = '<option value="">' + esc(tr('Choisir…', 'Choose…')) + '</option>' +
                (currentConfig.routing.targets || []).filter(function (t) { return t && t.enabled !== false; }).map(function (t) {
                    return '<option value="' + esc(t.id) + '">' + esc(tr(t.labelFr, t.labelEn) || t.id) + '</option>';
                }).join('');
        } else {
            targetWrap.style.display = 'none';
            targetSelect.innerHTML = '';
        }
        overlay.querySelector('[data-role="usage"]').textContent = currentConfig.appearance.showUsageCount
            ? tr('Utilisations : ', 'Uses: ') + String(usageCount || 0) : '';
        connectionUI(currentStore && currentStore.isConnected && currentStore.isConnected() ? 'connected' : 'connecting',
            currentStore && currentStore.isConnected && currentStore.isConnected() ? tr('Connecté', 'Connected') : tr('Connexion…', 'Connecting…'));
        overlay.classList.add('is-open');
        window.setTimeout(function () { (currentConfig.routing.allowFreeRecipient ? recipient : note).focus(); }, 0);
    }

    function closeShareModal() {
        const overlay = document.getElementById(MODAL_ID);
        if (overlay) overlay.classList.remove('is-open');
        pendingShareContext = null;
        processingShare = false;
        setShareModalBusy(false);
    }

    function setShareModalBusy(busy) {
        const overlay = document.getElementById(MODAL_ID);
        if (!overlay) return;
        const btn = overlay.querySelector('[data-act="confirm"]');
        btn.disabled = !!busy;
        const span = btn.querySelector('span');
        span.textContent = busy ? tr('Envoi…', 'Sending…') : tr('Partager', 'Share');
        const icon = btn.querySelector('i');
        icon.className = busy ? 'fa fa-spinner fa-spin' : 'fa fa-share-alt';
    }

    async function executeShareFromModal() {
        if (processingShare || !pendingShareContext || !currentStore) return;
        const overlay = document.getElementById(MODAL_ID);
        const recipient = clean(overlay.querySelector('[data-role="recipient"]').value);
        const note = cleanMultiline(overlay.querySelector('[data-role="note"]').value);
        const targetId = overlay.querySelector('[data-role="target"]').value;
        if (currentConfig.routing.recipientRequired && !recipient) {
            alert(tr('Veuillez saisir un destinataire.', 'Please enter a recipient.'));
            return;
        }
        const target = currentTargetForNewShare(targetId);
        if (currentConfig.routing.mode === 'targeted' && !target) {
            alert(tr('Veuillez choisir une destination.', 'Please choose a destination.'));
            return;
        }
        processingShare = true;
        setShareModalBusy(true);
        const now = Date.now();
        const share = {
            url: window.location.href,
            title: pendingShareContext.title || tr('Page Koha', 'Koha page'),
            kind: pendingShareContext.kind || 'page',
            recipient: recipient || null,
            note: note || null,
            status: currentConfig.workflow.initialStatus || 'en_attente',
            statusComment: null,
            sender: branchInfo().name || tr('Inconnu', 'Unknown'),
            senderSiteId: currentSite.id,
            senderSiteCode: currentSite.matchCode || branchInfo().code || '',
            target: target,
            createdBy: currentIdentity.id,
            createdByLabel: currentIdentity.label,
            timestamp: now,
            expiresAt: now + currentConfig.lifetime.ttlMinutes * 60000,
            moduleVersion: VERSION
        };
        try {
            await currentStore.create(share);
            try { usageCount = await currentStore.incrementUsage(); } catch (_) {}
            addDiagnostic('connected', tr('Partage créé', 'Share created'), share.title);
            const source = pendingShareContext.sourceButton;
            closeShareModal();
            if (source) {
                const original = source.innerHTML;
                source.innerHTML = '<i class="fa fa-check" aria-hidden="true"></i>' + (source.classList.contains('pmk111-row-share') ? '' : ' ' + tr('Partagé', 'Shared'));
                window.setTimeout(function () { if (source.isConnected) source.innerHTML = original; }, 1800);
            }
        } catch (error) {
            processingShare = false;
            setShareModalBusy(false);
            connectionUI('error', tr('Erreur de connexion', 'Connection error'));
            addDiagnostic('error', tr('Erreur de partage', 'Share error'), error && error.message);
            alert(tr('Erreur de partage : ', 'Share error: ') + (error && error.message ? error.message : tr('erreur inconnue', 'unknown error')));
        }
    }

    function cleanMultiline(value) {
        return String(value == null ? '' : value).replace(/\r\n/g, '\n').trim();
    }

    function openStatusModal(key, statusId) {
        const data = shareMap.get(key);
        const cfg = statusById(statusId);
        if (!data || !cfg || !canUpdateStatus(data)) return;
        pendingStatus = { key:key, statusId:statusId, cfg:cfg };
        const modal = document.getElementById(STATUS_MODAL_ID);
        modal.querySelector('[data-role="title"]').textContent = tr('Changer le statut : ', 'Change status: ') + (isReservationShare(data) ? tr(cfg.reservationLabelFr, cfg.reservationLabelEn) : tr(cfg.labelFr, cfg.labelEn));
        modal.querySelector('[data-role="comment-label"]').textContent = cfg.commentPolicy === 'required' ? tr('Commentaire obligatoire', 'Comment required') : tr('Commentaire', 'Comment');
        modal.querySelector('[data-role="help"]').textContent = cfg.commentPolicy === 'required' ? tr('Décrivez ce statut avant de valider.', 'Describe this status before saving.') : tr('Le commentaire est facultatif.', 'Comment is optional.');
        modal.querySelector('[data-role="comment"]').value = '';
        modal.querySelector('[data-act="cancel"]').textContent = tr('Annuler', 'Cancel');
        modal.querySelector('[data-act="confirm"]').textContent = tr('Valider', 'Save');
        modal.classList.add('is-open');
        modal.querySelector('[data-role="comment"]').focus();
    }

    function closeStatusModal() {
        const modal = document.getElementById(STATUS_MODAL_ID);
        if (modal) modal.classList.remove('is-open');
        pendingStatus = null;
        processingStatus = false;
        if (modal) modal.querySelector('[data-act="confirm"]').disabled = false;
    }

    async function executeStatusFromModal() {
        if (!pendingStatus || processingStatus || !currentStore) return;
        const modal = document.getElementById(STATUS_MODAL_ID);
        const comment = cleanMultiline(modal.querySelector('[data-role="comment"]').value);
        if (pendingStatus.cfg.commentPolicy === 'required' && !comment) {
            alert(tr('Veuillez saisir un commentaire.', 'Please enter a comment.'));
            return;
        }
        processingStatus = true;
        modal.querySelector('[data-act="confirm"]').disabled = true;
        try {
            await currentStore.update(pendingStatus.key, { status:pendingStatus.statusId, statusComment:comment || null, updatedAt:Date.now(), updatedBy:currentIdentity.id });
            const terminal = !!pendingStatus.cfg.terminal;
            const key = pendingStatus.key;
            closeStatusModal();
            if (terminal && currentConfig.lifetime.deleteOnTerminal) {
                const delay = Math.max(0, Number(currentConfig.lifetime.deleteAfterTerminalSeconds) || 0) * 1000;
                window.setTimeout(function () { if (currentStore) currentStore.remove(key).catch(function () {}); }, delay);
            }
        } catch (error) {
            processingStatus = false;
            modal.querySelector('[data-act="confirm"]').disabled = false;
            addDiagnostic('error', tr('Erreur de statut', 'Status error'), error && error.message);
            alert(tr('Erreur de mise à jour : ', 'Update error: ') + (error && error.message ? error.message : tr('erreur inconnue', 'unknown error')));
        }
    }

    function renderShare(key, data) {
        if (!data || isExpired(data) || !targetVisible(data)) {
            removeRenderedShare(key);
            if (data && isExpired(data) && currentConfig.lifetime.cleanupExpired && currentStore) currentStore.remove(key).catch(function () {});
            return;
        }
        shareMap.set(key, data);
        const root = ensureRoot();
        let item = document.getElementById('pmk111-item-' + cssSafe(key));
        if (!item) {
            item = document.createElement('div');
            item.className = 'pmk111-item';
            item.id = 'pmk111-item-' + cssSafe(key);
            item.dataset.key = key;
            if (currentConfig.appearance.newestFirst && root.firstChild) root.insertBefore(item, root.firstChild); else root.appendChild(item);
        }
        const status = statusDisplay(data);
        const safeUrl = safeInternalUrl(data.url);
        const creator = data.createdBy === currentIdentity.id ? tr('Vous', 'You') : (data.createdByLabel || tr('Autre', 'Other'));
        const collapsed = currentConfig.appearance.rememberCollapsed ? localCollapseState(key) : currentConfig.appearance.collapsedByDefault;
        item.classList.toggle('pmk111-collapsed', !!collapsed);
        const statusButtons = canUpdateStatus(data) ? (currentConfig.workflow.statuses || []).filter(function (s) { return s && s.enabled !== false; }).map(function (s) {
            const label = isReservationShare(data) ? tr(s.reservationLabelFr || s.labelFr, s.reservationLabelEn || s.labelEn) : tr(s.labelFr, s.labelEn);
            const active = data.status === s.id;
            return '<button type="button" class="btn btn-' + variantToButton(s.variant) + ' btn-xs" data-act="status" data-status="' + esc(s.id) + '"' + (active ? ' disabled aria-pressed="true"' : '') + '><i class="fa ' + esc(s.icon || 'fa-circle') + '" aria-hidden="true"></i> ' + esc(label) + '</button>';
        }).join('') : '';
        item.innerHTML = `
<div class="pmk111-card" data-variant="${esc(status.variant)}">
 <div class="pmk111-card-head"><div class="pmk111-card-title"><i class="fa fa-share-alt" aria-hidden="true"></i> ${esc(data.title || tr('Partage interne','Internal share'))}</div><button type="button" class="btn btn-default btn-xs" data-act="collapse" title="${esc(tr('Réduire','Collapse'))}"><i class="fa fa-chevron-down"></i></button>${canDelete(data) ? '<button type="button" class="btn btn-default btn-xs" data-act="delete" title="' + esc(tr('Supprimer','Delete')) + '"><i class="fa fa-times text-danger"></i></button>' : ''}</div>
 <div class="pmk111-body">
  ${data.recipient ? '<div class="pmk111-recipient"><i class="fa fa-user"></i> ' + esc(tr('Pour : ','For: ')) + '<strong>' + esc(data.recipient) + '</strong></div>' : ''}
  <div class="pmk111-statusline"><i class="fa ${esc(status.icon)}" aria-hidden="true"></i><span>${esc(status.text)}</span></div>
  ${data.statusComment ? '<div class="pmk111-comment"><i class="fa fa-info-circle"></i> ' + esc(data.statusComment) + '</div>' : ''}
  ${data.note ? '<div class="pmk111-note"><i class="fa fa-comment"></i> ' + esc(data.note).replace(/\n/g,'<br>') + '</div>' : ''}
  ${(currentConfig.appearance.showCreator || currentConfig.appearance.showSenderSite) ? '<div class="pmk111-meta">' + (currentConfig.appearance.showCreator ? esc(tr('Créé par : ','Created by: ') + creator) : '') + (currentConfig.appearance.showCreator && currentConfig.appearance.showSenderSite ? ' · ' : '') + (currentConfig.appearance.showSenderSite ? esc(data.sender || '') : '') + '</div>' : ''}
  ${statusButtons ? '<div class="pmk111-actions">' + statusButtons + '</div>' : ''}
  <div class="pmk111-footer"><span class="pmk111-timer" data-role="timer"></span>${safeUrl ? '<a href="' + esc(safeUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(tr('Ouvrir','Open')) + ' <i class="fa fa-arrow-right"></i></a>' : '<span class="text-danger">' + esc(tr('Lien invalide','Invalid link')) + '</span>'}</div>
  ${currentConfig.appearance.showUsageCount ? '<div class="text-muted" style="font-size:11px;text-align:right;margin-top:.25rem">' + esc(tr('Utilisations : ','Uses: ')) + '<span data-role="usage">' + esc(String(usageCount || 0)) + '</span></div>' : ''}
 </div>
</div>
<button type="button" class="btn btn-default pmk111-collapse-handle" data-act="expand" title="${esc(tr('Développer','Expand'))}"><i class="fa fa-chevron-up"></i></button>`;
        item.querySelector('[data-act="collapse"]').addEventListener('click', function () { setCollapsed(key, true); renderShare(key, data); });
        item.querySelector('[data-act="expand"]').addEventListener('click', function () { setCollapsed(key, false); renderShare(key, data); });
        const del = item.querySelector('[data-act="delete"]');
        if (del) del.addEventListener('click', function () { deleteShare(key, data); });
        Array.from(item.querySelectorAll('[data-act="status"]')).forEach(function (btn) {
            btn.addEventListener('click', function () { openStatusModal(key, btn.dataset.status); });
        });
        startTimer(key, data, item);
        enforceVisibleLimit();
    }

    function cssSafe(value) {
        return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    function variantToButton(variant) {
        if (variant === 'success') return 'success';
        if (variant === 'danger') return 'danger';
        if (variant === 'warning') return 'warning';
        if (variant === 'info') return 'info';
        if (variant === 'primary') return 'primary';
        return 'default';
    }

    function localCollapseState(key) {
        try {
            const stored = localStorage.getItem(COLLAPSE_PREFIX + key);
            if (stored === '1') return true;
            if (stored === '0') return false;
        } catch (_) {}
        return !!currentConfig.appearance.collapsedByDefault;
    }

    function setCollapsed(key, value) {
        if (!currentConfig.appearance.rememberCollapsed) return;
        try { localStorage.setItem(COLLAPSE_PREFIX + key, value ? '1' : '0'); } catch (_) {}
    }

    function startTimer(key, data, item) {
        if (timerMap.has(key)) window.clearInterval(timerMap.get(key));
        const tick = function () {
            if (!item.isConnected) { window.clearInterval(timerMap.get(key)); timerMap.delete(key); return; }
            const remaining = shareExpiry(data) - Date.now();
            if (remaining <= 0) {
                removeRenderedShare(key);
                if (currentConfig.lifetime.cleanupExpired && currentStore) currentStore.remove(key).catch(function () {});
                return;
            }
            const el = item.querySelector('[data-role="timer"]');
            if (!el) return;
            if (!currentConfig.lifetime.showCountdown) { el.textContent = ''; return; }
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            el.textContent = tr('Expire dans ', 'Expires in ') + minutes + 'm ' + String(seconds).padStart(2,'0') + 's';
            el.classList.toggle('is-ending', remaining <= currentConfig.lifetime.warningBeforeSeconds * 1000);
        };
        tick();
        timerMap.set(key, window.setInterval(tick, 1000));
    }

    function enforceVisibleLimit() {
        const limit = Number(currentConfig.appearance.maxVisible) || 0;
        if (!limit) return;
        const root = document.getElementById(ROOT_ID);
        if (!root) return;
        const items = Array.from(root.querySelectorAll('.pmk111-item'));
        items.forEach(function (item, index) { item.style.display = index < limit ? '' : 'none'; });
    }

    function removeRenderedShare(key) {
        shareMap.delete(key);
        if (timerMap.has(key)) { window.clearInterval(timerMap.get(key)); timerMap.delete(key); }
        const item = document.getElementById('pmk111-item-' + cssSafe(key));
        if (item) item.remove();
        try { localStorage.removeItem(COLLAPSE_PREFIX + key); } catch (_) {}
    }

    async function deleteShare(key, data) {
        if (!canDelete(data) || !currentStore) return;
        if (!window.confirm(tr('Supprimer cette demande pour tous les utilisateurs ?', 'Delete this request for all users?'))) return;
        try { await currentStore.remove(key); } catch (error) { alert(tr('Erreur de suppression : ', 'Delete error: ') + (error.message || error)); }
    }

    function updateUsageUI() {
        document.querySelectorAll('#' + ROOT_ID + ' [data-role="usage"]').forEach(function (el) { el.textContent = String(usageCount || 0); });
        const modal = document.getElementById(MODAL_ID);
        if (modal) modal.querySelector('[data-role="usage"]').textContent = currentConfig.appearance.showUsageCount ? tr('Utilisations : ', 'Uses: ') + String(usageCount || 0) : '';
    }

    function generatePageTokens(page) {
        const params = new URLSearchParams(window.location.search);
        const nameHeader = document.querySelector('#main_moremember h1, #main_moremember h3, .main h1, .main h3, #patron-template h1');
        const titleEl = document.querySelector('.title, h1, h2');
        const rawTitle = clean(titleEl ? titleEl.textContent.replace(tr(currentConfig.appearance.buttonLabelFr,currentConfig.appearance.buttonLabelEn),'') : '');
        const biblionumber = params.get('biblionumber') || '';
        const query = params.get('q') || tr('Catalogue', 'Catalog');
        const catalogingTitle = page && page.id === 'cataloguing.addbiblio'
            ? (biblionumber ? tr('Modif. Notice #', 'Edit record #') + biblionumber : tr('Nouvelle Notice', 'New record'))
            : rawTitle;
        return {
            name: clean(nameHeader ? nameHeader.textContent.replace(tr(currentConfig.appearance.buttonLabelFr,currentConfig.appearance.buttonLabelEn),'') : tr('Lecteur','Patron')).slice(0,60),
            title: rawTitle ? rawTitle.slice(0,80) : tr('Page Koha', 'Koha page'),
            biblionumber: biblionumber,
            query: query,
            catalogingTitle: catalogingTitle
        };
    }

    function applyTemplate(template, tokens) {
        return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, key) { return tokens[key] == null ? '' : String(tokens[key]); }).replace(/\s{2,}/g,' ').trim();
    }

    function generatePageTitle(page) {
        const tokens = generatePageTokens(page);
        const template = tr(page && page.titleTemplateFr, page && page.titleTemplateEn) || '{title}';
        return applyTemplate(template, tokens) || tr('Page Koha', 'Koha page');
    }

    function insertButtonAt(target, button, position) {
        if (!target || !button) return;
        if (position === 'prepend') target.insertBefore(button, target.firstChild);
        else if (position === 'before') target.parentNode && target.parentNode.insertBefore(button, target);
        else if (position === 'after') target.parentNode && target.parentNode.insertBefore(button, target.nextSibling);
        else target.appendChild(button);
    }

    function injectMainButton(page) {
        if (!page || page.shareMode !== 'page' || !currentSite || !currentSite.canSend) return;
        if (document.getElementById('pmk111-share-button')) return;
        let target = null;
        try { target = document.querySelector(page.selector || ''); } catch (_) {}
        if (!target) return;
        const btn = document.createElement(page.id === 'cataloguing.additem' ? 'button' : 'a');
        btn.id = 'pmk111-share-button';
        if (btn.tagName === 'A') btn.href = '#'; else btn.type = 'button';
        btn.className = 'btn btn-default';
        btn.innerHTML = '<i class="fa fa-share-alt" aria-hidden="true"></i> ' + esc(tr(currentConfig.appearance.buttonLabelFr, currentConfig.appearance.buttonLabelEn));
        if (page.id === 'cataloguing.additem') btn.style.marginLeft = '.6rem';
        insertButtonAt(target, btn, page.position || 'append');
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            openShareModal({ kind:'page', title:generatePageTitle(page), note:'', sourceButton:btn });
        });
    }

    function injectReservationRowButtons(page) {
        if (!page || page.shareMode !== 'reservationRows' || !currentSite || !currentSite.canSend) return;
        const rows = document.querySelectorAll('table tbody tr');
        rows.forEach(function (row) {
            if (row.querySelector('.pmk111-row-share')) return;
            const patronLink = row.querySelector('a[href*="moremember.pl"]');
            const firstTd = row.cells && row.cells[0];
            if (!patronLink || !firstTd) return;
            const patron = clean(patronLink.textContent);
            const priorityEl = row.querySelector('.current_priority');
            const priority = clean(priorityEl ? priorityEl.textContent : '1');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-default btn-xs pmk111-row-share';
            btn.innerHTML = '<i class="fa fa-share-alt" aria-hidden="true"></i>';
            btn.title = tr('Partage interne : ', 'Internal share: ') + patron;
            firstTd.appendChild(btn);
            btn.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                const tokens = { patron:patron, priority:priority };
                openShareModal({
                    kind:'reservation',
                    title:applyTemplate(tr(page.titleTemplateFr,page.titleTemplateEn), tokens),
                    note:applyTemplate(tr(page.noteTemplateFr,page.noteTemplateEn), tokens).replace(/\\n/g,'\n'),
                    sourceButton:btn
                });
            });
        });
    }

    function runInjection() {
        currentPage = pageConfigForPath(currentPath());
        if (!currentPage || !currentSite || !currentSite.canSend) return;
        if (currentPage.shareMode === 'reservationRows') injectReservationRowButtons(currentPage); else injectMainButton(currentPage);
    }

    function startInjectionObserver() {
        stopInjectionObserver();
        runInjection();
        if (!currentPage || currentPage.shareMode !== 'reservationRows' || typeof MutationObserver !== 'function') return;
        const table = document.querySelector('table');
        const root = table || document.body;
        injectionObserver = new MutationObserver(function () {
            if (injectionTimer) window.clearTimeout(injectionTimer);
            injectionTimer = window.setTimeout(runInjection, 150);
        });
        injectionObserver.observe(root, { childList:true, subtree:true });
    }

    function stopInjectionObserver() {
        if (injectionObserver) { injectionObserver.disconnect(); injectionObserver = null; }
        if (injectionTimer) { window.clearTimeout(injectionTimer); injectionTimer = null; }
    }

    function ensureDiagnostics() {
        let panel = document.getElementById(DIAG_ID);
        if (panel) return panel;
        panel = document.createElement('div');
        panel.id = DIAG_ID;
        panel.className = 'pmk111-diagnostics';
        panel.innerHTML = '<div class="pmk111-diag-head"><strong>' + esc(tr('Diagnostic — Partage interne','Diagnostics — Internal share')) + '</strong><div><button type="button" class="btn btn-default btn-xs" data-act="clear">' + esc(tr('Effacer','Clear')) + '</button> <button type="button" class="btn btn-default btn-xs" data-act="close">×</button></div></div><div class="pmk111-diag-list"></div>';
        document.body.appendChild(panel);
        panel.querySelector('[data-act="clear"]').addEventListener('click', clearDiagnostics);
        panel.querySelector('[data-act="close"]').addEventListener('click', toggleDiagnostics);
        return panel;
    }

    function renderDiagnostics() {
        const panel = document.getElementById(DIAG_ID);
        if (!panel) return;
        const list = panel.querySelector('.pmk111-diag-list');
        const rows = readDiagnostics();
        list.innerHTML = rows.length ? rows.map(function (r) {
            return '<div class="pmk111-diag-row"><span>' + esc(r.time || '') + '</span><span>' + esc(r.status || '') + '</span><span>' + esc(r.message || '') + '</span><span>' + esc(r.details || r.page || '') + '</span></div>';
        }).join('') : '<div class="pmk111-empty">' + esc(tr('Aucun événement enregistré.','No event recorded.')) + '</div>';
    }

    function toggleDiagnostics() {
        if (!(currentConfig.diagnostics && currentConfig.diagnostics.enabled)) return;
        const panel = ensureDiagnostics();
        panel.classList.toggle('is-open');
        renderDiagnostics();
    }

    // ---------------------------------------------------------------------
    // STORAGE ADAPTER REGISTRY
    // ---------------------------------------------------------------------
    const adapterFactories = Object.create(null);

    function registerStorageAdapter(name, factory) {
        if (!name || typeof factory !== 'function') throw new Error('Invalid PMK111 storage adapter');
        adapterFactories[name] = factory;
    }

    function createStore() {
        const mode = String(currentConfig.storage.mode || 'firebaseLegacy');
        const factory = adapterFactories[mode];
        if (!factory) throw new Error('Unknown PMK111 storage adapter: ' + mode);
        return factory({ config:currentConfig, site:currentSite, identity:currentIdentity, onConnection:connectionUI, diagnostic:addDiagnostic });
    }

    function loadScript(url, marker) {
        return new Promise(function (resolve, reject) {
            if (marker && document.querySelector('script[data-pmk111-dep="' + marker + '"]')) {
                const check = window.setInterval(function () {
                    if (window.firebase) { window.clearInterval(check); resolve(); }
                }, 50);
                window.setTimeout(function () { window.clearInterval(check); resolve(); }, 3000);
                return;
            }
            const script = document.createElement('script');
            script.src = url; script.async = true;
            if (marker) script.dataset.pmk111Dep = marker;
            script.onload = resolve;
            script.onerror = function () { reject(new Error('Unable to load dependency: ' + url)); };
            document.head.appendChild(script);
        });
    }

    registerStorageAdapter('firebaseLegacy', function (ctx) {
        const cfg = ctx.config.storage.firebaseLegacy || {};
        let app = null, db = null, ref = null, query = null, handlers = null, connected = false;
        let readyPromise = null;
        async function ensureReady() {
            if (connected && db && ref) return;
            if (readyPromise) return readyPromise;
            readyPromise = (async function () {
                if (cfg.enabled === false) throw new Error('Firebase legacy disabled');
                const fbCfg = cfg.config || {};
                if (!fbCfg.apiKey || !fbCfg.databaseURL || !fbCfg.projectId) throw new Error('Firebase configuration incomplete');
                const version = clean(cfg.sdkVersion || '10.7.1').replace(/[^0-9.]/g,'') || '10.7.1';
                if (!window.firebase || typeof window.firebase.initializeApp !== 'function') await loadScript('https://www.gstatic.com/firebasejs/' + version + '/firebase-app-compat.js','firebase-app');
                if (!window.firebase || typeof window.firebase.database !== 'function') await loadScript('https://www.gstatic.com/firebasejs/' + version + '/firebase-database-compat.js','firebase-db');
                const appName = clean(cfg.appName || 'pmk111-internal-share');
                try { app = window.firebase.app(appName); } catch (_) { app = window.firebase.initializeApp(fbCfg, appName); }
                db = window.firebase.database(app);
                if (db.goOnline) db.goOnline();
                ref = db.ref(clean(cfg.sharesPath || 'shares'));
                connected = true;
                ctx.onConnection('connected', tr('Connecté','Connected'));
                ctx.diagnostic('connected', 'Firebase RTDB', fbCfg.projectId);
            })();
            try { await readyPromise; } finally { readyPromise = null; }
        }
        let visibilityHandler = null;
        return {
            mode:'firebaseLegacy',
            isConnected:function(){ return connected; },
            async start(events) {
                await ensureReady();
                query = ref.orderByChild('timestamp').startAt(Date.now() - ctx.config.lifetime.ttlMinutes * 60000 - 60000);
                handlers = {
                    added:function(s){ events.upsert(String(s.key), s.val() || {}); },
                    changed:function(s){ events.upsert(String(s.key), s.val() || {}); },
                    removed:function(s){ events.remove(String(s.key)); }
                };
                query.on('child_added', handlers.added);
                query.on('child_changed', handlers.changed);
                query.on('child_removed', handlers.removed);
                visibilityHandler = function () {
                    try {
                        if (!db) return;
                        if (document.hidden) {
                            if (db.goOffline) db.goOffline();
                            connected = false;
                            ctx.onConnection('disconnected', tr('Suspendu — onglet masqué','Paused — hidden tab'));
                        } else {
                            if (db.goOnline) db.goOnline();
                            connected = true;
                            ctx.onConnection('connected', tr('Connecté','Connected'));
                        }
                    } catch (_) {}
                };
                document.addEventListener('visibilitychange', visibilityHandler);
                ctx.diagnostic('connected', 'Firebase listeners', 'attached');
            },
            async stop() {
                try {
                    if (query && handlers) {
                        query.off('child_added', handlers.added); query.off('child_changed', handlers.changed); query.off('child_removed', handlers.removed);
                    }
                    if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
                    if (db && db.goOffline) db.goOffline();
                } catch (_) {}
                query = null; handlers = null; visibilityHandler = null; connected = false;
                ctx.onConnection('disconnected', tr('Déconnecté','Disconnected'));
            },
            async create(data) {
                await ensureReady();
                const payload = Object.assign({}, data, { timestamp:window.firebase.database.ServerValue.TIMESTAMP });
                return new Promise(function (resolve, reject) {
                    const child = ref.push();
                    child.set(payload, function (err) { if (err) reject(err); else resolve(child.key); });
                });
            },
            async update(id, patch) { await ensureReady(); return ref.child(id).update(patch); },
            async remove(id) { await ensureReady(); return ref.child(id).remove(); },
            async getUsage() {
                await ensureReady();
                try { const snap = await db.ref(clean(cfg.usagePath || 'stats/usage_count')).once('value'); return Number(snap.val()) || 0; } catch (_) { return 0; }
            },
            async incrementUsage() {
                await ensureReady();
                const stats = db.ref(clean(cfg.usagePath || 'stats/usage_count'));
                return new Promise(function (resolve, reject) {
                    stats.transaction(function (current) { return (Number(current) || 0) + 1; }, function (err, committed, snapshot) {
                        if (err) reject(err); else resolve(Number(snapshot && snapshot.val()) || 0);
                    });
                });
            }
        };
    });

    registerStorageAdapter('pluginApi', function (ctx) {
        const cfg = ctx.config.storage.pluginApi || {};
        let pollTimer = null, stopped = true, connected = false, known = new Map();
        const base = sameOriginApiBase(cfg.basePath || '/api/v1/contrib/pimpmykoha/internal-share');
        function request(path, options) {
            return fetch(base + path, Object.assign({ credentials:cfg.credentials || 'same-origin', headers:{ 'Accept':'application/json', 'Content-Type':'application/json' } }, options || {})).then(async function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + response.statusText);
                if (response.status === 204) return null;
                const text = await response.text();
                return text ? JSON.parse(text) : null;
            });
        }
        async function poll(events) {
            if (stopped) return;
            if (cfg.stopWhenHidden && document.hidden) return;
            try {
                const result = await request('?active=1');
                const items = Array.isArray(result) ? result : (result && Array.isArray(result.items) ? result.items : []);
                const next = new Map();
                items.forEach(function (row) {
                    const id = String(row.id || row.share_id || row.key || '');
                    if (!id) return;
                    next.set(id, row);
                    const previous = known.get(id);
                    if (!previous || JSON.stringify(previous) !== JSON.stringify(row)) events.upsert(id, row);
                });
                known.forEach(function (_, id) { if (!next.has(id)) events.remove(id); });
                known = next;
                if (result && Number.isFinite(Number(result.usageCount))) { usageCount = Number(result.usageCount); updateUsageUI(); }
                connected = true;
                ctx.onConnection('connected', tr('Connecté','Connected'));
            } catch (error) {
                connected = false;
                ctx.onConnection('error', tr('API indisponible','API unavailable'));
                ctx.diagnostic('error', 'Plugin API polling', error.message);
            }
        }
        return {
            mode:'pluginApi',
            isConnected:function(){ return connected; },
            async start(events) {
                stopped = false;
                await poll(events);
                pollTimer = window.setInterval(function () { poll(events); }, ctx.config.storage.pluginApi.pollingMs || 4000);
            },
            async stop() { stopped = true; if (pollTimer) window.clearInterval(pollTimer); pollTimer = null; known.clear(); connected = false; },
            async create(data) { const r = await request('', { method:'POST', body:JSON.stringify(data) }); return r && (r.id || r.share_id); },
            async update(id, patch) { return request('/' + encodeURIComponent(id), { method:'PATCH', body:JSON.stringify(patch) }); },
            async remove(id) { return request('/' + encodeURIComponent(id), { method:'DELETE' }); },
            async getUsage() { try { const r = await request('/stats/usage'); return Number(r && (r.count != null ? r.count : r.usageCount)) || 0; } catch (_) { return 0; } },
            async incrementUsage() { try { const r = await request('/stats/usage', { method:'POST', body:'{}' }); return Number(r && (r.count != null ? r.count : r.usageCount)) || usageCount; } catch (_) { return usageCount; } }
        };
    });

    function sameOriginApiBase(path) {
        const url = new URL(String(path || ''), window.location.origin);
        if (url.origin !== window.location.origin) throw new Error('PMK111 plugin API must be same-origin');
        if (url.pathname.indexOf('/api/') !== 0) throw new Error('PMK111 plugin API path must start with /api/');
        return url.pathname.replace(/\/$/, '');
    }

    async function stopRuntime() {
        runtimeGeneration++;
        stopInjectionObserver();
        if (currentStore && typeof currentStore.stop === 'function') {
            try { await currentStore.stop(); } catch (_) {}
        }
        currentStore = null;
        shareMap.clear();
        timerMap.forEach(function (timer) { window.clearInterval(timer); });
        timerMap.clear();
        const root = document.getElementById(ROOT_ID); if (root) root.innerHTML = '';
        const mainBtn = document.getElementById('pmk111-share-button'); if (mainBtn) mainBtn.remove();
        document.querySelectorAll('.pmk111-row-share').forEach(function (b) { b.remove(); });
    }

    async function startRuntime() {
        const myGeneration = ++runtimeGeneration;
        ensureStyles(); ensureRoot(); ensureModals();
        currentIdentity = resolveIdentity();
        currentPage = pageConfigForPath(currentPath());
        const info = await waitForBranch(10000);
        if (myGeneration !== runtimeGeneration) return;
        currentSite = resolveSite(info);
        if (!currentConfig.enabled || !currentSite) {
            addDiagnostic('disconnected', tr('Module inactif sur ce site','Module inactive on this site'), info.name || info.code || '');
            return;
        }
        startInjectionObserver();
        if (!currentSite.canReceive) return;
        try {
            currentStore = createStore();
            usageCount = currentConfig.appearance.showUsageCount ? await currentStore.getUsage().catch(function(){return 0;}) : 0;
            updateUsageUI();
            await currentStore.start({ upsert:renderShare, remove:removeRenderedShare });
        } catch (error) {
            addDiagnostic('error', tr('Stockage indisponible','Storage unavailable'), error.message);
            connectionUI('error', tr('Stockage indisponible','Storage unavailable'));
        }
    }

    function waitForBranch(timeoutMs) {
        return new Promise(function (resolve) {
            const start = Date.now();
            const run = function () {
                const info = branchInfo();
                if (info.name || info.code || Date.now() - start >= timeoutMs) resolve(info);
                else window.setTimeout(run, 250);
            };
            run();
        });
    }

    function newSite() {
        const id = 'site-' + Date.now().toString(36);
        return { id:id, enabled:true, labelFr:'Nouveau site', labelEn:'New site', matchName:'', matchCode:'', canSend:true, canReceive:true, channel:id };
    }

    function newTarget() {
        const id = 'target-' + Date.now().toString(36);
        return { id:id, enabled:true, labelFr:'Nouvelle destination', labelEn:'New destination', type:'site', value:'' };
    }

    function newStatus() {
        const id = 'status-' + Date.now().toString(36);
        return { id:id, enabled:true, variant:'default', icon:'fa-tag', terminal:false, commentPolicy:'optional', labelFr:'Nouveau statut', labelEn:'New status', reservationLabelFr:'', reservationLabelEn:'', textFr:'Nouveau statut', textEn:'New status', reservationTextFr:'', reservationTextEn:'' };
    }

    function pageFromPickerContext(ctx) {
        const path = Array.isArray(ctx && ctx.fieldPath) ? ctx.fieldPath : [];
        const idx = path.find(function (v) { return Number.isInteger(v); });
        return Number.isInteger(idx) ? (ctx.rootObject && ctx.rootObject.pages && ctx.rootObject.pages[idx]) : null;
    }

    function pickPlacement(context) {
        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!service || typeof service.pickForConfig !== 'function') return Promise.reject(new Error('pmk_common_picker_unavailable'));
        registerPickerAdapter();
        const page = pageFromPickerContext(context) || {};
        return service.pickForConfig({ moduleId:MODULE_ID, targetUrl:page.path || currentPath(), rootObject:context.rootObject || {}, fieldPath:context.fieldPath || [], adminContext:{ sectionId:'pages' }, options:{ bannerText:tr('Clique sur la zone où placer le bouton — Échap annule','Click where to place the button — Esc cancels') } });
    }

    function onPickedPlacement(rootObject, fieldPath, picked) {
        if (!rootObject || !Array.isArray(rootObject.pages) || !picked) return;
        const idx = (fieldPath || []).find(function (v) { return Number.isInteger(v); });
        if (!Number.isInteger(idx) || !rootObject.pages[idx]) return;
        rootObject.pages[idx].selector = picked.selector || picked.value || rootObject.pages[idx].selector;
        rootObject.pages[idx].placementMode = 'custom';
    }

    function registerPickerAdapter() {
        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!service || typeof service.register !== 'function') return;
        service.register(MODULE_ID, {
            buildResult:function (element, base) {
                const selector = base && base.selector ? base.selector : simpleSelector(element);
                return Object.assign({}, base || {}, { value:selector, selector:selector, targetName:clean(element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent).slice(0,100) });
            },
            applyPending:function (draft, pending, picked) { onPickedPlacement(draft, pending && pending.fieldPath || [], picked || {}); return draft; }
        });
    }

    function simpleSelector(el) {
        if (!el || !(el instanceof Element)) return '';
        if (el.id) return '#' + cssEscape(el.id);
        const cls = Array.from(el.classList || []).filter(function (c) { return !/^active$|^open$|^show$/.test(c); }).slice(0,2);
        if (cls.length) return el.tagName.toLowerCase() + '.' + cls.map(function(c){return cssEscape(c);}).join('.');
        return el.tagName.toLowerCase();
    }

    function validateConfig(config) {
        const cfg = normalizeConfig(config);
        if (!Array.isArray(cfg.sites) || !cfg.sites.length) return { ok:false, message:tr('Au moins un site doit être configuré.','At least one site must be configured.') };
        const ids = new Set();
        for (const site of cfg.sites) {
            if (!site || site.enabled === false) continue;
            if (!clean(site.id) || ids.has(site.id)) return { ok:false, message:tr('Chaque site actif doit avoir un identifiant unique.','Each enabled site needs a unique identifier.') };
            ids.add(site.id);
            if (!clean(site.matchName) && !clean(site.matchCode)) return { ok:false, message:tr('Chaque site actif doit indiquer un nom ou un code Koha à reconnaître.','Each enabled site must provide a Koha name or code to match.') };
        }
        if (cfg.routing.mode === 'targeted' && !(cfg.routing.targets || []).some(function(t){return t && t.enabled !== false;})) return { ok:false, message:tr('Le mode ciblé nécessite au moins une destination active.','Targeted mode requires at least one enabled destination.') };
        for (const page of cfg.pages || []) {
            if (!page || page.enabled === false || page.shareMode === 'reservationRows') continue;
            if (!clean(page.selector)) return { ok:false, message:tr('Une page active n’a pas de zone d’insertion.','An enabled page has no insertion target.') };
            try { document.createDocumentFragment().querySelector(page.selector); } catch (_) { return { ok:false, message:tr('Sélecteur CSS invalide : ','Invalid CSS selector: ') + page.selector }; }
        }
        const statusIds = new Set();
        for (const status of cfg.workflow.statuses || []) {
            if (!status || status.enabled === false) continue;
            if (!clean(status.id) || statusIds.has(status.id)) return { ok:false, message:tr('Chaque statut actif doit avoir un identifiant unique.','Each enabled status needs a unique identifier.') };
            statusIds.add(status.id);
        }
        return { ok:true };
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 4,
            name: { fr:'Partage interne', en:'Internal share' },
            description: {
                fr:'Partage en temps réel de pages Koha et de demandes liées aux réservations. Le stockage est abstrait : Firebase RTDB reste disponible pour la compatibilité isolée, tandis que le futur plugin peut utiliser sa propre API/BDD sans réécrire le module.',
                en:'Real-time sharing of Koha pages and hold-related requests. Storage is abstracted: Firebase RTDB remains available for standalone compatibility while the future plugin can use its own API/database without rewriting the module.'
            },
            category: { fr:'Travail collaboratif', en:'Collaboration' },
            supportedPages: PAGE_DEFINITIONS.map(function(p){return p.id;}).concat(['all-staff-pages']),
            prerequisites: [], dependencies: [], defaults: clone(DEFAULT_CONFIG), validate: validateConfig,
            schema: [
                { type:'section', id:'activation', label:{fr:'Activation et sites',en:'Activation and sites'}, fields:[
                    { key:'enabled', type:'boolean', label:{fr:'Activer le partage interne',en:'Enable internal sharing'} },
                    { key:'sites', type:'repeater', label:{fr:'Sites Koha concernés',en:'Koha sites'}, addLabel:{fr:'Ajouter un site',en:'Add site'}, reorder:true, newItem:newSite, itemTitle:function(item){return clean(item && (item.labelFr || item.matchName || item.id)) || 'Site';}, fields:[
                        {key:'enabled',type:'boolean',label:{fr:'Actif',en:'Enabled'}},{key:'id',type:'text',label:{fr:'Identifiant interne',en:'Internal ID'}},{key:'labelFr',type:'text',label:{fr:'Nom FR',en:'FR name'}},{key:'labelEn',type:'text',label:{fr:'Nom EN',en:'EN name'}},{key:'matchName',type:'text',label:{fr:'Nom du site tel qu’affiché par Koha',en:'Branch name as shown by Koha'}},{key:'matchCode',type:'text',label:{fr:'Code site Koha',en:'Koha branch code'}},{key:'canSend',type:'boolean',label:{fr:'Peut envoyer',en:'Can send'}},{key:'canReceive',type:'boolean',label:{fr:'Reçoit les demandes',en:'Receives requests'}},{key:'channel',type:'text',advanced:true,label:{fr:'Canal de diffusion',en:'Broadcast channel'}}
                    ]}
                ]},
                { type:'section', id:'pages', label:{fr:'Pages et boutons',en:'Pages and buttons'}, description:{fr:'Les pages historiques restent actives par défaut. request.pl conserve son bouton par ligne de réservation.',en:'Historical pages remain enabled by default. request.pl keeps its per-hold-row button.'}, fields:[
                    { key:'pages', type:'repeater', reorder:false, removable:false, canAdd:function(){return false;}, itemTitle:function(item,index){const d=PAGE_DEFINITIONS[index];return d ? tr(d.labelFr,d.labelEn) : clean(item && item.path);}, fields:[
                        {key:'enabled',type:'boolean',label:{fr:'Activer sur cette page',en:'Enable on this page'}},{key:'path',type:'text',readOnly:true,label:{fr:'Chemin Koha',en:'Koha path'}},{key:'shareMode',type:'select',advanced:true,label:{fr:'Mode de partage',en:'Share mode'},options:[{value:'page',label:{fr:'Bouton de page',en:'Page button'}},{value:'reservationRows',label:{fr:'Boutons par ligne de réservation',en:'Per-hold-row buttons'}}]},{key:'selector',type:'elementPicker',advanced:true,label:{fr:'Zone d’insertion du bouton',en:'Button insertion target'},pickLabel:{fr:'Choisir sur la page',en:'Choose on page'},allowManual:true,pick:pickPlacement,onPick:onPickedPlacement},{key:'position',type:'select',advanced:true,label:{fr:'Position',en:'Position'},options:[{value:'append',label:{fr:'À la fin',en:'Append'}},{value:'prepend',label:{fr:'Au début',en:'Prepend'}},{value:'before',label:{fr:'Avant la zone',en:'Before target'}},{value:'after',label:{fr:'Après la zone',en:'After target'}}]},{key:'titleTemplateFr',type:'text',advanced:true,label:{fr:'Modèle de titre FR',en:'FR title template'}},{key:'titleTemplateEn',type:'text',advanced:true,label:{fr:'Modèle de titre EN',en:'EN title template'}},{key:'noteTemplateFr',type:'textarea',advanced:true,label:{fr:'Note automatique FR',en:'FR automatic note'}},{key:'noteTemplateEn',type:'textarea',advanced:true,label:{fr:'Note automatique EN',en:'EN automatic note'}}
                    ]}
                ]},
                { type:'section', id:'routing', label:{fr:'Diffusion et destinataires',en:'Routing and recipients'}, fields:[
                    {key:'routing.mode',type:'select',label:{fr:'Mode de diffusion',en:'Routing mode'},options:[{value:'broadcastSite',label:{fr:'Tout le site — comportement historique',en:'Whole site — historical behavior'}},{value:'broadcastChannel',label:{fr:'Canal partagé',en:'Shared channel'}},{value:'broadcastAll',label:{fr:'Tous les sites configurés',en:'All configured sites'}},{value:'targeted',label:{fr:'Destination choisie à l’envoi',en:'Destination chosen when sending'}}]},
                    {key:'routing.acceptLegacyUntargeted',type:'boolean',label:{fr:'Afficher les anciens partages sans cible',en:'Show legacy untargeted shares'}},{key:'routing.allowFreeRecipient',type:'boolean',label:{fr:'Afficher le champ destinataire libre',en:'Show free-text recipient field'}},{key:'routing.recipientRequired',type:'boolean',label:{fr:'Destinataire libre obligatoire',en:'Require free-text recipient'}},
                    {key:'routing.targets',type:'repeater',label:{fr:'Destinations proposées en mode ciblé',en:'Targets offered in targeted mode'},addLabel:{fr:'Ajouter une destination',en:'Add target'},newItem:newTarget,itemTitle:function(item){return clean(item && (item.labelFr || item.id)) || 'Destination';},fields:[{key:'enabled',type:'boolean',label:{fr:'Active',en:'Enabled'}},{key:'id',type:'text',label:{fr:'Identifiant',en:'ID'}},{key:'labelFr',type:'text',label:{fr:'Libellé FR',en:'FR label'}},{key:'labelEn',type:'text',label:{fr:'Libellé EN',en:'EN label'}},{key:'type',type:'select',label:{fr:'Type',en:'Type'},options:[{value:'site',label:{fr:'Site',en:'Site'}},{value:'channel',label:{fr:'Canal',en:'Channel'}},{value:'user',label:{fr:'Utilisateur Koha',en:'Koha user'}},{value:'all',label:{fr:'Tous',en:'All'}}]},{key:'value',type:'text',label:{fr:'Valeur cible',en:'Target value'}}]}
                ]},
                { type:'section', id:'workflow', label:{fr:'Statuts et workflow',en:'Statuses and workflow'}, fields:[
                    {key:'workflow.initialTextFr',type:'text',label:{fr:'Libellé initial FR',en:'Initial FR label'}},{key:'workflow.initialTextEn',type:'text',label:{fr:'Libellé initial EN',en:'Initial EN label'}},
                    {key:'workflow.statuses',type:'repeater',label:{fr:'Statuts disponibles',en:'Available statuses'},addLabel:{fr:'Ajouter un statut',en:'Add status'},reorder:true,newItem:newStatus,itemTitle:function(item){return clean(item && (item.labelFr || item.id)) || 'Statut';},fields:[{key:'enabled',type:'boolean',label:{fr:'Actif',en:'Enabled'}},{key:'id',type:'text',label:{fr:'Identifiant',en:'ID'}},{key:'labelFr',type:'text',label:{fr:'Bouton générique FR',en:'Generic FR button'}},{key:'labelEn',type:'text',label:{fr:'Bouton générique EN',en:'Generic EN button'}},{key:'reservationLabelFr',type:'text',label:{fr:'Bouton réservation FR',en:'Hold FR button'}},{key:'reservationLabelEn',type:'text',label:{fr:'Bouton réservation EN',en:'Hold EN button'}},{key:'textFr',type:'text',label:{fr:'Texte statut FR',en:'FR status text'}},{key:'textEn',type:'text',label:{fr:'Texte statut EN',en:'EN status text'}},{key:'reservationTextFr',type:'text',label:{fr:'Texte réservation FR',en:'Hold FR status text'}},{key:'reservationTextEn',type:'text',label:{fr:'Texte réservation EN',en:'Hold EN status text'}},{key:'variant',type:'select',label:{fr:'Style Koha',en:'Koha style'},options:[{value:'default',label:'Default'},{value:'primary',label:'Primary'},{value:'success',label:'Success'},{value:'info',label:'Info'},{value:'warning',label:'Warning'},{value:'danger',label:'Danger'}]},{key:'icon',type:'text',advanced:true,label:{fr:'Classe Font Awesome',en:'Font Awesome class'}},{key:'commentPolicy',type:'select',label:{fr:'Commentaire',en:'Comment'},options:[{value:'optional',label:{fr:'Facultatif',en:'Optional'}},{value:'required',label:{fr:'Obligatoire',en:'Required'}}]},{key:'terminal',type:'boolean',label:{fr:'Statut terminal',en:'Terminal status'}}]}
                ]},
                { type:'section', id:'lifetime', label:{fr:'Durée de vie',en:'Lifetime'}, fields:[
                    {key:'lifetime.ttlMinutes',type:'number',min:1,max:1440,label:{fr:'Durée d’affichage (minutes)',en:'Display lifetime (minutes)'}},{key:'lifetime.showCountdown',type:'boolean',label:{fr:'Afficher le compte à rebours',en:'Show countdown'}},{key:'lifetime.warningBeforeSeconds',type:'number',min:0,max:86400,label:{fr:'Alerte avant expiration (secondes)',en:'Expiry warning (seconds)'}},{key:'lifetime.cleanupExpired',type:'boolean',label:{fr:'Supprimer automatiquement les demandes expirées',en:'Automatically delete expired requests'}},{key:'lifetime.deleteOnTerminal',type:'boolean',label:{fr:'Supprimer après un statut terminal',en:'Delete after terminal status'}},{key:'lifetime.deleteAfterTerminalSeconds',type:'number',min:0,max:3600,advanced:true,label:{fr:'Délai après statut terminal (secondes)',en:'Delay after terminal status (seconds)'}}
                ]},
                { type:'section', id:'permissions', label:{fr:'Droits',en:'Permissions'}, fields:[
                    {key:'permissions.statusUpdatePolicy',type:'select',label:{fr:'Qui peut changer un statut ?',en:'Who can change status?'},options:[{value:'anyViewer',label:{fr:'Tout agent qui voit la demande — historique',en:'Any viewer — historical'}},{value:'creator',label:{fr:'Créateur uniquement',en:'Creator only'}},{value:'superlibrarian',label:{fr:'Superlibrarian uniquement',en:'Superlibrarian only'}}]},{key:'permissions.deletePolicy',type:'select',label:{fr:'Qui peut supprimer ?',en:'Who can delete?'},options:[{value:'creator',label:{fr:'Créateur — historique',en:'Creator — historical'}},{value:'anyViewer',label:{fr:'Tout agent',en:'Any viewer'}},{value:'superlibrarian',label:{fr:'Superlibrarian uniquement',en:'Superlibrarian only'}}]},{key:'permissions.allowSuperlibrarianDelete',type:'boolean',label:{fr:'Le superlibrarian peut toujours supprimer',en:'Superlibrarian can always delete'}}
                ]},
                { type:'section', id:'appearance', label:{fr:'Apparence',en:'Appearance'}, fields:[
                    {key:'appearance.mode',type:'select',label:{fr:'Style',en:'Style'},options:[{value:'koha',label:{fr:'Intégré à Koha — recommandé',en:'Koha integrated — recommended'}},{value:'legacyDark',label:{fr:'Historique sombre',en:'Legacy dark'}}]},{key:'appearance.position',type:'select',label:{fr:'Position des demandes',en:'Request position'},options:[{value:'bottom-right',label:{fr:'Bas droite',en:'Bottom right'}},{value:'bottom-left',label:{fr:'Bas gauche',en:'Bottom left'}},{value:'top-right',label:{fr:'Haut droite',en:'Top right'}},{value:'top-left',label:{fr:'Haut gauche',en:'Top left'}}]},{key:'appearance.widthPx',type:'number',min:280,max:760,label:{fr:'Largeur maximale (px)',en:'Maximum width (px)'}},{key:'appearance.maxVisible',type:'number',min:0,max:100,label:{fr:'Nombre maximal visible (0 = illimité)',en:'Maximum visible (0 = unlimited)'}},{key:'appearance.newestFirst',type:'boolean',label:{fr:'Nouveaux partages en premier',en:'Newest shares first'}},{key:'appearance.rememberCollapsed',type:'boolean',label:{fr:'Mémoriser les demandes repliées',en:'Remember collapsed requests'}},{key:'appearance.collapsedByDefault',type:'boolean',label:{fr:'Demandes repliées par défaut',en:'Collapsed by default'}},{key:'appearance.compactOnMobile',type:'boolean',label:{fr:'Mode compact sur petit écran',en:'Compact on small screens'}},{key:'appearance.showCreator',type:'boolean',label:{fr:'Afficher le créateur',en:'Show creator'}},{key:'appearance.showSenderSite',type:'boolean',label:{fr:'Afficher le site émetteur',en:'Show sender site'}},{key:'appearance.showUsageCount',type:'boolean',label:{fr:'Afficher le compteur d’utilisation',en:'Show usage counter'}},{key:'appearance.showConnectionStatus',type:'boolean',label:{fr:'Afficher l’état de connexion',en:'Show connection status'}},{key:'appearance.showDiagnostics',type:'boolean',advanced:true,label:{fr:'Afficher l’accès au diagnostic',en:'Show diagnostics access'}},{key:'appearance.buttonLabelFr',type:'text',label:{fr:'Libellé du bouton FR',en:'FR button label'}},{key:'appearance.buttonLabelEn',type:'text',label:{fr:'Libellé du bouton EN',en:'EN button label'}}
                ]},
                { type:'section', id:'storage', label:{fr:'Stockage',en:'Storage'}, description:{fr:'Firebase RTDB n’est qu’un adaptateur de compatibilité pour la phase script isolé. Le mode pluginApi est déjà prêt pour la future BDD Koha.',en:'Firebase RTDB is only a standalone compatibility adapter. pluginApi is already prepared for the future Koha database.'}, fields:[
                    {key:'storage.mode',type:'select',label:{fr:'Moteur de stockage',en:'Storage engine'},options:[{value:'firebaseLegacy',label:{fr:'Firebase RTDB — compatibilité actuelle',en:'Firebase RTDB — current compatibility'}},{value:'pluginApi',label:{fr:'API du plugin / BDD Koha',en:'Plugin API / Koha database'}}]},
                    {key:'storage.pluginApi.basePath',type:'text',advanced:true,label:{fr:'Route API du plugin',en:'Plugin API route'}},{key:'storage.pluginApi.pollingMs',type:'number',min:1000,max:60000,advanced:true,label:{fr:'Intervalle de synchronisation (ms)',en:'Sync interval (ms)'}},{key:'storage.pluginApi.stopWhenHidden',type:'boolean',advanced:true,label:{fr:'Suspendre le polling si l’onglet est masqué',en:'Pause polling when tab is hidden'}},
                    {key:'storage.firebaseLegacy.enabled',type:'boolean',advanced:true,label:{fr:'Autoriser Firebase legacy',en:'Allow legacy Firebase'}},{key:'storage.firebaseLegacy.sdkVersion',type:'text',advanced:true,label:{fr:'Version SDK Firebase',en:'Firebase SDK version'}},{key:'storage.firebaseLegacy.sharesPath',type:'text',advanced:true,label:{fr:'Chemin des partages RTDB',en:'RTDB shares path'}},{key:'storage.firebaseLegacy.usagePath',type:'text',advanced:true,label:{fr:'Chemin du compteur RTDB',en:'RTDB usage path'}},{key:'storage.firebaseLegacy.config.apiKey',type:'text',advanced:true,label:'Firebase apiKey'},{key:'storage.firebaseLegacy.config.authDomain',type:'text',advanced:true,label:'Firebase authDomain'},{key:'storage.firebaseLegacy.config.databaseURL',type:'text',advanced:true,label:'Firebase databaseURL'},{key:'storage.firebaseLegacy.config.projectId',type:'text',advanced:true,label:'Firebase projectId'},{key:'storage.firebaseLegacy.config.storageBucket',type:'text',advanced:true,label:'Firebase storageBucket'},{key:'storage.firebaseLegacy.config.messagingSenderId',type:'text',advanced:true,label:'Firebase messagingSenderId'},{key:'storage.firebaseLegacy.config.appId',type:'text',advanced:true,label:'Firebase appId'}
                ]},
                { type:'section', id:'advanced', label:{fr:'Avancé / diagnostic',en:'Advanced / diagnostics'}, fields:[
                    {key:'identity.preferKohaUsername',type:'boolean',advanced:true,label:{fr:'Identifier le créateur avec le compte Koha',en:'Identify creator using Koha account'}},{key:'identity.fallbackToSessionId',type:'boolean',advanced:true,label:{fr:'Repli sur un identifiant de session',en:'Fallback to session ID'}},{key:'identity.usernameSelector',type:'text',advanced:true,label:{fr:'Sélecteur du compte Koha',en:'Koha account selector'}},{key:'diagnostics.enabled',type:'boolean',advanced:true,label:{fr:'Activer le journal de diagnostic local',en:'Enable local diagnostics log'}},{key:'diagnostics.maxEntries',type:'number',min:10,max:500,advanced:true,label:{fr:'Nombre maximal d’événements',en:'Maximum log entries'}},{key:'diagnostics.logToConsole',type:'boolean',advanced:true,label:{fr:'Dupliquer les événements dans la console',en:'Also log events to console'}}
                ]}
            ],
            focusContext:function(main, context) {
                if (!main || !context) return;
                const section = main.querySelector('[data-pmk-section-id="' + (context.sectionId || 'activation') + '"]');
                if (section) window.setTimeout(function(){section.scrollIntoView({behavior:'smooth',block:'start'});},0);
            }
        };
    }

    function registerWithPMK() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== 'function' || configRegistered) return false;
        configRegistered = true;
        window.PMKConfig.registerModule(moduleDefinition());
        registerPickerAdapter();
        if (typeof window.PMKConfig.getConfig === 'function') {
            window.PMKConfig.getConfig(MODULE_ID).then(function (cfg) {
                currentConfig = normalizeConfig(cfg || {});
                restartRuntime();
            }).catch(function () { currentConfig = normalizeConfig(DEFAULT_CONFIG); restartRuntime(); });
        }
        if (typeof window.PMKConfig.subscribe === 'function') {
            unsubscribeConfig = window.PMKConfig.subscribe(MODULE_ID, function (cfg) {
                currentConfig = normalizeConfig(cfg || {});
                restartRuntime();
            });
        }
        return true;
    }

    let restartTimer = null;
    function restartRuntime() {
        if (restartTimer) window.clearTimeout(restartTimer);
        restartTimer = window.setTimeout(async function () {
            restartTimer = null;
            await stopRuntime();
            startRuntime();
        }, 50);
    }

    function boot() {
        currentConfig = normalizeConfig(DEFAULT_CONFIG);
        registerWithPMK();
        if (!configRegistered) {
            window.addEventListener('pmk:config-ready', function () { registerWithPMK(); }, { once:true });
            window.setTimeout(registerWithPMK, 1500);
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { if (!configRegistered) startRuntime(); }, { once:true });
        else if (!configRegistered) startRuntime();
    }

    window.PMK111StorageAdapters = {
        register: registerStorageAdapter,
        list: function () { return Object.keys(adapterFactories); }
    };

    window.PMK111InternalShare = {
        moduleId: MODULE_ID,
        version: VERSION,
        defaults: clone(DEFAULT_CONFIG),
        moduleDefinition: moduleDefinition,
        getConfig: function () { return clone(currentConfig); },
        getSite: function () { return clone(currentSite); },
        getIdentity: function () { return clone(currentIdentity); },
        refresh: restartRuntime,
        stop: stopRuntime,
        openShare: function (title, note) { openShareModal({ kind:'page', title:title || generatePageTitle(currentPage), note:note || '' }); },
        diagnostics: readDiagnostics,
        storageAdapters: window.PMK111StorageAdapters
    };

    window.addEventListener('pagehide', function () { stopRuntime(); });
    boot();
})();

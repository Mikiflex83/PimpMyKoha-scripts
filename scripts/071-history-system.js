/*
 * Nom du fichier : 071-history-system.js
 * Version refondue : 2026-09-07
 *
 * Objet :
 * - historique local des consultations d'adhérents ;
 * - historique local des consultations de notices ;
 * - historique local des recherches catalogue ;
 * - panneau latéral unique, propre et compatible avec la barre basse Koha.
 *
 * Compatibilité conservée :
 * - localStorage['customMemberHistory']
 * - localStorage['customNoticeHistory']
 * - localStorage['customSearchHistory']
 * - #customSidebar
 * - #customHistoryContent
 * - window.openNav()
 * - window.closeNav()
 * - événement koha:requestOpenHistory
 *
 * Aucune API Koha n'est appelée par ce script.
 */

(function () {
    'use strict';

    if (window.__KX_HISTORY_SYSTEM__) return;
    window.__KX_HISTORY_SYSTEM__ = true;

    const CONFIG = {
        maxEntries: 50,
        storage: {
            members: 'customMemberHistory',
            notices: 'customNoticeHistory',
            searches: 'customSearchHistory',
            activeTab: 'customHistoryActiveTab'
        },
        duplicateWindowMs: 15000,
        panelMaxWidth: 430
    };

    const PAGE = {
        path: window.location.pathname || '',
        url: window.location.href || ''
    };

    // Pages sur lesquelles aucun historique/panneau ne doit être injecté.
    if (
        /(?:print|slip)/i.test(PAGE.url) ||
        document.getElementById('login') ||
        document.body?.id === 'login'
    ) {
        return;
    }

    /* ============================================================
       OUTILS
       ============================================================ */

    function safeJsonParse(value, fallback) {
        try {
            const parsed = JSON.parse(value);
            return parsed == null ? fallback : parsed;
        } catch (_) {
            return fallback;
        }
    }

    function readHistory(key) {
        const value = safeJsonParse(localStorage.getItem(key), []);
        return Array.isArray(value) ? value : [];
    }

    function writeHistory(key, entries) {
        const safeEntries = Array.isArray(entries) ? entries.slice(-CONFIG.maxEntries) : [];
        localStorage.setItem(key, JSON.stringify(safeEntries));
    }

    function cleanText(value) {
        return String(value == null ? '' : value)
            .replace(/\s+/g, ' ')
            .trim();
    }

    function validTimestamp(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? new Date() : date;
    }

    function timestampIso() {
        return new Date().toISOString();
    }

    function formatDate(value) {
        return validTimestamp(value).toLocaleString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function relativeTime(value) {
        const date = validTimestamp(value);
        const diffMs = Date.now() - date.getTime();
        const abs = Math.abs(diffMs);
        const future = diffMs < 0;

        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;

        let amount;
        let unit;

        if (abs < minute) return 'à l’instant';
        if (abs < hour) {
            amount = Math.max(1, Math.round(abs / minute));
            unit = amount > 1 ? 'minutes' : 'minute';
        } else if (abs < day) {
            amount = Math.max(1, Math.round(abs / hour));
            unit = amount > 1 ? 'heures' : 'heure';
        } else if (abs < 7 * day) {
            amount = Math.max(1, Math.round(abs / day));
            unit = amount > 1 ? 'jours' : 'jour';
        } else {
            return formatDate(value);
        }

        return future ? `dans ${amount} ${unit}` : `il y a ${amount} ${unit}`;
    }

    function createElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text != null) element.textContent = text;
        return element;
    }

    function icon(className) {
        const i = document.createElement('i');
        i.className = className;
        i.setAttribute('aria-hidden', 'true');
        return i;
    }

    function getFirstText(selectors) {
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            const text = cleanText(element?.textContent);
            if (text) return text;
        }
        return '';
    }

    function entryTimestampMs(entry) {
        const time = new Date(entry?.timestamp || 0).getTime();
        return Number.isNaN(time) ? 0 : time;
    }

    function appendWithRecentDuplicateGuard(key, entry, sameEntry) {
        const history = readHistory(key);
        const last = history[history.length - 1];

        // Évite seulement les doublons créés par une double initialisation/rechargement immédiat.
        // Une nouvelle consultation plus tard reste bien historisée.
        if (
            last &&
            sameEntry(last, entry) &&
            Math.abs(entryTimestampMs(entry) - entryTimestampMs(last)) <= CONFIG.duplicateWindowMs
        ) {
            history[history.length - 1] = entry;
        } else {
            history.push(entry);
        }

        writeHistory(key, history);
    }

    /* ============================================================
       ENREGISTREMENT DES CONSULTATIONS
       ============================================================ */

    function addMemberConsultation() {
        const params = new URLSearchParams(window.location.search);
        const memberId = cleanText(params.get('borrowernumber'));
        if (!memberId) return;

        let memberName = getFirstText([
            '.patroninfo h5',
            '#patronbasics h1',
            '#patronbasics h2',
            '.patron-title',
            'main h1'
        ]);

        // Ancien rendu Koha : "Prénom NOM (numéro)".
        memberName = cleanText(memberName.split(' (')[0]);
        if (!memberName) memberName = `Adhérent ${memberId}`;

        const entry = {
            id: memberId,
            name: memberName,
            timestamp: timestampIso()
        };

        appendWithRecentDuplicateGuard(
            CONFIG.storage.members,
            entry,
            (a, b) => String(a?.id || '') === String(b?.id || '')
        );
    }

    function addNoticeConsultation() {
        const params = new URLSearchParams(window.location.search);
        const noticeId = cleanText(params.get('biblionumber'));
        if (!noticeId) return;

        let title = getFirstText([
            '.titlemika .titlebib a',
            '#catalogue_detail_biblio .titlebib a',
            '.titlemika a',
            '#catalogue_detail_biblio .first .titlebib',
            '#catalogue_detail_biblio .first',
            'main h1'
        ]);

        if (!title) title = `Notice ${noticeId}`;

        const entry = {
            id: noticeId,
            title,
            timestamp: timestampIso()
        };

        appendWithRecentDuplicateGuard(
            CONFIG.storage.notices,
            entry,
            (a, b) => String(a?.id || '') === String(b?.id || '')
        );
    }

    function buildSearchLabel(params) {
        const queries = params.getAll('q').map(cleanText).filter(Boolean);
        const indexes = params.getAll('idx').map(cleanText).filter(Boolean);

        if (queries.length === 0) return '';

        if (queries.length === 1) {
            const q = queries[0];
            const idx = indexes[0];
            if (idx && idx !== 'kw') return `${q} · ${idx}`;
            return q;
        }

        return queries.join(' + ');
    }

    function addCatalogSearch() {
        const params = new URLSearchParams(window.location.search);
        const queries = params.getAll('q').map(cleanText).filter(Boolean);
        if (queries.length === 0) return;

        const entry = {
            query: queries.join(' '),
            label: buildSearchLabel(params) || queries.join(' '),
            url: `${window.location.pathname}${window.location.search}`,
            timestamp: timestampIso()
        };

        appendWithRecentDuplicateGuard(
            CONFIG.storage.searches,
            entry,
            (a, b) => {
                const oldUrl = cleanText(a?.url);
                const newUrl = cleanText(b?.url);
                if (oldUrl && newUrl) return oldUrl === newUrl;
                return cleanText(a?.query) === cleanText(b?.query);
            }
        );
    }

    function recordCurrentPage() {
        try {
            if (PAGE.path.includes('/cgi-bin/koha/members/moremember.pl')) {
                addMemberConsultation();
            } else if (PAGE.path.includes('/cgi-bin/koha/catalogue/detail.pl')) {
                addNoticeConsultation();
            } else if (PAGE.path.includes('/cgi-bin/koha/catalogue/search.pl')) {
                addCatalogSearch();
            }
        } catch (error) {
            (function(){})('[KX History] enregistrement impossible', error);
        }
    }

    /* ============================================================
       SUPPRESSION / VIDAGE
       ============================================================ */

    function removeAt(key, originalIndex) {
        const history = readHistory(key);
        if (originalIndex < 0 || originalIndex >= history.length) return;
        history.splice(originalIndex, 1);
        writeHistory(key, history);
        renderHistory();
    }

    function deleteMemberConsultation(index) {
        removeAt(CONFIG.storage.members, Number(index));
    }

    function deleteNoticeConsultation(index) {
        removeAt(CONFIG.storage.notices, Number(index));
    }

    function deleteSearchHistory(index) {
        removeAt(CONFIG.storage.searches, Number(index));
    }

    function clearHistoryKey(key) {
        localStorage.removeItem(key);
        renderHistory();
    }

    function clearMemberHistory() {
        clearHistoryKey(CONFIG.storage.members);
    }

    function clearNoticeHistory() {
        clearHistoryKey(CONFIG.storage.notices);
    }

    function clearSearchHistory() {
        clearHistoryKey(CONFIG.storage.searches);
    }

    function clearAllHistory() {
        localStorage.removeItem(CONFIG.storage.members);
        localStorage.removeItem(CONFIG.storage.notices);
        localStorage.removeItem(CONFIG.storage.searches);
        renderHistory();
    }

    /* ============================================================
       CSS
       ============================================================ */

    function installStyles() {
        if (document.getElementById('kx-history-style')) return;

        const style = document.createElement('style');
        style.id = 'kx-history-style';
        style.textContent = `
            :root {
                --kx-history-green: #4f772d;
                --kx-history-green-dark: #365314;
                --kx-history-green-soft: #f3f7ef;
                --kx-history-border: #d9dfe3;
                --kx-history-text: #27313a;
                --kx-history-muted: #6b7280;
                --kx-history-danger: #b42318;
            }

            #customSidebar.kx-history-panel {
                position: fixed !important;
                z-index: 10049 !important;
                top: 0 !important;
                right: 0 !important;
                left: auto !important;
                height: 100vh !important;
                height: 100dvh !important;
                box-sizing: border-box !important;
                display: flex !important;
                flex-direction: column !important;
                padding: 0 !important;
                overflow: hidden !important;
                background: #fff !important;
                color: var(--kx-history-text) !important;
                border-left: 1px solid var(--kx-history-border) !important;
                box-shadow: -10px 0 30px rgba(30, 41, 59, .16) !important;
                transform: translateX(105%);
                transition: transform .22s ease, width .22s ease !important;
                font-family: inherit !important;
            }

            #customSidebar.kx-history-panel.is-open {
                transform: translateX(0);
            }

            #customSidebar .kx-history-header {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 14px 14px 12px;
                background: linear-gradient(135deg, var(--kx-history-green), var(--kx-history-green-dark));
                color: #fff;
                flex: 0 0 auto;
            }

            #customSidebar .kx-history-header-main {
                min-width: 0;
                flex: 1;
            }

            #customSidebar .kx-history-title {
                margin: 0;
                color: #fff !important;
                font-size: 18px;
                font-weight: 800;
                line-height: 1.2;
                text-shadow: 0 1px 2px rgba(0,0,0,.22);
            }

            #customSidebar .kx-history-subtitle {
                margin-top: 4px;
                color: #fff !important;
                font-size: 12px;
                font-weight: 600;
                line-height: 1.3;
                text-shadow: 0 1px 1px rgba(0,0,0,.16);
            }

            #customSidebar .customClosebtn,
            #customSidebar .kx-history-close {
                position: static !important;
                width: 34px;
                height: 34px;
                flex: 0 0 34px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                margin: 0 !important;
                padding: 0 !important;
                border: 1px solid rgba(255,255,255,.28) !important;
                border-radius: 8px;
                background: rgba(255,255,255,.12) !important;
                color: #fff !important;
                cursor: pointer;
                font-size: 20px !important;
                line-height: 1;
                text-decoration: none !important;
            }

            #customSidebar .customClosebtn:hover,
            #customSidebar .kx-history-close:hover {
                background: rgba(255,255,255,.22) !important;
            }

            #customSidebar .kx-history-tabs {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 6px;
                padding: 10px 10px 0;
                background: #fff;
                flex: 0 0 auto;
            }

            #customSidebar .kx-history-tab {
                min-width: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 9px 6px;
                border: 1px solid var(--kx-history-border);
                border-radius: 8px 8px 0 0;
                background: #f8fafc;
                color: #475569;
                cursor: pointer;
                font-size: 12px;
                font-weight: 650;
            }

            #customSidebar .kx-history-tab.is-active {
                background: var(--kx-history-green-soft);
                color: var(--kx-history-green-dark);
                border-bottom-color: var(--kx-history-green-soft);
            }

            #customSidebar .kx-history-count {
                min-width: 21px;
                height: 21px;
                padding: 0 5px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                box-sizing: border-box;
                border-radius: 999px;
                background: #e2e8f0;
                color: #334155;
                font-size: 10px;
                font-weight: 700;
            }

            #customSidebar .kx-history-tab.is-active .kx-history-count {
                background: var(--kx-history-green);
                color: #fff;
            }

            #customHistoryContent {
                flex: 1;
                min-height: 0;
                display: flex;
                flex-direction: column;
                padding: 10px;
                background: #f8fafc;
                border-top: 1px solid var(--kx-history-border);
                overflow: hidden;
            }

            #customSidebar .kx-history-tools {
                display: flex;
                gap: 6px;
                margin-bottom: 8px;
                flex: 0 0 auto;
            }

            #customSidebar .kx-history-search {
                min-width: 0;
                flex: 1;
                box-sizing: border-box;
                padding: 8px 10px;
                border: 1px solid #cbd5e1;
                border-radius: 7px;
                background: #fff;
                color: #1f2937;
            }

            #customSidebar .kx-history-clear {
                min-height: 34px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                padding: 0 10px;
                border: 1px solid #f2c8c4;
                border-radius: 7px;
                background: #fff8f7;
                color: var(--kx-history-danger);
                cursor: pointer;
                font-size: 11.5px;
                font-weight: 650;
                white-space: nowrap;
            }

            #customSidebar .kx-history-clear:hover {
                background: #fff1ef;
                border-color: #e6aaa4;
            }

            #customSidebar .kx-history-list {
                flex: 1;
                min-height: 0;
                overflow-y: auto;
                padding-right: 2px;
            }

            #customSidebar .kx-history-empty {
                margin: 22px 8px;
                padding: 22px 14px;
                border: 1px dashed #cbd5e1;
                border-radius: 10px;
                background: #fff;
                text-align: center;
                color: var(--kx-history-muted);
                font-size: 13px;
            }

            #customSidebar .kx-history-card {
                position: relative;
                display: flex;
                align-items: flex-start;
                gap: 10px;
                margin-bottom: 7px;
                padding: 10px 35px 10px 10px;
                border: 1px solid var(--kx-history-border);
                border-radius: 9px;
                background: #fff;
                box-shadow: 0 1px 2px rgba(15,23,42,.03);
            }

            #customSidebar .kx-history-icon {
                width: 34px;
                height: 34px;
                flex: 0 0 34px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 8px;
                background: var(--kx-history-green-soft);
                color: var(--kx-history-green-dark);
                font-size: 14px;
            }

            #customSidebar .kx-history-card-body {
                min-width: 0;
                flex: 1;
            }

            #customSidebar .kx-history-link {
                display: block;
                margin: 0 0 3px;
                color: var(--kx-history-green-dark) !important;
                font-weight: 700;
                line-height: 1.25;
                text-decoration: none !important;
                overflow-wrap: anywhere;
            }

            #customSidebar .kx-history-link:hover {
                text-decoration: underline !important;
            }

            #customSidebar .kx-history-meta {
                color: #64748b;
                font-size: 11.5px;
                line-height: 1.35;
                overflow-wrap: anywhere;
            }

            #customSidebar .kx-history-time {
                display: flex;
                flex-wrap: wrap;
                gap: 5px;
                margin-top: 5px;
                color: #64748b;
                font-size: 10.5px;
            }

            #customSidebar .kx-history-time strong {
                color: #475569;
                font-weight: 650;
            }

            #customSidebar .kx-history-remove {
                position: absolute;
                top: 7px;
                right: 7px;
                width: 25px;
                height: 25px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 0;
                border: 1px solid transparent;
                border-radius: 6px;
                background: transparent;
                color: #94a3b8;
                cursor: pointer;
                font-size: 15px;
            }

            #customSidebar .kx-history-remove:hover {
                color: var(--kx-history-danger);
                border-color: #f2c8c4;
                background: #fff8f7;
            }

            #customSidebar .kx-history-footer {
                flex: 0 0 auto;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
                padding: 8px 10px;
                border-top: 1px solid var(--kx-history-border);
                background: #fff;
                color: #64748b;
                font-size: 11px;
            }

            #customSidebar .kx-history-clear-all {
                border: 0;
                background: transparent;
                color: var(--kx-history-danger);
                cursor: pointer;
                font-size: 11px;
                font-weight: 650;
                padding: 4px 0;
            }

            #customSidebar .kx-history-clear-all:hover {
                text-decoration: underline;
            }

            @media (max-width: 600px) {
                #customSidebar .kx-history-tab {
                    font-size: 11px;
                    padding-inline: 4px;
                }

                #customSidebar .kx-history-tab .kx-history-tab-label {
                    display: none;
                }

                #customSidebar .kx-history-tools {
                    flex-direction: column;
                }
            }
        `;

        document.head.appendChild(style);
    }

    /* ============================================================
       PANNEAU
       ============================================================ */

    const uiState = {
        activeTab: localStorage.getItem(CONFIG.storage.activeTab) || 'members',
        filter: ''
    };

    function panelWidthPx() {
        return `${Math.min(CONFIG.panelMaxWidth, Math.max(280, Math.round(window.innerWidth * 0.94)))}px`;
    }

    function createSidebar() {
        let panel = document.getElementById('customSidebar');

        // Si l'ancien 071 a déjà injecté son panneau, on le remplace proprement
        // en conservant le même ID pour les intégrations existantes.
        if (panel) panel.remove();

        panel = createElement('aside', 'kx-history-panel');
        panel.id = 'customSidebar';
        panel.setAttribute('aria-label', 'Historique récent');
        panel.setAttribute('aria-hidden', 'true');
        panel.style.width = '0px';

        const header = createElement('div', 'kx-history-header');
        const headerMain = createElement('div', 'kx-history-header-main');
        const title = createElement('h2', 'kx-history-title', 'Historique récent');
        const subtitle = createElement('div', 'kx-history-subtitle', 'Adhérents, notices et recherches consultés');
        headerMain.append(title, subtitle);

        const closeButton = createElement('button', 'customClosebtn kx-history-close');
        closeButton.type = 'button';
        closeButton.setAttribute('aria-label', 'Fermer l’historique');
        closeButton.title = 'Fermer';
        closeButton.appendChild(icon('fa-solid fa-xmark'));
        closeButton.addEventListener('click', closeNav);

        header.append(headerMain, closeButton);

        const tabs = createElement('div', 'kx-history-tabs');
        tabs.setAttribute('role', 'tablist');

        tabs.append(
            buildTabButton('members', 'fa-solid fa-user', 'Adhérents'),
            buildTabButton('notices', 'fa-solid fa-book', 'Notices'),
            buildTabButton('searches', 'fa-solid fa-magnifying-glass', 'Recherches')
        );

        const content = createElement('div');
        content.id = 'customHistoryContent';

        const footer = createElement('div', 'kx-history-footer');
        const info = createElement('span', 'kx-history-footer-info');
        const clearAll = createElement('button', 'kx-history-clear-all', 'Tout effacer');
        clearAll.type = 'button';
        clearAll.addEventListener('click', function () {
            if (!totalEntries()) return;
            if (window.confirm('Vider tous les historiques (adhérents, notices et recherches) ?')) {
                clearAllHistory();
            }
        });
        footer.append(info, clearAll);

        panel.append(header, tabs, content, footer);
        document.body.appendChild(panel);

        renderHistory();
        return panel;
    }

    function buildTabButton(tab, iconClass, label) {
        const button = createElement('button', 'kx-history-tab');
        button.type = 'button';
        button.dataset.tab = tab;
        button.setAttribute('role', 'tab');
        button.appendChild(icon(iconClass));

        const text = createElement('span', 'kx-history-tab-label', label);
        const count = createElement('span', 'kx-history-count', '0');
        button.append(text, count);

        button.addEventListener('click', function () {
            uiState.activeTab = tab;
            uiState.filter = '';
            localStorage.setItem(CONFIG.storage.activeTab, tab);
            renderHistory();
        });

        return button;
    }

    function totalEntries() {
        return readHistory(CONFIG.storage.members).length +
            readHistory(CONFIG.storage.notices).length +
            readHistory(CONFIG.storage.searches).length;
    }

    function setPanelOpen(open) {
        const panel = document.getElementById('customSidebar');
        if (!panel) return;

        if (open) {
            // Évite que les deux panneaux latéraux se superposent.
            const listsPanel = document.getElementById('kx-temp-lists-panel');
            if (listsPanel?.classList.contains('is-open')) {
                listsPanel.classList.remove('is-open');
                listsPanel.setAttribute('aria-hidden', 'true');
                localStorage.setItem('sidebarOpen', 'false');
            }

            panel.style.width = panelWidthPx();
            panel.classList.add('is-open');
            panel.setAttribute('aria-hidden', 'false');
            renderHistory();
        } else {
            panel.classList.remove('is-open');
            panel.setAttribute('aria-hidden', 'true');
            panel.style.width = '0px';
        }
    }

    function openNav() {
        setPanelOpen(true);
    }

    function closeNav() {
        setPanelOpen(false);
    }

    function toggleHistoryPanel() {
        const panel = document.getElementById('customSidebar');
        if (!panel) return;
        setPanelOpen(!panel.classList.contains('is-open'));
    }

    /* ============================================================
       RENDU
       ============================================================ */

    function getTabDefinition(tab) {
        if (tab === 'notices') {
            return {
                key: CONFIG.storage.notices,
                label: 'notice',
                plural: 'notices',
                empty: 'Aucune notice consultée.',
                placeholder: 'Filtrer les notices…',
                clearLabel: 'Vider les notices',
                clear: clearNoticeHistory
            };
        }

        if (tab === 'searches') {
            return {
                key: CONFIG.storage.searches,
                label: 'recherche',
                plural: 'recherches',
                empty: 'Aucune recherche enregistrée.',
                placeholder: 'Filtrer les recherches…',
                clearLabel: 'Vider les recherches',
                clear: clearSearchHistory
            };
        }

        return {
            key: CONFIG.storage.members,
            label: 'adhérent',
            plural: 'adhérents',
            empty: 'Aucun adhérent consulté.',
            placeholder: 'Filtrer les adhérents…',
            clearLabel: 'Vider les adhérents',
            clear: clearMemberHistory
        };
    }

    function normalizeSearchText(entry, tab) {
        if (tab === 'members') return `${entry?.name || ''} ${entry?.id || ''}`.toLowerCase();
        if (tab === 'notices') return `${entry?.title || ''} ${entry?.id || ''}`.toLowerCase();
        return `${entry?.label || ''} ${entry?.query || ''} ${entry?.url || ''}`.toLowerCase();
    }

    function entryLink(entry, tab) {
        if (tab === 'members') {
            return `/cgi-bin/koha/members/moremember.pl?borrowernumber=${encodeURIComponent(entry?.id || '')}`;
        }
        if (tab === 'notices') {
            return `/cgi-bin/koha/catalogue/detail.pl?biblionumber=${encodeURIComponent(entry?.id || '')}`;
        }
        if (cleanText(entry?.url)) return entry.url;
        return `/cgi-bin/koha/catalogue/search.pl?q=${encodeURIComponent(entry?.query || '')}`;
    }

    function entryTitle(entry, tab) {
        if (tab === 'members') return cleanText(entry?.name) || `Adhérent ${entry?.id || ''}`;
        if (tab === 'notices') return cleanText(entry?.title) || `Notice ${entry?.id || ''}`;
        return cleanText(entry?.label) || cleanText(entry?.query) || 'Recherche catalogue';
    }

    function entryMeta(entry, tab) {
        if (tab === 'members') return `Adhérent n° ${cleanText(entry?.id) || '—'}`;
        if (tab === 'notices') return `Notice n° ${cleanText(entry?.id) || '—'}`;
        return cleanText(entry?.query) && cleanText(entry?.query) !== cleanText(entry?.label)
            ? cleanText(entry?.query)
            : 'Recherche catalogue';
    }

    function entryIcon(tab) {
        if (tab === 'members') return 'fa-solid fa-user';
        if (tab === 'notices') return 'fa-solid fa-book';
        return 'fa-solid fa-magnifying-glass';
    }

    function buildHistoryCard(entry, originalIndex, tab) {
        const card = createElement('div', 'kx-history-card');

        const iconWrap = createElement('div', 'kx-history-icon');
        iconWrap.appendChild(icon(entryIcon(tab)));

        const body = createElement('div', 'kx-history-card-body');
        const link = createElement('a', 'kx-history-link', entryTitle(entry, tab));
        link.href = entryLink(entry, tab);

        const meta = createElement('div', 'kx-history-meta', entryMeta(entry, tab));
        const time = createElement('div', 'kx-history-time');
        time.title = formatDate(entry?.timestamp);
        time.append(
            createElement('strong', '', relativeTime(entry?.timestamp)),
            createElement('span', '', `· ${formatDate(entry?.timestamp)}`)
        );

        body.append(link, meta, time);

        const remove = createElement('button', 'kx-history-remove');
        remove.type = 'button';
        remove.title = 'Supprimer cette entrée';
        remove.setAttribute('aria-label', 'Supprimer cette entrée');
        remove.appendChild(icon('fa-solid fa-xmark'));
        remove.addEventListener('click', function () {
            const definition = getTabDefinition(tab);
            removeAt(definition.key, originalIndex);
        });

        card.append(iconWrap, body, remove);
        return card;
    }

    function renderHistory() {
        const panel = document.getElementById('customSidebar');
        const container = document.getElementById('customHistoryContent');
        if (!panel || !container) return;

        const memberHistory = readHistory(CONFIG.storage.members);
        const noticeHistory = readHistory(CONFIG.storage.notices);
        const searchHistory = readHistory(CONFIG.storage.searches);

        const counts = {
            members: memberHistory.length,
            notices: noticeHistory.length,
            searches: searchHistory.length
        };

        panel.querySelectorAll('.kx-history-tab').forEach(function (tabButton) {
            const tab = tabButton.dataset.tab;
            const active = tab === uiState.activeTab;
            tabButton.classList.toggle('is-active', active);
            tabButton.setAttribute('aria-selected', active ? 'true' : 'false');
            const count = tabButton.querySelector('.kx-history-count');
            if (count) count.textContent = String(counts[tab] || 0);
        });

        const definition = getTabDefinition(uiState.activeTab);
        const source = uiState.activeTab === 'members'
            ? memberHistory
            : uiState.activeTab === 'notices'
                ? noticeHistory
                : searchHistory;

        container.replaceChildren();

        const tools = createElement('div', 'kx-history-tools');
        const search = createElement('input', 'kx-history-search');
        search.type = 'search';
        search.placeholder = definition.placeholder;
        search.value = uiState.filter;
        search.setAttribute('aria-label', definition.placeholder.replace('…', ''));

        const clearButton = createElement('button', 'kx-history-clear');
        clearButton.type = 'button';
        clearButton.appendChild(icon('fa-solid fa-trash-can'));
        clearButton.appendChild(document.createTextNode(` ${definition.clearLabel}`));
        clearButton.disabled = source.length === 0;
        clearButton.addEventListener('click', function () {
            if (!source.length) return;
            if (window.confirm(`Vider l’historique des ${definition.plural} ?`)) {
                definition.clear();
            }
        });

        tools.append(search, clearButton);

        const list = createElement('div', 'kx-history-list');
        container.append(tools, list);

        function renderList() {
            list.replaceChildren();
            const filter = cleanText(uiState.filter).toLowerCase();

            // IMPORTANT : on conserve ici l'index d'origine avant inversion.
            // L'ancien 071 inversait la liste puis supprimait avec l'index inversé,
            // ce qui pouvait supprimer une autre entrée.
            const rows = source
                .map((entry, originalIndex) => ({ entry, originalIndex }))
                .reverse()
                .filter(({ entry }) => !filter || normalizeSearchText(entry, uiState.activeTab).includes(filter));

            if (rows.length === 0) {
                list.appendChild(createElement(
                    'div',
                    'kx-history-empty',
                    source.length === 0 ? definition.empty : 'Aucun résultat pour ce filtre.'
                ));
                return;
            }

            rows.forEach(({ entry, originalIndex }) => {
                list.appendChild(buildHistoryCard(entry, originalIndex, uiState.activeTab));
            });
        }

        search.addEventListener('input', function () {
            uiState.filter = search.value;
            renderList();
        });

        renderList();

        const footerInfo = panel.querySelector('.kx-history-footer-info');
        if (footerInfo) {
            const total = counts.members + counts.notices + counts.searches;
            footerInfo.textContent = `${total} entrée${total > 1 ? 's' : ''} enregistrée${total > 1 ? 's' : ''}`;
        }
    }

    /* ============================================================
       INTÉGRATION BARRE BASSE / ÉVÉNEMENTS
       ============================================================ */

    function ensureStandaloneButtonIfNeeded() {
        // Désactivé volontairement : la barre basse unifiée fournit #historique.
        // Ne jamais injecter de bouton autonome dans #toolbar, .btn-toolbar ou <main>.
        return;
    }

    function bindIntegrationEvents() {
        // Point d'entrée officiel utilisé par le gestionnaire de listes.
        document.addEventListener('koha:requestOpenHistory', function () {
            openNav();
        });

        // Si l'utilisateur ouvre le panneau Listes, on ferme simplement l'historique
        // afin d'éviter la superposition. On ne touche pas au clic lui-même.
        document.addEventListener('click', function (event) {
            const listsButton = event.target?.closest?.('#sidebar5');
            if (listsButton) closeNav();
        }, true);

        // Gestion uniquement de notre bouton autonome ou d'un bouton Historique qui
        // n'appartient PAS à la barre basse. La barre basse possède déjà son propre
        // gestionnaire : cela évite le double-toggle de l'ancien 071.
        document.addEventListener('click', function (event) {
            const trigger = event.target?.closest?.('#toggleHistory, #historique');
            if (!trigger) return;

            if (trigger.id === 'historique' && trigger.closest('#bottomActionBar')) {
                return;
            }

            event.preventDefault();
            toggleHistoryPanel();
        });

        document.addEventListener('keydown', function (event) {
            if (event.key !== 'Escape') return;
            const panel = document.getElementById('customSidebar');
            if (panel?.classList.contains('is-open')) closeNav();
        });

        window.addEventListener('resize', function () {
            const panel = document.getElementById('customSidebar');
            if (panel?.classList.contains('is-open')) panel.style.width = panelWidthPx();
        });

        // Synchronise l'affichage si une autre page/onglet modifie les historiques.
        window.addEventListener('storage', function (event) {
            if ([CONFIG.storage.members, CONFIG.storage.notices, CONFIG.storage.searches].includes(event.key)) {
                renderHistory();
            }
        });
    }

    /* ============================================================
       INITIALISATION
       ============================================================ */

    function init() {
        try {
            installStyles();
            createSidebar();

            // Dans cette installation, le point d'entrée Historique appartient exclusivement
            // à la barre basse créée par 066-067-lists-manager.js.
            // On retire un éventuel ancien bouton autonome afin d'éviter les doublons,
            // notamment dans les pages Administration / Préférences système.
            document.querySelectorAll('#toggleHistory[data-kx-history-owned="1"]').forEach(button => button.remove());

            bindIntegrationEvents();
            recordCurrentPage();
            renderHistory();

            (function(){})('[KX History] 071-history-system initialisé');
        } catch (error) {
            (function(){})('[KX History] erreur initialisation', error);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    /* ============================================================
       API DE COMPATIBILITÉ
       ============================================================ */

    window.deleteMemberConsultation = deleteMemberConsultation;
    window.deleteNoticeConsultation = deleteNoticeConsultation;
    window.deleteSearchHistory = deleteSearchHistory;
    window.clearMemberHistory = clearMemberHistory;
    window.clearNoticeHistory = clearNoticeHistory;
    window.clearSearchHistory = clearSearchHistory;
    window.openNav = openNav;
    window.closeNav = closeNav;

    window.KOHA_HISTORY = {
        open: openNav,
        close: closeNav,
        toggle: toggleHistoryPanel,
        render: renderHistory,
        clearAll: clearAllHistory
    };
})();

/*
 * Nom du fichier : 005-style-holdings-table.js
 * Module cible    : Tables responsives
 * Phase           : script isolé préparatoire à PimpMyKoha
 * Version         : 2.1.1
 * Date            : 2026-09-16
 *
 * Fonction :
 * - rend les tableaux d'exemplaires de catalogue/detail.pl lisibles sur petit écran ;
 * - associe chaque cellule à son en-tête sans dépendre d'indices de colonnes codés en dur ;
 * - respecte les colonnes masquées par Koha / DataTables ;
 * - supporte holdings_table et otherholdings_table ;
 * - réagit aux redraws DataTables et aux mutations utiles du tableau ;
 * - ignore les aides de tri DataTables ("Activate to sort") comme libellés ;
 * - ne modifie les cellules que sous le breakpoint mobile et restaure ensuite
 *   exactement les libellés/attributs/classes présents avant son activation ;
 * - reste idempotent si le script est chargé plusieurs fois ;
 * - n'utilise ni Firebase, ni Firestore, ni stockage local.
 *
 * La configuration est volontairement séparée du moteur afin de pouvoir être
 * remplacée plus tard par la couche de stockage PimpMyKoha / BDD Koha.
 */
(function () {
    'use strict';

    const GLOBAL_GUARD = '__PMK_005_RESPONSIVE_TABLES__';
    const MODULE_ID = 'responsive-tables';
    const MODULE_VERSION = '2.1.1';
    const STYLE_ID = 'pmk-005-responsive-tables-style';
    const TABLE_CLASS = 'pmk-responsive-table';
    const READY_ATTR = 'data-pmk-responsive-ready';
    const LABEL_ATTR = 'data-pmk-responsive-label';
    const KEY_ATTR = 'data-pmk-responsive-column';
    const HIDDEN_CLASS = 'pmk-responsive-column-hidden';
    const UNLABELLED_CLASS = 'pmk-responsive-unlabelled';
    const MOBILE_BREAKPOINT = 768;

    if (window[GLOBAL_GUARD]) {
        return;
    }

    window[GLOBAL_GUARD] = {
        id: MODULE_ID,
        version: MODULE_VERSION,
        initialized: false,
        tables: new Map(),
        lateObserver: null,
        lateTimer: null,
        currentConfig: null,
        viewportQuery: null,
        viewportBound: false
    };

    /*
     * État initial des cellules avant toute intervention du 005.
     * WeakMap évite toute fuite mémoire si DataTables remplace les lignes.
     */
    const ORIGINAL_CELL_STATE = new WeakMap();

    const DEFAULT_CONFIG = Object.freeze({
        enabled: true,
        detailEnabled: true,
        holdingsEnabled: true,
        holdingsMode: 'stack',
        otherholdingsEnabled: true,
        otherholdingsMode: 'stack'
    });

    const DETAIL_PATH = '/cgi-bin/koha/catalogue/detail.pl';

    function isPlainObject(value) {
        return Object.prototype.toString.call(value) === '[object Object]';
    }

    function clone(value) {
        if (Array.isArray(value)) {
            return value.map(clone);
        }
        if (isPlainObject(value)) {
            const result = {};
            Object.keys(value).forEach(function (key) {
                result[key] = clone(value[key]);
            });
            return result;
        }
        return value;
    }

    function normalizeUserConfig(rawConfig) {
        const source = isPlainObject(rawConfig) ? rawConfig : {};
        const result = clone(DEFAULT_CONFIG);

        if (typeof source.enabled === 'boolean') result.enabled = source.enabled;
        if (typeof source.detailEnabled === 'boolean') result.detailEnabled = source.detailEnabled;
        if (typeof source.holdingsEnabled === 'boolean') result.holdingsEnabled = source.holdingsEnabled;
        if (source.holdingsMode === 'scroll' || source.holdingsMode === 'stack') {
            result.holdingsMode = source.holdingsMode;
        }
        if (typeof source.otherholdingsEnabled === 'boolean') result.otherholdingsEnabled = source.otherholdingsEnabled;
        if (source.otherholdingsMode === 'scroll' || source.otherholdingsMode === 'stack') {
            result.otherholdingsMode = source.otherholdingsMode;
        }

        /*
         * Compatibilité avec la configuration 2.0.0 qui utilisait pages[].
         * Cela permet de reprendre sans casse un éventuel objet injecté avant
         * le passage au registre PMK central.
         */
        if (Array.isArray(source.pages)) {
            const page = source.pages.find(function (candidate) {
                return candidate && candidate.id === 'catalogue.detail';
            });
            if (page) {
                result.detailEnabled = page.enabled !== false;
                const tables = Array.isArray(page.tables) ? page.tables : [];
                const holdings = tables.find(function (table) {
                    return table && table.id === 'holdings_table';
                });
                const other = tables.find(function (table) {
                    return table && table.id === 'otherholdings_table';
                });
                if (holdings) {
                    result.holdingsEnabled = holdings.enabled !== false;
                    result.holdingsMode = holdings.mode === 'scroll' ? 'scroll' : 'stack';
                }
                if (other) {
                    result.otherholdingsEnabled = other.enabled !== false;
                    result.otherholdingsMode = other.mode === 'scroll' ? 'scroll' : 'stack';
                }
            }
        }

        return result;
    }

    function buildPageConfig(config) {
        if (!config || config.enabled === false || config.detailEnabled === false) {
            return null;
        }

        return {
            id: 'catalogue.detail',
            enabled: true,
            paths: [DETAIL_PATH],
            tables: [
                {
                    id: 'holdings_table',
                    enabled: config.holdingsEnabled !== false,
                    mode: config.holdingsMode === 'scroll' ? 'scroll' : 'stack'
                },
                {
                    id: 'otherholdings_table',
                    enabled: config.otherholdingsEnabled !== false,
                    mode: config.otherholdingsMode === 'scroll' ? 'scroll' : 'stack'
                }
            ]
        };
    }

    function isTargetPage() {
        return normalizePath(window.location.pathname || '') === DETAIL_PATH;
    }

    function normalizePath(path) {
        if (typeof path !== 'string') {
            return '';
        }
        return path.replace(/\/+$/, '') || '/';
    }

    function normalizeText(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeKey(value) {
        return normalizeText(value)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function safeCssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === 'function') {
            return window.CSS.escape(value);
        }
        return String(value || '').replace(/([ #;?%&,.+*~\\':"!^$[\]()=>|/@])/g, '\\$1');
    }

    function isElementHidden(element) {
        if (!element || element.nodeType !== 1) {
            return false;
        }

        if (element.hidden || element.getAttribute('aria-hidden') === 'true') {
            return true;
        }

        if (
            element.classList.contains('d-none') ||
            element.classList.contains('hidden') ||
            element.classList.contains('dt-hidden') ||
            element.classList.contains('dtr-hidden')
        ) {
            return true;
        }

        const inlineDisplay = element.style ? element.style.display : '';
        if (inlineDisplay === 'none') {
            return true;
        }

        try {
            return window.getComputedStyle(element).display === 'none';
        } catch (error) {
            return false;
        }
    }

    function stripSortingHelp(value) {
        let text = normalizeText(value);

        /*
         * Ces textes sont des aides DataTables au tri, pas des libellés métier.
         * Ils ne doivent jamais apparaître devant chaque cellule mobile.
         */
        const patterns = [
            /\bactivate to sort(?: ascending| descending)?\b/gi,
            /\bactivate to sort\b/gi,
            /\bactiver pour trier(?: par ordre croissant| par ordre décroissant)?\b/gi,
            /\bactiver pour trier\b/gi,
            /\bsort ascending\b/gi,
            /\bsort descending\b/gi,
            /\btrier par ordre croissant\b/gi,
            /\btrier par ordre décroissant\b/gi
        ];

        patterns.forEach(function (pattern) {
            text = text.replace(pattern, ' ');
        });

        return normalizeText(text);
    }

    function getHeaderLabel(header) {
        if (!header) {
            return '';
        }

        /*
         * data-pmk-label est une surcharge volontaire. En revanche aria-label
         * et title appartiennent souvent à DataTables ("Activate to sort") :
         * on ne les utilise jamais comme nom de colonne.
         */
        const explicitLabel = stripSortingHelp(
            header.getAttribute('data-pmk-label') || ''
        );

        if (explicitLabel) {
            return explicitLabel;
        }

        const cloneNode = header.cloneNode(true);
        cloneNode.querySelectorAll(
            [
                '.DataTables_sort_icon',
                '.dt-column-order',
                '.sorting_1',
                '.visually-hidden',
                '.sr-only',
                '[data-dt-order]',
                'script',
                'style'
            ].join(', ')
        ).forEach(function (node) {
            node.remove();
        });

        return stripSortingHelp(cloneNode.textContent || header.textContent || '');
    }

    function getHeaderTechnicalKey(header, index, tableId) {
        if (!header) {
            return tableId + '-column-' + index;
        }

        const candidates = [
            header.getAttribute('data-colname'),
            header.getAttribute('data-column'),
            header.getAttribute('data-name'),
            header.id
        ];

        for (let i = 0; i < candidates.length; i += 1) {
            const key = normalizeKey(candidates[i]);
            if (key) {
                return key;
            }
        }

        return tableId + '-column-' + index;
    }

    function buildHeaderModel(table) {
        const headerRow = table.querySelector('thead tr:last-child');
        if (!headerRow) {
            return null;
        }

        const headers = Array.from(headerRow.cells || []);
        if (!headers.length) {
            return null;
        }

        const model = [];
        const byId = new Map();
        const byKey = new Map();
        let logicalIndex = 0;

        headers.forEach(function (header) {
            const colspan = Math.max(1, Number(header.getAttribute('colspan') || 1));
            const label = getHeaderLabel(header);
            const key = getHeaderTechnicalKey(header, logicalIndex, table.id || 'table');
            const descriptor = {
                element: header,
                id: normalizeText(header.id),
                key: key,
                label: label,
                hidden: isElementHidden(header),
                startIndex: logicalIndex,
                colspan: colspan
            };

            if (descriptor.id) {
                byId.set(descriptor.id, descriptor);
            }
            if (descriptor.key) {
                byKey.set(descriptor.key, descriptor);
            }

            for (let offset = 0; offset < colspan; offset += 1) {
                model[logicalIndex + offset] = descriptor;
            }

            logicalIndex += colspan;
        });

        return {
            list: model,
            byId: byId,
            byKey: byKey,
            logicalLength: logicalIndex
        };
    }

    function getCellTechnicalCandidates(cell) {
        const values = [
            cell.getAttribute('data-colname'),
            cell.getAttribute('data-column'),
            cell.getAttribute('data-name'),
            cell.id
        ];

        Array.from(cell.classList || []).forEach(function (className) {
            values.push(className);
        });

        return values
            .map(normalizeKey)
            .filter(Boolean);
    }

    function descriptorFromHeadersAttribute(cell, headerModel) {
        const headersAttr = normalizeText(cell.getAttribute('headers'));
        if (!headersAttr) {
            return null;
        }

        const ids = headersAttr.split(/\s+/).filter(Boolean);
        for (let i = 0; i < ids.length; i += 1) {
            if (headerModel.byId.has(ids[i])) {
                return headerModel.byId.get(ids[i]);
            }
        }

        return null;
    }

    function descriptorFromTechnicalIdentity(cell, headerModel) {
        const candidates = getCellTechnicalCandidates(cell);
        if (!candidates.length) {
            return null;
        }

        const descriptors = Array.from(new Set(headerModel.list.filter(Boolean)));

        for (let i = 0; i < candidates.length; i += 1) {
            const candidate = candidates[i];

            if (headerModel.byKey.has(candidate)) {
                return headerModel.byKey.get(candidate);
            }

            for (let j = 0; j < descriptors.length; j += 1) {
                const descriptor = descriptors[j];
                if (!descriptor || !descriptor.key) {
                    continue;
                }

                if (
                    descriptor.key === candidate ||
                    descriptor.key.endsWith('-' + candidate) ||
                    candidate.endsWith('-' + descriptor.key)
                ) {
                    return descriptor;
                }
            }
        }

        return null;
    }

    function descriptorFromPosition(cell, row, headerModel) {
        if (!cell || !row || !headerModel) {
            return null;
        }

        const colspan = Math.max(1, Number(cell.getAttribute('colspan') || 1));
        if (colspan > 1) {
            return null;
        }

        let logicalIndex = 0;
        const cells = Array.from(row.cells || []);

        for (let i = 0; i < cells.length; i += 1) {
            const current = cells[i];
            const currentColspan = Math.max(1, Number(current.getAttribute('colspan') || 1));

            if (current === cell) {
                return headerModel.list[logicalIndex] || null;
            }

            logicalIndex += currentColspan;
        }

        return null;
    }

    function resolveCellDescriptor(cell, row, headerModel) {
        return (
            descriptorFromHeadersAttribute(cell, headerModel) ||
            descriptorFromTechnicalIdentity(cell, headerModel) ||
            descriptorFromPosition(cell, row, headerModel) ||
            null
        );
    }

    function snapshotCellState(cell) {
        if (!cell || ORIGINAL_CELL_STATE.has(cell)) {
            return;
        }

        ORIGINAL_CELL_STATE.set(cell, {
            hadLabel: cell.hasAttribute(LABEL_ATTR),
            label: cell.getAttribute(LABEL_ATTR),
            hadKey: cell.hasAttribute(KEY_ATTR),
            key: cell.getAttribute(KEY_ATTR),
            hadHiddenClass: cell.classList.contains(HIDDEN_CLASS),
            hadUnlabelledClass: cell.classList.contains(UNLABELLED_CLASS)
        });
    }

    function clearManagedCellState(cell) {
        if (!cell) return;
        cell.removeAttribute(LABEL_ATTR);
        cell.removeAttribute(KEY_ATTR);
        cell.classList.remove(HIDDEN_CLASS, UNLABELLED_CLASS);
    }

    function restoreCellState(cell) {
        if (!cell) return;

        const original = ORIGINAL_CELL_STATE.get(cell);
        clearManagedCellState(cell);

        if (!original) return;

        if (original.hadLabel) {
            cell.setAttribute(LABEL_ATTR, original.label === null ? '' : original.label);
        }
        if (original.hadKey) {
            cell.setAttribute(KEY_ATTR, original.key === null ? '' : original.key);
        }
        if (original.hadHiddenClass) {
            cell.classList.add(HIDDEN_CLASS);
        }
        if (original.hadUnlabelledClass) {
            cell.classList.add(UNLABELLED_CLASS);
        }

        ORIGINAL_CELL_STATE.delete(cell);
    }

    function applyRowLabels(row, headerModel) {
        if (!row || row.nodeType !== 1 || !headerModel) {
            return false;
        }

        const cells = Array.from(row.cells || []).filter(function (cell) {
            return cell.tagName === 'TD';
        });

        if (!cells.length) {
            return false;
        }

        const rowLogicalLength = cells.reduce(function (total, cell) {
            return total + Math.max(1, Number(cell.getAttribute('colspan') || 1));
        }, 0);

        /*
         * Une ligne DataTables de type "aucun résultat" peut légitimement être
         * composée d'une seule cellule avec colspan. On la conserve, sans tenter
         * de lui inventer un libellé. Toute autre divergence de structure entraîne
         * un abandon de la ligne plutôt qu'un décalage de colonnes.
         */
        if (rowLogicalLength !== headerModel.logicalLength) {
            cells.forEach(function (cell) {
                snapshotCellState(cell);
                clearManagedCellState(cell);
                cell.classList.add(UNLABELLED_CLASS);
            });

            if (cells.length === 1 && rowLogicalLength >= headerModel.logicalLength) {
                return true;
            }

            return false;
        }

        let resolvedCount = 0;

        cells.forEach(function (cell) {
            snapshotCellState(cell);
            clearManagedCellState(cell);

            const descriptor = resolveCellDescriptor(cell, row, headerModel);
            const hidden = isElementHidden(cell) || (descriptor && descriptor.hidden);

            if (hidden) {
                cell.classList.add(HIDDEN_CLASS);
            }

            if (!descriptor) {
                cell.classList.add(UNLABELLED_CLASS);
                return;
            }

            resolvedCount += 1;
            cell.setAttribute(KEY_ATTR, descriptor.key || '');

            if (descriptor.label) {
                cell.setAttribute(LABEL_ATTR, descriptor.label);
            } else {
                cell.classList.add(UNLABELLED_CLASS);
            }
        });

        /*
         * Fail-safe : si moins de la moitié des cellules sont identifiées,
         * la ligne est considérée trop ambiguë pour la présentation empilée.
         */
        const minimumResolved = Math.max(1, Math.ceil(cells.length / 2));
        return resolvedCount >= minimumResolved;
    }

    function restoreTable(table) {
        if (!table) {
            return;
        }

        table.classList.remove(TABLE_CLASS, 'pmk-responsive-mode-stack', 'pmk-responsive-mode-scroll');
        table.removeAttribute(READY_ATTR);

        table.querySelectorAll('tbody td').forEach(function (cell) {
            restoreCellState(cell);
        });
    }

    function applyTable(table, tableConfig) {
        if (!table || !tableConfig || tableConfig.enabled === false) {
            return false;
        }

        const headerModel = buildHeaderModel(table);
        if (!headerModel || !headerModel.logicalLength) {
            restoreTable(table);
            return false;
        }

        const rows = Array.from(table.querySelectorAll('tbody tr'));
        if (!rows.length) {
            table.classList.add(TABLE_CLASS);
            table.classList.toggle('pmk-responsive-mode-stack', tableConfig.mode !== 'scroll');
            table.classList.toggle('pmk-responsive-mode-scroll', tableConfig.mode === 'scroll');
            table.setAttribute(READY_ATTR, '1');
            return true;
        }

        let safeRows = 0;
        rows.forEach(function (row) {
            if (applyRowLabels(row, headerModel)) {
                safeRows += 1;
            }
        });

        /*
         * Fail-safe au niveau du tableau : si aucune ligne réelle n'a pu être
         * associée de façon suffisamment fiable, on n'active pas le rendu mobile.
         */
        if (safeRows === 0) {
            restoreTable(table);
            return false;
        }

        table.classList.add(TABLE_CLASS);
        table.classList.toggle('pmk-responsive-mode-stack', tableConfig.mode !== 'scroll');
        table.classList.toggle('pmk-responsive-mode-scroll', tableConfig.mode === 'scroll');
        table.setAttribute(READY_ATTR, '1');
        return true;
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.setAttribute('data-pmk-module', MODULE_ID);
        style.textContent = `
/* PimpMyKoha 005 - Tables responsives */
.${TABLE_CLASS} {
    width: 100%;
}

.${TABLE_CLASS}.pmk-responsive-mode-scroll {
    min-width: max-content;
}

@media screen and (max-width: ${MOBILE_BREAKPOINT}px) {
    .${TABLE_CLASS}.pmk-responsive-mode-scroll {
        display: table;
        width: max-content;
        min-width: 100%;
    }

    .${TABLE_CLASS}.pmk-responsive-mode-stack {
        display: block !important;
        width: 100% !important;
        border-collapse: separate;
        border-spacing: 0;
    }

    .${TABLE_CLASS}.pmk-responsive-mode-stack > thead {
        display: table-header-group !important;
        position: absolute !important;
        width: 1px !important;
        height: 1px !important;
        padding: 0 !important;
        margin: -1px !important;
        overflow: hidden !important;
        clip: rect(0, 0, 0, 0) !important;
        clip-path: inset(50%) !important;
        white-space: nowrap !important;
        border: 0 !important;
    }

    .${TABLE_CLASS}.pmk-responsive-mode-stack > tbody {
        display: block !important;
        width: 100% !important;
    }

    .${TABLE_CLASS}.pmk-responsive-mode-stack > tbody > tr {
        display: block !important;
        width: 100% !important;
        margin: 0 0 0.75rem 0;
        border: 1px solid var(--bs-border-color, #dee2e6);
        border-radius: 0.375rem;
        background: var(--bs-body-bg, #fff);
        overflow: hidden;
    }

    .${TABLE_CLASS}.pmk-responsive-mode-stack > tbody > tr > td {
        box-sizing: border-box;
        width: 100% !important;
        min-width: 0;
        padding: 0.5rem 0.625rem !important;
        border: 0;
        border-bottom: 1px solid var(--bs-border-color, #dee2e6);
        vertical-align: top;
        text-align: left;
        overflow-wrap: anywhere;
        word-break: normal;
    }

    .${TABLE_CLASS}.pmk-responsive-mode-stack > tbody > tr > td:not(.${UNLABELLED_CLASS}):not(.${HIDDEN_CLASS}) {
        display: grid !important;
        grid-template-columns: minmax(7.5rem, 36%) minmax(0, 1fr);
        gap: 0.5rem 0.75rem;
        align-items: start;
    }

    .${TABLE_CLASS}.pmk-responsive-mode-stack > tbody > tr > td:not(.${UNLABELLED_CLASS}):not(.${HIDDEN_CLASS})::before {
        content: attr(${LABEL_ATTR}) !important;
        font-weight: 600;
        line-height: 1.35;
        text-align: left;
        color: inherit;
    }

    .${TABLE_CLASS}.pmk-responsive-mode-stack > tbody > tr > td.${UNLABELLED_CLASS}:not(.${HIDDEN_CLASS}) {
        display: block !important;
    }

    .${TABLE_CLASS}.pmk-responsive-mode-stack > tbody > tr > td.${UNLABELLED_CLASS}:not(.${HIDDEN_CLASS})::before {
        content: none !important;
    }

    .${TABLE_CLASS}.pmk-responsive-mode-stack > tbody > tr > td.${HIDDEN_CLASS} {
        display: none !important;
    }

    .${TABLE_CLASS}.pmk-responsive-mode-stack > tbody > tr > td:last-child {
        border-bottom: 0;
    }

    .${TABLE_CLASS}.pmk-responsive-mode-stack > tbody > tr > td .btn-group,
    .${TABLE_CLASS}.pmk-responsive-mode-stack > tbody > tr > td .btn-toolbar {
        max-width: 100%;
        flex-wrap: wrap;
        gap: 0.25rem;
    }

    .${TABLE_CLASS}.pmk-responsive-mode-stack > tbody > tr > td img,
    .${TABLE_CLASS}.pmk-responsive-mode-stack > tbody > tr > td svg {
        max-width: 100%;
        height: auto;
    }
}

@media screen and (max-width: 480px) {
    .${TABLE_CLASS}.pmk-responsive-mode-stack > tbody > tr > td:not(.${UNLABELLED_CLASS}):not(.${HIDDEN_CLASS}) {
        grid-template-columns: 1fr !important;
        gap: 0.2rem;
    }
}
`;
        document.head.appendChild(style);
    }

    function scheduleRefresh(state, delay) {
        if (!state || !state.table || !state.config) {
            return;
        }

        if (state.refreshTimer) {
            window.clearTimeout(state.refreshTimer);
        }

        state.refreshTimer = window.setTimeout(function () {
            state.refreshTimer = null;

            const guard = window[GLOBAL_GUARD];
            const query = guard && guard.viewportQuery;
            if (query && !query.matches) {
                restoreTable(state.table);
                return;
            }

            applyTable(state.table, state.config);
        }, typeof delay === 'number' ? delay : 60);
    }

    function bindJQueryDataTablesEvents(state) {
        if (!window.jQuery || !state || !state.table || state.jqueryBound) {
            return;
        }

        const $table = window.jQuery(state.table);
        const namespace = '.pmk005ResponsiveTables';

        $table.off(namespace);
        $table.on(
            'draw.dt' + namespace +
            ' column-visibility.dt' + namespace +
            ' responsive-resize.dt' + namespace,
            function () {
                scheduleRefresh(state, 30);
            }
        );

        state.jqueryBound = true;
    }

    function bindTableObserver(state) {
        if (!state || !state.table || state.observer) {
            return;
        }

        state.observer = new MutationObserver(function (mutations) {
            let shouldRefresh = false;

            for (let i = 0; i < mutations.length; i += 1) {
                const mutation = mutations[i];

                if (mutation.type === 'characterData') {
                    const parent = mutation.target && mutation.target.parentElement;
                    if (parent && parent.closest('thead')) {
                        shouldRefresh = true;
                        break;
                    }
                }

                if (mutation.type === 'childList') {
                    const target = mutation.target && mutation.target.nodeType === 1
                        ? mutation.target
                        : mutation.target && mutation.target.parentElement;

                    if (!target) {
                        continue;
                    }

                    if (
                        target.closest('thead') ||
                        target.closest('tbody') ||
                        Array.from(mutation.addedNodes || []).some(function (node) {
                            return node.nodeType === 1 && (
                                node.matches('thead, tbody, tr') ||
                                node.querySelector('thead, tbody, tr')
                            );
                        })
                    ) {
                        shouldRefresh = true;
                        break;
                    }
                }
            }

            if (shouldRefresh) {
                scheduleRefresh(state, 80);
            }
        });

        state.observer.observe(state.table, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    function createTableState(table, tableConfig) {
        const guard = window[GLOBAL_GUARD];
        const existing = guard.tables.get(table.id);

        if (existing && existing.table === table) {
            existing.config = tableConfig;
            return existing;
        }

        if (existing) {
            if (existing.observer) {
                existing.observer.disconnect();
            }
            if (existing.refreshTimer) {
                window.clearTimeout(existing.refreshTimer);
            }
        }

        const state = {
            table: table,
            config: tableConfig,
            observer: null,
            refreshTimer: null,
            jqueryBound: false
        };

        guard.tables.set(table.id, state);
        return state;
    }

    function enhanceTable(tableConfig) {
        if (!tableConfig || tableConfig.enabled === false || !tableConfig.id) {
            return;
        }

        const id = String(tableConfig.id).trim();
        if (!/^[A-Za-z][A-Za-z0-9_:\-.]*$/.test(id)) {
            return;
        }

        const table = document.getElementById(id);
        if (!table || table.tagName !== 'TABLE') {
            return;
        }

        const state = createTableState(table, tableConfig);
        applyTable(table, tableConfig);
        bindJQueryDataTablesEvents(state);
        bindTableObserver(state);
    }

    function enhanceConfiguredTables(pageConfig) {
        if (!pageConfig || !Array.isArray(pageConfig.tables)) {
            return;
        }

        pageConfig.tables.forEach(enhanceTable);
    }

    function stopLateTableObserver() {
        const guard = window[GLOBAL_GUARD];
        if (!guard) return;
        if (guard.lateObserver) {
            guard.lateObserver.disconnect();
            guard.lateObserver = null;
        }
        if (guard.lateTimer) {
            window.clearTimeout(guard.lateTimer);
            guard.lateTimer = null;
        }
    }

    function observeLateTables(pageConfig) {
        stopLateTableObserver();

        if (!pageConfig || !Array.isArray(pageConfig.tables)) {
            return;
        }

        const expectedIds = pageConfig.tables
            .filter(function (tableConfig) {
                return tableConfig && tableConfig.enabled !== false && tableConfig.id;
            })
            .map(function (tableConfig) {
                return String(tableConfig.id).trim();
            });

        if (!expectedIds.length) {
            return;
        }

        const allAlreadyPresent = expectedIds.every(function (id) {
            return Boolean(document.getElementById(id));
        });

        if (allAlreadyPresent) {
            return;
        }

        const guard = window[GLOBAL_GUARD];
        const observer = new MutationObserver(function () {
            let foundNew = false;

            pageConfig.tables.forEach(function (tableConfig) {
                if (!tableConfig || tableConfig.enabled === false || !tableConfig.id) {
                    return;
                }

                const id = String(tableConfig.id).trim();
                if (
                    document.getElementById(id) &&
                    !guard.tables.has(id)
                ) {
                    enhanceTable(tableConfig);
                    foundNew = true;
                }
            });

            const allFound = expectedIds.every(function (id) {
                return Boolean(document.getElementById(id));
            });

            if (allFound) {
                stopLateTableObserver();
            } else if (foundNew) {
                enhanceConfiguredTables(pageConfig);
            }
        });

        guard.lateObserver = observer;
        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });

        guard.lateTimer = window.setTimeout(function () {
            stopLateTableObserver();
        }, 10000);
    }

    function clearManagedTables() {
        const guard = window[GLOBAL_GUARD];
        if (!guard) return;

        stopLateTableObserver();

        guard.tables.forEach(function (state) {
            if (!state) return;
            if (state.observer) state.observer.disconnect();
            if (state.refreshTimer) window.clearTimeout(state.refreshTimer);
            if (state.jqueryBound && window.jQuery && state.table) {
                window.jQuery(state.table).off('.pmk005ResponsiveTables');
            }
            if (state.table) restoreTable(state.table);
        });
        guard.tables.clear();

        ['holdings_table', 'otherholdings_table'].forEach(function (id) {
            const table = document.getElementById(id);
            if (table) restoreTable(table);
        });
    }

    function isMobileViewport() {
        const guard = window[GLOBAL_GUARD];
        if (!guard) return window.innerWidth <= MOBILE_BREAKPOINT;

        if (!guard.viewportQuery && typeof window.matchMedia === 'function') {
            guard.viewportQuery = window.matchMedia(
                '(max-width: ' + MOBILE_BREAKPOINT + 'px)'
            );
        }

        return guard.viewportQuery
            ? guard.viewportQuery.matches
            : window.innerWidth <= MOBILE_BREAKPOINT;
    }

    function bindViewportWatcher() {
        const guard = window[GLOBAL_GUARD];
        if (!guard || guard.viewportBound || typeof window.matchMedia !== 'function') {
            return;
        }

        guard.viewportQuery = guard.viewportQuery || window.matchMedia(
            '(max-width: ' + MOBILE_BREAKPOINT + 'px)'
        );

        const handler = function () {
            applyRuntimeConfig(guard.currentConfig || DEFAULT_CONFIG);
        };

        if (typeof guard.viewportQuery.addEventListener === 'function') {
            guard.viewportQuery.addEventListener('change', handler);
        } else if (typeof guard.viewportQuery.addListener === 'function') {
            guard.viewportQuery.addListener(handler);
        }

        guard.viewportBound = true;
    }

    function applyRuntimeConfig(rawConfig) {
        const config = normalizeUserConfig(rawConfig);
        const guard = window[GLOBAL_GUARD];

        if (guard) {
            guard.currentConfig = clone(config);
        }

        bindViewportWatcher();
        clearManagedTables();

        /*
         * Le 005 ne modifie le DOM que lorsque son affichage mobile est
         * réellement actif. Sur écran large, Koha et les autres modules
         * retrouvent exactement leurs libellés/attributs d'origine.
         */
        if (
            !isTargetPage() ||
            config.enabled === false ||
            config.detailEnabled === false ||
            !isMobileViewport()
        ) {
            if (guard) guard.initialized = true;
            return;
        }

        const pageConfig = buildPageConfig(config);
        if (!pageConfig) {
            if (guard) guard.initialized = true;
            return;
        }

        injectStyles();
        enhanceConfiguredTables(pageConfig);
        observeLateTables(pageConfig);

        if (guard) guard.initialized = true;
    }

    function validateConfig(config) {
        const normalized = normalizeUserConfig(config);
        const validModes = ['stack', 'scroll'];
        if (!validModes.includes(normalized.holdingsMode) || !validModes.includes(normalized.otherholdingsMode)) {
            return {
                ok: false,
                message: (document.documentElement.lang || '').toLowerCase().startsWith('fr')
                    ? "Le mode d'affichage mobile sélectionné n'est pas valide."
                    : "The selected mobile display mode is invalid."
            };
        }
        return { ok: true };
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 2,
            name: {
                fr: "Tableaux d’exemplaires sur mobile",
                en: "Item tables on mobile"
            },
            description: {
                fr: "Rend les tableaux d’exemplaires plus lisibles sur les petits écrans, sans modifier les données Koha.",
                en: "Makes item tables easier to read on small screens without changing Koha data."
            },
            category: {
                fr: "Interface / responsive",
                en: "Interface / responsive"
            },
            supportedPages: ["catalogue.detail"],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            validate: validateConfig,
            schema: [
                {
                    type: "section",
                    id: "page",
                    label: {
                        fr: "Page concernée",
                        en: "Where it applies"
                    },
                    description: {
                        fr: "Ce module agit uniquement sur la fiche détaillée d’une notice.",
                        en: "This module only applies to the record detail page."
                    },
                    fields: [
                        {
                            key: "detailEnabled",
                            type: "boolean",
                            label: {
                                fr: "Activer sur la fiche notice",
                                en: "Enable on record details"
                            }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "tables",
                    label: {
                        fr: "Affichage des tableaux",
                        en: "Table display"
                    },
                    description: {
                        fr: "Choisis simplement le comportement de chaque tableau sur petit écran.",
                        en: "Choose how each item table should behave on small screens."
                    },
                    fields: [
                        {
                            key: "holdingsEnabled",
                            type: "boolean",
                            label: {
                                fr: "Adapter le tableau Exemplaires",
                                en: "Adapt the Holdings table"
                            }
                        },
                        {
                            key: "holdingsMode",
                            type: "select",
                            label: {
                                fr: "Affichage mobile — Exemplaires",
                                en: "Mobile display — Holdings"
                            },
                            when: function (rootObject) {
                                return rootObject.holdingsEnabled !== false;
                            },
                            options: [
                                {
                                    value: "stack",
                                    label: {
                                        fr: "Fiches empilées — recommandé",
                                        en: "Stacked cards — recommended"
                                    }
                                },
                                {
                                    value: "scroll",
                                    label: {
                                        fr: "Tableau avec défilement horizontal",
                                        en: "Horizontally scrollable table"
                                    }
                                }
                            ]
                        },
                        {
                            key: "otherholdingsEnabled",
                            type: "boolean",
                            label: {
                                fr: "Adapter le tableau Autres exemplaires",
                                en: "Adapt the Other holdings table"
                            }
                        },
                        {
                            key: "otherholdingsMode",
                            type: "select",
                            label: {
                                fr: "Affichage mobile — Autres exemplaires",
                                en: "Mobile display — Other holdings"
                            },
                            when: function (rootObject) {
                                return rootObject.otherholdingsEnabled !== false;
                            },
                            options: [
                                {
                                    value: "stack",
                                    label: {
                                        fr: "Fiches empilées — recommandé",
                                        en: "Stacked cards — recommended"
                                    }
                                },
                                {
                                    value: "scroll",
                                    label: {
                                        fr: "Tableau avec défilement horizontal",
                                        en: "Horizontally scrollable table"
                                    }
                                }
                            ]
                        }
                    ]
                }
            ]
        };
    }

    let coreRegistered = false;
    let runtimeStarted = false;
    let unsubscribeConfig = null;

    async function startWithCore() {
        if (!window.PMKConfig) return;

        if (!coreRegistered) {
            window.PMKConfig.registerModule(moduleDefinition());
            coreRegistered = true;
        }

        if (!isTargetPage() || runtimeStarted) return;
        runtimeStarted = true;

        let config = clone(DEFAULT_CONFIG);
        try {
            config = await window.PMKConfig.getConfig(MODULE_ID);
        } catch (_) {
            config = clone(DEFAULT_CONFIG);
        }

        applyRuntimeConfig(config);

        if (typeof window.PMKConfig.subscribe === 'function' && !unsubscribeConfig) {
            unsubscribeConfig = window.PMKConfig.subscribe(MODULE_ID, function (newConfig) {
                applyRuntimeConfig(newConfig);
            });
        }
    }

    function startWithoutCore() {
        if (!isTargetPage() || runtimeStarted) return;
        runtimeStarted = true;
        applyRuntimeConfig(window.PMK_RESPONSIVE_TABLES_CONFIG || DEFAULT_CONFIG);
    }

    function onDomReady(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
        } else {
            callback();
        }
    }

    onDomReady(function () {
        if (window.PMKConfig) {
            startWithCore();
        } else {
            startWithoutCore();
            window.addEventListener('pmk:config-ready', function () {
                startWithCore();
            }, { once: true });
        }
    });
}());

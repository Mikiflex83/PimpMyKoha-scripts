/*
 Nom du fichier: 033-mod-table-exemplaires.js
 Module PMK: holdings-table-presentation
 Version: 4.0.0-preplugin
 Date de dernière modification: 2026-09-17
 Auteur: Michael Mundet

 Rôle:
 - remplace le legacy 033 sur catalogue/detail.pl et course_reserves/course-details.pl ;
 - absorbe la partie utile du legacy 032 pour l'affichage de la localisation ;
 - conserve les couleurs/comportements historiques Dracénie comme valeurs par défaut ;
 - s'appuie en priorité sur les statuts structurés Koha (_status / classes item-status) ;
 - résiste aux redraw/reconstructions DataTables ;
 - ne masque PAS #catalogue_detail_elastic_record : cette fonction appartient au module
   transversal "conditional-visibility" ;
 - ne lance aucune action métier et ne modifie aucune donnée Koha.
*/

(function () {
  'use strict';

  if (window.__PMK033_HOLDINGS_TABLE_PRESENTATION__) return;
  window.__PMK033_HOLDINGS_TABLE_PRESENTATION__ = true;

  const MODULE_ID = 'holdings-table-presentation';
  const MODULE_VERSION = '4.1.0-preplugin';

  const PAGE_DETAIL = '/cgi-bin/koha/catalogue/detail.pl';
  const PAGE_COURSE = '/cgi-bin/koha/course_reserves/course-details.pl';

  const DETAIL_TABLES = ['#holdings_table', '#otherholdings_table'];
  const COURSE_TABLE = '#course_reserves_table';

  const DETAIL_STATUS_TARGETS = {
    checked_out: '.datedue',
    local_use: '',
    in_transit: '.intransit, .transitrequested',
    lost: '.lost',
    withdrawn: '.wdn',
    damaged: '.dmg',
    not_for_loan: '.notforloan',
    on_hold: '.waitingat, .holdonitem, .heldfor',
    recalled: '.recallwaiting, .recalledby',
    restricted: '.restricted',
    in_bundle: '.bundled',
    available: ''
  };

  const COURSE_STATUS_TARGETS = {
    available: '.item-status.available',
    checked_out: '.item-status.checkedout',
    local_use: '.item-status.checkedout',
    in_transit: '.item-status.intransit',
    lost: '.item-status.lost',
    withdrawn: '.item-status.withdrawn',
    damaged: '.item-status.damaged',
    not_for_loan: '.item-status.notforloan',
    on_hold: '.item-status.pendinghold, .item-status.holdwaiting, .item-status.itemhold, .item-status.holdfor',
    restricted: '.item-status.restricted'
  };

  const DEFAULT_CONFIG = {
    enabled: true,
    pages: [
      { pageId: 'catalogue.detail', enabled: true, path: PAGE_DETAIL },
      { pageId: 'course_reserves.course-details', enabled: true, path: PAGE_COURSE }
    ],
    detail: {
      locationMode: 'current-only',
      columnLabels: [
        { id: 'copynumber', enabled: true, colname: 'copynumber', labelFr: 'Sous-localisation', labelEn: 'Sub-location' },
        { id: 'barcode', enabled: true, colname: 'barcode', labelFr: 'Code barres', labelEn: 'Barcode' },
        { id: 'enumchron', enabled: true, colname: 'enumchron', labelFr: 'Etage / Numéro', labelEn: 'Floor / Number' },
        { id: 'course_reserves', enabled: true, colname: 'course_reserves', labelFr: "Listes d'exemplaires", labelEn: 'Item lists' }
      ],
      statusRules: [
        { id: 'transfer', enabled: true, statusKey: 'in_transit', rowBackground: '#f7f1e9', textColor: '', bold: false },
        { id: 'hold', enabled: true, statusKey: 'on_hold', rowBackground: '#f7f1e9', textColor: '', bold: false },
        { id: 'available', enabled: true, statusKey: 'available', rowBackground: '#ebfaeb', textColor: '#008000', bold: true },
        { id: 'not-for-loan', enabled: true, statusKey: 'not_for_loan', rowBackground: '#fcd2d2', textColor: '#990000', bold: true },
        { id: 'checked-out', enabled: true, statusKey: 'checked_out', rowBackground: '#fff3cd', textColor: '', bold: false },
        { id: 'local-use', enabled: true, statusKey: 'local_use', rowBackground: '#fff3cd', textColor: '', bold: false },
        { id: 'lost', enabled: false, statusKey: 'lost', rowBackground: '', textColor: '', bold: false },
        { id: 'withdrawn', enabled: false, statusKey: 'withdrawn', rowBackground: '', textColor: '', bold: false },
        { id: 'damaged', enabled: false, statusKey: 'damaged', rowBackground: '', textColor: '', bold: false },
        { id: 'restricted', enabled: false, statusKey: 'restricted', rowBackground: '', textColor: '', bold: false },
        { id: 'recalled', enabled: false, statusKey: 'recalled', rowBackground: '', textColor: '', bold: false },
        { id: 'in-bundle', enabled: false, statusKey: 'in_bundle', rowBackground: '', textColor: '', bold: false }
      ],
      currentLibrary: {
        enabled: true,
        availableOnly: true,
        iconClass: 'fa fa-star',
        color: '#b8860b',
        titleFr: 'Disponible dans le site de connexion',
        titleEn: 'Available at the current library'
      }
    },
    course: {
      statusRules: [
        { id: 'available', enabled: true, statusKey: 'available', textColor: '#008000', bold: true },
        { id: 'checked-out', enabled: true, statusKey: 'checked_out', textColor: '#990000', bold: true }
      ],
      availableLabelFr: 'Non emprunté',
      availableLabelEn: 'Not checked out'
    },
    observerDelay: 70
  };

  let currentConfig = deepClone(DEFAULT_CONFIG);
  let mutationObserver = null;
  let applyTimer = null;
  let jqueryEventsBound = false;

  function deepClone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function deepMerge(base, override) {
    if (Array.isArray(base)) {
      return Array.isArray(override) ? deepClone(override) : deepClone(base);
    }
    if (!isPlainObject(base)) {
      return override === undefined ? deepClone(base) : deepClone(override);
    }
    const out = deepClone(base) || {};
    if (!isPlainObject(override)) return out;
    Object.keys(override).forEach(function (key) {
      if (Array.isArray(override[key])) out[key] = deepClone(override[key]);
      else if (isPlainObject(override[key]) && isPlainObject(out[key])) out[key] = deepMerge(out[key], override[key]);
      else out[key] = deepClone(override[key]);
    });
    return out;
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeComparable(value) {
    return normalizeText(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function language() {
    const htmlLang = String(document.documentElement.getAttribute('lang') || '').toLowerCase();
    if (htmlLang.startsWith('fr')) return 'fr';
    if (htmlLang.startsWith('en')) return 'en';
    return String(navigator.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
  }

  function pageConfig(pageId) {
    const pages = Array.isArray(currentConfig.pages) ? currentConfig.pages : [];
    return pages.find(function (page) { return page && page.pageId === pageId; }) || null;
  }

  function pageEnabled(pageId) {
    const page = pageConfig(pageId);
    return currentConfig.enabled !== false && (!page || page.enabled !== false);
  }

  function safeQuery(root, selector) {
    if (!root || !selector) return null;
    try { return root.querySelector(selector); } catch (_) { return null; }
  }

  function getDataTableRowData(table, row) {
    try {
      if (!window.jQuery || !window.jQuery.fn || !window.jQuery.fn.dataTable) return null;
      if (!window.jQuery.fn.dataTable.isDataTable(table)) return null;
      return window.jQuery(table).DataTable().row(row).data() || null;
    } catch (_) {
      return null;
    }
  }

  function getStatusCell(row) {
    return safeQuery(row, 'td.status');
  }

  function inferDetailStatuses(statusCell) {
    const out = [];
    if (!statusCell) return out;

    const tests = [
      ['checked_out', '.datedue'],
      ['in_transit', '.intransit, .transitrequested'],
      ['lost', '.lost'],
      ['withdrawn', '.wdn'],
      ['damaged', '.dmg'],
      ['not_for_loan', '.notforloan'],
      ['on_hold', '.waitingat, .holdonitem, .heldfor'],
      ['recalled', '.recallwaiting, .recalledby'],
      ['restricted', '.restricted'],
      ['in_bundle', '.bundled']
    ];

    tests.forEach(function (entry) {
      if (safeQuery(statusCell, entry[1])) out.push(entry[0]);
    });

    if (!out.length) {
      const text = normalizeComparable(statusCell.textContent);
      if (/\b(disponible|available)\b/.test(text)) out.push('available');
      else if (/\b(prete|checked out|currently in local use|local use)\b/.test(text)) out.push('checked_out');
    }

    return out;
  }

  function detailStatuses(table, row, statusCell) {
    const data = getDataTableRowData(table, row);
    if (data && Array.isArray(data._status)) {
      return data._status.map(String);
    }
    return inferDetailStatuses(statusCell);
  }

  function courseStatuses(statusCell) {
    const out = [];
    if (!statusCell) return out;
    Object.keys(COURSE_STATUS_TARGETS).forEach(function (key) {
      const selector = COURSE_STATUS_TARGETS[key];
      if (selector && safeQuery(statusCell, selector)) out.push(key);
    });
    return Array.from(new Set(out));
  }

  function cleanupLegacy033Row(row) {
    if (!row) return;

    row.classList.remove('vc-disponible', 'vc-prete', 'vc-exclu', 'vc-prete-pret');
    row.removeAttribute('data-vc-row-colored');

    row.querySelectorAll('img.vc-star, img[src$="starred.png"]').forEach(function (el) { el.remove(); });

    const statusCell = getStatusCell(row);
    if (!statusCell) return;

    statusCell.querySelectorAll('span[style]').forEach(function (span) {
      const style = String(span.getAttribute('style') || '').replace(/\s+/g, '').toLowerCase();
      const isLegacy033 =
        !normalizeText(span.className) &&
        style.indexOf('font-weight:bold') !== -1 &&
        (style.indexOf('color:green') !== -1 || style.indexOf('color:#900') !== -1 || style.indexOf('color:#990000') !== -1);

      if (isLegacy033) {
        span.replaceWith(document.createTextNode(span.textContent || ''));
      }
    });
  }

  function clearRowPresentation(row) {
    if (!row) return;
    cleanupLegacy033Row(row);
    row.classList.remove('pmk033-row-state');
    row.style.removeProperty('--pmk033-row-background');

    row.querySelectorAll('[data-pmk033-status-styled="1"]').forEach(function (el) {
      el.removeAttribute('data-pmk033-status-styled');
      el.style.removeProperty('--pmk033-status-color');
      el.style.removeProperty('--pmk033-status-weight');
    });

    row.querySelectorAll('.pmk033-current-library-icon').forEach(function (el) { el.remove(); });
  }

  function statusTarget(statusCell, statusKey, courseMode) {
    const map = courseMode ? COURSE_STATUS_TARGETS : DETAIL_STATUS_TARGETS;
    const selector = map[statusKey];
    if (selector) return safeQuery(statusCell, selector);

    // Sur detail.pl, Koha rend "available" dans un span sans classe.
    if (!courseMode && statusKey === 'available') {
      const directSpan = Array.from(statusCell.children || []).find(function (child) {
        return child.tagName === 'SPAN' && !normalizeText(child.className);
      });
      if (directSpan) return directSpan;
    }

    return statusCell;
  }

  function applyStatusTextStyle(statusCell, rule, courseMode) {
    if (!statusCell || !rule) return;
    const target = statusTarget(statusCell, rule.statusKey, courseMode);
    if (!target) return;

    const color = normalizeText(rule.textColor);
    const weight = rule.bold ? '700' : '';
    if (!color && !weight) return;

    target.setAttribute('data-pmk033-status-styled', '1');
    if (color) target.style.setProperty('--pmk033-status-color', color);
    if (weight) target.style.setProperty('--pmk033-status-weight', weight);
  }

  function applyRowRule(row, rule) {
    if (!row || !rule || rule.enabled === false) return;
    const background = normalizeText(rule.rowBackground);
    if (!background) return;
    row.classList.add('pmk033-row-state');
    row.style.setProperty('--pmk033-row-background', background);
  }

  function getLoggedInBranchName() {
    const candidates = [
      '.logged-in-branch-name',
      '#logged-in-branch-name',
      '[data-branch-name]'
    ];
    for (const selector of candidates) {
      const el = safeQuery(document, selector);
      if (!el) continue;
      const attr = normalizeText(el.getAttribute && el.getAttribute('data-branch-name'));
      const text = normalizeText(el.textContent);
      if (attr) return attr;
      if (text) return text;
    }
    return '';
  }

  function getLoggedInBranchCode() {
    const candidates = [
      '.logged-in-branch-code',
      '#logged-in-branch-code',
      '[data-branchcode]',
      '[data-branch-code]'
    ];
    for (const selector of candidates) {
      const el = safeQuery(document, selector);
      if (!el) continue;
      const value = normalizeText(
        (el.getAttribute && (el.getAttribute('data-branchcode') || el.getAttribute('data-branch-code'))) || el.textContent
      );
      if (value) return value;
    }
    return '';
  }

  function rowIsCurrentLibrary(table, row, data) {
    const branchCode = getLoggedInBranchCode();
    if (branchCode && data && data.holding_library_id) {
      if (normalizeComparable(branchCode) === normalizeComparable(data.holding_library_id)) return true;
    }

    const branchName = getLoggedInBranchName();
    if (!branchName) return false;

    const locationCell = safeQuery(row, 'td.location');
    const holdingName = normalizeText(
      data && data._strings && data._strings.holding_library_id && data._strings.holding_library_id.str
        ? data._strings.holding_library_id.str
        : (locationCell ? locationCell.textContent : '')
    );

    return holdingName && normalizeComparable(holdingName) === normalizeComparable(branchName);
  }

  function mountCurrentLibraryIndicator(table, row, statuses, statusCell) {
    const cfg = currentConfig.detail && currentConfig.detail.currentLibrary || {};
    if (cfg.enabled === false || !statusCell) return;
    if (cfg.availableOnly !== false && !statuses.includes('available')) return;

    const data = getDataTableRowData(table, row);
    if (!rowIsCurrentLibrary(table, row, data)) return;
    if (statusCell.querySelector('.pmk033-current-library-icon')) return;

    const icon = document.createElement('i');
    icon.className = normalizeText(cfg.iconClass) || 'fa fa-star';
    icon.classList.add('pmk033-current-library-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.style.setProperty('--pmk033-current-library-color', normalizeText(cfg.color) || '#b8860b');
    icon.title = language() === 'fr'
      ? (normalizeText(cfg.titleFr) || 'Disponible dans le site de connexion')
      : (normalizeText(cfg.titleEn) || 'Available at the current library');

    statusCell.insertBefore(icon, statusCell.firstChild);
  }

  function applyDetailRow(table, row) {
    if (!row || !row.cells || !row.cells.length) return;
    clearRowPresentation(row);

    const statusCell = getStatusCell(row);
    if (!statusCell) return;

    const statuses = detailStatuses(table, row, statusCell);
    const rules = currentConfig.detail && Array.isArray(currentConfig.detail.statusRules)
      ? currentConfig.detail.statusRules
      : [];

    let rowRuleApplied = false;
    rules.forEach(function (rule) {
      if (!rule || rule.enabled === false || !statuses.includes(String(rule.statusKey || ''))) return;
      applyStatusTextStyle(statusCell, rule, false);
      if (!rowRuleApplied && normalizeText(rule.rowBackground)) {
        applyRowRule(row, rule);
        rowRuleApplied = true;
      }
    });

    mountCurrentLibraryIndicator(table, row, statuses, statusCell);
  }

  function restoreLocationElement(el) {
    if (!el) return;
    if (el.dataset.pmk033NativeText !== undefined) {
      el.textContent = el.dataset.pmk033NativeText;
    }
    el.removeAttribute('data-pmk033-location-current');
  }

  function currentLocationText(el, table, row) {
    const data = getDataTableRowData(table, row);
    if (data) {
      const fromStrings = data._strings && data._strings.location && data._strings.location.str;
      const raw = fromStrings || data.location;
      if (normalizeText(raw)) return normalizeText(raw);
    }

    const original = normalizeText(el.dataset.pmk033NativeText || el.textContent);
    const match = original.match(/\(([^()]*)\)\s*$/);
    if (match && normalizeText(match[1])) return normalizeText(match[1]);
    return original;
  }

  function applyLocations(table) {
    const mode = currentConfig.detail && currentConfig.detail.locationMode || 'native';
    table.querySelectorAll('tbody tr').forEach(function (row) {
      const el = safeQuery(row, '.shelvingloc');
      if (!el) return;

      if (el.dataset.pmk033NativeText === undefined) {
        el.dataset.pmk033NativeText = normalizeText(el.textContent);
      }

      if (mode === 'current-only') {
        const value = currentLocationText(el, table, row);
        if (value) el.textContent = value;
        el.setAttribute('data-pmk033-location-current', '1');
      } else {
        restoreLocationElement(el);
      }
    });
  }

  function findHeader(table, colname) {
    const escaped = String(colname || '').replace(/"/g, '\\"');
    return safeQuery(table, 'thead th[data-colname="' + escaped + '"]') ||
      safeQuery(table, 'thead th#holdings_' + colname) ||
      safeQuery(table, 'thead th#otherholdings_' + colname);
  }

  function applyColumnLabels(table) {
    const rules = currentConfig.detail && Array.isArray(currentConfig.detail.columnLabels)
      ? currentConfig.detail.columnLabels
      : [];
    const lang = language();

    rules.forEach(function (rule) {
      if (!rule || !normalizeText(rule.colname)) return;
      const th = findHeader(table, rule.colname);
      if (!th) return;

      if (th.dataset.pmk033NativeLabel === undefined) {
        th.dataset.pmk033NativeLabel = normalizeText(th.textContent);
      }

      if (rule.enabled === false) {
        th.textContent = th.dataset.pmk033NativeLabel;
        return;
      }

      const label = lang === 'fr' ? normalizeText(rule.labelFr) : normalizeText(rule.labelEn);
      th.textContent = label || th.dataset.pmk033NativeLabel;
    });
  }

  function restoreColumnLabels(table) {
    table.querySelectorAll('thead th[data-pmk033-native-label]').forEach(function (th) {
      th.textContent = th.dataset.pmk033NativeLabel || th.textContent;
    });
  }

  function applyDetailTable(table) {
    if (!table) return;
    applyColumnLabels(table);
    applyLocations(table);
    table.querySelectorAll('tbody tr').forEach(function (row) { applyDetailRow(table, row); });
  }

  function restoreCourseLabel(span) {
    if (!span) return;
    if (span.dataset.pmk033OriginalText !== undefined) {
      span.textContent = span.dataset.pmk033OriginalText;
    }
  }

  function applyCourseAvailableLabel(statusCell) {
    const span = safeQuery(statusCell, '.item-status.available');
    if (!span) return;

    if (span.dataset.pmk033OriginalText === undefined) {
      span.dataset.pmk033OriginalText = normalizeText(span.textContent);
    }

    const label = language() === 'fr'
      ? normalizeText(currentConfig.course && currentConfig.course.availableLabelFr)
      : normalizeText(currentConfig.course && currentConfig.course.availableLabelEn);

    span.textContent = label || span.dataset.pmk033OriginalText;
  }

  function applyCourseRow(row) {
    if (!row) return;
    clearRowPresentation(row);
    const statusCell = getStatusCell(row);
    if (!statusCell) return;

    const available = safeQuery(statusCell, '.item-status.available');
    if (available) restoreCourseLabel(available);

    const statuses = courseStatuses(statusCell);
    const rules = currentConfig.course && Array.isArray(currentConfig.course.statusRules)
      ? currentConfig.course.statusRules
      : [];

    rules.forEach(function (rule) {
      if (!rule || rule.enabled === false || !statuses.includes(String(rule.statusKey || ''))) return;
      applyStatusTextStyle(statusCell, rule, true);
    });

    if (statuses.includes('available')) applyCourseAvailableLabel(statusCell);
  }

  function restoreDetailPage() {
    DETAIL_TABLES.forEach(function (selector) {
      const table = safeQuery(document, selector);
      if (!table) return;
      restoreColumnLabels(table);
      table.querySelectorAll('.shelvingloc').forEach(restoreLocationElement);
      table.querySelectorAll('tbody tr').forEach(clearRowPresentation);
    });
  }

  function restoreCoursePage() {
    const table = safeQuery(document, COURSE_TABLE);
    if (!table) return;
    table.querySelectorAll('tbody tr').forEach(function (row) {
      clearRowPresentation(row);
      const span = safeQuery(row, '.item-status.available');
      if (span) restoreCourseLabel(span);
    });
  }

  function applyCurrentPage() {
    const path = window.location.pathname;

    if (path === PAGE_DETAIL) {
      if (!pageEnabled('catalogue.detail')) {
        restoreDetailPage();
        return;
      }
      DETAIL_TABLES.forEach(function (selector) {
        const table = safeQuery(document, selector);
        if (table) applyDetailTable(table);
      });
      mountContextAccess('catalogue.detail');
      return;
    }

    if (path === PAGE_COURSE) {
      if (!pageEnabled('course_reserves.course-details')) {
        restoreCoursePage();
        return;
      }
      const table = safeQuery(document, COURSE_TABLE);
      if (table) table.querySelectorAll('tbody tr').forEach(applyCourseRow);
      mountContextAccess('course_reserves.course-details');
    }
  }

  function scheduleApply() {
    clearTimeout(applyTimer);
    const delay = Math.max(0, Number(currentConfig.observerDelay || 70));
    applyTimer = window.setTimeout(applyCurrentPage, delay);
  }

  function installStyles() {
    const legacyStyle = document.getElementById('vc-holdings-row-styles');
    if (legacyStyle) legacyStyle.remove();
    if (document.getElementById('pmk033-holdings-presentation-style')) return;
    const style = document.createElement('style');
    style.id = 'pmk033-holdings-presentation-style';
    style.textContent = `
      #holdings_table tbody tr.pmk033-row-state > td,
      #otherholdings_table tbody tr.pmk033-row-state > td {
        background-color: var(--pmk033-row-background) !important;
      }

      [data-pmk033-status-styled="1"] {
        color: var(--pmk033-status-color, inherit) !important;
        font-weight: var(--pmk033-status-weight, inherit) !important;
      }

      .pmk033-current-library-icon {
        color: var(--pmk033-current-library-color, #b8860b);
        margin-right: 5px;
        vertical-align: baseline;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function bindDataTableEvents() {
    if (jqueryEventsBound || !window.jQuery) return;
    jqueryEventsBound = true;
    try {
      window.jQuery(document).on(
        'draw.dt.pmk033 column-visibility.dt.pmk033 responsive-display.dt.pmk033',
        '#holdings_table, #otherholdings_table, #course_reserves_table',
        scheduleApply
      );
    } catch (_) {}
  }

  function observeRelevantDom() {
    if (mutationObserver) return;
    mutationObserver = new MutationObserver(function (mutations) {
      for (const mutation of mutations) {
        if (mutation.type !== 'childList' || !mutation.addedNodes || !mutation.addedNodes.length) continue;

        const relevant = Array.from(mutation.addedNodes).some(function (node) {
          if (!node || node.nodeType !== 1) return false;
          if (node.classList && node.classList.contains('pmk033-current-library-icon')) return false;
          if (node.matches && node.matches('#holdings_table, #otherholdings_table, #course_reserves_table, tbody, tr')) return true;
          return Boolean(node.querySelector && node.querySelector('#holdings_table, #otherholdings_table, #course_reserves_table, tbody tr'));
        });

        if (relevant) {
          scheduleApply();
          return;
        }
      }
    });
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function mountContextAccess(pageId) {
    if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== 'function') return;

    const anchor = window.location.pathname === PAGE_DETAIL
      ? (safeQuery(document, '.holdings_table_table_controls') || safeQuery(document, '#holdings_table_wrapper') || safeQuery(document, '#holdings_table'))
      : (safeQuery(document, '#course_reserves_table_wrapper') || safeQuery(document, '#course_reserves_table'));

    if (!anchor) return;

    try {
      window.PMKConfig.mountContextButton({
        moduleId: MODULE_ID,
        anchor: anchor,
        position: 'after',
        contextKey: 'holdings-table-presentation-' + pageId,
        context: {
          page: pageId,
          sectionId: pageId === 'catalogue.detail' ? 'detail-statuses' : 'course-statuses'
        }
      });
    } catch (_) {}
  }

  function loadConfig() {
    if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== 'function') {
      return Promise.resolve(deepClone(DEFAULT_CONFIG));
    }
    return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
      .then(function (cfg) { return deepMerge(DEFAULT_CONFIG, cfg || {}); })
      .catch(function () { return deepClone(DEFAULT_CONFIG); });
  }

  function applyConfig(config) {
    currentConfig = deepMerge(DEFAULT_CONFIG, config || {});

    if (currentConfig.enabled === false) {
      restoreDetailPage();
      restoreCoursePage();
      return;
    }

    installStyles();
    bindDataTableEvents();
    observeRelevantDom();
    scheduleApply();
  }

  function registerVisualEditorAdapter() {
    const editor = window.PMKConfig && window.PMKConfig.visualEditor;
    if (!editor || typeof editor.register !== 'function') return false;
    editor.register(MODULE_ID, {
      capabilities: { livePreview: true },
      canPreview: function () {
        const path = window.location.pathname;
        return path === PAGE_DETAIL || path === PAGE_COURSE;
      },
      previewDraft: function (draft) {
        const path = window.location.pathname;
        if (path !== PAGE_DETAIL && path !== PAGE_COURSE) throw new Error('visual_preview_wrong_page');
        const before = deepClone(currentConfig || DEFAULT_CONFIG);
        applyConfig(draft);
        return function () { applyConfig(before); };
      }
    });
    return true;
  }

  function start() {
    registerVisualEditorAdapter();
    const path = window.location.pathname;
    if (path !== PAGE_DETAIL && path !== PAGE_COURSE) return;

    loadConfig().then(applyConfig);

    if (window.PMKConfig && typeof window.PMKConfig.subscribe === 'function') {
      try { window.PMKConfig.subscribe(MODULE_ID, applyConfig); } catch (_) {}
    }
  }

  window.addEventListener('pmk:config-ready', registerVisualEditorAdapter, { once: true });

  window.PMK033HoldingsTablePresentation = {
    version: MODULE_VERSION,
    moduleId: MODULE_ID,
    refresh: scheduleApply,
    getConfig: function () { return deepClone(currentConfig); }
  };

  start();
})();

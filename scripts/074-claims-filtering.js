/*
 Nom du fichier: 074-claims-filtering.js
 Version: 2.0.0
 Date de consolidation: 2026-09-19
 Auteur: Michael Mundet / consolidation PimpMyKoha

 Description:
   Conserve la fonction historique du 074 sur serials/claims.pl :
   - afficher uniquement les fascicules en retard ;
   - afficher uniquement les fascicules déjà réclamés ;
   - revenir au tableau complet en recliquant sur le filtre actif.

 Consolidation :
   - activation/désactivation depuis PMK Config ;
   - libellés FR/EN ;
   - alias de colonne et de statuts configurables pour les autres installations ;
   - sélecteurs Koha configurables en mode avancé ;
   - filtrage via DataTables lorsque disponible, repli DOM sinon ;
   - boutons compacts intégrés visuellement à Koha ;
   - un seul filtre actif à la fois ;
   - nettoyage complet si le module est désactivé à chaud ;
   - idempotence : aucun doublon de boutons ou de filtre DataTables.
*/
(function () {
  'use strict';

  var MODULE_ID = 'serials-claims-filtering';
  var PAGE_PATH = '/cgi-bin/koha/serials/claims.pl';
  var TOOLBAR_ID = 'pmk074-claims-filters';
  var STYLE_ID = 'pmk074-claims-filters-style';
  var CONFIG_HOST_ID = 'pmk074-config-host';

  var DEFAULT_CONFIG = {
    enabled: true,
    page: {
      enabled: true,
      path: PAGE_PATH
    },
    filters: {
      lateEnabled: true,
      claimedEnabled: true,
      statusHeaderAliases: 'Statut, Status',
      lateTerms: 'Retard, En retard, Late',
      claimedTerms: 'Réclamé, Reclamé, Claimed',
      fallbackStatusColumn: 6
    },
    labels: {
      lateFr: 'Afficher uniquement les retards',
      lateEn: 'Show late issues only',
      claimedFr: 'Afficher uniquement les réclamés',
      claimedEn: 'Show claimed issues only',
      resetFr: 'Afficher le tableau complet',
      resetEn: 'Show full table'
    },
    selectors: {
      form: '#claims_form',
      table: '#claimst'
    }
  };

  var currentConfig = clone(DEFAULT_CONFIG);
  var activeFilter = '';
  var dataTableFilter = null;
  var statusColumnIndex = -1;
  var currentTable = null;
  var subscribed = false;
  var configReadyBound = false;

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch (_) { return value; }
  }

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function merge(base, override) {
    if (Array.isArray(base)) return Array.isArray(override) ? clone(override) : clone(base);
    if (!isObject(base)) return override === undefined ? clone(base) : clone(override);
    var out = clone(base) || {};
    if (!isObject(override)) return out;
    Object.keys(override).forEach(function (key) {
      if (isObject(base[key]) && isObject(override[key])) out[key] = merge(base[key], override[key]);
      else out[key] = clone(override[key]);
    });
    return out;
  }

  function text(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function normalized(value) {
    var out = text(value).toLocaleLowerCase();
    try {
      out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (_) {}
    return out;
  }

  function splitTerms(value) {
    return String(value == null ? '' : value)
      .split(/[\n,;|]+/)
      .map(function (entry) { return normalized(entry); })
      .filter(Boolean);
  }

  function language() {
    try {
      if (window.PMKConfig && typeof window.PMKConfig.getLanguage === 'function') {
        return window.PMKConfig.getLanguage() === 'en' ? 'en' : 'fr';
      }
      var htmlLang = String(document.documentElement.lang || '').toLowerCase();
      return htmlLang.indexOf('en') === 0 ? 'en' : 'fr';
    } catch (_) {
      return 'fr';
    }
  }

  function label(frKey, enKey) {
    return language() === 'en'
      ? text(currentConfig.labels && currentConfig.labels[enKey])
      : text(currentConfig.labels && currentConfig.labels[frKey]);
  }

  function waitFor(selector, timeout) {
    var sel = text(selector);
    if (!sel) return Promise.reject(new Error('empty selector'));

    if (window.KOHA_UTILS && typeof window.KOHA_UTILS.waitFor === 'function') {
      try { return window.KOHA_UTILS.waitFor(sel, timeout || 5000); }
      catch (_) {}
    }

    return new Promise(function (resolve, reject) {
      var existing = null;
      try { existing = document.querySelector(sel); } catch (_) {}
      if (existing) return resolve(existing);

      var done = false;
      var observer = new MutationObserver(function () {
        var found = null;
        try { found = document.querySelector(sel); } catch (_) {}
        if (!found || done) return;
        done = true;
        observer.disconnect();
        resolve(found);
      });

      observer.observe(document.documentElement, { childList: true, subtree: true });
      window.setTimeout(function () {
        if (done) return;
        done = true;
        observer.disconnect();
        reject(new Error('timeout'));
      }, timeout || 5000);
    });
  }

  function pageIsActive() {
    return Boolean(
      currentConfig &&
      currentConfig.enabled !== false &&
      currentConfig.page &&
      currentConfig.page.enabled !== false &&
      window.location.pathname === text(currentConfig.page.path || PAGE_PATH)
    );
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#' + TOOLBAR_ID + '{',
      ' display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;',
      ' margin:.55rem 0 .75rem 0;',
      '}',
      '#' + TOOLBAR_ID + ' .pmk074-btn{',
      ' display:inline-flex;align-items:center;justify-content:center;gap:.35rem;',
      ' min-height:2rem;padding:.3rem .65rem;',
      ' border:1px solid #adb5bd;border-radius:.25rem;',
      ' background:#fff;color:#212529;',
      ' font:inherit;font-size:.9rem;line-height:1.25;',
      ' cursor:pointer;box-shadow:none;',
      '}',
      '#' + TOOLBAR_ID + ' .pmk074-btn:hover,',
      '#' + TOOLBAR_ID + ' .pmk074-btn:focus{',
      ' background:#f1f3f5;border-color:#868e96;color:#212529;text-decoration:none;',
      '}',
      '#' + TOOLBAR_ID + ' .pmk074-btn[aria-pressed="true"]{',
      ' background:#e9ecef;border-color:#6c757d;font-weight:600;',
      '}',
      '#' + TOOLBAR_ID + ' .pmk074-dot{',
      ' width:.55rem;height:.55rem;border-radius:50%;display:inline-block;',
      ' background:currentColor;opacity:.7;flex:0 0 auto;',
      '}',
      '#' + TOOLBAR_ID + ' .pmk074-late{color:#9a6700;}',
      '#' + TOOLBAR_ID + ' .pmk074-claimed{color:#9b2c2c;}',
      '#' + CONFIG_HOST_ID + '{display:inline-flex;align-items:center;margin-left:.15rem;}',
      '@media(max-width:575.98px){',
      ' #' + TOOLBAR_ID + '{align-items:stretch;}',
      ' #' + TOOLBAR_ID + ' .pmk074-btn{flex:1 1 100%;justify-content:flex-start;}',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function removeStyles() {
    var style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  }

  function findStatusColumn(table) {
    if (!table) return -1;
    var aliases = splitTerms(currentConfig.filters && currentConfig.filters.statusHeaderAliases);
    var headers = table.querySelectorAll('thead th');

    for (var i = 0; i < headers.length; i += 1) {
      var value = normalized(headers[i].textContent);
      if (!value) continue;
      for (var a = 0; a < aliases.length; a += 1) {
        if (value === aliases[a] || value.indexOf(aliases[a]) !== -1) return i;
      }
    }

    var fallback = Number(currentConfig.filters && currentConfig.filters.fallbackStatusColumn);
    if (Number.isInteger(fallback) && fallback >= 0 && fallback < headers.length) return fallback;
    return -1;
  }

  function filterTerms(kind) {
    if (kind === 'late') return splitTerms(currentConfig.filters && currentConfig.filters.lateTerms);
    if (kind === 'claimed') return splitTerms(currentConfig.filters && currentConfig.filters.claimedTerms);
    return [];
  }

  function statusMatches(value, kind) {
    if (!kind) return true;
    var haystack = normalized(value);
    if (!haystack) return false;
    var terms = filterTerms(kind);
    for (var i = 0; i < terms.length; i += 1) {
      if (terms[i] && haystack.indexOf(terms[i]) !== -1) return true;
    }
    return false;
  }

  function dataTablesAvailable() {
    return Boolean(
      window.jQuery &&
      window.jQuery.fn &&
      window.jQuery.fn.dataTable &&
      window.jQuery.fn.dataTable.ext &&
      Array.isArray(window.jQuery.fn.dataTable.ext.search)
    );
  }

  function tableHasDataTable(table) {
    if (!table || !window.jQuery || !window.jQuery.fn) return false;
    try {
      if (window.jQuery.fn.DataTable && typeof window.jQuery.fn.DataTable.isDataTable === 'function') {
        return window.jQuery.fn.DataTable.isDataTable(table);
      }
      return Boolean(window.jQuery(table).hasClass('dataTable'));
    } catch (_) {
      return false;
    }
  }

  function removeDataTableFilter() {
    if (!dataTableFilter || !dataTablesAvailable()) {
      dataTableFilter = null;
      return;
    }
    var list = window.jQuery.fn.dataTable.ext.search;
    for (var i = list.length - 1; i >= 0; i -= 1) {
      if (list[i] === dataTableFilter) list.splice(i, 1);
    }
    dataTableFilter = null;
  }

  function installDataTableFilter(table) {
    removeDataTableFilter();
    if (!table || !dataTablesAvailable()) return false;

    dataTableFilter = function (settings, data, dataIndex, rowData, counter) {
      if (!settings || settings.nTable !== table) return true;
      if (!activeFilter) return true;

      var value = '';
      if (Array.isArray(data) && statusColumnIndex >= 0) value = data[statusColumnIndex] || '';

      if (!text(value) && settings.aoData && settings.aoData[dataIndex] && settings.aoData[dataIndex].nTr) {
        var row = settings.aoData[dataIndex].nTr;
        var cell = row && row.cells ? row.cells[statusColumnIndex] : null;
        value = cell ? cell.textContent : '';
      }
      return statusMatches(value, activeFilter);
    };

    window.jQuery.fn.dataTable.ext.search.push(dataTableFilter);
    return true;
  }

  function restoreDomRows(table) {
    if (!table) return;
    Array.prototype.forEach.call(table.querySelectorAll('tbody tr'), function (row) {
      if (row.hasAttribute('data-pmk074-display')) {
        row.style.display = row.getAttribute('data-pmk074-display') || '';
        row.removeAttribute('data-pmk074-display');
      }
    });
  }

  function applyDomFilter(table) {
    if (!table || statusColumnIndex < 0) return;
    var rows = table.querySelectorAll('tbody tr');
    Array.prototype.forEach.call(rows, function (row) {
      if (!row.hasAttribute('data-pmk074-display')) {
        row.setAttribute('data-pmk074-display', row.style.display || '');
      }
      if (!activeFilter) {
        row.style.display = row.getAttribute('data-pmk074-display') || '';
        return;
      }
      var cell = row.cells ? row.cells[statusColumnIndex] : null;
      row.style.display = cell && statusMatches(cell.textContent, activeFilter) ? '' : 'none';
    });
  }

  function redrawTable() {
    if (!currentTable) return;

    if (tableHasDataTable(currentTable)) {
      restoreDomRows(currentTable);
      try {
        var api = window.jQuery(currentTable).DataTable();
        api.draw(false);
        return;
      } catch (_) {}
    }

    applyDomFilter(currentTable);
  }

  function updateButtons() {
    var late = document.querySelector('#' + TOOLBAR_ID + ' [data-pmk074-filter="late"]');
    var claimed = document.querySelector('#' + TOOLBAR_ID + ' [data-pmk074-filter="claimed"]');
    var resetLabel = label('resetFr', 'resetEn') || (language() === 'en' ? 'Show full table' : 'Afficher le tableau complet');

    if (late) {
      var lateActive = activeFilter === 'late';
      late.setAttribute('aria-pressed', lateActive ? 'true' : 'false');
      var lateText = lateActive ? resetLabel : (label('lateFr', 'lateEn') || (language() === 'en' ? 'Show late issues only' : 'Afficher uniquement les retards'));
      var lateLabel = late.querySelector('.pmk074-label');
      if (lateLabel) lateLabel.textContent = lateText;
    }

    if (claimed) {
      var claimedActive = activeFilter === 'claimed';
      claimed.setAttribute('aria-pressed', claimedActive ? 'true' : 'false');
      var claimedText = claimedActive ? resetLabel : (label('claimedFr', 'claimedEn') || (language() === 'en' ? 'Show claimed issues only' : 'Afficher uniquement les réclamés'));
      var claimedLabel = claimed.querySelector('.pmk074-label');
      if (claimedLabel) claimedLabel.textContent = claimedText;
    }
  }

  function setFilter(kind) {
    activeFilter = activeFilter === kind ? '' : kind;
    updateButtons();
    redrawTable();
  }

  function makeButton(kind, className, labelText) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-default btn-sm pmk074-btn ' + className;
    button.setAttribute('data-pmk074-filter', kind);
    button.setAttribute('aria-pressed', 'false');

    var dot = document.createElement('span');
    dot.className = 'pmk074-dot';
    dot.setAttribute('aria-hidden', 'true');

    var span = document.createElement('span');
    span.className = 'pmk074-label';
    span.textContent = labelText;

    button.appendChild(dot);
    button.appendChild(span);
    button.addEventListener('click', function () { setFilter(kind); });
    return button;
  }

  function mountConfigButton(toolbar) {
    if (!toolbar || !window.PMKConfig || typeof window.PMKConfig.mountContextButton !== 'function') return;
    if (!window.PMKConfig.canOpenAdmin || !window.PMKConfig.canOpenAdmin()) return;

    var existing = document.getElementById(CONFIG_HOST_ID);
    if (existing) existing.remove();

    var host = document.createElement('span');
    host.id = CONFIG_HOST_ID;
    toolbar.appendChild(host);

    try {
      window.PMKConfig.mountContextButton({
        moduleId: MODULE_ID,
        anchor: host,
        contextKey: 'claims-filters',
        context: { sectionId: 'filters', pagePath: PAGE_PATH }
      });
    } catch (_) {}
  }

  function removeToolbar() {
    var toolbar = document.getElementById(TOOLBAR_ID);
    if (toolbar) toolbar.remove();
  }

  function cleanup() {
    activeFilter = '';
    removeDataTableFilter();
    if (currentTable) {
      restoreDomRows(currentTable);
      if (tableHasDataTable(currentTable)) {
        try { window.jQuery(currentTable).DataTable().draw(false); } catch (_) {}
      }
    }
    currentTable = null;
    statusColumnIndex = -1;
    removeToolbar();
    removeStyles();
  }

  function render(form, table) {
    if (!form || !table || !form.parentNode) return;

    removeToolbar();
    injectStyles();
    currentTable = table;
    statusColumnIndex = findStatusColumn(table);
    if (statusColumnIndex < 0) return;

    installDataTableFilter(table);

    var toolbar = document.createElement('div');
    toolbar.id = TOOLBAR_ID;
    toolbar.className = 'pmk074-toolbar';
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', language() === 'en' ? 'Claims filters' : 'Filtres des réclamations');

    if (!currentConfig.filters || currentConfig.filters.lateEnabled !== false) {
      toolbar.appendChild(makeButton(
        'late',
        'pmk074-late',
        label('lateFr', 'lateEn') || (language() === 'en' ? 'Show late issues only' : 'Afficher uniquement les retards')
      ));
    }

    if (!currentConfig.filters || currentConfig.filters.claimedEnabled !== false) {
      toolbar.appendChild(makeButton(
        'claimed',
        'pmk074-claimed',
        label('claimedFr', 'claimedEn') || (language() === 'en' ? 'Show claimed issues only' : 'Afficher uniquement les réclamés')
      ));
    }

    if (!toolbar.querySelector('.pmk074-btn')) return;

    form.parentNode.insertBefore(toolbar, form);
    mountConfigButton(toolbar);
    updateButtons();
  }

  function applyConfig() {
    cleanup();
    if (!pageIsActive()) return;

    var formSelector = text(currentConfig.selectors && currentConfig.selectors.form) || '#claims_form';
    var tableSelector = text(currentConfig.selectors && currentConfig.selectors.table) || '#claimst';

    Promise.all([
      waitFor(formSelector, 5000),
      waitFor(tableSelector, 5000)
    ]).then(function (nodes) {
      if (!pageIsActive()) return;
      render(nodes[0], nodes[1]);
    }).catch(function () {
      // Page sans fascicules manquants, sélecteurs personnalisés invalides
      // ou structure Koha différente : ne rien casser.
    });
  }

  function loadWithPMK() {
    if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== 'function') return false;

    window.PMKConfig.getConfig(MODULE_ID).then(function (config) {
      currentConfig = merge(DEFAULT_CONFIG, config || {});
      applyConfig();
    }).catch(function () {
      currentConfig = clone(DEFAULT_CONFIG);
      applyConfig();
    });

    if (!subscribed && typeof window.PMKConfig.subscribe === 'function') {
      subscribed = true;
      window.PMKConfig.subscribe(MODULE_ID, function (config) {
        currentConfig = merge(DEFAULT_CONFIG, config || {});
        applyConfig();
      });
    }
    return true;
  }

  function boot() {
    if (window.location.pathname !== PAGE_PATH) return;

    if (loadWithPMK()) return;

    // Mode autonome / dégradé : comportement historique actif avec
    // valeurs par défaut, puis reprise de la configuration dès que PMK
    // devient disponible.
    currentConfig = clone(DEFAULT_CONFIG);
    applyConfig();

    if (!configReadyBound) {
      configReadyBound = true;
      window.addEventListener('pmk:config-ready', function () {
        loadWithPMK();
      }, { once: true });
    }
  }

  boot();
})();

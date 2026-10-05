/*
 Nom du fichier: 028-transfer-buttons-holdings.js
 Dépendances: KOHA_UTILS.waitForSelector (fallback included)
 Version: v3.0 — fiabilisation multi-installations Koha
 Date de dernière modification: 2026-09-17
 Auteur: Michael Mundet

 Description:
 - Ajoute un bouton "Transférer" dans la table des exemplaires de detail.pl.
 - Transmet le code-barres vers branchtransfers.pl.
 - Préremplit le champ code-barres sans lancer automatiquement le transfert.
 - Détecte les colonnes via data-colname/id/headers plutôt que par position fixe.
 - Supporte les libellés FR/EN pour la détection de disponibilité.
 - Résiste mieux aux redraw DataTables et aux doubles injections.
*/

(function () {
  'use strict';

  if (window.__PMK028_TRANSFER_BUTTONS__) return;
  window.__PMK028_TRANSFER_BUTTONS__ = true;

  const MODULE_ID = 'transfer-button-holdings';
  const MODULE_VERSION = '2026.09.17.4';

  const PAGE_DETAIL = '/cgi-bin/koha/catalogue/detail.pl';
  const PAGE_TRANSFER = '/cgi-bin/koha/circ/branchtransfers.pl';

  const STORAGE_KEY = 'pmk028.pendingTransfer';
  const STORAGE_MAX_AGE_MS = 5 * 60 * 1000;

  const DEFAULT_CONFIG = {
    enabled: true,
    pages: [
      {
        id: 'catalogue.detail',
        enabled: true,
        path: PAGE_DETAIL
      }
    ]
  };

  let currentConfig = { ...DEFAULT_CONFIG };
  let detailInitialized = false;

  function isDetailPageEnabled(config) {
    const cfg = config || currentConfig || DEFAULT_CONFIG;
    const pages = Array.isArray(cfg.pages) ? cfg.pages : DEFAULT_CONFIG.pages;
    const page = pages.find(item => item && item.id === 'catalogue.detail');
    return Boolean(page && page.enabled !== false);
  }


  /* ============================================================
     UTILITAIRES DOM
     ============================================================ */

  function localWaitForSelector(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      let timer = null;
      let done = false;

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) finish(resolve, found);
      });

      function finish(callback, value) {
        if (done) return;
        done = true;
        observer.disconnect();
        if (timer) clearTimeout(timer);
        callback(value);
      }

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });

      timer = setTimeout(() => {
        finish(reject, new Error('timeout'));
      }, timeout);
    });
  }

  const waitForSelector =
    window.KOHA_UTILS &&
    typeof window.KOHA_UTILS.waitForSelector === 'function'
      ? window.KOHA_UTILS.waitForSelector
      : localWaitForSelector;

  function normalizeText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function safeQuery(root, selector) {
    try {
      return root ? root.querySelector(selector) : null;
    } catch (_) {
      return null;
    }
  }

  /* ============================================================
     STYLE
     ============================================================ */

  function installTransferStyles() {
    if (document.getElementById('pmk028-transfer-button-style')) return;

    const style = document.createElement('style');
    style.id = 'pmk028-transfer-button-style';

    style.textContent = `
      #holdings_table .pmk028-transfer-action-row {
        display: block;
        margin-top: 5px;
        line-height: 1;
      }

      #holdings_table .pmk028-transfer-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-height: 26px;
        padding: 3px 8px;
        vertical-align: middle;
        white-space: nowrap;
      }

      #holdings_table .pmk028-transfer-btn i {
        margin: 0;
        line-height: 1;
      }

      @media (max-width: 767px) {
        #holdings_table .pmk028-transfer-btn {
          min-height: 28px;
          padding: 4px 8px;
        }
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  /* ============================================================
     IDENTIFICATION DES COLONNES
     ============================================================ */

  function getColumnIndexByIdentity(table, identities) {
    if (!table || !Array.isArray(identities)) return -1;

    const headers = Array.from(table.querySelectorAll('thead th'));

    for (let i = 0; i < headers.length; i += 1) {
      const th = headers[i];

      const colname = normalizeText(th.getAttribute('data-colname')).toLowerCase();
      const id = normalizeText(th.id).toLowerCase();

      for (const identity of identities) {
        const value = String(identity || '').toLowerCase();

        if (!value) continue;

        if (colname === value) return i;
        if (id === value) return i;
        if (id === `holdings_${value}`) return i;
      }
    }

    return -1;
  }

  function getCellByColumn(table, row, identities) {
    if (!table || !row) return null;

    const index = getColumnIndexByIdentity(table, identities);
    if (index >= 0 && row.cells && row.cells[index]) {
      return row.cells[index];
    }

    for (const identity of identities) {
      const selectors = [
        `td.${identity}`,
        `td[data-colname="${identity}"]`,
        `td[headers="holdings_${identity}"]`,
        `td[headers="${identity}"]`
      ];

      for (const selector of selectors) {
        const found = safeQuery(row, selector);
        if (found) return found;
      }
    }

    return null;
  }

  /* ============================================================
     DÉTECTION DE DISPONIBILITÉ
     ============================================================ */

  function rowLooksAvailable(table, row) {
    const statusCell = getCellByColumn(table, row, ['status']);

    const statusText = normalizeText(
      statusCell ? statusCell.textContent : ''
    );

    const rowClasses = String(row.className || '').toLowerCase();

    // Priorité aux classes déjà ajoutées par Koha/scripts locaux quand elles existent.
    if (
      /\b(disponible|available|vc-disponible)\b/.test(rowClasses)
    ) {
      return true;
    }

    // Fallback FR / EN uniquement si aucune classe technique exploitable.
    if (
      /\bDisponible\b/i.test(statusText) ||
      /\bAvailable\b/i.test(statusText)
    ) {
      return true;
    }

    return false;
  }

  /* ============================================================
     EXTRACTION DU CODE-BARRES
     ============================================================ */

  function getBarcodeFromRow(table, row) {
    if (!row) return '';

    const barcodeCell = getCellByColumn(table, row, ['barcode']);

    if (barcodeCell) {
      const candidates = [
        barcodeCell.querySelector('a'),
        barcodeCell.querySelector('[data-barcode]'),
        barcodeCell
      ].filter(Boolean);

      for (const candidate of candidates) {
        const dataBarcode = normalizeText(
          candidate.getAttribute && candidate.getAttribute('data-barcode')
        );

        if (dataBarcode) return dataBarcode;

        const value = normalizeText(candidate.textContent);

        if (value) {
          const cleaned = value.replace(/\s+/g, '');
          if (cleaned) return cleaned;
        }
      }
    }

    // Repli historique sécurisé.
    const barcodeLink = row.querySelector(
      'a[href*="#item"], a[href*="itemnumber="]'
    );

    if (barcodeLink) {
      const value = normalizeText(barcodeLink.textContent);
      if (value) return value.replace(/\s+/g, '');
    }

    return '';
  }

  /* ============================================================
     STOCKAGE INTER-PAGES
     ============================================================ */

  function storePendingBarcode(barcode) {
    if (!barcode) return false;

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          barcode: String(barcode),
          createdAt: Date.now(),
          source: window.location.pathname,
          version: MODULE_VERSION
        })
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  function readPendingBarcode() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return '';

      let payload = null;

      try {
        payload = JSON.parse(raw);
      } catch (_) {
        payload = null;
      }

      if (!payload || !payload.barcode || !payload.createdAt) {
        localStorage.removeItem(STORAGE_KEY);
        return '';
      }

      const age = Date.now() - Number(payload.createdAt);

      if (!Number.isFinite(age) || age < 0 || age > STORAGE_MAX_AGE_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return '';
      }

      return normalizeText(payload.barcode);
    } catch (_) {
      return '';
    }
  }

  function clearPendingBarcode() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  /* ============================================================
     BRANCHTRANSFERS.PL
     ============================================================ */

  function initBranchTransfersPage() {
    const storedBarcode = readPendingBarcode();
    if (!storedBarcode) return;

    waitForSelector('#barcode', 5000)
      .then(input => {
        if (!input) return;

        try {
          input.value = storedBarcode;

          input.dispatchEvent(
            new Event('input', { bubbles: true })
          );

          input.dispatchEvent(
            new Event('change', { bubbles: true })
          );
        } catch (_) {}
      })
      .catch(() => {})
      .finally(() => {
        clearPendingBarcode();
      });
  }

  /* ============================================================
     CRÉATION DU BOUTON
     ============================================================ */

  function createTransferButton() {
    const button = document.createElement('button');

    button.type = 'button';
    button.className =
      'btn btn-default btn-xs pmk028-transfer-btn';

    button.setAttribute('data-pmk028-transfer', '1');
    button.setAttribute('data-pmk-module', MODULE_ID);
    button.setAttribute('data-pmk-version', MODULE_VERSION);

    button.title =
      document.documentElement.lang &&
      document.documentElement.lang.toLowerCase().startsWith('en')
        ? 'Transfer this item to another library'
        : 'Transférer cet exemplaire vers un autre site';

    button.setAttribute(
      'aria-label',
      document.documentElement.lang &&
      document.documentElement.lang.toLowerCase().startsWith('en')
        ? 'Transfer this item'
        : 'Transférer cet exemplaire'
    );

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-arrow-right-arrow-left';
    icon.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.textContent =
      document.documentElement.lang &&
      document.documentElement.lang.toLowerCase().startsWith('en')
        ? 'Transfer'
        : 'Transférer';

    button.append(icon, label);

    return button;
  }

  /* ============================================================
     INSERTION DANS LA COLONNE ACTIONS
     ============================================================ */

  function getActionCell(table, row) {
    return getCellByColumn(table, row, ['actions']) ||
      safeQuery(row, 'td.actions') ||
      safeQuery(row, 'td:last-child');
  }

  function applyTransferButtons(table) {
    if (!table) return;

    const rows = table.querySelectorAll('tbody tr');

    rows.forEach(row => {
      if (!(row instanceof HTMLTableRowElement)) return;

      if (!rowLooksAvailable(table, row)) return;

      if (row.querySelector('[data-pmk028-transfer="1"]')) return;

      const barcode = getBarcodeFromRow(table, row);
      if (!barcode) return;

      const actionCell = getActionCell(table, row);
      if (!actionCell) return;

      let actionRow = actionCell.querySelector(
        '.pmk028-transfer-action-row'
      );

      if (!actionRow) {
        actionRow = document.createElement('div');
        actionRow.className = 'pmk028-transfer-action-row';
        actionRow.setAttribute('data-pmk028-owner', MODULE_ID);
        actionCell.appendChild(actionRow);
      }

      actionRow.appendChild(createTransferButton());
    });
  }

  /* ============================================================
     ÉVÉNEMENT DE CLIC
     ============================================================ */

  function bindTransferClick(table) {
    if (!table || table.dataset.pmk028ClickBound === '1') return;

    table.addEventListener('click', event => {
      const button = event.target.closest(
        '[data-pmk028-transfer="1"]'
      );

      if (!button || !table.contains(button)) return;

      event.preventDefault();
      event.stopPropagation();

      const row = button.closest('tr');
      if (!row) return;

      const barcode = getBarcodeFromRow(table, row);
      if (!barcode) return;

      storePendingBarcode(barcode);

      window.location.href = PAGE_TRANSFER;
    });

    table.dataset.pmk028ClickBound = '1';
  }

  /* ============================================================
     OBSERVATION DATATABLES
     ============================================================ */

  function observeTable(table) {
    if (!table) return;

    const tbody = table.tBodies && table.tBodies[0];
    if (!tbody || tbody.dataset.pmk028Observed === '1') return;

    let rerunTimer = null;

    const observer = new MutationObserver(() => {
      if (rerunTimer) clearTimeout(rerunTimer);

      rerunTimer = setTimeout(() => {
        applyTransferButtons(table);
      }, 100);
    });

    observer.observe(tbody, {
      childList: true,
      subtree: true
    });

    tbody.dataset.pmk028Observed = '1';
  }

  /* ============================================================
     INITIALISATION DETAIL.PL
     ============================================================ */

  function initDetailPage() {
    installTransferStyles();

    waitForSelector('#holdings_table', 6000)
      .then(table => {
        if (!table) return;

        bindTransferClick(table);

        const run = () => {
          applyTransferButtons(table);
          observeTable(table);
        };

        const firstRow = table.querySelector('tbody tr');

        if (firstRow) {
          run();
          return;
        }

        return waitForSelector('#holdings_table tbody tr', 6000)
          .then(run)
          .catch(() => {});
      })
      .catch(() => {});
  }

  /* ============================================================
     CONFIGURATION PMK
     ============================================================ */

  function loadConfig() {
    if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== 'function') {
      return Promise.resolve({ ...DEFAULT_CONFIG });
    }

    return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
      .then(cfg => Object.assign({}, DEFAULT_CONFIG, cfg || {}))
      .catch(() => ({ ...DEFAULT_CONFIG }));
  }

  function removeTransferButtons() {
    document.querySelectorAll('[data-pmk028-transfer="1"]').forEach(el => el.remove());
    document.querySelectorAll('.pmk028-transfer-action-row').forEach(el => {
      if (!el.children.length) el.remove();
    });
  }

  function mountContextAccess() {
    if (window.location.pathname !== PAGE_DETAIL) return;
    if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== 'function') return;

    const anchor =
      document.querySelector('.holdings_table_table_controls') ||
      document.querySelector('#holdings_table_wrapper') ||
      document.querySelector('#holdings_table');

    if (!anchor) return;

    try {
      window.PMKConfig.mountContextButton({
        moduleId: MODULE_ID,
        anchor: anchor,
        position: 'after',
        contextKey: 'catalogue-detail-transfer-button',
        context: {
          page: 'catalogue.detail',
          sectionId: 'pages'
        }
      });
    } catch (_) {}
  }

  function applyConfig(cfg) {
    currentConfig = Object.assign({}, DEFAULT_CONFIG, cfg || {});
    if (!Array.isArray(currentConfig.pages)) {
      currentConfig.pages = DEFAULT_CONFIG.pages.map(page => ({ ...page }));
    }

    const detailEnabled =
      currentConfig.enabled !== false &&
      isDetailPageEnabled(currentConfig);

    if (!detailEnabled) {
      removeTransferButtons();
      if (window.location.pathname === PAGE_TRANSFER) {
        clearPendingBarcode();
      }
      return;
    }

    const path = window.location.pathname;

    if (path === PAGE_TRANSFER) {
      initBranchTransfersPage();
      return;
    }

    if (path === PAGE_DETAIL && !detailInitialized) {
      detailInitialized = true;
      initDetailPage();
    } else if (path === PAGE_DETAIL) {
      const table = document.querySelector('#holdings_table');
      if (table) applyTransferButtons(table);
    }

    mountContextAccess();
  }

  function start() {
    loadConfig().then(applyConfig);

    if (window.PMKConfig && typeof window.PMKConfig.subscribe === 'function') {
      try {
        window.PMKConfig.subscribe(MODULE_ID, applyConfig);
      } catch (_) {}
    }
  }

  start();
})();

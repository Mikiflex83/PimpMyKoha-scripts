/*
 Nom du fichier: 078-hide-print-overdues.js
 Version: 3.1.0-preplugin
 Date de dernière modification: 2026-09-22
 Auteur: Michael Mundet / refonte PimpMyKoha
 Module PMK: patron-overdues-print

 Fonction historique conservée :
 - mémorise le lecteur et son/ses garant(s) avant impression ;
 - sur print_overdues.pl, remplace le destinataire par le/les garant(s) ;
 - conserve STRICTEMENT le rendu historique :
     GARANT(S)
     adresse...
     Enfant : NOM ENFANT
   avec exactement le même assemblage par <br> que le script historique ;
 - intègre "Imprimer les retards" dans le menu déroulant Koha "Imprimer" ;
 - réutilise l'action native si elle existe, sinon recrée l'action Koha équivalente.

 Version 3 — constructeur de modèle PMK :
 - le rendu historique reste le mode par défaut et reste strictement identique ;
 - un mode personnalisé permet de composer le destinataire imprimé sans code ;
 - blocs réordonnables : garants, adresse, enfant, texte libre, espace, séparateur ;
 - texte libre avec variables {GARANTS}, {GARANTS_LIGNES}, {ADRESSE}, {ENFANT},
   {ENFANT_LIBELLE} et {BORROWERNUMBER} ;
 - préfixes/suffixes FR/EN, casse, alignement, graisse, italique, souligné,
   taille, couleur et marges par bloc ;
 - réglages globaux de police, taille, couleur, alignement et interligne ;
 - le module s'auto-enregistre dans PMK avec PMKConfig.registerModule().
*/

(function () {
  'use strict';

  if (window.__PMK078_OVERDUES_PRINT_V3__) return;
  window.__PMK078_OVERDUES_PRINT_V3__ = true;

  var MODULE_ID = 'patron-overdues-print';
  var PAGE_PATHS = {
    circulation: '/cgi-bin/koha/circ/circulation.pl',
    moremember: '/cgi-bin/koha/members/moremember.pl',
    printOverdues: '/cgi-bin/koha/members/print_overdues.pl'
  };

  function defaultBlockStyle() {
    return {
      fontSizePx: 0,
      bold: false,
      italic: false,
      underline: false,
      useColor: false,
      color: '#212529',
      textAlign: 'inherit',
      marginTopPx: 0,
      marginBottomPx: 0
    };
  }

  function printBlock(id, type, label, extra) {
    return Object.assign({
      id: id,
      enabled: true,
      label: label,
      type: type,
      prefixFr: '',
      prefixEn: '',
      suffixFr: '',
      suffixEn: '',
      transform: 'none',
      joinMode: 'comma',
      textFr: '',
      textEn: '',
      spacerHeightPx: 8,
      separatorWidthPx: 1,
      separatorStyle: 'solid',
      separatorColor: '#ced4da',
      style: defaultBlockStyle()
    }, extra || {});
  }

  function defaultPrintBlocks() {
    return [
      printBlock('guarantors', 'guarantors', 'Garant(s)', {
        marginBottomPx: 0
      }),
      printBlock('address', 'address', 'Adresse'),
      printBlock('child', 'child', 'Enfant', {
        prefixFr: 'Enfant : ',
        prefixEn: 'Child: '
      })
    ];
  }

  var DEFAULT_CONFIG = {
    enabled: true,
    behavior: {
      integratePrintOverduesInPrintMenu: true,
      storageTtlSeconds: 300
    },
    rendering: {
      mode: 'historical',
      skipEmptyBlocks: true,
      global: {
        fontFamily: 'inherit',
        fontSizePx: 0,
        lineHeight: '',
        useColor: false,
        color: '#212529',
        textAlign: 'inherit'
      },
      blocks: defaultPrintBlocks()
    },
    selectors: {
      patronInformation: '#patron-information',
      childNameLegacy: '.patroninfo h5, #patron-information h5, .patron_title h3, .patron-title h3',
      morememberHeading: 'main h1, #main h1, h1',
      guarantorLabel: 'span.label',
      printAction: '#print_overdues',
      printCapture: '#print_overdues, [data-pmk078-overdues-menu="1"], a.printslip',
      addressBlock: '#addressBlock, .address p, .patronaddress p, .address, .patronaddress'
    }
  };

  var STORAGE_PREFIX = 'pmk078:patron:';
  var STORAGE_LATEST = 'pmk078:latest';
  var STORAGE_CAPTURED_AT = 'pmk078:lastCapturedAt';
  var LEGACY_CHILD = 'k078_child_name';
  var LEGACY_GUARANTOR = 'k078_guarantor';
  var LEGACY_INLINE_GUARANTOR = 'guarantor';

  var currentConfig = clone(DEFAULT_CONFIG);
  var subscribed = false;
  var moduleRegistered = false;
  var printObserver = null;
  var activePrintRecord = null;
  var activePrintData = null;
  var clickCaptureAttached = false;
  var printMenuObserver = null;
  var printActionPlacement = null;

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function merge(base, patch) {
    var out = clone(base);
    var src = object(patch);
    Object.keys(src).forEach(function (key) {
      if (out[key] && typeof out[key] === 'object' && !Array.isArray(out[key]) && src[key] && typeof src[key] === 'object' && !Array.isArray(src[key])) {
        out[key] = merge(out[key], src[key]);
      } else {
        out[key] = src[key];
      }
    });
    return out;
  }

  function clampInt(value, min, max, fallback) {
    var n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function cleanText(value) {
    return String(value == null ? '' : value).trim();
  }

  function detectLanguage() {
    try {
      if (window.PMKConfig && typeof window.PMKConfig.getLanguage === 'function') {
        return window.PMKConfig.getLanguage() === 'en' ? 'en' : 'fr';
      }
    } catch (_) {}
    var lang = String(document.documentElement.lang || navigator.language || '').toLowerCase();
    return lang.indexOf('en') === 0 ? 'en' : 'fr';
  }

  function localized(fr, en) {
    return detectLanguage() === 'en' ? (en || fr || '') : (fr || en || '');
  }

  function uniqueBlockId(value, used, index) {
    var base = String(value || ('block-' + (index + 1)))
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || ('block-' + (index + 1));
    var id = base;
    var n = 2;
    while (used[id]) {
      id = base + '-' + n;
      n += 1;
    }
    used[id] = true;
    return id;
  }

  function normalizeBlock(raw, index, used) {
    var block = merge(printBlock('', 'text', 'Bloc ' + (index + 1)), object(raw));
    block.id = uniqueBlockId(block.id, used, index);
    block.enabled = block.enabled !== false;
    block.type = ['guarantors', 'address', 'child', 'text', 'spacer', 'separator'].indexOf(block.type) >= 0 ? block.type : 'text';
    block.transform = ['none', 'upper', 'lower'].indexOf(block.transform) >= 0 ? block.transform : 'none';
    block.joinMode = ['comma', 'line', 'and', 'semicolon'].indexOf(block.joinMode) >= 0 ? block.joinMode : 'comma';
    block.spacerHeightPx = clampInt(block.spacerHeightPx, 0, 200, 8);
    block.separatorWidthPx = clampInt(block.separatorWidthPx, 1, 12, 1);
    block.separatorStyle = ['solid', 'dashed', 'dotted', 'double'].indexOf(block.separatorStyle) >= 0 ? block.separatorStyle : 'solid';
    block.style = merge(defaultBlockStyle(), object(block.style));
    block.style.fontSizePx = clampInt(block.style.fontSizePx, 0, 96, 0);
    block.style.marginTopPx = clampInt(block.style.marginTopPx, 0, 200, 0);
    block.style.marginBottomPx = clampInt(block.style.marginBottomPx, 0, 200, 0);
    block.style.textAlign = ['inherit', 'left', 'center', 'right', 'justify'].indexOf(block.style.textAlign) >= 0 ? block.style.textAlign : 'inherit';
    block.style.bold = block.style.bold === true;
    block.style.italic = block.style.italic === true;
    block.style.underline = block.style.underline === true;
    block.style.useColor = block.style.useColor === true;
    return block;
  }

  function normalizeConfig(config) {
    var cfg = merge(DEFAULT_CONFIG, config || {});
    cfg.enabled = cfg.enabled !== false;
    cfg.behavior = merge(DEFAULT_CONFIG.behavior, object(cfg.behavior));
    cfg.selectors = merge(DEFAULT_CONFIG.selectors, object(cfg.selectors));
    cfg.rendering = merge(DEFAULT_CONFIG.rendering, object(cfg.rendering));
    cfg.rendering.global = merge(DEFAULT_CONFIG.rendering.global, object(cfg.rendering.global));
    cfg.rendering.mode = cfg.rendering.mode === 'custom' ? 'custom' : 'historical';
    cfg.rendering.skipEmptyBlocks = cfg.rendering.skipEmptyBlocks !== false;
    cfg.rendering.global.fontFamily = ['inherit', 'Arial, sans-serif', 'Georgia, serif', 'Times New Roman, serif', 'Verdana, sans-serif', 'monospace'].indexOf(cfg.rendering.global.fontFamily) >= 0
      ? cfg.rendering.global.fontFamily : 'inherit';
    cfg.rendering.global.fontSizePx = clampInt(cfg.rendering.global.fontSizePx, 0, 96, 0);
    cfg.rendering.global.textAlign = ['inherit', 'left', 'center', 'right', 'justify'].indexOf(cfg.rendering.global.textAlign) >= 0
      ? cfg.rendering.global.textAlign : 'inherit';
    cfg.rendering.global.useColor = cfg.rendering.global.useColor === true;
    var used = Object.create(null);
    cfg.rendering.blocks = Array.isArray(cfg.rendering.blocks) && cfg.rendering.blocks.length
      ? cfg.rendering.blocks.map(function (block, index) { return normalizeBlock(block, index, used); })
      : defaultPrintBlocks().map(function (block, index) { return normalizeBlock(block, index, used); });
    cfg.behavior.integratePrintOverduesInPrintMenu = cfg.behavior.integratePrintOverduesInPrintMenu !== false;
    cfg.behavior.storageTtlSeconds = clampInt(cfg.behavior.storageTtlSeconds, 30, 3600, DEFAULT_CONFIG.behavior.storageTtlSeconds);
    return cfg;
  }

  function pathIs(expected) {
    var path = window.location.pathname || '';
    return path === expected || path.endsWith(expected.split('/').pop());
  }

  function isSupportedPage() {
    return pathIs(PAGE_PATHS.circulation) || pathIs(PAGE_PATHS.moremember) || pathIs(PAGE_PATHS.printOverdues);
  }

  function safeQuery(selector, root) {
    try {
      return (root || document).querySelector(selector);
    } catch (_) {
      return null;
    }
  }

  function safeQueryAll(selector, root) {
    try {
      return Array.prototype.slice.call((root || document).querySelectorAll(selector));
    } catch (_) {
      return [];
    }
  }

  function waitFor(selector, timeout) {
    if (window.KOHA_UTILS && typeof window.KOHA_UTILS.waitFor === 'function') {
      try { return window.KOHA_UTILS.waitFor(selector, timeout); } catch (_) {}
    }
    return new Promise(function (resolve, reject) {
      var el = safeQuery(selector);
      if (el) return resolve(el);
      var finished = false;
      var obs = new MutationObserver(function () {
        var found = safeQuery(selector);
        if (!found) return;
        finished = true;
        try { obs.disconnect(); } catch (_) {}
        resolve(found);
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      window.setTimeout(function () {
        if (finished) return;
        try { obs.disconnect(); } catch (_) {}
        reject(new Error('timeout'));
      }, timeout || 3000);
    });
  }

  /* IMPORTANT : fonction historique conservée telle quelle sur le principe.
     Elle conditionne le texte exact envoyé vers l'impression. */
  function normalizePersonName(value) {
    return String(value || '')
      .replace(/\([^)]*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function uniqueNames(values) {
    var out = [];
    values.forEach(function (value) {
      var name = normalizePersonName(value);
      if (name && out.indexOf(name) === -1) out.push(name);
    });
    return out;
  }

  function getBorrowerNumber() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      var direct = params.get('borrowernumber');
      if (direct && /^\d+$/.test(direct)) return direct;
    } catch (_) {}

    var input = safeQuery('input[name="borrowernumber"], input#borrowernumber');
    if (input && /^\d+$/.test(String(input.value || '').trim())) return String(input.value).trim();

    var links = safeQueryAll('a[href*="borrowernumber="]');
    for (var i = 0; i < links.length; i += 1) {
      try {
        var url = new URL(links[i].href, window.location.href);
        var value = url.searchParams.get('borrowernumber');
        if (value && /^\d+$/.test(value)) return value;
      } catch (_) {}
    }
    return '';
  }

  function getChildName() {
    var legacy = safeQuery(currentConfig.selectors.childNameLegacy);
    if (legacy) {
      var oldText = normalizePersonName(legacy.textContent || '');
      if (oldText) return oldText;
    }

    /* Sur moremember.pl actuel, le h1 est directement patron-title.inc.
       Ce fallback n'est volontairement PAS utilisé sur circulation.pl afin
       d'éviter de capturer le h1 générique "Check out". */
    if (pathIs(PAGE_PATHS.moremember)) {
      var heading = safeQuery(currentConfig.selectors.morememberHeading);
      if (heading) {
        var headingText = normalizePersonName(heading.textContent || '');
        if (headingText) return headingText;
      }
    }
    return '';
  }

  function labelIsGuarantor(text) {
    var value = String(text || '').replace(/\s+/g, ' ').trim().replace(/:$/, '').toLowerCase();
    return value.indexOf('garant') === 0 || value.indexOf('guarantor') === 0;
  }

  function namesFromGuarantorListItem(li) {
    if (!li) return [];

    /* PARITÉ HISTORIQUE IMPORTANTE : l'ancien 078 prenait le premier <a>
       trouvé dans le <li> du libellé Garant. S'il y en avait un, il ne
       parcourait pas ensuite la liste imbriquée. On conserve volontairement
       cette règle pour ne jamais modifier le destinataire imprimé. */
    var firstLink = safeQuery('a', li);
    if (firstLink) {
      var firstName = normalizePersonName(firstLink.textContent || '');
      return firstName ? [firstName] : [];
    }

    var names = [];
    var ul = safeQuery('ul', li);
    if (ul) {
      safeQueryAll('li', ul).forEach(function (item) {
        var value = normalizePersonName(item.textContent || '');
        if (value) names.push(value);
      });
    }
    return uniqueNames(names);
  }

  function getGuarantorNames() {
    var patronInfo = safeQuery(currentConfig.selectors.patronInformation);
    var roots = [];
    if (patronInfo) roots.push(patronInfo);

    /* Fallback historique : nécessaire pour anciennes versions / installations
       dont le bloc n'a pas #patron-information. */
    var historicalContainer = safeQuery('.col-sm-6');
    if (historicalContainer && roots.indexOf(historicalContainer) === -1) roots.push(historicalContainer);

    for (var r = 0; r < roots.length; r += 1) {
      var labels = safeQueryAll(currentConfig.selectors.guarantorLabel, roots[r]);
      for (var i = 0; i < labels.length; i += 1) {
        if (!labelIsGuarantor(labels[i].textContent || '')) continue;
        var li = labels[i].closest ? labels[i].closest('li') : null;
        var names = namesFromGuarantorListItem(li);
        if (names.length) return names;
      }
    }
    return [];
  }

  function recordKey(borrowerNumber) {
    return STORAGE_PREFIX + String(borrowerNumber || 'unknown');
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function purgeExpiredStoredData() {
    try {
      var ttlMs = currentConfig.behavior.storageTtlSeconds * 1000;
      var now = Date.now();
      var keys = [];
      for (var i = 0; i < localStorage.length; i += 1) {
        var key = localStorage.key(i);
        if (key && key.indexOf(STORAGE_PREFIX) === 0) keys.push(key);
      }
      keys.forEach(function (key) {
        var record = parseRecord(storageGet(key));
        if (!record) storageRemove(key);
      });

      var latest = parseRecord(storageGet(STORAGE_LATEST));
      if (!latest) {
        storageRemove(STORAGE_LATEST);
        var capturedAt = Number(storageGet(STORAGE_CAPTURED_AT) || 0);
        if (!capturedAt || now - capturedAt > ttlMs) {
          storageRemove(STORAGE_CAPTURED_AT);
          storageRemove(LEGACY_CHILD);
          storageRemove(LEGACY_GUARANTOR);
          storageRemove(LEGACY_INLINE_GUARANTOR);
        }
      }
    } catch (_) {}
  }

  function capturePrintContext() {
    try {
      var borrowerNumber = getBorrowerNumber();
      var childName = getChildName();
      var guarantors = getGuarantorNames();
      var joined = guarantors.join(', '); /* EXACTEMENT le séparateur historique. */
      var now = Date.now();

      var record = {
        version: 2,
        borrowerNumber: borrowerNumber,
        childName: childName,
        guarantors: guarantors,
        guarantorJoined: joined,
        capturedAt: now
      };

      storageSet(recordKey(borrowerNumber), JSON.stringify(record));
      storageSet(STORAGE_LATEST, JSON.stringify(record));
      storageSet(STORAGE_CAPTURED_AT, String(now));

      /* Compatibilité avec le script historique et avec un éventuel JS contenu
         dans la notice OVERDUES_SLIP. Les valeurs sont désormais nettoyées
         rapidement et ne servent plus de source principale à la v2. */
      if (childName) storageSet(LEGACY_CHILD, childName);
      else storageRemove(LEGACY_CHILD);

      if (joined) {
        storageSet(LEGACY_GUARANTOR, joined);
        storageSet(LEGACY_INLINE_GUARANTOR, joined);
      } else {
        storageRemove(LEGACY_GUARANTOR);
        storageRemove(LEGACY_INLINE_GUARANTOR);
      }

      return record;
    } catch (_) {
      return null;
    }
  }

  function parseRecord(raw) {
    if (!raw) return null;
    try {
      var record = JSON.parse(raw);
      if (!record || typeof record !== 'object') return null;
      var capturedAt = Number(record.capturedAt || 0);
      if (!capturedAt) return null;
      var ttlMs = currentConfig.behavior.storageTtlSeconds * 1000;
      if (Date.now() - capturedAt > ttlMs) return null;
      record.childName = normalizePersonName(record.childName || '');
      record.guarantors = Array.isArray(record.guarantors) ? uniqueNames(record.guarantors) : [];
      record.guarantorJoined = normalizePersonName(record.guarantorJoined || record.guarantors.join(', '));
      return record;
    } catch (_) {
      return null;
    }
  }

  function loadPrintRecord() {
    var borrowerNumber = getBorrowerNumber();
    var record = parseRecord(storageGet(recordKey(borrowerNumber)));
    if (record) return record;

    record = parseRecord(storageGet(STORAGE_LATEST));
    if (record && (!borrowerNumber || !record.borrowerNumber || String(record.borrowerNumber) === String(borrowerNumber))) return record;

    /* Compatibilité de transition : les anciennes clés ne sont acceptées que
       si elles ont été écrites récemment par cette v2 (timestamp séparé). */
    var capturedAt = Number(storageGet(STORAGE_CAPTURED_AT) || 0);
    if (capturedAt && Date.now() - capturedAt <= currentConfig.behavior.storageTtlSeconds * 1000) {
      var child = normalizePersonName(storageGet(LEGACY_CHILD) || '');
      var guarantor = normalizePersonName(storageGet(LEGACY_GUARANTOR) || storageGet(LEGACY_INLINE_GUARANTOR) || '');
      if (guarantor) {
        return {
          version: 1,
          borrowerNumber: borrowerNumber,
          childName: child,
          guarantors: guarantor ? [guarantor] : [],
          guarantorJoined: guarantor,
          capturedAt: capturedAt
        };
      }
    }
    return null;
  }

  function clearStoredRecord(record) {
    if (record && record.borrowerNumber) storageRemove(recordKey(record.borrowerNumber));
    storageRemove(STORAGE_LATEST);
    storageRemove(STORAGE_CAPTURED_AT);
    storageRemove(LEGACY_CHILD);
    storageRemove(LEGACY_GUARANTOR);
    storageRemove(LEGACY_INLINE_GUARANTOR);
  }

  function getAddressBlock() {
    /* Priorité historique stricte à #addressBlock, même si un autre sélecteur
       de repli apparaît plus tôt dans le DOM. */
    var historical = document.getElementById('addressBlock');
    if (historical) return historical;
    return safeQuery(currentConfig.selectors.addressBlock);
  }

  /* =====================================================================
     RENDU HISTORIQUE — NE PAS MODIFIER SANS RECETTE VISUELLE EXPLICITE.
     Les trois fonctions ci-dessous reproduisent volontairement le 078
     historique afin que le document imprimé reste strictement identique.
     ===================================================================== */

  function removeGarantLines(scope) {
    try {
      var root = scope || document;
      var addressBlock = (root.querySelector && root.querySelector('#addressBlock')) || getAddressBlock();
      if (addressBlock) {
        var cleaned = addressBlock.innerHTML
          .replace(/<br\s*\/?\s*>\s*(?:<strong>\s*)?Garant\s*:\s*[^<]*/gi, '')
          .replace(/<br\s*\/?\s*>\s*(?:<strong>\s*)?Garants\s*:\s*[^<]*/gi, '')
          .replace(/<br\s*\/?\s*>\s*(?:<strong>\s*)?Ou\s*:\s*[^<]*/gi, '');
        if (cleaned !== addressBlock.innerHTML) addressBlock.innerHTML = cleaned;

        addressBlock.querySelectorAll('p, li, div, span, strong').forEach(function (node) {
          var txt = (node.textContent || '').replace(/\s+/g, ' ').trim();
          if (/^Garant\s*:/i.test(txt) || /^Garants\s*:/i.test(txt) || /^Ou\s*:/i.test(txt)) {
            var wrapper = node.closest('.js-guarantor-line, p, li, div, span') || node;
            if (wrapper && wrapper.parentNode) wrapper.remove();
          }
        });
      }
    } catch (_) {}
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function extractPrintData(record, addressBlock) {
    if (activePrintData) return activePrintData;
    if (!record || !addressBlock) return null;

    var guarantor = normalizePersonName(record.guarantorJoined || '');
    var raw = (addressBlock.innerText || addressBlock.textContent || '').replace(/\u00a0/g, ' ');
    var lines = raw
      .split(/\r?\n/)
      .map(function (line) { return line.replace(/\s+/g, ' ').trim(); })
      .filter(Boolean)
      .filter(function (line) {
        return !/^Garant\s*:/i.test(line)
          && !/^Garants\s*:/i.test(line)
          && !/^Guarantor(?:s)?\s*:/i.test(line)
          && !/^Ou\s*:/i.test(line)
          && !/^Enfant\s*:/i.test(line)
          && !/^Child\s*:/i.test(line);
      });

    var storedChild = normalizePersonName(record.childName || '');
    var normalizedLines = lines.map(normalizePersonName);
    var childName = storedChild;
    var addressLines = lines.slice();

    if (normalizedLines.length > 0 && guarantor && normalizedLines[0] === guarantor) {
      addressLines = lines.slice(1);
    } else if (normalizedLines.length > 0 && (!guarantor || normalizedLines[0] !== guarantor)) {
      addressLines = lines.slice(1);
      if (!childName) childName = normalizedLines[0];
    }

    addressLines = addressLines.filter(function (line) {
      var normalized = normalizePersonName(line);
      return !!normalized && normalized !== guarantor && normalized !== childName;
    });

    activePrintData = {
      borrowerNumber: String(record.borrowerNumber || ''),
      guarantors: Array.isArray(record.guarantors) && record.guarantors.length
        ? uniqueNames(record.guarantors)
        : (guarantor ? [guarantor] : []),
      guarantorJoined: guarantor,
      childName: childName,
      addressLines: addressLines
    };
    return activePrintData;
  }

  function applyHistoricalLayout(record, addressBlock) {
    var data = extractPrintData(record, addressBlock);
    if (!data || !data.guarantorJoined) return false;

    /* STRICTEMENT IDENTIQUE AU 078 HISTORIQUE. */
    var formatted = [data.guarantorJoined]
      .concat(data.addressLines)
      .concat(data.childName ? ['Enfant : ' + data.childName] : []);

    if (!formatted.length) return false;
    var nextHtml = formatted.map(escapeHtml).join('<br>');
    if (addressBlock.dataset.k078AddressHtml === nextHtml && addressBlock.dataset.k078RenderMode === 'historical') return true;

    addressBlock.innerHTML = nextHtml;
    addressBlock.dataset.k078AddressHtml = nextHtml;
    addressBlock.dataset.k078RenderMode = 'historical';
    return true;
  }

  function transformValue(value, mode) {
    var text = String(value == null ? '' : value);
    if (mode === 'upper') return text.toLocaleUpperCase();
    if (mode === 'lower') return text.toLocaleLowerCase();
    return text;
  }

  function joinGuarantors(names, mode) {
    var list = Array.isArray(names) ? names.filter(Boolean) : [];
    if (mode === 'line') return list.join('\n');
    if (mode === 'and') {
      if (list.length <= 1) return list.join('');
      return list.slice(0, -1).join(', ') + localized(' et ', ' and ') + list[list.length - 1];
    }
    if (mode === 'semicolon') return list.join('; ');
    return list.join(', ');
  }

  function templateVariables(data) {
    return {
      GARANTS: joinGuarantors(data.guarantors, 'comma'),
      GARANTS_LIGNES: joinGuarantors(data.guarantors, 'line'),
      GUARANTORS: joinGuarantors(data.guarantors, 'comma'),
      GUARANTORS_LINES: joinGuarantors(data.guarantors, 'line'),
      ADRESSE: data.addressLines.join('\n'),
      ADDRESS: data.addressLines.join('\n'),
      ENFANT: data.childName || '',
      CHILD: data.childName || '',
      ENFANT_LIBELLE: data.childName ? ('Enfant : ' + data.childName) : '',
      CHILD_LABEL: data.childName ? ('Child: ' + data.childName) : '',
      BORROWERNUMBER: data.borrowerNumber || ''
    };
  }

  function expandTemplate(value, data) {
    var vars = templateVariables(data);
    return String(value == null ? '' : value).replace(/\{([A-Z_]+)\}/g, function (_all, key) {
      return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : _all;
    });
  }

  function blockText(block, data) {
    if (block.type === 'guarantors') return joinGuarantors(data.guarantors, block.joinMode);
    if (block.type === 'address') return data.addressLines.join('\n');
    if (block.type === 'child') return data.childName || '';
    if (block.type === 'text') return expandTemplate(localized(block.textFr, block.textEn), data);
    return '';
  }

  function styleText(block) {
    var style = block.style || {};
    var css = [];
    if (style.fontSizePx > 0) css.push('font-size:' + style.fontSizePx + 'px');
    if (style.bold) css.push('font-weight:700');
    if (style.italic) css.push('font-style:italic');
    if (style.underline) css.push('text-decoration:underline');
    if (style.useColor && cleanText(style.color)) css.push('color:' + cleanText(style.color));
    if (style.textAlign && style.textAlign !== 'inherit') css.push('text-align:' + style.textAlign);
    if (style.marginTopPx > 0) css.push('margin-top:' + style.marginTopPx + 'px');
    if (style.marginBottomPx > 0) css.push('margin-bottom:' + style.marginBottomPx + 'px');
    return css.join(';');
  }

  function htmlWithBreaks(value) {
    return escapeHtml(value).replace(/\r?\n/g, '<br>');
  }

  function renderCustomBlock(block, data) {
    if (!block || block.enabled === false) return '';

    if (block.type === 'spacer') {
      return '<div class="pmk078-model-spacer" aria-hidden="true" style="height:' + clampInt(block.spacerHeightPx, 0, 200, 8) + 'px"></div>';
    }

    if (block.type === 'separator') {
      return '<div class="pmk078-model-separator" aria-hidden="true" style="border-top:'
        + clampInt(block.separatorWidthPx, 1, 12, 1) + 'px '
        + escapeHtml(block.separatorStyle || 'solid') + ' '
        + escapeHtml(block.separatorColor || '#ced4da')
        + ';margin:6px 0"></div>';
    }

    var value = blockText(block, data);
    var prefix = expandTemplate(localized(block.prefixFr, block.prefixEn), data);
    var suffix = expandTemplate(localized(block.suffixFr, block.suffixEn), data);
    value = transformValue(value, block.transform);

    if (currentConfig.rendering.skipEmptyBlocks !== false && !cleanText(value)) return '';

    var combined = prefix + value + suffix;
    var css = styleText(block);
    return '<div class="pmk078-model-block pmk078-model-' + escapeHtml(block.type) + '"'
      + (css ? ' style="' + escapeHtml(css) + '"' : '')
      + '>' + htmlWithBreaks(combined) + '</div>';
  }

  function applyCustomRootStyle(addressBlock) {
    var style = currentConfig.rendering.global || {};
    if (style.fontFamily && style.fontFamily !== 'inherit') addressBlock.style.fontFamily = style.fontFamily;
    if (style.fontSizePx > 0) addressBlock.style.fontSize = style.fontSizePx + 'px';
    if (cleanText(style.lineHeight)) addressBlock.style.lineHeight = cleanText(style.lineHeight);
    if (style.useColor && cleanText(style.color)) addressBlock.style.color = cleanText(style.color);
    if (style.textAlign && style.textAlign !== 'inherit') addressBlock.style.textAlign = style.textAlign;
  }

  function applyCustomLayout(record, addressBlock) {
    var data = extractPrintData(record, addressBlock);
    if (!data) return false;

    var blocks = currentConfig.rendering.blocks || [];
    var html = blocks.map(function (block) {
      return renderCustomBlock(block, data);
    }).filter(Boolean).join('');

    if (!html) return false;
    applyCustomRootStyle(addressBlock);

    if (addressBlock.dataset.k078AddressHtml === html && addressBlock.dataset.k078RenderMode === 'custom') return true;
    addressBlock.innerHTML = html;
    addressBlock.dataset.k078AddressHtml = html;
    addressBlock.dataset.k078RenderMode = 'custom';
    return true;
  }

  function applyGuarantorAddressLayout() {
    try {
      if (!pathIs(PAGE_PATHS.printOverdues)) return false;

      var record = activePrintRecord || loadPrintRecord();
      if (!record) return false;
      activePrintRecord = record;

      var guarantor = normalizePersonName(record.guarantorJoined || '');
      if (!guarantor && currentConfig.rendering.mode === 'historical') return false;

      /* Empêcher le JS de la notice de réinjecter "Garant : ...". */
      storageRemove(LEGACY_INLINE_GUARANTOR);

      var addressBlock = getAddressBlock();
      if (!addressBlock) return false;

      if (currentConfig.rendering.mode === 'custom') {
        return applyCustomLayout(record, addressBlock);
      }
      return applyHistoricalLayout(record, addressBlock);
    } catch (_) {
      return false;
    }
  }

  function stopPrintObserver() {
    if (printObserver) {
      try { printObserver.disconnect(); } catch (_) {}
      printObserver = null;
    }
  }

  function startPrintObserver(addressBlock) {
    stopPrintObserver();
    if (!addressBlock) return;

    var scheduled = false;
    printObserver = new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      window.setTimeout(function () {
        scheduled = false;
        removeGarantLines(document);
        applyGuarantorAddressLayout();
      }, 30);
    });

    var container = addressBlock.parentElement || addressBlock;
    printObserver.observe(container, { childList: true, subtree: true, characterData: true });
  }

  function runPrintPage() {
    if (!pathIs(PAGE_PATHS.printOverdues) || !currentConfig.enabled) return;

    activePrintRecord = activePrintRecord || loadPrintRecord();
    removeGarantLines(document);

    var addressBlock = getAddressBlock();
    if (addressBlock) {
      var applied = applyGuarantorAddressLayout();
      startPrintObserver(addressBlock);
      if (applied) {
        /* Le rendu est désormais mémorisé en mémoire dans activePrintRecord ;
           on peut supprimer les données nominatives persistantes. */
        clearStoredRecord(activePrintRecord);
      }
      return;
    }

    waitFor(currentConfig.selectors.addressBlock, 3500).then(function (el) {
      if (!currentConfig.enabled) return;
      removeGarantLines(document);
      var applied = applyGuarantorAddressLayout();
      startPrintObserver(el);
      if (applied) clearStoredRecord(activePrintRecord);
    }).catch(function () {});
  }

  function attachPrintCapture() {
    if (clickCaptureAttached) return;
    clickCaptureAttached = true;

    document.addEventListener('click', function (event) {
      if (!currentConfig.enabled) return;
      var target = event.target && event.target.closest ? event.target.closest(currentConfig.selectors.printCapture) : null;
      if (!target) return;
      capturePrintContext();
    }, true);
  }

  function findKohaPrintMenu() {
    var groups = safeQueryAll('.btn-group');
    for (var i = 0; i < groups.length; i += 1) {
      var group = groups[i];
      var toggle = safeQuery(':scope > button.dropdown-toggle, :scope > a.dropdown-toggle', group);
      var menu = safeQuery(':scope > ul.dropdown-menu, :scope > .dropdown-menu', group);
      if (!toggle || !menu) continue;

      var hasPrintIcon = Boolean(safeQuery('.fa-print, .fa-solid.fa-print, [class*="fa-print"]', toggle));
      var label = String(toggle.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      var looksLikePrint = hasPrintIcon || label.indexOf('imprimer') >= 0 || label.indexOf('print') >= 0;
      if (!looksLikePrint) continue;

      return { group: group, toggle: toggle, menu: menu };
    }
    return null;
  }

  function restorePrintActionPlacement() {
    if (printMenuObserver) {
      try { printMenuObserver.disconnect(); } catch (_) {}
      printMenuObserver = null;
    }

    var placement = printActionPlacement;
    if (!placement || !placement.action) return;

    var action = placement.action;
    try {
      if (placement.originalClassName !== null) action.className = placement.originalClassName;
      else action.removeAttribute('class');
      if (placement.originalStyle !== null) action.setAttribute('style', placement.originalStyle);
      else action.removeAttribute('style');
      delete action.dataset.pmk078OverduesMenu;

      if (placement.originalParent && placement.originalParent.isConnected) {
        if (placement.originalNextSibling && placement.originalNextSibling.parentNode === placement.originalParent) {
          placement.originalParent.insertBefore(action, placement.originalNextSibling);
        } else {
          placement.originalParent.appendChild(action);
        }
      }

      if (placement.createdLi && placement.createdLi.parentNode) placement.createdLi.remove();
      if (placement.originalContainer && placement.originalContainerDisplay !== null) {
        placement.originalContainer.style.display = placement.originalContainerDisplay;
      }
    } catch (_) {}

    printActionPlacement = null;
  }

  function buildFallbackPrintOverduesAction() {
    var borrowerNumber = getBorrowerNumber();
    if (!borrowerNumber) return null;

    var action = document.createElement('a');
    action.id = 'print_overdues';
    action.className = 'dropdown-item';
    action.href = PAGE_PATHS.printOverdues + '?borrowernumber=' + encodeURIComponent(borrowerNumber);
    action.target = 'printwindow';
    action.dataset.pmk078Generated = '1';
    action.dataset.pmk078OverduesMenu = '1';
    action.textContent = localized('Imprimer les retards', 'Print overdues');
    return action;
  }

  function insertPrintActionInKohaMenu(action) {
    if (!action) return false;
    var isGeneratedAction = action.dataset && action.dataset.pmk078Generated === '1';
    if (!action.isConnected && !isGeneratedAction) return false;
    var printMenu = findKohaPrintMenu();
    if (!printMenu || !printMenu.menu) return false;

    if (action.closest && action.closest('.dropdown-menu') === printMenu.menu) {
      action.classList.remove('btn', 'btn-default', 'btn-primary', 'btn-secondary');
      action.classList.add('dropdown-item');
      action.style.removeProperty('display');
      return true;
    }

    if (printActionPlacement && printActionPlacement.action === action && printActionPlacement.createdLi && printActionPlacement.createdLi.isConnected) {
      return true;
    }

    restorePrintActionPlacement();

    var originalParent = action.parentNode;
    var originalNextSibling = action.nextSibling;
    var originalClassName = action.getAttribute('class');
    var originalStyle = action.getAttribute('style');
    var originalContainer = action.closest ? action.closest('.btn-group') : null;
    var originalContainerDisplay = originalContainer ? originalContainer.style.display : null;

    var li = document.createElement('li');
    li.dataset.pmk078PrintOverduesItem = '1';

    var checkin = safeQuery('a.printslip[data-code="checkinslip"], a[data-code="checkinslip"]', printMenu.menu);
    var checkinLi = checkin && checkin.closest ? checkin.closest('li') : null;
    if (checkinLi && checkinLi.parentNode === printMenu.menu) printMenu.menu.insertBefore(li, checkinLi);
    else printMenu.menu.appendChild(li);

    li.appendChild(action);
    action.classList.remove('btn', 'btn-default', 'btn-primary', 'btn-secondary', 'dropdown-toggle');
    action.classList.add('dropdown-item');
    action.style.removeProperty('display');
    action.dataset.pmk078OverduesMenu = '1';

    if (originalContainer && originalContainer !== printMenu.group && originalContainer.children.length === 0) {
      originalContainer.style.display = 'none';
    }

    printActionPlacement = {
      action: action,
      originalParent: originalParent,
      originalNextSibling: originalNextSibling,
      originalClassName: originalClassName,
      originalStyle: originalStyle,
      originalContainer: originalContainer,
      originalContainerDisplay: originalContainerDisplay,
      createdLi: li
    };

    return true;
  }

  function ensurePrintActionInKohaMenu() {
    if (pathIs(PAGE_PATHS.printOverdues)) return;

    if (!currentConfig.enabled || !currentConfig.behavior.integratePrintOverduesInPrintMenu) {
      restorePrintActionPlacement();
      return;
    }

    var place = function () {
      var action = safeQuery(currentConfig.selectors.printAction);

      /* Koha n'affiche pas systématiquement #print_overdues dans la barre
         d'outils (notamment selon version / contexte). Dans ce cas, on recrée
         strictement l'action Koha : même endpoint print_overdues.pl et même
         borrowernumber, puis on l'insère dans le menu Imprimer. */
      if (!action) action = buildFallbackPrintOverduesAction();
      if (!action) return false;

      return insertPrintActionInKohaMenu(action);
    };

    if (place()) return;

    Promise.all([
      waitFor(currentConfig.selectors.printAction, 3500).catch(function () { return null; }),
      waitFor('.btn-group .dropdown-menu', 3500).catch(function () { return null; })
    ]).then(function () {
      if (!currentConfig.enabled || !currentConfig.behavior.integratePrintOverduesInPrintMenu) return;
      place();
    });

    if (!printMenuObserver && document.body && typeof MutationObserver === 'function') {
      printMenuObserver = new MutationObserver(function () {
        if (printActionPlacement && printActionPlacement.createdLi && printActionPlacement.createdLi.isConnected) return;
        if (place()) {
          try { printMenuObserver.disconnect(); } catch (_) {}
          printMenuObserver = null;
        }
      });
      printMenuObserver.observe(document.body, { childList: true, subtree: true });
      window.setTimeout(function () {
        if (printMenuObserver) {
          try { printMenuObserver.disconnect(); } catch (_) {}
          printMenuObserver = null;
        }
      }, 5000);
    }
  }

  function mountContextButton() {
    if (pathIs(PAGE_PATHS.printOverdues)) return;
    if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== 'function') return;
    if (!window.PMKConfig.canOpenAdmin || !window.PMKConfig.canOpenAdmin()) return;
    if (document.getElementById('pmk078-config-host')) return;

    var toolbar = document.getElementById('toolbar') || safeQuery('.btn-toolbar');
    if (!toolbar) return;

    var host = document.createElement('span');
    host.id = 'pmk078-config-host';
    host.style.display = 'inline-flex';
    host.style.alignItems = 'center';
    host.style.marginLeft = '.25rem';
    toolbar.appendChild(host);

    try {
      window.PMKConfig.mountContextButton({
        moduleId: MODULE_ID,
        anchor: host,
        contextKey: 'overdues-print',
        context: { sectionId: 'activation', pagePath: window.location.pathname }
      });
    } catch (_) {}
  }

  function applyConfig() {
    if (!isSupportedPage()) return;

    attachPrintCapture();

    if (pathIs(PAGE_PATHS.printOverdues)) {
      if (currentConfig.enabled) runPrintPage();
      else stopPrintObserver();
      return;
    }

    ensurePrintActionInKohaMenu();
    mountContextButton();
  }

  function blockFromPath(rootObject, fieldPath) {
    if (!rootObject || !Array.isArray(rootObject.rendering && rootObject.rendering.blocks) || !Array.isArray(fieldPath)) return null;
    var index = fieldPath.indexOf('blocks');
    if (index < 0 || !Number.isInteger(Number(fieldPath[index + 1]))) return null;
    return rootObject.rendering.blocks[Number(fieldPath[index + 1])] || null;
  }

  function newPrintBlock() {
    return printBlock('block-' + Date.now().toString(36), 'text', localized('Nouveau bloc', 'New block'), {
      textFr: 'Nouveau texte',
      textEn: 'New text',
      style: defaultBlockStyle()
    });
  }


  function moduleDefinition() {
    function blockWhen(type) {
      return function (rootObject, fieldPath) {
        var block = blockFromPath(rootObject, fieldPath);
        return Boolean(block && block.type === type);
      };
    }

    function dataBlockWhen(rootObject, fieldPath) {
      var block = blockFromPath(rootObject, fieldPath);
      return Boolean(block && ['guarantors', 'address', 'child', 'text'].indexOf(block.type) >= 0);
    }

    function customMode(rootObject) {
      return rootObject && rootObject.rendering && rootObject.rendering.mode === 'custom';
    }

    var commonBlockFields = [
      { key: 'enabled', type: 'boolean', label: { fr: 'Bloc actif', en: 'Block enabled' } },
      { key: 'label', type: 'text', label: { fr: 'Nom du bloc dans PMK', en: 'Block name in PMK' } },
      {
        key: 'type',
        type: 'select',
        refreshOnChange: true,
        label: { fr: 'Contenu du bloc', en: 'Block content' },
        options: [
          { value: 'guarantors', label: { fr: 'Garant(s)', en: 'Guarantor(s)' } },
          { value: 'address', label: { fr: 'Adresse', en: 'Address' } },
          { value: 'child', label: { fr: 'Nom de l’enfant', en: 'Child name' } },
          { value: 'text', label: { fr: 'Texte libre / modèle avec variables', en: 'Free text / variable template' } },
          { value: 'spacer', label: { fr: 'Espace vertical', en: 'Vertical spacer' } },
          { value: 'separator', label: { fr: 'Ligne de séparation', en: 'Separator line' } }
        ]
      },
      {
        key: 'joinMode',
        type: 'select',
        when: blockWhen('guarantors'),
        label: { fr: 'Séparation entre plusieurs garants', en: 'Separator between multiple guarantors' },
        options: [
          { value: 'comma', label: { fr: 'Virgule', en: 'Comma' } },
          { value: 'line', label: { fr: 'Un garant par ligne', en: 'One guarantor per line' } },
          { value: 'and', label: { fr: '« et » / « and »', en: '“and”' } },
          { value: 'semicolon', label: { fr: 'Point-virgule', en: 'Semicolon' } }
        ]
      },
      {
        key: 'textFr',
        type: 'textarea',
        when: blockWhen('text'),
        label: { fr: 'Texte / modèle — français', en: 'Text / template — French' },
        help: {
          fr: 'Variables disponibles : {GARANTS}, {GARANTS_LIGNES}, {ADRESSE}, {ENFANT}, {ENFANT_LIBELLE}, {BORROWERNUMBER}. Les retours à la ligne sont conservés.',
          en: 'Available variables: {GUARANTORS}, {GUARANTORS_LINES}, {ADDRESS}, {CHILD}, {CHILD_LABEL}, {BORROWERNUMBER}. Line breaks are preserved.'
        }
      },
      {
        key: 'textEn',
        type: 'textarea',
        when: blockWhen('text'),
        label: { fr: 'Texte / modèle — anglais', en: 'Text / template — English' }
      },
      { key: 'prefixFr', type: 'text', when: dataBlockWhen, label: { fr: 'Préfixe — français', en: 'Prefix — French' } },
      { key: 'prefixEn', type: 'text', when: dataBlockWhen, label: { fr: 'Préfixe — anglais', en: 'Prefix — English' } },
      { key: 'suffixFr', type: 'text', when: dataBlockWhen, label: { fr: 'Suffixe — français', en: 'Suffix — French' } },
      { key: 'suffixEn', type: 'text', when: dataBlockWhen, label: { fr: 'Suffixe — anglais', en: 'Suffix — English' } },
      {
        key: 'transform',
        type: 'select',
        when: dataBlockWhen,
        label: { fr: 'Casse du texte', en: 'Text case' },
        options: [
          { value: 'none', label: { fr: 'Conserver', en: 'Keep as is' } },
          { value: 'upper', label: { fr: 'MAJUSCULES', en: 'UPPERCASE' } },
          { value: 'lower', label: { fr: 'minuscules', en: 'lowercase' } }
        ]
      },
      { key: 'spacerHeightPx', type: 'number', min: 0, max: 200, when: blockWhen('spacer'), label: { fr: 'Hauteur de l’espace (px)', en: 'Spacer height (px)' } },
      { key: 'separatorWidthPx', type: 'number', min: 1, max: 12, when: blockWhen('separator'), label: { fr: 'Épaisseur de la ligne (px)', en: 'Line width (px)' } },
      {
        key: 'separatorStyle',
        type: 'select',
        when: blockWhen('separator'),
        label: { fr: 'Style de ligne', en: 'Line style' },
        options: [
          { value: 'solid', label: { fr: 'Continue', en: 'Solid' } },
          { value: 'dashed', label: { fr: 'Tirets', en: 'Dashed' } },
          { value: 'dotted', label: { fr: 'Pointillés', en: 'Dotted' } },
          { value: 'double', label: { fr: 'Double', en: 'Double' } }
        ]
      },
      { key: 'separatorColor', type: 'color', when: blockWhen('separator'), label: { fr: 'Couleur de la ligne', en: 'Line color' } },
      { key: 'style.fontSizePx', type: 'number', min: 0, max: 96, when: dataBlockWhen, label: { fr: 'Taille du texte (px, 0 = héritée)', en: 'Text size (px, 0 = inherited)' } },
      { key: 'style.bold', type: 'boolean', when: dataBlockWhen, label: { fr: 'Gras', en: 'Bold' } },
      { key: 'style.italic', type: 'boolean', when: dataBlockWhen, label: { fr: 'Italique', en: 'Italic' } },
      { key: 'style.underline', type: 'boolean', when: dataBlockWhen, label: { fr: 'Souligné', en: 'Underline' } },
      { key: 'style.useColor', type: 'boolean', refreshOnChange: true, when: dataBlockWhen, label: { fr: 'Personnaliser la couleur', en: 'Customize color' } },
      {
        key: 'style.color',
        type: 'color',
        when: function (rootObject, fieldPath) {
          var block = blockFromPath(rootObject, fieldPath);
          return Boolean(block && ['guarantors', 'address', 'child', 'text'].indexOf(block.type) >= 0 && block.style && block.style.useColor === true);
        },
        label: { fr: 'Couleur du texte', en: 'Text color' }
      },
      {
        key: 'style.textAlign',
        type: 'select',
        when: dataBlockWhen,
        label: { fr: 'Alignement', en: 'Alignment' },
        options: [
          { value: 'inherit', label: { fr: 'Hérité', en: 'Inherited' } },
          { value: 'left', label: { fr: 'Gauche', en: 'Left' } },
          { value: 'center', label: { fr: 'Centré', en: 'Centered' } },
          { value: 'right', label: { fr: 'Droite', en: 'Right' } },
          { value: 'justify', label: { fr: 'Justifié', en: 'Justified' } }
        ]
      },
      { key: 'style.marginTopPx', type: 'number', min: 0, max: 200, when: dataBlockWhen, label: { fr: 'Marge avant (px)', en: 'Top margin (px)' } },
      { key: 'style.marginBottomPx', type: 'number', min: 0, max: 200, when: dataBlockWhen, label: { fr: 'Marge après (px)', en: 'Bottom margin (px)' } }
    ];

    return {
      id: MODULE_ID,
      schemaVersion: 3,
      name: {
        fr: 'Impression des retards / garant',
        en: 'Overdues printing / guarantor'
      },
      description: {
        fr: 'Prépare l’impression des retards pour les lecteurs avec garant. Le modèle historique reste disponible, et un constructeur complet permet de composer un modèle personnalisé sans code.',
        en: 'Prepares overdue printing for patrons with a guarantor. The historical model remains available, while a full builder can create a custom model without code.'
      },
      category: {
        fr: 'Adhérents / impression',
        en: 'Patrons / printing'
      },
      supportedPages: ['circ.circulation', 'members.moremember', 'members.print_overdues'],
      prerequisites: [],
      dependencies: [],
      defaults: DEFAULT_CONFIG,
      normalize: normalizeConfig,
      validate: function (config) {
        var cfg = normalizeConfig(config);
        if (cfg.rendering.mode === 'custom') {
          var enabled = (cfg.rendering.blocks || []).filter(function (block) { return block && block.enabled !== false; });
          if (!enabled.length) {
            return { ok: false, message: localized('Le modèle personnalisé doit contenir au moins un bloc actif.', 'The custom model must contain at least one enabled block.') };
          }
        }
        var selectorKeys = ['patronInformation', 'childNameLegacy', 'morememberHeading', 'guarantorLabel', 'printAction', 'printCapture', 'addressBlock'];
        for (var i = 0; i < selectorKeys.length; i += 1) {
          var selector = cleanText(cfg.selectors[selectorKeys[i]]);
          if (!selector) return { ok: false, message: localized('Un sélecteur technique du module 078 est vide.', 'A technical selector in module 078 is empty.') };
          try { document.querySelector(selector); } catch (_) {
            return { ok: false, message: localized('Un sélecteur technique du module 078 est invalide.', 'A technical selector in module 078 is invalid.') };
          }
        }
        return { ok: true };
      },
      schema: [
        {
          type: 'section',
          id: 'activation',
          label: { fr: 'Activation', en: 'Activation' },
          fields: [
            { key: 'enabled', type: 'boolean', label: { fr: 'Activer l’impression des retards / garant', en: 'Enable overdues / guarantor printing' } },
            {
              key: 'behavior.integratePrintOverduesInPrintMenu',
              type: 'boolean',
              label: { fr: 'Intégrer « Imprimer les retards » dans le menu Imprimer de Koha', en: 'Integrate “Print overdues” into Koha’s Print menu' },
              help: {
                fr: 'Activé par défaut : si Koha fournit #print_overdues, l’action est déplacée dans le menu Imprimer. Si elle est absente, PMK recrée l’action Koha équivalente vers print_overdues.pl pour le lecteur courant. Elle est placée juste avant le ticket de retour.',
                en: 'Enabled by default: when Koha provides #print_overdues, the action is moved into the Print menu. If it is absent, PMK recreates the equivalent Koha action to print_overdues.pl for the current patron. It is placed just before the check-in slip.'
              }
            }
          ]
        },
        {
          type: 'section',
          id: 'model',
          label: { fr: 'Modèle d’impression', en: 'Print model' },
          description: {
            fr: 'Le mode Historique garantit le rendu actuel. Le mode Personnalisé active le constructeur ci-dessous.',
            en: 'Historical mode guarantees the current output. Custom mode enables the builder below.'
          },
          fields: [
            {
              key: 'rendering.mode',
              type: 'select',
              refreshOnChange: true,
              label: { fr: 'Mode d’impression', en: 'Print mode' },
              options: [
                { value: 'historical', label: { fr: 'Historique — rendu 078 strict', en: 'Historical — strict 078 output' } },
                { value: 'custom', label: { fr: 'Personnalisé — constructeur de modèle', en: 'Custom — model builder' } }
              ]
            },
            {
              key: 'rendering.skipEmptyBlocks',
              type: 'boolean',
              when: customMode,
              label: { fr: 'Ignorer automatiquement les blocs sans valeur', en: 'Automatically skip blocks with no value' }
            },
            {
              type: 'visualPreview',
              when: customMode,
              label: { fr: 'Aperçu du courrier', en: 'Letter preview' },
              help: {
                fr: 'Aperçu WYSIWYG mis à jour depuis le brouillon avec des données fictives. Il permet de régler l’ordre, les textes, marges, couleurs et alignements sans imprimer.',
                en: 'WYSIWYG preview updated from the draft with sample data. Use it to adjust order, text, margins, colors and alignment without printing.'
              }
            },
            {
              key: 'rendering.blocks',
              type: 'repeater',
              when: customMode,
              label: { fr: 'Blocs du modèle', en: 'Model blocks' },
              addLabel: { fr: 'Ajouter un bloc', en: 'Add block' },
              emptyLabel: { fr: 'Aucun bloc : ajoutez au moins un élément au modèle.', en: 'No blocks: add at least one element to the model.' },
              reorder: true,
              newItem: newPrintBlock,
              liveTitleKey: 'label',
              itemTitle: function (item, index) {
                return cleanText(item && item.label) || localized('Bloc ', 'Block ') + (index + 1);
              },
              fields: commonBlockFields
            }
          ]
        },
        {
          type: 'section',
          id: 'global-style',
          label: { fr: 'Style global du modèle personnalisé', en: 'Custom model global style' },
          when: customMode,
          fields: [
            {
              key: 'rendering.global.fontFamily',
              type: 'select',
              when: customMode,
              label: { fr: 'Police', en: 'Font' },
              options: [
                { value: 'inherit', label: { fr: 'Police Koha / notice', en: 'Koha / notice font' } },
                { value: 'Arial, sans-serif', label: { fr: 'Arial', en: 'Arial' } },
                { value: 'Verdana, sans-serif', label: { fr: 'Verdana', en: 'Verdana' } },
                { value: 'Georgia, serif', label: { fr: 'Georgia', en: 'Georgia' } },
                { value: 'Times New Roman, serif', label: { fr: 'Times New Roman', en: 'Times New Roman' } },
                { value: 'monospace', label: { fr: 'Monospace', en: 'Monospace' } }
              ]
            },
            { key: 'rendering.global.fontSizePx', type: 'number', min: 0, max: 96, when: customMode, label: { fr: 'Taille générale (px, 0 = héritée)', en: 'Global size (px, 0 = inherited)' } },
            { key: 'rendering.global.lineHeight', type: 'text', when: customMode, label: { fr: 'Interligne (ex. 1.3 ou 18px)', en: 'Line height (e.g. 1.3 or 18px)' } },
            {
              key: 'rendering.global.textAlign',
              type: 'select',
              when: customMode,
              label: { fr: 'Alignement général', en: 'Global alignment' },
              options: [
                { value: 'inherit', label: { fr: 'Hérité', en: 'Inherited' } },
                { value: 'left', label: { fr: 'Gauche', en: 'Left' } },
                { value: 'center', label: { fr: 'Centré', en: 'Centered' } },
                { value: 'right', label: { fr: 'Droite', en: 'Right' } },
                { value: 'justify', label: { fr: 'Justifié', en: 'Justified' } }
              ]
            },
            { key: 'rendering.global.useColor', type: 'boolean', refreshOnChange: true, when: customMode, label: { fr: 'Personnaliser la couleur générale', en: 'Customize global color' } },
            {
              key: 'rendering.global.color',
              type: 'color',
              when: function (rootObject) { return Boolean(customMode(rootObject) && rootObject.rendering.global.useColor === true); },
              label: { fr: 'Couleur générale', en: 'Global color' }
            }
          ]
        },
        {
          type: 'section',
          id: 'portability',
          label: { fr: 'Compatibilité et portabilité', en: 'Compatibility and portability' },
          fields: [
            { key: 'selectors.patronInformation', type: 'text', advanced: true, label: { fr: 'Bloc informations lecteur', en: 'Patron information block' } },
            { key: 'selectors.childNameLegacy', type: 'text', advanced: true, label: { fr: 'Sélecteurs historiques du nom enfant', en: 'Legacy child-name selectors' } },
            { key: 'selectors.morememberHeading', type: 'text', advanced: true, label: { fr: 'Titre lecteur sur moremember.pl', en: 'Patron heading on moremember.pl' } },
            { key: 'selectors.guarantorLabel', type: 'text', advanced: true, label: { fr: 'Libellé de relation garant', en: 'Guarantor relationship label' } },
            { key: 'selectors.printAction', type: 'text', advanced: true, label: { fr: 'Action Koha Imprimer les retards', en: 'Koha Print overdues action' } },
            { key: 'selectors.printCapture', type: 'text', advanced: true, label: { fr: 'Actions déclenchant la capture', en: 'Actions triggering capture' } },
            { key: 'selectors.addressBlock', type: 'text', advanced: true, label: { fr: 'Zone adresse dans OVERDUES_SLIP', en: 'Address area in OVERDUES_SLIP' } },
            { key: 'behavior.storageTtlSeconds', type: 'number', advanced: true, min: 30, max: 3600, label: { fr: 'Durée maximale des données temporaires (secondes)', en: 'Maximum temporary data lifetime (seconds)' } }
          ]
        }
      ],
      focusContext: function (main, context) {
        if (!main) return;
        var wanted = context && context.sectionId ? context.sectionId : 'activation';
        var section = main.querySelector('[data-pmk-section-id="' + wanted + '"]')
          || main.querySelector('[data-pmk-section-id="activation"]');
        if (!section) return;
        window.setTimeout(function () {
          section.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }, 0);
      }
    };
  }

  function registerVisualEditor() {
    if (!window.PMKConfig || !window.PMKConfig.visualEditor || typeof window.PMKConfig.visualEditor.register !== 'function') return false;
    try {
      window.PMKConfig.visualEditor.register(MODULE_ID, {
        capabilities: { inlinePreview: true },
        renderPreview: function (context) {
          var cfg = normalizeConfig(context && context.rootObject ? context.rootObject : DEFAULT_CONFIG);
          var paper = document.createElement('div');
          paper.className = 'pmk078-wysiwyg-preview';
          paper.style.background = '#fff';
          paper.style.color = '#212529';
          paper.style.border = '1px solid #cfd6dd';
          paper.style.borderRadius = '4px';
          paper.style.boxShadow = '0 2px 8px rgba(0,0,0,.08)';
          paper.style.padding = '22px 26px';
          paper.style.minHeight = '180px';
          paper.style.maxWidth = '680px';
          paper.style.margin = '0 auto';
          paper.style.boxSizing = 'border-box';

          var sample = {
            guarantors: ['Jean DUPONT', 'Marie DUPONT'],
            guarantorJoined: 'Jean DUPONT, Marie DUPONT',
            addressLines: ['12 rue des Médiathèques', '83300 Draguignan'],
            childName: 'Paul DUPONT',
            borrowerNumber: '12345'
          };

          if (cfg.rendering.mode !== 'custom') {
            paper.innerHTML = '<div style="font-weight:700;margin-bottom:8px">Jean DUPONT, Marie DUPONT</div>' +
              '<div>12 rue des Médiathèques</div><div>83300 Draguignan</div><div style="margin-top:8px">Enfant : Paul DUPONT</div>';
            return paper;
          }

          var previous = currentConfig;
          try {
            currentConfig = cfg;
            var globalStyle = cfg.rendering.global || {};
            if (globalStyle.fontFamily && globalStyle.fontFamily !== 'inherit') paper.style.fontFamily = globalStyle.fontFamily;
            if (globalStyle.fontSizePx > 0) paper.style.fontSize = globalStyle.fontSizePx + 'px';
            if (cleanText(globalStyle.lineHeight)) paper.style.lineHeight = cleanText(globalStyle.lineHeight);
            if (globalStyle.useColor && cleanText(globalStyle.color)) paper.style.color = cleanText(globalStyle.color);
            if (globalStyle.textAlign && globalStyle.textAlign !== 'inherit') paper.style.textAlign = globalStyle.textAlign;
            var html = (cfg.rendering.blocks || []).map(function (block) { return renderCustomBlock(block, sample); }).filter(Boolean).join('');
            paper.innerHTML = html || '<div style="color:#6c757d;text-align:center">Aucun bloc actif à afficher.</div>';
          } finally {
            currentConfig = previous;
          }
          return paper;
        }
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  function registerModuleDefinition() {
    if (moduleRegistered) return true;
    if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== 'function') return false;
    try {
      window.PMKConfig.registerModule(moduleDefinition());
      registerVisualEditor();
      moduleRegistered = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadPMKConfig() {
    if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== 'function') return false;

    window.PMKConfig.getConfig(MODULE_ID).then(function (config) {
      currentConfig = normalizeConfig(config || {});
      applyConfig();
    }).catch(function () {
      currentConfig = clone(DEFAULT_CONFIG);
      applyConfig();
    });

    if (!subscribed && typeof window.PMKConfig.subscribe === 'function') {
      subscribed = true;
      window.PMKConfig.subscribe(MODULE_ID, function (config) {
        currentConfig = normalizeConfig(config || {});
        applyConfig();
      });
    }
    return true;
  }

  function boot() {
    registerModuleDefinition();

    if (!isSupportedPage()) return;

    /* Démarrage immédiat avec le mode historique : indispensable sur
       print_overdues.pl, qui peut déclencher l'impression très rapidement. */
    currentConfig = clone(DEFAULT_CONFIG);
    purgeExpiredStoredData();
    applyConfig();
    loadPMKConfig();
  }

  /* Auto-enregistrement PMK même si le socle est chargé après le module. */
  if (!registerModuleDefinition()) {
    window.addEventListener('pmk:config-ready', function () {
      registerModuleDefinition();
      registerVisualEditor();
      if (isSupportedPage()) loadPMKConfig();
    }, { once: true });
  }

  /* Exécution immédiate comme le script historique. Sur une page encore en
     construction, waitFor() prend le relais pour les éléments tardifs. */
  boot();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      registerModuleDefinition();
      mountContextButton();
      ensurePrintActionInKohaMenu();
    }, { once: true });
  }
})();

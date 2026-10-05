/*
 Nom du fichier: 075-advanced-search-sidebar.js
 Version: 2.1
 Date de dernière modification: 2026-09-08
 Auteur: Michael Mundet / refonte V2
 Description:
   Constructeur de recherche avancée pour l'interface professionnelle Koha.
   - Ouverture via window.toggleAdvancedSearchSidebar() / événement koha:toggleAdvancedSearch
   - Ajout manuel de critères
   - ALT + clic intelligent avec reconnaissance fine des zones Koha et personnalisées
   - ET / OU / SAUF entre critères
   - Mode expression exacte pour les principaux champs texte
   - Listes Koha (sites, types, localisations, collections) chargées à la demande
   - Arborescence 099 chargée à la demande depuis la même source Firebase que le script 122
   - Mémoire locale, copie du lien, raccourcis clavier
   - Aucun appel catalogue pendant la saisie et aucune recherche parallèle
*/

(function () {
  'use strict';

  if (window.__kohaAdvancedSearchSidebarV2) return;
  window.__kohaAdvancedSearchSidebarV2 = true;

  const path = window.location.pathname || '';
  const href = window.location.href || '';
  if (/slip|login|print/i.test(path) || /slip|login|print/i.test(href)) return;

  const CONFIG = {
    storageKey: 'kohaAdvancedSearch.v2',
    legacyStorageKey: 'sidebarSearch',
    nativeListsCacheKey: 'kohaAdvancedSearch.nativeLists.v2',
    searchPath: '/cgi-bin/koha/catalogue/search.pl',
    maxTerms: 20,
    defaultCount: 25,
    seriesIndex: 'index-title-serie', // conservé pour compatibilité avec ton installation
    firebase: {
      apiKey: 'YOUR_FIREBASE_APIKEY',
      authDomain: 'YOUR_FIREBASE_AUTHDOMAIN',
      projectId: 'YOUR_FIREBASE_PROJECTID',
      storageBucket: 'YOUR_FIREBASE_STORAGEBUCKET',
      messagingSenderId: 'YOUR_FIREBASE_MESSAGINGSENDERID',
      appId: 'YOUR_FIREBASE_APPID'
    }
  };

  const FIELDS = [
    { group: 'Notice', index: 'kw', label: 'Général', type: 'text', exactIndex: 'kw,phr' },
    { group: 'Notice', index: 'ti', label: 'Titre', type: 'text', exactIndex: 'ti,phr' },
    { group: 'Notice', index: CONFIG.seriesIndex, label: 'Titre de série', type: 'text' },
    { group: 'Notice', index: 'au', label: 'Auteur', type: 'text', exactIndex: 'au,phr' },
    { group: 'Notice', index: 'su', label: 'Sujet / thème 6XX', type: 'text', exactIndex: 'su,phr' },
    { group: 'Notice', index: 'ab', label: 'Résumé', type: 'text' },

    { group: 'Identification', index: 'nb', label: 'ISBN', type: 'text' },
    { group: 'Identification', index: 'ns', label: 'ISSN', type: 'text' },
    { group: 'Identification', index: 'bc', label: 'Code-barres', type: 'text' },
    { group: 'Identification', index: 'callnum', label: 'Cote', type: 'text' },

    { group: 'Exemplaires', index: 'branch', label: 'Site propriétaire', type: 'native-select', source: 'branches' },
    { group: 'Exemplaires', index: 'holdingbranch', label: 'Site actuel', type: 'native-select', source: 'branches' },
    { group: 'Exemplaires', index: 'mc-itype', label: 'Type de document', type: 'native-select', source: 'itemtypes' },
    { group: 'Exemplaires', index: 'loc', label: 'Localisation', type: 'native-select', source: 'locations' },
    { group: 'Exemplaires', index: 'ccode', label: 'Code collection', type: 'native-select', source: 'ccodes' },

    { group: 'Indexation 099', index: 'f099a', label: 'Domaine acquisition — 099$a', type: 'tree099', level: 'a' },
    { group: 'Indexation 099', index: 'f099b', label: 'Sous-domaine acquisition — 099$b', type: 'tree099', level: 'b' },
    { group: 'Indexation 099', index: 'f099e', label: 'Thème — 099$e', type: 'tree099', level: 'e' },
    { group: 'Indexation 099', index: 'f099f', label: 'Sujet — 099$f', type: 'tree099', level: 'f' }
  ];

  const FIELD_BY_INDEX = new Map(FIELDS.map(f => [f.index, f]));
  const OPERATORS = [
    { value: 'AND', label: 'ET' },
    { value: 'OR', label: 'OU' },
    { value: 'NOT', label: 'SAUF' }
  ];

  const state = {
    terms: [],
    remember: true,
    clearAfterLaunch: false,
    nativeLists: null,
    nativeListsStatus: 'idle', // idle | loading | ready | failed
    tree099: null,
    tree099Status: 'idle',
    rowSeq: 0
  };

  let sidebar = null;
  let termsContainer = null;
  let summaryEl = null;
  let toastEl = null;
  let rememberCheckbox = null;
  let clearAfterCheckbox = null;
  let altClickBound = false;

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeKey(value) {
    return normalizeText(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function uid() {
    state.rowSeq += 1;
    return 'kas-' + Date.now().toString(36) + '-' + state.rowSeq.toString(36);
  }

  function getField(index) {
    return FIELD_BY_INDEX.get(index) || FIELD_BY_INDEX.get('kw');
  }

  function escapeQuoted(value) {
    return String(value || '').replace(/"/g, '\\"');
  }

  function isSelectableField(field) {
    return field && (field.type === 'native-select' || field.type === 'tree099');
  }

  function createElement(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }

  function injectStyles() {
    if (document.getElementById('koha-advanced-search-v2-style')) return;

    const style = document.createElement('style');
    style.id = 'koha-advanced-search-v2-style';
    style.textContent = `
      #kohaAdvancedSearchSidebar,
      #kohaAdvancedSearchSidebar * { box-sizing: border-box; }

      #kohaAdvancedSearchSidebar {
        --kas-green: #006d5b;
        --kas-green-dark: #005448;
        --kas-green-soft: #e9f5f2;
        --kas-border: #d5dddb;
        --kas-text: #253238;
        --kas-muted: #66757b;
        --kas-bg: #f7f9f9;
        position: fixed;
        inset: 0 auto 0 0;
        width: min(540px, 100vw);
        height: 100vh;
        background: #fff;
        border-right: 1px solid var(--kas-border);
        box-shadow: 10px 0 28px rgba(0,0,0,.16);
        z-index: 100050;
        transform: translateX(-105%);
        transition: transform .22s ease;
        color: var(--kas-text);
        font-family: inherit;
        display: flex;
        flex-direction: column;
      }

      #kohaAdvancedSearchSidebar.open { transform: translateX(0); }

      #kohaAdvancedSearchSidebar .kas-header {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 66px;
        padding: 14px 16px;
        background: var(--kas-green);
        color: #fff;
        flex: 0 0 auto;
      }

      #kohaAdvancedSearchSidebar .kas-title-wrap { flex: 1; min-width: 0; }
      #kohaAdvancedSearchSidebar .kas-title {
        margin: 0;
        color: #fff;
        font-size: 19px;
        font-weight: 700;
        line-height: 1.2;
      }
      #kohaAdvancedSearchSidebar .kas-subtitle {
        margin-top: 3px;
        font-size: 12px;
        opacity: .9;
      }

      #kohaAdvancedSearchSidebar .kas-close {
        width: 34px;
        height: 34px;
        border: 0;
        border-radius: 8px;
        background: rgba(255,255,255,.14);
        color: #fff;
        font-size: 22px;
        line-height: 1;
        cursor: pointer;
      }
      #kohaAdvancedSearchSidebar .kas-close:hover { background: rgba(255,255,255,.24); }

      #kohaAdvancedSearchSidebar .kas-body {
        flex: 1 1 auto;
        overflow-y: auto;
        padding: 14px 16px 18px;
        background: var(--kas-bg);
      }

      #kohaAdvancedSearchSidebar .kas-help {
        display: flex;
        gap: 9px;
        align-items: flex-start;
        padding: 10px 12px;
        margin-bottom: 12px;
        border: 1px solid #cfe3de;
        border-radius: 9px;
        background: var(--kas-green-soft);
        font-size: 12.5px;
        line-height: 1.45;
      }
      #kohaAdvancedSearchSidebar .kas-help strong { color: var(--kas-green-dark); }

      #kohaAdvancedSearchSidebar .kas-empty {
        padding: 20px 14px;
        border: 1px dashed #b7c4c1;
        border-radius: 10px;
        background: #fff;
        text-align: center;
        color: var(--kas-muted);
        font-size: 13px;
      }

      #kohaAdvancedSearchSidebar .kas-term-wrap { margin-bottom: 10px; }
      #kohaAdvancedSearchSidebar .kas-operator-row {
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 3px 0 7px;
      }
      #kohaAdvancedSearchSidebar .kas-operator {
        width: 92px;
        min-height: 30px;
        padding: 3px 24px 3px 8px;
        border: 1px solid #c4cfcd;
        border-radius: 16px;
        background: #fff;
        color: var(--kas-green-dark);
        font-weight: 700;
        text-align: center;
      }

      #kohaAdvancedSearchSidebar .kas-term {
        position: relative;
        padding: 11px;
        border: 1px solid var(--kas-border);
        border-radius: 10px;
        background: #fff;
        box-shadow: 0 1px 2px rgba(0,0,0,.035);
      }

      #kohaAdvancedSearchSidebar .kas-grid {
        display: grid;
        grid-template-columns: minmax(155px, .9fr) minmax(170px, 1.1fr) 32px;
        gap: 8px;
        align-items: center;
      }

      #kohaAdvancedSearchSidebar select,
      #kohaAdvancedSearchSidebar input[type="text"] {
        width: 100%;
        min-height: 36px;
        margin: 0;
        border: 1px solid #bcc9c6;
        border-radius: 6px;
        background: #fff;
        color: var(--kas-text);
        padding: 6px 8px;
        font: inherit;
      }
      #kohaAdvancedSearchSidebar select:focus,
      #kohaAdvancedSearchSidebar input[type="text"]:focus {
        border-color: var(--kas-green);
        outline: none;
        box-shadow: 0 0 0 2px rgba(0,109,91,.12);
      }

      #kohaAdvancedSearchSidebar .kas-remove {
        width: 32px;
        height: 32px;
        padding: 0;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: #8d3f3f;
        cursor: pointer;
        font-size: 18px;
      }
      #kohaAdvancedSearchSidebar .kas-remove:hover { background: #fbeaea; }

      #kohaAdvancedSearchSidebar .kas-term-options {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 8px;
        min-height: 22px;
      }
      #kohaAdvancedSearchSidebar .kas-exact {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin: 0;
        color: var(--kas-muted);
        font-size: 12px;
        cursor: pointer;
      }
      #kohaAdvancedSearchSidebar .kas-exact input { margin: 0; }
      #kohaAdvancedSearchSidebar .kas-data-status {
        color: var(--kas-muted);
        font-size: 11px;
        text-align: right;
      }

      #kohaAdvancedSearchSidebar .kas-toolbar {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        margin-top: 12px;
      }

      #kohaAdvancedSearchSidebar .kas-btn {
        min-height: 38px;
        border: 1px solid transparent;
        border-radius: 7px;
        padding: 7px 11px;
        cursor: pointer;
        font-weight: 600;
      }
      #kohaAdvancedSearchSidebar .kas-btn-primary {
        background: var(--kas-green);
        color: #fff;
      }
      #kohaAdvancedSearchSidebar .kas-btn-primary:hover { background: var(--kas-green-dark); }
      #kohaAdvancedSearchSidebar .kas-btn-secondary {
        border-color: #bdc9c6;
        background: #fff;
        color: var(--kas-text);
      }
      #kohaAdvancedSearchSidebar .kas-btn-secondary:hover { background: #f0f4f3; }
      #kohaAdvancedSearchSidebar .kas-btn-danger-lite {
        border-color: #e0c5c5;
        background: #fff;
        color: #8c3333;
      }

      #kohaAdvancedSearchSidebar .kas-summary-box {
        margin-top: 14px;
        padding: 11px 12px;
        border: 1px solid var(--kas-border);
        border-radius: 9px;
        background: #fff;
      }
      #kohaAdvancedSearchSidebar .kas-summary-title {
        margin-bottom: 7px;
        color: var(--kas-green-dark);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .025em;
      }
      #kohaAdvancedSearchSidebar .kas-summary-line {
        font-size: 12.5px;
        line-height: 1.45;
        word-break: break-word;
      }
      #kohaAdvancedSearchSidebar .kas-summary-op {
        display: inline-block;
        min-width: 42px;
        margin-right: 4px;
        color: var(--kas-green-dark);
        font-weight: 700;
      }
      #kohaAdvancedSearchSidebar .kas-summary-empty { color: var(--kas-muted); font-size: 12px; }

      #kohaAdvancedSearchSidebar .kas-prefs {
        margin-top: 12px;
        display: grid;
        gap: 6px;
        color: var(--kas-muted);
        font-size: 12px;
      }
      #kohaAdvancedSearchSidebar .kas-prefs label {
        display: flex;
        align-items: center;
        gap: 7px;
        margin: 0;
        cursor: pointer;
      }
      #kohaAdvancedSearchSidebar .kas-prefs input { margin: 0; }

      #kohaAdvancedSearchSidebar .kas-footer {
        flex: 0 0 auto;
        padding: 12px 16px;
        border-top: 1px solid var(--kas-border);
        background: #fff;
      }
      #kohaAdvancedSearchSidebar .kas-footer-actions {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 8px;
      }
      #kohaAdvancedSearchSidebar .kas-launch {
        min-height: 42px;
        font-size: 14px;
      }

      #kohaAdvancedSearchToast {
        position: fixed;
        left: 16px;
        bottom: 20px;
        z-index: 100060;
        max-width: min(420px, calc(100vw - 32px));
        padding: 9px 12px;
        border-radius: 7px;
        background: #263238;
        color: #fff;
        box-shadow: 0 5px 18px rgba(0,0,0,.22);
        opacity: 0;
        transform: translateY(10px);
        pointer-events: none;
        transition: opacity .16s ease, transform .16s ease;
        font-size: 12.5px;
      }
      #kohaAdvancedSearchToast.show { opacity: 1; transform: translateY(0); }
      #kohaAdvancedSearchToast.error { background: #8b2f2f; }

      body.koha-advanced-search-open { overflow-x: hidden; }

      @media (max-width: 640px) {
        #kohaAdvancedSearchSidebar { width: 100vw; }
        #kohaAdvancedSearchSidebar .kas-grid {
          grid-template-columns: 1fr 32px;
        }
        #kohaAdvancedSearchSidebar .kas-field { grid-column: 1 / 2; }
        #kohaAdvancedSearchSidebar .kas-value-host { grid-column: 1 / 2; }
        #kohaAdvancedSearchSidebar .kas-remove { grid-column: 2; grid-row: 1 / span 2; align-self: center; }
      }
    `;
    document.head.appendChild(style);
  }

  function buildFieldSelect(term) {
    const select = createElement('select', 'kas-field');
    select.setAttribute('aria-label', 'Champ de recherche');

    const groups = new Map();
    FIELDS.forEach(field => {
      if (!groups.has(field.group)) groups.set(field.group, []);
      groups.get(field.group).push(field);
    });

    groups.forEach((fields, groupLabel) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = groupLabel;
      fields.forEach(field => {
        const option = document.createElement('option');
        option.value = field.index;
        option.textContent = field.label;
        option.selected = field.index === term.index;
        optgroup.appendChild(option);
      });
      select.appendChild(optgroup);
    });

    return select;
  }

  function buildOperatorSelect(term) {
    const select = createElement('select', 'kas-operator');
    select.setAttribute('aria-label', 'Opérateur avec le critère précédent');
    OPERATORS.forEach(op => {
      const option = document.createElement('option');
      option.value = op.value;
      option.textContent = op.label;
      option.selected = op.value === term.operator;
      select.appendChild(option);
    });
    return select;
  }

  function optionLabelFromInput(input) {
    if (!input) return '';
    if (input.tagName === 'OPTION') return normalizeText(input.textContent);

    if (input.id) {
      try {
        const ownerDoc = input.ownerDocument || document;
        const explicit = ownerDoc.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        if (explicit) return normalizeText(explicit.textContent);
      } catch (e) { /* CSS.escape peut manquer sur de vieux navigateurs */ }
    }

    const wrappingLabel = input.closest('label');
    if (wrappingLabel) return normalizeText(wrappingLabel.textContent);

    const parent = input.parentElement;
    if (parent) return normalizeText(parent.textContent);
    return '';
  }

  function cleanLimitValue(value) {
    return normalizeText(value).replace(/^"|"$/g, '');
  }

  function parseNativeListsFromDocument(doc) {
    const lists = { branches: [], itemtypes: [], locations: [], ccodes: [] };
    const seen = {
      branches: new Set(),
      itemtypes: new Set(),
      locations: new Set(),
      ccodes: new Set()
    };

    function push(kind, code, label) {
      code = cleanLimitValue(code);
      label = normalizeText(label) || code;
      if (!code || seen[kind].has(code)) return;
      seen[kind].add(code);
      lists[kind].push({ value: code, label });
    }

    const candidates = doc.querySelectorAll('input[name="limit"], option');
    candidates.forEach(el => {
      const raw = normalizeText(el.value);
      if (!raw) return;
      const label = optionLabelFromInput(el);
      let m;

      if ((m = raw.match(/^branch(?:,phr)?:\s*(.+)$/i))) {
        push('branches', m[1], label);
      } else if ((m = raw.match(/^(?:mc-)?(?:itype|itemtype)(?:,phr)?:\s*(.+)$/i))) {
        push('itemtypes', m[1], label);
      } else if ((m = raw.match(/^(?:location|loc)(?:,phr)?:\s*(.+)$/i))) {
        push('locations', m[1], label);
      } else if ((m = raw.match(/^ccode(?:,phr)?:\s*(.+)$/i))) {
        push('ccodes', m[1], label);
      }
    });

    // Certains templates utilisent des <select> dont les valeurs ne sont pas préfixées.
    doc.querySelectorAll('select').forEach(select => {
      const signature = normalizeKey(`${select.name || ''} ${select.id || ''} ${select.getAttribute('aria-label') || ''}`);
      let kind = '';
      if (/branch|library|bibliothe|site/.test(signature)) kind = 'branches';
      else if (/itype|itemtype|type.*document/.test(signature)) kind = 'itemtypes';
      else if (/location|localisation|\bloc\b/.test(signature)) kind = 'locations';
      else if (/ccode|collection/.test(signature)) kind = 'ccodes';
      if (!kind) return;

      select.querySelectorAll('option').forEach(option => {
        const raw = normalizeText(option.value);
        if (!raw) return;
        if (raw.includes(':')) return; // déjà traité plus haut
        push(kind, raw, option.textContent);
      });
    });

    Object.keys(lists).forEach(kind => {
      lists[kind].sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }));
    });

    return lists;
  }

  function loadNativeListsFromCache() {
    try {
      const raw = sessionStorage.getItem(CONFIG.nativeListsCacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  async function ensureNativeLists() {
    if (state.nativeListsStatus === 'ready' && state.nativeLists) return state.nativeLists;
    if (state.nativeListsStatus === 'loading') {
      return new Promise(resolve => {
        const timer = setInterval(() => {
          if (state.nativeListsStatus !== 'loading') {
            clearInterval(timer);
            resolve(state.nativeLists);
          }
        }, 80);
      });
    }

    const cached = loadNativeListsFromCache();
    if (cached) {
      state.nativeLists = cached;
      state.nativeListsStatus = 'ready';
      return cached;
    }

    state.nativeListsStatus = 'loading';
    renderTerms();

    try {
      const url = new URL(CONFIG.searchPath, location.origin);
      url.searchParams.set('expanded_options', '1');
      const response = await fetch(url.toString(), {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const lists = parseNativeListsFromDocument(doc);
      const total = Object.values(lists).reduce((sum, arr) => sum + arr.length, 0);
      if (!total) throw new Error('Aucune valeur Koha détectée');

      state.nativeLists = lists;
      state.nativeListsStatus = 'ready';
      try { sessionStorage.setItem(CONFIG.nativeListsCacheKey, JSON.stringify(lists)); } catch (e) { /* noop */ }
      renderTerms();
      return lists;
    } catch (e) {
      state.nativeLists = null;
      state.nativeListsStatus = 'failed';
      renderTerms();
      showToast('Listes Koha indisponibles : saisie libre conservée.', true);
      return null;
    }
  }

  function parse099Level(name) {
    const s = normalizeKey(name);
    if (/domaine\s*0?99\$?a/.test(s)) return 'a';
    if (/sous[- ]domaine\s*0?99\$?b/.test(s)) return 'b';
    if (/th[eè]me\s*0?99\$?e/.test(s)) return 'e';
    if (/sujet\s*0?99\$?f/.test(s)) return 'f';
    return '';
  }

  function clean099Label(value) {
    const txt = normalizeText(value);
    if (!txt) return '';
    const m = txt.match(/^(.*?)\s*\((?:Sous[- ]?domaine|Domaine|Th[eè]me(?:s)?|Sujet|Forme\s*\/\s*Genre|Genre(?:\s+litt[eè]raire)?)[^)]*\)/i);
    if (m) return m[1].trim();
    return txt.replace(/\s*\(\d+\)\s*$/, '').trim();
  }

  function treeNodeName(node) {
    return normalizeText(node && (node.name || node.label || ''));
  }

  function treeParentPath(node) {
    return normalizeText(node && (node.parentPath || node.parent || ''));
  }

  function treeFullPath(node) {
    const name = treeNodeName(node);
    const parent = treeParentPath(node);
    return parent ? `${parent}/${name}` : name;
  }

  function build099Index(rows) {
    const activeRows = (Array.isArray(rows) ? rows : []).filter(row => !row.deleted);
    const byPath = new Map();
    activeRows.forEach(row => {
      const full = treeFullPath(row);
      if (full) byPath.set(full, row);
    });

    const reachable = new Set();
    activeRows.forEach(row => {
      if (!treeParentPath(row)) {
        const full = treeFullPath(row);
        if (full) reachable.add(full);
      }
    });

    let changed = true;
    let guard = 0;
    while (changed && guard++ < activeRows.length + 2) {
      changed = false;
      activeRows.forEach(row => {
        const full = treeFullPath(row);
        if (!full || reachable.has(full)) return;
        const parent = treeParentPath(row);
        if (parent && reachable.has(parent) && byPath.has(parent)) {
          reachable.add(full);
          changed = true;
        }
      });
    }

    const rowsOk = activeRows.filter(row => reachable.has(treeFullPath(row)));

    function ancestorAtLevel(node, wantedLevel) {
      let parentPath = treeParentPath(node);
      let loops = 0;
      while (parentPath && loops++ < 100) {
        if (!reachable.has(parentPath)) return null;
        const parent = byPath.get(parentPath);
        if (!parent) return null;
        if (parse099Level(treeNodeName(parent)) === wantedLevel) return parent;
        parentPath = treeParentPath(parent);
      }
      return null;
    }

    const index = {
      a: [],
      b: [],
      e: [],
      f: []
    };

    rowsOk.forEach(row => {
      const level = parse099Level(treeNodeName(row));
      if (!level) return;
      const label = clean099Label(treeNodeName(row));
      if (!label) return;

      const a = level === 'a' ? row : ancestorAtLevel(row, 'a');
      const b = level === 'b' ? row : (level === 'e' || level === 'f' ? ancestorAtLevel(row, 'b') : null);
      const e = level === 'e' ? row : (level === 'f' ? ancestorAtLevel(row, 'e') : null);

      index[level].push({
        value: label,
        label,
        a: a ? clean099Label(treeNodeName(a)) : '',
        b: b ? clean099Label(treeNodeName(b)) : '',
        e: e ? clean099Label(treeNodeName(e)) : ''
      });
    });

    Object.keys(index).forEach(level => {
      const dedup = new Map();
      index[level].forEach(row => {
        const key = [normalizeKey(row.a), normalizeKey(row.b), normalizeKey(row.e), normalizeKey(row.value)].join('|');
        if (!dedup.has(key)) dedup.set(key, row);
      });
      index[level] = [...dedup.values()].sort((x, y) => x.label.localeCompare(y.label, 'fr', { sensitivity: 'base' }));
    });

    return index;
  }

  async function ensure099Tree() {
    if (state.tree099Status === 'ready' && state.tree099) return state.tree099;
    if (state.tree099Status === 'loading') {
      return new Promise(resolve => {
        const timer = setInterval(() => {
          if (state.tree099Status !== 'loading') {
            clearInterval(timer);
            resolve(state.tree099);
          }
        }, 100);
      });
    }

    state.tree099Status = 'loading';
    renderTerms();

    try {
      const appModule = await import('https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js');
      const firestoreModule = await import('https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js');
      const { initializeApp, getApps, getApp } = appModule;
      const { getFirestore, collection, getDocs } = firestoreModule;

      const appName = 'kohaAdvancedSearch099';
      const existing = getApps().find(app => app.name === appName);
      const app = existing || initializeApp(CONFIG.firebase, appName);
      const db = getFirestore(app);
      const snapshot = await getDocs(collection(db, 'treeData'));
      const rows = [];
      snapshot.forEach(docSnap => rows.push({ id: docSnap.id, ...docSnap.data() }));

      const index = build099Index(rows);
      const total = Object.values(index).reduce((sum, arr) => sum + arr.length, 0);
      if (!total) throw new Error('Arborescence 099 vide');

      state.tree099 = index;
      state.tree099Status = 'ready';
      renderTerms();
      return index;
    } catch (e) {
      state.tree099 = null;
      state.tree099Status = 'failed';
      renderTerms();
      showToast('Arborescence 099 indisponible : saisie libre conservée.', true);
      return null;
    }
  }

  function firstTermValue(index) {
    const term = state.terms.find(t => t.index === index && normalizeText(t.value));
    return term ? normalizeText(term.value) : '';
  }

  function optionsFor099(level) {
    if (!state.tree099) return [];
    const rows = state.tree099[level] || [];
    const a = normalizeKey(firstTermValue('f099a'));
    const b = normalizeKey(firstTermValue('f099b'));
    const e = normalizeKey(firstTermValue('f099e'));

    let filtered = rows;
    if (level === 'b' && a) filtered = filtered.filter(row => normalizeKey(row.a) === a);
    if (level === 'e') {
      if (a) filtered = filtered.filter(row => normalizeKey(row.a) === a);
      if (b) filtered = filtered.filter(row => normalizeKey(row.b) === b);
    }
    if (level === 'f') {
      if (a) filtered = filtered.filter(row => normalizeKey(row.a) === a);
      if (b) filtered = filtered.filter(row => normalizeKey(row.b) === b);
      if (e) filtered = filtered.filter(row => normalizeKey(row.e) === e);
    }

    const byValue = new Map();
    filtered.forEach(row => {
      const key = normalizeKey(row.value);
      if (!byValue.has(key)) byValue.set(key, { value: row.value, label: row.label });
    });
    return [...byValue.values()].sort((x, y) => x.label.localeCompare(y.label, 'fr', { sensitivity: 'base' }));
  }

  function makeValueControl(term, field) {
    const host = createElement('div', 'kas-value-host');
    let control;
    let dataStatus = '';

    if (field.type === 'native-select') {
      if (state.nativeListsStatus === 'ready' && state.nativeLists && state.nativeLists[field.source] && state.nativeLists[field.source].length) {
        control = createElement('select', 'kas-value');
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = '— Choisir —';
        control.appendChild(blank);
        state.nativeLists[field.source].forEach(item => {
          const option = document.createElement('option');
          option.value = item.value;
          option.textContent = item.label === item.value ? item.label : `${item.label} (${item.value})`;
          option.selected = item.value === term.value;
          control.appendChild(option);
        });
        if (term.value && ![...control.options].some(o => o.value === term.value)) {
          const custom = document.createElement('option');
          custom.value = term.value;
          custom.textContent = `${term.value} (valeur actuelle)`;
          custom.selected = true;
          control.insertBefore(custom, control.options[1] || null);
        }
      } else {
        control = createElement('input', 'kas-value');
        control.type = 'text';
        control.value = term.value;
        control.placeholder = state.nativeListsStatus === 'loading' ? 'Chargement des valeurs Koha…' : 'Saisir une valeur';
        dataStatus = state.nativeListsStatus === 'loading'
          ? 'Chargement de la liste Koha…'
          : (state.nativeListsStatus === 'failed' ? 'Liste indisponible — saisie libre' : 'Liste chargée à la demande');
        if (state.nativeListsStatus === 'idle') setTimeout(ensureNativeLists, 0);
      }
    } else if (field.type === 'tree099') {
      if (state.tree099Status === 'ready' && state.tree099) {
        const options = optionsFor099(field.level);
        control = createElement('select', 'kas-value');
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = options.length ? '— Choisir —' : '— Aucune valeur avec les critères parents —';
        control.appendChild(blank);
        options.forEach(item => {
          const option = document.createElement('option');
          option.value = item.value;
          option.textContent = item.label;
          option.selected = item.value === term.value;
          control.appendChild(option);
        });
        if (term.value && ![...control.options].some(o => o.value === term.value)) {
          const custom = document.createElement('option');
          custom.value = term.value;
          custom.textContent = `${term.value} (valeur actuelle)`;
          custom.selected = true;
          control.insertBefore(custom, control.options[1] || null);
        }
        dataStatus = field.level === 'a' ? 'Arborescence 099' : 'Filtré par les critères 099 précédents';
      } else {
        control = createElement('input', 'kas-value');
        control.type = 'text';
        control.value = term.value;
        control.placeholder = state.tree099Status === 'loading' ? 'Chargement de l’arborescence 099…' : 'Saisir une valeur';
        dataStatus = state.tree099Status === 'loading'
          ? 'Chargement de l’arborescence 099…'
          : (state.tree099Status === 'failed' ? 'Arborescence indisponible — saisie libre' : 'Arborescence chargée à la demande');
        if (state.tree099Status === 'idle') setTimeout(ensure099Tree, 0);
      }
    } else {
      control = createElement('input', 'kas-value');
      control.type = 'text';
      control.value = term.value;
      control.placeholder = field.index === 'bc' ? 'Scanner ou saisir le code-barres' : 'Saisir la valeur recherchée';
      control.autocomplete = 'off';
    }

    control.setAttribute('aria-label', `Valeur pour ${field.label}`);
    host.appendChild(control);
    return { host, control, dataStatus };
  }

  function renderTerms() {
    if (!termsContainer) return;
    termsContainer.textContent = '';

    if (!state.terms.length) {
      const empty = createElement('div', 'kas-empty');
      const strong = createElement('strong', '', 'Aucun critère pour le moment.');
      empty.appendChild(strong);
      empty.appendChild(document.createElement('br'));
      empty.appendChild(document.createTextNode('Ajoutez un critère ou utilisez ALT + clic sur une information de la page.'));
      termsContainer.appendChild(empty);
      updateSummary();
      return;
    }

    state.terms.forEach((term, index) => {
      const wrap = createElement('div', 'kas-term-wrap');

      if (index > 0) {
        const opRow = createElement('div', 'kas-operator-row');
        const opSelect = buildOperatorSelect(term);
        opSelect.addEventListener('change', () => {
          term.operator = opSelect.value;
          persist();
          updateSummary();
        });
        opRow.appendChild(opSelect);
        wrap.appendChild(opRow);
      }

      const card = createElement('div', 'kas-term');
      card.dataset.termId = term.id;
      const grid = createElement('div', 'kas-grid');

      const fieldSelect = buildFieldSelect(term);
      const field = getField(term.index);
      const valuePack = makeValueControl(term, field);

      const remove = createElement('button', 'kas-remove', '×');
      remove.type = 'button';
      remove.title = 'Supprimer ce critère';
      remove.setAttribute('aria-label', 'Supprimer ce critère');

      grid.appendChild(fieldSelect);
      grid.appendChild(valuePack.host);
      grid.appendChild(remove);
      card.appendChild(grid);

      const optionsRow = createElement('div', 'kas-term-options');
      const exactLabel = createElement('label', 'kas-exact');
      const exactInput = document.createElement('input');
      exactInput.type = 'checkbox';
      exactInput.checked = !!term.exact;
      exactInput.disabled = !field.exactIndex;
      exactLabel.appendChild(exactInput);
      exactLabel.appendChild(document.createTextNode(field.exactIndex ? 'Expression exacte' : 'Expression exacte non applicable'));
      optionsRow.appendChild(exactLabel);

      const status = createElement('span', 'kas-data-status', valuePack.dataStatus || '');
      optionsRow.appendChild(status);
      card.appendChild(optionsRow);
      wrap.appendChild(card);
      termsContainer.appendChild(wrap);

      fieldSelect.addEventListener('change', () => {
        term.index = fieldSelect.value;
        term.exact = false;
        const newField = getField(term.index);
        if (newField.type === 'native-select') ensureNativeLists();
        if (newField.type === 'tree099') ensure099Tree();
        persist();
        renderTerms();
      });

      valuePack.control.addEventListener('change', () => {
        term.value = normalizeText(valuePack.control.value);
        persist();
        if (/^f099[abe]$/.test(term.index)) renderTerms();
        else updateSummary();
      });

      valuePack.control.addEventListener('input', () => {
        term.value = valuePack.control.value;
        persist();
        updateSummary();
      });

      exactInput.addEventListener('change', () => {
        term.exact = exactInput.checked;
        persist();
        updateSummary();
      });

      remove.addEventListener('click', () => {
        removeTerm(term.id);
      });
    });

    updateSummary();
  }

  function labelForOperator(operator) {
    return (OPERATORS.find(op => op.value === operator) || OPERATORS[0]).label;
  }

  function displayValue(term) {
    const value = normalizeText(term.value);
    return term.exact && value ? `« ${value} »` : value;
  }

  function updateSummary() {
    if (!summaryEl) return;
    summaryEl.textContent = '';

    const valid = state.terms.filter(term => normalizeText(term.value));
    if (!valid.length) {
      summaryEl.appendChild(createElement('div', 'kas-summary-empty', 'La recherche apparaîtra ici au fur et à mesure.'));
      return;
    }

    valid.forEach((term, i) => {
      const line = createElement('div', 'kas-summary-line');
      if (i > 0) line.appendChild(createElement('span', 'kas-summary-op', labelForOperator(term.operator)));
      const field = getField(term.index);
      const prefix = i === 0 ? '' : '';
      line.appendChild(document.createTextNode(`${prefix}${field.label} : `));
      const strong = document.createElement('strong');
      strong.textContent = displayValue(term);
      line.appendChild(strong);
      summaryEl.appendChild(line);
    });
  }

  function normalizedComparableTerm(term) {
    return `${term.index}|${normalizeKey(term.value)}|${term.operator || 'AND'}|${term.exact ? '1' : '0'}`;
  }

  function addTerm(value = '', index = 'kw', operator = 'AND', exact = false, opts = {}) {
    if (state.terms.length >= CONFIG.maxTerms) {
      showToast(`Maximum ${CONFIG.maxTerms} critères.`, true);
      return null;
    }

    value = normalizeText(value);
    if (!FIELD_BY_INDEX.has(index)) index = 'kw';

    const candidate = { id: uid(), index, value, operator: operator || 'AND', exact: !!exact };
    if (value && !opts.allowDuplicate) {
      const key = normalizedComparableTerm(candidate);
      if (state.terms.some(t => normalizedComparableTerm(t) === key)) {
        showToast('Ce critère est déjà présent.');
        return null;
      }
    }

    state.terms.push(candidate);
    persist();
    renderTerms();

    if (sidebar && !sidebar.classList.contains('open')) openSidebar();
    if (opts.focus !== false) focusTerm(candidate.id);
    return candidate;
  }

  function removeTerm(id) {
    state.terms = state.terms.filter(term => term.id !== id);
    persist();
    renderTerms();
  }

  function resetSearch() {
    state.terms = [];
    persist();
    renderTerms();
    showToast('Recherche remise à zéro.');
  }

  function focusTerm(id) {
    requestAnimationFrame(() => {
      const card = termsContainer && termsContainer.querySelector(`[data-term-id="${id}"]`);
      const input = card && card.querySelector('.kas-value');
      if (input) {
        input.focus();
        if (input.tagName === 'INPUT') input.select();
      }
    });
  }

  function serializeState() {
    return {
      version: 2,
      remember: state.remember,
      clearAfterLaunch: state.clearAfterLaunch,
      terms: state.terms.map(term => ({
        index: term.index,
        value: term.value,
        operator: term.operator,
        exact: !!term.exact
      }))
    };
  }

  function persist(forceClearIfEmpty = false) {
    try {
      if (!state.remember) {
        localStorage.removeItem(CONFIG.storageKey);
        return;
      }
      if (forceClearIfEmpty && !state.terms.length) {
        localStorage.removeItem(CONFIG.storageKey);
        return;
      }
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(serializeState()));
    } catch (e) { /* stockage indisponible : sans conséquence */ }
  }

  function restoreState() {
    let parsed = null;
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      if (raw) parsed = JSON.parse(raw);
    } catch (e) { /* noop */ }

    if (parsed && parsed.version === 2 && Array.isArray(parsed.terms)) {
      state.remember = parsed.remember !== false;
      state.clearAfterLaunch = !!parsed.clearAfterLaunch;
      state.terms = parsed.terms
        .filter(term => term && FIELD_BY_INDEX.has(term.index))
        .slice(0, CONFIG.maxTerms)
        .map(term => ({
          id: uid(),
          index: term.index,
          value: normalizeText(term.value),
          operator: OPERATORS.some(op => op.value === term.operator) ? term.operator : 'AND',
          exact: !!term.exact
        }));
      return;
    }

    // Migration transparente de l'ancien 075.
    try {
      const legacyRaw = localStorage.getItem(CONFIG.legacyStorageKey);
      if (!legacyRaw) return;
      const legacy = JSON.parse(legacyRaw);
      if (!Array.isArray(legacy)) return;
      const legacySlice = legacy.slice(0, CONFIG.maxTerms);
      state.terms = legacySlice.map((term, i) => ({
        id: uid(),
        index: FIELD_BY_INDEX.has(term.index) ? term.index : 'kw',
        value: normalizeText(term.value),
        // Dans l'ancien 075, l'opérateur était porté par le critère précédent.
        operator: i === 0
          ? 'AND'
          : (OPERATORS.some(op => op.value === legacySlice[i - 1]?.operator) ? legacySlice[i - 1].operator : 'AND'),
        exact: false
      }));
      localStorage.removeItem(CONFIG.legacyStorageKey);
      persist();
    } catch (e) { /* noop */ }
  }

  function effectiveIndex(term) {
    const field = getField(term.index);
    return term.exact && field.exactIndex ? field.exactIndex : term.index;
  }

  function buildSearchUrl() {
    const valid = state.terms.filter(term => normalizeText(term.value));
    if (!valid.length) return null;

    const url = new URL(CONFIG.searchPath, location.origin);
    valid.forEach((term, i) => {
      if (i > 0) url.searchParams.append('op', term.operator || 'AND');
      url.searchParams.append('idx', effectiveIndex(term));
      url.searchParams.append('q', normalizeText(term.value));
    });
    url.searchParams.set('offset', '0');
    url.searchParams.set('sort_by', 'relevance');
    url.searchParams.set('count', String(CONFIG.defaultCount));
    return url.toString();
  }

  function launchSearch() {
    const url = buildSearchUrl();
    if (!url) {
      showToast('Ajoutez au moins un critère renseigné.', true);
      return;
    }

    window.open(url, '_blank', 'noopener');
    if (state.clearAfterLaunch) resetSearch();
  }

  async function copySearchUrl() {
    const url = buildSearchUrl();
    if (!url) {
      showToast('Aucune recherche à copier.', true);
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      showToast('Lien de recherche copié.');
    } catch (e) {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        showToast('Lien de recherche copié.');
      } catch (err) {
        showToast('Impossible de copier automatiquement le lien.', true);
      }
      textarea.remove();
    }
  }

  function showToast(message, error = false) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.toggle('error', !!error);
    toastEl.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  function openSidebar() {
    if (!sidebar) return;
    sidebar.classList.add('open');
    document.body.classList.add('koha-advanced-search-open');
    sidebar.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      const first = sidebar.querySelector('.kas-value, .kas-btn-primary');
      if (first) first.focus({ preventScroll: true });
    });
  }

  function closeSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove('open');
    document.body.classList.remove('koha-advanced-search-open');
    sidebar.setAttribute('aria-hidden', 'true');
  }

  function toggleSidebar() {
    if (!sidebar) return;
    if (sidebar.classList.contains('open')) closeSidebar();
    else openSidebar();
  }

  function selectedTextInsideTarget(target) {
    try {
      const selection = window.getSelection();
      const text = normalizeText(selection && selection.toString());
      if (!text || !selection || !selection.rangeCount) return '';
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
      if (container && (target.contains(container) || container.contains(target))) return text;
      return '';
    } catch (e) {
      return '';
    }
  }

  function pointContext(event) {
    if (!event || typeof event.clientX !== 'number' || typeof event.clientY !== 'number') {
      return { node: null, text: '' };
    }

    try {
      let node = null;

      if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(event.clientX, event.clientY);
        node = pos && pos.offsetNode;
      } else if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(event.clientX, event.clientY);
        node = range && range.startContainer;
      }

      if (!node) return { node: null, text: '' };

      if (node.nodeType === Node.TEXT_NODE) {
        return { node, text: normalizeText(node.nodeValue) };
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        return { node, text: normalizeText(node.textContent) };
      }
    } catch (e) { /* API de caret non disponible : sans conséquence */ }

    return { node: null, text: '' };
  }

  function textWithoutDescendants(element, selectors = []) {
    if (!element) return '';
    try {
      const clone = element.cloneNode(true);
      selectors.forEach(selector => {
        clone.querySelectorAll(selector).forEach(node => node.remove());
      });
      return normalizeText(clone.textContent);
    } catch (e) {
      return normalizeText(element.textContent);
    }
  }

  function cleanDetectedValue(index, value) {
    let text = normalizeText(value);
    if (!text) return '';

    // Éléments décoratifs ajoutés par les personnalisations de la page résultats.
    text = text
      .replace(/\bMON SITE\b/gi, ' ')
      .replace(/\bCopier\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const prefixes = {
      ti: /^(?:Titre|Titre\s*:)\s*/i,
      au: /^(?:Auteur(?:s)?|Auteur du texte)\s*:?\s*/i,
      su: /^(?:Sujet(?:\s*-\s*(?:Indexation|Genre))?|Th[eè]me)\s*:?\s*/i,
      bc: /^(?:Code[- ]?barres?|Barcode)\s*:?\s*/i,
      callnum: /^(?:Cote)\s*:?\s*/i,
      branch: /^(?:Propri[eé]taire|Site propri[eé]taire|Biblioth[eè]que propri[eé]taire)\s*:?\s*/i,
      holdingbranch: /^(?:Site actuel|Biblioth[eè]que actuelle?|Site)\s*:?\s*/i,
      loc: /^(?:Localisation|Location)\s*:?\s*/i,
      ccode: /^(?:Code collection|Collection)\s*:?\s*/i,
      f099a: /^(?:Domaine(?: acquisition)?|099\$a)\s*:?\s*/i,
      f099b: /^(?:Sous[- ]?domaine(?: acquisition)?|099\$b)\s*:?\s*/i,
      f099e: /^(?:Th[eè]me|099\$e)\s*:?\s*/i,
      f099f: /^(?:Sujet|099\$f)\s*:?\s*/i
    };

    if (prefixes[index]) text = text.replace(prefixes[index], '').trim();

    // Les lignes « Collection / Série / Contient » doivent conserver uniquement la valeur.
    if (index === CONFIG.seriesIndex) {
      text = text.replace(/^(?:Collection|S[eé]rie|Contient)\s*:?\s*/i, '').trim();
    }

    return text.replace(/^[\s:;–—-]+|[\s:;–—-]+$/g, '').trim();
  }

  function nativeAliasValue(index, visibleValue) {
    const field = getField(index);
    if (!field || field.type !== 'native-select' || !state.nativeLists) return visibleValue;
    const options = state.nativeLists[field.source] || [];
    const wanted = normalizeKey(visibleValue);
    if (!wanted) return visibleValue;

    let found = options.find(item => normalizeKey(item.value) === wanted);
    if (found) return found.value;

    found = options.find(item => normalizeKey(item.label) === wanted);
    if (found) return found.value;

    // Tolère les libellés de type « Draguignan (DRA) ».
    found = options.find(item => {
      const label = normalizeKey(item.label);
      const decorated = normalizeKey(`${item.label} (${item.value})`);
      return decorated === wanted || label.replace(/\s*\([^)]*\)\s*$/, '') === wanted;
    });

    return found ? found.value : visibleValue;
  }

  async function canonicalizeDetectedValue(index, value) {
    value = cleanDetectedValue(index, value);
    const field = getField(index);
    if (!value || !field || field.type !== 'native-select') return value;

    if (state.nativeListsStatus !== 'ready') {
      await ensureNativeLists();
    }
    return nativeAliasValue(index, value);
  }

  function parseSimpleSearchExpression(rawQuery) {
    const query = normalizeText(rawQuery);
    if (!query || /\s(?:AND|OR|NOT)\s/i.test(query)) return null;

    const m = query.match(/^([a-z0-9_-]+(?:\$[abef])?)\s*:\s*(?:"([^"]+)"|'([^']+)'|(.+))$/i);
    if (!m) return null;

    const rawIndex = normalizeKey(m[1]);
    const value = cleanLimitValue(m[2] || m[3] || m[4] || '');
    const aliases = {
      kw: 'kw',
      ti: 'ti',
      title: 'ti',
      se: CONFIG.seriesIndex,
      serie: CONFIG.seriesIndex,
      series: CONFIG.seriesIndex,
      'title-series': CONFIG.seriesIndex,
      au: 'au',
      author: 'au',
      auteur: 'au',
      su: 'su',
      subject: 'su',
      sujet: 'su',
      nb: 'nb',
      isbn: 'nb',
      ns: 'ns',
      issn: 'ns',
      bc: 'bc',
      barcode: 'bc',
      callnum: 'callnum',
      cote: 'callnum',
      branch: 'branch',
      homebranch: 'branch',
      holdingbranch: 'holdingbranch',
      loc: 'loc',
      location: 'loc',
      ccode: 'ccode',
      itype: 'mc-itype',
      itemtype: 'mc-itype',
      'mc-itype': 'mc-itype',
      '099$a': 'f099a',
      f099a: 'f099a',
      '099$b': 'f099b',
      f099b: 'f099b',
      '099$e': 'f099e',
      f099e: 'f099e',
      '099$f': 'f099f',
      f099f: 'f099f'
    };

    const index = aliases[rawIndex];
    return index && value ? { index, value } : null;
  }

  function indexFromSearchHref(anchor) {
    if (!anchor || !anchor.href) return null;
    try {
      const url = new URL(anchor.href, location.href);
      if (!/\/cgi-bin\/koha\/(?:catalogue\/search|opac-search)\.pl$/i.test(url.pathname)) return null;

      const idx = url.searchParams.get('idx');
      let value = url.searchParams.get('q') || '';
      if (idx) {
        const bare = idx.replace(/,phr$/i, '');
        if (FIELD_BY_INDEX.has(bare)) return { index: bare, value: normalizeText(value) };
        const aliases = {
          se: CONFIG.seriesIndex,
          'title-series': CONFIG.seriesIndex,
          author: 'au',
          subject: 'su',
          isbn: 'nb',
          issn: 'ns',
          barcode: 'bc',
          location: 'loc',
          itype: 'mc-itype',
          itemtype: 'mc-itype',
          homebranch: 'branch'
        };
        if (aliases[bare]) return { index: aliases[bare], value: normalizeText(value) };
      }

      // Plusieurs de tes personnalisations génèrent q=ccode:"..." ou q=callnum:"..."
      // sans paramètre idx. On les reconnaît directement ici.
      const simple = parseSimpleSearchExpression(value);
      if (simple) return simple;

      const limits = url.searchParams.getAll('limit');
      for (const limit of limits) {
        let m;
        if ((m = limit.match(/^branch(?:,phr)?:\s*(.+)$/i))) return { index: 'branch', value: cleanLimitValue(m[1]) };
        if ((m = limit.match(/^holdingbranch(?:,phr)?:\s*(.+)$/i))) return { index: 'holdingbranch', value: cleanLimitValue(m[1]) };
        if ((m = limit.match(/^(?:mc-)?(?:itype|itemtype)(?:,phr)?:\s*(.+)$/i))) return { index: 'mc-itype', value: cleanLimitValue(m[1]) };
        if ((m = limit.match(/^(?:location|loc)(?:,phr)?:\s*(.+)$/i))) return { index: 'loc', value: cleanLimitValue(m[1]) };
        if ((m = limit.match(/^ccode(?:,phr)?:\s*(.+)$/i))) return { index: 'ccode', value: cleanLimitValue(m[1]) };
      }
    } catch (e) { /* noop */ }
    return null;
  }

  function indexFrom099Context(target, pointNode) {
    const element = pointNode && pointNode.nodeType === Node.TEXT_NODE ? pointNode.parentElement : pointNode;
    const source = (element && element.closest && element.closest('.kx-notice-meta-acquisition, [title*="099"], [data-field^="099"], [data-tag="099"]'))
      || (target.closest && target.closest('.kx-notice-meta-acquisition, [title*="099"], [data-field^="099"], [data-tag="099"]'));
    if (!source) return null;

    const directSignature = normalizeKey([
      target.getAttribute && target.getAttribute('data-field'),
      target.getAttribute && target.getAttribute('data-subfield'),
      target.getAttribute && target.getAttribute('data-code'),
      target.getAttribute && target.getAttribute('title'),
      target.id,
      target.className
    ].filter(Boolean).join(' '));

    if (/099\s*\$?b|f099b|sous[- ]?domaine/.test(directSignature)) return 'f099b';
    if (/099\s*\$?a|f099a|(?:^|\s)domaine(?:\s|$)/.test(directSignature)) return 'f099a';
    if (/099\s*\$?e|f099e|theme/.test(directSignature)) return 'f099e';
    if (/099\s*\$?f|f099f|sujet/.test(directSignature)) return 'f099f';

    const labels = Array.from(source.querySelectorAll('u, .label, .field-label, strong'));
    const referenceNode = pointNode || target;
    let previousLabel = null;

    labels.forEach(label => {
      if (label === target || label.contains(target)) return;
      try {
        const relation = label.compareDocumentPosition(referenceNode);
        if (relation & Node.DOCUMENT_POSITION_FOLLOWING) previousLabel = label;
      } catch (e) { /* noop */ }
    });

    const labelText = normalizeKey(previousLabel ? previousLabel.textContent : '');
    if (/sous[- ]?domaine/.test(labelText)) return 'f099b';
    if (/domaine/.test(labelText)) return 'f099a';
    if (/theme/.test(labelText)) return 'f099e';
    if (/sujet/.test(labelText)) return 'f099f';

    return null;
  }

  function specificContextMatch(target, point) {
    const closest = selector => {
      try { return target.closest(selector); } catch (e) { return null; }
    };

    let host;

    // Résultats de recherche — classes créées par 129-mise-en-forme-exemplaire.js.
    host = closest('.titlebibresult, .titlemikaresult, .firstresult');
    if (host) {
      const link = target.closest('a') || host.querySelector('a[href*="detail.pl"]') || host.querySelector('a');
      return { index: 'ti', value: link ? link.textContent : (point.text || host.textContent), source: 'titre résultat' };
    }

    host = closest('.kx-notice-meta-author');
    if (host) {
      const link = target.closest('a');
      return { index: 'au', value: link ? link.textContent : (point.text || host.textContent), source: 'auteur résultat' };
    }

    host = closest('.kx-notice-meta-series');
    if (host) {
      const link = target.closest('a');
      return { index: CONFIG.seriesIndex, value: link ? link.textContent : (point.text || host.textContent), source: 'série résultat' };
    }

    host = closest('.kx-notice-meta-subject');
    if (host) {
      const link = target.closest('a');
      return { index: 'su', value: link ? link.textContent : (point.text || host.textContent), source: 'sujet résultat' };
    }

    const idx099 = indexFrom099Context(target, point.node);
    if (idx099) {
      return { index: idx099, value: point.text || target.textContent, source: '099 résultat' };
    }

    host = closest('.kxri-callnumber, td.itemcallnumber');
    if (host) {
      const link = target.closest('a');
      const fromHref = indexFromSearchHref(link);
      return fromHref || { index: 'callnum', value: link ? link.textContent : (point.text || host.textContent), source: 'cote exemplaire' };
    }

    host = closest('.kxri-location, td.location');
    if (host) return { index: 'loc', value: point.text || host.textContent, source: 'localisation exemplaire' };

    host = closest('.kxri-collection, .ccode2, span.ccode');
    if (host) {
      const link = target.closest('a') || host.querySelector('a');
      const fromHref = indexFromSearchHref(link);
      return fromHref || { index: 'ccode', value: link ? link.textContent : (point.text || host.textContent), source: 'collection exemplaire' };
    }

    host = closest('.kxri-barcode, td.barcode');
    if (host) return { index: 'bc', value: point.text || host.textContent, source: 'code-barres exemplaire' };

    host = closest('.kxri-library');
    if (host) {
      return {
        index: 'holdingbranch',
        value: textWithoutDescendants(host, ['.kxri-local-badge']),
        source: 'site actuel exemplaire'
      };
    }

    host = closest('.kxri-secondary');
    if (host && /proprietaire/i.test(normalizeKey(host.textContent))) {
      const strong = host.querySelector('strong');
      return { index: 'branch', value: strong ? strong.textContent : host.textContent, source: 'site propriétaire exemplaire' };
    }

    host = closest('td.homebranch, .homebranchdesc');
    if (host) return { index: 'branch', value: point.text || host.textContent, source: 'site propriétaire Koha' };

    host = closest('td.holdingbranch, .holdingbranchdesc');
    if (host) return { index: 'holdingbranch', value: point.text || host.textContent, source: 'site actuel Koha' };

    host = closest('.item-itype-desc, td.itype, td.itemtype');
    if (host) {
      const icon = target.closest('img[title]') || host.querySelector('img[title]');
      return { index: 'mc-itype', value: icon ? icon.title : (point.text || host.textContent), source: 'type document' };
    }

    // Page détail native : le H1 bibliographique correspond au titre de la notice.
    if (/\/cgi-bin\/koha\/catalogue\/detail\.pl$/i.test(path)) {
      host = closest('#catalogue_detail_biblio h1, #catalogue_detail_biblio .title, h1.title');
      if (host) return { index: 'ti', value: point.text || host.textContent, source: 'titre notice' };
    }

    return null;
  }

  function inferFromContext(target, explicitText, event) {
    const anchor = target.closest && target.closest('a[href]');
    const fromHref = indexFromSearchHref(anchor);
    if (fromHref) {
      return {
        index: fromHref.index,
        value: explicitText || fromHref.value || normalizeText(target.textContent),
        source: 'lien Koha'
      };
    }

    const point = pointContext(event);
    const specific = specificContextMatch(target, point);
    if (specific) {
      specific.value = explicitText || specific.value;
      return specific;
    }

    const ancestry = [];
    let cursor = target;
    for (let i = 0; cursor && i < 5; i++, cursor = cursor.parentElement) {
      ancestry.push([
        cursor.tagName,
        cursor.id,
        cursor.className,
        cursor.getAttribute && cursor.getAttribute('data-field'),
        cursor.getAttribute && cursor.getAttribute('data-index'),
        cursor.getAttribute && cursor.getAttribute('data-tag'),
        cursor.getAttribute && cursor.getAttribute('data-subfield'),
        cursor.getAttribute && cursor.getAttribute('title')
      ].filter(Boolean).join(' '));
    }
    const signature = normalizeKey(ancestry.join(' '));

    let index = 'kw';
    if (/099.*\$?a|f099a/.test(signature)) index = 'f099a';
    else if (/099.*\$?b|f099b/.test(signature)) index = 'f099b';
    else if (/099.*\$?e|f099e/.test(signature)) index = 'f099e';
    else if (/099.*\$?f|f099f/.test(signature)) index = 'f099f';
    else if (/author|auteur|700|701|702|710|711|712/.test(signature)) index = 'au';
    else if (/subject|sujet|theme|600|601|602|604|605|606|607|608|610/.test(signature)) index = 'su';
    else if (/barcode|code[-_ ]?bar/.test(signature)) index = 'bc';
    else if (/callnum|cote/.test(signature)) index = 'callnum';
    else if (/isbn/.test(signature)) index = 'nb';
    else if (/issn/.test(signature)) index = 'ns';
    else if (/title[-_ ]?series|serie|225|461|464/.test(signature)) index = CONFIG.seriesIndex;
    else if (/title|titre|200/.test(signature)) index = 'ti';
    else if (/ccode|code[-_ ]?collection/.test(signature)) index = 'ccode';
    else if (/holdingbranch|site[-_ ]?actuel/.test(signature)) index = 'holdingbranch';
    else if (/homebranch|site[-_ ]?propriet/.test(signature)) index = 'branch';
    else if (/location|localisation/.test(signature)) index = 'loc';
    else if (/itype|itemtype|type[-_ ]?document/.test(signature)) index = 'mc-itype';

    let value = explicitText || point.text || normalizeText(target.textContent);
    return { index, value, source: index === 'kw' ? 'général' : 'contexte DOM' };
  }

  function bindAltClick() {
    if (altClickBound) return;
    altClickBound = true;

    document.addEventListener('click', async event => {
      if (!event.altKey) return;
      if (!event.target || !(event.target instanceof Element)) return;
      if (sidebar && sidebar.contains(event.target)) return;
      if (event.target.closest('input, textarea, select, button, [contenteditable="true"]')) return;

      const selected = selectedTextInsideTarget(event.target);
      const inferred = inferFromContext(event.target, selected, event);
      let value = cleanDetectedValue(inferred.index, inferred.value);

      if (!value) return;
      // Evite d'aspirer des blocs entiers en cas de clic trop haut dans le DOM.
      if (!selected && value.length > 240) {
        showToast('Texte trop long : sélectionnez précisément le passage avant ALT + clic.', true);
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      openSidebar();
      value = await canonicalizeDetectedValue(inferred.index, value);
      if (!value) return;

      const field = getField(inferred.index);
      const term = addTerm(value, inferred.index, 'AND', false, { focus: false });
      if (term) {
        showToast(`Ajouté comme « ${field.label} ».`);
      }
    }, true);
  }

  function buildSidebar() {
    if (document.getElementById('kohaAdvancedSearchSidebar')) return;

    injectStyles();
    restoreState();

    sidebar = createElement('aside');
    sidebar.id = 'kohaAdvancedSearchSidebar';
    sidebar.setAttribute('aria-hidden', 'true');
    sidebar.setAttribute('aria-label', 'Recherche avancée');

    const header = createElement('div', 'kas-header');
    const titleWrap = createElement('div', 'kas-title-wrap');
    titleWrap.appendChild(createElement('h2', 'kas-title', 'Recherche avancée'));
    titleWrap.appendChild(createElement('div', 'kas-subtitle', 'Constructeur de requête Koha'));
    const close = createElement('button', 'kas-close', '×');
    close.type = 'button';
    close.title = 'Fermer';
    close.setAttribute('aria-label', 'Fermer la recherche avancée');
    close.addEventListener('click', closeSidebar);
    header.appendChild(titleWrap);
    header.appendChild(close);
    sidebar.appendChild(header);

    const body = createElement('div', 'kas-body');
    const help = createElement('div', 'kas-help');
    const helpIcon = createElement('span', '', '💡');
    const helpText = createElement('div');
    const helpStrong = createElement('strong', '', 'ALT + clic');
    helpText.appendChild(helpStrong);
    helpText.appendChild(document.createTextNode(' sur une information de Koha pour l’ajouter directement. Si vous sélectionnez d’abord une partie du texte, seule la sélection est reprise.'));
    help.appendChild(helpIcon);
    help.appendChild(helpText);
    body.appendChild(help);

    termsContainer = createElement('div', 'kas-terms');
    body.appendChild(termsContainer);

    const toolbar = createElement('div', 'kas-toolbar');
    const addBtn = createElement('button', 'kas-btn kas-btn-secondary', '+ Ajouter un critère');
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => addTerm('', 'kw', 'AND', false));
    const resetBtn = createElement('button', 'kas-btn kas-btn-danger-lite', 'Effacer');
    resetBtn.type = 'button';
    resetBtn.title = 'Supprimer tous les critères';
    resetBtn.addEventListener('click', resetSearch);
    toolbar.appendChild(addBtn);
    toolbar.appendChild(resetBtn);
    body.appendChild(toolbar);

    const summaryBox = createElement('div', 'kas-summary-box');
    summaryBox.appendChild(createElement('div', 'kas-summary-title', 'Votre recherche'));
    summaryEl = createElement('div', 'kas-summary');
    summaryBox.appendChild(summaryEl);
    body.appendChild(summaryBox);

    const prefs = createElement('div', 'kas-prefs');
    const rememberLabel = document.createElement('label');
    rememberCheckbox = document.createElement('input');
    rememberCheckbox.type = 'checkbox';
    rememberCheckbox.checked = state.remember;
    rememberLabel.appendChild(rememberCheckbox);
    rememberLabel.appendChild(document.createTextNode('Conserver cette recherche quand je change de page'));
    prefs.appendChild(rememberLabel);

    const clearAfterLabel = document.createElement('label');
    clearAfterCheckbox = document.createElement('input');
    clearAfterCheckbox.type = 'checkbox';
    clearAfterCheckbox.checked = state.clearAfterLaunch;
    clearAfterLabel.appendChild(clearAfterCheckbox);
    clearAfterLabel.appendChild(document.createTextNode('Effacer les critères après avoir lancé la recherche'));
    prefs.appendChild(clearAfterLabel);
    body.appendChild(prefs);

    rememberCheckbox.addEventListener('change', () => {
      state.remember = rememberCheckbox.checked;
      if (!state.remember) {
        try { localStorage.removeItem(CONFIG.storageKey); } catch (e) { /* noop */ }
      } else {
        persist();
      }
    });

    clearAfterCheckbox.addEventListener('change', () => {
      state.clearAfterLaunch = clearAfterCheckbox.checked;
      persist();
    });

    sidebar.appendChild(body);

    const footer = createElement('div', 'kas-footer');
    const actions = createElement('div', 'kas-footer-actions');
    const copyBtn = createElement('button', 'kas-btn kas-btn-secondary', 'Copier le lien');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', copySearchUrl);
    const launchBtn = createElement('button', 'kas-btn kas-btn-primary kas-launch', '🔎 Rechercher dans Koha ↗');
    launchBtn.type = 'button';
    launchBtn.addEventListener('click', launchSearch);
    actions.appendChild(copyBtn);
    actions.appendChild(launchBtn);
    footer.appendChild(actions);
    sidebar.appendChild(footer);

    document.body.appendChild(sidebar);

    toastEl = createElement('div');
    toastEl.id = 'kohaAdvancedSearchToast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastEl);

    renderTerms();
    bindAltClick();

    document.addEventListener('keydown', event => {
      if (!sidebar || !sidebar.classList.contains('open')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSidebar();
        return;
      }
      if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault();
        launchSearch();
      }
    });

    window.toggleAdvancedSearchSidebar = toggleSidebar;
    window.openAdvancedSearchSidebar = openSidebar;
    window.closeAdvancedSearchSidebar = closeSidebar;
    document.addEventListener('koha:toggleAdvancedSearch', toggleSidebar);
  }

  ready(() => {
    buildSidebar();

    // Compatibilité avec le comportement historique qui se trouvait dans l'ancien 075.
    // Conservé ici pour qu'un simple remplacement du fichier ne retire rien aux pages Prêt/Retour.
    const applyLegacyPageTitleSuffix = () => {
      try {
        const h1 = document.querySelector('h1');
        if (!h1) return false;
        const txt = normalizeText(h1.textContent);
        if (/\bPrêt\b/i.test(txt) && !/ - Pret$/.test(document.title)) document.title += ' - Pret';
        if (/\bRetour\b/i.test(txt) && !/ - Retour$/.test(document.title)) document.title += ' - Retour';
        return true;
      } catch (e) {
        return true;
      }
    };

    if (!applyLegacyPageTitleSuffix()) {
      const observer = new MutationObserver(() => {
        if (applyLegacyPageTitleSuffix()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 3000);
    }
  });
})();

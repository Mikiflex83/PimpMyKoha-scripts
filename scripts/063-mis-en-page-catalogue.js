/*
 Nom du fichier: 063-mis-en-page-catalogue.js
 Version: 3.0.0
 Date de consolidation: 2026-09-20
 Auteur: Michael Mundet / consolidation PimpMyKoha

 Module PMK : Organisation des informations de la notice
 ID stable  : detail-bibliographic-groups

 Le module absorbe désormais les fonctions de présentation encore portées
 par le legacy 107-detail-layout-tweaks.js :
 - hover bibliographique (déjà absorbé auparavant) ;
 - séparateurs techniques avant Création notice / Acquisition ;
 - alignement du titre + actions ;
 - présentation du lien Statistiques détaillées.

 Principe important :
 les capacités de style ne sont PAS limitées aux éléments historiques du 107.
 Elles sont disponibles :
 - sur tous les groupes historiques ou futurs ;
 - sur toutes les informations historiques ou ajoutées par picker ;
 - via des règles de présentation génériques ajoutables par picker.
*/
(function () {
  'use strict';

  var MODULE_ID = 'detail-bibliographic-groups';
  var MODULE_VERSION = '3.0.0';
  var PAGE_PATH = '/cgi-bin/koha/catalogue/detail.pl';
  var PAGE_ID = 'catalogue.detail';
  var ROOT_ID = 'catalogue_detail_biblio';
  var CONTAINER_CLASS = 'catalogue-info';
  var STYLE_ID = 'pmk-063-style';
  var IS_TARGET_PAGE = window.location.pathname === PAGE_PATH;

  var currentConfig = null;
  var unsubscribe = null;
  var pmkInitialized = false;
  var moduleRegistered = false;
  var pickerRegistered = false;

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function deepMerge(base, extra) {
    if (Array.isArray(base)) return Array.isArray(extra) ? clone(extra) : clone(base);
    if (!isObject(base)) return extra === undefined ? clone(base) : clone(extra);
    var out = clone(base);
    if (!isObject(extra)) return out;
    Object.keys(extra).forEach(function (key) {
      if (Array.isArray(extra[key])) out[key] = clone(extra[key]);
      else if (isObject(extra[key]) && isObject(out[key])) out[key] = deepMerge(out[key], extra[key]);
      else out[key] = clone(extra[key]);
    });
    return out;
  }

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function styleProfile(overrides) {
    return Object.assign({
      display: '',
      alignItems: '',
      justifyContent: '',
      flexWrap: '',
      gap: '',
      margin: '',
      padding: '',
      background: '',
      color: '',
      border: '',
      borderRadius: '',
      fontSize: '',
      fontWeight: '',
      textAlign: '',
      textDecoration: '',
      boxShadow: '',

      hoverBackground: '',
      hoverColor: '',
      hoverBorderColor: '',
      hoverBoxShadow: '',
      hoverTransform: '',

      separatorBefore: false,
      separatorAfter: false,
      separatorColor: '#e0e0e0',
      separatorWidth: '1px',
      separatorStyle: 'solid',
      separatorMargin: '6px 0',

      childSelector: '',
      childFlexShrink: '',
      childDisplay: ''
    }, overrides || {});
  }

  function item(id, labelFr, labelEn, aliasesFr, aliasesEn) {
    return {
      id: id,
      enabled: true,
      label: { fr: labelFr || id, en: labelEn || labelFr || id },
      selector: '',
      aliases: {
        fr: Array.isArray(aliasesFr) ? aliasesFr.join('\n') : String(aliasesFr || ''),
        en: Array.isArray(aliasesEn) ? aliasesEn.join('\n') : String(aliasesEn || '')
      },
      tooltip: { enabled: false, fr: '', en: '' },
      style: styleProfile(),
      order: 10
    };
  }

  function group(id, labelFr, labelEn, order, items) {
    return {
      id: id,
      enabled: true,
      label: { fr: labelFr, en: labelEn || labelFr },
      order: order,
      style: styleProfile(),
      items: items
    };
  }

  function presentationRule(id, labelFr, labelEn, selector, matchMode, matchFr, matchEn, style) {
    return {
      id: id,
      enabled: true,
      label: { fr: labelFr, en: labelEn || labelFr },
      selector: selector || '',
      targetName: '',
      matchMode: matchMode || 'contains',
      matchFr: matchFr || '',
      matchEn: matchEn || '',
      style: styleProfile(style)
    };
  }

  var DEFAULT_CONFIG = {
    enabled: true,
    page: {
      enabled: true,
      pageId: PAGE_ID,
      path: PAGE_PATH
    },
    hideMarcPreview: true,
    appearance: {
      showGroupTitles: false,
      hoverEnabled: true,
      hoverBackground: '#f5f7fa',
      hoverPadding: '2px 4px',
      groupGap: '0px'
    },
    groups: [
      group('identification', 'Identification', 'Identification', 10, [
        item('collection', 'Collection', 'Collection', ['Collection'], ['Collection']),
        item('serie', 'Série', 'Series', ['Série', 'Serie'], ['Series']),
        item('relie-avec', 'Relié avec', 'Bound with', ['Relié avec', 'Relie avec'], ['Bound with']),
        item('auteur-principal', 'Auteur principal', 'Main author', ['Auteur principal'], ['Main author', 'Primary author']),
        item('co-auteur', 'Co-auteur', 'Co-author', ['Co-auteur', 'Co auteur'], ['Co-author']),
        item('public', 'Public', 'Audience', ['Public'], ['Audience', 'Public']),
        item('auteur-secondaire', 'Auteur secondaire', 'Secondary author', ['Auteur secondaire'], ['Secondary author'])
      ]),
      group('details', 'Détails', 'Details', 20, [
        item('isbn', 'ISBN', 'ISBN', ['ISBN'], ['ISBN']),
        item('ean', 'EAN', 'EAN', ['EAN'], ['EAN']),
        item('creation', 'Création', 'Creation', ['Création', 'Creation'], ['Creation']),
        item('modification', 'Modification', 'Modification', ['Modification'], ['Modification']),
        item('type-document', 'Type de document', 'Document type', ['Type de document'], ['Document type', 'Material type']),
        item('pays-production', 'Pays de production', 'Country of production', ['Pays de production'], ['Country of production']),
        item('langue', 'Langue', 'Language', ['Langue'], ['Language']),
        item('edition', 'Édition', 'Edition', ['Édition', 'Edition'], ['Edition']),
        item('recompenses', 'Récompense(s)', 'Award(s)', ['Récompense(s)', 'Récompenses', 'Recompense(s)', 'Recompenses'], ['Award(s)', 'Awards']),
        item('description', 'Description', 'Description', ['Description'], ['Description'])
      ]),
      group('contenu', 'Contenu', 'Content', 30, [
        item('resume', 'Résumé', 'Summary', ['Résumé', 'Resume'], ['Summary', 'Abstract']),
        item('note-contenu', 'Note de contenu', 'Contents note', ['Note de contenu'], ['Contents note', 'Content note']),
        item('note-generale', 'Note générale', 'General note', ['Note générale', 'Note generale'], ['General note'])
      ]),
      group('classification', 'Classification', 'Classification', 40, [
        item('classement', 'Classement', 'Classification', ['Classement'], ['Classification', 'Call number']),
        item('sujet-nom-commun', 'Sujet - Nom commun', 'Subject - Topical term', ['Sujet - Nom commun'], ['Subject - Topical term', 'Subject - Common name']),
        item('sujet-indexation', 'Sujet - Indexation', 'Subject - Indexing', ['Sujet - Indexation'], ['Subject - Indexing']),
        item('historique-sudoc', 'Historique SUDOC du périodique', 'SUDOC serial history', ['Historique SUDOC du périodique', 'Historique SUDOC du periodique'], ['SUDOC serial history']),
        item('sujet-genre', 'Sujet - Genre littéraire', 'Subject - Literary genre', ['Sujet - Genre littéraire', 'Sujet - Genre litteraire'], ['Subject - Literary genre', 'Genre/Form']),
        item('personnages', 'Personnage(s)', 'Character(s)', ['Personnage(s)', 'Personnages'], ['Character(s)', 'Characters']),
        item('sujet-personne', 'Sujet - Nom de personne', 'Subject - Personal name', ['Sujet - Nom de personne'], ['Subject - Personal name']),
        item('categorie-sujet', 'Catégorie de sujet', 'Subject category', ['Catégorie de sujet', 'Categorie de sujet'], ['Subject category']),
        item('sujet-geographique', 'Sujet - Nom géographique', 'Subject - Geographic name', ['Sujet - Nom géographique', 'Sujet - Nom geographique'], ['Subject - Geographic name'])
      ]),
      group('ressources', 'Ressources', 'Resources', 50, [
        item('ressources', 'Ressources', 'Resources', ['Ressources'], ['Resources'])
      ])
    ],

    // Règles héritées du 107. Elles utilisent exactement le même moteur que
    // toutes les futures règles ajoutées par l'administrateur.
    presentationRules: [
      presentationRule(
        'legacy-107-title-actions',
        'En-tête notice — titre et actions',
        'Record header — title and actions',
        '#catalogue_detail_biblio p.first',
        'contains', '', '',
        {
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          margin: '0 0 8px',
          childSelector: 'button',
          childFlexShrink: '0'
        }
      ),
      presentationRule(
        'legacy-107-separator-creation',
        'Séparateur avant Création notice',
        'Separator before record creation',
        '.technique .content li',
        'contains',
        'Création notice',
        'Record creation',
        {
          separatorBefore: true,
          separatorColor: '#e0e0e0',
          separatorWidth: '1px',
          separatorStyle: 'solid',
          separatorMargin: '6px 0'
        }
      ),
      presentationRule(
        'legacy-107-separator-acquisition',
        'Séparateur avant Acquisition',
        'Separator before Acquisition',
        '.technique .content li',
        'contains',
        'Acquisition',
        'Acquisition',
        {
          separatorBefore: true,
          separatorColor: '#e0e0e0',
          separatorWidth: '1px',
          separatorStyle: 'solid',
          separatorMargin: '6px 0'
        }
      ),
      presentationRule(
        'legacy-107-statistics-button',
        'Statistiques détaillées — rendu bouton',
        'Detailed statistics — button style',
        '.technique .content a[href*="guided_reports"]',
        'contains',
        'statistiques',
        'statistics',
        {
          display: 'inline-block',
          margin: '6px 0 0',
          padding: '5px 10px',
          background: '#e8f5e9',
          border: '1px solid #a5d6a7',
          borderRadius: '4px',
          color: '#2e7d32',
          fontSize: '0.80em',
          fontWeight: '600',
          textDecoration: 'none',
          hoverBackground: '#c8e6c9',
          hoverBorderColor: '#66bb6a'
        }
      )
    ]
  };

  DEFAULT_CONFIG.groups.forEach(function (g, gi) {
    g.order = (gi + 1) * 10;
    g.items.forEach(function (it, ii) { it.order = (ii + 1) * 10; });
  });

  currentConfig = clone(DEFAULT_CONFIG);

  function slug(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'element';
  }

  function uniqueId(base, used) {
    base = base || 'element';
    var id = base, i = 2;
    while (used[id]) id = base + '-' + i++;
    used[id] = true;
    return id;
  }

  function lines(value) {
    if (Array.isArray(value)) return value.map(function (v) { return clean(v); }).filter(Boolean);
    return String(value || '').split(/\r?\n/).map(function (v) { return v.trim(); }).filter(Boolean);
  }

  function firstLine(value) {
    var xs = lines(value);
    return xs.length ? xs[0] : '';
  }

  function normalizeStyle(value) {
    return deepMerge(styleProfile(), isObject(value) ? value : {});
  }

  function normalizeRule(raw, index, usedIds) {
    raw = isObject(raw) ? raw : {};
    var labelFr = String(raw.label && raw.label.fr || raw.labelFr || ('Règle ' + (index + 1)));
    var labelEn = String(raw.label && raw.label.en || raw.labelEn || labelFr);
    return {
      id: uniqueId(slug(raw.id || labelFr || ('regle-' + (index + 1))), usedIds),
      enabled: raw.enabled !== false,
      label: { fr: labelFr, en: labelEn },
      selector: clean(raw.selector),
      targetName: clean(raw.targetName),
      matchMode: ['contains', 'exact', 'regex'].indexOf(raw.matchMode) >= 0 ? raw.matchMode : 'contains',
      matchFr: String(raw.matchFr || ''),
      matchEn: String(raw.matchEn || ''),
      style: normalizeStyle(raw.style)
    };
  }

  function normalizeConfig(config) {
    var cfg = deepMerge(DEFAULT_CONFIG, isObject(config) ? config : {});
    cfg.enabled = cfg.enabled !== false;
    cfg.page = deepMerge(DEFAULT_CONFIG.page, cfg.page || {});
    cfg.page.enabled = cfg.page.enabled !== false;
    cfg.page.pageId = PAGE_ID;
    cfg.page.path = PAGE_PATH;
    cfg.hideMarcPreview = cfg.hideMarcPreview !== false;
    cfg.appearance = deepMerge(DEFAULT_CONFIG.appearance, cfg.appearance || {});
    cfg.groups = Array.isArray(cfg.groups) ? cfg.groups : clone(DEFAULT_CONFIG.groups);

    var groupIds = Object.create(null);
    cfg.groups = cfg.groups.map(function (rawGroup, gi) {
      var g = isObject(rawGroup) ? rawGroup : {};
      var labelFr = String(g.label && g.label.fr || g.name || ('Groupe ' + (gi + 1)));
      var labelEn = String(g.label && g.label.en || labelFr);
      var gid = uniqueId(slug(g.id || labelFr || ('groupe-' + (gi + 1))), groupIds);
      var itemIds = Object.create(null);
      var items = Array.isArray(g.items) ? g.items : [];
      items = items.map(function (rawItem, ii) {
        var it = isObject(rawItem) ? rawItem : {};
        var itemLabelFr = String(it.label && it.label.fr || it.name || firstLine(it.aliases && it.aliases.fr) || ('Élément ' + (ii + 1)));
        var itemLabelEn = String(it.label && it.label.en || itemLabelFr);
        return {
          id: uniqueId(slug(it.id || itemLabelFr || ('element-' + (ii + 1))), itemIds),
          enabled: it.enabled !== false,
          label: { fr: itemLabelFr, en: itemLabelEn },
          selector: clean(it.selector),
          aliases: {
            fr: lines(it.aliases && it.aliases.fr).join('\n'),
            en: lines(it.aliases && it.aliases.en).join('\n')
          },
          tooltip: {
            enabled: Boolean(it.tooltip && it.tooltip.enabled),
            fr: String(it.tooltip && it.tooltip.fr || ''),
            en: String(it.tooltip && it.tooltip.en || '')
          },
          style: normalizeStyle(it.style),
          order: (ii + 1) * 10
        };
      });

      return {
        id: gid,
        enabled: g.enabled !== false,
        label: { fr: labelFr, en: labelEn },
        order: (gi + 1) * 10,
        style: normalizeStyle(g.style),
        items: items
      };
    });

    var ruleIds = Object.create(null);
    cfg.presentationRules = Array.isArray(cfg.presentationRules)
      ? cfg.presentationRules.map(function (rule, index) { return normalizeRule(rule, index, ruleIds); })
      : clone(DEFAULT_CONFIG.presentationRules);

    return cfg;
  }

  function detectLanguage() {
    if (window.PMKConfig && typeof window.PMKConfig.getLanguage === 'function') {
      return window.PMKConfig.getLanguage() === 'en' ? 'en' : 'fr';
    }
    return String(document.documentElement.lang || '').toLowerCase().indexOf('en') === 0 ? 'en' : 'fr';
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function directLabel(element) {
    if (!element) return '';
    var direct = null;
    try { direct = element.querySelector(':scope > strong, :scope > span.label, :scope > label'); } catch (_) {}
    if (direct) return clean(direct.textContent);

    var own = '';
    Array.prototype.forEach.call(element.childNodes || [], function (node) {
      if (node.nodeType === Node.TEXT_NODE) own += ' ' + node.textContent;
      else if (node.nodeType === Node.ELEMENT_NODE && /^(STRONG|B|SPAN|LABEL)$/i.test(node.tagName)) own += ' ' + node.textContent;
    });
    own = clean(own);
    var idx = own.indexOf(':');
    return idx >= 0 ? own.slice(0, idx).trim() : own;
  }

  function matchesAliases(li, aliases) {
    var label = normalizeText(directLabel(li));
    if (!label) return false;
    return aliases.some(function (entry) {
      var alias = normalizeText(entry);
      return alias && (label === alias || label.indexOf(alias) === 0);
    });
  }

  function safeQuery(root, selector) {
    if (!root || !selector) return [];
    try { return Array.prototype.slice.call(root.querySelectorAll(selector)); }
    catch (_) { return []; }
  }

  function resolveItemTargets(root, itemCfg, claimed) {
    var nodes = [];
    if (itemCfg.selector) nodes = safeQuery(root, itemCfg.selector);

    if (!nodes.length) {
      var aliases = lines(itemCfg.aliases && itemCfg.aliases.fr)
        .concat(lines(itemCfg.aliases && itemCfg.aliases.en));
      if (aliases.length) {
        nodes = Array.prototype.filter.call(root.querySelectorAll('li'), function (li) {
          if (li.closest('.technique')) return false;
          if (li.closest('.' + CONTAINER_CLASS + '[data-pmk063="1"]')) return false;
          return matchesAliases(li, aliases);
        });
      }
    }

    return nodes.filter(function (node) {
      if (!(node instanceof Element)) return false;
      if (node.closest('.technique')) return false;
      if (claimed.has(node)) return false;
      claimed.add(node);
      return true;
    });
  }

  function ensureStyle(cfg) {
    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }

    var hoverBg = clean(cfg.appearance.hoverBackground) || '#f5f7fa';
    var padding = clean(cfg.appearance.hoverPadding) || '2px 4px';
    var gap = clean(cfg.appearance.groupGap) || '0px';

    style.textContent = [
      '.' + CONTAINER_CLASS + '[data-pmk063="1"]{display:block;min-width:0;}',
      '.' + CONTAINER_CLASS + '[data-pmk063="1"] .pmk063-group{margin:0 0 ' + gap + ';min-width:0;}',
      '.' + CONTAINER_CLASS + '[data-pmk063="1"] .pmk063-group-list{margin:0;padding-left:0;list-style:none;}',
      '.' + CONTAINER_CLASS + '[data-pmk063="1"] .pmk063-group-title{font-size:.95em;font-weight:600;margin:.45rem 0 .2rem;}',
      '.' + CONTAINER_CLASS + '[data-pmk063="1"] .pmk063-item{border-radius:3px;padding:' + padding + ';transition:background .12s,color .12s,border-color .12s,box-shadow .12s,transform .12s;overflow-wrap:anywhere;}',
      cfg.appearance.hoverEnabled ? ('.' + CONTAINER_CLASS + '[data-pmk063="1"] .pmk063-item:hover{background:' + hoverBg + ';}') : '',
      '[data-pmk063-hover-style="1"]{transition:background .15s,color .15s,border-color .15s,box-shadow .15s,transform .12s;}',
      '[data-pmk063-hover-style="1"]:hover{background:var(--pmk063-hover-bg,inherit)!important;color:var(--pmk063-hover-color,inherit)!important;border-color:var(--pmk063-hover-border,currentColor)!important;box-shadow:var(--pmk063-hover-shadow,none)!important;transform:var(--pmk063-hover-transform,none)!important;}',
      '.' + CONTAINER_CLASS + '[data-pmk063="1"] [data-pmk063-tooltip]{position:relative;}',
      '.' + CONTAINER_CLASS + '[data-pmk063="1"] [data-pmk063-tooltip]:hover::after{content:attr(data-pmk063-tooltip);position:absolute;z-index:1080;left:0;top:100%;margin-top:3px;max-width:min(360px,80vw);padding:5px 8px;border-radius:4px;background:#343a40;color:#fff;font-size:.78rem;line-height:1.25;white-space:normal;box-shadow:0 2px 8px rgba(0,0,0,.18);pointer-events:none;}',
      '@media (max-width:767.98px){.' + CONTAINER_CLASS + '[data-pmk063="1"] .pmk063-item{padding:3px 2px;}.' + CONTAINER_CLASS + '[data-pmk063="1"] .pmk063-group-title{margin-top:.65rem;}}'
    ].join('\n');
  }

  function cssEscape(value) {
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, function (c) { return '\\' + c; });
  }

  function cssAttr(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function stableSelector(el) {
    if (!(el instanceof Element)) return '';
    if (el.id) return '#' + cssEscape(el.id);

    var attrs = ['data-colname', 'data-field', 'data-tag', 'name'];
    for (var i = 0; i < attrs.length; i++) {
      var val = el.getAttribute(attrs[i]);
      if (!val) continue;
      var sel = el.tagName.toLowerCase() + '[' + attrs[i] + '="' + cssAttr(val) + '"]';
      try { if (document.querySelectorAll(sel).length === 1) return sel; } catch (_) {}
    }

    var path = [];
    var cur = el;
    while (cur && cur.nodeType === 1 && cur.id !== ROOT_ID && path.length < 7) {
      var part = cur.tagName.toLowerCase();
      var classes = Array.prototype.filter.call(cur.classList || [], function (c) {
        return c && !/^pmk|^selected$|^active$|^hover$/i.test(c);
      }).slice(0, 2);
      if (classes.length) part += '.' + classes.map(cssEscape).join('.');
      var parent = cur.parentElement;
      if (parent) {
        var same = Array.prototype.filter.call(parent.children, function (x) { return x.tagName === cur.tagName; });
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(cur) + 1) + ')';
      }
      path.unshift(part);
      cur = parent;
    }

    var selector = '#' + ROOT_ID + ' ' + path.join(' > ');
    try { if (document.querySelectorAll(selector).length === 1) return selector; } catch (_) {}
    return '';
  }

  function rememberOriginalStyle(node) {
    if (!node || node.__pmk063StyleRemembered) return;
    node.__pmk063StyleRemembered = true;
    node.__pmk063OriginalStyle = node.getAttribute('style');
  }

  function restorePresentationStyles(root) {
    if (!root) return;

    root.querySelectorAll('[data-pmk063-style-managed="1"]').forEach(function (node) {
      if (node.__pmk063StyleRemembered) {
        if (node.__pmk063OriginalStyle === null) node.removeAttribute('style');
        else node.setAttribute('style', node.__pmk063OriginalStyle);
      }
      node.removeAttribute('data-pmk063-style-managed');
      node.removeAttribute('data-pmk063-hover-style');
      [
        '--pmk063-hover-bg', '--pmk063-hover-color', '--pmk063-hover-border',
        '--pmk063-hover-shadow', '--pmk063-hover-transform'
      ].forEach(function (name) { node.style.removeProperty(name); });
      node.__pmk063StyleRemembered = false;
      node.__pmk063OriginalStyle = null;
    });

    root.querySelectorAll('hr[data-pmk063-separator="1"]').forEach(function (node) { node.remove(); });
  }

  function makeSeparator(style, ruleId, where) {
    var hr = document.createElement('hr');
    hr.setAttribute('data-pmk063-separator', '1');
    hr.setAttribute('data-pmk063-rule', ruleId || '');
    hr.setAttribute('data-pmk063-side', where);
    hr.style.margin = clean(style.separatorMargin) || '6px 0';
    hr.style.border = 'none';
    hr.style.borderTop =
      (clean(style.separatorWidth) || '1px') + ' ' +
      (clean(style.separatorStyle) || 'solid') + ' ' +
      (clean(style.separatorColor) || '#e0e0e0');
    return hr;
  }

  function applyStyleProfile(node, rawStyle, ruleId) {
    if (!(node instanceof Element)) return;
    var style = normalizeStyle(rawStyle);
    rememberOriginalStyle(node);
    node.setAttribute('data-pmk063-style-managed', '1');

    var map = {
      display: 'display',
      alignItems: 'alignItems',
      justifyContent: 'justifyContent',
      flexWrap: 'flexWrap',
      gap: 'gap',
      margin: 'margin',
      padding: 'padding',
      background: 'background',
      color: 'color',
      border: 'border',
      borderRadius: 'borderRadius',
      fontSize: 'fontSize',
      fontWeight: 'fontWeight',
      textAlign: 'textAlign',
      textDecoration: 'textDecoration',
      boxShadow: 'boxShadow'
    };
    Object.keys(map).forEach(function (key) {
      var value = clean(style[key]);
      if (value) node.style[map[key]] = value;
    });

    if (
      clean(style.hoverBackground) || clean(style.hoverColor) ||
      clean(style.hoverBorderColor) || clean(style.hoverBoxShadow) ||
      clean(style.hoverTransform)
    ) {
      node.setAttribute('data-pmk063-hover-style', '1');
      if (clean(style.hoverBackground)) node.style.setProperty('--pmk063-hover-bg', clean(style.hoverBackground));
      if (clean(style.hoverColor)) node.style.setProperty('--pmk063-hover-color', clean(style.hoverColor));
      if (clean(style.hoverBorderColor)) node.style.setProperty('--pmk063-hover-border', clean(style.hoverBorderColor));
      if (clean(style.hoverBoxShadow)) node.style.setProperty('--pmk063-hover-shadow', clean(style.hoverBoxShadow));
      if (clean(style.hoverTransform)) node.style.setProperty('--pmk063-hover-transform', clean(style.hoverTransform));
    }

    if (style.separatorBefore && node.parentNode) {
      node.parentNode.insertBefore(makeSeparator(style, ruleId, 'before'), node);
    }
    if (style.separatorAfter && node.parentNode) {
      node.parentNode.insertBefore(makeSeparator(style, ruleId, 'after'), node.nextSibling);
    }

    var childSelector = clean(style.childSelector);
    if (childSelector) {
      var children = safeQuery(node, childSelector);
      children.forEach(function (child) {
        rememberOriginalStyle(child);
        child.setAttribute('data-pmk063-style-managed', '1');
        if (clean(style.childFlexShrink)) child.style.flexShrink = clean(style.childFlexShrink);
        if (clean(style.childDisplay)) child.style.display = clean(style.childDisplay);
      });
    }
  }

  function ruleMatches(node, rule) {
    if (!node || !rule) return false;
    var fr = clean(rule.matchFr);
    var en = clean(rule.matchEn);
    if (!fr && !en) return true;

    var text = normalizeText(node.textContent);
    var patterns = [fr, en].filter(Boolean);
    if (rule.matchMode === 'regex') {
      return patterns.some(function (pattern) {
        try { return new RegExp(pattern, 'i').test(node.textContent || ''); }
        catch (_) { return false; }
      });
    }
    if (rule.matchMode === 'exact') {
      return patterns.some(function (pattern) { return text === normalizeText(pattern); });
    }
    return patterns.some(function (pattern) { return text.indexOf(normalizeText(pattern)) !== -1; });
  }

  function applyPresentationRules(root, cfg) {
    (cfg.presentationRules || []).forEach(function (rule) {
      if (!rule || rule.enabled === false || !clean(rule.selector)) return;
      safeQuery(root, rule.selector).forEach(function (node) {
        if (ruleMatches(node, rule)) applyStyleProfile(node, rule.style, rule.id);
      });
    });
  }

  function markOrigin(node) {
    if (node.hasAttribute('data-pmk063-moved')) return;
    node.__pmk063OriginParent = node.parentElement || null;
    node.__pmk063OriginNext = node.nextSibling || null;
    node.setAttribute('data-pmk063-moved', '1');
  }

  function restorePreviousLayout(root) {
    var old = root && root.querySelector('.' + CONTAINER_CLASS + '[data-pmk063="1"]');
    if (!old) return;

    old.querySelectorAll('[data-pmk063-moved="1"]').forEach(function (node) {
      var parent = node.__pmk063OriginParent;
      var next = node.__pmk063OriginNext;
      if (parent && document.documentElement.contains(parent)) {
        parent.insertBefore(node, next && next.parentNode === parent ? next : null);
      }
      node.removeAttribute('data-pmk063-moved');
      node.removeAttribute('data-pmk063-tooltip');
      node.removeAttribute('data-pmk063-item');
      node.classList.remove('pmk063-item');
      node.__pmk063OriginParent = null;
      node.__pmk063OriginNext = null;
    });

    var anchor = old.__pmk063Anchor;
    old.remove();
    if (anchor && anchor.parentNode) anchor.remove();
  }

  function applyTooltip(node, itemCfg, lang) {
    node.removeAttribute('data-pmk063-tooltip');
    if (!itemCfg.tooltip || !itemCfg.tooltip.enabled) return;
    var value = clean(itemCfg.tooltip[lang] || itemCfg.tooltip.fr || itemCfg.tooltip.en);
    if (value) node.setAttribute('data-pmk063-tooltip', value);
  }

  function restoreMarc(root) {
    var marc = root && root.querySelector('#catalogue_detail_marc_preview');
    if (marc) marc.style.display = '';
  }

  function render() {
    if (!IS_TARGET_PAGE) return;

    var root = document.getElementById(ROOT_ID);
    if (!root) return;

    restorePresentationStyles(root);
    restorePreviousLayout(root);
    restoreMarc(root);

    var cfg = normalizeConfig(currentConfig || DEFAULT_CONFIG);
    if (!cfg.enabled || !cfg.page.enabled) return;

    ensureStyle(cfg);
    applyPresentationRules(root, cfg);

    var marc = root.querySelector('#catalogue_detail_marc_preview');
    if (marc) marc.style.display = cfg.hideMarcPreview ? 'none' : '';

    var lang = detectLanguage();
    var claimed = new Set();
    var resolvedGroups = [];

    cfg.groups.forEach(function (g) {
      if (!g || g.enabled === false) return;
      var resolved = [];
      (g.items || []).forEach(function (it) {
        if (!it || it.enabled === false) return;
        resolveItemTargets(root, it, claimed).forEach(function (node) {
          resolved.push({ node: node, item: it });
        });
      });
      if (resolved.length) resolvedGroups.push({ group: g, rows: resolved });
    });

    // Les règles de présentation du 107 doivent rester actives même si
    // aucune information bibliographique n'a été regroupée.
    if (!resolvedGroups.length) {
      document.dispatchEvent(new CustomEvent('pmk063:rendered', { detail: { groups: 0 } }));
      return;
    }

    var first = resolvedGroups[0].rows[0].node;
    if (!first || !first.parentNode) return;

    var anchor = document.createComment('pmk063-anchor');
    first.parentNode.insertBefore(anchor, first);

    var container = document.createElement('div');
    container.className = CONTAINER_CLASS;
    container.setAttribute('data-pmk063', '1');
    container.__pmk063Anchor = anchor;

    resolvedGroups.forEach(function (entry) {
      var groupDiv = document.createElement('section');
      groupDiv.className = 'pmk063-group';
      groupDiv.setAttribute('data-pmk063-group', entry.group.id);
      applyStyleProfile(groupDiv, entry.group.style, 'group-' + entry.group.id);

      if (cfg.appearance.showGroupTitles) {
        var title = document.createElement('div');
        title.className = 'pmk063-group-title';
        title.textContent = entry.group.label[lang] || entry.group.label.fr || entry.group.label.en || entry.group.id;
        groupDiv.appendChild(title);
      }

      var list = document.createElement('ul');
      list.className = 'pmk063-group-list';

      entry.rows.forEach(function (row) {
        markOrigin(row.node);
        row.node.classList.add('pmk063-item');
        row.node.setAttribute('data-pmk063-item', row.item.id);
        applyTooltip(row.node, row.item, lang);
        applyStyleProfile(row.node, row.item.style, 'item-' + row.item.id);
        list.appendChild(row.node);
      });

      groupDiv.appendChild(list);
      container.appendChild(groupDiv);
    });

    anchor.parentNode.insertBefore(container, anchor.nextSibling);

    document.dispatchEvent(new CustomEvent('pmk063:rendered', {
      detail: { groups: resolvedGroups.length }
    }));
  }

  function newGroup() {
    return {
      id: 'groupe-' + Date.now().toString(36),
      enabled: true,
      label: { fr: 'Nouveau groupe', en: 'New group' },
      order: 10,
      style: styleProfile(),
      items: []
    };
  }

  function newItem() {
    return {
      id: 'element-' + Date.now().toString(36),
      enabled: true,
      label: { fr: 'Nouvel élément', en: 'New element' },
      selector: '',
      aliases: { fr: '', en: '' },
      tooltip: { enabled: false, fr: '', en: '' },
      style: styleProfile(),
      order: 10
    };
  }

  function newPresentationRule() {
    return {
      id: 'presentation-' + Date.now().toString(36),
      enabled: true,
      label: { fr: 'Nouvelle règle', en: 'New rule' },
      selector: '',
      targetName: '',
      matchMode: 'contains',
      matchFr: '',
      matchEn: '',
      style: styleProfile()
    };
  }

  function pathIndex(path, key) {
    if (!Array.isArray(path)) return -1;
    var pos = path.indexOf(key);
    if (pos < 0 || pos + 1 >= path.length) return -1;
    var n = Number(path[pos + 1]);
    return Number.isInteger(n) ? n : -1;
  }

  function groupFromPath(root, path) {
    var gi = pathIndex(path, 'groups');
    return gi >= 0 && root && Array.isArray(root.groups) ? root.groups[gi] : null;
  }

  function itemFromPath(root, path) {
    var g = groupFromPath(root, path);
    var ii = pathIndex(path, 'items');
    return g && ii >= 0 && Array.isArray(g.items) ? g.items[ii] : null;
  }

  function ruleFromPath(root, path) {
    var ri = pathIndex(path, 'presentationRules');
    return ri >= 0 && root && Array.isArray(root.presentationRules) ? root.presentationRules[ri] : null;
  }

  function applyPickedMetadata(root, fieldPath, result) {
    if (!root || !result) return;

    var entry = itemFromPath(root, fieldPath);
    if (entry) {
      var targetName = clean(result.targetName);
      if (targetName) {
        if (!entry.label || typeof entry.label !== 'object') entry.label = { fr: '', en: '' };
        if (!clean(entry.label.fr) || /^Nouvel élément$/i.test(entry.label.fr)) entry.label.fr = targetName;
        if (!clean(entry.label.en) || /^New element$/i.test(entry.label.en)) entry.label.en = targetName;
        if (!entry.aliases || typeof entry.aliases !== 'object') entry.aliases = { fr: '', en: '' };
        if (!clean(entry.aliases.fr)) entry.aliases.fr = targetName;
        if (!clean(entry.aliases.en)) entry.aliases.en = targetName;
      }
      return;
    }

    var rule = ruleFromPath(root, fieldPath);
    if (rule) {
      var name = clean(result.targetName);
      rule.targetName = name || rule.targetName || result.selector || '';
      if (!rule.label || typeof rule.label !== 'object') rule.label = { fr: '', en: '' };
      if (!clean(rule.label.fr) || /^Nouvelle règle$/i.test(rule.label.fr)) rule.label.fr = name || 'Nouvelle règle';
      if (!clean(rule.label.en) || /^New rule$/i.test(rule.label.en)) rule.label.en = name || 'New rule';
    }
  }

  function pick(context) {
    var picker = window.PMKConfig && window.PMKConfig.elementPicker;
    if (!picker || typeof picker.pickForConfig !== 'function') {
      return Promise.reject(new Error('pmk_common_picker_unavailable'));
    }
    return picker.pickForConfig({
      moduleId: MODULE_ID,
      targetUrl: PAGE_PATH,
      fieldPath: context && Array.isArray(context.fieldPath) ? context.fieldPath.slice() : [],
      rootObject: context && context.rootObject ? context.rootObject : {},
      persistAfterPick: false,
      adminContext: {
        pageId: PAGE_ID,
        sectionId: Array.isArray(context && context.fieldPath) && context.fieldPath.indexOf('presentationRules') >= 0
          ? 'presentation-rules' : 'groups'
      },
      options: {
        rootSelector: '#' + ROOT_ID,
        bannerText: detectLanguage() === 'en'
          ? 'Click the Koha element to configure — Esc cancels'
          : 'Clique sur l’élément Koha à configurer — Échap annule'
      }
    });
  }

  function registerPicker() {
    if (pickerRegistered) return;
    var picker = window.PMKConfig && window.PMKConfig.elementPicker;
    if (!picker || typeof picker.register !== 'function') return;

    picker.register(MODULE_ID, {
      resolveTarget: function (candidate, request) {
        if (!candidate || !candidate.closest) return null;
        var root = document.getElementById(ROOT_ID);
        if (!root || !root.contains(candidate)) return null;
        var path = request && Array.isArray(request.fieldPath) ? request.fieldPath : [];

        if (path.indexOf('groups') >= 0 && path.indexOf('items') >= 0) {
          var li = candidate.closest('li');
          if (!li || !root.contains(li) || li.closest('.technique')) return null;
          return li;
        }

        if (candidate.closest('#pmk-config-overlay, #pmk-common-element-picker-banner')) return null;
        return candidate;
      },
      buildResult: function (candidate, result) {
        result.targetName = directLabel(candidate) || clean(candidate.getAttribute && candidate.getAttribute('title')) ||
          clean(candidate.textContent).slice(0, 120) || result.selector;
        return result;
      },
      applyPending: function (draft, pending, picked) {
        if (picked && pending && Array.isArray(pending.fieldPath)) {
          applyPickedMetadata(draft, pending.fieldPath, picked);
        }
        return normalizeConfig(draft);
      }
    });
    pickerRegistered = true;
  }

  function styleSchemaFields() {
    return [
      { key: 'style.display', type: 'text', label: { fr: 'Mode d’affichage CSS', en: 'CSS display' }, advanced: true, placeholder: { fr: 'ex. flex, block, inline-block', en: 'e.g. flex, block, inline-block' } },
      { key: 'style.alignItems', type: 'text', label: { fr: 'Alignement vertical', en: 'Align items' }, advanced: true },
      { key: 'style.justifyContent', type: 'text', label: { fr: 'Répartition horizontale', en: 'Justify content' }, advanced: true },
      { key: 'style.flexWrap', type: 'text', label: { fr: 'Retour à la ligne flex', en: 'Flex wrap' }, advanced: true },
      { key: 'style.gap', type: 'text', label: { fr: 'Espacement (gap)', en: 'Gap' }, advanced: true },
      { key: 'style.margin', type: 'text', label: { fr: 'Marges', en: 'Margin' }, advanced: true },
      { key: 'style.padding', type: 'text', label: { fr: 'Espacement interne', en: 'Padding' }, advanced: true },
      { key: 'style.background', type: 'text', label: { fr: 'Fond', en: 'Background' } },
      { key: 'style.color', type: 'color', label: { fr: 'Couleur du texte', en: 'Text color' } },
      { key: 'style.border', type: 'text', label: { fr: 'Bordure', en: 'Border' }, advanced: true },
      { key: 'style.borderRadius', type: 'text', label: { fr: 'Arrondi', en: 'Border radius' }, advanced: true },
      { key: 'style.fontSize', type: 'text', label: { fr: 'Taille du texte', en: 'Font size' } },
      { key: 'style.fontWeight', type: 'text', label: { fr: 'Graisse du texte', en: 'Font weight' }, advanced: true },
      { key: 'style.textAlign', type: 'text', label: { fr: 'Alignement du texte', en: 'Text alignment' }, advanced: true },
      { key: 'style.textDecoration', type: 'text', label: { fr: 'Décoration du texte', en: 'Text decoration' }, advanced: true },
      { key: 'style.boxShadow', type: 'text', label: { fr: 'Ombre', en: 'Box shadow' }, advanced: true },

      { key: 'style.hoverBackground', type: 'text', label: { fr: 'Fond au survol', en: 'Hover background' } },
      { key: 'style.hoverColor', type: 'color', label: { fr: 'Texte au survol', en: 'Hover text color' } },
      { key: 'style.hoverBorderColor', type: 'color', label: { fr: 'Bordure au survol', en: 'Hover border color' } },
      { key: 'style.hoverBoxShadow', type: 'text', label: { fr: 'Ombre au survol', en: 'Hover shadow' }, advanced: true },
      { key: 'style.hoverTransform', type: 'text', label: { fr: 'Transformation au survol', en: 'Hover transform' }, advanced: true, placeholder: { fr: 'ex. translateY(-1px)', en: 'e.g. translateY(-1px)' } },

      { key: 'style.separatorBefore', type: 'boolean', label: { fr: 'Ajouter un séparateur avant', en: 'Add separator before' } },
      { key: 'style.separatorAfter', type: 'boolean', label: { fr: 'Ajouter un séparateur après', en: 'Add separator after' } },
      { key: 'style.separatorColor', type: 'color', label: { fr: 'Couleur du séparateur', en: 'Separator color' }, advanced: true },
      { key: 'style.separatorWidth', type: 'text', label: { fr: 'Épaisseur du séparateur', en: 'Separator width' }, advanced: true },
      { key: 'style.separatorStyle', type: 'select', label: { fr: 'Style du séparateur', en: 'Separator style' }, advanced: true, options: [
        { value: 'solid', label: { fr: 'Continu', en: 'Solid' } },
        { value: 'dotted', label: { fr: 'Pointillé', en: 'Dotted' } },
        { value: 'dashed', label: { fr: 'Tirets', en: 'Dashed' } }
      ] },
      { key: 'style.separatorMargin', type: 'text', label: { fr: 'Marges du séparateur', en: 'Separator margin' }, advanced: true },

      { key: 'style.childSelector', type: 'text', label: { fr: 'Sous-élément à ajuster', en: 'Child element to adjust' }, advanced: true },
      { key: 'style.childFlexShrink', type: 'text', label: { fr: 'flex-shrink du sous-élément', en: 'Child flex-shrink' }, advanced: true },
      { key: 'style.childDisplay', type: 'text', label: { fr: 'display du sous-élément', en: 'Child display' }, advanced: true }
    ];
  }

  function moduleDefinition() {
    var groupItemFields = [
      { key: 'enabled', type: 'boolean', label: { fr: 'Information active', en: 'Information enabled' } },
      { key: 'label.fr', type: 'text', label: { fr: 'Nom français dans la configuration', en: 'French configuration name' } },
      { key: 'label.en', type: 'text', label: { fr: 'Nom anglais dans la configuration', en: 'English configuration name' } },
      {
        key: 'selector',
        type: 'elementPicker',
        label: { fr: 'Information à placer dans ce groupe', en: 'Information to place in this group' },
        pickLabel: { fr: 'Choisir sur la page', en: 'Choose on page' },
        emptyLabel: { fr: 'Détection par libellé / aucun élément choisi', en: 'Label detection / no element selected' },
        allowManual: true,
        pick: pick,
        onPick: applyPickedMetadata,
        help: {
          fr: 'Les valeurs historiques peuvent utiliser leurs alias FR/EN. Toute nouvelle information peut être choisie avec le picker.',
          en: 'Historical values can use FR/EN aliases. Any new information can be selected with the picker.'
        }
      },
      { key: 'aliases.fr', type: 'textarea', advanced: true, label: { fr: 'Alias français', en: 'French aliases' } },
      { key: 'aliases.en', type: 'textarea', advanced: true, label: { fr: 'Alias anglais', en: 'English aliases' } },
      { key: 'tooltip.enabled', type: 'boolean', refreshOnChange: true, label: { fr: 'Afficher une infobulle au survol', en: 'Show a tooltip on hover' } },
      { key: 'tooltip.fr', type: 'textarea', label: { fr: 'Infobulle française', en: 'French tooltip' } },
      { key: 'tooltip.en', type: 'textarea', label: { fr: 'Infobulle anglaise', en: 'English tooltip' } }
    ].concat(styleSchemaFields());

    var ruleFields = [
      { key: 'enabled', type: 'boolean', label: { fr: 'Règle active', en: 'Rule enabled' } },
      { key: 'label.fr', type: 'text', label: { fr: 'Nom français', en: 'French name' } },
      { key: 'label.en', type: 'text', label: { fr: 'Nom anglais', en: 'English name' } },
      {
        key: 'selector',
        type: 'elementPicker',
        label: { fr: 'Élément à mettre en forme', en: 'Element to style' },
        pickLabel: { fr: 'Choisir sur la page', en: 'Choose on page' },
        allowManual: true,
        pick: pick,
        onPick: applyPickedMetadata,
        help: {
          fr: 'Le même moteur s’applique aux règles historiques du 107 et aux règles ajoutées ultérieurement.',
          en: 'The same engine applies to historical 107 rules and any rules added later.'
        }
      },
      { key: 'targetName', type: 'readonly', advanced: true, label: { fr: 'Élément détecté', en: 'Detected element' } },
      {
        key: 'matchMode',
        type: 'select',
        label: { fr: 'Filtre de texte', en: 'Text filter' },
        options: [
          { value: 'contains', label: { fr: 'Contient', en: 'Contains' } },
          { value: 'exact', label: { fr: 'Correspond exactement', en: 'Exact match' } },
          { value: 'regex', label: { fr: 'Expression régulière', en: 'Regular expression' } }
        ]
      },
      { key: 'matchFr', type: 'text', label: { fr: 'Texte français à reconnaître (vide = tous)', en: 'French text to match (blank = all)' } },
      { key: 'matchEn', type: 'text', label: { fr: 'Texte anglais à reconnaître (vide = tous)', en: 'English text to match (blank = all)' } }
    ].concat(styleSchemaFields());

    return {
      id: MODULE_ID,
      schemaVersion: 4,
      name: { fr: 'Organisation des informations de la notice', en: 'Record information layout' },
      description: {
        fr: 'Regroupe les informations bibliographiques et permet de mettre en forme n’importe quel élément de detail.pl avec le même moteur. Les finitions historiques du 107 sont désormais des règles par défaut de ce module.',
        en: 'Groups bibliographic information and styles any detail.pl element using the same engine. Historical 107 finishing rules are now default rules in this module.'
      },
      category: { fr: 'Catalogue / présentation', en: 'Catalogue / presentation' },
      supportedPages: [PAGE_ID],
      prerequisites: [],
      dependencies: [],
      defaults: clone(DEFAULT_CONFIG),
      normalize: normalizeConfig,
      validate: function (config) {
        if (!config || typeof config !== 'object') {
          return { ok: false, message: detectLanguage() === 'en' ? 'Invalid module configuration.' : 'Configuration du module invalide.' };
        }
        return { ok: true };
      },
      schema: [
        {
          type: 'section',
          id: 'activation',
          label: { fr: 'Activation', en: 'Activation' },
          fields: [
            { key: 'enabled', type: 'boolean', label: { fr: 'Activer le module', en: 'Enable module' } },
            { key: 'page.enabled', type: 'boolean', label: { fr: 'Activer sur catalogue/detail.pl', en: 'Enable on catalogue/detail.pl' } },
            { key: 'hideMarcPreview', type: 'boolean', label: { fr: 'Masquer l’aperçu MARC', en: 'Hide MARC preview' } }
          ]
        },
        {
          type: 'section',
          id: 'appearance',
          label: { fr: 'Présentation commune', en: 'Common presentation' },
          description: {
            fr: 'Réglages légers appliqués par défaut. Les styles propres à chaque groupe, information ou règle peuvent les compléter.',
            en: 'Lightweight common defaults. Per-group, per-item, and per-rule styles can extend them.'
          },
          fields: [
            { key: 'appearance.showGroupTitles', type: 'boolean', label: { fr: 'Afficher le titre des groupes', en: 'Show group titles' } },
            { key: 'appearance.hoverEnabled', type: 'boolean', label: { fr: 'Hover bibliographique commun', en: 'Common bibliographic hover' } },
            { key: 'appearance.hoverBackground', type: 'color', label: { fr: 'Couleur du hover commun', en: 'Common hover color' } },
            { key: 'appearance.hoverPadding', type: 'text', advanced: true, label: { fr: 'Espacement interne des lignes', en: 'Row inner spacing' } },
            { key: 'appearance.groupGap', type: 'text', advanced: true, label: { fr: 'Espace entre groupes', en: 'Space between groups' } }
          ]
        },
        {
          type: 'section',
          id: 'groups',
          label: { fr: 'Groupes et informations', en: 'Groups and information' },
          description: {
            fr: 'Tous les groupes et toutes les informations — historiques ou ajoutés plus tard — disposent des mêmes options de mise en forme.',
            en: 'Every group and information item — historical or added later — has the same styling options.'
          },
          fields: [
            {
              key: 'groups',
              type: 'repeater',
              label: { fr: 'Groupes', en: 'Groups' },
              addLabel: { fr: 'Ajouter un groupe', en: 'Add group' },
              emptyLabel: { fr: 'Aucun groupe configuré.', en: 'No group configured.' },
              reorder: true,
              newItem: newGroup,
              itemTitle: function (g, index, lang) {
                return clean(g && g.label && (g.label[lang] || g.label.fr || g.label.en)) || ('Groupe ' + (index + 1));
              },
              liveTitleKey: 'label.fr',
              fields: [
                { key: 'enabled', type: 'boolean', label: { fr: 'Groupe actif', en: 'Group enabled' } },
                { key: 'label.fr', type: 'text', label: { fr: 'Nom français', en: 'French name' } },
                { key: 'label.en', type: 'text', label: { fr: 'Nom anglais', en: 'English name' } }
              ].concat(styleSchemaFields()).concat([
                {
                  key: 'items',
                  type: 'repeater',
                  label: { fr: 'Informations placées dans ce groupe', en: 'Information placed in this group' },
                  addLabel: { fr: 'Ajouter une information', en: 'Add information' },
                  emptyLabel: { fr: 'Aucune information dans ce groupe.', en: 'No information in this group.' },
                  reorder: true,
                  newItem: newItem,
                  itemTitle: function (entry, index, lang) {
                    return clean(entry && entry.label && (entry.label[lang] || entry.label.fr || entry.label.en)) || ('Élément ' + (index + 1));
                  },
                  liveTitleKey: 'label.fr',
                  fields: groupItemFields
                }
              ])
            }
          ]
        },
        {
          type: 'section',
          id: 'presentation-rules',
          label: { fr: 'Mise en forme d’éléments de la page', en: 'Page element styling' },
          description: {
            fr: 'Moteur générique qui remplace les finitions du 107. Les quatre règles historiques sont préchargées, mais vous pouvez en ajouter autant que nécessaire avec le picker.',
            en: 'Generic engine replacing the finishing layer from 107. Four historical rules are preloaded, and any number of picker-based rules can be added.'
          },
          fields: [
            {
              key: 'presentationRules',
              type: 'repeater',
              label: { fr: 'Règles de présentation', en: 'Presentation rules' },
              addLabel: { fr: 'Ajouter une règle', en: 'Add rule' },
              emptyLabel: { fr: 'Aucune règle de présentation.', en: 'No presentation rule.' },
              reorder: true,
              newItem: newPresentationRule,
              itemTitle: function (entry, index, lang) {
                return clean(entry && entry.label && (entry.label[lang] || entry.label.fr || entry.label.en)) || ('Règle ' + (index + 1));
              },
              liveTitleKey: 'label.fr',
              fields: ruleFields
            }
          ]
        },
        {
          type: 'section',
          id: 'pages',
          label: { fr: 'Page configurée', en: 'Configured page' },
          fields: [
            { key: 'page.path', type: 'readonly', label: { fr: 'Chemin Koha', en: 'Koha path' } },
            { key: 'page.pageId', type: 'readonly', advanced: true, label: { fr: 'Identifiant fonctionnel', en: 'Functional identifier' } }
          ]
        }
      ],
      focusContext: function (main, context) {
        if (!main) return;
        var wanted = context && context.sectionId ? context.sectionId : 'groups';
        var section =
          main.querySelector('[data-pmk-section-id="' + wanted + '"]') ||
          main.querySelector('[data-pmk-section-id="groups"]');
        if (section) window.setTimeout(function () {
          section.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }, 0);
      }
    };
  }

  function registerWithPMK() {
    if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== 'function') return false;
    window.PMKConfig.registerModule(moduleDefinition());
    registerPicker();
    moduleRegistered = true;
    return true;
  }

  function mountContextButton() {
    if (!IS_TARGET_PAGE || !window.PMKConfig || typeof window.PMKConfig.mountContextButton !== 'function') return;
    var root = document.getElementById(ROOT_ID);
    if (!root) return;
    var anchor = root.querySelector('p.first') || root.querySelector('.page-section') || root;
    window.PMKConfig.mountContextButton({
      moduleId: MODULE_ID,
      anchor: anchor,
      position: anchor === root ? 'append' : 'after',
      contextKey: 'catalogue-detail-groups',
      context: { pageId: PAGE_ID, sectionId: 'groups' }
    });
  }

  async function initializePmk() {
    if (pmkInitialized || !window.PMKConfig) return;
    pmkInitialized = true;
    registerWithPMK();

    if (!IS_TARGET_PAGE) return;

    try {
      var cfg = await window.PMKConfig.getConfig(MODULE_ID);
      currentConfig = normalizeConfig(deepMerge(DEFAULT_CONFIG, cfg || {}));
    } catch (_) {
      currentConfig = normalizeConfig(DEFAULT_CONFIG);
    }

    if (typeof window.PMKConfig.subscribe === 'function') {
      try {
        unsubscribe = window.PMKConfig.subscribe(MODULE_ID, function (cfg) {
          currentConfig = normalizeConfig(deepMerge(DEFAULT_CONFIG, cfg || {}));
          render();
          mountContextButton();
        });
      } catch (_) {}
    }

    render();
    mountContextButton();
  }

  function start() {
    registerWithPMK();
    if (!IS_TARGET_PAGE) return;

    currentConfig = normalizeConfig(DEFAULT_CONFIG);
    render();

    if (window.PMKConfig) initializePmk();
    else document.addEventListener('pmk:config-ready', initializePmk, { once: true });
  }

  window.PMK063 = {
    moduleId: MODULE_ID,
    version: MODULE_VERSION,
    defaults: clone(DEFAULT_CONFIG),
    getConfig: function () { return clone(currentConfig); },
    render: render,
    stableSelector: stableSelector,
    destroy: function () {
      if (!IS_TARGET_PAGE) return;
      var root = document.getElementById(ROOT_ID);
      if (root) {
        restorePresentationStyles(root);
        restorePreviousLayout(root);
        restoreMarc(root);
      }
      var style = document.getElementById(STYLE_ID);
      if (style) style.remove();
      if (typeof unsubscribe === 'function') {
        try { unsubscribe(); } catch (_) {}
        unsubscribe = null;
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  window.addEventListener('pmk:config-ready', function () {
    if (!moduleRegistered) registerWithPMK();
    if (!pmkInitialized) initializePmk();
  }, { once: true });
})();

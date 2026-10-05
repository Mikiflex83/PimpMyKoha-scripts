/*
 Nom du fichier: 065-gen-callnum-links.js
 Version: 2.0.1
 Date de consolidation: 2026-09-19
 Auteur: Michael Mundet / consolidation PimpMyKoha

 Description:
   Recherche progressive par cote.

   Le script conserve les deux usages historiques par défaut :
   - table des exemplaires sur catalogue/detail.pl : td.itemcallnumber ;
   - cotes des exemplaires dans catalogue/search.pl.

   Le clic natif Koha sur une cote reste intact lorsqu'il existe. Un petit
   déclencheur discret est ajouté à côté de la cote et ouvre un popover
   proposant plusieurs niveaux de recherche.

   Des cibles supplémentaires peuvent être ajoutées depuis PMK Config avec
   le picker commun « Choisir sur la page ». Le script ne possède aucun
   moteur de pick local parallèle.

   Fail-safe :
   - aucune action sur une page non configurée ;
   - sélecteur invalide ignoré ;
   - cible vide ignorée ;
   - idempotence (pas de double bouton / double listener) ;
   - MutationObserver optionnel pour les contenus ajoutés dynamiquement.
*/
(function () {
  'use strict';

  var MODULE_ID = 'callnumber-progressive-search';
  var STYLE_ID = 'pmk065-style';
  var POPOVER_ID = 'pmk065-popover';
  var PROCESSED_ATTR = 'data-pmk065-processed';
  var TRIGGER_CLASS = 'pmk065-trigger';
  var CONFIG_HOST_CLASS = 'pmk065-config-host';
  var SOURCE_ATTR = 'data-pmk065-source-value';

  var DEFAULT_CONFIG = {
    enabled: true,
    labels: {
      titleFr: 'Rechercher par cote',
      titleEn: 'Search by call number'
    },
    behavior: {
      splitMode: 'auto',
      includeFull: true,
      order: 'general-first',
      quoteQuery: false,
      observeDom: true,
      observeDelay: 120
    },
    targets: [
      {
        id: 'legacy-detail-itemcallnumber',
        enabled: true,
        labelFr: 'Cotes — table des exemplaires',
        labelEn: 'Call numbers — item table',
        pagePath: '/cgi-bin/koha/catalogue/detail.pl',
        selector: 'td.itemcallnumber',
        targetName: 'td.itemcallnumber',
        historical: true
      },
      {
        id: 'legacy-search-result-callnumber',
        enabled: true,
        labelFr: 'Cotes — résultats du catalogue',
        labelEn: 'Call numbers — catalogue results',
        pagePath: '/cgi-bin/koha/catalogue/search.pl',
        selector: 'li.result_itype_image a[href*="idx=callnum"]',
        targetName: 'Lien de cote dans les résultats',
        historical: true
      }
    ]
  };

  var currentConfig = clone(DEFAULT_CONFIG);
  var observer = null;
  var observerTimer = null;
  var activePopover = null;
  var activeTrigger = null;
  var outsideHandlerBound = false;

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

  function language() {
    try {
      if (window.PMKConfig && typeof window.PMKConfig.getLanguage === 'function') {
        return window.PMKConfig.getLanguage() === 'en' ? 'en' : 'fr';
      }
      var html = String(document.documentElement.lang || '').toLowerCase();
      return html.indexOf('en') === 0 ? 'en' : 'fr';
    } catch (_) {
      return 'fr';
    }
  }

  function t(fr, en) {
    return language() === 'en' ? en : fr;
  }

  function safeSelectorAll(selector, root) {
    var value = text(selector);
    if (!value) return [];
    try { return Array.prototype.slice.call((root || document).querySelectorAll(value)); }
    catch (_) { return []; }
  }

  function targetMatchesPage(target) {
    var path = text(target && target.pagePath);
    if (!path) return false;
    return window.location.pathname === path;
  }

  function activeTargets(config) {
    var list = Array.isArray(config && config.targets) ? config.targets : [];
    return list.filter(function (target) {
      return target && target.enabled !== false && text(target.selector) && targetMatchesPage(target);
    });
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.' + TRIGGER_CLASS + '{',
      '  display:inline-flex;align-items:center;justify-content:center;',
      '  margin-left:.12rem;padding:0 .12rem;min-width:1rem;min-height:1rem;',
      '  border:0;border-radius:.2rem;background:transparent;',
      '  color:currentColor;font-size:.78rem;line-height:1;vertical-align:baseline;cursor:pointer;',
      '  opacity:.34;transition:opacity .12s ease,background-color .12s ease;',
      '}',
      '.' + TRIGGER_CLASS + ':hover,.' + TRIGGER_CLASS + ':focus{',
      '  opacity:.9;color:currentColor;background:rgba(0,0,0,.055);text-decoration:none;outline:0;',
      '}',
      '.' + CONFIG_HOST_CLASS + '{display:inline-flex;align-items:center;margin-left:.08rem;vertical-align:middle;}',
      '.' + CONFIG_HOST_CLASS + ' .pmk-context-config{padding:.05rem .12rem!important;margin:0!important;min-width:auto!important;opacity:.32;font-size:.78rem;}',
      '.' + CONFIG_HOST_CLASS + ' .pmk-context-config:hover,.' + CONFIG_HOST_CLASS + ' .pmk-context-config:focus{opacity:.85;}',
      '#' + POPOVER_ID + '{',
      '  position:fixed;z-index:1065;display:none;box-sizing:border-box;',
      '  min-width:220px;max-width:min(360px,calc(100vw - 20px));max-height:min(70vh,520px);',
      '  overflow:auto;background:#fff;border:1px solid rgba(0,0,0,.18);border-radius:.35rem;',
      '  box-shadow:0 .25rem .75rem rgba(0,0,0,.16);color:#212529;',
      '}',
      '#' + POPOVER_ID + '.pmk065-open{display:block;}',
      '#' + POPOVER_ID + ' .pmk065-head{',
      '  display:flex;align-items:center;justify-content:space-between;gap:.6rem;',
      '  padding:.55rem .7rem;border-bottom:1px solid #e5e5e5;background:#f8f9fa;',
      '}',
      '#' + POPOVER_ID + ' .pmk065-title{font-weight:600;font-size:.95rem;}',
      '#' + POPOVER_ID + ' .pmk065-close{',
      '  border:0;background:transparent;color:#555;padding:.05rem .25rem;font-size:1.15rem;line-height:1;cursor:pointer;',
      '}',
      '#' + POPOVER_ID + ' .pmk065-list{list-style:none;margin:0;padding:.35rem 0;}',
      '#' + POPOVER_ID + ' .pmk065-list li{margin:0;padding:0;}',
      '#' + POPOVER_ID + ' .pmk065-list a{',
      '  display:flex;align-items:center;gap:.45rem;padding:.42rem .7rem;text-decoration:none;word-break:break-word;',
      '}',
      '#' + POPOVER_ID + ' .pmk065-list a:hover,#' + POPOVER_ID + ' .pmk065-list a:focus{',
      '  background:#f1f3f5;text-decoration:none;',
      '}',
      '#' + POPOVER_ID + ' .pmk065-empty{padding:.65rem .7rem;color:#6c757d;font-style:italic;}',
      '@media(max-width:575.98px){',
      '  .' + TRIGGER_CLASS + '{min-width:1.4rem;min-height:1.4rem;opacity:.58;}',
      '  #' + POPOVER_ID + '{max-width:calc(100vw - 16px);}',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensurePopover() {
    var popover = document.getElementById(POPOVER_ID);
    if (popover) return popover;

    popover = document.createElement('div');
    popover.id = POPOVER_ID;
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-modal', 'false');
    popover.setAttribute('aria-hidden', 'true');
    document.body.appendChild(popover);
    return popover;
  }

  function normalizeSourceValue(value) {
    return text(value);
  }

  function sourceValueFromHref(element) {
    if (!element || !element.matches || !element.matches('a[href]')) return '';
    try {
      var url = new URL(element.getAttribute('href'), window.location.origin);
      if (url.searchParams.get('idx') !== 'callnum') return '';
      var value = normalizeSourceValue(url.searchParams.get('q') || '');
      if (value.length >= 2 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
        value = value.slice(1, -1).trim();
      }
      return value;
    } catch (_) {
      return '';
    }
  }

  function sourceValueFromElement(element) {
    if (!element) return '';

    var stored = text(element.getAttribute && element.getAttribute(SOURCE_ATTR));
    if (stored) return stored;

    var fromHref = sourceValueFromHref(element);
    if (fromHref) {
      try { element.setAttribute(SOURCE_ATTR, fromHref); } catch (_) {}
      return fromHref;
    }

    try {
      var cloneNode = element.cloneNode(true);
      Array.prototype.slice.call(cloneNode.querySelectorAll('.' + TRIGGER_CLASS + ',#' + POPOVER_ID + ',.pmk-context-config,.' + CONFIG_HOST_CLASS)).forEach(function (node) {
        node.remove();
      });
      var value = normalizeSourceValue(cloneNode.textContent || '');
      if (value) element.setAttribute(SOURCE_ATTR, value);
      return value;
    } catch (_) {
      return normalizeSourceValue(element.textContent || '');
    }
  }

  function prefixesBySeparators(value, separators) {
    var source = normalizeSourceValue(value);
    if (!source) return [];
    var results = [];
    var seen = Object.create(null);

    function push(part) {
      part = normalizeSourceValue(part).replace(/[.\-/:]+$/g, '').trim();
      if (!part || seen[part]) return;
      seen[part] = true;
      results.push(part);
    }

    for (var i = 0; i < source.length; i += 1) {
      var char = source.charAt(i);
      if (separators(char)) push(source.slice(0, i));
    }
    return results;
  }

  function buildLevels(value, config) {
    var source = normalizeSourceValue(value);
    if (!source) return [];

    var behavior = (config && config.behavior) || {};
    var mode = text(behavior.splitMode) || 'auto';
    var levels = [];

    if (mode === 'full-only') {
      levels = [];
    } else if (mode === 'spaces') {
      levels = prefixesBySeparators(source, function (char) { return /\s/.test(char); });
    } else {
      levels = prefixesBySeparators(source, function (char) { return /\s/.test(char) || char === '.' || char === '/' || char === '-' || char === ':'; });
    }

    if (behavior.includeFull !== false) {
      if (levels.indexOf(source) === -1) levels.push(source);
    }

    if (!levels.length) levels.push(source);

    if (behavior.order === 'precise-first') levels.reverse();
    return levels;
  }

  function searchUrl(term, config) {
    var behavior = (config && config.behavior) || {};
    var query = normalizeSourceValue(term);
    if (behavior.quoteQuery === true) query = '"' + query.replace(/^"|"$/g, '') + '"';
    return '/cgi-bin/koha/catalogue/search.pl?idx=callnum&q=' + encodeURIComponent(query);
  }

  function closePopover(options) {
    var opts = options || {};
    var popover = activePopover || document.getElementById(POPOVER_ID);
    if (popover) {
      popover.classList.remove('pmk065-open');
      popover.setAttribute('aria-hidden', 'true');
      popover.innerHTML = '';
    }
    if (activeTrigger) activeTrigger.setAttribute('aria-expanded', 'false');
    var trigger = activeTrigger;
    activePopover = null;
    activeTrigger = null;
    if (opts.restoreFocus && trigger && typeof trigger.focus === 'function') {
      try { trigger.focus(); } catch (_) {}
    }
  }

  function positionPopover(popover, trigger) {
    if (!popover || !trigger) return;
    var rect = trigger.getBoundingClientRect();
    var margin = 8;
    var width = popover.offsetWidth || 260;
    var height = popover.offsetHeight || 180;
    var left = rect.left;
    var top = rect.bottom + 6;

    if (left + width > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - width - margin);
    if (left < margin) left = margin;

    if (top + height > window.innerHeight - margin && rect.top - height - 6 >= margin) {
      top = rect.top - height - 6;
    }
    if (top < margin) top = margin;

    popover.style.left = Math.round(left) + 'px';
    popover.style.top = Math.round(top) + 'px';
  }

  function openPopover(trigger, sourceValue) {
    var levels = buildLevels(sourceValue, currentConfig);
    if (!levels.length) return;

    injectStyles();
    var popover = ensurePopover();
    closePopover();

    var head = document.createElement('div');
    head.className = 'pmk065-head';

    var title = document.createElement('div');
    title.className = 'pmk065-title';
    title.id = 'pmk065-popover-title';
    title.textContent = language() === 'en'
      ? text(currentConfig.labels && currentConfig.labels.titleEn) || 'Search by call number'
      : text(currentConfig.labels && currentConfig.labels.titleFr) || 'Rechercher par cote';
    head.appendChild(title);

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'pmk065-close';
    close.setAttribute('aria-label', t('Fermer', 'Close'));
    close.innerHTML = '<span aria-hidden="true">×</span>';
    close.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      closePopover({ restoreFocus: true });
    });
    head.appendChild(close);
    popover.appendChild(head);

    var list = document.createElement('ul');
    list.className = 'pmk065-list';
    levels.forEach(function (level) {
      var li = document.createElement('li');
      var link = document.createElement('a');
      link.href = searchUrl(level, currentConfig);
      link.textContent = level;
      link.setAttribute('data-pmk065-level', level);
      li.appendChild(link);
      list.appendChild(li);
    });
    popover.appendChild(list);

    popover.setAttribute('aria-labelledby', title.id);
    popover.setAttribute('aria-hidden', 'false');
    popover.classList.add('pmk065-open');
    trigger.setAttribute('aria-expanded', 'true');

    activePopover = popover;
    activeTrigger = trigger;
    positionPopover(popover, trigger);

    window.setTimeout(function () {
      var first = popover.querySelector('a');
      if (first && typeof first.focus === 'function') first.focus();
    }, 0);
  }

  function createTrigger(targetElement, targetConfig) {
    var sourceValue = sourceValueFromElement(targetElement);
    if (!sourceValue) return null;

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-link btn-sm ' + TRIGGER_CLASS;
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', t('Rechercher à partir de cette cote', 'Search from this call number'));
    button.title = t('Autres recherches par cote', 'More call-number searches');
    button.innerHTML = '<span aria-hidden="true">▾</span>';
    button.setAttribute('data-pmk065-target-id', text(targetConfig && targetConfig.id));

    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (activeTrigger === button && activePopover && activePopover.classList.contains('pmk065-open')) {
        closePopover({ restoreFocus: true });
        return;
      }
      openPopover(button, sourceValueFromElement(targetElement));
    });


    return button;
  }

  function attachTarget(element, targetConfig) {
    if (!element || element.nodeType !== 1) return;
    if (element.getAttribute(PROCESSED_ATTR) === '1') return;
    if (element.closest && element.closest('#' + POPOVER_ID + ',#pmk-config-overlay')) return;

    var source = sourceValueFromElement(element);
    if (!source) return;

    var trigger = createTrigger(element, targetConfig);
    if (!trigger) return;

    try {
      if (element.matches('a,button,input,select,textarea')) {
        element.insertAdjacentElement('afterend', trigger);
      } else {
        element.appendChild(trigger);
      }
      element.setAttribute(PROCESSED_ATTR, '1');
    } catch (_) {
      try { trigger.remove(); } catch (__){ }
    }
  }

  function removeContextButton() {
    safeSelectorAll('[id^="pmk-config-callnumber-progressive-search-"]').forEach(function (node) {
      try { node.remove(); } catch (_) {}
    });
    safeSelectorAll('.' + CONFIG_HOST_CLASS).forEach(function (node) {
      try { node.remove(); } catch (_) {}
    });
  }

  function cleanupInjected() {
    closePopover();
    removeContextButton();
    safeSelectorAll('.' + TRIGGER_CLASS).forEach(function (node) {
      try { node.remove(); } catch (_) {}
    });
    safeSelectorAll('[' + PROCESSED_ATTR + ']').forEach(function (node) {
      try {
        node.removeAttribute(PROCESSED_ATTR);
        node.removeAttribute(SOURCE_ATTR);
      } catch (_) {}
    });
  }

  function applyConfig() {
    cleanupInjected();
    stopObserver();

    if (!currentConfig || currentConfig.enabled === false) return;
    var targets = activeTargets(currentConfig);
    if (!targets.length) return;

    injectStyles();
    targets.forEach(function (target) {
      safeSelectorAll(target.selector).forEach(function (element) {
        attachTarget(element, target);
      });
    });

    if (currentConfig.behavior && currentConfig.behavior.observeDom !== false) startObserver();
    mountContextButton(targets);
  }

  function reprocessDynamic() {
    if (!currentConfig || currentConfig.enabled === false) return;
    activeTargets(currentConfig).forEach(function (target) {
      safeSelectorAll(target.selector).forEach(function (element) {
        if (element.getAttribute(PROCESSED_ATTR) !== '1') attachTarget(element, target);
      });
    });
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(function () {
      if (observerTimer) window.clearTimeout(observerTimer);
      var delay = Number(currentConfig && currentConfig.behavior && currentConfig.behavior.observeDelay);
      if (!Number.isFinite(delay)) delay = 120;
      delay = Math.max(30, Math.min(2000, delay));
      observerTimer = window.setTimeout(function () {
        observerTimer = null;
        reprocessDynamic();
      }, delay);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) {
      try { observer.disconnect(); } catch (_) {}
      observer = null;
    }
    if (observerTimer) {
      window.clearTimeout(observerTimer);
      observerTimer = null;
    }
  }

  function createContextHost(firstTarget) {
    if (!firstTarget || !firstTarget.parentNode) return null;

    var existing = null;
    if (firstTarget.matches && firstTarget.matches('td,th')) {
      existing = firstTarget.querySelector('.' + CONFIG_HOST_CLASS);
    } else if (firstTarget.parentNode && firstTarget.parentNode.querySelector) {
      existing = firstTarget.parentNode.querySelector('.' + CONFIG_HOST_CLASS + '[data-pmk065-context-host="1"]');
    }
    if (existing) return existing;

    var host = document.createElement('span');
    host.className = CONFIG_HOST_CLASS;
    host.setAttribute('data-pmk065-context-host', '1');

    try {
      // Surtout ne jamais insérer le bouton APRÈS un <td>/<th> : cela créerait
      // une cellule/colonne parasite. Le raccourci vit dans le contenu existant.
      if (firstTarget.matches && firstTarget.matches('td,th')) {
        firstTarget.appendChild(host);
      } else {
        firstTarget.insertAdjacentElement('afterend', host);
      }
      return host;
    } catch (_) {
      try { host.remove(); } catch (__){ }
      return null;
    }
  }

  function mountContextButton(targets) {
    if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== 'function') return;
    if (!window.PMKConfig.canOpenAdmin || !window.PMKConfig.canOpenAdmin()) return;

    var firstTarget = null;
    for (var i = 0; i < targets.length && !firstTarget; i += 1) {
      var found = safeSelectorAll(targets[i].selector);
      if (found.length) firstTarget = found[0];
    }
    if (!firstTarget) return;

    var host = createContextHost(firstTarget);
    if (!host) return;

    try {
      window.PMKConfig.mountContextButton({
        moduleId: MODULE_ID,
        anchor: host,
        contextKey: 'page-' + window.location.pathname,
        context: {
          sectionId: 'targets',
          pagePath: window.location.pathname
        }
      });
    } catch (_) {}
  }

  function bindGlobalHandlers() {
    if (outsideHandlerBound) return;
    outsideHandlerBound = true;

    document.addEventListener('click', function (event) {
      if (!activePopover) return;
      if (activePopover.contains(event.target)) return;
      if (activeTrigger && activeTrigger.contains(event.target)) return;
      closePopover();
    }, true);

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !activePopover) return;
      event.preventDefault();
      closePopover({ restoreFocus: true });
    }, true);

    window.addEventListener('resize', function () {
      if (activePopover && activeTrigger) positionPopover(activePopover, activeTrigger);
    });
    window.addEventListener('scroll', function () {
      if (activePopover && activeTrigger) positionPopover(activePopover, activeTrigger);
    }, true);
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

    if (typeof window.PMKConfig.subscribe === 'function') {
      window.PMKConfig.subscribe(MODULE_ID, function (config) {
        currentConfig = merge(DEFAULT_CONFIG, config || {});
        applyConfig();
      });
    }
    return true;
  }

  function boot() {
    bindGlobalHandlers();

    if (loadWithPMK()) return;

    // Mode dégradé : le script garde ses valeurs historiques si le socle PMK
    // n'est pas chargé. Dès que PMK Config devient disponible, on recharge la
    // configuration centrale et on remplace proprement ce rendu temporaire.
    currentConfig = clone(DEFAULT_CONFIG);
    applyConfig();

    window.addEventListener('pmk:config-ready', function () {
      loadWithPMK();
    }, { once: true });
  }

  window.PMK065 = {
    moduleId: MODULE_ID,
    defaults: clone(DEFAULT_CONFIG),
    refresh: function () { applyConfig(); },
    buildLevels: function (value) { return buildLevels(value, currentConfig); },
    getConfig: function () { return clone(currentConfig); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

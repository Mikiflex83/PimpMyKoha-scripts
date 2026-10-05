/*
 Nom du fichier: guides/000d-guide-accompagnement.js
 Version: 20260908-v6
 Description: Mode accompagnement contextuel. Réutilise les étapes Intro.js existantes
              et ajoute quelques points d'aide discrets sur les éléments stratégiques.
*/
(function(){
  'use strict';
  if (window.__kohaGuideAccompagnementLoadedV6) return;
  window.__kohaGuideAccompagnementLoadedV6 = true;
  if (!window.KOHA_GUIDES) return;

  const k = window.KOHA_GUIDES;
  const KEY = 'kohaGuideAssistEnabled';
  const MAX_POINTS = 7;
  let renderTimer = null;
  let rendering = false;
  let observer = null;

  const ROUTE_PRIORITIES = [
    [/\/catalogue\/search\.pl$/, ['facette','index','tri','filtre','rebond','bibliothèque actuelle','localisation','cote','statut','code-barres']],
    [/\/catalogue\/detail\.pl$/, ['bibliothèque actuelle','bibliothèque de rattachement','localisation','cote','statut','code-barres','mouvements','historique de prêt']],
    [/\/catalogue\/itemsearch\.pl$/, ['entonnoir','bibliothèque','localisation','cote','code-barres','statut','résultat']],
    [/\/tools\/stage-marc-import\.pl$/, ['fichier','profil','type de notices','encodage','règle de concordance','correspondance','exemplaire','mettre en réservoir']],
    [/\/tools\/manage-marc-import\.pl$/, ['règle de concordance','correspondance','score','différence','grille','import','annuler']],
    [/\/admin\/matching-rules\.pl$/, ['règle','champ','sous-champ','score','seuil','index','concordance']],
    [/\/admin\/marc-overlay-rules\.pl$/, ['recouvrement','règle','source','champ','ajouter','remplacer','supprimer']],
    [/\/members\/memberentry\.pl$/, ['numéro de carte','catégorie','bibliothèque d’inscription','code postal','commune','courriel','date','enregistrer','validation']],
    [/\/members\/moremember\.pl$/, ['coordonnées','prêts en cours','réservations','historique','compte','modifier']],
    [/\/circ\/circulation\.pl$/, ['coordonnées','alerte','code-barres','validation','prêts en cours','réservations']],
    [/\/circ\/returns\.pl$/, ['retour','code-barres','site','tableau','message','réservation','transfert']],
    [/\/circ\/branchtransfers\.pl$/, ['destination','code-barres','ignorer','statut','démarrer','progression']],
    [/\/cataloguing\/addbiblio\.pl$/, ['grille','titre','auteur','autorité','6xx','indexation','isbn','enregistrer']],
    [/\/cataloguing\/additem\.pl$/, ['bibliothèque','localisation','cote','code-barres','statut','collection','enregistrer']],
    [/\/reserve\/request\.pl$/, ['adhérent','retrait','exemplaire','priorité','réservation','validation']],
    [/\/suggestion\/suggestion\.pl$/, ['adhérent','titre','statut','site','demandeur','validation']],
    [/\/serials\//, ['abonnement','périodicité','fascicule','numérotation','bulletin','réclamation','réception']],
    [/\/acqui\//, ['fournisseur','panier','commande','budget','réception','facture','prix']],
    [/\/authorities\//, ['forme','variante','autorité','notice','lien','fusion','doublon']],
    [/\/reports\//, ['paramètre','résultat','colonne','filtre','export','sql']],
    [/\/tools\/batch/, ['lot','sélection','identifiant','modification','suppression','validation']],
    [/\/admin\/smart-rules\.pl$/, ['règle','catégorie','type de document','bibliothèque','prêt','réservation']],
    [/\/admin\/preferences\.pl$/, ['préférence','valeur','recherche','enregistrer']],
    [/\/admin\/authorised_values\.pl$/, ['valeur autorisée','catégorie','code','description']],
  ];

  const GENERAL_KEYWORDS = [
    'facette','index','tri','filtre','rebond','cote','code-barres','barcode','localisation','statut',
    'bibliothèque actuelle','bibliothèque de rattachement','règle de concordance','correspondance','recouvrement',
    'profil','encodage','mettre en réservoir','exemplaire','numéro de carte','catégorie','bibliothèque d’inscription',
    'validation','enregistrer','sauvegarder','réservation','transfert','autorité','grille','indexation','rapport',
    'paramètre','périodicité','fascicule','commande','réception','facture','préférence','règle de circulation'
  ];

  const EXCLUDE_TITLES = [
    'repère de parcours','pour continuer','repère bibliothéconomique','relancer le guide','barre d’outils transversale',
    'accueil koha','repère de page','barre d’outils locale','sommaire'
  ];

  function norm(value){
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
  }

  function titleOf(step){
    const box = document.createElement('div');
    box.innerHTML = step && step.intro ? step.intro : '';
    const node = box.querySelector('.kg-guide-title');
    return (node ? node.textContent : box.textContent || '').trim();
  }

  function pathPriorities(){
    const path = window.location.pathname || '';
    const hit = ROUTE_PRIORITIES.find(([rx]) => rx.test(path));
    return hit ? hit[1].map(norm) : [];
  }

  function groupFor(title){
    const t = norm(title);
    if (/facette|index|tri|filtre/.test(t)) return 'search-refine';
    if (/rebond/.test(t)) return 'search-bounce';
    if (/bibliotheque actuelle|bibliotheque de rattachement|localisation|cote|statut|code-barres|barcode/.test(t)) return 'find-item';
    if (/concordance|correspondance|recouvrement|score|matching/.test(t)) return 'marc-match';
    if (/exemplaire|analyser les exemplaires|traitement des exemplaires/.test(t) && /reservoir|marc|import|traitement/.test(t)) return 'marc-items';
    if (/numero de carte|categorie|bibliotheque d'inscription|code postal|commune|courriel/.test(t)) return 'patron-identity';
    if (/pret|code-barres|validation|reservations/.test(t) && /pret|circulation|reservation|code-barres/.test(t)) return 'circulation';
    if (/autorite|forme retenue|variante|fusion|doublon/.test(t)) return 'authorities';
    return '';
  }

  function scoreStep(step, index){
    if (!step || !step.element || !k.isVisible(step.element)) return -999;
    const title = titleOf(step);
    const t = norm(title);
    if (!t) return -999;
    if (EXCLUDE_TITLES.some(x => t.includes(norm(x)))) return -999;
    if (step.element.closest && step.element.closest('#bottomActionBar,#kg-guide-catalogue-overlay,.introjs-tooltip,.introjs-helperLayer')) return -999;

    let score = 0;
    const route = pathPriorities();
    route.forEach((kw, i) => { if (t.includes(kw)) score = Math.max(score, 140 - i * 7); });
    GENERAL_KEYWORDS.forEach((kw, i) => { if (t.includes(norm(kw))) score = Math.max(score, 90 - Math.min(i, 30)); });

    const tag = (step.element.tagName || '').toLowerCase();
    if (/^(input|select|textarea|th|label|button|a)$/.test(tag)) score += 12;
    if (step.element.id) score += 4;
    const rect = step.element.getBoundingClientRect ? step.element.getBoundingClientRect() : {width:0,height:0};
    if (rect.width > window.innerWidth * .82 && rect.height > 250) score -= 25;
    if (index < 2) score -= 8;
    return score;
  }

  function findAnchor(el){
    if (!el || !el.isConnected) return null;
    if (el.id) {
      try {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label && k.isVisible(label)) return label;
      } catch(_){}
    }
    const th = el.matches && el.matches('th') ? el : (el.closest ? el.closest('th') : null);
    if (th) return th.querySelector('.dt-column-title') || th;

    if (el.matches && el.matches('td')) {
      const table = el.closest('table');
      const dataLabel = el.getAttribute('data-label');
      if (table && dataLabel) {
        try {
          const header = table.querySelector(`thead th[data-colname="${CSS.escape(dataLabel)}"], thead th#holdings_${CSS.escape(dataLabel)}, thead th.${CSS.escape(dataLabel)}`);
          if (header && k.isVisible(header)) return header.querySelector('.dt-column-title') || header;
        } catch(_){}
      }
    }

    if (el.matches && el.matches('input,select,textarea')) {
      const wrap = el.closest('li,.form-group,.form-row,.row,.field,.col-sm-6,.col-md-6,fieldset');
      if (wrap) {
        const label = Array.from(wrap.querySelectorAll('label,legend,.label,strong')).find(k.isVisible);
        if (label) return label;
      }
    }

    if (el.matches && el.matches('h1,h2,h3,h4,h5,label,legend,strong,.label')) return el;
    if (el.matches && el.matches('button,a')) return el;

    const heading = el.querySelector ? Array.from(el.querySelectorAll(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > legend,:scope > label,:scope > strong')).find(k.isVisible) : null;
    if (heading) return heading;

    const prev = el.previousElementSibling;
    if (prev && prev.matches && prev.matches('h1,h2,h3,h4,h5,label,legend,strong,.label') && k.isVisible(prev)) return prev;
    return el;
  }

  function pickSteps(){
    const steps = k.getSteps();
    const ranked = steps.map((step,index) => ({step,index,title:titleOf(step),score:scoreStep(step,index)}))
      .filter(x => x.score > 35)
      .sort((a,b) => b.score - a.score || a.index - b.index);

    const picked = [];
    const anchors = new Set();
    for (const item of ranked) {
      const anchor = findAnchor(item.step.element);
      if (!anchor || !anchor.isConnected || !k.isVisible(anchor)) continue;
      if (anchors.has(anchor)) continue;
      const tooNear = picked.some(p => p.anchor.contains(anchor) || anchor.contains(p.anchor));
      if (tooNear && item.score < 100) continue;
      anchors.add(anchor);
      picked.push({...item, anchor});
      if (picked.length >= MAX_POINTS) break;
    }
    return {steps, picked};
  }

  function stepsForClick(allSteps, selected){
    const group = groupFor(selected.title);
    if (!group) return [selected.step];
    const grouped = allSteps.filter(step => groupFor(titleOf(step)) === group && step.element && k.isVisible(step.element));
    if (!grouped.length) return [selected.step];
    const idx = grouped.indexOf(selected.step);
    if (idx < 0) return grouped.slice(0, 5);
    const start = Math.max(0, idx - (group === 'find-item' ? 1 : 0));
    return grouped.slice(start, start + (group === 'find-item' ? 5 : 4));
  }

  function clearPoints(){
    document.querySelectorAll('.kg-assist-trigger').forEach(n => n.remove());
    document.querySelectorAll('[data-kg-assist-host="1"]').forEach(n => {
      n.removeAttribute('data-kg-assist-host');
      if (n.dataset.kgAssistOldPosition !== undefined) {
        n.style.position = n.dataset.kgAssistOldPosition;
        delete n.dataset.kgAssistOldPosition;
      }
    });
  }

  function makeButton(item, allSteps){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kg-assist-trigger';
    btn.textContent = '?';
    btn.title = `Aide contextuelle — ${item.title}`;
    btn.setAttribute('aria-label', `Aide contextuelle : ${item.title}`);
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      k.startSteps(stepsForClick(allSteps, item));
    });
    return btn;
  }

  function placeButton(item, allSteps){
    const anchor = item.anchor;
    const btn = makeButton(item, allSteps);
    const tag = (anchor.tagName || '').toLowerCase();

    if (tag === 'th' || anchor.matches('.dt-column-title,label,legend,h1,h2,h3,h4,h5,strong,.label')) {
      anchor.appendChild(btn);
      return;
    }
    if (tag === 'button' || tag === 'a') {
      anchor.insertAdjacentElement('afterend', btn);
      return;
    }

    const rect = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : {width:0,height:0};
    if (rect.width > 180 || rect.height > 55) {
      const cs = getComputedStyle(anchor);
      anchor.dataset.kgAssistOldPosition = anchor.style.position || '';
      if (cs.position === 'static') anchor.style.position = 'relative';
      anchor.dataset.kgAssistHost = '1';
      btn.classList.add('is-corner');
      anchor.appendChild(btn);
    } else {
      anchor.insertAdjacentElement('afterend', btn);
    }
  }

  function enabled(){ return localStorage.getItem(KEY) === '1'; }

  function render(){
    if (rendering) return;
    rendering = true;
    try {
      clearPoints();
      if (!enabled()) return;
      const {steps,picked} = pickSteps();
      picked.forEach(item => placeButton(item, steps));
    } finally {
      rendering = false;
    }
  }

  function schedule(){
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 180);
  }

  function addStyles(){
    if (document.getElementById('kg-assist-style-v6')) return;
    const st = document.createElement('style');
    st.id = 'kg-assist-style-v6';
    st.textContent = `
      .kg-assist-trigger{display:inline-flex!important;align-items:center;justify-content:center;width:17px;height:17px;min-width:17px;padding:0!important;margin-left:5px!important;border:1px solid #90a4ae!important;border-radius:50%!important;background:#fff!important;color:#546e7a!important;font:700 11px/1 Arial,sans-serif!important;vertical-align:middle!important;cursor:pointer!important;box-shadow:none!important;opacity:.72;position:relative;z-index:2}
      .kg-assist-trigger:hover,.kg-assist-trigger:focus{opacity:1;background:#e0f2f1!important;border-color:#00897b!important;color:#00695c!important;outline:2px solid rgba(0,137,123,.16);outline-offset:1px}
      .kg-assist-trigger.is-corner{position:absolute!important;top:5px!important;right:5px!important;margin:0!important;z-index:6}
      .introjs-helperLayer .kg-assist-trigger,.introjs-tooltip .kg-assist-trigger{visibility:hidden!important}
      @media(max-width:700px){.kg-assist-trigger{width:19px;height:19px;min-width:19px}}
    `;
    document.head.appendChild(st);
  }

  function setEnabled(value){
    localStorage.setItem(KEY, value ? '1' : '0');
    document.dispatchEvent(new CustomEvent('koha-guides-assist-toggle', { detail:{ enabled:!!value } }));
  }

  function init(){
    addStyles();
    render();
    document.addEventListener('koha-guides-assist-toggle', render);
    window.addEventListener('storage', e => { if (e.key === KEY) render(); });

    observer = new MutationObserver(mutations => {
      if (rendering || !enabled()) return;
      const meaningful = mutations.some(m => Array.from(m.addedNodes || []).some(n => !(n.nodeType === 1 && n.classList && n.classList.contains('kg-assist-trigger'))));
      if (meaningful) schedule();
    });
    observer.observe(document.body || document.documentElement, {childList:true,subtree:true});
  }

  window.KOHA_GUIDES.assist = { enabled, setEnabled, refresh:render, key:KEY };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();

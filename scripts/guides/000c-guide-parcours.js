/*
 Nom du fichier: guides/000c-guide-parcours.js
 Version: 20260909-v6.2
 Description: Sommaire, niveaux de difficulté, parcours pédagogiques et suites logiques des guides Koha.
*/
(function(){
  'use strict';
  if (window.__kohaGuideParcoursLoadedV620) return;
  window.__kohaGuideParcoursLoadedV620 = true;
  if (!window.KOHA_GUIDES) return;

  const k = window.KOHA_GUIDES;
  const ROOT = '/cgi-bin/koha/';
  const ASSIST_KEY = 'kohaGuideAssistEnabled';

  const LEVELS = {
    1: { label: 'Débutant', className: 'kg-level-1', why: 'Repères et gestes courants, sans prérequis technique.' },
    2: { label: 'Intermédiaire', className: 'kg-level-2', why: 'Nécessite de comprendre la différence notice / exemplaire et le fonctionnement général de Koha.' },
    3: { label: 'Avancé', className: 'kg-level-3', why: 'Action structurante ou traitement de données qui demande contrôle et méthode.' },
    4: { label: 'Expert', className: 'kg-level-4', why: 'Configuration ou opération potentiellement globale, destructive ou difficile à annuler.' }
  };

  const MODULES = [
    {
      id:'decouvrir', title:'Découvrir Koha', icon:'🧭', level:1,
      desc:'Comprendre les grands modules, les niveaux de données et la logique de navigation.',
      links:[
        ['Accueil Koha','mainpage.pl'],
        ['Circulation','circ/circulation-home.pl'],
        ['Recherche catalogue','catalogue/search.pl']
      ]
    },
    {
      id:'recherche', title:'Rechercher et retrouver un document', icon:'🔎', level:1,
      desc:'Recherche simple et avancée, index, opérateurs, facettes, tris, rebonds et lecture des exemplaires.',
      links:[
        ['Recherche catalogue','catalogue/search.pl'],
        ['Recherche d’exemplaires','catalogue/itemsearch.pl'],
        ['Historique de recherche','catalogue/search-history.pl']
      ]
    },
    {
      id:'catalogue', title:'Catalogue et exemplaires', icon:'📚', level:2,
      desc:'Lire une notice bibliographique, comprendre ses exemplaires et utiliser les données locales pour trouver le document physique.',
      links:[
        ['Recherche catalogue','catalogue/search.pl'],
        ['Détail d’une notice','catalogue/search.pl'],
        ['Recherche d’exemplaires','catalogue/itemsearch.pl']
      ]
    },
    {
      id:'circulation', title:'Circulation', icon:'🔄', level:1,
      desc:'Prêts, retours, renouvellements, réservations et transferts.',
      links:[
        ['Accueil circulation','circ/circulation-home.pl'],
        ['Prêter','circ/circulation.pl'],
        ['Retour','circ/returns.pl'],
        ['Transferts','circ/branchtransfers.pl']
      ]
    },
    {
      id:'adherents', title:'Adhérents', icon:'👤', level:1,
      desc:'Recherche, création, modification, droits, historique et compte financier.',
      links:[
        ['Rechercher un adhérent','members/members-home.pl'],
        ['Créer / modifier','members/memberentry.pl']
      ]
    },
    {
      id:'catalogage', title:'Catalogage', icon:'✍️', level:3,
      desc:'Créer et modifier notices et exemplaires, comprendre les grilles MARC et les conséquences d’une modification.',
      links:[
        ['Accueil catalogage','cataloguing/cataloging-home.pl'],
        ['Nouvelle notice','cataloguing/addbiblio.pl'],
        ['Exemplaires','cataloguing/additem.pl'],
        ['Z39.50 / SRU','cataloguing/z3950_search.pl']
      ]
    },
    {
      id:'autorites', title:'Autorités', icon:'🧩', level:3,
      desc:'Formes retenues, variantes, liens notices–autorités, dédoublonnage et qualité des accès.',
      links:[
        ['Accueil autorités','authorities/authorities-home.pl'],
        ['Recherche / édition','authorities/authorities.pl']
      ]
    },
    {
      id:'imports', title:'Imports MARC et traitements de lots', icon:'📥', level:4,
      desc:'Mise en réservoir, règles de concordance, recouvrement, import, contrôle et opérations par lots.',
      links:[
        ['Mettre un fichier MARC en réservoir','tools/stage-marc-import.pl'],
        ['Gérer les lots MARC','tools/manage-marc-import.pl'],
        ['Règles de concordance','admin/matching-rules.pl'],
        ['Règles de recouvrement','admin/marc-overlay-rules.pl']
      ]
    },
    {
      id:'acquisitions', title:'Acquisitions', icon:'🛒', level:2,
      desc:'Fournisseurs, paniers, commandes, réception, factures et suivi budgétaire.',
      links:[
        ['Accueil acquisitions','acqui/acqui-home.pl'],
        ['Suggestions','suggestion/suggestion.pl']
      ]
    },
    {
      id:'periodiques', title:'Périodiques', icon:'📰', level:2,
      desc:'Abonnements, périodicité, bulletinage, numérotation et réclamations.',
      links:[
        ['Accueil périodiques','serials/serials-home.pl'],
        ['Recherche d’abonnements','serials/serials-search.pl'],
        ['Nouvel abonnement','serials/subscription-add.pl']
      ]
    },
    {
      id:'rapports', title:'Rapports', icon:'📊', level:2,
      desc:'Exécuter, lire et construire des rapports, distinguer données bibliographiques et données d’exemplaire.',
      links:[
        ['Accueil rapports','reports/reports-home.pl'],
        ['Rapports enregistrés','reports/guided_reports.pl']
      ]
    },
    {
      id:'outils', title:'Outils', icon:'🧰', level:3,
      desc:'Inventaire, imports, modifications par lots, journaux et autres opérations transversales.',
      links:[
        ['Accueil outils','tools/tools-home.pl'],
        ['Inventaire','tools/inventory.pl'],
        ['Journaux','tools/viewlog.pl']
      ]
    },
    {
      id:'administration', title:'Administration', icon:'⚙️', level:4,
      desc:'Préférences système, règles de circulation, bibliothèques, types de document, valeurs autorisées et structure MARC.',
      links:[
        ['Accueil administration','admin/admin-home.pl'],
        ['Préférences système','admin/preferences.pl'],
        ['Règles de circulation','admin/smart-rules.pl'],
        ['Valeurs autorisées','admin/authorised_values.pl']
      ]
    }
  ];

  const ROUTES = [
    [/\/mainpage\.pl$|^\/$|^$/, 'Découvrir Koha', 1, 'decouvrir', 'Commencez par la recherche catalogue pour passer de la navigation générale à un cas concret.', 'catalogue/search.pl'],
    [/\/catalogue\/search\.pl$/, 'Recherche catalogue', 1, 'recherche', 'Suite conseillée : ouvrez une notice pertinente dans les résultats et relancez le guide sur sa fiche détaillée.', 'catalogue/search.pl'],
    [/\/catalogue\/detail\.pl$/, 'Lire une notice et ses exemplaires', 2, 'catalogue', 'Suite conseillée : entraînez-vous à retrouver un exemplaire à partir de son site, sa localisation, sa cote et son code-barres.', 'catalogue/itemsearch.pl'],
    [/\/catalogue\/(itemsearch|moredetail|issuehistory|search-history|showmarc|showelastic)\.pl$/, 'Exploiter le catalogue', 2, 'catalogue', 'Suite conseillée : revenez à une notice complète pour relier données bibliographiques et données d’exemplaire.', 'catalogue/search.pl'],
    [/\/circ\//, 'Circulation', 1, 'circulation', 'Suite conseillée : consultez ensuite une fiche adhérent pour comprendre comment droits et transactions se rejoignent.', 'members/members-home.pl'],
    [/\/reserve\//, 'Réservations', 2, 'circulation', 'Suite conseillée : consultez la file des réservations et les réservations en attente.', 'circ/view_holdsqueue.pl'],
    [/\/members\//, 'Gestion des adhérents', 1, 'adherents', 'Suite conseillée : passez à la circulation pour voir comment catégorie, droits et prêts interagissent.', 'circ/circulation-home.pl'],
    [/\/cataloguing\//, 'Catalogage', 3, 'catalogage', 'Suite conseillée : abordez les autorités, puis les imports MARC lorsque la création et la modification manuelles sont maîtrisées.', 'authorities/authorities-home.pl'],
    [/\/authorities\//, 'Autorités', 3, 'autorites', 'Suite conseillée : revenez au catalogage pour observer comment les accès contrôlés se lient aux notices.', 'cataloguing/cataloging-home.pl'],
    [/\/tools\/(stage-marc-import|manage-marc-import|showdiffmarc)\.pl$/, 'Import MARC', 4, 'imports', 'Suite conseillée : contrôlez les règles de concordance et de recouvrement avant tout flux récurrent.', 'admin/matching-rules.pl'],
    [/\/tools\/(batchMod|batch_record_modification|batch_delete_records|marc_modification_templates|import_borrowers|modborrowers|cleanborrowers|batch_extend_due_dates|inventory|viewlog|export)\.pl$/, 'Outils et traitements de masse', 3, 'outils', 'Suite conseillée : apprenez à conserver une liste d’identifiants et à contrôler un échantillon avant chaque traitement massif.', 'tools/tools-home.pl'],
    [/\/tools\/tools-home\.pl$/, 'Outils', 2, 'outils', 'Suite conseillée : choisissez un outil en fonction du niveau de donnée à traiter : notice, exemplaire, adhérent ou transaction.', 'tools/inventory.pl'],
    [/\/tools\/page\.pl$/, 'Outil local', 2, 'outils', 'Suite conseillée : identifiez d’abord les données manipulées et le périmètre avant de lancer une action.', 'tools/tools-home.pl'],
    [/\/reports\//, 'Rapports', 2, 'rapports', 'Suite conseillée : entraînez-vous à distinguer les tables de notices, d’exemplaires et de transactions.', 'reports/reports-home.pl'],
    [/\/suggestion\//, 'Suggestions d’achat', 2, 'acquisitions', 'Suite conseillée : poursuivez vers le module acquisitions pour comprendre le passage suggestion → commande → réception.', 'acqui/acqui-home.pl'],
    [/\/acqui\//, 'Acquisitions', 2, 'acquisitions', 'Suite conseillée : après la réception, contrôlez les exemplaires créés et leur rattachement bibliographique.', 'catalogue/itemsearch.pl'],
    [/\/serials\//, 'Périodiques', 2, 'periodiques', 'Suite conseillée : liez abonnement, fascicules reçus et notice bibliographique.', 'serials/serials-home.pl'],
    [/\/admin\/(preferences|smart-rules|authorised_values|matching-rules|marc-overlay-rules|record_sources|branches|itemtypes|categories|columns_settings|biblio_framework|marctagstructure|admin-home|background_jobs)\.pl$/, 'Administration', 4, 'administration', 'Suite conseillée : documentez toute modification structurante et testez-la sur un cas maîtrisé avant généralisation.', 'admin/admin-home.pl'],
    [/\/virtualshelves\//, 'Listes Koha', 2, 'catalogue', 'Suite conseillée : comparez les listes pérennes Koha avec les listes temporaires de travail.', 'catalogue/search.pl'],
    [/\/course_reserves\//, 'Réserves de cours', 2, 'circulation', 'Suite conseillée : contrôlez les exemplaires réellement concernés et leurs règles temporaires.', 'course_reserves/course.pl']
  ];

  function routeMeta(ctx){
    const path = ctx.path || '';
    for (const row of ROUTES) {
      if (row[0].test(path)) {
        return { title:row[1], level:row[2], moduleId:row[3], nextText:row[4], nextUrl:row[5] };
      }
    }
    return null;
  }

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function href(path){ return path.startsWith('http') ? path : ROOT + path.replace(/^\//,''); }
  function levelHtml(n){
    const l = LEVELS[n] || LEVELS[2];
    return `<span class="kg-difficulty ${l.className}">Niveau ${n}/4 · ${l.label}</span>`;
  }

  function addStyles(){
    if (document.getElementById('kg-learning-style')) return;
    const st = document.createElement('style');
    st.id = 'kg-learning-style';
    st.textContent = `
      .kg-difficulty{display:inline-flex;align-items:center;gap:4px;margin:0 0 8px;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:750;border:1px solid transparent}
      .kg-level-1{background:#e8f5e9;color:#256029;border-color:#b7dfba}.kg-level-2{background:#e3f2fd;color:#155b8a;border-color:#b8d9f0}.kg-level-3{background:#fff3e0;color:#8a4b08;border-color:#f2cf9e}.kg-level-4{background:#fce8e6;color:#8b2f28;border-color:#efb8b3}
      .kg-learning-objective{margin-top:8px;padding:8px 10px;border-radius:6px;background:#f4f7f7;border-left:3px solid #00897b;font-size:12px}
      .kg-next-links{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.kg-next-links a{display:inline-block;padding:5px 8px;border-radius:5px;background:#00695c;color:white!important;text-decoration:none;font-size:12px}
      .kg-funnel{display:flex;flex-direction:column;align-items:center;gap:3px;margin:10px 0}.kg-funnel div{box-sizing:border-box;text-align:center;padding:5px 7px;border:1px solid #b0bec5;background:#f8fafb;border-radius:4px;font-size:11px;font-weight:650}.kg-funnel .f1{width:100%}.kg-funnel .f2{width:88%}.kg-funnel .f3{width:74%}.kg-funnel .f4{width:60%}.kg-funnel .f5{width:46%;background:#e8f5e9;border-color:#a5d6a7}.kg-funnel-arrow{font-size:12px;color:#607d8b}
      #kg-guide-catalogue-overlay{position:fixed;inset:0;z-index:10000050;background:rgba(15,23,26,.64);display:none;align-items:flex-start;justify-content:center;padding:5vh 18px 28px;overflow:auto}
      #kg-guide-catalogue-overlay.is-open{display:flex}
      #kg-guide-catalogue{width:min(980px,100%);background:#fff;border-radius:12px;box-shadow:0 18px 55px rgba(0,0,0,.28);overflow:hidden;color:#263238}
      .kg-cat-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:18px 20px;background:#00695c;color:#fff}.kg-cat-head h2{margin:0 0 3px;font-size:20px}.kg-cat-head p{margin:0;font-size:12px;opacity:.9}.kg-cat-close{border:0;background:rgba(255,255,255,.16);color:#fff;border-radius:6px;width:36px;height:36px;font-size:22px;cursor:pointer}
      .kg-cat-tools{display:flex;gap:10px;align-items:center;padding:12px 16px;border-bottom:1px solid #e5e9eb;flex-wrap:wrap}.kg-cat-search{flex:1;min-width:240px;padding:8px 10px;border:1px solid #cfd8dc;border-radius:6px}.kg-cat-legend{font-size:11px;color:#607d8b}
      .kg-cat-body{padding:15px 16px 18px}.kg-cat-path{margin-bottom:15px;padding:12px;border:1px solid #dfe5e7;border-radius:8px;background:#fafcfc}.kg-cat-path strong{color:#00695c}.kg-cat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:10px}.kg-cat-card{border:1px solid #dfe5e7;border-radius:8px;padding:11px;background:#fff}.kg-cat-card h3{font-size:14px;margin:0 0 4px}.kg-cat-card p{font-size:12px;margin:5px 0 8px;color:#546e7a}.kg-cat-card-links{display:flex;gap:5px;flex-wrap:wrap}.kg-cat-card-links a{font-size:11px;padding:4px 6px;border-radius:4px;border:1px solid #b0bec5;color:#37474f;text-decoration:none;background:#fafafa}.kg-cat-card-links a:hover{background:#edf6f5;border-color:#80cbc4}.kg-cat-empty{padding:20px;text-align:center;color:#78909c}
      .kg-assist-setting{display:flex;align-items:center;gap:9px;padding:7px 10px;border:1px solid #d8e1e3;border-radius:8px;background:#f8fbfb;min-width:280px}.kg-assist-setting input{width:18px;height:18px;margin:0;accent-color:#00695c}.kg-assist-setting-main{display:flex;flex-direction:column;gap:1px;line-height:1.2}.kg-assist-setting-main strong{font-size:12px;color:#37474f}.kg-assist-setting-main small{font-size:10px;color:#607d8b;font-weight:400}.kg-assist-state{font-size:10px;font-weight:750;padding:2px 6px;border-radius:999px;background:#eceff1;color:#607d8b}.kg-assist-state.is-on{background:#e0f2f1;color:#00695c}
      @media(max-width:620px){.kg-cat-head{padding:14px}.kg-cat-body{padding:10px}.kg-cat-grid{grid-template-columns:1fr}#kg-guide-catalogue-overlay{padding:12px 8px}}
    `;
    document.head.appendChild(st);
  }

  function learningPathHtml(){
    return `<div class="kg-cat-path"><strong>Parcours conseillé pour prendre Koha en main</strong><br><span style="font-size:12px">1. Découvrir les modules → 2. Rechercher → 3. Lire notice et exemplaires → 4. Circulation → 5. Adhérents → 6. Catalogage → 7. Autorités → 8. Imports MARC / administration.</span></div>`;
  }

  function moduleCard(m){
    const links = m.links.map(([label,url]) => `<a href="${href(url)}">${esc(label)}</a>`).join('');
    return `<section class="kg-cat-card" data-search="${esc((m.title+' '+m.desc).toLowerCase())}"><h3>${m.icon} ${esc(m.title)}</h3>${levelHtml(m.level)}<p>${esc(m.desc)}</p><div class="kg-cat-card-links">${links}</div></section>`;
  }

  function ensureCatalogue(){
    addStyles();
    let overlay = document.getElementById('kg-guide-catalogue-overlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'kg-guide-catalogue-overlay';
    overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML = `<div id="kg-guide-catalogue" role="dialog" aria-modal="true" aria-labelledby="kg-cat-title">
      <div class="kg-cat-head"><div><h2 id="kg-cat-title">Sommaire des guides Koha</h2><p>Parcours métier, niveau de difficulté et accès direct aux écrans concernés.</p></div><button type="button" class="kg-cat-close" aria-label="Fermer">×</button></div>
      <div class="kg-cat-tools"><input type="search" class="kg-cat-search" placeholder="Rechercher un module ou un sujet…"><span class="kg-cat-legend">Niveaux : 1 repères · 2 pratique · 3 avancé · 4 structurant</span><label class="kg-assist-setting" for="kg-assist-toggle"><input type="checkbox" id="kg-assist-toggle"><span class="kg-assist-setting-main"><strong>Mode accompagnement <span class="kg-assist-state">désactivé</span></strong><small>Affiche quelques ? discrets aux endroits stratégiques de la page. Désactivé par défaut.</small></span></label></div>
      <div class="kg-cat-body">${learningPathHtml()}<div class="kg-cat-grid">${MODULES.map(moduleCard).join('')}</div><div class="kg-cat-empty" hidden>Aucun sujet ne correspond à cette recherche.</div></div>
    </div>`;
    document.body.appendChild(overlay);

    const close = () => { overlay.classList.remove('is-open'); overlay.setAttribute('aria-hidden','true'); };
    overlay.querySelector('.kg-cat-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('is-open')) close(); });
    const input = overlay.querySelector('.kg-cat-search');
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      let visible = 0;
      overlay.querySelectorAll('.kg-cat-card').forEach(card => {
        const ok = !q || card.dataset.search.includes(q) || card.textContent.toLowerCase().includes(q);
        card.hidden = !ok;
        if (ok) visible++;
      });
      overlay.querySelector('.kg-cat-empty').hidden = visible > 0;
    });

    const assistToggle = overlay.querySelector('#kg-assist-toggle');
    const assistState = overlay.querySelector('.kg-assist-state');
    const syncAssist = () => {
      const on = localStorage.getItem(ASSIST_KEY) === '1';
      assistToggle.checked = on;
      assistState.textContent = on ? 'activé' : 'désactivé';
      assistState.classList.toggle('is-on', on);
    };
    assistToggle.addEventListener('change', () => {
      const on = !!assistToggle.checked;
      localStorage.setItem(ASSIST_KEY, on ? '1' : '0');
      syncAssist();
      document.dispatchEvent(new CustomEvent('koha-guides-assist-toggle', { detail:{ enabled:on } }));
    });
    window.addEventListener('storage', e => { if (e.key === ASSIST_KEY) syncAssist(); });
    syncAssist();
    return overlay;
  }

  function openCatalogue(){
    const overlay = ensureCatalogue();
    const assistToggle = overlay.querySelector('#kg-assist-toggle');
    const assistState = overlay.querySelector('.kg-assist-state');
    if (assistToggle && assistState) {
      const on = localStorage.getItem(ASSIST_KEY) === '1';
      assistToggle.checked = on;
      assistState.textContent = on ? 'activé' : 'désactivé';
      assistState.classList.toggle('is-on', on);
    }
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden','false');
    setTimeout(() => overlay.querySelector('.kg-cat-search')?.focus(), 0);
  }

  /* Le catalogue est ouvert par l’entrée unifiée « Aide & formation ». */


  function firstVisible(selectors){
    if (typeof k.firstVisible === 'function') {
      return k.firstVisible(selectors);
    }
    const visible = k.helpers && typeof k.helpers.visible === 'function'
      ? k.helpers.visible
      : el => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));

    for (const selector of selectors || []) {
      let el = null;
      try { el = document.querySelector(selector); } catch (_) {}
      if (el && visible(el)) return el;
    }
    return null;
  }

  function stepElement(target, title, intro, position){
    if (typeof k.stepElement === 'function') {
      return k.stepElement(target, title, intro, position);
    }
    if (!target) return null;
    return {
      element: target,
      title,
      intro,
      position: position || 'bottom'
    };
  }

  function preface(ctx){
    const meta = routeMeta(ctx || { path:location.pathname });
    if (!meta) return [];
    const level = LEVELS[meta.level];
    const target = firstVisible(['main h1','h1','#toolbar','#toplevelmenu','main']) || document.body;
    const mod = MODULES.find(m => m.id === meta.moduleId);
    const body = `${levelHtml(meta.level)}<br><strong>${esc(meta.title)}</strong><div class="kg-learning-objective">${esc(mod ? mod.desc : '')}<br><br><strong>Pourquoi ce niveau ?</strong> ${esc(level.why)}</div>`;
    const step = stepElement(target, 'Repère de parcours', body, 'bottom');
    return step ? [step] : [];
  }

  function finale(ctx){
    const meta = routeMeta(ctx || { path:location.pathname });
    if (!meta) return [];
    const target = firstVisible(['#bottomActionBar','#tutoriel','#toolbar','main h1','main']) || document.body;
    const body = `${esc(meta.nextText)}<div class="kg-next-links"><a href="${href(meta.nextUrl)}">Ouvrir la suite conseillée</a><a href="#" class="kg-open-catalogue">Voir le sommaire complet</a></div>`;
    const step = stepElement(target, 'Pour continuer', body, 'top');
    return step ? [step] : [];
  }

  function installV2StepDecorators(){
    if (!Array.isArray(k.registry) || typeof k.register !== 'function') return false;
    if (k.__parcoursDecoratorsInstalledV620) return true;
    k.__parcoursDecoratorsInstalledV620 = true;

    const decorate = def => {
      if (!def || def.__parcoursDecoratedV620) return def;

      const hasDirectSteps = Object.prototype.hasOwnProperty.call(def, 'steps');
      const hasTourSteps = !hasDirectSteps
        && def.tour
        && Object.prototype.hasOwnProperty.call(def.tour, 'steps');

      if (!hasDirectSteps && !hasTourSteps) return def;

      const originalSteps = hasDirectSteps ? def.steps : def.tour.steps;
      if (!Array.isArray(originalSteps) && typeof originalSteps !== 'function') return def;

      const wrappedSteps = ctx => {
        let baseSteps = [];
        try {
          baseSteps = typeof originalSteps === 'function' ? originalSteps(ctx) : originalSteps;
        } catch (_) {
          baseSteps = [];
        }
        if (!Array.isArray(baseSteps)) baseSteps = [];
        return [...preface(ctx), ...baseSteps, ...finale(ctx)];
      };

      if (hasDirectSteps) {
        def.steps = wrappedSteps;
      } else {
        def.tour = Object.assign({}, def.tour, { steps: wrappedSteps });
      }

      def.__parcoursDecoratedV620 = true;
      return def;
    };

    /* Guides déjà enregistrés avant ce fichier. */
    k.registry.forEach(decorate);

    /* Guides enregistrés après ce fichier. */
    const originalRegister = k.register.bind(k);
    const wrappedRegister = function(arg1, arg2){
      const def = originalRegister(arg1, arg2);
      decorate(def);
      return def;
    };

    k.register = wrappedRegister;
    k.registerGuide = wrappedRegister;
    k.addGuide = wrappedRegister;
    return true;
  }


  if (!window.__kohaGuideCatalogueClickBoundV6) {
    window.__kohaGuideCatalogueClickBoundV6 = true;
    document.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('.kg-open-catalogue');
      if (!a) return;
      e.preventDefault();
      const skip = document.querySelector('.introjs-skipbutton');
      if (skip) skip.click();
      openCatalogue();
    });
  }


  if (!window.__kohaGuideCatalogueExternalOpenBoundV61) {
    window.__kohaGuideCatalogueExternalOpenBoundV61 = true;
    document.addEventListener('koha:openGuideCatalogue', openCatalogue);
  }

  /*
   * Compatibilité :
   * - ancien noyau : fournisseurs d'étapes registerFirst/register ;
   * - noyau V2 : registre de définitions complètes + décorateurs d'étapes classiques.
   */
  if (typeof k.registerFirst === 'function' && typeof k.stepElement === 'function') {
    k.registerFirst(preface);
    k.register(finale);
  } else {
    installV2StepDecorators();
  }

  window.KOHA_GUIDES.openCatalogue = openCatalogue;
  window.KOHA_GUIDES.routeMeta = routeMeta;

})();

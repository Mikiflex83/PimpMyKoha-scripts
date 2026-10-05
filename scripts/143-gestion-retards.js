/*
 * 143 — Gestion des retards TP4 — v0.2.1 (pilote préplugin)
 * Ajouter ce fichier COMPLET à IntranetUserJS, sans balises <script>.
 * Page : /cgi-bin/koha/mainpage.pl?pmk_page=overdue-management
 * Source de classement : rapport privé 5261 V0.3 sans seuil de montant.
 * Aucun stockage externe. Aucun envoi de mail/SMS. Écrans natifs pour les prêts et statuts.
 * Les écritures réutilisent le formulaire Koha et son jeton CSRF frais.
 * Configuration facultative, avant le script :
 * window.PMK143_CONFIG = { reportId: 5261, defaultBranch: 'BAR' };
 */
(function (window, document) {
  'use strict';
  if (window.PMK143) return;
  const VERSION = '0.2.1';
  const CONFIG = Object.assign({ reportId: 5261, defaultBranch: '', pageSize: 500, maxPages: 200, timeoutMs: 45000 }, window.PMK143_CONFIG || {});
  const PAGE = 'overdue-management';
  const REPORT_PATH = '/cgi-bin/koha/reports/guided_reports.pl';
  const MEMBER_PATH = '/cgi-bin/koha/members/moremember.pl';
  const DELETE_PATH = '/cgi-bin/koha/circ/del_message.pl';
  const MESSAGE_PATH = '/cgi-bin/koha/circ/add_message.pl';
  const url = new URL(window.location.href);
  const STAGES = [
    ['all', 'Tous'], ['call', 'À appeler'], ['search', 'Recherche documents'],
    ['letter', 'Lettre à préparer'], ['signature', 'À signer'], ['sent', 'Lettre envoyée'], ['finance', 'Finances / clôture'], ['cleanup', 'À nettoyer'], ['dnr', 'DNR'], ['control', 'À contrôler']
  ];
  const QUICK = ['Appelé pour TP4', 'Lettre TP4 à la signature', 'Lettre TP4 envoyée', 'Transmis au service finances', 'Documents recherchés pour TP4', 'Adhérent contacté pour TP4'];
  const state = { rows: [], selected: null, dossier: null, loans: [], stage: 'all', query: '', branch: CONFIG.defaultBranch,
    sort: 'overdue', loading: false, busy: false, draft: null, uncertain: null, reportStale: false, request: 0, panelRequest: 0, root: null, cleanup: null, manual: false, itemManual: false, loansLoaded: false, prepared: new Map() };
  let mounting = false;
  const $ = (s) => state.root.querySelector(s);
  const all = (s, node) => Array.from((node || state.root).querySelectorAll(s));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normalize = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const number = v => { const n = Number(String(v == null ? '' : v).replace(/[\s\u00a0]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const money = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(number(v));
  const lines = v => esc(v).replace(/\n/g, '<br>');
  const idOK = v => /^\d+$/.test(String(v));
  function text(node) {
    if (!node) return '';
    const copy = node.cloneNode(true);
    copy.querySelectorAll('script,style,.autolink').forEach(n => n.remove());
    copy.querySelectorAll('br').forEach(n => n.replaceWith('\n'));
    return copy.textContent.trim();
  }
  function safeURL(value, path) {
    const u = new URL(value, window.location.origin);
    if (u.origin !== window.location.origin || (path && u.pathname !== path)) throw new Error('Adresse Koha inattendue.');
    return u;
  }
  function reportURL(branch, page) {
    const u = new URL(REPORT_PATH, window.location.origin);
    u.searchParams.set('id', String(CONFIG.reportId));
    u.searchParams.set('op', 'run');
    if (branch != null) {
      u.searchParams.set('param_name', 'Site adhérent|branches:all');
      u.searchParams.set('sql_params', branch);
      u.searchParams.set('limit', String(CONFIG.pageSize));
      u.searchParams.set('page', String(page || 1));
    }
    return u;
  }
  function memberURL(id) {
    if (!idOK(id)) throw new Error('Numéro lecteur invalide.');
    return new URL(MEMBER_PATH + '?borrowernumber=' + id, window.location.origin);
  }
  async function request(target, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
    try {
      const r = await fetch(safeURL(target).href, Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options || {}, { signal: controller.signal }));
      safeURL(r.url || target);
      if (!r.ok) throw new Error('Koha a répondu HTTP ' + r.status + '.');
      return await r.text();
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Koha ne répond pas dans le délai prévu.');
      throw e;
    } finally { clearTimeout(timer); }
  }
  function parseHTML(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (doc.querySelector('#loginform, form input[name="password"], input[name="koha_login_context"]')) {
      throw new Error('Session Koha expirée. Reconnecte-toi à Koha puis actualise cette page.');
    }
    return doc;
  }
  function stageOf(value) {
    const v = normalize(value);
    if (/^DNR/.test(value)) return 'dnr';
    if (/^6\s*[—-]/.test(v)) return 'finance';
    if (/^7\s*[—-]/.test(v)) return 'cleanup';
    if (/^5\s*[—-]/.test(v)) return 'sent';
    if (/^4\s*[—-]/.test(v)) return 'signature';
    if (/^3\s*[—-]/.test(v)) return 'letter';
    if (/^2\s*[—-]/.test(v)) return 'search';
    if (/^1b?\s*[—-]/.test(v)) return 'call';
    return 'control';
  }
  function readReport(doc) {
    const table = doc.querySelector('#report_results') || Array.from(doc.querySelectorAll('table')).find(t => /Retard max/.test(t.textContent));
    if (!table) {
      const alert = doc.querySelector('.alert-danger, .error');
      throw new Error(alert ? text(alert).slice(0, 500) : 'Résultats de 5261 introuvables. Vérifie le rapport, ses paramètres et la permission « exécuter des rapports ».');
    }
    const header = table.tHead ? table.tHead.rows[0] : table.rows[0];
    if (!header) throw new Error('Le rapport ne contient pas de colonnes.');
    const names = Array.from(header.cells).map(c => normalize(c.textContent));
    for (const required of ['nom', 'prenom', 'retard max', 'etape', 'action maintenant', 'anciennete', 'categorie', 'suivi procedure']) {
      if (!names.includes(required)) throw new Error('5261 doit utiliser le SQL V0.3 validé : colonne « ' + required + ' » absente. Le script ne remplace pas les règles SQL.');
    }
    const idx = name => names.indexOf(normalize(name));
    return Array.from(table.querySelectorAll('tbody tr')).filter(r => r.querySelector('td')).map(tr => {
      const cell = name => tr.cells[idx(name)];
      const get = name => text(cell(name));
      let id = get('borrowernumber');
      const plain = cell('borrowernumber') && cell('borrowernumber').querySelector('.data-plain');
      if (plain) id = text(plain);
      if (!idOK(id)) {
        const a = tr.querySelector('a[href*="borrowernumber="]');
        if (a) id = safeURL(a.getAttribute('href')).searchParams.get('borrowernumber');
      }
      if (!idOK(id)) throw new Error('Une ligne du rapport ne permet pas d’identifier le lecteur.');
      const historicalCell = cell('Workflow historique');
      const historical = historicalCell ? Array.from(historicalCell.querySelectorAll('a[href]')).map(a => {
        try { const u = safeURL(a.getAttribute('href'), REPORT_PATH); return { label: text(a), href: u.href }; } catch (_) { return null; }
      }).filter(Boolean) : [];
      return { id: String(id), card: get('Carte lecteur'), surname: get('Nom'), firstname: get('Prénom'), branch: get('Site lecteur'),
        phone: get('Téléphone'), email: get('Mail'), due: get('Plus ancien retour prévu'), overdue: number(get('Retard max')),
        count: number(get('Docs >= 35 j')), active: number(get('Prêts actifs')), value: get('Valeur docs >= 35 j'),
        step: get('Étape'), stage: stageOf(get('Étape')), action: get('Action maintenant'), age: get('Ancienneté'),
        checks: get('Contrôles'), historyText: get('Workflow historique'), historical,
        called: get('Appelé TP4'), signature: get('À la signature'), sent: get('Lettre envoyée'),
        last: get('Dernière action TP4'), suspension: get('Suspension'), notes: get('Notes circulation'), messages: get('Messages TP4'), category: get('Catégorie'), procedure: get('Suivi procédure') };
    });
  }
  function pagination(doc) {
    const pages = all('.pages a[href], #pagination_top a[href], #pagination_bottom a[href]', doc).map(a => {
      try { const u = safeURL(a.getAttribute('href'), REPORT_PATH); return u.searchParams.get('id') === String(CONFIG.reportId) ? number(u.searchParams.get('page')) : 0; }
      catch (_) { return 0; }
    });
    return Array.from(new Set(pages.filter(n => Number.isInteger(n) && n > 0)));
  }
  async function loadRows(branch, seq) {
    const queue = [1], seen = new Set(), rows = new Map();
    while (queue.length) {
      if (seq !== state.request) return null;
      const page = queue.shift();
      if (seen.has(page)) continue;
      if (seen.size >= CONFIG.maxPages || page > CONFIG.maxPages) throw new Error('Trop de pages : sélectionne un site pour charger un tableau complet.');
      seen.add(page);
      status('Chargement des dossiers… page ' + page, 'info');
      const doc = parseHTML(await request(reportURL(branch, page)));
      if (seq !== state.request) return null;
      readReport(doc).forEach(row => rows.set(row.id, row));
      pagination(doc).forEach(n => { if (!seen.has(n) && !queue.includes(n)) queue.push(n); });
    }
    return Array.from(rows.values());
  }
  function formValue(form, name) {
    const field = form.querySelector('[name="' + name + '"]');
    return field ? field.value : '';
  }
  function nativeForms(doc, id) {
    const forms = Array.from(doc.querySelectorAll('form')).filter(f => {
      try { return safeURL(f.getAttribute('action') || MEMBER_PATH).pathname === MESSAGE_PATH; } catch (_) { return false; }
    });
    const add = forms.find(f => formValue(f, 'op') === 'cud-add_message' && formValue(f, 'borrowernumber') === String(id));
    const allowedAdd = !!doc.querySelector('#toolbar_addnewmessageLabel');
    const edits = forms.filter(f => formValue(f, 'op') === 'cud-edit_message');
    const lis = Array.from(doc.querySelectorAll('#messages > ul > li'));
    const messages = edits.map((form, index) => {
      const mid = formValue(form, 'message_id');
      const container = form.closest('[id^="edit_message_form_"]');
      const li = lis.find(n => all('.edit_message', n).some(a => [a.getAttribute('href'), a.getAttribute('data-bs-target'), a.getAttribute('data-target')].includes('#edit_message_form_' + mid))) || lis[index];
      const canEdit = !!(container && all('.edit_message', doc).some(a => [a.getAttribute('href'), a.getAttribute('data-bs-target'), a.getAttribute('data-target')].includes('#' + container.id)));
      const label = li && li.querySelector(':scope > span');
      let meta = '';
      if (label) { const copy = label.cloneNode(true); copy.querySelectorAll('em').forEach(n => n.remove()); meta = text(copy); }
      const deletion = li && all('form', li).find(f => { try { return safeURL(f.getAttribute('action')).pathname === DELETE_PATH && formValue(f, 'message_id') === mid && !!f.querySelector('.delete_message'); } catch (_) { return false; } });
      return { deleteForm: deletion || null, id: mid, value: formValue(form, 'borrower_message'), type: formValue(form, 'message_type'), form, canEdit, meta };
    });
    const raw = text(doc.querySelector('#messages'));
    return { add: allowedAdd ? add : null, messages, raw, inventoryComplete: lis.length === messages.length };
  }
  async function getDossier(id) {
    const doc = parseHTML(await request(memberURL(id)));
    const identity = doc.querySelector('#borrowernumber, input[name="borrowernumber"]');
    // moremember n’a pas toujours un champ #borrowernumber ; ses formulaires en portent un.
    if (!identity || identity.value !== String(id)) throw new Error('Fiche lecteur inaccessible ou identité différente.');
    const dossier = nativeForms(doc, id);
    const edit = doc.querySelector('#editpatron[href]');
    const attributes=doc.querySelector('#patron-extended-attributes');
    dossier.attributes=text(attributes);
    const groups=attributes?all('[id^="aai_"]',attributes).filter(g=>/\bdnr\b/.test(normalize(text(g.querySelector('h4,legend'))))||/document du|annee de dnr|montant du/.test(normalize(text(g)))):[];
    const fields=attributes?all('li',attributes).filter(n=>/^(date dernier contact|annee de dnr|document du|montant du|note interne)\s*:/.test(normalize(text(n)))):[];
    dossier.dnrAttributes=groups.length?groups.map(text).join('\n'):fields.length?fields.map(text).join('\n'):/\bdnr\b/.test(normalize(dossier.attributes))?dossier.attributes:'';
    dossier.editHref = edit ? safeURL(edit.getAttribute('href'), '/cgi-bin/koha/members/memberentry.pl').href : null;
    return dossier;
  }
  async function getLoans(id) {
    const u = new URL('/cgi-bin/koha/svc/checkouts', window.location.origin);
    u.searchParams.set('borrowernumber', id); u.searchParams.set('iDisplayLength', '-1');
    const body = await request(u);
    let data;
    try { data = JSON.parse(body); } catch (_) { throw new Error('Prêts indisponibles : réponse Koha non JSON ou permission insuffisante.'); }
    if (!Array.isArray(data.aaData)) throw new Error('Format des prêts Koha non reconnu.');
    return data.aaData;
  }
  function status(message, type) {
    if (!state.root) return;
    const n = $('#tp4-status'); n.textContent = message; n.className = 'tp4-status ' + (type || 'info');
    n.setAttribute('role', type === 'error' ? 'alert' : 'status');
  }
  function locked() { return state.loading || state.busy || !!state.draft || !!state.uncertain || !!state.cleanup || state.manual || state.itemManual; }
  function syncLocks() {
    all('[data-navigation]').forEach(n => { n.disabled = locked(); });
    all('[data-quick]').forEach(n => { n.disabled = state.busy || !!state.uncertain || !!state.draft || !state.dossier || !state.dossier.add || !!state.cleanup || state.manual || state.itemManual; });
    all('[data-edit]').forEach(n => { n.disabled = state.busy || !!state.uncertain || !!state.draft || !!state.cleanup || state.manual || state.itemManual; });
    all('[data-item-status]').forEach(n=>{n.disabled=state.busy||!!state.draft||!!state.uncertain||!!state.cleanup||state.itemManual;});
    const nativeClose=$('#tp4-native-close');if(nativeClose)nativeClose.disabled=state.itemManual;
    all('[data-workflow]').forEach(n => { n.disabled = locked() || !state.dossier || !state.loansLoaded; });
    const clean = $('#tp4-clean-confirm'); if (clean) clean.disabled = state.busy || !!state.uncertain;
    all('[data-clean-select]').forEach(n => { const m=state.dossier && state.dossier.messages.find(x => x.id === n.dataset.cleanSelect); n.disabled = state.busy || !!state.uncertain || !m || !m.deleteForm || protectedMessage(m); });
    const done = $('#tp4-clean-done'); if(done) done.disabled = state.busy || !!state.uncertain;
    const close = $('#tp4-clean-cancel'); if(close) close.disabled = state.busy || !!state.uncertain;
    const verify = $('#tp4-verify'); if (verify) verify.hidden = !state.uncertain;
    if (verify) verify.disabled = state.busy;
    const save = $('#tp4-save'); if (save) save.disabled = state.busy || !!state.uncertain;
    const cancel = $('#tp4-cancel'); if (cancel) cancel.disabled = state.busy || !!state.uncertain;
  }
  function visibleRows() {
    const q = normalize(state.query);
    return state.rows.filter(r => (state.stage === 'all' || r.stage === state.stage) && (!q || normalize([r.surname, r.firstname, r.card, r.phone, r.email].join(' ')).includes(q)))
      .sort((a, b) => state.sort === 'name' ? (a.surname + ' ' + a.firstname).localeCompare(b.surname + ' ' + b.firstname, 'fr') : state.sort === 'value' ? number(b.value) - number(a.value) : b.overdue - a.overdue);
  }
  function renderList() {
    $('#tp4-stages').innerHTML = STAGES.filter(([key])=>key==='all'||state.stage===key||state.rows.some(r=>r.stage===key)).map(([key, label]) => '<button type="button" data-stage="' + key + '" aria-pressed="' + (state.stage === key) + '" class="tp4-stage ' + key + '">' + label + ' <strong>' + state.rows.filter(r => key === 'all' || r.stage === key).length + '</strong></button>').join('');
    const rows = visibleRows();
    $('#tp4-count').textContent = rows.length + ' dossier(s) affiché(s) sur ' + state.rows.length;
    $('#tp4-list').innerHTML = rows.map(r => '<button type="button" data-reader="' + r.id + '" data-navigation class="tp4-reader ' + r.stage + (state.selected === r.id ? ' selected' : '') + '" aria-pressed="' + (state.selected === r.id) + '"><span class="tp4-row-head"><strong>' + esc(r.surname + ' ' + r.firstname) + '</strong><span>' + r.overdue + ' j ' + (r.overdue >= 280 ? '🚨' : r.overdue >= 183 ? '⚠' : '') + '</span></span><span>' + esc(r.card) + ' · ' + esc(r.branch) + (r.count>0||number(r.value)>0 ? ' · '+money(r.value) : '') + '</span><span class="tp4-badge ' + r.stage + '">' + esc(r.action || r.step) + '</span>' + (r.checks ? '<small class="tp4-warning">⚠ Contrôle à consulter</small>' : '') + '</button>').join('') || '<p class="tp4-empty">Aucun dossier pour ce filtre.</p>';
    syncLocks();
  }
  function loansHTML() {
    const overdue=state.loans.filter(l=>l.date_due_overdue).sort((a,b)=>String(a.date_due).localeCompare(String(b.date_due)));
    if(!overdue.length)return '<p class="tp4-muted">Aucun prêt en retard'+(state.loans.length?' · '+state.loans.length+' prêt(s) actif(s)':'')+'.</p>';
    const date=v=>{const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'/'+m[2]+'/'+m[1]:String(v||'');};
    return '<p class="tp4-muted">'+overdue.length+' en retard · '+state.loans.length+' prêt(s) actif(s)</p><div class="tp4-scroll"><table><thead><tr><th>Document</th><th>Retour prévu</th><th>Sites</th><th>Remplacement</th></tr></thead><tbody>'+overdue.map(l=>{
      const link=idOK(l.biblionumber)?'/cgi-bin/koha/catalogue/detail.pl?biblionumber='+l.biblionumber:null;
      const title=esc(String(l.title||'').replace(/[\u0088\u0089]/g,''));
      return '<tr><td>'+(link?'<a target="_blank" rel="noopener" href="'+esc(link)+'">'+title+'</a>':title)+'<small class="tp4-loan-meta">'+esc(l.barcode)+' · '+esc(l.itemcallnumber)+'</small><small>'+itemLink(l).replace('Statut de l’exemplaire ↗','Exemplaire ↗')+'</small></td><td>'+esc(date(l.date_due))+'</td><td><small>Prêt : '+esc(l.branchname||l.branchcode)+'</small><small>Propriétaire : '+esc(l.homebranch||'à vérifier')+'</small></td><td>'+(l.price===''||l.price==null?'—':money(l.price))+'</td></tr>';
    }).join('')+'</tbody></table></div>';
  }

  function messagesHTML() {
    if (!state.dossier) return '<p>Chargement des messages Koha…</p>';
    if (!state.dossier.messages.length) return state.dossier.raw ? '<p class="tp4-pre">' + lines(state.dossier.raw) + '</p>' : '<p>Aucun message dans la fiche Koha.</p>';
    return state.dossier.messages.map(m => '<article class="tp4-message"><div class="tp4-row-head"><small>' + esc(m.meta || (m.type === 'L' ? 'Note interne' : 'Message OPAC')) + '</small>' + (m.canEdit ? '<button type="button" data-edit="' + esc(m.id) + '">Modifier</button>' : '<small>Lecture seule</small>') + '</div><p class="tp4-pre">' + lines(m.value) + '</p></article>').join('');
  }
  function contextHint(r) {
    if (r.stage === 'cleanup') return 'Vérifier l’ancien dossier avant de supprimer ses messages.';
    if (r.stage === 'finance') return 'Transmission tracée : vérifier les documents et terminer la clôture.';
    if (r.stage === 'dnr') return 'Suivre les informations DNR enregistrées sur la carte.';
    if (r.stage === 'signature') return 'Faire signer la lettre, puis tracer son envoi.';
    if (r.stage === 'letter') return 'Préparer la lettre et la transmettre pour signature.';
    if (r.stage === 'call') return 'Rechercher les documents dans les deux sites, puis tracer l’appel.';
    return r.procedure || r.action || 'Vérifier les messages et les prêts du dossier.';
  }
  function suggestedIds() { return state.dossier ? state.dossier.messages.filter(m => m.deleteForm && suggestedMessage(m)).map(m => m.id) : []; }
  function actionButton(action, primary) {
    return '<button type="button" ' + (action.quick != null ? 'data-quick="' + action.quick : 'data-workflow="' + action.workflow) + '"' + (primary ? ' class="tp4-primary"' : '') + '>' + esc(action.label) + '</button>';
  }
  function workflowHTML() {
    const r = state.rows.find(x => x.id === state.selected);
    if (!r) return '';
    const suggestions=suggestedIds(), hasMessages=!!(state.dossier && state.dossier.messages.some(m=>m.deleteForm && !protectedMessage(m)));
    const overdue=state.loans.filter(l=>l.date_due_overdue).length;
    const quick=QUICK.map((label,i)=>({quick:String(i),label}));
    const operations=[{workflow:'card',label:'Imprimer les retards'}, {workflow:'notices',label:'Notifications envoyées'}, {workflow:'dnr',label:r.category === 'DNR' ? 'Modifier le dossier DNR' : 'Préparer un dossier DNR'}, {workflow:'returns',label:'Retours des documents'}, {workflow:'edit',label:'Catégorie, notes et restrictions'}, {workflow:'cleanup',label:'Choisir les messages à supprimer' + (suggestions.length ? ' ('+suggestions.length+')' : '')}];
    const canEdit=!state.dossier || !!state.dossier.editHref;
    const available=operations.filter(a=>(a.workflow!=='returns'||!state.loansLoaded||overdue>0) && (a.workflow!=='cleanup'||hasMessages) && (!['edit','dnr'].includes(a.workflow)||canEdit));
    const op=k=>available.find(a=>a.workflow===k);
    let main=[];
    if (r.stage==='call') main=[quick[4],quick[0]];
    else if (r.stage==='search') main=[quick[4],quick[5]];
    else if (r.stage==='letter') main=[op('card'),quick[1]];
    else if (r.stage==='signature') main=[quick[2],op('card')];
    else if (r.stage==='sent') main=[/atteint|pour transmission/.test(normalize(r.procedure+' '+r.action)) ? quick[3] : quick[5]];
    else if (r.stage==='dnr') main=[op('dnr'),op('returns')];
    else if (r.stage==='finance') main=[op('returns'),suggestions.length ? op('cleanup') : op('edit')];
    else if (r.stage==='cleanup') main=[suggestions.length ? op('cleanup') : op('edit')];
    main=main.filter(Boolean);
    const key=a=>a.quick!=null?'q'+a.quick:'w'+a.workflow;
    const used=new Set(main.map(key));
    const otherQuick=quick.filter(a=>!used.has(key(a)));
    const otherOperations=available.filter(a=>!used.has(key(a)));
    return '<p class="tp4-next">'+esc(contextHint(r))+'</p><div class="tp4-actions">'+main.map((a,i)=>actionButton(a,i===0)).join('')+actionButton({quick:'free',label:'Ajouter une note'},false)+'</div>'+
      '<details class="tp4-more" id="tp4-more-actions"><summary>Autres actions</summary><div class="tp4-actions">'+otherQuick.map(a=>actionButton(a,false)).join('')+'</div><div class="tp4-actions">'+otherOperations.map(a=>actionButton(a,false)).join('')+'</div></details>'+
      '<details class="tp4-guide"><summary>Consignes de traitement</summary><p>'+esc(r.procedure || '')+'</p><p>Recherche dans les sites propriétaire et actuel. Lettre à J+8 après appel ; contrôle à J+10 après envoi.</p><p>Avant transmission : restitution ou rachat, retours, remise empruntable, annulation auprès de la logistique et catégorie adaptée. Après transmission : retirer les prêts du litige, puis passer les exemplaires en perdu si nécessaire.</p><p>DNR : enregistrer les champs avant retour, puis passer les exemplaires en perdu. Sortie de DNR : effacer les champs prescrits et choisir Adulte / Jeune.</p><p>Les notifications indiquent un envoi. La logistique et les finances restent à contacter par l’agent. Après transmission au Trésor Public, appliquer la consigne du tutoriel avant toute restitution.</p></details>';
  }
  function panelAttributesHTML(r) {
    const content=state.dossier && state.dossier.dnrAttributes;
    return '<section class="tp4-section" id="tp4-dnr-section"'+(r.category!=='DNR'&&!content?' hidden':'')+'><h3>Dossier DNR</h3><p id="tp4-attributes" class="tp4-pre">'+lines(content || (r.category==='DNR' ? 'Consulter les champs DNR dans la carte Koha.' : ''))+'</p></section>';
  }
  function renderPanel() {
    const r = state.rows.find(x => x.id === state.selected);
    if (!r) { $('#tp4-panel').innerHTML = '<div class="tp4-empty">Sélectionne un lecteur pour consulter son dossier.</div>'; return; }
    const phone=r.phone.replace(/[^+\d]/g,''), mail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)?r.email:'';
    const overdue=state.loans.filter(l=>l.date_due_overdue).length;
    const metrics=[];
    if (r.overdue>0) metrics.push('<strong>'+r.overdue+' j</strong> de retard max.');
    if (state.loansLoaded && overdue) metrics.push('<strong>'+overdue+'</strong> prêt(s) en retard');
    if (r.count>0) metrics.push('<strong>'+r.count+'</strong> à ≥ 35 j · '+money(r.value));
    const notes=r.notes||r.suspension;
    const history=r.historical.length||r.historyText.trim();
    $('#tp4-panel').innerHTML='<header class="tp4-panel-head"><div><h2>'+esc(r.surname+' '+r.firstname)+'</h2><p>'+esc(r.card)+' · '+esc(r.branch)+'</p></div><a target="_blank" rel="noopener" href="'+esc(memberURL(r.id).href)+'">Fiche Koha ↗</a></header>'+
      '<div class="tp4-contact">'+(phone?'<a href="tel:'+esc(phone)+'">☎ '+esc(r.phone)+'</a>':'')+(mail?'<a href="mailto:'+esc(mail)+'">✉ '+esc(mail)+'</a>':'')+'</div>'+
      '<p class="tp4-badge '+r.stage+'">'+esc(r.step)+'</p>'+(metrics.length?'<p class="tp4-metrics">'+metrics.join(' <span>·</span> ')+'</p>':'')+
      (r.age?'<p class="tp4-warning">'+esc(r.age)+'</p>':'')+
      (r.checks?'<details class="tp4-checks"><summary>Points à vérifier</summary><p>'+lines(r.checks)+'</p></details>':'')+
      '<section class="tp4-section tp4-treatment"><h3>Traitement</h3><div id="tp4-workflow">'+workflowHTML()+'</div><p id="tp4-permission"></p><div id="tp4-composer"></div><div id="tp4-operation"></div></section>'+
      '<section class="tp4-section"><h3>Documents en retard</h3><div id="tp4-loans">'+(state.loansLoaded?loansHTML():'Chargement des prêts…')+'</div><div id="tp4-item-operation"></div></section>'+panelAttributesHTML(r)+
      '<section class="tp4-section"'+(state.dossier&&!state.dossier.messages.length&&!state.dossier.raw?' hidden':'')+'><h3>Messages Koha</h3><div id="tp4-messages">'+messagesHTML()+'</div></section>'+
      (notes?'<details class="tp4-supplement"><summary>Notes de circulation et restriction</summary><p class="tp4-pre">'+lines(r.notes||'')+'</p>'+(r.suspension?'<p>'+lines(r.suspension)+'</p>':'')+'</details>':'')+
      (history?'<details class="tp4-supplement"><summary>Rapports historiques</summary>'+r.historical.map(h=>'<a class="tp4-history" target="_blank" rel="noopener" href="'+esc(h.href)+'">'+esc(h.label)+'</a>').join('')+(!r.historical.length?'<p>'+lines(r.historyText)+'</p>':'')+'</details>':'');
    if(state.dossier&&!state.dossier.add)$('#tp4-permission').textContent='Ajout de note non proposé par Koha avec tes droits.';
    syncLocks();
  }
  async function select(id) {
    if(locked())return;
    state.selected=id;state.dossier=null;state.loans=[];state.loansLoaded=false;
    const seq=++state.panelRequest;
    renderList();renderPanel();
    const results=await Promise.allSettled([getDossier(id),getLoans(id)]);
    if(seq!==state.panelRequest||id!==state.selected)return;
    if(results[0].status==='fulfilled')state.dossier=results[0].value;
    if(results[1].status==='fulfilled'){state.loans=results[1].value;state.loansLoaded=true;}
    renderPanel();
    if(results[0].status==='rejected'){
      $('#tp4-messages').textContent=results[0].reason.message;
      $('#tp4-permission').textContent='Actions désactivées : fiche Koha non chargée.';
      status(results[0].reason.message,'error');
    }
    if(results[1].status==='rejected')$('#tp4-loans').textContent=results[1].reason.message;
    syncLocks();
  }

  async function refresh() {
    if (state.busy || state.draft || state.uncertain || state.cleanup || state.manual || state.itemManual) return;
    state.loading = true; state.reportStale = true; syncLocks();
    const seq = ++state.request, selected = state.selected;
    try {
      const rows = await loadRows(state.branch, seq);
      if (!rows || seq !== state.request) return;
      state.rows = rows; state.reportStale = false;
      $('#tp4-updated').textContent = 'Actualisé à ' + new Date().toLocaleTimeString('fr-FR');
      status(rows.length + ' dossier(s) chargé(s). Classement fourni par le rapport ' + CONFIG.reportId + '.', 'success');
      state.selected = rows.some(r => r.id === selected) ? selected : null;
    } catch (e) { state.rows = []; state.selected = null; status(e.message, 'error'); }
    finally {
      if (seq === state.request) {
        state.loading = false; state.dossier = null; ++state.panelRequest;
        renderList(); renderPanel();
        if (state.selected) await select(state.selected);
      }
    }
  }
  function focusItemFrame(frame,item) {
    try {
      const doc=frame.contentDocument;
      if(!doc || doc.querySelector('#loginform,input[name="password"]'))return;
      safeURL(doc.location.href,'/cgi-bin/koha/catalogue/moredetail.pl');
      const forms=all('form',doc).filter(f=>{
        try {return safeURL(new URL(f.getAttribute('action'),doc.location.href),'/cgi-bin/koha/catalogue/updateitem.pl') && String(f.method).toLowerCase()==='post' && formValue(f,'itemnumber')===String(item.itemnumber) && formValue(f,'biblionumber')===String(item.biblionumber) && ['cud-set_lost','cud-set_damaged','cud-set_withdrawn'].includes(formValue(f,'op')) && !!formValue(f,'csrf_token');}
        catch(_){return false;}
      });
      if(!forms.length)return; // Garder l'écran natif, notamment en lecture seule ou en cas d'alerte.
      const box=doc.createElement('main');box.id='pmk143-item-focus';
      all('.alert,.error,.dialog',doc).forEach(n=>{if(!n.closest('form'))box.appendChild(n.cloneNode(true));});
      const labels={'cud-set_lost':'Perdu','cud-set_damaged':'Endommagé','cud-set_withdrawn':'Retiré'};
      forms.forEach(f=>{
        const section=doc.createElement('section'),title=doc.createElement('h3');
        title.textContent=labels[formValue(f,'op')];section.append(title,f);box.appendChild(section);
      });
      doc.body.replaceChildren(box);
      const style=doc.createElement('style');style.textContent='body{background:white!important;padding:0!important;margin:0!important}#pmk143-item-focus{max-width:100%;padding:14px;font:14px system-ui;color:#23352a}#pmk143-item-focus section{margin:0 0 18px}#pmk143-item-focus h3{font-size:15px;margin:0 0 8px}#pmk143-item-focus select{max-width:100%;min-width:180px;margin-right:8px}#pmk143-item-focus input[type=submit]{margin:5px 0}';doc.head.appendChild(style);
      frame.style.height=Math.min(620,Math.max(300,doc.body.scrollHeight+20))+'px';
    }catch(_){ /* Le lien natif reste utilisable si le thème ou l'encapsulation diffère. */ }
  }
  function openItemStatus(id) {
    if(state.busy||state.draft||state.uncertain||state.cleanup||state.itemManual||!state.loansLoaded)return;
    const item=state.loans.concat(state.prepared.get(state.selected)||[]).find(l=>String(l.itemnumber)===String(id));
    if(!item||!idOK(item.itemnumber)||!idOK(item.biblionumber)){status('Exemplaire non identifié dans ce dossier.','error');return;}
    const target=new URL('/cgi-bin/koha/catalogue/moredetail.pl',window.location.origin);
    target.searchParams.set('itemnumber',item.itemnumber);target.searchParams.set('biblionumber',item.biblionumber);target.hash='item'+item.itemnumber;
    state.itemManual=true;
    $('#tp4-item-operation').innerHTML='<div class="tp4-editor"><h4>Statuts de l’exemplaire</h4><p>'+esc(String(item.title||'').replace(/[\u0088\u0089]/g,''))+' · <strong>'+esc(item.barcode)+'</strong></p><p class="tp4-muted">Choisir le statut et enregistrer chaque changement dans Koha.</p><iframe id="tp4-item-native" class="tp4-native" title="Modifier les statuts de l’exemplaire"></iframe><div class="tp4-actions"><button type="button" id="tp4-item-close">Terminé</button><a target="_blank" rel="noopener" href="'+esc(target.href)+'">Fiche exemplaire ↗</a></div></div>';
    const frame=$('#tp4-item-native');frame.addEventListener('load',()=>focusItemFrame(frame,item));frame.src=target.href;
    $('#tp4-item-operation').scrollIntoView({block:'nearest'});syncLocks();
  }
  async function closeItemStatus() {
    state.itemManual=false;$('#tp4-item-operation').innerHTML='';syncLocks();
    if(!state.manual)await refresh();
    else status('Écran des statuts fermé. Terminer l’autre opération Koha pour actualiser le dossier.','info');
  }

  function nativeTarget(kind) {
    if (kind === 'edit' || kind === 'dnr') {
      if (!state.dossier.editHref) throw new Error('Koha ne propose pas la modification de cette carte avec tes droits.');
      return state.dossier.editHref;
    }
    if (kind === 'notices') return '/cgi-bin/koha/members/notices.pl?borrowernumber=' + state.selected;
    if (kind === 'returns') return '/cgi-bin/koha/circ/returns.pl';
    return memberURL(state.selected).href;
  }
  function snapshotDNR() {
    if (!state.loansLoaded) throw new Error('Attendre le chargement complet des prêts.');
    if (!state.prepared.has(state.selected)) state.prepared.set(state.selected, state.loans.filter(l => l.date_due_overdue).map(l => Object.assign({}, l)));
    return state.prepared.get(state.selected);
  }
  function preparedHTML() {
    const docs = snapshotDNR();
    if (!docs.length) return '<p>Aucun prêt en retard à préparer. Les informations du dossier existant se trouvent dans les attributs Koha enregistrés ; ne pas remplacer son montant par zéro.</p><p>Pour sortir du DNR : effacer dernier contact, année, documents dus et montant, puis choisir Adulte / Jeune. Conserver la note interne datée si nécessaire.</p>';
    const total = docs.reduce((v,l) => v + number(l.price), 0);
    return '<h4>Informations à enregistrer dans les champs DNR</h4><p>Choisir les documents du litige. Le montant proposé est à vérifier : les prix absents ne sont pas estimés. Utiliser « Ajouter » dans Koha pour un champ « Document dû » par document. Ces propositions restent disponibles dans cette session après les retours.</p>' +
      '<p>Année de DNR : ' + new Date().getFullYear() + ' · Montant proposé pour tous les documents ci-dessous : ' + money(total) + (docs.some(l => !l.price) ? ' · Prix absent ou nul à vérifier.' : '') + '</p>' +
      docs.map((l,i) => '<article class="tp4-message"><p>' + esc(documentText(l)) + '</p><div class="tp4-actions"><button type="button" data-copy-doc="' + i + '">Copier pour « Document dû »</button>' + itemLink(l) + '</div></article>').join('') +
      '<p>Passage en DNR : choisir la catégorie DNR et enregistrer la carte, puis rouvrir « Modifier » pour compléter date du dernier contact signée, année, documents dus, montant et note interne. Vérifier leur présence sur la carte avant de faire les retours.</p>' +
      '<p>Sortie de DNR : effacer dernier contact, année, documents dus et montant, puis choisir Adulte / Jeune. La note interne datée peut rester selon la procédure DNR.</p>';
  }
  function documentText(l) { return [l.title, 'Code-barres : ' + (l.barcode || 'non renseigné'), 'Cote : ' + (l.itemcallnumber || ''), 'Site propriétaire : ' + (l.homebranch || 'à vérifier'), 'Site de prêt : ' + (l.branchname || l.branchcode || ''), 'Retour prévu : ' + (l.date_due || ''), 'Remplacement : ' + (l.price === '' || l.price == null ? 'non renseigné' : money(l.price))].join(' | '); }
  function itemLink(l) {
    return idOK(l.itemnumber) && idOK(l.biblionumber) ? '<button type="button" data-item-status="'+esc(l.itemnumber)+'">Modifier les statuts</button>' : '<span>Ouvrir l’exemplaire depuis la fiche bibliographique.</span>';
  }
  async function copyPrepared(index) {
    const docs = state.prepared.get(state.selected) || [];
    if (!docs[index]) return;
    try { await navigator.clipboard.writeText(documentText(docs[index])); status('Informations du document copiées : les coller dans « Document dû » de Koha.', 'success'); }
    catch (_) { status('Copie indisponible : sélectionner le texte du document ci-dessus puis Ctrl+C.', 'info'); }
  }
  function workflowAction(kind) {
    if (locked() || !state.dossier || !state.loansLoaded) return;
    if (kind === 'cleanup') { openCleanup(); return; }
    try {
      const target = safeURL(nativeTarget(kind));
      // Conserver les identifiants des exemplaires avant les retours, même sans prêt ensuite.
      if (kind === 'dnr' || kind === 'returns') snapshotDNR();
      state.manual = true;
      const docs = state.prepared.get(state.selected) || state.loans.filter(l => l.date_due_overdue);
      $('#tp4-operation').innerHTML = '<div class="tp4-editor"><h4>Écran Koha</h4>' +
        (kind === 'dnr' ? preparedHTML() : kind === 'returns' ? '<p>Scanner uniquement les documents concernés ci-dessous. Pour une restitution / un rachat avant transmission, remettre l’exemplaire empruntable ; pour DNR ou clôture après finances, choisir le statut perdu adapté après le retour.</p>' + docs.map(l => '<p>' + esc(l.title) + ' · <strong>' + esc(l.barcode) + '</strong> · ' + itemLink(l) + '</p>').join('') : kind === 'card' ? '<p>Dans la fiche ci-dessous : « Imprimer » → « Imprimer les retards ». Transmettre ensuite la lettre à la logistique et tracer la signature / l’envoi.</p>' : '') +
        '<p><a href="' + esc(target.href) + '" target="_blank" rel="noopener">Ouvrir cet écran Koha dans un onglet ↗</a></p><iframe class="tp4-native" id="tp4-native" title="Opération dans Koha" src="' + esc(target.href) + '"></iframe><p>Enregistrer ou annuler les modifications dans Koha avant de revenir au tableau.</p><button type="button" id="tp4-native-close">Terminé — actualiser le dossier</button></div>';
      syncLocks();
    } catch (e) { state.manual = false; status(e.message, 'error'); syncLocks(); }
  }
  async function closeNative() { state.manual = false; $('#tp4-operation').innerHTML = ''; syncLocks(); await refresh(); }
  function protectedMessage(m) { return /ne pas supprimer|ne pas effacer|conserver ce message/.test(normalize(m.value)); }
  function suggestedMessage(m) { return m.type === 'L' && !protectedMessage(m) && (/\btp4\b/.test(normalize(m.value)) || /^transmis au service finances\b/.test(normalize(m.value))); }
  function openCleanup() {
    state.cleanup = { patron: state.selected, originals: state.dossier.messages.map(m => ({ id:m.id, value:m.value, type:m.type })), done:[], selected:state.dossier.messages.filter(m => m.deleteForm && suggestedMessage(m)).map(m => m.id) };
    renderCleanup();
  }
  function cleanRow(m,c) {
    return '<label class="tp4-clean-row"><input type="checkbox" data-clean-select="'+esc(m.id)+'" '+(c.selected.includes(m.id)?'checked ':'')+(!m.deleteForm||protectedMessage(m)?'disabled ':'')+'><span><small>'+esc(m.meta|| (m.type==='L'?'Note interne':'Message OPAC'))+'</small><span class="tp4-pre">'+esc(m.value)+'</span>'+(!m.deleteForm?'<small>Suppression non proposée par Koha.</small>':protectedMessage(m)?'<small>À conserver.</small>':'')+'</span></label>';
  }
  function updateCleanCount() {
    if(!state.cleanup)return;
    const count=state.cleanup.selected.filter(id=>!state.cleanup.done.includes(id)&&state.dossier.messages.some(m=>m.id===id)).length;
    const n=$('#tp4-clean-count');if(n)n.textContent=count+' message(s) sélectionné(s)';
    const button=$('#tp4-clean-confirm');if(button)button.textContent='Supprimer '+count+' message(s)';
  }
  function renderCleanup(message) {
    const c=state.cleanup;if(!c)return;
    const related=state.dossier.messages.filter(m=>/\btp4\b|^transmis au service finances\b/.test(normalize(m.value)));
    const other=state.dossier.messages.filter(m=>!related.includes(m));
    $('#tp4-operation').innerHTML='<div class="tp4-editor"><h4>Messages à supprimer</h4><p>Seuls les messages cochés seront supprimés. Vérifier leur date : ils peuvent appartenir à un ancien litige.</p>'+
      (message?'<p role="status">'+esc(message)+'</p>':'')+
      related.map(m=>cleanRow(m,c)).join('')+
      (other.length?'<details class="tp4-more"><summary>Autres messages de la carte ('+other.length+')</summary>'+other.map(m=>cleanRow(m,c)).join('')+'</details>':'')+
      '<p><strong id="tp4-clean-count"></strong></p><p><label><input type="checkbox" id="tp4-clean-done"> J’ai vérifié la clôture et les messages sélectionnés.</label></p>'+
      '<details class="tp4-guide"><summary>Quoi vérifier avant de supprimer ?</summary><p>Documents concernés traités, statuts corrects, catégorie et champs DNR / notes / restriction contrôlés, logistique informée si nécessaire.</p><p>Les notes internes TP4 et la transmission aux finances sont proposées. Les autres notes et les messages OPAC restent décochés. Les messages demandant à être conservés sont protégés.</p><p>Cette action ne retire ni prêts ni restrictions, et ne modifie ni catégorie ni attribut DNR.</p></details>'+
      '<div class="tp4-actions"><button type="button" id="tp4-clean-confirm">Supprimer les messages sélectionnés</button><button type="button" id="tp4-clean-cancel">Fermer / actualiser</button></div></div>';
    all('[data-clean-select]').forEach(n=>n.addEventListener('change',()=>{c.selected=all('[data-clean-select]:checked').map(x=>x.dataset.cleanSelect);updateCleanCount();}));
    updateCleanCount();syncLocks();
  }

  function prepareDelete(dossier, original, patron) {
    if (!dossier.inventoryComplete) throw new Error('Liste native des messages incomplète. Utiliser la fiche Koha pour le nettoyage.');
    const m = dossier.messages.find(x => x.id === original.id);
    if (!m || !m.deleteForm) throw new Error('Message absent ou suppression non autorisée par Koha : ' + original.id + '.');
    if (protectedMessage(m)) throw new Error('Ce message doit être conservé.');
    if (m.value !== original.value || m.type !== original.type) throw new Error('Un message a changé dans Koha. Fermer puis rouvrir le nettoyage pour vérifier la nouvelle version.');
    const f=m.deleteForm, p=encodeForm(f);
    safeURL(f.getAttribute('action'), DELETE_PATH);
    if (String(f.method).toLowerCase() !== 'post' || p.get('op') !== 'cud-delete' || p.get('borrowernumber') !== patron || p.get('message_id') !== m.id || !p.get('csrf_token')) throw new Error('Formulaire de suppression Koha incomplet ou inattendu. Aucune suppression effectuée pour ce message.');
    return p;
  }
  async function cleanMessages() {
    if (!state.cleanup || state.busy || state.uncertain) return;
    const c=state.cleanup;
    if (!$('#tp4-clean-done').checked) { status('Confirmer le contrôle de clôture avant de nettoyer les messages.', 'info'); return; }
    const ids=c.selected.filter(id => !c.done.includes(id));
    if (!ids.length) { status('Cocher au moins un message supprimable.', 'info'); return; }
    state.busy=true; syncLocks();
    try {
      // Contrôler toute la sélection avant la première suppression, puis relire pour chaque message.
      const preflight=await getDossier(c.patron);
      for (const id of ids) prepareDelete(preflight,c.originals.find(m=>m.id===id),c.patron);
      for (const id of ids) {
        const before=await getDossier(c.patron), original=c.originals.find(m=>m.id===id);
        const payload=prepareDelete(before,original,c.patron);
        state.uncertain={kind:'delete',patron:c.patron,id};
        status('Suppression du message ' + (c.done.length+1) + '…', 'info');
        let postError;
        try { await request(DELETE_PATH,{method:'POST',body:payload}); } catch(e) {postError=e;}
        const after=await getDossier(c.patron);
        if (!writeVerified(after,state.uncertain)) throw new Error(postError ? postError.message : 'Suppression non confirmée dans Koha.');
        c.done.push(id); state.uncertain=null; state.dossier=after;
      }
      state.busy=false; $('#tp4-messages').innerHTML=messagesHTML();
      renderCleanup(c.done.length + ' message(s) supprimé(s) et vérifié(s). Fermer pour actualiser le tableau.');
      status('Nettoyage vérifié dans Koha. Les autres messages ont été conservés.', 'success');
    } catch(e) {
      state.busy=false;
      status((c.done.length ? c.done.length+' suppression(s) déjà vérifiée(s). ' : '') + e.message + (state.uncertain ? ' Utiliser « Vérifier l’enregistrement » : aucune suppression supplémentaire avant confirmation.' : ''),'error');
      syncLocks();
    }
  }
  async function closeCleanup() { if(state.busy || state.uncertain)return; state.cleanup=null; $('#tp4-operation').innerHTML=''; syncLocks(); await refresh(); }

  function startDraft(kind) {
    if (state.busy || state.uncertain || state.draft || state.cleanup || state.manual || state.itemManual || !state.dossier) return;
    if (kind === 'free' || /^\d$/.test(kind)) {
      if (!state.dossier.add) return;
      const prefix = kind === 'free' ? '' : QUICK[Number(kind)];
      const day = new Date().toLocaleDateString('fr-FR');
      const agentNode = document.querySelector('.loggedinusername');
      const agent = agentNode ? String(agentNode.dataset.loggedinusername || agentNode.textContent).trim() : '';
      state.draft = { patron: state.selected, id: null, original: '', value: prefix ? prefix + ' - ' + day + (agent ? ' - ' + agent : '') : '', type: 'L' };
    } else {
      const m = state.dossier.messages.find(x => 'edit:' + x.id === kind);
      if (!m || !m.canEdit) return;
      state.draft = { patron: state.selected, id: m.id, original: m.value, value: m.value, type: m.type };
    }
    $('#tp4-composer').innerHTML = '<div class="tp4-editor"><h4>' + (state.draft.id ? 'Modifier le message' : 'Ajouter une note interne') + '</h4><p>' + (state.draft.type === 'B' ? 'Ce message est visible dans l’OPAC.' : 'Note interne destinée aux agents.') + '</p><label for="tp4-message-text">Message</label><textarea id="tp4-message-text" rows="5"></textarea><div class="tp4-actions"><button type="button" id="tp4-save" class="tp4-primary">Enregistrer dans Koha</button><button type="button" id="tp4-cancel">Annuler</button></div></div>';
    const more=$('#tp4-more-actions'); if(more) more.open=false;
    $('#tp4-composer').scrollIntoView({block:'nearest'});
    $('#tp4-message-text').value = state.draft.value;
    $('#tp4-message-text').addEventListener('input', e => { state.draft.value = e.target.value; });
    $('#tp4-message-text').focus(); syncLocks();
  }
  function cancelDraft() { if (state.busy || state.uncertain) return; state.draft = null; $('#tp4-composer').innerHTML = ''; syncLocks(); }
  function encodeForm(form) {
    const payload = new URLSearchParams();
    Array.from(form.elements).forEach(field => {
      if (!field.name || field.disabled || ['button', 'submit', 'reset', 'file'].includes(field.type) || (['radio', 'checkbox'].includes(field.type) && !field.checked)) return;
      if (field.tagName === 'SELECT' && field.multiple) Array.from(field.selectedOptions).forEach(o => payload.append(field.name, o.value));
      else payload.append(field.name, field.value);
    });
    return payload;
  }
  function prepareWrite(dossier, draft) {
    let form;
    if (draft.id) {
      const m = dossier.messages.find(x => x.id === draft.id);
      if (!m || !m.canEdit) throw new Error('Ce message n’est plus modifiable depuis ta fiche Koha.');
      if (m.type !== draft.type) throw new Error('Le type du message a changé dans Koha. Annule puis rouvre-le.');
      if (m.value !== draft.original) throw new Error('Le message a changé dans Koha depuis son ouverture. Annule puis rouvre-le pour reprendre la version actuelle.');
      form = m.form;
    } else { form = dossier.add; }
    if (!form) throw new Error('Formulaire d’ajout Koha indisponible.');
    if (String(form.method).toLowerCase() !== 'post') throw new Error('Méthode du formulaire Koha inattendue.');
    safeURL(form.getAttribute('action'), MESSAGE_PATH);
    const p = encodeForm(form);
    if (!p.get('csrf_token')) throw new Error('Jeton CSRF absent du formulaire Koha. Aucune écriture effectuée.');
    if (p.get('op') !== (draft.id ? 'cud-edit_message' : 'cud-add_message')) throw new Error('Opération Koha non reconnue.');
    if (!draft.id && (p.get('borrowernumber') !== draft.patron || !p.get('branchcode'))) throw new Error('Identité ou site de session absent du formulaire.');
    if (draft.id && p.get('message_id') !== draft.id) throw new Error('Identifiant de message différent.');
    p.set('borrower_message', draft.value);
    // Les ajouts TP4 sont toujours internes. Les éditions conservent le type natif.
    if (!draft.id) p.set('message_type', 'L');
    p.delete('select_patron_notice'); p.delete('borrower_subject');
    return p;
  }
  function writeVerified(dossier, pending) {
    if (pending.kind === 'delete') return dossier.inventoryComplete && !dossier.messages.some(m => m.id === pending.id);
    return dossier.messages.some(m => m.value === pending.value && (pending.id ? m.id === pending.id : !pending.beforeIds.includes(m.id) && m.type === 'L'));
  }
  async function finishWrite(dossier) {
    state.uncertain = null; state.busy = false; state.draft = null; state.dossier = dossier;
    $('#tp4-composer').innerHTML = ''; $('#tp4-messages').innerHTML = messagesHTML();
    status('Message enregistré et vérifié dans Koha. Actualisation des étapes…', 'success');
    syncLocks();
    await refresh();
    if (state.reportStale) status('Message enregistré dans Koha ; le tableau n’a pas pu être actualisé. Utilise « Actualiser les dossiers ».', 'error');
    else status('Message enregistré dans Koha ; classement actualisé depuis 5261.', 'success');
  }
  async function saveDraft() {
    if (!state.draft || state.busy || state.uncertain) return;
    const draft = Object.assign({}, state.draft, { value: $('#tp4-message-text').value.trim() });
    if (!draft.value) { status('Saisis un message avant d’enregistrer.', 'error'); return; }
    state.draft.value = draft.value;
    state.busy = true; syncLocks(); status('Vérification du formulaire Koha…', 'info');
    let pending, postError;
    try {
      const fresh = await getDossier(draft.patron);
      const payload = prepareWrite(fresh, draft);
      pending = Object.assign({}, draft, { beforeIds: fresh.messages.map(m => m.id) });
      state.uncertain = pending;
      status('Enregistrement dans Koha…', 'info');
      try { await request(MESSAGE_PATH, { method: 'POST', body: payload }); }
      catch (e) { postError = e; }
      // Une redirection/HTTP 200 n’est pas une preuve d’écriture : relire la fiche.
      const after = await getDossier(draft.patron);
      if (!writeVerified(after, pending)) throw new Error(postError ? postError.message : 'Koha n’affiche pas encore le message enregistré.');
      await finishWrite(after);
    } catch (e) {
      state.busy = false;
      if (!pending) state.uncertain = null;
      status(state.uncertain ? 'Enregistrement non confirmé : ' + e.message + ' Utilise « Vérifier l’enregistrement » avant toute nouvelle écriture.' : e.message, 'error');
      syncLocks();
    }
  }
  async function verifyPending() {
    if (!state.uncertain || state.busy) return;
    state.busy = true; syncLocks();
    try {
      const after = await getDossier(state.uncertain.patron);
      if (writeVerified(after, state.uncertain)) {
        if (state.uncertain.kind === 'delete') { state.cleanup.done.push(state.uncertain.id); state.uncertain = null; state.busy = false; state.dossier = after; $('#tp4-messages').innerHTML=messagesHTML(); renderCleanup('Suppression vérifiée. Relancer uniquement les messages restant dans la liste.'); status('Suppression vérifiée dans Koha. Fermer pour actualiser, ou contrôler les messages restants.', 'success'); }
        else await finishWrite(after);
      }
      else {
        state.busy = false;
        status('Le message n’est pas confirmé dans Koha. Les écritures restent bloquées pour éviter un doublon ; consulte la fiche Koha avant de recharger la page.', 'error');
        syncLocks();
      }
    } catch (e) { state.busy = false; status('Vérification impossible : ' + e.message, 'error'); syncLocks(); }
  }
  async function loadBranches() {
    const doc = parseHTML(await request(reportURL(null)));
    const select = doc.querySelector('select[name="sql_params"]');
    if (!select) throw new Error('Le paramètre « Site adhérent » du rapport est introuvable. Vérifie le SQL V0.3 de 5261.');
    const opts = Array.from(select.options).filter(o => o.value && o.value !== '%');
    $('#tp4-branch').innerHTML = '<option value="%">Tous les sites</option>' + opts.map(o => '<option value="' + esc(o.value) + '">' + esc(o.textContent) + '</option>').join('');
    const pageBranch = url.searchParams.get('tp4_site');
    const sessionBranch = document.querySelector('.logged-in-branch-code, .loggedinbranchcode, #logged-in-branch-code');
    const preferred = pageBranch || state.branch || (sessionBranch && sessionBranch.textContent.trim()) || '';
    state.branch = opts.some(o => o.value === preferred) || preferred === '%' ? preferred : '';
    if (!state.branch) {
      $('#tp4-branch').insertAdjacentHTML('afterbegin', '<option value="" selected>Choisir un site…</option>');
      $('#tp4-branch').value = ''; return false;
    }
    $('#tp4-branch').value = state.branch;
    return true;
  }
  function addStyle() {
    if (document.getElementById('pmk143-style')) return;
    const style = document.createElement('style'); style.id = 'pmk143-style';
    style.textContent = `
      #pmk143{--tp4-green:#287b37;--tp4-border:#cdd8cf;color:#23352a;font-size:14px;max-width:1800px;margin:18px auto;padding:0 14px}
      #pmk143 *{box-sizing:border-box}#pmk143 [hidden]{display:none!important}
      #pmk143 h1{font-size:29px;margin:0 0 6px}#pmk143 h2{font-size:23px;margin:0 0 5px}#pmk143 h3{font-size:18px;margin:0 0 12px}#pmk143 p{margin:6px 0 12px}
      #pmk143 button,#pmk143 select,#pmk143 input{font:inherit;border:1px solid var(--tp4-border);border-radius:7px;background:white;padding:9px 12px;color:#23352a}
      #pmk143 button{cursor:pointer}#pmk143 button:hover{border-color:var(--tp4-green);background:#edf6ef}#pmk143 button:disabled{opacity:.5;cursor:default}
      #pmk143 :focus-visible{outline:3px solid #74a4dd;outline-offset:2px}#pmk143 a{color:#21642d;text-decoration:underline}
      #pmk143 .tp4-primary{background:var(--tp4-green);color:white;border-color:var(--tp4-green)}#pmk143 .tp4-head,#pmk143 .tp4-toolbar,#pmk143 .tp4-actions,#pmk143 .tp4-contact{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      #pmk143 .tp4-head{justify-content:space-between;margin-bottom:20px}#pmk143 .tp4-toolbar{padding:15px;background:#e8f0e9;border:1px solid var(--tp4-border);border-radius:10px}
      #pmk143 #tp4-search{flex:1;min-width:240px}#pmk143 .tp4-stage{border-radius:20px;white-space:nowrap}#pmk143 .tp4-stage[aria-pressed=true]{box-shadow:0 0 0 2px var(--tp4-green);font-weight:bold}
      #pmk143 #tp4-stages{display:flex;gap:9px;flex-wrap:wrap;margin:17px 0}#pmk143 .tp4-status{padding:12px 14px;margin:12px 0;border-radius:8px;border:1px solid #bdcdbf;background:#f0f5f0;white-space:pre-line}
      #pmk143 .tp4-status.error,#pmk143 .tp4-alert{background:#fff3ed;border-color:#d9a284;color:#7a351a}#pmk143 .tp4-status.success{background:#eef8ef;color:#235b2a}
      #pmk143 .tp4-layout{display:grid;grid-template-columns:minmax(280px,360px) minmax(0,1fr);gap:20px;align-items:start}#pmk143 #tp4-list{max-height:76vh;overflow:auto;padding:3px}
      #pmk143 .tp4-reader{display:flex;flex-direction:column;gap:8px;width:100%;text-align:left;margin:0 0 10px;padding:14px;border-left:5px solid #82988a}#pmk143 .tp4-reader.selected{box-shadow:0 0 0 2px var(--tp4-green)}
      #pmk143 .tp4-row-head,#pmk143 .tp4-panel-head{display:flex;justify-content:space-between;gap:12px;align-items:baseline}#pmk143 .tp4-row-head>span{white-space:nowrap}
      #pmk143 #tp4-panel{min-width:0;background:#fff;border:1px solid var(--tp4-border);border-radius:12px;padding:22px;min-height:300px}#pmk143 .tp4-summary{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}
      #pmk143 .tp4-summary>span{display:flex;flex:1;flex-direction:column;background:#f0f5f0;padding:15px;border-radius:8px;min-width:130px}#pmk143 .tp4-summary strong{font-size:23px;margin-bottom:5px}
      #pmk143 .tp4-section{padding:18px;border:1px solid var(--tp4-border);background:#f8faf8;border-radius:9px;margin:18px 0}#pmk143 .tp4-section.tp4-alert{background:#fff3ed;border-color:#d9a284}#pmk143 .tp4-contact{gap:20px}
      #pmk143 .tp4-badge{display:inline-block;border-radius:6px;padding:5px 8px;font-size:13px}#pmk143 .call{background:#eaf3ff}#pmk143 .search{background:#fff9d9}#pmk143 .letter{background:#fff0df}#pmk143 .signature{background:#f3eaff}#pmk143 .sent{background:#e7f5e9}#pmk143 .control{background:#f0f0f0}
      #pmk143 .tp4-reader.call{border-left-color:#4380b8}#pmk143 .tp4-reader.search{border-left-color:#b49635}#pmk143 .tp4-reader.letter{border-left-color:#c77a28}#pmk143 .tp4-reader.signature{border-left-color:#9364b1}#pmk143 .tp4-reader.sent{border-left-color:#4a925a}
      #pmk143 .tp4-warning{color:#9a421b;font-weight:600}#pmk143 .tp4-empty{padding:35px 15px;text-align:center;color:#617367}#pmk143 .tp4-pre{white-space:pre-wrap;overflow-wrap:anywhere}
      #pmk143 .tp4-message{background:white;border:1px solid #dce3dc;border-radius:7px;padding:12px;margin:10px 0}#pmk143 .tp4-message small{color:#56665b}#pmk143 .tp4-editor{background:white;border:2px solid var(--tp4-green);border-radius:8px;padding:16px;margin-top:15px}
      #pmk143 .tp4-native{width:100%;height:680px;border:1px solid var(--tp4-border);background:white}#pmk143 .tp4-clean-row{display:block;padding:10px;border-bottom:1px solid var(--tp4-border)}#pmk143 .finance,#pmk143 .cleanup{background:#fff0df}#pmk143 .dnr{background:#f3eaff}
      #pmk143 .tp4-section{background:transparent;border:0;border-top:1px solid #e0e7e1;border-radius:0;padding:16px 0;margin:14px 0}
      #pmk143 .tp4-contact{font-size:13px;margin:8px 0 14px}#pmk143 .tp4-metrics,#pmk143 .tp4-muted{font-size:13px;color:#627168}#pmk143 .tp4-metrics span{padding:0 5px}
      #pmk143 .tp4-next{margin-bottom:12px}#pmk143 .tp4-more,#pmk143 .tp4-guide,#pmk143 .tp4-supplement{font-size:13px;margin:12px 0;color:#526459}
      #pmk143 summary{cursor:pointer;padding:5px 0;font-weight:600}#pmk143 details[open]>summary{margin-bottom:8px}#pmk143 .tp4-more .tp4-actions{margin:10px 0}
      #pmk143 .tp4-checks{font-size:13px;color:#925221;margin:8px 0}#pmk143 .tp4-checks p{margin:8px 0}
      #pmk143 .tp4-message{border:0;border-bottom:1px solid #e0e7e1;border-radius:0;padding:10px 0;margin:0}#pmk143 .tp4-message button{padding:4px 8px;font-size:12px}
      #pmk143 .tp4-message p{margin-top:8px}#pmk143 table small{display:block;font-size:12px;line-height:1.5;color:#627168}#pmk143 table [data-item-status]{font-size:12px;padding:4px 7px;margin:3px 0}#pmk143 .tp4-loan-meta{margin:5px 0}#pmk143 th,#pmk143 td{padding:9px 8px}#pmk143 th{background:#f3f6f3;font-size:12px}
      #pmk143 .tp4-clean-row{display:flex;gap:9px;align-items:flex-start;padding:10px 0}#pmk143 .tp4-clean-row input{margin-top:3px;flex:none}#pmk143 .tp4-clean-row>span{min-width:0}#pmk143 .tp4-clean-row small,#pmk143 .tp4-clean-row .tp4-pre{display:block}#pmk143 .tp4-clean-row small{font-size:12px;color:#627168;margin-bottom:5px}
      #pmk143 .tp4-editor{border:1px solid #b8cfbf}#pmk143 .tp4-status.success{border:0;background:transparent;padding:5px 0;font-size:13px}
      #pmk143 textarea{display:block;width:100%;font:inherit;border:1px solid #a8bdaa;border-radius:6px;padding:10px;margin:8px 0 12px}#pmk143 .tp4-scroll{overflow:auto}#pmk143 table{border-collapse:collapse;width:100%;background:white}#pmk143 th,#pmk143 td{padding:10px;border-bottom:1px solid #dce3dc;text-align:left;vertical-align:top}#pmk143 th{background:#eaf0eb}#pmk143 .tp4-history{display:inline-block;margin:3px 12px 6px 0}
      @media(max-width:950px){#pmk143 .tp4-layout{grid-template-columns:minmax(0,1fr)}#pmk143 #tp4-list{max-height:320px}#pmk143 #tp4-panel{padding:14px}}
    `;
    document.head.appendChild(style);
  }
  function bind() {
    state.root.addEventListener('click', e => {
      const button = e.target.closest('button'); if (!button || button.disabled) return;
      if (button.dataset.stage) { state.stage = button.dataset.stage; renderList(); }
      else if (button.dataset.reader) select(button.dataset.reader);
      else if (button.dataset.quick != null) startDraft(button.dataset.quick);
      else if (button.dataset.edit) startDraft('edit:' + button.dataset.edit);
      else if (button.dataset.workflow) workflowAction(button.dataset.workflow);
      else if (button.dataset.itemStatus) openItemStatus(button.dataset.itemStatus);
      else if (button.id === 'tp4-item-close') closeItemStatus();
      else if (button.dataset.copyDoc != null) copyPrepared(Number(button.dataset.copyDoc));
      else if (button.id === 'tp4-clean-confirm') cleanMessages();
      else if (button.id === 'tp4-clean-cancel') closeCleanup();
      else if (button.id === 'tp4-native-close') closeNative();
      else if (button.id === 'tp4-refresh') { if (state.branch) refresh(); else status('Choisis un site.', 'info'); }
      else if (button.id === 'tp4-save') saveDraft();
      else if (button.id === 'tp4-cancel') cancelDraft();
      else if (button.id === 'tp4-verify') verifyPending();
    });
    $('#tp4-search').addEventListener('input', e => { state.query = e.target.value; renderList(); });
    $('#tp4-sort').addEventListener('change', e => { state.sort = e.target.value; renderList(); });
    $('#tp4-branch').addEventListener('change', e => { state.branch = e.target.value; state.selected = null; refresh(); });
    window.addEventListener('beforeunload', e => { if (state.busy || state.uncertain || state.manual || state.itemManual || state.cleanup || (state.draft && state.draft.value)) { e.preventDefault(); e.returnValue = ''; } });
  }
  function pageTarget() {
    // Même surface que le gestionnaire 138, avec les variantes Koha récentes.
    return document.querySelector('#container-main, main#main_intranet-main, main.container-fluid, main[role="main"], main, #main, #content, .main');
  }
  async function mount() {
    if (document.getElementById('pmk143') || mounting) return;
    mounting = true;
    document.documentElement.classList.add('pmk138-virtual-route');
    document.body.classList.add('pmk138-virtual-page');
    let main = pageTarget();
    if (!main) {
      // Afficher le pilote même si le thème ne porte aucun sélecteur connu.
      main = document.createElement('div'); main.id = 'pmk143-fallback-host';
      document.body.appendChild(main);
    }
    // Un seul propriétaire de la surface virtuelle : réutiliser le host 138
    // s'il existe déjà, au lieu de créer deux pages qui se masquent mutuellement.
    let host = document.getElementById('pmk138-page-host');
    if (!host || !main.contains(host)) {
      host = document.createElement('div'); host.id = 'pmk138-page-host';
      main.appendChild(host);
    }
    Array.from(main.children).forEach(n => {
      if (n === host) return;
      n.hidden = true; n.style.setProperty('display', 'none', 'important');
    });
    host.hidden = false; host.style.setProperty('display', 'block', 'important');
    host.replaceChildren();
    state.root = document.createElement('section'); state.root.id = 'pmk143';
    state.root.innerHTML = '<div class="tp4-head"><div><h1>Gestion des retards TP4</h1><p>Consulter et traiter les dossiers dans Koha.</p></div><div class="tp4-actions"><a href="/cgi-bin/koha/mainpage.pl?pmk_page=hub">← Pages & outils internes</a><a href="/cgi-bin/koha/mainpage.pl">Accueil Koha</a></div></div><div class="tp4-toolbar"><label for="tp4-branch">Site du lecteur</label><select id="tp4-branch" data-navigation><option>Chargement…</option></select><input id="tp4-search" data-navigation type="search" aria-label="Rechercher un lecteur" placeholder="Nom, carte, téléphone, mail…"><label for="tp4-sort">Tri</label><select id="tp4-sort" data-navigation><option value="overdue">Retard décroissant</option><option value="name">Nom</option><option value="value">Valeur décroissante</option></select><button id="tp4-refresh" type="button" data-navigation>Actualiser les dossiers</button></div><div id="tp4-status" class="tp4-status" role="status" aria-live="polite">Chargement…</div><button id="tp4-verify" type="button" hidden>Vérifier l’enregistrement</button><div id="tp4-stages" aria-label="Filtrer par étape"></div><div class="tp4-row-head"><p id="tp4-count"></p><small id="tp4-updated"></small></div><div class="tp4-layout"><aside id="tp4-list" aria-label="Dossiers lecteurs"></aside><div id="tp4-panel"></div></div>';
    host.appendChild(state.root); document.title = 'Gestion des retards TP4 › Koha'; addStyle(); bind();
    state.loading = true; syncLocks(); renderPanel();
    try {
      const chosen = await loadBranches(); state.loading = false; syncLocks();
      if (chosen) await refresh(); else { status('Choisis le site de rattachement des lecteurs pour charger les dossiers.', 'info'); renderList(); }
    } catch (e) { state.loading = false; status(e.message, 'error'); syncLocks(); }
    finally { mounting = false; }
  }
  window.PMK143 = {
    version: VERSION,
    open: () => { window.location.href = '/cgi-bin/koha/mainpage.pl?pmk_page=' + PAGE; },
    debug: () => ({ version: VERSION, reportId: CONFIG.reportId, branch: state.branch, rows: state.rows.length,
      loading: state.loading, busy: state.busy, reportStale: state.reportStale, writeUnconfirmed: !!state.uncertain,
      pageMounted: !!(state.root && state.root.isConnected), pageHostFound: !!pageTarget(),
      hubVersion: window.PMKPages ? window.PMKPages.version : null,
      hubKnowsRoute: !!(window.PMKPages && window.PMKPages.manifest && window.PMKPages.manifest.some(p => p.id === PAGE)),
      nativeOperation: state.manual, itemEditorOpen: state.itemManual, cleanupOpen: !!state.cleanup, nativeAddForm: !!(state.dossier && state.dossier.add), nativeEditForms: state.dossier ? state.dossier.messages.filter(m => m.canEdit).length : 0 })
  };
  function boot() {
    const launcher=document.getElementById('pmk143-launch'); if(launcher){ const parent=launcher.parentElement;launcher.remove();if(parent&&parent.tagName==='P'&&!parent.textContent.trim()&&!parent.children.length)parent.remove(); }
    if (url.pathname.endsWith('/mainpage.pl') && url.searchParams.get('pmk_page') === PAGE) mount();

  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})(window, document);

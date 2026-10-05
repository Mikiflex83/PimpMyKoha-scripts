/*
 Nom du fichier : 138-pages-manager.js
 Version : 1.0.4
 Date : 2026-10-02

 PimpMyKoha — Pages & outils internes
 - aucune page Koha personnalisée requise ;
 - routes virtuelles sur mainpage.pl?pmk_page=... ;
 - accès strictement réservé aux superlibrarians Koha ;
 - aucune configuration métier stockée dans PMK ;
 - une application par fichier JS séparé ;
 - seul le fichier demandé est chargé.
*/
(function (window, document) {
    'use strict';
    if (window.__PMK138_PAGES_MANAGER__) return;
    window.__PMK138_PAGES_MANAGER__ = true;

    const MODULE_ID = 'internal-pages-tools';
    const VERSION = '1.0.4';
    const ROUTE_PARAM = 'pmk_page';
    const HUB_ID = 'hub';

    // Marque immédiatement les routes virtuelles et canonicalise les anciennes URL.
    const initialParams = new URLSearchParams(window.location.search);
    const initialRoute = initialParams.get(ROUTE_PARAM);
    if (initialRoute) {
        try { document.documentElement.classList.add('pmk138-virtual-route'); } catch (_) {}
        if (initialRoute === 'attendance-counter' && initialParams.has('source')) {
            initialParams.delete('source');
            const cleanUrl = window.location.pathname + '?' + initialParams.toString() + window.location.hash;
            try { window.history.replaceState(window.history.state, '', cleanUrl); } catch (_) {}
        }
    }
    const selfUrl = new URL(document.currentScript && document.currentScript.src || window.location.href, window.location.href);
    const baseUrl = new URL('./', selfUrl);
    const release = selfUrl.searchParams.get('v') || '20261002-pmk138-v104';
    const manifest = [
    {
        "id": "attendance-counter",
        "title": "Compteur de fréquentation",
        "out": "138-page-attendance-counter",
        "icon": "fa-users",
        "group": "Outils généraux",
        "desc": "Saisie et suivi de fréquentation."
    },
    {
        "id": "action-journal",
        "title": "Journal des actions",
        "out": "138-page-action-journal",
        "icon": "fa-book",
        "group": "Outils généraux",
        "desc": "Journal partagé des actions et suivi."
    },
    {
        "id": "restore-deleted-items",
        "title": "Restauration d’exemplaires",
        "out": "138-page-restore-deleted-items",
        "icon": "fa-medkit",
        "group": "Outils généraux",
        "desc": "Recherche, restauration et traitement d’exemplaires supprimés."
    },
    {
        "id": "weeding",
        "title": "Désherbage",
        "out": "138-page-weeding",
        "icon": "fa-trash",
        "group": "Outils généraux",
        "desc": "Outil de désherbage et d’analyse des collections."
    },
    {
        "id": "appointments",
        "title": "Rendez-vous réseau / Doodle",
        "out": "138-page-appointments",
        "icon": "fa-calendar",
        "group": "Outils généraux",
        "desc": "Créneaux, rendez-vous et sondages réseau."
    },
    {
        "id": "authorities",
        "title": "Maintenance des autorités",
        "out": "138-page-authorities",
        "icon": "fa-user-circle",
        "group": "Qualité Koha",
        "desc": "Doublons, fusions, orphelines, relink et audit des autorités."
    },
    {
        "id": "inventory",
        "title": "Inventaire",
        "out": "138-page-inventory",
        "icon": "fa-clipboard",
        "group": "Outils généraux",
        "desc": "Inventaire autonome des collections."
    },
    {
        "id": "reservations",
        "title": "Maintenance des réservations",
        "out": "138-page-reservations",
        "icon": "fa-hand-paper-o",
        "group": "Qualité Koha",
        "desc": "Analyse et maintenance des réservations."
    },
    {
        "id": "loans",
        "title": "Prêts & litiges",
        "out": "138-page-loans",
        "icon": "fa-retweet",
        "group": "Qualité Koha",
        "desc": "Analyse des prêts anciens, litiges et réclamations."
    },
    {
        "id": "transfers",
        "title": "Transferts / navette",
        "out": "138-page-transfers",
        "icon": "fa-exchange",
        "group": "Qualité Koha",
        "desc": "Analyse des transferts et navette."
    },
    {
        "id": "items",
        "title": "Maintenance des exemplaires",
        "out": "138-page-items",
        "icon": "fa-barcode",
        "group": "Qualité Koha",
        "desc": "Contrôle d’intégrité et maintenance des exemplaires."
    },
    {
        "id": "biblios",
        "title": "Qualité du catalogue bibliographique",
        "out": "138-page-biblios",
        "icon": "fa-book",
        "group": "Qualité Koha",
        "desc": "Audit bibliographique, doublons et enrichissement assisté."
    },
    {
        "id": "serials",
        "title": "Maintenance des périodiques",
        "out": "138-page-serials",
        "icon": "fa-newspaper-o",
        "group": "Qualité Koha",
        "desc": "Abonnements, fascicules attendus et réclamations."
    },
    {
        "id": "patrons",
        "title": "Qualité des comptes lecteurs",
        "out": "138-page-patrons",
        "icon": "fa-users",
        "group": "Qualité Koha",
        "desc": "Doublons, comptes expirés et coordonnées lecteurs."
    },
    {
        "id": "rulelab",
        "title": "Laboratoire des règles",
        "out": "138-page-rulelab",
        "icon": "fa-flask",
        "group": "Qualité Koha",
        "desc": "Règles candidates, feedback et apprentissage supervisé."
    },
    {
        "id": "quality-center",
        "title": "Centre qualité Koha",
        "out": "138-page-quality-center",
        "icon": "fa-check-circle",
        "group": "Qualité Koha",
        "desc": "Point d’entrée des outils de qualité Koha."
    },
    {
        "id": "bulk-framework-change",
        "title": "Modification de grille par lot",
        "icon": "fa-table",
        "group": "Outils généraux",
        "desc": "Change la grille de catalogage de plusieurs notices à partir de numéros de notice ou de codes-barres d’exemplaires.",
        "external": true
    },
    {
        "id": "xslt-assistant",
        "title": "Assistant XSLT",
        "icon": "fa-code",
        "group": "Outils généraux",
        "desc": "Éditeur visuel des feuilles XSLT Koha : import, réorganisation, conditions, styles, aperçu et export.",
        "external": true
    },
    {
        "id": "overdue-management",
        "title": "Gestion des retards TP4",
        "icon": "fa-clock-o",
        "group": "Outils généraux",
        "desc": "Suivi des dossiers TP4, consultation des prêts en retard et ajout ou modification de messages dans la fiche Koha sans quitter la page.",
        "external": true
    }
];
    const byId = new Map(manifest.map(item => [item.id, item]));
    const registry = new Map();
    const loading = new Map();

    function isSuperlibrarian() {
        try {
            if (window.PMKConfig && typeof window.PMKConfig.isKohaSuperlibrarian === 'function') {
                const result = window.PMKConfig.isKohaSuperlibrarian();
                if (result === true) return true;
            }
        } catch (_) {}
        try {
            const user = document.querySelector(
                '#logged-in-info-full .loggedinusername[data-loggedinusername], ' +
                '.loggedinusername[data-loggedinusername], ' +
                '.loggedinusername[data-is-superlibrarian], ' +
                '.loggedinusername.is_superlibrarian'
            );
            if (!user) return false;
            if (user.classList && user.classList.contains('is_superlibrarian')) return true;
            const raw = String(
                (user.dataset && user.dataset.isSuperlibrarian) ||
                user.getAttribute('data-is-superlibrarian') || ''
            ).trim().toLowerCase();
            return ['is_superlibrarian','superlibrarian','1','true','yes'].includes(raw);
        } catch (_) { return false; }
    }

    function urlFor(id) {
        const u = new URL('/cgi-bin/koha/mainpage.pl', window.location.origin);
        u.searchParams.set(ROUTE_PARAM, String(id || HUB_ID));
        return u.pathname + u.search;
    }

    function open(id, target) {
        const url = urlFor(id);
        if (target === 'new') window.open(url, '_blank', 'noopener');
        else window.location.href = url;
    }

    function register(def) {
        if (!def || !def.id || !byId.has(def.id)) return false;
        registry.set(def.id, def);
        try { document.dispatchEvent(new CustomEvent('pmk:page-registered', { detail: { id:def.id } })); } catch (_) {}
        return true;
    }

    function childUrl(def) {
        const u = new URL('./138-pages/' + def.out + '.js', baseUrl);
        if (release) u.searchParams.set('v', release);
        return u.href;
    }

    function loadScript(src) {
        if (loading.has(src)) return loading.get(src);
        const promise = new Promise((resolve, reject) => {
            const existing = Array.from(document.scripts).find(s => s.src === src);
            if (existing && existing.dataset.pmk138Loaded === '1') return resolve(existing);
            const s = existing || document.createElement('script');
            s.addEventListener('load', () => { s.dataset.pmk138Loaded='1'; resolve(s); }, { once:true });
            s.addEventListener('error', () => reject(new Error('Impossible de charger ' + src)), { once:true });
            if (!existing) {
                s.src = src;
                s.async = false;
                s.dataset.pmk138Child = '1';
                document.head.appendChild(s);
            } else if (existing.dataset.pmk138Loaded === '1') resolve(existing);
        });
        loading.set(src, promise);
        return promise;
    }

    async function ensurePage(id) {
        if (registry.has(id)) return registry.get(id);
        const def = byId.get(id);
        if (!def) throw new Error('Page inconnue : ' + id);
        await loadScript(childUrl(def));
        if (registry.has(id)) return registry.get(id);
        await new Promise((resolve, reject) => {
            const started = Date.now();
            const timer = window.setInterval(() => {
                if (registry.has(id)) { window.clearInterval(timer); resolve(); }
                else if (Date.now()-started > 5000) { window.clearInterval(timer); reject(new Error('La page ne s’est pas enregistrée : '+id)); }
            }, 50);
        });
        return registry.get(id);
    }

    function pageHost() {
        document.body && document.body.classList.add('pmk138-virtual-page');
        let host = document.getElementById('pmk138-page-host');
        if (host) return host;
        host = document.createElement('div');
        host.id = 'pmk138-page-host';
        host.className = 'pmk138-page-host';
        const main = document.querySelector('#container-main, main#main_intranet-main, main.container-fluid, main, #main');
        if (main) {
            Array.from(main.children).forEach(node => { if (node.id !== host.id) node.style.setProperty('display','none','important'); });
            main.appendChild(host);
        } else {
            document.body.appendChild(host);
        }
        return host;
    }

    function injectStyles() {
        if (document.getElementById('pmk138-styles')) return;
        const s=document.createElement('style');
        s.id='pmk138-styles';
        s.textContent=`
#pmk138-page-host{display:block!important;width:100%;max-width:none;margin:0;padding:14px 18px 40px;box-sizing:border-box}
#pmk138-page-host *{box-sizing:border-box}
.pmk138-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px;padding:8px 10px;border:1px solid #d9dee3;border-radius:7px;background:#f7f8f9}
.pmk138-toolbar .pmk138-title{font-weight:700;color:#39444d;margin-right:auto}
.pmk138-hub{max-width:1500px;margin:0 auto}
.pmk138-hub-head{padding:18px 20px;margin-bottom:14px;border:1px solid #cedbbd;border-left:5px solid #6f8f32;border-radius:8px;background:linear-gradient(135deg,#fff,#f5f9ef)}
.pmk138-hub-head h1{font-size:26px;margin:0 0 4px;color:#526d22}
.pmk138-hub-head p{margin:0;color:#697680}
.pmk138-group{margin:18px 0}
.pmk138-group h2{font-size:18px;margin:0 0 9px;color:#39444d}
.pmk138-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.pmk138-card{display:flex;flex-direction:column;min-height:145px;padding:14px;border:1px solid #d8dee3;border-radius:8px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.pmk138-card h3{font-size:16px;margin:0 0 6px;color:#39444d}
.pmk138-card p{color:#697680;margin:0 0 12px;font-size:13px;flex:1}
.pmk138-card .btn{align-self:flex-start}
.pmk138-denied{max-width:760px;margin:35px auto;padding:20px;border:1px solid #e1b5b5;border-radius:8px;background:#fff1f1;color:#822929}
@media(max-width:1050px){.pmk138-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:680px){#pmk138-page-host{padding:10px}.pmk138-grid{grid-template-columns:1fr}}
`;
        document.head.appendChild(s);
    }

    function toolbar(title) {
        const bar=document.createElement('div');bar.className='pmk138-toolbar';
        const back=document.createElement('a');back.className='btn btn-default btn-sm';back.href=urlFor(HUB_ID);back.innerHTML='<i class="fa fa-arrow-left" aria-hidden="true"></i> Pages & outils internes';
        const t=document.createElement('div');t.className='pmk138-title';t.textContent=title || '';
        const home=document.createElement('a');home.className='btn btn-default btn-sm';home.href='/cgi-bin/koha/mainpage.pl';home.innerHTML='<i class="fa fa-home" aria-hidden="true"></i> Accueil Koha';
        bar.append(back,t,home);return bar;
    }

    function renderHub(host) {
        host.replaceChildren();
        const wrap=document.createElement('div');wrap.className='pmk138-hub';
        const head=document.createElement('div');head.className='pmk138-hub-head';head.innerHTML='<h1>Pages & outils internes</h1><p>Applications internes PimpMyKoha — accès réservé aux superlibrarians.</p>';
        wrap.appendChild(head);
        const groups=[...new Set(manifest.map(x=>x.group))];
        groups.forEach(group => {
            const sec=document.createElement('section');sec.className='pmk138-group';
            const h=document.createElement('h2');h.textContent=group;sec.appendChild(h);
            const grid=document.createElement('div');grid.className='pmk138-grid';
            manifest.filter(x=>x.group===group).forEach(item => {
                const card=document.createElement('div');card.className='pmk138-card';
                const h3=document.createElement('h3');h3.innerHTML='<i class="fa '+item.icon+' fa-fw" aria-hidden="true"></i> '+escapeHtml(item.title);
                const p=document.createElement('p');p.textContent=item.desc;
                const a=document.createElement('a');a.className='btn btn-primary btn-sm';a.href=urlFor(item.id);a.textContent='Ouvrir';
                card.append(h3,p,a);grid.appendChild(card);
            });
            sec.appendChild(grid);wrap.appendChild(sec);
        });
        host.appendChild(wrap);
        document.title='Pages & outils internes — Koha';
    }

    function escapeHtml(v) { return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

    async function executeScript(oldScript) {
        return new Promise((resolve,reject) => {
            const s=document.createElement('script');
            Array.from(oldScript.attributes||[]).forEach(a=>s.setAttribute(a.name,a.value));
            if (oldScript.src) {
                s.onload=()=>resolve();s.onerror=()=>reject(new Error('Erreur de chargement : '+oldScript.src));
                oldScript.replaceWith(s);
                return;
            }
            s.textContent=oldScript.textContent || '';
            if ((s.type||'').toLowerCase()==='module') {
                let done=false;const finish=()=>{if(done)return;done=true;resolve();};
                s.onload=finish;s.onerror=()=>{if(done)return;done=true;reject(new Error('Erreur module inline'));};
                oldScript.replaceWith(s);window.setTimeout(finish,12000);
            } else {
                try { oldScript.replaceWith(s); resolve(); } catch(e) { reject(e); }
            }
        });
    }

    async function mountLegacyHtml(container, source) {
        container.innerHTML=source;
        const scripts=Array.from(container.querySelectorAll('script'));
        for (const script of scripts) await executeScript(script);
    }

    function cleanupQualityCenter(container) {
        const root=container.querySelector('#dq-center-app');if(!root)return null;
        const clean=()=>{
            root.querySelectorAll('.dqc-panel').forEach(panel=>{
                const h=panel.querySelector('h3');
                if (h && /Configuration locale des pages/i.test(h.textContent||'')) panel.remove();
            });
        };
        clean();const obs=new MutationObserver(clean);obs.observe(root,{childList:true,subtree:true});return obs;
    }

    async function renderPage(id, host) {
        const meta=byId.get(id);if(!meta) { renderHub(host); return; }
        host.replaceChildren();host.appendChild(toolbar(meta.title));
        const app=document.createElement('div');app.className='pmk138-app-container';host.appendChild(app);
        try {
            const def=await ensurePage(id);
            await def.mount(app,{id,meta,isSuperlibrarian,urlFor,open,mountLegacyHtml});
            if (id==='quality-center') cleanupQualityCenter(app);
            document.title=meta.title+' — Koha';
        } catch(error) {
            console.error('PMK138 — page indisponible',id,error);
            const b=document.createElement('div');b.className='alert alert-danger';b.textContent='Application indisponible : '+(error.message||error);app.replaceChildren(b);
        }
    }

    function requestedPage() { return new URLSearchParams(window.location.search).get(ROUTE_PARAM); }

    function renderDenied(host) { host.innerHTML='<div class="pmk138-denied"><strong>Accès réservé.</strong><br>Ces outils internes sont accessibles uniquement aux superlibrarians Koha.</div>'; }

    function renderPmkLauncher() {
        const wrap=document.createElement('div');
        const p=document.createElement('p');p.textContent='Les applications métier conservent leurs propres paramètres hors de PimpMyKoha. Aucune page Koha personnalisée n’est nécessaire.';
        const a=document.createElement('a');a.className='btn btn-primary';a.href=urlFor(HUB_ID);a.target='_blank';a.rel='noopener';a.innerHTML='<i class="fa fa-external-link" aria-hidden="true"></i> Ouvrir les pages & outils internes';
        wrap.append(p,a);return wrap;
    }

    function registerPmk() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule!=='function') return false;
        try {
            window.PMKConfig.registerModule({
                id:MODULE_ID,schemaVersion:1,
                name:{fr:'Pages & outils internes',en:'Internal pages & tools'},
                description:{fr:'Registre de pages virtuelles réservées aux superlibrarians. Les configurations métier restent dans chaque application.',en:'Registry of virtual pages restricted to superlibrarians. Business configuration stays inside each application.'},
                category:{fr:'Navigation et interface',en:'Navigation and interface'},
                supportedPages:['*'],prerequisites:[],dependencies:[],defaults:{},
                validate:()=>({ok:true}),
                schema:[{type:'section',id:'pages',label:{fr:'Pages internes',en:'Internal pages'},fields:[{type:'custom',render:renderPmkLauncher}]}]
            });
            return true;
        } catch(_) { return false; }
    }

    window.PMKPages={version:VERSION,moduleId:MODULE_ID,manifest:manifest.map(x=>Object.assign({},x)),register,urlFor,open,isSuperlibrarian,mountLegacyHtml,get:id=>registry.get(id)||null};
    try { document.dispatchEvent(new CustomEvent('pmk:pages-ready')); } catch (_) {}

    async function start() {
        injectStyles();registerPmk();
        if (!window.PMKConfig) window.addEventListener('pmk:config-ready',registerPmk,{once:true});
        const id=requestedPage();
        if (!id) return;

        // Certaines pages PMK sont déjà chargées par leur propre module global
        // (par exemple 141-modif-grille-par-lot.js). Le manager 138 les liste
        // dans le hub mais ne doit ni créer son host, ni tenter de charger
        // un fichier dans 138-pages/.
        const requestedMeta = byId.get(id);
        if (requestedMeta && requestedMeta.external === true) return;

        const host=pageHost();
        if (!isSuperlibrarian()) { renderDenied(host); return; }
        if (id===HUB_ID) renderHub(host); else await renderPage(id,host);
    }
    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})(window, document);

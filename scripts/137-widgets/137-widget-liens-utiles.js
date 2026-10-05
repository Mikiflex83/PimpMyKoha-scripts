/* ============================================================
   PimpMyKoha 137 — Widget « Liens utiles »
   v1.1.0 — 24/09/2026

   - contenu entièrement configurable dans PimpMyKoha ;
   - bouton de configuration directement sur le widget, réservé aux
     superlibrarian via le contrôle commun PMK ;
   - activation et ordre du widget toujours pilotés par 137-home-widgets ;
   - deux colonnes configurables, sans HTML à éditer.
   ============================================================ */
(function (window, document) {
    'use strict';

    const WIDGET_ID = 'liens-utiles';
    const MODULE_ID = 'home-widget-useful-links';
    const VERSION = '1.1.0';

    const DEFAULT_CONFIG = {
        enabled: true,
        titleFr: 'Liens pratiques',
        titleEn: 'Useful links',
        links: [
            { id:'wiki', enabled:true, column:'left', label:'Wiki', url:'https://fiches.example.org/', note:'', newTab:true },
            { id:'planning', enabled:true, column:'left', label:'Planning', url:'https://intranet.example.org/', note:'Identifiant : information / Mot de passe : Mediacha!', newTab:true },
            { id:'relances', enabled:true, column:'left', label:'Relances', url:'/private/letters/', note:'', newTab:true },
            { id:'base-test', enabled:true, column:'left', label:'Base test', url:'https://koha-test.example.org/', note:'', newTab:true },
            { id:'cr-reunions', enabled:true, column:'left', label:'CR de réunions', url:'/cgi-bin/koha/tools/page.pl?page_id=78', note:'', newTab:false },
            { id:'pret-secouru', enabled:true, column:'left', label:'Prêt secouru', url:'https://fiches.example.org/lib/exe/fetch.php?media=astuces-pret_secouru2.pdf', note:'', newTab:true },
            { id:'livres-hebdo', enabled:true, column:'left', label:'Livre Hebdo', url:'https://www.livreshebdo.fr/', note:'Identifiant : contact@example.org / Mot de passe : CONFIGURE_LOCALLY', newTab:true },
            { id:'atlas', enabled:true, column:'left', label:'Atlas des bibliothèques', url:'https://shs.hal.science/halshs-04444109', note:'', newTab:true },
            { id:'site', enabled:true, column:'right', label:'Site Internet', url:'https://catalogue.example.org/', note:'', newTab:true },
            { id:'agenda', enabled:true, column:'right', label:'Agenda', url:'https://catalogue.example.org/accueil/agenda', note:'', newTab:true },
            { id:'infos', enabled:true, column:'right', label:'Infos pratiques des médiathèques', url:'https://catalogue.example.org/accueil/infos_et_services-les_mediathques', note:'', newTab:true },
            { id:'billetterie', enabled:true, column:'right', label:'Billetterie', url:'https://billetterie.example.org/', note:'', newTab:true },
            { id:'caisse', enabled:true, column:'right', label:'Interface caisse', url:'https://reservations.example.org/modules/disponibilites/caisse/', note:'', newTab:true },
            { id:'annuaire', enabled:true, column:'right', label:'Annuaire téléphonique', url:'https://fiches.example.org/lib/exe/fetch.php?media=annuaire_telephonique_pole_culturel_et_rlp_15_05_2025.pdf', note:'', newTab:true }
        ]
    };

    let config = clone(DEFAULT_CONFIG);
    let subscribed = false;
    let registered = false;
    let mountedSlot = null;
    let managerContext = null;

    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function clean(value) { return String(value == null ? '' : value).trim(); }
    function uid() { return 'link-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,7); }
    function lang() { return /^en\b/i.test(document.documentElement.lang || '') ? 'en' : 'fr'; }

    function normalize(raw) {
        raw = raw && typeof raw === 'object' ? raw : {};
        const defaultsById = new Map(DEFAULT_CONFIG.links.map(item => [item.id, item]));
        const links = Array.isArray(raw.links) ? raw.links : DEFAULT_CONFIG.links;
        return {
            enabled: raw.enabled !== false,
            titleFr: clean(raw.titleFr) || DEFAULT_CONFIG.titleFr,
            titleEn: clean(raw.titleEn) || clean(raw.titleFr) || DEFAULT_CONFIG.titleEn,
            links: links.map((item, index) => {
                const base = defaultsById.get(item?.id) || {};
                return {
                    id: clean(item?.id) || clean(base.id) || ('link-' + (index + 1)),
                    enabled: item?.enabled !== false,
                    column: item?.column === 'right' ? 'right' : 'left',
                    label: clean(item?.label) || clean(base.label) || ('Lien ' + (index + 1)),
                    url: clean(item?.url) || clean(base.url),
                    note: clean(item?.note),
                    newTab: item?.newTab !== false
                };
            })
        };
    }

    function newLink() {
        return { id:uid(), enabled:true, column:'left', label:'Nouveau lien', url:'', note:'', newTab:true };
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 1,
            name: { fr:'Liens utiles — widget', en:'Useful links — widget' },
            description: {
                fr:'Configure directement le contenu du widget Liens utiles affiché sur l’accueil Koha.',
                en:'Directly configures the Useful links widget displayed on the Koha home page.'
            },
            category: { fr:'Accueil / widgets', en:'Home / widgets' },
            supportedPages: ['/cgi-bin/koha/mainpage.pl'],
            prerequisites: [],
            dependencies: ['home-widgets'],
            defaults: clone(DEFAULT_CONFIG),
            normalize,
            validate: function (cfg) {
                const c = normalize(cfg);
                if (!Array.isArray(c.links)) return { ok:false, message:'Liste de liens invalide.' };
                for (const link of c.links) {
                    if (link.enabled !== false && (!clean(link.label) || !clean(link.url))) {
                        return { ok:false, message:'Chaque lien actif doit avoir un libellé et une adresse.' };
                    }
                }
                return { ok:true };
            },
            schema: [
                {
                    type:'section', id:'activation', label:{fr:'Activation',en:'Activation'}, fields:[
                        { key:'enabled', type:'boolean', label:{fr:'Afficher le contenu du widget',en:'Show widget content'} }
                    ]
                },
                {
                    type:'section', id:'content', label:{fr:'Contenu du widget',en:'Widget content'},
                    description:{fr:'Modifiez le titre et les liens. Le rendu du widget est mis à jour après enregistrement.',en:'Edit the title and links. The widget is updated after saving.'},
                    fields:[
                        { key:'titleFr', type:'text', label:{fr:'Titre — français',en:'Title — French'} },
                        { key:'titleEn', type:'text', label:{fr:'Titre — anglais',en:'Title — English'} },
                        {
                            key:'links', type:'repeater', reorder:true, label:{fr:'Liens',en:'Links'},
                            addLabel:{fr:'Ajouter un lien',en:'Add link'}, newItem:newLink, liveTitleKey:'label',
                            itemTitle:function(item,index){ return clean(item?.label) || ('Lien ' + (index + 1)); },
                            fields:[
                                { key:'enabled', type:'boolean', label:{fr:'Lien actif',en:'Link enabled'} },
                                { key:'label', type:'text', label:{fr:'Libellé',en:'Label'} },
                                { key:'url', type:'text', label:{fr:'Adresse / URL',en:'Address / URL'}, help:{fr:'URL absolue ou chemin Koha commençant par /.',en:'Absolute URL or Koha path starting with /.'} },
                                { key:'note', type:'text', label:{fr:'Texte complémentaire',en:'Additional text'}, help:{fr:'Texte facultatif affiché après le lien.',en:'Optional text displayed after the link.'} },
                                { key:'column', type:'select', label:{fr:'Colonne',en:'Column'}, options:[
                                    {value:'left',label:{fr:'Gauche',en:'Left'}},{value:'right',label:{fr:'Droite',en:'Right'}}
                                ]},
                                { key:'newTab', type:'boolean', label:{fr:'Ouvrir dans un nouvel onglet',en:'Open in a new tab'} }
                            ]
                        }
                    ]
                }
            ],
            focusContext:function(main){
                const section = main?.querySelector('[data-pmk-section-id="content"]');
                if (section) setTimeout(() => section.scrollIntoView({block:'start',behavior:'smooth'}),0);
            }
        };
    }

    function ensureStyle() {
        if (document.getElementById('pmk137-liens-utiles-style')) return;
        const style = document.createElement('style');
        style.id = 'pmk137-liens-utiles-style';
        style.textContent = `
            .pmk137-liens-utiles{width:100%;margin:0 0 1rem;position:relative}
            .pmk137-liens-utiles-card{border:1px solid #ced4d9;background:#fff}
            .pmk137-liens-utiles-head{display:flex;align-items:center;justify-content:center;gap:.5rem;padding:.65rem .8rem;border-bottom:1px solid #ced4d9;position:relative}
            .pmk137-liens-utiles-head h2{margin:0;text-align:center;font-size:1.25rem;text-decoration:underline}
            .pmk137-liens-utiles-config{position:absolute;right:.35rem;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center}
            .pmk137-liens-utiles-cols{display:grid;grid-template-columns:1fr 1fr}
            .pmk137-liens-utiles-col{padding:.55rem .75rem;min-width:0}
            .pmk137-liens-utiles-col+ .pmk137-liens-utiles-col{border-left:1px solid #ced4d9}
            .pmk137-liens-utiles ul{margin:0;padding-left:1.25rem}
            .pmk137-liens-utiles li+li{margin-top:.3rem}
            .pmk137-liens-utiles a{overflow-wrap:anywhere}
            .pmk137-liens-utiles-note{margin-left:.25rem;color:#495057}
            @media(max-width:900px){.pmk137-liens-utiles-cols{grid-template-columns:1fr}.pmk137-liens-utiles-col+ .pmk137-liens-utiles-col{border-left:0;border-top:1px solid #ced4d9}}
        `;
        document.head.appendChild(style);
    }

    function buildLinkItem(link) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = link.url;
        a.textContent = link.label;
        if (link.newTab) { a.target = '_blank'; a.rel = 'noopener'; }
        li.appendChild(a);
        if (link.note) {
            const note = document.createElement('span');
            note.className = 'pmk137-liens-utiles-note';
            note.textContent = '— ' + link.note;
            li.appendChild(note);
        }
        return li;
    }

    function render() {
        if (!mountedSlot) return;
        ensureStyle();
        mountedSlot.innerHTML = '';
        if (config.enabled === false) return;

        const wrap = document.createElement('div');
        wrap.className = 'pmk137-liens-utiles';
        const card = document.createElement('div');
        card.className = 'pmk137-liens-utiles-card';
        const head = document.createElement('div');
        head.className = 'pmk137-liens-utiles-head';
        const h2 = document.createElement('h2');
        h2.textContent = lang() === 'en' ? (config.titleEn || config.titleFr) : config.titleFr;
        head.appendChild(h2);

        const cfgHost = document.createElement('span');
        cfgHost.className = 'pmk137-liens-utiles-config';
        head.appendChild(cfgHost);
        card.appendChild(head);

        const cols = document.createElement('div');
        cols.className = 'pmk137-liens-utiles-cols';
        ['left','right'].forEach(column => {
            const col = document.createElement('div');
            col.className = 'pmk137-liens-utiles-col';
            const ul = document.createElement('ul');
            config.links.filter(link => link.enabled !== false && link.column === column).forEach(link => ul.appendChild(buildLinkItem(link)));
            col.appendChild(ul);
            cols.appendChild(col);
        });
        card.appendChild(cols);
        wrap.appendChild(card);
        mountedSlot.appendChild(wrap);

        if (window.PMKConfig?.mountContextButton) {
            try {
                window.PMKConfig.mountContextButton({
                    moduleId: MODULE_ID,
                    anchor: cfgHost,
                    contextKey: 'home-useful-links',
                    context: { sectionId:'content', widgetId:WIDGET_ID }
                });
            } catch (_) {}
        }
    }

    function registerConfigModule() {
        if (registered) return true;
        if (!window.PMKConfig?.registerModule) return false;
        try { window.PMKConfig.registerModule(moduleDefinition()); registered = true; return true; }
        catch (_) { return false; }
    }

    function loadConfig() {
        if (!registerConfigModule() || !window.PMKConfig?.getConfig) { config = clone(DEFAULT_CONFIG); render(); return; }
        window.PMKConfig.getConfig(MODULE_ID).then(value => { config = normalize(value); render(); }).catch(() => { config = clone(DEFAULT_CONFIG); render(); });
        if (!subscribed && window.PMKConfig?.subscribe) {
            subscribed = true;
            window.PMKConfig.subscribe(MODULE_ID, value => { config = normalize(value); render(); });
        }
    }

    async function mount(slot, context) {
        if (!slot) return;
        mountedSlot = slot;
        managerContext = context || null;
        loadConfig();
    }

    function registerWidget() {
        if (!window.PMKHomeWidgets?.register) return false;
        window.PMKHomeWidgets.register({ id:WIDGET_ID, name:'Liens utiles', target:'announcements-column', mount });
        return true;
    }

    registerConfigModule();
    if (!registerWidget()) {
        window.addEventListener('pmk:home-widgets-ready', registerWidget, { once:true });
        let tries = 0;
        const timer = setInterval(function(){ tries += 1; if (registerWidget() || tries >= 100) clearInterval(timer); },50);
    }
    if (!registered) window.addEventListener('pmk:config-ready', function(){ registerConfigModule(); loadConfig(); }, { once:true });

    window.PMK137UsefulLinks = { version:VERSION, moduleId:MODULE_ID, getConfig:() => clone(config), render };
})(window, document);

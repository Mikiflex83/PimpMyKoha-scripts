(function () {
  // --- Restriction : ne s'exécute que sur la page addbiblio.pl ---
  if (!/\/cgi-bin\/koha\/cataloguing\/addbiblio\.pl/i.test(location.pathname)) {
    return;
  }

  const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_APIKEY",
    authDomain: "YOUR_FIREBASE_AUTHDOMAIN",
    projectId: "YOUR_FIREBASE_PROJECTID",
    storageBucket: "YOUR_FIREBASE_STORAGEBUCKET",
    messagingSenderId: "YOUR_FIREBASE_MESSAGINGSENDERID",
    appId: "YOUR_FIREBASE_APPID"
  };

  const PANEL_ID = "koha099_picker_panel";
  const CACHE_KEY = "koha099_picker_v3_last";
  const PRESETS_KEY = "koha099_picker_v3_presets";
  const PANEL_STATE_KEY = "koha099_picker_v3_panel_state";
  const SELECTED_LIST_KEY = "koha099_picker_v3_selected_list";
  const FIREBASE_PRESETS_COLLECTION = "koha099_named_presets";
  const MAX_PRESETS = 20;
  const MODULE_ID = "cataloguing-tree-assistant";
  const GENERIC_PRESETS_COLLECTION = "pmk_cataloguing_tree_presets";
  const GENERIC_CACHE_KEY = "pmk_cataloguing_tree_last";
  const GENERIC_PANEL_STATE_KEY = "pmk_cataloguing_tree_panel_state";

  // Listes 6XX historiques : copie de secours strictement identique au moteur 081-084.
  // La source prioritaire reste window.PMK6XXConfig / les <select> réellement générés par le module 6XX.
  const PMK6XX_HISTORICAL_FALLBACK_109 = {
          genre: "Abécédaires\nAction & Aventure\nAlbums pour les plus grands\nApprentissage\nAventure\nBandes originales de films\nBiographies romancées\nBlack Music\nClassiques\nComics\nComptine, chanson\nDark romance\nDocu-fictions, biographies, histoires vécues\nDystopie\nElectro\nÉrotique\nEspionnage\nFantastique/Fantasy\nFeel good\nFilm Famille\nFilm d'animation\nFilm-Vintage\nFilms - Grands classiques\nFilms-Aventure\nFilms-Action\nFilms-Courts métrages\nFilms-Drames\nFilms-Japanimation\nFilms-Regards de femmes\nFilms-Science-fiction\nFilms-Se détendre\nFilms-Western\nFilms d'horreur\nFilms historiques\nFilms muets\nFilms musicaux\nFilms noirs\nFrissons\nHistorique\nHorreur\nHumour\nImagiers\nInitiatique\nJazz\nLégendes, mythes, fables\nLivre à toucher\nLivre sonore\nLivre animé\nLivres à compter\nLivre-jeu\nMondes Imaginaires\nMystères et enquêtes\nMusique Classique\nMusique Francophone\nMusique actuelle\nMusique du monde\nNature\nNovélisation de films/séries\nNovélisation de jeux vidéo\nNouvelles\nPolicier\nPsychologique\nRéaliste\nRécits de vie\nRimes\nRomance\nScience-fiction\nSentimental\nSerie|serie\nSéries courtes\nTerroir\nThriller",
          indexation: "Adaptation litteraire|Adaptation littéraire\nAlbum sans texte\nAntivol\nBandes originales\nBD Documentaire\nBD One Shot\nBD petit format|BD Petit format\nBD sans texte\nBiographie\nBlack Music\nComics\nCorner nature\nDVD Musicaux\nDVD Théâtre\nDyslexique\nElectro\nFilm d'animation\nFilm Famille\nFilm-Drame\nFilm-Vintage\nFilms - Grands classiques\nFilms-Aventure\nFilms-Action\nFilms-Courts métrages\nFilms-Grands classiques\nFilms-Japanimation\nFilms-Regards de femmes\nFilms-Science-fiction\nFilms-Se détendre\nFilms-Western\nFilms d'horreur\nFilms historiques\nFilms muets\nFilms musicaux\nFilms noirs\nFacile a lire\nHumour\nImages de dragons\nInstruments de musique\nJazz\nJeu illustrateur\nJeux de société\nLangues etrangeres|Langues étrangères\nlitteratures|Littératures\nMangas\nMusique à Lire\nMusique actuelle\nMusique Classique\nMusique du monde\nMusique Francophone\nParents et compagnie\nPoesie et theatre|Poésie et théâtre\nPremière lecture\nPremieres cases|Premières cases\nRomans Ados\nScène locale\nserie|Série\nSéries courtes\nTextes illustrés\nvintage|Film - Vintage",
          element: "Sorcières\nLe loup\nMonstres\nSirènes\nPrinces, chevaliers et princesses\nPirates\nIndiens, Cow-boys\nSuperhéros\nMulticulturalisme et diversité",
          subject: "Acquisition de la Propreté\nAffirmation de soi et opposition\nAngoisse de séparation\nAlimentation\nAmitié\nAnimaux\nAnimaux familiers\nAnimaux sauvages\nArts et spectacles\nBain, hygiène\nBobos\nBonnes Manières\nCampagne, vie rurale, ferme\nCaractères (courageux, curiosité, rêveur, leader...)\nChâteaux forts\nCivilisations (Maya, Viking, esquimau...)\nColère\nComportements sociaux (antisémitisme, différence, entraide, relation fille-garçons..)\nConditions de vie (pauvreté, précarité, immigration et réfugiés..)\nCorps humain (cinq sens, image du corps..)\nCrèche\nDéménagement\nDinosaures\nDoudou / Tétine\nÉcologie, environnement\nÉmotions et Sentiments\nEngins et moyens de Transport\nFêtes (Noël, Pâques...)\nHistoire (grandes époques, guerres et conflits, personnages célèbres)\nIntimidation / Harcèlement\nLangage, jeux de langage, jeux de mots, contraire\nLe corps et ses différences (handicaps, neurodiversité, lunettes..)\nLe rituel du coucher\nLes conflits\nLivre et bibliothèque\nMaison, habitation, jardin et jardinage\nMaternité, naissance\nMers, marins\nMétéorologie et saisons\nMort, deuil\nNature\nNouveau bébé\nOrphelins et foyers d'accueil\nPays et continents\nPeur du noir\nPolitesse, bienséance\nPremiers apprentissages (couleurs, formes, etc)\nPréhistoire\nQuestions de genres\nRelation aux autres\nRelations dans la famille (Fratrie, Parents, Grands-parents, Familles atypiques..)\nReligions, croyances\nRentrée scolaire\nSanté et maladies\nScolarité\nSciences et techniques (espace, inventions...)\nSéparation Divorce\nSons, bruits et cris\nSport\nTerritoires (Amazonie, jungle, montagne, désert, banquise, île, forêt...)\nTransgression des interdits : inceste, maltraitance, violence, violence sexuelle, vol..\n Intimidation / Harcèlement\nTravail et métiers\nVacances\nVille (bâtiment et construction, zoo, jardin public, marché, musée..etc)\nVie quotidienne familiale (bêtises, respect des règles, éducation, fugue..)"
  };

  const DEFAULT_RUNTIME_CONFIG = {
    enabled: true,
    runtimeMode: "legacy_dracenie",
    page: {
      path: "/cgi-bin/koha/cataloguing/addbiblio.pl",
      enabled: true
    },
    features: {
      assistant: true,
      nativeFiltering: false,
      preserveInvalidExistingValues: true,
      rememberSelection: true,
      rememberPanelState: true,
      showBreadcrumb: true
    },
    lists: {
      enabled: true,
      mode: "common",
      maxPresets: 20
    },
    hierarchy: {
      relationshipMode: "firebase_legacy",
      strictFiltering: true
    },
    levels: [
      {
        id: "domain",
        enabled: true,
        labelFr: "Domaine",
        labelEn: "Domain",
        tag: "099",
        subfield: "a",
        sourceType: "firebase_legacy",
        firebaseCode: "a",
        authorisedValueCategory: "",
        manualValues: ""
      },
      {
        id: "subdomain",
        enabled: true,
        labelFr: "Sous-domaine",
        labelEn: "Subdomain",
        tag: "099",
        subfield: "b",
        sourceType: "firebase_legacy",
        firebaseCode: "b",
        authorisedValueCategory: "",
        manualValues: ""
      },
      {
        id: "theme",
        enabled: true,
        labelFr: "Thème",
        labelEn: "Theme",
        tag: "099",
        subfield: "e",
        sourceType: "firebase_legacy",
        firebaseCode: "e",
        authorisedValueCategory: "",
        manualValues: ""
      },
      {
        id: "subject099",
        enabled: true,
        labelFr: "Sujet",
        labelEn: "Subject",
        tag: "099",
        subfield: "f",
        sourceType: "firebase_legacy",
        firebaseCode: "f",
        authorisedValueCategory: "",
        manualValues: ""
      }
    ],
    extraFields: [
      {
        id: "genre608",
        enabled: true,
        labelFr: "Genre littéraire",
        labelEn: "Literary genre",
        tag: "608",
        subfield: "a",
        sourceType: "pmk6xx",
        firebaseCode: "g",
        authorisedValueCategory: "",
        manualValues: "",
        filterByHierarchy: false
      },
      {
        id: "subject615",
        enabled: true,
        labelFr: "Sujet",
        labelEn: "Subject",
        tag: "615",
        subfield: "a",
        sourceType: "pmk6xx",
        firebaseCode: "s",
        authorisedValueCategory: "",
        manualValues: "",
        filterByHierarchy: false
      },
      {
        id: "character623",
        enabled: true,
        labelFr: "Personnage",
        labelEn: "Character",
        tag: "623",
        subfield: "a",
        sourceType: "pmk6xx",
        firebaseCode: "p",
        authorisedValueCategory: "",
        manualValues: "",
        filterByHierarchy: false
      }
    ],
    relationships: [],
    appearance: {
      widthPx: 360,
      mobileBreakpointPx: 576
    },
    language: "auto"
  };

  let runtimeConfig = null;
  // Une mémorisation peut porter un nom libre (champ `name`, 80 caractères max).
  // Les anciennes mémorisations sans nom restent compatibles et affichent leur chaîne de valeurs.

  let firebaseDb = null;
  let collection = null;
  let doc = null;
  let getDocs = null;
  let getDoc = null;
  let setDoc = null;
  let deleteDoc = null;
  let serverTimestamp = null;
  let runTransaction = null;

  const waitForBody = () => new Promise(resolve => {
    if (document.body) return resolve();

    const t = setInterval(() => {
      if (document.body) {
        clearInterval(t);
        resolve();
      }
    }, 100);
  });

  const norm = s => (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const escapeHTML = value => (value ?? "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const escapeAttr = escapeHTML;

  const getJSON = (key, fallback) => {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "null");
      return v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  };

  const setJSON = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  };

  const ensureStyle = () => {
    if (document.getElementById("koha099_picker_style")) return;

    const s = document.createElement("style");
    s.id = "koha099_picker_style";

    s.textContent = `
#${PANEL_ID}{
  position:fixed;top:70px;right:20px;z-index:999999;
  background:#ffffff;border:1px solid #dfe6df;border-radius:14px;
  box-shadow:0 14px 42px rgba(24,39,27,.16),0 3px 10px rgba(20,20,40,.07);
  width:360px;font:12.5px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  color:#1f2430;overflow:hidden;user-select:none;
}

#${PANEL_ID} *{
  box-sizing:border-box;
  user-select:text;
}

#${PANEL_ID}.collapsed .body{
  display:none;
}

#${PANEL_ID} .head{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:8px;
  padding:11px 12px;
  cursor:move;
  font-weight:700;
  font-size:13px;
  background:linear-gradient(135deg,#3f8340 0%,#438d43 100%);
  color:#fff;
  letter-spacing:.2px;
  border-bottom:1px solid rgba(0,0,0,.08);
}

#${PANEL_ID} .head .title{
  display:flex;
  align-items:center;
  font-size:13.5px;
}

#${PANEL_ID} .head .subtitle{
  display:inline-block;
  font-size:10.5px;
  font-weight:500;
  color:rgba(255,255,255,.94);
  margin-top:3px;
  letter-spacing:0;
  background:rgba(255,255,255,.12);
  padding:1px 6px;
  border-radius:999px;
}

#${PANEL_ID} .head .subtitle:empty{
  display:none;
}

#${PANEL_ID} .head-btns{
  display:flex;
  gap:4px;
}

#${PANEL_ID} .head-btns button{
  background:rgba(255,255,255,.16);
  border:1px solid rgba(255,255,255,.08);
  color:#fff;
  width:24px;
  height:24px;
  border-radius:7px;
  cursor:pointer;
  font-size:13px;
  line-height:1;
  display:flex;
  align-items:center;
  justify-content:center;
  transition:background .15s,border-color .15s;
}

#${PANEL_ID} .head-btns button:hover{
  background:rgba(255,255,255,.30);
  border-color:rgba(255,255,255,.18);
}

#${PANEL_ID} .body{
  padding:12px;
  max-height:78vh;
  overflow-y:auto;
  overflow-x:hidden;
  background:#fff;
}

#${PANEL_ID} .row{
  margin:0 0 8px;
  min-width:0;
}

#${PANEL_ID} .row label{
  display:block;
  font-weight:700;
  margin-bottom:3px;
  color:#566258;
  font-size:10.5px;
  text-transform:uppercase;
  letter-spacing:.45px;
}

#${PANEL_ID} .combo-wrap{
  position:relative;
  min-width:0;
}

#${PANEL_ID} .combo-input{
  width:100%;
  min-width:0;
  max-width:100%;
  padding:7px 28px 7px 9px;
  border:1px solid #dce4dc;
  border-radius:8px;
  font:inherit;
  color:#253027;
  background:#f8faf8;
  transition:border-color .15s,background .15s,box-shadow .15s;
}

#${PANEL_ID} .combo-input:hover:not(:disabled){
  border-color:#cbd8cc;
}

#${PANEL_ID} .combo-input:focus{
  outline:none;
  border-color:#79a97b;
  background:#fff;
  box-shadow:0 0 0 2px rgba(64,133,64,.10);
}

#${PANEL_ID} .combo-input:disabled{
  background:#f0f2f0;
  border-color:#e3e7e3;
  color:#9aa29b;
  cursor:not-allowed;
}

#${PANEL_ID} .combo-input.non-authorized{
  border-color:#d59a1f!important;
  background:#fff8ea!important;
  color:#8a4b00!important;
  box-shadow:0 0 0 2px rgba(213,154,31,.08)!important;
}

#${PANEL_ID} .combo-clear{
  position:absolute;
  right:6px;
  top:50%;
  transform:translateY(-50%);
  border:none;
  background:transparent;
  color:#a8b0a9;
  cursor:pointer;
  font-size:14px;
  width:20px;
  height:20px;
  border-radius:6px;
  display:flex;
  align-items:center;
  justify-content:center;
  opacity:.62;
  transition:opacity .15s,background .15s,color .15s;
}

#${PANEL_ID} .combo-wrap:hover .combo-clear,
#${PANEL_ID} .combo-clear:focus{
  opacity:1;
}

#${PANEL_ID} .combo-clear:hover{
  background:#e9eeea;
  color:#4f5a51;
}

#${PANEL_ID} .combo-menu{
  position:absolute;
  left:0;
  right:0;
  top:calc(100% + 4px);
  background:#fff;
  border:1px solid #dfe6df;
  border-radius:9px;
  box-shadow:0 9px 24px rgba(24,39,27,.14);
  max-height:180px;
  overflow-y:auto;
  overflow-x:hidden;
  z-index:10;
  display:none;
}

#${PANEL_ID} .combo-item{
  padding:6px 10px;
  cursor:pointer;
  font-size:12px;
  display:flex;
  flex-direction:column;
  gap:2px;
  border-bottom:1px solid #f1f3f1;
}

#${PANEL_ID} .combo-item:last-child{
  border-bottom:none;
}

#${PANEL_ID} .combo-item:hover,
#${PANEL_ID} .combo-item.active{
  background:#edf6ee;
  color:#347336;
}

#${PANEL_ID} .combo-item-label{
  font-size:12px;
  color:#253027;
  font-weight:600;
}

#${PANEL_ID} .combo-item-context{
  font-size:10px;
  color:#788079;
}

#${PANEL_ID} .combo-item-note{
  font-size:10px;
  color:#a66500;
  font-style:italic;
  margin-top:2px;
}

#${PANEL_ID} .combo-empty{
  padding:7px 10px;
  color:#929a93;
  font-style:italic;
  font-size:11px;
}

#${PANEL_ID} .actions{
  display:flex;
  gap:6px;
  margin-top:9px;
  padding-top:9px;
  border-top:1px solid #e8ece8;
}

#${PANEL_ID} .actions button{
  flex:1 1 0;
  min-width:0;
  min-height:36px;
  padding:6px 7px;
  cursor:pointer;
  font:inherit;
  font-weight:700;
  font-size:11.5px;
  line-height:1.15;
  text-align:center;
  border-radius:8px;
  border:1px solid transparent;
  display:flex;
  align-items:center;
  justify-content:center;
  white-space:normal;
  transition:filter .15s,background .15s,border-color .15s,box-shadow .15s,transform .08s;
}

#${PANEL_ID} .actions button:active{
  transform:translateY(1px);
}

#${PANEL_ID} .btn-primary{
  background:#408540;
  color:#fff;
  border-color:#397a39;
  box-shadow:0 2px 5px rgba(64,133,64,.18);
}

#${PANEL_ID} .btn-primary:hover{
  filter:brightness(1.06);
  box-shadow:0 3px 7px rgba(64,133,64,.22);
}

#${PANEL_ID} .btn-secondary{
  background:#eef7ef;
  color:#347336;
  border-color:#d8ead9;
}

#${PANEL_ID} .btn-secondary:hover{
  background:#e4f2e5;
  border-color:#c8e1ca;
}

#${PANEL_ID} .btn-ghost{
  background:#f5f6f5;
  color:#646d66;
  border-color:#e8ebe8;
}

#${PANEL_ID} .btn-ghost:hover{
  background:#ecefec;
  border-color:#dce1dc;
}

#${PANEL_ID} .status{
  font-size:10.5px;
  color:#536056;
  margin-top:7px;
  white-space:pre-wrap;
  line-height:1.45;
  background:#f7f9f7;
  border-radius:8px;
  padding:7px 9px;
  border:1px solid #e5eae5;
  border-left:3px solid #a9baa9;
  max-height:100px;
  overflow-y:auto;
  overflow-x:hidden;
}

#${PANEL_ID} .status:empty{
  display:none;
}

#${PANEL_ID} .divider{
  border:none;
  border-top:1px solid #e3e8e3;
  margin:10px 0 8px;
}

#${PANEL_ID} .presets-title{
  font-weight:800;
  font-size:10.5px;
  text-transform:uppercase;
  letter-spacing:.55px;
  color:#566258;
  margin-bottom:5px;
  display:flex;
  justify-content:space-between;
  align-items:center;
}

#${PANEL_ID} .presets-count{
  color:#7d887f;
  font-weight:700;
  text-transform:none;
  letter-spacing:0;
  background:#eef2ee;
  border:1px solid #e2e7e2;
  border-radius:999px;
  padding:1px 6px;
}

#${PANEL_ID} .presets-actions{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:6px;
  margin-bottom:6px;
}

#${PANEL_ID} .presets-actions .note-presets{
  font-size:10px;
  color:#7a837c;
  flex:1;
  line-height:1.35;
}

#${PANEL_ID} .btn-small{
  padding:4px 8px;
  font-size:10.5px;
  border-radius:7px;
}

#${PANEL_ID} .preset-controls{
  padding:7px 7px 1px;
  margin-bottom:6px;
  display:none;
  background:#f7f9f7;
  border:1px solid #e8ece8;
  border-radius:8px;
}

#${PANEL_ID} .preset-controls.open{
  display:block;
}

#${PANEL_ID} .preset-controls .row{
  margin:0 0 7px;
  min-width:0;
}

#${PANEL_ID} .preset-controls .row > div{
  min-width:0;
  max-width:100%;
}

#${PANEL_ID} .preset-list{
  display:flex;
  flex-direction:column;
  gap:5px;
  max-height:132px;
  overflow-y:auto;
  overflow-x:hidden;
  padding-right:2px;
}

#${PANEL_ID} .preset-item{
  display:flex;
  align-items:center;
  gap:6px;
  min-width:0;
  background:#fff;
  border:1px solid #e3e8e3;
  border-radius:8px;
  padding:6px 7px;
  cursor:pointer;
  transition:background .15s,border-color .15s,box-shadow .15s;
}

#${PANEL_ID} .preset-item:hover{
  background:#f7fcf7;
  border-color:#bed8c0;
  box-shadow:0 1px 3px rgba(64,133,64,.07);
}

#${PANEL_ID} .preset-text{
  flex:1;
  min-width:0;
  font-size:10.5px;
  color:#667067;
  line-height:1.35;
  overflow-wrap:anywhere;
}

#${PANEL_ID} .preset-text b{
  color:#397c3b;
  font-weight:800;
}

#${PANEL_ID} .preset-name{
  display:block;
  margin-bottom:2px;
  color:#2f7132;
  font-size:11px;
  font-weight:800;
  line-height:1.3;
  overflow-wrap:anywhere;
}

#${PANEL_ID} .preset-chain{
  display:block;
  color:#667067;
  font-size:10.5px;
  line-height:1.35;
  overflow-wrap:anywhere;
}

#${PANEL_ID} .preset-rename,
#${PANEL_ID} .preset-del{
  border:none;
  background:transparent;
  color:#b0b8b1;
  cursor:pointer;
  font-size:13px;
  width:20px;
  height:20px;
  border-radius:6px;
  flex-shrink:0;
  display:flex;
  align-items:center;
  justify-content:center;
}

#${PANEL_ID} .preset-rename:hover{
  background:#edf6ee;
  color:#347336;
}

#${PANEL_ID} .preset-del:hover{
  background:#ffe8e8;
  color:#d9473f;
}

#${PANEL_ID} .preset-empty{
  color:#919991;
  font-style:italic;
  font-size:10.5px;
  padding:5px 2px;
}
`;

    document.head.appendChild(s);
  };

  const parseLevel = name => {
    const s = norm(name);

    if (/domaine\s*0?99\$?a/.test(s)) return "a";
    if (/sous[- ]domaine\s*0?99\$?b/.test(s)) return "b";
    if (/th[eè]me\s*0?99\$?e/.test(s)) return "e";
    if (/sujet\s*0?99\$?f/.test(s)) return "f";

    if (
      /(?:forme\s*\/\s*genre|genre(?:\s+litt[eè]raire)?)(?:\s*608\$?a)?/.test(s)
    ) {
      return "g";
    }

    if (/sujet\s*615\$?a/.test(s)) return "s";

    if (/(?:personnage|character)s?\s*623\$?a/.test(s)) return "p";

    return "";
  };

  const cleanLabel = s => {
    const txt = (s || "").trim();

    if (!txt) return "";

    const m = txt.match(
      /^(.*?)\s*\((?:Sous[- ]?domaine|Domaine|Th[eè]me(?:s)?|Sujet|Forme\s*\/\s*Genre|Genre(?:\s+litt[eè]raire)?|Personnage(?:s)?|Character(?:s)?)[^)]*\)/i
    );

    if (m) return m[1].trim();

    return txt
      .replace(/\s*\(\d+\)\s*$/, "")
      .trim();
  };

  const extractPathKey = node => {
    const p = (node.parentPath || node.path || node.parent || "").trim();
    return norm(p);
  };

  // Reproduit la logique d'attachement de buildTree() :
  // un noeud supprimé, ou un noeud dont la chaîne de parents n'est plus
  // rattachée à la racine, ne doit pas être utilisé par les listes 099.
  const getTreeParentPath = node => {
    if (!node) return "";

    if (typeof node.parentPath === "string") {
      return node.parentPath.trim();
    }

    if (typeof node.parent === "string") {
      return node.parent.trim();
    }

    return "";
  };

  const getTreeNodeName = node =>
    (node?.name || node?.label || "")
      .toString()
      .trim();

  const getTreeFullPath = node => {
    const name = getTreeNodeName(node);
    const parentPath = getTreeParentPath(node);

    return parentPath
      ? `${parentPath}/${name}`
      : name;
  };

  const buildActiveTreeContext = rows => {
    // 1. Exclure les documents explicitement supprimés.
    const activeRows = (rows || []).filter(row => !row.deleted);

    // 2. Reconstituer le même index de chemins que buildTree().
    const byPath = new Map();

    activeRows.forEach(row => {
      const fullPath = getTreeFullPath(row);

      if (fullPath) {
        byPath.set(fullPath, row);
      }
    });

    // 3. Ne conserver que les noeuds réellement atteignables depuis la racine.
    // Cela élimine aussi les descendants/orphelins d'un ancien noeud supprimé.
    const reachablePaths = new Set();

    activeRows.forEach(row => {
      if (getTreeParentPath(row) === "") {
        const fullPath = getTreeFullPath(row);

        if (fullPath) {
          reachablePaths.add(fullPath);
        }
      }
    });

    let changed = true;
    let guard = 0;

    while (changed && guard++ < activeRows.length + 2) {
      changed = false;

      activeRows.forEach(row => {
        const fullPath = getTreeFullPath(row);

        if (!fullPath || reachablePaths.has(fullPath)) {
          return;
        }

        const parentPath = getTreeParentPath(row);

        if (
          parentPath &&
          reachablePaths.has(parentPath) &&
          byPath.has(parentPath)
        ) {
          reachablePaths.add(fullPath);
          changed = true;
        }
      });
    }

    const reachableRows = activeRows.filter(row =>
      reachablePaths.has(getTreeFullPath(row))
    );

    return {
      allRows: rows || [],
      rows: reachableRows,
      byPath,
      reachablePaths,
      excludedDeleted: (rows || []).length - activeRows.length,
      excludedOrphans: activeRows.length - reachableRows.length
    };
  };

  const findAncestorByLevel = (node, wantedLevel, treeCtx) => {
    let parentPath = getTreeParentPath(node);
    let guard = 0;

    while (parentPath && guard++ < 100) {
      if (!treeCtx.reachablePaths.has(parentPath)) {
        return null;
      }

      const parent = treeCtx.byPath.get(parentPath);

      if (!parent) {
        return null;
      }

      if (parseLevel(getTreeNodeName(parent)) === wantedLevel) {
        return parent;
      }

      parentPath = getTreeParentPath(parent);
    }

    return null;
  };

  const getAncestorLabelKeys = (node, treeCtx) => {
    const keys = [];

    let parentPath = getTreeParentPath(node);
    let guard = 0;

    while (parentPath && guard++ < 100) {
      if (!treeCtx.reachablePaths.has(parentPath)) {
        break;
      }

      const parent = treeCtx.byPath.get(parentPath);

      if (!parent) {
        break;
      }

      const label = cleanLabel(getTreeNodeName(parent));

      if (label) {
        keys.push(norm(label));
      }

      parentPath = getTreeParentPath(parent);
    }

    return keys;
  };

  const buildIndex = rows => {
    const treeCtx = buildActiveTreeContext(rows);

    rows = treeCtx.rows;

    const idx = {
      a: [],
      bByA: new Map(),
      eByAB: new Map(),
      fByABE: new Map(),
      g: [],
      s: [],
      p: []
    };

    // ============================================================
    // Domaine 099$a
    // ============================================================

    for (const r of rows) {
      const level = parseLevel(getTreeNodeName(r));

      if (level !== "a") continue;

      const label = cleanLabel(getTreeNodeName(r));

      if (!label) continue;

      idx.a.push({
        label,
        raw: r,
        key: norm(label),
        ancestorKeys: getAncestorLabelKeys(r, treeCtx)
      });
    }

    idx.a = [
      ...new Map(
        idx.a.map(x => [x.key, x])
      ).values()
    ].sort((x, y) =>
      x.label.localeCompare(y.label, "fr")
    );

    // ============================================================
    // Sous-domaine 099$b
    // ============================================================

    for (const r of rows) {
      if (parseLevel(getTreeNodeName(r)) !== "b") {
        continue;
      }

      const label = cleanLabel(getTreeNodeName(r));

      if (!label) continue;

      const aRow = findAncestorByLevel(r, "a", treeCtx);

      if (!aRow) continue;

      const aKey = norm(
        cleanLabel(
          getTreeNodeName(aRow)
        )
      );

      const a = idx.a.find(x =>
        x.key === aKey
      );

      if (!a) continue;

      if (!idx.bByA.has(a.key)) {
        idx.bByA.set(a.key, []);
      }

      idx.bByA.get(a.key).push({
        label,
        raw: r,
        key: norm(label),
        aKey: a.key,
        ancestorKeys: getAncestorLabelKeys(r, treeCtx)
      });
    }

    for (const [k, arr] of idx.bByA) {
      idx.bByA.set(
        k,
        [
          ...new Map(
            arr.map(x => [x.key, x])
          ).values()
        ].sort((x, y) =>
          x.label.localeCompare(y.label, "fr")
        )
      );
    }

    // ============================================================
    // Thème 099$e
    // ============================================================

    for (const r of rows) {
      if (parseLevel(getTreeNodeName(r)) !== "e") {
        continue;
      }

      const label = cleanLabel(getTreeNodeName(r));

      if (!label) continue;

      const aRow = findAncestorByLevel(r, "a", treeCtx);
      const bRow = findAncestorByLevel(r, "b", treeCtx);

      if (!aRow || !bRow) continue;

      const aKey = norm(
        cleanLabel(
          getTreeNodeName(aRow)
        )
      );

      const bKey = norm(
        cleanLabel(
          getTreeNodeName(bRow)
        )
      );

      const a = idx.a.find(x =>
        x.key === aKey
      );

      if (!a) continue;

      const b = (idx.bByA.get(a.key) || [])
        .find(x =>
          x.key === bKey
        );

      if (!b) continue;

      const abKey =
        `${a.key}|||${b.key}`;

      if (!idx.eByAB.has(abKey)) {
        idx.eByAB.set(abKey, []);
      }

      idx.eByAB.get(abKey).push({
        label,
        raw: r,
        key: norm(label),
        aKey: a.key,
        bKey: b.key,
        ancestorKeys: getAncestorLabelKeys(r, treeCtx)
      });
    }

    for (const [k, arr] of idx.eByAB) {
      idx.eByAB.set(
        k,
        [
          ...new Map(
            arr.map(x => [x.key, x])
          ).values()
        ].sort((x, y) =>
          x.label.localeCompare(y.label, "fr")
        )
      );
    }

    // ============================================================
    // Sujet 099$f
    // ============================================================

    for (const r of rows) {
      if (parseLevel(getTreeNodeName(r)) !== "f") {
        continue;
      }

      const label = cleanLabel(getTreeNodeName(r));

      if (!label) continue;

      const aRow = findAncestorByLevel(r, "a", treeCtx);
      const bRow = findAncestorByLevel(r, "b", treeCtx);
      const eRow = findAncestorByLevel(r, "e", treeCtx);

      if (!aRow || !bRow || !eRow) {
        continue;
      }

      const aKey = norm(
        cleanLabel(
          getTreeNodeName(aRow)
        )
      );

      const bKey = norm(
        cleanLabel(
          getTreeNodeName(bRow)
        )
      );

      const eKey = norm(
        cleanLabel(
          getTreeNodeName(eRow)
        )
      );

      const a = idx.a.find(x =>
        x.key === aKey
      );

      if (!a) continue;

      const b = (idx.bByA.get(a.key) || [])
        .find(x =>
          x.key === bKey
        );

      if (!b) continue;

      const e = (
        idx.eByAB.get(
          `${a.key}|||${b.key}`
        ) || []
      ).find(x =>
        x.key === eKey
      );

      if (!e) continue;

      const abeKey =
        `${a.key}|||${b.key}|||${e.key}`;

      if (!idx.fByABE.has(abeKey)) {
        idx.fByABE.set(abeKey, []);
      }

      idx.fByABE.get(abeKey).push({
        label,
        raw: r,
        key: norm(label),
        ancestorKeys: getAncestorLabelKeys(r, treeCtx)
      });
    }

    for (const [k, arr] of idx.fByABE) {
      idx.fByABE.set(
        k,
        [
          ...new Map(
            arr.map(x => [x.key, x])
          ).values()
        ].sort((x, y) =>
          x.label.localeCompare(y.label, "fr")
        )
      );
    }

    // ============================================================
    // Genre 608$a
    // ============================================================

    for (const r of rows) {
      if (parseLevel(getTreeNodeName(r)) !== "g") {
        continue;
      }

      const label = cleanLabel(getTreeNodeName(r));

      if (!label) continue;

      idx.g.push({
        label,
        raw: r,
        key: norm(label),
        ancestorKeys: getAncestorLabelKeys(r, treeCtx)
      });
    }

    idx.g = [
      ...new Map(
        idx.g.map(x => [
          `${x.key}|||${(x.ancestorKeys || []).join("|||")}`,
          x
        ])
      ).values()
    ].sort((x, y) =>
      x.label.localeCompare(y.label, "fr")
    );

    // ============================================================
    // Sujet 615$a
    // ============================================================

    for (const r of rows) {
      if (parseLevel(getTreeNodeName(r)) !== "s") {
        continue;
      }

      const label = cleanLabel(getTreeNodeName(r));

      if (!label) continue;

      idx.s.push({
        label,
        raw: r,
        key: norm(label),
        ancestorKeys: getAncestorLabelKeys(r, treeCtx)
      });
    }

    idx.s = [
      ...new Map(
        idx.s.map(x => [
          `${x.key}|||${(x.ancestorKeys || []).join("|||")}`,
          x
        ])
      ).values()
    ].sort((x, y) =>
      x.label.localeCompare(y.label, "fr")
    );

    // ============================================================
    // Personnage 623$a
    // ============================================================

    for (const r of rows) {
      if (parseLevel(getTreeNodeName(r)) !== "p") {
        continue;
      }

      const label = cleanLabel(getTreeNodeName(r));

      if (!label) continue;

      idx.p.push({
        label,
        raw: r,
        key: norm(label),
        ancestorKeys: getAncestorLabelKeys(r, treeCtx)
      });
    }

    idx.p = [
      ...new Map(
        idx.p.map(x => [
          `${x.key}|||${(x.ancestorKeys || []).join("|||")}`,
          x
        ])
      ).values()
    ].sort((x, y) =>
      x.label.localeCompare(y.label, "fr")
    );

    // ============================================================
    // Diagnostic interne
    // ============================================================

    window.Koha099TreeDebug = {
      totalRows:
        treeCtx.excludedDeleted +
        treeCtx.excludedOrphans +
        rows.length,

      activeReachableRows: rows.length,

      excludedDeleted:
        treeCtx.excludedDeleted,

      excludedOrphans:
        treeCtx.excludedOrphans,

      find(text) {
        const needle = norm(text || "");

        return treeCtx.allRows
          .filter(r => {
            const hay =
              `${getTreeNodeName(r)} ${getTreeParentPath(r)}`;

            return norm(hay).includes(needle);
          })
          .map(r => ({
            id: r.id,
            name: getTreeNodeName(r),
            parentPath: getTreeParentPath(r),
            deleted: r.deleted,
            reachable:
              treeCtx.reachablePaths.has(
                getTreeFullPath(r)
              ),
            level:
              parseLevel(
                getTreeNodeName(r)
              )
          }));
      }
    };

    return idx;
  };

  // ============================================================
  // Recherche des champs Koha
  // ============================================================

  const findTagScopes = () =>
    [
      ...document.querySelectorAll(
        'li.tag.clearfix[id^="tag_099_"]'
      )
    ];

  const findFieldInScope = (scope, code) =>
    scope.querySelector(
      `select[name^="tag_099_subfield_${code}_"]`
    ) ||
    scope.querySelector(
      `input[name^="tag_099_subfield_${code}_"]`
    );

  const findFFieldInScope = scope => {
    const all = [
      ...scope.querySelectorAll(
        'select[name^="tag_099_subfield_f_"]'
      )
    ];

    if (!all.length) {
      return null;
    }

    return all.find(s => !s.value) || all[0];
  };

  const findFieldByLabel = labelText => {
    const normalized = norm(labelText);

    const label = Array
      .from(
        document.querySelectorAll(
          "label.labelsubfield"
        )
      )
      .find(el =>
        norm(el.textContent || "") === normalized
      );

    if (!label) {
      return null;
    }

    return (
      document.getElementById(
        label.getAttribute("for")
      ) || null
    );
  };

  const findGenreField = () =>
    findFieldByLabel(
      "Genre littéraire"
    );

  const findSubject615Field = () =>
    findFieldByLabel(
      "catégorie sujet"
    );

  const findCharacter623Field = () => {
    const direct =
      document.querySelector(
        '[name^="tag_623_subfield_a_"]'
      ) ||
      document.querySelector(
        '[id^="tag_623_subfield_a_"]'
      );

    if (direct) {
      return direct;
    }

    return (
      findFieldByLabel("Personnage") ||
      findFieldByLabel("Personnage (623$a)") ||
      findFieldByLabel("Character")
    );
  };

  // ============================================================
  // Correspondance avec les valeurs autorisées Koha
  // ============================================================

  const findOptionByLabel = (select, label) => {
    if (!select || !label || !select.options) {
      return null;
    }

    const target = norm(label);

    return [...select.options].find(option =>
      norm(option.textContent) === target ||
      norm(option.value) === target
    ) || null;
  };

  const triggerNativeAndJQuery = element => {
    if (!element) return;

    element.dispatchEvent(
      new Event(
        "input",
        { bubbles: true }
      )
    );

    element.dispatchEvent(
      new Event(
        "change",
        { bubbles: true }
      )
    );

    if (window.jQuery) {
      try {
        window.jQuery(element)
          .trigger("change");
      } catch (e) {}
    }
  };

  const setFieldByLabel = (field, label) => {
    if (!field) {
      return {
        ok: false,
        reason: "champ introuvable"
      };
    }

    if (field.tagName === "SELECT") {
      const opt =
        findOptionByLabel(
          field,
          label
        );

      if (!opt) {
        return {
          ok: false,
          reason:
            `aucune option ne correspond à "${label}"`
        };
      }

      field.value = opt.value;

      triggerNativeAndJQuery(field);

      return {
        ok: true,
        matched:
          opt.textContent.trim()
      };
    }

    if (
      field.tagName === "INPUT" ||
      field.tagName === "TEXTAREA"
    ) {
      field.value = label;

      triggerNativeAndJQuery(field);

      return {
        ok: true,
        matched: label
      };
    }

    return {
      ok: false,
      reason: "type de champ non supporté"
    };
  };

  const clearField = field => {
    if (!field) {
      return {
        ok: false,
        reason: "champ introuvable"
      };
    }

    if (field.tagName === "SELECT") {
      const emptyOpt = [...field.options].find(option =>
        option.value === ""
      );

      if (!emptyOpt) {
        return {
          ok: false,
          reason: "ce champ ne possède pas de valeur vide"
        };
      }

      field.value = "";
      triggerNativeAndJQuery(field);

      return { ok: true };
    }

    if (
      field.tagName === "INPUT" ||
      field.tagName === "TEXTAREA"
    ) {
      field.value = "";
      triggerNativeAndJQuery(field);

      return { ok: true };
    }

    return {
      ok: false,
      reason: "type de champ non supporté"
    };
  };

  // ============================================================
  // Combobox du panneau
  // ============================================================

  const makeCombo = (row, placeholder) => {
    row.innerHTML = `
      <div class="combo-wrap">
        <input
          type="text"
          class="combo-input"
          placeholder="${placeholder}"
          autocomplete="off"
        >
        <button
          type="button"
          class="combo-clear"
          tabindex="-1"
          title="Effacer"
        >×</button>
        <div class="combo-menu"></div>
      </div>
    `;

    const input =
      row.querySelector(".combo-input");

    const menu =
      row.querySelector(".combo-menu");

    const clearBtn =
      row.querySelector(".combo-clear");

    let items = [];
    let value = "";
    let onChangeCb = () => {};

    const renderMenu = filterText => {
      const f =
        norm(filterText || "");

      const filtered =
        f
          ? items.filter(it =>
              norm(it.label).includes(f)
            )
          : items;

      if (!items.length) {
        menu.innerHTML =
          `<div class="combo-empty">Aucune option disponible</div>`;
      } else if (!filtered.length) {
        menu.innerHTML =
          `<div class="combo-empty">Aucun résultat</div>`;
      } else {
        menu.innerHTML =
          filtered.map(it =>
            `<div class="combo-item" data-label="${escapeAttr(it.label)}">${renderComboItem(it)}</div>`
          ).join("");
      }

      menu.style.display = "block";
    };

    const refreshInputState = () => {
      /*
       * IMPORTANT :
       *
       * Une ancienne valeur présente dans la notice peut ne plus
       * exister dans l'arborescence active.
       *
       * On la signale visuellement dans le champ mais on ne la
       * réinjecte PAS dans la liste des choix.
       *
       * C'est notamment ce qui évite qu'une ancienne valeur comme
       * "Arts visuels" réapparaisse dans la liste des sous-domaines.
       */

      const hasValue =
        !!(value || "")
          .toString()
          .trim();

      const isAllowed =
        !hasValue ||
        items.some(it =>
          norm(it.label) ===
          norm(value)
        );

      const hasNonAuthorizedValue =
        hasValue &&
        !isAllowed;

      input.classList.toggle(
        "non-authorized",
        hasNonAuthorizedValue
      );

      if (hasNonAuthorizedValue) {
        input.title =
          "Valeur actuelle non autorisée / absente de l’arborescence";
      } else {
        input.title = "";
      }
    };

    const closeMenu = () => {
      menu.style.display = "none";
    };

    input.addEventListener(
      "focus",
      () => {
        if (!input.disabled) {
          renderMenu("");
        }
      }
    );

    input.addEventListener(
      "input",
      () => {
        renderMenu(input.value);
        refreshInputState();
      }
    );

    input.addEventListener(
      "keydown",
      e => {
        if (e.key === "Escape") {
          input.blur();
        }
      }
    );

    input.addEventListener(
      "blur",
      () => {
        setTimeout(() => {
          closeMenu();

          if (input.value !== value) {
            const match =
              items.find(it =>
                norm(it.label) ===
                norm(input.value)
              );

            if (match) {
              value = match.label;
              input.value =
                match.label;

              onChangeCb(value);
            } else if (
              input.value.trim() === ""
            ) {
              value = "";

              onChangeCb(value);
            } else {
              /*
               * L'utilisateur ne peut pas créer manuellement
               * une nouvelle valeur non autorisée.
               */
              input.value = value;
            }
          }
        }, 150);
      }
    );

    menu.addEventListener(
      "mousedown",
      e => {
        const item =
          e.target.closest(
            ".combo-item"
          );

        if (!item) {
          return;
        }

        e.preventDefault();

        value =
          item.dataset.label;

        input.value =
          value;

        closeMenu();
        refreshInputState();

        onChangeCb(value);
      }
    );

    clearBtn.addEventListener(
      "click",
      () => {
        if (input.disabled) {
          return;
        }

        value = "";
        input.value = "";

        refreshInputState();

        onChangeCb(value);

        input.focus();
      }
    );

    return {
      setItems(newItems) {
        items =
          newItems || [];

        refreshInputState();
      },

      setValue(label, silent) {
        value =
          label || "";

        input.value =
          value;

        refreshInputState();

        if (!silent) {
          onChangeCb(value);
        }
      },

      getValue() {
        return value;
      },

      onChange(fn) {
        onChangeCb = fn;
      },

      setDisabled(state) {
        input.disabled =
          !!state;

        input.placeholder =
          state
            ? "—"
            : placeholder;
      }
    };
  };

  const chainLabel = p =>
    `<b>${escapeHTML(p.a || "—")}</b> › ${escapeHTML(p.b || "—")} › ${escapeHTML(p.e || "—")} › ${escapeHTML(p.f || "—")} › ${escapeHTML(p.g || "—")} › ${escapeHTML(p.s || "—")} › ${escapeHTML(p.p || "—")}`;

  const renderComboItem = item => {
    const rawPathCandidates = [
      item.raw?.parentPath,
      item.raw?.path,
      item.raw?.parent,
      item.raw?.fullPath,
      item.raw?.fullpath,
      item.raw?.hierarchy
    ];

    const context =
      rawPathCandidates
        .filter(Boolean)
        .map(value =>
          value.toString()
        )
        .map(value =>
          value.split(/[\\/|>]/)
        )
        .flat()
        .map(part =>
          part
            .replace(
              /\s*\([^)]*\)\s*$/g,
              ""
            )
            .trim()
        )
        .filter(Boolean)
        .slice(-2)
        .join(" › ");

    const note =
      item.note
        ? `<div class="combo-item-note">${escapeHTML(item.note)}</div>`
        : "";

    if (!context) {
      return `
        <div class="combo-item-label">${escapeHTML(item.label)}</div>
        ${note}
      `;
    }

    return `
      <div class="combo-item-label">${escapeHTML(item.label)}</div>
      <div class="combo-item-context">${escapeHTML(context)}</div>
      ${note}
    `;
  };

  // ============================================================
  // Création du panneau
  // ============================================================

  const createLegacyPanel = async (rows, cfg) => {
    if (
      document.getElementById(PANEL_ID)
    ) {
      return;
    }

    ensureStyle();

    const idx =
      buildIndex(rows);

    // Les listes 608 / 615 / 623 doivent être strictement celles du moteur 6XX,
    // et non des branches g/s/p de l'arborescence Firebase.
    const [pmk608Items, pmk615Items, pmk623Items] = await Promise.all([
      pmk6xxItemsForField109({ tag: "608", subfield: "a" }),
      pmk6xxItemsForField109({ tag: "615", subfield: "a" }),
      pmk6xxItemsForField109({ tag: "623", subfield: "a" })
    ]);
    if (pmk608Items.length) idx.g = pmk608Items;
    if (pmk615Items.length) idx.s = pmk615Items;
    if (pmk623Items.length) idx.p = pmk623Items;

    const savedPanelState =
      getJSON(
        PANEL_STATE_KEY,
        {
          collapsed: false
        }
      );

    const root =
      document.createElement("div");

    root.id =
      PANEL_ID;

    if (
      savedPanelState.collapsed
    ) {
      root.classList.add(
        "collapsed"
      );
    }

    root.innerHTML = `
      <div class="head">
        <span>
          <span class="title">Assistant catalogage</span>
          <span
            class="subtitle"
            id="koha099_current_list"
          ></span>
        </span>

        <div class="head-btns">
          <button
            type="button"
            data-act="collapse"
            title="Réduire"
          >–</button>
        </div>
      </div>

      <div class="body">

        <div
          class="row"
          data-row="scope"
          style="display:none"
        >
          <label>Champ 099 cible</label>
          <select
            class="combo-input"
            data-sel="scope"
            style="width:100%"
          ></select>
        </div>

        <div
          class="row"
          data-row="a"
        >
          <label>Domaine ($a)</label>
        </div>

        <div
          class="row"
          data-row="b"
        >
          <label>Sous-domaine ($b)</label>
        </div>

        <div
          class="row"
          data-row="e"
        >
          <label>Thème ($e)</label>
        </div>

        <div
          class="row"
          data-row="f"
        >
          <label>Sujet ($f)</label>
        </div>

        <div
          class="row"
          data-row="g"
        >
          <label>Genre littéraire (608$a)</label>
        </div>

        <div
          class="row"
          data-row="s"
        >
          <label>Sujet (615$a)</label>
        </div>

        <div
          class="row"
          data-row="p"
        >
          <label>Personnage (623$a)</label>
        </div>

        <div class="actions">
          <button
            type="button"
            class="btn-primary"
            data-act="apply"
          >
            Appliquer
          </button>

          <button
            type="button"
            class="btn-secondary"
            data-act="save"
          >
            Mémoriser
          </button>

          <button
            type="button"
            class="btn-ghost"
            data-act="clear"
          >
            Vider
          </button>
        </div>

        <div
          class="status"
          id="koha099_status"
        ></div>

        <hr class="divider">

        <div class="presets-title">
          <span>Mémorisations</span>
          <span
            class="presets-count"
            id="koha099_presets_count"
          ></span>
        </div>

        <div class="presets-actions">
          <span class="note-presets">
            Les mémorisations sont listées ci-dessous.
            Ouvrez les options pour gérer les listes.
          </span>

          <div
            style="display:flex;gap:6px;align-items:center"
          >
            <button
              type="button"
              class="btn-secondary btn-small"
              data-act="togglePresetControls"
            >
              Options
            </button>
          </div>
        </div>

        <div
          class="preset-controls"
          id="koha099_preset_controls"
        >

          <div
            class="row"
            data-row="ownerSelect"
          >
            <label>Liste nominative</label>

            <select
              class="combo-input"
              data-owner-select
              style="width:100%"
            ></select>
          </div>

          <div
            class="row"
            data-row="owner"
          >
            <label>Créer une liste</label>

            <div
              style="display:flex;gap:8px;align-items:center"
            >
              <input
                type="text"
                class="combo-input"
                data-owner-input
                placeholder="Nom Prénom (requis)"
              >

              <button
                type="button"
                class="btn-secondary btn-small"
                data-act="createList"
              >
                Créer liste
              </button>
            </div>
          </div>

          <div
            class="row"
            style="font-size:11px;color:#6a6f7a;margin-bottom:8px;"
          >
            Sélectionnez une liste existante ou saisissez votre
            nom et prénom pour en créer une nouvelle avant de mémoriser.
          </div>

        </div>

        <div
          class="preset-list"
          id="koha099_presets"
        ></div>

      </div>
    `;

    document.body.appendChild(root);

    // ============================================================
    // Déplacement du panneau
    // ============================================================

    (() => {
      const head =
        root.querySelector(".head");

      let dragging = false;
      let offX = 0;
      let offY = 0;

      head.addEventListener(
        "mousedown",
        e => {
          if (
            e.target.closest(
              ".head-btns"
            )
          ) {
            return;
          }

          dragging = true;

          const r =
            root.getBoundingClientRect();

          offX =
            e.clientX - r.left;

          offY =
            e.clientY - r.top;

          root.style.right =
            "auto";
        }
      );

      document.addEventListener(
        "mousemove",
        e => {
          if (!dragging) {
            return;
          }

          root.style.left =
            `${e.clientX - offX}px`;

          root.style.top =
            `${e.clientY - offY}px`;
        }
      );

      document.addEventListener(
        "mouseup",
        () => {
          dragging = false;
        }
      );
    })();

    const scopeSel =
      root.querySelector(
        '[data-sel="scope"]'
      );

    const scopeRow =
      root.querySelector(
        '[data-row="scope"]'
      );

    const status =
      root.querySelector(
        "#koha099_status"
      );

    const presetsList =
      root.querySelector(
        "#koha099_presets"
      );

    const presetsCount =
      root.querySelector(
        "#koha099_presets_count"
      );

    const comboA =
      makeCombo(
        root.querySelector(
          '[data-row="a"]'
        ),
        "Rechercher un domaine…"
      );

    const comboB =
      makeCombo(
        root.querySelector(
          '[data-row="b"]'
        ),
        "Rechercher un sous-domaine…"
      );

    const comboE =
      makeCombo(
        root.querySelector(
          '[data-row="e"]'
        ),
        "Rechercher un thème…"
      );

    const comboF =
      makeCombo(
        root.querySelector(
          '[data-row="f"]'
        ),
        "Rechercher un sujet…"
      );

    const comboG =
      makeCombo(
        root.querySelector(
          '[data-row="g"]'
        ),
        "Rechercher un genre littéraire 608$a…"
      );

    const comboS =
      makeCombo(
        root.querySelector(
          '[data-row="s"]'
        ),
        "Rechercher un sujet 615$a…"
      );

    const comboP =
      makeCombo(
        root.querySelector(
          '[data-row="p"]'
        ),
        "Rechercher un personnage 623$a…"
      );

    // ============================================================
    // Champs 099 disponibles sur la notice
    // ============================================================

    const refreshScopes = () => {
      const scopes =
        findTagScopes();

      const prevValue =
        scopeSel.value;

      scopeSel.innerHTML =
        scopes
          .map(
            (sc, i) =>
              `<option value="${i}">Champ 099 #${i + 1} (${escapeHTML(sc.id)})</option>`
          )
          .join("");

      scopeRow.style.display =
        scopes.length > 1
          ? ""
          : "none";

      if (
        prevValue !== "" &&
        scopes[+prevValue]
      ) {
        scopeSel.value =
          prevValue;
      }

      return scopes;
    };

    let scopes =
      refreshScopes();

    const state = {
      a: "",
      b: "",
      e: "",
      f: "",
      g: "",
      s: "",
      p: ""
    };

    const last =
      getJSON(
        CACHE_KEY,
        {}
      );

    const readCurrentFieldText = field => {
      if (!field) {
        return "";
      }

      if (
        field.tagName === "SELECT"
      ) {
        const selected =
          field.options[
            field.selectedIndex
          ];

        return selected
          ? (
              selected.textContent ||
              selected.value ||
              ""
            )
          : (
              field.value ||
              ""
            );
      }

      return field.value || "";
    };

    const readCurrentValues = (scopeOverride = null) => {
      const values = {
        a: "",
        b: "",
        e: "",
        f: "",
        g: "",
        s: "",
        p: ""
      };

      const scope =
        scopeOverride || findTagScopes()[0];

      if (scope) {
        const aField =
          findFieldInScope(
            scope,
            "a"
          );

        const bField =
          findFieldInScope(
            scope,
            "b"
          );

        const eField =
          findFieldInScope(
            scope,
            "e"
          );

        const fField =
          findFFieldInScope(
            scope
          );

        values.a =
          readCurrentFieldText(
            aField
          );

        values.b =
          readCurrentFieldText(
            bField
          );

        values.e =
          readCurrentFieldText(
            eField
          );

        values.f =
          readCurrentFieldText(
            fField
          );
      }

      const gField =
        findGenreField();

      const sField =
        findSubject615Field();

      const pField =
        findCharacter623Field();

      values.g =
        readCurrentFieldText(
          gField
        );

      values.s =
        readCurrentFieldText(
          sField
        );

      values.p =
        readCurrentFieldText(
          pField
        );

      return values;
    };

    const findMatchingLabel = (
      items,
      rawValue
    ) => {
      const value = (rawValue || "").toString().trim();

      if (!value) {
        return "";
      }

      const target = norm(value);
      const match = (items || []).find(item =>
        [item.value, item.label, item.raw?.name, item.raw?.label]
          .filter(Boolean)
          .some(candidate => norm(candidate) === target)
      );

      return match ? match.label : "";
    };

    const resolveCurrentValue = (
      code,
      rawValue
    ) => {
      if (!rawValue) {
        return "";
      }

      switch (code) {
        case "a":
          return (
            findMatchingLabel(
              idx.a,
              rawValue
            ) ||
            rawValue
          );

        case "b":
          return (
            findMatchingLabel(
              [
                ...idx.bByA.values()
              ].flat(),
              rawValue
            ) ||
            rawValue
          );

        case "e":
          return (
            findMatchingLabel(
              [
                ...idx.eByAB.values()
              ].flat(),
              rawValue
            ) ||
            rawValue
          );

        case "f":
          return (
            findMatchingLabel(
              [
                ...idx.fByABE.values()
              ].flat(),
              rawValue
            ) ||
            rawValue
          );

        case "g":
          return (
            findMatchingLabel(
              idx.g,
              rawValue
            ) ||
            rawValue
          );

        case "s":
          return (
            findMatchingLabel(
              idx.s,
              rawValue
            ) ||
            rawValue
          );

        case "p":
          return (
            findMatchingLabel(
              idx.p,
              rawValue
            ) ||
            rawValue
          );

        default:
          return "";
      }
    };

    const resetPanelSelection = () => {
      state.a = "";
      state.b = "";
      state.e = "";
      state.f = "";
      state.g = "";
      state.s = "";
      state.p = "";

      comboA.setValue("", true);
      comboB.setValue("", true);
      comboE.setValue("", true);
      comboF.setValue("", true);
      comboG.setValue("", true);
      comboS.setValue("", true);
      comboP.setValue("", true);
    };

    const initializeFromPageValues = (
      attempt = 0
    ) => {
      resetPanelSelection();

      const selectedScope =
        scopes[+scopeSel.value] || scopes[0] || null;

      const currentValues =
        readCurrentValues(selectedScope);

      const hasAnyPageValue =
        Object
          .values(currentValues)
          .some(v =>
            (v || "")
              .toString()
              .trim()
          );

      if (
        !hasAnyPageValue &&
        attempt < 6
      ) {
        setTimeout(
          () =>
            initializeFromPageValues(
              attempt + 1
            ),
          120
        );

        return;
      }

      state.a =
        resolveCurrentValue(
          "a",
          currentValues.a
        ) || "";

      state.b =
        resolveCurrentValue(
          "b",
          currentValues.b
        ) || "";

      state.e =
        resolveCurrentValue(
          "e",
          currentValues.e
        ) || "";

      state.f =
        resolveCurrentValue(
          "f",
          currentValues.f
        ) || "";

      state.g =
        resolveCurrentValue(
          "g",
          currentValues.g
        ) || "";

      state.s =
        resolveCurrentValue(
          "s",
          currentValues.s
        ) || "";

      state.p =
        resolveCurrentValue(
          "p",
          currentValues.p
        ) || "";

      comboA.setValue(
        state.a,
        true
      );

      comboB.setValue(
        state.b,
        true
      );

      comboE.setValue(
        state.e,
        true
      );

      comboF.setValue(
        state.f,
        true
      );

      comboG.setValue(
        state.g,
        true
      );

      comboS.setValue(
        state.s,
        true
      );

      comboP.setValue(
        state.p,
        true
      );

      rebuild();
    };

    // ============================================================
    // Navigation dans l'arborescence
    // ============================================================

    const getAItem = () =>
      idx.a.find(
        x =>
          x.label === state.a
      ) || null;

    const getBItem = a => {
      if (!a) {
        return null;
      }

      return (
        idx.bByA.get(
          a.key
        ) || []
      ).find(
        x =>
          x.label === state.b
      ) || null;
    };

    const getEItem = (
      a,
      b
    ) => {
      if (!a || !b) {
        return null;
      }

      return (
        idx.eByAB.get(
          `${a.key}|||${b.key}`
        ) || []
      ).find(
        x =>
          x.label === state.e
      ) || null;
    };

    const getFItem = (
      a,
      b,
      e
    ) => {
      if (!a || !b || !e) {
        return null;
      }

      return (
        idx.fByABE.get(
          `${a.key}|||${b.key}|||${e.key}`
        ) || []
      ).find(
        x =>
          x.label === state.f
      ) || null;
    };

    const getSelectionContext = () => {
      const a =
        getAItem();

      const b =
        getBItem(a);

      const e =
        getEItem(a, b);

      const f =
        getFItem(a, b, e);

      return {
        a,
        b,
        e,
        f
      };
    };

    const matchesSelectionContext = (
      item,
      context
    ) => {
      const labels = [
        context.a?.label,
        context.b?.label,
        context.e?.label,
        context.f?.label
      ].filter(Boolean);

      if (!labels.length) {
        return true;
      }

      /*
       * Avec le nouvel index, on utilise l'ascendance exacte
       * reconstruite depuis parentPath.
       */
      if (
        Array.isArray(
          item.ancestorKeys
        )
      ) {
        return labels.every(lbl =>
          item.ancestorKeys.includes(
            norm(lbl)
          )
        );
      }

      /*
       * Compatibilité avec d'anciennes données éventuelles.
       */
      const pathText = [
        item.raw?.parentPath,
        item.raw?.path,
        item.raw?.parent
      ].find(v => !!v) || "";

      return labels.every(lbl =>
        norm(pathText).includes(
          norm(lbl)
        )
      );
    };

    const filterBy099Context = (
      items,
      context
    ) =>
      items.filter(item =>
        matchesSelectionContext(
          item,
          context
        )
      );

    const isAllowedLabel = (items, label) => {
      if (!label) return true;
      const target = norm(label);
      return (items || []).some(item =>
        [item?.value, item?.label].filter(Boolean).some(candidate => norm(candidate) === target)
      );
    };

    const getAllowedItemsForCode = code => {
      const a = getAItem();
      const b = getBItem(a);
      const e = getEItem(a, b);
      const f = getFItem(a, b, e);
      const context = getSelectionContext();
      const hasInvalid099Context =
        (!!state.a && !a) ||
        (!!state.b && !b) ||
        (!!state.e && !e) ||
        (!!state.f && !f);

      switch (code) {
        case "a":
          return idx.a;
        case "b":
          return a ? (idx.bByA.get(a.key) || []) : [];
        case "e":
          return a && b
            ? (idx.eByAB.get(`${a.key}|||${b.key}`) || [])
            : [];
        case "f":
          return a && b && e
            ? (idx.fByABE.get(`${a.key}|||${b.key}|||${e.key}`) || [])
            : [];
        case "g":
          return idx.g;
        case "s":
          return idx.s;
        case "p":
          return idx.p;
        default:
          return [];
      }
    };

    const updateStatus = () => {
      status.textContent =
        `Domaines disponibles : ${idx.a.length}, genres : ${idx.g.length}, sujets 615 : ${idx.s.length}, personnages 623 : ${idx.p.length}\n` +
        `Sélection : ${state.a || "—"} / ${state.b || "—"} / ${state.e || "—"} / ${state.f || "—"} / ${state.g || "—"} / ${state.s || "—"} / ${state.p || "—"}`;
    };

    /*
     * CORRECTION IMPORTANTE
     * =====================
     *
     * Avant, le script ajoutait la valeur actuellement présente dans
     * la notice dans la liste même si celle-ci n'existait plus dans
     * Firebase.
     *
     * Exemple :
     *
     *   Arts visuels
     *
     * pouvait donc être réintroduit comme choix dans le sous-domaine.
     *
     * Désormais la liste contient UNIQUEMENT les valeurs réellement
     * autorisées par l'arborescence active.
     *
     * Si une notice contient encore une ancienne valeur, le champ la
     * conserve visuellement et passe en orange, mais cette valeur
     * n'est pas proposée dans la liste.
     */
    const addNoteForNonAllowedValues = (
      items,
      currentValue,
      allowedItems
    ) => {
      return (items || []).map(it => ({
        ...it,
        note: undefined,
        isUnallowed: false
      }));
    };

    const rebuild = () => {
      // Domaine
      const aItemsWithNotes =
        addNoteForNonAllowedValues(
          idx.a,
          state.a,
          idx.a
        );

      comboA.setItems(
        aItemsWithNotes
      );

      const a =
        getAItem();

      // Sous-domaine
      const bList =
        a
          ? (
              idx.bByA.get(
                a.key
              ) || []
            )
          : [];

      const bItemsWithNotes =
        addNoteForNonAllowedValues(
          bList,
          state.b,
          bList
        );

      comboB.setItems(
        bItemsWithNotes
      );

      comboB.setDisabled(
        !a
      );

      const b =
        getBItem(a);

      // Thème
      const eList =
        a && b
          ? (
              idx.eByAB.get(
                `${a.key}|||${b.key}`
              ) || []
            )
          : [];

      const eItemsWithNotes =
        addNoteForNonAllowedValues(
          eList,
          state.e,
          eList
        );

      comboE.setItems(
        eItemsWithNotes
      );

      comboE.setDisabled(
        !(a && b)
      );

      const e =
        getEItem(
          a,
          b
        );

      // Sujet 099$f
      const fList =
        a && b && e
          ? (
              idx.fByABE.get(
                `${a.key}|||${b.key}|||${e.key}`
              ) || []
            )
          : [];

      const fItemsWithNotes =
        addNoteForNonAllowedValues(
          fList,
          state.f,
          fList
        );

      comboF.setItems(
        fItemsWithNotes
      );

      comboF.setDisabled(
        !(a && b && e)
      );

      // 608$a, 615$a et 623$a : mêmes listes indépendantes que le moteur 081-084 6XX.
      const gList = idx.g;
      const sList = idx.s;
      const pList = idx.p;

      const gItemsWithNotes =
        addNoteForNonAllowedValues(
          gList,
          state.g,
          gList
        );

      const sItemsWithNotes =
        addNoteForNonAllowedValues(
          sList,
          state.s,
          sList
        );

      const pItemsWithNotes =
        addNoteForNonAllowedValues(
          pList,
          state.p,
          pList
        );

      comboG.setItems(
        gItemsWithNotes
      );

      comboG.setDisabled(
        false
      );

      comboS.setItems(
        sItemsWithNotes
      );

      comboS.setDisabled(
        false
      );

      comboP.setItems(
        pItemsWithNotes
      );

      comboP.setDisabled(
        false
      );

      setJSON(
        CACHE_KEY,
        state
      );

      updateStatus();
    };

    comboA.onChange(val => {
      state.a = val;
      state.b = "";
      state.e = "";
      state.f = "";

      comboB.setValue("", true);
      comboE.setValue("", true);
      comboF.setValue("", true);

      rebuild();
    });

    comboB.onChange(val => {
      state.b = val;
      state.e = "";
      state.f = "";

      comboE.setValue("", true);
      comboF.setValue("", true);

      rebuild();
    });

    comboE.onChange(val => {
      state.e = val;
      state.f = "";

      comboF.setValue("", true);

      rebuild();
    });

    comboF.onChange(val => {
      state.f = val;
      rebuild();
    });

    comboG.onChange(val => {
      state.g = val;
      rebuild();
    });

    comboS.onChange(val => {
      state.s = val;
      rebuild();
    });

    comboP.onChange(val => {
      state.p = val;
      rebuild();
    });


    window.addEventListener("pmk6xx:config-changed", async () => {
      try {
        const [next608, next615, next623] = await Promise.all([
          pmk6xxItemsForField109({ tag: "608", subfield: "a" }),
          pmk6xxItemsForField109({ tag: "615", subfield: "a" }),
          pmk6xxItemsForField109({ tag: "623", subfield: "a" })
        ]);
        if (next608.length) idx.g = next608;
        if (next615.length) idx.s = next615;
        if (next623.length) idx.p = next623;
        rebuild();
      } catch (_) {}
    });

    initializeFromPageValues();

    scopeSel.addEventListener("change", () => {
      scopes = refreshScopes();
      initializeFromPageValues();
    });

    let scopeRefreshTimer = null;
    const scopeObserver = new MutationObserver(() => {
      clearTimeout(scopeRefreshTimer);
      scopeRefreshTimer = setTimeout(() => {
        const previousIds = scopes.map(scope => scope.id).join("|");
        const currentScopes = findTagScopes();
        const currentIds = currentScopes.map(scope => scope.id).join("|");

        if (previousIds !== currentIds) {
          scopes = refreshScopes();
          initializeFromPageValues();
        }
      }, 120);
    });

    const scopeObserverTarget =
      document.querySelector("#cat_addbiblio") ||
      document.querySelector('form[name="f"]') ||
      document.body;

    scopeObserver.observe(scopeObserverTarget, {
      childList: true,
      subtree: true
    });

    // ============================================================
    // Mémorisations
    // ============================================================

    const ownerInput =
      root.querySelector(
        "[data-owner-input]"
      );

    const ownerSelect =
      root.querySelector(
        "[data-owner-select]"
      );

    const createListBtn =
      root.querySelector(
        '[data-act="createList"]'
      );

    const currentListLabel =
      root.querySelector(
        "#koha099_current_list"
      );

    let currentOwnerId = "";
    let currentOwnerName = "";
    let firebaseOwnerPresets = [];


    const effectiveListMode =
      cfg && cfg.lists && cfg.lists.mode === "koha_user"
        ? "koha_user"
        : "common";

    const resolveKohaUserIdentity = () => {
      const marker = document.querySelector(
        '.loggedinusername, #logged-in-info-full .loggedinusername, #logged-in-menu .loggedinusername'
      );

      let borrowernumber = "";
      let displayName = "";

      if (marker) {
        displayName = (marker.textContent || "").trim();
        borrowernumber =
          marker.getAttribute("data-borrowernumber") ||
          marker.dataset?.borrowernumber ||
          "";

        if (!borrowernumber) {
          const href = marker.getAttribute("href") || "";
          try {
            const u = new URL(href, location.origin);
            borrowernumber = u.searchParams.get("borrowernumber") || "";
          } catch (_) {}
        }
      }

      const fallback = norm(displayName)
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "") || "unknown";

      return {
        id: borrowernumber ? `koha_${borrowernumber}` : `koha_name_${fallback}`,
        name: displayName || (borrowernumber ? `Koha #${borrowernumber}` : "Compte Koha")
      };
    };

    const kohaUserIdentity = resolveKohaUserIdentity();

    if (effectiveListMode === "koha_user") {
      const presetControls = root.querySelector("#koha099_preset_controls");
      const togglePresetControls = root.querySelector('[data-act="togglePresetControls"]');
      const note = root.querySelector(".note-presets");

      if (presetControls) presetControls.style.display = "none";
      if (togglePresetControls) togglePresetControls.style.display = "none";
      if (note) {
        note.textContent = `Mémorisations liées automatiquement au compte Koha : ${kohaUserIdentity.name}.`;
      }
    }

    const restoreSelectedList = () => {
      const saved =
        getJSON(
          SELECTED_LIST_KEY,
          null
        );

      if (
        saved &&
        saved.ownerId
      ) {
        return saved;
      }

      return null;
    };

    const saveSelectedList = (
      ownerId,
      ownerName
    ) => {
      setJSON(
        SELECTED_LIST_KEY,
        {
          ownerId,
          ownerName
        }
      );
    };

    const ownerIdFromName = name =>
      norm(name)
        .replace(/\s+/g, "_")
        .replace(
          /[^a-z0-9_]/g,
          ""
        );

    const renderOwnerOptions = owners => {
      ownerSelect.replaceChildren();

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Sélectionnez votre nom...";
      ownerSelect.appendChild(placeholder);

      (owners || []).forEach(owner => {
        const option = document.createElement("option");
        option.value = owner.id || "";
        option.textContent = owner.ownerName || owner.id || "";
        ownerSelect.appendChild(option);
      });
    };

    const renderPresets = () => {
      const presets =
        currentOwnerId
          ? firebaseOwnerPresets
          : getJSON(
              PRESETS_KEY,
              []
            );

      presetsCount.textContent =
        `${presets.length}/${MAX_PRESETS}`;

      if (!presets.length) {
        presetsList.innerHTML =
          `<div class="preset-empty">Aucune mémorisation pour l'instant.</div>`;

        return;
      }

      presetsList.innerHTML =
        presets
          .map(
            (p, i) => `
              <div
                class="preset-item"
                data-idx="${i}"
              >
                <span class="preset-text">
                  ${p.name
                    ? `<span class="preset-name">${escapeHTML(p.name)}</span>`
                    : ""
                  }
                  <span class="preset-chain">${chainLabel(p)}</span>
                </span>

                <button
                  type="button"
                  class="preset-rename"
                  data-rename="${i}"
                  title="Renommer cette mémorisation"
                  aria-label="Renommer cette mémorisation"
                >✎</button>

                <button
                  type="button"
                  class="preset-del"
                  data-del="${i}"
                  title="Supprimer"
                  aria-label="Supprimer cette mémorisation"
                >×</button>
              </div>
            `
          )
          .join("");
    };

    const loadOwnersFromFirebase = async () => {
      if (!firebaseDb) {
        return;
      }

      if (effectiveListMode === "koha_user") {
        currentOwnerId = kohaUserIdentity.id;
        currentOwnerName = kohaUserIdentity.name;
        ownerInput.value = currentOwnerName;
        await loadOwnerPresetsFromFirebase(currentOwnerId);
        updateCurrentListHeader();
        return [{ id: currentOwnerId, ownerName: currentOwnerName }];
      }

      try {
        status.textContent =
          "Chargement des listes nominatives...";

        const snapshots =
          await getDocs(
            collection(
              firebaseDb,
              FIREBASE_PRESETS_COLLECTION
            )
          );

        const owners =
          snapshots.docs.map(doc => ({
            id:
              doc.id,

            ownerName:
              doc.data().ownerName ||
              doc.id
          }));

        renderOwnerOptions(
          owners
        );

        const savedList =
          restoreSelectedList();

        if (
          savedList &&
          owners.some(
            o =>
              o.id ===
              savedList.ownerId
          )
        ) {
          ownerSelect.value =
            savedList.ownerId;

          await loadOwnerPresetsFromFirebase(
            savedList.ownerId
          );

          status.textContent =
            `Liste "${savedList.ownerName}" restaurée.`;
        } else {
          status.textContent =
            `Listes nominatives chargées (${owners.length}).`;
        }

        return owners;
      } catch (e) {
        status.textContent =
          "Erreur lors du chargement des listes Firebase.";

        return [];
      }
    };

    const updateCurrentListHeader = () => {
      currentListLabel.textContent =
        currentOwnerName
          ? `Liste de : ${currentOwnerName}`
          : "";
    };

    const loadOwnerPresetsFromFirebase =
      async ownerId => {
        if (!firebaseDb) {
          return;
        }

        if (!ownerId) {
          currentOwnerId = "";
          currentOwnerName = "";
          firebaseOwnerPresets = [];

          renderPresets();
          updateCurrentListHeader();

          saveSelectedList(
            "",
            ""
          );

          return;
        }

        try {
          status.textContent =
            "Chargement des mémorisations...";

          const ownerDoc =
            await getDoc(
              doc(
                firebaseDb,
                FIREBASE_PRESETS_COLLECTION,
                ownerId
              )
            );

          if (!ownerDoc.exists()) {
            firebaseOwnerPresets = [];
            currentOwnerId = ownerId;
            currentOwnerName =
              ownerInput.value.trim() ||
              ownerId;
          } else {
            currentOwnerId = ownerId;

            currentOwnerName =
              ownerDoc.data().ownerName ||
              ownerId;

            firebaseOwnerPresets =
              ownerDoc.data().presets ||
              [];
          }

          ownerInput.value =
            currentOwnerName;

          renderPresets();
          updateCurrentListHeader();

          saveSelectedList(
            currentOwnerId,
            currentOwnerName
          );

          status.textContent =
            `Mémorisations pour ${currentOwnerName} chargées (${firebaseOwnerPresets.length}).`;
        } catch (e) {
          status.textContent =
            "Erreur lors de la lecture des mémorisations Firebase.";
        }
      };

    const savePresetToFirebase =
      async () => {
        let ownerName =
          ownerInput.value.trim();

        if (
          !ownerName &&
          currentOwnerId
        ) {
          ownerName =
            currentOwnerName;
        }

        if (!ownerName) {
          status.textContent =
            "Entrez votre nom et prénom avant de mémoriser.";

          return;
        }

        if (!firebaseDb) {
          status.textContent =
            "Firebase non disponible.";

          return;
        }

        const ownerId =
          ownerIdFromName(
            ownerName
          );

        if (!ownerId) {
          status.textContent =
            "Nom invalide pour la mémorisation.";

          return;
        }

        try {
          status.textContent =
            "Enregistrement en cours...";

          const ownerRef = doc(
            firebaseDb,
            FIREBASE_PRESETS_COLLECTION,
            ownerId
          );

          const newPreset = {
            a: state.a,
            b: state.b,
            e: state.e,
            f: state.f,
            g: state.g,
            s: state.s,
            p: state.p,
            createdAt: new Date().toISOString()
          };

          const updatedPresets = await runTransaction(
            firebaseDb,
            async transaction => {
              const ownerDoc = await transaction.get(ownerRef);
              const existing = ownerDoc.exists()
                ? [...(ownerDoc.data().presets || [])]
                : [];

              const dupIdx = existing.findIndex(p =>
                p.a === newPreset.a &&
                p.b === newPreset.b &&
                p.e === newPreset.e &&
                p.f === newPreset.f &&
                p.g === newPreset.g &&
                p.s === newPreset.s &&
                (p.p || "") === (newPreset.p || "")
              );

              if (dupIdx !== -1) {
                // Si cette combinaison existait déjà et avait été nommée,
                // conserver son nom lors d'une nouvelle mémorisation.
                newPreset.name = (
                  existing[dupIdx].name || ""
                ).toString().trim().slice(0, 80);

                existing.splice(dupIdx, 1);
              }

              existing.unshift(newPreset);

              while (existing.length > MAX_PRESETS) {
                existing.pop();
              }

              transaction.set(
                ownerRef,
                {
                  ownerName,
                  presets: existing,
                  updatedAt: serverTimestamp()
                },
                { merge: true }
              );

              return existing;
            }
          );

          currentOwnerId = ownerId;
          currentOwnerName = ownerName;
          firebaseOwnerPresets = updatedPresets;

          await loadOwnersFromFirebase();
          ownerSelect.value = ownerId;
          renderPresets();
          updateCurrentListHeader();

          saveSelectedList(
            currentOwnerId,
            currentOwnerName
          );

          status.textContent =
            `Sélection enregistrée pour ${ownerName}.`;
        } catch (e) {

          status.textContent =
            `Erreur lors de l'enregistrement Firebase : ${e.message || e}`;
        }
      };

    const presetMatches = (candidate, targetPreset) => {
      if (!candidate || !targetPreset) {
        return false;
      }

      if (targetPreset.createdAt && candidate.createdAt) {
        return candidate.createdAt === targetPreset.createdAt;
      }

      return (
        candidate.a === targetPreset.a &&
        candidate.b === targetPreset.b &&
        candidate.e === targetPreset.e &&
        candidate.f === targetPreset.f &&
        candidate.g === targetPreset.g &&
        candidate.s === targetPreset.s &&
        (candidate.p || "") === (targetPreset.p || "")
      );
    };

    const sanitizePresetName = value =>
      (value || "")
        .toString()
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);

    const renameLocalPreset = index => {
      const presets = getJSON(
        PRESETS_KEY,
        []
      );

      const targetPreset = presets[index];
      if (!targetPreset) {
        return;
      }

      const proposed = window.prompt(
        "Nom de cette mémorisation :",
        targetPreset.name || ""
      );

      if (proposed === null) {
        return;
      }

      const name = sanitizePresetName(proposed);

      if (name) {
        targetPreset.name = name;
      } else {
        delete targetPreset.name;
      }

      setJSON(
        PRESETS_KEY,
        presets
      );

      renderPresets();

      status.textContent = name
        ? `Mémorisation renommée « ${name} ».`
        : "Nom de la mémorisation supprimé.";
    };

    const renameFirebasePreset =
      async index => {
        if (!firebaseDb || !currentOwnerId) {
          return;
        }

        const targetPreset = firebaseOwnerPresets[index];
        if (!targetPreset) {
          return;
        }

        const proposed = window.prompt(
          "Nom de cette mémorisation :",
          targetPreset.name || ""
        );

        if (proposed === null) {
          return;
        }

        const name = sanitizePresetName(proposed);

        try {
          status.textContent =
            "Renommage de la mémorisation...";

          const ownerRef = doc(
            firebaseDb,
            FIREBASE_PRESETS_COLLECTION,
            currentOwnerId
          );

          const updatedPresets = await runTransaction(
            firebaseDb,
            async transaction => {
              const ownerDoc = await transaction.get(ownerRef);

              if (!ownerDoc.exists()) {
                return [];
              }

              const currentPresets = [
                ...(ownerDoc.data().presets || [])
              ];

              const currentIndex = currentPresets.findIndex(
                preset => presetMatches(preset, targetPreset)
              );

              if (currentIndex === -1) {
                return currentPresets;
              }

              const updatedPreset = {
                ...currentPresets[currentIndex]
              };

              if (name) {
                updatedPreset.name = name;
              } else {
                delete updatedPreset.name;
              }

              currentPresets[currentIndex] = updatedPreset;

              transaction.set(
                ownerRef,
                {
                  presets: currentPresets,
                  updatedAt: serverTimestamp()
                },
                { merge: true }
              );

              return currentPresets;
            }
          );

          firebaseOwnerPresets = updatedPresets;
          renderPresets();

          status.textContent = name
            ? `Mémorisation renommée « ${name} ».`
            : "Nom de la mémorisation supprimé.";
        } catch (e) {
          status.textContent =
            `Erreur lors du renommage Firebase : ${e.message || e}`;
        }
      };

    const deleteFirebasePreset =
      async index => {
        if (!firebaseDb || !currentOwnerId) {
          return;
        }

        const targetPreset = firebaseOwnerPresets[index];
        if (!targetPreset) {
          return;
        }

        const locallyLastPreset = firebaseOwnerPresets.length === 1;
        let allowDeleteList = false;

        if (locallyLastPreset) {
          allowDeleteList = window.confirm(
            "La liste nominative est désormais vide. Voulez-vous supprimer la liste elle-même ?"
          );

          if (!allowDeleteList) {
            status.textContent =
              "Suppression annulée. La liste nominative reste active.";
            return;
          }
        }

        try {
          const ownerRef = doc(
            firebaseDb,
            FIREBASE_PRESETS_COLLECTION,
            currentOwnerId
          );

          const outcome = await runTransaction(
            firebaseDb,
            async transaction => {
              const ownerDoc = await transaction.get(ownerRef);

              if (!ownerDoc.exists()) {
                return { presets: [], deletedList: true };
              }

              const currentPresets = [
                ...(ownerDoc.data().presets || [])
              ];

              const currentIndex = currentPresets.findIndex(
                preset => presetMatches(preset, targetPreset)
              );

              if (currentIndex === -1) {
                return {
                  presets: currentPresets,
                  deletedList: false
                };
              }

              currentPresets.splice(currentIndex, 1);

              if (!currentPresets.length && allowDeleteList) {
                transaction.delete(ownerRef);
                return { presets: [], deletedList: true };
              }

              transaction.set(
                ownerRef,
                {
                  presets: currentPresets,
                  updatedAt: serverTimestamp()
                },
                { merge: true }
              );

              return {
                presets: currentPresets,
                deletedList: false
              };
            }
          );

          if (outcome.deletedList) {
            currentOwnerId = "";
            currentOwnerName = "";
            ownerSelect.value = "";
            ownerInput.value = "";
            firebaseOwnerPresets = [];

            await loadOwnersFromFirebase();
            renderPresets();
            updateCurrentListHeader();
            saveSelectedList("", "");

            status.textContent =
              "Liste vide supprimée.";
            return;
          }

          firebaseOwnerPresets = outcome.presets;
          renderPresets();

          status.textContent =
            `Mémorisation supprimée pour ${currentOwnerName}.`;
        } catch (e) {
          status.textContent =
            "Erreur lors de la suppression Firebase.";
        }
      };

    // ============================================================
    // Changement de liste nominative
    // ============================================================

    ownerSelect.addEventListener(
      "change",
      () => {
        if (effectiveListMode === "koha_user") return;
        const selectedId =
          ownerSelect.value;

        if (selectedId) {
          loadOwnerPresetsFromFirebase(
            selectedId
          );
        } else {
          currentOwnerId = "";
          currentOwnerName = "";

          firebaseOwnerPresets = [];

          renderPresets();
          updateCurrentListHeader();

          saveSelectedList(
            "",
            ""
          );

          status.textContent =
            "Aucune liste sélectionnée.";
        }
      }
    );

    // ============================================================
    // Création d'une liste nominative
    // ============================================================

    createListBtn.addEventListener(
      "click",
      async () => {
        if (effectiveListMode === "koha_user") return;
        const name =
          ownerInput.value.trim();

        if (!name) {
          status.textContent =
            "Entrez un nom complet pour créer la liste.";

          ownerInput.focus();

          return;
        }

        if (!firebaseDb) {
          status.textContent =
            "Firebase non disponible.";

          return;
        }

        const ownerId =
          ownerIdFromName(
            name
          );

        if (!ownerId) {
          status.textContent =
            "Nom invalide pour la liste.";

          ownerInput.focus();

          return;
        }

        try {
          status.textContent =
            "Création de la liste en cours...";

          const ownerRef = doc(
            firebaseDb,
            FIREBASE_PRESETS_COLLECTION,
            ownerId
          );

          await runTransaction(firebaseDb, async transaction => {
            const ownerDoc = await transaction.get(ownerRef);
            const existing = ownerDoc.exists()
              ? (ownerDoc.data().presets || [])
              : [];

            transaction.set(
              ownerRef,
              {
                ownerName: name,
                presets: existing,
                updatedAt: serverTimestamp()
              },
              { merge: true }
            );
          });

          currentOwnerId = ownerId;
          currentOwnerName = name;

          await loadOwnersFromFirebase();
          ownerSelect.value = ownerId;
          await loadOwnerPresetsFromFirebase(ownerId);

          saveSelectedList(
            currentOwnerId,
            currentOwnerName
          );

          status.textContent =
            `Liste "${name}" créée et sélectionnée.`;
        } catch (e) {

          status.textContent =
            `Erreur lors de la création de la liste : ${e.message || e}`;
        }
      }
    );

    // ============================================================
    // Options de mémorisation
    // ============================================================

    const presetControls =
      root.querySelector(
        "#koha099_preset_controls"
      );

    const togglePresetControlsBtn =
      root.querySelector(
        '[data-act="togglePresetControls"]'
      );

    const updatePresetControlsLabel =
      () => {
        const open =
          presetControls.classList.contains(
            "open"
          );

        togglePresetControlsBtn.textContent =
          open
            ? "Masquer"
            : "Options";
      };

    togglePresetControlsBtn.addEventListener(
      "click",
      () => {
        presetControls.classList.toggle(
          "open"
        );

        updatePresetControlsLabel();
      }
    );

    updatePresetControlsLabel();

    loadOwnersFromFirebase();

    // ============================================================
    // Clic sur mémorisation
    // ============================================================

    presetsList.addEventListener(
      "click",
      e => {
        const renameBtn =
          e.target.closest(
            "[data-rename]"
          );

        if (renameBtn) {
          const index =
            +renameBtn.dataset.rename;

          if (currentOwnerId) {
            renameFirebasePreset(
              index
            );
          } else {
            renameLocalPreset(
              index
            );
          }

          return;
        }

        const delBtn =
          e.target.closest(
            "[data-del]"
          );

        if (delBtn) {
          const index =
            +delBtn.dataset.del;

          if (currentOwnerId) {
            deleteFirebasePreset(
              index
            );
          } else {
            const presets =
              getJSON(
                PRESETS_KEY,
                []
              );

            presets.splice(
              index,
              1
            );

            setJSON(
              PRESETS_KEY,
              presets
            );

            renderPresets();
          }

          return;
        }

        const item =
          e.target.closest(
            ".preset-item"
          );

        if (!item) {
          return;
        }

        const presets =
          currentOwnerId
            ? firebaseOwnerPresets
            : getJSON(
                PRESETS_KEY,
                []
              );

        const p =
          presets[
            +item.dataset.idx
          ];

        if (!p) {
          return;
        }

        state.a = p.a || "";
        state.b = p.b || "";
        state.e = p.e || "";
        state.f = p.f || "";
        state.g = p.g || "";
        state.s = p.s || "";
        state.p = p.p || "";

        comboA.setValue(
          state.a,
          true
        );

        comboB.setValue(
          state.b,
          true
        );

        comboE.setValue(
          state.e,
          true
        );

        comboF.setValue(
          state.f,
          true
        );

        comboG.setValue(
          state.g,
          true
        );

        comboS.setValue(
          state.s,
          true
        );

        comboP.setValue(
          state.p,
          true
        );

        rebuild();

        status.textContent =
          'Mémorisation chargée. Cliquez sur "Appliquer" pour l\'utiliser.';
      }
    );

    renderPresets();

    // ============================================================
    // Appliquer dans la notice
    // ============================================================

    const applyBtn =
      root.querySelector(
        '[data-act="apply"]'
      );

    if (applyBtn) {
      applyBtn.addEventListener(
        "click",
        () => {
          scopes =
            refreshScopes();

          const scope =
            scopes[
              +scopeSel.value
            ] ||
            scopes[0];

          if (!scope) {
            status.textContent =
              "Aucun champ 099 trouvé sur la page. Ajoutez d'abord le champ 099 dans la notice.";

            return;
          }

          const results = [];

          const zoneLabel = code =>
            code === "g"
              ? "608$a"
              : (
                  code === "s"
                    ? "615$a"
                    : (
                        code === "p"
                          ? "623$a"
                          : "$" + code
                      )
                );

          const applyOne = (
            code,
            label
          ) => {
            let field;

            if (code === "f") {
              field =
                findFFieldInScope(
                  scope
                );
            } else if (code === "g") {
              field =
                findGenreField();
            } else if (code === "s") {
              field =
                findSubject615Field();
            } else if (code === "p") {
              field =
                findCharacter623Field();
            } else {
              field =
                findFieldInScope(
                  scope,
                  code
                );
            }

            if (!field) {
              results.push(
                `${zoneLabel(code)} : ✘ champ introuvable sur la page`
              );

              return;
            }

            if (!label) {
              results.push(
                `${zoneLabel(code)} : inchangé`
              );

              return;
            }

            const allowedItems =
              getAllowedItemsForCode(code);

            if (!isAllowedLabel(allowedItems, label)) {
              results.push(
                `${zoneLabel(code)} : ✘ valeur absente de l’arborescence active`
              );

              return;
            }

            const selectedItem = (allowedItems || []).find(item =>
              [item?.label, item?.value].filter(Boolean).some(candidate => norm(candidate) === norm(label))
            );

            const valueToWrite =
              code === "g" || code === "s" || code === "p"
                ? (selectedItem?.value || label)
                : label;

            const r =
              setFieldByLabel(
                field,
                valueToWrite
              );

            results.push(
              `${zoneLabel(code)} : ${
                r.ok
                  ? "✔ " + r.matched
                  : "✘ " + r.reason
              }`
            );
          };

          applyOne(
            "a",
            state.a
          );

          applyOne(
            "b",
            state.b
          );

          applyOne(
            "e",
            state.e
          );

          applyOne(
            "f",
            state.f
          );

          applyOne(
            "g",
            state.g
          );

          applyOne(
            "s",
            state.s
          );

          applyOne(
            "p",
            state.p
          );

          status.textContent =
            results.join("\n");
        }
      );
    }

    // ============================================================
    // Mémoriser
    // ============================================================

    const saveBtn =
      root.querySelector(
        '[data-act="save"]'
      );

    if (saveBtn) {
      saveBtn.addEventListener(
        "click",
        async () => {
          if (
            !state.a &&
            !state.b &&
            !state.e &&
            !state.f &&
            !state.g &&
            !state.s &&
            !state.p
          ) {
            status.textContent =
              "Rien à mémoriser : sélectionnez au moins un domaine ou un champ supplémentaire.";

            return;
          }

          if (effectiveListMode === "koha_user") {
            currentOwnerId = kohaUserIdentity.id;
            currentOwnerName = kohaUserIdentity.name;
            ownerInput.value = currentOwnerName;
            await savePresetToFirebase();
            return;
          }

          const ownerName =
            ownerInput.value.trim();

          if (
            ownerName ||
            currentOwnerId
          ) {
            await savePresetToFirebase();

            return;
          }

          ownerInput.focus();

          status.textContent =
            "Aucune liste sélectionnée. Sélectionnez une liste existante ou saisissez votre nom et prénom pour en créer une nouvelle.";
        }
      );
    }

    const openCreateListModalBtn =
      root.querySelector(
        '[data-act="openCreateListModal"]'
      );

    if (openCreateListModalBtn) {
      openCreateListModalBtn.addEventListener(
        "click",
        () => {
          ownerInput.focus();

          status.textContent =
            "Saisissez votre nom complet dans le champ Nom complet pour créer une nouvelle liste.";
        }
      );
    }

    // ============================================================
    // Vider
    // ============================================================

    const clearBtn =
      root.querySelector(
        '[data-act="clear"]'
      );

    if (clearBtn) {
      clearBtn.addEventListener(
        "click",
        () => {
          state.a = "";
          state.b = "";
          state.e = "";
          state.f = "";
          state.g = "";
          state.s = "";
          state.p = "";

          comboA.setValue(
            "",
            true
          );

          comboB.setValue(
            "",
            true
          );

          comboE.setValue(
            "",
            true
          );

          comboF.setValue(
            "",
            true
          );

          comboG.setValue(
            "",
            true
          );

          comboS.setValue(
            "",
            true
          );

          comboP.setValue(
            "",
            true
          );

          rebuild();

          status.textContent =
            "Sélection du panneau vidée.";
        }
      );
    }

    // ============================================================
    // Réduire le panneau
    // ============================================================

    const collapseBtn =
      root.querySelector(
        '[data-act="collapse"]'
      );

    if (collapseBtn) {
      collapseBtn.addEventListener(
        "click",
        () => {
          root.classList.toggle(
            "collapsed"
          );

          setJSON(
            PANEL_STATE_KEY,
            {
              collapsed:
                root.classList.contains(
                  "collapsed"
                )
            }
          );
        }
      );
    }
  };

  // ============================================================
  // Runtime PMK + moteur générique MARC/UNIMARC
  // ============================================================

  const deepClone109 = value => {
    try { return structuredClone(value); } catch (_) {
      return JSON.parse(JSON.stringify(value));
    }
  };

  const deepMerge109 = (base, override) => {
    if (Array.isArray(override)) return deepClone109(override);
    if (!override || typeof override !== "object") {
      return override === undefined ? deepClone109(base) : override;
    }

    const out =
      base && typeof base === "object" && !Array.isArray(base)
        ? deepClone109(base)
        : {};

    Object.keys(override).forEach(key => {
      const next = override[key];
      if (
        next &&
        typeof next === "object" &&
        !Array.isArray(next) &&
        out[key] &&
        typeof out[key] === "object" &&
        !Array.isArray(out[key])
      ) {
        out[key] = deepMerge109(out[key], next);
      } else {
        out[key] = deepClone109(next);
      }
    });

    return out;
  };

  const tr109 = (fr, en) => {
    const cfgLang = runtimeConfig && runtimeConfig.language;
    if (cfgLang === "en") return en || fr;
    if (cfgLang === "fr") return fr;

    const kohaLang =
      document.documentElement.lang ||
      document.querySelector('html')?.getAttribute('lang') ||
      "fr";

    return /^en/i.test(kohaLang) ? (en || fr) : fr;
  };

  const normalizeMarcRef109 = field => {
    const tag = String(field?.tag || "").trim();
    const subfield = String(field?.subfield || "").trim();
    if (!/^\d{3}$/.test(tag) || !subfield) return null;
    return { tag, subfield: subfield.charAt(0) };
  };

  const activeLevels109 = cfg =>
    (Array.isArray(cfg?.levels) ? cfg.levels : [])
      .filter(level => level && level.enabled !== false && normalizeMarcRef109(level));

  const activeExtras109 = cfg =>
    (Array.isArray(cfg?.extraFields) ? cfg.extraFields : [])
      .filter(field => field && field.enabled !== false && normalizeMarcRef109(field));

  const runtimeDefaults109 = () => deepClone109(DEFAULT_RUNTIME_CONFIG);

  const loadRuntimeConfig109 = async () => {
    let cfg = runtimeDefaults109();

    try {
      if (window.PMKConfig && typeof window.PMKConfig.getConfig === "function") {
        const stored = await window.PMKConfig.getConfig(MODULE_ID);
        if (stored) cfg = deepMerge109(cfg, stored);
      }
    } catch (_) {
      // Compatibilité production : une panne du socle PMK ne doit pas
      // empêcher le 109 historique de fonctionner avec ses valeurs par défaut.
    }

    return cfg;
  };

  const ensureFirebase109 = async () => {
    if (firebaseDb && collection && getDocs) return firebaseDb;

    const { initializeApp, getApps } = await import(
      "https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js"
    );

    const firebaseFirestore = await import(
      "https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js"
    );

    const { getFirestore } = firebaseFirestore;

    collection = firebaseFirestore.collection;
    doc = firebaseFirestore.doc;
    getDocs = firebaseFirestore.getDocs;
    getDoc = firebaseFirestore.getDoc;
    setDoc = firebaseFirestore.setDoc;
    deleteDoc = firebaseFirestore.deleteDoc;
    serverTimestamp = firebaseFirestore.serverTimestamp;
    runTransaction = firebaseFirestore.runTransaction;

    let app = null;
    try {
      const apps = typeof getApps === "function" ? getApps() : [];
      app = (apps || []).find(candidate =>
        candidate && candidate.options && candidate.options.projectId === firebaseConfig.projectId
      ) || null;
    } catch (_) {}

    if (!app) app = initializeApp(firebaseConfig);

    firebaseDb = getFirestore(app);
    return firebaseDb;
  };

  const loadLegacyTreeRows109 = async () => {
    await ensureFirebase109();
    const treeCollection = collection(firebaseDb, "treeData");
    const snapshot = await getDocs(treeCollection);
    const rows = [];
    snapshot.forEach(snapshotDoc => rows.push({ id: snapshotDoc.id, ...snapshotDoc.data() }));
    return rows;
  };

  const bootLegacy109 = async cfg => {
    await ensureFirebase109();
    const rows = await loadLegacyTreeRows109();

    window.PMKCataloguingTreeAssistant = {
      version: "4.1.0",
      moduleId: MODULE_ID,
      mode: "legacy_dracenie",
      config: deepClone109(cfg),
      legacyRows: rows,
      getLegacyValues: code => legacyItemsForCode109(rows, String(code || "")),
      fetchAuthorisedValues: fetchKohaAuthorisedValues109
    };

    await createLegacyPanel(rows, cfg);
  };

  // ------------------------------------------------------------
  // Accès aux valeurs autorisées Koha
  // ------------------------------------------------------------

  const authorisedValuesCache109 = new Map();

  const fetchKohaAuthorisedValues109 = async category => {
    const categoryName = String(category || "").trim();
    if (!categoryName) return [];
    if (authorisedValuesCache109.has(categoryName)) {
      return deepClone109(authorisedValuesCache109.get(categoryName));
    }

    const url =
      "/api/v1/authorised_value_categories/" +
      encodeURIComponent(categoryName) +
      "/authorised_values?_per_page=1000&_order_by=description";

    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(`Koha API ${response.status}`);
    }

    const data = await response.json();
    const items = (Array.isArray(data) ? data : []).map(row => ({
      key: norm(row.value || row.description || ""),
      value: String(row.value ?? row.description ?? ""),
      label: String(row.description || row.value || ""),
      description: String(row.description || ""),
      source: "authorised_values",
      raw: row
    })).filter(item => item.value || item.label);

    authorisedValuesCache109.set(categoryName, items);
    return deepClone109(items);
  };

  const parseManualValues109 = raw =>
    String(raw || "")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const parts = line.split("|");
        const value = String(parts.shift() || "").trim();
        const label = String(parts.join("|") || value).trim();
        return {
          key: norm(value || label),
          value: value || label,
          label: label || value,
          description: label || value,
          source: "manual",
          raw: null
        };
      });

  const dedupeItems109 = items => {
    const map = new Map();
    (items || []).forEach(item => {
      const key = norm(item?.value || item?.label || "");
      if (!key) return;
      if (!map.has(key)) map.set(key, { ...item, key });
    });
    return [...map.values()].sort((a, b) =>
      String(a.label || a.value || "").localeCompare(
        String(b.label || b.value || ""),
        "fr",
        { sensitivity: "base" }
      )
    );
  };

  const legacyItemsForCode109 = (rows, code) => {
    const treeCtx = buildActiveTreeContext(rows || []);
    return dedupeItems109(
      treeCtx.rows
        .filter(row => parseLevel(getTreeNodeName(row)) === code)
        .map(row => {
          const label = cleanLabel(getTreeNodeName(row));
          return {
            key: norm(label),
            value: label,
            label,
            description: label,
            source: "firebase_legacy",
            raw: row,
            ancestorKeys: getAncestorLabelKeys(row, treeCtx)
          };
        })
        .filter(item => item.label)
    );
  };

  // ------------------------------------------------------------
  // Localisation de zones / sous-zones MARC génériques dans addbiblio
  // ------------------------------------------------------------

  const cssEscape109 = value => {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(value));
    }
    return String(value).replace(/([ #;?%&,.+*~\\':"!^$[\]()=>|/@])/g, "\\$1");
  };

  const findTagScopes109 = tag => {
    const safe = cssEscape109(tag);
    return [
      ...document.querySelectorAll(
        `li.tag.clearfix[id^="tag_${safe}_"], li.tag[id^="tag_${safe}_"], [data-tag="${safe}"]`
      )
    ];
  };

  const fieldSelectors109 = (tag, subfield) => {
    const t = cssEscape109(tag);
    const s = cssEscape109(subfield);
    return [
      `[name^="tag_${t}_subfield_${s}_"]`,
      `[id^="tag_${t}_subfield_${s}_"]`,
      `[data-tag="${t}"][data-subfield="${s}"]`
    ];
  };

  const findFieldInMarcScope109 = (scope, tag, subfield) => {
    if (!scope) return null;
    for (const selector of fieldSelectors109(tag, subfield)) {
      const found = scope.querySelector(selector);
      if (found) return found;
    }
    return null;
  };

  const findGlobalMarcField109 = (tag, subfield, occurrenceIndex = 0) => {
    const scopes = findTagScopes109(tag);
    if (scopes.length) {
      const scope = scopes[Math.max(0, Math.min(occurrenceIndex, scopes.length - 1))] || scopes[0];
      const field = findFieldInMarcScope109(scope, tag, subfield);
      if (field) return field;
    }

    for (const selector of fieldSelectors109(tag, subfield)) {
      const all = [...document.querySelectorAll(selector)];
      if (all.length) return all[Math.max(0, Math.min(occurrenceIndex, all.length - 1))] || all[0];
    }

    return null;
  };

  const resolveGenericField109 = (fieldCfg, primaryTag, primaryScope, scopeIndex) => {
    const ref = normalizeMarcRef109(fieldCfg);
    if (!ref) return null;

    if (ref.tag === primaryTag && primaryScope) {
      return findFieldInMarcScope109(primaryScope, ref.tag, ref.subfield) ||
        findGlobalMarcField109(ref.tag, ref.subfield, scopeIndex);
    }

    return findGlobalMarcField109(ref.tag, ref.subfield, 0);
  };

  const readFieldValue109 = field => {
    if (!field) return { value: "", label: "" };

    if (field.tagName === "SELECT") {
      const selected = field.options[field.selectedIndex];
      return {
        value: String(field.value || ""),
        label: String(selected?.textContent || selected?.label || field.value || "").trim()
      };
    }

    return {
      value: String(field.value || ""),
      label: String(field.value || "").trim()
    };
  };

  const setGenericField109 = (field, item) => {
    if (!field || !item) return { ok: false, reason: tr109("champ introuvable", "field not found") };

    const wantedValue = String(item.value ?? "");
    const wantedLabel = String(item.label ?? wantedValue);

    if (field.tagName === "SELECT") {
      const options = [...field.options];
      const match =
        options.find(opt => String(opt.value) === wantedValue) ||
        options.find(opt => norm(opt.textContent || opt.label || "") === norm(wantedLabel)) ||
        options.find(opt => norm(opt.value || "") === norm(wantedValue || wantedLabel));

      if (!match) {
        return { ok: false, reason: tr109("valeur absente du champ Koha", "value missing from Koha field") };
      }

      field.value = match.value;
      triggerNativeAndJQuery(field);
      return { ok: true, matched: (match.textContent || match.value || "").trim() };
    }

    field.value = wantedValue || wantedLabel;
    triggerNativeAndJQuery(field);
    return { ok: true, matched: field.value };
  };

  const domItemsForField109 = fieldCfg => {
    const ref = normalizeMarcRef109(fieldCfg);
    if (!ref) return [];
    const field = findGlobalMarcField109(ref.tag, ref.subfield, 0);
    if (!field || field.tagName !== "SELECT") return [];

    return dedupeItems109(
      [...field.options]
        .filter(opt => String(opt.value || opt.textContent || "").trim())
        .map(opt => ({
          key: norm(opt.value || opt.textContent || ""),
          value: String(opt.value || opt.textContent || ""),
          label: String(opt.textContent || opt.label || opt.value || "").trim(),
          description: String(opt.textContent || opt.label || opt.value || "").trim(),
          source: "koha_dom",
          raw: opt
        }))
    );
  };

  // ------------------------------------------------------------
  // Pont vers le moteur 081-084 des listes 6XX
  // ------------------------------------------------------------

  const PMK6XX_RULE_IDS_109 = Object.freeze({
    "608$a": "legacy-081-genre",
    "610$a": "legacy-082-indexation",
    "623$a": "legacy-083-element",
    "615$a": "legacy-084-categorie"
  });

  const PMK6XX_FALLBACK_KEYS_109 = Object.freeze({
    "608$a": "genre",
    "610$a": "indexation",
    "623$a": "element",
    "615$a": "subject"
  });

  const pmk6xxRef109 = fieldCfg => {
    const ref = normalizeMarcRef109(fieldCfg);
    return ref ? `${ref.tag}$${ref.subfield}` : "";
  };

  // Même parsing que parseLegacyManualValues() dans 081-084 :
  // l'ordre source, la valeur avant | et le libellé après | sont conservés.
  const parsePmk6xxLegacyManual109 = raw =>
    String(raw || "")
      .split(/\r?\n/)
      .map(line => {
        if (!line || !line.trim() || line.trim().startsWith("#")) return null;
        const pos = line.indexOf("|");
        const rawValue = pos === -1 ? line : line.slice(0, pos);
        const rawLabel = pos === -1 ? line : line.slice(pos + 1);
        const value = String(rawValue);
        const label = String(rawLabel || rawValue);
        if (!value) return null;
        return {
          key: norm(value),
          value,
          label,
          description: label,
          source: "pmk6xx_manual",
          raw: null
        };
      })
      .filter(Boolean);

  const pmk6xxItemsFromRenderedSelect109 = fieldCfg => {
    const ref = pmk6xxRef109(fieldCfg);
    const ruleId = PMK6XX_RULE_IDS_109[ref];
    if (!ruleId) return [];

    const selector = `.pmk6xx-assistant[data-rule-id="${ruleId}"] .pmk6xx-select`;
    const select = document.querySelector(selector);
    if (!select || !select.options) return [];

    return [...select.options]
      .filter(option => String(option.value || "") !== "")
      .map(option => ({
        key: norm(option.value || option.textContent || ""),
        value: String(option.value || ""),
        label: String(option.textContent || option.label || option.value || ""),
        description: String(option.textContent || option.label || option.value || ""),
        source: "pmk6xx_dom",
        raw: option
      }));
  };

  const pmk6xxConfigSnapshot109 = async () => {
    const api = window.PMK6XXConfig;
    if (!api) return null;

    try {
      if (api.ready && typeof api.ready.then === "function") {
        await api.ready;
      }
    } catch (_) {}

    try {
      if (typeof api.get === "function") {
        const current = api.get();
        if (current) return current;
      }
    } catch (_) {}

    return api.defaults || null;
  };

  const pmk6xxFallbackItems109 = fieldCfg => {
    const key = PMK6XX_FALLBACK_KEYS_109[pmk6xxRef109(fieldCfg)];
    return key
      ? parsePmk6xxLegacyManual109(PMK6XX_HISTORICAL_FALLBACK_109[key])
      : [];
  };

  const pmk6xxLabelForKohaRow109 = (row, mode) => {
    const value = String(row?.value || "").trim();
    const description = String(row?.description || "").trim();
    const opac = String(row?.opac_description || "").trim();
    if (mode === "value") return value;
    if (mode === "opac-description") return opac || description || value;
    if (mode === "value-description") {
      const label = description || opac || value;
      return label && label !== value ? `${value} — ${label}` : value;
    }
    return description || opac || value;
  };

  const pmk6xxMergeOptions109 = (apiItems, manualItems, rule) => {
    const map = new Map();
    const order = [];
    const insensitive = rule?.deduplicateCaseInsensitive === true;
    const optionKey = value => insensitive ? norm(value) : String(value || "").trim();

    const add = (item, override) => {
      if (!item || !String(item.value || "").trim()) return;
      const key = optionKey(item.value);
      if (!key) return;
      if (!map.has(key)) order.push(key);
      if (!map.has(key) || override) map.set(key, item);
    };

    (apiItems || []).forEach(item => add(item, false));
    (manualItems || []).forEach(item => add(item, true));

    let result = order.map(key => map.get(key)).filter(Boolean);
    if (rule?.sortMode === "label") {
      result = result.slice().sort((a, b) =>
        String(a.label || "").localeCompare(String(b.label || ""), "fr", { sensitivity: "base" })
      );
    } else if (rule?.sortMode === "value") {
      result = result.slice().sort((a, b) =>
        String(a.value || "").localeCompare(String(b.value || ""), "fr", { sensitivity: "base" })
      );
    }
    return result;
  };

  const pmk6xxItemsForField109 = async fieldCfg => {
    // 1. Priorité absolue : copier le <select> réellement généré par le 6XX.
    // Cela garantit la même liste, le même ordre, les mêmes value/label.
    const rendered = pmk6xxItemsFromRenderedSelect109(fieldCfg);
    if (rendered.length) return rendered;

    // 2. Sinon lire la configuration courante du moteur 6XX.
    const ref = pmk6xxRef109(fieldCfg);
    const cfg6 = await pmk6xxConfigSnapshot109();
    const rules = Array.isArray(cfg6?.rules) ? cfg6.rules : [];
    const rule = rules.find(candidate =>
      candidate &&
      candidate.enabled !== false &&
      String(candidate.marcTag || "").trim() === String(fieldCfg.tag || "").trim() &&
      String(candidate.subfield || "").trim() === String(fieldCfg.subfield || "").trim()
    ) || rules.find(candidate => candidate?.id === PMK6XX_RULE_IDS_109[ref]);

    if (rule) {
      const sourceMode = String(rule.sourceMode || "manual");
      const manual = sourceMode === "authorised"
        ? []
        : parsePmk6xxLegacyManual109(rule.manualValues || "");

      if (sourceMode === "manual") return manual;

      const api = window.PMK6XXConfig;
      const service = api?.authorisedValues;
      const apiItems = [];

      if (service && typeof service.listValues === "function") {
        const categories = (Array.isArray(rule.categories) ? rule.categories : [])
          .filter(entry => entry && entry.enabled !== false)
          .map(entry => String(entry.manualName || entry.name || "").trim())
          .filter(Boolean);

        for (const category of categories) {
          try {
            const rows = await service.listValues(category, cfg6?.api || {});
            (rows || []).forEach(row => {
              const value = String(row?.value || "").trim();
              if (!value) return;
              const label = pmk6xxLabelForKohaRow109(row, rule.displayMode);
              apiItems.push({
                key: norm(value),
                value,
                label,
                description: label,
                source: "pmk6xx_authorised",
                raw: row
              });
            });
          } catch (_) {}
        }
      }

      const merged = pmk6xxMergeOptions109(apiItems, manual, rule);
      if (merged.length) return merged;
    }

    // 3. Dernier recours : copie exacte des presets historiques du 081-084.
    return pmk6xxFallbackItems109(fieldCfg);
  };

  const loadItemsForField109 = async (fieldCfg, legacyRows) => {
    const type = String(fieldCfg?.sourceType || "firebase_legacy");

    if (type === "authorised_values") {
      try {
        const apiItems = await fetchKohaAuthorisedValues109(fieldCfg.authorisedValueCategory);
        if (apiItems.length) return dedupeItems109(apiItems);
      } catch (_) {}

      return domItemsForField109(fieldCfg);
    }

    if (type === "manual") {
      return dedupeItems109(parseManualValues109(fieldCfg.manualValues));
    }

    if (type === "koha_field") {
      return domItemsForField109(fieldCfg);
    }

    if (type === "pmk6xx") {
      return pmk6xxItemsForField109(fieldCfg);
    }

    return legacyItemsForCode109(legacyRows || [], String(fieldCfg?.firebaseCode || ""));
  };

  // ------------------------------------------------------------
  // Relations : arêtes configurées ou reconstruction Firebase historique
  // ------------------------------------------------------------

  const relationKey109 = (fromId, fromValue, toId) =>
    `${String(fromId)}\u0001${norm(fromValue)}\u0001${String(toId)}`;

  const addRelation109 = (map, fromId, fromValue, toId, toValue) => {
    if (!fromId || !toId || !String(fromValue || "").trim() || !String(toValue || "").trim()) return;
    const key = relationKey109(fromId, fromValue, toId);
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(norm(toValue));
  };

  const configuredRelations109 = cfg => {
    const map = new Map();
    (Array.isArray(cfg?.relationships) ? cfg.relationships : []).forEach(edge => {
      if (!edge || edge.enabled === false) return;
      addRelation109(map, edge.fromId, edge.fromValue, edge.toId, edge.toValue);
    });
    return map;
  };

  const deriveFirebaseRelations109 = (cfg, rows) => {
    const map = new Map();
    const levels = activeLevels109(cfg);
    const treeCtx = buildActiveTreeContext(rows || []);

    for (let i = 1; i < levels.length; i++) {
      const parentCfg = levels[i - 1];
      const childCfg = levels[i];
      const parentCode = String(parentCfg.firebaseCode || "");
      const childCode = String(childCfg.firebaseCode || "");
      if (!parentCode || !childCode) continue;

      treeCtx.rows.forEach(row => {
        if (parseLevel(getTreeNodeName(row)) !== childCode) return;
        const parent = findAncestorByLevel(row, parentCode, treeCtx);
        if (!parent) return;
        const parentValue = cleanLabel(getTreeNodeName(parent));
        const childValue = cleanLabel(getTreeNodeName(row));
        addRelation109(map, parentCfg.id, parentValue, childCfg.id, childValue);
      });
    }

    return map;
  };

  const mergeRelationMaps109 = (...maps) => {
    const out = new Map();
    maps.forEach(map => {
      if (!map) return;
      map.forEach((values, key) => {
        if (!out.has(key)) out.set(key, new Set());
        values.forEach(value => out.get(key).add(value));
      });
    });
    return out;
  };

  const buildGenericModel109 = async (cfg, legacyRows) => {
    const levels = activeLevels109(cfg);
    const extras = activeExtras109(cfg);
    const itemsById = new Map();

    for (const fieldCfg of [...levels, ...extras]) {
      itemsById.set(fieldCfg.id, await loadItemsForField109(fieldCfg, legacyRows));
    }

    const configured = configuredRelations109(cfg);
    const derived =
      cfg?.hierarchy?.relationshipMode === "firebase_legacy"
        ? deriveFirebaseRelations109(cfg, legacyRows)
        : new Map();

    const relations =
      cfg?.hierarchy?.relationshipMode === "configured"
        ? configured
        : mergeRelationMaps109(derived, configured);

    return { levels, extras, itemsById, relations, legacyRows };
  };

  const itemMatchesValue109 = (item, raw) => {
    const target = norm(raw || "");
    if (!target) return false;
    return [item?.value, item?.label, item?.description]
      .filter(Boolean)
      .some(candidate => norm(candidate) === target);
  };

  const findItem109 = (items, raw) =>
    (items || []).find(item => itemMatchesValue109(item, raw)) || null;

  const allowedItemsForLevel109 = (model, levelIndex, state) => {
    const level = model.levels[levelIndex];
    const all = model.itemsById.get(level.id) || [];
    if (levelIndex === 0) return all;

    const parent = model.levels[levelIndex - 1];
    const parentState = state[parent.id];
    if (!parentState) return [];

    const parentItem = findItem109(model.itemsById.get(parent.id) || [], parentState);
    if (!parentItem) return [];

    const key = relationKey109(parent.id, parentItem.value || parentItem.label, level.id);
    const allowedKeys = model.relations.get(key);

    if (!allowedKeys || !allowedKeys.size) {
      return model.relations.size === 0 && model.levels.every(x => x.sourceType !== "firebase_legacy")
        ? all
        : [];
    }

    return all.filter(item =>
      allowedKeys.has(norm(item.value || item.label)) ||
      allowedKeys.has(norm(item.label || item.value))
    );
  };

  const extraAllowedByFirebaseContext109 = (extraCfg, items, model, state) => {
    if (!extraCfg.filterByHierarchy || extraCfg.sourceType !== "firebase_legacy") return items;

    const selectedLabels = model.levels
      .map(level => {
        const item = findItem109(model.itemsById.get(level.id) || [], state[level.id]);
        return item?.label || item?.value || "";
      })
      .filter(Boolean);

    if (!selectedLabels.length) return items;

    return items.filter(item => {
      if (!Array.isArray(item.ancestorKeys)) return true;
      return selectedLabels.every(label => item.ancestorKeys.includes(norm(label)));
    });
  };

  // ------------------------------------------------------------
  // Filtrage natif Koha générique (fonction du 122 absorbée)
  // ------------------------------------------------------------

  const ensureGenericFilterStyle109 = () => {
    if (document.getElementById("pmk-tree-native-filter-style")) return;
    const style = document.createElement("style");
    style.id = "pmk-tree-native-filter-style";
    style.textContent = `
      .pmk-tree-invalid-value,
      .pmk-tree-invalid-value + .select2-container .select2-selection {
        background:#fff3cd !important;
        border-color:#e0a800 !important;
      }
      .pmk-tree-invalid-value + .select2-container .select2-selection__rendered {
        color:#7a4b00 !important;
        font-weight:600;
      }
      .pmk-tree-filtered-disabled + .select2-container { opacity:.64; }
    `;
    document.head.appendChild(style);
  };

  const markNativeField109 = (field, invalid, disabled) => {
    if (!field) return;
    field.classList.toggle("pmk-tree-invalid-value", !!invalid);
    field.classList.toggle("pmk-tree-filtered-disabled", !!disabled);
    if (invalid) {
      field.setAttribute(
        "title",
        tr109(
          "La valeur actuelle n'est pas autorisée par l'arborescence. Elle est conservée tant que l'agent ne la remplace pas.",
          "The current value is not allowed by the hierarchy. It is preserved until staff replaces it."
        )
      );
    } else {
      field.removeAttribute("title");
    }
  };

  const filterNativeSelect109 = (field, allowedItems, disabled, preserveInvalid) => {
    if (!field || field.tagName !== "SELECT") return;

    const current = readFieldValue109(field);
    const allowed = new Set();
    (allowedItems || []).forEach(item => {
      allowed.add(norm(item.value || ""));
      allowed.add(norm(item.label || ""));
    });

    [...field.options].forEach(option => {
      const isEmpty = !String(option.value || option.textContent || "").trim();
      const isAllowed =
        isEmpty ||
        allowed.has(norm(option.value || "")) ||
        allowed.has(norm(option.textContent || option.label || ""));
      const isCurrent =
        String(option.value) === String(field.value) ||
        norm(option.textContent || "") === norm(current.label);

      option.hidden = !isAllowed && !(preserveInvalid && isCurrent);
      option.disabled = !isAllowed && !(preserveInvalid && isCurrent);
    });

    const currentIsAllowed =
      !current.value && !current.label
        ? true
        : (allowed.has(norm(current.value)) || allowed.has(norm(current.label)));

    field.disabled = !!disabled;
    markNativeField109(field, !currentIsAllowed && !!(current.value || current.label), disabled);

    try {
      if (window.jQuery && window.jQuery(field).data("select2")) {
        window.jQuery(field).trigger("change.select2");
      }
    } catch (_) {}
  };

  const applyNativeFiltersToScope109 = (model, cfg, scope, scopeIndex) => {
    const primaryTag = model.levels[0]?.tag || "";
    const state = {};

    model.levels.forEach(level => {
      const field = resolveGenericField109(level, primaryTag, scope, scopeIndex);
      const current = readFieldValue109(field);
      state[level.id] = current.value || current.label || "";
    });

    model.levels.forEach((level, index) => {
      if (index === 0) return;
      const field = resolveGenericField109(level, primaryTag, scope, scopeIndex);
      if (!field || field.tagName !== "SELECT") return;
      const allowed = allowedItemsForLevel109(model, index, state);
      const parent = model.levels[index - 1];
      const parentValue = state[parent.id];
      filterNativeSelect109(
        field,
        allowed,
        !parentValue,
        cfg?.features?.preserveInvalidExistingValues !== false
      );
    });
  };

  const startNativeFiltering109 = (model, cfg) => {
    if (!cfg?.features?.nativeFiltering || !model.levels.length) return () => {};
    ensureGenericFilterStyle109();

    const primaryTag = model.levels[0].tag;
    let timer = null;

    const applyAll = () => {
      const scopes = findTagScopes109(primaryTag);
      if (scopes.length) {
        scopes.forEach((scope, index) => applyNativeFiltersToScope109(model, cfg, scope, index));
      } else {
        applyNativeFiltersToScope109(model, cfg, null, 0);
      }
    };

    const onChange = event => {
      const target = event.target;
      if (!target) return;
      const watched = model.levels.some(level => {
        const ref = normalizeMarcRef109(level);
        if (!ref) return false;
        return fieldSelectors109(ref.tag, ref.subfield).some(selector => {
          try { return target.matches(selector); } catch (_) { return false; }
        });
      });
      if (!watched) return;
      clearTimeout(timer);
      timer = setTimeout(applyAll, 30);
    };

    document.addEventListener("change", onChange, true);
    document.addEventListener("select2:select", onChange, true);
    document.addEventListener("select2:clear", onChange, true);

    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(applyAll, 120);
    });

    observer.observe(
      document.querySelector("#cat_addbiblio") || document.querySelector('form[name="f"]') || document.body,
      { childList: true, subtree: true }
    );

    applyAll();

    return () => {
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("select2:select", onChange, true);
      document.removeEventListener("select2:clear", onChange, true);
      observer.disconnect();
    };
  };

  // ------------------------------------------------------------
  // Mémorisations génériques
  // ------------------------------------------------------------

  const genericKohaIdentity109 = () => {
    const marker = document.querySelector(
      '.loggedinusername, #logged-in-info-full .loggedinusername, #logged-in-menu .loggedinusername'
    );
    let borrowernumber = marker?.getAttribute("data-borrowernumber") || marker?.dataset?.borrowernumber || "";
    const name = (marker?.textContent || "").trim();

    if (!borrowernumber && marker) {
      try {
        const url = new URL(marker.getAttribute("href") || "", location.origin);
        borrowernumber = url.searchParams.get("borrowernumber") || "";
      } catch (_) {}
    }

    const slug = norm(name).replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || "unknown";
    return {
      id: borrowernumber ? `koha_${borrowernumber}` : `koha_name_${slug}`,
      name: name || (borrowernumber ? `Koha #${borrowernumber}` : "Compte Koha")
    };
  };

  const genericPresetDocId109 = cfg =>
    cfg?.lists?.mode === "koha_user"
      ? genericKohaIdentity109().id
      : "common";

  const loadGenericPresets109 = async cfg => {
    if (cfg?.lists?.enabled === false) return [];
    await ensureFirebase109();
    const ref = doc(firebaseDb, GENERIC_PRESETS_COLLECTION, genericPresetDocId109(cfg));
    const snap = await getDoc(ref);
    return snap.exists() && Array.isArray(snap.data()?.presets) ? snap.data().presets : [];
  };

  const saveGenericPresets109 = async (cfg, presets) => {
    await ensureFirebase109();
    const identity = genericKohaIdentity109();
    const ref = doc(firebaseDb, GENERIC_PRESETS_COLLECTION, genericPresetDocId109(cfg));
    await setDoc(ref, {
      mode: cfg?.lists?.mode === "koha_user" ? "koha_user" : "common",
      kohaUserName: cfg?.lists?.mode === "koha_user" ? identity.name : null,
      presets: presets,
      updatedAt: serverTimestamp()
    }, { merge: true });
  };

  // ------------------------------------------------------------
  // Panneau générique
  // ------------------------------------------------------------

  const genericLabel109 = field =>
    tr109(field?.labelFr || field?.id || "Champ", field?.labelEn || field?.labelFr || field?.id || "Field");

  const createGenericPanel109 = async (model, cfg) => {
    if (!cfg?.features?.assistant || !model.levels.length) return;
    if (document.getElementById(PANEL_ID)) return;

    ensureStyle();

    const root = document.createElement("div");
    root.id = PANEL_ID;
    root.classList.add("pmk-tree-generic");
    root.style.width = `${Math.max(280, Number(cfg?.appearance?.widthPx) || 360)}px`;

    const savedPanelState = getJSON(GENERIC_PANEL_STATE_KEY, { collapsed: false });
    if (cfg?.features?.rememberPanelState !== false && savedPanelState.collapsed) {
      root.classList.add("collapsed");
    }

    const primaryTag = model.levels[0].tag;
    const allFields = [...model.levels, ...model.extras];

    root.innerHTML = `
      <div class="head">
        <span>
          <span class="title">${escapeHTML(tr109("Assistant catalogage", "Cataloguing assistant"))}</span>
          <span class="subtitle" data-generic-list-label></span>
        </span>
        <div class="head-btns">
          <button type="button" data-act="collapse" title="${escapeAttr(tr109("Réduire", "Collapse"))}">–</button>
        </div>
      </div>
      <div class="body">
        <div class="row" data-row="generic-scope" style="display:none">
          <label>${escapeHTML(tr109(`Zone ${primaryTag} cible`, `Target ${primaryTag} field`))}</label>
          <select class="combo-input" data-generic-scope style="width:100%"></select>
        </div>
        <div data-generic-fields></div>
        ${cfg?.features?.showBreadcrumb === false ? "" : `
          <div class="status" data-generic-breadcrumb style="margin-bottom:8px"></div>
        `}
        <div class="actions">
          <button type="button" class="btn-primary" data-act="generic-apply">${escapeHTML(tr109("Appliquer", "Apply"))}</button>
          ${cfg?.lists?.enabled === false ? "" : `<button type="button" class="btn-secondary" data-act="generic-save">${escapeHTML(tr109("Mémoriser", "Save"))}</button>`}
          <button type="button" class="btn-ghost" data-act="generic-clear">${escapeHTML(tr109("Vider", "Clear"))}</button>
        </div>
        <div class="status" data-generic-status></div>
        ${cfg?.lists?.enabled === false ? "" : `
          <hr class="divider">
          <div class="presets-title">
            <span>${escapeHTML(tr109("Mémorisations", "Saved selections"))}</span>
            <span class="presets-count" data-generic-presets-count></span>
          </div>
          <div class="preset-list" data-generic-presets></div>
        `}
      </div>
    `;

    document.body.appendChild(root);

    const fieldsHost = root.querySelector("[data-generic-fields]");
    const status = root.querySelector("[data-generic-status]");
    const breadcrumb = root.querySelector("[data-generic-breadcrumb]");
    const scopeRow = root.querySelector('[data-row="generic-scope"]');
    const scopeSelect = root.querySelector("[data-generic-scope]");
    const listLabel = root.querySelector("[data-generic-list-label]");
    const combos = new Map();
    const state = {};

    if (listLabel) {
      listLabel.textContent =
        cfg?.lists?.mode === "koha_user"
          ? `${tr109("Compte Koha", "Koha account")}: ${genericKohaIdentity109().name}`
          : tr109("Listes communes", "Shared lists");
    }

    allFields.forEach(fieldCfg => {
      const row = document.createElement("div");
      row.className = "row";
      row.dataset.genericFieldId = fieldCfg.id;
      row.innerHTML = `<label>${escapeHTML(genericLabel109(fieldCfg))} (${escapeHTML(fieldCfg.tag + "$" + fieldCfg.subfield)})</label>`;
      fieldsHost.appendChild(row);
      const combo = makeCombo(row, tr109(`Rechercher : ${genericLabel109(fieldCfg)}…`, `Search: ${genericLabel109(fieldCfg)}…`));
      combos.set(fieldCfg.id, combo);
      state[fieldCfg.id] = "";
    });

    let scopes = [];
    const refreshScopes = () => {
      scopes = findTagScopes109(primaryTag);
      const before = scopeSelect.value;
      scopeSelect.innerHTML = scopes.map((scope, index) =>
        `<option value="${index}">${escapeHTML(`${primaryTag} #${index + 1} (${scope.id || "—"})`)}</option>`
      ).join("");
      scopeRow.style.display = scopes.length > 1 ? "" : "none";
      if (before !== "" && scopes[Number(before)]) scopeSelect.value = before;
      return scopes;
    };
    refreshScopes();

    const getSelectedScope = () => scopes[Number(scopeSelect.value)] || scopes[0] || null;
    const getScopeIndex = () => Math.max(0, Number(scopeSelect.value) || 0);

    const itemForState = fieldCfg =>
      findItem109(model.itemsById.get(fieldCfg.id) || [], state[fieldCfg.id]);

    const allowedItemsForExtra = extraCfg => {
      let items = model.itemsById.get(extraCfg.id) || [];
      items = extraAllowedByFirebaseContext109(extraCfg, items, model, state);

      const incomingParents = model.levels.filter(parent => {
        const parentItem = itemForState(parent);
        if (!parentItem) return false;
        return model.relations.has(relationKey109(parent.id, parentItem.value || parentItem.label, extraCfg.id));
      });

      if (!incomingParents.length) return items;

      return items.filter(item => incomingParents.every(parent => {
        const parentItem = itemForState(parent);
        const allowed = model.relations.get(relationKey109(parent.id, parentItem.value || parentItem.label, extraCfg.id));
        return allowed && (
          allowed.has(norm(item.value || item.label)) ||
          allowed.has(norm(item.label || item.value))
        );
      }));
    };

    const updateBreadcrumb = () => {
      if (!breadcrumb) return;
      const labels = model.levels.map(level => itemForState(level)?.label || "").filter(Boolean);
      breadcrumb.textContent = labels.length
        ? `${tr109("Chemin", "Path")}: ${labels.join(" › ")}`
        : tr109("Aucun chemin sélectionné.", "No path selected.");
    };

    const rebuild = () => {
      model.levels.forEach((level, index) => {
        const allowed = allowedItemsForLevel109(model, index, state);
        const combo = combos.get(level.id);
        combo.setItems(allowed);
        combo.setDisabled(index > 0 && !state[model.levels[index - 1].id]);
      });

      model.extras.forEach(extra => {
        const combo = combos.get(extra.id);
        combo.setItems(allowedItemsForExtra(extra));
        combo.setDisabled(false);
      });

      if (cfg?.features?.rememberSelection !== false) {
        setJSON(GENERIC_CACHE_KEY, state);
      }

      updateBreadcrumb();
    };

    const clearAfter = levelIndex => {
      model.levels.slice(levelIndex + 1).forEach(level => {
        state[level.id] = "";
        combos.get(level.id)?.setValue("", true);
      });
    };

    model.levels.forEach((level, index) => {
      combos.get(level.id).onChange(value => {
        state[level.id] = value;
        clearAfter(index);
        rebuild();
      });
    });

    model.extras.forEach(extra => {
      combos.get(extra.id).onChange(value => {
        state[extra.id] = value;
        rebuild();
      });
    });

    const initializeFromPage = () => {
      const scope = getSelectedScope();
      const scopeIndex = getScopeIndex();
      allFields.forEach(fieldCfg => {
        const field = resolveGenericField109(fieldCfg, primaryTag, scope, scopeIndex);
        const current = readFieldValue109(field);
        const items = model.itemsById.get(fieldCfg.id) || [];
        const match = findItem109(items, current.value) || findItem109(items, current.label);
        state[fieldCfg.id] = match ? (match.value || match.label) : (current.value || current.label || "");
        combos.get(fieldCfg.id)?.setValue(state[fieldCfg.id], true);
      });
      rebuild();
    };

    initializeFromPage();

    scopeSelect.addEventListener("change", () => {
      refreshScopes();
      initializeFromPage();
    });

    root.querySelector('[data-act="generic-apply"]')?.addEventListener("click", () => {
      const scope = getSelectedScope();
      const scopeIndex = getScopeIndex();
      const results = [];

      allFields.forEach(fieldCfg => {
        const raw = state[fieldCfg.id];
        if (!raw) {
          results.push(`${fieldCfg.tag}$${fieldCfg.subfield} : ${tr109("inchangé", "unchanged")}`);
          return;
        }

        const items =
          model.levels.includes(fieldCfg)
            ? allowedItemsForLevel109(model, model.levels.indexOf(fieldCfg), state)
            : allowedItemsForExtra(fieldCfg);

        const item = findItem109(items, raw);
        if (!item) {
          results.push(`${fieldCfg.tag}$${fieldCfg.subfield} : ✘ ${tr109("valeur non autorisée", "value not allowed")}`);
          return;
        }

        const field = resolveGenericField109(fieldCfg, primaryTag, scope, scopeIndex);
        const result = setGenericField109(field, item);
        results.push(`${fieldCfg.tag}$${fieldCfg.subfield} : ${result.ok ? "✔ " + result.matched : "✘ " + result.reason}`);
      });

      status.textContent = results.join("\n");
    });

    root.querySelector('[data-act="generic-clear"]')?.addEventListener("click", () => {
      allFields.forEach(fieldCfg => {
        state[fieldCfg.id] = "";
        combos.get(fieldCfg.id)?.setValue("", true);
      });
      rebuild();
      status.textContent = tr109("Sélection du panneau vidée.", "Assistant selection cleared.");
    });

    root.querySelector('[data-act="collapse"]')?.addEventListener("click", () => {
      root.classList.toggle("collapsed");
      if (cfg?.features?.rememberPanelState !== false) {
        setJSON(GENERIC_PANEL_STATE_KEY, { collapsed: root.classList.contains("collapsed") });
      }
    });

    // Déplacement : même principe que le 109 historique.
    (() => {
      const head = root.querySelector(".head");
      let dragging = false;
      let offX = 0;
      let offY = 0;
      head.addEventListener("mousedown", event => {
        if (event.target.closest(".head-btns")) return;
        dragging = true;
        const rect = root.getBoundingClientRect();
        offX = event.clientX - rect.left;
        offY = event.clientY - rect.top;
        root.style.right = "auto";
      });
      document.addEventListener("mousemove", event => {
        if (!dragging) return;
        root.style.left = `${Math.max(0, event.clientX - offX)}px`;
        root.style.top = `${Math.max(0, event.clientY - offY)}px`;
      });
      document.addEventListener("mouseup", () => { dragging = false; });
    })();

    // Mémorisations génériques.
    const presetsHost = root.querySelector("[data-generic-presets]");
    const presetsCount = root.querySelector("[data-generic-presets-count]");
    let presets = [];

    const renderPresets = () => {
      if (!presetsHost) return;
      const max = Math.max(1, Number(cfg?.lists?.maxPresets) || 20);
      if (presetsCount) presetsCount.textContent = `${presets.length}/${max}`;
      if (!presets.length) {
        presetsHost.innerHTML = `<div class="preset-empty">${escapeHTML(tr109("Aucune mémorisation pour l'instant.", "No saved selection yet."))}</div>`;
        return;
      }
      presetsHost.innerHTML = presets.map((preset, index) => {
        const labels = allFields.map(fieldCfg => {
          const raw = preset.values?.[fieldCfg.id];
          return findItem109(model.itemsById.get(fieldCfg.id) || [], raw)?.label || raw || "";
        }).filter(Boolean);
        return `
          <div class="preset-item" data-generic-preset="${index}">
            <span class="preset-text">
              ${preset.name ? `<span class="preset-name">${escapeHTML(preset.name)}</span>` : ""}
              <span class="preset-chain">${escapeHTML(labels.join(" › "))}</span>
            </span>
            <button type="button" class="preset-del" data-generic-delete="${index}" title="${escapeAttr(tr109("Supprimer", "Delete"))}" aria-label="${escapeAttr(tr109("Supprimer", "Delete"))}">×</button>
          </div>`;
      }).join("");
    };

    if (presetsHost) {
      try {
        presets = await loadGenericPresets109(cfg);
      } catch (_) {
        presets = getJSON("pmk_cataloguing_tree_presets_fallback", []);
      }
      renderPresets();

      presetsHost.addEventListener("click", async event => {
        const deleteButton = event.target.closest("[data-generic-delete]");
        if (deleteButton) {
          const index = Number(deleteButton.dataset.genericDelete);
          presets.splice(index, 1);
          try { await saveGenericPresets109(cfg, presets); }
          catch (_) { setJSON("pmk_cataloguing_tree_presets_fallback", presets); }
          renderPresets();
          return;
        }

        const item = event.target.closest("[data-generic-preset]");
        if (!item) return;
        const preset = presets[Number(item.dataset.genericPreset)];
        if (!preset) return;
        allFields.forEach(fieldCfg => {
          state[fieldCfg.id] = String(preset.values?.[fieldCfg.id] || "");
          combos.get(fieldCfg.id)?.setValue(state[fieldCfg.id], true);
        });
        rebuild();
        status.textContent = tr109('Mémorisation chargée. Cliquez sur "Appliquer" pour l’utiliser.', 'Saved selection loaded. Click “Apply” to use it.');
      });
    }

    root.querySelector('[data-act="generic-save"]')?.addEventListener("click", async () => {
      const values = {};
      allFields.forEach(fieldCfg => { values[fieldCfg.id] = state[fieldCfg.id] || ""; });
      if (!Object.values(values).some(Boolean)) {
        status.textContent = tr109("Rien à mémoriser.", "Nothing to save.");
        return;
      }

      const suggested = model.levels.map(level => itemForState(level)?.label || "").filter(Boolean).join(" › ");
      const name = window.prompt(tr109("Nom de la mémorisation (facultatif)", "Saved selection name (optional)"), suggested) || "";
      const max = Math.max(1, Number(cfg?.lists?.maxPresets) || 20);
      presets.unshift({ name: name.trim().slice(0, 80), values, updatedAt: Date.now() });
      presets = presets.slice(0, max);
      try {
        await saveGenericPresets109(cfg, presets);
      } catch (_) {
        setJSON("pmk_cataloguing_tree_presets_fallback", presets);
      }
      renderPresets();
      status.textContent = tr109("Mémorisation enregistrée.", "Saved selection stored.");
    });

    // Responsive sans modifier le rendu desktop historique.
    const media = window.matchMedia(`(max-width:${Math.max(320, Number(cfg?.appearance?.mobileBreakpointPx) || 576)}px)`);
    const applyResponsive = () => {
      if (media.matches) {
        root.style.width = "calc(100vw - 16px)";
        root.style.maxWidth = "calc(100vw - 16px)";
        root.style.left = "8px";
        root.style.right = "8px";
        root.style.top = "58px";
      } else {
        root.style.width = `${Math.max(280, Number(cfg?.appearance?.widthPx) || 360)}px`;
        root.style.maxWidth = "";
        if (!root.style.left) root.style.right = "20px";
      }
    };
    applyResponsive();
    try { media.addEventListener("change", applyResponsive); } catch (_) { media.addListener(applyResponsive); }
  };

  const bootGeneric109 = async cfg => {
    let legacyRows = [];
    const needsFirebase = [...activeLevels109(cfg), ...activeExtras109(cfg)]
      .some(field => field.sourceType === "firebase_legacy") ||
      cfg?.hierarchy?.relationshipMode === "firebase_legacy" ||
      cfg?.lists?.enabled !== false;

    if (needsFirebase) {
      try { legacyRows = await loadLegacyTreeRows109(); }
      catch (_) {
        // Le moteur reste utilisable avec VA / manuel même si Firebase est indisponible.
        legacyRows = [];
      }
    }

    const model = await buildGenericModel109(cfg, legacyRows);
    startNativeFiltering109(model, cfg);
    await createGenericPanel109(model, cfg);

    window.PMKCataloguingTreeAssistant = {
      version: "4.1.0",
      moduleId: MODULE_ID,
      config: deepClone109(cfg),
      model: model,
      reload: () => location.reload(),
      fetchAuthorisedValues: fetchKohaAuthorisedValues109
    };
  };

  const boot = async () => {
    await waitForBody();
    ensureStyle();

    runtimeConfig = await loadRuntimeConfig109();

    if (!runtimeConfig || runtimeConfig.enabled === false || runtimeConfig?.page?.enabled === false) {
      return;
    }

    try {
      if (runtimeConfig.runtimeMode === "generic") {
        await bootGeneric109(runtimeConfig);
      } else {
        // Défaut Dracénie : exécute le panneau historique, sans basculer
        // automatiquement sur le filtrage absorbé du 122.
        await bootLegacy109(runtimeConfig);
      }
    } catch (error) {
      // Fail-safe : le module ne doit jamais empêcher le catalogage Koha.
      try { console.error("[PMK 109]", error); } catch (_) {}
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();

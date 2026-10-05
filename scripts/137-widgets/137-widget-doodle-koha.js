/* ============================================================
   PimpMyKoha 137 — Widgets & blocs d’accueil
   Généré le 22/09/2026
   Sous-widget autonome.
   IMPORTANT : conserver ce fichier séparé pour la maintenance.
   ============================================================ */
import {
  initializeApp,
  getApps,
  getApp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  query,
  where,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const WIDGET_ID = 'doodle-koha';

async function mount(container) {
    if (!container || container.dataset.pmk137Mounted === WIDGET_ID) return;
    container.dataset.pmk137Mounted = WIDGET_ID;
    container.innerHTML = '<div id="dk-home-slots-widget"></div>';

    await window.PMKHomeWidgets.loadScript('https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js');

    const firebaseConfig = {
      apiKey: "YOUR_FIREBASE_APIKEY",
      authDomain: "YOUR_FIREBASE_AUTHDOMAIN",
      projectId: "YOUR_FIREBASE_PROJECTID",
      storageBucket: "YOUR_FIREBASE_STORAGEBUCKET",
      messagingSenderId: "YOUR_FIREBASE_MESSAGINGSENDERID",
      appId: "YOUR_FIREBASE_APPID"
    };

    // PMK 137 peut charger plusieurs widgets Firebase sur la même page.
    // Doodle doit donc utiliser sa propre application nommée au lieu de
    // supposer que l'application Firebase par défaut existe.
    const FIREBASE_APP_NAME = "doodle-koha-home-widget";
    const app = getApps().some(item => item.name === FIREBASE_APP_NAME)
      ? getApp(FIREBASE_APP_NAME)
      : initializeApp(firebaseConfig, FIREBASE_APP_NAME);
    const db = getFirestore(app);

    const MAIN_PAGE =
      `${window.location.origin}/cgi-bin/koha/tools/page.pl?page_id=133`;

    const MAX_SLOTS = 4;

    const BRANCHES = [
      "AMPUS","BARGEMON","CALLAS","CLAVIERS","COMPS-SUR-ARTUBY","DRAGUIGNAN",
      "FIGANIÈRES","FLAYOSC","LA MOTTE","LE MUY","LORGUES","MONTFERRAT",
      "SALERNES","VIDAUBAN","MÉDIABUS","AUTRE"
    ];

    const LOCAL_BOOKINGS_KEY = "doodleKohaBookingIds";
    const LOCAL_VISITOR_KEY = "doodleKohaVisitor";
    const LOCAL_CLIENT_KEY = "doodleKohaClientKey";

    const host = document.getElementById("dk-home-slots-widget");

    if (!host.shadowRoot) {
      host.attachShadow({ mode:"open" });
    }

    const root = host.shadowRoot;

    // La modale est volontairement rendue hors du bloc d'annonce Koha.
    // Cela évite qu'un parent Koha avec transform/z-index/position crée un
    // stacking context qui passerait visuellement devant la fenêtre.
    let modalPortalHost = document.getElementById("dk-home-slots-widget-modal-portal");

    if (!modalPortalHost) {
      modalPortalHost = document.createElement("div");
      modalPortalHost.id = "dk-home-slots-widget-modal-portal";

      Object.assign(modalPortalHost.style, {
        position:"fixed",
        inset:"0",
        width:"100vw",
        height:"100vh",
        zIndex:"2147483647",
        pointerEvents:"none"
      });

      document.body.appendChild(modalPortalHost);
    }

    if (!modalPortalHost.shadowRoot) {
      modalPortalHost.attachShadow({ mode:"open" });
    }

    const modalRoot = modalPortalHost.shadowRoot;

    modalRoot.innerHTML = `

    <style>
      :host {
        position:fixed !important;
        inset:0 !important;
        display:block !important;
        width:100vw !important;
        height:100vh !important;
        z-index:2147483647 !important;
        pointer-events:none;
        font-family:inherit;
        color:#333;
        --dk-koha-green:#006100;
        --dk-koha-green-dark:#004b00;
        --dk-koha-line:#d7d7d7;
        --dk-koha-soft:#f5f5f5;
        --dk-koha-soft-2:#fafafa;
        --dk-koha-muted:#666;
        --dk-koha-danger:#a94442;
        --dk-koha-danger-bg:#f9eeee;
        --dk-koha-ok:#3c763d;
      }

      * { box-sizing:border-box; }

      #dkhw-modal-root {
        position:fixed;
        inset:0;
        width:100vw;
        height:100vh;
        z-index:2147483647;
        pointer-events:none;
      }

      #dkhw-modal-root:not(:empty) {
        pointer-events:auto;
      }

      .dkhw-backdrop {
        position:fixed;
        inset:0;
        z-index:2147483647;
        display:grid;
        place-items:center;
        padding:18px;
        background:rgba(0,0,0,.42);
        pointer-events:auto;
        isolation:isolate;
      }

      .dkhw-modal {
        position:relative;
        z-index:2147483647;
        width:min(540px,calc(100vw - 28px));
        max-height:90vh;
        overflow:auto;
        border:1px solid #bfbfbf;
        border-radius:5px;
        background:#fff;
        color:#333;
        box-shadow:0 8px 24px rgba(0,0,0,.20);
        padding:0;
        pointer-events:auto;
      }

      .dkhw-modal-head {
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:12px;
        margin:0;
        padding:12px 14px;
        border-bottom:1px solid var(--dk-koha-line);
        background:var(--dk-koha-soft);
      }

      .dkhw-modal-head h3 {
        margin:0;
        color:#333;
        font-size:16px;
        line-height:1.25;
        font-weight:700;
      }

      .dkhw-modal-meta {
        margin-top:3px;
        color:var(--dk-koha-muted);
        font-size:11px;
      }

      .dkhw-close {
        appearance:none;
        width:28px;
        height:28px;
        flex:0 0 28px;
        border:1px solid #ccc;
        border-radius:4px;
        background:#fff;
        color:#555;
        cursor:pointer;
        font:700 17px/1 Arial,Helvetica,sans-serif;
      }

      .dkhw-close:hover,
      .dkhw-close:focus {
        background:#eee;
        border-color:#aaa;
        outline:none;
      }

      #dkhw-booking-form {
        padding:14px;
      }

      .dkhw-grid {
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:10px 12px;
      }

      .dkhw-span-2 { grid-column:span 2; }

      .dkhw-field label {
        display:block;
        margin-bottom:4px;
        color:#333;
        font-size:11px;
        font-weight:700;
      }

      .dkhw-input,
      .dkhw-select,
      .dkhw-textarea {
        width:100%;
        border:1px solid #bcbcbc;
        border-radius:4px;
        background:#fff;
        color:#333;
        padding:7px 8px;
        font:inherit;
        font-size:12px;
        line-height:1.35;
      }

      .dkhw-input:focus,
      .dkhw-select:focus,
      .dkhw-textarea:focus {
        border-color:#5b8f5b;
        box-shadow:0 0 0 2px rgba(0,97,0,.10);
        outline:none;
      }

      .dkhw-textarea {
        min-height:78px;
        resize:vertical;
      }

      .dkhw-theme-list {
        display:grid;
        gap:2px;
        max-height:145px;
        overflow:auto;
        padding:5px;
        border:1px solid #ccc;
        border-radius:4px;
        background:#fff;
      }

      .dkhw-theme-choice {
        display:flex !important;
        align-items:flex-start;
        gap:7px;
        margin:0 !important;
        padding:5px 6px;
        border-radius:3px;
        color:#333;
        cursor:pointer;
        font-size:12px;
        font-weight:400 !important;
      }

      .dkhw-theme-choice:hover {
        background:#f2f2f2;
      }

      .dkhw-theme-choice input {
        margin-top:2px;
      }

      .dkhw-note {
        margin-top:10px;
        padding:8px 9px;
        border:1px solid #ddd;
        border-radius:4px;
        background:#f8f8f8;
        color:#666;
        font-size:10px;
        line-height:1.35;
      }

      .dkhw-error {
        display:none;
        margin-top:10px;
        padding:8px 9px;
        border:1px solid #d9a8a8;
        border-radius:4px;
        background:var(--dk-koha-danger-bg);
        color:var(--dk-koha-danger);
        font-size:11px;
        font-weight:700;
      }

      .dkhw-actions {
        display:flex;
        justify-content:flex-end;
        gap:7px;
        margin-top:13px;
        flex-wrap:wrap;
      }

      .dkhw-btn {
        appearance:none;
        border:1px solid var(--dk-koha-green);
        border-radius:4px;
        background:var(--dk-koha-green);
        color:#fff;
        padding:6px 10px;
        font:inherit;
        font-size:11px;
        font-weight:700;
        cursor:pointer;
        white-space:nowrap;
        text-decoration:none;
      }

      .dkhw-btn:hover,
      .dkhw-btn:focus {
        background:var(--dk-koha-green-dark);
        border-color:var(--dk-koha-green-dark);
        color:#fff;
        outline:none;
        text-decoration:none;
      }

      .dkhw-btn:disabled {
        cursor:default;
        background:#eee;
        border-color:#ccc;
        color:#777;
      }

      .dkhw-btn-light {
        background:#fff;
        color:#333;
        border-color:#bbb;
      }

      .dkhw-btn-light:hover,
      .dkhw-btn-light:focus {
        background:#eee;
        border-color:#999;
        color:#222;
      }

      .dkhw-success {
        text-align:center;
        padding:18px 14px 16px;
        color:#333;
        font:12px/1.45 Arial,Helvetica,sans-serif;
      }

      .dkhw-success strong {
        display:block;
        color:var(--dk-koha-ok);
        font-size:15px;
        margin-bottom:5px;
      }

      @media (max-width:640px) {
        .dkhw-grid { grid-template-columns:1fr; }
        .dkhw-span-2 { grid-column:span 1; }
        .dkhw-backdrop { padding:10px; }
      }
    </style>


    <div id="dkhw-modal-root"></div>
    `;

    let modalContainer = modalRoot.querySelector("#dkhw-modal-root");

    function ensureModalContainer() {
      if (modalContainer?.isConnected) {
        return modalContainer;
      }

      modalContainer = modalRoot.querySelector("#dkhw-modal-root");

      if (!modalContainer) {
        modalContainer = document.createElement("div");
        modalContainer.id = "dkhw-modal-root";
        modalRoot.appendChild(modalContainer);
      }

      return modalContainer;
    }

    const state = {
      slots:[],
      themes:[],
      approvedBookings:[],
      polls:[],
      settings:{
        adminEmail:"",
        notificationName:"Rendez-vous réseau",
        emailjsServiceId:"",
        emailjsTemplateId:"",
        emailjsPublicKey:""
      },
      ready:{
        slots:false,
        themes:false,
        bookings:false,
        polls:false
      }
    };

    root.innerHTML = `

    <style>
      :host {
        display:block;
        width:100%;
        max-width:430px;
        margin:10px auto 24px;
        font-family:Arial,Helvetica,sans-serif;
        color:#24313a;
        --dk-koha-green:#2f7d5b;
        --dk-koha-green-dark:#256a4c;
        --dk-koha-line:#dce4e8;
        --dk-koha-line-light:#e8edef;
        --dk-koha-soft:#f4f7f8;
        --dk-koha-soft-2:#f8faf9;
        --dk-koha-muted:#71808b;
        --dk-koha-ok:#3c763d;
      }

      * { box-sizing:border-box; }

      .dkhw-shell {
        position:relative;
        border:1px solid var(--dk-koha-line);
        border-radius:8px;
        background:#fff;
        overflow:hidden;
        box-shadow:0 2px 8px rgba(20,40,50,.07);
      }

      .dkhw-head {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        padding:11px 12px 7px;
        border-bottom:0;
        background:#fff;
      }

      .dkhw-title {
        margin:0;
        color:#24313a;
        font-size:17px;
        line-height:1.2;
        font-weight:700;
      }

      .dkhw-sub {
        margin-top:2px;
        color:var(--dk-koha-muted);
        font-size:11px;
        line-height:1.3;
      }

      .dkhw-all {
        flex:0 0 auto;
        color:var(--dk-koha-green);
        text-decoration:none;
        font-size:11px;
        font-weight:700;
      }

      .dkhw-all:hover,
      .dkhw-all:focus {
        color:var(--dk-koha-green-dark);
        text-decoration:underline;
        outline:none;
      }

      .dkhw-list {
        display:grid;
        gap:7px;
        padding:4px 12px 11px;
        background:linear-gradient(180deg,#fff 0%,var(--dk-koha-soft) 100%);
      }

      .dkhw-slot {
        display:grid;
        grid-template-columns:minmax(105px,auto) minmax(0,1fr) auto;
        gap:10px;
        align-items:center;
        padding:9px 10px 8px;
        border:1px solid var(--dk-koha-line);
        border-radius:8px;
        background:#fff;
        transition:background .12s ease,border-color .12s ease;
      }

      .dkhw-slot:last-child {
        border-bottom:1px solid var(--dk-koha-line);
      }

      .dkhw-slot:hover {
        background:#fbfcfc;
        border-color:#ccd8dd;
      }

      .dkhw-date {
        font-size:10px;
        color:var(--dk-koha-muted);
        line-height:1.3;
      }

      .dkhw-date strong {
        display:block;
        color:#24313a;
        font-size:12px;
        font-weight:700;
      }

      .dkhw-info {
        min-width:0;
      }

      .dkhw-theme {
        color:#24313a;
        font-size:12px;
        font-weight:700;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .dkhw-meta {
        margin-top:2px;
        color:var(--dk-koha-muted);
        font-size:10px;
        line-height:1.3;
      }

      .dkhw-btn {
        appearance:none;
        border:1px solid var(--dk-koha-green);
        border-radius:6px;
        background:var(--dk-koha-green);
        color:#fff;
        padding:6px 9px;
        font:inherit;
        font-size:11px;
        font-weight:700;
        cursor:pointer;
        white-space:nowrap;
        box-shadow:none;
      }

      .dkhw-btn:hover,
      .dkhw-btn:focus {
        background:var(--dk-koha-green-dark);
        border-color:var(--dk-koha-green-dark);
        color:#fff;
        outline:none;
      }

      .dkhw-btn:disabled {
        cursor:default;
        background:#eee;
        border-color:#ccc;
        color:#777;
      }

      .dkhw-empty,
      .dkhw-loading {
        margin:0 12px 11px;
        padding:10px;
        border:1px solid var(--dk-koha-line);
        border-radius:8px;
        color:var(--dk-koha-muted);
        text-align:center;
        font-size:11px;
        background:#fff;
      }

      /* Les styles suivants restent ici aussi pour cohérence si le widget
         doit un jour rendre une modale dans son propre Shadow DOM. */

      .dkhw-backdrop {
        position:fixed;
        inset:0;
        z-index:2147483646;
        display:grid;
        place-items:center;
        padding:18px;
        background:rgba(0,0,0,.42);
      }

      .dkhw-modal {
        width:min(540px,100%);
        max-height:90vh;
        overflow:auto;
        border:1px solid #bfbfbf;
        border-radius:5px;
        background:#fff;
        box-shadow:0 8px 24px rgba(0,0,0,.20);
        padding:14px;
      }

      .dkhw-modal-head {
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:12px;
        margin-bottom:13px;
      }

      .dkhw-modal-head h3 {
        margin:0;
        color:#333;
        font-size:16px;
      }

      .dkhw-modal-meta {
        margin-top:3px;
        color:var(--dk-koha-muted);
        font-size:11px;
      }

      .dkhw-close {
        appearance:none;
        width:28px;
        height:28px;
        flex:0 0 28px;
        border:1px solid #ccc;
        border-radius:4px;
        background:#fff;
        color:#555;
        cursor:pointer;
        font-size:17px;
        font-weight:700;
      }

      .dkhw-grid {
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:10px;
      }

      .dkhw-span-2 { grid-column:span 2; }

      .dkhw-field label {
        display:block;
        margin-bottom:4px;
        color:#333;
        font-size:11px;
        font-weight:700;
      }

      .dkhw-input,
      .dkhw-select,
      .dkhw-textarea {
        width:100%;
        border:1px solid #bcbcbc;
        border-radius:4px;
        background:#fff;
        color:#333;
        padding:7px 8px;
        font:inherit;
        font-size:12px;
      }

      .dkhw-textarea {
        min-height:78px;
        resize:vertical;
      }

      .dkhw-theme-list {
        display:grid;
        gap:2px;
        max-height:145px;
        overflow:auto;
        padding:5px;
        border:1px solid #ccc;
        border-radius:4px;
        background:#fff;
      }

      .dkhw-theme-choice {
        display:flex !important;
        align-items:flex-start;
        gap:7px;
        margin:0 !important;
        padding:5px 6px;
        border-radius:3px;
        cursor:pointer;
        font-weight:400 !important;
      }

      .dkhw-theme-choice:hover {
        background:#f2f2f2;
      }

      .dkhw-theme-choice input {
        margin-top:2px;
      }

      .dkhw-note {
        margin-top:10px;
        padding:8px 9px;
        border:1px solid #ddd;
        border-radius:4px;
        background:#f8f8f8;
        color:var(--dk-koha-muted);
        font-size:10px;
        line-height:1.35;
      }

      .dkhw-error {
        display:none;
        margin-top:10px;
        padding:8px 9px;
        border:1px solid #d9a8a8;
        border-radius:4px;
        background:#f9eeee;
        color:#a94442;
        font-size:11px;
        font-weight:700;
      }

      .dkhw-actions {
        display:flex;
        justify-content:flex-end;
        gap:7px;
        margin-top:13px;
        flex-wrap:wrap;
      }

      .dkhw-btn-light {
        background:#fff;
        color:#333;
        border-color:#bbb;
      }

      .dkhw-btn-light:hover,
      .dkhw-btn-light:focus {
        background:#eee;
        border-color:#999;
        color:#222;
      }

      .dkhw-success {
        text-align:center;
        padding:12px 4px 2px;
      }

      .dkhw-success strong {
        display:block;
        color:var(--dk-koha-ok);
        font-size:15px;
        margin-bottom:5px;
      }

      .dkhw-polls {
        border-top:1px solid var(--dk-koha-line);
        padding:9px 12px 11px;
        background:linear-gradient(180deg,var(--dk-koha-soft-2) 0%,var(--dk-koha-soft) 100%);
      }

      .dkhw-polls-head {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin-bottom:7px;
      }

      .dkhw-polls-title-wrap {
        min-width:0;
      }

      .dkhw-polls-title {
        display:flex;
        align-items:center;
        gap:5px;
        margin:0;
        color:#333;
        font-size:11px;
        font-weight:700;
        line-height:1.2;
      }

      .dkhw-polls-sub {
        margin-top:2px;
        color:var(--dk-koha-muted);
        font-size:9px;
        line-height:1.25;
      }

      .dkhw-polls-count {
        flex:0 0 auto;
        min-width:21px;
        height:21px;
        display:grid;
        place-items:center;
        padding:0 5px;
        border:1px solid #c7c7c7;
        border-radius:10px;
        background:#fff;
        color:#555;
        font-size:10px;
        font-weight:700;
      }

      .dkhw-poll-buttons {
        display:grid;
        gap:5px;
      }

      .dkhw-poll-btn {
        display:flex !important;
        align-items:center !important;
        justify-content:space-between !important;
        gap:10px !important;
        width:100% !important;
        max-width:100% !important;
        min-width:0 !important;
        border:1px solid var(--dk-koha-line) !important;
        border-radius:8px !important;
        background:#fff !important;
        color:#24313a !important;
        padding:7px 8px !important;
        text-decoration:none !important;
        box-shadow:none !important;
        transition:background .12s ease,border-color .12s ease;
      }

      .dkhw-poll-btn:hover,
      .dkhw-poll-btn:focus {
        transform:none !important;
        background:#f5f5f5 !important;
        border-color:#bcbcbc !important;
        box-shadow:none !important;
        text-decoration:none !important;
        outline:none;
      }

      .dkhw-poll-main {
        min-width:0;
        display:flex;
        align-items:center;
        gap:7px;
      }

      .dkhw-poll-icon {
        flex:0 0 25px;
        width:25px;
        height:25px;
        display:grid;
        place-items:center;
        border:1px solid #d0d0d0;
        border-radius:4px;
        background:#f5f5f5;
        color:var(--dk-koha-green);
        font-size:12px;
        font-weight:700;
      }

      .dkhw-poll-copy {
        min-width:0;
      }

      .dkhw-poll-name {
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        color:#333;
        font-size:11px;
        font-weight:700;
        line-height:1.2;
      }

      .dkhw-poll-label {
        margin-top:1px;
        color:var(--dk-koha-muted);
        font-size:9px;
        line-height:1.2;
      }

      .dkhw-poll-arrow {
        flex:0 0 auto;
        color:var(--dk-koha-green);
        font-size:14px;
        font-weight:700;
      }

      @media (max-width:640px) {
        :host {
          max-width:none;
          margin:7px 5px 18px;
        }

        .dkhw-head {
          padding:10px 10px 6px;
        }

        .dkhw-list {
          padding:4px 10px 10px;
        }

        .dkhw-slot {
          grid-template-columns:1fr auto;
          gap:7px;
        }

        .dkhw-polls-head {
          align-items:flex-start;
        }

        .dkhw-poll-btn {
          padding:7px !important;
        }

        .dkhw-date {
          grid-column:1;
        }

        .dkhw-info {
          grid-column:1;
        }

        .dkhw-slot > .dkhw-btn {
          grid-column:2;
          grid-row:1 / span 2;
          align-self:center;
        }

        .dkhw-grid {
          grid-template-columns:1fr;
        }

        .dkhw-span-2 {
          grid-column:span 1;
        }

        .dkhw-head {
          align-items:flex-start;
        }
      }
    </style>


    <div class="dkhw-shell">
      <div class="dkhw-head">
        <div>
          <h2 class="dkhw-title">Prochains créneaux disponibles</h2>
          <div class="dkhw-sub">Rendez-vous réseau · réservation en quelques clics</div>
        </div>

        <a
          class="dkhw-all"
          href="${MAIN_PAGE}#dk=slots"
        >
          Voir tous →
        </a>
      </div>

      <div id="dkhw-content" class="dkhw-loading">
        Chargement des créneaux…
      </div>

      <div id="dkhw-polls"></div>
    </div>

    <div id="dkhw-modal-root"></div>
    `;

    const $ = (selector, context = root) => context.querySelector(selector);
    const $$ = (selector, context = root) => [...context.querySelectorAll(selector)];

    const $modal = selector => modalRoot.querySelector(selector);
    const $$modal = selector => [...modalRoot.querySelectorAll(selector)];

    const esc = (value = "") =>
      String(value).replace(/[&<>"']/g, char => ({
        "&":"&amp;",
        "<":"&lt;",
        ">":"&gt;",
        '"':"&quot;",
        "'":"&#039;"
      })[char]);

    function toDate(value) {
      if (!value) return null;
      if (value instanceof Date) return value;
      if (typeof value?.toDate === "function") return value.toDate();

      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    function fmtDate(date) {
      return new Intl.DateTimeFormat("fr-FR", {
        weekday:"short",
        day:"2-digit",
        month:"short"
      }).format(date);
    }

    function fmtTime(date) {
      return new Intl.DateTimeFormat("fr-FR", {
        hour:"2-digit",
        minute:"2-digit"
      }).format(date);
    }

    function getClientKey() {
      let key = localStorage.getItem(LOCAL_CLIENT_KEY);

      if (!key) {
        key = crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;

        localStorage.setItem(LOCAL_CLIENT_KEY, key);
      }

      return key;
    }

    function getLocalBookingIds() {
      try {
        return JSON.parse(localStorage.getItem(LOCAL_BOOKINGS_KEY) || "[]");
      } catch (_) {
        return [];
      }
    }

    function rememberBookingId(id) {
      const ids = new Set(getLocalBookingIds());
      ids.add(id);
      localStorage.setItem(LOCAL_BOOKINGS_KEY, JSON.stringify([...ids]));
    }

    function localBookingIdForSlot(slotId) {
      return `${slotId}_${getClientKey()}`;
    }

    function localHasBookingForSlot(slotId) {
      return getLocalBookingIds().includes(localBookingIdForSlot(slotId));
    }

    function getSavedVisitor() {
      try {
        return JSON.parse(localStorage.getItem(LOCAL_VISITOR_KEY) || "{}");
      } catch (_) {
        return {};
      }
    }

    function saveVisitor(visitor) {
      localStorage.setItem(LOCAL_VISITOR_KEY, JSON.stringify(visitor));
    }

    function themeById(id) {
      return state.themes.find(theme => theme.id === id) || null;
    }

    function approvedBookingsForSlot(slotId) {
      return state.approvedBookings.filter(booking => booking.slotId === slotId);
    }

    function freePlaces(slot) {
      const capacity = Math.max(1, Number(slot.capacity || 1));
      return Math.max(0, capacity - approvedBookingsForSlot(slot.id).length);
    }

    function nextAvailableSlots() {
      const now = Date.now();

      return state.slots
        .filter(slot => {
          const start = toDate(slot.startAt);

          return (
            slot.active !== false &&
            start &&
            start.getTime() > now &&
            freePlaces(slot) > 0
          );
        })
        .sort((a,b) =>
          toDate(a.startAt).getTime() - toDate(b.startAt).getTime()
        )
        .slice(0, MAX_SLOTS);
    }

    function pollEffectiveState(poll) {
      const manual = poll.manualState || "auto";

      if (manual === "open") return "open";
      if (manual === "closed") return "closed";

      const now = Date.now();
      const opens = toDate(poll.openAt)?.getTime() || null;
      const closes = toDate(poll.closeAt)?.getTime() || null;

      if (opens && now < opens) return "scheduled";
      if (closes && now > closes) return "closed";

      return "open";
    }

    function openPolls() {
      return state.polls
        .filter(poll =>
          poll.deleted !== true &&
          poll.active !== false &&
          pollEffectiveState(poll) === "open"
        )
        .sort((a,b) =>
          (toDate(b.createdAt)?.getTime() || 0) -
          (toDate(a.createdAt)?.getTime() || 0)
        );
    }

    function renderPollButtons() {
      const target = $("#dkhw-polls");
      if (!target) return;

      if (!state.ready.polls) {
        target.innerHTML = "";
        return;
      }

      const polls = openPolls();

      if (!polls.length) {
        target.innerHTML = "";
        return;
      }

      target.innerHTML = `
        <div class="dkhw-polls">
          <div class="dkhw-polls-head">
            <div class="dkhw-polls-title-wrap">
              <div class="dkhw-polls-title">
                <span>🗳️</span>
                <span>Sondage${polls.length > 1 ? "s" : ""} en cours</span>
              </div>

              <div class="dkhw-polls-sub">
                Donnez votre avis en quelques clics.
              </div>
            </div>

            <div class="dkhw-polls-count">
              ${polls.length}
            </div>
          </div>

          <div class="dkhw-poll-buttons">
            ${polls.map(poll => `
              <a
                class="dkhw-poll-btn"
                href="${MAIN_PAGE}#dk=poll&id=${encodeURIComponent(poll.id)}&action=answer"
                title="Répondre à : ${esc(poll.title || "Sondage")}"
              >
                <div class="dkhw-poll-main">
                  <div class="dkhw-poll-icon">?</div>

                  <div class="dkhw-poll-copy">
                    <div class="dkhw-poll-name">
                      ${esc(poll.title || "Répondre au sondage")}
                    </div>

                    <div class="dkhw-poll-label">
                      Répondre maintenant
                    </div>
                  </div>
                </div>

                <div class="dkhw-poll-arrow">→</div>
              </a>
            `).join("")}
          </div>
        </div>
      `;
    }

    function allDataReady() {
      return state.ready.slots && state.ready.themes && state.ready.bookings;
    }

    function render() {
      const content = $("#dkhw-content");
      renderPollButtons();

      if (!allDataReady()) {
        content.className = "dkhw-loading";
        content.innerHTML = "Chargement des créneaux…";
        return;
      }

      const slots = nextAvailableSlots();

      if (!slots.length) {
        content.className = "dkhw-empty";
        content.innerHTML = `
          Aucun créneau disponible pour le moment.
          <div style="margin-top:6px">
            <a class="dkhw-all" href="${MAIN_PAGE}#dk=slots">Consulter le planning</a>
          </div>
        `;
        return;
      }

      content.className = "dkhw-list";
      content.innerHTML = slots.map(slot => {
        const start = toDate(slot.startAt);
        const end = toDate(slot.endAt);
        const theme = slot.themeId ? themeById(slot.themeId) : null;
        const mine = localHasBookingForSlot(slot.id);
        const places = freePlaces(slot);

        return `
          <div class="dkhw-slot">
            <div class="dkhw-date">
              <strong>${esc(fmtDate(start))}</strong>
              ${esc(fmtTime(start))} → ${esc(fmtTime(end))}
            </div>

            <div class="dkhw-info">
              <div class="dkhw-theme">
                ${esc(slot.themeId ? (theme?.name || "Thème") : "Sujet au choix")}
              </div>

              <div class="dkhw-meta">
                ${slot.location ? `${esc(slot.location)} · ` : ""}
                ${places} place${places > 1 ? "s" : ""} disponible${places > 1 ? "s" : ""}
              </div>
            </div>

            <button
              class="dkhw-btn"
              type="button"
              data-book-slot="${slot.id}"
              ${mine ? "disabled" : ""}
            >
              ${mine ? "Demande envoyée" : "Réserver"}
            </button>
          </div>
        `;
      }).join("");

      $$("[data-book-slot]").forEach(button => {
        button.addEventListener("click", () => {
          if (button.disabled) return;

          try {
            openBookingModal(button.dataset.bookSlot);
          } catch (error) {
            console.error("Widget Doodle Koha — ouverture réservation :", error);
            alert(
              `Impossible d'ouvrir le formulaire de réservation : ${error?.message || "erreur inconnue"}`
            );
          }
        });
      });
    }

    function closeModal() {
      const container = ensureModalContainer();
      container.innerHTML = "";
      document.documentElement.style.overflow = "";
    }

    function showError(message) {
      const box = $modal("#dkhw-error");

      if (box) {
        box.textContent = message;
        box.style.display = "block";
      }
    }

    function openBookingModal(slotId) {
      const container = ensureModalContainer();

      const slot = state.slots.find(item => item.id === slotId);

      if (!slot) {
        throw new Error("Créneau introuvable.");
      }

      if (freePlaces(slot) <= 0) {
        alert("Ce créneau vient d'être complété.");
        render();
        return;
      }

      if (localHasBookingForSlot(slotId)) {
        alert("Vous avez déjà envoyé une demande pour ce créneau.");
        return;
      }

      const start = toDate(slot.startAt);
      const end = toDate(slot.endAt);
      const fixedTheme = slot.themeId ? themeById(slot.themeId) : null;
      const saved = getSavedVisitor();

      document.documentElement.style.overflow = "hidden";

      container.innerHTML = `
        <div class="dkhw-backdrop">
          <div class="dkhw-modal">
            <div class="dkhw-modal-head">
              <div>
                <h3>Réserver ce créneau</h3>
                <div class="dkhw-modal-meta">
                  ${esc(fmtDate(start))} · ${esc(fmtTime(start))} → ${esc(fmtTime(end))}
                  ${slot.location ? ` · ${esc(slot.location)}` : ""}
                </div>
              </div>

              <button class="dkhw-close" type="button" data-close>×</button>
            </div>

            <form id="dkhw-booking-form">
              <div class="dkhw-grid">
                <div class="dkhw-field">
                  <label>Prénom</label>
                  <input
                    class="dkhw-input"
                    name="firstName"
                    required
                    value="${esc(saved.firstName || "")}"
                  >
                </div>

                <div class="dkhw-field">
                  <label>Nom</label>
                  <input
                    class="dkhw-input"
                    name="lastName"
                    required
                    value="${esc(saved.lastName || "")}"
                  >
                </div>

                <div class="dkhw-field dkhw-span-2">
                  <label>Email</label>
                  <input
                    class="dkhw-input"
                    type="email"
                    name="email"
                    required
                    value="${esc(saved.email || "")}"
                    placeholder="contact@example.org"
                  >
                </div>

                <div class="dkhw-field dkhw-span-2">
                  <label>Thème${fixedTheme ? "" : "s"}</label>

                  ${fixedTheme ? `
                    <input
                      class="dkhw-input"
                      value="${esc(fixedTheme.name)}"
                      disabled
                    >
                    <input
                      type="hidden"
                      name="themeIds"
                      value="${fixedTheme.id}"
                    >
                  ` : `
                    <div class="dkhw-theme-list">
                      ${state.themes.length ? state.themes.map(theme => `
                        <label class="dkhw-theme-choice">
                          <input
                            type="checkbox"
                            name="themeIds"
                            value="${theme.id}"
                          >
                          <span>${esc(theme.name)}</span>
                        </label>
                      `).join("") : `
                        <div class="dkhw-meta">Aucun thème disponible.</div>
                      `}
                    </div>
                  `}
                </div>

                <div class="dkhw-field dkhw-span-2">
                  <label>Précisez votre besoin</label>
                  <textarea
                    class="dkhw-textarea"
                    name="message"
                    maxlength="1000"
                    placeholder="Facultatif : sujet, question ou besoin particulier…"
                  ></textarea>
                </div>
              </div>

              <div class="dkhw-note">
                La demande sera envoyée à l'administrateur pour validation.
              </div>

              <div id="dkhw-error" class="dkhw-error"></div>

              <div class="dkhw-actions">
                <button
                  class="dkhw-btn dkhw-btn-light"
                  type="button"
                  data-close
                >
                  Annuler
                </button>

                <button
                  class="dkhw-btn"
                  type="submit"
                >
                  Envoyer la demande
                </button>
              </div>
            </form>
          </div>
        </div>
      `;

      const backdrop = $modal(".dkhw-backdrop");
      const bookingForm = $modal("#dkhw-booking-form");

      if (!backdrop || !bookingForm) {
        throw new Error("Le formulaire de réservation n'a pas pu être initialisé.");
      }

      $$modal("[data-close]").forEach(button => {
        button.addEventListener("click", closeModal);
      });

      backdrop.addEventListener("click", event => {
        if (event.target === event.currentTarget) closeModal();
      });

      bookingForm.addEventListener("submit", async event => {
        event.preventDefault();

        const formEl = event.currentTarget;
        const submit = formEl.querySelector('[type="submit"]');
        const form = new FormData(formEl);

        const firstName = String(form.get("firstName") || "").trim();
        const lastName = String(form.get("lastName") || "").trim();
        const email = String(form.get("email") || "").trim().toLowerCase();
        const themeIds = form.getAll("themeIds").map(String).filter(Boolean);
        const message = String(form.get("message") || "").trim();

        if (!firstName || !lastName || !email) {
          showError("Prénom, nom et email sont obligatoires.");
          return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          showError("L'adresse email n'est pas valide.");
          return;
        }

        if (!themeIds.length) {
          showError("Sélectionnez au moins un thème.");
          return;
        }

        submit.disabled = true;
        submit.textContent = "Envoi…";

        try {
          const bookingId = localBookingIdForSlot(slotId);
          const bookingRef = doc(db, "bookings", bookingId);
          const slotRef = doc(db, "slots", slotId);

          await runTransaction(db, async transaction => {
            const slotSnap = await transaction.get(slotRef);
            const bookingSnap = await transaction.get(bookingRef);

            if (!slotSnap.exists()) {
              throw new Error("Ce créneau n'existe plus.");
            }

            const currentSlot = {
              id:slotId,
              ...slotSnap.data()
            };

            if (currentSlot.active === false) {
              throw new Error("Ce créneau est fermé.");
            }

            const approvedCount = state.approvedBookings.filter(
              booking => booking.slotId === slotId
            ).length;

            if (approvedCount >= Number(currentSlot.capacity || 1)) {
              throw new Error("Ce créneau vient d'être complété.");
            }

            if (
              bookingSnap.exists() &&
              ["pending","approved"].includes(bookingSnap.data()?.status)
            ) {
              throw new Error("Une demande active existe déjà pour ce créneau.");
            }

            transaction.set(bookingRef, {
              slotId,
              firstName,
              lastName,
              userName:`${firstName} ${lastName}`.trim(),
              branch:"",
              email,
              themeIds,
              themeId:themeIds[0] || "",
              message,
              status:"pending",
              source:"home-widget",
              createdAt:serverTimestamp(),
              updatedAt:serverTimestamp()
            });
          });

          rememberBookingId(bookingId);
          saveVisitor({ ...getSavedVisitor(), firstName, lastName, email });

          notifyAdminQuietly({
            slot,
            firstName,
            lastName,
            email,
            themeIds,
            message
          });

          const modal = $modal(".dkhw-modal");

          if (modal) {
            modal.innerHTML = `
              <div class="dkhw-success">
                <strong>Demande envoyée</strong>
                Votre réservation est maintenant en attente de validation.

                <div class="dkhw-actions" style="justify-content:center">
                  <button class="dkhw-btn dkhw-btn-light" type="button" data-close>
                    Fermer
                  </button>

                  <a
                    class="dkhw-btn"
                    style="text-decoration:none"
                    href="${MAIN_PAGE}#dk=slot&id=${encodeURIComponent(slotId)}"
                  >
                    Voir le créneau
                  </a>
                </div>
              </div>
            `;

            modal.querySelector("[data-close]")?.addEventListener("click", closeModal);
          }

          render();
        } catch (error) {
          console.error("Widget Doodle Koha — réservation :", error);
          showError(error?.message || "La demande n'a pas pu être enregistrée.");
          submit.disabled = false;
          submit.textContent = "Envoyer la demande";
        }
      });
    }

    async function notifyAdminQuietly({
      slot,
      firstName,
      lastName,
      email,
      themeIds,
      message
    }) {
      try {
        const cfg = state.settings;

        if (
          !window.emailjs ||
          !cfg.adminEmail ||
          !cfg.emailjsServiceId ||
          !cfg.emailjsTemplateId ||
          !cfg.emailjsPublicKey
        ) {
          return;
        }

        const themeNames = themeIds
          .map(id => themeById(id)?.name)
          .filter(Boolean)
          .join(", ");

        const start = toDate(slot.startAt);
        const end = toDate(slot.endAt);

        await window.emailjs.send(
          cfg.emailjsServiceId,
          cfg.emailjsTemplateId,
          {
            to_email:cfg.adminEmail,
            subject:`[${cfg.notificationName || "Rendez-vous réseau"}] Nouvelle demande — ${firstName} ${lastName}`,
            message:[
              "Nouvelle demande de rendez-vous",
              "",
              `Collègue : ${firstName} ${lastName}`,
              `Email : ${email}`,
              `Créneau : ${fmtDate(start)} · ${fmtTime(start)} → ${fmtTime(end)}`,
              `Thème(s) : ${themeNames || "Sujet au choix"}`,
              `Besoin : ${message || "—"}`,
              "",
              "La demande est en attente de validation dans l'administration."
            ].join("\n"),
            from_name:cfg.notificationName || "Rendez-vous réseau",
            reply_to:email
          },
          {
            publicKey:cfg.emailjsPublicKey,
            blockHeadless:true
          }
        );
      } catch (error) {
        // La réservation Firestore reste valide même si le mail échoue.
        console.warn("Widget Doodle Koha — notification EmailJS non envoyée :", error);
      }
    }

    // -----------------------------------------------------------------------------
    // DONNÉES LIVE
    // -----------------------------------------------------------------------------

    onSnapshot(
      collection(db, "slots"),
      snapshot => {
        state.slots = snapshot.docs.map(item => ({
          id:item.id,
          ...item.data()
        }));
        state.ready.slots = true;
        render();
      },
      error => {
        console.error("Widget Doodle Koha — slots :", error);
        $("#dkhw-content").className = "dkhw-empty";
        $("#dkhw-content").textContent = "Impossible de charger les créneaux.";
      }
    );

    onSnapshot(
      collection(db, "themes"),
      snapshot => {
        state.themes = snapshot.docs
          .map(item => ({ id:item.id, ...item.data() }))
          .filter(theme => theme.active !== false)
          .sort((a,b) =>
            (a.order ?? 999) - (b.order ?? 999) ||
            String(a.name || "").localeCompare(String(b.name || ""), "fr")
          );

        state.ready.themes = true;
        render();
      },
      error => {
        console.error("Widget Doodle Koha — themes :", error);
        state.ready.themes = true;
        render();
      }
    );

    onSnapshot(
      query(
        collection(db, "bookings"),
        where("status", "==", "approved")
      ),
      snapshot => {
        state.approvedBookings = snapshot.docs.map(item => ({
          id:item.id,
          ...item.data()
        }));

        state.ready.bookings = true;
        render();
      },
      error => {
        console.error("Widget Doodle Koha — approved bookings :", error);
        state.ready.bookings = true;
        render();
      }
    );

    onSnapshot(
      collection(db, "polls"),
      snapshot => {
        state.polls = snapshot.docs.map(item => ({
          id:item.id,
          ...item.data()
        }));

        state.ready.polls = true;
        renderPollButtons();
      },
      error => {
        console.error("Widget Doodle Koha — polls :", error);
        state.ready.polls = true;
        renderPollButtons();
      }
    );

    onSnapshot(
      doc(db, "settings", "notifications"),
      snapshot => {
        if (snapshot.exists()) {
          const data = snapshot.data() || {};

          state.settings = {
            adminEmail:String(data.adminEmail || ""),
            notificationName:String(data.notificationName || "Rendez-vous réseau"),
            emailjsServiceId:String(data.emailjsServiceId || ""),
            emailjsTemplateId:String(data.emailjsTemplateId || ""),
            emailjsPublicKey:String(data.emailjsPublicKey || "")
          };
        }
      },
      error => {
        console.warn("Widget Doodle Koha — settings :", error);
      }
    );

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && ensureModalContainer().innerHTML) {
        closeModal();
      }
    });

    render();
}

window.PMKHomeWidgets?.register({
    id: WIDGET_ID,
    name: 'Prochains créneaux / Doodle Koha',
    target: 'announcements-column',
    mount
});

/* ============================================================
   PimpMyKoha 137 — Widgets & blocs d’accueil
   Généré le 22/09/2026
   Sous-widget autonome.
   IMPORTANT : conserver ce fichier séparé pour la maintenance.
   ============================================================ */
import {
    initializeApp,
    getApps
  } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";

import {
    getFirestore,
    doc,
    getDoc,
    setDoc
  } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const WIDGET_ID = 'frequency-nedap';
const STYLE_ID = 'pmk137-style-frequency-nedap';
const STYLE_TEXT = `  #nf-app {
    --nf-accent: #2f7d5b;
    --nf-accent-soft: #eef8f3;
    --nf-present-accent: #2f73b7;
    --nf-present-soft: #eef6fd;
    --nf-text: #24313a;
    --nf-muted: #71808b;
    --nf-border: #dce4e8;
    --nf-surface: #ffffff;
    --nf-bg: #f4f7f8;
    --nf-danger: #b42318;
    --nf-danger-bg: #fff2f0;

    max-width: 460px;
    margin: 18px auto;
    font-family: Arial, Helvetica, sans-serif;
    color: var(--nf-text);
  }

  #nf-app * {
    box-sizing: border-box;
  }

  #nf-app .nf-card {
    position: relative;
    background: var(--nf-surface);
    border: 1px solid var(--nf-border);
    border-radius: 12px;
    box-shadow: 0 3px 14px rgba(20, 40, 50, .08);
    overflow: hidden;
  }

  #nf-app .nf-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 16px 10px;
  }

  #nf-app .nf-title-wrap {
    min-width: 0;
  }

  #nf-app .nf-title {
    margin: 0;
    font-size: 19px;
    line-height: 1.2;
    color: var(--nf-text);
  }

  #nf-app .nf-subtitle {
    margin-top: 4px;
    color: var(--nf-muted);
    font-size: 12px;
  }

  #nf-app .nf-admin-trigger {
    flex: 0 0 auto;
    appearance: none;
    border: 1px solid transparent;
    background: transparent;
    color: #98a3aa;
    border-radius: 6px;
    padding: 3px 5px;
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
    opacity: .42;
    transition: opacity .15s ease, color .15s ease, background .15s ease, border-color .15s ease;
  }

  #nf-app .nf-admin-trigger:hover,
  #nf-app .nf-admin-trigger:focus,
  #nf-app .nf-admin-trigger.nf-active {
    opacity: 1;
    color: var(--nf-accent);
    background: #f7faf8;
    border-color: #dce5df;
    outline: none;
  }

  #nf-app .nf-body {
    padding: 6px 16px 16px;
    background: linear-gradient(180deg, #fff 0%, var(--nf-bg) 100%);
  }

  #nf-app .nf-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  #nf-app .nf-stat {
    background: #fff;
    border: 1px solid var(--nf-border);
    border-radius: 10px;
    padding: 13px 14px;
    min-height: 88px;
  }

  #nf-app .nf-stat.nf-present {
    grid-column: 1 / -1;
    background: var(--nf-present-soft);
    border-color: color-mix(in srgb, var(--nf-present-accent) 35%, #fff);
  }

  #nf-app .nf-label {
    display: block;
    margin-bottom: 7px;
    color: var(--nf-muted);
    font-size: 12px;
  }

  #nf-app .nf-value {
    display: block;
    color: var(--nf-text);
    font-size: 26px;
    line-height: 1;
    font-weight: 700;
    letter-spacing: -.02em;
  }

  #nf-app .nf-present .nf-value {
    color: var(--nf-present-accent);
  }

  #nf-app .nf-yesterday {
    display: block;
    margin-top: 6px;
    color: var(--nf-muted);
    font-size: 11px;
  }

  #nf-app .nf-estimate {
    color: var(--nf-muted);
    font-size: 10px;
    font-weight: 400;
  }

  #nf-app .nf-status {
    margin-top: 12px;
    padding: 9px 10px;
    border-radius: 8px;
    background: rgba(255,255,255,.68);
    border: 1px solid var(--nf-border);
    color: var(--nf-muted);
    font-size: 11px;
    line-height: 1.45;
    text-align: center;
  }

  #nf-app .nf-actions {
    margin-top: 10px;
    display: flex;
    gap: 8px;
  }

  #nf-app .nf-refresh {
    width: 100%;
    appearance: none;
    border: 0;
    border-radius: 8px;
    background: var(--nf-accent);
    color: white;
    padding: 9px 12px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity .15s ease, transform .05s ease;
  }

  #nf-app .nf-refresh:hover {
    opacity: .92;
  }

  #nf-app .nf-refresh:active {
    transform: translateY(1px);
  }

  #nf-app .nf-refresh:disabled {
    opacity: .5;
    cursor: wait;
  }

  #nf-app .nf-error {
    display: none;
    margin-top: 10px;
    padding: 9px 10px;
    color: var(--nf-danger);
    background: var(--nf-danger-bg);
    border: 1px solid #ffd5cf;
    border-radius: 8px;
    font-size: 11px;
    line-height: 1.4;
  }

  /* ---------- verrou local ---------- */

  #nf-app .nf-lock {
    display: none;
    position: absolute;
    top: 47px;
    right: 12px;
    z-index: 50;
    width: min(260px, calc(100% - 24px));
    padding: 12px;
    background: #fff;
    border: 1px solid var(--nf-border);
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(20,40,50,.16);
  }

  #nf-app .nf-lock.nf-open {
    display: block;
  }

  #nf-app .nf-lock-title {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 700;
  }

  #nf-app .nf-lock-row {
    display: flex;
    gap: 6px;
  }

  #nf-app .nf-lock input {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--nf-border);
    border-radius: 6px;
    padding: 7px 8px;
    font-size: 12px;
  }

  #nf-app .nf-mini-btn {
    appearance: none;
    border: 1px solid var(--nf-border);
    background: #fff;
    color: var(--nf-text);
    border-radius: 6px;
    padding: 6px 9px;
    font-size: 11px;
    cursor: pointer;
  }

  #nf-app .nf-mini-btn.nf-primary {
    background: var(--nf-accent);
    color: #fff;
    border-color: var(--nf-accent);
  }

  #nf-app .nf-lock-error {
    min-height: 15px;
    margin-top: 6px;
    color: var(--nf-danger);
    font-size: 10px;
  }

  /* ---------- administration ---------- */

  #nf-app .nf-admin {
    display: none;
    margin-top: 12px;
    background: #fff;
    border: 1px solid var(--nf-border);
    border-radius: 12px;
    box-shadow: 0 3px 14px rgba(20,40,50,.08);
    overflow: hidden;
  }

  #nf-app .nf-admin.nf-open {
    display: block;
  }

  #nf-app .nf-admin-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 13px 14px;
    background: #f8faf9;
    border-bottom: 1px solid var(--nf-border);
  }

  #nf-app .nf-admin-head strong {
    font-size: 14px;
  }

  #nf-app .nf-admin-body {
    padding: 14px;
  }

  #nf-app .nf-section-title {
    margin: 14px 0 8px;
    font-size: 12px;
    color: var(--nf-accent);
    text-transform: uppercase;
    letter-spacing: .04em;
  }

  #nf-app .nf-section-title:first-child {
    margin-top: 0;
  }

  #nf-app .nf-form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 9px 10px;
  }

  #nf-app .nf-field {
    min-width: 0;
  }

  #nf-app .nf-field.nf-full {
    grid-column: 1 / -1;
  }

  #nf-app .nf-field label {
    display: block;
    margin-bottom: 4px;
    color: var(--nf-muted);
    font-size: 10px;
    font-weight: 700;
  }

  #nf-app .nf-field input,
  #nf-app .nf-field select {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--nf-border);
    border-radius: 6px;
    background: #fff;
    color: var(--nf-text);
    padding: 7px 8px;
    font-size: 12px;
  }

  #nf-app .nf-check {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 30px;
    font-size: 11px;
    color: var(--nf-text);
  }

  #nf-app .nf-check input {
    width: auto;
  }

  #nf-app .nf-admin-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 14px;
  }

  #nf-app .nf-admin-message {
    min-height: 18px;
    margin-top: 8px;
    font-size: 11px;
    color: var(--nf-muted);
  }

  #nf-app .nf-source-badge {
    margin-top: 7px;
    font-size: 10px;
    color: var(--nf-muted);
  }

  @media (max-width: 520px) {
    #nf-app {
      margin: 10px 8px;
    }

    #nf-app .nf-head {
      padding: 14px 13px 9px;
    }

    #nf-app .nf-body {
      padding: 5px 13px 13px;
    }

    #nf-app .nf-stats,
    #nf-app .nf-form-grid {
      grid-template-columns: 1fr;
    }

    #nf-app .nf-stat.nf-present,
    #nf-app .nf-field.nf-full {
      grid-column: auto;
    }
  }


  /* =========================================================
     AFFICHAGE COMPACT + VALEURS CENTRÉES — v1.0.1
     ========================================================= */

  #nf-app {
    max-width: 430px;
    margin: 10px auto;
  }

  #nf-app .nf-card {
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(20, 40, 50, .07);
  }

  #nf-app .nf-head {
    padding: 11px 12px 7px;
    gap: 8px;
  }

  #nf-app .nf-title {
    font-size: 17px;
  }

  #nf-app .nf-subtitle {
    margin-top: 2px;
    font-size: 11px;
  }

  #nf-app .nf-admin-trigger {
    padding: 2px 4px;
    font-size: 12px;
  }

  #nf-app .nf-body {
    padding: 4px 12px 11px;
  }

  #nf-app .nf-stats {
    gap: 7px;
  }

  #nf-app .nf-stat {
    min-height: 70px;
    padding: 9px 10px 8px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  #nf-app .nf-label {
    margin-bottom: 4px;
    font-size: 11px;
    text-align: center;
  }

  #nf-app .nf-value {
    width: 100%;
    font-size: 24px;
    line-height: 1;
    text-align: center;
  }

  #nf-app .nf-yesterday {
    width: 100%;
    margin-top: 4px;
    font-size: 10px;
    text-align: center;
  }

  #nf-app .nf-present {
    min-height: 66px;
  }

  #nf-app .nf-present .nf-label {
    margin-bottom: 4px;
  }

  #nf-app .nf-estimate {
    font-size: 9px;
  }

  #nf-app .nf-status {
    margin-top: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    font-size: 10px;
    line-height: 1.35;
  }

  #nf-app .nf-actions {
    margin-top: 7px;
  }

  #nf-app .nf-refresh {
    width: auto;
    min-width: 160px;
    margin: 0 auto;
    padding: 7px 11px;
    border-radius: 6px;
    font-size: 12px;
  }

  #nf-app .nf-error {
    margin-top: 7px;
    padding: 7px 8px;
    border-radius: 6px;
    font-size: 10px;
  }

  #nf-app .nf-source-badge {
    margin-top: 5px;
    text-align: center;
    font-size: 9px;
  }

  /* Administration légèrement resserrée également */
  #nf-app .nf-admin {
    margin-top: 8px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(20,40,50,.07);
  }

  #nf-app .nf-admin-head {
    padding: 10px 11px;
  }

  #nf-app .nf-admin-body {
    padding: 11px;
  }

  #nf-app .nf-section-title {
    margin: 10px 0 6px;
    font-size: 11px;
  }

  #nf-app .nf-form-grid {
    gap: 7px 8px;
  }

  #nf-app .nf-field label {
    margin-bottom: 3px;
  }

  #nf-app .nf-field input,
  #nf-app .nf-field select {
    padding: 6px 7px;
    font-size: 11px;
  }

  #nf-app .nf-admin-actions {
    margin-top: 10px;
    gap: 6px;
  }

  @media (max-width: 520px) {
    #nf-app {
      max-width: none;
      margin: 7px 5px;
    }

    #nf-app .nf-head {
      padding: 10px 10px 6px;
    }

    #nf-app .nf-body {
      padding: 4px 10px 10px;
    }

    #nf-app .nf-stats {
      grid-template-columns: 1fr 1fr;
    }

    #nf-app .nf-stat.nf-present {
      grid-column: 1 / -1;
    }

    #nf-app .nf-refresh {
      min-width: 145px;
    }
  }`;
const HTML_TEXT = `<div id="nf-app">
<div class="nf-card">
<div class="nf-head">
<div class="nf-title-wrap">
<h2 class="nf-title" id="nf-title">Fr&eacute;quentation</h2>
<div class="nf-subtitle" id="nf-subtitle">Compteur d&rsquo;entr&eacute;es / sorties</div>
</div>
<button type="button" id="nf-admin-trigger" class="nf-admin-trigger" title="Param&egrave;tres" aria-label="Param&egrave;tres">⚙</button></div>
<div id="nf-lock" class="nf-lock" aria-hidden="true">
<div class="nf-lock-title">Administration</div>
<form id="nf-lock-form">
<div class="nf-lock-row"><input type="password" id="nf-lock-password" autocomplete="current-password" placeholder="Mot de passe" /> <button type="submit" class="nf-mini-btn nf-primary">Ouvrir</button> <button type="button" id="nf-lock-cancel" class="nf-mini-btn">&times;</button></div>
<div id="nf-lock-error" class="nf-lock-error"></div>
</form></div>
<div class="nf-body">
<div class="nf-stats">
<div class="nf-stat"><span class="nf-label" id="nf-label-in">Entr&eacute;es</span> <span class="nf-value" id="nf-entrees">0</span> <span class="nf-yesterday" id="nf-entrees-yesterday">(Hier : 0)</span></div>
<div class="nf-stat"><span class="nf-label" id="nf-label-out">Sorties</span> <span class="nf-value" id="nf-sorties">0</span> <span class="nf-yesterday" id="nf-sorties-yesterday">(Hier : 0)</span></div>
<div class="nf-stat nf-present" id="nf-present-card"><span class="nf-label"> <span id="nf-label-present">Personnes pr&eacute;sentes</span> <span class="nf-estimate" id="nf-label-estimate"> &middot; estimation</span> </span> <span class="nf-value" id="nf-present">0</span></div>
</div>
<div class="nf-status" id="nf-last-update">Aucune donn&eacute;e historique disponible</div>
<div class="nf-error" id="nf-error-message"></div>
<div class="nf-actions" id="nf-refresh-wrap"><button class="nf-refresh" id="nf-refresh-button" type="button"> Actualiser les donn&eacute;es </button></div>
<div class="nf-source-badge" id="nf-source-badge"></div>
</div>
</div>
<section id="nf-admin" class="nf-admin" aria-hidden="true">
<div class="nf-admin-head"><strong>Param&egrave;tres de fr&eacute;quentation</strong> <button type="button" id="nf-admin-close" class="nf-mini-btn">Fermer</button></div>
<div class="nf-admin-body">
<div class="nf-section-title">Connexion au compteur</div>
<div class="nf-form-grid">
<div class="nf-field nf-full"><label for="nf-cfg-worker">URL du Worker</label> <input id="nf-cfg-worker" type="url" /></div>
<div class="nf-field"><label for="nf-cfg-rcr">RCR</label> <input id="nf-cfg-rcr" type="text" /></div>
<div class="nf-field"><label for="nf-cfg-period">P&eacute;riode API</label> <input id="nf-cfg-period" type="text" /></div>
<div class="nf-field"><label for="nf-cfg-start-hour">D&eacute;but de journ&eacute;e &mdash; heure</label> <input id="nf-cfg-start-hour" type="number" min="0" max="23" /></div>
<div class="nf-field"><label for="nf-cfg-start-minute">D&eacute;but de journ&eacute;e &mdash; minute</label> <input id="nf-cfg-start-minute" type="number" min="0" max="59" /></div>
</div>
<div class="nf-section-title">Affichage</div>
<div class="nf-form-grid">
<div class="nf-field nf-full"><label for="nf-cfg-title">Titre</label> <input id="nf-cfg-title" type="text" /></div>
<div class="nf-field nf-full"><label for="nf-cfg-subtitle">Sous-titre</label> <input id="nf-cfg-subtitle" type="text" /></div>
<div class="nf-field"><label for="nf-cfg-label-in">Libell&eacute; entr&eacute;es</label> <input id="nf-cfg-label-in" type="text" /></div>
<div class="nf-field"><label for="nf-cfg-label-out">Libell&eacute; sorties</label> <input id="nf-cfg-label-out" type="text" /></div>
<div class="nf-field"><label for="nf-cfg-label-present">Libell&eacute; pr&eacute;sents</label> <input id="nf-cfg-label-present" type="text" /></div>
<div class="nf-field"><label for="nf-cfg-label-estimate">Mention estimation</label> <input id="nf-cfg-label-estimate" type="text" /></div>
<div class="nf-field"><label for="nf-cfg-accent">Couleur principale</label> <input id="nf-cfg-accent" type="color" /></div>
<div class="nf-field"><label for="nf-cfg-present-accent">Couleur pr&eacute;sents</label> <input id="nf-cfg-present-accent" type="color" /></div>
<div class="nf-field nf-full"><label class="nf-check"> <input id="nf-cfg-show-yesterday" type="checkbox" /> Afficher les valeurs d&rsquo;hier </label></div>
<div class="nf-field nf-full"><label class="nf-check"> <input id="nf-cfg-show-present" type="checkbox" /> Afficher l&rsquo;estimation des personnes pr&eacute;sentes </label></div>
<div class="nf-field nf-full"><label class="nf-check"> <input id="nf-cfg-clamp-present" type="checkbox" /> Ne jamais afficher une estimation n&eacute;gative </label></div>
<div class="nf-field nf-full"><label class="nf-check"> <input id="nf-cfg-show-refresh" type="checkbox" /> Afficher le bouton d&rsquo;actualisation manuelle </label></div>
</div>
<div class="nf-section-title">Actualisation automatique</div>
<div class="nf-form-grid">
<div class="nf-field nf-full"><label class="nf-check"> <input id="nf-cfg-auto-refresh" type="checkbox" /> Actualiser automatiquement </label></div>
<div class="nf-field"><label for="nf-cfg-auto-refresh-minutes">Intervalle (minutes)</label> <input id="nf-cfg-auto-refresh-minutes" type="number" min="1" max="1440" /></div>
</div>
<div class="nf-admin-actions"><button type="button" id="nf-admin-test" class="nf-mini-btn">Tester l&rsquo;API</button> <button type="button" id="nf-admin-defaults" class="nf-mini-btn">Valeurs d&rsquo;origine</button> <button type="button" id="nf-admin-save" class="nf-mini-btn nf-primary">Enregistrer</button></div>
<div id="nf-admin-message" class="nf-admin-message"></div>
</div>
</section>
</div>`;

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLE_TEXT;
    document.head.appendChild(style);
}

async function mount(container) {
    if (!container || container.dataset.pmk137Mounted === WIDGET_ID) return;
    container.dataset.pmk137Mounted = WIDGET_ID;
    ensureStyle();
    container.innerHTML = HTML_TEXT;

    // Seule adaptation au script historique : le bouton de paramètres
    // n'est visible que pour les superlibrarians Koha.
    const adminTrigger = document.getElementById('nf-admin-trigger');
    if (adminTrigger && !window.PMKHomeWidgets?.isSuperlibrarian?.()) {
        adminTrigger.style.display = 'none';
    }

  


  


      /* =========================================================
         FIREBASE
         ========================================================= */

      const firebaseConfig = {
        apiKey: "YOUR_FIREBASE_APIKEY",
        authDomain: "YOUR_FIREBASE_AUTHDOMAIN",
        projectId: "YOUR_FIREBASE_PROJECTID",
        storageBucket: "YOUR_FIREBASE_STORAGEBUCKET",
        messagingSenderId: "YOUR_FIREBASE_MESSAGINGSENDERID",
        appId: "YOUR_FIREBASE_APPID"
      };

      const FIREBASE_APP_NAME = "nedap-frequency-counter";
      const CONFIG_COLLECTION = "frequencyCounter";
      const CONFIG_DOCUMENT = "config";

      /*
       * Verrou d’interface uniquement.
       * Ce mot de passe est visible dans le code source du navigateur.
       * Il ne constitue donc PAS une authentification forte.
       */
      const ADMIN_PASSWORD = "CHANGE_ADMIN_PASSWORD_LOCALLY";
      const ADMIN_SESSION_KEY = "nfAdminUnlocked";

      /* =========================================================
         CONFIGURATION EMBARQUÉE
         Reprise exacte des paramètres du script de production.
         ========================================================= */

      const DEFAULT_CONFIG = {
        schemaVersion: 1,

        title: "Fréquentation",
        subtitle: "Compteur d’entrées / sorties",

        rcr: "830506201",
        workerUrl: "https://service.example.org",
        period: "DAY",

        dayStartHour: 1,
        dayStartMinute: 0,

        labels: {
          in: "Entrées",
          out: "Sorties",
          present: "Personnes présentes",
          estimate: "estimation"
        },

        display: {
          showYesterday: true,
          showPresent: true,
          clampPresentToZero: false,
          showRefreshButton: true
        },

        autoRefresh: {
          enabled: false,
          minutes: 5
        },

        appearance: {
          accent: "#2f7d5b",
          presentAccent: "#2f73b7"
        }
      };

      let currentConfig = structuredClone(DEFAULT_CONFIG);
      let db = null;
      let firestoreAvailable = false;
      let configSource = "Paramètres embarqués";
      let autoRefreshTimer = null;

      /* =========================================================
         OUTILS
         ========================================================= */

      function deepMerge(base, extra) {
        if (!extra || typeof extra !== "object") {
          return structuredClone(base);
        }

        const result = structuredClone(base);

        Object.keys(extra).forEach(key => {
          const value = extra[key];

          if (
            value &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            result[key] &&
            typeof result[key] === "object" &&
            !Array.isArray(result[key])
          ) {
            result[key] = deepMerge(result[key], value);
          } else if (value !== undefined) {
            result[key] = value;
          }
        });

        return result;
      }

      function clampInt(value, min, max, fallback) {
        const n = Number.parseInt(value, 10);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(Math.max(n, min), max);
      }

      function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");

        return `${year}${month}${day}${hours}${minutes}${seconds}`;
      }

      function getAPIDatesForDay(targetDate, isToday) {
        const start = new Date(
          targetDate.getFullYear(),
          targetDate.getMonth(),
          targetDate.getDate(),
          clampInt(currentConfig.dayStartHour, 0, 23, 1),
          clampInt(currentConfig.dayStartMinute, 0, 59, 0),
          0
        );

        const end = isToday
          ? new Date()
          : new Date(
              targetDate.getFullYear(),
              targetDate.getMonth(),
              targetDate.getDate(),
              23,
              59,
              59
            );

        return {
          start: formatDate(start),
          end: formatDate(end)
        };
      }

      function buildApiUrl(targetDate, isToday) {
        const dates = getAPIDatesForDay(targetDate, isToday);
        const root = String(currentConfig.workerUrl || "").replace(/\/+$/, "");
        const rcr = encodeURIComponent(String(currentConfig.rcr || "").trim());
        const period = encodeURIComponent(String(currentConfig.period || "DAY").trim());

        return `${root}/CCinfo/${rcr}/${dates.start}/${dates.end}/${period}`;
      }

      function calculateTotals(data) {
        let totalIn = 0;
        let totalOut = 0;

        if (!Array.isArray(data)) {
          throw new Error("Réponse API invalide : tableau attendu.");
        }

        data.forEach(site => {
          if (!site?.CCINFO || !Array.isArray(site.CCINFO)) return;

          site.CCINFO.forEach(zone => {
            if (!zone?.DATA || !Array.isArray(zone.DATA)) return;

            zone.DATA.forEach(entrance => {
              if (!entrance?.VALUES || !Array.isArray(entrance.VALUES)) return;

              entrance.VALUES.forEach(dateValues => {
                if (!dateValues || typeof dateValues !== "object") return;

                Object.values(dateValues).forEach(values => {
                  if (!values || typeof values !== "object") return;

                  const inValue = Number(values.IN);
                  const outValue = Number(values.OUT);

                  if (Number.isFinite(inValue)) totalIn += inValue;
                  if (Number.isFinite(outValue)) totalOut += outValue;
                });
              });
            });
          });
        });

        return {
          in: totalIn,
          out: totalOut
        };
      }

      function formatCount(value) {
        const n = Number(value);
        return Number.isFinite(n)
          ? new Intl.NumberFormat("fr-FR").format(n)
          : "0";
      }

      function showError(message) {
        const el = document.getElementById("nf-error-message");
        if (!el) return;
        el.textContent = message;
        el.style.display = "block";
      }

      function hideError() {
        const el = document.getElementById("nf-error-message");
        if (!el) return;
        el.textContent = "";
        el.style.display = "none";
      }

      function setStatus(text) {
        const el = document.getElementById("nf-last-update");
        if (el) el.textContent = text;
      }

      function setAdminMessage(text, isError = false) {
        const el = document.getElementById("nf-admin-message");
        if (!el) return;

        el.textContent = text;
        el.style.color = isError ? "#b42318" : "";
      }

      /* =========================================================
         AFFICHAGE
         ========================================================= */

      function applyConfigToUI() {
        const app = document.getElementById("nf-app");
        if (!app) return;

        app.style.setProperty("--nf-accent", currentConfig.appearance.accent || "#2f7d5b");
        app.style.setProperty("--nf-present-accent", currentConfig.appearance.presentAccent || "#2f73b7");

        document.getElementById("nf-title").textContent =
          currentConfig.title || "Fréquentation";

        document.getElementById("nf-subtitle").textContent =
          currentConfig.subtitle || "";

        document.getElementById("nf-label-in").textContent =
          currentConfig.labels.in || "Entrées";

        document.getElementById("nf-label-out").textContent =
          currentConfig.labels.out || "Sorties";

        document.getElementById("nf-label-present").textContent =
          currentConfig.labels.present || "Personnes présentes";

        document.getElementById("nf-label-estimate").textContent =
          currentConfig.labels.estimate
            ? ` · ${currentConfig.labels.estimate}`
            : "";

        document.getElementById("nf-entrees-yesterday").style.display =
          currentConfig.display.showYesterday ? "" : "none";

        document.getElementById("nf-sorties-yesterday").style.display =
          currentConfig.display.showYesterday ? "" : "none";

        document.getElementById("nf-present-card").style.display =
          currentConfig.display.showPresent ? "" : "none";

        document.getElementById("nf-refresh-wrap").style.display =
          currentConfig.display.showRefreshButton ? "" : "none";

        document.getElementById("nf-source-badge").textContent =
          `Configuration : ${configSource}`;

        configureAutoRefresh();
      }

      function updateDisplay(inCount, outCount) {
        document.getElementById("nf-entrees").textContent = formatCount(inCount);
        document.getElementById("nf-sorties").textContent = formatCount(outCount);

        let present = Number(inCount) - Number(outCount);

        if (currentConfig.display.clampPresentToZero) {
          present = Math.max(0, present);
        }

        document.getElementById("nf-present").textContent = formatCount(present);
      }

      function updateDisplayYesterday(inCount, outCount) {
        document.getElementById("nf-entrees-yesterday").textContent =
          `(Hier : ${formatCount(inCount)})`;

        document.getElementById("nf-sorties-yesterday").textContent =
          `(Hier : ${formatCount(outCount)})`;
      }

      /* =========================================================
         CACHE LOCAL
         ========================================================= */

      const CACHE_KEY = "nfLastCount";

      function saveToLocalStorage(totalsToday, totalsYesterday = null) {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            today: totalsToday,
            yesterday: totalsYesterday,
            timestamp: Date.now()
          })
        );
      }

      function loadFromLocalStorage() {
        try {
          const raw = localStorage.getItem(CACHE_KEY);
          if (!raw) {
            setStatus("Aucune donnée historique disponible");
            return;
          }

          const saved = JSON.parse(raw);

          if (saved?.today) {
            updateDisplay(saved.today.in, saved.today.out);
          }

          if (saved?.yesterday) {
            updateDisplayYesterday(saved.yesterday.in, saved.yesterday.out);
          }

          if (saved?.timestamp) {
            const date = new Date(saved.timestamp);
            setStatus(
              `Dernière actualisation : ${date.toLocaleDateString("fr-FR")} ${date.toLocaleTimeString("fr-FR")}`
            );
          }
        } catch {
          setStatus("Données locales indisponibles");
        }
      }

      /* =========================================================
         API
         ========================================================= */

      async function fetchJson(url) {
        const response = await fetch(url, {
          method: "GET",
          cache: "no-store"
        });

        if (!response.ok) {
          let message = `Erreur HTTP ${response.status}`;

          if (response.status === 401) {
            message = "Clé API invalide";
          } else if (response.status === 402) {
            message = "Aucun RCR accessible";
          }

          throw new Error(message);
        }

        return response.json();
      }

      async function fetchAllCounts(options = {}) {
        const button = document.getElementById("nf-refresh-button");
        const silent = Boolean(options.silent);

        try {
          hideError();

          if (button && !silent) {
            button.disabled = true;
            button.textContent = "Actualisation en cours…";
          }

          const now = new Date();

          const [dataToday, dataYesterdayResult] = await Promise.all([
            fetchJson(buildApiUrl(now, true)),
            (async () => {
              if (!currentConfig.display.showYesterday) return null;

              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);

              try {
                return await fetchJson(buildApiUrl(yesterday, false));
              } catch {
                return null;
              }
            })()
          ]);

          const totalsToday = calculateTotals(dataToday);

          let totalsYesterday = null;

          if (dataYesterdayResult) {
            totalsYesterday = calculateTotals(dataYesterdayResult);
          }

          updateDisplay(totalsToday.in, totalsToday.out);

          if (totalsYesterday) {
            updateDisplayYesterday(totalsYesterday.in, totalsYesterday.out);
          }

          saveToLocalStorage(totalsToday, totalsYesterday);

          setStatus(
            `Dernière actualisation API : ${now.toLocaleDateString("fr-FR")} ${now.toLocaleTimeString("fr-FR")}`
          );

          return {
            today: totalsToday,
            yesterday: totalsYesterday
          };
        } catch (error) {
          showError(error?.message || "Erreur lors de la récupération des données.");
          throw error;
        } finally {
          if (button && !silent) {
            button.disabled = false;
            button.textContent = "Actualiser les données";
          }
        }
      }

      function configureAutoRefresh() {
        if (autoRefreshTimer) {
          clearInterval(autoRefreshTimer);
          autoRefreshTimer = null;
        }

        if (!currentConfig.autoRefresh.enabled) return;

        const minutes = clampInt(
          currentConfig.autoRefresh.minutes,
          1,
          1440,
          5
        );

        autoRefreshTimer = setInterval(() => {
          fetchAllCounts({ silent: true }).catch(() => {});
        }, minutes * 60 * 1000);
      }

      /* =========================================================
         FIRESTORE
         ========================================================= */

      function initFirebase() {
        try {
          let app = getApps().find(item => item.name === FIREBASE_APP_NAME);

          if (!app) {
            app = initializeApp(firebaseConfig, FIREBASE_APP_NAME);
          }

          db = getFirestore(app);
          firestoreAvailable = true;
          return true;
        } catch {
          firestoreAvailable = false;
          db = null;
          return false;
        }
      }

      async function loadConfigFromFirestore() {
        if (!firestoreAvailable || !db) {
          currentConfig = structuredClone(DEFAULT_CONFIG);
          configSource = "paramètres embarqués";
          return;
        }

        try {
          const ref = doc(db, CONFIG_COLLECTION, CONFIG_DOCUMENT);
          const snap = await getDoc(ref);

          if (!snap.exists()) {
            currentConfig = structuredClone(DEFAULT_CONFIG);
            configSource = "paramètres embarqués";
            return;
          }

          const saved = snap.data()?.config;

          if (!saved || typeof saved !== "object") {
            currentConfig = structuredClone(DEFAULT_CONFIG);
            configSource = "paramètres embarqués";
            return;
          }

          currentConfig = deepMerge(DEFAULT_CONFIG, saved);
          configSource = "Firebase";
        } catch {
          currentConfig = structuredClone(DEFAULT_CONFIG);
          configSource = "paramètres embarqués";
        }
      }

      async function saveConfigToFirestore(config) {
        if (!firestoreAvailable || !db) {
          throw new Error("Firebase / Firestore est indisponible.");
        }

        const ref = doc(db, CONFIG_COLLECTION, CONFIG_DOCUMENT);

        await setDoc(
          ref,
          {
            config,
            updatedAt: new Date().toISOString()
          },
          { merge: true }
        );
      }

      /* =========================================================
         ADMINISTRATION LOCALE
         ========================================================= */

      function adminUnlocked() {
        return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
      }

      function showLock() {
        if (adminUnlocked()) {
          openAdmin();
          return;
        }

        const lock = document.getElementById("nf-lock");
        lock.classList.add("nf-open");
        lock.setAttribute("aria-hidden", "false");

        document.getElementById("nf-lock-error").textContent = "";
        const input = document.getElementById("nf-lock-password");
        input.value = "";
        input.focus();
      }

      function hideLock() {
        const lock = document.getElementById("nf-lock");
        lock.classList.remove("nf-open");
        lock.setAttribute("aria-hidden", "true");
        document.getElementById("nf-lock-error").textContent = "";
      }

      function openAdmin() {
        hideLock();

        const admin = document.getElementById("nf-admin");
        const trigger = document.getElementById("nf-admin-trigger");

        fillAdminForm();

        admin.classList.add("nf-open");
        admin.setAttribute("aria-hidden", "false");
        trigger.classList.add("nf-active");
      }

      function closeAdmin() {
        const admin = document.getElementById("nf-admin");
        const trigger = document.getElementById("nf-admin-trigger");

        admin.classList.remove("nf-open");
        admin.setAttribute("aria-hidden", "true");
        trigger.classList.remove("nf-active");
      }

      function fillAdminForm() {
        document.getElementById("nf-cfg-worker").value = currentConfig.workerUrl || "";
        document.getElementById("nf-cfg-rcr").value = currentConfig.rcr || "";
        document.getElementById("nf-cfg-period").value = currentConfig.period || "DAY";
        document.getElementById("nf-cfg-start-hour").value = currentConfig.dayStartHour ?? 1;
        document.getElementById("nf-cfg-start-minute").value = currentConfig.dayStartMinute ?? 0;

        document.getElementById("nf-cfg-title").value = currentConfig.title || "";
        document.getElementById("nf-cfg-subtitle").value = currentConfig.subtitle || "";

        document.getElementById("nf-cfg-label-in").value = currentConfig.labels.in || "";
        document.getElementById("nf-cfg-label-out").value = currentConfig.labels.out || "";
        document.getElementById("nf-cfg-label-present").value = currentConfig.labels.present || "";
        document.getElementById("nf-cfg-label-estimate").value = currentConfig.labels.estimate || "";

        document.getElementById("nf-cfg-accent").value = currentConfig.appearance.accent || "#2f7d5b";
        document.getElementById("nf-cfg-present-accent").value =
          currentConfig.appearance.presentAccent || "#2f73b7";

        document.getElementById("nf-cfg-show-yesterday").checked =
          Boolean(currentConfig.display.showYesterday);

        document.getElementById("nf-cfg-show-present").checked =
          Boolean(currentConfig.display.showPresent);

        document.getElementById("nf-cfg-clamp-present").checked =
          Boolean(currentConfig.display.clampPresentToZero);

        document.getElementById("nf-cfg-show-refresh").checked =
          Boolean(currentConfig.display.showRefreshButton);

        document.getElementById("nf-cfg-auto-refresh").checked =
          Boolean(currentConfig.autoRefresh.enabled);

        document.getElementById("nf-cfg-auto-refresh-minutes").value =
          currentConfig.autoRefresh.minutes ?? 5;

        setAdminMessage(
          firestoreAvailable
            ? `Configuration actuellement chargée depuis : ${configSource}.`
            : "Firestore indisponible : les valeurs embarquées sont utilisées."
        );
      }

      function readAdminForm() {
        const config = structuredClone(currentConfig);

        config.workerUrl = document.getElementById("nf-cfg-worker").value.trim();
        config.rcr = document.getElementById("nf-cfg-rcr").value.trim();
        config.period = document.getElementById("nf-cfg-period").value.trim() || "DAY";

        config.dayStartHour = clampInt(
          document.getElementById("nf-cfg-start-hour").value,
          0,
          23,
          1
        );

        config.dayStartMinute = clampInt(
          document.getElementById("nf-cfg-start-minute").value,
          0,
          59,
          0
        );

        config.title = document.getElementById("nf-cfg-title").value.trim() || "Fréquentation";
        config.subtitle = document.getElementById("nf-cfg-subtitle").value.trim();

        config.labels.in = document.getElementById("nf-cfg-label-in").value.trim() || "Entrées";
        config.labels.out = document.getElementById("nf-cfg-label-out").value.trim() || "Sorties";
        config.labels.present =
          document.getElementById("nf-cfg-label-present").value.trim() || "Personnes présentes";
        config.labels.estimate = document.getElementById("nf-cfg-label-estimate").value.trim();

        config.appearance.accent =
          document.getElementById("nf-cfg-accent").value || "#2f7d5b";

        config.appearance.presentAccent =
          document.getElementById("nf-cfg-present-accent").value || "#2f73b7";

        config.display.showYesterday =
          document.getElementById("nf-cfg-show-yesterday").checked;

        config.display.showPresent =
          document.getElementById("nf-cfg-show-present").checked;

        config.display.clampPresentToZero =
          document.getElementById("nf-cfg-clamp-present").checked;

        config.display.showRefreshButton =
          document.getElementById("nf-cfg-show-refresh").checked;

        config.autoRefresh.enabled =
          document.getElementById("nf-cfg-auto-refresh").checked;

        config.autoRefresh.minutes = clampInt(
          document.getElementById("nf-cfg-auto-refresh-minutes").value,
          1,
          1440,
          5
        );

        return config;
      }

      function validateConfig(config) {
        if (!config.workerUrl) {
          throw new Error("L’URL du Worker est obligatoire.");
        }

        if (!/^https?:\/\//i.test(config.workerUrl)) {
          throw new Error("L’URL du Worker doit commencer par http:// ou https://.");
        }

        if (!config.rcr) {
          throw new Error("Le RCR est obligatoire.");
        }

        if (!config.period) {
          throw new Error("La période API est obligatoire.");
        }
      }

      async function testConfigFromForm() {
        const previous = currentConfig;

        try {
          const candidate = readAdminForm();
          validateConfig(candidate);

          currentConfig = candidate;
          setAdminMessage("Test de connexion en cours…");

          const now = new Date();
          const data = await fetchJson(buildApiUrl(now, true));
          const totals = calculateTotals(data);

          setAdminMessage(
            `Test réussi : ${formatCount(totals.in)} entrée(s), ${formatCount(totals.out)} sortie(s).`
          );
        } catch (error) {
          setAdminMessage(error?.message || "Échec du test.", true);
        } finally {
          currentConfig = previous;
        }
      }

      async function saveAdminConfig() {
        try {
          const candidate = readAdminForm();
          validateConfig(candidate);

          setAdminMessage("Enregistrement…");

          await saveConfigToFirestore(candidate);

          currentConfig = candidate;
          configSource = "Firebase";

          applyConfigToUI();

          setAdminMessage("Paramètres enregistrés dans Firebase.");

          fetchAllCounts({ silent: true }).catch(() => {});
        } catch (error) {
          setAdminMessage(error?.message || "Impossible d’enregistrer.", true);
        }
      }

      /* =========================================================
         INITIALISATION
         ========================================================= */

      async function init() {
        initFirebase();
        await loadConfigFromFirestore();

        applyConfigToUI();
        loadFromLocalStorage();

        document.getElementById("nf-refresh-button")
          ?.addEventListener("click", () => {
            fetchAllCounts().catch(() => {});
          });

        document.getElementById("nf-admin-trigger")
          ?.addEventListener("click", showLock);

        document.getElementById("nf-lock-cancel")
          ?.addEventListener("click", hideLock);

        document.getElementById("nf-lock-form")
          ?.addEventListener("submit", event => {
            event.preventDefault();

            const password =
              document.getElementById("nf-lock-password").value;

            if (password !== ADMIN_PASSWORD) {
              document.getElementById("nf-lock-error").textContent =
                "Mot de passe incorrect.";
              return;
            }

            sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
            openAdmin();
          });

        document.getElementById("nf-admin-close")
          ?.addEventListener("click", closeAdmin);

        document.getElementById("nf-admin-defaults")
          ?.addEventListener("click", () => {
            currentConfig = structuredClone(DEFAULT_CONFIG);
            fillAdminForm();
            setAdminMessage(
              "Valeurs d’origine chargées dans le formulaire. Clique sur Enregistrer pour les appliquer."
            );
          });

        document.getElementById("nf-admin-test")
          ?.addEventListener("click", testConfigFromForm);

        document.getElementById("nf-admin-save")
          ?.addEventListener("click", saveAdminConfig);

        if (adminUnlocked()) {
          document.getElementById("nf-admin-trigger")?.classList.add("nf-active");
        }
      }

    await init();
}

window.PMKHomeWidgets?.register({
    id: WIDGET_ID,
    name: 'Fréquentation NEDAP',
    target: 'announcements-column',
    mount
});

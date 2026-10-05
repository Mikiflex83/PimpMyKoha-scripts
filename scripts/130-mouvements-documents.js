/* PMK — configuration du module Mouvements des documents */
(function(){
  const MODULE_ID="document-movements";
  const DEFAULT_SQL="SELECT\n    bt.branchtransfer_id AS Transfer_ID,\n    bt.itemnumber AS Item_ID,\n    bt.frombranch AS From_Site,\n    bt.tobranch AS To_Site,\n    bt.daterequested AS Demande_le,\n    bt.datesent AS Envoye_le,\n    bt.datearrived AS Arrive_le,\n    bt.datecancelled AS Annule_le,\n    bt.reason AS Raison,\n    bt.cancellation_reason AS Raison_annulation,\n    bt.comments AS Commentaire\nFROM branchtransfers bt\nJOIN items i ON i.itemnumber = bt.itemnumber\nWHERE i.biblionumber = <<Biblionumber>>\n  AND bt.branchtransfer_id > <<Après ID>>\nORDER BY bt.branchtransfer_id\nLIMIT 500";
  const defaults={enabled:true,reportId:5254,sqlTemplate:DEFAULT_SQL};
  function register(){
    if(!window.PMKConfig || typeof window.PMKConfig.registerModule!=="function") return false;
    window.PMKConfig.registerModule({
      id:MODULE_ID,schemaVersion:2,
      name:{fr:"Mouvements des documents",en:"Document movements"},
      description:{fr:"Affiche les mouvements, transferts et lieux de prêt des exemplaires sur la notice et les résultats de recherche. Les données sont chargées uniquement à la demande.",en:"Displays item movements, transfers and loan locations on record details and search results. Data is loaded only on demand."},
      category:{fr:"Catalogue / exemplaires",en:"Catalog / items"},
      supportedPages:["catalogue.detail","catalogue.search"],prerequisites:[],dependencies:[],defaults:defaults,
      schema:[{type:"section",id:"report",label:{fr:"Rapport SQL Koha",en:"Koha SQL report"},description:{fr:"Créez ce rapport dans Rapports guidés Koha avec le SQL ci-dessous, puis renseignez l’identifiant attribué par Koha.",en:"Create this report in Koha guided reports using the SQL below, then enter the ID assigned by Koha."},fields:[
        {key:"sqlTemplate",type:"textarea",rows:20,readOnly:true,label:{fr:"SQL à créer dans Koha",en:"SQL to create in Koha"},help:{fr:"Les paramètres <<Biblionumber>> et <<Après ID>> doivent rester exactement sous cette forme.",en:"Keep <<Biblionumber>> and <<Après ID>> exactly as shown."}},
        {key:"reportId",type:"number",label:{fr:"ID de votre rapport Koha",en:"Your Koha report ID"},help:{fr:"Après avoir créé le rapport, saisissez ici son numéro. Le module utilisera cet ID sur detail.pl et search.pl.",en:"After creating the report, enter its number here. The module will use it on detail.pl and search.pl."}}
      ]}]
    }); return true;
  }
  if(!register()){document.addEventListener("pmk:ready",register,{once:true});window.addEventListener("load",register,{once:true});}
  window.PMK130GetReportId=function(){
    try{const c=window.PMKConfig?.getConfigSync?.(MODULE_ID); const n=Number(c?.reportId); if(n>0)return n;}catch(_){}
    try{const raw=localStorage.getItem("PimpMyKoha.module.document-movements");const c=raw?JSON.parse(raw):null;const n=Number(c?.reportId);if(n>0)return n;}catch(_){}
    return 5254;
  };
})();

/******************************************************************
 * KOHA 25.11 — MOUVEMENTS DOCUMENTS
 * SCRIPT UNIQUE POUR INTRANETUSERJS
 * Correctif 2026-09-19 : détection robuste du code-barres pour le bouton Historique de prêt.
 *
 * Pages prises en charge :
 * - /cgi-bin/koha/catalogue/detail.pl
 * - /cgi-bin/koha/catalogue/search.pl
 *
 * Chaque module reste strictement limité à sa page.
 ******************************************************************/

(() => {
"use strict";

/*
 * KOHA 25.11 — MOUVEMENTS DES EXEMPLAIRES — detail.pl
 * Version intégrée visuellement à la fiche notice.
 *
 * - Bouton global "Mouvements de la notice" dans la barre d'outils Koha.
 * - Bouton "Mouvements" dans les actions de CHAQUE exemplaire.
 * - Dépliage visuel sous la ligne de l'exemplaire.
 * - Vue globale de la notice dans un panneau intégré au bloc Exemplaires.
 * - Chargement à la demande uniquement.
 * - 1 seule requête Koha active à la fois.
 */

const PATH = window.location.pathname;
if (PATH !== "/cgi-bin/koha/catalogue/detail.pl") return;
if (window.__dracItemMovementsIntegratedLoaded) return;
window.__dracItemMovementsIntegratedLoaded = true;

// ID du rapport "Historique transferts par notice".
const TRANSFER_REPORT_ID = typeof window.PMK130GetReportId === "function" ? window.PMK130GetReportId() : 5254;

function getKohaSerialQueue() {
    if (window.DracKohaSerialQueue) return window.DracKohaSerialQueue;
    let tail = Promise.resolve();
    let lastEnd = 0;
    const MIN_GAP = 300;

    const run = (task) => {
        const job = tail.catch(() => {}).then(async () => {
            const wait = Math.max(0, MIN_GAP - (Date.now() - lastEnd));
            if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
            try {
                return await task();
            } finally {
                lastEnd = Date.now();
            }
        });
        tail = job.catch(() => {});
        return job;
    };

    window.DracKohaSerialQueue = {
        run,
        fetch: (url, options) => run(() => fetch(url, options)),
        get pending() { return tail; }
    };
    return window.DracKohaSerialQueue;
}

const KOHA_QUEUE = getKohaSerialQueue();

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
}[m]));

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

function parseDate(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;

    if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
        const [d, m, y] = raw.slice(0, 10).split("/").map(Number);
        const time = raw.match(/(\d{2}):(\d{2})/);
        return new Date(y, m - 1, d, time ? Number(time[1]) : 0, time ? Number(time[2]) : 0);
    }

    const d = new Date(raw.replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(value) {
    const d = value instanceof Date ? value : parseDate(value);
    if (!d) return "—";
    return new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit", month: "2-digit", year: "numeric"
    }).format(d);
}

function fmtDateTime(value) {
    const d = value instanceof Date ? value : parseDate(value);
    if (!d) return "—";
    return new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    }).format(d);
}

const css = document.createElement("style");
css.textContent = `
/* Boutons intégrés */
.dim-notice-btn,
.dim-item-btn {
    white-space: nowrap;
}
.dim-item-btn {
    display: block !important;
    width: max-content;
    max-width: 100%;
    margin-top: 8px !important;
    margin-left: 0 !important;
    clear: both;
    border-color: #b9c9aa !important;
    color: #526d22 !important;
    background: #f8fbf4 !important;
}
.dim-item-btn:hover {
    background: #edf5e5 !important;
    border-color: #9db58a !important;
}
.dim-history-btn {
    display: block !important;
    width: max-content;
    max-width: 100%;
    margin-top: 5px !important;
    margin-left: 0 !important;
    clear: both;
    white-space: nowrap;
    border-color: #c8d3dc !important;
    color: #425b6d !important;
    background: #f7f9fb !important;
}
.dim-history-btn:hover {
    background: #eef3f6 !important;
    border-color: #aebdca !important;
}
.dim-notice-btn i,
.dim-item-btn i {
    margin-right: 4px;
}


#holdings_table td.actions .dim-item-btn {
    white-space: nowrap;
}
#holdings_table td.actions {
    min-width: 0 !important;
}

/* Ligne dépliée exemplaire */
tr.dim-detail-row > td {
    padding: 0 !important;
    background: #fbfcfa !important;
    border-top: 0 !important;
}
.dim-item-card {
    margin: 0;
    padding: 14px 16px 16px;
    border-left: 4px solid #6f8f32;
    background:
      linear-gradient(135deg, rgba(111,143,50,.055), rgba(75,120,160,.03)),
      #fff;
}
.dim-item-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 12px;
}
.dim-item-title {
    font-size: 15px;
    font-weight: 800;
    color: #34444f;
}
.dim-item-sub {
    margin-top: 3px;
    color: #77838b;
    font-size: 11px;
}
.dim-current-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 9px;
    border: 1px solid #c9d8bb;
    border-radius: 999px;
    background: #f7fbf3;
    color: #526d22;
    font-weight: 800;
    font-size: 11px;
    white-space: nowrap;
}
.dim-item-kpis {
    display: grid;
    grid-template-columns: repeat(5, minmax(95px, 1fr));
    gap: 8px;
    margin-bottom: 14px;
}
.dim-item-kpi {
    border: 1px solid #e1e6e9;
    border-radius: 8px;
    background: rgba(255,255,255,.94);
    padding: 8px 9px;
}
.dim-item-kpi span {
    display: block;
    color: #7a8790;
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: .04em;
}
.dim-item-kpi strong {
    display: block;
    margin-top: 4px;
    color: #35444e;
    font-size: 14px;
}

/* Parcours graphique */
.dim-journey {
    --dim-gap-x: 10px;
    --dim-gap-y: 14px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
    gap: var(--dim-gap-y) var(--dim-gap-x);
    width: 100%;
    overflow: visible;
    padding: 8px 2px 4px;
}
.dim-step {
    position: relative;
    min-width: 0;
    max-width: none;
    width: 100%;
    text-align: center;
    padding: 0 6px 8px;
}

/* Liaison horizontale : du centre du point jusqu'au bord droit de la cellule,
   plus le gap vers la cellule suivante. */
.dim-step::after {
    content: "";
    position: absolute;
    z-index: 0;
    top: 12px;
    left: calc(50% + 13px);
    width: calc(50% + var(--dim-gap-x));
    height: 2px;
    background: #cbd7df;
}

/* Petit segment à gauche : il complète la ligne qui arrive depuis l'étape précédente. */
.dim-step::before {
    content: "";
    position: absolute;
    z-index: 0;
    top: 12px;
    right: calc(50% + 13px);
    width: calc(50% + var(--dim-gap-x));
    height: 2px;
    background: #cbd7df;
}

/* Première étape : aucune liaison entrante. */
.dim-step:first-child::before {
    display: none;
}

/* Dernière étape : aucune liaison sortante. */
.dim-step:last-child::after {
    display: none;
}

/* Quand une étape démarre une nouvelle ligne de grille, JS lui ajoute cette classe :
   on masque la ligne entrante horizontale et on dessine une continuité verticale
   depuis la rangée précédente. */
.dim-step.dim-row-start::before {
    display: none;
}
.dim-step.dim-row-start:not(:first-child) .dim-step-dot::before {
    content: "";
    position: absolute;
    left: 50%;
    bottom: calc(100% + 1px);
    width: 2px;
    height: var(--dim-gap-y);
    transform: translateX(-50%);
    background: #cbd7df;
    z-index: -1;
}

/* L'étape qui termine une rangée ne doit pas tendre une ligne vers le vide. */
.dim-step.dim-row-end::after {
    display: none;
}
.dim-step-dot {
    position: relative;
    z-index: 2;
    display: inline-flex;
    width: 26px;
    height: 26px;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 2px solid #fff;
    background: #4b78a0;
    color: #fff;
    box-shadow: 0 0 0 1px #aabac6;
    font-size: 11px;
}
.dim-step.is-current .dim-step-dot {
    background: #6f8f32;
    box-shadow: 0 0 0 1px #9fb187;
}
.dim-step.is-cancelled .dim-step-dot {
    background: #a34f48;
    box-shadow: 0 0 0 1px #c28f8a;
}
.dim-step-date {
    margin-top: 6px;
    color: #78848c;
    font-size: 10px;
}
.dim-step-site {
    margin-top: 2px;
    color: #35444e;
    font-size: 11px;
    font-weight: 800;
}
.dim-step-label {
    margin-top: 2px;
    color: #68757e;
    font-size: 10px;
    line-height: 1.25;
}

/* Vue notice intégrée */
.dim-notice-panel {
    margin: 10px 0 16px;
    border: 1px solid #d7dee3;
    border-radius: 9px;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0,0,0,.05);
    overflow: hidden;
}
.dim-notice-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 14px;
    padding: 12px 14px;
    background: linear-gradient(135deg, #f8fbf4, #f5f8fa);
    border-bottom: 1px solid #e1e7ea;
}
.dim-notice-title {
    color: #526d22;
    font-size: 15px;
    font-weight: 800;
}
.dim-notice-sub {
    margin-top: 3px;
    color: #73808a;
    font-size: 11px;
}
.dim-notice-body {
    padding: 12px 14px 14px;
}
.dim-notice-kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(110px,1fr));
    gap: 8px;
    margin-bottom: 12px;
}
.dim-notice-kpi {
    padding: 9px 10px;
    border: 1px solid #e1e6e9;
    border-radius: 8px;
    background: #fff;
}
.dim-notice-kpi span {
    display: block;
    color: #7a8790;
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
}
.dim-notice-kpi strong {
    display: block;
    margin-top: 4px;
    color: #35444e;
    font-size: 17px;
}
.dim-notice-list {
    display: grid;
    gap: 8px;
}
.dim-notice-item {
    display: grid;
    grid-template-columns: minmax(145px, .8fr) 1fr 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 9px 10px;
    border: 1px solid #e1e6e9;
    border-radius: 8px;
}
.dim-notice-item-code {
    font-weight: 800;
    color: #34444e;
}
.dim-notice-item-route {
    color: #4b78a0;
    font-weight: 700;
    font-size: 11px;
}
.dim-notice-item-meta {
    color: #6d7982;
    font-size: 11px;
}
.dim-notice-open {
    white-space: nowrap;
}
.dim-empty,
.dim-error {
    padding: 12px;
    color: #68757e;
}
.dim-error {
    border: 1px solid #efc9c5;
    border-radius: 7px;
    background: #fff2f0;
    color: #963f38;
}


.dim-direction {
    margin-top: 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 4px 8px;
    border-radius: 7px;
    background: #f5f8fa;
    border: 1px solid #dde5ea;
    color: #41525e;
    font-size: 11px;
    font-weight: 800;
    white-space: nowrap;
}
.dim-direction.is-out {
    background: #eef5fb;
    border-color: #c7dbe9;
    color: #356b91;
}
.dim-direction.is-home {
    background: #f2f8ed;
    border-color: #cfdfc1;
    color: #55752d;
}
.dim-direction.is-network {
    background: #f7f5fb;
    border-color: #ddd4ea;
    color: #6b5686;
}
.dim-direction.is-cancelled {
    background: #fff1ef;
    border-color: #e8c4c0;
    color: #9c453f;
    text-decoration: line-through;
}
.dim-arrow {
    font-size: 17px;
    line-height: 1;
    letter-spacing: -2px;
}
.dim-reason {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 5px;
    padding: 2px 7px;
    border-radius: 999px;
    background: #eef1f3;
    color: #5f6d77;
    font-size: 10px;
    font-weight: 700;
}
.dim-reason i {
    opacity: .8;
}
.dim-step.is-pending .dim-step-dot {
    background: #d18a2b;
    box-shadow: 0 0 0 1px #d9ad6e;
}
.dim-step.is-pending::after,
.dim-step.is-pending::before {
    background: repeating-linear-gradient(90deg,#d18a2b 0 7px,transparent 7px 11px);
}
.dim-step.is-pending.dim-row-start .dim-step-dot::before {
    background: repeating-linear-gradient(180deg,#d18a2b 0 7px,transparent 7px 11px);
}


/* Lieux de prêt */
.dim-loans {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid #e1e7ea;
}
.dim-loans-title {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    color: #43535e;
    font-size: 12px;
    font-weight: 800;
}
.dim-loan-kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(100px, 1fr));
    gap: 7px;
    margin-bottom: 9px;
}
.dim-loan-kpi {
    padding: 7px 8px;
    border: 1px solid #e1e6e9;
    border-radius: 7px;
    background: #fff;
}
.dim-loan-kpi span {
    display: block;
    color: #7c8790;
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
}
.dim-loan-kpi strong {
    display: block;
    margin-top: 3px;
    color: #35444e;
    font-size: 14px;
}
.dim-loan-sites {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px,1fr));
    gap: 7px;
}
.dim-loan-site {
    padding: 7px 8px;
    border: 1px solid #e1e6e9;
    border-radius: 7px;
    background: #fff;
}
.dim-loan-site.is-home {
    border-color: #cdddbf;
    background: #f8fbf4;
}
.dim-loan-site.is-away {
    border-color: #d5e0e8;
    background: #f8fafc;
}
.dim-loan-site-top {
    display: flex;
    justify-content: space-between;
    gap: 7px;
    align-items: center;
    font-size: 10px;
}
.dim-loan-site-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
    color: #455660;
}
.dim-loan-bar {
    height: 4px;
    margin-top: 5px;
    border-radius: 4px;
    background: #e9eef1;
    overflow: hidden;
}
.dim-loan-bar span {
    display: block;
    height: 100%;
    background: currentColor;
    color: #6f8f32;
}
.dim-loan-site.is-away .dim-loan-bar span {
    color: #4b78a0;
}
.dim-loan-site-foot {
    margin-top: 3px;
    color: #7a858d;
    font-size: 9px;
}
.dim-loan-empty {
    color: #78848d;
    font-size: 10px;
    padding: 5px 0;
}

@media (max-width: 1000px) {
    .dim-journey {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .dim-item-kpis {
        grid-template-columns: repeat(2, minmax(105px,1fr));
    }
    .dim-notice-kpis {
        grid-template-columns: repeat(2, minmax(105px,1fr));
    }
    .dim-notice-item {
        grid-template-columns: 1fr;
        gap: 4px;
    }
    .dim-item-head {
        display: block;
    }
    .dim-current-badge {
        margin-top: 7px;
    }
}
@media (max-width: 620px) {
    .dim-journey {
        grid-template-columns: 1fr;
    }
    .dim-step::before,
    .dim-step::after {
        display: none !important;
    }
    .dim-step:not(:first-child) .dim-step-dot::before {
        content: "";
        position: absolute;
        left: 50%;
        bottom: calc(100% + 1px);
        width: 2px;
        height: var(--dim-gap-y);
        transform: translateX(-50%);
        background: #cbd7df;
        z-index: -1;
    }
}
`;
document.head.appendChild(css);

async function getJson(url) {
    const response = await KOHA_QUEUE.fetch(url, {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" }
    });
    if (!response.ok) {
        const err = new Error(`Koha HTTP ${response.status}`);
        err.status = response.status;
        throw err;
    }
    return { data: await response.json(), response };
}

async function getPaged(url, perPage = 100) {
    const all = [];
    let page = 1;

    while (page <= 100) {
        const u = new URL(url, location.origin);
        u.searchParams.set("_page", String(page));
        u.searchParams.set("_per_page", String(perPage));

        const { data, response } = await getJson(u.toString());
        if (!Array.isArray(data)) break;

        all.push(...data);

        const total = Number(response.headers.get("X-Total-Count") || 0);
        if ((total && all.length >= total) || data.length < perPage) break;

        page += 1;
    }

    return all;
}

async function loadTransfers(biblioId) {
    if (!TRANSFER_REPORT_ID) return [];

    const all = [];
    let cursor = 0;
    let lots = 0;

    while (lots < 200) {
        lots += 1;

        const u = new URL("/cgi-bin/koha/svc/report", location.origin);
        u.searchParams.set("id", String(TRANSFER_REPORT_ID));
        u.searchParams.set("annotated", "1");
        u.searchParams.append("param_names", "Biblionumber");
        u.searchParams.append("sql_params", String(biblioId));
        u.searchParams.append("param_names", "Après ID");
        u.searchParams.append("sql_params", String(cursor));

        const { data } = await getJson(u.toString());
        if (!Array.isArray(data) || !data.length) break;

        all.push(...data);

        const last = Number(
            data[data.length - 1].Transfer_ID ??
            data[data.length - 1].transfer_id ??
            0
        );

        if (!Number.isFinite(last) || last <= cursor) break;
        cursor = last;

        if (data.length < 500) break;
    }

    return all;
}

async function loadLibraries() {
    try {
        const { data } = await getJson("/api/v1/public/libraries");
        const map = new Map();
        (Array.isArray(data) ? data : []).forEach((l) => {
            map.set(String(l.library_id), l.name || l.library_id);
        });
        return map;
    } catch (_) {
        return new Map();
    }
}

function itemVal(obj, ...keys) {
    for (const key of keys) {
        if (obj?.[key] !== undefined && obj[key] !== null && obj[key] !== "") {
            return obj[key];
        }
    }
    return null;
}

function getBiblioId() {
    return new URLSearchParams(location.search).get("biblionumber");
}

function getItemIdFromRow(row) {
    const checkbox = row.querySelector('input[name="itemnumber"]');
    if (checkbox?.value) return String(checkbox.value);

    const link = row.querySelector('a[href*="itemnumber="]');
    if (link) {
        try {
            return new URL(link.getAttribute("href"), location.origin).searchParams.get("itemnumber");
        } catch (_) {}
    }
    return null;
}

function getBarcodeFromRow(row) {
    if (!row) return "";

    // 1) Structure Koha / DataTables classique.
    const labelledCell = row.querySelector('[data-label="barcode"]');
    if (labelledCell) {
        const value = clean(labelledCell.textContent || "");
        if (value) return value;
    }

    // 2) Attributs explicites éventuels ajoutés par Koha ou un autre module.
    const explicitBarcodeNode = row.querySelector('[data-barcode], [data-item-barcode]');
    if (explicitBarcodeNode) {
        const value = clean(
            explicitBarcodeNode.dataset?.barcode ||
            explicitBarcodeNode.dataset?.itemBarcode ||
            explicitBarcodeNode.getAttribute('data-barcode') ||
            explicitBarcodeNode.getAttribute('data-item-barcode') ||
            explicitBarcodeNode.textContent ||
            ""
        );
        if (value) return value;
    }

    // 3) Fallback robuste pour detail.pl : dans le tableau des exemplaires,
    // le code-barres est le texte du lien vers moredetail.pl contenant itemnumber.
    // Cela couvre notamment les tableaux reconstruits/stylés où data-label="barcode"
    // n'est plus présent.
    const moreDetailLink = row.querySelector(
        'a[href*="/cgi-bin/koha/catalogue/moredetail.pl"][href*="itemnumber="]'
    );
    if (moreDetailLink) {
        const value = clean(moreDetailLink.textContent || "");
        if (value) return value;
    }

    // 4) Dernier fallback : repérer dynamiquement la colonne Code-barres / Barcode
    // depuis l'en-tête du tableau, sans dépendre de data-label.
    const table = row.closest('table');
    if (table) {
        const headers = Array.from(table.querySelectorAll('thead th'));
        const barcodeIndex = headers.findIndex((th) => {
            const text = clean(th.textContent || "").toLowerCase();
            return (
                text === "code-barres" ||
                text === "code barre" ||
                text === "code-barres exemplaire" ||
                text === "barcode" ||
                text.includes("code-barres") ||
                text.includes("barcode")
            );
        });

        if (barcodeIndex >= 0 && row.cells?.[barcodeIndex]) {
            const value = clean(row.cells[barcodeIndex].textContent || "");
            if (value) return value;
        }
    }

    return "";
}

function getCellText(row, label) {
    return clean(row.querySelector(`[data-label="${label}"]`)?.textContent || "");
}

function transferDate(t) {
    return (
        t.Arrive_le || t.Envoye_le || t.Demande_le || t.Annule_le ||
        t.datearrived || t.datesent || t.daterequested || t.datecancelled || ""
    );
}

function getTransferState(t) {
    if (t.Annule_le || t.datecancelled) return "cancelled";
    if (t.Arrive_le || t.datearrived) return "arrived";
    if (t.Envoye_le || t.datesent) return "sent";
    return "requested";
}

function latestTransfer(transfers) {
    return [...transfers].sort((a,b) => {
        const da = parseDate(transferDate(a))?.getTime() || 0;
        const db = parseDate(transferDate(b))?.getTime() || 0;
        return db - da;
    })[0] || null;
}

function uniqueSitesForItem(item, transfers) {
    const set = new Set();
    const home = itemVal(item, "home_library_id", "homebranch");
    const holding = itemVal(item, "holding_library_id", "holdingbranch");

    if (home) set.add(String(home));
    if (holding) set.add(String(holding));

    transfers.forEach((t) => {
        const from = t.From_Site ?? t.frombranch;
        const to = t.To_Site ?? t.tobranch;
        if (from) set.add(String(from));
        if (to) set.add(String(to));
    });

    return set;
}


const TRANSFER_REASON_LABELS = {
    Manual: ["Transfert manuel", "fa-hand"],
    StockrotationAdvance: ["Rotation de stock", "fa-rotate"],
    StockrotationRepatriation: ["Retour de rotation", "fa-rotate-left"],
    ReturnToHome: ["Retour au site de rattachement", "fa-house"],
    ReturnToHolding: ["Retour au site de détention", "fa-location-dot"],
    RotatingCollection: ["Collection tournante", "fa-arrows-rotate"],
    Reserve: ["Réservation", "fa-bookmark"],
    LostReserve: ["Réservation sur document perdu", "fa-triangle-exclamation"],
    CancelReserve: ["Réservation annulée", "fa-bookmark"],
    TransferCancellation: ["Annulation de transfert", "fa-xmark"],
    Recall: ["Rappel", "fa-bell"],
    RecallCancellation: ["Rappel annulé", "fa-bell-slash"],
    LibraryFloatLimit: ["Limite de flottement", "fa-water"]
};

const CANCELLATION_REASON_LABELS = {
    Manual: ["Annulation manuelle", "fa-hand"],
    StockrotationAdvance: ["Rotation de stock", "fa-rotate"],
    StockrotationRepatriation: ["Retour de rotation", "fa-rotate-left"],
    ReturnToHome: ["Retour au rattachement", "fa-house"],
    ReturnToHolding: ["Retour à la détention", "fa-location-dot"],
    RotatingCollection: ["Collection tournante", "fa-arrows-rotate"],
    Reserve: ["Réservation", "fa-bookmark"],
    LostReserve: ["Réservation sur document perdu", "fa-triangle-exclamation"],
    CancelReserve: ["Réservation annulée", "fa-bookmark"],
    ItemLost: ["Document perdu", "fa-triangle-exclamation"],
    WrongTransfer: ["Mauvais transfert", "fa-shuffle"],
    RecallCancellation: ["Rappel annulé", "fa-bell-slash"]
};

function reasonInfo(t) {
    const cancelled = Boolean(t.Annule_le || t.datecancelled);
    const raw = cancelled
        ? (t.Raison_annulation ?? t.cancellation_reason ?? "")
        : (t.Raison ?? t.reason ?? "");
    const map = cancelled ? CANCELLATION_REASON_LABELS : TRANSFER_REASON_LABELS;
    if (!raw) return { raw:"", label:"Motif non renseigné", icon:"fa-circle-question", known:false };
    const found = map[String(raw)];
    return found
        ? { raw:String(raw), label:found[0], icon:found[1], known:true }
        : { raw:String(raw), label:String(raw), icon:"fa-circle-info", known:false };
}

function movementDirection(homeCode, fromCode, toCode, cancelled=false) {
    const home = String(homeCode || "");
    const from = String(fromCode || "");
    const to = String(toCode || "");

    if (home && from === home && to && to !== home) {
        return { kind: cancelled ? "cancelled" : "out", arrow:"==>", semantic:"Départ du site de rattachement" };
    }
    if (home && to === home && from && from !== home) {
        // Affichage volontairement centré sur le site propriétaire à gauche :
        // DRA <== VID signifie mouvement réel VID → DRA.
        return { kind: cancelled ? "cancelled" : "home", arrow:"<==", semantic:"Retour vers le site de rattachement" };
    }
    if (from && to && from !== to) {
        return { kind: cancelled ? "cancelled" : "network", arrow:"==>", semantic:"Déplacement entre sites du réseau" };
    }
    return { kind: cancelled ? "cancelled" : "network", arrow:"→", semantic:"Transfert" };
}

function routeVisual(homeCode, t, libs) {
    const fromCode = String(t.From_Site ?? t.frombranch ?? "");
    const toCode = String(t.To_Site ?? t.tobranch ?? "");
    const from = libs.get(fromCode) || fromCode || "?";
    const to = libs.get(toCode) || toCode || "?";
    const cancelled = Boolean(t.Annule_le || t.datecancelled);
    const dir = movementDirection(homeCode, fromCode, toCode, cancelled);

    if (homeCode && toCode === String(homeCode) && fromCode !== String(homeCode)) {
        const homeName = libs.get(String(homeCode)) || String(homeCode);
        return { ...dir, left:homeName, right:from, real:`${from} → ${homeName}` };
    }
    return { ...dir, left:from, right:to, real:`${from} → ${to}` };
}

function buildJourney(item, transfers, libs) {
    const points = [];

    const home = String(itemVal(item, "home_library_id", "homebranch") || "");
    const holding = String(itemVal(item, "holding_library_id", "holdingbranch") || "");

    if (home) {
        points.push({
            date: parseDate(itemVal(item, "acquisition_date", "dateaccessioned")),
            site: home,
            label: "Acquisition",
            state: "acquisition"
        });
    }

    transfers.forEach((t) => {
        const from = String(t.From_Site ?? t.frombranch ?? "");
        const to = String(t.To_Site ?? t.tobranch ?? "");
        const state = getTransferState(t);
        const route = routeVisual(home, t, libs);
        const reason = reasonInfo(t);
        const pending = state === "requested" || state === "sent";

        points.push({
            date: parseDate(
                state === "cancelled"
                    ? (t.Annule_le ?? t.datecancelled ?? transferDate(t))
                    : (t.Arrive_le ?? t.datearrived ?? t.Envoye_le ?? t.datesent ?? t.Demande_le ?? t.daterequested)
            ),
            site: to || from,
            label: state === "cancelled" ? "Transfert annulé" : (pending ? "Transfert en cours" : "Transfert arrivé"),
            state: state === "cancelled" ? "cancelled" : (pending ? "pending" : state),
            route,
            reason
        });
    });

    if (holding) {
        points.push({
            date: parseDate(itemVal(item, "last_seen_date", "datelastseen")),
            site: holding,
            label: "Position actuelle",
            state: "current"
        });
    }

    return points
        .filter((p) => p.site)
        .sort((a,b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
}


function checkoutSiteCode(checkout) {
    return String(
        checkout?.library_id ??
        checkout?.checkout_library_id ??
        checkout?.branchcode ??
        ""
    );
}

function checkoutItemId(checkout) {
    return String(
        checkout?.item_id ??
        checkout?.itemnumber ??
        ""
    );
}

function buildLoanStatsForItem(item, checkouts, libs) {
    const homeCode = String(itemVal(item, "home_library_id", "homebranch") || "");
    const itemId = String(itemVal(item, "item_id", "itemnumber") || "");

    const relevant = (checkouts || []).filter((c) => checkoutItemId(c) === itemId);
    const bySite = new Map();

    relevant.forEach((checkout) => {
        const code = checkoutSiteCode(checkout);
        if (!code) return;
        bySite.set(code, (bySite.get(code) || 0) + 1);
    });

    const total = Array.from(bySite.values()).reduce((sum, n) => sum + n, 0);
    const atHome = homeCode ? (bySite.get(homeCode) || 0) : 0;
    const outside = Math.max(0, total - atHome);

    const sites = [...bySite.entries()]
        .map(([code, count]) => ({
            code,
            name: libs.get(code) || code,
            count,
            isHome: Boolean(homeCode && code === homeCode),
            pct: total ? Math.round((count / total) * 100) : 0
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"));

    return { total, atHome, outside, sites, homeCode };
}

function buildNoticeLoanStats(byItem, checkouts, libs) {
    let total = 0;
    let atHome = 0;
    let outside = 0;
    const loanSites = new Set();

    byItem.forEach((record) => {
        const stats = buildLoanStatsForItem(record.item || {}, checkouts, libs);
        total += stats.total;
        atHome += stats.atHome;
        outside += stats.outside;
        stats.sites.forEach((s) => loanSites.add(s.code));
    });

    return { total, atHome, outside, loanSites: loanSites.size };
}

function loanSitesHtml(stats) {
    if (!stats || !stats.total) {
        return '<div class="dim-loan-empty">Aucun lieu de prêt historique exploitable.</div>';
    }

    return `<div class="dim-loan-sites">
        ${stats.sites.map((site) => `
            <div class="dim-loan-site ${site.isHome ? "is-home" : "is-away"}">
                <div class="dim-loan-site-top">
                    <span class="dim-loan-site-name">${site.isHome ? '<i class="fa-solid fa-house"></i> ' : '<i class="fa-solid fa-building"></i> '}${esc(site.name)}</span>
                    <strong>${site.count}</strong>
                </div>
                <div class="dim-loan-bar"><span style="width:${Math.max(3, site.pct)}%"></span></div>
                <div class="dim-loan-site-foot">${site.pct}% ${site.isHome ? "· site propriétaire" : "· hors site propriétaire"}</div>
            </div>
        `).join("")}
    </div>`;
}

let cachePromise = null;

async function loadData() {
    if (cachePromise) return cachePromise;

    cachePromise = (async () => {
        const biblioId = getBiblioId();
        if (!biblioId) throw new Error("Numéro de notice introuvable.");

        const libs = await loadLibraries();
        const items = await getPaged(`/api/v1/public/biblios/${encodeURIComponent(biblioId)}/items`, 100);
        const transfers = await loadTransfers(biblioId);
        const checkouts = await getPaged(`/api/v1/biblios/${encodeURIComponent(biblioId)}/checkouts?checked_in=true`, 100);

        const byItem = new Map();

        items.forEach((item) => {
            const id = String(itemVal(item, "item_id", "itemnumber") || "");
            if (!id) return;
            byItem.set(id, { item, transfers: [] });
        });

        transfers.forEach((t) => {
            const id = String(t.Item_ID ?? t.item_id ?? t.itemnumber ?? "");
            if (!id) return;
            if (!byItem.has(id)) byItem.set(id, { item: null, transfers: [] });
            byItem.get(id).transfers.push(t);
        });

        return { biblioId, libs, items, transfers, checkouts, byItem };
    })();

    return cachePromise;
}


function markJourneyRows(journey) {
    if (!journey) return;

    const steps = Array.from(journey.querySelectorAll(".dim-step"));
    steps.forEach((step) => step.classList.remove("dim-row-start", "dim-row-end"));
    if (!steps.length) return;

    let currentTop = null;
    let previous = null;

    steps.forEach((step) => {
        const top = step.offsetTop;

        if (currentTop === null || Math.abs(top - currentTop) > 2) {
            if (previous) previous.classList.add("dim-row-end");
            step.classList.add("dim-row-start");
            currentTop = top;
        }

        previous = step;
    });

    if (previous) previous.classList.add("dim-row-end");

    // La première étape n'a jamais besoin du trait vertical d'entrée.
    steps[0].classList.remove("dim-row-start");
}

function renderItemContent(container, itemId, row, data) {
    const record = data.byItem.get(String(itemId));
    const item = record?.item || {};
    const transfers = record?.transfers || [];

    const barcode =
        itemVal(item, "external_id", "barcode") ||
        getBarcodeFromRow(row) ||
        `Exemplaire ${itemId}`;

    const homeCode = String(itemVal(item, "home_library_id", "homebranch") || "");
    const holdingCode = String(itemVal(item, "holding_library_id", "holdingbranch") || "");

    const home = data.libs.get(homeCode) || homeCode || getCellText(row, "homebranch") || "—";
    const holding = data.libs.get(holdingCode) || holdingCode || getCellText(row, "holdingbranch") || home || "—";

    const last = latestTransfer(transfers);
    const sites = uniqueSitesForItem(item, transfers);
    const journey = buildJourney(item, transfers, data.libs);
    const loanStats = buildLoanStatsForItem(item, data.checkouts || [], data.libs);

    const journeyHtml = journey.length
        ? `<div class="dim-journey">${journey.map((p) => {
            const icon = p.state === "current" ? "fa-location-dot"
                       : p.state === "cancelled" ? "fa-xmark"
                       : p.state === "pending" ? "fa-truck-fast"
                       : p.state === "acquisition" ? "fa-book"
                       : "fa-arrow-right";
            const routeHtml = p.route
                ? `<div class="dim-direction is-${esc(p.route.kind)}" title="${esc(p.route.semantic)} · mouvement réel : ${esc(p.route.real)}">
                    <span>${esc(p.route.left)}</span>
                    <span class="dim-arrow">${esc(p.route.arrow)}</span>
                    <span>${esc(p.route.right)}</span>
                   </div>`
                : "";
            const reasonHtml = p.reason
                ? `<div class="dim-reason" title="Code Koha : ${esc(p.reason.raw || "non renseigné")}">
                    <i class="fa-solid ${esc(p.reason.icon)}"></i> ${esc(p.reason.label)}
                   </div>`
                : "";
            return `<div class="dim-step ${p.state === "current" ? "is-current" : ""} ${p.state === "cancelled" ? "is-cancelled" : ""} ${p.state === "pending" ? "is-pending" : ""}">
                <span class="dim-step-dot"><i class="fa-solid ${icon}"></i></span>
                <div class="dim-step-date">${esc(fmtDate(p.date))}</div>
                <div class="dim-step-site">${esc(data.libs.get(p.site) || p.site)}</div>
                <div class="dim-step-label">${esc(p.label)}</div>
                ${routeHtml}
                ${reasonHtml}
            </div>`;
        }).join("")}</div>`
        : `<div class="dim-empty">Aucun déplacement historique enregistré pour cet exemplaire.</div>`;

    container.innerHTML = `
      <div class="dim-item-card">
        <div class="dim-item-head">
          <div>
            <div class="dim-item-title"><i class="fa-solid fa-route"></i> Parcours de ${esc(barcode)}</div>
            <div class="dim-item-sub">Historique synthétique des changements de site connus.</div>
          </div>
          <div class="dim-current-badge"><i class="fa-solid fa-location-dot"></i> ${esc(holding)}</div>
        </div>

        <div class="dim-item-kpis">
          <div class="dim-item-kpi"><span>Rattachement</span><strong>${esc(home)}</strong></div>
          <div class="dim-item-kpi"><span>Position actuelle</span><strong>${esc(holding)}</strong></div>
          <div class="dim-item-kpi"><span>Transferts</span><strong>${transfers.length}</strong></div>
          <div class="dim-item-kpi"><span>Sites rencontrés</span><strong>${sites.size}</strong></div>
          <div class="dim-item-kpi"><span>Dernier mouvement</span><strong>${esc(fmtDate(last ? transferDate(last) : null))}</strong></div>
        </div>

        ${journeyHtml}

        <div class="dim-loans">
          <div class="dim-loans-title"><i class="fa-solid fa-building-columns"></i> Lieux de prêt par rapport au site propriétaire</div>
          <div class="dim-loan-kpis">
            <div class="dim-loan-kpi"><span>Prêts connus</span><strong>${loanStats.total}</strong></div>
            <div class="dim-loan-kpi"><span>Sur site propriétaire</span><strong>${loanStats.atHome}</strong></div>
            <div class="dim-loan-kpi"><span>Hors site propriétaire</span><strong>${loanStats.outside}</strong></div>
            <div class="dim-loan-kpi"><span>Sites de prêt</span><strong>${loanStats.sites.length}</strong></div>
          </div>
          ${loanSitesHtml(loanStats)}
        </div>
      </div>`;

    const journeyEl = container.querySelector(".dim-journey");
    if (journeyEl) {
        markJourneyRows(journeyEl);

        // Recalcul en cas de changement de largeur du tableau / fenêtre.
        if (!journeyEl.__dimResizeObserver && window.ResizeObserver) {
            const ro = new ResizeObserver(() => markJourneyRows(journeyEl));
            ro.observe(journeyEl);
            journeyEl.__dimResizeObserver = ro;
        }
    }
}

async function openItemMovement(row, itemId) {
    let detailRow = row.nextElementSibling?.classList.contains("dim-detail-row")
        ? row.nextElementSibling
        : null;

    if (detailRow) {
        const opening = detailRow.hidden;
        detailRow.hidden = !opening;
        return;
    }

    detailRow = document.createElement("tr");
    detailRow.className = "dim-detail-row";

    const td = document.createElement("td");
    td.colSpan = row.cells.length;

    const content = document.createElement("div");
    content.className = "dim-empty";
    content.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Chargement du parcours…';

    td.appendChild(content);
    detailRow.appendChild(td);
    row.insertAdjacentElement("afterend", detailRow);

    try {
        const data = await loadData();
        renderItemContent(content, itemId, row, data);

        window.setTimeout(() => {
            detailRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 60);
    } catch (error) {
        console.error("[Mouvements exemplaire]", error);
        content.className = "dim-error";
        content.innerHTML = `<strong>Impossible de charger les mouvements.</strong><br>${esc(error.message || error)}`;
    }
}

function injectItemButtons(table) {
    table.querySelectorAll("tbody tr").forEach((row) => {
        if (row.dataset.dimMovementReady === "1") return;
        if (row.classList.contains("dim-detail-row")) return;

        const itemId = getItemIdFromRow(row);
        if (!itemId) return;

        const actionCell = row.querySelector('td[data-label="actions"], td.actions');
        if (!actionCell) return;

        if (actionCell.querySelector(".dim-item-btn") && actionCell.querySelector(".dim-history-btn")) {
            row.dataset.dimMovementReady = "1";
            return;
        }
        actionCell.querySelectorAll(".dim-item-btn, .dim-history-btn").forEach((el) => el.remove());

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-default btn-xs dim-item-btn";
        btn.innerHTML = '<i class="fa-solid fa-route"></i> Mouvements';
        btn.title = "Afficher le parcours de cet exemplaire";

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            openItemMovement(row, itemId);
        });

        // Le bouton est volontairement ajouté APRÈS le groupe d’actions natif :
        // il reste sur sa propre ligne et n’élargit pas la colonne.
        actionCell.appendChild(btn);

        const historyBtn = document.createElement("a");
        historyBtn.className = "btn btn-default btn-xs dim-history-btn";
        historyBtn.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> Historique de prêt';
        historyBtn.title = "Ouvrir l’historique de prêt préfiltré sur cet exemplaire";

        const barcode = getBarcodeFromRow(row);
        const biblioId = getBiblioId();

        if (biblioId && barcode) {
            const historyUrl = new URL("/cgi-bin/koha/catalogue/issuehistory.pl", location.origin);
            historyUrl.searchParams.set("biblionumber", biblioId);
            historyUrl.searchParams.set("krt_barcode", barcode);
            historyUrl.searchParams.set("krt_itemnumber", itemId);
            historyUrl.hash = "krt-biblio-timeline";
            historyBtn.href = historyUrl.toString();
        } else {
            historyBtn.href = "#";
            historyBtn.classList.add("disabled");
            historyBtn.setAttribute("aria-disabled", "true");
        }

        actionCell.appendChild(historyBtn);
        row.dataset.dimMovementReady = "1";
    });
}

function renderNoticePanel(panel, data) {
    const allSites = new Set();
    let lastMove = null;

    data.byItem.forEach((record) => {
        const item = record.item || {};
        const home = itemVal(item, "home_library_id", "homebranch");
        const holding = itemVal(item, "holding_library_id", "holdingbranch");
        if (home) allSites.add(String(home));
        if (holding) allSites.add(String(holding));

        record.transfers.forEach((t) => {
            const from = t.From_Site ?? t.frombranch;
            const to = t.To_Site ?? t.tobranch;
            if (from) allSites.add(String(from));
            if (to) allSites.add(String(to));

            const d = parseDate(transferDate(t));
            if (d && (!lastMove || d > lastMove)) lastMove = d;
        });
    });

    const noticeLoanStats = buildNoticeLoanStats(data.byItem, data.checkouts || [], data.libs);

    const rows = [...data.byItem.entries()].map(([itemId, record]) => {
        const item = record.item || {};
        const transfers = record.transfers || [];
        const barcode = itemVal(item, "external_id", "barcode") || `Exemplaire ${itemId}`;

        const homeCode = String(itemVal(item, "home_library_id", "homebranch") || "");
        const holdingCode = String(itemVal(item, "holding_library_id", "holdingbranch") || "");
        const home = data.libs.get(homeCode) || homeCode || "—";
        const holding = data.libs.get(holdingCode) || holdingCode || home || "—";

        const last = latestTransfer(transfers);
        const loanStats = buildLoanStatsForItem(item, data.checkouts || [], data.libs);
        const lastVisual = last ? routeVisual(homeCode, last, data.libs) : null;
        const lastReason = last ? reasonInfo(last) : null;
        const lastRoute = lastVisual
            ? `${lastVisual.left} ${lastVisual.arrow} ${lastVisual.right}`
            : "Aucun transfert";

        return `<div class="dim-notice-item" data-item-id="${esc(itemId)}">
            <div class="dim-notice-item-code">${esc(barcode)}</div>
            <div class="dim-notice-item-route"><i class="fa-solid fa-location-dot"></i> ${esc(home)} → ${esc(holding)}</div>
            <div class="dim-notice-item-meta">${transfers.length} transfert(s) · dernier : ${esc(fmtDate(last ? transferDate(last) : null))}<br><strong>${esc(lastRoute)}</strong>${lastReason ? ` · ${esc(lastReason.label)}` : ""}<br>${loanStats.total} prêt(s) connu(s) · ${loanStats.atHome} propriétaire · ${loanStats.outside} hors site</div>
            <button type="button" class="btn btn-default btn-xs dim-notice-open" data-open-item="${esc(itemId)}"><i class="fa-solid fa-route"></i> Voir</button>
        </div>`;
    }).join("");

    panel.innerHTML = `
      <div class="dim-notice-head">
        <div>
          <div class="dim-notice-title"><i class="fa-solid fa-route"></i> Mouvements de la notice</div>
          <div class="dim-notice-sub">Vue réseau synthétique de tous les exemplaires rattachés à cette notice.</div>
        </div>
      </div>
      <div class="dim-notice-body">
        <div class="dim-notice-kpis">
          <div class="dim-notice-kpi"><span>Exemplaires</span><strong>${data.byItem.size}</strong></div>
          <div class="dim-notice-kpi"><span>Transferts</span><strong>${data.transfers.length}</strong></div>
          <div class="dim-notice-kpi"><span>Sites rencontrés</span><strong>${allSites.size}</strong></div>
          <div class="dim-notice-kpi"><span>Dernier mouvement</span><strong>${esc(fmtDate(lastMove))}</strong></div>
          <div class="dim-notice-kpi"><span>Prêts connus</span><strong>${noticeLoanStats.total}</strong></div>
          <div class="dim-notice-kpi"><span>Prêts propriétaire</span><strong>${noticeLoanStats.atHome}</strong></div>
          <div class="dim-notice-kpi"><span>Prêts hors propriétaire</span><strong>${noticeLoanStats.outside}</strong></div>
          <div class="dim-notice-kpi"><span>Sites de prêt</span><strong>${noticeLoanStats.loanSites}</strong></div>
        </div>

        ${!TRANSFER_REPORT_ID ? `<div class="dim-error"><strong>Rapport transferts non configuré.</strong> Renseigne <code>TRANSFER_REPORT_ID</code> pour obtenir l’historique complet.</div>` : ""}

        <div class="dim-notice-list">${rows || '<div class="dim-empty">Aucun exemplaire.</div>'}</div>
      </div>`;

    panel.querySelectorAll("[data-open-item]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const itemId = btn.dataset.openItem;
            const row = [...document.querySelectorAll("#holdings_table tbody tr")].find((tr) => getItemIdFromRow(tr) === itemId);
            if (!row) return;

            row.scrollIntoView({ behavior: "smooth", block: "center" });
            const itemBtn = row.querySelector(".dim-item-btn");
            if (itemBtn) itemBtn.click();
        });
    });
}

function getNoticePanelHost(table) {
    return document.querySelector("#holdings_panel .holdings_table_table_controls")
        || table.closest(".dt-container")
        || table.parentElement;
}

async function toggleNoticePanel(table, btn) {
    let panel = document.getElementById("dim-notice-panel");

    if (panel) {
        const opening = panel.hidden;
        panel.hidden = !opening;
        btn.classList.toggle("active", opening);
        btn.innerHTML = opening
            ? '<i class="fa-solid fa-route"></i> Masquer les mouvements'
            : '<i class="fa-solid fa-route"></i> Mouvements de la notice';

        if (opening) {
            window.setTimeout(() => {
                panel.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 50);
        }
        return;
    }

    panel = document.createElement("section");
    panel.id = "dim-notice-panel";
    panel.className = "dim-notice-panel";
    panel.innerHTML = '<div class="dim-empty"><i class="fa fa-spinner fa-spin"></i> Chargement des mouvements de la notice…</div>';

    const host = getNoticePanelHost(table);
    host.insertAdjacentElement("afterend", panel);

    btn.classList.add("active");
    btn.innerHTML = '<i class="fa-solid fa-route"></i> Masquer les mouvements';

    try {
        const data = await loadData();
        renderNoticePanel(panel, data);

        window.setTimeout(() => {
            panel.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
    } catch (error) {
        console.error("[Mouvements notice]", error);
        panel.innerHTML = `<div class="dim-error"><strong>Impossible de charger les mouvements de la notice.</strong><br>${esc(error.message || error)}</div>`;
    }
}

function injectNoticeButton(table) {
    if (document.getElementById("dim-notice-toolbar-btn")) return;

    const toolbar = document.querySelector("#toolbar");
    if (!toolbar) return;

    const group = document.createElement("div");
    group.className = "btn-group";

    const btn = document.createElement("button");
    btn.id = "dim-notice-toolbar-btn";
    btn.type = "button";
    btn.className = "btn btn-default dim-notice-btn";
    btn.innerHTML = '<i class="fa-solid fa-route"></i> Mouvements de la notice';
    btn.title = "Afficher les déplacements des exemplaires de cette notice";

    btn.addEventListener("click", (e) => {
        e.preventDefault();
        toggleNoticePanel(table, btn);
    });

    group.appendChild(btn);
    toolbar.appendChild(group);
}

function bindDataTableRedraw(table) {
    if (!(window.jQuery && window.jQuery.fn && window.jQuery.fn.dataTable)) return;

    window.jQuery(table)
        .off("draw.dt.dimMovements")
        .on("draw.dt.dimMovements", () => {
            window.setTimeout(() => injectItemButtons(table), 0);
        });
}

function init() {
    const table = document.querySelector("#holdings_table");
    if (!table) {
        console.warn("[Mouvements detail.pl] Tableau #holdings_table introuvable.");
        return;
    }

    injectNoticeButton(table);
    injectItemButtons(table);
    bindDataTableRedraw(table);

    console.info("[Mouvements detail.pl] Module intégré actif.");
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 350), { once:true });
} else {
    setTimeout(init, 350);
}

})();


(() => {
"use strict";

/*
 * KOHA 25.11 — MOUVEMENTS DANS LES RÉSULTATS DE RECHERCHE
 * Page exacte :
 *   /cgi-bin/koha/catalogue/search.pl
 *
 * Principes de charge :
 * - ZÉRO requête Koha à l'initialisation.
 * - Requêtes uniquement après clic explicite sur "Mouvements".
 * - Une seule requête Koha à la fois.
 * - Pas de localStorage / sessionStorage / IndexedDB.
 * - Petit cache RAM LRU limité à 6 notices.
 * - cache:"no-store" pour les fetch.
 * - le cache disparaît dès que la page est quittée/rechargée.
 */

const PATH = window.location.pathname;
if (PATH !== "/cgi-bin/koha/catalogue/search.pl") return;
if (window.__dracSearchMovementsLoaded) return;
window.__dracSearchMovementsLoaded = true;

// Même rapport SQL que pour detail.pl.
const TRANSFER_REPORT_ID = typeof window.PMK130GetReportId === "function" ? window.PMK130GetReportId() : 5254;

// Limite volontairement petite : impossible de grossir au fil des recherches.
const MAX_NOTICE_CACHE = 6;
const MIN_REQUEST_GAP = 300;

/* ============================================================
 * FILE DE REQUÊTES KOHA — STRICTEMENT SÉQUENTIELLE
 * ============================================================ */

function getKohaSerialQueue() {
    if (window.DracKohaSerialQueue) return window.DracKohaSerialQueue;

    let tail = Promise.resolve();
    let lastEnd = 0;

    const run = (task) => {
        const job = tail.catch(() => {}).then(async () => {
            const wait = Math.max(0, MIN_REQUEST_GAP - (Date.now() - lastEnd));
            if (wait) await new Promise((resolve) => setTimeout(resolve, wait));

            try {
                return await task();
            } finally {
                lastEnd = Date.now();
            }
        });

        tail = job.catch(() => {});
        return job;
    };

    window.DracKohaSerialQueue = {
        run,
        fetch: (url, options) => run(() => fetch(url, options)),
        get pending() { return tail; }
    };

    return window.DracKohaSerialQueue;
}

const KOHA_QUEUE = getKohaSerialQueue();

/* ============================================================
 * PETIT CACHE RAM LRU — AUCUNE PERSISTANCE
 * ============================================================ */

const noticeCache = new Map();
let librariesPromise = null;

function cacheGet(biblioId) {
    const key = String(biblioId);
    if (!noticeCache.has(key)) return null;

    const value = noticeCache.get(key);
    // touche LRU : on replace l'entrée en fin
    noticeCache.delete(key);
    noticeCache.set(key, value);
    return value;
}

function cacheSet(biblioId, value) {
    const key = String(biblioId);

    if (noticeCache.has(key)) noticeCache.delete(key);
    noticeCache.set(key, value);

    while (noticeCache.size > MAX_NOTICE_CACHE) {
        const oldestKey = noticeCache.keys().next().value;
        noticeCache.delete(oldestKey);
    }
}

window.addEventListener("pagehide", () => {
    noticeCache.clear();
    librariesPromise = null;
}, { once: true });

/* ============================================================
 * UTILITAIRES
 * ============================================================ */

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
}[m]));

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

function parseDate(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;

    if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
        const [d, m, y] = raw.slice(0, 10).split("/").map(Number);
        const time = raw.match(/(\d{2}):(\d{2})/);
        return new Date(y, m - 1, d, time ? Number(time[1]) : 0, time ? Number(time[2]) : 0);
    }

    const d = new Date(raw.replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(value) {
    const d = value instanceof Date ? value : parseDate(value);
    if (!d) return "—";

    return new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    }).format(d);
}

function itemVal(obj, ...keys) {
    for (const key of keys) {
        if (obj?.[key] !== undefined && obj[key] !== null && obj[key] !== "") {
            return obj[key];
        }
    }
    return null;
}

function getBiblioIdFromResult(row) {
    const direct = row?.id?.match(/^row(\d+)$/)?.[1];
    if (direct) return direct;

    const cover = row?.querySelector("[data-biblionumber]");
    if (cover?.dataset?.biblionumber) return cover.dataset.biblionumber;

    const link = row?.querySelector('a[href*="/catalogue/detail.pl?biblionumber="]');
    if (link) {
        try {
            return new URL(link.getAttribute("href"), location.origin).searchParams.get("biblionumber");
        } catch (_) {}
    }

    return null;
}

function getItemInfo(itemNode) {
    return {
        itemId: String(itemNode?.dataset?.itemId || ""),
        barcode: clean(itemNode?.dataset?.barcode || itemNode?.querySelector(".kxri-barcode")?.textContent || "")
    };
}

function transferDate(t) {
    return (
        t.Arrive_le || t.Envoye_le || t.Demande_le || t.Annule_le ||
        t.datearrived || t.datesent || t.daterequested || t.datecancelled || ""
    );
}

function getTransferState(t) {
    if (t.Annule_le || t.datecancelled) return "cancelled";
    if (t.Arrive_le || t.datearrived) return "arrived";
    if (t.Envoye_le || t.datesent) return "sent";
    return "requested";
}

/* ============================================================
 * MOTIFS / SENS
 * ============================================================ */

const TRANSFER_REASON_LABELS = {
    Manual: ["Transfert manuel", "fa-hand"],
    StockrotationAdvance: ["Rotation de stock", "fa-rotate"],
    StockrotationRepatriation: ["Retour de rotation", "fa-rotate-left"],
    ReturnToHome: ["Retour au site de rattachement", "fa-house"],
    ReturnToHolding: ["Retour au site de détention", "fa-location-dot"],
    RotatingCollection: ["Collection tournante", "fa-arrows-rotate"],
    Reserve: ["Réservation", "fa-bookmark"],
    LostReserve: ["Réservation sur document perdu", "fa-triangle-exclamation"],
    CancelReserve: ["Réservation annulée", "fa-bookmark"],
    TransferCancellation: ["Annulation de transfert", "fa-xmark"],
    Recall: ["Rappel", "fa-bell"],
    RecallCancellation: ["Rappel annulé", "fa-bell-slash"],
    LibraryFloatLimit: ["Limite de flottement", "fa-water"]
};

const CANCELLATION_REASON_LABELS = {
    Manual: ["Annulation manuelle", "fa-hand"],
    StockrotationAdvance: ["Rotation de stock", "fa-rotate"],
    StockrotationRepatriation: ["Retour de rotation", "fa-rotate-left"],
    ReturnToHome: ["Retour au rattachement", "fa-house"],
    ReturnToHolding: ["Retour à la détention", "fa-location-dot"],
    RotatingCollection: ["Collection tournante", "fa-arrows-rotate"],
    Reserve: ["Réservation", "fa-bookmark"],
    LostReserve: ["Réservation sur document perdu", "fa-triangle-exclamation"],
    CancelReserve: ["Réservation annulée", "fa-bookmark"],
    ItemLost: ["Document perdu", "fa-triangle-exclamation"],
    WrongTransfer: ["Mauvais transfert", "fa-shuffle"],
    RecallCancellation: ["Rappel annulé", "fa-bell-slash"]
};

function reasonInfo(t) {
    const cancelled = Boolean(t.Annule_le || t.datecancelled);
    const raw = cancelled
        ? (t.Raison_annulation ?? t.cancellation_reason ?? "")
        : (t.Raison ?? t.reason ?? "");

    const map = cancelled ? CANCELLATION_REASON_LABELS : TRANSFER_REASON_LABELS;

    if (!raw) {
        return {
            raw: "",
            label: "Motif non renseigné",
            icon: "fa-circle-question"
        };
    }

    const found = map[String(raw)];

    return found
        ? { raw: String(raw), label: found[0], icon: found[1] }
        : { raw: String(raw), label: String(raw), icon: "fa-circle-info" };
}

function movementDirection(homeCode, fromCode, toCode, cancelled = false) {
    const home = String(homeCode || "");
    const from = String(fromCode || "");
    const to = String(toCode || "");

    if (home && from === home && to && to !== home) {
        return {
            kind: cancelled ? "cancelled" : "out",
            arrow: "==>",
            semantic: "Départ du site de rattachement"
        };
    }

    if (home && to === home && from && from !== home) {
        return {
            kind: cancelled ? "cancelled" : "home",
            arrow: "<==",
            semantic: "Retour vers le site de rattachement"
        };
    }

    return {
        kind: cancelled ? "cancelled" : "network",
        arrow: "==>",
        semantic: "Déplacement entre sites du réseau"
    };
}

function routeVisual(homeCode, t, libs) {
    const fromCode = String(t.From_Site ?? t.frombranch ?? "");
    const toCode = String(t.To_Site ?? t.tobranch ?? "");

    const from = libs.get(fromCode) || fromCode || "?";
    const to = libs.get(toCode) || toCode || "?";
    const cancelled = Boolean(t.Annule_le || t.datecancelled);
    const dir = movementDirection(homeCode, fromCode, toCode, cancelled);

    if (homeCode && toCode === String(homeCode) && fromCode !== String(homeCode)) {
        const homeName = libs.get(String(homeCode)) || String(homeCode);

        return {
            ...dir,
            left: homeName,
            right: from,
            real: `${from} → ${homeName}`
        };
    }

    return {
        ...dir,
        left: from,
        right: to,
        real: `${from} → ${to}`
    };
}


function checkoutSiteCode(checkout) {
    return String(
        checkout?.library_id ??
        checkout?.checkout_library_id ??
        checkout?.branchcode ??
        ""
    );
}

function checkoutItemId(checkout) {
    return String(
        checkout?.item_id ??
        checkout?.itemnumber ??
        ""
    );
}

function buildLoanStatsForItem(item, checkouts, libs) {
    const homeCode = String(itemVal(item, "home_library_id", "homebranch") || "");
    const itemId = String(itemVal(item, "item_id", "itemnumber") || "");

    const relevant = (checkouts || []).filter((c) => checkoutItemId(c) === itemId);
    const bySite = new Map();

    relevant.forEach((checkout) => {
        const code = checkoutSiteCode(checkout);
        if (!code) return;
        bySite.set(code, (bySite.get(code) || 0) + 1);
    });

    const total = Array.from(bySite.values()).reduce((sum, n) => sum + n, 0);
    const atHome = homeCode ? (bySite.get(homeCode) || 0) : 0;
    const outside = Math.max(0, total - atHome);

    const sites = [...bySite.entries()]
        .map(([code, count]) => ({
            code,
            name: libs.get(code) || code,
            count,
            isHome: Boolean(homeCode && code === homeCode),
            pct: total ? Math.round((count / total) * 100) : 0
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"));

    return { total, atHome, outside, sites, homeCode };
}

function buildNoticeLoanStats(byItem, checkouts, libs) {
    let total = 0;
    let atHome = 0;
    let outside = 0;
    const loanSites = new Set();

    byItem.forEach((record) => {
        const stats = buildLoanStatsForItem(record.item || {}, checkouts, libs);
        total += stats.total;
        atHome += stats.atHome;
        outside += stats.outside;
        stats.sites.forEach((s) => loanSites.add(s.code));
    });

    return { total, atHome, outside, loanSites: loanSites.size };
}

function loanSitesHtml(stats) {
    if (!stats || !stats.total) {
        return '<div class="kxmv-loan-empty">Aucun lieu de prêt historique exploitable.</div>';
    }

    return `<div class="kxmv-loan-sites">
        ${stats.sites.map((site) => `
            <div class="kxmv-loan-site ${site.isHome ? "is-home" : "is-away"}">
                <div class="kxmv-loan-site-top">
                    <span class="kxmv-loan-site-name">${site.isHome ? '<i class="fa-solid fa-house"></i> ' : '<i class="fa-solid fa-building"></i> '}${esc(site.name)}</span>
                    <strong>${site.count}</strong>
                </div>
                <div class="kxmv-loan-bar"><span style="width:${Math.max(3, site.pct)}%"></span></div>
                <div class="kxmv-loan-site-foot">${site.pct}% ${site.isHome ? "· site propriétaire" : "· hors site propriétaire"}</div>
            </div>
        `).join("")}
    </div>`;
}


/* ============================================================
 * API / RAPPORT — UNIQUEMENT APRÈS CLIC
 * ============================================================ */

async function getJson(url) {
    const response = await KOHA_QUEUE.fetch(url, {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" }
    });

    if (!response.ok) {
        const error = new Error(`Koha HTTP ${response.status}`);
        error.status = response.status;
        throw error;
    }

    return {
        data: await response.json(),
        response
    };
}

async function getPaged(url, perPage = 100) {
    const all = [];
    let page = 1;

    while (page <= 100) {
        const u = new URL(url, location.origin);
        u.searchParams.set("_page", String(page));
        u.searchParams.set("_per_page", String(perPage));

        const { data, response } = await getJson(u.toString());

        if (!Array.isArray(data)) break;
        all.push(...data);

        const total = Number(response.headers.get("X-Total-Count") || 0);

        if ((total && all.length >= total) || data.length < perPage) break;

        page += 1;
    }

    return all;
}

async function loadLibraries() {
    if (librariesPromise) return librariesPromise;

    librariesPromise = (async () => {
        try {
            const { data } = await getJson("/api/v1/public/libraries");
            const map = new Map();

            (Array.isArray(data) ? data : []).forEach((library) => {
                map.set(String(library.library_id), library.name || library.library_id);
            });

            return map;
        } catch (_) {
            return new Map();
        }
    })();

    return librariesPromise;
}

async function loadTransfers(biblioId) {
    if (!TRANSFER_REPORT_ID) return [];

    const all = [];
    let cursor = 0;
    let lots = 0;

    while (lots < 200) {
        lots += 1;

        const u = new URL("/cgi-bin/koha/svc/report", location.origin);
        u.searchParams.set("id", String(TRANSFER_REPORT_ID));
        u.searchParams.set("annotated", "1");
        u.searchParams.append("param_names", "Biblionumber");
        u.searchParams.append("sql_params", String(biblioId));
        u.searchParams.append("param_names", "Après ID");
        u.searchParams.append("sql_params", String(cursor));

        const { data } = await getJson(u.toString());

        if (!Array.isArray(data) || !data.length) break;

        all.push(...data);

        const last = Number(
            data[data.length - 1].Transfer_ID ??
            data[data.length - 1].transfer_id ??
            0
        );

        if (!Number.isFinite(last) || last <= cursor) break;

        cursor = last;

        if (data.length < 500) break;
    }

    return all;
}

async function loadNoticeData(biblioId) {
    const cached = cacheGet(biblioId);
    if (cached) return cached;

    // Important : cette fonction n'est appelée QUE depuis un gestionnaire de clic.
    const libs = await loadLibraries();
    const items = await getPaged(
        `/api/v1/public/biblios/${encodeURIComponent(biblioId)}/items`,
        100
    );
    const transfers = await loadTransfers(biblioId);
    const checkouts = await getPaged(
        `/api/v1/biblios/${encodeURIComponent(biblioId)}/checkouts?checked_in=true`,
        100
    );

    const byItem = new Map();

    items.forEach((item) => {
        const id = String(itemVal(item, "item_id", "itemnumber") || "");
        if (!id) return;

        byItem.set(id, {
            item,
            transfers: []
        });
    });

    transfers.forEach((transfer) => {
        const id = String(
            transfer.Item_ID ??
            transfer.item_id ??
            transfer.itemnumber ??
            ""
        );

        if (!id) return;

        if (!byItem.has(id)) {
            byItem.set(id, {
                item: null,
                transfers: []
            });
        }

        byItem.get(id).transfers.push(transfer);
    });

    const data = {
        biblioId: String(biblioId),
        libs,
        items,
        transfers,
        checkouts,
        byItem
    };

    cacheSet(biblioId, data);
    return data;
}

/* ============================================================
 * STYLE COMPACT
 * ============================================================ */

const style = document.createElement("style");
style.textContent = `
.kxmv-notice-btn {
    display:inline-flex;
    align-items:center;
    gap:4px;
    margin-left:6px;
    padding:3px 7px;
    border:1px solid #c7d5bc;
    border-radius:6px;
    background:#f7fbf4;
    color:#526d22;
    font-size:11px;
    font-weight:700;
    cursor:pointer;
}
.kxmv-item-btn,
.kxmv-notice-item-detail-btn,
.kxmv-history-link {
    display:inline-flex;
    align-items:center;
    gap:3px;
}
.kxmv-panel {
    margin-top:8px;
    padding:8px 9px;
    border:1px solid #dfe6ea;
    border-left:3px solid #6f8f32;
    border-radius:7px;
    background:#fbfcfa;
}
.kxmv-notice-summary {
    display:flex;
    flex-wrap:wrap;
    gap:6px;
    margin-bottom:7px;
}
.kxmv-chip {
    padding:3px 7px;
    border:1px solid #dfe5e9;
    border-radius:999px;
    background:#fff;
    color:#596872;
    font-size:10px;
}
.kxmv-chip strong {
    color:#34444e;
}
.kxmv-items {
    display:grid;
    gap:5px;
}
.kxmv-notice-item {
    display:grid;
    grid-template-columns:minmax(110px,.7fr) 1fr auto;
    gap:7px;
    align-items:center;
    padding:5px 7px;
    border:1px solid #e4e9ec;
    border-radius:6px;
    background:#fff;
    font-size:10px;
}
.kxmv-code {
    font-weight:800;
    color:#34444e;
}
.kxmv-route {
    color:#566875;
}
.kxmv-route strong {
    color:#4b78a0;
}
.kxmv-small-btn {
    border:1px solid #cbd6dd;
    border-radius:5px;
    background:#f7f9fa;
    color:#455d6d;
    padding:2px 6px;
    font-size:10px;
    cursor:pointer;
}
.kxmv-item-panel {
    margin:6px 0 0;
    padding:7px 8px;
    border-top:1px solid #dfe5e8;
    background:#fafcf8;
}
.kxmv-item-head {
    display:flex;
    flex-wrap:wrap;
    align-items:center;
    gap:6px;
    margin-bottom:6px;
}
.kxmv-item-head strong {
    color:#34444e;
}
.kxmv-steps {
    display:flex;
    flex-wrap:wrap;
    gap:5px 6px;
}
.kxmv-step {
    display:inline-flex;
    flex-wrap:wrap;
    align-items:center;
    gap:4px;
    padding:3px 6px;
    border:1px solid #dfe5e9;
    border-radius:6px;
    background:#fff;
    font-size:10px;
}
.kxmv-direction {
    font-weight:800;
}
.kxmv-direction.is-out {
    color:#356b91;
}
.kxmv-direction.is-home {
    color:#55752d;
}
.kxmv-direction.is-network {
    color:#6b5686;
}
.kxmv-direction.is-cancelled {
    color:#9c453f;
    text-decoration:line-through;
}
.kxmv-reason {
    color:#6b7780;
}
.kxmv-loading,
.kxmv-error,
.kxmv-empty {
    padding:6px 4px;
    color:#6c7881;
    font-size:10px;
}
.kxmv-error {
    color:#98433c;
}

/* Version enrichie des mouvements en résultats */
.kxmv-panel {
    padding: 10px 11px;
}
.kxmv-notice-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(105px,1fr));
    gap: 7px;
}
.kxmv-summary-card {
    padding: 7px 8px;
    border: 1px solid #e0e6e9;
    border-radius: 7px;
    background: #fff;
}
.kxmv-summary-card span {
    display:block;
    color:#7a8790;
    font-size:9px;
    font-weight:800;
    text-transform:uppercase;
}
.kxmv-summary-card strong {
    display:block;
    margin-top:3px;
    color:#35444e;
    font-size:14px;
}
.kxmv-notice-item {
    grid-template-columns: minmax(125px,.65fr) minmax(160px,1fr) minmax(170px,1.1fr) auto;
}
.kxmv-notice-item-detail {
    grid-column: 1 / -1;
    padding: 8px 9px;
    margin-top: 3px;
    border-top: 1px solid #e3e8eb;
    background: #fafcf8;
}
.kxmv-section-title {
    display:flex;
    align-items:center;
    gap:5px;
    margin:7px 0 5px;
    color:#43545f;
    font-size:10px;
    font-weight:800;
}
.kxmv-loan-kpis {
    display:grid;
    grid-template-columns:repeat(4,minmax(90px,1fr));
    gap:5px;
    margin:6px 0;
}
.kxmv-loan-kpi {
    padding:5px 6px;
    border:1px solid #e2e7ea;
    border-radius:6px;
    background:#fff;
}
.kxmv-loan-kpi span {
    display:block;
    color:#7a8790;
    font-size:8px;
    font-weight:800;
    text-transform:uppercase;
}
.kxmv-loan-kpi strong {
    display:block;
    margin-top:2px;
    color:#35444e;
    font-size:12px;
}
.kxmv-loan-sites {
    display:grid;
    grid-template-columns:repeat(auto-fit,minmax(145px,1fr));
    gap:5px;
}
.kxmv-loan-site {
    padding:5px 6px;
    border:1px solid #dfe5e9;
    border-radius:6px;
    background:#fff;
    font-size:9px;
}
.kxmv-loan-site.is-home {
    background:#f7fbf4;
    border-color:#cfdfc1;
}
.kxmv-loan-site.is-away {
    background:#f8fafc;
    border-color:#d5e0e8;
}
.kxmv-loan-site-top {
    display:flex;
    justify-content:space-between;
    gap:5px;
    align-items:center;
}
.kxmv-loan-site-name {
    font-weight:700;
    color:#455660;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
}
.kxmv-loan-bar {
    height:3px;
    margin-top:4px;
    border-radius:4px;
    background:#e9eef1;
    overflow:hidden;
}
.kxmv-loan-bar span {
    display:block;
    height:100%;
    background:#6f8f32;
}
.kxmv-loan-site.is-away .kxmv-loan-bar span {
    background:#4b78a0;
}
.kxmv-loan-site-foot {
    margin-top:2px;
    color:#7a858d;
    font-size:8px;
}
@media(max-width:1000px) {
    .kxmv-notice-summary,
    .kxmv-loan-kpis {
        grid-template-columns:repeat(2,minmax(90px,1fr));
    }
    .kxmv-notice-item {
        grid-template-columns:1fr;
    }
}

@media(max-width:850px) {
    .kxmv-notice-item {
        grid-template-columns:1fr;
    }
}
`;
document.head.appendChild(style);

/* ============================================================
 * RENDU EXEMPLAIRE
 * ============================================================ */

function latestTransfer(transfers) {
    return [...transfers].sort((a,b) => {
        const da = parseDate(transferDate(a))?.getTime() || 0;
        const db = parseDate(transferDate(b))?.getTime() || 0;
        return db - da;
    })[0] || null;
}

function renderItemPanel(panel, record, itemNode, data) {
    const item = record?.item || {};
    const transfers = record?.transfers || [];

    const homeCode = String(
        itemVal(item, "home_library_id", "homebranch") || ""
    );

    const holdingCode = String(
        itemVal(item, "holding_library_id", "holdingbranch") || ""
    );

    const info = getItemInfo(itemNode);

    const home = data.libs.get(homeCode) || homeCode || "—";
    const holding = data.libs.get(holdingCode) || holdingCode || home || "—";
    const loanStats = buildLoanStatsForItem(item, data.checkouts || [], data.libs);

    const steps = [...transfers]
        .sort((a,b) => {
            const da = parseDate(transferDate(a))?.getTime() || 0;
            const db = parseDate(transferDate(b))?.getTime() || 0;
            return da - db;
        })
        .map((t) => {
            const route = routeVisual(homeCode, t, data.libs);
            const reason = reasonInfo(t);
            const state = getTransferState(t);
            const status = state === "cancelled"
                ? "Annulé"
                : (state === "requested" || state === "sent")
                    ? "En cours"
                    : "Arrivé";

            return `<span class="kxmv-step">
                <span>${esc(fmtDate(transferDate(t)))}</span>
                <span class="kxmv-direction is-${esc(route.kind)}" title="${esc(route.semantic)} · mouvement réel : ${esc(route.real)}">${esc(route.left)} ${esc(route.arrow)} ${esc(route.right)}</span>
                <span class="kxmv-reason"><i class="fa-solid ${esc(reason.icon)}"></i> ${esc(reason.label)} · ${esc(status)}</span>
            </span>`;
        })
        .join("");

    panel.innerHTML = `
        <div class="kxmv-item-head">
            <strong><i class="fa-solid fa-route"></i> ${esc(info.barcode || "Exemplaire")}</strong>
            <span class="kxmv-chip">Rattachement <strong>${esc(home)}</strong></span>
            <span class="kxmv-chip">Actuel <strong>${esc(holding)}</strong></span>
            <span class="kxmv-chip">Transferts <strong>${transfers.length}</strong></span>
        </div>
        <div class="kxmv-section-title"><i class="fa-solid fa-route"></i> Parcours des transferts</div>
        <div class="kxmv-steps">
            ${steps || '<span class="kxmv-empty">Aucun transfert historique enregistré.</span>'}
        </div>

        <div class="kxmv-section-title"><i class="fa-solid fa-building-columns"></i> Lieux de prêt par rapport au site propriétaire</div>
        <div class="kxmv-loan-kpis">
            <div class="kxmv-loan-kpi"><span>Prêts connus</span><strong>${loanStats.total}</strong></div>
            <div class="kxmv-loan-kpi"><span>Propriétaire</span><strong>${loanStats.atHome}</strong></div>
            <div class="kxmv-loan-kpi"><span>Hors site</span><strong>${loanStats.outside}</strong></div>
            <div class="kxmv-loan-kpi"><span>Sites de prêt</span><strong>${loanStats.sites.length}</strong></div>
        </div>
        ${loanSitesHtml(loanStats)}
    `;
}

/* ============================================================
 * RENDU NOTICE
 * ============================================================ */

function renderNoticePanel(panel, data) {
    const sites = new Set();
    let lastMove = null;

    data.byItem.forEach((record) => {
        const item = record.item || {};

        const home = itemVal(item, "home_library_id", "homebranch");
        const holding = itemVal(item, "holding_library_id", "holdingbranch");

        if (home) sites.add(String(home));
        if (holding) sites.add(String(holding));

        record.transfers.forEach((t) => {
            const from = t.From_Site ?? t.frombranch;
            const to = t.To_Site ?? t.tobranch;

            if (from) sites.add(String(from));
            if (to) sites.add(String(to));

            const d = parseDate(transferDate(t));
            if (d && (!lastMove || d > lastMove)) lastMove = d;
        });
    });

    const noticeLoanStats = buildNoticeLoanStats(data.byItem, data.checkouts || [], data.libs);

    const itemsHtml = [...data.byItem.entries()].map(([itemId, record]) => {
        const item = record.item || {};
        const transfers = record.transfers || [];

        const barcode =
            itemVal(item, "external_id", "barcode") ||
            `Exemplaire ${itemId}`;

        const homeCode = String(
            itemVal(item, "home_library_id", "homebranch") || ""
        );

        const holdingCode = String(
            itemVal(item, "holding_library_id", "holdingbranch") || ""
        );

        const home = data.libs.get(homeCode) || homeCode || "—";
        const holding = data.libs.get(holdingCode) || holdingCode || home || "—";

        const last = latestTransfer(transfers);
        const loanStats = buildLoanStatsForItem(item, data.checkouts || [], data.libs);
        const lastVisual = last ? routeVisual(homeCode, last, data.libs) : null;
        const lastReason = last ? reasonInfo(last) : null;

        return `<div class="kxmv-notice-item" data-kxmv-notice-item="${esc(itemId)}">
            <div class="kxmv-code">${esc(barcode)}</div>
            <div class="kxmv-route">
                <strong>${esc(home)}</strong> → ${esc(holding)}<br>
                ${transfers.length} transfert(s)
                ${lastVisual ? ` · ${esc(lastVisual.left)} ${esc(lastVisual.arrow)} ${esc(lastVisual.right)}` : ""}
            </div>
            <div class="kxmv-route">
                ${loanStats.total} prêt(s) connu(s) · ${loanStats.atHome} propriétaire · ${loanStats.outside} hors site
                ${lastReason ? `<br>${esc(lastReason.label)}` : ""}
            </div>
            <button type="button" class="kxmv-small-btn" data-kxmv-open-item="${esc(itemId)}">Voir le détail</button>
            <div class="kxmv-notice-item-detail" data-kxmv-inline-detail="${esc(itemId)}" hidden></div>
        </div>`;
    }).join("");

    panel.innerHTML = `
        <div class="kxmv-notice-summary">
            <div class="kxmv-summary-card"><span>Exemplaires</span><strong>${data.byItem.size}</strong></div>
            <div class="kxmv-summary-card"><span>Transferts</span><strong>${data.transfers.length}</strong></div>
            <div class="kxmv-summary-card"><span>Sites rencontrés</span><strong>${sites.size}</strong></div>
            <div class="kxmv-summary-card"><span>Dernier mouvement</span><strong>${esc(fmtDate(lastMove))}</strong></div>
            <div class="kxmv-summary-card"><span>Prêts connus</span><strong>${noticeLoanStats.total}</strong></div>
            <div class="kxmv-summary-card"><span>Prêts propriétaire</span><strong>${noticeLoanStats.atHome}</strong></div>
            <div class="kxmv-summary-card"><span>Prêts hors propriétaire</span><strong>${noticeLoanStats.outside}</strong></div>
            <div class="kxmv-summary-card"><span>Sites de prêt</span><strong>${noticeLoanStats.loanSites}</strong></div>
        </div>

        ${!TRANSFER_REPORT_ID ? '<div class="kxmv-error">Rapport transferts non configuré : renseigner TRANSFER_REPORT_ID.</div>' : ""}

        <div class="kxmv-items">
            ${itemsHtml || '<div class="kxmv-empty">Aucun exemplaire.</div>'}
        </div>
    `;
}

/* ============================================================
 * OUVERTURE — TOUJOURS SUR CLIC
 * ============================================================ */

async function toggleItemMovements(itemNode, resultRow) {
    let panel = itemNode.querySelector(":scope > .kxmv-item-panel");

    if (panel) {
        panel.hidden = !panel.hidden;
        return;
    }

    const { itemId } = getItemInfo(itemNode);
    const biblioId = getBiblioIdFromResult(resultRow);

    if (!itemId || !biblioId) return;

    panel = document.createElement("div");
    panel.className = "kxmv-item-panel";
    panel.innerHTML = '<div class="kxmv-loading"><i class="fa fa-spinner fa-spin"></i> Chargement…</div>';
    itemNode.appendChild(panel);

    try {
        const data = await loadNoticeData(biblioId);
        const record = data.byItem.get(String(itemId));
        renderItemPanel(panel, record, itemNode, data);
    } catch (error) {
        console.error("[Mouvements recherche / exemplaire]", error);
        panel.innerHTML = `<div class="kxmv-error">Impossible de charger les mouvements : ${esc(error.message || error)}</div>`;
    }
}

function setNoticeInlineItemOpen(panel, resultRow, itemId, open) {
    if (!panel || !itemId) return null;

    itemId = String(itemId);

    const openBtn =
        panel.querySelector(
            `[data-kxmv-open-item="${CSS.escape(itemId)}"]`
        );

    const holder =
        panel.querySelector(
            `[data-kxmv-inline-detail="${CSS.escape(itemId)}"]`
        );

    if (!holder) return null;

    holder.hidden = !open;

    if (openBtn) {
        openBtn.textContent =
            open
                ? "Masquer le détail"
                : "Voir le détail";
    }

    if (
        open
        &&
        holder.dataset.rendered !== "1"
    ) {
        const data = panel._kxmvData;
        if (!data) return holder;

        const itemNode =
            resultRow.querySelector(
                `.kxri-item[data-item-id="${CSS.escape(itemId)}"]`
            );

        const record =
            data.byItem.get(
                String(itemId)
            );

        const fakeNode =
            itemNode ||
            document.createElement("div");

        if (!itemNode) {
            fakeNode.dataset.itemId =
                itemId;

            fakeNode.dataset.barcode =
                itemVal(
                    record?.item || {},
                    "external_id",
                    "barcode"
                ) || "";
        }

        renderItemPanel(
            holder,
            record,
            fakeNode,
            data
        );

        holder.dataset.rendered =
            "1";
    }

    return holder;
}


function installNoticeInlineItemHandlers(
    panel,
    resultRow
) {
    panel
        .querySelectorAll(
            "[data-kxmv-open-item]"
        )
        .forEach(
            openBtn => {

                if (
                    openBtn.dataset
                        .kxmvInlineBound ===
                    "1"
                ) {
                    return;
                }

                openBtn.dataset
                    .kxmvInlineBound =
                    "1";

                openBtn.addEventListener(
                    "click",
                    () => {

                        const itemId =
                            openBtn.dataset
                                .kxmvOpenItem;

                        const holder =
                            panel.querySelector(
                                `[data-kxmv-inline-detail="${CSS.escape(itemId)}"]`
                            );

                        if (!holder) {
                            return;
                        }

                        setNoticeInlineItemOpen(
                            panel,
                            resultRow,
                            itemId,
                            holder.hidden
                        );
                    }
                );
            }
        );
}


async function toggleNoticeMovements(
    resultRow,
    button
) {
    const biblioId =
        getBiblioIdFromResult(
            resultRow
        );

    if (!biblioId) return;

    const targetCell =
        resultRow.querySelector(
            ".kx-notice-cell"
        )
        ||
        resultRow.cells?.[2]
        ||
        resultRow;

    let panel =
        targetCell.querySelector(
            ":scope > .kxmv-panel"
        );

    if (panel) {
        panel.hidden =
            !panel.hidden;

        button?.classList.toggle(
            "is-open",
            !panel.hidden
        );

        return;
    }

    panel =
        document.createElement(
            "div"
        );

    panel.className =
        "kxmv-panel";

    panel.innerHTML =
        '<div class="kxmv-loading"><i class="fa fa-spinner fa-spin"></i> Chargement…</div>';

    targetCell.appendChild(
        panel
    );

    button?.classList.add(
        "is-open"
    );

    panel._kxmvLoadPromise =
        (async () => {

            try {
                const data =
                    await loadNoticeData(
                        biblioId
                    );

                panel._kxmvData =
                    data;

                renderNoticePanel(
                    panel,
                    data
                );

                installNoticeInlineItemHandlers(
                    panel,
                    resultRow
                );
            }
            catch (error) {
                console.error(
                    "[Mouvements recherche / notice]",
                    error
                );

                panel.innerHTML =
                    `<div class="kxmv-error">Impossible de charger les mouvements : ${esc(error.message || error)}</div>`;
            }
        })();

    try {
        await panel._kxmvLoadPromise;
    }
    finally {
        panel._kxmvLoadPromise =
            null;
    }
}


/*
 * Ouvre directement, dans la colonne notice,
 * le détail Mouvements d'un exemplaire précis.
 *
 * Equivalent fonctionnel à :
 *   1. clic sur "Mouvements" de la notice ;
 *   2. clic sur "Voir le détail" de cet exemplaire.
 *
 * Aucun scroll forcé et aucun appel Koha supplémentaire :
 * on réutilise loadNoticeData() et son cache RAM borné.
 */
async function openNoticeMovementItemDetail(
    resultRow,
    itemId
) {
    if (!resultRow || !itemId) {
        return;
    }

    itemId =
        String(itemId);

    const noticeBtn =
        resultRow.querySelector(
            ".kxmv-notice-btn"
        );

    const targetCell =
        resultRow.querySelector(
            ".kx-notice-cell"
        )
        ||
        resultRow.cells?.[2]
        ||
        resultRow;

    let panel =
        targetCell.querySelector(
            ":scope > .kxmv-panel"
        );

    if (!panel) {
        await toggleNoticeMovements(
            resultRow,
            noticeBtn
        );

        panel =
            targetCell.querySelector(
                ":scope > .kxmv-panel"
            );
    }
    else {
        /*
         * Le bouton direct ne doit jamais refermer
         * le panneau notice déjà ouvert.
         */
        panel.hidden =
            false;

        noticeBtn?.classList.add(
            "is-open"
        );

        if (
            panel._kxmvLoadPromise
        ) {
            await panel._kxmvLoadPromise;
        }
    }

    if (!panel) {
        return;
    }

    if (
        panel._kxmvLoadPromise
    ) {
        await panel._kxmvLoadPromise;
    }

    setNoticeInlineItemOpen(
        panel,
        resultRow,
        itemId,
        true
    );
}

/* ============================================================
 * INJECTION DES BOUTONS — AUCUN APPEL KOHA ICI
 * ============================================================ */

function injectResult(resultRow) {
    if (!resultRow || resultRow.dataset.kxmvReady === "1") return;

    const biblioId = getBiblioIdFromResult(resultRow);
    if (!biblioId) return;

    // Bouton notice
    const noticeTools =
        resultRow.querySelector(".kx-notice-head-tools") ||
        resultRow.querySelector(".hold");

    if (noticeTools && !noticeTools.querySelector(".kxmv-notice-btn")) {
        const noticeBtn = document.createElement("button");
        noticeBtn.type = "button";
        noticeBtn.className = "kxmv-notice-btn";
        noticeBtn.innerHTML = '<i class="fa-solid fa-route"></i> Mouvements';
        noticeBtn.title = "Afficher les mouvements des exemplaires de cette notice";

        noticeBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleNoticeMovements(resultRow, noticeBtn);
        });

        noticeTools.appendChild(noticeBtn);
    }

    // Boutons exemplaires
    resultRow.querySelectorAll(".kxri-item[data-item-id]").forEach((itemNode) => {
        if (itemNode.dataset.kxmvReady === "1") return;

        const actions = itemNode.querySelector(".kxri-actions");
        if (!actions) return;

        const info = getItemInfo(itemNode);

        if (!actions.querySelector(".kxmv-item-btn")) {
            const moveBtn = document.createElement("button");
            moveBtn.type = "button";
            moveBtn.className = "kxri-action kxmv-item-btn";
            moveBtn.innerHTML = '<i class="fa-solid fa-route"></i> Mouvements';
            moveBtn.title = "Afficher les mouvements de cet exemplaire";

            moveBtn.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleItemMovements(itemNode, resultRow);
            });

            actions.appendChild(moveBtn);
        }

        if (
            !actions.querySelector(
                ".kxmv-notice-item-detail-btn"
            )
        ) {
            const noticeDetailBtn =
                document.createElement(
                    "button"
                );

            noticeDetailBtn.type =
                "button";

            noticeDetailBtn.className =
                "kxri-action kxmv-notice-item-detail-btn";

            noticeDetailBtn.innerHTML =
                '<i class="fa-solid fa-eye"></i> Voir dans mouvements';

            noticeDetailBtn.title =
                "Ouvrir directement cet exemplaire dans Mouvements de la notice";

            noticeDetailBtn.addEventListener(
                "click",
                async event => {

                    event.preventDefault();
                    event.stopPropagation();

                    try {
                        await openNoticeMovementItemDetail(
                            resultRow,
                            info.itemId
                        );
                    }
                    catch (error) {
                        console.error(
                            "[Mouvements recherche / accès direct exemplaire]",
                            error
                        );
                    }
                }
            );

            actions.appendChild(
                noticeDetailBtn
            );
        }


        if (
            info.barcode &&
            !actions.querySelector(".kxmv-history-link")
        ) {
            const history = document.createElement("a");
            history.className = "kxri-action kxmv-history-link";
            history.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> Historique';
            history.title = "Historique de prêt préfiltré sur cet exemplaire";

            const u = new URL("/cgi-bin/koha/catalogue/issuehistory.pl", location.origin);
            u.searchParams.set("biblionumber", biblioId);
            u.searchParams.set("krt_barcode", info.barcode);
            u.searchParams.set("krt_itemnumber", info.itemId);
            u.hash = "krt-biblio-timeline";

            history.href = u.toString();
            actions.appendChild(history);
        }

        itemNode.dataset.kxmvReady = "1";
    });

    resultRow.dataset.kxmvReady = "1";
}

function scanVisibleResults() {
    document.querySelectorAll('tr[id^="row"]').forEach(injectResult);
}

function init() {
    // IMPORTANT : seulement injection DOM, aucune donnée Koha chargée.
    scanVisibleResults();

    // Les scripts existants peuvent reconstruire les cartes de résultats.
    // MutationObserver = uniquement DOM local, aucune requête Koha.
    const tbody = document.querySelector("table tbody");
    if (tbody) {
        const observer = new MutationObserver(() => {
            window.requestAnimationFrame(scanVisibleResults);
        });

        observer.observe(tbody, {
            childList: true,
            subtree: true
        });
    }

    console.info(
        `[Mouvements recherche] Module prêt. 0 requête au chargement. Cache RAM limité à ${MAX_NOTICE_CACHE} notices.`
    );
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
    init();
}

})();


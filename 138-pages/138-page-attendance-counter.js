/* ============================================================
   138-page-attendance-counter.js
   PimpMyKoha — Compteur de fréquentation
   Version : 2.0.2 — 22/09/2026

   - source métier historique conservée et fiabilisée ;
   - design Koha natif / responsive ;
   - rapports multi-sites et périodes libres ;
   - requêtes Firestore bornées par date ;
   - dédoublonnage du couple site/date ;
   - rapport complet imprimable / PDF ;
   - écritures transactionnelles et ID déterministe site/date ;
   - application Firebase nommée pour cohabiter avec PMK ;
   - initialisation compatible avec le montage dynamique du 138 ;
   - lien bidirectionnel avec le compteur Médiabus 139.
   ============================================================ */
(function(window, document) {
    'use strict';
    if (!window.PMKPages || typeof window.PMKPages.register !== 'function') return;

    const PAGE_SOURCE = `<style>
    /* Styles existants conservés */
    #freqApp {
        --freq-bg: #0f1720;
        --freq-card: #111827;
        --freq-accent: #22c55e;
        --freq-muted: #cbd5e1;
        --freq-glass: rgba(255, 255, 255, 0.12);
        --freq-radius: 10px;
        --freq-pad: 12px;
        --freq-text: #f8fafc;
        --freq-border: rgba(148, 163, 184, 0.35);
        font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: var(--freq-text);
        background: linear-gradient(180deg, #020617 0%, #0f1720 100%);
        min-height: 100vh;
    }
    
    #freqApp .freq-wrap {
        max-width: 1200px;
        margin: 0 auto;
        padding: 18px;
    }
    
    #freqApp header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
    }
    
    #freqApp header h1 {
        font-size: 18px;
        margin: 0;
    }
    
    #freqApp .freq-card {
        background: linear-gradient(180deg, #111827 0%, #0b1220 100%);
        border-radius: var(--freq-radius);
        padding: var(--freq-pad);
        box-shadow: 0 10px 24px rgba(2, 6, 23, 0.65);
        border: 1px solid var(--freq-border);
        margin-bottom: 12px;
    }
    
    #freqApp .freq-row {
        display: flex;
        gap: 10px;
        align-items: center;
    }
    
    #freqApp .freq-controls {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }
    
    #freqApp select,
    #freqApp input[type=date],
    #freqApp input[type=text],
    #freqApp input[type=password],
    #freqApp input[type=number] {
        padding: 8px;
        border-radius: 8px;
        border: 1px solid #64748b;
        background: #f8fafc;
        color: #0f172a;
    }
    
    #freqApp button {
        background: linear-gradient(180deg, #334155, #1e293b);
        border: 1px solid #64748b;
        padding: 8px 10px;
        border-radius: 8px;
        color: #f8fafc;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    #freqApp button:hover {
        background: linear-gradient(180deg, #475569, #334155);
        border-color: #94a3b8;
    }
    
    #freqApp .freq-big {
        font-size: 22px;
        padding: 14px 18px;
    }
    
    #freqApp .freq-counter {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    #freqApp .freq-counter button {
        width: 70px;
        height: 70px;
        font-size: 32px;
        font-weight: bold;
        background: linear-gradient(180deg, #10b981, #059669);
        border: 3px solid #047857;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s;
        color: white;
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }
        
    #freqApp .freq-counter button:hover {
        background: linear-gradient(180deg, #34d399, #10b981);
        border-color: #059669;
        transform: scale(1.1);
        box-shadow: 0 6px 16px rgba(16, 185, 129, 0.5);
    }

    #freqApp .freq-counter button:active {
        transform: scale(0.95);
        box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
    }

    #freqApp .freq-count-box {
        min-width: 100px;
        height: 70px;
        text-align: center;
        font-weight: 700;
        font-size: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 16px;
        background: var(--freq-glass);
        border: 3px solid rgba(255, 255, 255, 0.35);
        margin: 0 12px;
        color: #86efac;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    }
    
    #freqApp .freq-muted {
        color: var(--freq-muted);
        font-size: 13px;
    }
    
    #freqApp .freq-controls .freq-spaced {
        margin-left: auto;
    }
    
    #freqApp .freq-admin-panel {
        display: flex;
        gap: 8px;
        align-items: center;
    }

    #freqApp .freq-stat-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
        background: var(--freq-glass);
        border-radius: var(--freq-radius);
        overflow: hidden;
    }
        
    #freqApp .freq-stat-table th {
        background: linear-gradient(180deg, #16a34a, #15803d);
        color: #ffffff;
        font-weight: 600;
        padding: 12px 8px;
        text-align: left;
        font-size: 13px;
        cursor: pointer;
        user-select: none;
        position: relative;
    }

    #freqApp .freq-stat-table th:hover {
        background: linear-gradient(180deg, #22c55e, #16a34a);
    }

    #freqApp .freq-stat-table th.sortable::after {
        content: "↕";
        position: absolute;
        right: 8px;
        opacity: 0.6;
    }

    #freqApp .freq-stat-table th.sort-asc::after {
        content: "↑";
        opacity: 1;
    }

    #freqApp .freq-stat-table th.sort-desc::after {
        content: "↓";
        opacity: 1;
    }

    #freqApp .freq-stat-table td {
        padding: 10px 8px;
        border-bottom: 1px solid #cbd5e1;
        font-size: 13px;
        color: #0f172a;
        background: #f8fafc;
    }

    #freqApp .freq-stat-table tr:hover td {
        background: #e2e8f0;
    }

    #freqApp .freq-stat-table tr:last-child td {
        border-bottom: none;
    }
    
    #freqApp .freq-small {
        font-size: 13px;
        padding: 8px 10px;
    }
    
    #freqApp .freq-danger {
        background: linear-gradient(180deg, #dc2626, #991b1b);
        border-color: #fecaca;
    }
    
    #freqApp .freq-success {
        background: linear-gradient(180deg, #22c55e, #15803d);
        border-color: #bbf7d0;
    }
    
    #freqApp .freq-update {
        background: linear-gradient(180deg, #2563eb, #1e3a8a);
        border-color: #bfdbfe;
    }
    
    #freqApp footer {
        margin-top: 18px;
        color: var(--freq-muted);
        font-size: 13px;
    }
    
    #freqApp .freq-flex-col {
        display: flex;
        flex-direction: column;
    }
    
    #freqApp .freq-center {
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    #freqApp .freq-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
    }
    
    #freqApp .freq-status {
        font-size: 12px;
        text-align: center;
        margin-top: 8px;
        color: var(--freq-muted);
        min-height: 18px;
    }
    
    /* Modal d'authentification admin */
    #freq-admin-modal {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        z-index: 1000;
        align-items: center;
        justify-content: center;
    }
    
    #freq-admin-modal .modal-content {
        background: #111827;
        padding: 20px;
        border-radius: var(--freq-radius);
        width: 300px;
        max-width: 90%;
        border: 1px solid var(--freq-border);
    }
    
    #freq-admin-modal .modal-header {
        margin-bottom: 15px;
    }
    
    #freq-admin-modal .modal-footer {
        margin-top: 15px;
        display: flex;
        gap: 10px;
        justify-content: flex-end;
    }

    /* Nouveaux styles pour les statistiques améliorées */
    #freqApp .freq-stats-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        margin-bottom: 15px;
        padding: 10px;
        background: rgba(15, 23, 42, 0.65);
        border-radius: var(--freq-radius);
        border: 1px solid var(--freq-border);
    }

    #freqApp .freq-stats-summary {
        display: flex;
        gap: 15px;
        margin-bottom: 15px;
        flex-wrap: wrap;
    }

    #freqApp .freq-stat-card {
        background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
        border-radius: var(--freq-radius);
        padding: 12px;
        min-width: 120px;
        text-align: center;
        border: 1px solid var(--freq-border);
    }

    #freqApp .freq-stat-value {
        font-size: 24px;
        font-weight: bold;
        color: var(--freq-accent);
        margin-bottom: 5px;
    }

    #freqApp .freq-stat-label {
        font-size: 12px;
        color: var(--freq-muted);
    }

    #freqApp .freq-stats-actions {
        display: flex;
        gap: 8px;
        margin-top: 15px;
        justify-content: flex-end;
    }

    #freqApp .freq-pagination {
        display: flex;
        gap: 5px;
        align-items: center;
        justify-content: center;
        margin-top: 15px;
    }

    #freqApp .freq-pagination button {
        min-width: 30px;
        height: 30px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    #freqApp .freq-pagination .freq-page-info {
        margin: 0 10px;
        font-size: 13px;
    }

    #freqApp .freq-search-box {
        display: flex;
        gap: 5px;
        align-items: center;
    }

    #freqApp .freq-search-box input {
        width: 260px;
    }

    #freqApp .freq-stats-advanced {
        background: rgba(15, 23, 42, 0.75);
        border-radius: var(--freq-radius);
        padding: 12px;
        margin-top: 15px;
        border: 1px solid var(--freq-border);
    }

    #freqApp .freq-stats-advanced-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        user-select: none;
    }

    #freqApp .freq-stats-advanced-content {
        margin-top: 10px;
        display: none;
    }

    #freqApp .freq-stats-advanced.open .freq-stats-advanced-content {
        display: block;
    }

    #freqApp .freq-chart-container {
        margin-top: 20px;
        height: 300px;
        background: rgba(15, 23, 42, 0.75);
        border-radius: var(--freq-radius);
        padding: 15px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--freq-border);
    }

    #freqApp .freq-chart-placeholder {
        color: var(--freq-muted);
        text-align: center;
    }

    #freqApp #freq-statsArea {
        overflow-x: auto;
    }

    #freqApp .freq-row {
        flex-wrap: wrap;
    }

    /* Styles pour les tranches horaires */
    #freqApp .freq-hourly-stats {
        margin-top: 20px;
    }

    #freqApp .freq-hourly-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 10px;
        margin-top: 15px;
    }

    #freqApp .freq-hourly-card {
        background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
        border-radius: var(--freq-radius);
        padding: 12px;
        text-align: center;
        border: 1px solid var(--freq-border);
    }

    #freqApp .freq-hourly-time {
        font-size: 14px;
        font-weight: bold;
        color: var(--freq-accent);
        margin-bottom: 8px;
    }

    #freqApp .freq-hourly-counts {
        display: flex;
        justify-content: space-around;
        font-size: 12px;
    }

    #freqApp .freq-hourly-adults {
        color: #3b82f6;
    }

    #freqApp .freq-hourly-kids {
        color: #ef4444;
    }

    #freqApp .freq-hourly-total {
        color: var(--freq-accent);
        font-weight: bold;
    }

    @media (max-width: 760px) {
        #freqApp .freq-grid {
            grid-template-columns: 1fr;
        }
        
        #freqApp .freq-stats-controls {
            flex-direction: column;
            align-items: stretch;
        }
        
        #freqApp .freq-search-box input {
            width: 100%;
        }
        
        #freqApp .freq-stats-summary {
            justify-content: center;
        }
        
        #freqApp .freq-hourly-grid {
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        }
    }


    /* ==========================================================
       PMK 138 v2 — design Koha natif, responsive, sans perte
       ========================================================== */
    #freqApp {
        --freq-bg: #f5f7f8;
        --freq-card: #ffffff;
        --freq-accent: #6f8f32;
        --freq-accent-dark: #526d22;
        --freq-accent-soft: #f2f7e9;
        --freq-muted: #697680;
        --freq-glass: #f7f9fa;
        --freq-text: #28343d;
        --freq-border: #d8dee3;
        --freq-radius: 8px;
        --freq-pad: 14px;
        min-height: 0;
        background: transparent;
        color: var(--freq-text);
        font-family: Arial, Helvetica, sans-serif;
    }

    #freqApp .freq-wrap {
        max-width: 1500px;
        padding: 8px 12px 32px;
    }

    #freqApp header {
        margin: 0 0 14px;
        padding: 18px 22px;
        border: 1px solid #cedbbd;
        border-left: 5px solid var(--freq-accent);
        border-radius: var(--freq-radius);
        background: linear-gradient(135deg, #fff 0%, #f5f9ef 100%);
        box-shadow: 0 1px 2px rgba(0,0,0,.035);
    }

    #freqApp header h1 {
        font-size: 25px;
        color: var(--freq-accent-dark);
        letter-spacing: -.2px;
    }

    #freqApp .freq-card {
        background: var(--freq-card) !important;
        color: var(--freq-text);
        border: 1px solid var(--freq-border);
        box-shadow: 0 1px 3px rgba(35,50,60,.06);
        border-radius: var(--freq-radius);
        margin-bottom: 12px;
    }

    #freqApp .freq-card .freq-card {
        box-shadow: none;
        border-color: #e4e8eb;
        background: #fbfcfc !important;
    }

    #freqApp button,
    #freqApp .freq-small,
    #freqApp .freq-big {
        background: #fff;
        color: #39444d;
        border: 1px solid #bfc8ce;
        border-radius: 5px;
        box-shadow: none;
        font-weight: 600;
    }

    #freqApp button:hover,
    #freqApp .freq-small:hover,
    #freqApp .freq-big:hover {
        background: #f5f8f2;
        border-color: #9caf7d;
        color: var(--freq-accent-dark);
        transform: none;
        box-shadow: none;
    }

    #freqApp .freq-success,
    #freqApp .freq-update,
    #freqApp #freq-btnApplyFilter,
    #freqApp #freq-stats-full-report {
        background: var(--freq-accent) !important;
        border-color: var(--freq-accent) !important;
        color: #fff !important;
    }

    #freqApp .freq-success:hover,
    #freqApp .freq-update:hover,
    #freqApp #freq-btnApplyFilter:hover,
    #freqApp #freq-stats-full-report:hover {
        background: var(--freq-accent-dark) !important;
        border-color: var(--freq-accent-dark) !important;
    }

    #freqApp .freq-danger {
        background: #fff4f4 !important;
        border-color: #dfa9a9 !important;
        color: #8a2525 !important;
    }

    #freqApp select,
    #freqApp input[type=date],
    #freqApp input[type=text],
    #freqApp input[type=password],
    #freqApp input[type=number] {
        background: #fff;
        color: #28343d;
        border: 1px solid #bcc6cd;
        border-radius: 5px;
        min-height: 35px;
    }

    #freqApp select:focus,
    #freqApp input:focus {
        outline: 2px solid rgba(111,143,50,.18);
        border-color: var(--freq-accent);
    }

    #freqApp .freq-count-box {
        min-width: 94px;
        background: var(--freq-accent-soft);
        color: var(--freq-accent-dark);
        border: 2px solid #b8cc98;
        text-shadow: none;
        border-radius: 10px;
    }

    #freqApp .freq-counter button {
        background: var(--freq-accent);
        border: 2px solid var(--freq-accent-dark);
        border-radius: 10px;
        box-shadow: none;
    }

    #freqApp .freq-counter button:hover {
        background: var(--freq-accent-dark);
        transform: none;
        box-shadow: none;
    }

    #freqApp .freq-stats-controls,
    #freqApp .freq-stats-advanced,
    #freqApp .freq-chart-container {
        background: #f7f8f9;
        border: 1px solid var(--freq-border);
    }

    #freqApp .freq-stat-card,
    #freqApp .freq-hourly-card {
        background: #fff;
        border: 1px solid var(--freq-border);
        box-shadow: 0 1px 2px rgba(35,50,60,.04);
    }

    #freqApp .freq-stat-value,
    #freqApp .freq-hourly-time {
        color: var(--freq-accent-dark);
    }

    #freqApp .freq-stat-table {
        border: 1px solid var(--freq-border);
        border-radius: 6px;
        background: #fff;
    }

    #freqApp .freq-stat-table th {
        background: #eef3e7;
        color: #394b28;
        border-bottom: 1px solid #ccd9bb;
    }

    #freqApp .freq-stat-table th:hover {
        background: #e5edda;
    }

    #freqApp .freq-stat-table td {
        color: #28343d;
        background: #fff;
        border-bottom-color: #e8ecef;
    }

    #freqApp .freq-stat-table tr:hover td {
        background: #f7faf4;
    }

    #freqApp .freq-report-toolbar {
        display: grid;
        grid-template-columns: minmax(250px,1.4fr) repeat(2,minmax(155px,.7fr)) minmax(180px,.8fr) auto;
        gap: 10px;
        align-items: end;
        padding: 13px;
        background: #f7f8f9;
        border: 1px solid var(--freq-border);
        border-radius: 6px;
        margin-bottom: 10px;
    }

    #freqApp .freq-report-field > label {
        display: block;
        margin-bottom: 4px;
        color: #596772;
        font-size: 12px;
        font-weight: 700;
    }

    #freqApp .freq-site-picker {
        position: relative;
    }

    #freqApp .freq-site-picker > summary {
        min-height: 35px;
        display: flex;
        align-items: center;
        padding: 7px 10px;
        border: 1px solid #bcc6cd;
        border-radius: 5px;
        background: #fff;
        cursor: pointer;
        list-style: none;
        font-size: 13px;
    }

    #freqApp .freq-site-picker > summary::-webkit-details-marker { display:none; }
    #freqApp .freq-site-picker > summary::after {
        content: '▾';
        margin-left: auto;
        color: #697680;
    }

    #freqApp .freq-site-picker[open] > summary {
        border-color: var(--freq-accent);
        box-shadow: 0 0 0 2px rgba(111,143,50,.12);
    }

    #freqApp .freq-site-picker-panel {
        position: absolute;
        z-index: 50;
        top: calc(100% + 4px);
        left: 0;
        width: min(420px, 90vw);
        max-height: 340px;
        overflow: auto;
        padding: 10px;
        background: #fff;
        border: 1px solid #bfc8ce;
        border-radius: 6px;
        box-shadow: 0 8px 24px rgba(35,50,60,.16);
    }

    #freqApp .freq-site-picker-actions {
        display: flex;
        gap: 6px;
        margin-bottom: 8px;
        padding-bottom: 8px;
        border-bottom: 1px solid #e5e9ec;
    }

    #freqApp .freq-site-options {
        display: grid;
        grid-template-columns: repeat(2,minmax(0,1fr));
        gap: 5px 10px;
    }

    #freqApp .freq-site-option {
        display: flex;
        align-items: center;
        gap: 7px;
        min-height: 30px;
        padding: 4px 6px;
        border-radius: 4px;
        font-size: 12px;
    }
    #freqApp .freq-site-option:hover { background:#f5f8f2; }

    #freqApp .freq-period-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin: 0 0 10px;
    }

    #freqApp .freq-report-meta {
        padding: 8px 10px;
        margin-bottom: 10px;
        border-left: 4px solid var(--freq-accent);
        background: #f6f9f1;
        color: #56634b;
        font-size: 12px;
        border-radius: 0 5px 5px 0;
    }

    #freqApp footer.freq-card {
        background: #f7f8f9 !important;
        color: #697680;
        border-style: dashed;
    }

    #freq-admin-modal {
        z-index: 2147483000;
        background: rgba(32,42,50,.55);
    }
    #freq-admin-modal .modal-content {
        background: #fff;
        color: #28343d;
        border-color: #ccd4d9;
        box-shadow: 0 18px 50px rgba(0,0,0,.2);
    }

    @media (max-width: 1050px) {
        #freqApp .freq-report-toolbar {
            grid-template-columns: repeat(2,minmax(0,1fr));
        }
        #freqApp .freq-report-toolbar .freq-report-run { grid-column: 1 / -1; }
    }

    @media (max-width: 700px) {
        #freqApp .freq-wrap { padding: 4px 6px 24px; }
        #freqApp header { align-items: flex-start; padding: 14px; }
        #freqApp header h1 { font-size: 21px; }
        #freqApp .freq-report-toolbar { grid-template-columns: 1fr; }
        #freqApp .freq-report-toolbar .freq-report-run { grid-column: auto; }
        #freqApp .freq-site-options { grid-template-columns: 1fr; }
        #freqApp .freq-stats-summary { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
        #freqApp .freq-stat-card { min-width:0; }
        #freqApp .freq-counter { justify-content:center; width:100%; }
        #freqApp .freq-card { padding: 11px; }
    }
</style>
<div id="freqApp">
<div class="freq-wrap"><header>
<h1>Compteur de fr&eacute;quentation</h1>
<div class="freq-row">
<div id="freq-userBadge" class="freq-muted">Non connect&eacute;</div>
<button id="freq-btnSignIn" class="freq-small">Se connecter</button> <button id="freq-btnSignOut" class="freq-small" style="display: none;">D&eacute;connexion</button></div>
</header><!-- Sélection lieu/date -->
<section class="freq-card">
<div class="freq-row" style="gap: 12px;">
<div style="min-width: 220px;"><label class="freq-muted">Lieu</label><br /><select id="freq-selectLocation">
<option value="">Chargement...</option>
</select></div>
<div><label class="freq-muted">Date</label><br /><input type="date" id="freq-inputDate" /></div>
<div class="freq-controls freq-spaced"><button id="freq-btnQuickToday" class="freq-small">Aujourd'hui</button> <button id="freq-btnReset" class="freq-small">R&eacute;initialiser</button> <button id="freq-btnUpdate" class="freq-small freq-update">Mettre &agrave; jour</button></div>
</div>
<!-- Compteurs -->
<div class="freq-grid" style="margin-top: 12px;">
<div class="freq-card" style="padding: 10px;">
<div class="freq-row">
<div>
<div class="freq-muted">Adultes</div>
<div class="freq-row" style="margin-top: 8px;"><button id="freq-decAdults" class="freq-small">&minus;</button>
<div class="freq-count-box" id="freq-countAdults">0</div>
<button id="freq-incAdults" class="freq-small">+</button></div>
</div>
</div>
<div style="margin-top: 8px;"><label class="freq-muted freq-small">Notes (optionnel)</label><br /><input type="text" id="freq-noteAdults" placeholder="ex: animation, &eacute;v&eacute;nement..." /></div>
</div>
<div class="freq-card" style="padding: 10px;">
<div class="freq-row">
<div>
<div class="freq-muted">Enfants</div>
<div class="freq-row" style="margin-top: 8px;"><button id="freq-decKids" class="freq-small">&minus;</button>
<div class="freq-count-box" id="freq-countKids">0</div>
<button id="freq-incKids" class="freq-small">+</button></div>
</div>
</div>
<div style="margin-top: 8px;"><label class="freq-muted freq-small">Notes (optionnel)</label><br /><input type="text" id="freq-noteKids" placeholder="ex: atelier jeunesse..." /></div>
</div>
</div>
<div class="freq-row" style="margin-top: 12px;"><button id="freq-btnExportCSV" class="freq-small">Export CSV (filtre)</button> <button id="freq-btnExportHourly" class="freq-small">Export Horaire D&eacute;taill&eacute;</button>
<div class="freq-spaced freq-muted">Derni&egrave;re sauvegarde : <span id="freq-lastSaved">&mdash;</span></div>
</div>
<div class="freq-status" id="freq-status">Pr&ecirc;t</div>
</section>
<!-- Admin -->
<section id="freq-adminSection" class="freq-card" style="display: none;">
<h3 style="margin-top: 0; color: var(--freq-accent);">Gestion des lieux</h3>
<!-- Ajouter un lieu -->
<div class="freq-row">
<div class="freq-flex-col" style="gap: 6px;"><label class="freq-muted">Ajouter un lieu</label> <input type="text" id="freq-newLocationName" placeholder="Nom du lieu" /></div>
<div class="freq-flex-col"><label class="freq-muted">Semaines compt&eacute;es/an</label> <input type="number" id="freq-newLocationWeeks" value="8" min="1" /></div>
<div style="display: flex; align-items: end; gap: 6px;"><label class="freq-muted freq-small"> <input type="checkbox" id="freq-newLocationExtrapolate" /> Extrapolation </label> <button id="freq-btnAddLocation" class="freq-small">Ajouter</button></div>
</div>
<!-- Modifier un lieu -->
<div class="freq-row" style="margin-top: 12px;">
<div class="freq-flex-col" style="gap: 6px;"><label class="freq-muted">Modifier un lieu</label><select id="freq-editLocation">
<option value="">S&eacute;lectionner un lieu &agrave; modifier</option>
</select></div>
<div class="freq-flex-col"><label class="freq-muted">Nouveau nom</label> <input type="text" id="freq-editLocationName" placeholder="Nouveau nom" /></div>
<div class="freq-flex-col"><label class="freq-muted">Semaines</label> <input type="number" id="freq-editLocationWeeks" value="8" min="1" /></div>
<div style="display: flex; align-items: end; gap: 6px;"><label class="freq-muted freq-small"> <input type="checkbox" id="freq-editLocationExtrapolate" /> Extrapolation </label> <button id="freq-btnEditLocation" class="freq-small">Modifier</button></div>
</div>
<!-- Supprimer un lieu -->
<div class="freq-row" style="margin-top: 12px;">
<div class="freq-flex-col" style="gap: 6px;"><label class="freq-muted">Supprimer un lieu</label><select id="freq-deleteLocation">
<option value="">S&eacute;lectionner un lieu &agrave; supprimer</option>
</select></div>
<div style="display: flex; align-items: end;"><button id="freq-btnDeleteLocation" class="freq-small freq-danger">Supprimer</button></div>
</div>
<!-- Corriger un lieu dans l'historique -->
<div class="freq-row" style="margin-top: 12px; align-items: end; flex-wrap: wrap;">
<div class="freq-flex-col" style="gap: 6px;"><label class="freq-muted">Lieu source</label><select id="freq-fixOldLocation">
<option value="">Lieu &agrave; corriger</option>
</select></div>
<div class="freq-flex-col" style="gap: 6px;"><label class="freq-muted">Nouveau lieu</label><select id="freq-fixNewLocation">
<option value="">Lieu de destination</option>
</select></div>
<div class="freq-flex-col" style="gap: 6px;"><label class="freq-muted">Du</label> <input type="date" id="freq-fixFrom" /></div>
<div class="freq-flex-col" style="gap: 6px;"><label class="freq-muted">Au</label> <input type="date" id="freq-fixTo" /></div>
<div style="display: flex; align-items: end;"><button id="freq-btnFixLocation" class="freq-small freq-update">Corriger l'historique</button></div>
</div>
</section>
<!-- Statistiques améliorées -->
<section class="freq-card">
<div class="freq-report-toolbar">
<div class="freq-report-field"><label>Sites du rapport</label>
<details id="freq-sitePicker" class="freq-site-picker">
<summary id="freq-sitePickerLabel">Tous les sites</summary>
<div class="freq-site-picker-panel">
<div class="freq-site-picker-actions"><button type="button" id="freq-sitesAll" class="freq-small">Tout sélectionner</button><button type="button" id="freq-sitesNone" class="freq-small">Tout désélectionner</button></div>
<div id="freq-statLocationOptions" class="freq-site-options"></div>
</div>
</details></div>
<div class="freq-report-field"><label for="freq-statFrom">Du</label><input type="date" id="freq-statFrom" /></div>
<div class="freq-report-field"><label for="freq-statTo">Au</label><input type="date" id="freq-statTo" /></div>
<div class="freq-report-field"><label for="freq-groupBy">Regrouper</label><select id="freq-groupBy">
<option value="day">Jour</option>
<option value="week">Semaine</option>
<option value="month">Mois</option>
<option value="hour">Heure</option>
<option value="location">Lieu</option>
<option value="hourly">Tranche horaire</option>
</select></div>
<div class="freq-report-run"><button id="freq-btnApplyFilter" class="freq-small">Générer le rapport</button></div>
</div>
<div class="freq-period-actions"><span class="freq-muted" style="align-self:center">Période rapide :</span><button type="button" id="freq-periodMonth" class="freq-small">Ce mois</button><button type="button" id="freq-periodYear" class="freq-small">Cette année</button><button type="button" id="freq-periodAll" class="freq-small">Tout l'historique</button><span style="flex:1"></span><button id="freq-btnExportAll" class="freq-small">Export CSV (tout)</button></div>
<div id="freq-reportMeta" class="freq-report-meta">Sélectionnez une période et un ou plusieurs sites, puis générez le rapport.</div>
<!-- Contrôles des statistiques -->
<div class="freq-stats-controls">
<div class="freq-search-box"><input type="text" id="freq-stats-search" placeholder="Rechercher..." /> <button id="freq-stats-clear-search" class="freq-small">Effacer</button></div>
<div class="freq-controls freq-spaced"><label class="freq-muted">Lignes/page:</label><select id="freq-stats-page-size">
<option value="10">10</option>
<option value="25" selected="selected">25</option>
<option value="50">50</option>
<option value="100">100</option>
</select></div>
</div>
<!-- Résumé des statistiques -->
<div class="freq-stats-summary">
<div class="freq-stat-card">
<div class="freq-stat-value" id="freq-stats-total-entries">0</div>
<div class="freq-stat-label">Journées-site</div>
</div>
<div class="freq-stat-card">
<div class="freq-stat-value" id="freq-stats-total-adults">0</div>
<div class="freq-stat-label">Adultes</div>
</div>
<div class="freq-stat-card">
<div class="freq-stat-value" id="freq-stats-total-kids">0</div>
<div class="freq-stat-label">Enfants</div>
</div>
<div class="freq-stat-card">
<div class="freq-stat-value" id="freq-stats-total-all">0</div>
<div class="freq-stat-label">Total</div>
</div>
<div class="freq-stat-card">
<div class="freq-stat-value" id="freq-stats-avg-per-day">0</div>
<div class="freq-stat-label">Moyenne/jour</div>
</div>
</div>
<!-- Options avancées -->
<div class="freq-stats-advanced" id="freq-stats-advanced">
<div class="freq-stats-advanced-toggle" id="freq-stats-advanced-toggle"><svg width="16" height="16" viewbox="0 0 16 16" fill="currentColor"> <path d="M6 12L10 8L6 4" stroke="currentColor" stroke-width="2" fill="none"></path> </svg> <span>Options avanc&eacute;es</span></div>
<div class="freq-stats-advanced-content">
<div class="freq-row" style="gap: 15px; margin-top: 10px;">
<div><label class="freq-muted">Colonnes &agrave; afficher:</label>
<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px;"><label><input type="checkbox" name="stats-columns" value="date" checked="checked" /> Date</label> <label><input type="checkbox" name="stats-columns" value="location" checked="checked" /> Lieu</label> <label><input type="checkbox" name="stats-columns" value="adults" checked="checked" /> Adultes</label> <label><input type="checkbox" name="stats-columns" value="kids" checked="checked" /> Enfants</label> <label><input type="checkbox" name="stats-columns" value="total" checked="checked" /> Total</label> <label><input type="checkbox" name="stats-columns" value="notes" /> Notes</label> <label><input type="checkbox" name="stats-columns" value="timestamps" /> Horodatages</label></div>
</div>
</div>
</div>
</div>
<!-- Tableau des statistiques -->
<div id="freq-statsArea" style="margin-top: 12px;">
<div class="freq-muted freq-small">Aucun r&eacute;sultat</div>
</div>
<!-- Affichage par tranches horaires -->
<div id="freq-hourlyStats" class="freq-hourly-stats" style="display: none;">
<h4 style="color: var(--freq-accent); margin-bottom: 15px;">R&eacute;partition par Tranches Horaire</h4>
<div class="freq-hourly-grid" id="freq-hourlyGrid"></div>
</div>
<!-- Pagination -->
<div class="freq-pagination" id="freq-stats-pagination" style="display: none;"><button id="freq-stats-first" class="freq-small">&laquo;</button> <button id="freq-stats-prev" class="freq-small">&lsaquo;</button>
<div class="freq-page-info" id="freq-stats-page-info">Page 1 sur 1</div>
<button id="freq-stats-next" class="freq-small">&rsaquo;</button> <button id="freq-stats-last" class="freq-small">&raquo;</button></div>
<!-- Actions -->
<div class="freq-stats-actions"><button id="freq-stats-full-report" class="freq-small">Rapport complet / PDF</button> <button id="freq-stats-export-current" class="freq-small">Exporter r&eacute;sultats actuels</button> <button id="freq-stats-show-chart" class="freq-small">Afficher graphique</button> <button id="freq-stats-show-hourly" class="freq-small">Vue Tranches Horaire</button></div>
<!-- Zone de graphique -->
<div class="freq-chart-container" id="freq-chart-container" style="display: none;">
<div class="freq-chart-placeholder">Graphique des statistiques</div>
</div>
</section>
<footer class="freq-muted freq-small freq-center freq-card">Prototype &mdash; fonctionne hors-ligne pour l'UI, n&eacute;cessite Firebase pour stockage</footer></div>
</div>
<!-- Modal d'authentification admin -->
<div id="freq-admin-modal">
<div class="modal-content">
<div class="modal-header">
<h3 style="margin: 0; color: var(--freq-accent);">Connexion Administrateur</h3>
</div>
<div class="modal-body">
<div class="freq-flex-col" style="gap: 10px;"><label class="freq-muted">Mot de passe administrateur</label> <input type="password" id="freq-admin-password" placeholder="Entrez le mot de passe" />
<div id="freq-admin-error" class="freq-muted" style="color: #ef4444; display: none;">Mot de passe incorrect</div>
</div>
</div>
<div class="modal-footer"><button id="freq-admin-cancel" class="freq-small">Annuler</button> <button id="freq-admin-connect" class="freq-small freq-success">Se connecter</button></div>
</div>
</div>
<script type="module">
    import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
    import { 
        getAuth, 
        signInAnonymously, 
        onAuthStateChanged, 
        signOut 
    } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
    import { 
        getFirestore, 
        collection, 
        addDoc, 
        doc, 
        getDoc, 
        getDocs, 
        query, 
        orderBy, 
        serverTimestamp,
        deleteDoc,
        updateDoc,
        where,
        runTransaction
    } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

    const firebaseConfig = {
        apiKey: "YOUR_FIREBASE_APIKEY",
        authDomain: "YOUR_FIREBASE_AUTHDOMAIN",
        projectId: "YOUR_FIREBASE_PROJECTID",
        storageBucket: "YOUR_FIREBASE_STORAGEBUCKET",
        messagingSenderId: "YOUR_FIREBASE_MESSAGINGSENDERID",
        appId: "YOUR_FIREBASE_APPID"
    };

    const FIREBASE_APP_NAME = 'pmk-attendance-counter';
    const app = getApps().find(a => a.name === FIREBASE_APP_NAME) || initializeApp(firebaseConfig, FIREBASE_APP_NAME);
    const auth = getAuth(app);
    const db = getFirestore(app);

    function getLocalDateString(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return \`\${year}-\${month}-\${day}\`;
    }

    function getDocTimestampMillis(docData) {
        const updated = docData && docData.updatedAt && typeof docData.updatedAt.toMillis === 'function'
            ? docData.updatedAt.toMillis()
            : 0;
        const created = docData && docData.createdAt && typeof docData.createdAt.toMillis === 'function'
            ? docData.createdAt.toMillis()
            : 0;
        return Math.max(updated, created);
    }

    let state = {
        user: null,
        isAdmin: false,
        locations: [],
        current: {
            adults: 0,
            kids: 0,
            date: getLocalDateString(),
            locationId: null
        },
        timestamps: {
            adults: [],
            kids: []
        },
        stats: {
            currentData: [],
            filteredData: [],
            sortField: 'key',
            sortDirection: 'desc',
            currentPage: 1,
            pageSize: 25,
            searchTerm: '',
            visibleColumns: ['date', 'location', 'adults', 'kids', 'total'],
            hourlyData: [],
            rawFilteredRows: [],
            duplicateCount: 0,
            lastLoadMs: 0
        }
    };

    const ADMIN_PASSWORD = "CHANGE_ADMIN_PASSWORD_LOCALLY";

    const el = id => document.getElementById(id);

    function updateStatus(message) {
        el('freq-status').textContent = message;
        console.log('Status:', message);
    }

    function showAdminModal() {
        el('freq-admin-modal').style.display = 'flex';
        el('freq-admin-password').value = '';
        el('freq-admin-error').style.display = 'none';
        el('freq-admin-password').focus();
    }

    function hideAdminModal() {
        el('freq-admin-modal').style.display = 'none';
    }

    function authenticateAdmin() {
        const password = el('freq-admin-password').value;
        if (password === ADMIN_PASSWORD) {
            state.isAdmin = true;
            el('freq-adminSection').style.display = 'block';
            el('freq-userBadge').textContent = 'Administrateur';
            hideAdminModal();
            updateStatus('Connexion admin réussie');
        } else {
            el('freq-admin-error').style.display = 'block';
            el('freq-admin-password').value = '';
            el('freq-admin-password').focus();
            updateStatus('Mot de passe incorrect');
        }
    }

    async function initUI() {
        updateStatus('Initialisation...');
        el('freq-inputDate').value = state.current.date;
        el('freq-statFrom').value = '';
        el('freq-statTo').value = '';
        el('freq-fixFrom').value = state.current.date;
        el('freq-fixTo').value = state.current.date;
        initEvents();
        await loadLocations();
    }

    function initEvents() {
        el('freq-admin-connect').addEventListener('click', authenticateAdmin);
        el('freq-admin-cancel').addEventListener('click', hideAdminModal);

        el('freq-admin-password').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                authenticateAdmin();
            }
        });

        el('freq-btnSignIn').addEventListener('click', showAdminModal);

        el('freq-btnSignOut').addEventListener('click', async () => {
            try {
                await signOut(auth);
                state.isAdmin = false;
                el('freq-adminSection').style.display = 'none';
                updateStatus('Déconnecté');
            } catch (error) {
                console.error('Erreur de déconnexion:', error);
                updateStatus('Erreur de déconnexion');
            }
        });

        el('freq-incAdults').addEventListener('click', async () => {
            await handleIncrement('adults');
        });

        el('freq-decAdults').addEventListener('click', async () => {
            await handleDecrement('adults');
        });

        el('freq-incKids').addEventListener('click', async () => {
            await handleIncrement('kids');
        });

        el('freq-decKids').addEventListener('click', async () => {
            await handleDecrement('kids');
        });

        el('freq-btnQuickToday').addEventListener('click', () => {
            const today = getLocalDateString();
            el('freq-inputDate').value = today;
            state.current.date = today;
            updateStatus('Chargement des données du jour...');
            loadCountsForSelectedDate();
        });

        el('freq-btnReset').addEventListener('click', () => {
            state.current.adults = 0;
            state.current.kids = 0;
            state.timestamps.adults = [];
            state.timestamps.kids = [];
            el('freq-noteAdults').value = '';
            el('freq-noteKids').value = '';
            updateCountsUI();
            updateStatus('Compteurs réinitialisés');
            setTimeout(() => updateStatus('Prêt'), 2000);
        });

        el('freq-btnUpdate').addEventListener('click', async () => {
            updateStatus('Mise à jour des données...');
            await loadCountsForSelectedDate();
            updateStatus('Données mises à jour');
            setTimeout(() => updateStatus('Prêt'), 2000);
        });

        el('freq-btnExportCSV').addEventListener('click', exportFilteredCSV);
        el('freq-btnExportAll').addEventListener('click', exportAllCSV);
        el('freq-btnExportHourly').addEventListener('click', exportHourlyCSV);

        el('freq-btnApplyFilter').addEventListener('click', loadStats);

        el('freq-btnAddLocation').addEventListener('click', addLocation);
        el('freq-btnEditLocation').addEventListener('click', editLocation);
        el('freq-btnDeleteLocation').addEventListener('click', deleteLocation);
        el('freq-btnFixLocation').addEventListener('click', fixLocationHistory);

        el('freq-selectLocation').addEventListener('change', () => {
            state.current.locationId = el('freq-selectLocation').value;
            updateStatus('Chargement des données...');
            loadCountsForSelectedDate();
        });

        el('freq-inputDate').addEventListener('change', () => {
            state.current.date = el('freq-inputDate').value;
            updateStatus('Chargement des données...');
            loadCountsForSelectedDate();
        });

        el('freq-editLocation').addEventListener('change', function() {
            const locationId = this.value;
            const location = state.locations.find(l => l.id === locationId);
            if (location) {
                el('freq-editLocationName').value = location.name;
                el('freq-editLocationWeeks').value = location.defaultWeeks;
                el('freq-editLocationExtrapolate').checked = location.extrapolate;
            }
        });

        el('freq-noteAdults').addEventListener('change', async () => {
            await saveCountWithTimestamps();
        });

        el('freq-noteKids').addEventListener('change', async () => {
            await saveCountWithTimestamps();
        });

        initStatsEvents();
    }

    function selectedStatLocationIds() {
        return Array.from(document.querySelectorAll('#freq-statLocationOptions input[type="checkbox"]:checked'))
            .map(input => input.value)
            .filter(Boolean);
    }

    function updateSitePickerLabel() {
        const selected = selectedStatLocationIds();
        const label = el('freq-sitePickerLabel');
        if (!label) return;
        if (!selected.length) {
            label.textContent = 'Aucun site sélectionné';
            return;
        }
        if (selected.length === state.locations.length) {
            label.textContent = \`Tous les sites (\${selected.length})\`;
            return;
        }
        const names = selected.map(id => state.locations.find(l => l.id === id)?.name || id);
        label.textContent = names.length <= 2 ? names.join(', ') : \`\${names.length} sites sélectionnés\`;
    }

    function setAllStatLocations(checked) {
        document.querySelectorAll('#freq-statLocationOptions input[type="checkbox"]').forEach(input => {
            input.checked = !!checked;
        });
        updateSitePickerLabel();
    }

    function setQuickPeriod(kind) {
        const now = new Date();
        const to = getLocalDateString(now);
        let from = '';
        let end = '';
        if (kind === 'month') {
            from = \`\${now.getFullYear()}-\${String(now.getMonth()+1).padStart(2,'0')}-01\`;
            end = to;
        } else if (kind === 'year') {
            from = \`\${now.getFullYear()}-01-01\`;
            end = to;
        }
        el('freq-statFrom').value = from;
        el('freq-statTo').value = end;
        loadStats();
    }

    function initStatsEvents() {
        el('freq-stats-search').addEventListener('input', function() {
            state.stats.searchTerm = this.value;
            filterAndRenderStats();
        });

        el('freq-stats-clear-search').addEventListener('click', function() {
            el('freq-stats-search').value = '';
            state.stats.searchTerm = '';
            filterAndRenderStats();
        });

        el('freq-stats-page-size').addEventListener('change', function() {
            state.stats.pageSize = parseInt(this.value);
            state.stats.currentPage = 1;
            filterAndRenderStats();
        });

        el('freq-stats-first').addEventListener('click', () => {
            state.stats.currentPage = 1;
            filterAndRenderStats();
        });

        el('freq-stats-prev').addEventListener('click', () => {
            if (state.stats.currentPage > 1) {
                state.stats.currentPage--;
                filterAndRenderStats();
            }
        });

        el('freq-stats-next').addEventListener('click', () => {
            const totalPages = Math.ceil(state.stats.filteredData.length / state.stats.pageSize);
            if (state.stats.currentPage < totalPages) {
                state.stats.currentPage++;
                filterAndRenderStats();
            }
        });

        el('freq-stats-last').addEventListener('click', () => {
            const totalPages = Math.ceil(state.stats.filteredData.length / state.stats.pageSize);
            state.stats.currentPage = totalPages;
            filterAndRenderStats();
        });

        const advancedToggle = el('freq-stats-advanced-toggle');
        if (advancedToggle) {
            advancedToggle.addEventListener('click', function() {
                const advancedPanel = el('freq-stats-advanced');
                if (advancedPanel) advancedPanel.classList.toggle('open');
            });
        }

        document.querySelectorAll('input[name="stats-columns"]').forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                updateVisibleColumns();
                filterAndRenderStats();
            });
        });

        el('freq-stats-export-current').addEventListener('click', exportCurrentResults);

        el('freq-stats-show-chart').addEventListener('click', toggleChart);

        el('freq-stats-show-hourly').addEventListener('click', toggleHourlyView);
        el('freq-stats-full-report').addEventListener('click', generateFullReport);
        el('freq-sitesAll').addEventListener('click', () => setAllStatLocations(true));
        el('freq-sitesNone').addEventListener('click', () => setAllStatLocations(false));
        el('freq-periodMonth').addEventListener('click', () => setQuickPeriod('month'));
        el('freq-periodYear').addEventListener('click', () => setQuickPeriod('year'));
        el('freq-periodAll').addEventListener('click', () => setQuickPeriod('all'));
    }

    function updateVisibleColumns() {
        state.stats.visibleColumns = [];
        document.querySelectorAll('input[name="stats-columns"]:checked').forEach(checkbox => {
            state.stats.visibleColumns.push(checkbox.value);
        });
    }

    let initialAuthSettled = false;
    let resolveInitialAuth;
    let rejectInitialAuth;
    let firebaseSignInInProgress = false;
    const initialAuthReady = new Promise((resolve, reject) => {
        resolveInitialAuth = resolve;
        rejectInitialAuth = reject;
    });

    function settleInitialAuthSuccess(user) {
        if (initialAuthSettled) return;
        initialAuthSettled = true;
        resolveInitialAuth(user);
    }

    function settleInitialAuthError(error) {
        if (initialAuthSettled) return;
        initialAuthSettled = true;
        rejectInitialAuth(error);
    }

    onAuthStateChanged(auth, async (user) => {
        state.user = user;
        if (user) {
            el('freq-userBadge').textContent = user.isAnonymous ? 'Anonyme' : (user.email || user.uid);
            el('freq-btnSignIn').style.display = 'none';
            el('freq-btnSignOut').style.display = 'inline-block';
            updateStatus('Connecté');
            settleInitialAuthSuccess(user);
            return;
        }

        el('freq-userBadge').textContent = 'Non connecté';
        el('freq-btnSignIn').style.display = 'inline-block';
        el('freq-btnSignOut').style.display = 'none';
        state.isAdmin = false;
        el('freq-adminSection').style.display = 'none';
        updateStatus('Connexion Firebase...');

        if (firebaseSignInInProgress) return;
        firebaseSignInInProgress = true;

        try {
            const credential = await signInAnonymously(auth);
            state.user = credential.user;
            settleInitialAuthSuccess(credential.user);
        } catch (error) {
            console.error('Erreur connexion anonyme:', error);
            const code = error && error.code ? error.code : '';
            if (code === 'auth/operation-not-allowed') {
                updateStatus('Connexion anonyme Firebase désactivée');
            } else if (code === 'auth/too-many-requests') {
                updateStatus('Firebase temporairement limité');
            } else {
                updateStatus('Erreur de connexion Firebase');
            }
            settleInitialAuthError(error);
        } finally {
            firebaseSignInInProgress = false;
        }
    });

    async function loadLocations() {
        try {
            updateStatus('Chargement des lieux...');
            state.locations = [];
            const locationsSnapshot = await getDocs(collection(db, 'locations'));
            locationsSnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                state.locations.push({
                    id: docSnap.id,
                    name: data.name,
                    extrapolate: !!data.extrapolate,
                    defaultWeeks: data.defaultWeeks || 8
                });
            });
            state.locations.sort((a, b) => a.name.localeCompare(b.name));
            renderLocations();
            if (state.locations.length > 0) {
                await loadCountsForSelectedDate();
            }
        } catch (error) {
            console.error('Erreur chargement lieux:', error);
            const code = error && error.code ? String(error.code) : '';
            updateStatus(code ? 'Erreur chargement lieux (' + code + ')' : 'Erreur chargement lieux');
        }
    }

    function renderLocations() {
        const selectLocation = el('freq-selectLocation');
        const editLocation = el('freq-editLocation');
        const deleteLocation = el('freq-deleteLocation');
        const fixOldLocation = el('freq-fixOldLocation');
        const fixNewLocation = el('freq-fixNewLocation');

        selectLocation.innerHTML = '';
        editLocation.innerHTML = '<option value="">Sélectionner un lieu à modifier</option>';
        deleteLocation.innerHTML = '<option value="">Sélectionner un lieu à supprimer</option>';
        fixOldLocation.innerHTML = '<option value="">Lieu à corriger</option>';
        fixNewLocation.innerHTML = '<option value="">Lieu de destination</option>';

        state.locations.forEach(location => {
            const option = document.createElement('option');
            option.value = location.id;
            option.textContent = location.name;
            selectLocation.appendChild(option);

            const editOption = document.createElement('option');
            editOption.value = location.id;
            editOption.textContent = location.name;
            editLocation.appendChild(editOption);

            const deleteOption = document.createElement('option');
            deleteOption.value = location.id;
            deleteOption.textContent = location.name;
            deleteLocation.appendChild(deleteOption);

            const fixOldOption = document.createElement('option');
            fixOldOption.value = location.id;
            fixOldOption.textContent = location.name;
            fixOldLocation.appendChild(fixOldOption);

            const fixNewOption = document.createElement('option');
            fixNewOption.value = location.id;
            fixNewOption.textContent = location.name;
            fixNewLocation.appendChild(fixNewOption);
        });

        const statOptions = el('freq-statLocationOptions');
        if (statOptions) {
            statOptions.innerHTML = '';
            state.locations.forEach(location => {
                const label = document.createElement('label');
                label.className = 'freq-site-option';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = location.id;
                checkbox.checked = true;
                checkbox.addEventListener('change', updateSitePickerLabel);
                const text = document.createElement('span');
                text.textContent = location.name;
                label.appendChild(checkbox);
                label.appendChild(text);
                statOptions.appendChild(label);
            });
            updateSitePickerLabel();
        }

        if (!state.current.locationId && state.locations.length > 0) {
            state.current.locationId = state.locations[0].id;
            selectLocation.value = state.current.locationId;
        }

        updateStatus(\`\${state.locations.length} lieux chargés\`);
    }

    async function fixLocationHistory() {
        if (!state.isAdmin) {
            alert('Accès refusé - droits administrateur requis');
            return;
        }

        const oldLocationId = el('freq-fixOldLocation').value;
        const newLocationId = el('freq-fixNewLocation').value;
        const from = el('freq-fixFrom').value;
        const to = el('freq-fixTo').value;

        if (!oldLocationId || !newLocationId) {
            alert('Sélectionnez le lieu source et le nouveau lieu');
            return;
        }

        if (oldLocationId === newLocationId) {
            alert('Le lieu source et le nouveau lieu doivent être différents');
            return;
        }

        if (!from || !to) {
            alert('Sélectionnez une plage de dates');
            return;
        }

        if (from > to) {
            alert('La date de début doit être antérieure ou égale à la date de fin');
            return;
        }

        const oldLocationName = state.locations.find(l => l.id === oldLocationId)?.name || oldLocationId;
        const newLocationName = state.locations.find(l => l.id === newLocationId)?.name || newLocationId;

        if (!confirm(\`Corriger les passages de "\${oldLocationName}" vers "\${newLocationName}" du \${from} au \${to} ?\`)) {
            return;
        }

        try {
            updateStatus('Recherche des entrées à corriger...');

            const snapshot = await getDocs(collection(db, 'counts'));
            const docsToFix = [];

            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                if (data.locationId === oldLocationId && data.date >= from && data.date <= to) {
                    docsToFix.push({ id: docSnap.id, data });
                }
            });

            if (docsToFix.length === 0) {
                updateStatus('Aucune entrée à corriger');
                alert('Aucune entrée trouvée pour ces critères');
                return;
            }

            updateStatus(\`Correction de \${docsToFix.length} entrée(s)...\`);

            for (const entry of docsToFix) {
                await updateDoc(doc(db, 'counts', entry.id), {
                    locationId: newLocationId,
                    correctedFromLocationId: oldLocationId,
                    correctedAt: serverTimestamp(),
                    correctedBy: state.user ? state.user.uid : 'unknown',
                    updatedAt: serverTimestamp()
                });
            }

            if (state.current.locationId === oldLocationId) {
                state.current.locationId = newLocationId;
                el('freq-selectLocation').value = newLocationId;
            }

            await loadCountsForSelectedDate();
            await loadStats();

            updateStatus(\`\${docsToFix.length} entrée(s) corrigée(s)\`);
            alert(\`\${docsToFix.length} entrée(s) corrigée(s) avec succès\`);
            setTimeout(() => updateStatus('Prêt'), 2000);
        } catch (error) {
            console.error('Erreur correction historique lieux:', error);
            updateStatus('Erreur correction historique');
            alert('Erreur lors de la correction des lieux: ' + error.message);
        }
    }

    async function addLocation() {
        if (!state.isAdmin) {
            alert('Accès refusé - droits administrateur requis');
            return;
        }

        const name = el('freq-newLocationName').value.trim();
        const weeks = parseInt(el('freq-newLocationWeeks').value, 10) || 8;
        const extrapolate = el('freq-newLocationExtrapolate').checked;

        if (!name) {
            alert('Veuillez saisir un nom pour le lieu');
            return;
        }

        try {
            updateStatus('Ajout du lieu...');
            await addDoc(collection(db, 'locations'), {
                name: name,
                extrapolate: extrapolate,
                defaultWeeks: weeks,
                createdAt: serverTimestamp()
            });

            el('freq-newLocationName').value = '';
            el('freq-newLocationWeeks').value = '8';
            el('freq-newLocationExtrapolate').checked = false;

            await loadLocations();
            updateStatus('Lieu ajouté avec succès');
            alert('Lieu ajouté avec succès');

        } catch (error) {
            console.error('Erreur ajout lieu:', error);
            updateStatus('Erreur ajout lieu');
            alert('Erreur lors de l\\'ajout du lieu: ' + error.message);
        }
    }

    async function editLocation() {
        if (!state.isAdmin) {
            alert('Accès refusé - droits administrateur requis');
            return;
        }

        const locationId = el('freq-editLocation').value;
        const newName = el('freq-editLocationName').value.trim();
        const weeks = parseInt(el('freq-editLocationWeeks').value, 10) || 8;
        const extrapolate = el('freq-editLocationExtrapolate').checked;

        if (!locationId) {
            alert('Veuillez sélectionner un lieu à modifier');
            return;
        }

        if (!newName) {
            alert('Veuillez saisir un nouveau nom pour le lieu');
            return;
        }

        try {
            updateStatus('Modification du lieu...');
            await updateDoc(doc(db, 'locations', locationId), {
                name: newName,
                extrapolate: extrapolate,
                defaultWeeks: weeks,
                updatedAt: serverTimestamp()
            });

            await loadLocations();
            updateStatus('Lieu modifié avec succès');
            alert('Lieu modifié avec succès');

        } catch (error) {
            console.error('Erreur modification lieu:', error);
            updateStatus('Erreur modification lieu');
            alert('Erreur lors de la modification du lieu: ' + error.message);
        }
    }

    async function deleteLocation() {
        if (!state.isAdmin) {
            alert('Accès refusé - droits administrateur requis');
            return;
        }

        const locationId = el('freq-deleteLocation').value;
        if (!locationId) {
            alert('Veuillez sélectionner un lieu à supprimer');
            return;
        }

        if (!confirm('Êtes-vous sûr de vouloir supprimer ce lieu ? Cette action est irréversible.')) {
            return;
        }

        try {
            updateStatus('Suppression du lieu...');
            await deleteDoc(doc(db, 'locations', locationId));
            await loadLocations();
            updateStatus('Lieu supprimé avec succès');
            alert('Lieu supprimé avec succès');
        } catch (error) {
            console.error('Erreur suppression lieu:', error);
            updateStatus('Erreur suppression lieu');
            alert('Erreur lors de la suppression du lieu: ' + error.message);
        }
    }

    function updateCountsUI() {
        el('freq-countAdults').textContent = state.current.adults;
        el('freq-countKids').textContent = state.current.kids;
    }

    async function mutateCounter(type, delta) {
        if (!state.current.locationId) {
            updateStatus('Veuillez sélectionner un lieu');
            return false;
        }

        state.current.date = el('freq-inputDate').value || getLocalDateString();
        const currentData = await getCurrentCountFromDB();
        const deterministicId = \`\${state.current.locationId}__\${state.current.date}\`.replace(/[^A-Za-z0-9_.-]/g, '_');
        const ref = currentData ? doc(db, 'counts', currentData.id) : doc(db, 'counts', deterministicId);

        const result = await runTransaction(db, async transaction => {
            const snap = await transaction.get(ref);
            const data = snap.exists() ? snap.data() : {};
            let adults = Number(data.adults || 0);
            let kids = Number(data.kids || 0);
            const adultTimestamps = Array.isArray(data.adultTimestamps) ? [...data.adultTimestamps] : [];
            const kidTimestamps = Array.isArray(data.kidTimestamps) ? [...data.kidTimestamps] : [];
            const timestamps = type === 'adults' ? adultTimestamps : kidTimestamps;

            if (delta > 0) {
                if (type === 'adults') adults += 1;
                else kids += 1;
                timestamps.push(new Date().toISOString());
            } else {
                if (type === 'adults') adults = Math.max(0, adults - 1);
                else kids = Math.max(0, kids - 1);
                if (timestamps.length) timestamps.pop();
            }

            const payload = {
                locationId: state.current.locationId,
                date: state.current.date,
                adults,
                kids,
                adultTimestamps,
                kidTimestamps,
                noteAdults: el('freq-noteAdults').value || data.noteAdults || '',
                noteKids: el('freq-noteKids').value || data.noteKids || '',
                userId: state.user ? state.user.uid : 'anonymous',
                updatedAt: serverTimestamp()
            };
            if (!snap.exists()) payload.createdAt = serverTimestamp();
            transaction.set(ref, payload, { merge: true });
            return payload;
        });

        state.current.adults = result.adults;
        state.current.kids = result.kids;
        state.timestamps.adults = result.adultTimestamps;
        state.timestamps.kids = result.kidTimestamps;
        updateCountsUI();
        return true;
    }

    async function handleIncrement(type) {
        try {
            updateStatus('Synchronisation...');
            if (!await mutateCounter(type, 1)) return;
            updateStatus(\`\${type === 'adults' ? 'Adulte' : 'Enfant'} ajouté\`);
            setTimeout(() => updateStatus('Prêt'), 1500);
        } catch (error) {
            console.error('Erreur lors de l\\'incrémentation:', error);
            updateStatus('Erreur');
        }
    }

    async function handleDecrement(type) {
        try {
            updateStatus('Synchronisation...');
            if (!await mutateCounter(type, -1)) return;
            updateStatus('Dernière entrée annulée');
            setTimeout(() => updateStatus('Prêt'), 1500);
        } catch (error) {
            console.error('Erreur lors de la décrémentation:', error);
            updateStatus('Erreur');
        }
    }

    async function getCurrentCountFromDB() {
        if (!state.current.locationId || !state.current.date) {
            return null;
        }

        try {
            const countsQuery = query(
                collection(db, 'counts'),
                where('locationId', '==', state.current.locationId),
                where('date', '==', state.current.date)
            );

            const countsSnapshot = await getDocs(countsQuery);

            if (!countsSnapshot.empty) {
                const allDocs = countsSnapshot.docs;
                const sortedDocs = [...allDocs].sort((a, b) => {
                    return getDocTimestampMillis(b.data()) - getDocTimestampMillis(a.data());
                });
                const docSnap = sortedDocs[0];
                if (allDocs.length > 1) {
                    console.warn('[comptage] Doublons détectés pour même lieu/date, document principal sélectionné:', docSnap.id);
                }
                return {
                    data: docSnap.data(),
                    id: docSnap.id,
                    duplicateCount: allDocs.length
                };
            }

            return null;
        } catch (error) {
            console.error('Erreur récupération données:', error);
            return null;
        }
    }

    async function loadCountsForSelectedDate() {
        if (!state.current.locationId || !state.current.date) {
            updateStatus('Sélectionnez un lieu et une date');
            return;
        }

        try {
            updateStatus('Chargement des compteurs...');
            const currentData = await getCurrentCountFromDB();

            if (currentData) {
                state.current.adults = currentData.data.adults || 0;
                state.current.kids = currentData.data.kids || 0;
                state.timestamps.adults = currentData.data.adultTimestamps || [];
                state.timestamps.kids = currentData.data.kidTimestamps || [];
                el('freq-noteAdults').value = currentData.data.noteAdults || '';
                el('freq-noteKids').value = currentData.data.noteKids || '';
                updateCountsUI();
                updateStatus('Données chargées');
            } else {
                state.current.adults = 0;
                state.current.kids = 0;
                state.timestamps.adults = [];
                state.timestamps.kids = [];
                el('freq-noteAdults').value = '';
                el('freq-noteKids').value = '';
                updateCountsUI();
                updateStatus('Nouvelle journée - compteurs à zéro');
            }

        } catch (error) {
            console.error('Erreur chargement données:', error);
            updateStatus('Erreur chargement données');
        }
    }

    async function saveCountWithTimestamps() {
        if (!state.current.locationId) return;

        const date = el('freq-inputDate').value || getLocalDateString();
        state.current.date = date;
        const payload = {
            locationId: state.current.locationId,
            date,
            adults: state.current.adults,
            kids: state.current.kids,
            adultTimestamps: state.timestamps.adults,
            kidTimestamps: state.timestamps.kids,
            noteAdults: el('freq-noteAdults').value || '',
            noteKids: el('freq-noteKids').value || '',
            userId: state.user ? state.user.uid : 'anonymous',
            updatedAt: serverTimestamp()
        };

        try {
            updateStatus('Sauvegarde...');
            const currentData = await getCurrentCountFromDB();
            const deterministicId = \`\${state.current.locationId}__\${date}\`.replace(/[^A-Za-z0-9_.-]/g, '_');
            const ref = currentData ? doc(db, 'counts', currentData.id) : doc(db, 'counts', deterministicId);
            await runTransaction(db, async transaction => {
                const snap = await transaction.get(ref);
                const next = { ...payload };
                if (!snap.exists()) next.createdAt = serverTimestamp();
                transaction.set(ref, next, { merge: true });
            });
            el('freq-lastSaved').textContent = new Date().toLocaleTimeString();
            updateStatus(currentData ? 'Données mises à jour' : 'Nouvelles données créées');
            setTimeout(() => updateStatus('Prêt'), 1500);
        } catch (error) {
            console.error('Erreur sauvegarde:', error);
            updateStatus('Erreur sauvegarde');
        }
    }

    function exportToCSV(data, filename) {
        if (!data || data.length === 0) {
            alert('Aucune donnée à exporter');
            return;
        }

        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row =>
                headers.map(header => {
                    const value = row[header] || '';
                    return \`"\${String(value).replace(/"/g, '""')}"\`;
                }).join(',')
            )
        ].join('\\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async function exportFilteredCSV() {
        try {
            const locationId = el('freq-selectLocation').value;
            const date = el('freq-inputDate').value;

            updateStatus('Export CSV...');

            const countsQuery = query(
                collection(db, 'counts'),
                where('locationId', '==', locationId),
                where('date', '==', date)
            );

            const countsSnapshot = await getDocs(countsQuery);
            const data = [];

            countsSnapshot.forEach(docSnap => {
                const row = docSnap.data();
                data.push({
                    Date: row.date,
                    Lieu: state.locations.find(l => l.id === locationId)?.name || locationId,
                    Adultes: row.adults || 0,
                    Enfants: row.kids || 0,
                    'Note Adultes': row.noteAdults || '',
                    'Note Enfants': row.noteKids || '',
                    'Utilisateur': row.userId || 'anonymous',
                    'Timestamps Adultes': row.adultTimestamps ? row.adultTimestamps.join('; ') : '',
                    'Timestamps Enfants': row.kidTimestamps ? row.kidTimestamps.join('; ') : ''
                });
            });

            if (data.length === 0) {
                alert('Aucune donnée trouvée pour cette date et ce lieu');
                updateStatus('Aucune donnée à exporter');
                return;
            }

            const locationName = state.locations.find(l => l.id === locationId)?.name || 'lieu';
            exportToCSV(data, \`comptage_\${locationName}_\${date}.csv\`);
            updateStatus('Export CSV terminé');
            setTimeout(() => updateStatus('Prêt'), 2000);

        } catch (error) {
            console.error('Erreur export CSV:', error);
            updateStatus('Erreur export CSV');
            alert('Erreur lors de l\\'export: ' + error.message);
        }
    }

    async function exportAllCSV() {
        try {
            updateStatus('Export CSV complet...');

            const countsSnapshot = await getDocs(collection(db, 'counts'));
            const data = [];

            countsSnapshot.forEach(docSnap => {
                const row = docSnap.data();
                data.push({
                    Date: row.date,
                    Lieu: state.locations.find(l => l.id === row.locationId)?.name || row.locationId,
                    Adultes: row.adults || 0,
                    Enfants: row.kids || 0,
                    'Note Adultes': row.noteAdults || '',
                    'Note Enfants': row.noteKids || '',
                    'Utilisateur': row.userId || 'anonymous',
                    'Timestamps Adultes': row.adultTimestamps ? row.adultTimestamps.join('; ') : '',
                    'Timestamps Enfants': row.kidTimestamps ? row.kidTimestamps.join('; ') : '',
                    'Créé le': row.createdAt ? row.createdAt.toDate().toLocaleString() : ''
                });
            });

            if (data.length === 0) {
                alert('Aucune donnée à exporter');
                updateStatus('Aucune donnée à exporter');
                return;
            }

            exportToCSV(data, 'comptage_complet.csv');
            updateStatus('Export CSV complet terminé');
            setTimeout(() => updateStatus('Prêt'), 2000);

        } catch (error) {
            console.error('Erreur export CSV complet:', error);
            updateStatus('Erreur export CSV complet');
            alert('Erreur lors de l\\'export complet: ' + error.message);
        }
    }

    function exportCurrentResults() {
        try {
            if (!state.stats.filteredData || state.stats.filteredData.length === 0) {
                alert('Aucun résultat actuel à exporter');
                return;
            }

            const rows = state.stats.filteredData.map(item => {
                const locationName = item.locationLabel || state.locations.find(l => l.id === item.location)?.name || item.location || '';
                return {
                    Periode: item.key,
                    Lieu: locationName,
                    Adultes: item.adults,
                    Enfants: item.kids,
                    Total: item.total,
                    Notes: item.notes || '',
                    HorodatagesAdultes: item.adultTimestamps ? item.adultTimestamps.length : 0,
                    HorodatagesEnfants: item.kidTimestamps ? item.kidTimestamps.length : 0
                };
            });

            const dateToken = getLocalDateString();
            exportToCSV(rows, \`stats_resultats_actuels_\${dateToken}.csv\`);
            updateStatus('Export des résultats actuels terminé');
            setTimeout(() => updateStatus('Prêt'), 1500);
        } catch (error) {
            console.error('Erreur export résultats actuels:', error);
            updateStatus('Erreur export résultats actuels');
            alert('Erreur lors de l\\'export des résultats actuels: ' + error.message);
        }
    }

    async function exportHourlyCSV() {
        try {
            updateStatus('Export horaire détaillé...');

            const countsSnapshot = await getDocs(collection(db, 'counts'));
            const hourlyData = [];

            countsSnapshot.forEach(docSnap => {
                const row = docSnap.data();
                const locationName = state.locations.find(l => l.id === row.locationId)?.name || row.locationId;

                if (row.adultTimestamps && row.adultTimestamps.length > 0) {
                    row.adultTimestamps.forEach(timestamp => {
                        const date = new Date(timestamp);
                        hourlyData.push({
                            Date: row.date,
                            Heure: date.getHours() + 'h',
                            Timestamp: timestamp,
                            Lieu: locationName,
                            Type: 'Adulte',
                            Count: 1,
                            Note: row.noteAdults || ''
                        });
                    });
                }

                if (row.kidTimestamps && row.kidTimestamps.length > 0) {
                    row.kidTimestamps.forEach(timestamp => {
                        const date = new Date(timestamp);
                        hourlyData.push({
                            Date: row.date,
                            Heure: date.getHours() + 'h',
                            Timestamp: timestamp,
                            Lieu: locationName,
                            Type: 'Enfant',
                            Count: 1,
                            Note: row.noteKids || ''
                        });
                    });
                }
            });

            if (hourlyData.length === 0) {
                alert('Aucune donnée horaire à exporter');
                updateStatus('Aucune donnée horaire');
                return;
            }

            hourlyData.sort((a, b) => {
                if (a.Date !== b.Date) return a.Date.localeCompare(b.Date);
                return a.Timestamp.localeCompare(b.Timestamp);
            });

            exportToCSV(hourlyData, 'frequentation_horaire_detaille.csv');
            updateStatus('Export horaire terminé');
            setTimeout(() => updateStatus('Prêt'), 2000);

        } catch (error) {
            console.error('Erreur export horaire:', error);
            updateStatus('Erreur export horaire');
            alert('Erreur lors de l\\'export horaire: ' + error.message);
        }
    }

    function dedupeCountRows(rows) {
        const latest = new Map();
        let duplicates = 0;
        rows.forEach(row => {
            const key = \`\${row.locationId || ''}::\${row.date || ''}\`;
            const current = latest.get(key);
            if (!current || Number(row._timestampMillis || 0) >= Number(current._timestampMillis || 0)) {
                if (current) duplicates += 1;
                latest.set(key, row);
            } else {
                duplicates += 1;
            }
        });
        return { rows: [...latest.values()], duplicates };
    }

    async function loadStats() {
        try {
            const selectedLocations = selectedStatLocationIds();
            const selectedSet = new Set(selectedLocations);
            const from = el('freq-statFrom').value;
            const to = el('freq-statTo').value;
            const groupBy = el('freq-groupBy').value;

            if (!selectedLocations.length) {
                updateStatus('Sélectionnez au moins un site');
                el('freq-reportMeta').textContent = 'Aucun site sélectionné.';
                return;
            }
            if (from && to && from > to) {
                updateStatus('Période invalide');
                el('freq-reportMeta').textContent = 'La date de début est postérieure à la date de fin.';
                return;
            }

            updateStatus('Chargement du rapport...');
            state.stats.currentPage = 1;
            const startedAt = performance.now();

            const constraints = [];
            if (from) constraints.push(where('date', '>=', from));
            if (to) constraints.push(where('date', '<=', to));
            const source = constraints.length
                ? query(collection(db, 'counts'), ...constraints)
                : collection(db, 'counts');

            const countsSnapshot = await getDocs(source);
            const rows = [];
            countsSnapshot.forEach(docSnap => {
                const data = docSnap.data();
                rows.push({
                    ...data,
                    id: docSnap.id,
                    _timestampMillis: getDocTimestampMillis(data)
                });
            });

            const deduped = dedupeCountRows(rows);
            const filtered = deduped.rows.filter(row => {
                if (!selectedSet.has(row.locationId)) return false;
                if (from && row.date < from) return false;
                if (to && row.date > to) return false;
                return true;
            });

            state.stats.rawFilteredRows = filtered;
            state.stats.duplicateCount = deduped.duplicates;
            state.stats.lastLoadMs = Math.round(performance.now() - startedAt);

            if (groupBy === 'hourly') processHourlyStats(filtered);
            else processClassicStats(filtered, groupBy);

            const siteCount = new Set(filtered.map(row => row.locationId).filter(Boolean)).size;
            const days = new Set(filtered.map(row => row.date).filter(Boolean)).size;
            const period = from || to ? \`\${from || 'début'} → \${to || 'aujourd\\'hui'}\` : 'tout l\\'historique';
            const duplicateText = deduped.duplicates ? \` · \${deduped.duplicates} doublon(s) historique(s) ignoré(s)\` : '';
            el('freq-reportMeta').textContent = \`\${filtered.length} journée(s)-site · \${days} jour(s) · \${siteCount} site(s) · \${period} · \${state.stats.lastLoadMs} ms\${duplicateText}\`;
            updateStatus(\`\${filtered.length} journées-site chargées\`);

        } catch (error) {
            console.error('Erreur chargement stats:', error);
            updateStatus('Erreur chargement statistiques');
            el('freq-reportMeta').textContent = \`Erreur : \${error.message || error}\`;
            alert('Erreur lors du chargement des statistiques');
        }
    }

    function processClassicStats(filtered, groupBy) {
        const grouped = {};

        function buildLocationLabel(locationIds) {
            if (!locationIds || locationIds.length === 0) {
                return '';
            }

            const names = locationIds
                .map(id => state.locations.find(l => l.id === id)?.name || id)
                .filter(Boolean);
            const uniqueNames = [...new Set(names)].sort((a, b) => a.localeCompare(b));

            if (uniqueNames.length === 1) {
                return uniqueNames[0];
            }

            if (uniqueNames.length <= 3) {
                return uniqueNames.join(', ');
            }

            return \`\${uniqueNames.length} lieux (\${uniqueNames.slice(0, 3).join(', ')}...)\`;
        }

        filtered.forEach(row => {
            let key;
            let locationId = row.locationId;

            if (groupBy === 'location') {
                const location = state.locations.find(l => l.id === row.locationId);
                key = location ? location.name : row.locationId;
                locationId = row.locationId;
            } else if (groupBy === 'week') {
                key = getStartOfWeek(row.date);
            } else if (groupBy === 'month') {
                key = row.date.slice(0, 7);
            } else if (groupBy === 'hour') {
                const adultTimestamps = row.adultTimestamps || [];
                const kidTimestamps = row.kidTimestamps || [];
                const buckets = {};

                adultTimestamps.forEach(ts => {
                    const hour = new Date(ts).getHours();
                    const hourKey = \`Heure \${hour}h\`;
                    if (!buckets[hourKey]) buckets[hourKey] = { adults: 0, kids: 0 };
                    buckets[hourKey].adults++;
                });

                kidTimestamps.forEach(ts => {
                    const hour = new Date(ts).getHours();
                    const hourKey = \`Heure \${hour}h\`;
                    if (!buckets[hourKey]) buckets[hourKey] = { adults: 0, kids: 0 };
                    buckets[hourKey].kids++;
                });

                if (Object.keys(buckets).length === 0) {
                    key = 'Heure inconnue';
                    if (!grouped[key]) {
                        grouped[key] = {
                            adults: 0,
                            kids: 0,
                            rows: [],
                            location: null,
                            locationIds: [],
                            notes: [],
                            adultTimestamps: [],
                            kidTimestamps: []
                        };
                    }
                    grouped[key].adults += (row.adults || 0);
                    grouped[key].kids += (row.kids || 0);
                    grouped[key].rows.push(row);
                    if (row.noteAdults || row.noteKids) {
                        grouped[key].notes.push(
                            \`Adultes: \${row.noteAdults || ''}\${row.noteKids ? ' | Enfants: ' + row.noteKids : ''}\`
                        );
                    }
                    grouped[key].adultTimestamps = grouped[key].adultTimestamps.concat(adultTimestamps);
                    grouped[key].kidTimestamps = grouped[key].kidTimestamps.concat(kidTimestamps);
                    if (row.locationId) {
                        grouped[key].locationIds.push(row.locationId);
                    }
                } else {
                    Object.keys(buckets).forEach(bucketKey => {
                        if (!grouped[bucketKey]) {
                            grouped[bucketKey] = {
                                adults: 0,
                                kids: 0,
                                rows: [],
                                location: null,
                                locationIds: [],
                                notes: [],
                                adultTimestamps: [],
                                kidTimestamps: []
                            };
                        }
                        grouped[bucketKey].adults += buckets[bucketKey].adults;
                        grouped[bucketKey].kids += buckets[bucketKey].kids;
                        grouped[bucketKey].rows.push(row);
                        if (row.noteAdults || row.noteKids) {
                            grouped[bucketKey].notes.push(
                                \`Adultes: \${row.noteAdults || ''}\${row.noteKids ? ' | Enfants: ' + row.noteKids : ''}\`
                            );
                        }
                        grouped[bucketKey].adultTimestamps = grouped[bucketKey].adultTimestamps.concat(adultTimestamps);
                        grouped[bucketKey].kidTimestamps = grouped[bucketKey].kidTimestamps.concat(kidTimestamps);
                        if (row.locationId) {
                            grouped[bucketKey].locationIds.push(row.locationId);
                        }
                    });
                }
                return;
            } else {
                key = row.date;
            }

            if (!grouped[key]) {
                grouped[key] = {
                    adults: 0,
                    kids: 0,
                    rows: [],
                    location: locationId,
                    locationIds: [],
                    notes: [],
                    adultTimestamps: [],
                    kidTimestamps: []
                };
            }

            grouped[key].adults += (row.adults || 0);
            grouped[key].kids += (row.kids || 0);
            grouped[key].rows.push(row);

            if (row.noteAdults || row.noteKids) {
                grouped[key].notes.push(
                    \`Adultes: \${row.noteAdults || ''}\${
                        row.noteKids ? ' | Enfants: ' + row.noteKids : ''
                    }\`
                );
            }

            if (row.adultTimestamps) {
                grouped[key].adultTimestamps = grouped[key].adultTimestamps.concat(row.adultTimestamps);
            }
            if (row.kidTimestamps) {
                grouped[key].kidTimestamps = grouped[key].kidTimestamps.concat(row.kidTimestamps);
            }
            if (row.locationId) {
                grouped[key].locationIds.push(row.locationId);
            }
        });

        state.stats.currentData = Object.keys(grouped).map(key => ({
            key,
            adults: grouped[key].adults,
            kids: grouped[key].kids,
            total: grouped[key].adults + grouped[key].kids,
            location: grouped[key].location,
            locationIds: [...new Set(grouped[key].locationIds || [])],
            locationLabel: buildLocationLabel([...new Set(grouped[key].locationIds || [])]),
            notes: grouped[key].notes.join(' || '),
            adultTimestamps: grouped[key].adultTimestamps,
            kidTimestamps: grouped[key].kidTimestamps,
            rows: grouped[key].rows
        }));

        filterAndRenderStats();
    }

    function processHourlyStats(filtered) {
        const hourlyData = {};

        for (let hour = 8; hour <= 20; hour++) {
            hourlyData[hour] = {
                adults: 0,
                kids: 0,
                locations: {},
                dates: new Set()
            };
        }

        filtered.forEach(row => {
            const locationName = state.locations.find(l => l.id === row.locationId)?.name || row.locationId;

            if (row.adultTimestamps) {
                row.adultTimestamps.forEach(timestamp => {
                    const hour = new Date(timestamp).getHours();
                    if (hour >= 8 && hour <= 20) {
                        hourlyData[hour].adults++;
                        hourlyData[hour].dates.add(row.date);

                        if (!hourlyData[hour].locations[locationName]) {
                            hourlyData[hour].locations[locationName] = { adults: 0, kids: 0 };
                        }
                        hourlyData[hour].locations[locationName].adults++;
                    }
                });
            }

            if (row.kidTimestamps) {
                row.kidTimestamps.forEach(timestamp => {
                    const hour = new Date(timestamp).getHours();
                    if (hour >= 8 && hour <= 20) {
                        hourlyData[hour].kids++;
                        hourlyData[hour].dates.add(row.date);

                        if (!hourlyData[hour].locations[locationName]) {
                            hourlyData[hour].locations[locationName] = { adults: 0, kids: 0 };
                        }
                        hourlyData[hour].locations[locationName].kids++;
                    }
                });
            }
        });

        state.stats.hourlyData = Object.keys(hourlyData).map(hour => ({
            hour: parseInt(hour),
            timeRange: \`\${hour}h-\${parseInt(hour) + 1}h\`,
            adults: hourlyData[hour].adults,
            kids: hourlyData[hour].kids,
            total: hourlyData[hour].adults + hourlyData[hour].kids,
            locations: hourlyData[hour].locations,
            daysCount: hourlyData[hour].dates.size,
            avgPerDay: hourlyData[hour].dates.size > 0 ?
                Math.round((hourlyData[hour].adults + hourlyData[hour].kids) / hourlyData[hour].dates.size) : 0
        }));

        state.stats.hourlyData.sort((a, b) => a.hour - b.hour);
        renderHourlyStats();
    }

    function renderHourlyStats() {
        const statsArea = el('freq-statsArea');
        const hourlyStats = el('freq-hourlyStats');
        const pagination = el('freq-stats-pagination');

        pagination.style.display = 'none';
        statsArea.style.display = 'none';
        hourlyStats.style.display = 'block';

        const hourlyGrid = el('freq-hourlyGrid');
        hourlyGrid.innerHTML = '';

        if (state.stats.hourlyData.length === 0) {
            hourlyGrid.innerHTML = '<div class="freq-muted freq-small">Aucune donnée pour les tranches horaires</div>';
            return;
        }

        state.stats.hourlyData.forEach(hourData => {
            const card = document.createElement('div');
            card.className = 'freq-hourly-card';

            card.innerHTML = \`
                <div class="freq-hourly-time">\${hourData.timeRange}</div>
                <div class="freq-hourly-counts">
                    <div class="freq-hourly-adults">👥 \${hourData.adults}</div>
                    <div class="freq-hourly-kids">🧒 \${hourData.kids}</div>
                    <div class="freq-hourly-total">\${hourData.total}</div>
                </div>
                <div style="margin-top: 8px; font-size: 11px; color: var(--freq-muted);">
                    \${hourData.daysCount} jour(s) - Moyenne: \${hourData.avgPerDay}/jour
                </div>
            \`;

            card.style.cursor = 'pointer';
            card.addEventListener('click', () => {
                showHourlyDetails(hourData);
            });

            hourlyGrid.appendChild(card);
        });
    }

    function showHourlyDetails(hourData) {
        let details = \`Détails pour la tranche \${hourData.timeRange}\\n\\n\`;
        details += \`Total: \${hourData.total} visiteurs (\${hourData.adults} adultes, \${hourData.kids} enfants)\\n\`;
        details += \`Sur \${hourData.daysCount} jour(s) - Moyenne: \${hourData.avgPerDay}/jour\\n\\n\`;
        details += \`Répartition par lieu:\\n\`;

        Object.keys(hourData.locations).forEach(locationName => {
            const locData = hourData.locations[locationName];
            details += \`- \${locationName}: \${locData.adults + locData.kids} (\${locData.adults}A, \${locData.kids}E)\\n\`;
        });

        const detailsWindow = window.open('', '_blank');
        detailsWindow.document.write(\`
            <html>
                <head><title>Détails \${hourData.timeRange}</title></head>
                <body>
                    <pre style="white-space: pre-wrap; font-family: monospace; padding: 20px;">
\${details}
                    </pre>
                </body>
            </html>
        \`);
    }

    function toggleHourlyView() {
        const groupBy = el('freq-groupBy').value;
        if (groupBy === 'hourly') {
            el('freq-groupBy').value = 'day';
            loadStats();
        } else {
            el('freq-groupBy').value = 'hourly';
            loadStats();
        }
    }

    function getStartOfWeek(dateString) {
        const date = new Date(dateString);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date.setDate(diff));
        return getLocalDateString(monday);
    }

    function filterAndRenderStats() {
        const groupBy = el('freq-groupBy').value;

        if (groupBy === 'hourly') {
            return;
        }

        if (state.stats.searchTerm) {
            const searchTerm = state.stats.searchTerm.toLowerCase();
            state.stats.filteredData = state.stats.currentData.filter(item => {
                const keyMatch = item.key.toLowerCase().includes(searchTerm);
                const notesMatch = item.notes && item.notes.toLowerCase().includes(searchTerm);
                const locationName = item.locationLabel || state.locations.find(l => l.id === item.location)?.name || item.location || '';
                const locationMatch = locationName.toLowerCase().includes(searchTerm);
                return keyMatch || notesMatch || locationMatch;
            });
        } else {
            state.stats.filteredData = [...state.stats.currentData];
        }

        state.stats.filteredData.sort((a, b) => {
            let aValue, bValue;

            switch (state.stats.sortField) {
                case 'key':
                    aValue = a.key;
                    bValue = b.key;
                    break;
                case 'location':
                    aValue = a.locationLabel || state.locations.find(l => l.id === a.location)?.name || a.location || '';
                    bValue = b.locationLabel || state.locations.find(l => l.id === b.location)?.name || b.location || '';
                    break;
                case 'adults':
                    aValue = a.adults;
                    bValue = b.adults;
                    break;
                case 'kids':
                    aValue = a.kids;
                    bValue = b.kids;
                    break;
                case 'total':
                    aValue = a.total;
                    bValue = b.total;
                    break;
                default:
                    aValue = a.key;
                    bValue = b.key;
            }

            if (state.stats.sortDirection === 'asc') {
                return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
            } else {
                return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
            }
        });

        const totalPages = Math.max(1, Math.ceil(state.stats.filteredData.length / state.stats.pageSize));
        if (state.stats.currentPage > totalPages) {
            state.stats.currentPage = totalPages;
        }
        if (state.stats.currentPage < 1) {
            state.stats.currentPage = 1;
        }

        el('freq-hourlyStats').style.display = 'none';
        el('freq-statsArea').style.display = 'block';

        updateStatsSummary();
        renderStats();
    }

    function updateStatsSummary() {
        const totalEntries = state.stats.filteredData.length;
        const totalAdults = state.stats.filteredData.reduce((sum, item) => sum + item.adults, 0);
        const totalKids = state.stats.filteredData.reduce((sum, item) => sum + item.kids, 0);
        const totalAll = totalAdults + totalKids;

        const uniqueDaysSet = new Set();
        state.stats.filteredData.forEach(item => {
            if (item.rows && item.rows.length > 0) {
                item.rows.forEach(row => {
                    if (row.date) uniqueDaysSet.add(row.date);
                });
            } else if (/^\\d{4}-\\d{2}-\\d{2}$/.test(item.key)) {
                uniqueDaysSet.add(item.key);
            }
        });

        const uniqueDays = uniqueDaysSet.size || totalEntries;

        const avgPerDay = uniqueDays > 0 ? Math.round(totalAll / uniqueDays) : 0;

        el('freq-stats-total-entries').textContent = totalEntries;
        el('freq-stats-total-adults').textContent = totalAdults;
        el('freq-stats-total-kids').textContent = totalKids;
        el('freq-stats-total-all').textContent = totalAll;
        el('freq-stats-avg-per-day').textContent = avgPerDay;
    }

    function renderStats() {
        const area = el('freq-statsArea');
        const pagination = el('freq-stats-pagination');

        if (state.stats.filteredData.length === 0) {
            area.innerHTML = '<div class="freq-muted freq-small">Aucun résultat pour les critères sélectionnés</div>';
            pagination.style.display = 'none';
            return;
        }

        const totalPages = Math.ceil(state.stats.filteredData.length / state.stats.pageSize);
        const startIndex = (state.stats.currentPage - 1) * state.stats.pageSize;
        const endIndex = Math.min(startIndex + state.stats.pageSize, state.stats.filteredData.length);
        const pageData = state.stats.filteredData.slice(startIndex, endIndex);

        let headers = '';
        if (state.stats.visibleColumns.includes('date')) headers += '<th class="sortable" data-field="key">Période</th>';
        if (state.stats.visibleColumns.includes('location')) headers += '<th class="sortable" data-field="location">Lieu</th>';
        if (state.stats.visibleColumns.includes('adults')) headers += '<th class="sortable" data-field="adults">Adultes</th>';
        if (state.stats.visibleColumns.includes('kids')) headers += '<th class="sortable" data-field="kids">Enfants</th>';
        if (state.stats.visibleColumns.includes('total')) headers += '<th class="sortable" data-field="total">Total</th>';
        if (state.stats.visibleColumns.includes('notes')) headers += '<th>Notes</th>';
        if (state.stats.visibleColumns.includes('timestamps')) headers += '<th>Horodatages</th>';
        headers += '<th>Détails</th>';

        let html = \`
            <table class="freq-stat-table">
                <thead>
                    <tr>
                        \${headers}
                    </tr>
                </thead>
                <tbody>
        \`;

        pageData.forEach(item => {
            let row = '<tr>';

            if (state.stats.visibleColumns.includes('date')) {
                row += \`<td>\${item.key}</td>\`;
            }

            if (state.stats.visibleColumns.includes('location')) {
                const locationName = item.locationLabel || state.locations.find(l => l.id === item.location)?.name || item.location || '';
                row += \`<td>\${locationName}</td>\`;
            }

            if (state.stats.visibleColumns.includes('adults')) {
                row += \`<td>\${item.adults}</td>\`;
            }

            if (state.stats.visibleColumns.includes('kids')) {
                row += \`<td>\${item.kids}</td>\`;
            }

            if (state.stats.visibleColumns.includes('total')) {
                row += \`<td>\${item.total}</td>\`;
            }

            if (state.stats.visibleColumns.includes('notes')) {
                row += \`<td>\${item.notes || ''}</td>\`;
            }

            if (state.stats.visibleColumns.includes('timestamps')) {
                const adultTimestamps = item.adultTimestamps ? item.adultTimestamps.length : 0;
                const kidTimestamps = item.kidTimestamps ? item.kidTimestamps.length : 0;
                row += \`<td>A: \${adultTimestamps}, E: \${kidTimestamps}</td>\`;
            }

            row += \`
                <td>
                    <button class="freq-small" onclick="window.showDetails('\${item.key.replace(/'/g, "\\\\'")}')">
                        Voir
                    </button>
                </td>
            </tr>
            \`;

            html += row;
        });

        html += \`
                </tbody>
            </table>
        \`;

        area.innerHTML = html;

        updatePagination(totalPages, startIndex, endIndex);

        document.querySelectorAll('.freq-stat-table th.sortable').forEach(th => {
            th.addEventListener('click', function() {
                const field = this.getAttribute('data-field');
                if (state.stats.sortField === field) {
                    state.stats.sortDirection = state.stats.sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    state.stats.sortField = field;
                    state.stats.sortDirection = 'desc';
                }
                filterAndRenderStats();
            });

            if (th.getAttribute('data-field') === state.stats.sortField) {
                th.classList.add(state.stats.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
            } else {
                th.classList.remove('sort-asc', 'sort-desc');
            }
        });

        window.currentStats = state.stats.filteredData.reduce((acc, item) => {
            acc[item.key] = item;
            return acc;
        }, {});
    }

    function updatePagination(totalPages, startIndex, endIndex) {
        const pagination = el('freq-stats-pagination');
        const pageInfo = el('freq-stats-page-info');

        if (totalPages <= 1) {
            pagination.style.display = 'none';
            return;
        }

        pagination.style.display = 'flex';
        pageInfo.textContent = \`Page \${state.stats.currentPage} sur \${totalPages} (\${startIndex + 1}-\${endIndex} sur \${state.stats.filteredData.length})\`;

        el('freq-stats-first').disabled = state.stats.currentPage === 1;
        el('freq-stats-prev').disabled = state.stats.currentPage === 1;
        el('freq-stats-next').disabled = state.stats.currentPage === totalPages;
        el('freq-stats-last').disabled = state.stats.currentPage === totalPages;
    }

    function reportEscape(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }

    function generateFullReport() {
        const rows = [...(state.stats.rawFilteredRows || [])];
        if (!rows.length) {
            alert('Aucune donnée dans le rapport courant. Générez d’abord le rapport pour la période souhaitée.');
            return;
        }

        const from = el('freq-statFrom').value;
        const to = el('freq-statTo').value;
        const siteIds = [...new Set(rows.map(r => r.locationId).filter(Boolean))];
        const siteNames = siteIds.map(id => state.locations.find(l => l.id === id)?.name || id).sort((a,b)=>a.localeCompare(b));
        const totalAdults = rows.reduce((n,r)=>n+Number(r.adults||0),0);
        const totalKids = rows.reduce((n,r)=>n+Number(r.kids||0),0);
        const total = totalAdults + totalKids;
        const uniqueDays = new Set(rows.map(r=>r.date).filter(Boolean));
        const avg = uniqueDays.size ? Math.round(total / uniqueDays.size) : 0;

        const bySite = new Map();
        const byDay = new Map();
        const byHour = new Map();
        rows.forEach(r => {
            const locName = state.locations.find(l=>l.id===r.locationId)?.name || r.locationId || '—';
            if (!bySite.has(locName)) bySite.set(locName,{adults:0,kids:0,days:new Set()});
            const s = bySite.get(locName);
            s.adults += Number(r.adults||0); s.kids += Number(r.kids||0); if(r.date)s.days.add(r.date);

            if (!byDay.has(r.date)) byDay.set(r.date,{adults:0,kids:0,sites:new Set()});
            const d=byDay.get(r.date); d.adults+=Number(r.adults||0); d.kids+=Number(r.kids||0); d.sites.add(locName);

            (Array.isArray(r.adultTimestamps)?r.adultTimestamps:[]).forEach(ts=>{
                const date=new Date(ts); if(Number.isNaN(date.getTime())) return;
                const h=date.getHours(); if(!byHour.has(h))byHour.set(h,{adults:0,kids:0}); byHour.get(h).adults++;
            });
            (Array.isArray(r.kidTimestamps)?r.kidTimestamps:[]).forEach(ts=>{
                const date=new Date(ts); if(Number.isNaN(date.getTime())) return;
                const h=date.getHours(); if(!byHour.has(h))byHour.set(h,{adults:0,kids:0}); byHour.get(h).kids++;
            });
        });

        const siteRows=[...bySite.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([name,v])=>{
            const t=v.adults+v.kids, a=v.days.size?Math.round(t/v.days.size):0;
            return \`<tr><td>\${reportEscape(name)}</td><td>\${v.days.size}</td><td>\${v.adults}</td><td>\${v.kids}</td><td><strong>\${t}</strong></td><td>\${a}</td></tr>\`;
        }).join('');
        const dayRows=[...byDay.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([day,v])=>{
            const t=v.adults+v.kids;
            return \`<tr><td>\${reportEscape(day)}</td><td>\${v.sites.size}</td><td>\${v.adults}</td><td>\${v.kids}</td><td><strong>\${t}</strong></td></tr>\`;
        }).join('');
        const hourRows=[...byHour.entries()].sort((a,b)=>a[0]-b[0]).map(([h,v])=>\`<tr><td>\${String(h).padStart(2,'0')}h–\${String((h+1)%24).padStart(2,'0')}h</td><td>\${v.adults}</td><td>\${v.kids}</td><td><strong>\${v.adults+v.kids}</strong></td></tr>\`).join('') || '<tr><td colspan="4">Pas d’horodatages disponibles.</td></tr>';
        const detailRows=[...rows].sort((a,b)=>String(a.date).localeCompare(String(b.date)) || String(a.locationId).localeCompare(String(b.locationId))).map(r=>{
            const name=state.locations.find(l=>l.id===r.locationId)?.name || r.locationId || '—';
            const t=Number(r.adults||0)+Number(r.kids||0);
            const notes=[r.noteAdults?\`Adultes : \${r.noteAdults}\`:'',r.noteKids?\`Enfants : \${r.noteKids}\`:''].filter(Boolean).join(' · ');
            return \`<tr><td>\${reportEscape(r.date||'')}</td><td>\${reportEscape(name)}</td><td>\${Number(r.adults||0)}</td><td>\${Number(r.kids||0)}</td><td><strong>\${t}</strong></td><td>\${reportEscape(notes)}</td></tr>\`;
        }).join('');

        const reportWindow=window.open('','_blank');
        if(!reportWindow){ alert('Le navigateur a bloqué la fenêtre du rapport.'); return; }
        const periodText = from || to ? \`\${from || 'début'} → \${to || 'aujourd’hui'}\` : 'Tout l’historique';
        reportWindow.document.open();
        reportWindow.document.write(\`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport de fréquentation</title><style>
            body{font:14px Arial,sans-serif;color:#28343d;margin:28px;background:#fff}h1{color:#526d22;margin:0 0 4px}h2{color:#526d22;margin:28px 0 8px;border-bottom:2px solid #dce6cd;padding-bottom:5px}.meta{color:#697680;margin-bottom:18px}.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;margin:18px 0}.kpi{border:1px solid #d8dee3;border-radius:7px;padding:12px;background:#f8faf6}.kpi span{display:block;color:#697680;font-size:11px;text-transform:uppercase}.kpi strong{display:block;font-size:24px;color:#526d22;margin-top:3px}table{width:100%;border-collapse:collapse;margin:8px 0 20px}th,td{padding:7px 8px;border-bottom:1px solid #e5e9ec;text-align:left;vertical-align:top}th{background:#eef3e7;color:#394b28}.actions{position:sticky;top:0;background:#fff;padding:8px 0 12px}.actions button{padding:8px 12px;border:1px solid #6f8f32;background:#6f8f32;color:#fff;border-radius:5px;cursor:pointer}.sites{padding:9px;border-left:4px solid #6f8f32;background:#f6f9f1}@media(max-width:850px){.kpis{grid-template-columns:repeat(2,1fr)}}@media print{body{margin:10mm}.actions{display:none}.kpis{grid-template-columns:repeat(5,1fr)}h2{break-after:avoid}table{break-inside:auto}tr{break-inside:avoid}}
        </style></head><body><div class="actions"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div><h1>Rapport de fréquentation</h1><div class="meta">Période : \${reportEscape(periodText)} · Généré le \${reportEscape(new Date().toLocaleString('fr-FR'))}</div><div class="sites"><strong>Sites :</strong> \${siteNames.map(reportEscape).join(', ')}</div><div class="kpis"><div class="kpi"><span>Journées-site</span><strong>\${rows.length}</strong></div><div class="kpi"><span>Adultes</span><strong>\${totalAdults}</strong></div><div class="kpi"><span>Enfants</span><strong>\${totalKids}</strong></div><div class="kpi"><span>Fréquentation</span><strong>\${total}</strong></div><div class="kpi"><span>Moyenne / jour</span><strong>\${avg}</strong></div></div><h2>Par site</h2><table><thead><tr><th>Site</th><th>Jours</th><th>Adultes</th><th>Enfants</th><th>Total</th><th>Moy./jour</th></tr></thead><tbody>\${siteRows}</tbody></table><h2>Par jour</h2><table><thead><tr><th>Date</th><th>Sites</th><th>Adultes</th><th>Enfants</th><th>Total</th></tr></thead><tbody>\${dayRows}</tbody></table><h2>Par tranche horaire</h2><table><thead><tr><th>Tranche</th><th>Adultes</th><th>Enfants</th><th>Total</th></tr></thead><tbody>\${hourRows}</tbody></table><h2>Détail</h2><table><thead><tr><th>Date</th><th>Site</th><th>Adultes</th><th>Enfants</th><th>Total</th><th>Notes</th></tr></thead><tbody>\${detailRows}</tbody></table></body></html>\`);
        reportWindow.document.close();
    }

    function toggleChart() {
        const chartContainer = el('freq-chart-container');
        if (chartContainer.style.display === 'none') {
            chartContainer.style.display = 'flex';
            renderChart();
        } else {
            chartContainer.style.display = 'none';
        }
    }

    function renderChart() {
        const chartContainer = el('freq-chart-container');

        const sorted = [...state.stats.filteredData].sort((a, b) => b.total - a.total);
        const topItems = sorted.slice(0, 10);
        const total = sorted.reduce((sum, i) => sum + i.total, 0) || 1;

        let chartHTML = '<div style="width: 100%;">';
        chartHTML += '<h4 style="margin-top: 0; color: var(--freq-accent);">Top 10 des périodes</h4>';

        topItems.forEach(item => {
            const percentage = (item.total / total) * 100;
            chartHTML += \`
                <div style="margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>\${item.key}</span>
                        <span>\${item.total} (\${percentage.toFixed(1)}%)</span>
                    </div>
                    <div style="height: 10px; background: var(--freq-glass); border-radius: 5px; overflow: hidden;">
                        <div style="height: 100%; background: var(--freq-accent); width: \${percentage}%;"></div>
                    </div>
                </div>
            \`;
        });

        chartHTML += '</div>';
        chartContainer.innerHTML = chartHTML;
    }

    window.showDetails = function(key) {
        const item = window.currentStats[key];

        if (!item) {
            alert('Aucun détail disponible');
            return;
        }

        let details = \`Détails pour \${key}\\n\\n\`;
        item.rows.forEach(row => {
            const location = state.locations.find(l => l.id === row.locationId);
            details += \`\${row.date} - \${location ? location.name : row.locationId}\\n\`;
            details += \`  Adultes: \${row.adults || 0}, Enfants: \${row.kids || 0}\\n\`;
            if (row.adultTimestamps && row.adultTimestamps.length > 0) {
                details += \`  Horaires adultes: \${row.adultTimestamps.map(ts => new Date(ts).toLocaleTimeString()).join(', ')}\\n\`;
            }
            if (row.kidTimestamps && row.kidTimestamps.length > 0) {
                details += \`  Horaires enfants: \${row.kidTimestamps.map(ts => new Date(ts).toLocaleTimeString()).join(', ')}\\n\`;
            }
            if (row.noteAdults) details += \`  Note adultes: \${row.noteAdults}\\n\`;
            if (row.noteKids) details += \`  Note enfants: \${row.noteKids}\\n\`;
            details += '\\n';
        });

        const detailsWindow = window.open('', '_blank');
        detailsWindow.document.write(\`
            <html>
                <head><title>Détails \${key}</title></head>
                <body>
                    <pre style="white-space: pre-wrap; font-family: monospace; padding: 20px;">
\${details}
                    </pre>
                </body>
            </html>
        \`);
    };

    async function bootAttendanceCounter() {
        try {
            updateStatus('Connexion Firebase...');
            await initialAuthReady;
            await initUI();
            await loadStats();
        } catch (error) {
            console.error('Attendance Counter — initialisation', error);
            updateStatus('Erreur d’initialisation Firebase');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootAttendanceCounter, { once: true });
    } else {
        bootAttendanceCounter();
    }
</script>`;

    function wireMediabusBridge(container) {
        const bridge = window.PMKAttendanceMediabus;
        if (!bridge || bridge.available !== true || bridge.enabled === false || typeof bridge.open !== 'function') return;
        const actions = container.querySelector('#freqApp header .freq-row');
        if (!actions || actions.querySelector('[data-pmk-mediabus-counter]')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'freq-small';
        button.dataset.pmkMediabusCounter = '1';
        button.innerHTML = '<i class="fa fa-plus-square" aria-hidden="true"></i> Compteur Médiabus';
        button.title = 'Afficher le compteur rapide Médiabus';
        button.addEventListener('click', function() { bridge.open(); });
        actions.appendChild(button);
    }

    window.PMKPages.register({
        id: 'attendance-counter',
        title: 'Compteur de fréquentation',
        icon: 'fa-bar-chart',
        description: 'Saisie, statistiques, rapports multi-sites et exports de fréquentation.',
        async mount(container, context) {
            await context.mountLegacyHtml(container, PAGE_SOURCE);
            wireMediabusBridge(container);
            document.addEventListener('pmk:attendance-mediabus-state', function() { wireMediabusBridge(container); });
        }
    });
})(window, document);

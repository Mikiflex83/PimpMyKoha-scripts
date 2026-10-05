/* ============================================================
   PimpMyKoha 137 — Widgets & blocs d’accueil
   Généré le 22/09/2026
   Sous-widget autonome.
   IMPORTANT : conserver ce fichier séparé pour la maintenance.
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    serverTimestamp
  } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const WIDGET_ID = 'planning-services';
const STYLE_ID = 'pmk137-style-planning-services';
const STYLE_TEXT = `  :root {
    --ps-bg: #f4f4f4;
    --ps-border: #ddd;
    --ps-panel: #fff;
    --ps-muted: #666;
    --ps-danger: #b42318;
    --ps-success: #287a3a;
  }
.ps-root {
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 0;
    color: #222;
  }

  .ps-public-grid {
    max-width: 1200px;
    margin: 15px auto;
    display: flex;
    gap: 20px;
    padding: 10px;
    align-items: flex-start;
  }

  .ps-service-container {
    flex: 1 1 0;
    min-width: 0;
    padding: 10px;
    background: var(--ps-panel);
    box-shadow: 0 0 10px rgba(0,0,0,.1);
    border-radius: 8px;
  }

  .ps-service-title {
    text-align: center;
    font-size: 18px;
    margin: 0.67em 0;
  }

  .ps-date-card {
    margin-bottom: 20px;
    padding: 10px;
    border: 1px solid var(--ps-border);
    border-radius: 6px;
    background: #fafafa;
  }

  .ps-date-card.ps-next {
    font-weight: bold;
    color: red;
    background-color: #edfaeb;
  }

  .ps-date-card h2 {
    margin: 0 0 10px;
    font-size: 16px;
  }

  .ps-period {
    font-weight: bold;
  }

  .ps-time-info {
    margin-left: 15px;
    font-size: 13px;
    color: var(--ps-muted);
  }

  .ps-location-name {
    font-size: 15px;
    font-weight: bold;
  }

  .ps-location-detail {
    margin: 3px 0 0 15px;
    font-size: 12px;
    color: var(--ps-muted);
  }

  .ps-line {
    position: relative;
    display: flex;
    align-items: center;
    margin: 0 0 30px 25px;
    min-height: 20px;
    overflow: visible;
  }

  .ps-stop-wrapper {
    position: relative;
    display: inline-block;
    flex: 0 0 auto;
  }

  .ps-stop-wrapper + .ps-stop-wrapper {
    margin-left: 65px;
  }

  .ps-stop {
    width: 15px;
    height: 15px;
    background: #fff;
    border: 3px solid currentColor;
    border-radius: 50%;
    position: relative;
    z-index: 1;
    box-sizing: content-box;
  }

  .ps-stop.ps-current-branch {
    border-color: orange !important;
  }

  .ps-stop-label {
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    font-size: 12px;
    color: #333;
    font-weight: normal;
  }

  .ps-stop-time {
    display: block;
    font-size: 10px;
    color: #777;
    text-align: center;
  }

  .ps-moving-gif {
    position: absolute;
    width: 20px;
    height: 20px;
    background-size: contain;
    background-position: center;
    background-repeat: no-repeat;
    z-index: 2;
    transition: left .5s ease-out;
    top: 0;
    pointer-events: none;
  }

  .ps-empty {
    padding: 12px;
    border: 1px solid var(--ps-border);
    border-radius: 6px;
    background: #fafafa;
    color: #555;
  }

  .ps-runtime-warning {
    max-width: 1200px;
    margin: 8px auto;
    padding: 8px 12px;
    border: 1px solid #e6b800;
    border-radius: 6px;
    background: #fff8d8;
    font-size: 12px;
  }


  /* ---------------------- BARRE PARAMÈTRES PUBLIQUE ---------------------- */

  .ps-public-toolbar {
    max-width: 1200px;
    margin: 4px auto -6px;
    padding: 0 12px;
    display: flex;
    justify-content: flex-end;
    box-sizing: border-box;
    min-height: 18px;
  }

  .ps-settings-btn {
    appearance: none;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: #9a9a9a;
    padding: 3px 5px;
    font-size: 11px;
    line-height: 1.1;
    cursor: pointer;
    box-shadow: none;
    opacity: .58;
    transition:
      opacity .15s ease,
      color .15s ease,
      background .15s ease,
      border-color .15s ease;
  }

  .ps-settings-btn:hover,
  .ps-settings-btn:focus,
  .ps-settings-btn.ps-active {
    border-color: #d7ddd7;
    color: #4f6f4f;
    background: rgba(255,255,255,.78);
    opacity: 1;
    outline: none;
  }
.ps-admin-lock {
    position: fixed;
    inset: 0;
    z-index: 10001;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 15px;
    background: rgba(0,0,0,.28);
  }

  .ps-admin-lock[hidden] { display: none !important; }

  .ps-admin-lock-card {
    width: min(360px, calc(100vw - 30px));
    background: #fff;
    border-radius: 9px;
    box-shadow: 0 8px 28px rgba(0,0,0,.24);
    padding: 18px;
  }

  .ps-admin-lock-card h2 {
    margin: 0 0 12px;
    font-size: 17px;
    color: #408540;
  }

  .ps-admin-lock-error {
    min-height: 18px;
    margin-top: 7px;
    color: #b42318;
    font-size: 12px;
  }

  /* ---------------------- ADMIN ---------------------- */

  .ps-admin {
    max-width: 1400px;
    margin: 15px auto 40px;
    padding: 0 10px;
  }

  .ps-admin h1,
  .ps-admin h2,
  .ps-admin h3 {
    margin-top: 0;
  }

  .ps-admin-toolbar,
  .ps-admin-panel {
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 14px;
    box-shadow: 0 1px 4px rgba(0,0,0,.06);
  }

  .ps-admin-toolbar {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }

  .ps-admin-grid {
    display: grid;
    grid-template-columns: minmax(280px, .9fr) minmax(420px, 1.6fr);
    gap: 14px;
  }

  .ps-form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .ps-field {
    min-width: 0;
  }

  .ps-field.ps-span-2 {
    grid-column: 1 / -1;
  }

  .ps-field label {
    display: block;
    font-size: 12px;
    font-weight: bold;
    margin-bottom: 4px;
  }

  .ps-field input,
  .ps-field select,
  .ps-field textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #bbb;
    border-radius: 5px;
    padding: 7px 8px;
    background: #fff;
    font: inherit;
  }

  .ps-field textarea {
    min-height: 100px;
    resize: vertical;
  }

  .ps-checkbox {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 34px;
  }

  .ps-checkbox input {
    width: auto;
  }

  .ps-btn {
    border: 1px solid #999;
    border-radius: 5px;
    padding: 7px 10px;
    background: #f8f8f8;
    cursor: pointer;
    font: inherit;
  }

  .ps-btn:hover { background: #eee; }
  .ps-btn-primary { background: #2f6f3e; color: #fff; border-color: #2f6f3e; }
  .ps-btn-danger { background: #fff1f0; color: #9d1c16; border-color: #d8a09c; }
  .ps-btn-small { padding: 4px 7px; font-size: 12px; }

  .ps-service-list {
    display: grid;
    gap: 8px;
  }

  .ps-service-row {
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .ps-service-row.ps-selected {
    outline: 2px solid #6ca879;
  }

  .ps-service-meta {
    font-size: 12px;
    color: #666;
    margin-top: 3px;
  }

  .ps-schedule-table-wrap {
    overflow: auto;
    max-height: 480px;
    border: 1px solid #ddd;
    border-radius: 6px;
  }

  .ps-schedule-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .ps-schedule-table th,
  .ps-schedule-table td {
    border-bottom: 1px solid #eee;
    padding: 6px 7px;
    text-align: left;
    vertical-align: top;
  }

  .ps-schedule-table th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: #f5f5f5;
  }

  .ps-status {
    font-size: 12px;
    padding: 5px 8px;
    border-radius: 999px;
    background: #eee;
  }

  .ps-status.ps-ok { background: #e5f6e8; color: #256534; }
  .ps-status.ps-warn { background: #fff3cd; color: #775a00; }
  .ps-status.ps-error { background: #fde7e5; color: #8c1d18; }

  .ps-help {
    font-size: 12px;
    line-height: 1.45;
    color: #555;
  }

  .ps-code-note {
    font-family: Consolas, monospace;
    white-space: pre-wrap;
    background: #f6f6f6;
    border: 1px solid #ddd;
    border-radius: 5px;
    padding: 8px;
    font-size: 11px;
  }

  @media (max-width: 850px) {
    .ps-public-grid { flex-direction: column; }
    .ps-service-container { width: 100%; box-sizing: border-box; }
    .ps-admin-grid { grid-template-columns: 1fr; }
    .ps-form-grid { grid-template-columns: 1fr; }
    .ps-field.ps-span-2 { grid-column: auto; }
    .ps-line { overflow-x: auto; padding-bottom: 28px; }
  }


  /* ==============================================================
     DESIGN KOHA INTÉGRÉ — v1.1
     Présentation uniquement : le moteur de planning reste inchangé.
     ============================================================== */

  .ps-root {
    --ps-koha-green: #408540;
    --ps-koha-green-dark: #326c32;
    --ps-koha-green-soft: #f1f7f1;
    --ps-koha-line: #d6ddd6;
    --ps-koha-line-soft: #e7ece7;
    --ps-koha-panel: #ffffff;
    --ps-koha-soft: #f7f9f7;
    --ps-koha-text: #333;
    --ps-koha-muted: #6b726b;
    --ps-koha-danger: #a94442;
    --ps-koha-warning: #8a6d3b;

    width: 100%;
    color: var(--ps-koha-text);
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 15px;
    line-height: 1.5;
    background: transparent;
  }

  .ps-root *,
  .ps-root *::before,
  .ps-root *::after {
    box-sizing: border-box;
  }

  /* ---------- Accès paramètres : discret et intégré ---------- */

  .ps-public-toolbar {
    max-width: 1200px;
    min-height: 22px;
    margin: 5px auto -5px;
    padding: 0 11px;
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }

  .ps-settings-btn {
    appearance: none;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: #8a918a;
    padding: 3px 6px;
    font: inherit;
    font-size: 11px;
    line-height: 1.2;
    cursor: pointer;
    box-shadow: none;
    opacity: .62;
    transition:
      opacity .14s ease,
      color .14s ease,
      border-color .14s ease,
      background .14s ease;
  }

  .ps-settings-btn:hover,
  .ps-settings-btn:focus,
  .ps-settings-btn.ps-active {
    border-color: #cfd8cf;
    background: #fff;
    color: var(--ps-koha-green-dark);
    opacity: 1;
    outline: none;
  }

  /* ---------- Zone publique ---------- */

  .ps-public-grid {
    max-width: 1200px;
    margin: 10px auto 18px;
    padding: 0 10px;
    display: flex;
    gap: 14px;
    align-items: stretch;
  }

  .ps-service-container {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    padding: 0 12px 12px;
    overflow: hidden;
    border: 1px solid #cfd5cf;
    border-radius: 5px;
    background: var(--ps-koha-panel);
    box-shadow: 0 0 7px rgba(0, 0, 0, .09);
  }
.ps-service-title {
    margin: 0 -12px 11px;
    padding: 10px 12px 9px;
    border-bottom: 1px solid #dfe4df;
    background: #ffffff;
    text-align: left;
    font-size: 18px;
    line-height: 1.3;
    font-weight: 600;
  }

  .ps-date-card {
    position: relative;
    margin: 0 0 8px;
    padding: 9px 10px;
    border: 1px solid #dfe4df;
    border-radius: 4px;
    background: #fff;
    color: var(--ps-koha-text);
    transition:
      border-color .12s ease,
      background .12s ease;
  }

  .ps-date-card:hover {
    border-color: #c4cec4;
    background: #fbfcfb;
  }

  .ps-date-card.ps-next {
    font-weight: normal;
    color: var(--ps-koha-text);
    border-color: #a9c7a9;
    border-left: 4px solid var(--ps-koha-green);
    background: var(--ps-koha-green-soft);
  }

  .ps-date-card.ps-next::after {
    content: attr(data-relative-label);
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 1px 6px;
    border: 1px solid #bdd2bd;
    border-radius: 9px;
    background: #fff;
    color: var(--ps-koha-green-dark);
    font-size: 10px;
    font-weight: 600;
    line-height: 1.45;
  }

  .ps-date-card h2 {
    margin: 0 62px 7px 0;
    font-size: 15px;
    line-height: 1.3;
    font-weight: 600;
  }

  .ps-period {
    display: inline-block;
    margin: 0 0 5px;
    font-size: 12px;
    font-weight: 600;
  }

  .ps-location-name {
    font-size: 15px;
    line-height: 1.3;
    font-weight: 600;
  }

  .ps-time-info {
    margin: 3px 0 0;
    color: var(--ps-koha-muted);
    font-size: 13px;
  }

  .ps-location-detail {
    margin: 3px 0 0;
    color: var(--ps-koha-muted);
    font-size: 12px;
  }

  /* ---------- Parcours / navette ---------- */

  .ps-line {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 22px;
    margin: 5px 0 27px 8px;
    padding-right: 8px;
    overflow: visible;
  }

  .ps-stop-wrapper + .ps-stop-wrapper {
    margin-left: 65px;
  }

  .ps-stop {
    width: 13px;
    height: 13px;
    border-width: 2px;
    background: #fff;
    box-shadow: 0 0 0 2px rgba(255,255,255,.85);
  }

  .ps-stop-wrapper:not(:last-child)::after {
    content: "";
    position: absolute;
    left: 15px;
    top: 7px;
    width: 65px;
    height: 1px;
    background: currentColor;
    opacity: .28;
  }

  .ps-stop.ps-current-branch {
    border-color: #d88922 !important;
    background: #fff8ec;
    box-shadow: 0 0 0 3px rgba(216,137,34,.12);
  }

  .ps-stop-label {
    top: 18px;
    color: #444;
    font-size: 12px;
    font-weight: 400;
  }

  .ps-stop-time {
    margin-top: 1px;
    color: #777;
    font-size: 10px;
  }

  .ps-moving-gif {
    width: 19px;
    height: 19px;
    top: -2px;
    filter: drop-shadow(0 1px 1px rgba(0,0,0,.10));
  }

  .ps-empty {
    padding: 11px;
    border: 1px dashed #c8cec8;
    border-radius: 4px;
    background: #fafbfa;
    color: var(--ps-koha-muted);
    font-size: 12px;
  }

  /* ---------- Informations réservées à l'admin ---------- */

  .ps-runtime-warning {
    max-width: 1200px;
    margin: 8px auto;
    padding: 7px 10px;
    border: 1px solid #ddd2ad;
    border-left: 3px solid #b49338;
    border-radius: 3px;
    background: #fffdf4;
    color: #665a38;
    font-size: 11px;
  }

  /* ---------- Fenêtre mot de passe ---------- */

  .ps-admin-lock {
    background: rgba(0,0,0,.36);
    backdrop-filter: blur(1px);
  }

  .ps-admin-lock-card {
    width: min(370px, calc(100vw - 30px));
    padding: 0;
    overflow: hidden;
    border: 1px solid #aaa;
    border-radius: 5px;
    background: #fff;
    box-shadow: 0 10px 30px rgba(0,0,0,.20);
  }

  .ps-admin-lock-card h2 {
    margin: 0;
    padding: 11px 13px;
    border-bottom: 1px solid #ddd;
    background: #f5f5f5;
    color: #333;
    font-size: 17px;
    font-weight: 600;
  }

  .ps-admin-lock-card form {
    padding: 13px;
  }

  .ps-admin-lock-error {
    min-height: 17px;
    margin-top: 5px;
    color: var(--ps-koha-danger);
    font-size: 11px;
  }

  /* ---------- Administration ---------- */

  .ps-admin {
    max-width: 1400px;
    margin: 14px auto 34px;
    padding: 0 10px;
    color: var(--ps-koha-text);
  }

  .ps-admin h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }

  .ps-admin h2 {
    margin: 0 0 10px;
    font-size: 17px;
    font-weight: 600;
  }

  .ps-admin h3 {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 600;
  }

  .ps-admin-toolbar,
  .ps-admin-panel {
    margin-bottom: 10px;
    padding: 11px;
    border: 1px solid var(--ps-koha-line);
    border-radius: 4px;
    background: #fff;
    box-shadow: none;
  }

  .ps-admin-toolbar {
    gap: 6px;
    background: #f7f8f7;
  }

  .ps-admin-grid {
    grid-template-columns: minmax(270px, .85fr) minmax(430px, 1.65fr);
    gap: 10px;
  }

  .ps-form-grid {
    gap: 8px 9px;
  }

  .ps-field label {
    margin-bottom: 3px;
    color: #555;
    font-size: 12px;
    font-weight: 600;
  }

  .ps-field input,
  .ps-field select,
  .ps-field textarea {
    min-height: 31px;
    border: 1px solid #aaa;
    border-radius: 4px;
    padding: 5px 7px;
    color: #333;
    background: #fff;
    font: inherit;
    font-size: 13px;
  }

  .ps-field input:focus,
  .ps-field select:focus,
  .ps-field textarea:focus {
    border-color: var(--ps-koha-green);
    box-shadow: 0 0 0 2px rgba(64,133,64,.12);
    outline: none;
  }

  .ps-field textarea {
    min-height: 86px;
  }

  .ps-checkbox {
    gap: 6px;
    min-height: 31px;
    color: #444;
    font-size: 13px;
  }

  .ps-btn {
    min-height: 29px;
    border: 1px solid #aaa;
    border-radius: 4px;
    padding: 5px 9px;
    background: #fff;
    color: #333;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background .12s ease, border-color .12s ease;
  }

  .ps-btn:hover {
    border-color: #888;
    background: #eee;
  }

  .ps-btn-primary {
    border-color: var(--ps-koha-green);
    background: var(--ps-koha-green);
    color: #fff;
  }

  .ps-btn-primary:hover {
    border-color: var(--ps-koha-green-dark);
    background: var(--ps-koha-green-dark);
  }

  .ps-btn-danger {
    border-color: #d7b6b4;
    background: #fff;
    color: var(--ps-koha-danger);
  }

  .ps-btn-danger:hover {
    background: #faeeee;
  }

  .ps-btn-small {
    min-height: 25px;
    padding: 3px 6px;
    font-size: 11px;
  }

  .ps-service-list {
    gap: 5px;
  }

  .ps-service-row {
    padding: 7px 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: #fff;
  }

  .ps-service-row:hover {
    background: #fafafa;
  }

  .ps-service-row.ps-selected {
    border-color: #8fb28f;
    outline: 2px solid rgba(64,133,64,.12);
    background: #f5faf5;
  }

  .ps-service-meta {
    margin-top: 2px;
    color: #777;
    font-size: 10px;
  }

  .ps-schedule-table-wrap {
    max-height: 480px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }

  .ps-schedule-table {
    font-size: 12px;
  }

  .ps-schedule-table th,
  .ps-schedule-table td {
    padding: 6px 7px;
    border-bottom: 1px solid #e4e4e4;
  }

  .ps-schedule-table th {
    background: #f5f5f5;
    color: #555;
    font-weight: 600;
  }

  .ps-schedule-table tbody tr:nth-child(even) td {
    background: #fafafa;
  }

  .ps-schedule-table tbody tr:hover td {
    background: #f2f7f2;
  }

  .ps-status {
    padding: 3px 7px;
    border: 1px solid #d2d2d2;
    border-radius: 9px;
    background: #f5f5f5;
    color: #555;
    font-size: 11px;
    font-weight: 600;
  }

  .ps-status.ps-ok {
    border-color: #c6dec8;
    background: #f1f8f2;
    color: #356b3d;
  }

  .ps-status.ps-warn {
    border-color: #e3d6aa;
    background: #fffaf0;
    color: var(--ps-koha-warning);
  }

  .ps-status.ps-error {
    border-color: #e0bcbc;
    background: #fbefef;
    color: var(--ps-koha-danger);
  }

  .ps-help {
    color: #666;
    font-size: 12px;
    line-height: 1.45;
  }

  .ps-code-note {
    padding: 7px 8px;
    border: 1px solid #ddd;
    border-radius: 3px;
    background: #f7f7f7;
    color: #444;
    font-size: 11px;
  }



  /* ---------- Lisibilité renforcée v1.1.1 ---------- */
  .ps-service-title { font-size:18px; }
  .ps-date-card h2 { font-size:15px; }
  .ps-period { font-size:12px; }
  .ps-location-name { font-size:15px; }
  .ps-time-info { font-size:13px; }
  .ps-location-detail { font-size:12px; }
  .ps-stop-label { font-size:12px; }
  .ps-stop-time { font-size:10px; }
  .ps-empty { font-size:13px; }
  .ps-admin h1 { font-size:20px; }
  .ps-admin h2 { font-size:17px; }
  .ps-admin h3 { font-size:15px; }
  .ps-field label { font-size:12px; }
  .ps-field input,
  .ps-field select,
  .ps-field textarea { font-size:13px; }
  .ps-checkbox { font-size:13px; }
  .ps-btn { font-size:12px; }
  .ps-btn-small { font-size:11px; }
  .ps-service-meta { font-size:11px; }
  .ps-schedule-table { font-size:12px; }
  .ps-help { font-size:12px; }
  .ps-code-note { font-size:11px; }
  @media (max-width: 850px) {
    .ps-public-grid {
      flex-direction: column;
      gap: 10px;
    }

    .ps-service-container {
      width: 100%;
    }

    .ps-admin-grid {
      grid-template-columns: 1fr;
    }

    .ps-line {
      overflow-x: auto;
      padding-bottom: 28px;
    }
  }

  @media (max-width: 520px) {
    .ps-public-toolbar {
      margin-top: 2px;
      padding: 0 8px;
    }

    .ps-public-grid {
      padding: 0 7px;
    }

    .ps-service-container {
      padding-left: 9px;
      padding-right: 9px;
    }

    .ps-service-title {
      margin-left: -9px;
      margin-right: -9px;
      padding-left: 9px;
      padding-right: 9px;
    }
.ps-date-card {
      padding: 8px;
    }

    .ps-date-card.ps-next::after {
      position: static;
      display: inline-block;
      margin: 0 0 6px;
      float: right;
    }

    .ps-date-card h2 {
      margin-right: 0;
    }
  }



  /* ---------- Bouton paramètres icône seule v1.1.3 ---------- */
  .ps-settings-btn {
    width: 27px;
    height: 27px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    line-height: 1;
  }`;
const HTML_TEXT = `<div id="ps-app" class="ps-root">
<div class="ps-public-toolbar"><button id="ps-admin-trigger-top" class="ps-settings-btn" type="button" title="Administration du planning" aria-label="Administration du planning">⚙</button></div>
<div id="ps-public"></div>
<div id="ps-admin" class="ps-admin" hidden=""></div>
<div id="ps-admin-lock" class="ps-admin-lock" hidden="">
<div class="ps-admin-lock-card" role="dialog" aria-modal="true" aria-labelledby="ps-admin-lock-title">
<h2 id="ps-admin-lock-title">Administration du planning</h2>
<form id="ps-admin-lock-form">
<div class="ps-field"><label for="ps-admin-password">Mot de passe</label> <input id="ps-admin-password" type="password" autocomplete="current-password" /></div>
<div id="ps-admin-lock-error" class="ps-admin-lock-error"></div>
<div class="ps-admin-toolbar" style="margin: 10px 0 0; padding: 0; border: 0; box-shadow: none;"><button class="ps-btn ps-btn-primary" type="submit">Ouvrir</button> <button id="ps-admin-lock-cancel" class="ps-btn" type="button">Annuler</button></div>
</form></div>
</div>
</div>
<!-- Conserve le comportement actuel pour la surbrillance du site --> <span class="logged-in-branch-name" style="display: none;">DRAGUIGNAN</span>`;

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
    const adminTrigger = document.getElementById('ps-admin-trigger-top');
    if (adminTrigger && !window.PMKHomeWidgets?.isSuperlibrarian?.()) {
        adminTrigger.style.display = 'none';
    }

  

  


      /* --------------------------------------------------------------
         Protection contre une double insertion du bloc dans Koha.
         Si le même script est présent deux fois, une seule interface reste visible.
         -------------------------------------------------------------- */
      const planningAppInstances = [...document.querySelectorAll("#ps-app")];
      if (planningAppInstances.length > 1) {
        planningAppInstances.slice(1).forEach(node => node.remove());
      }

      /* ==============================================================
         1. FIREBASE
         ============================================================== */

      const firebaseConfig = {
        apiKey: "YOUR_FIREBASE_APIKEY",
        authDomain: "YOUR_FIREBASE_AUTHDOMAIN",
        projectId: "YOUR_FIREBASE_PROJECTID",
        storageBucket: "YOUR_FIREBASE_STORAGEBUCKET",
        messagingSenderId: "YOUR_FIREBASE_MESSAGINGSENDERID",
        appId: "YOUR_FIREBASE_APPID"
      };

      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app);
      const CONFIG_REF = doc(db, "planning", "config");

      /*
       * Verrou d'interface local.
       * IMPORTANT : ce mot de passe est présent dans le JavaScript du navigateur.
       * Il évite les modifications accidentelles mais ne constitue pas une
       * authentification forte de Firebase.
       */
      const ADMIN_PASSWORD = "CHANGE_ADMIN_PASSWORD_LOCALLY";
      const ADMIN_SESSION_KEY = "planningServicesAdminUnlocked";

      /* ==============================================================
         2. CONFIGURATION HISTORIQUE EMBARQUÉE
            = affichage de secours + première initialisation Firebase
         ============================================================== */

      const LEGACY_NAVETTE = {
        "Lundi": {
          "Matin": ["Le Muy", "Vidauban", "Lorgues", "Salernes", "Flayosc"]
        },
        "Mardi": {
          "Matin": ["Flayosc", "Figanières", "Bargemon", "Callas", "La Motte", "Les Arcs"]
        },
        "Mercredi": {
          "Matin": ["Ampus", "Montferrat", "Comps", "Claviers"]
        },
        "Jeudi": {
          "Matin": ["Le Muy", "Vidauban", "Lorgues", "Salernes", "Flayosc"]
        },
        "Vendredi": {
          "Matin": ["Flayosc", "Figanières", "Bargemon", "Callas", "La Motte"]
        }
      };

      const LEGACY_NAVETTE_EXCEPTIONS = {
        "2026-07-06": [{ period: "Matin", cancelled: true }]
      };

      const LEGACY_MEDIABUS = {
        "BARGEME": {
          location: "Parking St Antoine",
          days: [
            "2026-01-07","2026-01-21","2026-02-04","2026-02-18","2026-03-04","2026-03-18",
            "2026-04-01","2026-04-15","2026-04-29","2026-05-13","2026-05-27","2026-06-10",
            "2026-09-16","2026-09-30","2026-10-14","2026-10-28","2026-11-25","2026-12-09","2026-12-23"
          ].map(date => ({ date, time: "10:00-12:00" }))
        },

        "LA ROQUE-ESCLAPON": {
          location: "Place Perrimond",
          days: [
            "2026-01-07","2026-01-21","2026-02-04","2026-02-18","2026-03-04","2026-03-18",
            "2026-04-01","2026-04-15","2026-04-29","2026-05-13","2026-05-27","2026-06-10",
            "2026-09-16","2026-09-30","2026-10-14","2026-10-28","2026-11-25","2026-12-09","2026-12-23"
          ].map(date => ({ date, time: "14:30-16:30" }))
          .concat([
            "2026-01-16","2026-01-30","2026-02-13","2026-02-27","2026-03-13","2026-03-27",
            "2026-04-10","2026-04-24","2026-05-22","2026-06-05","2026-09-25","2026-10-09",
            "2026-10-23","2026-11-06","2026-11-20","2026-12-04","2026-12-18"
          ].map(date => ({ date, time: "14:30-16:30" })))
        },

        "LA BASTIDE": {
          location: "Parking place du bas village",
          days: [
            "2026-01-16","2026-01-30","2026-02-13","2026-02-27","2026-03-13","2026-03-27",
            "2026-04-10","2026-04-24","2026-05-22","2026-06-05","2026-09-25","2026-10-09",
            "2026-10-23","2026-11-06","2026-11-20","2026-12-04","2026-12-18"
          ].map(date => ({ date, time: "10:00-12:00" }))
        },

        "CHÂTEAUDOUBLE": {
          location: "Grande Place",
          days: [
            "2026-01-13","2026-01-27","2026-02-10","2026-02-24","2026-03-10","2026-03-24",
            "2026-04-07","2026-04-21","2026-05-05","2026-05-19","2026-06-02","2026-09-22",
            "2026-10-06","2026-10-20","2026-11-03","2026-11-17","2026-12-01","2026-12-15","2026-12-29"
          ].map(date => ({ date, time: "15:00-17:00" }))
          .concat([
            "2026-01-10","2026-01-24","2026-02-07","2026-02-21","2026-03-07","2026-03-21",
            "2026-04-04","2026-04-18","2026-05-16","2026-05-30","2026-06-13","2026-09-19",
            "2026-10-03","2026-10-17","2026-10-31","2026-11-14","2026-11-28","2026-12-12"
          ].map(date => ({ date, time: "10:00-12:00" })))
        },

        "SAINT-ANTONIN": {
          location: "Parking du Parc Jean Fustier",
          days: [
            "2026-01-14","2026-01-28","2026-02-11","2026-02-25","2026-03-11","2026-03-25",
            "2026-04-08","2026-04-22","2026-05-20","2026-06-03","2026-09-23","2026-10-07",
            "2026-10-21","2026-11-04","2026-11-18","2026-12-02","2026-12-16","2026-12-30"
          ].map(date => ({ date, time: "10:00-12:00" }))
          .concat([
            "2026-01-09","2026-01-23","2026-02-06","2026-02-20","2026-03-06","2026-03-20",
            "2026-04-03","2026-04-17","2026-05-15","2026-05-29","2026-06-12","2026-09-18",
            "2026-10-02","2026-10-16","2026-10-30","2026-11-13","2026-11-27","2026-12-11"
          ].map(date => ({ date, time: "10:00-12:00" })))
          .concat([{ date: "2026-05-09", time: "10:00-12:00" }])
        },

        "SILLANS-LA-CASCADE": {
          location: "Parvis du Château",
          days: [
            "2026-01-14","2026-01-28","2026-02-11","2026-02-25","2026-03-11","2026-03-25",
            "2026-04-08","2026-04-22","2026-05-06","2026-05-20","2026-06-03","2026-09-23",
            "2026-10-07","2026-10-21","2026-11-04","2026-11-18","2026-12-02","2026-12-16"
          ].map(date => ({ date, time: "14:30-16:30" }))
          .concat([
            "2026-01-09","2026-01-23","2026-02-06","2026-02-20","2026-03-06","2026-03-20",
            "2026-04-03","2026-04-17","2026-05-15","2026-05-29","2026-06-12","2026-09-18",
            "2026-10-02","2026-10-16","2026-10-30","2026-11-13","2026-11-27","2026-12-11"
          ].map(date => ({ date, time: "15:00-17:00" })))
        },

        "TARADEAU": {
          location: "Place du Monument aux morts, rue de l'Ormeau",
          days: [
            "2026-01-06","2026-01-20","2026-02-03","2026-02-17","2026-03-03","2026-03-17",
            "2026-03-31","2026-04-14","2026-04-28","2026-05-12","2026-05-26","2026-06-09",
            "2026-09-15","2026-09-29","2026-10-13","2026-10-27","2026-11-10","2026-11-24",
            "2026-12-08","2026-12-22"
          ].map(date => ({ date, time: "15:00-17:00" }))
          .concat([
            "2026-01-17","2026-01-31","2026-02-14","2026-02-28","2026-03-14","2026-03-28",
            "2026-04-11","2026-04-25","2026-05-23","2026-09-26","2026-10-10","2026-11-07",
            "2026-11-21","2026-12-05","2026-12-19"
          ].map(date => ({ date, time: "10:00-12:00" })))
          .concat([{ date: "2026-05-06", time: "10:00-12:00" }])
        }
      };

      const DAY_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
      const DAY_TO_INDEX = Object.fromEntries(DAY_NAMES.map((name, index) => [name.toLowerCase(), index]));

      function buildLegacyConfig() {
        const navetteSlots = [];

        Object.entries(LEGACY_NAVETTE).forEach(([dayName, periods]) => {
          Object.entries(periods).forEach(([period, cities]) => {
            navetteSlots.push({
              id: uid("slot"),
              kind: "weekly",
              weekday: DAY_TO_INDEX[dayName.toLowerCase()],
              period,
              start: "08:00",
              end: "12:00",
              dateFrom: "",
              dateTo: "",
              stops: cities.map(name => ({ name, location: "", time: "" }))
            });
          });
        });

        const navetteExceptions = [];
        Object.entries(LEGACY_NAVETTE_EXCEPTIONS).forEach(([date, list]) => {
          list.forEach(item => {
            navetteExceptions.push({
              id: uid("exc"),
              date,
              period: item.period || "",
              cancelled: true
            });
          });
        });

        const mediabusSlots = [];
        Object.entries(LEGACY_MEDIABUS).forEach(([city, info]) => {
          info.days.forEach(day => {
            const [start, end] = String(day.time || "").split("-").map(v => v.trim());
            mediabusSlots.push({
              id: uid("slot"),
              kind: "date",
              date: day.date,
              period: "",
              start: start || "",
              end: end || "",
              stops: [{ name: city, location: info.location || "", time: start || "" }]
            });
          });
        });

        return {
          schemaVersion: 1,
          source: "legacy-dracenie-2026",
          services: [
            {
              id: "navette",
              name: "Navette",
              title: "Planning Navette",
              active: true,
              order: 10,
              color: "#408540",
              dateColor: "#408540",
              layout: "route",
              maxUpcoming: 5,
              showLocation: false,
              showStopTimes: false,
              gifEnabled: true,
              gifSegmentWidth: 65,
              gifUrl: "https://catalogue.example.org/userfiles/image/zPortailElems/icons8-camion.gif",
              slots: navetteSlots,
              exceptions: navetteExceptions
            },
            {
              id: "mediabus",
              name: "Médiabus",
              title: "Planning Médiabus",
              active: true,
              order: 20,
              color: "#e67e22",
              dateColor: "#408540",
              layout: "list",
              maxUpcoming: 5,
              showLocation: false,
              showStopTimes: false,
              gifEnabled: false,
              gifSegmentWidth: 0,
              gifUrl: "",
              slots: mediabusSlots,
              exceptions: []
            }
          ]
        };
      }

      /* ==============================================================
         3. ÉTAT / UTILITAIRES
         ============================================================== */

      let liveConfig = buildLegacyConfig();
      let adminConfig = deepClone(liveConfig);
      let configSource = "legacy";
      let adminUnlocked = sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
      let adminSelectedServiceId = "navette";
      let dirty = false;
      let minuteTimer = null;
      let dataTimer = null;

      function uid(prefix = "id") {
        const cryptoPart = (globalThis.crypto && crypto.randomUUID)
          ? crypto.randomUUID().replaceAll("-", "").slice(0, 12)
          : Math.random().toString(36).slice(2, 14);
        return `${prefix}_${Date.now().toString(36)}_${cryptoPart}`;
      }

      function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
      }

      function isAdminMode() {
        return adminUnlocked;
      }

      function showAdminLock() {
        if (adminUnlocked) {
          document.getElementById("ps-admin")?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        const lock = document.getElementById("ps-admin-lock");
        const input = document.getElementById("ps-admin-password");
        const error = document.getElementById("ps-admin-lock-error");
        if (error) error.textContent = "";
        if (input) input.value = "";
        if (lock) lock.hidden = false;
        setTimeout(() => input?.focus(), 0);
      }

      function hideAdminLock() {
        const lock = document.getElementById("ps-admin-lock");
        if (lock) lock.hidden = true;
      }

      async function unlockAdmin(password) {
        if (password !== ADMIN_PASSWORD) {
          const error = document.getElementById("ps-admin-lock-error");
          if (error) error.textContent = "Mot de passe incorrect.";
          return false;
        }

        adminUnlocked = true;
        sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
        hideAdminLock();
        document.getElementById("ps-admin-trigger-top")?.classList.add("ps-active");
        const admin = document.getElementById("ps-admin");
        if (admin) admin.hidden = false;
        renderAdmin();

        // Première initialisation transparente : si Firestore est encore vide,
        // on y copie la configuration historique actuellement affichée.
        const snap = await getDoc(CONFIG_REF).catch(() => null);
        if (snap && !snap.exists()) {
          await initializeFirebaseWithLegacy();
          await loadRemoteConfig();
        }

        return true;
      }

      function lockAdmin() {
        adminUnlocked = false;
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        dirty = false;
        adminConfig = deepClone(liveConfig);
        const admin = document.getElementById("ps-admin");
        if (admin) {
          admin.hidden = true;
          admin.replaceChildren();
        }
        document.getElementById("ps-admin-trigger-top")?.classList.remove("ps-active");
      }

      function normalizeText(value) {
        return String(value ?? "").trim();
      }

      function safeColor(value, fallback = "#408540") {
        const v = normalizeText(value);
        if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
        if (/^[a-z]{3,20}$/i.test(v)) return v;
        return fallback;
      }

      function safeHttpUrl(value) {
        const v = normalizeText(value);
        if (!v) return "";
        try {
          const url = new URL(v, location.href);
          return ["http:", "https:"].includes(url.protocol) ? url.href : "";
        } catch {
          return "";
        }
      }

      function formatDateFR(date) {
        return date.toLocaleDateString("fr-FR");
      }

      function toISODate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }

      function parseISODate(iso) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return null;
        const [y, m, d] = iso.split("-").map(Number);
        const date = new Date(y, m - 1, d, 0, 0, 0, 0);
        if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
        return date;
      }

      function relativeDayLabel(date) {
        const target = new Date(date);
        target.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Calcul sur les dates civiles pour éviter les décalages liés aux changements d'heure.
        const targetUtc = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
        const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
        const days = Math.round((targetUtc - todayUtc) / 86400000);

        if (days === 0) return "Aujourd’hui";
        if (days === 1) return "Demain";
        return `Dans ${days} jours`;
      }

      function timeToMinutes(value) {
        const match = /^(\d{1,2}):(\d{2})$/.exec(normalizeText(value));
        if (!match) return null;
        const h = Number(match[1]);
        const m = Number(match[2]);
        if (h > 23 || m > 59) return null;
        return h * 60 + m;
      }

      function calculateProgress(startMinutes, endMinutes, currentMinutes) {
        if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return 0;
        const totalDuration = endMinutes - startMinutes;
        const elapsedTime = currentMinutes - startMinutes;
        return Math.min(Math.max(elapsedTime / totalDuration, 0), 1);
      }

      function currentBranchName() {
        const node = document.querySelector(".logged-in-branch-name");
        return normalizeText(node?.textContent).toLowerCase();
      }

      function setStatus(text, kind = "") {
        const node = document.getElementById("ps-admin-status");
        if (!node) return;
        node.textContent = text;
        node.className = `ps-status ${kind ? `ps-${kind}` : ""}`;
      }

      function markDirty() {
        dirty = true;
        setStatus("Modifications non enregistrées", "warn");
      }

      function make(tag, className = "", text = "") {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== "") el.textContent = text;
        return el;
      }

      /* ==============================================================
         4. FIRESTORE : CHARGEMENT / SAUVEGARDE
         ============================================================== */

      async function loadRemoteConfig({ silent = false } = {}) {
        try {
          const snap = await getDoc(CONFIG_REF);
          if (!snap.exists()) {
            configSource = "legacy";
            liveConfig = buildLegacyConfig();
            if (!dirty) adminConfig = deepClone(liveConfig);
            if (!silent) renderPublic();
            return { exists: false, config: liveConfig };
          }

          const data = snap.data();
          const candidate = validateAndNormalizeConfig(data);
          liveConfig = candidate;
          configSource = "firebase";
          if (!dirty) adminConfig = deepClone(candidate);
          if (!silent) renderPublic();
          return { exists: true, config: candidate };
        } catch (error) {
          console.error("Planning: lecture Firebase impossible", error);
          configSource = "legacy";
          liveConfig = buildLegacyConfig();
          if (!dirty) adminConfig = deepClone(liveConfig);
          renderPublic();
          showRuntimeWarning("Firebase est momentanément inaccessible : le planning historique embarqué reste affiché.");
          return { exists: false, error, config: liveConfig };
        }
      }

      async function saveAdminConfig() {
        if (!adminUnlocked) {
          setStatus("Administration verrouillée", "error");
          return;
        }

        try {
          const normalized = validateAndNormalizeConfig(adminConfig);
          const payload = {
            ...normalized,
            updatedAt: serverTimestamp(),
            updatedBy: "koha-local-admin"
          };

          const approxBytes = new Blob([JSON.stringify(normalized)]).size;
          if (approxBytes > 800000) {
            throw new Error("La configuration approche la limite de taille d'un document Firestore. Réduisez l'import ou scindez les données.");
          }

          setStatus("Enregistrement…", "warn");
          await setDoc(CONFIG_REF, payload, { merge: false });
          liveConfig = deepClone(normalized);
          adminConfig = deepClone(normalized);
          configSource = "firebase";
          dirty = false;
          renderPublic();
          renderAdmin();
          setStatus("Enregistré dans Firebase", "ok");
        } catch (error) {
          console.error(error);
          setStatus(`Échec : ${error.message || error}`, "error");
        }
      }

      async function initializeFirebaseWithLegacy() {
        if (!adminUnlocked) return;
        try {
          const snap = await getDoc(CONFIG_REF);
          if (snap.exists()) return;
          adminConfig = buildLegacyConfig();
          await saveAdminConfig();
        } catch (error) {
          setStatus(`Initialisation impossible : ${error.message || error}`, "error");
        }
      }

      function validateAndNormalizeConfig(raw) {
        const cfg = raw && typeof raw === "object" ? deepClone(raw) : buildLegacyConfig();
        const services = Array.isArray(cfg.services) ? cfg.services : [];

        return {
          schemaVersion: Number(cfg.schemaVersion) || 1,
          source: normalizeText(cfg.source) || "firebase",
          services: services.map((service, index) => normalizeService(service, index))
        };
      }

      function normalizeService(service, index) {
        const id = normalizeText(service.id) || uid("service");
        const slots = Array.isArray(service.slots) ? service.slots : [];
        const exceptions = Array.isArray(service.exceptions) ? service.exceptions : [];

        return {
          id,
          name: normalizeText(service.name) || `Service ${index + 1}`,
          title: normalizeText(service.title) || normalizeText(service.name) || `Service ${index + 1}`,
          active: service.active !== false,
          order: Number.isFinite(Number(service.order)) ? Number(service.order) : ((index + 1) * 10),
          color: safeColor(service.color, "#408540"),
          dateColor: safeColor(service.dateColor, safeColor(service.color, "#408540")),
          layout: service.layout === "list" ? "list" : "route",
          maxUpcoming: Math.min(Math.max(Number(service.maxUpcoming) || 5, 1), 50),
          showLocation: service.showLocation === true,
          showStopTimes: service.showStopTimes === true,
          gifEnabled: service.gifEnabled === true,
          gifSegmentWidth: Math.max(0, Number(service.gifSegmentWidth) || 0),
          gifUrl: safeHttpUrl(service.gifUrl),
          slots: slots.map(normalizeSlot).filter(Boolean),
          exceptions: exceptions.map(normalizeException).filter(Boolean)
        };
      }

      function normalizeSlot(slot) {
        if (!slot || typeof slot !== "object") return null;
        const kind = slot.kind === "weekly" ? "weekly" : "date";
        const stops = Array.isArray(slot.stops) ? slot.stops : [];
        const normalizedStops = stops
          .map(stop => ({
            name: normalizeText(stop?.name),
            location: normalizeText(stop?.location),
            time: normalizeText(stop?.time)
          }))
          .filter(stop => stop.name);

        if (!normalizedStops.length) return null;

        const normalized = {
          id: normalizeText(slot.id) || uid("slot"),
          kind,
          period: normalizeText(slot.period),
          start: normalizeText(slot.start),
          end: normalizeText(slot.end),
          stops: normalizedStops
        };

        if (kind === "weekly") {
          normalized.weekday = Math.min(Math.max(Number(slot.weekday) || 0, 0), 6);
          normalized.dateFrom = normalizeText(slot.dateFrom);
          normalized.dateTo = normalizeText(slot.dateTo);
        } else {
          normalized.date = normalizeText(slot.date);
        }

        return normalized;
      }

      function normalizeException(exception) {
        if (!exception || typeof exception !== "object") return null;
        const date = normalizeText(exception.date);
        if (!parseISODate(date)) return null;
        return {
          id: normalizeText(exception.id) || uid("exc"),
          date,
          period: normalizeText(exception.period),
          cancelled: exception.cancelled !== false
        };
      }

      /* ==============================================================
         5. CALCUL DES PASSAGES
         ============================================================== */

      function isCancelled(service, isoDate, period) {
        return (service.exceptions || []).some(exception =>
          exception.cancelled &&
          exception.date === isoDate &&
          (!exception.period || exception.period === period)
        );
      }

      function weeklySlotApplies(slot, date) {
        if (slot.kind !== "weekly") return false;
        if (date.getDay() !== Number(slot.weekday)) return false;
        const iso = toISODate(date);
        if (slot.dateFrom && iso < slot.dateFrom) return false;
        if (slot.dateTo && iso > slot.dateTo) return false;
        return true;
      }

      function collectServiceOccurrences(service) {
        const today = new Date();
        today.setHours(0,0,0,0);
        const occurrences = [];

        // Dates explicites
        service.slots
          .filter(slot => slot.kind === "date")
          .forEach(slot => {
            const date = parseISODate(slot.date);
            if (!date || date < today) return;
            if (isCancelled(service, slot.date, slot.period)) return;
            occurrences.push({ ...deepClone(slot), dateObj: date, iso: slot.date });
          });

        // Récurrences hebdomadaires : horizon suffisamment large pour trouver les prochains passages.
        const weeklySlots = service.slots.filter(slot => slot.kind === "weekly");
        if (weeklySlots.length) {
          const horizon = new Date(today);
          horizon.setDate(horizon.getDate() + 180);

          for (let d = new Date(today); d <= horizon; d.setDate(d.getDate() + 1)) {
            const iso = toISODate(d);
            weeklySlots.forEach(slot => {
              if (!weeklySlotApplies(slot, d)) return;
              if (isCancelled(service, iso, slot.period)) return;
              occurrences.push({ ...deepClone(slot), dateObj: new Date(d), iso });
            });
          }
        }

        occurrences.sort((a, b) => {
          const dateDiff = a.dateObj - b.dateObj;
          if (dateDiff) return dateDiff;
          return (timeToMinutes(a.start) ?? 9999) - (timeToMinutes(b.start) ?? 9999);
        });

        return occurrences.slice(0, service.maxUpcoming || 5);
      }

      /* ==============================================================
         6. RENDU PUBLIC
         ============================================================== */

      function renderPublic() {
        const root = document.getElementById("ps-public");
        if (!root) return;
        root.replaceChildren();

        const grid = make("div", "ps-public-grid");
        const services = (liveConfig.services || [])
          .filter(service => service.active)
          .sort((a,b) => (a.order || 0) - (b.order || 0));

        services.forEach(service => grid.appendChild(renderService(service)));
        root.appendChild(grid);

        if (isAdminMode()) {
          const source = make("div", "ps-runtime-warning");
          source.textContent = configSource === "firebase"
            ? "Aperçu public : configuration chargée depuis Firebase."
            : "Aperçu public : configuration historique embarquée (Firebase non initialisé ou indisponible).";
          root.appendChild(source);
        }
      }

      function renderService(service) {
        const container = make("section", "ps-service-container");
        container.dataset.serviceId = service.id;

        const title = make("h1", "ps-service-title", service.title);
        title.style.color = safeColor(service.color);
        container.appendChild(title);

        const occurrences = collectServiceOccurrences(service);
        if (!occurrences.length) {
          container.appendChild(make("div", "ps-empty", "Aucun événement prévu"));
          return container;
        }

        if (service.layout === "list") {
          occurrences.forEach((occurrence, index) => {
            container.appendChild(renderListOccurrence(service, occurrence, index));
          });
        } else {
          occurrences.forEach((occurrence, index) => {
            container.appendChild(renderRouteOccurrence(service, occurrence, index));
          });
        }

        return container;
      }

      function renderCardHeader(service, occurrence, index) {
        const card = make("div", `ps-date-card${index === 0 ? " ps-next" : ""}`);

        if (index === 0) {
          card.dataset.relativeLabel = relativeDayLabel(occurrence.dateObj);
        }

        const h2 = make("h2", "", `${formatDateFR(occurrence.dateObj)} (${DAY_NAMES[occurrence.dateObj.getDay()]})`);
        h2.style.color = safeColor(service.dateColor, safeColor(service.color));
        card.appendChild(h2);
        return card;
      }

      function renderListOccurrence(service, occurrence, index) {
        const card = renderCardHeader(service, occurrence, index);
        const color = safeColor(service.color);

        occurrence.stops.forEach(stop => {
          const block = make("div");
          block.style.color = color;

          const name = make("div", "ps-location-name", stop.name);
          name.style.color = color;
          block.appendChild(name);

          const start = stop.time || occurrence.start;
          const range = occurrence.end && start ? `${start}-${occurrence.end}` : (start || occurrence.end || "");
          if (range) block.appendChild(make("div", "ps-time-info", `🕐 ${range}`));

          if (service.showLocation && stop.location) {
            block.appendChild(make("div", "ps-location-detail", stop.location));
          }

          card.appendChild(block);
        });

        return card;
      }

      function renderRouteOccurrence(service, occurrence, index) {
        const card = renderCardHeader(service, occurrence, index);
        const color = safeColor(service.color);

        if (occurrence.period) {
          const period = make("span", "ps-period", occurrence.period);
          period.style.color = color;
          card.appendChild(period);
        }

        const line = make("div", "ps-line");
        line.style.color = color;
        const branch = currentBranchName();

        occurrence.stops.forEach(stop => {
          const wrapper = make("div", "ps-stop-wrapper");
          const dot = make("div", "ps-stop");
          dot.style.borderColor = color;

          if (normalizeText(stop.name).toLowerCase() === branch) {
            dot.classList.add("ps-current-branch");
          }

          const label = make("div", "ps-stop-label", stop.name);
          if (service.showStopTimes && stop.time) {
            label.appendChild(make("span", "ps-stop-time", stop.time));
          }

          dot.appendChild(label);
          wrapper.appendChild(dot);
          line.appendChild(wrapper);
        });

        maybeAddMovingGif(service, occurrence, line);
        card.appendChild(line);

        if (service.showLocation) {
          occurrence.stops.forEach(stop => {
            if (stop.location) {
              card.appendChild(make("div", "ps-location-detail", `${stop.name} — ${stop.location}`));
            }
          });
        }

        return card;
      }

      function maybeAddMovingGif(service, occurrence, line) {
        if (!service.gifEnabled || !service.gifUrl || occurrence.stops.length < 2) return;

        const todayISO = toISODate(new Date());
        if (occurrence.iso !== todayISO) return;

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const start = timeToMinutes(occurrence.start);
        const end = timeToMinutes(occurrence.end);
        if (start == null || end == null || currentMinutes < start || currentMinutes > end) return;

        const gif = make("div", "ps-moving-gif");
        gif.style.backgroundImage = `url("${safeHttpUrl(service.gifUrl)}")`;
        line.appendChild(gif);

        requestAnimationFrame(() => updateGifPosition(service, gif, occurrence, line));
      }

      function updateGifPosition(service, gif, occurrence, line) {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const wrappers = [...line.querySelectorAll(".ps-stop-wrapper")];
        if (wrappers.length < 2) return;

        const exactTimes = occurrence.stops.map(stop => timeToMinutes(stop.time));
        const allExact = exactTimes.every(value => value != null);
        const fixedSegmentWidth = Math.max(0, Number(service.gifSegmentWidth) || 0);
        let px = 0;

        if (fixedSegmentWidth > 0 && !allExact) {
          const start = timeToMinutes(occurrence.start);
          const end = timeToMinutes(occurrence.end);
          const p = calculateProgress(start, end, currentMinutes);
          px = p * (occurrence.stops.length - 1) * fixedSegmentWidth;
        } else if (allExact) {
          if (currentMinutes <= exactTimes[0]) {
            px = wrappers[0].offsetLeft;
          } else if (currentMinutes >= exactTimes.at(-1)) {
            px = wrappers.at(-1).offsetLeft;
          } else {
            for (let i = 0; i < exactTimes.length - 1; i++) {
              if (currentMinutes >= exactTimes[i] && currentMinutes <= exactTimes[i + 1]) {
                const p = calculateProgress(exactTimes[i], exactTimes[i + 1], currentMinutes);
                px = wrappers[i].offsetLeft + (wrappers[i + 1].offsetLeft - wrappers[i].offsetLeft) * p;
                break;
              }
            }
          }
        } else {
          const start = timeToMinutes(occurrence.start);
          const end = timeToMinutes(occurrence.end);
          const p = calculateProgress(start, end, currentMinutes);
          px = wrappers[0].offsetLeft + (wrappers.at(-1).offsetLeft - wrappers[0].offsetLeft) * p;
        }

        gif.style.left = `${Math.max(0, px)}px`;
      }

      function showRuntimeWarning(message) {
        if (!isAdminMode()) return;
        const root = document.getElementById("ps-public");
        const warning = make("div", "ps-runtime-warning", message);
        root?.appendChild(warning);
      }

      /* ==============================================================
         7. ADMINISTRATION
         ============================================================== */

      function renderAdmin() {
        const admin = document.getElementById("ps-admin");
        if (!admin || !isAdminMode()) return;
        admin.hidden = false;
        admin.replaceChildren();

        const toolbar = make("div", "ps-admin-toolbar");
        const headingWrap = make("div");
        headingWrap.style.marginRight = "auto";
        headingWrap.appendChild(make("h1", "", "Administration des services"));
        headingWrap.appendChild(make("div", "ps-help", "Navette, Médiabus et tout autre service utilisent désormais le même moteur paramétrable."));
        toolbar.appendChild(headingWrap);

        const status = make("span", "ps-status", "Administration ouverte");
        status.id = "ps-admin-status";
        toolbar.appendChild(status);

        const reloadBtn = button("Recharger Firebase", async () => {
          dirty = false;
          await loadRemoteConfig();
          adminConfig = deepClone(liveConfig);
          renderAdmin();
        });
        toolbar.appendChild(reloadBtn);

        const saveBtn = button("Enregistrer dans Firebase", saveAdminConfig, "ps-btn ps-btn-primary");
        toolbar.appendChild(saveBtn);
        toolbar.appendChild(button("Fermer l’administration", lockAdmin, "ps-btn"));

        admin.appendChild(toolbar);
        admin.appendChild(renderLocalAdminPanel());

        const grid = make("div", "ps-admin-grid");
        grid.appendChild(renderServiceManager());
        grid.appendChild(renderScheduleManager());
        admin.appendChild(grid);
        admin.appendChild(renderImportExportPanel());
      }

      function renderLocalAdminPanel() {
        const panel = make("div", "ps-admin-panel");
        const text = make("div", "ps-help");
        text.textContent = "Accès protégé par le mot de passe local du script. Aucun compte Firebase n’est utilisé. Les modifications sont enregistrées directement dans Firestore.";
        panel.appendChild(text);

        if (configSource !== "firebase") {
          const note = make("div", "ps-help");
          note.style.marginTop = "8px";
          note.textContent = "Aucune configuration Firebase active n’est encore chargée. La configuration actuelle Navette + Médiabus sera initialisée automatiquement avant la première modification.";
          panel.appendChild(note);
        }
        return panel;
      }

      function renderServiceManager() {
        const panel = make("section", "ps-admin-panel");
        panel.appendChild(make("h2", "", "Services"));

        const controls = make("div", "ps-admin-toolbar");
        controls.style.padding = "0";
        controls.style.border = "0";
        controls.style.boxShadow = "none";
        controls.appendChild(button("+ Ajouter un service", () => addService(), "ps-btn ps-btn-primary"));
        panel.appendChild(controls);

        const list = make("div", "ps-service-list");
        adminConfig.services
          .slice()
          .sort((a,b) => a.order - b.order)
          .forEach(service => {
            const row = make("div", `ps-service-row${service.id === adminSelectedServiceId ? " ps-selected" : ""}`);
            const left = make("div");
            const title = make("strong", "", service.title);
            title.style.color = safeColor(service.color);
            left.appendChild(title);
            left.appendChild(make("div", "ps-service-meta", `${service.name} · ${service.layout === "route" ? "Parcours" : "Liste"} · ${service.slots.length} passage(s)`));
            row.appendChild(left);

            const actions = make("div");
            actions.appendChild(button("Configurer", () => {
              adminSelectedServiceId = service.id;
              renderAdmin();
            }, "ps-btn ps-btn-small"));
            row.appendChild(actions);
            list.appendChild(row);
          });
        panel.appendChild(list);

        const service = getSelectedService();
        if (service) panel.appendChild(renderServiceForm(service));
        return panel;
      }

      function renderServiceForm(service) {
        const wrap = make("div");
        wrap.style.marginTop = "14px";
        wrap.appendChild(make("h3", "", `Configurer : ${service.title}`));

        const form = make("div", "ps-form-grid");
        form.appendChild(textControl("Nom interne", service.name, value => { service.name = value; markDirty(); }));
        form.appendChild(textControl("Titre affiché", service.title, value => { service.title = value; markDirty(); }));
        form.appendChild(textControl("Couleur du service", service.color, value => { service.color = safeColor(value, service.color); markDirty(); renderAdmin(); }));
        form.appendChild(textControl("Couleur des dates", service.dateColor, value => { service.dateColor = safeColor(value, service.dateColor); markDirty(); renderAdmin(); }));

        const layout = selectControl("Affichage", [
          ["route", "Parcours / ligne avec étapes"],
          ["list", "Liste de passages"]
        ], service.layout, value => { service.layout = value; markDirty(); renderAdmin(); });
        form.appendChild(layout);

        form.appendChild(numberControl("Nombre de prochains passages", service.maxUpcoming, 1, 50, value => { service.maxUpcoming = value; markDirty(); }));
        form.appendChild(numberControl("Ordre d'affichage", service.order, -999, 9999, value => { service.order = value; markDirty(); }));
        form.appendChild(checkboxControl("Service actif", service.active, value => { service.active = value; markDirty(); }));
        form.appendChild(checkboxControl("Afficher le détail des lieux", service.showLocation, value => { service.showLocation = value; markDirty(); }));
        form.appendChild(checkboxControl("Afficher l'heure sous chaque étape", service.showStopTimes, value => { service.showStopTimes = value; markDirty(); }));
        form.appendChild(checkboxControl("GIF mobile activé", service.gifEnabled, value => { service.gifEnabled = value; markDirty(); }));
        form.appendChild(numberControl("Pas du GIF entre étapes (px, 0 = position réelle)", service.gifSegmentWidth || 0, 0, 500, value => { service.gifSegmentWidth = value; markDirty(); }));

        const gif = textControl("URL du GIF", service.gifUrl, value => { service.gifUrl = safeHttpUrl(value); markDirty(); });
        gif.classList.add("ps-span-2");
        form.appendChild(gif);
        wrap.appendChild(form);

        const actions = make("div", "ps-admin-toolbar");
        actions.style.marginTop = "10px";
        actions.style.marginBottom = "0";
        actions.style.padding = "0";
        actions.style.border = "0";
        actions.style.boxShadow = "none";
        actions.appendChild(button("Dupliquer", () => duplicateService(service), "ps-btn"));
        actions.appendChild(button("Supprimer ce service", () => deleteService(service), "ps-btn ps-btn-danger"));
        wrap.appendChild(actions);
        return wrap;
      }

      function renderScheduleManager() {
        const panel = make("section", "ps-admin-panel");
        const service = getSelectedService();
        panel.appendChild(make("h2", "", service ? `Passages — ${service.title}` : "Passages"));
        if (!service) return panel;

        panel.appendChild(renderSlotForm(service));
        panel.appendChild(renderExceptionForm(service));
        panel.appendChild(renderSlotsTable(service));
        return panel;
      }

      function renderSlotForm(service, slot = null) {
        const editing = Boolean(slot);
        const draft = slot ? deepClone(slot) : {
          id: "",
          kind: "weekly",
          weekday: 1,
          date: toISODate(new Date()),
          dateFrom: "",
          dateTo: "",
          period: "Matin",
          start: "08:00",
          end: "12:00",
          stops: [{ name: "", location: "", time: "" }]
        };

        const box = make("div");
        box.appendChild(make("h3", "", editing ? "Modifier un passage" : "Ajouter un passage"));
        const form = make("form", "ps-form-grid");

        const kindField = make("div", "ps-field");
        kindField.appendChild(make("label", "", "Type de programmation"));
        const kind = document.createElement("select");
        kind.innerHTML = '<option value="weekly">Récurrence hebdomadaire</option><option value="date">Date précise</option>';
        kind.value = draft.kind;
        kindField.appendChild(kind);
        form.appendChild(kindField);

        const dayField = make("div", "ps-field");
        const dayLabel = make("label", "", draft.kind === "weekly" ? "Jour" : "Date");
        dayField.appendChild(dayLabel);
        let dayInput = buildDayInput(draft);
        dayField.appendChild(dayInput);
        form.appendChild(dayField);

        kind.addEventListener("change", () => {
          draft.kind = kind.value;
          dayLabel.textContent = draft.kind === "weekly" ? "Jour" : "Date";
          dayInput.remove();
          dayInput = buildDayInput(draft);
          dayField.appendChild(dayInput);
          updateRangeVisibility();
        });

        const period = inputField("Période / demi-journée", draft.period, "text");
        const start = inputField("Heure début", draft.start, "time");
        const end = inputField("Heure fin", draft.end, "time");
        form.append(period.wrapper, start.wrapper, end.wrapper);

        const from = inputField("Valable à partir du", draft.dateFrom || "", "date");
        from.wrapper.dataset.weeklyOnly = "1";
        const to = inputField("Valable jusqu'au", draft.dateTo || "", "date");
        to.wrapper.dataset.weeklyOnly = "1";
        form.append(from.wrapper, to.wrapper);

        const stopsField = make("div", "ps-field ps-span-2");
        stopsField.appendChild(make("label", "", "Lieux / étapes — une ligne par arrêt"));
        const stopsText = document.createElement("textarea");
        stopsText.placeholder = "Nom | Détail du lieu | 09:15\nDeuxième lieu | Place de la mairie | 10:00";
        stopsText.value = draft.stops.map(stop => [stop.name, stop.location, stop.time].join(" | ").replace(/\s+\|\s+\|\s*$/, "").replace(/\s+\|\s*$/, "")).join("\n");
        stopsField.appendChild(stopsText);
        stopsField.appendChild(make("div", "ps-help", "L'heure par arrêt est facultative. Si elle est renseignée pour toutes les étapes, le GIF se déplace en fonction de ces heures réelles. Sinon il progresse linéairement entre l'heure de début et de fin."));
        form.appendChild(stopsField);

        const actions = make("div", "ps-field ps-span-2");
        const submit = button(editing ? "Enregistrer la modification" : "Ajouter ce passage", null, "ps-btn ps-btn-primary");
        submit.type = "submit";
        actions.appendChild(submit);
        if (editing) actions.appendChild(button("Annuler", () => renderAdmin(), "ps-btn"));
        form.appendChild(actions);

        function updateRangeVisibility() {
          form.querySelectorAll('[data-weekly-only="1"]').forEach(node => {
            node.style.display = draft.kind === "weekly" ? "block" : "none";
          });
        }
        updateRangeVisibility();

        form.addEventListener("submit", event => {
          event.preventDefault();
          draft.period = period.input.value.trim();
          draft.start = start.input.value;
          draft.end = end.input.value;
          draft.dateFrom = from.input.value;
          draft.dateTo = to.input.value;
          draft.stops = parseStopsText(stopsText.value);

          if (!draft.stops.length) {
            alert("Ajoutez au moins un lieu de passage.");
            return;
          }
          if (draft.kind === "date" && !parseISODate(draft.date)) {
            alert("Date invalide.");
            return;
          }

          if (editing) {
            const index = service.slots.findIndex(item => item.id === slot.id);
            if (index >= 0) service.slots[index] = normalizeSlot({ ...draft, id: slot.id });
          } else {
            service.slots.push(normalizeSlot({ ...draft, id: uid("slot") }));
          }
          markDirty();
          renderAdmin();
        });

        box.appendChild(form);
        return box;

        function buildDayInput(model) {
          if (model.kind === "weekly") {
            const select = document.createElement("select");
            DAY_NAMES.forEach((name, index) => {
              const option = document.createElement("option");
              option.value = String(index);
              option.textContent = name;
              select.appendChild(option);
            });
            select.value = String(model.weekday ?? 1);
            select.addEventListener("change", () => { model.weekday = Number(select.value); });
            return select;
          }

          const input = document.createElement("input");
          input.type = "date";
          input.value = model.date || toISODate(new Date());
          input.addEventListener("change", () => { model.date = input.value; });
          return input;
        }
      }

      function renderExceptionForm(service) {
        const details = document.createElement("details");
        details.style.margin = "12px 0";
        const summary = document.createElement("summary");
        summary.textContent = `Exceptions / annulations (${service.exceptions.length})`;
        summary.style.cursor = "pointer";
        summary.style.fontWeight = "bold";
        details.appendChild(summary);

        const form = make("form", "ps-form-grid");
        form.style.marginTop = "8px";
        const date = inputField("Date à annuler", "", "date");
        const period = inputField("Période (vide = toute la journée)", "", "text");
        form.append(date.wrapper, period.wrapper);
        const actions = make("div", "ps-field ps-span-2");
        const add = button("Ajouter l'annulation", null, "ps-btn");
        add.type = "submit";
        actions.appendChild(add);
        form.appendChild(actions);

        form.addEventListener("submit", event => {
          event.preventDefault();
          if (!parseISODate(date.input.value)) return alert("Choisissez une date valide.");
          service.exceptions.push({ id: uid("exc"), date: date.input.value, period: period.input.value.trim(), cancelled: true });
          markDirty();
          renderAdmin();
        });

        details.appendChild(form);

        if (service.exceptions.length) {
          const list = make("div", "ps-help");
          service.exceptions
            .slice()
            .sort((a,b) => a.date.localeCompare(b.date))
            .forEach(exception => {
              const row = make("div");
              row.style.margin = "4px 0";
              row.appendChild(document.createTextNode(`${exception.date}${exception.period ? ` — ${exception.period}` : " — journée entière"} `));
              row.appendChild(button("Supprimer", () => {
                service.exceptions = service.exceptions.filter(item => item.id !== exception.id);
                markDirty();
                renderAdmin();
              }, "ps-btn ps-btn-small ps-btn-danger"));
              list.appendChild(row);
            });
          details.appendChild(list);
        }

        return details;
      }

      function renderSlotsTable(service) {
        const wrap = make("div", "ps-schedule-table-wrap");
        const table = make("table", "ps-schedule-table");
        const thead = document.createElement("thead");
        const trh = document.createElement("tr");
        ["Programmation", "Période", "Horaires", "Lieux", "Actions"].forEach(text => trh.appendChild(make("th", "", text)));
        thead.appendChild(trh);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        const sorted = service.slots.slice().sort((a,b) => slotSortKey(a).localeCompare(slotSortKey(b)));
        sorted.forEach(slot => {
          const tr = document.createElement("tr");
          tr.appendChild(make("td", "", slot.kind === "weekly" ? `${DAY_NAMES[slot.weekday]}${slot.dateFrom || slot.dateTo ? ` (${slot.dateFrom || "…"} → ${slot.dateTo || "…"})` : ""}` : slot.date));
          tr.appendChild(make("td", "", slot.period || "—"));
          tr.appendChild(make("td", "", [slot.start, slot.end].filter(Boolean).join(" – ") || "—"));
          tr.appendChild(make("td", "", slot.stops.map(stop => stop.name).join(" → ")));
          const actions = make("td");
          actions.appendChild(button("Modifier", () => {
            const holder = document.createElement("div");
            holder.appendChild(renderSlotForm(service, slot));
            const panel = tr.closest(".ps-admin-panel");
            const old = panel.querySelector("form.ps-form-grid");
            if (old) old.parentElement.replaceWith(holder.firstElementChild);
          }, "ps-btn ps-btn-small"));
          actions.appendChild(button("Supprimer", () => {
            if (!confirm("Supprimer ce passage ?")) return;
            service.slots = service.slots.filter(item => item.id !== slot.id);
            markDirty();
            renderAdmin();
          }, "ps-btn ps-btn-small ps-btn-danger"));
          tr.appendChild(actions);
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        return wrap;
      }

      function slotSortKey(slot) {
        if (slot.kind === "date") return `0_${slot.date}_${slot.start}`;
        return `1_${String(slot.weekday).padStart(2,"0")}_${slot.start}_${slot.period}`;
      }

      function addService() {
        const service = {
          id: uid("service"),
          name: "Nouveau service",
          title: "Planning Nouveau service",
          active: true,
          order: Math.max(0, ...adminConfig.services.map(s => Number(s.order) || 0)) + 10,
          color: "#408540",
          dateColor: "#408540",
          layout: "route",
          maxUpcoming: 5,
          showLocation: false,
          showStopTimes: false,
          gifEnabled: false,
          gifSegmentWidth: 0,
          gifUrl: "",
          slots: [],
          exceptions: []
        };
        adminConfig.services.push(service);
        adminSelectedServiceId = service.id;
        markDirty();
        renderAdmin();
      }

      function duplicateService(service) {
        const copy = deepClone(service);
        copy.id = uid("service");
        copy.name = `${copy.name} copie`;
        copy.title = `${copy.title} copie`;
        copy.order = Number(copy.order || 0) + 1;
        copy.slots = copy.slots.map(slot => ({ ...slot, id: uid("slot") }));
        copy.exceptions = copy.exceptions.map(exception => ({ ...exception, id: uid("exc") }));
        adminConfig.services.push(copy);
        adminSelectedServiceId = copy.id;
        markDirty();
        renderAdmin();
      }

      function deleteService(service) {
        if (!confirm(`Supprimer le service « ${service.title} » et tous ses passages ?`)) return;
        adminConfig.services = adminConfig.services.filter(item => item.id !== service.id);
        adminSelectedServiceId = adminConfig.services[0]?.id || "";
        markDirty();
        renderAdmin();
      }

      function getSelectedService() {
        return adminConfig.services.find(service => service.id === adminSelectedServiceId) || adminConfig.services[0] || null;
      }

      /* ==============================================================
         8. IMPORT / EXPORT EN MASSE
         ============================================================== */

      function renderImportExportPanel() {
        const panel = make("section", "ps-admin-panel");
        panel.appendChild(make("h2", "", "Import / export en masse"));
        panel.appendChild(make("div", "ps-help", "L'import peut ajouter des passages à plusieurs services en une seule opération. Utilisez l'identifiant du service (ex. navette, mediabus) ou son nom."));

        const format = make("div", "ps-code-note");
        format.textContent = [
          "CSV (séparateur ; recommandé) :",
          "service;type;date;weekday;period;start;end;stops",
          "mediabus;date;2026-10-05;;Matin;10:00;12:00;Village A|Place de la mairie|10:00",
          "navette;weekly;;Lundi;Matin;08:00;12:00;Le Muy||08:00 > Vidauban||09:00 > Lorgues||10:00",
          "",
          "type = date ou weekly",
          "stops = Nom|Détail|Heure > Nom|Détail|Heure",
          "",
          "JSON accepté : objet complet {services:[...]} ou tableau de lignes d'import."
        ].join("\n");
        panel.appendChild(format);

        const textarea = document.createElement("textarea");
        textarea.id = "ps-bulk-import";
        textarea.style.width = "100%";
        textarea.style.minHeight = "180px";
        textarea.style.boxSizing = "border-box";
        textarea.style.marginTop = "10px";
        textarea.placeholder = "Collez ici votre CSV ou JSON…";
        panel.appendChild(textarea);

        const file = document.createElement("input");
        file.type = "file";
        file.accept = ".csv,.txt,.json,text/csv,text/plain,application/json";
        file.addEventListener("change", async () => {
          const selected = file.files?.[0];
          if (selected) textarea.value = await selected.text();
        });
        panel.appendChild(file);

        const actions = make("div", "ps-admin-toolbar");
        actions.style.marginTop = "10px";
        actions.style.marginBottom = "0";
        actions.style.padding = "0";
        actions.style.border = "0";
        actions.style.boxShadow = "none";

        actions.appendChild(button("Prévisualiser l'import", () => previewBulkImport(textarea.value), "ps-btn"));
        actions.appendChild(button("Importer en ajout", () => applyBulkImport(textarea.value, false), "ps-btn ps-btn-primary"));
        actions.appendChild(button("Importer en remplaçant les passages concernés", () => applyBulkImport(textarea.value, true), "ps-btn"));
        actions.appendChild(button("Exporter JSON", exportJson, "ps-btn"));
        actions.appendChild(button("Exporter CSV", exportCsv, "ps-btn"));
        panel.appendChild(actions);

        const result = make("div", "ps-help");
        result.id = "ps-import-result";
        result.style.marginTop = "8px";
        panel.appendChild(result);
        return panel;
      }

      function parseBulk(text) {
        const raw = String(text || "").trim();
        if (!raw) throw new Error("Import vide.");

        if (raw.startsWith("{") || raw.startsWith("[")) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.services)) {
            return { fullConfig: validateAndNormalizeConfig(parsed), rows: [] };
          }
          if (Array.isArray(parsed)) {
            return { rows: parsed.map(normalizeImportRow), fullConfig: null };
          }
          throw new Error("JSON non reconnu.");
        }

        const lines = raw.split(/\r?\n/).filter(line => line.trim());
        const delimiter = detectDelimiter(lines[0]);
        const rows = lines.map(line => parseDelimitedLine(line, delimiter));
        const headers = rows.shift().map(h => h.trim().toLowerCase());

        return {
          fullConfig: null,
          rows: rows.map(values => {
            const obj = {};
            headers.forEach((header, index) => { obj[header] = values[index] ?? ""; });
            return normalizeImportRow(obj);
          })
        };
      }

      function detectDelimiter(line) {
        const counts = [";", "\t", ","].map(delim => [delim, line.split(delim).length]);
        counts.sort((a,b) => b[1] - a[1]);
        return counts[0][0];
      }

      function parseDelimitedLine(line, delimiter) {
        const result = [];
        let current = "";
        let quoted = false;

        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (quoted && line[i + 1] === '"') { current += '"'; i++; }
            else quoted = !quoted;
          } else if (ch === delimiter && !quoted) {
            result.push(current.trim());
            current = "";
          } else {
            current += ch;
          }
        }
        result.push(current.trim());
        return result;
      }

      function normalizeImportRow(row) {
        const type = normalizeText(row.type || row.kind || "date").toLowerCase();
        const stopsRaw = row.stops ?? row.lieux ?? row.places ?? "";
        const stops = Array.isArray(stopsRaw)
          ? stopsRaw.map(stop => ({
              name: normalizeText(stop.name ?? stop.nom),
              location: normalizeText(stop.location ?? stop.lieu),
              time: normalizeText(stop.time ?? stop.heure)
            })).filter(stop => stop.name)
          : parseStopsInline(String(stopsRaw));

        let weekday = row.weekday ?? row.jour ?? "";
        if (typeof weekday === "string" && !/^\d$/.test(weekday.trim())) {
          weekday = DAY_TO_INDEX[weekday.trim().toLowerCase()];
        }

        return {
          service: normalizeText(row.service || row.serviceid || row.module),
          kind: type === "weekly" || type === "hebdo" || type === "hebdomadaire" ? "weekly" : "date",
          date: normalizeText(row.date),
          weekday: Number(weekday),
          dateFrom: normalizeText(row.datefrom || row.debutvalidite),
          dateTo: normalizeText(row.dateto || row.finvalidite),
          period: normalizeText(row.period || row.periode || row.demijournee),
          start: normalizeText(row.start || row.debut || row.heuredebut),
          end: normalizeText(row.end || row.fin || row.heurefin),
          stops
        };
      }

      function parseStopsInline(value) {
        return String(value || "")
          .split(/\s*>\s*/)
          .map(part => {
            const [name = "", location = "", time = ""] = part.split("|").map(v => v.trim());
            return { name, location, time };
          })
          .filter(stop => stop.name);
      }

      function parseStopsText(value) {
        return String(value || "")
          .split(/\r?\n/)
          .map(line => {
            const [name = "", location = "", time = ""] = line.split("|").map(v => v.trim());
            return { name, location, time };
          })
          .filter(stop => stop.name);
      }

      function resolveServiceForImport(token) {
        const normalized = normalizeText(token).toLowerCase();
        return adminConfig.services.find(service =>
          service.id.toLowerCase() === normalized ||
          service.name.toLowerCase() === normalized ||
          service.title.toLowerCase() === normalized
        );
      }

      function previewBulkImport(text) {
        const result = document.getElementById("ps-import-result");
        try {
          const parsed = parseBulk(text);
          if (parsed.fullConfig) {
            result.textContent = `Configuration complète valide : ${parsed.fullConfig.services.length} service(s).`;
            return;
          }
          const unresolved = parsed.rows.filter(row => !resolveServiceForImport(row.service));
          const invalid = parsed.rows.filter(row => !row.stops.length || (row.kind === "date" && !parseISODate(row.date)) || (row.kind === "weekly" && !(row.weekday >= 0 && row.weekday <= 6)));
          result.textContent = `${parsed.rows.length} ligne(s) détectée(s), ${unresolved.length} service(s) introuvable(s), ${invalid.length} ligne(s) invalide(s).`;
        } catch (error) {
          result.textContent = `Erreur : ${error.message || error}`;
        }
      }

      function applyBulkImport(text, replaceMatching) {
        const result = document.getElementById("ps-import-result");
        try {
          const parsed = parseBulk(text);
          if (parsed.fullConfig) {
            if (!confirm("Remplacer toute la configuration locale par le JSON importé ?")) return;
            adminConfig = parsed.fullConfig;
            adminSelectedServiceId = adminConfig.services[0]?.id || "";
            markDirty();
            renderAdmin();
            return;
          }

          let imported = 0;
          let skipped = 0;
          const errors = [];

          parsed.rows.forEach((row, index) => {
            const service = resolveServiceForImport(row.service);
            if (!service) {
              skipped++;
              errors.push(`Ligne ${index + 2}: service « ${row.service} » introuvable.`);
              return;
            }
            if (!row.stops.length) {
              skipped++;
              errors.push(`Ligne ${index + 2}: aucun lieu.`);
              return;
            }
            if (row.kind === "date" && !parseISODate(row.date)) {
              skipped++;
              errors.push(`Ligne ${index + 2}: date invalide.`);
              return;
            }
            if (row.kind === "weekly" && !(row.weekday >= 0 && row.weekday <= 6)) {
              skipped++;
              errors.push(`Ligne ${index + 2}: jour invalide.`);
              return;
            }

            const slot = normalizeSlot({ ...row, id: uid("slot") });
            if (replaceMatching) {
              service.slots = service.slots.filter(existing => !sameSlotScope(existing, slot));
            }
            service.slots.push(slot);
            imported++;
          });

          markDirty();
          renderAdmin();
          const node = document.getElementById("ps-import-result");
          if (node) node.textContent = `${imported} passage(s) importé(s), ${skipped} ignoré(s).${errors.length ? ` ${errors.slice(0, 5).join(" ")}` : ""}`;
        } catch (error) {
          if (result) result.textContent = `Erreur : ${error.message || error}`;
        }
      }

      function sameSlotScope(a, b) {
        if (a.kind !== b.kind) return false;
        if ((a.period || "") !== (b.period || "")) return false;
        if (a.kind === "date") return a.date === b.date;
        return Number(a.weekday) === Number(b.weekday);
      }

      function exportJson() {
        downloadText("planning-services.json", JSON.stringify(adminConfig, null, 2), "application/json;charset=utf-8");
      }

      function exportCsv() {
        const rows = [["service","type","date","weekday","period","start","end","stops"]];
        adminConfig.services.forEach(service => {
          service.slots.forEach(slot => {
            rows.push([
              service.id,
              slot.kind,
              slot.date || "",
              slot.kind === "weekly" ? DAY_NAMES[slot.weekday] : "",
              slot.period || "",
              slot.start || "",
              slot.end || "",
              slot.stops.map(stop => [stop.name, stop.location, stop.time].join("|")).join(" > ")
            ]);
          });
        });
        const csv = rows.map(row => row.map(csvEscape).join(";")).join("\n");
        downloadText("planning-services.csv", csv, "text/csv;charset=utf-8");
      }

      function csvEscape(value) {
        const text = String(value ?? "");
        return /[;"\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
      }

      function downloadText(filename, content, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      /* ==============================================================
         9. PETITS COMPOSANTS ADMIN
         ============================================================== */

      function button(text, onClick, className = "ps-btn") {
        const btn = make("button", className, text);
        btn.type = "button";
        if (onClick) btn.addEventListener("click", onClick);
        return btn;
      }

      function field(labelText, type, id) {
        const wrapper = make("div", "ps-field");
        const label = make("label", "", labelText);
        label.htmlFor = id;
        const input = document.createElement("input");
        input.type = type;
        input.id = id;
        wrapper.append(label, input);
        return { wrapper, input };
      }

      function inputField(labelText, value, type = "text") {
        const wrapper = make("div", "ps-field");
        wrapper.appendChild(make("label", "", labelText));
        const input = document.createElement("input");
        input.type = type;
        input.value = value ?? "";
        wrapper.appendChild(input);
        return { wrapper, input };
      }

      function textControl(labelText, value, onChange) {
        const field = inputField(labelText, value, "text");
        field.input.addEventListener("change", () => onChange(field.input.value));
        return field.wrapper;
      }

      function numberControl(labelText, value, min, max, onChange) {
        const field = inputField(labelText, value, "number");
        field.input.min = String(min);
        field.input.max = String(max);
        field.input.addEventListener("change", () => onChange(Number(field.input.value)));
        return field.wrapper;
      }

      function checkboxControl(labelText, checked, onChange) {
        const wrapper = make("div", "ps-field");
        const box = make("label", "ps-checkbox");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = Boolean(checked);
        input.addEventListener("change", () => onChange(input.checked));
        box.append(input, document.createTextNode(labelText));
        wrapper.appendChild(box);
        return wrapper;
      }

      function selectControl(labelText, options, value, onChange) {
        const wrapper = make("div", "ps-field");
        wrapper.appendChild(make("label", "", labelText));
        const select = document.createElement("select");
        options.forEach(([optionValue, optionLabel]) => {
          const option = document.createElement("option");
          option.value = optionValue;
          option.textContent = optionLabel;
          select.appendChild(option);
        });
        select.value = value;
        select.addEventListener("change", () => onChange(select.value));
        wrapper.appendChild(select);
        return wrapper;
      }

      /* ==============================================================
         10. DÉMARRAGE
         ============================================================== */

      async function boot() {
        const triggerTop = document.getElementById("ps-admin-trigger-top");
        const lockForm = document.getElementById("ps-admin-lock-form");
        const lockCancel = document.getElementById("ps-admin-lock-cancel");

        triggerTop?.addEventListener("click", showAdminLock);
        lockCancel?.addEventListener("click", hideAdminLock);
        lockForm?.addEventListener("submit", async event => {
          event.preventDefault();
          const password = document.getElementById("ps-admin-password")?.value || "";
          await unlockAdmin(password);
        });

        document.getElementById("ps-admin-lock")?.addEventListener("click", event => {
          if (event.target?.id === "ps-admin-lock") hideAdminLock();
        });

        document.addEventListener("keydown", event => {
          if (event.key === "Escape") hideAdminLock();
        });

        renderPublic();
        await loadRemoteConfig();

        if (adminUnlocked) {
          triggerTop?.classList.add("ps-active");
          const admin = document.getElementById("ps-admin");
          if (admin) admin.hidden = false;

          const snap = await getDoc(CONFIG_REF).catch(() => null);
          if (snap && !snap.exists()) {
            await initializeFirebaseWithLegacy();
            await loadRemoteConfig();
          }
          renderAdmin();
        }

        minuteTimer = setInterval(() => renderPublic(), 60000);
        dataTimer = setInterval(() => loadRemoteConfig({ silent: false }), 300000);
      }

    await boot();
}

window.PMKHomeWidgets?.register({
    id: WIDGET_ID,
    name: 'Planning Navette + Médiabus',
    target: 'intranet-main-userblock',
    mount
});

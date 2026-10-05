//--------------------------------------
//Transfert par lot
/* =====================================================================
   Transfert d'exemplaires en lot - Koha 25.11
   circ/branchtransfers.pl

   A COLLER TEL QUEL dans la preference systeme :
   Administration > Preferences systeme > Look and feel
   (onglet "Interface professionnelle") > IntranetUserJS
   (ne pas entourer de balises <script>, Koha s'en charge).

   Fonctionnement :
   - S'active uniquement sur circ/branchtransfers.pl.
   - Panneau flottant pour coller une liste de codes-barres et transferer.
   - Verifie l'etat de chaque exemplaire avant transfert, sans recharger
     la page a chaque code-barres.
   - Boutons pour copier les ignores / erreurs (presse-papier + notification).
   - Possibilite d'annuler un transfert venant d'etre fait.

   Préparation PimpMyKoha : 2026-09-20
   Module PMK : multi-transfer — Transfert en lot
   Version    : 4.0.0-preplugin

   Le comportement historique et l'interface sont conservés.
   Corrections internes :
   - états checkout/transfer/first_hold chargés via l'endpoint Koha qui
     supporte officiellement ces embeds ;
   - les limites de transfert restent sous l'autorité du POST natif Koha ;
   - « Annuler les réussis » ne cible que les transferts créés par le lot.

   Voir README.md pour l'installation et le detail des cas ignores.
   ===================================================================== */

(function () {
    "use strict";

    if (!/\/circ\/branchtransfers\.pl/.test(window.location.pathname)) {
        return;
    }

    var MODULE_ID = "multi-transfer";
    var MODULE_VERSION = "4.0.0-preplugin";
    var STORAGE_KEY = "kohaBatchTransferJob_v3";
    var LAST_REPORT_KEY = "kohaBatchTransferLastReport_v3";
    var PANEL_ID = "batch-transfer-panel";
    var STYLE_ID = "batch-transfer-styles";
    var ITEM_URL = "/cgi-bin/koha/catalogue/moredetail.pl?itemnumber=";

    var DEFAULT_CONFIG = {
        enabled: true,
        defaultSkipOnLoan: true,
        defaultSkipInTransfer: true,
        defaultSkipNotForLoan: true
    };
    var currentConfig = Object.assign({}, DEFAULT_CONFIG);
    var registeredWithPMK = false;
    var unsubscribePMK = null;
    var runtimeInitialized = false;

    function normalizeConfig(raw) {
        raw = raw && typeof raw === "object" ? raw : {};
        return {
            enabled: raw.enabled !== false,
            defaultSkipOnLoan: raw.defaultSkipOnLoan !== false,
            defaultSkipInTransfer: raw.defaultSkipInTransfer !== false,
            defaultSkipNotForLoan: raw.defaultSkipNotForLoan !== false
        };
    }

    /* ------------------------------------------------------------------ */
    /* Storage                                                            */
    /* ------------------------------------------------------------------ */

    function getJob() {
        try {
            var raw = sessionStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function setJob(job) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(job));
    }

    function clearJob() {
        sessionStorage.removeItem(STORAGE_KEY);
    }

    function saveLastReport(job) {
        if (!job) return;
        try {
            var report = {
                log: job.log || [],
                total: job.total || 0,
                tobranchcd: job.tobranchcd || "",
                savedAt: Date.now()
            };
            sessionStorage.setItem(LAST_REPORT_KEY, JSON.stringify(report));
            window.__btpLastJob = report;
        } catch (e) {
            window.__btpLastJob = job;
        }
    }

    function getLastReport() {
        if (window.__btpLastJob && window.__btpLastJob.log) return window.__btpLastJob;
        try {
            var raw = sessionStorage.getItem(LAST_REPORT_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    /* ------------------------------------------------------------------ */
    /* Utils                                                              */
    /* ------------------------------------------------------------------ */

    function parseBarcodes(text) {
        var seen = {};
        return text
            .split(/[\s,;]+/)
            .map(function (s) {
                return s.trim();
            })
            .filter(function (s) {
                if (!s || seen[s]) return false;
                seen[s] = true;
                return true;
            });
    }

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function itemLinkHtml(barcode, itemId) {
        var safeBarcode = escapeHtml(barcode);
        if (!itemId) return "<strong>" + safeBarcode + "</strong>";
        return (
            '<a class="btp-itemlink" href="' +
            ITEM_URL +
            encodeURIComponent(itemId) +
            '" target="_blank" rel="noopener" title="Fiche exemplaire">' +
            safeBarcode +
            "</a>"
        );
    }

    function getLoggedInBranch() {
        var el =
            document.getElementById("logged-in-branch-code") ||
            document.querySelector("[data-branchcode]") ||
            document.querySelector("#branchselect option[selected]");
        if (el) {
            return (el.getAttribute("data-branchcode") || el.textContent || el.value || "").trim();
        }
        if (typeof logged_in_library_id !== "undefined" && logged_in_library_id) {
            return String(logged_in_library_id);
        }
        return "";
    }

    function getLoggedInBranchLabel() {
        var code = getLoggedInBranch();
        var nameEl =
            document.getElementById("logged-in-branch-name") ||
            document.querySelector("#logged-in-branch-code") ||
            document.querySelector(".logged-in-branch-name");
        var name = nameEl ? (nameEl.textContent || "").replace(/\s+/g, " ").trim() : "";
        if (name && code && name.indexOf(code) === -1) return name + " (" + code + ")";
        if (name) return name;
        if (code) return code;
        return "votre bibliothèque de connexion";
    }

    function cancelLocationWarning() {
        return (
            "Attention : après annulation, Koha considère l'exemplaire comme étant " +
            "sur le site où vous êtes connecté (" +
            getLoggedInBranchLabel() +
            "), et non sur son site d'origine."
        );
    }

    function getCsrfToken() {
        var input = document.querySelector('input[name="csrf_token"]');
        if (input && input.value) return input.value;
        var meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) return meta.getAttribute("content") || "";
        return "";
    }

    function updateCsrfFromDoc(doc) {
        if (!doc) return;
        var tokenInput = doc.querySelector('input[name="csrf_token"]');
        if (!tokenInput || !tokenInput.value) return;
        document.querySelectorAll('input[name="csrf_token"]').forEach(function (el) {
            el.value = tokenInput.value;
        });
        var meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) meta.setAttribute("content", tokenInput.value);
    }

    function statusClass(status) {
        if (status === "ok") return "ok";
        if (status === "ignore") return "skip";
        if (status === "annule") return "cancelled";
        return "err";
    }

    function statusLabel(status) {
        if (status === "ok") return "OK";
        if (status === "ignore") return "Ignoré";
        if (status === "annule") return "Annulé";
        return "Erreur";
    }

    function getActiveJob() {
        return getJob() || getLastReport() || null;
    }

    function canCancelEntry(entry) {
        if (!entry || !entry.itemId || entry.cancelled) return false;
        if (entry.status === "ok") return true;
        if (entry.status === "ignore" && entry.code === "in_transfer") return true;
        return false;
    }

    function canBulkCancelEntry(entry) {
        // Sécurité PMK : le bouton global ne doit jamais annuler un transfert
        // qui existait avant le lancement du lot. Les anciens rapports sans
        // ce marqueur restent annulables individuellement, mais pas en masse.
        return canCancelEntry(entry) && entry.createdByCurrentJob === true;
    }

    /* ------------------------------------------------------------------ */
    /* Styles                                                             */
    /* ------------------------------------------------------------------ */

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent =
            "#" +
            PANEL_ID +
            "{" +
            "--btp-ink:#1c2838;--btp-muted:#5b6b7c;--btp-line:#d5dde6;" +
            "--btp-bg:#f7f9fb;--btp-panel:#ffffff;--btp-accent:#0f6e6a;" +
            "--btp-accent-2:#0b4f4c;--btp-ok:#1f7a3f;--btp-err:#b42318;" +
            "--btp-skip:#9a6700;--btp-shadow:0 14px 40px rgba(28,40,56,.18);" +
            "position:fixed;bottom:18px;right:18px;width:min(420px,calc(100vw - 24px));" +
            "max-height:min(88vh,760px);display:flex;flex-direction:column;" +
            "background:var(--btp-panel);color:var(--btp-ink);border:1px solid var(--btp-line);" +
            "border-radius:14px;box-shadow:var(--btp-shadow);z-index:99999;" +
            "font:14px/1.45 'Segoe UI','Candara','Gill Sans',sans-serif;" +
            "overflow:hidden;}" +
            "#" +
            PANEL_ID +
            " *{box-sizing:border-box;}" +
            "#" +
            PANEL_ID +
            " .btp-header{background:linear-gradient(135deg,var(--btp-accent),var(--btp-accent-2));" +
            "color:#fff;padding:12px 14px;display:flex;justify-content:space-between;" +
            "align-items:center;gap:8px;}" +
            "#" +
            PANEL_ID +
            " .btp-title{font-weight:700;letter-spacing:.01em;}" +
            "#" +
            PANEL_ID +
            " .btp-subtitle{font-size:11px;opacity:.85;margin-top:2px;}" +
            "#" +
            PANEL_ID +
            " .btp-toggle,#" +
            PANEL_ID +
            " .btp-iconbtn{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);" +
            "color:#fff;border-radius:8px;width:32px;height:32px;cursor:pointer;font-weight:700;}" +
            "#" +
            PANEL_ID +
            " .btp-body{padding:12px 14px 14px;overflow:auto;display:flex;flex-direction:column;gap:8px;" +
            "background:linear-gradient(180deg,#fff 0%,var(--btp-bg) 100%);min-height:0;}" +
            "#" +
            PANEL_ID +
            " label{display:block;font-size:12px;font-weight:600;color:var(--btp-muted);margin-bottom:4px;}" +
            "#" +
            PANEL_ID +
            " textarea,#" +
            PANEL_ID +
            " select{width:100%;border:1px solid var(--btp-line);border-radius:10px;" +
            "padding:8px 10px;background:#fff;color:var(--btp-ink);}" +
            "#" +
            PANEL_ID +
            " textarea{height:108px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;}" +
            "#" +
            PANEL_ID +
            " .btp-checks{display:flex;flex-direction:column;gap:6px;margin:4px 0;}" +
            "#" +
            PANEL_ID +
            " .btp-checkbox{display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--btp-ink);}" +
            "#" +
            PANEL_ID +
            " .btp-checkbox input{margin-top:3px;}" +
            "#" +
            PANEL_ID +
            " .btp-checkbox label{margin:0;font-weight:500;color:var(--btp-ink);}" +
            "#" +
            PANEL_ID +
            " .btp-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px;}" +
            "#" +
            PANEL_ID +
            " .btp-actions button{cursor:pointer;border:none;border-radius:9px;padding:7px 12px;" +
            "font-weight:600;font-size:13px;}" +
            "#" +
            PANEL_ID +
            " #btp-start{background:var(--btp-accent);color:#fff;}" +
            "#" +
            PANEL_ID +
            " #btp-start:hover{background:var(--btp-accent-2);}" +
            "#" +
            PANEL_ID +
            " #btp-stop{background:#f3d6d4;color:var(--btp-err);}" +
            "#" +
            PANEL_ID +
            " .btp-secondary{background:#e8eef3;color:var(--btp-ink);}" +
            "#" +
            PANEL_ID +
            " .btp-secondary:disabled,#" +
            PANEL_ID +
            " button:disabled{opacity:.55;cursor:not-allowed;}" +
            "#" +
            PANEL_ID +
            " .btp-progress{font-size:12px;font-weight:700;color:var(--btp-accent-2);}" +
            "#" +
            PANEL_ID +
            " .btp-summary{display:flex;gap:8px;flex-wrap:wrap;font-size:11px;}" +
            "#" +
            PANEL_ID +
            " .btp-pill{background:#fff;border:1px solid var(--btp-line);border-radius:999px;" +
            "padding:2px 8px;color:var(--btp-muted);}" +
            "#" +
            PANEL_ID +
            " .btp-pill strong{color:var(--btp-ink);}" +
            "#" +
            PANEL_ID +
            " .btp-logwrap{display:flex;flex-direction:column;min-height:0;flex:1;}" +
            "#" +
            PANEL_ID +
            " .btp-loghead{display:flex;justify-content:space-between;align-items:center;" +
            "margin:4px 0 2px;font-size:12px;font-weight:700;}" +
            "#" +
            PANEL_ID +
            " .btp-log{max-height:240px;min-height:120px;overflow:auto;border:1px solid var(--btp-line);" +
            "border-radius:10px;background:#fff;padding:4px;}" +
            "#" +
            PANEL_ID +
            " .btp-row{display:grid;grid-template-columns:64px 1fr auto;gap:6px;padding:7px 8px;" +
            "border-bottom:1px solid #eef2f6;font-size:12px;align-items:start;}" +
            "#" +
            PANEL_ID +
            " .btp-row:last-child{border-bottom:none;}" +
            "#" +
            PANEL_ID +
            " .btp-badge{display:inline-block;border-radius:999px;padding:1px 7px;font-size:10px;" +
            "font-weight:700;text-transform:uppercase;letter-spacing:.04em;align-self:start;}" +
            "#" +
            PANEL_ID +
            " .btp-badge.ok{background:#e8f7ee;color:var(--btp-ok);}" +
            "#" +
            PANEL_ID +
            " .btp-badge.skip{background:#fff4d6;color:var(--btp-skip);}" +
            "#" +
            PANEL_ID +
            " .btp-badge.err{background:#fdecea;color:var(--btp-err);}" +
            "#" +
            PANEL_ID +
            " .btp-badge.cancelled{background:#e8eef3;color:#445566;}" +
            "#" +
            PANEL_ID +
            " .btp-msg{color:var(--btp-ink);word-break:break-word;}" +
            "#" +
            PANEL_ID +
            " .btp-itemlink{color:var(--btp-accent);font-weight:700;text-decoration:none;}" +
            "#" +
            PANEL_ID +
            " .btp-itemlink:hover{text-decoration:underline;}" +
            "#" +
            PANEL_ID +
            " .btp-row-actions{display:flex;flex-direction:column;gap:4px;}" +
            "#" +
            PANEL_ID +
            " .btp-cancel-one{border:1px solid #f0c2be;background:#fdecea;color:var(--btp-err);" +
            "border-radius:7px;padding:3px 7px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;}" +
            "#" +
            PANEL_ID +
            " .btp-cancel-one:disabled{opacity:.5;cursor:not-allowed;}" +
            "#" +
            PANEL_ID +
            " .btp-help{font-size:11px;color:var(--btp-muted);line-height:1.35;}" +
            "#" +
            PANEL_ID +
            " #btp-cancel-help{margin:2px 0 0;padding:8px 10px;background:#fff8e8;border:1px solid #f0e0b2;" +
            "border-radius:10px;color:#6a4b00;}" +
            "#" +
            PANEL_ID +
            " #btp-cancel-help strong{color:#5a3f00;}" +
            "#" +
            PANEL_ID +
            " .btp-notice-layer{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
            "padding:18px;background:rgba(28,40,56,.28);z-index:20;opacity:0;pointer-events:none;" +
            "transition:opacity .2s ease;}" +
            "#" +
            PANEL_ID +
            " .btp-notice-layer.btp-notice-show{opacity:1;pointer-events:auto;}" +
            "#" +
            PANEL_ID +
            " .btp-notice{min-width:220px;width:min(320px,92%);background:#fff;border-radius:14px;" +
            "box-shadow:0 16px 40px rgba(16,24,32,.28);border:1px solid var(--btp-line);padding:16px 18px;" +
            "text-align:center;transform:translateY(8px) scale(.97);transition:transform .2s ease;}" +
            "#" +
            PANEL_ID +
            " .btp-notice-layer.btp-notice-show .btp-notice{transform:translateY(0) scale(1);}" +
            "#" +
            PANEL_ID +
            " .btp-notice-icon{width:36px;height:36px;border-radius:50%;display:inline-flex;align-items:center;" +
            "justify-content:center;font-weight:700;font-size:18px;margin-bottom:8px;}" +
            "#" +
            PANEL_ID +
            " .btp-notice-ok .btp-notice-icon{background:#e8f7ee;color:var(--btp-ok);}" +
            "#" +
            PANEL_ID +
            " .btp-notice-err .btp-notice-icon{background:#fdecea;color:var(--btp-err);}" +
            "#" +
            PANEL_ID +
            " .btp-notice-title{font-weight:700;font-size:14px;margin-bottom:4px;}" +
            "#" +
            PANEL_ID +
            " .btp-notice-text{font-size:12px;color:var(--btp-muted);line-height:1.4;margin-bottom:8px;}" +
            "#" +
            PANEL_ID +
            " .btp-notice-codes{display:none;width:100%;min-height:72px;max-height:140px;margin:0 0 10px;" +
            "padding:8px;border:1px solid var(--btp-line);border-radius:8px;resize:vertical;" +
            "font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;box-sizing:border-box;}" +
            "#" +
            PANEL_ID +
            " .btp-notice-codes.btp-notice-codes-show{display:block;}" +
            "#" +
            PANEL_ID +
            " .btp-notice-close{border:none;border-radius:8px;padding:6px 12px;font-weight:600;" +
            "cursor:pointer;background:#e8eef3;color:var(--btp-ink);font-size:12px;}" +
            "#" +
            PANEL_ID +
            " #btp-clipboard-helper{position:absolute;left:-9999px;top:0;width:1px;height:1px;opacity:0;}";
        document.head.appendChild(style);
    }

    /* ------------------------------------------------------------------ */
    /* Panel UI                                                           */
    /* ------------------------------------------------------------------ */

    function buildPanel() {
        var existing = document.getElementById(PANEL_ID);
        if (existing) return existing;

        injectStyles();

        var panel = document.createElement("div");
        panel.id = PANEL_ID;
        panel.innerHTML =
            '<div class="btp-header">' +
            "<div>" +
            '<div class="btp-title">Transfert en lot</div>' +
            '<div class="btp-subtitle">Collez ou scannez une liste, choisissez la destination, lancez</div>' +
            "</div>" +
            '<button type="button" class="btp-toggle" title="Réduire / agrandir" aria-label="Réduire">_</button>' +
            "</div>" +
            '<div class="btp-body">' +
            "<div>" +
            '<label for="btp-tobranch">Bibliothèque de destination</label>' +
            '<select id="btp-tobranch"></select>' +
            "</div>" +
            "<div>" +
            '<label for="btp-barcodes">Codes-barres (un par ligne)</label>' +
            '<textarea id="btp-barcodes" placeholder="B00001&#10;B00002&#10;B00003"></textarea>' +
            "</div>" +
            '<div class="btp-checks">' +
            '<div class="btp-checkbox">' +
            '<input type="checkbox" id="btp-skiploan" />' +
            '<label for="btp-skiploan">Ne pas transférer les exemplaires actuellement empruntés ' +
            "(recommandé : sinon ils seront rendus automatiquement)</label>" +
            "</div>" +
            '<div class="btp-checkbox">' +
            '<input type="checkbox" id="btp-skiptransfer" />' +
            '<label for="btp-skiptransfer">Ignorer les exemplaires déjà en transfert ' +
            "(décochez pour forcer un nouveau transfert)</label>" +
            "</div>" +
            '<div class="btp-checkbox">' +
            '<input type="checkbox" id="btp-skipnfl" />' +
            '<label for="btp-skipnfl">Ne pas transférer les exemplaires exclus du prêt</label>' +
            "</div>" +
            "</div>" +
            '<p class="btp-help">Aussi ignorés automatiquement : introuvable, déjà sur place, ' +
            "réservé, retiré, perdu, ou transfert non autorisé entre bibliothèques.</p>" +
            '<div class="btp-actions">' +
            '<button type="button" id="btp-start">Démarrer</button>' +
            '<button type="button" id="btp-stop" disabled>Arrêter</button>' +
            '<button type="button" id="btp-copy-ignored" class="btp-secondary" disabled>Copier les ignorés</button>' +
            '<button type="button" id="btp-copy-errors" class="btp-secondary" disabled>Copier les erreurs</button>' +
            '<button type="button" id="btp-cancel-oks" class="btp-secondary" disabled title="Annuler les transferts réussis de cette liste">Annuler les réussis</button>' +
            "</div>" +
            '<p class="btp-help" id="btp-cancel-help">' +
            "Si vous annulez un transfert : l'exemplaire sera considéré comme étant sur " +
            "<strong>votre site actuel</strong> (la bibliothèque où vous êtes connecté), " +
            "pas sur son site d'origine.</p>" +
            '<div class="btp-progress" id="btp-progress">Prêt.</div>' +
            '<div class="btp-summary" id="btp-summary"></div>' +
            '<div class="btp-logwrap">' +
            '<div class="btp-loghead"><span>Résultats</span><span id="btp-logcount">0</span></div>' +
            '<div class="btp-log" id="btp-log" aria-live="polite"></div>' +
            "</div>" +
            "</div>" +
            '<div class="btp-notice-layer" id="btp-notice-layer" aria-hidden="true">' +
            '<div class="btp-notice btp-notice-ok" role="dialog" aria-modal="true">' +
            '<div class="btp-notice-icon">✓</div>' +
            '<div class="btp-notice-title" id="btp-notice-title">Copie</div>' +
            '<div class="btp-notice-text" id="btp-notice-text"></div>' +
            '<textarea id="btp-notice-codes" class="btp-notice-codes" spellcheck="false"></textarea>' +
            '<button type="button" class="btp-notice-close" id="btp-notice-close">Fermer</button>' +
            "</div>" +
            "</div>" +
            '<textarea id="btp-clipboard-helper" tabindex="-1" aria-hidden="true"></textarea>';

        document.body.appendChild(panel);

        var defaultSkipLoan = document.getElementById("btp-skiploan");
        var defaultSkipTransfer = document.getElementById("btp-skiptransfer");
        var defaultSkipNfl = document.getElementById("btp-skipnfl");
        if (defaultSkipLoan) defaultSkipLoan.checked = currentConfig.defaultSkipOnLoan !== false;
        if (defaultSkipTransfer) defaultSkipTransfer.checked = currentConfig.defaultSkipInTransfer !== false;
        if (defaultSkipNfl) defaultSkipNfl.checked = currentConfig.defaultSkipNotForLoan !== false;

        var realSelect = document.getElementById("tobranchcd");
        var ourSelect = document.getElementById("btp-tobranch");
        if (realSelect) {
            ourSelect.innerHTML = realSelect.innerHTML;
        } else {
            ourSelect.innerHTML = '<option value="">Chargement…</option>';
            loadLibrariesInto(ourSelect);
        }

        panel.querySelector(".btp-toggle").addEventListener("click", function () {
            var body = panel.querySelector(".btp-body");
            var hidden = body.style.display === "none";
            body.style.display = hidden ? "" : "none";
            this.textContent = hidden ? "_" : "+";
        });

        panel.querySelector("#btp-start").addEventListener("click", startJob);
        panel.querySelector("#btp-stop").addEventListener("click", stopJob);
        panel.querySelector("#btp-copy-ignored").addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            copyBarcodes("ignore", "ignorés");
        });
        panel.querySelector("#btp-copy-errors").addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            copyBarcodes("erreur", "en erreur");
        });
        panel.querySelector("#btp-cancel-oks").addEventListener("click", cancelAllOkTransfers);
        panel.querySelector("#btp-notice-layer").addEventListener("click", function (e) {
            if (e.target === e.currentTarget) hideNotice();
        });
        panel.querySelector("#btp-notice-close").addEventListener("click", function (e) {
            e.preventDefault();
            hideNotice();
        });
        panel.querySelector(".btp-notice").addEventListener("click", function (e) {
            e.stopPropagation();
        });

        return panel;
    }

    function loadLibrariesInto(select) {
        fetch("/api/v1/libraries?_per_page=-1", { headers: { Accept: "application/json" }, credentials: "same-origin" })
            .then(function (r) {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            })
            .then(function (libs) {
                select.innerHTML = '<option value="">— Choisir —</option>';
                (libs || []).forEach(function (lib) {
                    var opt = document.createElement("option");
                    opt.value = lib.library_id;
                    opt.textContent = lib.name || lib.library_id;
                    select.appendChild(opt);
                });
            })
            .catch(function () {
                select.innerHTML = '<option value="">Impossible de charger les bibliothèques</option>';
            });
    }

    function setProgress(text) {
        var p = document.getElementById("btp-progress");
        if (p) p.textContent = text;
    }

    function updateSummary(job) {
        var box = document.getElementById("btp-summary");
        if (!box || !job) return;
        var ok = 0;
        var ignore = 0;
        var err = 0;
        var cancelled = 0;
        var cancellable = 0;
        job.log.forEach(function (e) {
            if (e.status === "ok") ok++;
            else if (e.status === "ignore") ignore++;
            else if (e.status === "annule") cancelled++;
            else err++;
            if (canBulkCancelEntry(e)) cancellable++;
        });
        box.innerHTML =
            '<span class="btp-pill">OK <strong>' +
            ok +
            "</strong></span>" +
            '<span class="btp-pill">Ignorés <strong>' +
            ignore +
            "</strong></span>" +
            '<span class="btp-pill">Erreurs <strong>' +
            err +
            "</strong></span>" +
            (cancelled
                ? '<span class="btp-pill">Annulés <strong>' + cancelled + "</strong></span>"
                : "");

        var copyIgnored = document.getElementById("btp-copy-ignored");
        var copyErrors = document.getElementById("btp-copy-errors");
        var cancelOks = document.getElementById("btp-cancel-oks");
        if (copyIgnored) copyIgnored.disabled = ignore === 0;
        if (copyErrors) copyErrors.disabled = err === 0;
        if (cancelOks) cancelOks.disabled = cancellable === 0;
    }

    function appendResultRow(entry, entryIndex) {
        var log = document.getElementById("btp-log");
        var count = document.getElementById("btp-logcount");
        if (!log) return;

        var row = document.createElement("div");
        row.className = "btp-row";
        row.setAttribute("data-entry-index", String(entryIndex));

        var actions = "";
        if (canCancelEntry(entry)) {
            actions =
                '<div class="btp-row-actions">' +
                '<button type="button" class="btp-cancel-one" data-entry-index="' +
                entryIndex +
                '">Annuler</button>' +
                "</div>";
        } else {
            actions = "<div></div>";
        }

        row.innerHTML =
            '<div><span class="btp-badge ' +
            statusClass(entry.status) +
            '">' +
            statusLabel(entry.status) +
            "</span></div>" +
            '<div class="btp-msg">' +
            itemLinkHtml(entry.barcode, entry.itemId) +
            " — " +
            escapeHtml(entry.message) +
            "</div>" +
            actions;

        var cancelBtn = row.querySelector(".btp-cancel-one");
        if (cancelBtn) {
            cancelBtn.addEventListener("click", function () {
                cancelTransferAtIndex(Number(cancelBtn.getAttribute("data-entry-index")));
            });
        }

        log.appendChild(row);
        log.scrollTop = log.scrollHeight;
        if (count) count.textContent = String(log.children.length);
    }

    function refreshResultRow(entryIndex) {
        var job = getActiveJob();
        if (!job || !job.log || !job.log[entryIndex]) return;
        var log = document.getElementById("btp-log");
        if (!log) return;
        var row = log.querySelector('.btp-row[data-entry-index="' + entryIndex + '"]');
        if (!row) return;

        var entry = job.log[entryIndex];
        var actions = "";
        if (canCancelEntry(entry)) {
            actions =
                '<div class="btp-row-actions">' +
                '<button type="button" class="btp-cancel-one" data-entry-index="' +
                entryIndex +
                '">Annuler</button>' +
                "</div>";
        } else {
            actions = "<div></div>";
        }
        row.innerHTML =
            '<div><span class="btp-badge ' +
            statusClass(entry.status) +
            '">' +
            statusLabel(entry.status) +
            "</span></div>" +
            '<div class="btp-msg">' +
            itemLinkHtml(entry.barcode, entry.itemId) +
            " — " +
            escapeHtml(entry.message) +
            "</div>" +
            actions;
        var cancelBtn = row.querySelector(".btp-cancel-one");
        if (cancelBtn) {
            cancelBtn.addEventListener("click", function () {
                cancelTransferAtIndex(entryIndex);
            });
        }
        updateSummary(job);
    }

    function renderLog(job) {
        var log = document.getElementById("btp-log");
        if (!log) return;
        log.innerHTML = "";
        (job.log || []).forEach(function (entry, idx) {
            appendResultRow(entry, idx);
        });
        updateSummary(job);
    }

    function renderIdle() {
        var startBtn = document.getElementById("btp-start");
        var stopBtn = document.getElementById("btp-stop");
        var textarea = document.getElementById("btp-barcodes");
        var select = document.getElementById("btp-tobranch");
        ["btp-skiploan", "btp-skiptransfer", "btp-skipnfl"].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.disabled = false;
        });
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        if (textarea) textarea.disabled = false;
        if (select) select.disabled = false;
    }

    function renderRunning() {
        var startBtn = document.getElementById("btp-start");
        var stopBtn = document.getElementById("btp-stop");
        var textarea = document.getElementById("btp-barcodes");
        var select = document.getElementById("btp-tobranch");
        ["btp-skiploan", "btp-skiptransfer", "btp-skipnfl"].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.disabled = true;
        });
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        if (textarea) textarea.disabled = true;
        if (select) select.disabled = true;
    }

    /* ------------------------------------------------------------------ */
    /* Notice flottante + presse-papier                                   */
    /* ------------------------------------------------------------------ */

    var noticeTimer = null;

    function hideNotice() {
        var layer = document.getElementById("btp-notice-layer");
        var codes = document.getElementById("btp-notice-codes");
        if (!layer) return;
        layer.classList.remove("btp-notice-show");
        layer.setAttribute("aria-hidden", "true");
        if (codes) {
            codes.classList.remove("btp-notice-codes-show");
            codes.value = "";
        }
        if (noticeTimer) {
            clearTimeout(noticeTimer);
            noticeTimer = null;
        }
    }

    function showNotice(title, text, kind, options) {
        options = options || {};
        var layer = document.getElementById("btp-notice-layer");
        var card = layer && layer.querySelector(".btp-notice");
        var titleEl = document.getElementById("btp-notice-title");
        var textEl = document.getElementById("btp-notice-text");
        var iconEl = layer && layer.querySelector(".btp-notice-icon");
        var codes = document.getElementById("btp-notice-codes");
        if (!layer || !card || !titleEl || !textEl) return;

        card.className = "btp-notice " + (kind === "err" ? "btp-notice-err" : "btp-notice-ok");
        if (iconEl) iconEl.textContent = kind === "err" ? "!" : "✓";
        titleEl.textContent = title;
        textEl.textContent = text || "";

        if (codes) {
            if (options.codesText) {
                codes.value = options.codesText;
                codes.classList.add("btp-notice-codes-show");
            } else {
                codes.value = "";
                codes.classList.remove("btp-notice-codes-show");
            }
        }

        layer.setAttribute("aria-hidden", "false");
        layer.classList.remove("btp-notice-show");
        void layer.offsetWidth;
        layer.classList.add("btp-notice-show");

        if (noticeTimer) clearTimeout(noticeTimer);
        // Si des codes sont affiches, on laisse plus longtemps pour Ctrl+C
        var delay = options.codesText ? 8000 : 2400;
        if (options.persist) delay = 0;
        if (delay) {
            noticeTimer = setTimeout(hideNotice, delay);
        }
    }

    // Alias utilise par le reste du script
    function showToast(message, kind) {
        if (kind === "err") showNotice("Attention", message, "err");
        else showNotice("OK", message, "ok");
    }

    function selectAllIn(el) {
        if (!el) return;
        el.focus();
        el.select();
        try {
            el.setSelectionRange(0, el.value.length);
        } catch (e) {
            /* ignore */
        }
        try {
            var range = document.createRange();
            range.selectNodeContents(el);
            var sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(range);
            }
        } catch (e2) {
            /* ignore */
        }
    }

    // Copie synchrone dans le geste utilisateur (obligatoire pour beaucoup de navigateurs)
    function copyTextNow(text) {
        var helper = document.getElementById("btp-clipboard-helper");
        if (!helper) {
            helper = document.createElement("textarea");
            helper.id = "btp-clipboard-helper";
            helper.setAttribute("aria-hidden", "true");
            helper.tabIndex = -1;
            var panel = document.getElementById(PANEL_ID);
            if (panel) panel.appendChild(helper);
            else document.body.appendChild(helper);
        }

        var previousActive = document.activeElement;
        helper.value = String(text);
        helper.removeAttribute("readonly");
        helper.removeAttribute("disabled");
        // Doit etre "editable" pour execCommand('copy') dans certains navigateurs
        helper.style.cssText =
            "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;margin:0;border:0;outline:none;opacity:0.01;z-index:-1;";

        selectAllIn(helper);

        var ok = false;
        try {
            ok = document.execCommand("copy");
        } catch (e) {
            ok = false;
        }

        // Remettre le helper hors ecran
        helper.style.cssText = "position:absolute;left:-9999px;top:0;width:1px;height:1px;opacity:0;";
        if (previousActive && previousActive.focus) {
            try {
                previousActive.focus();
            } catch (e2) {
                /* ignore */
            }
        }

        return !!ok;
    }

    function barcodesFromDom(status) {
        var badgeClass = status === "ignore" ? "skip" : status === "erreur" ? "err" : status === "ok" ? "ok" : "";
        if (!badgeClass) return [];
        var rows = document.querySelectorAll("#btp-log .btp-row");
        var seen = {};
        var list = [];
        Array.prototype.forEach.call(rows, function (row) {
            var badge = row.querySelector(".btp-badge");
            if (!badge || !badge.classList.contains(badgeClass)) return;
            var link = row.querySelector(".btp-itemlink");
            var strong = row.querySelector(".btp-msg strong");
            var bc = ((link && link.textContent) || (strong && strong.textContent) || "").trim();
            if (!bc || seen[bc]) return;
            seen[bc] = true;
            list.push(bc);
        });
        return list;
    }

    function barcodesForStatus(status) {
        var job = getActiveJob();
        var seen = {};
        var list = [];

        function push(bc) {
            bc = String(bc || "").trim();
            if (!bc || seen[bc]) return;
            seen[bc] = true;
            list.push(bc);
        }

        if (job && job.log && job.log.length) {
            job.log.forEach(function (entry) {
                if (entry.status === status) push(entry.barcode);
            });
        }

        // Secours : lire aussi les lignes affichees a l'ecran
        if (!list.length) {
            barcodesFromDom(status).forEach(push);
        }

        return list;
    }

    function copyBarcodes(status, label) {
        var barcodes = barcodesForStatus(status);
        if (!barcodes.length) {
            showNotice(
                "Rien à copier",
                "Aucun code-barres " + label + " dans les résultats pour le moment.",
                "err"
            );
            return;
        }

        var payload = barcodes.join("\n");
        var copied = copyTextNow(payload);

        function showCopyResult(success) {
            showNotice(
                success ? "Copié dans le presse-papier" : "Prêt à copier",
                success
                    ? barcodes.length +
                          " code" +
                          (barcodes.length > 1 ? "s" : "") +
                          "-barres " +
                          label +
                          ". Vous pouvez les coller (Ctrl+V)."
                    : barcodes.length +
                          " code" +
                          (barcodes.length > 1 ? "s" : "") +
                          "-barres " +
                          label +
                          ". Ils sont sélectionnés ci-dessous : faites Ctrl+C, puis Fermer.",
                success ? "ok" : "err",
                { codesText: payload, persist: !success }
            );

            var codes = document.getElementById("btp-notice-codes");
            if (codes) {
                setTimeout(function () {
                    selectAllIn(codes);
                    if (!success) {
                        try {
                            document.execCommand("copy");
                        } catch (e) {
                            /* ignore */
                        }
                    }
                }, 30);
            }
        }

        showCopyResult(copied);

        // Secours asynchrone (HTTPS uniquement) si la copie synchrone a echoue
        if (
            !copied &&
            navigator.clipboard &&
            window.isSecureContext &&
            typeof navigator.clipboard.writeText === "function"
        ) {
            navigator.clipboard.writeText(payload).then(
                function () {
                    showCopyResult(true);
                },
                function () {
                    /* deja affiche en mode Ctrl+C */
                }
            );
        }
    }

    /* ------------------------------------------------------------------ */
    /* Cancel transfer (via circ/returns.pl — pas d'API REST)             */
    /* ------------------------------------------------------------------ */

    function ensureCsrfToken() {
        var existing = getCsrfToken();
        if (existing) return Promise.resolve(existing);
        return fetch("/cgi-bin/koha/circ/returns.pl", {
            credentials: "same-origin",
            headers: { Accept: "text/html" }
        })
            .then(function (r) {
                return r.text();
            })
            .then(function (html) {
                var doc = new DOMParser().parseFromString(html, "text/html");
                updateCsrfFromDoc(doc);
                return getCsrfToken();
            });
    }


    function fetchTransferStateForItem(itemId) {
        return apiGet("/api/v1/items/" + encodeURIComponent(itemId)).then(function (item) {
            var biblioId = item && item.biblio_id;
            if (!biblioId) throw new Error("biblio_id absent");
            var filter = encodeURIComponent(JSON.stringify({ item_id: itemId }));
            var url =
                "/api/v1/biblios/" +
                encodeURIComponent(biblioId) +
                "/items?q=" +
                filter +
                "&_per_page=1";
            return fetch(url, {
                headers: { Accept: "application/json", "x-koha-embed": "transfer" },
                credentials: "same-origin"
            }).then(function (resp) {
                if (!resp.ok) throw new Error("HTTP " + resp.status);
                return resp.json();
            }).then(function (items) {
                return items && items.length ? items[0].transfer || null : null;
            });
        });
    }

    function postCancelTransfer(itemId) {
        return ensureCsrfToken().then(function (csrf) {
            if (!csrf) {
                return { ok: false, message: "Session invalide — rechargez la page." };
            }
            var body = new URLSearchParams();
            body.set("itemnumber", String(itemId));
            body.set("canceltransfer", "1");
            body.set("csrf_token", csrf);

            return fetch("/cgi-bin/koha/circ/returns.pl", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    Accept: "text/html"
                },
                body: body.toString()
            }).then(function (resp) {
                return resp.text().then(function (html) {
                    var doc = new DOMParser().parseFromString(html, "text/html");
                    updateCsrfFromDoc(doc);
                    if (resp.status >= 400) {
                        return { ok: false, message: "L'annulation a échoué. Réessayez ou faites-le à la main." };
                    }
                    // Vérification via l'endpoint qui supporte officiellement l'embed transfer.
                    return fetchTransferStateForItem(itemId)
                        .then(function (transfer) {
                            if (transfer) {
                                return {
                                    ok: false,
                                    message: "Le transfert est encore actif — vérifiez à la main."
                                };
                            }
                            return { ok: true };
                        })
                        .catch(function () {
                            if (/transfercancelled|transfert annul|Transfer cancelled/i.test(html)) {
                                return { ok: true };
                            }
                            return { ok: false, message: "Impossible de confirmer l'annulation." };
                        });
                });
            });
        });
    }

    function cancelTransferAtIndex(entryIndex, options) {
        options = options || {};
        var job = getActiveJob();
        if (!job || !job.log || !job.log[entryIndex]) return Promise.resolve(false);
        var entry = job.log[entryIndex];
        if (!canCancelEntry(entry)) return Promise.resolve(false);

        if (!options.silentConfirm) {
            var okConfirm = window.confirm(
                "Annuler le transfert de " +
                    entry.barcode +
                    " ?\n\n" +
                    cancelLocationWarning()
            );
            if (!okConfirm) return Promise.resolve(false);
        }

        var rowBtn = document.querySelector(
            '.btp-row[data-entry-index="' + entryIndex + '"] .btp-cancel-one'
        );
        if (rowBtn) {
            rowBtn.disabled = true;
            rowBtn.textContent = "…";
        }

        return postCancelTransfer(entry.itemId)
            .then(function (result) {
                var j = getActiveJob();
                if (!j || !j.log[entryIndex]) return false;
                if (result.ok) {
                    var siteLabel = getLoggedInBranchLabel();
                    j.log[entryIndex].status = "annule";
                    j.log[entryIndex].cancelled = true;
                    j.log[entryIndex].code = "cancelled";
                    j.log[entryIndex].message =
                        "Transfert annulé — site actuel = " +
                        siteLabel +
                        " (pas le site d'origine).";
                    if (getJob()) setJob(j);
                    saveLastReport(j);
                    refreshResultRow(entryIndex);
                    if (!options.silentToast) {
                        showNotice(
                            "Transfert annulé",
                            entry.barcode +
                                " — l'exemplaire est maintenant considéré sur " +
                                siteLabel +
                                ", pas sur son site d'origine.",
                            "ok"
                        );
                    }
                    return true;
                }
                if (rowBtn) {
                    rowBtn.disabled = false;
                    rowBtn.textContent = "Annuler";
                }
                if (!options.silentToast) {
                    showNotice("Annulation impossible", result.message || "Réessayez plus tard.", "err");
                }
                return false;
            })
            .catch(function () {
                if (rowBtn) {
                    rowBtn.disabled = false;
                    rowBtn.textContent = "Annuler";
                }
                if (!options.silentToast) {
                    showNotice("Annulation impossible", "Une erreur est survenue.", "err");
                }
                return false;
            });
    }

    function cancelAllOkTransfers() {
        var job = getActiveJob();
        if (!job || !job.log) {
            showNotice("Rien à annuler", "Aucun transfert dans les résultats.", "err");
            return;
        }
        var indexes = [];
        job.log.forEach(function (e, idx) {
            if (canBulkCancelEntry(e)) indexes.push(idx);
        });
        if (!indexes.length) {
            showNotice("Rien à annuler", "Aucun transfert réussi à annuler.", "err");
            return;
        }
        var okConfirm = window.confirm(
            "Annuler " +
                indexes.length +
                " transfert(s) de cette liste ?\n\n" +
                cancelLocationWarning() +
                "\n\nCela vaut pour chaque exemplaire annulé."
        );
        if (!okConfirm) return;

        var btn = document.getElementById("btp-cancel-oks");
        if (btn) btn.disabled = true;

        var chain = Promise.resolve();
        var done = 0;
        var fail = 0;
        indexes.forEach(function (idx) {
            chain = chain.then(function () {
                return cancelTransferAtIndex(idx, { silentConfirm: true, silentToast: true }).then(function (ok) {
                    if (ok) done++;
                    else fail++;
                });
            });
        });
        chain.then(function () {
            if (btn) btn.disabled = false;
            updateSummary(getActiveJob());
            var siteLabel = getLoggedInBranchLabel();
            if (fail === 0) {
                showNotice(
                    "Annulations terminées",
                    done +
                        " transfert(s) annulé(s). Site actuel pour ces exemplaires : " +
                        siteLabel +
                        " (pas le site d'origine).",
                    "ok"
                );
            } else {
                showNotice(
                    "Annulations partielles",
                    done +
                        " annulé(s), " +
                        fail +
                        " échec(s). Pour les annulés : site actuel = " +
                        siteLabel +
                        ".",
                    "err"
                );
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* API pre-checks                                                     */
    /* ------------------------------------------------------------------ */

    function apiGet(url) {
        return fetch(url, {
            headers: { Accept: "application/json" },
            credentials: "same-origin"
        }).then(function (resp) {
            if (!resp.ok) {
                var err = new Error("HTTP " + resp.status);
                err.status = resp.status;
                throw err;
            }
            return resp.json();
        });
    }

    function fetchItemBundle(barcode) {
        var q = "/api/v1/items?external_id=" + encodeURIComponent(barcode) + "&_per_page=1";
        return apiGet(q).then(function (items) {
            if (!items || !items.length) {
                return { errorCode: "not_found", message: "Code-barres inconnu : aucun exemplaire trouvé." };
            }

            var seed = items[0] || {};
            var itemId = seed.item_id;
            var biblioId = seed.biblio_id;

            if (!itemId) {
                return { errorCode: "not_found", message: "Code-barres inconnu : aucun exemplaire exploitable trouvé." };
            }

            // Koha 24.11/25.11 documente checkout, transfer, first_hold et
            // _status sur GET /biblios/{biblio_id}/items, pas sur GET /items/{id}.
            // On cible l'item précis via q={item_id:...}.
            if (biblioId) {
                var itemFilter = encodeURIComponent(JSON.stringify({ item_id: itemId }));
                var biblioItemsUrl =
                    "/api/v1/biblios/" +
                    encodeURIComponent(biblioId) +
                    "/items?q=" +
                    itemFilter +
                    "&_per_page=1";

                return fetch(biblioItemsUrl, {
                    headers: {
                        Accept: "application/json",
                        "x-koha-embed": "checkout,transfer,first_hold,_status"
                    },
                    credentials: "same-origin"
                })
                    .then(function (resp) {
                        if (!resp.ok) throw new Error("HTTP " + resp.status);
                        return resp.json();
                    })
                    .then(function (enrichedItems) {
                        var item = enrichedItems && enrichedItems.length ? enrichedItems[0] : null;
                        if (!item) throw new Error("Item enrichi introuvable");
                        return { item: item, itemId: itemId, biblioId: biblioId };
                    })
                    .catch(function () {
                        return fetchItemBundleFallback(seed, itemId, biblioId);
                    });
            }

            return fetchItemBundleFallback(seed, itemId, biblioId);
        });
    }

    function fetchItemBundleFallback(seed, itemId, biblioId) {
        return apiGet("/api/v1/items/" + encodeURIComponent(itemId))
            .catch(function () { return seed || {}; })
            .then(function (item) {
                var filter = encodeURIComponent(JSON.stringify({ item_id: itemId }));
                return apiGet("/api/v1/checkouts?q=" + filter)
                    .then(function (checkouts) {
                        item.checkout = checkouts && checkouts.length ? checkouts[0] : null;
                        return {
                            item: item,
                            itemId: itemId,
                            biblioId: biblioId || item.biblio_id || null,
                            unverifiedTransferHold: true
                        };
                    })
                    .catch(function () {
                        return {
                            item: item,
                            itemId: itemId,
                            biblioId: biblioId || item.biblio_id || null,
                            unverifiedCheckout: true,
                            unverifiedTransferHold: true
                        };
                    });
            });
    }

    function evaluateSkip(itemBundle, job) {
        if (itemBundle.errorCode) {
            return {
                skip: true,
                status: "erreur",
                code: itemBundle.errorCode,
                message: itemBundle.message,
                itemId: null
            };
        }

        var item = itemBundle.item;
        var itemId = itemBundle.itemId;
        var holding = item.holding_library_id || "";
        var to = job.tobranchcd;
        var loginBranch = job.loginBranch || "";

        if (loginBranch && to === loginBranch) {
            return {
                skip: true,
                status: "ignore",
                code: "dest_is_login",
                message: "La destination est votre bibliothèque actuelle : transfert impossible.",
                itemId: itemId
            };
        }

        if (holding && holding === to) {
            return {
                skip: true,
                status: "ignore",
                code: "already_at_dest",
                message: "Déjà sur place à la bibliothèque de destination.",
                itemId: itemId
            };
        }

        if (item.withdrawn && Number(item.withdrawn) > 0) {
            return {
                skip: true,
                status: "ignore",
                code: "withdrawn",
                message: "Exemplaire retiré du fonds — à traiter à la main.",
                itemId: itemId
            };
        }

        if (item.lost_status && Number(item.lost_status) > 0) {
            return {
                skip: true,
                status: "ignore",
                code: "lost",
                message: "Exemplaire marqué perdu — à traiter à la main.",
                itemId: itemId
            };
        }

        var nfl = item.effective_not_for_loan_status != null ? item.effective_not_for_loan_status : item.not_for_loan_status;
        if (job.skipNotForLoan && nfl != null && Number(nfl) !== 0) {
            return {
                skip: true,
                status: "ignore",
                code: "not_for_loan",
                message: "Exemplaire exclu du prêt — ignoré.",
                itemId: itemId
            };
        }

        if (item.transfer) {
            var tr = item.transfer;
            var from = tr.from_library_id || tr.frombranch || "?";
            var dest = tr.to_library_id || tr.tobranch || "?";
            var datesent = tr.datesent || tr.date_sent;
            var state = datesent ? "déjà en route" : "transfert déjà demandé";
            if (job.skipInTransfer !== false) {
                return {
                    skip: true,
                    status: "ignore",
                    code: "in_transfer",
                    message: state + " (" + from + " → " + dest + ") — ignoré.",
                    itemId: itemId
                };
            }
            // Forcer : on continue, Koha remplacera en principe le transfert existant
            return {
                skip: false,
                warning: "Attention : un transfert existait déjà (" + state + " : " + from + " → " + dest + ") — forcé.",
                itemId: itemId,
                holding: holding
            };
        }

        var hold = item.first_hold;
        if (hold) {
            var holdStatus = hold.status || hold.found || "";
            var holdBranch = hold.pickup_library_id || hold.branchcode || "?";
            var holdLabel = "Une réservation existe";
            if (/^W$/i.test(holdStatus) || /waiting/i.test(String(holdStatus))) {
                holdLabel = "Réservation en attente";
            } else if (/^T$/i.test(holdStatus) || /transit/i.test(String(holdStatus))) {
                holdLabel = "Réservation en transit";
            }
            return {
                skip: true,
                status: "ignore",
                code: "hold",
                message: holdLabel + " (retrait : " + holdBranch + ") — décision manuelle nécessaire.",
                itemId: itemId
            };
        }

        var onLoan = !!(item.checkout || item.checked_out_date);
        if (job.skipOnLoan && onLoan) {
            return {
                skip: true,
                status: "ignore",
                code: "on_loan",
                message: "Actuellement emprunté — ignoré.",
                itemId: itemId
            };
        }

        if (!job.skipOnLoan && onLoan) {
            return {
                skip: false,
                warning: "Attention : il était emprunté et a été rendu automatiquement.",
                itemId: itemId,
                onLoan: true
            };
        }

        if (itemBundle.unverifiedCheckout && job.skipOnLoan) {
            return {
                skip: true,
                status: "ignore",
                code: "checkout_unverified",
                message: "Impossible de vérifier s'il est emprunté — ignoré par précaution.",
                itemId: itemId
            };
        }

        return { skip: false, itemId: itemId, holding: holding };
    }

    function checkTransferLimit(fromBranch, toBranch, item) {
        // PMK 4.0 : ne bloque plus avant le POST. Les préférences système
        // UseBranchTransferLimits / BranchTransferLimitsType et la logique
        // serveur Koha restent l'autorité. La fonction est conservée comme
        // point d'extension compatible, mais retourne toujours null.
        return Promise.resolve(null);
    }

    /* ------------------------------------------------------------------ */
    /* Transfer via AJAX form POST (no full page reload)                  */
    /* ------------------------------------------------------------------ */

    function postTransfer(barcode, tobranchcd) {
        var csrf = getCsrfToken();
        if (!csrf) {
            return Promise.resolve({
                success: false,
                status: "erreur",
                message: "Session invalide — rechargez la page puis réessayez."
            });
        }

        var body = new URLSearchParams();
        body.set("op", "cud-transfer");
        body.set("barcode", barcode);
        body.set("tobranchcd", tobranchcd);
        body.set("csrf_token", csrf);

        var action =
            (document.querySelector("#branchtransfers") && document.querySelector("#branchtransfers").getAttribute("action")) ||
            window.location.pathname;

        return fetch(action, {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                Accept: "text/html"
            },
            body: body.toString()
        }).then(function (resp) {
            return resp.text().then(function (html) {
                var parser = new DOMParser();
                var doc = parser.parseFromString(html, "text/html");
                updateCsrfFromDoc(doc);
                return interpretTransferHtml(doc, barcode, tobranchcd, resp.status);
            });
        });
    }

    function textOf(nodes) {
        return Array.prototype.map
            .call(nodes, function (n) {
                return (n.textContent || "").replace(/\s+/g, " ").trim();
            })
            .filter(Boolean);
    }

    function interpretTransferHtml(doc, barcode, tobranchcd, httpStatus) {
        if (httpStatus >= 400) {
            return {
                success: false,
                status: "erreur",
                message: "Le transfert a échoué (erreur serveur)."
            };
        }

        // Modal réservation / hold found
        var confirm = doc.getElementById("transfer_confirm");
        if (confirm) {
            return {
                success: false,
                status: "ignore",
                code: "hold_modal",
                message: "Une réservation bloque ce transfert — à traiter à la main."
            };
        }

        // Erreurs connues
        var alerts = textOf(doc.querySelectorAll(".alert, .dialog.alert, .alert-info, .alert-warning, .alert-error"));
        var joined = alerts.join(" / ");

        if (/No item with barcode|Aucun exemplaire avec le code/i.test(joined)) {
            return { success: false, status: "erreur", code: "bad_barcode", message: joined || "Code-barres inconnu." };
        }
        if (/already at destination|déjà à la bibliothèque de destination|deja a la bibliotheque de destination|already at destination library/i.test(joined)) {
            return {
                success: false,
                status: "ignore",
                code: "already_at_dest",
                message: "Déjà à la bibliothèque de destination."
            };
        }
        if (/Transfer is not allowed|transfert n'est pas autorisé|transfert n'est pas autorise|n'est pas autorisé|n'est pas autorise/i.test(joined)) {
            return {
                success: false,
                status: "ignore",
                code: "transfer_limit",
                message: "Transfert non autorisé entre ces bibliothèques."
            };
        }

        // Succès : barcode présent dans la table / champs cachés bc-
        var inputs = doc.querySelectorAll('#branchtransfers input[type="hidden"][name^="bc-"], input[name^="bc-"]');
        for (var i = 0; i < inputs.length; i++) {
            if (inputs[i].value === barcode) {
                var idx = (inputs[i].name.match(/^bc-(\d+)$/) || [])[1];
                var confirmed = tobranchcd;
                if (idx != null) {
                    var tb = doc.querySelector('input[name="tb-' + idx + '"]');
                    if (tb && tb.value) confirmed = tb.value;
                }
                var msg = "Transféré vers " + confirmed;
                if (/has been returned|a été rendu|a ete rendu|was on loan|était en prêt|etait en pret/i.test(joined)) {
                    msg += " (il était emprunté et a été rendu automatiquement).";
                }
                return { success: true, status: "ok", message: msg };
            }
        }

        // Table transferred items
        var rows = doc.querySelectorAll("#transferstable tbody tr, table#transferstable tr");
        for (var r = 0; r < rows.length; r++) {
            if ((rows[r].textContent || "").indexOf(barcode) !== -1) {
                return { success: true, status: "ok", message: "Transféré vers " + tobranchcd };
            }
        }

        if (joined) {
            return { success: false, status: "erreur", message: joined };
        }

        return {
            success: false,
            status: "erreur",
            message: "Échec : raison non reconnue. Vérifiez l'exemplaire à la main."
        };
    }

    /* ------------------------------------------------------------------ */
    /* Job orchestration                                                  */
    /* ------------------------------------------------------------------ */

    function logResult(job, barcode, status, message, itemId, code, createdByCurrentJob) {
        var entry = {
            barcode: barcode,
            status: status,
            message: message,
            itemId: itemId || null,
            code: code || null,
            cancelled: false,
            createdByCurrentJob: createdByCurrentJob === true
        };
        job.log.push(entry);
        setJob(job);
        saveLastReport(job);
        setProgress(job.log.length + " / " + job.total + " traité(s)…");
        appendResultRow(entry, job.log.length - 1);
        updateSummary(job);
    }

    function stopJob() {
        var job = getJob();
        if (job) {
            job.stopped = true;
            setJob(job);
            window.__btpLastJob = job;
        }
        setProgress("Arrêt demandé… fin du code-barres en cours.");
    }

    function finishJob(job) {
        saveLastReport(job);
        clearJob();
        renderIdle();
        setProgress("Terminé : " + job.log.length + " / " + job.total + ".");
        updateSummary(job);
        // Remettre les CB restants (si arret) dans le textarea
        var textarea = document.getElementById("btp-barcodes");
        if (textarea && job.queue && job.queue.length) {
            textarea.value = job.queue.join("\n");
        } else if (textarea) {
            textarea.value = "";
        }
    }

    function startJob() {
        var textarea = document.getElementById("btp-barcodes");
        var select = document.getElementById("btp-tobranch");
        var skipLoan = document.getElementById("btp-skiploan");
        var skipTransfer = document.getElementById("btp-skiptransfer");
        var skipNfl = document.getElementById("btp-skipnfl");
        var barcodes = parseBarcodes(textarea.value);

        if (!barcodes.length) {
            showNotice("Liste vide", "Ajoutez au moins un code-barres.", "err");
            return;
        }
        if (!select.value) {
            showNotice("Destination manquante", "Choisissez une bibliothèque de destination.", "err");
            return;
        }
        if (!document.querySelector("#branchtransfers") && !document.querySelector('form[name="branchtransfers"]')) {
            // le formulaire peut s'appeler #branchtransfers
            if (!document.querySelector("form")) {
                alert("Formulaire de transfert introuvable sur la page.");
                return;
            }
        }

        var job = {
            queue: barcodes,
            total: barcodes.length,
            tobranchcd: select.value,
            skipOnLoan: !!(skipLoan && skipLoan.checked),
            skipInTransfer: !!(skipTransfer && skipTransfer.checked),
            skipNotForLoan: !!(skipNfl && skipNfl.checked),
            loginBranch: getLoggedInBranch(),
            stopped: false,
            log: []
        };
        setJob(job);
        window.__btpLastJob = job;
        renderRunning();
        document.getElementById("btp-log").innerHTML = "";
        document.getElementById("btp-logcount").textContent = "0";
        updateSummary(job);
        setProgress("Démarrage — 0 / " + job.total + "…");
        processNext();
    }

    function processNext() {
        var job = getJob();
        if (!job) return;

        if (job.stopped) {
            finishJob(job);
            setProgress("Arrêté : " + job.log.length + " / " + job.total + " traité(s). CB restants conservés.");
            return;
        }

        if (!job.queue.length) {
            finishJob(job);
            return;
        }

        var next = job.queue.shift();
        setJob(job);

        fetchItemBundle(next)
            .then(function (bundle) {
                var current = getJob();
                if (!current) return;

                var decision = evaluateSkip(bundle, current);
                if (decision.skip) {
                    logResult(current, next, decision.status, decision.message, decision.itemId, decision.code);
                    processNext();
                    return;
                }

                var fromBranch = decision.holding || current.loginBranch;
                var limitPromise = bundle.item
                    ? checkTransferLimit(fromBranch, current.tobranchcd, bundle.item)
                    : Promise.resolve(null);

                return limitPromise.then(function (limitSkip) {
                    var j = getJob();
                    if (!j) return;
                    if (limitSkip) {
                        logResult(j, next, limitSkip.status, limitSkip.message, limitSkip.itemId, limitSkip.code);
                        processNext();
                        return;
                    }

                    return postTransfer(next, j.tobranchcd).then(function (result) {
                        var j2 = getJob();
                        if (!j2) return;
                        var message = result.message;
                        if (result.success && decision.warning) {
                            message += " — " + decision.warning;
                        }
                        logResult(
                            j2,
                            next,
                            result.status || (result.success ? "ok" : "erreur"),
                            message,
                            decision.itemId || (bundle.item && bundle.item.item_id) || null,
                            result.code || null,
                            result.success === true
                        );
                        processNext();
                    });
                });
            })
            .catch(function (e) {
                var j = getJob();
                if (!j) return;
                logResult(
                    j,
                    next,
                    "erreur",
                    "Erreur inattendue : " + (e && e.message ? e.message : e),
                    null,
                    "exception"
                );
                processNext();
            });
    }

    /* ------------------------------------------------------------------ */
    /* Init                                                               */
    /* ------------------------------------------------------------------ */

    function applyDefaultCheckboxes() {
        // Ne jamais modifier les choix d'un job actif/repris.
        var active = getJob();
        if (active && active.queue && active.queue.length && !active.stopped) return;
        var skipLoan = document.getElementById("btp-skiploan");
        var skipTransfer = document.getElementById("btp-skiptransfer");
        var skipNfl = document.getElementById("btp-skipnfl");
        if (skipLoan) skipLoan.checked = currentConfig.defaultSkipOnLoan !== false;
        if (skipTransfer) skipTransfer.checked = currentConfig.defaultSkipInTransfer !== false;
        if (skipNfl) skipNfl.checked = currentConfig.defaultSkipNotForLoan !== false;
    }

    function removeRuntimeUi() {
        var panel = document.getElementById(PANEL_ID);
        if (panel) panel.remove();
        var style = document.getElementById(STYLE_ID);
        if (style) style.remove();
        runtimeInitialized = false;
    }

    function initRuntime() {
        if (!currentConfig.enabled) return;
        if (runtimeInitialized && document.getElementById(PANEL_ID)) {
            applyDefaultCheckboxes();
            return;
        }
        runtimeInitialized = true;
        buildPanel();
        var job = getJob();
        if (job && job.queue && job.queue.length && !job.stopped) {
            renderRunning();
            var textarea = document.getElementById("btp-barcodes");
            var select = document.getElementById("btp-tobranch");
            if (textarea) textarea.value = job.queue.join("\n");
            if (select) select.value = job.tobranchcd;
            var skipLoan = document.getElementById("btp-skiploan");
            var skipTransfer = document.getElementById("btp-skiptransfer");
            var skipNfl = document.getElementById("btp-skipnfl");
            if (skipLoan) skipLoan.checked = !!job.skipOnLoan;
            if (skipTransfer) skipTransfer.checked = job.skipInTransfer !== false;
            if (skipNfl) skipNfl.checked = job.skipNotForLoan !== false;
            renderLog(job);
            setProgress("Reprise — " + job.log.length + " / " + job.total + "…");
            processNext();
        } else if (job && job.log && job.log.length && (!job.queue || !job.queue.length)) {
            saveLastReport(job);
            clearJob();
            renderIdle();
            renderLog(job);
            setProgress("Dernier rapport restauré (" + job.log.length + " ligne(s)).");
            applyDefaultCheckboxes();
        } else {
            renderIdle();
            applyDefaultCheckboxes();
            var last = getLastReport();
            if (last && last.log && last.log.length) {
                renderLog(last);
                setProgress("Dernier rapport disponible (" + last.log.length + " ligne(s)).");
            }
        }
    }

    function applyConfig(raw) {
        currentConfig = normalizeConfig(raw);
        if (!currentConfig.enabled) {
            // Si un traitement est en cours, on demande un arrêt propre après le CB courant.
            var running = getJob();
            if (running && running.queue && running.queue.length && !running.stopped) {
                running.stopped = true;
                setJob(running);
            }
            removeRuntimeUi();
            return;
        }
        initRuntime();
        applyDefaultCheckboxes();
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 2,
            name: { fr: "Transfert en lot", en: "Batch transfer" },
            description: {
                fr: "Conserve le panneau historique du script 119 sur branchtransfers.pl pour transférer séquentiellement une liste de codes-barres. Les réglages PMK définissent uniquement l'activation et l'état initial des trois sécurités du panneau.",
                en: "Keeps the historical script 119 panel on branchtransfers.pl to sequentially transfer a barcode list. PMK settings only control activation and the initial state of the panel's three safety options."
            },
            category: { fr: "Réservations et transferts", en: "Holds and transfers" },
            supportedPages: ["/cgi-bin/koha/circ/branchtransfers.pl"],
            prerequisites: [],
            dependencies: [],
            defaults: Object.assign({}, DEFAULT_CONFIG),
            schema: [
                {
                    type: "section",
                    id: "activation",
                    label: { fr: "Activation", en: "Activation" },
                    fields: [
                        { key: "enabled", type: "boolean", label: { fr: "Activer Transfert en lot", en: "Enable Batch transfer" } }
                    ]
                },
                {
                    type: "section",
                    id: "defaults",
                    label: { fr: "Valeurs par défaut du panneau", en: "Panel defaults" },
                    description: {
                        fr: "Ces réglages déterminent uniquement l'état initial des trois cases. L'agent peut toujours les modifier avant de démarrer un lot.",
                        en: "These settings only define the initial state of the three checkboxes. Staff can still change them before starting a batch."
                    },
                    fields: [
                        {
                            key: "defaultSkipOnLoan",
                            type: "boolean",
                            label: {
                                fr: "Ne pas transférer les exemplaires actuellement empruntés",
                                en: "Do not transfer currently checked-out items"
                            }
                        },
                        {
                            key: "defaultSkipInTransfer",
                            type: "boolean",
                            label: {
                                fr: "Ignorer les exemplaires déjà en transfert",
                                en: "Skip items already in transfer"
                            }
                        },
                        {
                            key: "defaultSkipNotForLoan",
                            type: "boolean",
                            label: {
                                fr: "Ne pas transférer les exemplaires exclus du prêt",
                                en: "Do not transfer not-for-loan items"
                            }
                        }
                    ]
                }
            ]
        };
    }

    function registerWithPMK() {
        if (registeredWithPMK || !window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") {
            return false;
        }
        try {
            window.PMKConfig.registerModule(moduleDefinition());
            registeredWithPMK = true;
        } catch (e) {
            return false;
        }

        if (typeof window.PMKConfig.subscribe === "function") {
            try {
                unsubscribePMK = window.PMKConfig.subscribe(MODULE_ID, applyConfig);
            } catch (e) {}
        }

        if (typeof window.PMKConfig.getConfig === "function") {
            Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
                .then(function (cfg) { applyConfig(cfg || DEFAULT_CONFIG); })
                .catch(function () { applyConfig(DEFAULT_CONFIG); });
        } else {
            applyConfig(DEFAULT_CONFIG);
        }
        return true;
    }

    function bootstrap() {
        // Fail-safe : le script garde son comportement historique même sans PMK.
        if (!registerWithPMK()) {
            applyConfig(DEFAULT_CONFIG);
            window.addEventListener("pmk:config-ready", function () {
                registerWithPMK();
            }, { once: true });
        }
    }

    window.PMK119MultiTransfer = {
        moduleId: MODULE_ID,
        version: MODULE_VERSION,
        defaults: Object.assign({}, DEFAULT_CONFIG),
        apply: applyConfig,
        getActiveJob: getActiveJob,
        canCancelEntry: canCancelEntry,
        canBulkCancelEntry: canBulkCancelEntry
    };

    window.addEventListener("beforeunload", function () {
        if (typeof unsubscribePMK === "function") {
            try { unsubscribePMK(); } catch (e) {}
        }
    }, { once: true });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
    } else {
        bootstrap();
    }

})();

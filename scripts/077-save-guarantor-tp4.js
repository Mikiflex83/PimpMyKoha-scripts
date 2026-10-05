/* ============================================================
   077-save-guarantor-tp4.js
   Module PMK : Impression des résultats de rapports
   Version    : 2.0.0
   Date       : 2026-09-19

   IMPORTANT
   ----------
   Le nom historique du fichier est conservé uniquement pour ne pas
   casser l'IntranetUserJS existant. Ce script ne traite plus et ne
   sauvegarde aucune information de garant.

   Fonction :
   - ajoute une action "Imprimer le tableau" sur les résultats d'un
     rapport Koha (guided_reports.pl) ;
   - s'appuie sur #report_results et non sur le bouton graphique Koha ;
   - respecte par défaut les lignes et colonnes actuellement visibles,
     y compris après filtrage/masquage par un autre module tel que 062 ;
   - ajoute le titre du rapport et son identifiant selon configuration ;
   - choisit automatiquement portrait/paysage ou respecte le choix PMK ;
   - s'intègre dans #toolbar lorsque Koha le fournit et crée sinon une
     petite barre d'actions compatible Koha juste au-dessus du tableau ;
   - garde anti-double chargement ;
   - configuration FR/EN via PMKConfig avec valeurs par défaut locales.

   Compatibilité visée : Koha 24.11 / 25.11 / 26.05.
   ============================================================ */
(function () {
    "use strict";

    if (window.__PMK_077_GUIDED_REPORT_PRINT__) return;
    window.__PMK_077_GUIDED_REPORT_PRINT__ = true;

    var MODULE_ID = "guided-report-print";
    var PAGE_PATH = "/cgi-bin/koha/reports/guided_reports.pl";
    var BUTTON_ID = "pmk077-print-report";
    var GROUP_ID = "pmk077-print-group";
    var OWN_TOOLBAR_ID = "pmk077-toolbar";
    var CONFIG_HOST_ID = "pmk077-config-host";

    var DEFAULT_CONFIG = {
        enabled: true,
        page: {
            enabled: true,
            path: PAGE_PATH
        },
        print: {
            showTitle: true,
            showReportId: true,
            visibleRowsOnly: true,
            visibleColumnsOnly: true,
            orientation: "auto",
            autoLandscapeColumns: 7
        },
        labels: {
            buttonFr: "Imprimer le tableau",
            buttonEn: "Print table",
            documentFr: "Résultats du rapport",
            documentEn: "Report results",
            reportIdFr: "Rapport n°",
            reportIdEn: "Report ID",
            popupBlockedFr: "La fenêtre d'impression a été bloquée par le navigateur.",
            popupBlockedEn: "The print window was blocked by the browser."
        },
        selectors: {
            table: "#report_results",
            toolbar: "#toolbar",
            paginationTop: "#pagination_top",
            heading: "main h1",
            reportNumber: ".report_heading_id .report_number"
        }
    };

    var currentConfig = clone(DEFAULT_CONFIG);
    var subscribed = false;

    function clone(value) {
        return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }

    function merge(base, patch) {
        var out = clone(base);
        if (!patch || typeof patch !== "object") return out;
        Object.keys(patch).forEach(function (key) {
            var value = patch[key];
            if (
                value &&
                typeof value === "object" &&
                !Array.isArray(value) &&
                out[key] &&
                typeof out[key] === "object" &&
                !Array.isArray(out[key])
            ) {
                out[key] = merge(out[key], value);
            } else {
                out[key] = clone(value);
            }
        });
        return out;
    }

    function text(value) {
        return String(value == null ? "" : value).trim();
    }

    function pageIsActive() {
        if (window.location.pathname !== PAGE_PATH) return false;
        if (!currentConfig.enabled) return false;
        return !currentConfig.page || currentConfig.page.enabled !== false;
    }

    function language() {
        try {
            if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
                return window.PMKConfig.getLanguage() === "en" ? "en" : "fr";
            }
            var htmlLang = String(document.documentElement.lang || navigator.language || "").toLowerCase();
            return htmlLang.indexOf("en") === 0 ? "en" : "fr";
        } catch (_) {
            return "fr";
        }
    }

    function label(frKey, enKey) {
        var labels = currentConfig.labels || {};
        return language() === "en" ? text(labels[enKey]) : text(labels[frKey]);
    }

    function waitFor(selector, timeout) {
        var sel = text(selector);
        if (!sel) return Promise.reject(new Error("empty selector"));

        if (window.KOHA_UTILS && typeof window.KOHA_UTILS.waitFor === "function") {
            try {
                return window.KOHA_UTILS.waitFor(sel, timeout || 5000);
            } catch (_) {}
        }

        return new Promise(function (resolve, reject) {
            var first;
            try { first = document.querySelector(sel); } catch (err) { reject(err); return; }
            if (first) { resolve(first); return; }

            var root = document.documentElement || document.body;
            if (!root) { reject(new Error("document root unavailable")); return; }

            var done = false;
            var observer = new MutationObserver(function () {
                if (done) return;
                var found = null;
                try { found = document.querySelector(sel); } catch (_) {}
                if (found) {
                    done = true;
                    observer.disconnect();
                    resolve(found);
                }
            });
            observer.observe(root, { childList: true, subtree: true });

            window.setTimeout(function () {
                if (done) return;
                done = true;
                observer.disconnect();
                reject(new Error("timeout"));
            }, timeout || 5000);
        });
    }

    function isActuallyVisible(node) {
        if (!node || node.nodeType !== 1) return false;
        if (node.hidden || node.getAttribute("aria-hidden") === "true") return false;
        if (node.classList.contains("d-none") || node.classList.contains("hidden")) return false;
        try {
            var style = window.getComputedStyle(node);
            if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
        } catch (_) {}
        return true;
    }

    function visibleColumnIndexes(table) {
        if (!table) return [];
        var row = table.querySelector("thead tr");
        if (!row) return [];
        return Array.prototype.map.call(row.children, function (cell, index) {
            return isActuallyVisible(cell) ? index : -1;
        }).filter(function (index) { return index >= 0; });
    }

    function removeHiddenRows(sourceTable, clonedTable) {
        if (!currentConfig.print || currentConfig.print.visibleRowsOnly === false) return;
        var sourceRows = sourceTable.querySelectorAll("tbody tr");
        var clonedRows = clonedTable.querySelectorAll("tbody tr");
        for (var i = clonedRows.length - 1; i >= 0; i -= 1) {
            var source = sourceRows[i];
            if (!source || !isActuallyVisible(source)) clonedRows[i].remove();
        }
    }

    function removeHiddenColumns(sourceTable, clonedTable) {
        if (!currentConfig.print || currentConfig.print.visibleColumnsOnly === false) return;
        var header = sourceTable.querySelector("thead tr");
        if (!header) return;

        var hidden = [];
        Array.prototype.forEach.call(header.children, function (cell, index) {
            if (!isActuallyVisible(cell)) hidden.push(index);
        });
        if (!hidden.length) return;

        var rows = clonedTable.querySelectorAll("tr");
        Array.prototype.forEach.call(rows, function (row) {
            for (var i = hidden.length - 1; i >= 0; i -= 1) {
                var index = hidden[i];
                if (row.children[index]) row.children[index].remove();
            }
        });
    }

    function cleanClone(clonedTable) {
        if (!clonedTable) return;
        clonedTable.removeAttribute("id");
        clonedTable.removeAttribute("style");
        clonedTable.className = "pmk077-print-table";

        clonedTable.querySelectorAll("script, style, .dropdown-menu, .tooltip, .popover, .data-plain, [aria-hidden='true']").forEach(function (node) {
            node.remove();
        });

        clonedTable.querySelectorAll("button, input, select, textarea").forEach(function (node) {
            var replacement = document.createTextNode(text(node.textContent || node.value || ""));
            if (node.parentNode) node.parentNode.replaceChild(replacement, node);
        });

        clonedTable.querySelectorAll("a").forEach(function (link) {
            link.removeAttribute("href");
            link.removeAttribute("target");
            link.removeAttribute("role");
            link.removeAttribute("data-bs-toggle");
            link.removeAttribute("data-toggle");
        });

        // Les styles d’écran ne doivent pas polluer l’impression.
        // Si l’utilisateur a désactivé "visibleColumnsOnly", retirer un
        // display:none permet au contraire de réimprimer la colonne masquée.
        clonedTable.querySelectorAll("[style]").forEach(function (node) {
            node.removeAttribute("style");
        });
    }

    function getReportId() {
        var selector = text(currentConfig.selectors && currentConfig.selectors.reportNumber);
        if (selector) {
            try {
                var node = document.querySelector(selector);
                if (node && text(node.textContent)) return text(node.textContent);
            } catch (_) {}
        }
        try {
            return text(new URL(window.location.href).searchParams.get("id"));
        } catch (_) {
            return "";
        }
    }

    function getReportTitle() {
        var selector = text(currentConfig.selectors && currentConfig.selectors.heading);
        if (!selector) return "";
        var heading = null;
        try { heading = document.querySelector(selector); } catch (_) {}
        if (!heading) return "";

        var copy = heading.cloneNode(true);
        copy.querySelectorAll(".report_heading_id").forEach(function (node) { node.remove(); });
        return text(copy.textContent);
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function resolveOrientation(table) {
        var configured = text(currentConfig.print && currentConfig.print.orientation).toLowerCase();
        if (configured === "portrait" || configured === "landscape") return configured;

        var threshold = Number(currentConfig.print && currentConfig.print.autoLandscapeColumns);
        if (!Number.isFinite(threshold) || threshold < 2) threshold = 7;
        var columns;
        if (currentConfig.print && currentConfig.print.visibleColumnsOnly === false) {
            var header = table.querySelector("thead tr");
            columns = header ? header.children.length : 0;
        } else {
            columns = visibleColumnIndexes(table).length;
        }
        return columns >= threshold ? "landscape" : "portrait";
    }

    function printTable() {
        var tableSelector = text(currentConfig.selectors && currentConfig.selectors.table) || "#report_results";
        var table = null;
        try { table = document.querySelector(tableSelector); } catch (_) {}
        if (!table) return;

        var printWindow = window.open("", "pmk077-report-print", "height=900,width=1100");
        if (!printWindow) {
            window.alert(label("popupBlockedFr", "popupBlockedEn") || "Print window blocked.");
            return;
        }

        var cloneTable = table.cloneNode(true);
        removeHiddenRows(table, cloneTable);
        removeHiddenColumns(table, cloneTable);
        cleanClone(cloneTable);

        var orientation = resolveOrientation(table);
        var reportTitle = getReportTitle();
        var reportId = getReportId();
        var showTitle = !currentConfig.print || currentConfig.print.showTitle !== false;
        var showReportId = !currentConfig.print || currentConfig.print.showReportId !== false;
        var fallbackTitle = label("documentFr", "documentEn") || "Report results";

        var titleHtml = "";
        if (showTitle) {
            titleHtml += '<h1>' + escapeHtml(reportTitle || fallbackTitle) + "</h1>";
        }
        if (showReportId && reportId) {
            titleHtml += '<div class="pmk077-report-id">' + escapeHtml(label("reportIdFr", "reportIdEn") || "Report ID") + " " + escapeHtml(reportId) + "</div>";
        }

        var columnCount = visibleColumnIndexes(table).length || (cloneTable.querySelector("thead tr") ? cloneTable.querySelector("thead tr").children.length : 1);
        var fontSize = columnCount >= 12 ? "7.5pt" : columnCount >= 9 ? "8.5pt" : "9.5pt";

        var html = "<!doctype html><html><head><meta charset=\"utf-8\">" +
            "<title>" + escapeHtml(reportTitle || fallbackTitle) + "</title>" +
            "<style>" +
            "@page{size:A4 " + orientation + ";margin:10mm;}" +
            "html,body{margin:0;padding:0;color:#111;background:#fff;font-family:Arial,Helvetica,sans-serif;}" +
            "body{font-size:" + fontSize + ";}" +
            "h1{font-size:15pt;line-height:1.2;margin:0 0 3mm 0;font-weight:600;}" +
            ".pmk077-report-id{font-size:9pt;color:#555;margin:0 0 5mm 0;}" +
            ".pmk077-print-table{width:100%;border-collapse:collapse;table-layout:auto;}" +
            ".pmk077-print-table thead{display:table-header-group;}" +
            ".pmk077-print-table tr{break-inside:avoid;page-break-inside:avoid;}" +
            ".pmk077-print-table th,.pmk077-print-table td{border:1px solid #bbb;padding:3px 5px;vertical-align:top;text-align:left;overflow-wrap:anywhere;word-break:normal;}" +
            ".pmk077-print-table th{background:#f1f1f1;font-weight:700;}" +
            ".pmk077-print-table a{color:#111;text-decoration:none;}" +
            "</style></head><body>" + titleHtml + cloneTable.outerHTML + "</body></html>";

        try {
            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.focus();
            window.setTimeout(function () {
                try { printWindow.print(); } catch (_) {}
            }, 150);
        } catch (_) {
            try { printWindow.close(); } catch (__) {}
        }
    }

    function removeUi() {
        var group = document.getElementById(GROUP_ID);
        if (group) group.remove();
        var ownToolbar = document.getElementById(OWN_TOOLBAR_ID);
        if (ownToolbar) ownToolbar.remove();
    }

    function ensureToolbar(table) {
        var toolbarSelector = text(currentConfig.selectors && currentConfig.selectors.toolbar) || "#toolbar";
        var toolbar = null;
        try { toolbar = document.querySelector(toolbarSelector); } catch (_) {}
        if (toolbar) return toolbar;

        var own = document.getElementById(OWN_TOOLBAR_ID);
        if (own) return own;

        own = document.createElement("div");
        own.id = OWN_TOOLBAR_ID;
        own.className = "btn-toolbar mb-2";
        own.setAttribute("role", "toolbar");
        own.setAttribute("aria-label", label("documentFr", "documentEn") || "Report actions");

        var paginationSelector = text(currentConfig.selectors && currentConfig.selectors.paginationTop) || "#pagination_top";
        var pagination = null;
        try { pagination = document.querySelector(paginationSelector); } catch (_) {}

        if (pagination && pagination.parentNode) pagination.parentNode.insertBefore(own, pagination);
        else if (table && table.parentNode) table.parentNode.insertBefore(own, table);
        return own;
    }

    function mountConfigButton(group) {
        if (!group || !window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        if (!window.PMKConfig.canOpenAdmin || !window.PMKConfig.canOpenAdmin()) return;

        var previous = document.getElementById(CONFIG_HOST_ID);
        if (previous) previous.remove();

        var host = document.createElement("span");
        host.id = CONFIG_HOST_ID;
        host.className = "pmk077-config-host";
        group.appendChild(host);

        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: host,
                contextKey: "guided-report-print",
                context: { sectionId: "print", pagePath: PAGE_PATH }
            });
        } catch (_) {}
    }

    function render(table) {
        if (!pageIsActive() || !table) {
            removeUi();
            return;
        }

        var old = document.getElementById(GROUP_ID);
        if (old) old.remove();

        var toolbar = ensureToolbar(table);
        if (!toolbar) return;

        var group = document.createElement("div");
        group.id = GROUP_ID;
        group.className = "btn-group pmk077-print-group";
        group.setAttribute("role", "group");

        var button = document.createElement("button");
        button.type = "button";
        button.id = BUTTON_ID;
        button.className = "btn btn-default btn-sm";
        button.innerHTML = '<i class="fa fa-print" aria-hidden="true"></i> <span></span>';
        button.querySelector("span").textContent = label("buttonFr", "buttonEn") || "Imprimer le tableau";
        button.addEventListener("click", printTable);

        group.appendChild(button);
        toolbar.appendChild(group);
        mountConfigButton(group);
    }

    function applyConfig() {
        removeUi();
        if (!pageIsActive()) return;

        var selector = text(currentConfig.selectors && currentConfig.selectors.table) || "#report_results";
        waitFor(selector, 5000).then(function (table) {
            if (!pageIsActive()) return;
            render(table);
        }).catch(function () {
            removeUi();
        });
    }

    function loadWithPMK() {
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") return false;

        window.PMKConfig.getConfig(MODULE_ID).then(function (config) {
            currentConfig = merge(DEFAULT_CONFIG, config || {});
            applyConfig();
        }).catch(function () {
            currentConfig = clone(DEFAULT_CONFIG);
            applyConfig();
        });

        if (!subscribed && typeof window.PMKConfig.subscribe === "function") {
            subscribed = true;
            window.PMKConfig.subscribe(MODULE_ID, function (config) {
                currentConfig = merge(DEFAULT_CONFIG, config || {});
                applyConfig();
            });
        }
        return true;
    }

    function boot() {
        if (window.location.pathname !== PAGE_PATH) return;
        if (loadWithPMK()) return;

        currentConfig = clone(DEFAULT_CONFIG);
        applyConfig();

        window.addEventListener("pmk:config-ready", function () {
            loadWithPMK();
        }, { once: true });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();

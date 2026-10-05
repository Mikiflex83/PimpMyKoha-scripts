/*
 Nom du fichier: 051-alert-doc-retour-perdu.js
 Version: 3.0.0-pmk-isolated
 Date de dernière modification: 2026-09-19
 Auteur: Michael Mundet
 Description:
   Contrôle le statut « non prêtable » d'un exemplaire lorsqu'un document
   précédemment perdu est retrouvé au retour (circ/returns.pl).

   Refonte préparatoire PimpMyKoha :
   - détecte l'événement Koha LOST -> retrouvé via .ret_checkedin ;
   - ne dépend plus d'une phrase française codée en dur ;
   - relit l'exemplaire via l'API REST Koha avant toute décision ;
   - tient compte du NOT_LOAN final, donc après la logique native Koha ;
   - règles configurables à partir des valeurs autorisées LOST / NOT_LOAN ;
   - modes par NOT_LOAN : conserver, demander, remettre disponible ;
   - remise disponible via l'API REST native Koha, avec relecture avant/après ;
   - repli vers l'édition native de l'exemplaire si la modification échoue ;
   - FR/EN, responsive, idempotent, sans console.* ;
   - Firestore n'est jamais appelé directement par ce module.
*/
(function () {
    "use strict";

    const MODULE_ID = "lost-found-checkin-status";
    const PAGE_ID = "circ.returns";
    const PAGE_PATH = "/cgi-bin/koha/circ/returns.pl";
    const SCRIPT_GUARD = "__pmk051LostFoundCheckinStatusV3";
    const CARD_ATTR = "data-pmk051-card";
    const STYLE_ID = "pmk-051-lost-found-style";

    if (window[SCRIPT_GUARD]) return;
    window[SCRIPT_GUARD] = true;

    if (window.location.pathname !== PAGE_PATH) return;

    const DEFAULTS = {
        enabled: true,
        page: {
            enabled: true,
            pageId: PAGE_ID,
            path: PAGE_PATH
        },
        lostStatuses: [],
        unknownLostAction: "handle",
        notLoanRules: [],
        unknownNotLoanAction: "ask"
    };

    let currentConfig = clone(DEFAULTS);
    let observer = null;
    let scanQueued = false;
    const handled = new Set();
    const avCache = new Map();

    function clone(value) {
        try {
            if (typeof structuredClone === "function") return structuredClone(value);
        } catch (_) {}
        return JSON.parse(JSON.stringify(value));
    }

    function merge(base, extra) {
        const out = clone(base);
        const src = extra && typeof extra === "object" ? extra : {};
        Object.keys(src).forEach(function (key) {
            const incoming = src[key];
            if (
                incoming && typeof incoming === "object" && !Array.isArray(incoming) &&
                out[key] && typeof out[key] === "object" && !Array.isArray(out[key])
            ) {
                out[key] = Object.assign({}, out[key], incoming);
            } else {
                out[key] = incoming;
            }
        });
        return out;
    }

    function normalizeRow(row, kind) {
        const value = row && typeof row === "object" ? Object.assign({}, row) : {};
        value.value = String(value.value == null ? "" : value.value).trim();
        value.description = String(value.description || value.value || "").trim();
        value.enabled = value.enabled !== false;
        if (kind === "notLoan" && !["ask", "keep", "available"].includes(value.action)) {
            value.action = "ask";
        }
        return value;
    }

    function normalizeConfig(config) {
        const value = merge(DEFAULTS, config || {});
        value.enabled = value.enabled !== false;
        value.page = Object.assign({}, DEFAULTS.page, value.page || {});
        value.page.enabled = value.page.enabled !== false;
        value.page.pageId = PAGE_ID;
        value.page.path = PAGE_PATH;
        value.lostStatuses = Array.isArray(value.lostStatuses)
            ? value.lostStatuses.map(function (row) { return normalizeRow(row, "lost"); }).filter(function (row) { return row.value !== ""; })
            : [];
        value.notLoanRules = Array.isArray(value.notLoanRules)
            ? value.notLoanRules.map(function (row) { return normalizeRow(row, "notLoan"); }).filter(function (row) { return row.value !== "" && row.value !== "0"; })
            : [];
        if (!["handle", "ignore"].includes(value.unknownLostAction)) value.unknownLostAction = "handle";
        if (!["ask", "keep"].includes(value.unknownNotLoanAction)) value.unknownNotLoanAction = "ask";
        return value;
    }

    function pmkApi() {
        return window.PMKConfig && typeof window.PMKConfig === "object" ? window.PMKConfig : null;
    }

    function language() {
        const api = pmkApi();
        if (api && typeof api.getLanguage === "function") {
            try {
                const lang = String(api.getLanguage() || "").toLowerCase();
                if (lang.startsWith("en")) return "en";
                if (lang.startsWith("fr")) return "fr";
            } catch (_) {}
        }
        const htmlLang = String(document.documentElement.getAttribute("lang") || "").toLowerCase();
        return htmlLang.startsWith("en") ? "en" : "fr";
    }

    function t(fr, en) {
        return language() === "en" ? en : fr;
    }

    function normalizeText(value) {
        return String(value || "")
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toLocaleLowerCase();
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .pmk051-card {
                margin-top: .65rem;
                margin-bottom: .65rem;
                padding: .75rem .9rem;
            }
            .pmk051-header {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: .35rem .55rem;
                margin-bottom: .3rem;
            }
            .pmk051-title {
                margin: 0;
                font-size: 1rem;
                line-height: 1.3;
            }
            .pmk051-meta {
                margin: .15rem 0 .55rem;
                color: inherit;
                overflow-wrap: anywhere;
            }
            .pmk051-actions {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: .4rem;
            }
            .pmk051-actions .btn {
                white-space: normal;
            }
            .pmk051-status-name {
                font-weight: 700;
            }
            .pmk051-working {
                display: inline-flex;
                align-items: center;
                gap: .35rem;
            }
            @media (max-width: 576px) {
                .pmk051-card { padding: .7rem; }
                .pmk051-actions {
                    align-items: stretch;
                    flex-direction: column;
                }
                .pmk051-actions .btn,
                .pmk051-actions a.btn {
                    width: 100%;
                    text-align: center;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function csrfToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? String(meta.getAttribute("content") || "") : "";
    }

    async function fetchJson(url, options) {
        const opts = Object.assign({
            credentials: "same-origin",
            headers: {
                "Accept": "application/json",
                "X-Requested-With": "XMLHttpRequest"
            }
        }, options || {});
        opts.headers = Object.assign({
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest"
        }, (options && options.headers) || {});

        const response = await fetch(url, opts);
        let payload = null;
        try { payload = await response.json(); } catch (_) {}
        if (!response.ok) {
            const error = new Error(payload && (payload.error || payload.message) ? (payload.error || payload.message) : (response.statusText || "HTTP " + response.status));
            error.status = response.status;
            error.payload = payload;
            throw error;
        }
        return payload;
    }

    async function getAuthorisedValues(category, force) {
        const key = String(category || "").toUpperCase();
        const cached = avCache.get(key);
        if (!force && cached && (Date.now() - cached.at) < 60000) return cached.values;

        const url = "/api/v1/authorised_value_categories/" + encodeURIComponent(key) + "/authorised_values?_per_page=-1";
        const payload = await fetchJson(url);
        const values = Array.isArray(payload) ? payload.map(function (row) {
            return {
                value: String(row && row.value != null ? row.value : "").trim(),
                description: String((row && (row.description || row.value)) || "").trim()
            };
        }).filter(function (row) { return row.value !== ""; }) : [];
        avCache.set(key, { at: Date.now(), values: values });
        return values;
    }

    function extractBiblioId(alertBox) {
        const link = alertBox.querySelector('a[href*="biblionumber="]');
        if (!link) return null;
        try {
            const url = new URL(link.href, window.location.origin);
            const id = Number(url.searchParams.get("biblionumber"));
            return Number.isInteger(id) && id > 0 ? id : null;
        } catch (_) {
            return null;
        }
    }

    function extractBarcode(alertBox) {
        const hidden = alertBox.querySelector('input[name="barcode"][value]');
        if (hidden && String(hidden.value || "").trim()) return String(hidden.value).trim();

        const link = alertBox.querySelector('a[href*="biblionumber="]');
        if (!link) return "";
        const text = String(link.textContent || "").trim();
        const colon = text.indexOf(":");
        if (colon > 0) return text.slice(0, colon).trim();
        return "";
    }

    async function resolveItem(alertBox) {
        const biblioId = extractBiblioId(alertBox);
        const barcode = extractBarcode(alertBox);
        if (!barcode) return null;

        const list = await fetchJson("/api/v1/items?external_id=" + encodeURIComponent(barcode) + "&_per_page=-1");
        const matches = (Array.isArray(list) ? list : []).filter(function (item) {
            if (!item) return false;
            if (String(item.external_id || "") !== barcode) return false;
            if (biblioId && Number(item.biblio_id) !== biblioId) return false;
            return true;
        });
        if (matches.length !== 1) return null;
        return getItem(matches[0].item_id);
    }

    async function getItem(itemId) {
        const id = Number(itemId);
        if (!Number.isInteger(id) || id <= 0) return null;
        return fetchJson("/api/v1/items/" + encodeURIComponent(String(id)));
    }

    async function updateNotForLoan(item, expectedStatus) {
        const current = await getItem(item.item_id);
        if (!current) throw new Error("item_not_found");
        const currentStatus = Number(current.not_for_loan_status || 0);
        if (currentStatus === 0) return current;
        if (currentStatus !== Number(expectedStatus)) {
            const changed = new Error("status_changed");
            changed.currentStatus = currentStatus;
            throw changed;
        }

        const token = csrfToken();
        const updated = await fetchJson(
            "/api/v1/biblios/" + encodeURIComponent(String(current.biblio_id)) + "/items/" + encodeURIComponent(String(current.item_id)),
            {
                method: "PUT",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json;charset=utf-8",
                    "X-Requested-With": "XMLHttpRequest",
                    "CSRF-TOKEN": token
                },
                body: JSON.stringify({ not_for_loan_status: 0 })
            }
        );

        const verified = await getItem(current.item_id);
        if (!verified || Number(verified.not_for_loan_status || 0) !== 0) {
            throw new Error("verification_failed");
        }
        return updated || verified;
    }

    function editItemUrl(item) {
        if (!item) return "";
        return "/cgi-bin/koha/cataloguing/additem.pl?op=edititem&biblionumber=" +
            encodeURIComponent(String(item.biblio_id)) + "&itemnumber=" +
            encodeURIComponent(String(item.item_id)) + "#edititem";
    }

    function findStatusLabel(status, list, rules) {
        const code = String(status);
        const live = (list || []).find(function (row) { return String(row.value) === code; });
        if (live && live.description) return live.description;
        const saved = (rules || []).find(function (row) { return String(row.value) === code; });
        if (saved && saved.description) return saved.description;
        return t("Statut non prêtable n°", "Not-for-loan status #") + code;
    }

    async function evaluateLostEvent(retNode, config) {
        const rows = Array.isArray(config.lostStatuses) ? config.lostStatuses : [];
        if (!rows.length) return { allowed: true, identified: false, forceAsk: false };

        const enabledRows = rows.filter(function (row) { return row.enabled !== false; });
        if (!enabledRows.length) return { allowed: false, identified: true, forceAsk: false };
        if (enabledRows.length === rows.length) return { allowed: true, identified: false, forceAsk: false };

        let live = [];
        try { live = await getAuthorisedValues("LOST", false); } catch (_) {}

        const byValue = new Map();
        rows.forEach(function (row) { byValue.set(String(row.value), row); });
        const candidates = [];
        const seen = new Set();

        live.concat(rows).forEach(function (row) {
            const code = String(row && row.value != null ? row.value : "").trim();
            const description = String(row && row.description || "").trim();
            if (!code || !description) return;
            const key = code + "\u0000" + description;
            if (seen.has(key)) return;
            seen.add(key);
            candidates.push({ value: code, description: description });
        });

        candidates.sort(function (a, b) { return b.description.length - a.description.length; });
        const message = normalizeText(retNode.textContent);
        const matched = candidates.find(function (row) {
            return row.description && message.includes(normalizeText(row.description));
        });

        if (matched) {
            const configured = byValue.get(String(matched.value));
            if (!configured) {
                return {
                    allowed: config.unknownLostAction !== "ignore",
                    identified: true,
                    forceAsk: true,
                    lostValue: String(matched.value)
                };
            }
            return {
                allowed: configured.enabled !== false,
                identified: true,
                forceAsk: false,
                lostValue: String(matched.value)
            };
        }

        return {
            allowed: config.unknownLostAction !== "ignore",
            identified: false,
            forceAsk: true
        };
    }

    function decideNotLoan(status, config) {
        const code = String(status);
        const rule = (config.notLoanRules || []).find(function (row) { return String(row.value) === code; });
        if (rule) {
            if (rule.enabled === false) return { handle: false, action: "keep", configured: true, rule: rule };
            return { handle: true, action: rule.action || "ask", configured: true, rule: rule };
        }
        return {
            handle: config.unknownNotLoanAction !== "keep",
            action: config.unknownNotLoanAction === "keep" ? "keep" : "ask",
            configured: false,
            rule: null
        };
    }

    function removeCardFor(alertBox) {
        if (!alertBox) return;
        const next = alertBox.nextElementSibling;
        if (next && next.hasAttribute(CARD_ATTR)) next.remove();
    }

    function makeButton(className, icon, label) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.innerHTML = '<i class="' + icon + '" aria-hidden="true"></i> <span></span>';
        button.querySelector("span").textContent = label;
        return button;
    }

    function makeEditLink(item) {
        const link = document.createElement("a");
        link.className = "btn btn-sm btn-link";
        link.href = editItemUrl(item);
        link.innerHTML = '<i class="fa fa-pencil" aria-hidden="true"></i> <span></span>';
        link.querySelector("span").textContent = t("Modifier l’exemplaire", "Edit item");
        return link;
    }

    function mountConfigShortcut(card) {
        const api = pmkApi();
        if (!api || typeof api.mountContextButton !== "function") return;
        const anchor = card.querySelector(".pmk051-title");
        if (!anchor) return;
        try {
            api.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "append",
                contextKey: PAGE_ID,
                context: {
                    sectionId: "status-rules",
                    pageId: PAGE_ID
                }
            });
        } catch (_) {}
    }

    function renderBaseCard(alertBox, item, statusLabel, type, titleText, messageText) {
        removeCardFor(alertBox);
        const card = document.createElement("div");
        card.className = "alert alert-" + type + " pmk051-card";
        card.setAttribute(CARD_ATTR, "1");
        card.setAttribute("role", "status");

        const header = document.createElement("div");
        header.className = "pmk051-header";
        const title = document.createElement("h3");
        title.className = "pmk051-title";
        title.textContent = titleText;
        header.appendChild(title);
        card.appendChild(header);

        const meta = document.createElement("p");
        meta.className = "pmk051-meta";
        const barcode = String(item && item.external_id || "").trim();
        meta.appendChild(document.createTextNode(messageText + (barcode ? " " + t("Code-barres : ", "Barcode: ") + barcode + ". " : "")));
        if (statusLabel) {
            meta.appendChild(document.createTextNode(t("Statut actuel : ", "Current status: ")));
            const strong = document.createElement("span");
            strong.className = "pmk051-status-name";
            strong.textContent = statusLabel;
            meta.appendChild(strong);
            meta.appendChild(document.createTextNode("."));
        }
        card.appendChild(meta);

        const actions = document.createElement("div");
        actions.className = "pmk051-actions";
        card.appendChild(actions);

        alertBox.insertAdjacentElement("afterend", card);
        mountConfigShortcut(card);
        return { card: card, actions: actions, meta: meta };
    }

    function renderPrompt(alertBox, item, status, statusLabel) {
        const ui = renderBaseCard(
            alertBox,
            item,
            statusLabel,
            "warning",
            t("Document retrouvé — statut à confirmer", "Found item — status to confirm"),
            t(
                "Koha a traité le statut « perdu », mais l’exemplaire reste non prêtable.",
                "Koha processed the lost status, but the item is still not for loan."
            )
        );

        const keep = makeButton(
            "btn btn-sm btn-default",
            "fa fa-lock",
            t("Conserver ce statut", "Keep this status")
        );
        const available = makeButton(
            "btn btn-sm btn-primary",
            "fa fa-check",
            t("Remettre en circulation", "Make available for loan")
        );
        const edit = makeEditLink(item);

        keep.addEventListener("click", function () {
            ui.card.className = "alert alert-info pmk051-card";
            ui.meta.textContent = t(
                "Le statut « " + statusLabel + " » est conservé. Aucune donnée n’a été modifiée par PimpMyKoha.",
                "The “" + statusLabel + "” status is kept. PimpMyKoha did not change any data."
            );
            ui.actions.replaceChildren(makeEditLink(item));
        }, { once: true });

        available.addEventListener("click", async function () {
            keep.disabled = true;
            available.disabled = true;
            await performAvailabilityUpdate(ui, item, status, statusLabel);
        }, { once: true });

        ui.actions.appendChild(keep);
        ui.actions.appendChild(available);
        ui.actions.appendChild(edit);
    }

    async function performAvailabilityUpdate(ui, item, status, statusLabel) {
        ui.card.className = "alert alert-info pmk051-card";
        ui.meta.innerHTML = "";
        const working = document.createElement("span");
        working.className = "pmk051-working";
        working.innerHTML = '<i class="fa fa-spinner fa-spin" aria-hidden="true"></i><span></span>';
        working.querySelector("span").textContent = t(
            "Vérification de l’exemplaire avant modification…",
            "Checking item before update…"
        );
        ui.meta.appendChild(working);
        ui.actions.replaceChildren();

        try {
            await updateNotForLoan(item, status);
            ui.card.className = "alert alert-success pmk051-card";
            ui.meta.textContent = t(
                "L’exemplaire a été remis en circulation. Le statut « " + statusLabel + " » a été supprimé et Koha confirme maintenant un statut prêtable.",
                "The item is available for loan again. The “" + statusLabel + "” status was removed and Koha now confirms an available status."
            );
            ui.actions.replaceChildren(makeEditLink(item));
        } catch (error) {
            ui.card.className = "alert alert-warning pmk051-card";
            let message;
            if (error && error.status === 403) {
                message = t(
                    "La remise en circulation n’a pas été effectuée : votre compte Koha ne possède pas le droit de modifier cet exemplaire. Utilisez l’édition native Koha.",
                    "The item was not made available: your Koha account is not allowed to edit this item. Use Koha's native item editor."
                );
            } else if (error && error.message === "status_changed") {
                message = t(
                    "La remise en circulation a été annulée : le statut de l’exemplaire a changé depuis l’affichage de cette alerte. Aucune modification n’a été forcée.",
                    "The update was cancelled: the item status changed after this alert was displayed. No change was forced."
                );
            } else {
                message = t(
                    "Koha n’a pas confirmé la remise en circulation. Aucune réussite n’est supposée : vérifiez l’exemplaire dans l’éditeur natif.",
                    "Koha did not confirm the update. No success is assumed: check the item in Koha's native editor."
                );
            }
            ui.meta.textContent = message;
            ui.actions.replaceChildren(makeEditLink(item));
        }
    }

    function renderResolutionFailure(alertBox, biblioId) {
        removeCardFor(alertBox);
        const card = document.createElement("div");
        card.className = "alert alert-warning pmk051-card";
        card.setAttribute(CARD_ATTR, "1");
        card.setAttribute("role", "status");
        const title = document.createElement("h3");
        title.className = "pmk051-title";
        title.textContent = t("Document retrouvé — vérification manuelle nécessaire", "Found item — manual check required");
        const text = document.createElement("p");
        text.className = "pmk051-meta";
        text.textContent = t(
            "PimpMyKoha a détecté le retour d’un document perdu mais n’a pas pu identifier l’exemplaire de façon suffisamment sûre. Aucune donnée n’a été modifiée.",
            "PimpMyKoha detected a lost item being returned but could not identify the item safely enough. No data was changed."
        );
        card.appendChild(title);
        card.appendChild(text);
        if (biblioId) {
            const actions = document.createElement("div");
            actions.className = "pmk051-actions";
            const link = document.createElement("a");
            link.className = "btn btn-sm btn-default";
            link.href = "/cgi-bin/koha/catalogue/detail.pl?biblionumber=" + encodeURIComponent(String(biblioId));
            link.textContent = t("Ouvrir la notice", "Open record");
            actions.appendChild(link);
            card.appendChild(actions);
        }
        alertBox.insertAdjacentElement("afterend", card);
        mountConfigShortcut(card);
    }

    async function processReturnMessage(retNode, config) {
        const alertBox = retNode.closest(".alert");
        if (!alertBox) return;

        const nativeSignature = normalizeText(retNode.textContent) + "|" + (extractBarcode(alertBox) || "") + "|" + (extractBiblioId(alertBox) || "");
        if (handled.has(nativeSignature)) return;
        handled.add(nativeSignature);

        const lostDecision = await evaluateLostEvent(retNode, config);
        if (!lostDecision.allowed) return;

        let item = null;
        try { item = await resolveItem(alertBox); } catch (_) {}
        if (!item) {
            renderResolutionFailure(alertBox, extractBiblioId(alertBox));
            return;
        }

        const status = Number(item.not_for_loan_status || 0);
        if (!Number.isFinite(status) || status === 0) {
            removeCardFor(alertBox);
            return;
        }

        const ruleDecision = decideNotLoan(status, config);
        if (!ruleDecision.handle) {
            removeCardFor(alertBox);
            return;
        }

        let notLoanValues = [];
        try { notLoanValues = await getAuthorisedValues("NOT_LOAN", false); } catch (_) {}
        const statusLabel = findStatusLabel(status, notLoanValues, config.notLoanRules);

        let action = ruleDecision.action;
        if (lostDecision.forceAsk && action === "available") action = "ask";

        if (action === "keep") {
            removeCardFor(alertBox);
            return;
        }

        if (action === "available") {
            const ui = renderBaseCard(
                alertBox,
                item,
                statusLabel,
                "info",
                t("Document retrouvé — remise en circulation", "Found item — making available"),
                t("Ce statut est configuré pour être supprimé automatiquement après le retour d’un document perdu.", "This status is configured to be removed automatically after a lost item is returned.")
            );
            await performAvailabilityUpdate(ui, item, status, statusLabel);
            return;
        }

        renderPrompt(alertBox, item, status, statusLabel);
    }

    function scan() {
        scanQueued = false;
        const config = currentConfig;
        if (!config.enabled || !config.page.enabled) {
            document.querySelectorAll("[" + CARD_ATTR + "]").forEach(function (card) { card.remove(); });
            return;
        }

        injectStyles();
        document.querySelectorAll(".static_checkin_messages .ret_checkedin, .alert .ret_checkedin").forEach(function (retNode) {
            processReturnMessage(retNode, config).catch(function () {
                const alertBox = retNode.closest(".alert");
                if (alertBox) renderResolutionFailure(alertBox, extractBiblioId(alertBox));
            });
        });
    }

    function queueScan() {
        if (scanQueued) return;
        scanQueued = true;
        window.requestAnimationFrame(scan);
    }

    function observeMessages() {
        if (observer) return;
        const root = document.querySelector(".static_checkin_messages") || document.querySelector("main") || document.body;
        if (!root) return;
        observer = new MutationObserver(function (mutations) {
            if (mutations.some(function (mutation) { return mutation.addedNodes && mutation.addedNodes.length; })) {
                queueScan();
            }
        });
        observer.observe(root, { childList: true, subtree: true });
    }

    function useConfig(config) {
        currentConfig = normalizeConfig(config);
        handled.clear();
        queueScan();
    }

    function connectPmkConfig() {
        const api = pmkApi();
        if (!api || typeof api.getConfig !== "function") {
            useConfig(DEFAULTS);
            return false;
        }

        try {
            if (typeof api.subscribe === "function") {
                api.subscribe(MODULE_ID, function (config) { useConfig(config); });
            }
        } catch (_) {}

        api.getConfig(MODULE_ID)
            .then(useConfig)
            .catch(function () { useConfig(DEFAULTS); });
        return true;
    }

    function start() {
        observeMessages();
        if (!connectPmkConfig()) {
            window.addEventListener("pmk:config-ready", function onReady() {
                window.removeEventListener("pmk:config-ready", onReady);
                connectPmkConfig();
            }, { once: true });
        }
        queueScan();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();

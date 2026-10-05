/*
 Nom du fichier : 052-modify-circulation-menu-links.js
 Module PMK      : Navigation personnalisée
 Version         : 3.1.0-pmk-isolated
 Date            : 2026-09-19
 Auteur          : Michael Mundet / refactorisation PimpMyKoha
 Dépendance      : 000-pmk-config-firestore.js recommandé (fonctionne avec les valeurs par défaut sans le socle)

 Fonction :
 - ajoute des éléments dans la navigation Koha ;
 - ou remplace uniquement l'URL cible d'un élément de navigation existant ;
 - utilise le moteur de pick commun PMK ;
 - utilise la pipette de style commune PMK ;
 - absorbe le comportement historique du 076 (file de réservations -> rapport 4904).

 Valeurs historiques livrées par défaut :
 - Transferts à recevoir -> rapport guidé 4639 ;
 - Transferts à envoyer -> rapport guidé 4344 ;
 - réajout des accès Koha natifs sur circulation-home.pl ;
 - File de réservations -> rapport guidé 4904.
*/

(function () {
    "use strict";

    const MODULE_ID = "custom-navigation";
    const MODULE_VERSION = "3.1.0-pmk-isolated";
    const SCRIPT_GUARD = "__pmk052CustomNavigationV31";
    const GENERATED_ATTR = "data-pmk-nav-generated";
    const ORIGINAL_HREF_ATTR = "data-pmk-nav-original-href";
    const RULE_ATTR = "data-pmk-nav-rule";
    const CONTEXT_KEY_PREFIX = "custom-navigation-";

    if (window[SCRIPT_GUARD]) return;
    window[SCRIPT_GUARD] = true;

    const DEFAULT_CONFIG = {
        enabled: true,
        rules: [
            {
                id: "legacy-052-receive-report",
                enabled: true,
                name: "Transferts à recevoir → rapport 4639",
                action: "replace-url",
                allPages: false,
                pages: "/cgi-bin/koha/circ/circulation-home.pl\n/cgi-bin/koha/circ/circulation.pl",
                targetSelector: "",
                targetHref: "/cgi-bin/koha/circ/transferstoreceive.pl",
                targetName: "Transferts à recevoir",
                destinationKind: "report",
                reportId: "4639",
                destinationUrl: "",
                anchorSelector: "",
                anchorHref: "",
                anchorName: "",
                position: "after",
                textFr: "",
                textEn: "",
                showIcon: false,
                iconClass: "",
                styleMode: "auto",
                sampledStyle: null,
                sampledClasses: [],
                sampledParentClasses: []
            },
            {
                id: "legacy-052-receive-native",
                enabled: true,
                name: "Accès Koha natif — Transferts à recevoir",
                action: "add",
                allPages: false,
                pages: "/cgi-bin/koha/circ/circulation-home.pl",
                targetSelector: "",
                targetHref: "",
                targetName: "",
                destinationKind: "url",
                reportId: "",
                destinationUrl: "/cgi-bin/koha/circ/transferstoreceive.pl",
                anchorSelector: "",
                anchorHref: "/cgi-bin/koha/circ/transferstoreceive.pl",
                anchorName: "Transferts à recevoir",
                position: "after",
                textFr: "Transferts à recevoir",
                textEn: "Transfers to receive",
                showIcon: true,
                iconClass: "fa-solid fa-truck",
                styleMode: "auto",
                sampledStyle: null,
                sampledClasses: [],
                sampledParentClasses: []
            },
            {
                id: "legacy-052-send-report",
                enabled: true,
                name: "Transferts à envoyer → rapport 4344",
                action: "replace-url",
                allPages: false,
                pages: "/cgi-bin/koha/circ/circulation-home.pl\n/cgi-bin/koha/circ/circulation.pl",
                targetSelector: "",
                targetHref: "/cgi-bin/koha/circ/transfers_to_send.pl",
                targetName: "Transferts à envoyer",
                destinationKind: "report",
                reportId: "4344",
                destinationUrl: "",
                anchorSelector: "",
                anchorHref: "",
                anchorName: "",
                position: "after",
                textFr: "",
                textEn: "",
                showIcon: false,
                iconClass: "",
                styleMode: "auto",
                sampledStyle: null,
                sampledClasses: [],
                sampledParentClasses: []
            },
            {
                id: "legacy-052-send-native",
                enabled: true,
                name: "Accès Koha natif — Transferts à envoyer",
                action: "add",
                allPages: false,
                pages: "/cgi-bin/koha/circ/circulation-home.pl",
                targetSelector: "",
                targetHref: "",
                targetName: "",
                destinationKind: "url",
                reportId: "",
                destinationUrl: "/cgi-bin/koha/circ/transfers_to_send.pl",
                anchorSelector: "",
                anchorHref: "/cgi-bin/koha/circ/transfers_to_send.pl",
                anchorName: "Transferts à envoyer",
                position: "after",
                textFr: "Transferts à envoyer",
                textEn: "Transfers to send",
                showIcon: true,
                iconClass: "fa-solid fa-truck-ramp-box",
                styleMode: "auto",
                sampledStyle: null,
                sampledClasses: [],
                sampledParentClasses: []
            },
            {
                id: "legacy-076-holdsqueue-report",
                enabled: true,
                name: "File de réservations → rapport 4904",
                action: "replace-url",
                allPages: true,
                pages: "/cgi-bin/koha/circ/view_holdsqueue.pl",
                targetSelector: "",
                targetHref: "/cgi-bin/koha/circ/view_holdsqueue.pl",
                targetName: "File de réservations",
                destinationKind: "report",
                reportId: "4904",
                destinationUrl: "",
                anchorSelector: "",
                anchorHref: "",
                anchorName: "",
                position: "after",
                textFr: "",
                textEn: "",
                showIcon: false,
                iconClass: "",
                styleMode: "auto",
                sampledStyle: null,
                sampledClasses: [],
                sampledParentClasses: []
            }
        ]
    };

    let currentConfig = clone(DEFAULT_CONFIG);
    let unsubscribe = null;
    let observer = null;
    let applyTimer = null;
    let registered = false;
    let coreWaitTimer = null;

    function clone(value) {
        try {
            if (typeof structuredClone === "function") return structuredClone(value);
        } catch (_) {}
        return JSON.parse(JSON.stringify(value));
    }

    function clean(value) {
        return String(value == null ? "" : value).trim();
    }

    function language() {
        const api = window.PMKConfig;
        if (api && typeof api.getLanguage === "function") {
            try {
                const value = clean(api.getLanguage()).toLowerCase();
                if (value.startsWith("en")) return "en";
                if (value.startsWith("fr")) return "fr";
            } catch (_) {}
        }
        const html = clean(document.documentElement.getAttribute("lang")).toLowerCase();
        return html.startsWith("en") ? "en" : "fr";
    }

    function t(fr, en) {
        return language() === "en" ? en : fr;
    }

    function uniqueId(prefix) {
        return String(prefix || "rule") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
    }

    function parsePages(value) {
        const raw = Array.isArray(value) ? value.join("\n") : String(value || "");
        const seen = new Set();
        return raw.split(/[\n,;]+/).map(function (entry) {
            return clean(entry);
        }).filter(function (entry) {
            if (!entry || seen.has(entry)) return false;
            seen.add(entry);
            return true;
        });
    }

    function pageMatchesPattern(path, pattern) {
        const p = clean(pattern);
        if (!p) return false;
        if (p === "*" || p.toLowerCase() === "all") return true;
        if (p.endsWith("*")) return path.startsWith(p.slice(0, -1));
        return path === p;
    }

    function ruleAppliesHere(rule) {
        if (rule && rule.allPages === true) return true;
        const pages = parsePages(rule && rule.pages);
        if (!pages.length) return false;
        return pages.some(function (pattern) {
            return pageMatchesPattern(window.location.pathname, pattern);
        });
    }

    function firstConcretePage(rule) {
        const pages = parsePages(rule && rule.pages);
        const page = pages.find(function (value) {
            return value && value !== "*" && value.toLowerCase() !== "all";
        });
        if (!page) return window.location.pathname + window.location.search;
        if (page.startsWith("/")) return page;
        return "/cgi-bin/koha/" + page.replace(/^\/+/, "");
    }

    function normalizeDestinationForStorage(href) {
        const raw = clean(href);
        if (!raw) return "";
        try {
            const url = new URL(raw, window.location.origin);
            if (url.origin === window.location.origin) {
                return url.pathname + url.search + url.hash;
            }
            return url.href;
        } catch (_) {
            return raw;
        }
    }

    function normalizeRule(rule) {
        const value = rule && typeof rule === "object" ? Object.assign({}, rule) : {};
        value.id = clean(value.id) || uniqueId("nav");
        value.enabled = value.enabled !== false;
        value.name = clean(value.name);
        value.action = value.action === "replace-url" ? "replace-url" : "add";
        value.pages = Array.isArray(value.pages) ? value.pages.join("\n") : String(value.pages || window.location.pathname || "");
        const normalizedPages = parsePages(value.pages);
        value.allPages = value.allPages === true || normalizedPages.some(function (page) {
            return page === "*" || page.toLowerCase() === "all";
        });
        if (value.allPages === true) {
            const concretePages = normalizedPages.filter(function (page) {
                return page !== "*" && page.toLowerCase() !== "all";
            });
            /*
             * La liste des pages reste mémorisée pour pouvoir revenir ensuite
             * à une portée limitée. Si l'ancienne configuration ne contenait
             * que "*", on conserve la page courante comme page de référence.
             */
            value.pages = concretePages.length ? concretePages.join("\n") : window.location.pathname;
        }
        value.targetSelector = clean(value.targetSelector);
        value.targetHref = clean(value.targetHref);
        value.targetName = clean(value.targetName);
        value.destinationKind = value.destinationKind === "report" ? "report" : "url";
        value.reportId = clean(value.reportId);
        value.destinationUrl = clean(value.destinationUrl);
        value.anchorSelector = clean(value.anchorSelector);
        value.anchorHref = clean(value.anchorHref);
        value.anchorName = clean(value.anchorName);
        value.position = ["before", "after", "inside-start", "inside-end"].includes(value.position)
            ? value.position
            : "after";
        value.textFr = String(value.textFr || "");
        value.textEn = String(value.textEn || "");
        value.showIcon = value.showIcon === true;
        value.iconClass = clean(value.iconClass);
        value.styleMode = value.styleMode === "sample" ? "sample" : "auto";
        value.sampledStyle = value.sampledStyle && typeof value.sampledStyle === "object"
            ? Object.assign({}, value.sampledStyle)
            : null;
        value.sampledClasses = Array.isArray(value.sampledClasses) ? value.sampledClasses.map(clean).filter(Boolean) : [];
        value.sampledParentClasses = Array.isArray(value.sampledParentClasses) ? value.sampledParentClasses.map(clean).filter(Boolean) : [];
        return value;
    }

    function normalizeConfig(config) {
        const src = config && typeof config === "object" ? config : {};
        return {
            enabled: src.enabled !== false,
            rules: Array.isArray(src.rules)
                ? src.rules.map(normalizeRule)
                : clone(DEFAULT_CONFIG.rules).map(normalizeRule)
        };
    }

    function ruleIndex(path) {
        const list = Array.isArray(path) ? path : [];
        for (let i = 0; i < list.length - 1; i += 1) {
            if (list[i] === "rules" && Number.isInteger(list[i + 1])) return list[i + 1];
        }
        return -1;
    }

    function ruleFromPath(root, path) {
        const index = ruleIndex(path);
        return root && Array.isArray(root.rules) && index >= 0 ? root.rules[index] : null;
    }

    function newRule() {
        return normalizeRule({
            id: uniqueId("nav"),
            enabled: true,
            name: "",
            action: "add",
            allPages: false,
            pages: window.location.pathname,
            targetSelector: "",
            targetHref: "",
            targetName: "",
            destinationKind: "url",
            reportId: "",
            destinationUrl: "",
            anchorSelector: "",
            anchorHref: "",
            anchorName: "",
            position: "after",
            textFr: "",
            textEn: "",
            showIcon: false,
            iconClass: "",
            styleMode: "auto",
            sampledStyle: null,
            sampledClasses: [],
            sampledParentClasses: []
        });
    }

    function destinationForRule(rule) {
        if (!rule) return "";
        if (rule.destinationKind === "report") {
            const id = clean(rule.reportId);
            if (!/^\d+$/.test(id)) return "";
            return "/cgi-bin/koha/reports/guided_reports.pl?id=" + encodeURIComponent(id) + "&op=run";
        }
        return clean(rule.destinationUrl);
    }

    function safeQueryAll(selector) {
        const value = clean(selector);
        if (!value) return [];
        try {
            return Array.from(document.querySelectorAll(value));
        } catch (_) {
            return [];
        }
    }

    function sameHrefIdentity(actualHref, identity) {
        const actual = clean(actualHref);
        const wanted = clean(identity);
        if (!actual || !wanted) return false;
        try {
            const actualUrl = new URL(actual, window.location.origin);
            const wantedUrl = new URL(wanted, window.location.origin);

            if (wantedUrl.origin !== window.location.origin) {
                return actualUrl.href === wantedUrl.href;
            }
            if (wantedUrl.search || wantedUrl.hash) {
                return actualUrl.pathname + actualUrl.search + actualUrl.hash ===
                    wantedUrl.pathname + wantedUrl.search + wantedUrl.hash;
            }
            return actualUrl.pathname === wantedUrl.pathname;
        } catch (_) {
            return actual === wanted || actual.indexOf(wanted) !== -1;
        }
    }

    function elementsByHref(identity) {
        if (!clean(identity)) return [];
        return Array.from(document.querySelectorAll("a[href]")).filter(function (link) {
            if (link.hasAttribute(GENERATED_ATTR)) return false;
            return sameHrefIdentity(link.getAttribute("href"), identity);
        });
    }

    function resolveRuleElements(rule, selectorKey, hrefKey) {
        /*
         * 3.1.1 — le sélecteur choisi par le picker est l'identité principale.
         * L'URL (href) n'est qu'un secours si ce sélecteur ne retrouve plus
         * aucun élément. On ne cumule surtout pas les deux résultats : une
         * même URL Koha peut exister à plusieurs endroits de la page
         * (menu « Plus », gros liens de l'accueil, barre latérale, etc.).
         * Le cumul provoquait alors plusieurs insertions d'une même règle.
         */
        const selector = clean(rule && rule[selectorKey]);
        const bySelector = safeQueryAll(selector).filter(function (node) {
            return node && !node.hasAttribute(GENERATED_ATTR);
        });

        if (bySelector.length) {
            return Array.from(new Set(bySelector));
        }

        return elementsByHref(rule && rule[hrefKey]);
    }

    function restoreRuntime() {
        document.querySelectorAll("[" + GENERATED_ATTR + "=\"1\"]").forEach(function (node) {
            try { node.remove(); } catch (_) {}
        });

        document.querySelectorAll("[" + ORIGINAL_HREF_ATTR + "]").forEach(function (node) {
            try {
                const original = node.getAttribute(ORIGINAL_HREF_ATTR);
                if (original == null || original === "") node.removeAttribute("href");
                else node.setAttribute("href", original);
                node.removeAttribute(ORIGINAL_HREF_ATTR);
                node.removeAttribute(RULE_ATTR);
            } catch (_) {}
        });
    }

    function copyClassNames(element) {
        return Array.from(element && element.classList || []).filter(function (name) {
            return clean(name) !== "";
        });
    }

    function safeVisualClasses(classes) {
        const allowed = [];
        (classes || []).forEach(function (name) {
            const cls = clean(name);
            if (!cls) return;
            if (/^(pmk|active$|selected$|current$|disabled$|show$|open$|collapsed$|is-)/i.test(cls)) return;
            if (/^(transfers?-to-|holds-|recalls-|bookings-|curbside$|article-request$|overdues-|transfer$)/i.test(cls)) return;
            if (
                /^(circ-button|nav-link|dropdown-item|list-group-item|btn(?:-.+)?|link-.+|text-.+|fw-.+|small$|d-.+|align-.+|justify-.+|gap-.+)$/i.test(cls)
            ) {
                allowed.push(cls);
            }
        });
        return Array.from(new Set(allowed));
    }

    function clickableFrom(node) {
        if (!node || node.nodeType !== 1) return null;
        if (node.matches("a,button,[role='menuitem']")) return node;
        return node.querySelector("a,button,[role='menuitem']") || node;
    }

    function structuralUnitFor(anchor) {
        if (!anchor || anchor.nodeType !== 1) return null;
        const li = anchor.closest("li");
        return li || anchor;
    }

    function setClasses(element, classes) {
        (classes || []).forEach(function (name) {
            try { element.classList.add(name); } catch (_) {}
        });
    }

    function rgbaIsTransparent(value) {
        const v = clean(value).toLowerCase();
        return !v || v === "transparent" || /rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(v);
    }

    function applySampledStyle(link, rule) {
        if (!link || !rule || rule.styleMode !== "sample" || !rule.sampledStyle) return;
        const s = rule.sampledStyle;
        const properties = [
            "fontSize", "fontWeight", "fontStyle",
            "textDecoration", "textDecorationLine", "textDecorationStyle", "textDecorationColor",
            "borderRadius", "borderColor", "borderWidth", "borderStyle",
            "boxShadow", "lineHeight", "letterSpacing", "textTransform", "opacity"
        ];
        properties.forEach(function (prop) {
            if (clean(s[prop])) {
                try { link.style[prop] = s[prop]; } catch (_) {}
            }
        });

        if (s.copyColor === true && clean(s.color)) link.style.color = s.color;
        if (s.copyBackground === true && clean(s.backgroundColor) && !rgbaIsTransparent(s.backgroundColor)) {
            link.style.backgroundColor = s.backgroundColor;
        }
    }

    function effectiveText(rule) {
        if (!rule) return "";
        const fr = clean(rule.textFr);
        const en = clean(rule.textEn);
        return language() === "en" ? (en || fr) : (fr || en);
    }

    function buildLinkContent(link, rule) {
        while (link.firstChild) link.removeChild(link.firstChild);

        if (rule.showIcon === true && clean(rule.iconClass)) {
            const icon = document.createElement("i");
            icon.className = clean(rule.iconClass);
            icon.setAttribute("aria-hidden", "true");
            link.appendChild(icon);
            link.appendChild(document.createTextNode(" "));
        }

        const span = document.createElement("span");
        span.textContent = effectiveText(rule) || rule.name || t("Nouvel élément", "New item");
        link.appendChild(span);
    }

    function createGeneratedLink(rule, anchor) {
        const sourceClickable = clickableFrom(anchor);
        const link = document.createElement("a");
        link.setAttribute(GENERATED_ATTR, "1");
        link.setAttribute(RULE_ATTR, rule.id);
        link.href = destinationForRule(rule);

        const classSource = rule.styleMode === "sample" && rule.sampledClasses.length
            ? rule.sampledClasses
            : safeVisualClasses(copyClassNames(sourceClickable));
        setClasses(link, classSource);

        buildLinkContent(link, rule);
        applySampledStyle(link, rule);
        return link;
    }

    function createWrapperForLink(rule, anchor, link) {
        const unit = structuralUnitFor(anchor);
        if (unit && unit.tagName && unit.tagName.toLowerCase() === "li") {
            const li = document.createElement("li");
            li.setAttribute(GENERATED_ATTR, "1");
            li.setAttribute(RULE_ATTR, rule.id);

            const parentClasses = rule.styleMode === "sample" && rule.sampledParentClasses.length
                ? rule.sampledParentClasses
                : safeVisualClasses(copyClassNames(unit));
            setClasses(li, parentClasses);
            li.appendChild(link);
            return li;
        }
        return link;
    }

    function insertGenerated(rule, anchor) {
        const destination = destinationForRule(rule);
        if (!destination || !anchor || !anchor.isConnected) return false;

        const link = createGeneratedLink(rule, anchor);
        const wrapper = createWrapperForLink(rule, anchor, link);
        const unit = structuralUnitFor(anchor);

        if (rule.position === "before") {
            if (!unit || !unit.parentNode) return false;
            unit.parentNode.insertBefore(wrapper, unit);
            return true;
        }

        if (rule.position === "after") {
            if (!unit || !unit.parentNode) return false;
            unit.parentNode.insertBefore(wrapper, unit.nextSibling);
            return true;
        }

        const target = anchor.matches && anchor.matches("ul,ol")
            ? anchor
            : (anchor.closest && anchor.closest("ul,ol")) || anchor;

        if (!target || !target.appendChild) return false;

        let insideNode = wrapper;
        if ((target.tagName || "").toLowerCase() !== "ul" && (target.tagName || "").toLowerCase() !== "ol") {
            insideNode = link;
        }

        if (rule.position === "inside-start") {
            target.insertBefore(insideNode, target.firstChild);
        } else {
            target.appendChild(insideNode);
        }
        return true;
    }

    function applyAddRule(rule) {
        const anchors = resolveRuleElements(rule, "anchorSelector", "anchorHref");
        if (!anchors.length) return;
        anchors.forEach(function (anchor) {
            try { insertGenerated(rule, anchor); } catch (_) {}
        });
    }

    function applyReplaceRule(rule) {
        const destination = destinationForRule(rule);
        if (!destination) return;

        const targets = resolveRuleElements(rule, "targetSelector", "targetHref");
        targets.forEach(function (target) {
            const link = target.matches && target.matches("a[href]") ? target : (target.querySelector && target.querySelector("a[href]"));
            if (!link || link.hasAttribute(GENERATED_ATTR)) return;
            try {
                if (!link.hasAttribute(ORIGINAL_HREF_ATTR)) {
                    link.setAttribute(ORIGINAL_HREF_ATTR, link.getAttribute("href") || "");
                }
                link.setAttribute("href", destination);
                link.setAttribute(RULE_ATTR, rule.id);
            } catch (_) {}
        });
    }

    function applyConfig(config) {
        currentConfig = normalizeConfig(config || DEFAULT_CONFIG);
        restoreRuntime();

        if (currentConfig.enabled === false) return;

        const active = currentConfig.rules.filter(function (rule) {
            return rule && rule.enabled !== false && ruleAppliesHere(rule);
        });

        /*
         * Les ajouts passent AVANT les redirections.
         * Ainsi une règle historique 052 peut se positionner par rapport au
         * lien Koha natif avant que son href soit remplacé par le rapport.
         */
        active.filter(function (rule) { return rule.action === "add"; }).forEach(applyAddRule);
        active.filter(function (rule) { return rule.action === "replace-url"; }).forEach(applyReplaceRule);
    }

    function mutationIsOnlyOurs(mutation) {
        if (!mutation || mutation.type !== "childList") return false;
        const nodes = Array.from(mutation.addedNodes || []).concat(Array.from(mutation.removedNodes || []));
        if (!nodes.length) return false;
        return nodes.every(function (node) {
            if (!node || node.nodeType !== 1) return true;
            if (node.hasAttribute && node.hasAttribute(GENERATED_ATTR)) return true;
            if (node.querySelector && node.querySelector("[" + GENERATED_ATTR + "=\"1\"]")) return true;
            return false;
        });
    }

    function scheduleApply() {
        if (applyTimer) window.clearTimeout(applyTimer);
        applyTimer = window.setTimeout(function () {
            applyTimer = null;
            applyConfig(currentConfig);
            mountContextAccess();
        }, 80);
    }

    function startObserver() {
        if (observer || !document.body) return;
        observer = new MutationObserver(function (mutations) {
            if (mutations.length && mutations.every(mutationIsOnlyOurs)) return;
            scheduleApply();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function pickerService() {
        return window.PMKConfig && window.PMKConfig.elementPicker;
    }

    function pickerBanner(mode) {
        if (mode === "destination") {
            return t(
                "Clique sur le lien ou le bouton dont tu veux reprendre la destination — Échap annule",
                "Click the link or button whose destination you want to reuse — Esc cancels"
            );
        }
        if (mode === "anchor") {
            return t(
                "Clique sur l'élément de navigation qui servira de repère pour le nouvel élément — Échap annule",
                "Click the navigation item that will be used as the insertion reference — Esc cancels"
            );
        }
        return t(
            "Clique sur l'élément de navigation à modifier — Échap annule",
            "Click the navigation item to modify — Esc cancels"
        );
    }

    function pickForConfig(context, mode) {
        const service = pickerService();
        if (!service || typeof service.pickForConfig !== "function") {
            return Promise.reject(new Error("pmk_common_picker_unavailable"));
        }

        registerPickerAdapter();

        const root = context && context.rootObject ? context.rootObject : {};
        const path = context && Array.isArray(context.fieldPath) ? context.fieldPath.slice() : [];
        const index = ruleIndex(path);
        const rule = root && Array.isArray(root.rules) && index >= 0 ? root.rules[index] : null;

        return service.pickForConfig({
            moduleId: MODULE_ID,
            targetUrl: firstConcretePage(rule || {}),
            rootObject: root,
            fieldPath: path,
            meta: {
                ruleIndex: index,
                pickMode: mode
            },
            adminContext: {
                sectionId: "rules",
                ruleIndex: index
            },
            options: {
                bannerText: pickerBanner(mode)
            },
            persistAfterPick: false
        });
    }

    function applyPickedCompanionData(root, path, result, mode) {
        const rule = ruleFromPath(root, path);
        if (!rule || !result) return;

        if (mode === "target") {
            rule.targetSelector = clean(result.selector || result.value);
            rule.targetHref = clean(result.href);
            rule.targetName = clean(result.targetName);
        } else if (mode === "anchor") {
            rule.anchorSelector = clean(result.selector || result.value);
            rule.anchorHref = clean(result.href);
            rule.anchorName = clean(result.targetName);
        } else if (mode === "destination") {
            const href = normalizeDestinationForStorage(result.href || result.value);
            if (href) {
                rule.destinationKind = "url";
                rule.destinationUrl = href;
            }
        }
    }

    function pickTarget(context) {
        return pickForConfig(context, "target");
    }

    function pickAnchor(context) {
        return pickForConfig(context, "anchor");
    }

    function pickDestination(context) {
        return pickForConfig(context, "destination");
    }

    function pickerResolveTarget(element, request) {
        const mode = request && request.meta && request.meta.pmkVisualEditorMode === "style-sample"
            ? "style-sample"
            : clean(request && request.meta && request.meta.pickMode);

        if (!element || element.nodeType !== 1) return null;

        if (mode === "destination") {
            return element.closest && element.closest("a[href]") || null;
        }

        if (mode === "style-sample") {
            return (element.closest && element.closest("a,button,[role='menuitem']")) || element;
        }

        return (element.closest && element.closest("a[href],button,[role='menuitem'],li")) || element;
    }

    function captureStyle(element) {
        const editor = window.PMKConfig && window.PMKConfig.visualEditor;
        if (editor && typeof editor.captureStyle === "function") {
            try { return editor.captureStyle(element); } catch (_) {}
        }
        if (!element || !window.getComputedStyle) return null;
        const cs = window.getComputedStyle(element);
        return {
            fontSize: cs.fontSize || "",
            color: cs.color || "",
            backgroundColor: cs.backgroundColor || "",
            fontWeight: cs.fontWeight || "",
            fontStyle: cs.fontStyle || "",
            textDecoration: cs.textDecoration || "",
            textDecorationLine: cs.textDecorationLine || "",
            textDecorationStyle: cs.textDecorationStyle || "",
            textDecorationColor: cs.textDecorationColor || "",
            borderRadius: cs.borderRadius || "",
            borderColor: cs.borderColor || "",
            borderWidth: cs.borderWidth || "",
            borderStyle: cs.borderStyle || "",
            boxShadow: cs.boxShadow || "",
            lineHeight: cs.lineHeight || "",
            letterSpacing: cs.letterSpacing || "",
            textTransform: cs.textTransform || "",
            opacity: cs.opacity || ""
        };
    }

    function pickerBuildResult(element, result, request) {
        const mode = request && request.meta && request.meta.pmkVisualEditorMode === "style-sample"
            ? "style-sample"
            : clean(request && request.meta && request.meta.pickMode);

        const clickable = clickableFrom(element);
        let href = clickable && clickable.getAttribute ? clean(clickable.getAttribute("href")) : "";

        /*
         * Si l'élément est déjà redirigé par ce module, un pick de cible ou
         * d'emplacement doit mémoriser l'identité Koha d'origine, pas l'URL
         * temporairement remplacée. Le pick « destination », lui, conserve
         * volontairement la destination actuellement visible.
         */
        if (
            mode !== "destination" &&
            clickable &&
            clickable.hasAttribute &&
            clickable.hasAttribute(ORIGINAL_HREF_ATTR)
        ) {
            href = clean(clickable.getAttribute(ORIGINAL_HREF_ATTR));
        }

        result.href = normalizeDestinationForStorage(href);

        if (mode === "destination") {
            result.value = result.href;
        }

        if (mode === "style-sample") {
            const parent = structuralUnitFor(clickable);
            result.sampledClasses = safeVisualClasses(copyClassNames(clickable));
            result.sampledParentClasses = safeVisualClasses(copyClassNames(parent));
            result.parentStyleSample = parent ? captureStyle(parent) : null;
        }

        return result;
    }

    function pickerApplyPending(draft, pending, picked) {
        const index = pending && pending.meta ? Number(pending.meta.ruleIndex) : -1;
        if (!draft || !Array.isArray(draft.rules) || !Number.isInteger(index) || index < 0 || !draft.rules[index]) {
            return draft;
        }
        const mode = clean(pending.meta && pending.meta.pickMode);
        const path = ["rules", index, mode === "anchor" ? "anchorSelector" : mode === "destination" ? "destinationUrl" : "targetSelector"];
        applyPickedCompanionData(draft, path, picked, mode);
        return draft;
    }

    function registerPickerAdapter() {
        const service = pickerService();
        if (!service || typeof service.register !== "function") return false;

        service.register(MODULE_ID, {
            resolveTarget: pickerResolveTarget,
            buildResult: pickerBuildResult,
            applyPending: pickerApplyPending
        });
        return true;
    }

    function sampledStyleForRule(sample, picked) {
        const style = sample && typeof sample === "object" ? Object.assign({}, sample) : {};
        const parent = picked && picked.parentStyleSample && typeof picked.parentStyleSample === "object"
            ? picked.parentStyleSample
            : null;

        /*
         * Les couleurs de menu sont souvent gérées par :hover / :focus.
         * On ne les fige en inline que si elles diffèrent réellement du parent.
         */
        style.copyColor = Boolean(parent && clean(style.color) && clean(style.color) !== clean(parent.color));
        style.copyBackground = Boolean(
            parent &&
            clean(style.backgroundColor) &&
            !rgbaIsTransparent(style.backgroundColor) &&
            clean(style.backgroundColor) !== clean(parent.backgroundColor)
        );
        return style;
    }

    function registerVisualEditorAdapter() {
        const editor = window.PMKConfig && window.PMKConfig.visualEditor;
        if (!editor || typeof editor.register !== "function") return false;

        editor.register(MODULE_ID, {
            capabilities: {
                inlinePreview: true,
                styleEyedropper: true,
                livePreview: true
            },

            styleTargetUrl: function (context) {
                const rule = ruleFromPath(context && context.rootObject, context && context.fieldPath);
                return firstConcretePage(rule || {});
            },

            previewModel: function (context) {
                const rule = ruleFromPath(context && context.rootObject, context && context.fieldPath) || {};
                const s = rule.styleMode === "sample" && rule.sampledStyle ? rule.sampledStyle : {};
                const previewStyle = {};

                [
                    "fontSize", "fontWeight", "fontStyle", "textDecoration",
                    "textDecorationLine", "textDecorationStyle", "borderRadius",
                    "borderColor", "borderWidth", "borderStyle", "boxShadow",
                    "lineHeight", "letterSpacing", "textTransform", "opacity"
                ].forEach(function (prop) {
                    if (clean(s[prop])) previewStyle[prop] = s[prop];
                });

                if (s.copyColor === true && clean(s.color)) previewStyle.color = s.color;
                if (s.copyBackground === true && clean(s.backgroundColor)) previewStyle.backgroundColor = s.backgroundColor;

                return {
                    text: effectiveText(rule) || rule.name || t("Nouvel élément de navigation", "New navigation item"),
                    style: previewStyle,
                    icon: rule.showIcon === true && clean(rule.iconClass)
                        ? {
                            type: "fa",
                            className: rule.iconClass,
                            size: 14,
                            color: clean(s.color) || ""
                        }
                        : null
                };
            },

            applyStyleSample: function (context) {
                const rule = ruleFromPath(context && context.rootObject, context && context.fieldPath);
                if (!rule) return { rootObject: context && context.rootObject };

                rule.styleMode = "sample";
                rule.sampledStyle = sampledStyleForRule(context && context.sample, context && context.picked);
                rule.sampledClasses = Array.isArray(context && context.picked && context.picked.sampledClasses)
                    ? context.picked.sampledClasses.slice()
                    : [];
                rule.sampledParentClasses = Array.isArray(context && context.picked && context.picked.sampledParentClasses)
                    ? context.picked.sampledParentClasses.slice()
                    : [];

                return { rootObject: context && context.rootObject };
            },

            canPreview: function () {
                return currentConfig && currentConfig.rules.some(function (rule) {
                    return rule && rule.enabled !== false && ruleAppliesHere(rule);
                });
            },

            previewDraft: function (draft) {
                const before = clone(currentConfig || DEFAULT_CONFIG);
                applyConfig(draft);
                return function () {
                    applyConfig(before);
                };
            }
        });

        return true;
    }

    function validate(config) {
        const cfg = normalizeConfig(config);
        for (let i = 0; i < cfg.rules.length; i += 1) {
            const rule = cfg.rules[i];
            if (!rule || rule.enabled === false) continue;

            if (rule.allPages !== true && !parsePages(rule.pages).length) {
                return { ok: false, message: t("La règle " + (i + 1) + " doit avoir au moins une page Koha ou être appliquée à toutes les pages.", "Rule " + (i + 1) + " must have at least one Koha page or be applied to every page.") };
            }

            if (rule.action === "replace-url") {
                if (!rule.targetSelector && !rule.targetHref) {
                    return { ok: false, message: t("La règle " + (i + 1) + " doit cibler un élément de navigation.", "Rule " + (i + 1) + " must target a navigation item.") };
                }
            } else {
                if (!rule.anchorSelector && !rule.anchorHref) {
                    return { ok: false, message: t("La règle " + (i + 1) + " doit définir un emplacement d'insertion.", "Rule " + (i + 1) + " must define an insertion location.") };
                }
                if (!clean(rule.textFr) && !clean(rule.textEn)) {
                    return { ok: false, message: t("La règle " + (i + 1) + " doit avoir un libellé français ou anglais.", "Rule " + (i + 1) + " must have a French or English label.") };
                }
                if (rule.showIcon === true && !clean(rule.iconClass)) {
                    return { ok: false, message: t("La règle " + (i + 1) + " affiche une icône mais sa classe Font Awesome est vide.", "Rule " + (i + 1) + " shows an icon but its Font Awesome class is empty.") };
                }
            }

            if (rule.destinationKind === "report") {
                if (!/^\d+$/.test(clean(rule.reportId))) {
                    return { ok: false, message: t("La règle " + (i + 1) + " doit indiquer un identifiant de rapport valide.", "Rule " + (i + 1) + " must provide a valid report ID.") };
                }
            } else if (!clean(rule.destinationUrl)) {
                return { ok: false, message: t("La règle " + (i + 1) + " doit indiquer une destination.", "Rule " + (i + 1) + " must provide a destination.") };
            }
        }

        return { ok: true };
    }

    function ruleTitle(item, index) {
        if (item && clean(item.name)) return item.name;
        if (item && item.action === "replace-url") {
            return t("Redirection ", "Redirect ") + (index + 1);
        }
        return t("Nouvel élément ", "New item ") + (index + 1);
    }

    function isAction(root, path, action) {
        const rule = ruleFromPath(root, path);
        return Boolean(rule && rule.action === action);
    }

    function isUrlDestination(root, path) {
        const rule = ruleFromPath(root, path);
        return Boolean(rule && rule.destinationKind === "url");
    }

    function isReportDestination(root, path) {
        const rule = ruleFromPath(root, path);
        return Boolean(rule && rule.destinationKind === "report");
    }

    function isSampleStyle(root, path) {
        const rule = ruleFromPath(root, path);
        return Boolean(rule && rule.styleMode === "sample");
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 2,
            name: { fr: "Navigation personnalisée", en: "Custom navigation" },
            description: {
                fr: "Ajoute des éléments dans la navigation Koha ou remplace uniquement l'URL cible d'un élément existant. Les emplacements, destinations et apparences peuvent être choisis directement sur les pages Koha. Chaque règle peut être limitée à certaines pages ou appliquée à toutes les pages.",
                en: "Adds items to Koha navigation or replaces only the target URL of an existing item. Locations, destinations and appearance can be picked directly from Koha pages. Each rule can be limited to selected pages or applied to every page."
            },
            category: { fr: "Interface / navigation", en: "Interface / navigation" },
            supportedPages: ["*"],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            normalize: normalizeConfig,
            validate: validate,
            schema: [
                {
                    type: "section",
                    id: "information",
                    label: { fr: "Fonctionnement", en: "How it works" },
                    description: {
                        fr: "Deux actions seulement : « Ajouter un élément » crée une nouvelle entrée de navigation ; « Remplacer l’URL cible » conserve l’élément Koha tel quel et ne change que sa destination. Le module ne copie jamais les événements, identifiants HTML ou comportements métier d’un élément prélevé.",
                        en: "Only two actions: “Add an item” creates a new navigation entry; “Replace target URL” keeps the Koha item unchanged and only changes its destination. The module never copies events, HTML IDs or business behaviour from a sampled element."
                    },
                    fields: [
                        { key: "enabled", type: "boolean", label: { fr: "Module actif", en: "Module enabled" } }
                    ]
                },
                {
                    type: "section",
                    id: "rules",
                    label: { fr: "Éléments de navigation", en: "Navigation items" },
                    description: {
                        fr: "Les cinq règles livrées reproduisent les comportements historiques des scripts 052 et 076. Elles peuvent être modifiées, désactivées, supprimées ou complétées.",
                        en: "The five default rules reproduce the historical behaviour of scripts 052 and 076. They can be edited, disabled, removed or extended."
                    },
                    fields: [
                        {
                            key: "rules",
                            type: "repeater",
                            label: { fr: "Règles configurées", en: "Configured rules" },
                            addLabel: { fr: "Ajouter un élément ou une redirection", en: "Add an item or redirect" },
                            reorder: true,
                            newItem: newRule,
                            liveTitleKey: "name",
                            itemTitle: ruleTitle,
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Règle active", en: "Rule enabled" } },
                                {
                                    key: "name",
                                    type: "text",
                                    label: { fr: "Nom de la règle", en: "Rule name" },
                                    placeholder: { fr: "Ex. Rapport des transferts à recevoir", en: "E.g. Transfers to receive report" }
                                },
                                {
                                    key: "action",
                                    type: "select",
                                    label: { fr: "Action", en: "Action" },
                                    options: [
                                        { value: "add", label: { fr: "Ajouter un élément de menu", en: "Add a menu item" } },
                                        { value: "replace-url", label: { fr: "Remplacer l’URL cible d’un élément existant", en: "Replace an existing item's target URL" } }
                                    ],
                                    refreshOnChange: true
                                },
                                {
                                    key: "allPages",
                                    type: "boolean",
                                    refreshOnChange: true,
                                    label: { fr: "Appliquer sur toutes les pages Koha", en: "Apply on every Koha page" },
                                    help: {
                                        fr: "La liste des pages reste mémorisée. Si vous décochez ensuite cette option, les pages sélectionnées réapparaissent.",
                                        en: "The page list remains stored. If you later disable this option, the selected pages reappear."
                                    }
                                },
                                {
                                    key: "pages",
                                    type: "textarea",
                                    rows: 2,
                                    label: { fr: "Pages Koha concernées", en: "Koha pages" },
                                    placeholder: { fr: "/cgi-bin/koha/circ/circulation-home.pl", en: "/cgi-bin/koha/circ/circulation-home.pl" },
                                    help: {
                                        fr: "Une page par ligne. Le premier chemin sert de page de référence aux outils de pick et à la pipette.",
                                        en: "One page per line. The first path is used as the picker and eyedropper reference page."
                                    },
                                    when: function (root, path) {
                                        const rule = ruleFromPath(root, path);
                                        return Boolean(rule && rule.allPages !== true);
                                    }
                                },

                                {
                                    key: "targetSelector",
                                    type: "elementPicker",
                                    label: { fr: "Élément de navigation à modifier", en: "Navigation item to modify" },
                                    pickLabel: { fr: "Choisir sur la page", en: "Choose on page" },
                                    emptyLabel: { fr: "Aucun élément choisi visuellement", en: "No item visually selected" },
                                    allowManual: true,
                                    pick: pickTarget,
                                    onPick: function (root, path, result) {
                                        applyPickedCompanionData(root, path, result, "target");
                                    },
                                    when: function (root, path) { return isAction(root, path, "replace-url"); },
                                    help: {
                                        fr: "Le moteur de pick commun mémorise un sélecteur stable et, si possible, l'URL Koha d'origine comme solution de repli.",
                                        en: "The shared picker stores a stable selector and, when possible, the original Koha URL as a fallback."
                                    }
                                },
                                {
                                    key: "targetName",
                                    type: "readonly",
                                    label: { fr: "Élément détecté", en: "Detected item" },
                                    when: function (root, path) { return isAction(root, path, "replace-url"); }
                                },

                                {
                                    key: "anchorSelector",
                                    type: "elementPicker",
                                    label: { fr: "Emplacement : élément de référence", en: "Location: reference item" },
                                    pickLabel: { fr: "Choisir l’emplacement sur la page", en: "Choose location on page" },
                                    emptyLabel: { fr: "Aucun emplacement choisi visuellement", en: "No location visually selected" },
                                    allowManual: true,
                                    pick: pickAnchor,
                                    onPick: function (root, path, result) {
                                        applyPickedCompanionData(root, path, result, "anchor");
                                    },
                                    when: function (root, path) { return isAction(root, path, "add"); },
                                    help: {
                                        fr: "Clique sur un élément du menu près duquel le nouvel élément doit être inséré.",
                                        en: "Click a menu item near where the new item should be inserted."
                                    }
                                },
                                {
                                    key: "anchorName",
                                    type: "readonly",
                                    label: { fr: "Repère détecté", en: "Detected reference" },
                                    when: function (root, path) { return isAction(root, path, "add"); }
                                },
                                {
                                    key: "position",
                                    type: "select",
                                    label: { fr: "Position par rapport au repère", en: "Position relative to reference" },
                                    options: [
                                        { value: "before", label: { fr: "Avant", en: "Before" } },
                                        { value: "after", label: { fr: "Après", en: "After" } },
                                        { value: "inside-start", label: { fr: "À l’intérieur, au début", en: "Inside, at start" } },
                                        { value: "inside-end", label: { fr: "À l’intérieur, à la fin", en: "Inside, at end" } }
                                    ],
                                    when: function (root, path) { return isAction(root, path, "add"); }
                                },
                                {
                                    key: "textFr",
                                    type: "text",
                                    label: { fr: "Libellé français", en: "French label" },
                                    when: function (root, path) { return isAction(root, path, "add"); }
                                },
                                {
                                    key: "textEn",
                                    type: "text",
                                    label: { fr: "Libellé anglais", en: "English label" },
                                    when: function (root, path) { return isAction(root, path, "add"); }
                                },
                                {
                                    key: "showIcon",
                                    type: "boolean",
                                    label: { fr: "Afficher une icône Font Awesome", en: "Show a Font Awesome icon" },
                                    refreshOnChange: true,
                                    when: function (root, path) { return isAction(root, path, "add"); }
                                },
                                {
                                    key: "iconClass",
                                    type: "text",
                                    label: { fr: "Classe de l’icône", en: "Icon class" },
                                    placeholder: { fr: "fa-solid fa-link", en: "fa-solid fa-link" },
                                    when: function (root, path) {
                                        const rule = ruleFromPath(root, path);
                                        return Boolean(rule && rule.action === "add" && rule.showIcon === true);
                                    }
                                },

                                {
                                    key: "styleMode",
                                    type: "select",
                                    label: { fr: "Apparence", en: "Appearance" },
                                    options: [
                                        { value: "auto", label: { fr: "S’intégrer automatiquement à la navigation cible", en: "Automatically match target navigation" } },
                                        { value: "sample", label: { fr: "Utiliser une apparence prélevée avec la pipette", en: "Use appearance sampled with eyedropper" } }
                                    ],
                                    refreshOnChange: true,
                                    when: function (root, path) { return isAction(root, path, "add"); },
                                    help: {
                                        fr: "Le mode automatique reprend les classes visuelles sûres de l’élément voisin. La pipette permet de prendre une autre référence visuelle.",
                                        en: "Automatic mode reuses safe visual classes from the neighbouring item. The eyedropper lets you choose another visual reference."
                                    }
                                },
                                {
                                    type: "visualPreview",
                                    label: { fr: "Aperçu du nouvel élément", en: "New item preview" },
                                    when: function (root, path) { return isAction(root, path, "add"); }
                                },
                                {
                                    type: "styleEyedropper",
                                    label: { fr: "Pipette d’apparence", en: "Appearance eyedropper" },
                                    buttonLabel: { fr: "Prélever l’apparence d’un élément…", en: "Sample an item's appearance…" },
                                    iconClass: "fa fa-eyedropper",
                                    sectionId: "rules",
                                    when: function (root, path) { return isAction(root, path, "add"); },
                                    help: {
                                        fr: "La pipette reprend uniquement les classes visuelles sûres et quelques propriétés d’apparence. Elle ne copie jamais l’ID, l’URL, les événements ou les comportements Koha.",
                                        en: "The eyedropper only reuses safe visual classes and selected appearance properties. It never copies IDs, URLs, events or Koha behaviour."
                                    }
                                },
                                {
                                    type: "custom",
                                    when: function (root, path) {
                                        return isAction(root, path, "add") && isSampleStyle(root, path);
                                    },
                                    render: function (context) {
                                        const note = document.createElement("div");
                                        note.className = "alert alert-light border py-2 px-3 mb-0";
                                        note.textContent = t(
                                            "Une apparence a été prélevée. Pour revenir au comportement natif du menu cible, choisis « S’intégrer automatiquement ».",
                                            "An appearance has been sampled. To return to the target menu's native behaviour, choose “Automatically match target navigation”."
                                        );
                                        return note;
                                    }
                                },

                                {
                                    key: "destinationKind",
                                    type: "select",
                                    label: { fr: "Type de destination", en: "Destination type" },
                                    options: [
                                        { value: "url", label: { fr: "Page Koha / URL", en: "Koha page / URL" } },
                                        { value: "report", label: { fr: "Rapport guidé Koha", en: "Koha guided report" } }
                                    ],
                                    refreshOnChange: true
                                },
                                {
                                    key: "reportId",
                                    type: "number",
                                    min: 1,
                                    step: 1,
                                    label: { fr: "Identifiant du rapport", en: "Report ID" },
                                    when: isReportDestination,
                                    help: {
                                        fr: "Indique uniquement le numéro du rapport. PimpMyKoha construit l’URL.",
                                        en: "Enter only the report number. PimpMyKoha builds the URL."
                                    }
                                },
                                {
                                    key: "destinationUrl",
                                    type: "text",
                                    label: { fr: "Destination", en: "Destination" },
                                    placeholder: { fr: "/cgi-bin/koha/… ou https://…", en: "/cgi-bin/koha/… or https://…" },
                                    when: isUrlDestination
                                },
                                {
                                    key: "destinationUrl",
                                    type: "elementPicker",
                                    label: { fr: "Ou choisir la destination sur la page", en: "Or choose destination on page" },
                                    pickLabel: { fr: "Choisir la destination sur la page", en: "Choose destination on page" },
                                    emptyLabel: { fr: "Aucune destination choisie", en: "No destination selected" },
                                    clearable: false,
                                    pick: pickDestination,
                                    onPick: function (root, path, result) {
                                        applyPickedCompanionData(root, path, result, "destination");
                                    },
                                    when: isUrlDestination,
                                    help: {
                                        fr: "Clique sur un lien Koha existant : seule sa destination est récupérée. Son texte, son style et son comportement ne sont pas copiés.",
                                        en: "Click an existing Koha link: only its destination is captured. Its text, style and behaviour are not copied."
                                    }
                                }
                            ]
                        }
                    ]
                }
            ]
        };
    }

    function mountContextAccess() {
        const api = window.PMKConfig;
        if (!api || typeof api.mountContextButton !== "function") return;

        let anchor = document.querySelector(".transfers h3");
        if (!anchor) anchor = document.querySelector(".circ-nav-menu h5");
        if (!anchor) {
            const candidate = document.querySelector('a[href*="/cgi-bin/koha/circ/view_holdsqueue.pl"], a[href*="/cgi-bin/koha/circ/transferstoreceive.pl"], a[href*="/cgi-bin/koha/circ/transfers_to_send.pl"]');
            if (candidate) anchor = candidate;
        }
        if (!anchor) return;

        try {
            api.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "append",
                contextKey: CONTEXT_KEY_PREFIX + window.location.pathname,
                context: {
                    sectionId: "rules",
                    pagePath: window.location.pathname
                }
            });
        } catch (_) {}
    }

    async function loadConfig() {
        const api = window.PMKConfig;
        if (!api || typeof api.getConfig !== "function") return clone(DEFAULT_CONFIG);
        try {
            const value = await api.getConfig(MODULE_ID);
            return normalizeConfig(value || DEFAULT_CONFIG);
        } catch (_) {
            return clone(DEFAULT_CONFIG);
        }
    }

    function registerModule() {
        const api = window.PMKConfig;
        if (!api || typeof api.registerModule !== "function") return false;

        registerPickerAdapter();
        registerVisualEditorAdapter();

        if (!registered) {
            api.registerModule(moduleDefinition());
            registered = true;
        }
        return true;
    }

    async function startWithCore() {
        if (!registerModule()) return false;

        const config = await loadConfig();
        applyConfig(config);
        startObserver();
        mountContextAccess();

        if (!unsubscribe && typeof window.PMKConfig.subscribe === "function") {
            unsubscribe = window.PMKConfig.subscribe(MODULE_ID, function (next) {
                applyConfig(next || DEFAULT_CONFIG);
                startObserver();
                mountContextAccess();
            });
        }
        return true;
    }

    function startWithoutCore() {
        applyConfig(DEFAULT_CONFIG);
        startObserver();

        let attempts = 0;
        if (coreWaitTimer) window.clearInterval(coreWaitTimer);
        coreWaitTimer = window.setInterval(function () {
            attempts += 1;
            if (window.PMKConfig && typeof window.PMKConfig.registerModule === "function") {
                window.clearInterval(coreWaitTimer);
                coreWaitTimer = null;
                startWithCore();
            } else if (attempts >= 100) {
                window.clearInterval(coreWaitTimer);
                coreWaitTimer = null;
            }
        }, 100);
    }

    function init() {
        if (window.PMKConfig && typeof window.PMKConfig.registerModule === "function") {
            startWithCore();
        } else {
            startWithoutCore();
        }

        /*
         * Repassages défensifs : certaines zones de navigation peuvent être
         * injectées après DOMContentLoaded par Koha ou par un autre module.
         */
        window.setTimeout(scheduleApply, 300);
        window.setTimeout(scheduleApply, 1200);
    }

    window.PMK052Navigation = {
        version: MODULE_VERSION,
        moduleId: MODULE_ID,
        defaults: clone(DEFAULT_CONFIG),
        normalizeConfig: normalizeConfig,
        applyConfig: applyConfig,
        restore: restoreRuntime,
        reapply: scheduleApply
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();

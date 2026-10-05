/* ============================================================
   PimpMyKoha - Pré-plugin
   Fichier : 001-modification-entete-issuehistory.js
   Version : 3.6.0-isolated

   Module PMK : table-labels
   Nom UI     : Libellés et éléments d'interface

   Évolution :
   - conserve le même MODULE_ID que l'ancien module "Libellés des tableaux" ;
   - migre automatiquement l'ancienne structure pages > tables > columns ;
   - utilise UNE SEULE liste de règles pour les tableaux et les autres éléments ;
   - permet de cibler n'importe quel élément Koha avec le picker commun PMK ;
   - permet de modifier texte, icône/image, apparence, lien ou visibilité ;
   - intègre les comportements historiques des scripts 040, 020 et 045 ;
   - absorbe les actions de visibilité du 020 (normal / masquer / afficher / désactiver) ;
   - délègue aperçu, pipette et prévisualisation live au moteur visuel commun du 000 ;
   - conserve le traitement robuste des colonnes de issuehistory.pl ;
   - aucune dépendance directe à Firestore dans la logique métier ;
   - aucun moteur de picker local : le picker commun de 000 est utilisé.
   - ajoute une gestion superlibrarian des éléments masqués : masqué, filigrane ou affichage forcé ;
   - ajoute un mode global de prévisualisation en filigrane pour les superlibrarians.
   - ajoute, pour chaque règle, une option « Appliquer sur toutes les pages » sans perdre la page de référence.
   ============================================================ */

(function () {
    "use strict";

    if (window.__PMK_001_UI_LABELS__) return;
    window.__PMK_001_UI_LABELS__ = true;

    const MODULE_ID = "table-labels";
    const SCHEMA_VERSION = 5;
    const ISSUEHISTORY_PATH = "/cgi-bin/koha/catalogue/issuehistory.pl";
    const ISSUEHISTORY_TABLE = "#table_issues";
    const MAINPAGE_PATH = "/cgi-bin/koha/mainpage.pl";
    const HOLDSQUEUE_PATH = "/cgi-bin/koha/circ/view_holdsqueue.pl";
    const REQUEST_PATH = "/cgi-bin/koha/reserve/request.pl";

    const KNOWN_ORDER_WITH_PATRON = [
        "patron",
        "barcode",
        "checked_out_from",
        "checked_out_by",
        "renewed",
        "checkout_on",
        "due_date",
        "checkin_on"
    ];

    const KNOWN_ORDER_WITHOUT_PATRON = [
        "barcode",
        "checked_out_from",
        "checked_out_by",
        "renewed",
        "checkout_on",
        "due_date",
        "checkin_on"
    ];

    const TRACKED_ELEMENTS = new Set();
    const ORIGINAL_STATE = new WeakMap();

    let currentConfig = null;
    let bootedWithCore = false;
    let runtimeStarted = false;
    let domObserver = null;
    let reapplyTimer = null;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function cleanText(value) {
        return String(value == null ? "" : value).trim();
    }

    function detectLanguage() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            return window.PMKConfig.getLanguage();
        }
        const lang = (document.documentElement.getAttribute("lang") || navigator.language || "").toLowerCase();
        return lang.startsWith("fr") ? "fr" : "en";
    }

    function i18n(fr, en) {
        return detectLanguage() === "fr" ? fr : en;
    }

    function makeId(prefix) {
        const p = cleanText(prefix) || "ui";
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return p + "-" + window.crypto.randomUUID();
        }
        return p + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    }

    function uniqueId(base, used) {
        let id = cleanText(base) || makeId("ui");
        if (!used.has(id)) {
            used.add(id);
            return id;
        }
        let n = 2;
        while (used.has(id + "-" + n)) n += 1;
        id = id + "-" + n;
        used.add(id);
        return id;
    }

    function issuehistorySelector(columnId) {
        return ISSUEHISTORY_TABLE + ' thead tr:first-child th[data-pmk-colname="' + columnId + '"]';
    }

    const RULE_TEMPLATE = {
        id: "",
        enabled: true,
        label: "",
        allPages: false,
        pagePath: "",
        selector: "",
        targetName: "",
        matchCount: null,

        changeText: false,
        textFr: "",
        textEn: "",
        customizeTextStyle: false,
        textSizePx: 14,
        textColor: "#212529",
        textHoverColor: "#000000",
        textBold: false,
        textItalic: false,
        textUnderline: false,
        textBackgroundColor: "",
        textBorderRadiusPx: 0,

        changeIcon: false,
        iconType: "fa",
        iconClass: "fa fa-fw fa-book",
        imageUrl: "",
        iconPosition: "before",
        iconSizePx: 16,
        iconColor: "#495057",
        iconHoverColor: "#212529",

        changeLink: false,
        href: "",
        openInNewTab: false,

        visibilityAction: "unchanged",
        visibilityScope: "self",
        superlibrarianHiddenMode: "inherit",
        hidden: false
    };

    const DEFAULT_CONFIG = {
        enabled: true,
        observeDom: true,
        observeDelay: 120,
        superlibrarianPreviewHidden: false,
        migrations: {
            /*
             * false dans les valeurs brutes : normalizeConfig() passe ce marqueur
             * à true dès que les deux presets historiques du 040 ont été contrôlés.
             * Une suppression volontaire ultérieure reste donc respectée.
             */
            script040Imported: false,
            script020Imported: false,
            script045Imported: false
        },
        rules: [
            {
                id: "issuehistory-due-date",
                enabled: true,
                label: "Historique notice — Retour prévu",
                pagePath: ISSUEHISTORY_PATH,
                selector: issuehistorySelector("due_date"),
                targetName: "Colonne due_date",
                matchCount: 1,
                changeText: true,
                textFr: "Retour prévu",
                textEn: "Expected return"
            },
            {
                id: "issuehistory-checkin-on",
                enabled: true,
                label: "Historique notice — Retour effectif",
                pagePath: ISSUEHISTORY_PATH,
                selector: issuehistorySelector("checkin_on"),
                targetName: "Colonne checkin_on",
                matchCount: 1,
                changeText: true,
                textFr: "Retour effectif",
                textEn: "Actual return"
            },
            {
                id: "mainpage-item-lists",
                enabled: true,
                label: "Accueil — Listes d'exemplaires",
                pagePath: MAINPAGE_PATH,
                selector: "a.icon_course_reserves",
                targetName: "Raccourci Réserves de cours",
                matchCount: 1,
                changeText: true,
                textFr: "Listes d'exemplaires",
                textEn: "Item lists",
                changeIcon: true,
                iconType: "fa",
                iconClass: "fa fa-fw fa-book",
                iconPosition: "before",
                iconSizePx: 16
            },
            {
                id: "mainpage-biblio-lists",
                enabled: true,
                label: "Accueil — Listes de notices",
                pagePath: MAINPAGE_PATH,
                selector: "a.icon_general.icon_lists",
                targetName: "Raccourci Listes",
                matchCount: 1,
                changeText: true,
                textFr: "Listes de notices",
                textEn: "Record lists",
                changeIcon: true,
                iconType: "fa",
                iconClass: "fa fa-fw fa-book",
                iconPosition: "before",
                iconSizePx: 16
            },
            {
                id: "legacy-020-hide-pendingreserves-on-holdsqueue",
                enabled: true,
                label: "File des réservations — Masquer « Réservations à traiter »",
                pagePath: HOLDSQUEUE_PATH,
                selector: '.circ-nav-menu a[href="/cgi-bin/koha/circ/pendingreserves.pl"]',
                targetName: "Réservations à traiter",
                matchCount: 1,
                visibilityAction: "hide",
                visibilityScope: "closest-li"
            },
            {
                id: "legacy-045-hide-holds-to-place-count",
                enabled: true,
                label: "Réservation — Masquer le nombre de réservations à placer",
                pagePath: REQUEST_PATH,
                selector: "#holds_to_place_count",
                targetName: "Nombre de réservations à placer",
                matchCount: 1,
                visibilityAction: "hide",
                visibilityScope: "closest-li"
            }
        ].map(function (rule) {
            return Object.assign({}, RULE_TEMPLATE, rule);
        })
    };

    function mergeRule(rule, index) {
        const merged = Object.assign({}, RULE_TEMPLATE, rule || {});
        merged.id = cleanText(merged.id) || makeId("ui-rule");
        merged.label = cleanText(merged.label) || (i18n("Personnalisation ", "Customization ") + ((index || 0) + 1));

        /*
         * allPages est indépendant de pagePath : la page de référence reste mémorisée
         * pour le picker et redevient immédiatement la restriction si l'option est décochée.
         * Compatibilité : une ancienne règle enregistrée avec pagePath="*" devient globale.
         */
        const hadExplicitAllPages = rule && Object.prototype.hasOwnProperty.call(rule, "allPages");
        const rawPagePath = cleanText(rule && rule.pagePath);
        merged.allPages = hadExplicitAllPages ? rule.allPages === true : rawPagePath === "*";
        merged.pagePath = rawPagePath && rawPagePath !== "*" ? rawPagePath : window.location.pathname;

        merged.selector = cleanText(merged.selector);
        merged.targetName = cleanText(merged.targetName);
        merged.textFr = String(merged.textFr == null ? "" : merged.textFr);
        merged.textEn = String(merged.textEn == null ? "" : merged.textEn);
        merged.iconClass = cleanText(merged.iconClass) || "fa fa-fw fa-book";
        merged.imageUrl = cleanText(merged.imageUrl);
        merged.href = String(merged.href == null ? "" : merged.href).trim();
        merged.iconPosition = merged.iconPosition === "after" ? "after" : "before";
        merged.iconType = ["fa", "image", "none"].includes(merged.iconType) ? merged.iconType : "fa";
        merged.textSizePx = Math.max(8, Math.min(72, Number(merged.textSizePx) || 14));
        merged.textBorderRadiusPx = Math.max(0, Math.min(48, Number(merged.textBorderRadiusPx) || 0));
        merged.iconSizePx = Math.max(8, Math.min(96, Number(merged.iconSizePx) || 16));

        const explicitVisibility = rule && Object.prototype.hasOwnProperty.call(rule, "visibilityAction")
            ? String(rule.visibilityAction || "")
            : "";
        merged.visibilityAction = ["unchanged", "hide", "show", "disable"].includes(explicitVisibility)
            ? explicitVisibility
            : (rule && rule.hidden === true ? "hide" : "unchanged");
        merged.visibilityScope = ["self", "closest-li", "closest-tr"].includes(String(merged.visibilityScope || ""))
            ? String(merged.visibilityScope)
            : "self";
        merged.superlibrarianHiddenMode = ["inherit", "hidden", "watermark", "visible"].includes(String(merged.superlibrarianHiddenMode || ""))
            ? String(merged.superlibrarianHiddenMode)
            : "inherit";
        merged.hidden = merged.visibilityAction === "hide";
        return merged;
    }

    function migrateLegacyPages(config) {
        if (!config || !Array.isArray(config.pages) || !config.pages.length) return null;

        const rules = [];
        const used = new Set();

        config.pages.forEach(function (page) {
            if (!page || !Array.isArray(page.tables)) return;
            page.tables.forEach(function (table) {
                if (!table || !Array.isArray(table.columns)) return;
                table.columns.forEach(function (column) {
                    if (!column || !column.id) return;
                    let selector = "";
                    if (cleanText(page.path) === ISSUEHISTORY_PATH && cleanText(table.selector) === ISSUEHISTORY_TABLE) {
                        selector = issuehistorySelector(column.id);
                    } else if (cleanText(table.selector)) {
                        selector = cleanText(table.selector) + ' [data-colname="' + String(column.id).replace(/"/g, '\\"') + '"]';
                    }

                    const baseId = cleanText(page.id) + "-" + cleanText(table.id) + "-" + cleanText(column.id);
                    rules.push(mergeRule({
                        id: uniqueId(baseId, used),
                        enabled: page.enabled !== false && table.enabled !== false && column.enabled !== false,
                        label: cleanText(page.labelFr) + " — " + cleanText(column.labelFr || column.id),
                        pagePath: cleanText(page.path) || ISSUEHISTORY_PATH,
                        selector: selector,
                        targetName: "Colonne " + column.id,
                        changeText: true,
                        textFr: column.labelFr || "",
                        textEn: column.labelEn || column.labelFr || ""
                    }, rules.length));
                });
            });
        });

        return rules;
    }

    function hasEquivalentRule(rules, candidate) {
        const list = Array.isArray(rules) ? rules : [];
        const candidateId = cleanText(candidate && candidate.id);
        const candidatePage = cleanText(candidate && candidate.pagePath);
        const candidateSelector = cleanText(candidate && candidate.selector);
        return list.some(function (rule) {
            if (!rule) return false;
            if (candidateId && cleanText(rule.id) === candidateId) return true;
            return Boolean(
                candidatePage && candidateSelector &&
                cleanText(rule.pagePath) === candidatePage &&
                cleanText(rule.selector) === candidateSelector
            );
        });
    }

    function rulesMatchDefaults(rules) {
        if (!Array.isArray(rules) || rules.length !== DEFAULT_CONFIG.rules.length) return false;
        try {
            return JSON.stringify(rules) === JSON.stringify(DEFAULT_CONFIG.rules);
        } catch (_) {
            return false;
        }
    }

    function normalizeConfig(config) {
        const source = config && typeof config === "object" ? config : {};
        const legacyRules = migrateLegacyPages(source);
        const suppliedRules = Array.isArray(source.rules) ? source.rules : null;

        let baseRules;
        /*
         * PMK fusionne les defaults AVANT normalize(). Sur un ancien document
         * pages > tables > columns, source.rules peut donc être la liste des
         * quatre defaults injectée par le merge. Dans ce cas on migre bien les
         * anciennes colonnes au lieu de les écraser par ces defaults.
         */
        if (legacyRules && (!suppliedRules || rulesMatchDefaults(suppliedRules))) {
            baseRules = legacyRules;
        } else if (suppliedRules) {
            baseRules = suppliedRules;
        } else {
            baseRules = clone(DEFAULT_CONFIG.rules);
        }

        const used = new Set();
        const rules = [];
        baseRules.forEach(function (rule, index) {
            const merged = mergeRule(rule, index);
            merged.id = uniqueId(merged.id, used);
            rules.push(merged);
        });

        const migrations = source.migrations && typeof source.migrations === "object"
            ? Object.assign({}, source.migrations)
            : {};

        /*
         * Migrations ciblées des anciens petits scripts désormais absorbés.
         * Chaque famille possède son propre marqueur afin qu'une suppression
         * volontaire d'une règle reste ensuite respectée.
         */
        if (migrations.script040Imported !== true) {
            DEFAULT_CONFIG.rules.filter(function (preset) {
                return preset.id === "mainpage-item-lists" || preset.id === "mainpage-biblio-lists";
            }).forEach(function (preset) {
                if (hasEquivalentRule(rules, preset)) return;
                const cloned = mergeRule(clone(preset), rules.length);
                cloned.id = uniqueId(cloned.id, used);
                rules.push(cloned);
            });
            migrations.script040Imported = true;
        }

        if (migrations.script020Imported !== true) {
            DEFAULT_CONFIG.rules.filter(function (preset) {
                return preset.id === "legacy-020-hide-pendingreserves-on-holdsqueue";
            }).forEach(function (preset) {
                if (hasEquivalentRule(rules, preset)) return;
                const cloned = mergeRule(clone(preset), rules.length);
                cloned.id = uniqueId(cloned.id, used);
                rules.push(cloned);
            });
            migrations.script020Imported = true;
        }

        if (migrations.script045Imported !== true) {
            DEFAULT_CONFIG.rules.filter(function (preset) {
                return preset.id === "legacy-045-hide-holds-to-place-count";
            }).forEach(function (preset) {
                if (hasEquivalentRule(rules, preset)) return;
                const cloned = mergeRule(clone(preset), rules.length);
                cloned.id = uniqueId(cloned.id, used);
                rules.push(cloned);
            });
            migrations.script045Imported = true;
        }

        return {
            enabled: source.enabled !== false,
            observeDom: source.observeDom !== false,
            observeDelay: Math.max(25, Math.min(2000, Number(source.observeDelay) || DEFAULT_CONFIG.observeDelay)),
            superlibrarianPreviewHidden: source.superlibrarianPreviewHidden === true,
            migrations: migrations,
            rules: rules
        };
    }

    function pageMatches(rule) {
        if (rule && rule.allPages === true) return true;
        const path = cleanText(rule && rule.pagePath);
        if (!path || path === "*") return true;
        return window.location.pathname === path;
    }

    function safeQueryAll(selector) {
        const s = cleanText(selector);
        if (!s) return [];
        try {
            return Array.from(document.querySelectorAll(s));
        } catch (_err) {
            return [];
        }
    }

    function selectorCount(selector) {
        return safeQueryAll(selector).length;
    }

    function mapIssuehistoryHeaders() {
        if (window.location.pathname !== ISSUEHISTORY_PATH) return;
        const table = document.querySelector(ISSUEHISTORY_TABLE);
        if (!table) return;
        const headers = Array.from(table.querySelectorAll("thead tr:first-child th"));
        if (!headers.length) return;

        headers.forEach(function (th) {
            const colname = th.getAttribute("data-colname");
            if (colname) th.setAttribute("data-pmk-colname", colname);
        });

        let order = null;
        if (headers.length === KNOWN_ORDER_WITH_PATRON.length) order = KNOWN_ORDER_WITH_PATRON;
        else if (headers.length === KNOWN_ORDER_WITHOUT_PATRON.length) order = KNOWN_ORDER_WITHOUT_PATRON;
        if (!order) return;

        headers.forEach(function (th, index) {
            if (!th.getAttribute("data-pmk-colname") && order[index]) {
                th.setAttribute("data-pmk-colname", order[index]);
            }
        });
    }

    function rememberState(element) {
        if (ORIGINAL_STATE.has(element)) return ORIGINAL_STATE.get(element);
        const state = {
            display: element.style.display,
            hidden: element.hidden,
            ariaHidden: element.getAttribute("aria-hidden"),
            ariaDisabled: element.getAttribute("aria-disabled"),
            tabindex: element.getAttribute("tabindex"),
            disabled: ("disabled" in element) ? Boolean(element.disabled) : null,
            opacity: element.style.opacity,
            cursor: element.style.cursor,
            pointerEvents: element.style.pointerEvents,
            color: element.style.color,
            fontSize: element.style.fontSize,
            fontWeight: element.style.fontWeight,
            fontStyle: element.style.fontStyle,
            textDecoration: element.style.textDecoration,
            backgroundColor: element.style.backgroundColor,
            borderRadius: element.style.borderRadius,
            hrefHad: element.hasAttribute("href"),
            href: element.getAttribute("href"),
            targetHad: element.hasAttribute("target"),
            target: element.getAttribute("target"),
            relHad: element.hasAttribute("rel"),
            rel: element.getAttribute("rel"),
            classes: [],
            textChanges: [],
            hiddenIcons: [],
            injected: []
        };
        ORIGINAL_STATE.set(element, state);
        TRACKED_ELEMENTS.add(element);
        return state;
    }

    function rememberClass(element, className, state) {
        if (!className || element.classList.contains(className)) return;
        element.classList.add(className);
        state.classes.push(className);
    }

    function restoreAll() {
        TRACKED_ELEMENTS.forEach(function (element) {
            const state = ORIGINAL_STATE.get(element);
            if (!state) return;

            state.injected.forEach(function (node) {
                if (node && node.parentNode) node.parentNode.removeChild(node);
            });

            state.hiddenIcons.forEach(function (entry) {
                if (entry && entry.node && entry.node.style) entry.node.style.display = entry.display;
            });

            state.textChanges.slice().reverse().forEach(function (entry) {
                if (!entry || !entry.node) return;
                if (entry.kind === "textNode" && entry.node.nodeType === Node.TEXT_NODE) {
                    entry.node.data = entry.value;
                } else if (entry.kind === "element" && entry.node.nodeType === Node.ELEMENT_NODE) {
                    entry.node.textContent = entry.value;
                }
            });

            state.classes.forEach(function (className) {
                if (element.classList) element.classList.remove(className);
            });

            element.style.display = state.display;
            element.hidden = Boolean(state.hidden);
            if (state.ariaHidden === null) element.removeAttribute("aria-hidden");
            else element.setAttribute("aria-hidden", state.ariaHidden);
            if (state.ariaDisabled === null) element.removeAttribute("aria-disabled");
            else element.setAttribute("aria-disabled", state.ariaDisabled);
            if (state.tabindex === null) element.removeAttribute("tabindex");
            else element.setAttribute("tabindex", state.tabindex);
            if (state.disabled !== null && "disabled" in element) element.disabled = state.disabled;
            element.style.opacity = state.opacity;
            element.style.cursor = state.cursor;
            element.style.pointerEvents = state.pointerEvents;
            element.style.color = state.color;
            element.style.fontSize = state.fontSize;
            element.style.fontWeight = state.fontWeight;
            element.style.fontStyle = state.fontStyle;
            element.style.textDecoration = state.textDecoration;
            element.style.backgroundColor = state.backgroundColor;
            element.style.borderRadius = state.borderRadius;

            if (state.hrefHad) element.setAttribute("href", state.href == null ? "" : state.href);
            else element.removeAttribute("href");

            if (state.targetHad) element.setAttribute("target", state.target == null ? "" : state.target);
            else element.removeAttribute("target");

            if (state.relHad) element.setAttribute("rel", state.rel == null ? "" : state.rel);
            else element.removeAttribute("rel");

            ORIGINAL_STATE.delete(element);
        });
        TRACKED_ELEMENTS.clear();
    }

    function textForRule(rule) {
        const lang = detectLanguage();
        if (lang === "fr") return String(rule.textFr || rule.textEn || "");
        return String(rule.textEn || rule.textFr || "");
    }

    function findSafeTextTarget(element) {
        const dtTitle = element.querySelector && element.querySelector(":scope > .dt-column-header .dt-column-title, :scope > .dt-column-title, .dt-column-title");
        if (dtTitle) return { kind: "element", node: dtTitle };

        const textNode = Array.from(element.childNodes || []).find(function (node) {
            return node.nodeType === Node.TEXT_NODE && cleanText(node.data);
        });
        if (textNode) return { kind: "textNode", node: textNode };

        const children = Array.from(element.children || []);
        const simple = children.find(function (child) {
            if (child.matches("i, img, svg, .fa, [data-pmk-ui-injected]")) return false;
            return child.children.length === 0 && cleanText(child.textContent);
        });
        if (simple) return { kind: "element", node: simple };

        return null;
    }

    function applyText(element, rule, state) {
        if (!rule.changeText) return;
        const value = textForRule(rule);
        const target = findSafeTextTarget(element);
        if (!target) return;

        if (target.kind === "textNode") {
            const original = target.node.data;
            state.textChanges.push({ kind: "textNode", node: target.node, value: original });
            const leading = (original.match(/^\s*/) || [""])[0];
            const trailing = (original.match(/\s*$/) || [""])[0];
            target.node.data = leading + value + trailing;
        } else {
            state.textChanges.push({ kind: "element", node: target.node, value: target.node.textContent });
            target.node.textContent = value;
        }
    }

    function existingVisuals(element) {
        return Array.from(element.children || []).filter(function (child) {
            return child.matches("i, img, svg, .fa, [class*='fa-']") && !child.hasAttribute("data-pmk-ui-injected");
        });
    }

    function normalizeFaClass(value) {
        const raw = cleanText(value) || "fa fa-fw fa-book";
        const classes = raw.split(/\s+/).filter(Boolean);
        const hasFamily = classes.some(function (name) {
            return ["fa", "fas", "far", "fal", "fad", "fab", "fa-solid", "fa-regular", "fa-brands"].includes(name);
        });
        if (!hasFamily) classes.unshift("fa");
        if (!classes.includes("fa-fw")) classes.splice(1, 0, "fa-fw");
        return classes.join(" ");
    }

    function applyIcon(element, rule, state, className) {
        if (!rule.changeIcon) return;

        existingVisuals(element).forEach(function (visual) {
            state.hiddenIcons.push({ node: visual, display: visual.style.display });
            visual.style.display = "none";
        });

        if (rule.iconType === "none") return;

        let visual;
        if (rule.iconType === "image") {
            visual = document.createElement("img");
            visual.src = rule.imageUrl;
            visual.alt = "";
            visual.setAttribute("aria-hidden", "true");
            visual.style.width = rule.iconSizePx + "px";
            visual.style.height = rule.iconSizePx + "px";
            visual.style.objectFit = "contain";
        } else {
            visual = document.createElement("i");
            visual.className = normalizeFaClass(rule.iconClass);
            visual.setAttribute("aria-hidden", "true");
            visual.style.fontSize = rule.iconSizePx + "px";
            visual.style.color = rule.iconColor || "";
        }

        visual.setAttribute("data-pmk-ui-injected", "1");
        visual.setAttribute("data-pmk-ui-icon-rule", className);
        visual.style.display = "inline-block";
        visual.style.verticalAlign = "middle";
        visual.style.transition = "color .15s ease, transform .15s ease, opacity .15s ease";

        if (rule.iconPosition === "after") {
            visual.style.marginLeft = ".35em";
            element.appendChild(visual);
        } else {
            visual.style.marginRight = ".35em";
            element.insertBefore(visual, element.firstChild);
        }
        state.injected.push(visual);
    }

    function cssSafeId(value) {
        return cleanText(value).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "rule";
    }

    function buildDynamicStyles(config) {
        const id = "pmk-table-labels-dynamic-style";
        let style = document.getElementById(id);
        if (!style) {
            style = document.createElement("style");
            style.id = id;
            document.head.appendChild(style);
        }

        const css = [
            ".pmk-hidden-superlibrarian-preview{outline:2px dashed rgba(108,117,125,.75)!important;outline-offset:2px!important;filter:grayscale(.2);}",
            ".pmk-hidden-superlibrarian-preview *{pointer-events:none!important;}"
        ];
        (config.rules || []).forEach(function (rule) {
            if (!rule || rule.enabled === false || !pageMatches(rule)) return;
            const className = "pmk-ui-rule-" + cssSafeId(rule.id);
            if (rule.customizeTextStyle && rule.textHoverColor) {
                css.push("." + className + ":hover{color:" + rule.textHoverColor + "!important;}");
            }
            if (rule.changeIcon && rule.iconType === "fa" && rule.iconHoverColor) {
                css.push("." + className + ":hover [data-pmk-ui-icon-rule=\"" + className + "\"]{color:" + rule.iconHoverColor + "!important;transform:scale(1.08);}");
            }
            if (rule.changeIcon && rule.iconType === "image") {
                css.push("." + className + ":hover [data-pmk-ui-icon-rule=\"" + className + "\"]{transform:scale(1.08);opacity:.88;}");
            }
        });
        style.textContent = css.join("\n");
    }

    function isSuperlibrarian() {
        if (window.PMKConfig && typeof window.PMKConfig.isKohaSuperlibrarian === "function") {
            try { return !!window.PMKConfig.isKohaSuperlibrarian(); } catch (_) {}
        }

        const user = document.querySelector(
            ".loggedinusername[data-is-superlibrarian], " +
            ".loggedinusername.is_superlibrarian, " +
            "#logged-in-info-full .loggedinusername[data-loggedinusername]"
        );
        if (!user) return false;
        if (user.classList.contains("is_superlibrarian")) return true;

        const raw = cleanText(
            user.getAttribute("data-is-superlibrarian") ||
            (user.dataset && user.dataset.isSuperlibrarian) ||
            ""
        );
        return /^(1|true|yes|superlibrarian|is_superlibrarian)$/i.test(raw);
    }

    function effectiveSuperlibrarianHiddenMode(rule) {
        if (!isSuperlibrarian()) return "hidden";

        const configured = String(rule && rule.superlibrarianHiddenMode || "inherit");
        if (configured === "hidden" || configured === "watermark" || configured === "visible") {
            return configured;
        }
        return currentConfig && currentConfig.superlibrarianPreviewHidden === true
            ? "watermark"
            : "hidden";
    }

    function resolveVisibilityTarget(element, rule) {
        if (!element) return null;
        const scope = String(rule && rule.visibilityScope || "self");
        if (scope === "closest-li" && element.closest) return element.closest("li") || element;
        if (scope === "closest-tr" && element.closest) return element.closest("tr") || element;
        return element;
    }

    function applyVisibility(element, rule) {
        const action = String(rule && rule.visibilityAction || (rule && rule.hidden ? "hide" : "unchanged"));
        if (action === "unchanged") return { hidden: false, target: element };
        const target = resolveVisibilityTarget(element, rule) || element;
        const state = rememberState(target);

        if (action === "hide") {
            const adminMode = effectiveSuperlibrarianHiddenMode(rule);

            if (adminMode === "visible") {
                target.hidden = false;
                target.removeAttribute("aria-hidden");
                target.style.removeProperty("display");
                return { hidden: false, target: target };
            }

            if (adminMode === "watermark") {
                target.hidden = false;
                target.removeAttribute("aria-hidden");
                target.style.removeProperty("display");
                rememberClass(target, "pmk-hidden-superlibrarian-preview", state);
                target.style.opacity = "0.32";
                target.style.pointerEvents = "none";
                return { hidden: false, target: target };
            }

            target.style.setProperty("display", "none", "important");
            target.hidden = true;
            target.setAttribute("aria-hidden", "true");
            return { hidden: true, target: target };
        }

        if (action === "show") {
            target.hidden = false;
            target.removeAttribute("aria-hidden");
            target.style.removeProperty("display");
            return { hidden: false, target: target };
        }

        if (action === "disable") {
            target.setAttribute("aria-disabled", "true");
            target.setAttribute("tabindex", "-1");
            if ("disabled" in target) target.disabled = true;
            target.style.opacity = "0.55";
            target.style.cursor = "not-allowed";
            if (!("disabled" in target)) target.style.pointerEvents = "none";
        }
        return { hidden: false, target: target };
    }

    function applyRuleToElement(element, rule) {
        const visibility = applyVisibility(element, rule);
        if (visibility.hidden) return;

        const state = rememberState(element);
        const className = "pmk-ui-rule-" + cssSafeId(rule.id);
        rememberClass(element, className, state);

        if (rule.customizeTextStyle) {
            element.style.fontSize = rule.textSizePx + "px";
            element.style.color = rule.textColor || "";
            element.style.fontWeight = rule.textBold ? "700" : "";
            element.style.fontStyle = rule.textItalic ? "italic" : "";
            element.style.textDecoration = rule.textUnderline ? "underline" : "";
            element.style.backgroundColor = rule.textBackgroundColor || "";
            element.style.borderRadius = rule.textBorderRadiusPx ? (rule.textBorderRadiusPx + "px") : "";
        }

        applyText(element, rule, state);
        applyIcon(element, rule, state, className);

        if (rule.changeLink && element.matches("a, area")) {
            element.setAttribute("href", rule.href || "#");
            if (rule.openInNewTab) {
                element.setAttribute("target", "_blank");
                element.setAttribute("rel", "noopener noreferrer");
            } else {
                element.removeAttribute("target");
                if (!state.relHad) element.removeAttribute("rel");
            }
        }
    }

    function disconnectObserver() {
        if (domObserver) domObserver.disconnect();
    }

    function connectObserver() {
        if (!currentConfig || currentConfig.enabled === false || currentConfig.observeDom === false) return;
        if (!document.body) return;
        if (!domObserver) {
            domObserver = new MutationObserver(function () {
                scheduleApply();
            });
        }
        domObserver.observe(document.body, { childList: true, subtree: true });
    }

    function applyConfig(config) {
        disconnectObserver();
        restoreAll();

        const normalized = normalizeConfig(config);
        currentConfig = normalized;
        mapIssuehistoryHeaders();
        buildDynamicStyles(normalized);

        if (normalized.enabled !== false) {
            normalized.rules.forEach(function (rule) {
                if (!rule || rule.enabled === false || !pageMatches(rule) || !rule.selector) return;
                safeQueryAll(rule.selector).forEach(function (element) {
                    applyRuleToElement(element, rule);
                });
            });
        }

        connectObserver();
    }

    function scheduleApply() {
        if (reapplyTimer) window.clearTimeout(reapplyTimer);
        reapplyTimer = window.setTimeout(function () {
            reapplyTimer = null;
            if (currentConfig) applyConfig(currentConfig);
        }, currentConfig && currentConfig.observeDelay ? currentConfig.observeDelay : 120);
    }

    function attachDataTablesHook() {
        if (!window.jQuery || !window.jQuery.fn) return;
        const events = [
            "init.dt.pmkTableLabels001",
            "draw.dt.pmkTableLabels001",
            "column-visibility.dt.pmkTableLabels001"
        ].join(" ");
        window.jQuery(document)
            .off(events)
            .on(events, "table", function () {
                scheduleApply();
            });
    }

    function mountContextAccess() {
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        const relevant = currentConfig && currentConfig.rules && currentConfig.rules.some(function (rule) {
            return rule && rule.enabled !== false && pageMatches(rule);
        });
        if (!relevant) return;

        const anchor = document.querySelector("h1") || document.querySelector("h2") || document.querySelector("main") || document.body;
        if (!anchor) return;

        window.PMKConfig.mountContextButton({
            moduleId: MODULE_ID,
            anchor: anchor,
            position: "append",
            contextKey: "page-" + window.location.pathname,
            context: { pagePath: window.location.pathname }
        });
    }

    function getRuleIndex(fieldPath) {
        if (!Array.isArray(fieldPath)) return null;
        const pos = fieldPath.indexOf("rules");
        if (pos < 0 || pos + 1 >= fieldPath.length) return null;
        const index = Number(fieldPath[pos + 1]);
        return Number.isInteger(index) ? index : null;
    }

    function getRuleFromPath(rootObject, fieldPath) {
        const index = getRuleIndex(fieldPath);
        if (index === null || !rootObject || !Array.isArray(rootObject.rules)) return null;
        return rootObject.rules[index] || null;
    }

    function cssColorToHex(value) {
        const raw = cleanText(value).toLowerCase();
        if (!raw || raw === "transparent") return "";
        if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
        if (/^#[0-9a-f]{3}$/i.test(raw)) {
            return "#" + raw.slice(1).split("").map(function (c) { return c + c; }).join("");
        }
        const nums = raw.match(/[\d.]+/g);
        if (!nums || nums.length < 3) return "";
        if (nums.length >= 4 && Number(nums[3]) === 0) return "";
        const toHex = function (n) {
            return Math.max(0, Math.min(255, Math.round(Number(n) || 0))).toString(16).padStart(2, "0");
        };
        return "#" + toHex(nums[0]) + toHex(nums[1]) + toHex(nums[2]);
    }

    function applyStyleSample(rule, sample) {
        if (!rule || !sample) return false;
        rule.customizeTextStyle = true;
        const size = parseFloat(sample.fontSize);
        if (Number.isFinite(size)) rule.textSizePx = Math.max(8, Math.min(72, Math.round(size)));
        const textColor = cssColorToHex(sample.color);
        if (textColor) rule.textColor = textColor;
        const bg = cssColorToHex(sample.backgroundColor);
        rule.textBackgroundColor = bg || "";
        const weight = parseInt(sample.fontWeight, 10);
        rule.textBold = Number.isFinite(weight) ? weight >= 600 : /bold/i.test(String(sample.fontWeight || ""));
        rule.textItalic = /italic|oblique/i.test(String(sample.fontStyle || ""));
        rule.textUnderline = /underline/i.test(String(sample.textDecorationLine || sample.textDecoration || ""));
        const radius = parseFloat(sample.borderRadius);
        if (Number.isFinite(radius)) rule.textBorderRadiusPx = Math.max(0, Math.min(48, Math.round(radius)));
        return true;
    }

    function visualPreviewModel(context) {
        const ctx = context || {};
        const rule = getRuleFromPath(ctx.rootObject, ctx.fieldPath) || RULE_TEMPLATE;
        const style = {};
        if (rule.customizeTextStyle) {
            style.fontSize = (Number(rule.textSizePx) || 14) + "px";
            style.color = rule.textColor || "#212529";
            style.fontWeight = rule.textBold ? "700" : "400";
            style.fontStyle = rule.textItalic ? "italic" : "normal";
            style.textDecorationLine = rule.textUnderline ? "underline" : "none";
            style.backgroundColor = rule.textBackgroundColor || "transparent";
            style.borderRadius = (Number(rule.textBorderRadiusPx) || 0) + "px";
        }

        let icon = null;
        if (rule.changeIcon && rule.iconType !== "none") {
            icon = {
                type: rule.iconType,
                className: rule.iconType === "fa" ? normalizeFaClass(rule.iconClass) : "",
                url: rule.iconType === "image" ? rule.imageUrl : "",
                size: Number(rule.iconSizePx) || 16,
                color: rule.iconColor || "",
                position: rule.iconPosition || "before"
            };
        }

        return {
            text: textForRule(rule) || rule.targetName || rule.label || i18n("Élément", "Element"),
            style: style,
            icon: icon,
            hidden: rule.visibilityAction === "hide",
            disabled: rule.visibilityAction === "disable",
            title: rule.visibilityAction === "hide"
                ? i18n("Cet élément sera masqué", "This element will be hidden")
                : ""
        };
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
            previewModel: visualPreviewModel,
            styleTargetUrl: function (context) {
                const rule = getRuleFromPath(context && context.rootObject, context && context.fieldPath);
                const path = cleanText(rule && rule.pagePath);
                return path && path !== "*" ? path : window.location.pathname;
            },
            applyStyleSample: function (context) {
                const rule = getRuleFromPath(context && context.rootObject, context && context.fieldPath);
                if (rule) applyStyleSample(rule, context && context.sample);
                return { rootObject: context && context.rootObject };
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

    function applyPickerResult(rootObject, fieldPath, result) {
        const rule = getRuleFromPath(rootObject, fieldPath);
        if (!rule || !result) return;
        /* Le picker met à jour la page de référence sans modifier la portée globale de la règle. */
        rule.pagePath = result.pagePath || rule.pagePath || window.location.pathname;
        rule.targetName = result.targetName || rule.targetName || i18n("Élément Koha", "Koha element");
        rule.matchCount = Number.isInteger(result.matchCount) ? result.matchCount : selectorCount(result.selector || rule.selector);
    }

    function pickForRule(context) {
        const ctx = context || {};
        const rule = getRuleFromPath(ctx.rootObject, ctx.fieldPath);
        const configuredPath = cleanText(rule && rule.pagePath);
        const targetUrl = configuredPath && configuredPath !== "*" ? configuredPath : window.location.pathname;
        const picker = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!picker || typeof picker.pickForConfig !== "function") {
            return Promise.reject(new Error("shared_picker_unavailable"));
        }
        return picker.pickForConfig({
            moduleId: MODULE_ID,
            targetUrl: targetUrl,
            fieldPath: Array.isArray(ctx.fieldPath) ? ctx.fieldPath.slice() : [],
            rootObject: ctx.rootObject || {},
            adminContext: { sectionId: "rules", pagePath: targetUrl },
            options: {
                bannerText: i18n(
                    "Clique sur l’élément à personnaliser — Échap annule",
                    "Click the element to customize — Esc cancels"
                )
            }
        });
    }

    function registerPickerAdapter() {
        const picker = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!picker || typeof picker.register !== "function") return;
        picker.register(MODULE_ID, {
            buildResult: function (candidate, result) {
                result.targetName = cleanText(candidate.getAttribute("aria-label")) || cleanText(candidate.getAttribute("title")) || cleanText(candidate.textContent).slice(0, 100) || candidate.tagName.toLowerCase();
                result.matchCount = selectorCount(result.selector);
                return result;
            },
            applyPending: function (draft, pending, picked) {
                const rule = getRuleFromPath(draft, pending && pending.fieldPath);
                if (!rule || !picked) return draft;
                /* Conserve allPages tel quel : le pick ne change que la page de référence. */
                rule.pagePath = picked.pagePath || rule.pagePath || window.location.pathname;
                rule.targetName = picked.targetName || rule.targetName || i18n("Élément Koha", "Koha element");
                rule.matchCount = Number.isInteger(picked.matchCount) ? picked.matchCount : null;
                return draft;
            }
        });
    }

    function newRule() {
        return mergeRule({
            id: makeId("ui-rule"),
            enabled: true,
            label: i18n("Nouvelle personnalisation", "New customization"),
            allPages: false,
            pagePath: window.location.pathname,
            selector: "",
            targetName: ""
        }, 0);
    }

    function validateConfig(config) {
        const cfg = normalizeConfig(config);
        if (!Array.isArray(cfg.rules)) {
            return { ok: false, message: i18n("La liste des règles est invalide.", "The rule list is invalid.") };
        }

        const ids = new Set();
        for (const rule of cfg.rules) {
            if (!rule.id || ids.has(rule.id)) {
                return { ok: false, message: i18n("Chaque règle doit avoir un identifiant unique.", "Each rule must have a unique identifier.") };
            }
            ids.add(rule.id);

            /* Une règle inactive peut rester incomplète pendant sa préparation. */
            if (rule.enabled === false) continue;

            /*
             * Une personnalisation sans cible est un brouillon valide :
             * elle est sauvegardée mais ignorée à l’exécution jusqu’au pick.
             */
            if (!cleanText(rule.selector)) continue;

            if (rule.allPages !== true && !cleanText(rule.pagePath)) {
                return { ok: false, message: i18n("Chaque règle limitée à une page doit indiquer une page Koha.", "Each rule limited to one page must specify a Koha page.") };
            }
            try {
                document.createDocumentFragment().querySelector(rule.selector);
            } catch (_) {
                return { ok: false, message: i18n("Un sélecteur CSS configuré n’est pas valide : ", "A configured CSS selector is invalid: ") + rule.selector };
            }
            if (rule.changeText && !cleanText(rule.textFr) && !cleanText(rule.textEn)) {
                return { ok: false, message: i18n("Une règle qui modifie le texte doit contenir au moins un libellé.", "A text-changing rule must contain at least one label.") };
            }
            if (rule.changeIcon && rule.iconType === "fa" && !cleanText(rule.iconClass)) {
                return { ok: false, message: i18n("Indique une classe Font Awesome.", "Provide a Font Awesome class.") };
            }
            if (rule.changeIcon && rule.iconType === "image" && !cleanText(rule.imageUrl)) {
                return { ok: false, message: i18n("Indique l’URL de l’image.", "Provide the image URL.") };
            }
            if (rule.changeLink && !cleanText(rule.href)) {
                return { ok: false, message: i18n("Indique l’adresse du lien.", "Provide the link URL.") };
            }
        }
        return { ok: true };
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: SCHEMA_VERSION,
            name: {
                fr: "Libellés et éléments d’interface",
                en: "Labels and interface elements"
            },
            description: {
                fr: "Personnalise dans une liste unique les libellés de tableaux et n’importe quel autre élément Koha : texte, icône, apparence, lien ou visibilité.",
                en: "Customizes table labels and any other Koha interface element in one rule list: text, icon, appearance, link or visibility."
            },
            category: { fr: "Interface / présentation", en: "Interface / presentation" },
            supportedPages: ["*"],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            normalize: normalizeConfig,
            validate: validateConfig,
            schema: [
                {
                    key: "enabled",
                    type: "boolean",
                    label: { fr: "Module actif", en: "Module enabled" },
                    help: {
                        fr: "Désactiver le module restaure les éléments modifiés sans désactiver les autres modules PMK.",
                        en: "Disabling this module restores modified elements without disabling other PMK modules."
                    }
                },
                {
                    key: "superlibrarianPreviewHidden",
                    type: "boolean",
                    label: {
                        fr: "Superlibrarian — afficher les éléments masqués en filigrane",
                        en: "Superlibrarian — show hidden elements as a watermark"
                    },
                    help: {
                        fr: "Mode de prévisualisation global. Il ne change rien pour les autres agents. Une règle peut surcharger ce comportement.",
                        en: "Global preview mode. It does not change anything for other staff. Individual rules can override it."
                    }
                },
                {
                    key: "observeDom",
                    type: "boolean",
                    advanced: true,
                    label: { fr: "Retraiter les éléments ajoutés dynamiquement", en: "Process dynamically added elements" }
                },
                {
                    key: "observeDelay",
                    type: "number",
                    advanced: true,
                    min: 25,
                    max: 2000,
                    label: { fr: "Délai de retraitement (ms)", en: "Reprocessing delay (ms)" }
                },
                {
                    key: "rules",
                    type: "repeater",
                    label: { fr: "Personnalisations", en: "Customizations" },
                    addLabel: { fr: "Ajouter une personnalisation", en: "Add customization" },
                    emptyLabel: { fr: "Aucune personnalisation configurée.", en: "No customization configured." },
                    reorder: true,
                    newItem: newRule,
                    liveTitleKey: "label",
                    itemTitle: function (item, index) {
                        return cleanText(item && item.label) || (i18n("Personnalisation ", "Customization ") + (index + 1));
                    },
                    fields: [
                        { key: "enabled", type: "boolean", label: { fr: "Règle active", en: "Rule enabled" } },
                        { key: "label", type: "text", label: { fr: "Nom de la règle", en: "Rule name" } },
                        {
                            key: "allPages",
                            type: "boolean",
                            label: { fr: "Appliquer sur toutes les pages", en: "Apply on all pages" },
                            refreshOnChange: true,
                            help: {
                                fr: "Si cette option est activée, la règle est recherchée et appliquée sur toutes les pages Koha où le sélecteur existe. La page choisie reste mémorisée comme page de référence et sera réutilisée si vous désactivez cette option.",
                                en: "When enabled, the rule is searched for and applied on every Koha page where the selector exists. The selected page remains stored as the reference page and is reused if you disable this option."
                            }
                        },
                        {
                            key: "pagePath",
                            type: "text",
                            label: { fr: "Page Koha", en: "Koha page" },
                            help: {
                                fr: "Renseignée automatiquement par le picker. Cette page reste mémorisée même si la règle est appliquée sur toutes les pages. Exemple : /cgi-bin/koha/mainpage.pl",
                                en: "Filled automatically by the picker. This page remains stored even when the rule is applied on all pages. Example: /cgi-bin/koha/mainpage.pl"
                            },
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.allPages !== true);
                            }
                        },
                        {
                            key: "selector",
                            type: "elementPicker",
                            label: { fr: "Élément à personnaliser", en: "Element to customize" },
                            pickLabel: { fr: "Choisir sur la page", en: "Choose on page" },
                            emptyLabel: { fr: "Aucun élément choisi", en: "No element selected" },
                            help: {
                                fr: "Une règle sans élément peut être enregistrée : elle reste simplement sans effet jusqu’à la sélection d’une cible.",
                                en: "A rule without an element can be saved: it simply remains inactive in practice until a target is selected."
                            },
                            allowManual: true,
                            pick: pickForRule,
                            onPick: applyPickerResult,
                        },
                        { key: "targetName", type: "readonly", label: { fr: "Élément détecté", en: "Detected element" } },
                        { key: "matchCount", type: "readonly", advanced: true, label: { fr: "Éléments trouvés lors du choix", en: "Elements found when selected" } },

                        {
                            type: "visualPreview",
                            label: { fr: "Aperçu", en: "Preview" }
                        },
                        {
                            type: "styleEyedropper",
                            label: { fr: "Pipette de style", en: "Style eyedropper" },
                            buttonLabel: { fr: "Copier le style d’un élément…", en: "Copy style from an element…" },
                            iconClass: "fa fa-eyedropper",
                            sectionId: "rules",
                            help: {
                                fr: "Utilise le moteur visuel commun PMK. Seules les propriétés sûres et pertinentes pour ce module sont reprises.",
                                en: "Uses the shared PMK visual engine. Only safe properties relevant to this module are copied."
                            }
                        },
                        {
                            key: "changeText",
                            type: "boolean",
                            label: { fr: "Modifier le texte / libellé", en: "Change text / label" },
                            refreshOnChange: true
                        },
                        {
                            key: "textFr",
                            type: "text",
                            label: { fr: "Nouveau texte — français", en: "New text — French" },
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.changeText);
                            }
                        },
                        {
                            key: "textEn",
                            type: "text",
                            label: { fr: "Nouveau texte — anglais", en: "New text — English" },
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.changeText);
                            }
                        },
                        {
                            key: "customizeTextStyle",
                            type: "boolean",
                            label: { fr: "Personnaliser l’apparence du texte", en: "Customize text appearance" },
                            refreshOnChange: true
                        },
                        {
                            key: "textSizePx",
                            type: "number",
                            label: { fr: "Taille du texte (px)", en: "Text size (px)" },
                            min: 8,
                            max: 72,
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.customizeTextStyle);
                            }
                        },
                        {
                            key: "textColor",
                            type: "color",
                            label: { fr: "Couleur du texte", en: "Text color" },
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.customizeTextStyle);
                            }
                        },
                        {
                            key: "textHoverColor",
                            type: "color",
                            label: { fr: "Couleur du texte au survol", en: "Text hover color" },
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.customizeTextStyle);
                            }
                        },

                        {
                            key: "textBold",
                            type: "boolean",
                            label: { fr: "Gras", en: "Bold" },
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.customizeTextStyle);
                            }
                        },
                        {
                            key: "textItalic",
                            type: "boolean",
                            label: { fr: "Italique", en: "Italic" },
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.customizeTextStyle);
                            }
                        },
                        {
                            key: "textUnderline",
                            type: "boolean",
                            label: { fr: "Souligné", en: "Underline" },
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.customizeTextStyle);
                            }
                        },
                        {
                            key: "textBackgroundColor",
                            type: "color",
                            allowEmpty: true,
                            label: { fr: "Couleur de fond", en: "Background color" },
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.customizeTextStyle);
                            }
                        },
                        {
                            key: "textBorderRadiusPx",
                            type: "number",
                            min: 0,
                            max: 48,
                            label: { fr: "Arrondi du fond (px)", en: "Background radius (px)" },
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.customizeTextStyle);
                            }
                        },

                        {
                            key: "changeIcon",
                            type: "boolean",
                            label: { fr: "Modifier / ajouter l’icône", en: "Change / add icon" },
                            refreshOnChange: true
                        },
                        {
                            key: "iconType",
                            type: "select",
                            label: { fr: "Type d’icône", en: "Icon type" },
                            options: [
                                { value: "fa", label: { fr: "Font Awesome", en: "Font Awesome" } },
                                { value: "image", label: { fr: "Image", en: "Image" } },
                                { value: "none", label: { fr: "Aucune icône", en: "No icon" } }
                            ],
                            refreshOnChange: true,
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.changeIcon);
                            }
                        },
                        {
                            key: "iconClass",
                            type: "text",
                            label: { fr: "Classe Font Awesome", en: "Font Awesome class" },
                            help: { fr: "Exemple : fa fa-fw fa-book", en: "Example: fa fa-fw fa-book" },
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.changeIcon && rule.iconType === "fa");
                            }
                        },
                        {
                            key: "imageUrl",
                            type: "imageUrl",
                            label: { fr: "URL de l’image", en: "Image URL" },
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.changeIcon && rule.iconType === "image");
                            }
                        },
                        {
                            key: "iconPosition",
                            type: "select",
                            label: { fr: "Position de l’icône", en: "Icon position" },
                            options: [
                                { value: "before", label: { fr: "Avant le texte", en: "Before text" } },
                                { value: "after", label: { fr: "Après le texte", en: "After text" } }
                            ],
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.changeIcon && rule.iconType !== "none");
                            }
                        },
                        {
                            key: "iconSizePx",
                            type: "number",
                            min: 8,
                            max: 96,
                            label: { fr: "Taille de l’icône / image (px)", en: "Icon / image size (px)" },
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.changeIcon && rule.iconType !== "none");
                            }
                        },
                        {
                            key: "iconColor",
                            type: "color",
                            label: { fr: "Couleur Font Awesome", en: "Font Awesome color" },
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.changeIcon && rule.iconType === "fa");
                            }
                        },
                        {
                            key: "iconHoverColor",
                            type: "color",
                            label: { fr: "Couleur Font Awesome au survol", en: "Font Awesome hover color" },
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.changeIcon && rule.iconType === "fa");
                            }
                        },

                        {
                            key: "changeLink",
                            type: "boolean",
                            label: { fr: "Modifier l’adresse du lien", en: "Change link address" },
                            refreshOnChange: true
                        },
                        {
                            key: "href",
                            type: "text",
                            label: { fr: "Nouvelle adresse", en: "New address" },
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.changeLink);
                            }
                        },
                        {
                            key: "openInNewTab",
                            type: "boolean",
                            label: { fr: "Ouvrir dans un nouvel onglet", en: "Open in a new tab" },
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.changeLink);
                            }
                        },
                        {
                            key: "visibilityAction",
                            type: "select",
                            label: { fr: "Visibilité / disponibilité", en: "Visibility / availability" },
                            options: [
                                { value: "unchanged", label: { fr: "Ne pas modifier", en: "Do not change" } },
                                { value: "hide", label: { fr: "Masquer", en: "Hide" } },
                                { value: "show", label: { fr: "Forcer l’affichage", en: "Force visible" } },
                                { value: "disable", label: { fr: "Désactiver sans masquer", en: "Disable without hiding" } }
                            ],
                            refreshOnChange: true,
                            help: {
                                fr: "Reprend les possibilités utiles de l’ancien module Affichage conditionnel.",
                                en: "Includes the useful capabilities of the former Conditional visibility module."
                            }
                        },
                        {
                            key: "visibilityScope",
                            type: "select",
                            advanced: true,
                            label: { fr: "Portée de l’action de visibilité", en: "Visibility action scope" },
                            options: [
                                { value: "self", label: { fr: "Élément sélectionné", en: "Selected element" } },
                                { value: "closest-li", label: { fr: "Ligne / entrée <li> parente", en: "Parent <li> row / entry" } },
                                { value: "closest-tr", label: { fr: "Ligne de tableau <tr> parente", en: "Parent table row <tr>" } }
                            ],
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.visibilityAction && rule.visibilityAction !== "unchanged");
                            }
                        },
                        {
                            key: "superlibrarianHiddenMode",
                            type: "select",
                            label: {
                                fr: "Affichage pour les superlibrarians",
                                en: "Display for superlibrarians"
                            },
                            options: [
                                { value: "inherit", label: { fr: "Utiliser le réglage global", en: "Use global setting" } },
                                { value: "hidden", label: { fr: "Masqué également", en: "Hidden as well" } },
                                { value: "watermark", label: { fr: "Visible en filigrane", en: "Visible as a watermark" } },
                                { value: "visible", label: { fr: "Forcer l’affichage normal", en: "Force normal display" } }
                            ],
                            help: {
                                fr: "Ne s’applique qu’aux règles dont l’action est « Masquer ». Le mode filigrane neutralise les clics sur l’élément.",
                                en: "Only applies to rules whose action is Hide. Watermark mode disables interaction with the element."
                            },
                            when: function (root, path) {
                                const rule = getRuleFromPath(root, path);
                                return Boolean(rule && rule.visibilityAction === "hide");
                            }
                        }
                    ]
                }
            ],
            focusContext: function (main, context) {
                if (!main || !context || !context.pagePath) return;
                const repeater = main.querySelector(".pmk-repeater");
                if (repeater) {
                    window.setTimeout(function () {
                        repeater.scrollIntoView({ block: "start", behavior: "smooth" });
                    }, 0);
                }
            }
        };
    }

    async function startRuntimeWithCore() {
        if (!window.PMKConfig || bootedWithCore) return;
        bootedWithCore = true;

        registerPickerAdapter();
        registerVisualEditorAdapter();
        window.PMKConfig.registerModule(moduleDefinition());

        currentConfig = normalizeConfig(await window.PMKConfig.getConfig(MODULE_ID));
        applyConfig(currentConfig);
        attachDataTablesHook();
        mountContextAccess();

        window.PMKConfig.subscribe(MODULE_ID, function (newConfig) {
            currentConfig = normalizeConfig(newConfig);
            applyConfig(currentConfig);
            mountContextAccess();
        });
    }

    function startRuntimeWithoutCore() {
        if (runtimeStarted) return;
        runtimeStarted = true;
        currentConfig = clone(DEFAULT_CONFIG);
        applyConfig(currentConfig);
        attachDataTablesHook();
    }

    function onDomReady(callback) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback, { once: true });
        } else {
            callback();
        }
    }

    onDomReady(function () {
        if (window.PMKConfig) {
            startRuntimeWithCore();
        } else {
            startRuntimeWithoutCore();
            window.addEventListener("pmk:config-ready", function () {
                startRuntimeWithCore();
            }, { once: true });
        }
    });
})();

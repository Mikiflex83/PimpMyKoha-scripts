/* ============================================================
   PimpMyKoha - Pré-plugin - 009 - Résumé enrichi / 4ème de couverture
   Fichier : 009-4eme-de-couv.js
   Version : 2.1.0
   Date    : 2026-09-17
   Auteur  : Michael Mundet

   Fonction :
   - détecte un résumé Electre déjà injecté dans la page détail Koha ;
   - le déplace dans un bloc repliable accessible et discret ;
   - reprend le placement historique : zone 330, sinon 215, sinon première section ;
   - conserve le résumé à son emplacement d'origine si la page n'est pas
     reconnue avec suffisamment de certitude ;
   - fonctionne seul avec ses valeurs par défaut ;
   - se connecte automatiquement à window.PMKConfig lorsqu'il est présent.

   Important : ce module NE récupère PAS le résumé auprès d'Electre.
   Il présente un contenu Electre déjà présent dans le DOM.
   ============================================================ */

(function () {
    "use strict";

    const GLOBAL_GUARD = "__PMK_009_DETAIL_FOURTH_COVER__";
    if (window[GLOBAL_GUARD]) return;

    const MODULE_ID = "detail-fourth-cover";
    const MODULE_VERSION = "2.1.0";
    const PAGE_ID = "catalogue.detail";
    const PAGE_PATH = "/cgi-bin/koha/catalogue/detail.pl";
    const WRAPPER_ID = "pmk-detail-fourth-cover";
    const BODY_ID = "pmk-detail-fourth-cover-body";
    const STYLE_ID = "pmk-detail-fourth-cover-style";
    const SOURCE_WAIT_MS = 20000;

    const SOURCE_SELECTORS = [
        "span.results_summary.electre",
        "span.results_summary.electre-resume"
    ];

    const DEFAULT_CONFIG = {
        enabled: true,
        language: "auto",
        titleFr: "4ème de couverture",
        titleEn: "Back cover",
        defaultExpanded: false,
        hideSourceLabel: true,
        placement: "historical-zone-330-215",
        provider: "Electre",
        page: "catalogue/detail.pl — catalogue.detail",

        // Le rendu ci-dessous reprend le résultat visuel historique
        // obtenu par 009 + la couche de finition du 107.
        appearance: {
            wrapperMargin: "10px 0 0",
            headerBackgroundMode: "gradient",
            headerBackground: "#f7f7f7",
            headerGradientStart: "#eceff1",
            headerGradientEnd: "#f5f7fa",
            headerHoverBackground: "#e1e6e9",
            headerBorder: "1px solid #ccc",
            headerBorderLeft: "3px solid #78909c",
            headerBorderRadius: "3px",
            headerPadding: "5px 10px",
            headerFontSize: "0.88em",
            headerFontWeight: "600",
            headerColor: "#37474f",
            bodyBackground: "transparent",
            bodyBorder: "1px solid #ccc",
            bodyBorderTop: "none",
            bodyBorderLeft: "3px solid #eceff1",
            bodyBorderRadius: "0 0 5px 5px",
            bodyPadding: "10px",
            bodyMarginTop: "4px",
            bodyFontSize: "0.90em",
            bodyColor: "#424242"
        }
    };

    let currentConfig = clone(DEFAULT_CONFIG);
    let sourceObserver = null;
    let sourceWaitTimer = null;
    let sourceWaitCancel = null;
    let configUnsubscribe = null;
    let contextButton = null;
    let activeSource = null;
    let originalParent = null;
    let originalNextSibling = null;
    let sourceLabel = null;
    let sourceLabelWasHidden = false;
    let runToken = 0;
    let coreRegistered = false;
    let coreStarted = false;
    let fallbackStarted = false;

    window[GLOBAL_GUARD] = {
        version: MODULE_VERSION,
        moduleId: MODULE_ID,
        pageId: PAGE_ID,
        initialized: false,
        active: false,
        status: "created"
    };

    function clone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function normalizeLanguage(value) {
        const lang = String(value || "auto").toLowerCase();
        return ["auto", "fr", "en"].includes(lang) ? lang : "auto";
    }

    function detectKohaLanguage() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            const pmkLang = String(window.PMKConfig.getLanguage() || "").toLowerCase();
            if (pmkLang === "fr" || pmkLang === "en") return pmkLang;
        }

        const candidates = [
            document.documentElement && document.documentElement.lang,
            document.body && document.body.getAttribute("lang"),
            navigator.language
        ];

        for (const candidate of candidates) {
            const lang = String(candidate || "").toLowerCase();
            if (lang.startsWith("fr")) return "fr";
            if (lang.startsWith("en")) return "en";
        }
        return "fr";
    }

    function getDisplayLanguage(config) {
        const configured = normalizeLanguage(config && config.language);
        return configured === "auto" ? detectKohaLanguage() : configured;
    }

    function text(fr, en, config) {
        return getDisplayLanguage(config || currentConfig) === "en" ? en : fr;
    }

    function normalizeAppearance(value) {
        const source = value && typeof value === "object" ? value : {};
        return Object.assign({}, DEFAULT_CONFIG.appearance, source);
    }

    function normalizeConfig(config) {
        const source = config && typeof config === "object" ? config : {};
        return {
            enabled: source.enabled !== false,
            language: normalizeLanguage(source.language),
            titleFr: String(source.titleFr || DEFAULT_CONFIG.titleFr).trim() || DEFAULT_CONFIG.titleFr,
            titleEn: String(source.titleEn || DEFAULT_CONFIG.titleEn).trim() || DEFAULT_CONFIG.titleEn,
            defaultExpanded: source.defaultExpanded === true,
            hideSourceLabel: source.hideSourceLabel !== false,
            placement: "historical-zone-330-215",
            provider: "Electre",
            page: "catalogue/detail.pl — catalogue.detail",
            appearance: normalizeAppearance(source.appearance)
        };
    }

    function isTargetPage() {
        const path = String(window.location.pathname || "");
        if (path !== PAGE_PATH) return false;
        const body = document.body;
        return !body || body.id === "catalog_detail" || body.classList.contains("catalog");
    }

    function getTitle(config) {
        const lang = getDisplayLanguage(config);
        return lang === "en" ? config.titleEn : config.titleFr;
    }

    function getElectreSummary() {
        for (const selector of SOURCE_SELECTORS) {
            const direct = document.querySelector(selector);
            if (direct && hasMeaningfulContent(direct)) return direct;
        }

        const inner = document.querySelector("span#electre-resume");
        if (!inner || !hasMeaningfulContent(inner)) return null;
        return inner.closest("span.results_summary") || inner;
    }

    function hasMeaningfulContent(element) {
        if (!element) return false;
        const copy = element.cloneNode(true);
        copy.querySelectorAll("span.label").forEach(function (label) { label.remove(); });
        return String(copy.textContent || "").replace(/\s+/g, " ").trim().length > 0;
    }

    function getHistoricalTarget() {
        /*
         * Placement historique du script 009 :
         * 1. dans la zone MARC 330 si elle est présente ;
         * 2. sinon dans la zone MARC 215 ;
         * 3. sinon dans la première section de la fiche notice.
         *
         * On conserve volontairement ce comportement pour que le module
         * retrouve sa place habituelle dans l'interface Dracénie.
         */
        const zone330 = document.querySelector("li[title='Zone : 330']");
        if (zone330) return { element: zone330, placement: "append", matched: "330" };

        const zone215 = document.querySelector("li[title='Zone : 215']");
        if (zone215) return { element: zone215, placement: "append", matched: "215" };

        const section = document.querySelector("#catalogue_detail_biblio .page-section") ||
            document.querySelector(".page-section");
        if (section) return { element: section, placement: "append", matched: "fallback" };

        return null;
    }

    function clearSourceWait() {
        if (sourceObserver) {
            sourceObserver.disconnect();
            sourceObserver = null;
        }
        if (sourceWaitTimer) {
            window.clearTimeout(sourceWaitTimer);
            sourceWaitTimer = null;
        }
        const cancel = sourceWaitCancel;
        sourceWaitCancel = null;
        if (cancel) cancel();
    }

    function waitForElectreSummary(timeoutMs) {
        const existing = getElectreSummary();
        if (existing) return Promise.resolve(existing);

        return new Promise(function (resolve) {
            let finished = false;
            const root = document.getElementById("catalogue_detail_biblio") || document.body || document.documentElement;

            function finish(value) {
                if (finished) return;
                finished = true;
                if (sourceObserver) { sourceObserver.disconnect(); sourceObserver = null; }
                if (sourceWaitTimer) { window.clearTimeout(sourceWaitTimer); sourceWaitTimer = null; }
                sourceWaitCancel = null;
                resolve(value || null);
            }

            sourceWaitCancel = function () { finish(null); };
            sourceObserver = new MutationObserver(function () {
                const found = getElectreSummary();
                if (found) finish(found);
            });
            sourceObserver.observe(root, { childList: true, subtree: true, characterData: true });

            sourceWaitTimer = window.setTimeout(function () {
                finish(getElectreSummary());
            }, timeoutMs || SOURCE_WAIT_MS);
        });
    }

    function cssText(value, fallback) {
        const text = String(value == null ? "" : value).trim();
        return text || fallback;
    }

    function injectStyles(config) {
        const old = document.getElementById(STYLE_ID);
        if (old) old.remove();

        const a = normalizeAppearance(config && config.appearance);
        const headerBackground = a.headerBackgroundMode === "solid"
            ? cssText(a.headerBackground, "#f7f7f7")
            : "linear-gradient(90deg, " + cssText(a.headerGradientStart, "#eceff1") +
              " 0%, " + cssText(a.headerGradientEnd, "#f5f7fa") + " 100%)";

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #${WRAPPER_ID} {
                margin: ${cssText(a.wrapperMargin, "10px 0 0")};
                min-width: 0;
            }
            #${WRAPPER_ID} .pmk-fourth-cover-heading {
                display: flex;
                align-items: center;
                gap: .15rem;
                margin: 0;
                min-width: 0;
            }
            #${WRAPPER_ID} .pmk-fourth-cover-toggle {
                appearance: none;
                width: auto;
                min-height: 0;
                display: inline-flex;
                align-items: center;
                gap: .3rem;
                padding: ${cssText(a.headerPadding, "5px 10px")};
                border: ${cssText(a.headerBorder, "1px solid #ccc")};
                border-left: ${cssText(a.headerBorderLeft, "3px solid #78909c")};
                border-radius: ${cssText(a.headerBorderRadius, "3px")};
                background: ${headerBackground};
                color: ${cssText(a.headerColor, "#37474f")};
                font: inherit;
                font-size: ${cssText(a.headerFontSize, "0.88em")};
                font-weight: ${cssText(a.headerFontWeight, "600")};
                line-height: 1.35;
                text-align: left;
                cursor: pointer;
                box-shadow: none;
                user-select: none;
            }
            #${WRAPPER_ID} .pmk-fourth-cover-toggle:hover {
                background: ${cssText(a.headerHoverBackground, "#e1e6e9")};
            }
            #${WRAPPER_ID} .pmk-fourth-cover-toggle:focus-visible {
                outline: 2px solid rgba(13,110,253,.35);
                outline-offset: 2px;
            }
            #${WRAPPER_ID} .pmk-fourth-cover-chevron {
                flex: 0 0 auto;
                color: currentColor;
                font-size: .88em;
                line-height: 1;
                transition: transform .15s ease;
            }
            #${WRAPPER_ID} .pmk-fourth-cover-toggle[aria-expanded="true"] .pmk-fourth-cover-chevron {
                transform: rotate(90deg);
            }
            #${WRAPPER_ID} .pmk-fourth-cover-title {
                min-width: 0;
                overflow-wrap: anywhere;
            }
            #${BODY_ID} {
                margin-top: ${cssText(a.bodyMarginTop, "4px")};
                padding: ${cssText(a.bodyPadding, "10px")};
                border: ${cssText(a.bodyBorder, "1px solid #ccc")};
                border-top: ${cssText(a.bodyBorderTop, "none")};
                border-left: ${cssText(a.bodyBorderLeft, "3px solid #eceff1")};
                border-radius: ${cssText(a.bodyBorderRadius, "0 0 5px 5px")};
                background: ${cssText(a.bodyBackground, "transparent")};
                color: ${cssText(a.bodyColor, "#424242")};
                font-size: ${cssText(a.bodyFontSize, "0.90em")};
                min-width: 0;
                overflow-wrap: anywhere;
            }
            #${BODY_ID}[hidden] {
                display: none !important;
            }
            #${BODY_ID} > .results_summary,
            #${BODY_ID} .results_summary {
                display: block;
                max-width: 100%;
                margin: 0;
                padding: 0;
                white-space: normal;
                overflow-wrap: anywhere;
            }
            #${WRAPPER_ID} .pmk-context-config {
                flex: 0 0 auto;
                opacity: .28;
                padding: 0 .2rem !important;
                margin-left: .05rem !important;
            }
            #${WRAPPER_ID} .pmk-context-config:hover,
            #${WRAPPER_ID} .pmk-context-config:focus {
                opacity: .8;
            }
            @media (max-width: 576px) {
                #${WRAPPER_ID} {
                    max-width: 100%;
                }
                #${WRAPPER_ID} .pmk-fourth-cover-toggle {
                    max-width: 100%;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function restoreSource() {
        if (!activeSource) return;

        if (sourceLabel) {
            sourceLabel.hidden = sourceLabelWasHidden;
        }

        if (originalParent && document.documentElement.contains(originalParent)) {
            const reference = originalNextSibling && originalNextSibling.parentNode === originalParent
                ? originalNextSibling
                : null;
            originalParent.insertBefore(activeSource, reference);
        }

        activeSource = null;
        originalParent = null;
        originalNextSibling = null;
        sourceLabel = null;
        sourceLabelWasHidden = false;
    }

    function removeInjectedUi(options) {
        const opts = options || {};
        runToken += 1;
        clearSourceWait();

        const wrapper = document.getElementById(WRAPPER_ID);
        if (wrapper && activeSource && wrapper.contains(activeSource)) {
            restoreSource();
        } else if (activeSource) {
            restoreSource();
        }

        if (wrapper) wrapper.remove();
        if (contextButton && contextButton.isConnected) contextButton.remove();
        contextButton = null;

        if (opts.removeStyles === true) {
            const style = document.getElementById(STYLE_ID);
            if (style) style.remove();
        }

        window[GLOBAL_GUARD].active = false;
    }

    function setExpanded(button, body, expanded) {
        const open = expanded === true;
        button.setAttribute("aria-expanded", open ? "true" : "false");
        body.hidden = !open;
    }

    function mountContextAccess(heading) {
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        if (!heading) return;

        contextButton = window.PMKConfig.mountContextButton({
            moduleId: MODULE_ID,
            anchor: heading,
            position: "append",
            contextKey: PAGE_ID,
            context: {
                pageId: PAGE_ID,
                sectionId: "presentation"
            }
        });
    }

    function buildUi(source, target, config) {
        if (!source || !target || document.getElementById(WRAPPER_ID)) return false;

        injectStyles(config);

        originalParent = source.parentNode;
        originalNextSibling = source.nextSibling;
        activeSource = source;

        sourceLabel = source.querySelector ? source.querySelector("span.label") : null;
        if (sourceLabel) {
            sourceLabelWasHidden = sourceLabel.hidden;
            sourceLabel.hidden = sourceLabelWasHidden || config.hideSourceLabel === true;
        }

        const wrapper = document.createElement("div");
        wrapper.id = WRAPPER_ID;
        wrapper.className = "pmk-detail-fourth-cover";
        wrapper.setAttribute("data-pmk-module", MODULE_ID);
        wrapper.setAttribute("data-pmk-page", PAGE_ID);

        const heading = document.createElement("div");
        heading.className = "pmk-fourth-cover-heading";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "pmk-fourth-cover-toggle";
        button.setAttribute("aria-controls", BODY_ID);

        const chevron = document.createElement("span");
        chevron.className = "pmk-fourth-cover-chevron";
        chevron.setAttribute("aria-hidden", "true");
        chevron.textContent = "›";

        const title = document.createElement("span");
        title.className = "pmk-fourth-cover-title";
        title.textContent = getTitle(config);

        button.appendChild(chevron);
        button.appendChild(title);
        heading.appendChild(button);

        const body = document.createElement("div");
        body.id = BODY_ID;
        body.className = "pmk-fourth-cover-body";
        body.appendChild(source);

        wrapper.appendChild(heading);
        wrapper.appendChild(body);

        if (target.placement === "append") {
            target.element.appendChild(wrapper);
        } else {
            target.element.insertAdjacentElement("afterend", wrapper);
        }

        setExpanded(button, body, config.defaultExpanded === true);
        button.addEventListener("click", function () {
            const expanded = button.getAttribute("aria-expanded") === "true";
            setExpanded(button, body, !expanded);
        });

        mountContextAccess(heading);
        window[GLOBAL_GUARD].active = true;
        window[GLOBAL_GUARD].status = "active";
        return true;
    }

    async function applyConfig(config) {
        currentConfig = normalizeConfig(config);

        if (!isTargetPage()) return;

        removeInjectedUi();
        const activeToken = ++runToken;

        if (!currentConfig.enabled) {
            window[GLOBAL_GUARD].status = "disabled";
            return;
        }

        const target = getHistoricalTarget();
        if (!target) {
            window[GLOBAL_GUARD].status = "safe-target-not-found";
            return;
        }

        const source = await waitForElectreSummary(SOURCE_WAIT_MS);
        if (activeToken !== runToken) return;
        if (!source) {
            window[GLOBAL_GUARD].status = "source-not-found";
            return;
        }

        const refreshedTarget = getHistoricalTarget();
        if (!refreshedTarget) {
            window[GLOBAL_GUARD].status = "safe-target-lost";
            return;
        }

        buildUi(source, refreshedTarget, currentConfig);
    }

    function validateModuleConfig(config) {
        if (!config || typeof config !== "object") {
            return {
                ok: false,
                message: detectKohaLanguage() === "en"
                    ? "The module configuration is invalid."
                    : "La configuration du module est invalide."
            };
        }

        if (Object.prototype.hasOwnProperty.call(config, "language") &&
            !["auto", "fr", "en"].includes(String(config.language || "").toLowerCase())) {
            return {
                ok: false,
                message: detectKohaLanguage() === "en"
                    ? "The selected language is invalid."
                    : "La langue choisie n’est pas valide."
            };
        }

        for (const key of ["titleFr", "titleEn"]) {
            if (Object.prototype.hasOwnProperty.call(config, key) && !String(config[key] || "").trim()) {
                return {
                    ok: false,
                    message: detectKohaLanguage() === "en"
                        ? "French and English titles cannot be empty."
                        : "Les titres français et anglais ne peuvent pas être vides."
                };
            }
        }

        return { ok: true };
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 3,
            name: {
                fr: "Résumé enrichi / 4ème de couverture",
                en: "Enriched summary / back cover"
            },
            description: {
                fr: "Présente dans un bloc repliable le résumé Electre déjà injecté dans la page détail. Le module ne contacte pas Electre lui-même.",
                en: "Presents an Electre summary already injected into the record-detail page in a collapsible block. The module does not contact Electre itself."
            },
            category: {
                fr: "Catalogue / détail de notice",
                en: "Catalog / record detail"
            },
            supportedPages: [PAGE_ID],
            prerequisites: [
                {
                    fr: "Un résumé Electre doit déjà être injecté dans la page par l’intégration de l’installation.",
                    en: "An Electre summary must already be injected into the page by the installation integration."
                }
            ],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            normalize: normalizeConfig,
            validate: validateModuleConfig,
            schema: [
                {
                    type: "section",
                    id: "presentation",
                    label: { fr: "Présentation", en: "Presentation" },
                    description: {
                        fr: "Personnalise le titre et l’état initial du bloc. Les valeurs par défaut reproduisent le comportement historique du 009.",
                        en: "Customize the block title and initial state. Defaults preserve the original 009 behavior."
                    },
                    fields: [
                        {
                            key: "language",
                            type: "select",
                            label: { fr: "Langue du bloc", en: "Block language" },
                            options: [
                                { value: "auto", label: { fr: "Automatique — suivre Koha", en: "Automatic — follow Koha" } },
                                { value: "fr", label: { fr: "Français", en: "French" } },
                                { value: "en", label: { fr: "Anglais", en: "English" } }
                            ]
                        },
                        {
                            key: "titleFr",
                            type: "text",
                            label: { fr: "Titre français", en: "French title" }
                        },
                        {
                            key: "titleEn",
                            type: "text",
                            label: { fr: "Titre anglais", en: "English title" }
                        },
                        {
                            key: "defaultExpanded",
                            type: "boolean",
                            label: { fr: "Ouvrir le bloc par défaut", en: "Open the block by default" }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "appearance",
                    label: { fr: "Style de l’accordéon", en: "Accordion style" },
                    description: {
                        fr: "Les valeurs par défaut reproduisent le rendu historique obtenu avec le 107. Tous les réglages appartiennent désormais au 009 et restent modifiables.",
                        en: "Defaults reproduce the historical rendering provided by 107. All styling now belongs to module 009 and remains configurable."
                    },
                    fields: [
                        {
                            key: "appearance.headerBackgroundMode",
                            type: "select",
                            refreshOnChange: true,
                            label: { fr: "Fond de l’en-tête", en: "Header background" },
                            options: [
                                { value: "gradient", label: { fr: "Dégradé", en: "Gradient" } },
                                { value: "solid", label: { fr: "Couleur unie", en: "Solid color" } }
                            ]
                        },
                        { key: "appearance.headerBackground", type: "color", label: { fr: "Couleur unie", en: "Solid color" }, when: function (root) { return root.appearance && root.appearance.headerBackgroundMode === "solid"; } },
                        { key: "appearance.headerGradientStart", type: "color", label: { fr: "Début du dégradé", en: "Gradient start" }, when: function (root) { return !root.appearance || root.appearance.headerBackgroundMode !== "solid"; } },
                        { key: "appearance.headerGradientEnd", type: "color", label: { fr: "Fin du dégradé", en: "Gradient end" }, when: function (root) { return !root.appearance || root.appearance.headerBackgroundMode !== "solid"; } },
                        { key: "appearance.headerHoverBackground", type: "color", label: { fr: "Fond au survol", en: "Hover background" } },
                        { key: "appearance.headerColor", type: "color", label: { fr: "Couleur du titre", en: "Title color" } },
                        { key: "appearance.headerBorder", type: "text", label: { fr: "Bordure de l’en-tête", en: "Header border" }, advanced: true },
                        { key: "appearance.headerBorderLeft", type: "text", label: { fr: "Bordure gauche de l’en-tête", en: "Header left border" }, advanced: true },
                        { key: "appearance.headerBorderRadius", type: "text", label: { fr: "Arrondi de l’en-tête", en: "Header radius" }, advanced: true },
                        { key: "appearance.headerPadding", type: "text", label: { fr: "Espacement interne de l’en-tête", en: "Header padding" }, advanced: true },
                        { key: "appearance.headerFontSize", type: "text", label: { fr: "Taille du titre", en: "Title size" } },
                        { key: "appearance.headerFontWeight", type: "text", label: { fr: "Graisse du titre", en: "Title weight" }, advanced: true },
                        { key: "appearance.bodyBackground", type: "text", label: { fr: "Fond du contenu", en: "Body background" }, help: { fr: "Couleur CSS ou transparent.", en: "CSS color or transparent." } },
                        { key: "appearance.bodyColor", type: "color", label: { fr: "Couleur du contenu", en: "Body color" } },
                        { key: "appearance.bodyBorder", type: "text", label: { fr: "Bordure du contenu", en: "Body border" }, advanced: true },
                        { key: "appearance.bodyBorderTop", type: "text", label: { fr: "Bordure haute du contenu", en: "Body top border" }, advanced: true },
                        { key: "appearance.bodyBorderLeft", type: "text", label: { fr: "Bordure gauche du contenu", en: "Body left border" }, advanced: true },
                        { key: "appearance.bodyBorderRadius", type: "text", label: { fr: "Arrondi du contenu", en: "Body radius" }, advanced: true },
                        { key: "appearance.bodyPadding", type: "text", label: { fr: "Espacement interne du contenu", en: "Body padding" }, advanced: true },
                        { key: "appearance.bodyMarginTop", type: "text", label: { fr: "Espace avant le contenu", en: "Space before body" }, advanced: true },
                        { key: "appearance.bodyFontSize", type: "text", label: { fr: "Taille du contenu", en: "Body text size" } },
                        { key: "appearance.wrapperMargin", type: "text", label: { fr: "Marge du bloc", en: "Block margin" }, advanced: true }
                    ]
                },
                {
                    type: "section",
                    id: "source",
                    label: { fr: "Source du contenu", en: "Content source" },
                    description: {
                        fr: "La détection technique d’Electre est gérée par le module et n’a pas à être configurée avec des sélecteurs CSS.",
                        en: "Technical Electre detection is handled by the module and does not require CSS-selector configuration."
                    },
                    fields: [
                        {
                            key: "provider",
                            type: "text",
                            readOnly: true,
                            label: { fr: "Fournisseur pris en charge", en: "Supported provider" }
                        },
                        {
                            key: "hideSourceLabel",
                            type: "boolean",
                            label: { fr: "Masquer le libellé d’origine Electre", en: "Hide the original Electre label" },
                            help: {
                                fr: "Le contenu du résumé est conservé ; seul le libellé déjà présent dans le bloc source est masqué.",
                                en: "The summary content is preserved; only the label already present in the source block is hidden."
                            }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "placement",
                    label: { fr: "Emplacement", en: "Placement" },
                    description: {
                        fr: "Le résumé reprend automatiquement l’emplacement historique du script 009 : zone 330, sinon zone 215, puis repli dans la première section disponible.",
                        en: "The summary automatically uses the historical 009 placement: field 330, then field 215, then the first available section as fallback."
                    },
                    fields: [
                        {
                            key: "placement",
                            type: "text",
                            readOnly: true,
                            label: { fr: "Position utilisée", en: "Position used" },
                            help: {
                                fr: "Ce placement est volontairement fixe pour conserver le rendu historique.",
                                en: "This placement is intentionally fixed to preserve the historical layout."
                            }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "pages",
                    label: { fr: "Pages configurées", en: "Configured pages" },
                    description: {
                        fr: "Ce module est volontairement limité à la page de détail d’une notice.",
                        en: "This module is intentionally limited to the record-detail page."
                    },
                    fields: [
                        {
                            key: "page",
                            type: "text",
                            readOnly: true,
                            label: { fr: "Page active", en: "Active page" }
                        }
                    ]
                }
            ],
            focusContext: function (main, context) {
                if (!main || !context || context.pageId !== PAGE_ID) return;
                const wanted = context.sectionId || "presentation";
                const section = main.querySelector('[data-pmk-section-id="' + wanted + '"]') ||
                    main.querySelector('[data-pmk-section-id="presentation"]');
                if (!section) return;
                window.setTimeout(function () {
                    section.scrollIntoView({ block: "start", behavior: "smooth" });
                }, 0);
            }
        };
    }

    async function startWithCore() {
        if (!window.PMKConfig) return;

        if (!coreRegistered) {
            window.PMKConfig.registerModule(moduleDefinition());
            coreRegistered = true;
        }

        if (coreStarted || !isTargetPage()) return;
        coreStarted = true;

        let config = DEFAULT_CONFIG;
        try {
            config = await window.PMKConfig.getConfig(MODULE_ID);
        } catch (_) {
            config = DEFAULT_CONFIG;
        }

        await applyConfig(config);

        if (typeof window.PMKConfig.subscribe === "function" && !configUnsubscribe) {
            configUnsubscribe = window.PMKConfig.subscribe(MODULE_ID, function (newConfig) {
                applyConfig(newConfig);
            });
            window[GLOBAL_GUARD].unsubscribe = configUnsubscribe;
        }

        window[GLOBAL_GUARD].initialized = true;
    }

    async function startWithoutCore() {
        if (fallbackStarted || !isTargetPage()) return;
        fallbackStarted = true;
        await applyConfig(DEFAULT_CONFIG);
        window[GLOBAL_GUARD].initialized = true;
    }

    function start() {
        if (window.PMKConfig) startWithCore();
        else startWithoutCore();
    }

    function onDomReady(callback) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback, { once: true });
        } else {
            callback();
        }
    }

    onDomReady(start);

    window.addEventListener("pmk:config-ready", function () {
        if (!coreRegistered || !coreStarted) startWithCore();
    }, { once: true });
})();

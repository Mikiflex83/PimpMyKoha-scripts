/* ============================================================
   Nom du fichier : 010-boutons-recherche-externe.js
   Module PMK      : external-links
   Version         : 2.4.4
   Mise à jour     : 2026-09-21
   Auteur          : Michael Mundet

   Fonction :
   - conserve par défaut le comportement historique du script 010 :
     reprise des liens déjà présents dans les blocs .liens_externes ;
   - permet en plus de créer autant de liens externes configurables
     que nécessaire à partir de modèles d'URL ;
   - chaque lien peut utiliser du texte, une icône Font Awesome ou
     une image ;
   - le bouton principal peut lui aussi utiliser une icône, une image
     ou uniquement du texte ;
   - fonctionne sur les résultats de recherche et le détail notice ;
   - peut créer son propre point d'ancrage lorsqu'aucun bloc
     .liens_externes n'existe mais que des liens configurés sont actifs ;
   - absorbe le legacy 037 « Rechercher ailleurs » dans le même module ;
   - conserve deux rendus séparés : liens de notice près des notices,
     « Rechercher ailleurs » dans une zone distincte de search.pl ;
   - permet des placements desktop/mobile indépendants pour le bloc 037 ;
   - utilise la configuration commune PMK lorsqu'elle est disponible.

   Préparation PimpMyKoha :
   - identifiant fonctionnel stable : external-links ;
   - adaptateurs : catalogue.search / catalogue.detail ;
   - Firestore n'est jamais appelé directement par ce module ;
   - la couche de configuration est fournie par window.PMKConfig.
   ============================================================ */
(function () {
    "use strict";

    const MODULE_ID = "external-links";
    const MODULE_VERSION = "2.4.4";
    const STYLE_ID = "pmk-external-links-styles";
    const SOURCE_HIDDEN_CLASS = "pmk-external-links-source-hidden";
    const WRAPPER_CLASS = "pmk-external-links-wrapper";
    const MENU_CLASS = "pmk-external-links-menu";
    const TOGGLE_CLASS = "pmk-external-links-toggle";
    const GENERATED_HOST_CLASS = "pmk-external-links-generated-host";

    const HISTORICAL_BUTTON_IMAGE =
        "https://cdn-icons-png.flaticon.com/512/15955/15955603.png";

    const HISTORICAL_LINK_IMAGES = {
        electre: "https://catalogue.example.org/userfiles/image/zPortailElems/koha/electre.png",
        babelio: "https://catalogue.example.org/userfiles/image/zPortailElems/koha/1200px-Logo_Babelio.png",
        google: "https://catalogue.example.org/userfiles/image/zPortailElems/koha/img.icons8.png"
    };

    const HISTORICAL_CUSTOM_LINKS = [
        { id: "electre", enabled: true, labelFr: "Electre", labelEn: "Electre",
          urlTemplate: "https://www.electre-ng.com/#/search?q%3D(identifiant%3A%22{ISBN_FORMATTED}%22)%26debut%3D0%26resultat-max%3D50%26perimetre%3D%5Bperimetre-hors-numerique%5DHors%20num%C3%A9rique__%26tri.champ%3D%22date-parution%22%26tri.sens%3D%22desc%22%26inclure-embargos%3D%22true%22%26type%3D%22rapide%22",
          scope: "all", newWindow: true, showLabel: false, iconType: "image", iconClass: "fa fa-external-link", imageUrl: HISTORICAL_LINK_IMAGES.electre },
        { id: "babelio", enabled: true, labelFr: "Babelio", labelEn: "Babelio",
          urlTemplate: "https://www.google.com/search?q=babelio+{AUTHOR}+{TITLE}%20",
          scope: "all", newWindow: true, showLabel: false, iconType: "image", iconClass: "fa fa-external-link", imageUrl: HISTORICAL_LINK_IMAGES.babelio },
        { id: "google", enabled: true, labelFr: "Google", labelEn: "Google",
          urlTemplate: "https://www.google.com/search?q={AUTHOR}%20{TITLE}%20",
          scope: "all", newWindow: true, showLabel: false, iconType: "image", iconClass: "fa fa-external-link", imageUrl: HISTORICAL_LINK_IMAGES.google }
    ];

    const HISTORICAL_SEARCH_ELSE_LINKS = [
        { id: "babelio-google", enabled: true, labelFr: "Babelio via Google", labelEn: "Babelio via Google", urlTemplate: "https://www.google.com/search?q=babelio+{QUERY}", newWindow: true, showLabel: true, iconType: "fa", iconClass: "fa fa-book", imageUrl: "", branchesMode: "all", branchCodes: "" },
        { id: "allocine", enabled: true, labelFr: "Allociné", labelEn: "AlloCiné", urlTemplate: "https://www.allocine.fr/rechercher/?q={QUERY}", newWindow: true, showLabel: true, iconType: "fa", iconClass: "fa fa-film", imageUrl: "", branchesMode: "all", branchCodes: "" },
        { id: "google", enabled: true, labelFr: "Google", labelEn: "Google", urlTemplate: "https://www.google.com/search?q={QUERY}", newWindow: true, showLabel: true, iconType: "fa", iconClass: "fa fa-search", imageUrl: "", branchesMode: "all", branchCodes: "" },
        { id: "google-books", enabled: true, labelFr: "Google Books", labelEn: "Google Books", urlTemplate: "https://www.google.com/search?tbm=bks&q={QUERY}", newWindow: true, showLabel: true, iconType: "fa", iconClass: "fa fa-book-open", imageUrl: "", branchesMode: "all", branchCodes: "" },
        { id: "wikipedia", enabled: true, labelFr: "Wikipedia", labelEn: "Wikipedia", urlTemplate: "https://fr.wikipedia.org/w/index.php?search={QUERY}&title=Sp%C3%A9cial%3ARecherche&ns0=1", newWindow: true, showLabel: true, iconType: "fa", iconClass: "fa fa-globe", imageUrl: "", branchesMode: "all", branchCodes: "" },
        { id: "amazon-general", enabled: true, labelFr: "Amazon (général)", labelEn: "Amazon (general)", urlTemplate: "https://www.amazon.com/s?k={QUERY}", newWindow: true, showLabel: true, iconType: "fa", iconClass: "fa fa-cart-shopping", imageUrl: "", branchesMode: "all", branchCodes: "" },
        { id: "amazon-books", enabled: true, labelFr: "Amazon Livres", labelEn: "Amazon Books", urlTemplate: "https://www.amazon.com/s?k={QUERY}&i=stripbooks", newWindow: true, showLabel: true, iconType: "fa", iconClass: "fa fa-book", imageUrl: "", branchesMode: "all", branchCodes: "" }
    ];

    const PAGE_ADAPTERS = {
        "catalogue.search": {
            id: "catalogue.search",
            label: {
                fr: "Résultats de recherche",
                en: "Search results"
            },
            path: "catalogue/search.pl",
            matches: function () {
                return /\/catalogue\/search\.pl$/.test(window.location.pathname);
            },
            sectionSelector: ".liens_externes"
        },
        "catalogue.detail": {
            id: "catalogue.detail",
            label: {
                fr: "Détail d’une notice",
                en: "Record detail"
            },
            path: "catalogue/detail.pl",
            matches: function () {
                return /\/catalogue\/detail\.pl$/.test(window.location.pathname);
            },
            sectionSelector: ".liens_externes"
        }
    };

    /*
     * Valeurs par défaut :
     * - l'ancien script affichait un bouton "Partager" avec cette image ;
     * - il déplaçait dans son menu les <li> contenant un lien target=_blank
     *   ou une image.
     *
     * Le nouveau module conserve donc ce comportement par défaut tout en
     * corrigeant la structure HTML et en ajoutant les nouvelles fonctions.
     */
    const DEFAULT_CONFIG = {
        enabled: true,

        buttonLabelFr: "Partager",
        buttonLabelEn: "Share",
        buttonShowLabel: false,
        buttonVisualType: "image",
        buttonIconClass: "fa fa-share-alt",
        buttonImageUrl: HISTORICAL_BUTTON_IMAGE,
        buttonShowCaret: false,

        includeExistingLinks: true,
        existingLinksMode: "historical",

        customLinks: HISTORICAL_CUSTOM_LINKS.map(function (item) { return Object.assign({}, item); }),

        searchElse: {
            enabled: true,
            titleFr: "Rechercher ailleurs",
            titleEn: "Search elsewhere",
            desktopPlacement: "sidebar",
            mobilePlacement: "before-results",
            mobileBreakpoint: 768,
            presentation: "list",
            links: HISTORICAL_SEARCH_ELSE_LINKS.map(function (item) { return Object.assign({}, item); })
        },

        pages: [
            {
                pageId: "catalogue.search",
                enabled: true,
                path: "catalogue/search.pl",
                presentation: "menu",
                columns: 2,
                gap: "6px",
                linkPadding: "6px 8px",
                linkJustifyContent: "center",
                linkTextAlign: "center",
                iconGap: "4px",
                linkBackground: "#eceff1",
                linkHoverBackground: "#e1e6e9",
                linkColor: "#455a64",
                linkHoverColor: "#455a64",
                linkBorder: "0",
                linkBorderRadius: "6px",
                linkFontSize: "0.78em",
                linkFontWeight: "600",
                linkBoxShadow: "0 1px 3px rgba(96,125,139,0.18)",
                linkHoverBoxShadow: "0 2px 5px rgba(96,125,139,0.24)",
                hoverTranslateY: "-1px",
                imageRadius: "4px",
                imageBoxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                imageHoverBoxShadow: "0 3px 8px rgba(0,0,0,0.25)",
                imageHoverScale: 1.12
            },
            {
                pageId: "catalogue.detail",
                enabled: true,
                path: "catalogue/detail.pl",
                // Rendu Dracénie historique du 010 : bouton compact qui
                // ouvre/masque les liens. La grille du 107 reste disponible
                // comme option dans PMK, mais n'est plus imposée par défaut.
                presentation: "menu",
                columns: 2,
                gap: "6px",
                linkPadding: "6px 8px",
                linkJustifyContent: "center",
                linkTextAlign: "center",
                iconGap: "4px",
                linkBackground: "#eceff1",
                linkHoverBackground: "#e1e6e9",
                linkColor: "#455a64",
                linkHoverColor: "#455a64",
                linkBorder: "0",
                linkBorderRadius: "6px",
                linkFontSize: "0.78em",
                linkFontWeight: "600",
                linkBoxShadow: "0 1px 3px rgba(96,125,139,0.18)",
                linkHoverBoxShadow: "0 2px 5px rgba(96,125,139,0.24)",
                hoverTranslateY: "-1px",
                imageRadius: "4px",
                imageBoxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                imageHoverBoxShadow: "0 3px 8px rgba(0,0,0,0.25)",
                imageHoverScale: 1.12
            }
        ]
    };

    const TEMPLATE_TOKENS = [
        "BIBLIONUMBER",
        "TITLE",
        "AUTHOR",
        "ISBN",
        "ISBN10",
        "ISBN13",
        "ISSN",
        "EAN",
        "CONTROLNUMBER",
        "OCLC_NO",
        "QUERY",
        "CURRENT_URL",
        "ISBN_FORMATTED"
    ];

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function currentLanguage() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            return window.PMKConfig.getLanguage();
        }
        const htmlLang = (document.documentElement.getAttribute("lang") || "").toLowerCase();
        if (htmlLang.startsWith("fr")) return "fr";
        if (htmlLang.startsWith("en")) return "en";
        return (navigator.language || "fr").toLowerCase().startsWith("en") ? "en" : "fr";
    }

    function translated(fr, en) {
        return currentLanguage() === "en" ? en : fr;
    }

    function cleanText(value) {
        return String(value === undefined || value === null ? "" : value)
            .replace(/\s+/g, " ")
            .trim();
    }

    function buttonLabel(config) {
        return currentLanguage() === "en"
            ? (cleanText(config.buttonLabelEn) || cleanText(config.buttonLabelFr) || "Share")
            : (cleanText(config.buttonLabelFr) || cleanText(config.buttonLabelEn) || "Partager");
    }

    function customLinkLabel(link) {
        return currentLanguage() === "en"
            ? (cleanText(link.labelEn) || cleanText(link.labelFr))
            : (cleanText(link.labelFr) || cleanText(link.labelEn));
    }

    function pageOptions() {
        return Object.keys(PAGE_ADAPTERS).map(function (pageId) {
            const page = PAGE_ADAPTERS[pageId];
            return {
                value: page.id,
                label: page.label
            };
        });
    }

    function nextMissingPage(rootObject) {
        const configured = new Set(
            Array.isArray(rootObject && rootObject.pages)
                ? rootObject.pages.map(function (item) { return item && item.pageId; })
                : []
        );
        return Object.keys(PAGE_ADAPTERS).find(function (pageId) {
            return !configured.has(pageId);
        }) || "catalogue.search";
    }

    function pagePath(pageId) {
        return PAGE_ADAPTERS[pageId] ? PAGE_ADAPTERS[pageId].path : "";
    }

    function pagePresentationDefaults(pageId) {
        const found = DEFAULT_CONFIG.pages.find(function (item) {
            return item && item.pageId === pageId;
        });
        return found ? clone(found) : {
            pageId: pageId,
            enabled: true,
            path: pagePath(pageId),
            presentation: "menu",
            columns: 2,
            gap: "6px",
            linkPadding: "6px 8px",
            linkJustifyContent: "center",
            linkTextAlign: "center",
            iconGap: "4px",
            linkBackground: "#eceff1",
            linkHoverBackground: "#e1e6e9",
            linkColor: "#455a64",
            linkHoverColor: "#455a64",
            linkBorder: "0",
            linkBorderRadius: "6px",
            linkFontSize: "0.78em",
            linkFontWeight: "600",
            linkBoxShadow: "0 1px 3px rgba(96,125,139,0.18)",
            linkHoverBoxShadow: "0 2px 5px rgba(96,125,139,0.24)",
            hoverTranslateY: "-1px",
            imageRadius: "4px",
            imageBoxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            imageHoverBoxShadow: "0 3px 8px rgba(0,0,0,0.25)",
            imageHoverScale: 1.12
        };
    }

    function currentPagePresentation(config) {
        const defaults = pagePresentationDefaults(adapter ? adapter.id : "");
        const pages = Array.isArray(config && config.pages) ? config.pages : [];
        const saved = pages.find(function (item) {
            return item && adapter && item.pageId === adapter.id;
        }) || {};
        return Object.assign({}, defaults, saved);
    }


    function customLinkAt(rootObject, path) {
        if (!rootObject || !Array.isArray(rootObject.customLinks)) return null;
        const index = path && path.length ? path[path.length - 1] : -1;
        return Number.isInteger(index) ? rootObject.customLinks[index] : null;
    }


    function searchElseLinkAt(rootObject, path) {
        if (!rootObject || !rootObject.searchElse || !Array.isArray(rootObject.searchElse.links)) return null;
        const index = path && path.length ? path[path.length - 1] : -1;
        return Number.isInteger(index) ? rootObject.searchElse.links[index] : null;
    }

    function searchElseLabel(link) {
        return currentLanguage() === "en"
            ? (cleanText(link && link.labelEn) || cleanText(link && link.labelFr))
            : (cleanText(link && link.labelFr) || cleanText(link && link.labelEn));
    }

    function visualTypeOptions() {
        return [
            {
                value: "none",
                label: { fr: "Aucune icône / image", en: "No icon / image" }
            },
            {
                value: "fa",
                label: { fr: "Icône Font Awesome", en: "Font Awesome icon" }
            },
            {
                value: "image",
                label: { fr: "Image", en: "Image" }
            }
        ];
    }

    function normalizeModuleConfig(config) {
        const source = config && typeof config === "object" ? config : {};
        const normalized = Object.assign({}, clone(DEFAULT_CONFIG), source);

        normalized.searchElse = Object.assign({}, clone(DEFAULT_CONFIG.searchElse), source.searchElse || {});
        normalized.customLinks = Array.isArray(source.customLinks)
            ? source.customLinks.map(function (item) { return Object.assign({}, item); })
            : clone(DEFAULT_CONFIG.customLinks);

        const suppliedPages = Array.isArray(source.pages) ? source.pages : [];
        normalized.pages = Object.keys(PAGE_ADAPTERS).map(function (pageId) {
            const defaults = pagePresentationDefaults(pageId);
            const saved = suppliedPages.find(function (item) { return item && item.pageId === pageId; }) || {};
            return Object.assign({}, defaults, saved, {
                pageId: pageId,
                path: pagePath(pageId),
                enabled: saved.enabled !== false
            });
        });

        return normalized;
    }

    const MIGRATION_242_FLAG = "_pmk010DetailMenuMigrated242";

    function prepareRuntimeConfig(config) {
        const source = config && typeof config === "object" ? config : {};
        const normalized = normalizeModuleConfig(source);
        const alreadyMigrated = source[MIGRATION_242_FLAG] === true;
        let shouldPersist = false;

        const detail = normalized.pages.find(function (item) {
            return item && item.pageId === "catalogue.detail";
        });

        /*
         * Migration 2.4.1 -> 2.4.2 :
         * la 2.4.1 a pu enregistrer inline-grid comme valeur automatique.
         * Une seule fois, on restaure le bouton compact historique et on
         * persiste un marqueur invisible dans la configuration.
         *
         * Après cette migration, si l'utilisateur choisit volontairement
         * inline-grid dans PMK, son choix est conservé aux chargements suivants.
         */
        if (!alreadyMigrated) {
            if (detail && detail.presentation === "inline-grid") {
                detail.presentation = "menu";
            }
            normalized[MIGRATION_242_FLAG] = true;
            shouldPersist = true;
        } else {
            normalized[MIGRATION_242_FLAG] = true;
        }

        return {
            config: normalized,
            shouldPersist: shouldPersist
        };
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 5,
            name: {
                fr: "Liens externes",
                en: "External links"
            },
            description: {
                fr: "Regroupe les liens externes liés aux notices et le bloc distinct « Rechercher ailleurs » issu du legacy 037. Les deux fonctions partagent le même moteur mais restent affichées à des emplacements différents.",
                en: "Groups record external links and the separate “Search elsewhere” block from legacy 037. Both features share one engine while remaining displayed in different page locations."
            },
            category: {
                fr: "Catalogue / liens externes",
                en: "Catalog / external links"
            },
            supportedPages: [
                "catalogue.search",
                "catalogue.detail"
            ],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            normalize: normalizeModuleConfig,
            validate: function (config) {
                const lang = currentLanguage();
                const fail = function (fr, en) {
                    return {
                        ok: false,
                        message: lang === "en" ? en : fr
                    };
                };

                if (!config || typeof config !== "object") {
                    return fail(
                        "La configuration du module n’est pas valide.",
                        "The module configuration is invalid."
                    );
                }

                if (!cleanText(config.buttonLabelFr) && !cleanText(config.buttonLabelEn)) {
                    return fail(
                        "Le bouton doit avoir au moins un libellé.",
                        "The button must have at least one label."
                    );
                }

                if (!["none", "fa", "image"].includes(config.buttonVisualType)) {
                    return fail(
                        "Le type d’illustration du bouton n’est pas valide.",
                        "The button visual type is invalid."
                    );
                }

                if (config.buttonVisualType === "fa" && !cleanText(config.buttonIconClass)) {
                    return fail(
                        "Indique une classe Font Awesome pour le bouton.",
                        "Enter a Font Awesome class for the button."
                    );
                }

                if (config.buttonVisualType === "image" && !cleanText(config.buttonImageUrl)) {
                    return fail(
                        "Indique l’URL de l’image du bouton.",
                        "Enter the button image URL."
                    );
                }

                if (!["historical", "all"].includes(config.existingLinksMode)) {
                    return fail(
                        "Le mode de reprise des liens existants n’est pas valide.",
                        "The existing-links mode is invalid."
                    );
                }

                if (!Array.isArray(config.customLinks)) {
                    return fail(
                        "La liste des liens personnalisés n’est pas valide.",
                        "The custom-links list is invalid."
                    );
                }

                for (let i = 0; i < config.customLinks.length; i += 1) {
                    const link = config.customLinks[i] || {};
                    if (!cleanText(link.labelFr) && !cleanText(link.labelEn)) {
                        return fail(
                            "Chaque lien personnalisé doit avoir au moins un libellé.",
                            "Each custom link must have at least one label."
                        );
                    }
                    if (!cleanText(link.urlTemplate)) {
                        return fail(
                            "Chaque lien personnalisé doit avoir une structure d’URL.",
                            "Each custom link must have a URL template."
                        );
                    }
                    if (!["all", "catalogue.search", "catalogue.detail"].includes(link.scope)) {
                        return fail(
                            "La portée d’un lien personnalisé n’est pas valide.",
                            "A custom link scope is invalid."
                        );
                    }
                    if (!["none", "fa", "image"].includes(link.iconType)) {
                        return fail(
                            "Le type d’icône d’un lien personnalisé n’est pas valide.",
                            "A custom link icon type is invalid."
                        );
                    }
                    if (link.iconType === "fa" && !cleanText(link.iconClass)) {
                        return fail(
                            "Un lien configuré avec Font Awesome doit indiquer une classe d’icône.",
                            "A link configured with Font Awesome must provide an icon class."
                        );
                    }
                    if (link.iconType === "image" && !cleanText(link.imageUrl)) {
                        return fail(
                            "Un lien configuré avec une image doit indiquer l’URL de cette image.",
                            "A link configured with an image must provide its image URL."
                        );
                    }
                }

                const searchElse = config.searchElse || {};
                if (!["sidebar", "before-results", "after-breadcrumbs"].includes(searchElse.desktopPlacement)) {
                    return fail("L’emplacement bureau de « Rechercher ailleurs » n’est pas valide.", "The desktop Search elsewhere placement is invalid.");
                }
                if (!["before-results", "after-breadcrumbs", "sidebar"].includes(searchElse.mobilePlacement)) {
                    return fail("L’emplacement mobile de « Rechercher ailleurs » n’est pas valide.", "The mobile Search elsewhere placement is invalid.");
                }
                if (!["list", "buttons"].includes(searchElse.presentation)) {
                    return fail("La présentation de « Rechercher ailleurs » n’est pas valide.", "The Search elsewhere presentation is invalid.");
                }
                if (!Array.isArray(searchElse.links)) {
                    return fail("La liste « Rechercher ailleurs » n’est pas valide.", "The Search elsewhere link list is invalid.");
                }
                for (let i = 0; i < searchElse.links.length; i += 1) {
                    const link = searchElse.links[i] || {};
                    if (!cleanText(link.labelFr) && !cleanText(link.labelEn)) {
                        return fail("Chaque lien « Rechercher ailleurs » doit avoir un libellé.", "Each Search elsewhere link must have a label.");
                    }
                    if (!cleanText(link.urlTemplate)) {
                        return fail("Chaque lien « Rechercher ailleurs » doit avoir une structure d’URL.", "Each Search elsewhere link must have a URL template.");
                    }
                    if (!["all", "include", "exclude"].includes(link.branchesMode || "all")) {
                        return fail("Le filtre par site d’un lien « Rechercher ailleurs » n’est pas valide.", "A Search elsewhere branch filter is invalid.");
                    }
                    if (!["none", "fa", "image"].includes(link.iconType || "none")) {
                        return fail("Le type d’icône d’un lien « Rechercher ailleurs » n’est pas valide.", "A Search elsewhere icon type is invalid.");
                    }
                }

                if (!Array.isArray(config.pages)) {
                    return fail(
                        "La liste des pages configurées n’est pas valide.",
                        "Configured pages are invalid."
                    );
                }

                const seen = new Set();
                for (const page of config.pages) {
                    if (!page || !PAGE_ADAPTERS[page.pageId]) {
                        return fail(
                            "Une page configurée n’est pas prise en charge par ce module.",
                            "One configured page is not supported by this module."
                        );
                    }
                    if (seen.has(page.pageId)) {
                        return fail(
                            "Une même page ne peut pas être configurée deux fois.",
                            "The same page cannot be configured twice."
                        );
                    }
                    if (page.presentation && !["menu", "inline", "inline-grid"].includes(page.presentation)) {
                        return fail(
                            "La présentation des liens d’une page n’est pas valide.",
                            "A page link presentation is invalid."
                        );
                    }
                    const columns = Number(page.columns || 2);
                    if (!Number.isFinite(columns) || columns < 1 || columns > 8) {
                        return fail(
                            "Le nombre de colonnes doit être compris entre 1 et 8.",
                            "The number of columns must be between 1 and 8."
                        );
                    }
                    seen.add(page.pageId);
                }

                return { ok: true };
            },
            schema: [
                {
                    type: "section",
                    id: "presentation",
                    label: {
                        fr: "Bouton principal",
                        en: "Main button"
                    },
                    description: {
                        fr: "Par défaut, le bouton reprend le comportement historique : image du script d’origine, sans texte visible, avec le libellé accessible « Partager ».",
                        en: "By default, the button keeps the historical behavior: the original script image, no visible text, with the accessible label “Share”."
                    },
                    fields: [
                        {
                            key: "buttonLabelFr",
                            type: "text",
                            label: {
                                fr: "Libellé français du bouton",
                                en: "French button label"
                            }
                        },
                        {
                            key: "buttonLabelEn",
                            type: "text",
                            label: {
                                fr: "Libellé anglais du bouton",
                                en: "English button label"
                            }
                        },
                        {
                            key: "buttonShowLabel",
                            type: "boolean",
                            label: {
                                fr: "Afficher le texte du bouton",
                                en: "Show button text"
                            }
                        },
                        {
                            key: "buttonVisualType",
                            type: "select",
                            refreshOnChange: true,
                            label: {
                                fr: "Illustration du bouton",
                                en: "Button visual"
                            },
                            options: visualTypeOptions()
                        },
                        {
                            key: "buttonIconClass",
                            type: "text",
                            label: {
                                fr: "Classe Font Awesome",
                                en: "Font Awesome class"
                            },
                            placeholder: {
                                fr: "Ex. fa fa-external-link",
                                en: "E.g. fa fa-external-link"
                            },
                            when: function (rootObject) {
                                return rootObject.buttonVisualType === "fa";
                            }
                        },
                        {
                            key: "buttonImageUrl",
                            type: "imageUrl",
                            label: {
                                fr: "Image du bouton",
                                en: "Button image"
                            },
                            help: {
                                fr: "URL HTTPS, URL relative Koha ou image data: locale. La valeur historique est préconfigurée.",
                                en: "HTTPS URL, relative Koha URL or local data: image. The historical value is preconfigured."
                            },
                            when: function (rootObject) {
                                return rootObject.buttonVisualType === "image";
                            }
                        },
                        {
                            key: "buttonShowCaret",
                            type: "boolean",
                            label: {
                                fr: "Afficher la flèche de menu",
                                en: "Show menu caret"
                            }
                        },
                        {
                            type: "visualPreview",
                            label: { fr: "Aperçu du bouton", en: "Button preview" },
                            help: {
                                fr: "Aperçu fourni par le moteur visuel commun PMK. Utilise ensuite « Aperçu sur la page » pour vérifier le bouton et « Rechercher ailleurs » dans leur vrai contexte Koha.",
                                en: "Preview provided by the shared PMK visual engine. Then use ‘Preview on page’ to check the button and Search elsewhere in their real Koha context."
                            }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "legacy",
                    label: {
                        fr: "Liens déjà présents dans Koha",
                        en: "Links already present in Koha"
                    },
                    description: {
                        fr: "Cette source assure la compatibilité avec le script historique. Les liens existants conservent leur texte et leurs images/icônes.",
                        en: "This source preserves compatibility with the historical script. Existing links keep their text and images/icons."
                    },
                    fields: [
                        {
                            key: "includeExistingLinks",
                            type: "boolean",
                            label: {
                                fr: "Inclure les liens existants",
                                en: "Include existing links"
                            }
                        },
                        {
                            key: "existingLinksMode",
                            type: "select",
                            label: {
                                fr: "Détection des liens existants",
                                en: "Existing link detection"
                            },
                            options: [
                                {
                                    value: "historical",
                                    label: {
                                        fr: "Compatibilité historique : lien nouvel onglet ou élément avec image",
                                        en: "Historical compatibility: new-tab link or item containing an image"
                                    }
                                },
                                {
                                    value: "all",
                                    label: {
                                        fr: "Tous les liens du bloc .liens_externes",
                                        en: "All links in the .liens_externes block"
                                    }
                                }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "custom-links",
                    label: {
                        fr: "Liens personnalisés",
                        en: "Custom links"
                    },
                    description: {
                        fr: "Ajoute autant de liens que nécessaire. La structure d’URL accepte les variables {BIBLIONUMBER}, {TITLE}, {AUTHOR}, {ISBN}, {ISBN10}, {ISBN13}, {ISSN}, {EAN}, {CONTROLNUMBER}, {OCLC_NO}, {QUERY} et {CURRENT_URL}. Les valeurs sont encodées pour une URL ; ajoute _RAW au nom pour insérer la valeur brute, par exemple {TITLE_RAW}.",
                        en: "Add as many links as needed. URL templates accept {BIBLIONUMBER}, {TITLE}, {AUTHOR}, {ISBN}, {ISBN10}, {ISBN13}, {ISSN}, {EAN}, {CONTROLNUMBER}, {OCLC_NO}, {QUERY}, and {CURRENT_URL}. Values are URL-encoded; append _RAW for the raw value, for example {TITLE_RAW}."
                    },
                    fields: [
                        {
                            key: "customLinks",
                            type: "repeater",
                            label: {
                                fr: "Liens",
                                en: "Links"
                            },
                            addLabel: {
                                fr: "Ajouter un lien",
                                en: "Add a link"
                            },
                            emptyLabel: {
                                fr: "Aucun lien personnalisé. Les liens historiques restent disponibles si leur reprise est activée.",
                                en: "No custom link. Historical links remain available when existing-link import is enabled."
                            },
                            reorder: true,
                            newItem: function () {
                                return {
                                    enabled: true,
                                    labelFr: "Nouveau lien",
                                    labelEn: "New link",
                                    urlTemplate: "https://example.org/search?q={TITLE}",
                                    scope: "all",
                                    newWindow: true,
                                    showLabel: true,
                                    iconType: "none",
                                    iconClass: "fa fa-external-link",
                                    imageUrl: ""
                                };
                            },
                            itemTitle: function (item, index, lang) {
                                if (!item) return (lang === "en" ? "Link " : "Lien ") + (index + 1);
                                return lang === "en"
                                    ? (cleanText(item.labelEn) || cleanText(item.labelFr) || ("Link " + (index + 1)))
                                    : (cleanText(item.labelFr) || cleanText(item.labelEn) || ("Lien " + (index + 1)));
                            },
                            fields: [
                                {
                                    key: "enabled",
                                    type: "boolean",
                                    label: {
                                        fr: "Lien actif",
                                        en: "Link enabled"
                                    }
                                },
                                {
                                    key: "labelFr",
                                    type: "text",
                                    label: {
                                        fr: "Libellé français",
                                        en: "French label"
                                    }
                                },
                                {
                                    key: "labelEn",
                                    type: "text",
                                    label: {
                                        fr: "Libellé anglais",
                                        en: "English label"
                                    }
                                },
                                {
                                    key: "urlTemplate",
                                    type: "text",
                                    label: {
                                        fr: "Structure de l’URL",
                                        en: "URL template"
                                    },
                                    placeholder: {
                                        fr: "https://exemple.fr/recherche?q={ISBN}",
                                        en: "https://example.org/search?q={ISBN}"
                                    },
                                    help: {
                                        fr: "Un lien n’est pas affiché si une variable utilisée dans sa structure est absente de la notice.",
                                        en: "A link is not displayed when a variable used by its template is unavailable for the record."
                                    }
                                },
                                {
                                    key: "scope",
                                    type: "select",
                                    label: {
                                        fr: "Pages d’utilisation",
                                        en: "Pages"
                                    },
                                    options: [
                                        {
                                            value: "all",
                                            label: {
                                                fr: "Résultats + détail notice",
                                                en: "Search results + record detail"
                                            }
                                        },
                                        {
                                            value: "catalogue.search",
                                            label: {
                                                fr: "Résultats de recherche uniquement",
                                                en: "Search results only"
                                            }
                                        },
                                        {
                                            value: "catalogue.detail",
                                            label: {
                                                fr: "Détail notice uniquement",
                                                en: "Record detail only"
                                            }
                                        }
                                    ]
                                },
                                {
                                    key: "newWindow",
                                    type: "boolean",
                                    label: {
                                        fr: "Ouvrir dans un nouvel onglet",
                                        en: "Open in a new tab"
                                    }
                                },
                                {
                                    key: "showLabel",
                                    type: "boolean",
                                    label: {
                                        fr: "Afficher le texte du lien",
                                        en: "Show link text"
                                    }
                                },
                                {
                                    key: "iconType",
                                    type: "select",
                                    refreshOnChange: true,
                                    label: {
                                        fr: "Icône / image du lien",
                                        en: "Link icon / image"
                                    },
                                    options: visualTypeOptions()
                                },
                                {
                                    key: "iconClass",
                                    type: "text",
                                    label: {
                                        fr: "Classe Font Awesome",
                                        en: "Font Awesome class"
                                    },
                                    placeholder: {
                                        fr: "Ex. fa fa-book",
                                        en: "E.g. fa fa-book"
                                    },
                                    when: function (rootObject, path) {
                                        const item = customLinkAt(rootObject, path);
                                        return Boolean(item && item.iconType === "fa");
                                    }
                                },
                                {
                                    key: "imageUrl",
                                    type: "imageUrl",
                                    label: {
                                        fr: "Image du lien",
                                        en: "Link image"
                                    },
                                    when: function (rootObject, path) {
                                        const item = customLinkAt(rootObject, path);
                                        return Boolean(item && item.iconType === "image");
                                    }
                                }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "search-else",
                    label: { fr: "Rechercher ailleurs", en: "Search elsewhere" },
                    description: {
                        fr: "Fonction issue du script 037. Ce bloc est indépendant des liens de notice : il relance la recherche Koha courante sur des services externes et est volontairement rendu dans une autre zone de la page.",
                        en: "Feature migrated from script 037. This block is independent from record links: it relaunches the current Koha search on external services and is intentionally rendered elsewhere on the page."
                    },
                    fields: [
                        { key: "searchElse.enabled", type: "boolean", label: { fr: "Activer « Rechercher ailleurs »", en: "Enable Search elsewhere" } },
                        { key: "searchElse.titleFr", type: "text", label: { fr: "Titre français", en: "French title" } },
                        { key: "searchElse.titleEn", type: "text", label: { fr: "Titre anglais", en: "English title" } },
                        {
                            key: "searchElse.desktopPlacement", type: "select",
                            label: { fr: "Emplacement sur grand écran", en: "Desktop placement" },
                            options: [
                                { value: "sidebar", label: { fr: "Barre latérale", en: "Sidebar" } },
                                { value: "before-results", label: { fr: "Au-dessus des résultats", en: "Above results" } },
                                { value: "after-breadcrumbs", label: { fr: "Après le fil d’Ariane", en: "After breadcrumbs" } }
                            ]
                        },
                        {
                            key: "searchElse.mobilePlacement", type: "select",
                            label: { fr: "Emplacement sur petit écran", en: "Mobile placement" },
                            options: [
                                { value: "before-results", label: { fr: "Au-dessus des résultats", en: "Above results" } },
                                { value: "after-breadcrumbs", label: { fr: "Après le fil d’Ariane", en: "After breadcrumbs" } },
                                { value: "sidebar", label: { fr: "Barre latérale si disponible", en: "Sidebar when available" } }
                            ]
                        },
                        { key: "searchElse.mobileBreakpoint", type: "number", advanced: true, label: { fr: "Seuil mobile (px)", en: "Mobile breakpoint (px)" } },
                        {
                            key: "searchElse.presentation", type: "select",
                            label: { fr: "Présentation des liens", en: "Link presentation" },
                            options: [
                                { value: "list", label: { fr: "Liste verticale", en: "Vertical list" } },
                                { value: "buttons", label: { fr: "Boutons", en: "Buttons" } }
                            ]
                        },
                        {
                            key: "searchElse.links",
                            type: "repeater",
                            label: { fr: "Sources externes", en: "External sources" },
                            addLabel: { fr: "Ajouter une source", en: "Add a source" },
                            emptyLabel: { fr: "Aucune source externe configurée.", en: "No external source configured." },
                            reorder: true,
                            newItem: function () {
                                return { enabled: true, labelFr: "Nouvelle source", labelEn: "New source", urlTemplate: "https://example.org/search?q={QUERY}", newWindow: true, showLabel: true, iconType: "none", iconClass: "fa fa-external-link", imageUrl: "", branchesMode: "all", branchCodes: "" };
                            },
                            itemTitle: function (item, index, lang) {
                                if (!item) return (lang === "en" ? "Source " : "Source ") + (index + 1);
                                return lang === "en" ? (cleanText(item.labelEn) || cleanText(item.labelFr) || ("Source " + (index + 1))) : (cleanText(item.labelFr) || cleanText(item.labelEn) || ("Source " + (index + 1)));
                            },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Source active", en: "Source enabled" } },
                                { key: "labelFr", type: "text", label: { fr: "Libellé français", en: "French label" } },
                                { key: "labelEn", type: "text", label: { fr: "Libellé anglais", en: "English label" } },
                                { key: "urlTemplate", type: "text", label: { fr: "Structure de l’URL", en: "URL template" }, help: { fr: "Variables : {QUERY}, {INDEX}, {BRANCH}, {CURRENT_URL}. Elles sont encodées automatiquement. Ajoutez _RAW pour insérer une valeur brute.", en: "Variables: {QUERY}, {INDEX}, {BRANCH}, {CURRENT_URL}. They are URL-encoded automatically. Append _RAW for raw insertion." } },
                                { key: "newWindow", type: "boolean", label: { fr: "Ouvrir dans un nouvel onglet", en: "Open in a new tab" } },
                                { key: "showLabel", type: "boolean", label: { fr: "Afficher le texte", en: "Show text" } },
                                { key: "iconType", type: "select", label: { fr: "Icône / image", en: "Icon / image" }, options: visualTypeOptions() },
                                { key: "iconClass", type: "text", label: { fr: "Classe Font Awesome", en: "Font Awesome class" } },
                                { key: "imageUrl", type: "imageUrl", label: { fr: "Image", en: "Image" } },
                                {
                                    key: "branchesMode", type: "select", label: { fr: "Disponibilité par site", en: "Branch availability" },
                                    options: [
                                        { value: "all", label: { fr: "Tous les sites", en: "All branches" } },
                                        { value: "include", label: { fr: "Uniquement les sites indiqués", en: "Only listed branches" } },
                                        { value: "exclude", label: { fr: "Tous sauf les sites indiqués", en: "All except listed branches" } }
                                    ]
                                },
                                { key: "branchCodes", type: "text", label: { fr: "Codes sites", en: "Branch codes" }, placeholder: { fr: "DRA, ARC, MUY", en: "DRA, ARC, MUY" }, help: { fr: "Codes séparés par des virgules, espaces ou points-virgules.", en: "Codes separated by commas, spaces or semicolons." } }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "pages",
                    label: {
                        fr: "Pages configurées",
                        en: "Configured pages"
                    },
                    description: {
                        fr: "Active ou désactive le module page par page. Les détails techniques de détection restent gérés par l’adaptateur Koha.",
                        en: "Enable or disable the module per page. Technical detection details remain handled by the Koha adapter."
                    },
                    fields: [
                        {
                            key: "pages",
                            type: "repeater",
                            label: {
                                fr: "Pages",
                                en: "Pages"
                            },
                            addLabel: {
                                fr: "Ajouter une page",
                                en: "Add a page"
                            },
                            emptyLabel: {
                                fr: "Aucune page activée pour ce module.",
                                en: "No page configured for this module."
                            },
                            reorder: false,
                            canAdd: function (_rootObject, _fieldPath, items) {
                                return Array.isArray(items) && items.length < Object.keys(PAGE_ADAPTERS).length;
                            },
                            newItem: function (rootObject) {
                                const pageId = nextMissingPage(rootObject);
                                return pagePresentationDefaults(pageId);
                            },
                            itemTitle: function (item, index, lang) {
                                const page = item && PAGE_ADAPTERS[item.pageId];
                                if (!page) return "Page " + (index + 1);
                                return page.label[lang] || page.label.fr || page.id;
                            },
                            fields: [
                                {
                                    key: "enabled",
                                    type: "boolean",
                                    label: {
                                        fr: "Activer sur cette page",
                                        en: "Enable on this page"
                                    }
                                },
                                {
                                    key: "pageId",
                                    type: "select",
                                    refreshOnChange: true,
                                    label: {
                                        fr: "Page Koha",
                                        en: "Koha page"
                                    },
                                    options: pageOptions(),
                                    onChange: function (rootObject, fieldPath, value) {
                                        const index = fieldPath[fieldPath.length - 2];
                                        if (!Array.isArray(rootObject.pages) || !rootObject.pages[index]) return;
                                        const previousEnabled = rootObject.pages[index].enabled !== false;
                                        rootObject.pages[index] = Object.assign(pagePresentationDefaults(value), {
                                            pageId: value,
                                            enabled: previousEnabled,
                                            path: pagePath(value)
                                        });
                                    }
                                },
                                {
                                    key: "path",
                                    type: "text",
                                    readOnly: true,
                                    label: {
                                        fr: "Chemin Koha",
                                        en: "Koha path"
                                    }
                                },
                                {
                                    key: "presentation",
                                    type: "select",
                                    refreshOnChange: true,
                                    label: { fr: "Présentation des liens", en: "Link presentation" },
                                    options: [
                                        { value: "menu", label: { fr: "Menu compact", en: "Compact menu" } },
                                        { value: "inline", label: { fr: "Liens toujours visibles en ligne", en: "Always-visible inline links" } },
                                        { value: "inline-grid", label: { fr: "Grille de boutons", en: "Button grid" } }
                                    ],
                                    help: {
                                        fr: "Sur detail.pl, le menu compact est la valeur par défaut historique du 010. La grille 2×2 héritée du 107 reste disponible en option.",
                                        en: "On detail.pl, the compact menu is the historical 010 default. The 2×2 grid inherited from 107 remains available as an option."
                                    }
                                },
                                {
                                    key: "columns",
                                    type: "number",
                                    min: 1,
                                    max: 8,
                                    step: 1,
                                    label: { fr: "Nombre de colonnes", en: "Number of columns" },
                                    when: function (root, path) {
                                        const index = path[path.length - 2];
                                        return Boolean(root.pages && root.pages[index] && root.pages[index].presentation === "inline-grid");
                                    }
                                },
                                { key: "gap", type: "text", label: { fr: "Espace entre les liens", en: "Gap between links" }, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } },
                                { key: "linkPadding", type: "text", label: { fr: "Espacement interne des liens", en: "Link padding" }, advanced: true, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } },
                                { key: "linkJustifyContent", type: "text", advanced: true, label: { fr: "Alignement du contenu", en: "Content alignment" }, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } },
                                { key: "linkTextAlign", type: "text", advanced: true, label: { fr: "Alignement du texte", en: "Text alignment" }, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } },
                                { key: "iconGap", type: "text", advanced: true, label: { fr: "Espace icône / texte", en: "Icon / text gap" }, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } },
                                { key: "linkBackground", type: "color", label: { fr: "Fond des liens", en: "Link background" }, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } },
                                { key: "linkHoverBackground", type: "color", label: { fr: "Fond au survol", en: "Hover background" }, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } },
                                { key: "linkColor", type: "color", label: { fr: "Couleur du texte", en: "Text color" }, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } },
                                { key: "linkHoverColor", type: "color", label: { fr: "Couleur du texte au survol", en: "Hover text color" }, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } },
                                { key: "linkBorder", type: "text", advanced: true, label: { fr: "Bordure", en: "Border" }, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } },
                                { key: "linkBorderRadius", type: "text", label: { fr: "Arrondi", en: "Radius" }, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } },
                                { key: "linkFontSize", type: "text", label: { fr: "Taille du texte", en: "Text size" }, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } },
                                { key: "linkFontWeight", type: "text", advanced: true, label: { fr: "Graisse du texte", en: "Font weight" }, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } },
                                { key: "linkBoxShadow", type: "text", advanced: true, label: { fr: "Ombre", en: "Shadow" }, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } },
                                { key: "linkHoverBoxShadow", type: "text", advanced: true, label: { fr: "Ombre au survol", en: "Hover shadow" }, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } },
                                { key: "hoverTranslateY", type: "text", advanced: true, label: { fr: "Déplacement vertical au survol", en: "Hover vertical shift" }, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } },
                                { key: "imageRadius", type: "text", advanced: true, label: { fr: "Arrondi des images", en: "Image radius" }, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } },
                                { key: "imageBoxShadow", type: "text", advanced: true, label: { fr: "Ombre des images", en: "Image shadow" }, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } },
                                { key: "imageHoverBoxShadow", type: "text", advanced: true, label: { fr: "Ombre des images au survol", en: "Image hover shadow" }, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } },
                                { key: "imageHoverScale", type: "number", min: 1, max: 2, step: 0.01, advanced: true, label: { fr: "Agrandissement des images au survol", en: "Image hover scale" }, when: function (root, path) { const i = path[path.length - 2]; return Boolean(root.pages && root.pages[i] && root.pages[i].presentation !== "menu"); } }
                            ]
                        }
                    ]
                }
            ],
            focusContext: function (main, context) {
                if (!main || !context) return;
                const wanted = context.sectionId || "custom-links";
                const section = main.querySelector('[data-pmk-section-id="' + wanted + '"]');
                if (!section) return;
                window.setTimeout(function () {
                    section.scrollIntoView({ block: "start", behavior: "smooth" });
                }, 0);
            }
        };
    }

    function registerVisualEditorWithPMK() {
        const editor = window.PMKConfig && window.PMKConfig.visualEditor;
        if (!editor || typeof editor.register !== "function") return false;
        editor.register(MODULE_ID, {
            capabilities: { inlinePreview: true, livePreview: true },
            canPreview: function () { return Boolean(adapter); },
            previewModel: function (context) {
                const cfg = context && context.rootObject ? context.rootObject : DEFAULT_CONFIG;
                const lang = currentLanguage();
                const label = lang === "en" ? (cfg.buttonLabelEn || cfg.buttonLabelFr || "Share") : (cfg.buttonLabelFr || cfg.buttonLabelEn || "Partager");
                const icon = cfg.buttonVisualType === "image"
                    ? { type: "image", url: cfg.buttonImageUrl || "", position: "before", size: 20 }
                    : cfg.buttonVisualType === "fa"
                        ? { type: "fa", className: cfg.buttonIconClass || "fa fa-share-alt", position: "before", size: 16 }
                        : { type: "none" };
                return {
                    text: cfg.buttonShowLabel === true ? label : "",
                    title: label,
                    icon: icon,
                    style: { fontSize: "14px", fontWeight: "600", color: "#212529" }
                };
            },
            previewDraft: function (draft) {
                if (!adapter) throw new Error("visual_preview_wrong_page");
                const before = clone(state.config || DEFAULT_CONFIG);
                state.config = clone(draft || DEFAULT_CONFIG);
                rebuildAll();
                return function () {
                    state.config = before;
                    rebuildAll();
                };
            }
        });
        return true;
    }

    function registerWithPMK() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return false;
        window.PMKConfig.registerModule(moduleDefinition());
        registerVisualEditorWithPMK();
        return true;
    }

    registerWithPMK();
    window.addEventListener("pmk:config-ready", registerWithPMK, { once: true });

    const adapter = Object.values(PAGE_ADAPTERS).find(function (candidate) {
        return candidate.matches();
    });

    /* Fail-safe et performance : aucune initialisation métier sur les autres pages. */
    if (!adapter) return;

    if (window.__PMK_EXTERNAL_LINKS_010__) {
        if (typeof window.__PMK_EXTERNAL_LINKS_010__.refresh === "function") {
            window.__PMK_EXTERNAL_LINKS_010__.refresh();
        }
        return;
    }

    const state = {
        adapter: adapter,
        config: clone(DEFAULT_CONFIG),
        observer: null,
        unsubscribe: null,
        rebuildTimer: null,
        outsideListenerAdded: false,
        viewportListenerAdded: false,
        currentOpenMenu: null,
        currentOpenButton: null,
        initialized: false
    };

    function pageIsEnabled(config) {
        if (!config || config.enabled === false) return false;
        const pages = Array.isArray(config.pages) ? config.pages : [];
        const page = pages.find(function (item) {
            return item && item.pageId === adapter.id;
        });
        return Boolean(page && page.enabled !== false);
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .${SOURCE_HIDDEN_CLASS} {
                display: none !important;
            }
            .${GENERATED_HOST_CLASS} {
                display: inline;
            }
            .${WRAPPER_CLASS} {
                display: inline-flex;
                align-items: center;
                gap: .15rem;
                margin-left: .25rem;
                vertical-align: middle;
            }
            .${TOGGLE_CLASS} {
                display: inline-flex !important;
                align-items: center;
                justify-content: center;
                gap: .38rem;
                max-width: 100%;
                white-space: nowrap;
            }
            .${TOGGLE_CLASS}.pmk-external-links-icon-only {
                width: 40px;
                min-width: 40px;
                height: 40px;
                min-height: 40px;
                padding: 5px !important;
            }
            .${TOGGLE_CLASS} .pmk-external-links-button-image {
                width: 20px;
                height: 20px;
                max-width: 20px;
                max-height: 20px;
                object-fit: contain;
                display: block;
                flex: 0 0 auto;
            }
            .${TOGGLE_CLASS} .pmk-external-links-label {
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .${MENU_CLASS} {
                position: fixed;
                z-index: 1085;
                display: none;
                min-width: 12rem;
                max-width: min(26rem, calc(100vw - 1rem));
                max-height: min(70vh, 34rem);
                overflow: auto;
                padding: .35rem 0;
                margin: 0;
                background: var(--bs-body-bg, #fff);
                color: var(--bs-body-color, #212529);
                border: 1px solid rgba(0, 0, 0, .18);
                border-radius: .35rem;
                box-shadow: 0 .35rem 1rem rgba(0, 0, 0, .16);
                list-style: none;
                box-sizing: border-box;
            }
            .${MENU_CLASS}.is-open {
                display: block;
            }
            .${MENU_CLASS} > li {
                display: block;
                margin: 0;
                padding: 0;
                list-style: none;
            }
            .${MENU_CLASS} > li > a {
                display: flex;
                align-items: center;
                gap: .5rem;
                width: 100%;
                min-width: 0;
                min-height: 2.2rem;
                padding: .45rem .75rem;
                color: inherit;
                text-decoration: none;
                overflow-wrap: anywhere;
                box-sizing: border-box;
            }
            .${MENU_CLASS} > li > a:hover,
            .${MENU_CLASS} > li > a:focus {
                background: rgba(13, 110, 253, .08);
                text-decoration: none;
                outline: none;
            }
            .${MENU_CLASS} img,
            .${MENU_CLASS} .pmk-external-links-custom-image {
                max-width: 1.35rem;
                max-height: 1.35rem;
                width: auto;
                height: auto;
                object-fit: contain;
                flex: 0 0 auto;
            }
            .${MENU_CLASS} .pmk-external-links-custom-icon {
                width: 1.35rem;
                text-align: var(--pmk-ext-text-align, center);
                flex: 0 0 auto;
            }
            .${MENU_CLASS} .pmk-external-links-custom-label {
                min-width: 0;
                overflow-wrap: anywhere;
            }
            @media (max-width: 576px) {
                .${TOGGLE_CLASS} {
                    min-height: 2.25rem;
                }
                .${MENU_CLASS} {
                    max-width: calc(100vw - .75rem);
                }
            }
            .pmk-external-links-inline {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: var(--pmk-ext-gap, 6px);
                margin: 4px 0 8px;
                padding: 0;
                list-style: none;
            }
            .pmk-external-links-inline.is-grid {
                display: grid;
                grid-template-columns: repeat(var(--pmk-ext-columns, 2), minmax(0, 1fr));
            }
            .pmk-external-links-inline > li {
                margin: 0;
                padding: 0;
                list-style: none;
                min-width: 0;
            }
            .pmk-external-links-inline > li > a {
                display: flex;
                align-items: center;
                justify-content: var(--pmk-ext-link-justify, center);
                gap: var(--pmk-ext-icon-gap, 4px);
                min-width: 0;
                width: 100%;
                box-sizing: border-box;
                padding: var(--pmk-ext-link-padding, 6px 8px);
                background: var(--pmk-ext-link-bg, #eceff1);
                color: var(--pmk-ext-link-color, #455a64);
                border: var(--pmk-ext-link-border, 0);
                border-radius: var(--pmk-ext-link-radius, 6px);
                font-size: var(--pmk-ext-link-size, .78em);
                font-weight: var(--pmk-ext-link-weight, 600);
                text-align: center;
                text-decoration: none;
                box-shadow: var(--pmk-ext-link-shadow, 0 1px 3px rgba(96,125,139,.18));
                transition: background .15s, color .15s, box-shadow .15s, transform .1s;
                overflow-wrap: anywhere;
            }
            .pmk-external-links-inline > li > a:hover,
            .pmk-external-links-inline > li > a:focus {
                background: var(--pmk-ext-link-hover-bg, #e1e6e9);
                color: var(--pmk-ext-link-hover-color, #455a64);
                box-shadow: var(--pmk-ext-link-hover-shadow, 0 2px 5px rgba(96,125,139,.24));
                transform: translateY(var(--pmk-ext-hover-y, -1px));
                text-decoration: none;
            }
            .pmk-external-links-inline img {
                width: auto;
                height: auto;
                max-width: 1.35rem;
                max-height: 1.35rem;
                border-radius: var(--pmk-ext-image-radius, 4px);
                box-shadow: var(--pmk-ext-image-shadow, 0 1px 3px rgba(0,0,0,.15));
                transition: transform .15s, box-shadow .15s;
                object-fit: contain;
            }
            .pmk-external-links-inline a:hover img,
            .pmk-external-links-inline a:focus img {
                transform: scale(var(--pmk-ext-image-scale, 1.12));
                box-shadow: var(--pmk-ext-image-hover-shadow, 0 3px 8px rgba(0,0,0,.25));
            }
            @media (max-width: 576px) {
                .pmk-external-links-inline.is-grid {
                    grid-template-columns: 1fr;
                }
            }

            #pmk-search-else {
                display: block;
                width: 100%;
                box-sizing: border-box;
                margin: .5rem 0 1rem;
                border: 1px solid #cfd8d1;
                border-radius: .45rem;
                background: #fff;
                overflow: hidden;
            }
            #pmk-search-else .pmk-search-else-title {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: .5rem;
                margin: 0;
                padding: .55rem .7rem;
                font-size: .92rem;
                font-weight: 700;
                background: #e9f1eb;
                border-bottom: 1px solid #cfd8d1;
            }
            #pmk-search-else .pmk-search-else-query {
                display: block;
                padding: .45rem .7rem 0;
                color: #59636b;
                font-size: .8rem;
                overflow-wrap: anywhere;
            }
            #pmk-search-else .pmk-search-else-links {
                display: flex;
                flex-direction: column;
                gap: .15rem;
                margin: 0;
                padding: .45rem .6rem .6rem;
                list-style: none;
            }
            #pmk-search-else.pmk-search-else-buttons .pmk-search-else-links {
                flex-direction: row;
                flex-wrap: wrap;
                gap: .4rem;
            }
            #pmk-search-else .pmk-search-else-link {
                display: inline-flex;
                align-items: center;
                gap: .4rem;
                min-width: 0;
                padding: .28rem .35rem;
                text-decoration: none;
                overflow-wrap: anywhere;
            }
            #pmk-search-else.pmk-search-else-buttons .pmk-search-else-link {
                border: 1px solid #ced4da;
                border-radius: .35rem;
                background: #f8f9fa;
                padding: .35rem .55rem;
            }
            #pmk-search-else .pmk-search-else-image {
                width: 20px;
                height: 20px;
                object-fit: contain;
                flex: 0 0 auto;
            }
            @media (max-width: 768px) {
                #pmk-search-else { margin: .65rem 0; }
                #pmk-search-else .pmk-search-else-links { gap: .3rem; }
                #pmk-search-else .pmk-search-else-link { min-height: 38px; }
            }
        `;
        document.head.appendChild(style);
    }

    function normalizeAnchor(anchor) {
        if (!anchor || !anchor.getAttribute) return null;
        const rawHref = cleanText(anchor.getAttribute("href"));
        if (!rawHref || rawHref === "#" || /^javascript:/i.test(rawHref) || /^data:/i.test(rawHref)) return null;
        return anchor;
    }

    function safeImageUrl(value) {
        const raw = cleanText(value);
        if (!raw) return "";
        if (/^data:image\//i.test(raw)) return raw;
        if (/^(https?:)?\/\//i.test(raw)) return raw;
        if (/^(\/|\.\/|\.\.\/)/.test(raw)) return raw;
        return "";
    }

    function sanitizeFaClasses(value, fallback) {
        const classes = cleanText(value)
            .split(/\s+/)
            .filter(function (part) {
                return /^[a-z0-9_-]+$/i.test(part);
            });
        if (!classes.length) return fallback || "fa fa-external-link";
        return classes.join(" ");
    }

    function sourceEntries(section) {
        if (!state.config.includeExistingLinks) return [];

        const entries = [];
        const seen = new Set();
        const mode = state.config.existingLinksMode === "all" ? "all" : "historical";

        section.querySelectorAll("li").forEach(function (li) {
            if (mode === "historical") {
                const historicalMatch =
                    li.querySelector('a[target="_blank"]') ||
                    li.querySelector("img");
                if (!historicalMatch) return;
            }

            const anchor = normalizeAnchor(li.querySelector("a[href]"));
            if (!anchor) return;

            const key = cleanText(anchor.href || anchor.getAttribute("href"));
            if (seen.has(key)) return;
            seen.add(key);
            entries.push({
                kind: "existing",
                source: li,
                anchor: anchor,
                hrefKey: key
            });
        });

        /*
         * Le mode "all" accepte aussi les structures sans <li>.
         * Le mode historique reste strictement compatible avec l'ancien script.
         */
        if (mode === "all" && !entries.length) {
            section.querySelectorAll("a[href]").forEach(function (anchor) {
                const valid = normalizeAnchor(anchor);
                if (!valid) return;
                const key = cleanText(valid.href || valid.getAttribute("href"));
                if (seen.has(key)) return;
                seen.add(key);
                entries.push({
                    kind: "existing",
                    source: valid,
                    anchor: valid,
                    hrefKey: key
                });
            });
        }

        return entries;
    }

    function sanitizeClonedAnchor(anchor) {
        if (!anchor) return;
        anchor.removeAttribute("id");
        anchor.querySelectorAll("[id]").forEach(function (node) {
            node.removeAttribute("id");
        });

        if (anchor.getAttribute("target") === "_blank") {
            const rel = new Set(cleanText(anchor.getAttribute("rel")).split(/\s+/).filter(Boolean));
            rel.add("noopener");
            rel.add("noreferrer");
            anchor.setAttribute("rel", Array.from(rel).join(" "));
        }

        const visibleText = cleanText(anchor.textContent);
        if (!visibleText && !anchor.getAttribute("aria-label")) {
            const image = anchor.querySelector("img[alt]");
            const imageAlt = image ? cleanText(image.getAttribute("alt")) : "";
            if (imageAlt) {
                anchor.setAttribute("aria-label", imageAlt);
            } else {
                try {
                    anchor.setAttribute("aria-label", new URL(anchor.href, window.location.href).hostname);
                } catch (_) {
                    anchor.setAttribute("aria-label", buttonLabel(state.config));
                }
            }
        }
    }

    function existingMenuItem(entry) {
        if (entry.source && String(entry.source.tagName || "").toLowerCase() === "li") {
            const item = entry.source.cloneNode(true);

            /*
             * Le <li> source est masqué juste avant sa copie dans le menu PMK.
             * cloneNode() recopie donc aussi SOURCE_HIDDEN_CLASS : le clone
             * devient invisible à son tour. C'était particulièrement visible
             * avec Electre, souvent repris depuis le lien historique Koha alors
             * que Babelio/Google étaient reconstruits comme liens custom.
             */
            item.classList.remove(SOURCE_HIDDEN_CLASS);
            item.removeAttribute("data-pmk-external-links-source");
            delete item.dataset.pmkExternalLinksSource;

            item.removeAttribute("id");
            item.querySelectorAll("[id]").forEach(function (node) {
                node.removeAttribute("id");
            });
            item.querySelectorAll("a[href]").forEach(sanitizeClonedAnchor);
            return item;
        }

        const item = document.createElement("li");
        const cloned = entry.anchor.cloneNode(true);
        sanitizeClonedAnchor(cloned);
        item.appendChild(cloned);
        return item;
    }

    function sectionRecordRoot(section) {
        if (adapter.id === "catalogue.detail") return document;

        return (
            section.closest("tr") ||
            section.closest('[id^="title_summary_"]') ||
            section.closest(".bibliocol") ||
            section.parentElement ||
            document
        );
    }

    function firstElement(root, selectors) {
        if (!root || !root.querySelector) return null;
        for (const selector of selectors) {
            const found = root.querySelector(selector);
            if (found) return found;
        }
        return null;
    }

    function firstText(root, selectors) {
        const element = firstElement(root, selectors);
        return element ? cleanText(element.textContent) : "";
    }

    function firstAttribute(root, selectors, attribute) {
        const element = firstElement(root, selectors);
        return element ? cleanText(element.getAttribute(attribute)) : "";
    }

    function parseCoins(root) {
        const output = {};
        if (!root || !root.querySelector) return output;

        const coin = root.querySelector(".Z3988[title]");
        if (!coin) return output;

        const raw = cleanText(coin.getAttribute("title")).replace(/&amp;/g, "&");
        if (!raw) return output;

        try {
            const params = new URLSearchParams(raw);
            params.forEach(function (value, key) {
                if (!(key in output) && cleanText(value)) output[key] = cleanText(value);
            });
        } catch (_) {
            return {};
        }
        return output;
    }

    function isbnDigits(value) {
        return cleanText(value)
            .replace(/^ISBN(?:-1[03])?\s*:?\s*/i, "")
            .replace(/[^0-9Xx]/g, "")
            .toUpperCase();
    }

    function issnDigits(value) {
        const raw = cleanText(value).replace(/^ISSN\s*:?\s*/i, "");
        const compact = raw.replace(/[^0-9Xx]/g, "").toUpperCase();
        if (compact.length !== 8) return compact;
        return compact.slice(0, 4) + "-" + compact.slice(4);
    }

    function isbn10To13(value) {
        const isbn10 = isbnDigits(value);
        if (!/^[0-9]{9}[0-9X]$/.test(isbn10)) return "";

        const base = "978" + isbn10.slice(0, 9);
        let sum = 0;
        for (let i = 0; i < 12; i += 1) {
            sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
        }
        const check = (10 - (sum % 10)) % 10;
        return base + String(check);
    }

    function isbn13To10(value) {
        const isbn13 = isbnDigits(value);
        if (!/^978[0-9]{10}$/.test(isbn13)) return "";

        const body = isbn13.slice(3, 12);
        let sum = 0;
        for (let i = 0; i < 9; i += 1) {
            sum += Number(body[i]) * (10 - i);
        }
        const remainder = 11 - (sum % 11);
        const check = remainder === 10 ? "X" : (remainder === 11 ? "0" : String(remainder));
        return body + check;
    }

    function extractFormattedIsbn(root) {
        if (!root) return "";

        const direct = firstText(root, [
            ".isbn-result",
            ".tech-isbn",
            ".isbn",
            ".ISBN"
        ]);
        if (direct) {
            const match = direct.match(/(?:ISBN(?:-1[03])?\s*:?\s*)?([0-9Xx][0-9Xx\s-]{8,20})/i);
            if (match) return cleanText(match[1]).replace(/\s+/g, "");
        }

        const dataIsbn = firstAttribute(root, ["[data-isbn]"], "data-isbn");
        if (dataIsbn) return cleanText(dataIsbn).replace(/\s+/g, "");

        const text = cleanText(root.textContent);
        const match = text.match(/\bISBN(?:-1[03])?\s*:?\s*([0-9Xx][0-9Xx\s-]{8,20})/i);
        return match ? cleanText(match[1]).replace(/\s+/g, "") : "";
    }

    function existingElectreHref(root) {
        if (!root || !root.querySelector) return "";
        const anchor = root.querySelector(
            'a[href*="electre-ng.com/#/search"], a[href*="electre-ng.com"][href*="identifiant"]'
        );
        return anchor ? cleanText(anchor.href || anchor.getAttribute("href")) : "";
    }

    function isbnFromElectreHref(root) {
        const href = existingElectreHref(root);
        if (!href) return "";
        let decoded = href;
        try { decoded = decodeURIComponent(href); } catch (_) {}
        const match = decoded.match(/identifiant\s*:\s*["“]?([^"&)%]+)["”]?/i);
        if (!match) return "";
        return cleanText(match[1]).replace(/\s+/g, "");
    }

    function electreCompatibleIsbn(formatted, isbn, isbn13) {
        let value = cleanText(formatted);
        const compact = isbnDigits(value || isbn);
        if (compact.length === 13) return value || compact;
        if (compact.length === 10 && isbn13) return cleanText(isbn13);
        return value || cleanText(isbn13) || cleanText(isbn);
    }

    function extractBiblionumber(root) {
        if (adapter.id === "catalogue.detail") {
            try {
                const value = new URLSearchParams(window.location.search).get("biblionumber");
                if (value) return cleanText(value);
            } catch (_) {
                /* silence */
            }
        }

        const titleSummary =
            (root && root.matches && root.matches('[id^="title_summary_"]') ? root : null) ||
            (root && root.querySelector ? root.querySelector('[id^="title_summary_"]') : null);

        if (titleSummary && /^title_summary_(\d+)$/.test(titleSummary.id || "")) {
            return RegExp.$1;
        }

        const checkbox = firstElement(root, [
            'input[name="biblionumber"][value]',
            'input.cb[value]'
        ]);
        if (checkbox && cleanText(checkbox.value)) return cleanText(checkbox.value);

        const detailLink = firstElement(root, [
            'a.title[href*="biblionumber="]',
            'a[href*="/catalogue/detail.pl?biblionumber="]',
            'a[href*="detail.pl?biblionumber="]'
        ]);
        if (detailLink) {
            try {
                return cleanText(new URL(detailLink.href, window.location.href).searchParams.get("biblionumber"));
            } catch (_) {
                /* silence */
            }
        }

        return "";
    }

    function extractStandardNumberFromText(root, label) {
        if (!root) return "";
        const text = cleanText(root.textContent);
        if (!text) return "";

        if (label === "ISBN") {
            const match = text.match(/\bISBN(?:-1[03])?\s*:?\s*([0-9Xx][0-9Xx\s-]{8,20})/i);
            return match ? isbnDigits(match[1]) : "";
        }
        if (label === "ISSN") {
            const match = text.match(/\bISSN\s*:?\s*([0-9Xx]{4}\s*-?\s*[0-9Xx]{4})/i);
            return match ? issnDigits(match[1]) : "";
        }
        return "";
    }

    function recordContext(section) {
        const root = sectionRecordRoot(section);
        const coins = parseCoins(root);

        let biblionumber = extractBiblionumber(root);

        let title =
            cleanText(coins["rft.title"]) ||
            cleanText(coins["rft.btitle"]) ||
            firstText(root, [
                "a.title",
                ".title",
                'a[href*="/catalogue/detail.pl?biblionumber="]',
                'a[href*="detail.pl?biblionumber="]'
            ]);

        let author =
            cleanText(coins["rft.au"]) ||
            [coins["rft.aulast"], coins["rft.aufirst"]].filter(Boolean).join(" ").trim() ||
            firstText(root, [
                ".author.resource_list a",
                ".author a",
                ".author",
                ".byAuthor + .author",
                '[class*="author"] a'
            ]);

        const bibliographicRoot =
            adapter.id === "catalogue.detail"
                ? (document.querySelector("#catalogue_detail_biblio") || root)
                : root;

        const formattedIsbnFromDom = extractFormattedIsbn(bibliographicRoot);
        const legacyElectreIsbn = isbnFromElectreHref(bibliographicRoot);

        const isbnSourceText =
            cleanText(legacyElectreIsbn) ||
            cleanText(coins["rft.isbn"]) ||
            cleanText(formattedIsbnFromDom) ||
            cleanText(firstText(bibliographicRoot, [".isbn-result", ".tech-isbn", ".isbn", ".ISBN"])) ||
            cleanText(firstAttribute(bibliographicRoot, ["[data-isbn]"], "data-isbn"));

        let isbn =
            isbnDigits(isbnSourceText) ||
            extractStandardNumberFromText(bibliographicRoot, "ISBN");

        let isbnFormatted = cleanText(legacyElectreIsbn || formattedIsbnFromDom || isbnSourceText)
            .replace(/^ISBN(?:-1[03])?\s*:?\s*/i, "")
            .replace(/\s+/g, "")
            .trim();
        if (!isbnFormatted) isbnFormatted = isbn;

        let issn =
            issnDigits(coins["rft.issn"]) ||
            issnDigits(firstText(root, [".issn", ".ISSN"])) ||
            extractStandardNumberFromText(root, "ISSN");

        let controlnumber =
            cleanText(coins["rft_id"]) ||
            firstText(root, [".control-number", ".controlnumber", ".controlNumber"]);

        let oclc = "";
        const possibleOclc = [
            coins["rft.oclcnum"],
            coins["oclcnum"],
            controlnumber
        ].filter(Boolean).join(" ");
        const oclcMatch = cleanText(possibleOclc).match(/(?:OCoLC|oclcnum[\/:=]?|OCLC\s*)?(\d{5,})/i);
        if (oclcMatch) oclc = oclcMatch[1];

        const isbn10 =
            isbn.length === 10
                ? isbn
                : (isbn.length === 13 ? isbn13To10(isbn) : "");
        const isbn13 =
            isbn.length === 13
                ? isbn
                : (isbn.length === 10 ? isbn10To13(isbn) : "");

        // Electre attend un identifiant exploitable. Lorsque Koha ne fournit
        // qu'un ISBN10 dans data-isbn, on bascule vers l'ISBN13 calculé.
        isbnFormatted = electreCompatibleIsbn(isbnFormatted, isbn, isbn13);

        const ean =
            cleanText(firstAttribute(root, ["[data-ean]"], "data-ean")).replace(/\D/g, "") ||
            isbn13;

        if (!title && adapter.id === "catalogue.detail") {
            title = firstText(document, [
                "#catalogue_detail_biblio h1",
                "#catalogue_detail_biblio a.title",
                "#catalogue_detail_biblio .title"
            ]);
        }

        if (!author && adapter.id === "catalogue.detail") {
            author = firstText(document, [
                "#catalogue_detail_biblio .author.resource_list a",
                "#catalogue_detail_biblio .author a",
                "#catalogue_detail_biblio .author"
            ]);
        }

        const query = [title, author].filter(Boolean).join(" ");

        return {
            BIBLIONUMBER: cleanText(biblionumber),
            TITLE: cleanText(title),
            AUTHOR: cleanText(author),
            ISBN: cleanText(isbn),
            ISBN_FORMATTED: cleanText(isbnFormatted),
            ISBN10: cleanText(isbn10),
            ISBN13: cleanText(isbn13),
            ISSN: cleanText(issn),
            EAN: cleanText(ean),
            CONTROLNUMBER: cleanText(controlnumber),
            OCLC_NO: cleanText(oclc),
            QUERY: cleanText(query),
            CURRENT_URL: window.location.href
        };
    }

    function renderUrlTemplate(template, context) {
        const rawTemplate = cleanText(template);
        if (!rawTemplate) return null;

        let missing = false;
        const rendered = rawTemplate.replace(/\{([A-Z0-9_]+)\}/gi, function (_match, rawKey) {
            let key = String(rawKey || "").toUpperCase();
            let rawMode = false;

            if (key.endsWith("_RAW")) {
                rawMode = true;
                key = key.slice(0, -4);
            }

            if (!TEMPLATE_TOKENS.includes(key)) {
                missing = true;
                return "";
            }

            const value = cleanText(context[key]);
            if (!value) {
                missing = true;
                return "";
            }

            return rawMode ? value : encodeURIComponent(value);
        });

        if (missing) return null;
        if (/\{[A-Z0-9_]+\}/i.test(rendered)) return null;

        try {
            const url = new URL(rendered, window.location.href);
            if (!["http:", "https:", "mailto:", "tel:", "ftp:"].includes(url.protocol)) return null;
            return url.href;
        } catch (_) {
            return null;
        }
    }

    function scopeMatches(link) {
        return link.scope === "all" || link.scope === adapter.id;
    }

    function customEntries(section) {
        const links = Array.isArray(state.config.customLinks)
            ? state.config.customLinks
            : [];

        if (!links.length) return [];

        const context = recordContext(section);
        const entries = [];

        links.forEach(function (link, index) {
            if (!link || link.enabled === false || !scopeMatches(link)) return;

            let href = renderUrlTemplate(link.urlTemplate, context);

            // Sécurisation Electre : si un lien historique existe déjà dans
            // le DOM, on le réutilise directement. Cela évite de perdre
            // Electre quand un XSLT Koha expose l'identifiant différemment.
            if (!href && cleanText(link.id).toLowerCase() === "electre") {
                href = existingElectreHref(sectionRecordRoot(section)) ||
                    existingElectreHref(section) ||
                    "";
            }
            if (!href) return;

            const label = customLinkLabel(link);
            if (!label) return;

            entries.push({
                kind: "custom",
                index: index,
                href: href,
                hrefKey: href,
                label: label,
                link: link
            });
        });

        return entries;
    }

    function customMenuItem(entry) {
        const link = entry.link || {};
        const item = document.createElement("li");
        item.className = "pmk-external-links-custom-item";

        const anchor = document.createElement("a");
        anchor.href = entry.href;

        if (link.newWindow !== false) {
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
        }

        const iconType = ["fa", "image"].includes(link.iconType) ? link.iconType : "none";

        if (iconType === "fa") {
            const icon = document.createElement("i");
            icon.className = sanitizeFaClasses(link.iconClass, "fa fa-external-link") +
                " pmk-external-links-custom-icon";
            icon.setAttribute("aria-hidden", "true");
            anchor.appendChild(icon);
        } else if (iconType === "image") {
            const src = safeImageUrl(link.imageUrl);
            if (src) {
                const image = document.createElement("img");
                image.className = "pmk-external-links-custom-image";
                image.src = src;
                image.alt = "";
                image.setAttribute("aria-hidden", "true");
                anchor.appendChild(image);
            }
        }

        if (link.showLabel !== false) {
            const label = document.createElement("span");
            label.className = "pmk-external-links-custom-label";
            label.textContent = entry.label;
            anchor.appendChild(label);
        } else {
            anchor.setAttribute("aria-label", entry.label);
            anchor.title = entry.label;
        }

        /*
         * Si l'utilisateur demande volontairement "icône seule" mais qu'aucune
         * illustration exploitable n'est disponible, on conserve le texte pour
         * éviter un lien visuellement vide.
         */
        if (link.showLabel === false && !anchor.children.length) {
            const fallback = document.createElement("span");
            fallback.className = "pmk-external-links-custom-label";
            fallback.textContent = entry.label;
            anchor.appendChild(fallback);
        }

        item.appendChild(anchor);
        return item;
    }

    function closeCurrentMenu(returnFocus) {
        const menu = state.currentOpenMenu;
        const button = state.currentOpenButton;
        if (!menu) return;

        menu.classList.remove("is-open");
        menu.setAttribute("aria-hidden", "true");
        if (button) button.setAttribute("aria-expanded", "false");

        state.currentOpenMenu = null;
        state.currentOpenButton = null;

        if (returnFocus && button && document.contains(button)) {
            button.focus();
        }
    }

    function positionMenu(button, menu) {
        if (!button || !menu || !menu.classList.contains("is-open")) return;

        const viewportPadding = 6;
        const gap = 4;
        const rect = button.getBoundingClientRect();

        menu.style.visibility = "hidden";
        menu.style.left = "0px";
        menu.style.top = "0px";
        menu.style.width = "";

        const menuRect = menu.getBoundingClientRect();
        const width = Math.min(
            Math.max(menuRect.width || 192, Math.min(rect.width, 192)),
            Math.max(160, window.innerWidth - (viewportPadding * 2))
        );

        menu.style.width = width + "px";

        let left = rect.right - width;
        left = Math.max(viewportPadding, Math.min(left, window.innerWidth - width - viewportPadding));

        const measuredHeight = menu.getBoundingClientRect().height;
        let top = rect.bottom + gap;
        if (
            top + measuredHeight > window.innerHeight - viewportPadding &&
            rect.top - measuredHeight - gap >= viewportPadding
        ) {
            top = rect.top - measuredHeight - gap;
        }

        top = Math.max(
            viewportPadding,
            Math.min(top, window.innerHeight - measuredHeight - viewportPadding)
        );

        menu.style.left = Math.round(left) + "px";
        menu.style.top = Math.round(top) + "px";
        menu.style.visibility = "visible";
    }

    function openMenu(button, menu, focusFirst) {
        if (state.currentOpenMenu && state.currentOpenMenu !== menu) {
            closeCurrentMenu(false);
        }

        menu.classList.add("is-open");
        menu.setAttribute("aria-hidden", "false");
        button.setAttribute("aria-expanded", "true");
        state.currentOpenMenu = menu;
        state.currentOpenButton = button;
        positionMenu(button, menu);

        if (focusFirst) {
            const first = menu.querySelector("a[href]");
            if (first) first.focus();
        }
    }

    function toggleMenu(button, menu) {
        if (menu.classList.contains("is-open")) closeCurrentMenu(false);
        else openMenu(button, menu, false);
    }

    function installGlobalListeners() {
        if (!state.outsideListenerAdded) {
            document.addEventListener("click", function (event) {
                const target = event.target;
                if (
                    target &&
                    target.closest &&
                    (
                        target.closest("." + WRAPPER_CLASS) ||
                        target.closest("." + MENU_CLASS)
                    )
                ) {
                    return;
                }
                closeCurrentMenu(false);
            });

            document.addEventListener("keydown", function (event) {
                if (event.key === "Escape" && state.currentOpenMenu) {
                    event.preventDefault();
                    closeCurrentMenu(true);
                }
            });
            state.outsideListenerAdded = true;
        }

        if (!state.viewportListenerAdded) {
            let resizeTimer = null;
            let lastCompactState = null;
            const reposition = function () {
                if (state.currentOpenMenu && state.currentOpenButton) {
                    positionMenu(state.currentOpenButton, state.currentOpenMenu);
                }

                const cfg = state.config && state.config.searchElse ? state.config.searchElse : null;
                const breakpoint = Math.max(320, Number(cfg && cfg.mobileBreakpoint) || 768);
                const compact = window.innerWidth <= breakpoint;
                if (lastCompactState === null) {
                    lastCompactState = compact;
                    return;
                }
                if (compact !== lastCompactState) {
                    lastCompactState = compact;
                    if (resizeTimer !== null) window.clearTimeout(resizeTimer);
                    resizeTimer = window.setTimeout(function () {
                        resizeTimer = null;
                        scheduleRebuild();
                    }, 120);
                }
            };
            window.addEventListener("resize", reposition, { passive: true });
            window.addEventListener("scroll", reposition, { passive: true, capture: true });
            reposition();
            state.viewportListenerAdded = true;
        }
    }

    function createButtonVisual(button, config) {
        const label = buttonLabel(config);
        const type = ["fa", "image"].includes(config.buttonVisualType)
            ? config.buttonVisualType
            : "none";

        let visualAdded = false;

        if (type === "fa") {
            const icon = document.createElement("i");
            icon.className = sanitizeFaClasses(config.buttonIconClass, "fa fa-external-link");
            icon.setAttribute("aria-hidden", "true");
            button.appendChild(icon);
            visualAdded = true;
        } else if (type === "image") {
            const src = safeImageUrl(config.buttonImageUrl);
            if (src) {
                const image = document.createElement("img");
                image.className = "pmk-external-links-button-image";
                image.src = src;
                image.alt = "";
                image.setAttribute("aria-hidden", "true");
                image.addEventListener("error", function () {
                    if (!document.contains(image)) return;
                    const fallback = document.createElement("i");
                    fallback.className = "fa fa-external-link";
                    fallback.setAttribute("aria-hidden", "true");
                    image.replaceWith(fallback);
                }, { once: true });
                button.appendChild(image);
                visualAdded = true;
            }
        }

        if (config.buttonShowLabel !== false) {
            const text = document.createElement("span");
            text.className = "pmk-external-links-label";
            text.textContent = label;
            button.appendChild(text);
        } else {
            button.classList.add("pmk-external-links-icon-only");
        }

        if (!visualAdded && config.buttonShowLabel === false) {
            const fallback = document.createElement("i");
            fallback.className = "fa fa-external-link";
            fallback.setAttribute("aria-hidden", "true");
            button.appendChild(fallback);
        }

        if (config.buttonShowCaret === true) {
            const caret = document.createElement("i");
            caret.className = "fa fa-caret-down";
            caret.setAttribute("aria-hidden", "true");
            button.appendChild(caret);
        }
    }

    function customLinksPotentiallyActive() {
        const links = Array.isArray(state.config.customLinks)
            ? state.config.customLinks
            : [];
        return links.some(function (link) {
            return link && link.enabled !== false && scopeMatches(link);
        });
    }

    function ensureGeneratedHosts() {
        if (!customLinksPotentiallyActive()) return;

        if (adapter.id === "catalogue.detail") {
            if (document.querySelector(adapter.sectionSelector)) return;
            if (document.querySelector("." + GENERATED_HOST_CLASS)) return;

            const target =
                document.querySelector("#catalogue_detail_biblio .page-section") ||
                document.querySelector("#catalogue_detail_biblio");
            if (!target) return;

            const host = document.createElement("span");
            host.className = GENERATED_HOST_CLASS;
            host.dataset.pmkExternalLinksGenerated = "1";
            target.appendChild(host);
            return;
        }

        const resultBlocks = Array.from(
            document.querySelectorAll('[id^="title_summary_"]')
        );

        resultBlocks.forEach(function (result) {
            if (result.querySelector(adapter.sectionSelector)) return;
            if (result.querySelector("." + GENERATED_HOST_CLASS)) return;

            const host = document.createElement("span");
            host.className = GENERATED_HOST_CLASS;
            host.dataset.pmkExternalLinksGenerated = "1";
            result.appendChild(host);
        });
    }

    function collectSections() {
        ensureGeneratedHosts();
        return Array.from(
            document.querySelectorAll(
                adapter.sectionSelector + ", ." + GENERATED_HOST_CLASS
            )
        );
    }

    function buildInlinePresentation(section, index, entries, pageConfig) {
        const uid =
            "pmk-external-links-" +
            adapter.id.replace(/[^a-z0-9]+/gi, "-") +
            "-" + index + "-" + Math.random().toString(36).slice(2, 8);

        const list = document.createElement("ul");
        list.className = "pmk-external-links-inline" +
            (pageConfig.presentation === "inline-grid" ? " is-grid" : "");
        list.dataset.pmkExternalLinksOwner = uid;
        list.style.setProperty("--pmk-ext-columns", String(Math.max(1, Math.min(8, Number(pageConfig.columns) || 2))));
        list.style.setProperty("--pmk-ext-gap", cleanText(pageConfig.gap) || "6px");
        list.style.setProperty("--pmk-ext-link-padding", cleanText(pageConfig.linkPadding) || "6px 8px");
        list.style.setProperty("--pmk-ext-link-justify", cleanText(pageConfig.linkJustifyContent) || "center");
        list.style.setProperty("--pmk-ext-text-align", cleanText(pageConfig.linkTextAlign) || "center");
        list.style.setProperty("--pmk-ext-icon-gap", cleanText(pageConfig.iconGap) || "4px");
        list.style.setProperty("--pmk-ext-link-bg", cleanText(pageConfig.linkBackground) || "#eceff1");
        list.style.setProperty("--pmk-ext-link-hover-bg", cleanText(pageConfig.linkHoverBackground) || "#e1e6e9");
        list.style.setProperty("--pmk-ext-link-color", cleanText(pageConfig.linkColor) || "#455a64");
        list.style.setProperty("--pmk-ext-link-hover-color", cleanText(pageConfig.linkHoverColor) || cleanText(pageConfig.linkColor) || "#455a64");
        list.style.setProperty("--pmk-ext-link-border", cleanText(pageConfig.linkBorder) || "0");
        list.style.setProperty("--pmk-ext-link-radius", cleanText(pageConfig.linkBorderRadius) || "6px");
        list.style.setProperty("--pmk-ext-link-size", cleanText(pageConfig.linkFontSize) || "0.78em");
        list.style.setProperty("--pmk-ext-link-weight", cleanText(pageConfig.linkFontWeight) || "600");
        list.style.setProperty("--pmk-ext-link-shadow", cleanText(pageConfig.linkBoxShadow) || "0 1px 3px rgba(96,125,139,0.18)");
        list.style.setProperty("--pmk-ext-link-hover-shadow", cleanText(pageConfig.linkHoverBoxShadow) || "0 2px 5px rgba(96,125,139,0.24)");
        list.style.setProperty("--pmk-ext-hover-y", cleanText(pageConfig.hoverTranslateY) || "-1px");
        list.style.setProperty("--pmk-ext-image-radius", cleanText(pageConfig.imageRadius) || "4px");
        list.style.setProperty("--pmk-ext-image-shadow", cleanText(pageConfig.imageBoxShadow) || "0 1px 3px rgba(0,0,0,0.15)");
        list.style.setProperty("--pmk-ext-image-hover-shadow", cleanText(pageConfig.imageHoverBoxShadow) || "0 3px 8px rgba(0,0,0,0.25)");
        list.style.setProperty("--pmk-ext-image-scale", String(Number(pageConfig.imageHoverScale) || 1.12));

        entries.forEach(function (entry) {
            let item;
            if (entry.kind === "existing") {
                if (entry.source) {
                    entry.source.classList.add(SOURCE_HIDDEN_CLASS);
                    entry.source.dataset.pmkExternalLinksSource = uid;
                }
                item = existingMenuItem(entry);
            } else {
                item = customMenuItem(entry);
            }
            if (!item) return;
            const anchor = item.querySelector("a[href]");
            if (anchor) anchor.removeAttribute("role");
            list.appendChild(item);
        });

        section.appendChild(list);
        section.dataset.pmkExternalLinksEnhanced = "1";
        return list;
    }


    function knownServiceKey(entry) {
        if (!entry) return "";

        if (entry.kind === "custom") {
            const customId = cleanText(entry.link && entry.link.id).toLowerCase();
            if (["electre", "babelio", "google"].includes(customId)) {
                return "service:" + customId;
            }
            if (customId) return "custom-id:" + customId;
        }

        const href = cleanText(
            entry.href ||
            entry.hrefKey ||
            (entry.anchor && (entry.anchor.href || entry.anchor.getAttribute("href")))
        );
        let extra = "";

        if (entry.anchor) {
            extra += " " + cleanText(entry.anchor.textContent);
            extra += " " + cleanText(entry.anchor.getAttribute("title"));
            extra += " " + cleanText(entry.anchor.getAttribute("aria-label"));
            entry.anchor.querySelectorAll("img").forEach(function (img) {
                extra += " " + cleanText(img.getAttribute("src"));
                extra += " " + cleanText(img.getAttribute("alt"));
                extra += " " + cleanText(img.getAttribute("title"));
            });
        }

        const fingerprint = (href + " " + extra).toLowerCase();

        // Babelio est historiquement lancé via une recherche Google :
        // on le détecte donc AVANT le service Google générique.
        if (/babelio/.test(fingerprint)) return "service:babelio";
        if (/electre(?:-ng)?\.com|electre/.test(fingerprint)) return "service:electre";
        if (/google\.[a-z.]+/.test(fingerprint)) return "service:google";

        return "";
    }

    function dedupeEntries(existing, custom) {
        const entries = [];
        const seenHref = new Set();
        const seenService = new Set();

        // Priorité aux liens historiques déjà produits par Koha/XSLT :
        // ils portent souvent l'identifiant exact attendu par le service.
        existing.concat(custom).forEach(function (entry) {
            const hrefKey = cleanText(entry && entry.hrefKey);
            const serviceKey = knownServiceKey(entry);

            if (!hrefKey) return;
            if (seenHref.has(hrefKey)) return;
            if (serviceKey && seenService.has(serviceKey)) return;

            seenHref.add(hrefKey);
            if (serviceKey) seenService.add(serviceKey);
            entries.push(entry);
        });

        return entries;
    }

    function enhanceSection(section, index) {
        if (!section || section.dataset.pmkExternalLinksEnhanced === "1") return null;

        const existing = section.matches(adapter.sectionSelector)
            ? sourceEntries(section)
            : [];
        const custom = customEntries(section);

        const entries = dedupeEntries(existing, custom);

        if (!entries.length) return null;

        const pageConfig = currentPagePresentation(state.config);
        if (pageConfig.presentation === "inline" || pageConfig.presentation === "inline-grid") {
            return buildInlinePresentation(section, index, entries, pageConfig);
        }

        const label = buttonLabel(state.config);
        const uid =
            "pmk-external-links-" +
            adapter.id.replace(/[^a-z0-9]+/gi, "-") +
            "-" +
            index +
            "-" +
            Math.random().toString(36).slice(2, 8);

        const wrapper = document.createElement("span");
        wrapper.className = WRAPPER_CLASS;
        wrapper.dataset.pmkPage = adapter.id;
        wrapper.dataset.pmkExternalLinksOwner = uid;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-default btn-sm " + TOGGLE_CLASS;
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-controls", uid + "-menu");
        button.setAttribute("aria-label", label);
        button.title = label;
        createButtonVisual(button, state.config);

        const menu = document.createElement("ul");
        menu.id = uid + "-menu";
        menu.className = MENU_CLASS;
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-hidden", "true");
        menu.dataset.pmkExternalLinksOwner = uid;

        entries.forEach(function (entry) {
            if (entry.kind === "existing") {
                if (entry.source) {
                    entry.source.classList.add(SOURCE_HIDDEN_CLASS);
                    entry.source.dataset.pmkExternalLinksSource = uid;
                }
                menu.appendChild(existingMenuItem(entry));
            } else {
                menu.appendChild(customMenuItem(entry));
            }
        });

        menu.querySelectorAll("a[href]").forEach(function (anchor) {
            anchor.setAttribute("role", "menuitem");
        });

        button.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            toggleMenu(button, menu);
        });

        button.addEventListener("keydown", function (event) {
            if (event.key === "ArrowDown") {
                event.preventDefault();
                openMenu(button, menu, true);
            }
        });

        menu.addEventListener("keydown", function (event) {
            const links = Array.from(menu.querySelectorAll("a[href]"));
            if (!links.length) return;
            const currentIndex = links.indexOf(document.activeElement);

            if (event.key === "ArrowDown") {
                event.preventDefault();
                links[(currentIndex + 1 + links.length) % links.length].focus();
            } else if (event.key === "ArrowUp") {
                event.preventDefault();
                links[(currentIndex - 1 + links.length) % links.length].focus();
            } else if (event.key === "Home") {
                event.preventDefault();
                links[0].focus();
            } else if (event.key === "End") {
                event.preventDefault();
                links[links.length - 1].focus();
            } else if (event.key === "Tab") {
                closeCurrentMenu(false);
            }
        });

        wrapper.appendChild(button);
        section.appendChild(wrapper);
        document.body.appendChild(menu);
        section.dataset.pmkExternalLinksEnhanced = "1";

        return button;
    }

    function cleanupEnhancements() {
        closeCurrentMenu(false);

        document.querySelectorAll("." + SOURCE_HIDDEN_CLASS).forEach(function (node) {
            node.classList.remove(SOURCE_HIDDEN_CLASS);
            delete node.dataset.pmkExternalLinksSource;
        });

        document.querySelectorAll("." + WRAPPER_CLASS).forEach(function (node) {
            node.remove();
        });

        document.querySelectorAll("." + MENU_CLASS).forEach(function (node) {
            node.remove();
        });

        document.querySelectorAll(".pmk-external-links-inline").forEach(function (node) {
            node.remove();
        });

        document.querySelectorAll('[data-pmk-external-links-enhanced="1"]').forEach(function (node) {
            delete node.dataset.pmkExternalLinksEnhanced;
        });

        document.querySelectorAll("." + GENERATED_HOST_CLASS).forEach(function (node) {
            node.remove();
        });

        document.querySelectorAll("#pmk-search-else").forEach(function (node) {
            node.remove();
        });
    }

    function searchElseBranchAllowed(link, branchCode) {
        const mode = cleanText(link && link.branchesMode) || "all";
        if (mode === "all") return true;
        const codes = cleanText(link && link.branchCodes)
            .split(/[\s,;]+/)
            .map(function (value) { return value.trim().toUpperCase(); })
            .filter(Boolean);
        const found = codes.includes(cleanText(branchCode).toUpperCase());
        return mode === "include" ? found : !found;
    }

    function getSearchContext() {
        const params = new URLSearchParams(window.location.search || "");
        const qValues = params.getAll("q").map(cleanText).filter(Boolean);
        const idxValues = params.getAll("idx").map(cleanText).filter(Boolean);
        let query = qValues.join(" ").trim();
        let index = idxValues.join(", ").trim();

        if (!query) {
            try { query = cleanText(localStorage.getItem("searchbox_value")); } catch (_) {}
        }
        if (!index) {
            try { index = cleanText(localStorage.getItem("cat_search_pulldown_selection")); } catch (_) {}
        }
        if (!query) {
            const field = document.querySelector("#cat-search-block #search-form, #search-form");
            if (field) query = cleanText(field.value);
        }
        if (!query) {
            const crumb = document.querySelector("#breadcrumbs");
            const textValue = cleanText(crumb && crumb.textContent);
            const match = textValue.match(/[«\"']([^«»\"']+)[»\"']/);
            if (match) query = cleanText(match[1]);
        }

        const branchNode = document.querySelector(".logged-in-branch-code");
        const branch = cleanText(branchNode && branchNode.textContent);
        return { QUERY: query, INDEX: index, BRANCH: branch, CURRENT_URL: window.location.href };
    }

    function renderSearchElseTemplate(template, context) {
        const rawTemplate = cleanText(template);
        if (!rawTemplate) return null;
        const allowed = ["QUERY", "INDEX", "BRANCH", "CURRENT_URL"];
        let invalid = false;
        const rendered = rawTemplate.replace(/\{([A-Z0-9_]+)\}/gi, function (_match, rawKey) {
            let key = String(rawKey || "").toUpperCase();
            let rawMode = false;
            if (key.endsWith("_RAW")) { rawMode = true; key = key.slice(0, -4); }
            if (!allowed.includes(key)) { invalid = true; return ""; }
            const value = cleanText(context[key]);
            if (!value && key === "QUERY") { invalid = true; return ""; }
            return rawMode ? value : encodeURIComponent(value);
        });
        if (invalid || /\{[A-Z0-9_]+\}/i.test(rendered)) return null;
        try {
            const url = new URL(rendered, window.location.href);
            if (!["http:", "https:"].includes(url.protocol)) return null;
            return url.href;
        } catch (_) { return null; }
    }

    function searchElsePlacementTarget(placement) {
        if (placement === "after-breadcrumbs") {
            const breadcrumbs = document.querySelector("#breadcrumbs");
            return breadcrumbs ? { target: breadcrumbs, mode: "after" } : null;
        }
        if (placement === "sidebar") {
            const aside = document.querySelector("aside");
            if (aside && !aside.closest(".liens_externes") && !aside.closest("." + WRAPPER_CLASS)) {
                return { target: aside, mode: "append" };
            }
        }
        const results = document.querySelector("#catalog_results, #bookbag_form, #searchresults");
        if (results) return { target: results, mode: "before" };
        const main = document.querySelector("main, #main");
        return main ? { target: main, mode: "prepend" } : null;
    }

    function placeSearchElse(block, placement) {
        let resolved = searchElsePlacementTarget(placement);
        if (!resolved && placement !== "before-results") resolved = searchElsePlacementTarget("before-results");
        if (!resolved) return false;
        if (resolved.target.closest && (resolved.target.closest(".liens_externes") || resolved.target.closest("." + WRAPPER_CLASS))) return false;
        if (resolved.mode === "after") resolved.target.insertAdjacentElement("afterend", block);
        else if (resolved.mode === "before") resolved.target.insertAdjacentElement("beforebegin", block);
        else if (resolved.mode === "prepend") resolved.target.prepend(block);
        else resolved.target.appendChild(block);
        return true;
    }

    function renderSearchElse() {
        document.querySelectorAll("#pmk-search-else").forEach(function (node) { node.remove(); });
        if (adapter.id !== "catalogue.search") return null;
        const cfg = state.config && state.config.searchElse ? state.config.searchElse : null;
        if (!cfg || cfg.enabled === false) return null;

        const context = getSearchContext();
        if (!context.QUERY) return null;
        const links = Array.isArray(cfg.links) ? cfg.links : [];
        const entries = [];
        links.forEach(function (link) {
            if (!link || link.enabled === false || !searchElseBranchAllowed(link, context.BRANCH)) return;
            const href = renderSearchElseTemplate(link.urlTemplate, context);
            const label = searchElseLabel(link);
            if (!href || !label) return;
            entries.push({ link: link, href: href, label: label });
        });
        if (!entries.length) return null;

        const block = document.createElement("section");
        block.id = "pmk-search-else";
        block.className = cfg.presentation === "buttons" ? "pmk-search-else-buttons" : "pmk-search-else-list";
        block.dataset.pmkExternalLinksSearchElse = "1";

        const heading = document.createElement("h3");
        heading.className = "pmk-search-else-title";
        heading.textContent = currentLanguage() === "en" ? (cleanText(cfg.titleEn) || cleanText(cfg.titleFr) || "Search elsewhere") : (cleanText(cfg.titleFr) || cleanText(cfg.titleEn) || "Rechercher ailleurs");
        block.appendChild(heading);

        const queryInfo = document.createElement("span");
        queryInfo.className = "pmk-search-else-query";
        queryInfo.textContent = translated("Recherche : ", "Search: ") + context.QUERY;
        block.appendChild(queryInfo);

        const list = document.createElement("ul");
        list.className = "pmk-search-else-links";
        entries.forEach(function (entry) {
            const li = document.createElement("li");
            const a = document.createElement("a");
            a.className = "pmk-search-else-link";
            a.href = entry.href;
            if (entry.link.newWindow !== false) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
            if (entry.link.iconType === "fa") {
                const icon = document.createElement("i");
                icon.className = sanitizeFaClasses(entry.link.iconClass, "fa fa-external-link");
                icon.setAttribute("aria-hidden", "true");
                a.appendChild(icon);
            } else if (entry.link.iconType === "image") {
                const src = safeImageUrl(entry.link.imageUrl);
                if (src) {
                    const img = document.createElement("img");
                    img.className = "pmk-search-else-image";
                    img.src = src;
                    img.alt = "";
                    img.setAttribute("aria-hidden", "true");
                    a.appendChild(img);
                }
            }
            if (entry.link.showLabel !== false) a.appendChild(document.createTextNode(entry.label));
            else { a.title = entry.label; a.setAttribute("aria-label", entry.label); }
            li.appendChild(a);
            list.appendChild(li);
        });
        block.appendChild(list);

        const breakpoint = Math.max(320, Number(cfg.mobileBreakpoint) || 768);
        const placement = window.innerWidth <= breakpoint ? (cfg.mobilePlacement || "before-results") : (cfg.desktopPlacement || "sidebar");
        if (!placeSearchElse(block, placement)) return null;

        if (window.PMKConfig && typeof window.PMKConfig.mountContextButton === "function") {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: heading,
                position: "after",
                contextKey: "catalogue.search.search-else",
                context: { pageId: "catalogue.search", sectionId: "search-else" }
            });
        }
        return block;
    }

    function mountContextAccess(firstButton) {
        if (
            !firstButton ||
            !window.PMKConfig ||
            typeof window.PMKConfig.mountContextButton !== "function"
        ) {
            return;
        }

        window.PMKConfig.mountContextButton({
            moduleId: MODULE_ID,
            anchor: firstButton,
            position: "after",
            contextKey: adapter.id,
            context: {
                pageId: adapter.id,
                sectionId: "custom-links"
            }
        });
    }

    function enhanceAll() {
        if (!pageIsEnabled(state.config)) return;

        injectStyles();
        installGlobalListeners();

        const sections = collectSections();
        let firstButton = null;

        sections.forEach(function (section, index) {
            const button = enhanceSection(section, index);
            if (!firstButton && button) firstButton = button;
        });

        renderSearchElse();
        mountContextAccess(firstButton);
    }

    function reconnectObserver() {
        if (!state.observer || !document.body) return;
        state.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function rebuildAll() {
        if (state.observer) state.observer.disconnect();
        cleanupEnhancements();
        enhanceAll();
        reconnectObserver();
    }

    function scheduleRebuild() {
        if (state.rebuildTimer !== null) return;
        state.rebuildTimer = window.setTimeout(function () {
            state.rebuildTimer = null;
            rebuildAll();
        }, 80);
    }

    function mutationMayAffectExternalLinks(mutation) {
        return Array.from(mutation.addedNodes || []).some(function (node) {
            if (!node || node.nodeType !== 1) return false;

            if (node.matches) {
                if (node.matches(adapter.sectionSelector)) return true;
                if (node.matches('[id^="title_summary_"]')) return true;
                if (adapter.id === "catalogue.search" && node.matches("#catalog_results, #bookbag_form, #breadcrumbs, aside")) return true;
            }

            if (node.querySelector) {
                if (node.querySelector(adapter.sectionSelector)) return true;
                if (node.querySelector('[id^="title_summary_"]')) return true;
                if (adapter.id === "catalogue.search" && node.querySelector("#catalog_results, #bookbag_form, #breadcrumbs, aside")) return true;
            }

            return false;
        });
    }

    function startObserver() {
        if (state.observer || !document.body) return;

        state.observer = new MutationObserver(function (mutations) {
            if (mutations.some(mutationMayAffectExternalLinks)) {
                scheduleRebuild();
            }
        });

        reconnectObserver();
    }

    async function loadConfiguration() {
        registerWithPMK();

        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") {
            state.config = prepareRuntimeConfig(clone(DEFAULT_CONFIG)).config;
            return;
        }

        const prepared = prepareRuntimeConfig(
            await window.PMKConfig.getConfig(MODULE_ID)
        );
        state.config = prepared.config;

        // Persistance unique de la migration 2.4.1 -> 2.4.2 afin que le
        // bouton compact reste la valeur réelle de detail.pl, sans empêcher
        // un choix explicite ultérieur de la grille dans PMK.
        if (
            prepared.shouldPersist &&
            typeof window.PMKConfig.saveConfig === "function"
        ) {
            window.PMKConfig.saveConfig(MODULE_ID, state.config).catch(function () {
                /* Le rendu courant reste correct même si Firestore est indisponible. */
            });
        }

        if (!state.unsubscribe && typeof window.PMKConfig.subscribe === "function") {
            state.unsubscribe = window.PMKConfig.subscribe(MODULE_ID, function (nextConfig) {
                state.config = prepareRuntimeConfig(nextConfig || clone(DEFAULT_CONFIG)).config;
                rebuildAll();
            });
        }
    }

    async function initialize() {
        if (state.initialized) return;
        state.initialized = true;

        await loadConfiguration();
        rebuildAll();
        startObserver();
    }

    function onReady(callback) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback, { once: true });
        } else {
            callback();
        }
    }

    window.__PMK_EXTERNAL_LINKS_010__ = {
        version: MODULE_VERSION,
        moduleId: MODULE_ID,
        refresh: function () {
            scheduleRebuild();
        },
        rebuild: rebuildAll,
        getConfig: function () {
            return clone(state.config);
        },
        getRecordContext: function (section) {
            return clone(recordContext(section || document.body));
        },
        getSearchContext: function () {
            return clone(getSearchContext());
        },
        renderSearchElse: renderSearchElse
    };

    onReady(function () {
        initialize();
    });
})();

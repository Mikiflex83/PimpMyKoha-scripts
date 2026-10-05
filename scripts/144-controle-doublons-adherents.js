/**
 * PimpMyKoha — Module 144
 * Contrôle des doublons adhérents à l'inscription
 *
 * Version : 0.3.1
 *
 * - Interface compacte par défaut.
 * - Recherche des homonymes par nom + prénom.
 * - Comparaison de la date de naissance pour qualifier le risque.
 * - Ouverture des fiches candidates dans un nouvel onglet.
 * - Validation explicite "ce n'est pas un doublon".
 * - Configuration centralisée dans PimpMyKoha (PMKConfig).
 * - Contrôle automatique sur toutes les pages affichant un bloc .patroninfo.
 */

(function () {
    "use strict";

    if (window.PMK144PatronDuplicateCheck && window.PMK144PatronDuplicateCheck.version === "0.3.1") {
        return;
    }

    const MODULE_ID = "144";
    const VERSION = "0.3.1";
    const PAGE_ID = "members.memberentry";
    const PAGE_PATH = "/cgi-bin/koha/members/memberentry.pl";

    const DEFAULTS = {
        enabled: true,
        page: {
            enabled: true,
            path: PAGE_PATH
        },
        existingPatron: {
            enabled: true,
            autoCheck: true,
            showCandidates: true
        },
        behavior: {
            requireCheckBeforeSave: true,
            requireBirthDate: true,
            allowContinueOnApiError: true,
            invalidateAfterIdentityChange: true
        },
        display: {
            density: "compact",
            showCardNumber: true,
            showLibrary: true,
            showCategory: false,
            showAddress: false,
            showContact: false
        },
        labels: {
            title: "Vérifier si l’adhérent est déjà inscrit",
            checkButton: "Vérifier",
            noMatch: "Aucun doublon détecté",
            continueButton: "Vérifié : continuer",
            openButton: "Ouvrir",
            useExistingButton: "Utiliser cette fiche"
        },
        advanced: {
            perPage: 100
        }
    };

    const PMK144 = {
        version: VERSION,
        id: "pmk144-patron-duplicate-check",
        config: clone(DEFAULTS),
        pmkRegistered: false,
        subscribed: false,
        initialized: false,
        existingObserver: null,
        existingCache: new Map(),
        state: {
            checked: false,
            checkedSignature: "",
            busy: false,
            lastResults: []
        },
        selectors: {
            surname: [
                "#surname",
                "#borrower_surname",
                'input[name="surname"]',
                'input[name="borrower_surname"]'
            ],
            firstname: [
                "#firstname",
                "#borrower_firstname",
                'input[name="firstname"]',
                'input[name="borrower_firstname"]'
            ],
            dateofbirth: [
                "#dateofbirth",
                "#borrower_dateofbirth",
                'input[name="dateofbirth"]',
                'input[name="borrower_dateofbirth"]'
            ]
        }
    };

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function object(value) {
        return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    }

    function merge(base, extra) {
        const out = clone(base);
        if (!extra || typeof extra !== "object") return out;

        Object.keys(extra).forEach(function (key) {
            if (Array.isArray(extra[key])) {
                out[key] = clone(extra[key]);
            } else if (
                extra[key] &&
                typeof extra[key] === "object" &&
                !Array.isArray(extra[key]) &&
                out[key] &&
                typeof out[key] === "object" &&
                !Array.isArray(out[key])
            ) {
                out[key] = merge(out[key], extra[key]);
            } else if (extra[key] !== undefined) {
                out[key] = extra[key];
            }
        });

        return out;
    }

    function clamp(value, min, max, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, Math.round(n)));
    }

    function normalizeConfig(config) {
        const cfg = merge(DEFAULTS, object(config));

        cfg.enabled = cfg.enabled !== false;

        cfg.page = merge(DEFAULTS.page, object(cfg.page));
        cfg.page.enabled = cfg.page.enabled !== false;
        cfg.page.path = PAGE_PATH;

        cfg.existingPatron = merge(DEFAULTS.existingPatron, object(cfg.existingPatron));
        cfg.existingPatron.enabled = cfg.existingPatron.enabled !== false;
        cfg.existingPatron.autoCheck = cfg.existingPatron.autoCheck !== false;
        cfg.existingPatron.showCandidates = cfg.existingPatron.showCandidates !== false;

        cfg.behavior = merge(DEFAULTS.behavior, object(cfg.behavior));
        cfg.behavior.requireCheckBeforeSave = cfg.behavior.requireCheckBeforeSave !== false;
        cfg.behavior.requireBirthDate = cfg.behavior.requireBirthDate !== false;
        cfg.behavior.allowContinueOnApiError = cfg.behavior.allowContinueOnApiError !== false;
        cfg.behavior.invalidateAfterIdentityChange = cfg.behavior.invalidateAfterIdentityChange !== false;

        cfg.display = merge(DEFAULTS.display, object(cfg.display));
        cfg.display.density = cfg.display.density === "detailed" ? "detailed" : "compact";
        cfg.display.showCardNumber = cfg.display.showCardNumber !== false;
        cfg.display.showLibrary = cfg.display.showLibrary !== false;
        cfg.display.showCategory = cfg.display.showCategory === true;
        cfg.display.showAddress = cfg.display.showAddress === true;
        cfg.display.showContact = cfg.display.showContact === true;

        cfg.labels = merge(DEFAULTS.labels, object(cfg.labels));
        Object.keys(DEFAULTS.labels).forEach(function (key) {
            cfg.labels[key] = String(cfg.labels[key] || DEFAULTS.labels[key]).trim() || DEFAULTS.labels[key];
        });

        cfg.advanced = merge(DEFAULTS.advanced, object(cfg.advanced));
        cfg.advanced.perPage = clamp(cfg.advanced.perPage, 10, 200, DEFAULTS.advanced.perPage);

        return cfg;
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 1,
            name: {
                fr: "Contrôle des doublons adhérents",
                en: "Patron duplicate check"
            },
            description: {
                fr: "Contrôle les doublons pendant l’inscription et vérifie automatiquement les fiches déjà existantes sur toutes les pages Koha affichant un encart adhérent.",
                en: "Checks duplicates during registration and automatically verifies existing patron records on every Koha page displaying a patron information block."
            },
            category: {
                fr: "Adhérents",
                en: "Patrons"
            },
            supportedPages: ["*"],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULTS),
            normalize: normalizeConfig,
            validate: function (config) {
                const cfg = normalizeConfig(config);
                if (!String(cfg.labels.checkButton || "").trim()) {
                    return { ok: false, message: "Le libellé du bouton de contrôle ne peut pas être vide." };
                }
                return { ok: true };
            },
            schema: [
                {
                    type: "section",
                    id: "activation",
                    label: { fr: "Activation", en: "Activation" },
                    description: {
                        fr: "Le module contrôle les doublons à l’inscription et peut aussi vérifier automatiquement les adhérents déjà existants dès qu’un bloc d’information adhérent est affiché.",
                        en: "The module checks duplicates during registration and can also automatically verify existing patrons whenever a patron information block is displayed."
                    },
                    fields: [
                        {
                            key: "enabled",
                            type: "boolean",
                            label: { fr: "Activer le contrôle des doublons", en: "Enable duplicate check" }
                        },
                        {
                            key: "page.enabled",
                            type: "boolean",
                            label: { fr: "Activer sur les pages d’inscription", en: "Enable on patron registration pages" }
                        },
                        {
                            key: "page.path",
                            type: "readonly",
                            advanced: true,
                            label: { fr: "Page Koha", en: "Koha page" }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "existingPatron",
                    label: { fr: "Fiches adhérents existantes", en: "Existing patron records" },
                    description: {
                        fr: "Affiche un état très compact directement dans l’encart adhérent et lance automatiquement le contrôle en arrière-plan.",
                        en: "Shows a compact status directly in the patron information block and automatically runs the check in the background."
                    },
                    fields: [
                        {
                            key: "existingPatron.enabled",
                            type: "boolean",
                            label: {
                                fr: "Afficher le contrôle sur les fiches adhérents",
                                en: "Show the check on patron records"
                            }
                        },
                        {
                            key: "existingPatron.autoCheck",
                            type: "boolean",
                            label: {
                                fr: "Lancer automatiquement la vérification",
                                en: "Run the check automatically"
                            }
                        },
                        {
                            key: "existingPatron.showCandidates",
                            type: "boolean",
                            label: {
                                fr: "Afficher les fiches candidates lorsqu’un doublon est possible",
                                en: "Show candidate records when a duplicate is possible"
                            }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "behavior",
                    label: { fr: "Comportement", en: "Behavior" },
                    fields: [
                        {
                            key: "behavior.requireCheckBeforeSave",
                            type: "boolean",
                            label: {
                                fr: "Exiger un contrôle avant l’enregistrement",
                                en: "Require a check before saving"
                            },
                            help: {
                                fr: "Si activé, Koha ne pourra pas enregistrer la nouvelle fiche tant que le contrôle n’aura pas été effectué ou explicitement contourné en cas d’erreur technique.",
                                en: "When enabled, the new patron cannot be saved until the duplicate check has been completed or explicitly bypassed after a technical error."
                            }
                        },
                        {
                            key: "behavior.requireBirthDate",
                            type: "boolean",
                            label: {
                                fr: "Exiger la date de naissance avant la recherche",
                                en: "Require birth date before search"
                            },
                            help: {
                                fr: "La recherche porte toujours sur nom + prénom ; la date de naissance sert ensuite à distinguer un doublon très probable d’un simple homonyme.",
                                en: "Search always uses surname + first name; the birth date is then used to distinguish a likely duplicate from a namesake."
                            }
                        },
                        {
                            key: "behavior.invalidateAfterIdentityChange",
                            type: "boolean",
                            label: {
                                fr: "Annuler la validation si l’identité est modifiée",
                                en: "Invalidate check when identity changes"
                            }
                        },
                        {
                            key: "behavior.allowContinueOnApiError",
                            type: "boolean",
                            label: {
                                fr: "Autoriser la poursuite si l’API Koha échoue",
                                en: "Allow continuing if the Koha API fails"
                            }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "display",
                    label: { fr: "Affichage", en: "Display" },
                    description: {
                        fr: "Le mode compact est recommandé : une ligne de contrôle discrète et une liste dense uniquement lorsqu’une correspondance existe.",
                        en: "Compact mode is recommended: a discreet control row and a dense list only when matches are found."
                    },
                    fields: [
                        {
                            key: "display.density",
                            type: "select",
                            label: { fr: "Densité d’affichage", en: "Display density" },
                            options: [
                                { value: "compact", label: { fr: "Compact", en: "Compact" } },
                                { value: "detailed", label: { fr: "Détaillé", en: "Detailed" } }
                            ]
                        },
                        {
                            key: "display.showCardNumber",
                            type: "boolean",
                            label: { fr: "Afficher le numéro de carte", en: "Show card number" }
                        },
                        {
                            key: "display.showLibrary",
                            type: "boolean",
                            label: { fr: "Afficher la bibliothèque", en: "Show library" }
                        },
                        {
                            key: "display.showCategory",
                            type: "boolean",
                            label: { fr: "Afficher la catégorie", en: "Show category" }
                        },
                        {
                            key: "display.showAddress",
                            type: "boolean",
                            label: { fr: "Afficher l’adresse", en: "Show address" }
                        },
                        {
                            key: "display.showContact",
                            type: "boolean",
                            label: { fr: "Afficher le contact", en: "Show contact" }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "labels",
                    label: { fr: "Libellés", en: "Labels" },
                    fields: [
                        {
                            key: "labels.title",
                            type: "text",
                            label: { fr: "Titre court", en: "Short title" }
                        },
                        {
                            key: "labels.checkButton",
                            type: "text",
                            label: { fr: "Bouton de contrôle", en: "Check button" }
                        },
                        {
                            key: "labels.noMatch",
                            type: "text",
                            label: { fr: "Aucun doublon", en: "No duplicate" }
                        },
                        {
                            key: "labels.continueButton",
                            type: "text",
                            label: { fr: "Continuer après vérification", en: "Continue after checking" }
                        },
                        {
                            key: "labels.openButton",
                            type: "text",
                            label: { fr: "Ouvrir dans un nouvel onglet", en: "Open in a new tab" }
                        },
                        {
                            key: "labels.useExistingButton",
                            type: "text",
                            label: { fr: "Utiliser la fiche existante", en: "Use existing patron record" }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "advanced",
                    label: { fr: "Avancé", en: "Advanced" },
                    fields: [
                        {
                            key: "advanced.perPage",
                            type: "number",
                            min: 10,
                            max: 200,
                            advanced: true,
                            label: {
                                fr: "Nombre maximal de résultats interrogés",
                                en: "Maximum number of queried results"
                            }
                        }
                    ]
                }
            ],
            focusContext: function (main, context) {
                if (!main) return;
                const wanted = context && context.sectionId ? context.sectionId : "activation";
                const section =
                    main.querySelector('[data-pmk-section-id="' + wanted + '"]') ||
                    main.querySelector('[data-pmk-section-id="activation"]');
                if (!section) return;
                window.setTimeout(function () {
                    section.scrollIntoView({ block: "start", behavior: "smooth" });
                }, 0);
            }
        };
    }

    function registerWithPMK() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") {
            return false;
        }

        try {
            window.PMKConfig.registerModule(moduleDefinition());
            PMK144.pmkRegistered = true;

            if (!PMK144.subscribed && typeof window.PMKConfig.subscribe === "function") {
                PMK144.subscribed = true;
                window.PMKConfig.subscribe(MODULE_ID, function (config) {
                    applyConfig(config, { fromSubscription: true });
                });
            }

            return true;
        } catch (error) {
            console.warn("[PMK144] Impossible d’enregistrer le module dans PMKConfig.", error);
            return false;
        }
    }

    async function loadConfig() {
        registerWithPMK();

        if (
            window.PMKConfig &&
            typeof window.PMKConfig.getConfig === "function" &&
            PMK144.pmkRegistered
        ) {
            try {
                return normalizeConfig(await window.PMKConfig.getConfig(MODULE_ID));
            } catch (error) {
                console.warn("[PMK144] Configuration PMK indisponible, valeurs par défaut utilisées.", error);
            }
        }

        return normalizeConfig(DEFAULTS);
    }

    function firstMatch(selectors) {
        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) return el;
        }
        return null;
    }

    function clean(value) {
        return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    }

    function normalizeName(value) {
        return clean(value)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[’']/g, "'")
            .toLocaleUpperCase("fr-FR");
    }

    function toIsoDate(value) {
        const raw = clean(value);
        if (!raw) return "";

        let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
        if (match) return validateDateParts(+match[1], +match[2], +match[3]);

        match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
        if (match) return validateDateParts(+match[3], +match[2], +match[1]);

        return "";
    }

    function validateDateParts(year, month, day) {
        if (
            !Number.isInteger(year) ||
            !Number.isInteger(month) ||
            !Number.isInteger(day) ||
            year < 1800 ||
            month < 1 ||
            month > 12 ||
            day < 1 ||
            day > 31
        ) return "";

        const d = new Date(Date.UTC(year, month - 1, day));
        if (
            d.getUTCFullYear() !== year ||
            d.getUTCMonth() !== month - 1 ||
            d.getUTCDate() !== day
        ) return "";

        return (
            String(year).padStart(4, "0") + "-" +
            String(month).padStart(2, "0") + "-" +
            String(day).padStart(2, "0")
        );
    }

    function formatDateFr(value) {
        const iso = toIsoDate(value);
        if (!iso) return clean(value) || "—";
        const parts = iso.split("-");
        return parts[2] + "/" + parts[1] + "/" + parts[0];
    }

    function currentIdentity() {
        const surnameEl = firstMatch(PMK144.selectors.surname);
        const firstnameEl = firstMatch(PMK144.selectors.firstname);
        const dobEl = firstMatch(PMK144.selectors.dateofbirth);

        return {
            surnameEl: surnameEl,
            firstnameEl: firstnameEl,
            dobEl: dobEl,
            surname: clean(surnameEl && surnameEl.value),
            firstname: clean(firstnameEl && firstnameEl.value),
            dateRaw: clean(dobEl && dobEl.value),
            dateIso: toIsoDate(dobEl && dobEl.value)
        };
    }

    function signature(identity) {
        const data = identity || currentIdentity();
        return [
            normalizeName(data.surname),
            normalizeName(data.firstname),
            data.dateIso || clean(data.dateRaw)
        ].join("|");
    }

    function isNewPatronPage() {
        if (location.pathname !== PAGE_PATH) return false;

        const params = new URLSearchParams(location.search);
        const urlBorrower = clean(params.get("borrowernumber"));
        if (urlBorrower && urlBorrower !== "0") return false;

        const hiddenBorrower =
            document.querySelector('input[name="borrowernumber"]') ||
            document.querySelector('input[name="borrower_number"]');

        if (
            hiddenBorrower &&
            clean(hiddenBorrower.value) &&
            clean(hiddenBorrower.value) !== "0"
        ) return false;

        return true;
    }

    function isEnabledHere() {
        return (
            PMK144.config.enabled !== false &&
            PMK144.config.page &&
            PMK144.config.page.enabled !== false &&
            isNewPatronPage()
        );
    }

    function make(tag, options) {
        const children = Array.prototype.slice.call(arguments, 2);
        const el = document.createElement(tag);
        const opts = options || {};

        if (opts.className) el.className = opts.className;
        if (opts.id) el.id = opts.id;
        if (opts.type) el.type = opts.type;
        if (opts.title) el.title = opts.title;
        if (opts.href) el.href = opts.href;
        if (opts.target) el.target = opts.target;
        if (opts.rel) el.rel = opts.rel;

        children.flat().forEach(function (child) {
            if (child === null || child === undefined || child === false) return;
            el.appendChild(
                child instanceof Node ? child : document.createTextNode(String(child))
            );
        });

        return el;
    }

    function injectStyles() {
        if (document.getElementById("pmk144-style")) return;

        const style = document.createElement("style");
        style.id = "pmk144-style";
        style.textContent = `
            #${PMK144.id} {
                --pmk144-border: #d7ddd9;
                --pmk144-text-muted: #69736e;
                margin: .35rem 0 .55rem;
                max-width: 980px;
                font-size: .9rem;
            }

            #${PMK144.id} .pmk144-controlbar {
                display: flex;
                align-items: center;
                gap: .45rem;
                flex-wrap: wrap;
                min-height: 32px;
                padding: .3rem .45rem;
                border: 1px solid var(--pmk144-border);
                border-radius: 4px;
                background: #fafbfa;
            }

            #${PMK144.id}.pmk144-ok .pmk144-controlbar {
                border-color: #a9cdb8;
                background: #f5faf7;
            }

            #${PMK144.id}.pmk144-warning .pmk144-controlbar {
                border-color: #dec98d;
                background: #fffbf1;
            }

            #${PMK144.id}.pmk144-danger .pmk144-controlbar {
                border-color: #d8aaa6;
                background: #fff7f6;
            }

            #${PMK144.id}.pmk144-error .pmk144-controlbar {
                border-color: #ddb59f;
                background: #fff8f4;
            }

            #${PMK144.id} .pmk144-title {
                font-weight: 700;
                white-space: nowrap;
            }

            #${PMK144.id} .pmk144-status {
                min-width: 0;
                color: var(--pmk144-text-muted);
                line-height: 1.25;
            }

            #${PMK144.id}.pmk144-ok .pmk144-status {
                color: #2d6f4e;
                font-weight: 600;
            }

            #${PMK144.id}.pmk144-warning .pmk144-status,
            #${PMK144.id}.pmk144-danger .pmk144-status,
            #${PMK144.id}.pmk144-error .pmk144-status {
                color: #5c5141;
            }

            #${PMK144.id} .pmk144-btn {
                display: inline-flex;
                align-items: center;
                gap: .25rem;
                min-height: 28px;
                padding-top: .2rem;
                padding-bottom: .2rem;
                white-space: nowrap;
            }

            #${PMK144.id} .pmk144-results {
                display: none;
                margin-top: .35rem;
                border: 1px solid var(--pmk144-border);
                border-radius: 4px;
                overflow: hidden;
                background: #fff;
            }

            #${PMK144.id} .pmk144-results.has-results {
                display: block;
            }

            #${PMK144.id} .pmk144-result-row {
                display: flex;
                align-items: center;
                gap: .6rem;
                flex-wrap: wrap;
                padding: .38rem .5rem;
                border-bottom: 1px solid #ecefed;
            }

            #${PMK144.id} .pmk144-result-row:last-child {
                border-bottom: 0;
            }

            #${PMK144.id} .pmk144-result-row.is-exact {
                box-shadow: inset 3px 0 0 #b13b32;
            }

            #${PMK144.id} .pmk144-result-row.is-homonym {
                box-shadow: inset 3px 0 0 #c18a18;
            }

            #${PMK144.id} .pmk144-main {
                min-width: 180px;
                flex: 1 1 220px;
            }

            #${PMK144.id} .pmk144-name {
                font-weight: 700;
            }

            #${PMK144.id} .pmk144-meta {
                display: flex;
                align-items: center;
                gap: .25rem .6rem;
                flex-wrap: wrap;
                flex: 2 1 360px;
                color: #4d5752;
                font-size: .86rem;
            }

            #${PMK144.id} .pmk144-meta-item {
                white-space: nowrap;
            }

            #${PMK144.id} .pmk144-meta-long {
                white-space: normal;
            }

            #${PMK144.id} .pmk144-row-actions {
                display: flex;
                gap: .3rem;
                margin-left: auto;
                flex: 0 0 auto;
            }

            #${PMK144.id} .pmk144-badge {
                display: inline-block;
                margin-left: .35rem;
                padding: .05rem .35rem;
                border-radius: 999px;
                font-size: .72rem;
                font-weight: 700;
                vertical-align: 1px;
            }

            #${PMK144.id} .pmk144-badge.exact {
                color: #842029;
                background: #f8d7da;
            }

            #${PMK144.id} .pmk144-badge.homonym {
                color: #664d03;
                background: #fff3cd;
            }

            #${PMK144.id} .pmk144-footer {
                display: none;
                justify-content: flex-end;
                gap: .4rem;
                margin-top: .35rem;
            }

            #${PMK144.id} .pmk144-footer.has-actions {
                display: flex;
            }

            #${PMK144.id}.pmk144-density-detailed .pmk144-result-row {
                align-items: flex-start;
                padding-top: .55rem;
                padding-bottom: .55rem;
            }

            #${PMK144.id}.pmk144-density-detailed .pmk144-meta {
                line-height: 1.35;
            }


            .pmk144-existing-check {
                margin: .28rem 0 .42rem;
                border: 1px solid #d7ddd9;
                border-radius: 4px;
                background: #fafbfa;
                font-size: .84rem;
                line-height: 1.25;
                overflow: hidden;
            }

            .pmk144-existing-check .pmk144-existing-status {
                display: flex;
                align-items: center;
                gap: .4rem;
                min-height: 28px;
                padding: .28rem .45rem;
                font-weight: 600;
            }

            .pmk144-existing-check .pmk144-existing-status .pmk144-existing-text {
                min-width: 0;
                flex: 1 1 auto;
            }

            .pmk144-existing-check.is-loading {
                color: #58635e;
                background: #fafbfa;
            }

            .pmk144-existing-check.is-ok {
                color: #286846;
                border-color: #a9cdb8;
                background: #f5faf7;
            }

            .pmk144-existing-check.is-warning {
                color: #6b520d;
                border-color: #dec98d;
                background: #fffbf1;
            }

            .pmk144-existing-check.is-danger {
                color: #842029;
                border-color: #d8aaa6;
                background: #fff7f6;
            }

            .pmk144-existing-check.is-error {
                color: #87421f;
                border-color: #ddb59f;
                background: #fff8f4;
            }

            .pmk144-existing-check .pmk144-existing-action {
                margin-left: auto;
                white-space: nowrap;
            }

            .pmk144-existing-check .pmk144-existing-candidates {
                border-top: 1px solid rgba(0,0,0,.08);
                background: #fff;
            }

            .pmk144-existing-check .pmk144-existing-candidate {
                display: flex;
                align-items: center;
                gap: .45rem;
                padding: .3rem .45rem;
                border-bottom: 1px solid #ecefed;
            }

            .pmk144-existing-check .pmk144-existing-candidate:last-child {
                border-bottom: 0;
            }

            .pmk144-existing-check .pmk144-existing-candidate.is-exact {
                box-shadow: inset 3px 0 0 #b13b32;
            }

            .pmk144-existing-check .pmk144-existing-candidate.is-homonym {
                box-shadow: inset 3px 0 0 #c18a18;
            }

            .pmk144-existing-check .pmk144-existing-candidate-main {
                min-width: 0;
                flex: 1 1 auto;
            }

            .pmk144-existing-check .pmk144-existing-candidate-main strong {
                color: #2c3430;
            }

            .pmk144-existing-check .pmk144-existing-candidate-meta {
                color: #69736e;
                margin-left: .25rem;
            }

            .pmk144-existing-check .pmk144-existing-candidate a {
                flex: 0 0 auto;
                white-space: nowrap;
            }

            #${PMK144.id} .pmk144-spinner {
                display: inline-block;
                width: .85rem;
                height: .85rem;
                border: 2px solid rgba(0,0,0,.14);
                border-top-color: rgba(0,0,0,.55);
                border-radius: 50%;
                animation: pmk144-spin .7s linear infinite;
            }

            @keyframes pmk144-spin {
                to { transform: rotate(360deg); }
            }

            @media (max-width: 850px) {
                #${PMK144.id} .pmk144-result-row {
                    align-items: flex-start;
                }

                #${PMK144.id} .pmk144-row-actions {
                    width: 100%;
                    margin-left: 0;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function buildPanel() {
        const existing = document.getElementById(PMK144.id);
        if (existing) {
            refreshLabelsAndDensity();
            return existing;
        }

        const identity = currentIdentity();
        if (!identity.surnameEl || !identity.firstnameEl) return null;

        const panel = make("div", {
            id: PMK144.id,
            className: "pmk144-density-" + PMK144.config.display.density
        });

        const title = make(
            "span",
            { className: "pmk144-title", id: "pmk144-title" },
            PMK144.config.labels.title
        );

        const checkButton = make(
            "button",
            {
                className: "btn btn-default btn-sm pmk144-btn",
                type: "button",
                id: "pmk144-check"
            },
            "🔎 ",
            PMK144.config.labels.checkButton
        );

        const status = make(
            "span",
            { className: "pmk144-status", id: "pmk144-status" },
            initialStatusText()
        );

        const controlBar = make(
            "div",
            { className: "pmk144-controlbar" },
            title,
            checkButton,
            status
        );

        const results = make(
            "div",
            { className: "pmk144-results", id: "pmk144-results" }
        );

        const footer = make(
            "div",
            { className: "pmk144-footer", id: "pmk144-footer" }
        );

        panel.append(controlBar, results, footer);

        const anchor = identity.dobEl || identity.firstnameEl;
        const row =
            anchor.closest("li") ||
            anchor.closest(".form-group") ||
            anchor.closest(".row") ||
            anchor.parentElement;

        if (row && row.parentNode) {
            if (row.tagName === "LI") {
                const wrapper = make("li", { className: "pmk144-wrapper" }, panel);
                row.insertAdjacentElement("afterend", wrapper);
            } else {
                row.insertAdjacentElement("afterend", panel);
            }
        } else {
            identity.firstnameEl.insertAdjacentElement("afterend", panel);
        }

        checkButton.addEventListener("click", runCheck);
        return panel;
    }

    function refreshLabelsAndDensity() {
        const panel = document.getElementById(PMK144.id);
        if (!panel) return;

        panel.classList.toggle(
            "pmk144-density-detailed",
            PMK144.config.display.density === "detailed"
        );
        panel.classList.toggle(
            "pmk144-density-compact",
            PMK144.config.display.density !== "detailed"
        );

        const title = document.getElementById("pmk144-title");
        if (title) title.textContent = PMK144.config.labels.title;

        const button = document.getElementById("pmk144-check");
        if (button && !PMK144.state.busy) {
            button.replaceChildren(
                document.createTextNode("🔎 " + PMK144.config.labels.checkButton)
            );
        }
    }

    function initialStatusText() {
        return PMK144.config.behavior.requireBirthDate
            ? "Recherche de doublons adhérents : nom, prénom et naissance puis contrôle."
            : "Recherche de doublons adhérents : nom et prénom puis contrôle.";
    }

    function setPanelMode(mode) {
        const panel = document.getElementById(PMK144.id);
        if (!panel) return;

        panel.classList.remove("pmk144-ok", "pmk144-warning", "pmk144-danger", "pmk144-error");
        if (mode) panel.classList.add("pmk144-" + mode);
    }

    function setStatus(value) {
        const status = document.getElementById("pmk144-status");
        if (!status) return;
        status.replaceChildren(
            value instanceof Node ? value : document.createTextNode(String(value))
        );
    }

    function clearResults() {
        const results = document.getElementById("pmk144-results");
        const footer = document.getElementById("pmk144-footer");
        if (results) {
            results.replaceChildren();
            results.classList.remove("has-results");
        }
        if (footer) {
            footer.replaceChildren();
            footer.classList.remove("has-actions");
        }
    }

    function setBusy(busy) {
        PMK144.state.busy = busy;
        const btn = document.getElementById("pmk144-check");
        if (!btn) return;

        btn.disabled = busy;
        btn.replaceChildren();

        if (busy) {
            btn.append(
                make("span", { className: "pmk144-spinner" }),
                document.createTextNode(" Recherche de doublons adhérents…")
            );
        } else {
            btn.textContent = "🔎 " + PMK144.config.labels.checkButton;
        }
    }

    function resetValidation(reason) {
        PMK144.state.checked = false;
        PMK144.state.checkedSignature = "";
        PMK144.state.lastResults = [];

        if (!document.getElementById(PMK144.id)) return;

        setPanelMode("");
        clearResults();
        setStatus(reason || initialStatusText());
    }

    async function fetchPatrons(identity) {
        const params = new URLSearchParams({
            _match: "exact",
            surname: identity.surname,
            firstname: identity.firstname,
            _per_page: String(PMK144.config.advanced.perPage),
            _page: "1"
        });

        const response = await fetch("/api/v1/patrons?" + params.toString(), {
            method: "GET",
            credentials: "same-origin",
            headers: {
                Accept: "application/json"
            }
        });

        if (!response.ok) {
            let detail = "";
            try {
                const payload = await response.json();
                detail = payload && (payload.error || payload.error_code) || "";
            } catch (_) {}

            throw new Error(
                "Koha a répondu " +
                response.status +
                (detail ? " — " + detail : "")
            );
        }

        const data = await response.json();
        return Array.isArray(data) ? data : [];
    }


    async function fetchPatronById(patronId) {
        const response = await fetch(
            "/api/v1/patrons/" + encodeURIComponent(patronId),
            {
                method: "GET",
                credentials: "same-origin",
                headers: { Accept: "application/json" }
            }
        );

        if (!response.ok) {
            let detail = "";
            try {
                const payload = await response.json();
                detail = payload && (payload.error || payload.error_code)
                    ? " — " + (payload.error || payload.error_code)
                    : "";
            } catch (_) {
                detail = "";
            }
            throw new Error("Koha a répondu " + response.status + detail);
        }

        return response.json();
    }

    function patronIdOf(patron) {
        return String(
            patron && (
                patron.patron_id ??
                patron.borrowernumber ??
                patron.borrower_number ??
                ""
            )
        );
    }

    function classifyPatron(patron, identity) {
        const patronDob = toIsoDate(patron.date_of_birth);
        const searchedDob = identity.dateIso;

        if (searchedDob && patronDob && searchedDob === patronDob) {
            return "exact";
        }

        return "homonym";
    }

    function patronUrl(patron) {
        const id = patron.patron_id != null ? patron.patron_id : patron.borrowernumber;
        return "/cgi-bin/koha/members/moremember.pl?borrowernumber=" + encodeURIComponent(id);
    }

    function addressText(patron) {
        return [
            patron.street_number,
            patron.street_type,
            patron.address,
            patron.address2,
            patron.postal_code,
            patron.city
        ]
            .filter(Boolean)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function contactText(patron) {
        return patron.email || patron.phone || patron.mobile || "";
    }

    function metaItem(label, value, longValue) {
        if (!value) return null;
        return make(
            "span",
            { className: "pmk144-meta-item" + (longValue ? " pmk144-meta-long" : "") },
            make("strong", {}, label + " : "),
            value
        );
    }

    function renderPatronRow(patron, identity) {
        const kind = classifyPatron(patron, identity);
        const row = make("div", {
            className: "pmk144-result-row " + (kind === "exact" ? "is-exact" : "is-homonym")
        });

        const fullName = [patron.firstname, patron.surname]
            .filter(Boolean)
            .join(" ")
            .trim() || "Adhérent";

        const main = make(
            "div",
            { className: "pmk144-main" },
            make("span", { className: "pmk144-name" }, fullName),
            make(
                "span",
                { className: "pmk144-badge " + kind },
                kind === "exact" ? "Même naissance" : "Homonyme"
            )
        );

        const meta = make("div", { className: "pmk144-meta" });
        const items = [];

        items.push(metaItem("Naissance", formatDateFr(patron.date_of_birth)));

        if (PMK144.config.display.showCardNumber) {
            items.push(metaItem("Carte", patron.cardnumber || "—"));
        }

        if (PMK144.config.display.showLibrary) {
            items.push(metaItem("Site", patron.library_id || "—"));
        }

        if (PMK144.config.display.showCategory) {
            items.push(metaItem("Cat.", patron.category_id || "—"));
        }

        if (PMK144.config.display.showAddress) {
            items.push(metaItem("Adresse", addressText(patron) || "—", true));
        }

        if (PMK144.config.display.showContact) {
            items.push(metaItem("Contact", contactText(patron) || "—", true));
        }

        items.filter(Boolean).forEach(function (item) {
            meta.appendChild(item);
        });

        const actions = make("div", { className: "pmk144-row-actions" });

        const openNewTab = make(
            "a",
            {
                className: "btn btn-default btn-xs pmk144-btn",
                href: patronUrl(patron),
                target: "_blank",
                rel: "noopener",
                title: "Ouvrir la fiche dans un nouvel onglet"
            },
            "↗ ",
            PMK144.config.labels.openButton
        );

        const useExisting = make(
            "a",
            {
                className: "btn btn-primary btn-xs pmk144-btn",
                href: patronUrl(patron),
                title: "Abandonner cette nouvelle inscription et utiliser la fiche existante"
            },
            "✓ ",
            PMK144.config.labels.useExistingButton
        );

        actions.append(openNewTab, useExisting);
        row.append(main, meta, actions);
        return row;
    }

    function markValidated(message) {
        PMK144.state.checked = true;
        PMK144.state.checkedSignature = signature();
        setPanelMode("ok");
        setStatus(message);
    }

    function renderNoMatch() {
        clearResults();
        markValidated("✓ Recherche de doublons adhérents : " + PMK144.config.labels.noMatch);
    }

    function renderMatches(patrons, identity) {
        clearResults();

        const results = document.getElementById("pmk144-results");
        const footer = document.getElementById("pmk144-footer");
        if (!results || !footer) return;

        const exactCount = patrons.filter(function (patron) {
            return classifyPatron(patron, identity) === "exact";
        }).length;

        const count = patrons.length;

        if (exactCount > 0) {
            setPanelMode("danger");
            setStatus(
                "⚠ Recherche de doublons adhérents : " +
                count +
                " correspondance" +
                (count > 1 ? "s" : "") +
                ", dont " +
                exactCount +
                " avec la même date de naissance."
            );
        } else {
            setPanelMode("warning");
            setStatus(
                "⚠ Recherche de doublons adhérents : " +
                count +
                " homonyme" +
                (count > 1 ? "s" : "") +
                " à vérifier."
            );
        }

        patrons.forEach(function (patron) {
            results.appendChild(renderPatronRow(patron, identity));
        });
        results.classList.add("has-results");

        const continueBtn = make(
            "button",
            {
                className: "btn btn-success btn-sm pmk144-btn",
                type: "button"
            },
            "✓ ",
            PMK144.config.labels.continueButton
        );

        continueBtn.addEventListener("click", function () {
            markValidated("✓ Recherche de doublons adhérents : vérification effectuée, poursuite de la saisie.");
            results.replaceChildren();
            results.classList.remove("has-results");
            footer.replaceChildren();
            footer.classList.remove("has-actions");
        });

        footer.appendChild(continueBtn);
        footer.classList.add("has-actions");
    }

    function renderError(error) {
        clearResults();
        setPanelMode("error");
        setStatus("Recherche de doublons adhérents : impossible — " + (error && error.message ? error.message : "erreur inconnue."));

        if (!PMK144.config.behavior.allowContinueOnApiError) return;

        const footer = document.getElementById("pmk144-footer");
        if (!footer) return;

        const override = make(
            "button",
            {
                className: "btn btn-warning btn-sm pmk144-btn",
                type: "button"
            },
            "Continuer malgré l’erreur"
        );

        override.addEventListener("click", function () {
            PMK144.state.checked = true;
            PMK144.state.checkedSignature = signature();
            setPanelMode("warning");
            setStatus("Recherche de doublons adhérents : non réalisée techniquement, poursuite validée manuellement.");
            footer.replaceChildren();
            footer.classList.remove("has-actions");
        });

        footer.appendChild(override);
        footer.classList.add("has-actions");
    }

    async function runCheck() {
        if (PMK144.state.busy || !isEnabledHere()) return;

        const identity = currentIdentity();

        if (!identity.surname) {
            setPanelMode("warning");
            setStatus("Recherche de doublons adhérents : renseignez le nom.");
            if (identity.surnameEl) identity.surnameEl.focus();
            return;
        }

        if (!identity.firstname) {
            setPanelMode("warning");
            setStatus("Recherche de doublons adhérents : renseignez le prénom.");
            if (identity.firstnameEl) identity.firstnameEl.focus();
            return;
        }

        if (PMK144.config.behavior.requireBirthDate && !identity.dateIso) {
            setPanelMode("warning");
            setStatus("Recherche de doublons adhérents : renseignez une date de naissance valide avant le contrôle.");
            if (identity.dobEl) identity.dobEl.focus();
            return;
        }

        resetValidation();
        setBusy(true);
        clearResults();
        setStatus("Recherche de doublons adhérents…");

        try {
            let patrons = await fetchPatrons(identity);

            patrons = patrons.filter(function (patron) {
                return (
                    normalizeName(patron.surname) === normalizeName(identity.surname) &&
                    normalizeName(patron.firstname) === normalizeName(identity.firstname)
                );
            });

            PMK144.state.lastResults = patrons;

            if (!patrons.length) {
                renderNoMatch();
            } else {
                renderMatches(patrons, identity);
            }
        } catch (error) {
            console.error("[PMK144] Erreur contrôle doublons adhérents", error);
            renderError(error);
        } finally {
            setBusy(false);
        }
    }


    function getPatronIdFromBlock(block) {
        if (!block) return "";

        const hidden =
            block.querySelector("#hiddenborrowernumber") ||
            block.querySelector('input[name="borrowernumber"]') ||
            block.querySelector('input[name="borrower_number"]');

        if (hidden && clean(hidden.value)) {
            return clean(hidden.value);
        }

        const link = block.querySelector('a[href*="/members/moremember.pl?borrowernumber="]');
        if (link) {
            try {
                const url = new URL(link.href, location.origin);
                return clean(url.searchParams.get("borrowernumber"));
            } catch (_) {
                const match = String(link.getAttribute("href") || "").match(/[?&]borrowernumber=(\d+)/);
                if (match) return match[1];
            }
        }

        const globalHidden = document.querySelector("#hiddenborrowernumber");
        return globalHidden ? clean(globalHidden.value) : "";
    }

    function patronIdentityFromRecord(patron) {
        return {
            surname: clean(patron && patron.surname),
            firstname: clean(patron && patron.firstname),
            dateRaw: clean(patron && patron.date_of_birth),
            dateIso: toIsoDate(patron && patron.date_of_birth)
        };
    }

    function existingCheckId(patronId) {
        return "pmk144-existing-" + String(patronId).replace(/[^a-zA-Z0-9_-]/g, "");
    }

    function existingStatusNode(patronId) {
        return document.getElementById(existingCheckId(patronId));
    }

    function buildExistingCheck(block, patronId) {
        let wrapper = existingStatusNode(patronId);
        if (wrapper) return wrapper;

        wrapper = make("div", {
            id: existingCheckId(patronId),
            className: "pmk144-existing-check is-loading"
        });

        const status = make(
            "div",
            { className: "pmk144-existing-status" },
            make("span", { className: "pmk144-existing-icon" }, "⟳"),
            make("span", { className: "pmk144-existing-text" }, "Recherche de doublons adhérents…")
        );

        wrapper.appendChild(status);

        const h5 = block.querySelector("h5");
        const container = block.querySelector(".patroninfo-container");

        if (h5 && h5.parentNode === block) {
            h5.insertAdjacentElement("afterend", wrapper);
        } else if (container && container.parentNode === block) {
            block.insertBefore(wrapper, container);
        } else {
            block.prepend(wrapper);
        }

        return wrapper;
    }

    function setExistingState(wrapper, mode, icon, textValue, action) {
        if (!wrapper) return;

        wrapper.classList.remove(
            "is-loading",
            "is-ok",
            "is-warning",
            "is-danger",
            "is-error"
        );
        wrapper.classList.add("is-" + mode);

        const status = wrapper.querySelector(".pmk144-existing-status");
        if (!status) return;

        status.replaceChildren(
            make("span", { className: "pmk144-existing-icon" }, icon),
            make("span", { className: "pmk144-existing-text" }, textValue)
        );

        if (action) status.appendChild(action);

        const oldCandidates = wrapper.querySelector(".pmk144-existing-candidates");
        if (oldCandidates) oldCandidates.remove();
    }

    function existingCandidateText(patron) {
        const bits = [];

        if (PMK144.config.display.showCardNumber && patron.cardnumber) {
            bits.push("carte " + patron.cardnumber);
        }
        if (patron.date_of_birth) {
            bits.push("né(e) le " + formatDateFr(patron.date_of_birth));
        }
        if (PMK144.config.display.showLibrary && patron.library_id) {
            bits.push(patron.library_id);
        }

        return bits.join(" · ");
    }

    function renderExistingCandidates(wrapper, patrons, identity) {
        if (
            !wrapper ||
            !PMK144.config.existingPatron ||
            PMK144.config.existingPatron.showCandidates === false ||
            !patrons.length
        ) return;

        const container = make("div", { className: "pmk144-existing-candidates" });

        patrons.forEach(function (patron) {
            const kind = classifyPatron(patron, identity);
            const name = [patron.firstname, patron.surname]
                .filter(Boolean)
                .join(" ")
                .trim() || "Fiche adhérent";

            const main = make(
                "div",
                { className: "pmk144-existing-candidate-main" },
                make("strong", {}, name)
            );

            const metaText = existingCandidateText(patron);
            if (metaText) {
                main.appendChild(
                    make("span", { className: "pmk144-existing-candidate-meta" }, "— " + metaText)
                );
            }

            const link = make(
                "a",
                {
                    className: "btn btn-default btn-xs",
                    href: patronUrl(patron),
                    target: "_blank",
                    rel: "noopener",
                    title: "Ouvrir cette fiche dans un nouvel onglet"
                },
                "Ouvrir ↗"
            );

            const row = make(
                "div",
                {
                    className:
                        "pmk144-existing-candidate " +
                        (kind === "exact" ? "is-exact" : "is-homonym")
                },
                main,
                link
            );

            container.appendChild(row);
        });

        wrapper.appendChild(container);
    }

    async function runExistingPatronCheck(block, force) {
        if (!block) return;

        const patronId = getPatronIdFromBlock(block);
        if (!patronId || patronId === "0") return;

        const wrapper = buildExistingCheck(block, patronId);

        if (!force && PMK144.existingCache.has(patronId)) {
            const cached = PMK144.existingCache.get(patronId);
            renderExistingCheckResult(wrapper, cached);
            return;
        }

        setExistingState(
            wrapper,
            "loading",
            "⟳",
            "Recherche de doublons adhérents…"
        );

        try {
            const currentPatron = await fetchPatronById(patronId);
            const identity = patronIdentityFromRecord(currentPatron);

            if (!identity.surname || !identity.firstname) {
                const result = {
                    status: "error",
                    message: "Recherche de doublons adhérents : impossible — nom ou prénom non renseigné.",
                    patrons: [],
                    identity: identity
                };
                PMK144.existingCache.set(patronId, result);
                renderExistingCheckResult(wrapper, result);
                return;
            }

            let patrons = await fetchPatrons(identity);

            patrons = patrons.filter(function (patron) {
                return (
                    patronIdOf(patron) !== String(patronId) &&
                    normalizeName(patron.surname) === normalizeName(identity.surname) &&
                    normalizeName(patron.firstname) === normalizeName(identity.firstname)
                );
            });

            patrons.sort(function (a, b) {
                const aExact = classifyPatron(a, identity) === "exact" ? 0 : 1;
                const bExact = classifyPatron(b, identity) === "exact" ? 0 : 1;
                return aExact - bExact;
            });

            const exactCount = patrons.filter(function (patron) {
                return classifyPatron(patron, identity) === "exact";
            }).length;

            const result = {
                status: exactCount > 0 ? "danger" : (patrons.length ? "warning" : "ok"),
                patrons: patrons,
                exactCount: exactCount,
                identity: identity
            };

            PMK144.existingCache.set(patronId, result);
            renderExistingCheckResult(wrapper, result);
        } catch (error) {
            console.error("[PMK144] Contrôle automatique fiche adhérent", error);

            const retry = make(
                "button",
                {
                    type: "button",
                    className: "btn btn-default btn-xs pmk144-existing-action"
                },
                "Réessayer"
            );

            retry.addEventListener("click", function () {
                PMK144.existingCache.delete(patronId);
                runExistingPatronCheck(block, true);
            });

            setExistingState(
                wrapper,
                "error",
                "!",
                "Recherche de doublons adhérents : impossible",
                retry
            );
        }
    }

    function renderExistingCheckResult(wrapper, result) {
        if (!wrapper || !result) return;

        if (result.status === "ok") {
            setExistingState(
                wrapper,
                "ok",
                "✓",
                "Recherche de doublons adhérents : aucun doublon détecté"
            );
            return;
        }

        if (result.status === "danger") {
            const total = result.patrons.length;
            const exact = result.exactCount || 0;
            const other = Math.max(0, total - exact);

            let textValue =
                "Recherche de doublons adhérents : " +
                exact +
                " doublon" +
                (exact > 1 ? "s" : "") +
                " probable" +
                (exact > 1 ? "s" : "");

            if (other) {
                textValue +=
                    " + " +
                    other +
                    " homonyme" +
                    (other > 1 ? "s" : "");
            }

            textValue += " — vérifier";

            setExistingState(wrapper, "danger", "⚠", textValue);
            renderExistingCandidates(wrapper, result.patrons, result.identity);
            return;
        }

        if (result.status === "warning") {
            const count = result.patrons.length;
            setExistingState(
                wrapper,
                "warning",
                "⚠",
                "Recherche de doublons adhérents : " +
                count +
                    " homonyme" +
                    (count > 1 ? "s" : "") +
                    " trouvé" +
                    (count > 1 ? "s" : "") +
                    " — vérifier"
            );
            renderExistingCandidates(wrapper, result.patrons, result.identity);
            return;
        }

        setExistingState(
            wrapper,
            "error",
            "!",
            result.message || "Recherche de doublons adhérents : impossible"
        );
    }

    function teardownExistingChecks() {
        document.querySelectorAll(".pmk144-existing-check").forEach(function (node) {
            node.remove();
        });
        document.querySelectorAll(".patroninfo[data-pmk144-existing-processed]").forEach(function (block) {
            delete block.dataset.pmk144ExistingProcessed;
        });
    }

    function scanExistingPatronBlocks() {
        if (
            PMK144.config.enabled === false ||
            !PMK144.config.existingPatron ||
            PMK144.config.existingPatron.enabled === false
        ) {
            teardownExistingChecks();
            return;
        }

        injectStyles();

        document.querySelectorAll(".patroninfo").forEach(function (block) {
            const patronId = getPatronIdFromBlock(block);
            if (!patronId || patronId === "0") return;

            if (block.dataset.pmk144ExistingProcessed === patronId) return;
            block.dataset.pmk144ExistingProcessed = patronId;

            const wrapper = buildExistingCheck(block, patronId);

            if (PMK144.config.existingPatron.autoCheck !== false) {
                runExistingPatronCheck(block, false);
            } else {
                const button = make(
                    "button",
                    {
                        type: "button",
                        className: "btn btn-default btn-xs pmk144-existing-action"
                    },
                    "Vérifier"
                );

                button.addEventListener("click", function () {
                    runExistingPatronCheck(block, true);
                });

                setExistingState(
                    wrapper,
                    "loading",
                    "🔎",
                    "Doublons non vérifiés",
                    button
                );
            }
        });
    }

    function startExistingObserver() {
        if (PMK144.existingObserver || !document.body) return;

        PMK144.existingObserver = new MutationObserver(function (mutations) {
            const relevant = mutations.some(function (mutation) {
                return Array.prototype.some.call(mutation.addedNodes || [], function (node) {
                    return (
                        node &&
                        node.nodeType === 1 &&
                        (
                            (node.matches && node.matches(".patroninfo")) ||
                            (node.querySelector && node.querySelector(".patroninfo"))
                        )
                    );
                });
            });

            if (relevant) scanExistingPatronBlocks();
        });

        PMK144.existingObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function attachIdentityListeners() {
        const identity = currentIdentity();

        [identity.surnameEl, identity.firstnameEl, identity.dobEl]
            .filter(Boolean)
            .forEach(function (input) {
                if (input.dataset.pmk144IdentityListener === "1") return;
                input.dataset.pmk144IdentityListener = "1";

                const handler = function () {
                    if (!PMK144.config.behavior.invalidateAfterIdentityChange) return;
                    if (!PMK144.state.checked && !PMK144.state.checkedSignature) return;

                    if (signature() !== PMK144.state.checkedSignature) {
                        resetValidation("Recherche de doublons adhérents : identité modifiée, relancez le contrôle.");
                    }
                };

                input.addEventListener("input", handler);
                input.addEventListener("change", handler);
            });
    }

    function findForm() {
        const identity = currentIdentity();
        return (
            (identity.surnameEl && identity.surnameEl.closest("form")) ||
            (identity.firstnameEl && identity.firstnameEl.closest("form")) ||
            document.querySelector("#entryform") ||
            document.querySelector('form[action*="memberentry.pl"]')
        );
    }

    function attachSaveGuard() {
        const form = findForm();
        if (!form || form.dataset.pmk144Guard === "1") return;

        form.dataset.pmk144Guard = "1";

        form.addEventListener(
            "submit",
            function (event) {
                if (!isEnabledHere()) return;
                if (!PMK144.config.behavior.requireCheckBeforeSave) return;

                if (
                    PMK144.config.behavior.invalidateAfterIdentityChange &&
                    PMK144.state.checked &&
                    signature() !== PMK144.state.checkedSignature
                ) {
                    resetValidation("Recherche de doublons adhérents : identité modifiée, relancez le contrôle.");
                }

                if (PMK144.state.checked) return;

                event.preventDefault();
                event.stopImmediatePropagation();

                setPanelMode("warning");
                setStatus("Recherche de doublons adhérents : contrôle requis avant l’enregistrement.");

                const panel = document.getElementById(PMK144.id);
                if (panel) {
                    panel.scrollIntoView({ behavior: "smooth", block: "center" });
                }

                const button = document.getElementById("pmk144-check");
                if (button) button.focus();
            },
            true
        );
    }

    function teardownPanel() {
        const panel = document.getElementById(PMK144.id);
        if (panel) {
            const wrapper = panel.closest("li.pmk144-wrapper");
            if (wrapper) wrapper.remove();
            else panel.remove();
        }

        PMK144.state.checked = false;
        PMK144.state.checkedSignature = "";
        PMK144.state.lastResults = [];
    }

    function ensureRuntimeUi() {
        if (!isEnabledHere()) {
            teardownPanel();
            return;
        }

        const identity = currentIdentity();
        if (!identity.surnameEl || !identity.firstnameEl) {
            console.warn("[PMK144] Champs nom/prénom introuvables sur cette page.");
            return;
        }

        injectStyles();
        buildPanel();
        refreshLabelsAndDensity();
        attachIdentityListeners();
        attachSaveGuard();
    }

    function applyConfig(config, options) {
        PMK144.config = normalizeConfig(config);

        if (!PMK144.config.enabled) {
            teardownPanel();
            teardownExistingChecks();
            return;
        }

        if (isNewPatronPage()) {
            if (PMK144.config.page.enabled === false) {
                teardownPanel();
            } else {
                ensureRuntimeUi();

                if (options && options.fromSubscription) {
                    resetValidation("Configuration modifiée : relancez le contrôle.");
                    refreshLabelsAndDensity();
                }
            }
        }

        if (
            PMK144.config.existingPatron &&
            PMK144.config.existingPatron.enabled !== false
        ) {
            teardownExistingChecks();
            scanExistingPatronBlocks();
        } else {
            teardownExistingChecks();
        }
    }

    async function init() {
        if (PMK144.initialized) return;
        PMK144.initialized = true;

        PMK144.config = await loadConfig();

        if (isNewPatronPage()) {
            ensureRuntimeUi();
        }

        scanExistingPatronBlocks();
        startExistingObserver();

        console.info("[PMK144] Contrôle doublons adhérents chargé — v" + VERSION);
    }

    function onPmkReady() {
        const wasRegistered = PMK144.pmkRegistered;
        if (!registerWithPMK()) return;

        if (!wasRegistered && PMK144.initialized) {
            loadConfig().then(function (config) {
                applyConfig(config);
            });
        }
    }

    window.PMK144PatronDuplicateCheck = {
        version: VERSION,
        defaults: clone(DEFAULTS),
        get config() {
            return clone(PMK144.config);
        },
        state: PMK144.state,
        runCheck: runCheck,
        checkExistingPatrons: scanExistingPatronBlocks,
        clearExistingCache: function () {
            PMK144.existingCache.clear();
            teardownExistingChecks();
            scanExistingPatronBlocks();
        },
        reset: resetValidation,
        identity: currentIdentity,
        reloadConfig: async function () {
            const config = await loadConfig();
            applyConfig(config);
            return clone(PMK144.config);
        },
        init: init
    };

    window.addEventListener("pmk:config-ready", onPmkReady);

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();

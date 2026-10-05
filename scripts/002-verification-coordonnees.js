/* ============================================================
   PimpMyKoha - Pré-plugin
   Fichier : 002-verification-coordonnees.js
   Version : 2.0.1-isolated

   Module fonctionnel : Vérification avant renouvellement lecteur

   Fonction :
   - détecte structurellement un lecteur expiré / bientôt expiré ;
   - affiche une checklist configurable des informations à vérifier ;
   - bloque les actions natives Koha de renouvellement d'adhésion tant
     que toutes les vérifications actives ne sont pas confirmées ;
   - couvre les liens d'alerte ET la commande native de la barre d'outils ;
   - FR/EN, responsive, idempotent, fail-safe ;
   - configuration partagée via 000-pmk-config-firestore.js ;
   - aucune dépendance directe à Firebase dans la logique métier.
   ============================================================ */

(function () {
    "use strict";

    if (window.__PMK_002_PATRON_RENEWAL_VERIFICATION__) return;
    window.__PMK_002_PATRON_RENEWAL_VERIFICATION__ = true;

    const MODULE_ID = "patron-renewal-verification";
    const UI_ID = "pmk-patron-renewal-verification";
    const STYLE_ID = "pmk-patron-renewal-verification-style";

    const PAGES = [
        {
            id: "members.moremember",
            path: "/cgi-bin/koha/members/moremember.pl",
            labelFr: "Fiche lecteur",
            labelEn: "Patron details"
        },
        {
            id: "circ.circulation",
            path: "/cgi-bin/koha/circ/circulation.pl",
            labelFr: "Circulation",
            labelEn: "Circulation"
        }
    ];

    /*
     * Liste volontairement fonctionnelle : l'utilisateur choisit des
     * informations métier, jamais des sélecteurs DOM. L'adaptateur Koha
     * ci-dessous sait comment retrouver chacune d'elles.
     */
    const CHECK_OPTIONS = [
        { value: "address", label: { fr: "Adresse complète", en: "Full address" } },
        { value: "phone", label: { fr: "Téléphone de contact", en: "Contact phone" } },
        { value: "email", label: { fr: "E-mail de contact", en: "Contact email" } },
        { value: "dateofbirth", label: { fr: "Date de naissance", en: "Date of birth" } }
    ];

    const DEFAULT_CONFIG = {
        enabled: true,
        expired: true,
        expiringSoon: true,
        introFr: "Vérifiez les informations du lecteur avant de renouveler son adhésion :",
        introEn: "Verify the patron information before renewing the membership:",
        missingFr: "Non renseigné",
        missingEn: "Not provided",
        pages: PAGES.map(function (page) {
            return {
                id: page.id,
                path: page.path,
                enabled: true,
                labelFr: page.labelFr,
                labelEn: page.labelEn
            };
        }),
        checks: [
            {
                id: "address",
                enabled: true,
                labelFr: "Adresse",
                labelEn: "Address"
            },
            {
                id: "phone",
                enabled: true,
                labelFr: "Téléphone",
                labelEn: "Phone"
            },
            {
                id: "email",
                enabled: true,
                labelFr: "E-mail",
                labelEn: "Email"
            }
        ]
    };

    let currentConfig = null;
    let coreRegistered = false;
    let fallbackStarted = false;
    let runtimeLocked = false;
    let guardInstalled = false;
    let currentWarning = null;
    let currentPageId = null;
    let currentLinks = [];

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function detectLanguage() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            return window.PMKConfig.getLanguage();
        }
        const lang = (document.documentElement.getAttribute("lang") || navigator.language || "").toLowerCase();
        return lang.startsWith("fr") ? "fr" : "en";
    }

    function localText(fr, en) {
        return detectLanguage() === "fr" ? fr : en;
    }

    function getCurrentPageDefinition() {
        const path = window.location.pathname;
        return PAGES.find(function (page) {
            return page.path === path;
        }) || null;
    }

    function getPageConfig(config, pageId) {
        if (!config || !Array.isArray(config.pages)) return null;
        return config.pages.find(function (page) {
            return page && page.id === pageId;
        }) || null;
    }

    function isSupportedRenewLink(link) {
        if (!link || link.tagName !== "A" || !link.href) return false;
        try {
            const url = new URL(link.href, window.location.origin);
            return url.origin === window.location.origin &&
                url.pathname === "/cgi-bin/koha/members/setstatus.pl" &&
                url.searchParams.get("reregistration") === "y";
        } catch (_) {
            return false;
        }
    }

    function findRenewLinks() {
        return Array.from(document.querySelectorAll("a[href]"))
            .filter(isSupportedRenewLink);
    }

    function findPatronWarning(selector) {
        /*
         * Koha n'utilise pas le même conteneur selon la page :
         * - moremember.pl peut exposer #patron_messages ;
         * - circulation.pl rend patron_messages.inc dans un .circmessage
         *   dont l'id peut être absent ou vide selon le template/version.
         *
         * On cible donc l'élément métier (li.expired / li.warndeparture)
         * à l'intérieur des zones de messages Koha, sans dépendre d'un id.
         */
        const scopedSelectors = [
            "#patron_messages " + selector,
            "#circmessages " + selector,
            ".circmessage.warning " + selector,
            ".circmessage.attention " + selector,
            ".circmessage " + selector
        ];

        for (const scopedSelector of scopedSelectors) {
            const found = document.querySelector(scopedSelector);
            if (found) return found;
        }

        /*
         * Dernier repli borné : patron_messages.inc produit directement
         * ces classes sur des <li>. Cela couvre une personnalisation de
         * conteneur sans élargir la détection à du texte traduit.
         */
        return document.querySelector(selector);
    }

    function detectWarningState() {
        const expired = findPatronWarning("li.expired");
        if (expired) {
            return {
                type: "expired",
                element: expired,
                messages: expired.closest(".circmessage, #patron_messages") || expired.parentElement
            };
        }

        const expiring = findPatronWarning("li.warndeparture");
        if (expiring) {
            return {
                type: "expiringSoon",
                element: expiring,
                messages: expiring.closest(".circmessage, #patron_messages") || expiring.parentElement
            };
        }

        return null;
    }

    function warningEnabled(config, warning) {
        if (!config || !warning) return false;
        if (warning.type === "expired") return config.expired !== false;
        if (warning.type === "expiringSoon") return config.expiringSoon !== false;
        return false;
    }

    function getPatronInfoRoot() {
        /*
         * circ-menu.inc expose normalement .patroninfo sur les pages lecteur
         * et circulation. On prévoit plusieurs replis structurels pour rester
         * compatible avec les variantes de gabarit et personnalisations Koha.
         */
        const patronInfo = document.querySelector(".patroninfo");
        if (patronInfo) return patronInfo;

        const briefInfo = document.querySelector(".patronbriefinfo");
        if (briefInfo) {
            return briefInfo.closest(".patroninfo") || briefInfo;
        }

        const patronInformation = document.getElementById("patron-information");
        if (patronInformation) return patronInformation;

        return null;
    }

    function cleanText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function textOf(element) {
        return element ? cleanText(element.textContent) : "";
    }

    function firstText(root, selectors) {
        if (!root) return "";
        for (const selector of selectors) {
            const el = root.querySelector(selector);
            const value = textOf(el);
            if (value) return value;
        }
        return "";
    }

    function uniqueNonEmpty(values) {
        const seen = new Set();
        const result = [];
        values.forEach(function (value) {
            const cleaned = cleanText(value);
            if (!cleaned || seen.has(cleaned)) return;
            seen.add(cleaned);
            result.push(cleaned);
        });
        return result;
    }

    function resolveAddress(root) {
        if (!root) return "";

        const parts = [
            firstText(root, [".patronaddress1"]),
            firstText(root, [".patronaddress2"]),
            firstText(root, [".patronaddress3"]),
            firstText(root, [".patroncity"])
        ];

        const found = uniqueNonEmpty(parts);
        if (found.length) return found.join(", ");

        /* Repli borné pour les variantes de display-address-style.inc. */
        const addressBlock = root.querySelector(".address") || root.querySelector("ul.patronbriefinfo");
        if (!addressBlock) return "";

        const addressLines = Array.from(addressBlock.querySelectorAll(
            ".patronaddress1, .patronaddress2, .patronaddress3, .patroncity"
        )).map(textOf);

        return uniqueNonEmpty(addressLines).join(", ");
    }

    function resolvePhone(root) {
        return firstText(root, [
            ".patronphone a[href^='tel:']",
            ".patronphone",
            "a[href^='tel:']"
        ]);
    }

    function resolveEmail(root) {
        return firstText(root, [
            "li.email a[href^='mailto:']",
            ".email a[href^='mailto:']",
            "a[href^='mailto:']"
        ]);
    }

    function resolveDateOfBirth(root) {
        if (!root) return "";
        const item = root.querySelector(".patrondateofbirth");
        if (!item) return "";

        const copy = item.cloneNode(true);
        const firstDirectSpan = Array.from(copy.children).find(function (child) {
            return child.tagName === "SPAN";
        });
        if (firstDirectSpan) firstDirectSpan.remove();
        return textOf(copy);
    }

    const FIELD_RESOLVERS = {
        address: resolveAddress,
        phone: resolvePhone,
        email: resolveEmail,
        dateofbirth: resolveDateOfBirth
    };

    function getConfiguredValue(check, root, config) {
        if (!check || !check.id || !FIELD_RESOLVERS[check.id]) return "";
        const value = FIELD_RESOLVERS[check.id](root);
        if (value) return value;
        return detectLanguage() === "fr"
            ? (config.missingFr || "Non renseigné")
            : (config.missingEn || "Not provided");
    }

    function labelForCheck(check) {
        if (!check) return "";
        if (detectLanguage() === "fr") return check.labelFr || check.labelEn || check.id || "";
        return check.labelEn || check.labelFr || check.id || "";
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #${UI_ID} {
                margin-top: .65rem;
                padding: .65rem .75rem;
                border: 1px solid #d7dce1;
                border-left: 3px solid #e0a800;
                border-radius: .25rem;
                background: var(--bs-body-bg, #fff);
                color: var(--bs-body-color, #212529);
                max-width: 100%;
            }
            #${UI_ID} .pmk-renewal-heading {
                display: flex;
                align-items: center;
                gap: .35rem;
                margin-bottom: .5rem;
                min-width: 0;
            }
            #${UI_ID} .pmk-renewal-title {
                font-weight: 600;
                flex: 1 1 auto;
                min-width: 0;
                overflow-wrap: anywhere;
            }
            #${UI_ID} .pmk-renewal-checks {
                display: grid;
                gap: .35rem;
            }
            #${UI_ID} .pmk-renewal-check {
                display: grid;
                grid-template-columns: auto minmax(0, 1fr);
                gap: .45rem;
                align-items: start;
                margin: 0;
                cursor: pointer;
                padding: .2rem .1rem;
                max-width: 100%;
            }
            #${UI_ID} .pmk-renewal-check input {
                margin-top: .2rem;
                width: 1rem;
                height: 1rem;
                flex: 0 0 auto;
            }
            #${UI_ID} .pmk-renewal-value {
                overflow-wrap: anywhere;
                word-break: break-word;
            }
            #${UI_ID} .pmk-renewal-status {
                margin-top: .5rem;
                font-size: .9em;
                color: #6c757d;
            }
            #${UI_ID}.pmk-complete {
                border-left-color: #198754;
            }
            .pmk-patron-renew-link-locked {
                opacity: .55 !important;
                cursor: not-allowed !important;
            }
            @media (max-width: 576px) {
                #${UI_ID} {
                    padding: .55rem;
                }
                #${UI_ID} .pmk-renewal-check {
                    gap: .5rem;
                    padding: .3rem 0;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function setLinkLocked(link, locked) {
        if (!link || !isSupportedRenewLink(link)) return;

        if (locked) {
            if (!link.hasAttribute("data-pmk-renew-original-tabindex")) {
                const original = link.getAttribute("tabindex");
                link.setAttribute("data-pmk-renew-original-tabindex", original === null ? "__none__" : original);
            }
            link.classList.add("pmk-patron-renew-link-locked");
            link.setAttribute("aria-disabled", "true");
            link.setAttribute("tabindex", "-1");
        } else {
            link.classList.remove("pmk-patron-renew-link-locked");
            link.removeAttribute("aria-disabled");

            const original = link.getAttribute("data-pmk-renew-original-tabindex");
            if (original === "__none__") link.removeAttribute("tabindex");
            else if (original !== null) link.setAttribute("tabindex", original);
            link.removeAttribute("data-pmk-renew-original-tabindex");
        }
    }

    function syncRenewLinks() {
        const discovered = findRenewLinks();
        currentLinks = discovered;
        discovered.forEach(function (link) {
            setLinkLocked(link, runtimeLocked);
        });
    }

    function focusFirstUnchecked() {
        const first = document.querySelector("#" + UI_ID + " .pmk-renewal-check input:not(:checked)");
        if (first) {
            first.focus({ preventScroll: true });
            first.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }

    function installActionGuard() {
        if (guardInstalled) return;
        guardInstalled = true;

        const guard = function (event) {
            if (!runtimeLocked) return;
            const target = event.target && event.target.closest ? event.target.closest("a[href]") : null;
            if (!target || !isSupportedRenewLink(target)) return;

            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
            syncRenewLinks();
            focusFirstUnchecked();
        };

        document.addEventListener("click", guard, true);
        document.addEventListener("auxclick", guard, true);
    }

    function setLockedState(locked) {
        runtimeLocked = Boolean(locked);
        syncRenewLinks();

        const container = document.getElementById(UI_ID);
        if (!container) return;

        container.classList.toggle("pmk-complete", !runtimeLocked);
        const status = container.querySelector(".pmk-renewal-status");
        if (status) {
            status.textContent = runtimeLocked
                ? localText(
                    "Le renouvellement sera disponible après validation de toutes les informations.",
                    "Renewal will be available after all information has been confirmed."
                )
                : localText(
                    "Vérification terminée : le renouvellement Koha est disponible.",
                    "Verification complete: Koha renewal is available."
                );
        }
    }

    function removeRuntimeUi() {
        const container = document.getElementById(UI_ID);
        if (container) container.remove();
        runtimeLocked = false;
        currentWarning = null;
        currentLinks.forEach(function (link) { setLinkLocked(link, false); });
        findRenewLinks().forEach(function (link) { setLinkLocked(link, false); });
        currentLinks = [];
    }

    function mountContextAccess(heading) {
        if (!heading || !window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;

        window.PMKConfig.mountContextButton({
            moduleId: MODULE_ID,
            anchor: heading,
            position: "append",
            contextKey: currentPageId || "renewal",
            context: {
                pageId: currentPageId,
                sectionId: "pages"
            }
        });
    }

    function buildUi(config, warning, patronRoot, checks) {
        injectStyles();

        const container = document.createElement("div");
        container.id = UI_ID;
        container.setAttribute("role", "region");
        container.setAttribute(
            "aria-label",
            localText("Vérification avant renouvellement", "Verification before renewal")
        );

        const heading = document.createElement("div");
        heading.className = "pmk-renewal-heading";

        const title = document.createElement("div");
        title.className = "pmk-renewal-title";
        title.textContent = detectLanguage() === "fr"
            ? (config.introFr || DEFAULT_CONFIG.introFr)
            : (config.introEn || DEFAULT_CONFIG.introEn);
        heading.appendChild(title);
        container.appendChild(heading);

        const list = document.createElement("div");
        list.className = "pmk-renewal-checks";

        checks.forEach(function (check, index) {
            const label = document.createElement("label");
            label.className = "pmk-renewal-check";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "pmk-renewal-checkbox";
            checkbox.id = "pmk-renewal-check-" + index + "-" + check.id;
            checkbox.setAttribute("data-pmk-check-id", check.id);

            const value = document.createElement("span");
            value.className = "pmk-renewal-value";

            const strong = document.createElement("strong");
            strong.textContent = labelForCheck(check) + " : ";
            value.appendChild(strong);
            value.appendChild(document.createTextNode(getConfiguredValue(check, patronRoot, config)));

            label.appendChild(checkbox);
            label.appendChild(value);
            list.appendChild(label);
        });

        container.appendChild(list);

        const status = document.createElement("div");
        status.className = "pmk-renewal-status";
        status.setAttribute("aria-live", "polite");
        container.appendChild(status);

        const update = function () {
            const boxes = Array.from(container.querySelectorAll(".pmk-renewal-checkbox"));
            const complete = boxes.length > 0 && boxes.every(function (box) { return box.checked; });
            setLockedState(!complete);
        };

        list.addEventListener("change", function (event) {
            if (event.target && event.target.classList.contains("pmk-renewal-checkbox")) update();
        });

        warning.element.appendChild(container);
        mountContextAccess(heading);
        update();
    }

    function applyConfig(config) {
        removeRuntimeUi();

        const pageDef = getCurrentPageDefinition();
        if (!pageDef || !config || config.enabled === false) return;

        currentPageId = pageDef.id;
        const pageConfig = getPageConfig(config, pageDef.id);
        if (!pageConfig || pageConfig.enabled === false || pageConfig.path !== pageDef.path) return;

        const warning = detectWarningState();
        if (!warning || !warningEnabled(config, warning)) return;

        const renewLinks = findRenewLinks();
        if (!renewLinks.length) return;

        const patronRoot = getPatronInfoRoot();
        if (!patronRoot) return;

        const checks = Array.isArray(config.checks)
            ? config.checks.filter(function (check) {
                return check && check.enabled !== false && FIELD_RESOLVERS[check.id];
            })
            : [];
        if (!checks.length) return;

        currentWarning = warning;
        currentLinks = renewLinks;
        installActionGuard();
        buildUi(config, warning, patronRoot, checks);
    }

    function waitForRequiredStructure(timeoutMs) {
        return new Promise(function (resolve) {
            const inspect = function () {
                const warning = detectWarningState();
                const patron = getPatronInfoRoot();
                return warning && patron ? { warning: warning, patron: patron } : null;
            };

            const existing = inspect();
            if (existing) {
                resolve(existing);
                return;
            }

            const root = document.body || document.documentElement;
            if (!root) {
                resolve(null);
                return;
            }

            let finished = false;
            const observer = new MutationObserver(function () {
                const found = inspect();
                if (!found || finished) return;
                finished = true;
                observer.disconnect();
                resolve(found);
            });

            observer.observe(root, { childList: true, subtree: true });
            window.setTimeout(function () {
                if (finished) return;
                finished = true;
                observer.disconnect();
                resolve(inspect());
            }, timeoutMs || 3000);
        });
    }

    function validateConfig(config) {
        if (!config || !Array.isArray(config.pages) || !Array.isArray(config.checks)) {
            return { ok: false, message: "Configuration incomplète." };
        }

        if (config.enabled !== false && config.expired === false && config.expiringSoon === false) {
            return { ok: false, message: "Active au moins un état : adhésion expirée ou expiration prochaine." };
        }

        const knownPages = new Set(PAGES.map(function (page) { return page.id; }));
        const pageIds = new Set();
        for (const page of config.pages) {
            if (!page || !page.id || !knownPages.has(page.id)) {
                return { ok: false, message: "Une page configurée n'est pas reconnue par le module." };
            }
            if (pageIds.has(page.id)) {
                return { ok: false, message: "Une même page ne peut être configurée qu'une seule fois." };
            }
            pageIds.add(page.id);

            const def = PAGES.find(function (candidate) { return candidate.id === page.id; });
            if (!def || page.path !== def.path) {
                return { ok: false, message: "Le chemin d'une page ne correspond pas à l'adaptateur Koha attendu." };
            }
        }

        const knownChecks = new Set(CHECK_OPTIONS.map(function (option) { return option.value; }));
        const checkIds = new Set();
        let activeCount = 0;

        for (const check of config.checks) {
            if (!check || !check.id || !knownChecks.has(check.id)) {
                return { ok: false, message: "Une information à vérifier n'est pas reconnue par le module." };
            }
            if (checkIds.has(check.id)) {
                return { ok: false, message: "Une information ne peut apparaître qu'une seule fois dans la checklist." };
            }
            checkIds.add(check.id);

            if (check.enabled !== false) {
                activeCount += 1;
                if (!String(check.labelFr || "").trim() || !String(check.labelEn || "").trim()) {
                    return { ok: false, message: "Chaque vérification active doit avoir un libellé français et anglais." };
                }
            }
        }

        if (config.enabled !== false && activeCount === 0) {
            return { ok: false, message: "Le module actif doit contenir au moins une information à vérifier." };
        }

        return { ok: true };
    }

    function nextUnusedPage(rootObject) {
        const used = new Set((rootObject.pages || []).map(function (page) { return page && page.id; }));
        return PAGES.find(function (page) { return !used.has(page.id); }) || PAGES[0];
    }

    function nextUnusedCheck(rootObject) {
        const used = new Set((rootObject.checks || []).map(function (check) { return check && check.id; }));
        return CHECK_OPTIONS.find(function (option) { return !used.has(option.value); }) || CHECK_OPTIONS[0];
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 1,
            name: {
                fr: "Vérification avant renouvellement lecteur",
                en: "Patron renewal verification"
            },
            description: {
                fr: "Demande à l'agent de confirmer des informations lecteur avant de déverrouiller les actions natives Koha de renouvellement de l'adhésion.",
                en: "Requires staff to confirm patron information before unlocking Koha's native membership renewal actions."
            },
            category: { fr: "Lecteurs", en: "Patrons" },
            supportedPages: PAGES.map(function (page) {
                return { id: page.id, path: page.path, label: { fr: page.labelFr, en: page.labelEn } };
            }),
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            validate: validateConfig,
            schema: [
                {
                    type: "section",
                    id: "general",
                    label: { fr: "Paramètres généraux", en: "General settings" },
                    fields: [
                        {
                            key: "enabled",
                            type: "boolean",
                            label: { fr: "Module actif", en: "Module enabled" }
                        },
                        {
                            key: "expired",
                            type: "boolean",
                            label: { fr: "Contrôler les adhésions expirées", en: "Check expired memberships" }
                        },
                        {
                            key: "expiringSoon",
                            type: "boolean",
                            label: { fr: "Contrôler les adhésions arrivant à expiration", en: "Check memberships expiring soon" }
                        },
                        {
                            key: "introFr",
                            type: "text",
                            label: { fr: "Texte introductif — français", en: "Introductory text — French" }
                        },
                        {
                            key: "introEn",
                            type: "text",
                            label: { fr: "Texte introductif — anglais", en: "Introductory text — English" }
                        },
                        {
                            key: "missingFr",
                            type: "text",
                            label: { fr: "Valeur absente — français", en: "Missing value — French" }
                        },
                        {
                            key: "missingEn",
                            type: "text",
                            label: { fr: "Valeur absente — anglais", en: "Missing value — English" }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "pages",
                    label: { fr: "Pages configurées", en: "Configured pages" },
                    description: {
                        fr: "Les adaptateurs techniques restent internes au module ; l'utilisateur choisit seulement où la fonction est active.",
                        en: "Technical adapters remain internal to the module; users only choose where the feature is enabled."
                    },
                    fields: [
                        {
                            key: "pages",
                            type: "repeater",
                            label: { fr: "Pages Koha", en: "Koha pages" },
                            addLabel: { fr: "Ajouter une page", en: "Add page" },
                            emptyLabel: { fr: "Aucune page configurée.", en: "No configured page." },
                            reorder: true,
                            canAdd: function (rootObject, fieldPath, items) {
                                const used = new Set(items.map(function (item) { return item && item.id; }));
                                return PAGES.some(function (page) { return !used.has(page.id); });
                            },
                            cannotAddHelp: {
                                fr: "Toutes les pages actuellement prises en charge sont déjà configurées.",
                                en: "All currently supported pages are already configured."
                            },
                            newItem: function (rootObject) {
                                const page = nextUnusedPage(rootObject);
                                return {
                                    id: page.id,
                                    path: page.path,
                                    enabled: true,
                                    labelFr: page.labelFr,
                                    labelEn: page.labelEn
                                };
                            },
                            itemTitle: function (item, index, lang) {
                                if (!item) return "#" + (index + 1);
                                return lang === "fr" ? (item.labelFr || item.id) : (item.labelEn || item.id);
                            },
                            fields: [
                                {
                                    key: "enabled",
                                    type: "boolean",
                                    label: { fr: "Page active", en: "Page enabled" }
                                },
                                {
                                    key: "id",
                                    type: "select",
                                    label: { fr: "Page Koha", en: "Koha page" },
                                    options: function (rootObject, fieldPath) {
                                        const index = fieldPath[fieldPath.length - 2];
                                        const current = rootObject.pages && rootObject.pages[index]
                                            ? rootObject.pages[index].id
                                            : "";
                                        const used = new Set((rootObject.pages || []).map(function (page) {
                                            return page && page.id;
                                        }));
                                        return PAGES.filter(function (page) {
                                            return page.id === current || !used.has(page.id);
                                        }).map(function (page) {
                                            return {
                                                value: page.id,
                                                label: {
                                                    fr: page.labelFr + " — " + page.path.replace("/cgi-bin/koha/", ""),
                                                    en: page.labelEn + " — " + page.path.replace("/cgi-bin/koha/", "")
                                                }
                                            };
                                        });
                                    },
                                    onChange: function (rootObject, fieldPath, value) {
                                        const index = fieldPath[fieldPath.length - 2];
                                        const item = rootObject.pages && rootObject.pages[index];
                                        const page = PAGES.find(function (candidate) { return candidate.id === value; });
                                        if (!item || !page) return;
                                        item.path = page.path;
                                        item.labelFr = page.labelFr;
                                        item.labelEn = page.labelEn;
                                    }
                                },
                                {
                                    key: "path",
                                    type: "readonly",
                                    label: { fr: "Chemin Koha", en: "Koha path" }
                                },
                                {
                                    key: "labelFr",
                                    type: "text",
                                    label: { fr: "Nom de la page — français", en: "Page name — French" }
                                },
                                {
                                    key: "labelEn",
                                    type: "text",
                                    label: { fr: "Nom de la page — anglais", en: "Page name — English" }
                                }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "checks",
                    label: { fr: "Informations à vérifier", en: "Information to verify" },
                    description: {
                        fr: "Toutes les vérifications actives doivent être cochées avant que Koha autorise le renouvellement.",
                        en: "All enabled checks must be confirmed before Koha renewal actions are unlocked."
                    },
                    fields: [
                        {
                            key: "checks",
                            type: "repeater",
                            label: { fr: "Checklist", en: "Checklist" },
                            addLabel: { fr: "Ajouter une information", en: "Add information" },
                            emptyLabel: { fr: "Aucune information à vérifier.", en: "No information to verify." },
                            reorder: true,
                            canAdd: function (rootObject, fieldPath, items) {
                                const used = new Set(items.map(function (item) { return item && item.id; }));
                                return CHECK_OPTIONS.some(function (option) { return !used.has(option.value); });
                            },
                            cannotAddHelp: {
                                fr: "Toutes les informations prises en charge possèdent déjà une règle.",
                                en: "All supported information already has a rule."
                            },
                            newItem: function (rootObject) {
                                const option = nextUnusedCheck(rootObject);
                                return {
                                    id: option.value,
                                    enabled: true,
                                    labelFr: option.label.fr,
                                    labelEn: option.label.en
                                };
                            },
                            itemTitle: function (item, index, lang) {
                                if (!item) return "#" + (index + 1);
                                const option = CHECK_OPTIONS.find(function (candidate) { return candidate.value === item.id; });
                                if (!option) return item.id || ("#" + (index + 1));
                                return lang === "fr" ? option.label.fr : option.label.en;
                            },
                            fields: [
                                {
                                    key: "enabled",
                                    type: "boolean",
                                    label: { fr: "Vérification active", en: "Check enabled" }
                                },
                                {
                                    key: "id",
                                    type: "select",
                                    label: { fr: "Information lecteur", en: "Patron information" },
                                    options: function (rootObject, fieldPath) {
                                        const index = fieldPath[fieldPath.length - 2];
                                        const current = rootObject.checks && rootObject.checks[index]
                                            ? rootObject.checks[index].id
                                            : "";
                                        const used = new Set((rootObject.checks || []).map(function (check) {
                                            return check && check.id;
                                        }));
                                        return CHECK_OPTIONS.filter(function (option) {
                                            return option.value === current || !used.has(option.value);
                                        });
                                    },
                                    onChange: function (rootObject, fieldPath, value) {
                                        const index = fieldPath[fieldPath.length - 2];
                                        const item = rootObject.checks && rootObject.checks[index];
                                        const option = CHECK_OPTIONS.find(function (candidate) { return candidate.value === value; });
                                        if (!item || !option) return;
                                        item.labelFr = option.label.fr;
                                        item.labelEn = option.label.en;
                                    }
                                },
                                {
                                    key: "labelFr",
                                    type: "text",
                                    label: { fr: "Libellé — français", en: "Label — French" }
                                },
                                {
                                    key: "labelEn",
                                    type: "text",
                                    label: { fr: "Libellé — anglais", en: "Label — English" }
                                }
                            ]
                        }
                    ]
                }
            ],
            focusContext: function (main, context) {
                if (!main || !context) return;
                const targetId = context.sectionId || "pages";
                const target = main.querySelector('[data-pmk-section-id="' + targetId + '"]');
                if (!target) return;
                window.setTimeout(function () {
                    target.scrollIntoView({ behavior: "smooth", block: "start" });
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

        const pageDef = getCurrentPageDefinition();
        if (!pageDef) return;

        /*
         * Ne pas ouvrir Firestore sur une page cible si aucun état d'expiration
         * n'est présent : le module n'a alors rien à faire.
         */
        const structure = await waitForRequiredStructure(4000);
        if (!structure) return;

        currentConfig = await window.PMKConfig.getConfig(MODULE_ID);
        applyConfig(currentConfig);

        window.PMKConfig.subscribe(MODULE_ID, function (newConfig) {
            currentConfig = clone(newConfig);
            applyConfig(currentConfig);
        });
    }

    async function startWithoutCore() {
        if (fallbackStarted) return;
        fallbackStarted = true;

        const pageDef = getCurrentPageDefinition();
        if (!pageDef) return;

        const structure = await waitForRequiredStructure(4000);
        if (!structure) return;

        currentConfig = clone(DEFAULT_CONFIG);
        applyConfig(currentConfig);
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
            startWithCore();
        } else {
            startWithoutCore();
            window.addEventListener("pmk:config-ready", function () {
                startWithCore();
            }, { once: true });
        }
    });
})();

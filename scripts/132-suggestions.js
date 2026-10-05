/* ============================================================
   132-suggestions.js
   PimpMyKoha — Lecteur obligatoire pour une suggestion d'achat
   Version : 2.0.1-preplugin

   Correction 2.0.1 :
   - suppression de la boucle infinie MutationObserver ;
   - l'observer ne sert plus qu'à attendre l'apparition du formulaire ;
   - updateState() est désormais idempotent ;
   - l'avertissement n'est plus supprimé/recréé à chaque contrôle ;
   - contrôle lors du retour de focus après sélection d'un lecteur ;
   - conservation du blocage au submit.
   ============================================================ */

(function (window, document) {
    "use strict";

    if (!window || !document) return;

    if (window.__PMK132SuggestionSuggester) return;
    window.__PMK132SuggestionSuggester = true;

    const MODULE_ID = "suggestion-required-suggester";
    const MODULE_VERSION = "2.0.1-preplugin";

    const PAGE_PATH = "/cgi-bin/koha/suggestion/suggestion.pl";

    const WARNING_ID = "pmk132-suggester-warning";
    const STYLE_ID = "pmk132-suggester-style";

    const DEFAULT_CONFIG = Object.freeze({
        enabled: true,

        warningFr:
            "Lecteur obligatoire : associez un lecteur à cette suggestion avant de l’enregistrer.",

        warningEn:
            "Patron required: associate a patron with this suggestion before saving it.",

        alertFr:
            "Impossible d’enregistrer cette suggestion.\n\n" +
            "Aucun lecteur n’est associé à la suggestion.\n\n" +
            "Cliquez sur « Attribuer à l’adhérent » et sélectionnez le lecteur concerné.",

        alertEn:
            "This suggestion cannot be saved.\n\n" +
            "No patron is associated with it.\n\n" +
            "Choose a patron before saving."
    });


    /* =========================================================
       État
       ========================================================= */

    let currentConfig = clone(DEFAULT_CONFIG);

    let unsubscribe = null;
    let observer = null;
    let formBound = null;

    let listenersInstalled = false;


    /* =========================================================
       Utilitaires
       ========================================================= */

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }


    function isSuggestionPage() {
        return window.location.pathname === PAGE_PATH;
    }


    function lang() {
        if (
            window.PMKConfig &&
            typeof window.PMKConfig.getLanguage === "function"
        ) {
            return window.PMKConfig.getLanguage();
        }

        const value = String(
            document.documentElement.lang ||
            navigator.language ||
            "fr"
        ).toLowerCase();

        return value.startsWith("en") ? "en" : "fr";
    }


    function normalizeConfig(raw) {
        const s =
            raw && typeof raw === "object"
                ? raw
                : {};

        return {
            enabled: s.enabled !== false,

            warningFr: String(
                s.warningFr || DEFAULT_CONFIG.warningFr
            ),

            warningEn: String(
                s.warningEn || DEFAULT_CONFIG.warningEn
            ),

            alertFr: String(
                s.alertFr || DEFAULT_CONFIG.alertFr
            ),

            alertEn: String(
                s.alertEn || DEFAULT_CONFIG.alertEn
            )
        };
    }


    function escapeHtml(value) {
        return String(
            value == null ? "" : value
        ).replace(
            /[&<>"']/g,
            function (char) {
                return {
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#039;"
                }[char];
            }
        );
    }


    /* =========================================================
       Éléments Koha
       ========================================================= */

    function getForm() {
        return document.querySelector("#add_edit");
    }


    function getSuggestedBy() {
        return document.querySelector("#suggestedby");
    }


    function getCell() {
        return document.querySelector("#tdsuggestedby");
    }


    function getButton() {
        return document.querySelector("#edit_suggester");
    }


    function patronId() {
        const input = getSuggestedBy();

        return input
            ? String(input.value || "").trim()
            : "";
    }


    /* =========================================================
       CSS
       ========================================================= */

    function installStyle() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");

        style.id = STYLE_ID;

        style.textContent = `
            #tdsuggestedby.pmk132-suggester-required {
                background-color: #fff3cd;
                outline: 2px solid #d39e00;
                outline-offset: -2px;
            }

            #${WARNING_ID} {
                margin-top: 8px;
                margin-bottom: 0;
            }
        `;

        document.head.appendChild(style);
    }


    /* =========================================================
       Avertissement
       ========================================================= */

    function clearWarning() {
        const warning =
            document.getElementById(WARNING_ID);

        if (warning) {
            warning.remove();
        }

        const cell = getCell();

        if (cell) {
            cell.classList.remove(
                "pmk132-suggester-required"
            );
        }
    }


    function warningText() {
        return lang() === "en"
            ? currentConfig.warningEn
            : currentConfig.warningFr;
    }


    function updateExistingWarning(warning) {
        if (!warning) return;

        const strong =
            warning.querySelector(
                ".pmk132-warning-text"
            );

        if (strong) {
            const expected = warningText();

            if (strong.textContent !== expected) {
                strong.textContent = expected;
            }
        }
    }


    function createWarning(cell) {
        if (!cell) return null;

        const warning =
            document.createElement("div");

        warning.id = WARNING_ID;

        warning.className =
            "alert alert-warning";

        warning.innerHTML =
            '<i class="fa fa-exclamation-triangle" ' +
            'aria-hidden="true"></i> ' +
            '<strong class="pmk132-warning-text">' +
            escapeHtml(warningText()) +
            "</strong>";

        cell.appendChild(warning);

        /*
         * Bouton de configuration PMK.
         *
         * Il n'est monté qu'au moment de la création
         * du bloc, et non à chaque updateState().
         */
        if (
            window.PMKConfig &&
            typeof window.PMKConfig.mountContextButton ===
                "function"
        ) {
            try {
                window.PMKConfig.mountContextButton({
                    moduleId: MODULE_ID,
                    anchor: warning,
                    position: "append",
                    contextKey:
                        "pmk132-suggester"
                });
            } catch (_) {
                /* Ne pas bloquer le module */
            }
        }

        return warning;
    }


    function updateState() {
        if (!isSuggestionPage()) return;

        const cell = getCell();

        if (!cell) return;


        /*
         * Module désactivé :
         * aucun avertissement.
         */
        if (currentConfig.enabled === false) {
            clearWarning();
            return;
        }


        /*
         * Un lecteur est présent :
         * aucun avertissement.
         */
        if (patronId()) {
            clearWarning();
            return;
        }


        /*
         * Lecteur absent.
         */
        cell.classList.add(
            "pmk132-suggester-required"
        );


        /*
         * IMPORTANT :
         * ne surtout pas supprimer/recréer
         * l'avertissement s'il existe déjà.
         */
        let warning =
            document.getElementById(WARNING_ID);

        if (warning) {
            updateExistingWarning(warning);
            return;
        }


        warning = createWarning(cell);
    }


    /* =========================================================
       Blocage de l'enregistrement
       ========================================================= */

    function submitHandler(event) {
        if (currentConfig.enabled === false) {
            return;
        }

        if (patronId()) {
            return;
        }


        event.preventDefault();

        event.stopImmediatePropagation();


        updateState();


        const cell = getCell();

        if (
            cell &&
            typeof cell.scrollIntoView ===
                "function"
        ) {
            cell.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        }


        window.alert(
            lang() === "en"
                ? currentConfig.alertEn
                : currentConfig.alertFr
        );


        const button = getButton();

        if (button) {
            button.focus();
        }


        return false;
    }


    /* =========================================================
       Liaison du formulaire
       ========================================================= */

    function bindForm() {
        if (!isSuggestionPage()) {
            return false;
        }

        const form = getForm();

        if (!form) {
            return false;
        }


        /*
         * Si c'est déjà le formulaire lié,
         * on ne refait rien.
         */
        if (formBound === form) {
            updateState();
            return true;
        }


        /*
         * Nettoyage de l'ancien formulaire
         * si Koha l'avait remplacé.
         */
        if (formBound) {
            formBound.removeEventListener(
                "submit",
                submitHandler,
                true
            );
        }


        form.addEventListener(
            "submit",
            submitHandler,
            true
        );

        formBound = form;


        updateState();

        return true;
    }


    /* =========================================================
       Événements
       ========================================================= */

    function fieldEventHandler(event) {
        if (!event.target) return;

        if (
            event.target.matches &&
            event.target.matches("#suggestedby")
        ) {
            updateState();
        }
    }


    function windowFocusHandler() {
        if (!isSuggestionPage()) return;

        /*
         * Utile notamment lorsque le choix du lecteur
         * passe par une fenêtre/pop-up Koha.
         */
        window.setTimeout(
            updateState,
            50
        );
    }


    function installListeners() {
        if (listenersInstalled) return;

        listenersInstalled = true;


        document.addEventListener(
            "change",
            fieldEventHandler,
            true
        );


        document.addEventListener(
            "input",
            fieldEventHandler,
            true
        );


        window.addEventListener(
            "focus",
            windowFocusHandler
        );
    }


    /* =========================================================
       MutationObserver
       ========================================================= */

    function waitForForm() {
        if (!isSuggestionPage()) return;


        /*
         * Dans le cas normal, le formulaire existe déjà.
         */
        if (bindForm()) {
            return;
        }


        /*
         * Sinon on attend uniquement son apparition.
         *
         * CRITIQUE :
         * l'observer est déconnecté immédiatement
         * une fois le formulaire trouvé.
         *
         * Il ne surveille donc PAS en permanence
         * les mutations générées par updateState().
         */
        if (
            typeof MutationObserver !==
                "function"
        ) {
            return;
        }


        if (observer) {
            return;
        }


        observer =
            new MutationObserver(
                function () {
                    if (!bindForm()) {
                        return;
                    }


                    observer.disconnect();
                    observer = null;
                }
            );


        observer.observe(
            document.body ||
                document.documentElement,
            {
                childList: true,
                subtree: true
            }
        );
    }


    /* =========================================================
       Définition PMK
       ========================================================= */

    function definition() {
        return {
            id: MODULE_ID,

            schemaVersion: 1,

            name: {
                fr:
                    "Suggestions — lecteur obligatoire",

                en:
                    "Suggestions — patron required"
            },

            description: {
                fr:
                    "Empêche l’enregistrement d’une suggestion d’achat sans lecteur dans « Suggéré par ».",

                en:
                    "Prevents saving a purchase suggestion without a patron in the suggester field."
            },

            category: {
                fr:
                    "Acquisitions / suggestions",

                en:
                    "Acquisitions / suggestions"
            },

            supportedPages: [
                "suggestions.edit"
            ],

            defaults:
                clone(DEFAULT_CONFIG),

            schema: [
                {
                    type: "section",

                    id: "settings",

                    label: {
                        fr: "Réglages",
                        en: "Settings"
                    },

                    fields: [
                        {
                            key: "enabled",

                            type: "boolean",

                            label: {
                                fr:
                                    "Rendre le lecteur obligatoire",

                                en:
                                    "Require a patron"
                            }
                        },

                        {
                            key: "warningFr",

                            type: "text",

                            label: {
                                fr:
                                    "Avertissement — français",

                                en:
                                    "Warning — French"
                            }
                        },

                        {
                            key: "warningEn",

                            type: "text",

                            label: {
                                fr:
                                    "Avertissement — anglais",

                                en:
                                    "Warning — English"
                            }
                        },

                        {
                            key: "alertFr",

                            type: "textarea",

                            rows: 4,

                            label: {
                                fr:
                                    "Message bloquant — français",

                                en:
                                    "Blocking message — French"
                            }
                        },

                        {
                            key: "alertEn",

                            type: "textarea",

                            rows: 4,

                            label: {
                                fr:
                                    "Message bloquant — anglais",

                                en:
                                    "Blocking message — English"
                            }
                        }
                    ]
                }
            ]
        };
    }


    /* =========================================================
       Enregistrement PMK
       ========================================================= */

    function registerModule() {
        if (
            !window.PMKConfig ||
            typeof window.PMKConfig.registerModule !==
                "function"
        ) {
            return false;
        }


        try {
            window.PMKConfig.registerModule(
                definition()
            );
        } catch (_) {
            return false;
        }


        if (
            !unsubscribe &&
            typeof window.PMKConfig.subscribe ===
                "function"
        ) {
            try {
                unsubscribe =
                    window.PMKConfig.subscribe(
                        MODULE_ID,
                        function (cfg) {
                            currentConfig =
                                normalizeConfig(cfg);

                            updateState();
                        }
                    );
            } catch (_) {
                /* Ne pas bloquer */
            }
        }


        return true;
    }


    /* =========================================================
       Initialisation
       ========================================================= */

    async function start() {
        registerModule();


        if (
            window.PMKConfig &&
            typeof window.PMKConfig.getConfig ===
                "function"
        ) {
            try {
                currentConfig =
                    normalizeConfig(
                        await window.PMKConfig.getConfig(
                            MODULE_ID
                        )
                    );
            } catch (_) {
                currentConfig =
                    normalizeConfig(
                        DEFAULT_CONFIG
                    );
            }
        }


        /*
         * Le module est enregistré dans PMK partout,
         * mais son comportement ne s'exécute que
         * sur suggestion.pl.
         */
        if (!isSuggestionPage()) {
            return;
        }


        installStyle();

        installListeners();

        waitForForm();
    }


    /* =========================================================
       API publique
       ========================================================= */

    window.PMK132SuggestionSuggester = {
        moduleId: MODULE_ID,
        version: MODULE_VERSION,

        refresh: updateState
    };


    /* =========================================================
       Démarrage
       ========================================================= */

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            start,
            {
                once: true
            }
        );
    } else {
        start();
    }


    /*
     * PMK peut arriver après ce module.
     */
    if (!window.PMKConfig) {
        window.addEventListener(
            "pmk:config-ready",
            function () {
                registerModule();

                if (isSuggestionPage()) {
                    updateState();
                }
            },
            {
                once: true
            }
        );
    }

})(window, document);
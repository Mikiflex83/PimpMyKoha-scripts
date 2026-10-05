(function () {
    'use strict';

    if (window.__PMK123SearchFilterBadgesBootstrap) return;
    window.__PMK123SearchFilterBadgesBootstrap = true;

    const PMK123_MODULE_ID = 'search-filter-badges';
    const PMK123_VERSION = '2.0.0-preplugin';
    const PMK123_DEFAULTS = { enabled: true };
    let pmk123Config = { enabled: true };
    let pmk123Initialized = false;
    let pmk123Unsubscribe = null;

    function pmk123Normalize(raw) {
        return { enabled: !(raw && raw.enabled === false) };
    }

    function pmk123Definition() {
        return {
            id: PMK123_MODULE_ID,
            schemaVersion: 1,
            name: { fr: 'Badges des filtres de recherche', en: 'Search filter badges' },
            description: {
                fr: 'Conserve le rendu historique du 123 : les filtres actifs du catalogue et de la recherche adhérents sont matérialisés par des badges compacts et supprimables.',
                en: 'Keeps the historical 123 behavior: active catalogue and patron-search filters are shown as compact removable badges.'
            },
            category: { fr: 'Recherche / interface', en: 'Search / interface' },
            supportedPages: ['catalogue.search', 'members.search'],
            prerequisites: [],
            dependencies: [],
            defaults: { enabled: true },
            normalize: pmk123Normalize,
            schema: [
                {
                    type: 'section',
                    id: 'settings',
                    label: { fr: 'Réglages', en: 'Settings' },
                    fields: [
                        { key: 'enabled', type: 'boolean', label: { fr: 'Activer les badges de filtres', en: 'Enable filter badges' } }
                    ]
                }
            ]
        };
    }

    function pmk123Register() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== 'function') return false;
        try { window.PMKConfig.registerModule(pmk123Definition()); } catch (_) { return false; }
        if (!pmk123Unsubscribe && typeof window.PMKConfig.subscribe === 'function') {
            try {
                pmk123Unsubscribe = window.PMKConfig.subscribe(PMK123_MODULE_ID, function (cfg) {
                    pmk123Config = pmk123Normalize(cfg);
                    document.documentElement.classList.toggle('pmk123-disabled', pmk123Config.enabled === false);
                    if (pmk123Config.enabled && !pmk123Initialized) {
                        pmk123Initialized = true;
                        initKohaSearchEnhancements();
                    }
                });
            } catch (_) {}
        }
        return true;
    }

    function pmk123EnsureDisableStyle() {
        if (document.getElementById('pmk123-disable-style')) return;
        const style = document.createElement('style');
        style.id = 'pmk123-disable-style';
        style.textContent = '.pmk123-disabled .koha-search-index-indicator,.pmk123-disabled .koha-search-library-indicator,.pmk123-disabled .koha-member-search-filter-indicator{display:none!important}';
        document.head.appendChild(style);
    }


    /*
     * ================================================================
     * INITIALISATION GÉNÉRALE
     * ================================================================
     */

    function initKohaSearchEnhancements() {

        if (pmk123Config.enabled === false) return;


        /*
         * ============================================================
         * CSS AUTONOME
         * ============================================================
         */

        if (
            !document.getElementById(
                'koha-search-enhancements-css'
            )
        ) {

            const style =
                document.createElement('style');

            style.id =
                'koha-search-enhancements-css';


            style.textContent = `

                /*
                 * ====================================================
                 * BADGES CATALOGUE
                 * ====================================================
                 */

                .koha-search-index-indicator,
                .koha-search-library-indicator {

                    display: none;

                    align-self: center !important;

                    align-items: center !important;
                    justify-content: center !important;

                    /*
                     * Espacement très réduit entre les badges.
                     */

                    margin-left: 2px !important;
                    margin-right: 2px !important;

                    padding: 1px 5px 1px 8px !important;

                    width: auto !important;
                    height: 20px !important;

                    min-height: 20px !important;
                    max-height: 20px !important;

                    box-sizing: border-box !important;

                    border-radius: 10px !important;

                    font-size: 10px !important;
                    font-weight: 500 !important;

                    line-height: 18px !important;

                    white-space: nowrap !important;

                    flex: 0 0 auto !important;

                    float: none !important;

                    position: relative !important;
                    top: 0 !important;

                    box-shadow: none !important;
                }


                /*
                 * ====================================================
                 * BADGES CATALOGUE ACTIFS
                 * ====================================================
                 */

                .koha-search-index-indicator.is-active,
                .koha-search-library-indicator.is-active {

                    display: inline-flex !important;

                }


                /*
                 * ====================================================
                 * INDEX CATALOGUE
                 * ====================================================
                 */

                .koha-search-index-indicator {

                    background:
                        rgba(255, 193, 7, 0.15) !important;

                    border:
                        1px solid
                        rgba(255, 193, 7, 0.45) !important;

                    color: #8a6d00 !important;
                }


                /*
                 * ====================================================
                 * BIBLIOTHÈQUE CATALOGUE
                 * ====================================================
                 */

                .koha-search-library-indicator {

                    background:
                        rgba(13, 110, 253, 0.12) !important;

                    border:
                        1px solid
                        rgba(13, 110, 253, 0.35) !important;

                    color: #0a58ca !important;
                }


                /*
                 * ====================================================
                 * BADGES ADHÉRENTS
                 * ====================================================
                 */

                .koha-member-search-filter-indicator {

                    display: none;

                    align-self: center !important;

                    align-items: center !important;
                    justify-content: center !important;

                    /*
                     * Même espacement que les badges catalogue.
                     */

                    margin-left: 2px !important;
                    margin-right: 2px !important;

                    padding: 1px 5px 1px 8px !important;

                    width: auto !important;
                    height: 20px !important;

                    min-height: 20px !important;
                    max-height: 20px !important;

                    box-sizing: border-box !important;

                    border-radius: 10px !important;

                    font-size: 10px !important;
                    font-weight: 500 !important;

                    line-height: 18px !important;

                    white-space: nowrap !important;

                    flex: 0 0 auto !important;

                    float: none !important;

                    position: relative !important;
                    top: 0 !important;

                    box-shadow: none !important;
                }


                /*
                 * ====================================================
                 * BADGES ADHÉRENTS ACTIFS
                 * ====================================================
                 */

                .koha-member-search-filter-indicator.is-active {

                    display: inline-flex !important;

                }


                /*
                 * ====================================================
                 * LABELS
                 * ====================================================
                 */

                .koha-search-index-label,
                .koha-search-library-label,
                .koha-member-search-filter-label {

                    display: inline-flex !important;

                    align-items: center !important;
                    justify-content: center !important;

                    height: 100% !important;

                    margin: 0 !important;
                    padding: 0 !important;

                    line-height: 1 !important;

                    vertical-align: middle !important;

                    white-space: nowrap !important;
                }


                /*
                 * ====================================================
                 * BOUTONS X
                 * ====================================================
                 */

                .koha-search-index-remove,
                .koha-search-library-remove,
                .koha-member-search-filter-remove {

                    display: inline-flex !important;

                    align-items: center !important;
                    justify-content: center !important;

                    width: 15px !important;
                    height: 15px !important;

                    min-width: 15px !important;
                    max-width: 15px !important;

                    min-height: 15px !important;
                    max-height: 15px !important;

                    margin: 0 0 0 5px !important;

                    padding: 0 !important;

                    border: 0 !important;

                    border-radius: 50% !important;

                    background: transparent !important;

                    box-shadow: none !important;

                    font-family: inherit !important;

                    font-size: 13px !important;

                    cursor: pointer !important;

                    flex: 0 0 15px !important;

                    overflow: hidden !important;

                    vertical-align: middle !important;

                    text-align: center !important;

                    line-height: 1 !important;

                    transition:
                        background-color 0.12s ease,
                        color 0.12s ease;
                }


                /*
                 * ====================================================
                 * ICÔNE FONT AWESOME
                 * ====================================================
                 */

                .koha-search-index-remove i,
                .koha-search-library-remove i,
                .koha-member-search-filter-remove i {

                    display: flex !important;

                    align-items: center !important;
                    justify-content: center !important;

                    width: 100% !important;
                    height: 100% !important;

                    margin: 0 !important;
                    padding: 0 !important;

                    line-height: 1 !important;
                }


                /*
                 * ====================================================
                 * SURVOL X INDEX
                 * ====================================================
                 */

                .koha-search-index-remove {

                    color: #8a6d00 !important;
                }


                .koha-search-index-remove:hover {

                    background:
                        rgba(138, 109, 0, 0.18) !important;

                    color: #5f4b00 !important;
                }


                /*
                 * ====================================================
                 * SURVOL X BIBLIOTHÈQUE CATALOGUE
                 * ====================================================
                 */

                .koha-search-library-remove {

                    color: #0a58ca !important;
                }


                .koha-search-library-remove:hover {

                    background:
                        rgba(10, 88, 202, 0.16) !important;

                    color: #084298 !important;
                }


                /*
                 * ====================================================
                 * COULEUR CHAMP DE RECHERCHE
                 * ====================================================
                 */

                .koha-member-search-filter-searchfield {

                    background:
                        rgba(111, 66, 193, 0.12) !important;

                    border:
                        1px solid
                        rgba(111, 66, 193, 0.35) !important;

                    color: #59359a !important;
                }


                .koha-member-search-filter-searchfield
                .koha-member-search-filter-remove {

                    color: #59359a !important;
                }


                .koha-member-search-filter-searchfield
                .koha-member-search-filter-remove:hover {

                    background:
                        rgba(111, 66, 193, 0.16) !important;

                    color: #432874 !important;
                }


                /*
                 * ====================================================
                 * COULEUR TYPE DE RECHERCHE
                 * ====================================================
                 */

                .koha-member-search-filter-searchtype {

                    background:
                        rgba(25, 135, 84, 0.12) !important;

                    border:
                        1px solid
                        rgba(25, 135, 84, 0.35) !important;

                    color: #146c43 !important;
                }


                .koha-member-search-filter-searchtype
                .koha-member-search-filter-remove {

                    color: #146c43 !important;
                }


                .koha-member-search-filter-searchtype
                .koha-member-search-filter-remove:hover {

                    background:
                        rgba(25, 135, 84, 0.16) !important;

                    color: #0f5132 !important;
                }


                /*
                 * ====================================================
                 * COULEUR BIBLIOTHÈQUE ADHÉRENT
                 * ====================================================
                 */

                .koha-member-search-filter-branch {

                    background:
                        rgba(13, 110, 253, 0.12) !important;

                    border:
                        1px solid
                        rgba(13, 110, 253, 0.35) !important;

                    color: #0a58ca !important;
                }


                .koha-member-search-filter-branch
                .koha-member-search-filter-remove {

                    color: #0a58ca !important;
                }


                .koha-member-search-filter-branch
                .koha-member-search-filter-remove:hover {

                    background:
                        rgba(13, 110, 253, 0.16) !important;

                    color: #084298 !important;
                }


                /*
                 * ====================================================
                 * COULEUR CATÉGORIE
                 * ====================================================
                 */

                .koha-member-search-filter-category {

                    background:
                        rgba(253, 126, 20, 0.12) !important;

                    border:
                        1px solid
                        rgba(253, 126, 20, 0.35) !important;

                    color: #c45c00 !important;
                }


                .koha-member-search-filter-category
                .koha-member-search-filter-remove {

                    color: #c45c00 !important;
                }


                .koha-member-search-filter-category
                .koha-member-search-filter-remove:hover {

                    background:
                        rgba(253, 126, 20, 0.16) !important;

                    color: #994700 !important;
                }


                /*
                 * ====================================================
                 * FOCUS CLAVIER
                 * ====================================================
                 */

                .koha-search-index-remove:focus,
                .koha-search-library-remove:focus,
                .koha-member-search-filter-remove:focus {

                    outline: none !important;

                    border-radius: 50% !important;

                    box-shadow:
                        0 0 0 2px
                        rgba(0, 0, 0, 0.20) !important;
                }


                .koha-search-index-remove:focus-visible,
                .koha-search-library-remove:focus-visible,
                .koha-member-search-filter-remove:focus-visible {

                    outline: none !important;

                    border-radius: 50% !important;

                    box-shadow:
                        0 0 0 2px
                        rgba(0, 0, 0, 0.25) !important;
                }

            `;

            document.head.appendChild(style);
        }


        /*
         * ============================================================
         * OUTIL : CRÉER UN BADGE
         * ============================================================
         */

        function createBadge(options) {

            const {
                select,
                className,
                labelClass,
                buttonClass,
                defaultValue,
                filterName,
                colorClass
            } = options;


            if (!select) return null;


            /*
             * --------------------------------------------------------
             * Recherche du bouton d'options avancées
             * --------------------------------------------------------
             */

            const extraContent =
                select.closest(
                    '.form-extra-content'
                );


            if (!extraContent) return null;


            const toggle =
                extraContent.parentElement &&
                extraContent.parentElement.querySelector(
                    '.form-extra-content-toggle'
                );


            if (!toggle) return null;


            /*
             * --------------------------------------------------------
             * Création du badge
             * --------------------------------------------------------
             */

            let indicator =
                extraContent.parentNode.querySelector(
                    '.' + className
                );


            if (!indicator) {

                indicator =
                    document.createElement('span');

                indicator.className =
                    className +
                    ' ' +
                    colorClass;

                indicator.setAttribute(
                    'aria-live',
                    'polite'
                );


                toggle.parentNode.insertBefore(
                    indicator,
                    toggle
                );
            }


            /*
             * --------------------------------------------------------
             * Label
             * --------------------------------------------------------
             */

            let label =
                indicator.querySelector(
                    '.' + labelClass
                );


            if (!label) {

                label =
                    document.createElement('span');

                label.className =
                    labelClass;

                indicator.appendChild(label);
            }


            /*
             * --------------------------------------------------------
             * Bouton X
             * --------------------------------------------------------
             */

            let removeButton =
                indicator.querySelector(
                    '.' + buttonClass
                );


            if (!removeButton) {

                removeButton =
                    document.createElement('button');

                removeButton.type =
                    'button';

                removeButton.className =
                    buttonClass;

                removeButton.setAttribute(
                    'aria-label',
                    'Retirer le filtre ' +
                    filterName.toLowerCase()
                );

                removeButton.setAttribute(
                    'title',
                    'Retirer le filtre'
                );

                removeButton.innerHTML =
                    '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';

                indicator.appendChild(
                    removeButton
                );
            }


            /*
             * --------------------------------------------------------
             * Mise à jour
             * --------------------------------------------------------
             */

            function update() {

                const value =
                    select.value;


                /*
                 * Valeur par défaut :
                 * aucun badge.
                 */

                if (
                    value === defaultValue
                ) {

                    indicator.classList.remove(
                        'is-active'
                    );

                    label.textContent = '';

                    return;
                }


                const option =
                    select.options[
                        select.selectedIndex
                    ];


                if (!option) {

                    indicator.classList.remove(
                        'is-active'
                    );

                    label.textContent = '';

                    return;
                }


                const text =
                    option.textContent
                        .replace(/\s+/g, ' ')
                        .trim();


                label.textContent =
                    text;


                indicator.classList.add(
                    'is-active'
                );


                indicator.setAttribute(
                    'aria-label',
                    filterName +
                    ' : ' +
                    text
                );
            }


            /*
             * --------------------------------------------------------
             * Suppression
             * --------------------------------------------------------
             */

            removeButton.addEventListener(
                'click',
                function (event) {

                    event.preventDefault();

                    event.stopPropagation();


                    select.value =
                        defaultValue;


                    select.dispatchEvent(
                        new Event(
                            'change',
                            {
                                bubbles: true
                            }
                        )
                    );


                    update();
                }
            );


            /*
             * --------------------------------------------------------
             * Changement du select
             * --------------------------------------------------------
             */

            select.addEventListener(
                'change',
                update
            );


            /*
             * --------------------------------------------------------
             * État initial
             * --------------------------------------------------------
             */

            update();


            return {
                update: update,
                indicator: indicator
            };
        }


        /*
         * ============================================================
         * 1. RECHERCHE CATALOGUE — INDEX
         * ============================================================
         */

        const catalogIndex =
            document.getElementById('idx_0');


        createBadge({
            select: catalogIndex,

            className:
                'koha-search-index-indicator',

            labelClass:
                'koha-search-index-label',

            buttonClass:
                'koha-search-index-remove',

            defaultValue:
                'kw',

            filterName:
                'Index de recherche',

            colorClass:
                ''
        });


        /*
         * ============================================================
         * 2. RECHERCHE CATALOGUE — BIBLIOTHÈQUE
         * ============================================================
         */

        const catalogLibrary =
            document.getElementById('select_library');


        createBadge({
            select: catalogLibrary,

            className:
                'koha-search-library-indicator',

            labelClass:
                'koha-search-library-label',

            buttonClass:
                'koha-search-library-remove',

            defaultValue:
                '',

            filterName:
                'Bibliothèque',

            colorClass:
                ''
        });


        /*
         * ============================================================
         * 3. RECHERCHE ADHÉRENTS — CHAMP
         * ============================================================
         */

        const memberSearchField =
            document.getElementById(
                'searchfieldstype'
            );


        createBadge({
            select: memberSearchField,

            className:
                'koha-member-search-filter-indicator ' +
                'koha-member-search-filter-searchfield',

            labelClass:
                'koha-member-search-filter-label',

            buttonClass:
                'koha-member-search-filter-remove',

            defaultValue:
                'standard',

            filterName:
                'Champ de recherche',

            colorClass:
                ''
        });


        /*
         * ============================================================
         * 4. RECHERCHE ADHÉRENTS — TYPE
         * ============================================================
         */

        const memberSearchType =
            document.getElementById(
                'searchtype'
            );


        createBadge({
            select: memberSearchType,

            className:
                'koha-member-search-filter-indicator ' +
                'koha-member-search-filter-searchtype',

            labelClass:
                'koha-member-search-filter-label',

            buttonClass:
                'koha-member-search-filter-remove',

            defaultValue:
                'contains',

            filterName:
                'Type de recherche',

            colorClass:
                ''
        });


        /*
         * ============================================================
         * 5. RECHERCHE ADHÉRENTS — BIBLIOTHÈQUE
         * ============================================================
         */

        const memberBranch =
            document.getElementById(
                'branchcode'
            );


        createBadge({
            select: memberBranch,

            className:
                'koha-member-search-filter-indicator ' +
                'koha-member-search-filter-branch',

            labelClass:
                'koha-member-search-filter-label',

            buttonClass:
                'koha-member-search-filter-remove',

            defaultValue:
                '',

            filterName:
                'Bibliothèque',

            colorClass:
                ''
        });


        /*
         * ============================================================
         * 6. RECHERCHE ADHÉRENTS — CATÉGORIE
         * ============================================================
         */

        const memberCategory =
            document.getElementById(
                'categorycode'
            );


        createBadge({
            select: memberCategory,

            className:
                'koha-member-search-filter-indicator ' +
                'koha-member-search-filter-category',

            labelClass:
                'koha-member-search-filter-label',

            buttonClass:
                'koha-member-search-filter-remove',

            defaultValue:
                '',

            filterName:
                'Catégorie',

            colorClass:
                ''
        });


        /*
         * ============================================================
         * FERMETURE DU MENU PAR CLIC EXTÉRIEUR
         * ============================================================
         *
         * Cette fonction est conservée pour le catalogue ET
         * pour la recherche adhérents.
         */

        const extraContents =
            document.querySelectorAll(
                '.form-extra-content'
            );


        extraContents.forEach(
            function (extraContent) {

                const parent =
                    extraContent.parentElement;


                if (!parent) return;


                const toggle =
                    parent.querySelector(
                        '.form-extra-content-toggle'
                    );


                if (!toggle) return;


                function isMenuOpen() {

                    return (
                        extraContent.offsetParent !== null ||
                        extraContent.classList.contains('show') ||
                        extraContent.classList.contains('open')
                    );
                }


                /*
                 * Évite d'installer plusieurs fois les
                 * événements si le script est chargé plusieurs fois.
                 */

                if (
                    extraContent.dataset
                        .kohaEnhancementsReady === 'true'
                ) {
                    return;
                }


                extraContent.dataset
                    .kohaEnhancementsReady = 'true';


                /*
                 * ----------------------------------------------------
                 * CLIC EXTÉRIEUR
                 * ----------------------------------------------------
                 */

                document.addEventListener(
                    'click',
                    function (event) {

                        if (!isMenuOpen()) {
                            return;
                        }


                        /*
                         * Clic dans le panneau.
                         */

                        if (
                            extraContent.contains(
                                event.target
                            )
                        ) {
                            return;
                        }


                        /*
                         * Clic sur le bouton.
                         */

                        if (
                            toggle.contains(
                                event.target
                            )
                        ) {
                            return;
                        }


                        /*
                         * Tout autre clic ferme.
                         */

                        toggle.click();

                    },
                    false
                );


                /*
                 * ----------------------------------------------------
                 * ESCAPE
                 * ----------------------------------------------------
                 */

                document.addEventListener(
                    'keydown',
                    function (event) {

                        if (
                            event.key !== 'Escape' ||
                            !isMenuOpen()
                        ) {
                            return;
                        }


                        toggle.click();


                        try {

                            toggle.focus();

                        } catch (e) {

                            // Rien à faire.

                        }

                    },
                    false
                );

            }
        );

    }


    /* ================================================================
     * INITIALISATION PMK
     * ================================================================ */
    async function pmk123Start() {
        pmk123EnsureDisableStyle();
        pmk123Register();
        if (window.PMKConfig && typeof window.PMKConfig.getConfig === 'function') {
            try { pmk123Config = pmk123Normalize(await window.PMKConfig.getConfig(PMK123_MODULE_ID)); } catch (_) {}
        }
        document.documentElement.classList.toggle('pmk123-disabled', pmk123Config.enabled === false);
        if (pmk123Config.enabled && !pmk123Initialized) {
            pmk123Initialized = true;
            initKohaSearchEnhancements();
        }
    }

    window.PMK123SearchFilterBadges = {
        moduleId: PMK123_MODULE_ID,
        version: PMK123_VERSION,
        refresh: pmk123Start
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', pmk123Start, { once: true });
    } else {
        pmk123Start();
    }
    if (!window.PMKConfig) window.addEventListener('pmk:config-ready', pmk123Register, { once: true });

})();
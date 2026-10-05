/*
 Nom du fichier : 081-084-6xx-suggestions.js
 Module PMK      : Aide à l’indexation 6XX
 ID PMK          : cataloging-6xx-suggestions
 Version         : 2.3.3-preplugin
 Date            : 2026-10-01
 Auteur          : Michael Mundet / consolidation PimpMyKoha

 Fusion :
 - 081-6xx-genre-select2.js
 - 082-6xx-indexation-select2.js
 - 083-6xx-element-entry-suggestions.js
 - 084-6xx-subject-category-suggestions.js

 Principes :
 - un seul moteur, autant de règles 6XX que nécessaire ;
 - les quatre listes historiques Dracénie sont conservées comme presets ;
 - le vrai champ Koha n'est jamais remplacé ni désactivé ;
 - ciblage prioritaire par zone + sous-zone MARC, libellé seulement en secours ;
 - source des suggestions : manuel / valeurs autorisées Koha / mixte ;
 - plusieurs catégories de valeurs autorisées peuvent alimenter une même règle ;
 - déduplication des valeurs ;
 - Select2 si disponible, chargement optionnel si absent, repli natif sinon ;
 - prise en charge des champs / zones répétés ajoutés dynamiquement par Koha ;
 - les contrôles d’aide PMK ne portent jamais de name : seul le vrai champ Koha est soumis ;
 - présentation historique Dracénie restaurée par défaut : champ de gauche + liste Select2 de droite en 50/50, écart 10 px, sans compteur ajouté.

 Correctifs 2.3.1 :
 - suppression du doublon visuel Select2 / select natif ;
 - masquage temporaire du Select2 Koha natif en mode historique, sans le détruire ;
 - sécurisation des répétitions/suppressions de zones et sous-zones Koha ;
 - conservation de toutes les sous-zones MARC lors de l’enregistrement ;
 - ciblage de secours par libellé plus strict ;
 - options de tri/déduplication appliquées également aux presets historiques.
 - correction de la synchronisation Select2 -> vrai champ MARC Koha ;
 - synchronisation de sécurité juste avant document.f.submit().
*/

(function () {
    "use strict";

    if (window.__PMK6XXConfigBootstrapLoaded) return;
    window.__PMK6XXConfigBootstrapLoaded = true;

    const MODULE_ID = "cataloging-6xx-suggestions";
    const MODULE_VERSION = "2.3.3-preplugin";
    const PAGE_PATH_SUFFIX = "/addbiblio.pl";
    const PAGE_ID = "cataloguing.addbiblio";

    const HISTORICAL = {
        genre: "Abécédaires\nAction & Aventure\nAlbums pour les plus grands\nApprentissage\nAventure\nBandes originales de films\nBiographies romancées\nBlack Music\nClassiques\nComics\nComptine, chanson\nDark romance\nDocu-fictions, biographies, histoires vécues\nDystopie\nElectro\nÉrotique\nEspionnage\nFantastique/Fantasy\nFeel good\nFilm Famille\nFilm d'animation\nFilm-Vintage\nFilms - Grands classiques\nFilms-Aventure\nFilms-Action\nFilms-Courts métrages\nFilms-Drames\nFilms-Japanimation\nFilms-Regards de femmes\nFilms-Science-fiction\nFilms-Se détendre\nFilms-Western\nFilms d'horreur\nFilms historiques\nFilms muets\nFilms musicaux\nFilms noirs\nFrissons\nHistorique\nHorreur\nHumour\nImagiers\nInitiatique\nJazz\nLégendes, mythes, fables\nLivre à toucher\nLivre sonore\nLivre animé\nLivres à compter\nLivre-jeu\nMondes Imaginaires\nMystères et enquêtes\nMusique Classique\nMusique Francophone\nMusique actuelle\nMusique du monde\nNature\nNovélisation de films/séries\nNovélisation de jeux vidéo\nNouvelles\nPolicier\nPsychologique\nRéaliste\nRécits de vie\nRimes\nRomance\nScience-fiction\nSentimental\nSerie|serie\nSéries courtes\nTerroir\nThriller",
        indexation: "Adaptation litteraire|Adaptation littéraire\nAlbum sans texte\nAntivol\nBandes originales\nBD Documentaire\nBD One Shot\nBD petit format|BD Petit format\nBD sans texte\nBiographie\nBlack Music\nComics\nCorner nature\nDVD Musicaux\nDVD Théâtre\nDyslexique\nElectro\nFilm d'animation\nFilm Famille\nFilm-Drame\nFilm-Vintage\nFilms - Grands classiques\nFilms-Aventure\nFilms-Action\nFilms-Courts métrages\nFilms-Grands classiques\nFilms-Japanimation\nFilms-Regards de femmes\nFilms-Science-fiction\nFilms-Se détendre\nFilms-Western\nFilms d'horreur\nFilms historiques\nFilms muets\nFilms musicaux\nFilms noirs\nFacile a lire\nHumour\nImages de dragons\nInstruments de musique\nJazz\nJeu illustrateur\nJeux de société\nLangues etrangeres|Langues étrangères\nlitteratures|Littératures\nMangas\nMusique à Lire\nMusique actuelle\nMusique Classique\nMusique du monde\nMusique Francophone\nParents et compagnie\nPoesie et theatre|Poésie et théâtre\nPremière lecture\nPremieres cases|Premières cases\nRomans Ados\nScène locale\nserie|Série\nSéries courtes\nTextes illustrés\nvintage|Film - Vintage",
        element: "Sorcières\nLe loup\nMonstres\nSirènes\nPrinces, chevaliers et princesses\nPirates\nIndiens, Cow-boys\nSuperhéros\nMulticulturalisme et diversité",
        subject: "Acquisition de la Propreté\nAffirmation de soi et opposition\nAngoisse de séparation\nAlimentation\nAmitié\nAnimaux\nAnimaux familiers\nAnimaux sauvages\nArts et spectacles\nBain, hygiène\nBobos\nBonnes Manières\nCampagne, vie rurale, ferme\nCaractères (courageux, curiosité, rêveur, leader...)\nChâteaux forts\nCivilisations (Maya, Viking, esquimau...)\nColère\nComportements sociaux (antisémitisme, différence, entraide, relation fille-garçons..)\nConditions de vie (pauvreté, précarité, immigration et réfugiés..)\nCorps humain (cinq sens, image du corps..)\nCrèche\nDéménagement\nDinosaures\nDoudou / Tétine\nÉcologie, environnement\nÉmotions et Sentiments\nEngins et moyens de Transport\nFêtes (Noël, Pâques...)\nHistoire (grandes époques, guerres et conflits, personnages célèbres)\nIntimidation / Harcèlement\nLangage, jeux de langage, jeux de mots, contraire\nLe corps et ses différences (handicaps, neurodiversité, lunettes..)\nLe rituel du coucher\nLes conflits\nLivre et bibliothèque\nMaison, habitation, jardin et jardinage\nMaternité, naissance\nMers, marins\nMétéorologie et saisons\nMort, deuil\nNature\nNouveau bébé\nOrphelins et foyers d'accueil\nPays et continents\nPeur du noir\nPolitesse, bienséance\nPremiers apprentissages (couleurs, formes, etc)\nPréhistoire\nQuestions de genres\nRelation aux autres\nRelations dans la famille (Fratrie, Parents, Grands-parents, Familles atypiques..)\nReligions, croyances\nRentrée scolaire\nSanté et maladies\nScolarité\nSciences et techniques (espace, inventions...)\nSéparation Divorce\nSons, bruits et cris\nSport\nTerritoires (Amazonie, jungle, montagne, désert, banquise, île, forêt...)\nTransgression des interdits : inceste, maltraitance, violence, violence sexuelle, vol..\n Intimidation / Harcèlement\nTravail et métiers\nVacances\nVille (bâtiment et construction, zoo, jardin public, marché, musée..etc)\nVie quotidienne familiale (bêtises, respect des règles, éducation, fugue..)"
    };

    function clone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function clean(value) {
        return String(value == null ? "" : value).trim();
    }

    function boundedNumber(value, min, max, fallback) {
        if (value === null || value === undefined || value === "") return fallback;
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.max(min, Math.min(max, number));
    }

    function deepMerge(target, source) {
        if (!source || typeof source !== "object") return target;
        Object.keys(source).forEach(function (key) {
            const value = source[key];
            if (Array.isArray(value)) target[key] = clone(value);
            else if (value && typeof value === "object") {
                if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) target[key] = {};
                deepMerge(target[key], value);
            } else if (value !== undefined) {
                target[key] = value;
            }
        });
        return target;
    }

    function uid(prefix) {
        return (prefix || "rule") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
    }

    function newCategory() {
        return {
            enabled: true,
            name: "",
            manualName: ""
        };
    }

    function newRule() {
        return {
            id: uid("6xx"),
            enabled: true,
            nameFr: "Nouvelle aide 6XX",
            nameEn: "New 6XX helper",
            marcTag: "610",
            subfield: "a",
            fallbackLabel: "",
            placeholderFr: "Sélectionner une valeur",
            placeholderEn: "Select a value",
            select2PlaceholderFr: "",
            sourceMode: "manual",
            categories: [],
            manualValues: "",
            displayMode: "description",
            sortMode: "source",
            deduplicateCaseInsensitive: false
        };
    }

    const DEFAULTS = {
        enabled: true,
        pages: [
            {
                id: PAGE_ID,
                pathSuffix: PAGE_PATH_SUFFIX,
                enabled: true
            }
        ],
        api: {
            perPage: 500,
            maxPages: 20
        },
        select2: {
            enabled: true,
            loadIfMissing: true,
            cssUrl: "https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css",
            jsUrl: "https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"
        },
        appearance: {
            mode: "legacy-split",
            gapPx: 10,
            leftWidthPercent: 50,
            rightWidthPercent: 50,
            showStatus: false,
            stackOnSmallScreens: false,
            stackBreakpoint: 900,
            dropdownMaxHeight: 520
        },
        rules: [
            {
                id: "legacy-081-genre",
                enabled: true,
                nameFr: "Genre littéraire — historique 081",
                nameEn: "Literary genre — legacy 081",
                marcTag: "608",
                subfield: "a",
                fallbackLabel: "Genre littéraire",
                placeholderFr: "Sélectionner un genre",
                placeholderEn: "Select a genre",
                select2PlaceholderFr: "Sélectionner un genre",
                sourceMode: "manual",
                categories: [],
                manualValues: HISTORICAL.genre,
                displayMode: "description",
                sortMode: "source",
                deduplicateCaseInsensitive: false
            },
            {
                id: "legacy-082-indexation",
                enabled: true,
                nameFr: "Indexation — historique 082",
                nameEn: "Indexing — legacy 082",
                marcTag: "610",
                subfield: "a",
                fallbackLabel: "Indexation",
                placeholderFr: "Sélectionner une indexation",
                placeholderEn: "Select an indexing value",
                select2PlaceholderFr: "Selectionnez une indexation",
                sourceMode: "manual",
                categories: [],
                manualValues: HISTORICAL.indexation,
                displayMode: "description",
                sortMode: "source",
                deduplicateCaseInsensitive: false
            },
            {
                id: "legacy-083-element",
                enabled: true,
                nameFr: "Élément d'entrée — historique 083",
                nameEn: "Entry element — legacy 083",
                marcTag: "623",
                subfield: "a",
                fallbackLabel: "Elément d'entrée",
                placeholderFr: "Sélectionner un personnage",
                placeholderEn: "Select a character",
                select2PlaceholderFr: "Sélectionner un personnage",
                sourceMode: "manual",
                categories: [],
                manualValues: HISTORICAL.element,
                displayMode: "description",
                sortMode: "source",
                deduplicateCaseInsensitive: false
            },
            {
                id: "legacy-084-categorie",
                enabled: true,
                nameFr: "Catégorie de sujet — historique 084",
                nameEn: "Subject category — legacy 084",
                marcTag: "615",
                subfield: "a",
                fallbackLabel: "catégorie sujet",
                placeholderFr: "Sélectionner une indexation matière",
                placeholderEn: "Select a subject category",
                select2PlaceholderFr: "Sélectionner une indexation matière",
                sourceMode: "manual",
                categories: [],
                manualValues: HISTORICAL.subject,
                displayMode: "description",
                sortMode: "source",
                deduplicateCaseInsensitive: true
            }
        ]
    };

    function normalizeCategory(category) {
        const src = category && typeof category === "object" ? category : {};
        return {
            enabled: src.enabled !== false,
            name: clean(src.name),
            manualName: clean(src.manualName)
        };
    }

    function normalizeRule(rule, index) {
        const src = rule && typeof rule === "object" ? rule : {};
        const sourceMode = ["manual", "authorised", "mixed"].includes(src.sourceMode) ? src.sourceMode : "manual";
        const displayMode = ["description", "opac-description", "value", "value-description"].includes(src.displayMode)
            ? src.displayMode : "description";
        const sortMode = ["source", "label", "value"].includes(src.sortMode) ? src.sortMode : "source";
        return {
            id: clean(src.id) || ("6xx-rule-" + (index + 1)),
            enabled: src.enabled !== false,
            nameFr: clean(src.nameFr) || ("Règle 6XX " + (index + 1)),
            nameEn: clean(src.nameEn) || clean(src.nameFr) || ("6XX rule " + (index + 1)),
            marcTag: clean(src.marcTag).replace(/\D/g, "").slice(0, 3),
            subfield: clean(src.subfield).slice(0, 1),
            fallbackLabel: clean(src.fallbackLabel),
            placeholderFr: clean(src.placeholderFr) || "Sélectionner une valeur",
            placeholderEn: clean(src.placeholderEn) || clean(src.placeholderFr) || "Select a value",
            select2PlaceholderFr: clean(src.select2PlaceholderFr) || clean(src.placeholderFr) || "Sélectionner une valeur",
            sourceMode: sourceMode,
            categories: Array.isArray(src.categories) ? src.categories.map(normalizeCategory) : [],
            manualValues: typeof src.manualValues === "string" ? src.manualValues : valuesToText(src.manualValues),
            displayMode: displayMode,
            sortMode: sortMode,
            deduplicateCaseInsensitive: src.deduplicateCaseInsensitive === true
        };
    }

    function valuesToText(value) {
        if (typeof value === "string") return value;
        if (!Array.isArray(value)) return "";
        return value.map(function (entry) {
            if (typeof entry === "string") return entry;
            if (!entry || typeof entry !== "object") return "";
            const v = clean(entry.value);
            const label = clean(entry.text || entry.label || entry.description);
            if (!v) return "";
            return label && label !== v ? (v + "|" + label) : v;
        }).filter(Boolean).join("\n");
    }

    function migrateLegacyConfig(input, output) {
        if (!input || typeof input !== "object") return output;
        const byId = new Map(output.rules.map(function (rule) { return [rule.id, rule]; }));
        const legacyMap = [
            {
                id: "legacy-081-genre",
                enabledKeys: ["enableGenre", "genreEnabled", "enabledGenre"],
                valuesKeys: ["genreOptions", "genreValues", "optionsGenre"],
                labelKeys: ["genreLabel", "labelGenre"],
                placeholderKeys: ["genrePlaceholder", "placeholderGenre"]
            },
            {
                id: "legacy-082-indexation",
                enabledKeys: ["enableIndexation", "indexationEnabled", "enabledIndexation"],
                valuesKeys: ["indexationOptions", "indexationValues", "optionsIndexation"],
                labelKeys: ["indexationLabel", "labelIndexation"],
                placeholderKeys: ["indexationPlaceholder", "placeholderIndexation"]
            },
            {
                id: "legacy-083-element",
                enabledKeys: ["enableElement", "elementEnabled", "enabledElement", "enableEntryElement"],
                valuesKeys: ["elementOptions", "elementEntryOptions", "entryOptions"],
                labelKeys: ["elementLabel", "elementEntryLabel", "entryLabel"],
                placeholderKeys: ["elementPlaceholder", "entryPlaceholder"]
            },
            {
                id: "legacy-084-categorie",
                enabledKeys: ["enableCategory", "categoryEnabled", "subjectCategoryEnabled", "enableSubjectCategory"],
                valuesKeys: ["categoryOptions", "subjectCategoryOptions", "subjectOptions"],
                labelKeys: ["categoryLabel", "subjectCategoryLabel"],
                placeholderKeys: ["categoryPlaceholder", "subjectCategoryPlaceholder"]
            }
        ];

        function firstDefined(keys) {
            for (let i = 0; i < keys.length; i += 1) {
                if (Object.prototype.hasOwnProperty.call(input, keys[i])) return input[keys[i]];
            }
            return undefined;
        }

        legacyMap.forEach(function (map) {
            const rule = byId.get(map.id);
            if (!rule) return;
            const enabled = firstDefined(map.enabledKeys);
            const values = firstDefined(map.valuesKeys);
            const label = firstDefined(map.labelKeys);
            const placeholder = firstDefined(map.placeholderKeys);
            if (enabled !== undefined) rule.enabled = enabled !== false;
            if (values !== undefined) rule.manualValues = valuesToText(values) || rule.manualValues;
            if (label !== undefined && clean(label)) rule.fallbackLabel = clean(label);
            if (placeholder !== undefined && clean(placeholder)) rule.placeholderFr = clean(placeholder);
        });

        return output;
    }

    function normalizeConfig(config) {
        const result = deepMerge(clone(DEFAULTS), config && typeof config === "object" ? config : {});
        result.enabled = result.enabled !== false;
        result.pages = Array.isArray(result.pages) && result.pages.length ? result.pages : clone(DEFAULTS.pages);
        result.pages = result.pages.map(function (page) {
            return {
                id: clean(page && page.id) || PAGE_ID,
                pathSuffix: clean(page && page.pathSuffix) || PAGE_PATH_SUFFIX,
                enabled: !page || page.enabled !== false
            };
        });
        result.api = deepMerge(clone(DEFAULTS.api), result.api || {});
        result.api.perPage = boundedNumber(result.api.perPage, 20, 1000, DEFAULTS.api.perPage);
        result.api.maxPages = boundedNumber(result.api.maxPages, 1, 100, DEFAULTS.api.maxPages);
        result.select2 = deepMerge(clone(DEFAULTS.select2), result.select2 || {});
        result.select2.enabled = result.select2.enabled !== false;
        result.select2.loadIfMissing = result.select2.loadIfMissing !== false;
        result.appearance = deepMerge(clone(DEFAULTS.appearance), result.appearance || {});
        result.appearance.mode = ["legacy-split", "inline-assistant"].includes(result.appearance.mode)
            ? result.appearance.mode : DEFAULTS.appearance.mode;
        result.appearance.gapPx = boundedNumber(result.appearance.gapPx, 0, 40, DEFAULTS.appearance.gapPx);
        result.appearance.leftWidthPercent = boundedNumber(result.appearance.leftWidthPercent, 20, 80, DEFAULTS.appearance.leftWidthPercent);
        result.appearance.rightWidthPercent = boundedNumber(result.appearance.rightWidthPercent, 20, 80, DEFAULTS.appearance.rightWidthPercent);
        result.appearance.showStatus = result.appearance.showStatus === true;
        result.appearance.stackOnSmallScreens = result.appearance.stackOnSmallScreens === true;
        result.appearance.stackBreakpoint = boundedNumber(result.appearance.stackBreakpoint, 320, 1600, DEFAULTS.appearance.stackBreakpoint);
        result.appearance.dropdownMaxHeight = boundedNumber(result.appearance.dropdownMaxHeight, 160, 900, DEFAULTS.appearance.dropdownMaxHeight);
        result.rules = Array.isArray(result.rules) ? result.rules.map(normalizeRule) : clone(DEFAULTS.rules);
        migrateLegacyConfig(config, result);
        return result;
    }

    function validate(config) {
        const c = normalizeConfig(config);
        const seen = new Set();
        for (let i = 0; i < c.rules.length; i += 1) {
            const rule = c.rules[i];
            if (!rule.enabled) continue;
            if (!/^\d{3}$/.test(rule.marcTag)) {
                return { ok: false, message: "La règle « " + rule.nameFr + " » doit contenir une zone MARC sur 3 chiffres." };
            }
            if (!rule.subfield && !rule.fallbackLabel) {
                return { ok: false, message: "La règle « " + rule.nameFr + " » doit contenir une sous-zone ou un libellé de secours." };
            }
            const key = rule.marcTag + "$" + (rule.subfield || "*");
            if (seen.has(key)) {
                return { ok: false, message: "Deux règles actives ciblent " + key + ". Fusionnez leurs sources dans une seule règle." };
            }
            seen.add(key);
            if (rule.sourceMode === "authorised" || rule.sourceMode === "mixed") {
                const activeCategories = rule.categories.filter(function (category) {
                    return category.enabled !== false && clean(category.manualName || category.name);
                });
                if (!activeCategories.length && rule.sourceMode === "authorised") {
                    return { ok: false, message: "La règle « " + rule.nameFr + " » utilise les valeurs autorisées mais aucune catégorie Koha n'est sélectionnée." };
                }
            }
        }
        return { ok: true };
    }

    function language() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            try { return window.PMKConfig.getLanguage() === "en" ? "en" : "fr"; } catch (_) {}
        }
        return (document.documentElement.lang || "fr").toLowerCase().startsWith("en") ? "en" : "fr";
    }

    function t(fr, en) {
        return language() === "en" ? en : fr;
    }

    function ensureAuthorisedValuesService() {
        if (window.PMKAuthorisedValuesService) return window.PMKAuthorisedValuesService;

        const categoryCache = { value: null, promise: null };
        const valueCache = new Map();

        async function fetchPaged(baseUrl, orderBy, perPage, maxPages) {
            const rows = [];
            for (let page = 1; page <= maxPages; page += 1) {
                const url = new URL(baseUrl, window.location.origin);
                url.searchParams.set("_page", String(page));
                url.searchParams.set("_per_page", String(perPage));
                if (orderBy) url.searchParams.set("_order_by", orderBy);

                const response = await fetch(url.toString(), {
                    credentials: "same-origin",
                    headers: { "Accept": "application/json" }
                });
                if (!response.ok) {
                    const error = new Error("Koha API " + response.status + " — " + url.pathname);
                    error.status = response.status;
                    throw error;
                }
                const batch = await response.json();
                if (!Array.isArray(batch)) return rows;
                rows.push.apply(rows, batch);
                if (batch.length < perPage) break;
            }
            return rows;
        }

        async function listCategories(options) {
            const opts = options || {};
            if (!opts.force && Array.isArray(categoryCache.value)) return clone(categoryCache.value);
            if (!opts.force && categoryCache.promise) return categoryCache.promise.then(clone);

            const perPage = Math.max(20, Math.min(1000, Number(opts.perPage) || 500));
            const maxPages = Math.max(1, Math.min(100, Number(opts.maxPages) || 20));
            categoryCache.promise = fetchPaged(
                "/api/v1/authorised_value_categories",
                "category_name",
                perPage,
                maxPages
            ).then(function (rows) {
                const result = rows
                    .map(function (row) { return clean(row && row.category_name); })
                    .filter(Boolean)
                    .filter(function (value, index, arr) { return arr.indexOf(value) === index; })
                    .sort(function (a, b) { return a.localeCompare(b, language() === "en" ? "en" : "fr"); });
                categoryCache.value = result;
                categoryCache.promise = null;
                return clone(result);
            }).catch(function (error) {
                categoryCache.promise = null;
                throw error;
            });
            return categoryCache.promise.then(clone);
        }

        async function listValues(categoryName, options) {
            const category = clean(categoryName);
            if (!category) return [];
            const opts = options || {};
            if (!opts.force && valueCache.has(category)) {
                const cached = valueCache.get(category);
                if (Array.isArray(cached)) return clone(cached);
                return cached.then(clone);
            }

            const perPage = Math.max(20, Math.min(1000, Number(opts.perPage) || 500));
            const maxPages = Math.max(1, Math.min(100, Number(opts.maxPages) || 20));
            const promise = fetchPaged(
                "/api/v1/authorised_value_categories/" + encodeURIComponent(category) + "/authorised_values",
                "description",
                perPage,
                maxPages
            ).then(function (rows) {
                valueCache.set(category, rows);
                return clone(rows);
            }).catch(function (error) {
                valueCache.delete(category);
                throw error;
            });
            valueCache.set(category, promise);
            return promise.then(clone);
        }

        window.PMKAuthorisedValuesService = {
            listCategories: listCategories,
            listValues: listValues,
            clear: function () {
                categoryCache.value = null;
                categoryCache.promise = null;
                valueCache.clear();
            }
        };

        return window.PMKAuthorisedValuesService;
    }

    function categoryOptionsLoader() {
        const service = ensureAuthorisedValuesService();
        const cfg = currentConfig || DEFAULTS;
        return service.listCategories(cfg.api).then(function (names) {
            return [
                { value: "", label: { fr: "— Choisir une catégorie Koha —", en: "— Choose a Koha category —" } }
            ].concat(names.map(function (name) {
                return { value: name, label: { fr: name, en: name } };
            }));
        });
    }

    function ruleFromPath(root, path) {
        if (!root || !Array.isArray(root.rules) || !Array.isArray(path)) return null;
        const pos = path.indexOf("rules");
        if (pos === -1 || path.length <= pos + 1) return null;
        const index = Number(path[pos + 1]);
        return Number.isInteger(index) ? root.rules[index] : null;
    }

    function showCategories(root, path) {
        const rule = ruleFromPath(root, path);
        return !!rule && (rule.sourceMode === "authorised" || rule.sourceMode === "mixed");
    }

    function showManual(root, path) {
        const rule = ruleFromPath(root, path);
        return !!rule && (rule.sourceMode === "manual" || rule.sourceMode === "mixed");
    }

    function registerModule() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return false;

        window.PMKConfig.registerModule({
            id: MODULE_ID,
            schemaVersion: 3,
            name: {
                fr: "Aide à l’indexation 6XX",
                en: "6XX indexing helpers"
            },
            description: {
                fr: "Guide la saisie des valeurs de notices et d’autorités sans empêcher la création, afin de limiter les erreurs de frappe et d’harmoniser l’indexation.",
                en: "Guides entry of bibliographic and authority values without preventing creation, reducing typos and improving indexing consistency."
            },
            category: {
                fr: "Catalogage / indexation",
                en: "Cataloguing / indexing"
            },
            supportedPages: [PAGE_ID],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULTS),
            normalize: normalizeConfig,
            validate: validate,
            schema: [
                {
                    type: "section",
                    id: "general",
                    label: { fr: "Fonctionnement", en: "Behavior" },
                    description: {
                        fr: "Le champ Koha reste toujours le vrai champ enregistré. La liste PMK est seulement une aide de saisie : choisir une suggestion écrit dans le champ Koha sans le remplacer ni le désactiver.",
                        en: "The Koha field always remains the real submitted field. The PMK list is only an input helper: choosing a suggestion writes into the Koha field without replacing or disabling it."
                    },
                    fields: [
                        {
                            key: "enabled",
                            type: "boolean",
                            label: { fr: "Activer l’aide à l’indexation 6XX", en: "Enable 6XX indexing helpers" }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "rules",
                    label: { fr: "Règles et listes de suggestions", en: "Rules and suggestion lists" },
                    description: {
                        fr: "Les quatre règles historiques sont fournies par défaut. Vous pouvez les modifier ou ajouter d’autres zones 6XX. Pour chaque règle : liste manuelle, valeurs autorisées Koha, ou mode mixte.",
                        en: "The four historical rules are supplied by default. You can edit them or add other 6XX tags. Each rule can use a manual list, Koha authorised values, or mixed mode."
                    },
                    fields: [
                        {
                            key: "rules",
                            type: "repeater",
                            label: { fr: "Aides à la saisie", en: "Input helpers" },
                            addLabel: { fr: "Ajouter une règle 6XX", en: "Add a 6XX rule" },
                            reorder: true,
                            newItem: newRule,
                            itemTitle: function (item, index, lang) {
                                const title = lang === "en" ? clean(item && item.nameEn) : clean(item && item.nameFr);
                                const marc = clean(item && item.marcTag) + (clean(item && item.subfield) ? ("$" + clean(item.subfield)) : "");
                                return (title || ("Règle " + (index + 1))) + (marc ? (" — " + marc) : "");
                            },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Règle active", en: "Rule enabled" } },
                                { key: "nameFr", type: "text", label: { fr: "Nom — français", en: "Name — French" } },
                                { key: "nameEn", type: "text", label: { fr: "Nom — anglais", en: "Name — English" } },
                                {
                                    key: "marcTag",
                                    type: "text",
                                    label: { fr: "Zone MARC", en: "MARC tag" },
                                    help: { fr: "Exemple : 608, 610, 615, 623.", en: "Example: 608, 610, 615, 623." }
                                },
                                {
                                    key: "subfield",
                                    type: "text",
                                    label: { fr: "Sous-zone", en: "Subfield" },
                                    help: { fr: "Exemple : a. Le ciblage MARC est prioritaire sur le libellé.", en: "Example: a. MARC targeting takes priority over the label." }
                                },
                                {
                                    key: "fallbackLabel",
                                    type: "text",
                                    advanced: true,
                                    label: { fr: "Libellé de secours", en: "Fallback label" },
                                    help: {
                                        fr: "Utilisé seulement si le champ n’est pas retrouvé par zone/sous-zone. Utile pour reprendre exactement une grille historique.",
                                        en: "Used only when the field cannot be found by tag/subfield. Useful for exact legacy-framework compatibility."
                                    }
                                },
                                { key: "placeholderFr", type: "text", label: { fr: "Texte d’aide — français", en: "Placeholder — French" } },
                                { key: "placeholderEn", type: "text", label: { fr: "Texte d’aide — anglais", en: "Placeholder — English" } },
                                { key: "select2PlaceholderFr", type: "text", advanced: true, label: { fr: "Placeholder Select2 historique", en: "Legacy Select2 placeholder" }, help: { fr: "Permet de conserver exactement le texte affiché par les anciens scripts.", en: "Keeps the exact text shown by legacy scripts." } },
                                {
                                    key: "sourceMode",
                                    type: "select",
                                    refreshOnChange: true,
                                    label: { fr: "Source des suggestions", en: "Suggestion source" },
                                    options: [
                                        { value: "manual", label: { fr: "Liste manuelle", en: "Manual list" } },
                                        { value: "authorised", label: { fr: "Valeurs autorisées Koha", en: "Koha authorised values" } },
                                        { value: "mixed", label: { fr: "Valeurs autorisées Koha + compléments manuels", en: "Koha authorised values + manual additions" } }
                                    ]
                                },
                                {
                                    key: "categories",
                                    type: "repeater",
                                    when: showCategories,
                                    label: { fr: "Catégories de valeurs autorisées", en: "Authorised-value categories" },
                                    addLabel: { fr: "Ajouter une catégorie Koha", en: "Add a Koha category" },
                                    reorder: true,
                                    newItem: newCategory,
                                    itemTitle: function (item, index) {
                                        return clean(item && (item.manualName || item.name)) || ("Catégorie " + (index + 1));
                                    },
                                    fields: [
                                        { key: "enabled", type: "boolean", label: { fr: "Catégorie active", en: "Category enabled" } },
                                        {
                                            key: "name",
                                            type: "select",
                                            label: { fr: "Catégorie Koha détectée", en: "Detected Koha category" },
                                            options: [
                                                { value: "", label: { fr: "Chargement des catégories…", en: "Loading categories…" } }
                                            ],
                                            loadOptions: categoryOptionsLoader,
                                            help: {
                                                fr: "La liste est chargée depuis l’API REST Koha avec la session courante. Il faut le droit catalogue. Si la catégorie n’apparaît pas, utilisez le code manuel ci-dessous.",
                                                en: "The list is loaded from the Koha REST API using the current session. Catalogue permission is required. If the category does not appear, use the manual code below."
                                            }
                                        },
                                        {
                                            key: "manualName",
                                            type: "text",
                                            advanced: true,
                                            label: { fr: "Code de catégorie manuel — optionnel", en: "Manual category code — optional" },
                                            help: {
                                                fr: "Prioritaire sur la sélection ci-dessus. Utile si la liste des catégories ne se charge pas ou pour saisir directement un code connu. Le chargement des valeurs nécessite toujours l’API Koha.",
                                                en: "Takes priority over the selection above. Useful if the category list cannot be loaded or to enter a known code directly. Loading the values still requires the Koha API."
                                            }
                                        }
                                    ]
                                },
                                {
                                    key: "manualValues",
                                    type: "textarea",
                                    rows: 10,
                                    when: showManual,
                                    label: { fr: "Valeurs manuelles", en: "Manual values" },
                                    help: {
                                        fr: "Une valeur par ligne. Format : valeur|libellé. Si le libellé est omis, la valeur sert aussi de libellé. En mode mixte, une valeur manuelle identique remplace le libellé provenant de Koha.",
                                        en: "One value per line. Format: value|label. If the label is omitted, the value is also used as label. In mixed mode, an identical manual value overrides the label coming from Koha."
                                    }
                                },
                                {
                                    key: "displayMode",
                                    type: "select",
                                    when: showCategories,
                                    label: { fr: "Libellé des valeurs Koha", en: "Koha value labels" },
                                    options: [
                                        { value: "description", label: { fr: "Description professionnelle", en: "Staff description" } },
                                        { value: "opac-description", label: { fr: "Description OPAC", en: "OPAC description" } },
                                        { value: "value", label: { fr: "Code uniquement", en: "Value only" } },
                                        { value: "value-description", label: { fr: "Code — description", en: "Value — description" } }
                                    ]
                                },
                                {
                                    key: "sortMode",
                                    type: "select",
                                    advanced: true,
                                    label: { fr: "Tri de la liste", en: "List sorting" },
                                    options: [
                                        { value: "source", label: { fr: "Conserver l’ordre des sources", en: "Keep source order" } },
                                        { value: "label", label: { fr: "Trier par libellé", en: "Sort by label" } },
                                        { value: "value", label: { fr: "Trier par valeur", en: "Sort by value" } }
                                    ]
                                },
                                {
                                    key: "deduplicateCaseInsensitive",
                                    type: "boolean",
                                    advanced: true,
                                    label: { fr: "Dédupliquer sans tenir compte des majuscules/minuscules", en: "Deduplicate ignoring letter case" }
                                }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "select2",
                    label: { fr: "Affichage des listes", en: "List display" },
                    fields: [
                        { key: "select2.enabled", type: "boolean", label: { fr: "Utiliser Select2 lorsqu’il est disponible", en: "Use Select2 when available" } },
                        { key: "select2.loadIfMissing", type: "boolean", label: { fr: "Charger Select2 s’il manque", en: "Load Select2 if missing" } },
                        { key: "select2.cssUrl", type: "text", advanced: true, label: { fr: "URL CSS Select2", en: "Select2 CSS URL" } },
                        { key: "select2.jsUrl", type: "text", advanced: true, label: { fr: "URL JavaScript Select2", en: "Select2 JavaScript URL" } },
                        {
                            key: "appearance.mode",
                            type: "select",
                            label: { fr: "Présentation des champs", en: "Field presentation" },
                            options: [
                                { value: "legacy-split", label: { fr: "Historique Dracénie — 50/50", en: "Dracénie legacy — 50/50" } },
                                { value: "inline-assistant", label: { fr: "Assistant à droite du champ natif", en: "Assistant next to native field" } }
                            ],
                            help: {
                                fr: "Le mode historique reproduit la présentation des anciens 081/082/083/084 : valeur courante à gauche et Select2 à droite.",
                                en: "Legacy mode reproduces the former 081/082/083/084 layout: current value on the left and Select2 on the right."
                            }
                        },
                        { key: "appearance.gapPx", type: "number", min: 0, max: 40, step: 1, label: { fr: "Écart entre les deux champs (px)", en: "Gap between fields (px)" } },
                        { key: "appearance.leftWidthPercent", type: "number", min: 20, max: 80, step: 1, label: { fr: "Largeur champ gauche (%)", en: "Left field width (%)" } },
                        { key: "appearance.rightWidthPercent", type: "number", min: 20, max: 80, step: 1, label: { fr: "Largeur liste droite (%)", en: "Right list width (%)" } },
                        { key: "appearance.showStatus", type: "boolean", advanced: true, label: { fr: "Afficher le compteur de suggestions", en: "Show suggestion count" } },
                        { key: "appearance.stackOnSmallScreens", type: "boolean", advanced: true, label: { fr: "Empiler les champs sur petit écran", en: "Stack fields on small screens" } },
                        { key: "appearance.stackBreakpoint", type: "number", min: 320, max: 1600, step: 10, advanced: true, label: { fr: "Seuil d’empilement (px)", en: "Stacking breakpoint (px)" } },
                        { key: "appearance.dropdownMaxHeight", type: "number", min: 160, max: 900, step: 10, advanced: true, label: { fr: "Hauteur maximale du menu Select2 (px)", en: "Select2 dropdown maximum height (px)" } }
                    ]
                },
                {
                    type: "section",
                    id: "api",
                    label: { fr: "API Koha", en: "Koha API" },
                    description: {
                        fr: "Les catégories et leurs valeurs sont lues à la demande depuis Koha. Aucune copie des valeurs autorisées n’est enregistrée dans PMK.",
                        en: "Categories and their values are read on demand from Koha. PMK does not store a duplicate copy of authorised values."
                    },
                    fields: [
                        { key: "api.perPage", type: "number", min: 20, max: 1000, step: 10, advanced: true, label: { fr: "Valeurs par page API", en: "API values per page" } },
                        { key: "api.maxPages", type: "number", min: 1, max: 100, step: 1, advanced: true, label: { fr: "Nombre maximal de pages API", en: "Maximum API pages" } }
                    ]
                },
                {
                    type: "section",
                    id: "pages",
                    label: { fr: "Page active", en: "Active page" },
                    fields: [
                        {
                            key: "pages",
                            type: "repeater",
                            canAdd: function () { return false; },
                            removable: false,
                            reorder: false,
                            label: { fr: "Pages", en: "Pages" },
                            itemTitle: function () { return "cataloguing/addbiblio.pl"; },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Activer sur addbiblio.pl", en: "Enable on addbiblio.pl" } },
                                { key: "id", type: "readonly", advanced: true, label: { fr: "Identifiant fonctionnel", en: "Functional identifier" } },
                                { key: "pathSuffix", type: "readonly", label: { fr: "Chemin Koha", en: "Koha path" } }
                            ]
                        }
                    ]
                }
            ],
            focusContext: function (main, context) {
                if (!main) return;
                const wanted = context && (context.sectionId || context.section) ? (context.sectionId || context.section) : "rules";
                const section = main.querySelector('[data-pmk-section-id="' + wanted + '"]')
                    || main.querySelector('[data-pmk-section-id="rules"]');
                if (!section) return;
                window.setTimeout(function () {
                    section.scrollIntoView({ block: "start", behavior: "smooth" });
                }, 0);
            }
        });

        return true;
    }

    let currentConfig = normalizeConfig(DEFAULTS);
    let readyResolve;
    let readyResolved = false;
    const ready = new Promise(function (resolve) { readyResolve = resolve; });

    function applyConfig(config) {
        currentConfig = normalizeConfig(config || DEFAULTS);
        try {
            window.dispatchEvent(new CustomEvent("pmk6xx:config-changed", { detail: clone(currentConfig) }));
        } catch (_) {}
        return currentConfig;
    }

    function resolveReady(config) {
        if (readyResolved) return;
        readyResolved = true;
        readyResolve(config);
    }

    function mountContextButton() {
        if (!window.location.pathname.endsWith(PAGE_PATH_SUFFIX)) return;
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        const anchor = document.querySelector("#tab6XX-tab") || document.querySelector("h1");
        if (!anchor) return;
        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "after",
                contextKey: "cataloging-6xx",
                context: { page: PAGE_ID, section: "rules", sectionId: "rules" }
            });
        } catch (_) {}
    }

    function loadFromCore() {
        ensureAuthorisedValuesService();
        if (!registerModule()) {
            const applied = applyConfig(DEFAULTS);
            resolveReady(applied);
            return Promise.resolve(applied);
        }

        const getPromise = typeof window.PMKConfig.getConfig === "function"
            ? Promise.resolve(window.PMKConfig.getConfig(MODULE_ID)).catch(function () { return DEFAULTS; })
            : Promise.resolve(DEFAULTS);

        return getPromise.then(function (config) {
            const applied = applyConfig(config || DEFAULTS);
            resolveReady(applied);

            if (typeof window.PMKConfig.subscribe === "function") {
                try {
                    window.PMKConfig.subscribe(MODULE_ID, function (next) {
                        applyConfig(next || DEFAULTS);
                    });
                } catch (_) {}
            }

            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", mountContextButton, { once: true });
            } else {
                mountContextButton();
            }

            return applied;
        });
    }

    function bootstrapConfig() {
        if (window.PMKConfig) {
            loadFromCore();
            return;
        }
        let attempts = 0;
        const timer = window.setInterval(function () {
            attempts += 1;
            if (window.PMKConfig) {
                window.clearInterval(timer);
                loadFromCore();
                return;
            }
            if (attempts >= 10) {
                window.clearInterval(timer);
                const applied = applyConfig(DEFAULTS);
                resolveReady(applied);
                window.setTimeout(function retry() {
                    if (window.PMKConfig) loadFromCore();
                    else window.setTimeout(retry, 1000);
                }, 1000);
            }
        }, 100);
    }

    window.PMK6XXConfig = {
        id: MODULE_ID,
        version: MODULE_VERSION,
        defaults: clone(DEFAULTS),
        ready: ready,
        get: function () { return currentConfig; },
        normalize: normalizeConfig,
        apply: applyConfig,
        authorisedValues: ensureAuthorisedValuesService()
    };

    bootstrapConfig();
})();

(function () {
    "use strict";

    if (window.__PMK6XXRuntimeLoaded) return;
    window.__PMK6XXRuntimeLoaded = true;

    const PAGE_PATH_SUFFIX = "/addbiblio.pl";
    const RUNTIME_APPEARANCE_DEFAULTS = Object.freeze({
        gapPx: 10,
        leftWidthPercent: 50,
        rightWidthPercent: 50,
        showStatus: false,
        stackOnSmallScreens: false,
        stackBreakpoint: 900,
        dropdownMaxHeight: 520
    });
    const KOHA_MUTATOR_NAMES = ["CloneField", "CloneSubfield", "UnCloneField"];
    let runtimeStarted = false;
    let mutationObserver = null;
    let scanScheduled = false;
    let select2Promise = null;
    const optionsCache = new Map();

    function cfg() {
        return window.PMK6XXConfig && typeof window.PMK6XXConfig.get === "function"
            ? window.PMK6XXConfig.get()
            : null;
    }

    function clean(value) {
        return String(value == null ? "" : value).trim();
    }

    function language() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            try { return window.PMKConfig.getLanguage() === "en" ? "en" : "fr"; } catch (_) {}
        }
        return (document.documentElement.lang || "fr").toLowerCase().startsWith("en") ? "en" : "fr";
    }

    function t(fr, en) {
        return language() === "en" ? en : fr;
    }

    function normalizeText(value) {
        return clean(value)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ");
    }

    function pageEnabled(config) {
        if (!config || config.enabled === false) return false;
        if (!window.location.pathname.endsWith(PAGE_PATH_SUFFIX)) return false;
        const pages = Array.isArray(config.pages) ? config.pages : [];
        const page = pages.find(function (entry) {
            return entry && clean(entry.pathSuffix || PAGE_PATH_SUFFIX) === PAGE_PATH_SUFFIX;
        });
        return !page || page.enabled !== false;
    }

    function injectStyles(config) {
        let style = document.getElementById("pmk6xx-styles");
        if (!style) {
            style = document.createElement("style");
            style.id = "pmk6xx-styles";
            document.head.appendChild(style);
        }

        const appearance = (config && config.appearance) || RUNTIME_APPEARANCE_DEFAULTS;
        const gapNumber = Number(appearance.gapPx);
        const leftNumber = Number(appearance.leftWidthPercent);
        const rightNumber = Number(appearance.rightWidthPercent);
        const breakpointNumber = Number(appearance.stackBreakpoint);
        const maxHeightNumber = Number(appearance.dropdownMaxHeight);
        const gap = Math.max(0, Math.min(40, Number.isFinite(gapNumber) ? gapNumber : 10));
        const left = Math.max(20, Math.min(80, Number.isFinite(leftNumber) ? leftNumber : 50));
        const right = Math.max(20, Math.min(80, Number.isFinite(rightNumber) ? rightNumber : 50));
        const breakpoint = Math.max(320, Math.min(1600, Number.isFinite(breakpointNumber) ? breakpointNumber : 900));
        const maxHeight = Math.max(160, Math.min(900, Number.isFinite(maxHeightNumber) ? maxHeightNumber : 520));
        const showStatus = appearance.showStatus === true;
        const stack = appearance.stackOnSmallScreens === true;

        style.textContent = `
.pmk6xx-assistant {
    box-sizing: border-box;
}
.pmk6xx-legacy-row {
    display: flex;
    gap: ${gap}px;
    align-items: center;
    width: 100%;
}
.pmk6xx-legacy-row > .pmk6xx-legacy-display {
    box-sizing: border-box;
    width: ${left}%;
    flex: 0 1 ${left}%;
    min-width: 0;
}
.pmk6xx-legacy-row > .pmk6xx-select:not(.select2-hidden-accessible) {
    box-sizing: border-box;
    width: ${right}%;
    flex: 0 1 ${right}%;
    min-width: 0;
}
/* Sécurise Select2 même si Koha fournit le JS sans sa règle CSS de masquage. */
.pmk6xx-assistant .pmk6xx-select.select2-hidden-accessible {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip: rect(0, 0, 0, 0) !important;
    white-space: nowrap !important;
    border: 0 !important;
}
/* Le Select2 déjà créé par Koha pour le vrai champ est conservé, mais masqué
   tant que le mode historique PMK affiche sa propre représentation. */
.pmk6xx-native-select2-hidden {
    display: none !important;
}
.pmk6xx-legacy-row > .select2-container {
    box-sizing: border-box;
    width: ${right}% !important;
    flex: 0 1 ${right}%;
    min-width: 0;
}
.pmk6xx-inline-assistant {
    display: inline-flex;
    align-items: center;
    gap: .35rem;
    width: min(360px, 46%);
    min-width: 220px;
    margin-left: .45rem;
    vertical-align: top;
}
.pmk6xx-inline-assistant select {
    width: 100%;
    max-width: 100%;
}
.pmk6xx-inline-assistant .select2-container {
    width: 100% !important;
    min-width: 0;
}
.pmk6xx-native-source {
    display: none !important;
}
.pmk6xx-assistant.pmk6xx-loading {
    opacity: .75;
}
.pmk6xx-assistant.pmk6xx-error select {
    border-color: #b94a48;
}
.pmk6xx-assistant .pmk6xx-status {
    ${showStatus ? "" : "display: none !important;"}
    flex: 0 0 auto;
    font-size: .78rem;
    color: #6c757d;
}
.select2-container--open {
    z-index: 99999;
}
.select2-container--open .select2-dropdown {
    z-index: 99999;
}
.select2-results__options {
    max-height: min(70vh, ${maxHeight}px) !important;
    overflow-y: auto !important;
}
${stack ? `
@media (max-width: ${breakpoint}px) {
    .pmk6xx-legacy-row {
        display: flex;
        flex-direction: column;
        align-items: stretch;
    }
    .pmk6xx-legacy-row > .pmk6xx-legacy-display,
    .pmk6xx-legacy-row > .pmk6xx-select,
    .pmk6xx-legacy-row > .select2-container {
        width: 100% !important;
        flex-basis: auto;
    }
}` : ""}
`;
    }

    function parseManualValues(text) {
        return String(text || "")
            .split(/\r?\n/)
            .map(function (line) { return line.trim(); })
            .filter(function (line) { return line && !line.startsWith("#"); })
            .map(function (line) {
                const pos = line.indexOf("|");
                const value = clean(pos === -1 ? line : line.slice(0, pos));
                const label = clean(pos === -1 ? line : line.slice(pos + 1)) || value;
                return value ? { value: value, label: label, source: "manual" } : null;
            })
            .filter(Boolean);
    }

    function legacySelect2Placeholder(rule) {
        return clean(rule && rule.select2PlaceholderFr)
            || clean(rule && rule.placeholderFr)
            || "Sélectionner une valeur";
    }

    function labelForKohaValue(row, mode) {
        const value = clean(row && row.value);
        const description = clean(row && row.description);
        const opac = clean(row && row.opac_description);
        if (mode === "value") return value;
        if (mode === "opac-description") return opac || description || value;
        if (mode === "value-description") {
            const label = description || opac || value;
            return label && label !== value ? (value + " — " + label) : value;
        }
        return description || opac || value;
    }

    function categoryName(entry) {
        return clean(entry && (entry.manualName || entry.name));
    }

    function optionKey(value, caseInsensitive) {
        const cleaned = clean(value);
        return caseInsensitive ? normalizeText(cleaned) : cleaned;
    }

    function mergeOptions(apiOptions, manualOptions, rule) {
        const map = new Map();
        const order = [];
        function add(option, override) {
            if (!option || !clean(option.value)) return;
            const key = optionKey(option.value, rule.deduplicateCaseInsensitive === true);
            if (!key) return;
            if (!map.has(key)) order.push(key);
            if (!map.has(key) || override) map.set(key, option);
        }
        (apiOptions || []).forEach(function (option) { add(option, false); });
        (manualOptions || []).forEach(function (option) { add(option, true); });

        let result = order.map(function (key) { return map.get(key); }).filter(Boolean);
        if (rule.sortMode === "label") {
            result = result.slice().sort(function (a, b) {
                return clean(a.label).localeCompare(clean(b.label), document.documentElement.lang || "fr", { sensitivity: "base" });
            });
        } else if (rule.sortMode === "value") {
            result = result.slice().sort(function (a, b) {
                return clean(a.value).localeCompare(clean(b.value), document.documentElement.lang || "fr", { sensitivity: "base" });
            });
        }
        return result;
    }

    async function optionsForRule(rule, config) {
        const fingerprint = JSON.stringify({
            id: rule.id,
            sourceMode: rule.sourceMode,
            categories: (rule.categories || []).map(function (entry) { return [entry.enabled !== false, categoryName(entry)]; }),
            manualValues: rule.manualValues,
            displayMode: rule.displayMode,
            sortMode: rule.sortMode,
            deduplicateCaseInsensitive: rule.deduplicateCaseInsensitive
        });
        if (optionsCache.has(fingerprint)) return optionsCache.get(fingerprint);

        const promise = (async function () {
            const manual = rule.sourceMode === "authorised"
                ? []
                : parseManualValues(rule.manualValues);
            let apiOptions = [];

            if (rule.sourceMode === "authorised" || rule.sourceMode === "mixed") {
                const service = window.PMK6XXConfig && window.PMK6XXConfig.authorisedValues;
                if (!service || typeof service.listValues !== "function") {
                    if (rule.sourceMode === "authorised") throw new Error("Service des valeurs autorisées indisponible.");
                } else {
                    const categories = (rule.categories || [])
                        .filter(function (entry) { return entry && entry.enabled !== false && categoryName(entry); })
                        .map(categoryName);

                    for (let i = 0; i < categories.length; i += 1) {
                        try {
                            const rows = await service.listValues(categories[i], config.api || {});
                            rows.forEach(function (row) {
                                const value = clean(row && row.value);
                                if (!value) return;
                                apiOptions.push({
                                    value: value,
                                    label: labelForKohaValue(row, rule.displayMode),
                                    source: "koha",
                                    category: categories[i]
                                });
                            });
                        } catch (error) {
                            if (rule.sourceMode === "authorised") throw error;
                            console.warn("[PMK 6XX] Catégorie Koha indisponible en mode mixte :", categories[i], error);
                        }
                    }
                }
            }

            return mergeOptions(apiOptions, manual, rule);
        })();

        optionsCache.set(fingerprint, promise);
        try {
            const result = await promise;
            optionsCache.set(fingerprint, Promise.resolve(result));
            return result;
        } catch (error) {
            optionsCache.delete(fingerprint);
            throw error;
        }
    }

    function isUsableMarcControl(node) {
        if (!(node instanceof HTMLElement)) return false;
        if (node.closest(".pmk6xx-assistant")) return false;
        if (node.getAttribute("data-pmk6xx-display-only") === "1") return false;
        if (node.tagName === "INPUT" && String(node.type || "").toLowerCase() === "hidden") return false;
        return true;
    }

    function findFieldsByMarc(rule) {
        const tag = clean(rule.marcTag);
        const subfield = clean(rule.subfield);
        // Sans sous-zone précise, on laisse volontairement le libellé de secours
        // cibler le bon contrôle au lieu d'appliquer la règle à toutes les sous-zones.
        if (!/^\d{3}$/.test(tag) || !subfield) return [];
        const prefix = 'tag_' + tag + '_subfield_' + subfield + '_';
        const nodes = Array.from(document.querySelectorAll('input[name^="' + prefix + '"], textarea[name^="' + prefix + '"], select[name^="' + prefix + '"]'));
        return nodes.filter(isUsableMarcControl);
    }

    function findFieldsByLabel(rule) {
        const wanted = normalizeText(rule.fallbackLabel);
        if (!wanted) return [];
        const tag = clean(rule.marcTag);
        const result = [];
        document.querySelectorAll("label.labelsubfield").forEach(function (label) {
            if (normalizeText(label.textContent || "") !== wanted) return;

            // Si le conteneur de zone est identifiable, on reste dans la zone MARC demandée.
            if (/^\d{3}$/.test(tag)) {
                const tagContainer = label.closest('.tag[id^="tag_' + tag + '_"]');
                if (!tagContainer) return;
            }

            const id = clean(label.getAttribute("for"));
            const field = id ? document.getElementById(id) : null;
            if (field && isUsableMarcControl(field) && !result.includes(field)) result.push(field);
        });
        return result;
    }

    function findFields(rule) {
        const byMarc = findFieldsByMarc(rule);
        return byMarc.length ? byMarc : findFieldsByLabel(rule);
    }

    function dispatchNative(field) {
        // Les événements natifs bullent jusqu'aux gestionnaires jQuery de Koha ;
        // inutile de les déclencher une seconde fois via jQuery.
        try { field.dispatchEvent(new Event("input", { bubbles: true })); } catch (_) {}
        try { field.dispatchEvent(new Event("change", { bubbles: true })); } catch (_) {}
    }

    function destroySelect2(select) {
        if (!window.jQuery || !window.jQuery.fn || !window.jQuery.fn.select2) return;
        try {
            if (window.jQuery(select).hasClass("select2-hidden-accessible")) window.jQuery(select).select2("destroy");
        } catch (_) {}
    }

    function select2ContainerFor(field) {
        if (!field || field.tagName !== "SELECT") return null;
        if (window.jQuery) {
            try {
                const instance = window.jQuery(field).data("select2");
                if (instance && instance.$container && instance.$container[0]) return instance.$container[0];
            } catch (_) {}
        }
        const next = field.nextElementSibling;
        return next && next.classList && next.classList.contains("select2-container") ? next : null;
    }

    function hideNativeSelect2(field) {
        const container = select2ContainerFor(field);
        if (!container) return null;
        container.classList.add("pmk6xx-native-select2-hidden");
        try { field.__pmk6xxNativeSelect2Container = container; } catch (_) {}
        return container;
    }

    function stripSelect2Artifacts(field) {
        if (!field) return;
        field.classList.remove("select2-hidden-accessible");
        field.removeAttribute("data-select2-id");
        field.removeAttribute("aria-hidden");
        if (field.getAttribute("tabindex") === "-1") field.removeAttribute("tabindex");
    }

    /*
     * En mode historique PMK, le vrai contrôle Koha est uniquement une source
     * de données/soumission. Il ne doit plus avoir sa propre représentation
     * Select2 visible. On suspend donc explicitement son Select2 au lieu de
     * simplement tenter de masquer son conteneur.
     */
    function suspendNativeSelect2(field) {
        if (!field || field.tagName !== "SELECT") return;

        if (!field.hasAttribute("data-pmk6xx-had-select2-class")) {
            field.setAttribute(
                "data-pmk6xx-had-select2-class",
                field.classList.contains("select2") ? "1" : "0"
            );
        }

        if (window.jQuery && window.jQuery.fn && window.jQuery.fn.select2) {
            try {
                const jq = window.jQuery(field);
                if (jq.data("select2") || jq.hasClass("select2-hidden-accessible")) {
                    jq.select2("destroy");
                }
            } catch (_) {}
        }

        // Retire aussi un éventuel conteneur Select2 devenu orphelin.
        let next = field.nextElementSibling;
        while (next && next.classList && next.classList.contains("select2-container")) {
            const following = next.nextElementSibling;
            next.remove();
            next = following;
        }

        // Empêche l'initialisation automatique tardive de Koha sur ce select.
        field.classList.remove("select2");
        stripSelect2Artifacts(field);
        field.setAttribute("data-pmk6xx-native-select2-suspended", "1");
    }

    function restoreNativeSelect2(field) {
        if (!field) return null;

        let container = field.__pmk6xxNativeSelect2Container || null;
        if (!container || !container.isConnected) container = select2ContainerFor(field);
        if (container && container.classList) {
            container.classList.remove("pmk6xx-native-select2-hidden");
        }

        if (field.getAttribute("data-pmk6xx-had-select2-class") === "1") {
            field.classList.add("select2");
        }
        field.removeAttribute("data-pmk6xx-had-select2-class");
        field.removeAttribute("data-pmk6xx-native-select2-suspended");

        try { delete field.__pmk6xxNativeSelect2Container; } catch (_) {
            field.__pmk6xxNativeSelect2Container = null;
        }
        return container || null;
    }

    function reinitNativeSelect2(field) {
        if (!field || field.tagName !== "SELECT") return;
        if (!window.jQuery || !window.jQuery.fn || !window.jQuery.fn.select2) return;

        try {
            if (window.Select2Utils && typeof window.Select2Utils.initSelect2 === "function") {
                window.Select2Utils.initSelect2(window.jQuery(field));
            } else if (field.classList.contains("select2")) {
                window.jQuery(field).select2();
            }
        } catch (_) {}
    }

    /*
     * Garde-fou contre une initialisation Select2 tardive de Koha après le
     * montage PMK. Dans une ligne historique, seuls le champ source caché,
     * l'input de présentation, la liste PMK et SON conteneur Select2 sont admis.
     */
    function pruneLegacyHost(host) {
        if (!host || !host.isConnected) return;

        const source = host.__pmk6xxSource || host.querySelector(".pmk6xx-native-source");
        const helper = host.querySelector('select[data-pmk6xx-helper="1"]');

        if (source && source.tagName === "SELECT") {
            suspendNativeSelect2(source);
        }

        let ownedContainer = null;
        if (helper) {
            ownedContainer = select2ContainerFor(helper);
            if (ownedContainer) {
                ownedContainer.setAttribute("data-pmk6xx-owned-select2", "1");
            }
        }

        host.querySelectorAll(".select2-container").forEach(function (container) {
            if (container !== ownedContainer) container.remove();
        });

        Array.from(host.children || []).forEach(function (child) {
            if (
                child.tagName === "SELECT" &&
                child !== source &&
                child !== helper
            ) {
                child.remove();
            }
        });
    }

    function scheduleLegacyHostPrune(host) {
        if (!host) return;
        [0, 50, 250, 1000, 2500].forEach(function (delay) {
            window.setTimeout(function () {
                try { pruneLegacyHost(host); } catch (_) {}
            }, delay);
        });
    }

    function ensureSelect2(config) {
        if (!config.select2 || config.select2.enabled === false) return Promise.resolve(false);
        if (window.jQuery && window.jQuery.fn && window.jQuery.fn.select2) return Promise.resolve(true);
        if (config.select2.loadIfMissing === false) return Promise.resolve(false);
        if (select2Promise) return select2Promise;

        select2Promise = new Promise(function (resolve) {
            const cssUrl = clean(config.select2.cssUrl);
            const jsUrl = clean(config.select2.jsUrl);

            if (cssUrl && !document.querySelector('link[data-pmk6xx-select2-css="1"]')) {
                const link = document.createElement("link");
                link.rel = "stylesheet";
                link.href = cssUrl;
                link.dataset.pmk6xxSelect2Css = "1";
                document.head.appendChild(link);
            }

            if (!jsUrl) {
                resolve(false);
                return;
            }

            let script = document.querySelector('script[data-pmk6xx-select2-js="1"]');
            if (!script) {
                script = document.createElement("script");
                script.src = jsUrl;
                script.async = true;
                script.dataset.pmk6xxSelect2Js = "1";
                document.head.appendChild(script);
            }

            const done = function () {
                resolve(!!(window.jQuery && window.jQuery.fn && window.jQuery.fn.select2));
            };
            if (window.jQuery && window.jQuery.fn && window.jQuery.fn.select2) {
                done();
                return;
            }
            script.addEventListener("load", done, { once: true });
            script.addEventListener("error", function () { resolve(false); }, { once: true });
            window.setTimeout(done, 5000);
        });

        return select2Promise;
    }

    function syncAssistantFromField(field, select) {
        const value = clean(field.value);
        const exists = Array.from(select.options).some(function (option) { return option.value === value; });
        select.value = exists ? value : "";
        if (window.jQuery && window.jQuery.fn && window.jQuery.fn.select2) {
            try { window.jQuery(select).val(select.value).trigger("change.select2"); } catch (_) {}
        }
    }

    function rememberOriginalStyle(field) {
        if (field.hasAttribute("data-pmk6xx-original-style")) return;
        const value = field.getAttribute("style");
        field.setAttribute("data-pmk6xx-original-style", value === null ? "__PMK_NONE__" : value);
    }

    function restoreOriginalStyle(field) {
        const value = field.getAttribute("data-pmk6xx-original-style");
        if (value === null) return;
        if (value === "__PMK_NONE__") field.removeAttribute("style");
        else field.setAttribute("style", value);
        field.removeAttribute("data-pmk6xx-original-style");
    }

    function removeRuleSyncHandler(field, ruleId) {
        if (!field || !field.__pmk6xxSyncHandlers) return;
        const handler = field.__pmk6xxSyncHandlers[ruleId];
        if (typeof handler === "function") {
            field.removeEventListener("input", handler);
            field.removeEventListener("change", handler);
        }
        try { delete field.__pmk6xxSyncHandlers[ruleId]; } catch (_) { field.__pmk6xxSyncHandlers[ruleId] = null; }
    }

    function removeHelperCommitHandler(select) {
        if (!select) return;
        const handler = select.__pmk6xxCommitHandler;
        if (typeof handler === "function") {
            try { select.removeEventListener("change", handler); } catch (_) {}
            if (window.jQuery) {
                try { window.jQuery(select).off(".pmk6xxCommit", handler); } catch (_) {}
            }
        }
        try { delete select.__pmk6xxCommitHandler; } catch (_) { select.__pmk6xxCommitHandler = null; }
        try { delete select.__pmk6xxCommitLock; } catch (_) { select.__pmk6xxCommitLock = false; }
    }

    function bindHelperCommitHandler(select, callback) {
        if (!select || typeof callback !== "function") return;
        removeHelperCommitHandler(select);

        const handler = function () {
            // Select2 émet des événements jQuery ; le <select> natif peut aussi
            // émettre un vrai change. On écoute les deux sans exécuter deux fois
            // la même sélection dans la même pile d'événements.
            if (select.__pmk6xxCommitLock) return;
            select.__pmk6xxCommitLock = true;
            select.__pmk6xxDirty = true;
            try {
                callback();
            } finally {
                Promise.resolve().then(function () {
                    select.__pmk6xxCommitLock = false;
                });
            }
        };

        select.__pmk6xxCommitCallback = callback;
        select.__pmk6xxCommitHandler = handler;
        select.addEventListener("change", handler);

        if (window.jQuery) {
            try {
                window.jQuery(select)
                    .off(".pmk6xxCommit")
                    .on("change.pmk6xxCommit select2:select.pmk6xxCommit select2:clear.pmk6xxCommit", handler);
            } catch (_) {}
        }
    }

    function commitAssistantToSource(host) {
        if (!host) return;
        const source = host.__pmk6xxSource || host.querySelector(".pmk6xx-native-source");
        const select = host.querySelector(".pmk6xx-select");
        const rule = host.__pmk6xxRule || null;
        if (!source || !select) return;
        // Ne jamais recopier une liste restée vide simplement parce que la valeur
        // MARC courante n'existe pas dans les suggestions. Seules les listes
        // réellement manipulées par l'utilisateur sont resynchronisées au submit.
        if (select.__pmk6xxDirty !== true) return;

        const value = String(select.value == null ? "" : select.value);
        if (!value && preserveValueOnClear(rule)) return;
        const selected = select.options && select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
        const label = selected ? selected.textContent : value;

        setFieldValue(source, value, label || value);
        dispatchNative(source);
    }

    function syncAllAssistantsToSources() {
        document.querySelectorAll(".pmk6xx-assistant").forEach(function (host) {
            try { commitAssistantToSource(host); } catch (error) {
                console.warn("[PMK 6XX] Synchronisation avant enregistrement impossible :", error);
            }
        });
    }

    function installFormSubmitGuard() {
        const form = document.getElementById("f") || document.forms.f;
        if (!form || form.__pmk6xxSubmitGuard) return;
        if (typeof form.submit !== "function") return;

        const originalSubmit = form.submit.bind(form);
        form.__pmk6xxNativeSubmit = originalSubmit;
        form.submit = function () {
            // Koha appelle document.f.submit() dans Check(), ce qui contourne
            // l'événement submit. La synchronisation doit donc se faire ici.
            syncAllAssistantsToSources();
            return originalSubmit();
        };
        form.__pmk6xxSubmitGuard = true;
    }

    function setFieldValue(field, value, label) {
        if (field.tagName === "SELECT") {
            const exists = Array.from(field.options || []).some(function (option) {
                return option.value === value;
            });
            if (value && !exists) {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label || value;
                option.setAttribute("data-pmk6xx-injected", "1");
                field.appendChild(option);
            }
        }
        field.value = value;
    }

    function setLegacyDisplayValue(displayField, value, label) {
        if (!displayField) return;
        if (displayField.tagName === "SELECT") {
            const exists = Array.from(displayField.options || []).some(function (option) {
                return option.value === value;
            });
            if (value && !exists) {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label || value;
                option.setAttribute("data-pmk6xx-display-only", "1");
                displayField.appendChild(option);
            }
        }
        displayField.value = value;
    }

    function syncLegacyFromField(field, displayField, select) {
        const value = String(field.value == null ? "" : field.value);
        setLegacyDisplayValue(displayField, value, value);
        const exists = Array.from(select.options || []).some(function (option) {
            return option.value === value;
        });
        select.value = exists ? value : "";
        if (window.jQuery && window.jQuery.fn && window.jQuery.fn.select2) {
            try { window.jQuery(select).val(select.value).trigger("change.select2"); } catch (_) {}
        }
    }

    function createHistoricalSelect(field, rule) {
        const select = document.createElement("select");
        select.className = "koha-6xx-suggestions-select pmk6xx-select";
        // IMPORTANT : aucun name. Koha reconstruit le MARC en se basant sur l'ordre
        // des paramètres tag_* ; un contrôle PMK nommé pourrait interrompre la lecture
        // des sous-zones suivantes (notamment le $9 d'autorité).
        select.removeAttribute("name");
        select.setAttribute("data-koha-custom", "1");
        select.setAttribute("data-pmk6xx-helper", "1");
        select.setAttribute("placeholder", rule.placeholderFr || "");
        select.style.width = "50%";
        return select;
    }

    function preserveValueOnClear(rule) {
        return !!rule && [
            "legacy-082-indexation",
            "legacy-083-element",
            "legacy-084-categorie"
        ].includes(String(rule.id || ""));
    }

    async function bindFieldLegacy(field, rule, config) {
        const parent = field.parentNode;
        if (!parent) return;

        rememberOriginalStyle(field);
        // Le vrai contrôle Koha reste la source soumise au formulaire, mais sa
        // représentation Select2 native est suspendue pendant l'affichage PMK.
        suspendNativeSelect2(field);

        const host = document.createElement("div");
        host.className = "pmk6xx-assistant pmk6xx-legacy-row pmk6xx-loading";
        host.dataset.ruleId = rule.id;
        host.__pmk6xxLive = true;
        host.__pmk6xxSource = field;
        host.__pmk6xxRule = rule;

        // Toujours un INPUT texte de présentation à gauche.
        // Ne jamais cloner le contrôle Koha ici : si le vrai champ est un <select>,
        // le clone conserve ses classes Select2 et Koha peut l'initialiser à son tour,
        // ce qui crée une deuxième liste déroulante visible.
        const displayField = document.createElement("input");
        displayField.type = "text";
        displayField.disabled = true;
        displayField.value = String(field.value == null ? "" : field.value);
        displayField.className = "input_marceditor pmk6xx-legacy-display";
        displayField.style.width = (config.appearance.leftWidthPercent || 50) + "%";
        if (field.id) displayField.id = field.id + "_clone";
        displayField.setAttribute("data-pmk6xx-display-only", "1");
        displayField.setAttribute("aria-hidden", "true");
        displayField.tabIndex = -1;

        const select = createHistoricalSelect(field, rule);
        select.style.width = (config.appearance.rightWidthPercent || 50) + "%";
        select.setAttribute("aria-label", language() === "en" ? rule.nameEn : rule.nameFr);

        const status = document.createElement("span");
        status.className = "pmk6xx-status";
        status.setAttribute("aria-hidden", "true");
        status.textContent = "…";

        parent.insertBefore(host, field);
        host.appendChild(field);
        host.appendChild(displayField);
        host.appendChild(select);
        host.appendChild(status);

        field.classList.add("pmk6xx-native-source");
        pruneLegacyHost(host);
        scheduleLegacyHostPrune(host);

        bindHelperCommitHandler(select, function () {
            const value = select.value;
            const selected = select.options[select.selectedIndex];
            const label = selected ? selected.textContent : value;

            // Les historiques 082/083/084 conservaient la valeur sur un clear ;
            // les nouvelles règles (et 081) peuvent réellement vider le champ Koha.
            if (!value && preserveValueOnClear(rule)) {
                syncLegacyFromField(field, displayField, select);
                return;
            }

            setFieldValue(field, value || "", label || value || "");
            setLegacyDisplayValue(displayField, value || "", label || value || "");
            dispatchNative(field);
        });

        const syncHandler = function () {
            syncLegacyFromField(field, displayField, select);
        };
        field.addEventListener("input", syncHandler);
        field.addEventListener("change", syncHandler);
        if (!field.__pmk6xxSyncHandlers) field.__pmk6xxSyncHandlers = {};
        field.__pmk6xxSyncHandlers[rule.id] = syncHandler;

        try {
            const options = await optionsForRule(rule, config);
            if (!host.isConnected) return;

            const current = String(field.value == null ? "" : field.value);
            select.innerHTML = "";

            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = language() === "en" ? rule.placeholderEn : rule.placeholderFr;
            select.appendChild(placeholder);

            options.forEach(function (entry) {
                const option = document.createElement("option");
                option.value = entry.value;
                option.textContent = entry.label || entry.value;
                if (entry.value === current) option.selected = true;
                select.appendChild(option);
            });

            // Comme dans les scripts historiques : une valeur libre reste visible
            // à gauche mais n'est pas ajoutée artificiellement dans la liste.
            syncLegacyFromField(field, displayField, select);
            select.__pmk6xxDirty = false;

            host.classList.remove("pmk6xx-loading");
            status.textContent = options.length ? String(options.length) : "0";
            status.title = t(options.length + " suggestion(s)", options.length + " suggestion(s)");

            const hasSelect2 = await ensureSelect2(config);
            if (hasSelect2 && host.isConnected) {
                try {
                    destroySelect2(select);
                    const select2Options = {
                        width: "100%",
                        placeholder: language() === "en" ? rule.placeholderEn : legacySelect2Placeholder(rule),
                        allowClear: true
                    };
                    if (rule.id === "legacy-081-genre") {
                        select2Options.dropdownParent = window.jQuery(document.body);
                    }
                    window.jQuery(select).select2(select2Options);
                    pruneLegacyHost(host);
                    scheduleLegacyHostPrune(host);
                    if (typeof select.__pmk6xxCommitCallback === "function") {
                        bindHelperCommitHandler(select, select.__pmk6xxCommitCallback);
                    }
                } catch (error) {
                    destroySelect2(select);
                    stripSelect2Artifacts(select);
                    console.warn("[PMK 6XX] Select2 indisponible, repli sur la liste native :", error);
                }
            }
        } catch (error) {
            if (!host.isConnected) return;

            // En mode historique le vrai champ est masqué. En cas d'échec de la
            // source de suggestions, on revient donc immédiatement au contrôle Koha
            // natif au lieu de laisser un assistant vide bloquer la saisie.
            removeRuleSyncHandler(field, rule.id);
            const nativeContainer = restoreNativeSelect2(field);
            field.classList.remove("pmk6xx-native-source");
            restoreOriginalStyle(field);
            if (host.parentNode) {
                host.parentNode.insertBefore(field, host);
                if (nativeContainer && host.contains(nativeContainer)) {
                    host.parentNode.insertBefore(nativeContainer, host);
                }
            }
            destroySelect2(select);
            host.remove();

            // data-pmk6xx-rules est volontairement conservé jusqu'au prochain
            // refresh de configuration afin d'éviter une boucle de tentatives API.
            console.warn("[PMK 6XX] Impossible de charger les suggestions pour", rule.id, error);
        }
    }

    async function bindFieldInline(field, rule, config) {
        const host = document.createElement("span");
        host.className = "pmk6xx-assistant pmk6xx-inline-assistant pmk6xx-loading";
        host.dataset.ruleId = rule.id;
        host.__pmk6xxLive = true;
        host.__pmk6xxSource = field;
        host.__pmk6xxRule = rule;

        const select = document.createElement("select");
        select.className = "pmk6xx-select";
        select.setAttribute("data-pmk6xx-helper", "1");
        select.removeAttribute("name");
        select.setAttribute("aria-label", language() === "en" ? rule.nameEn : rule.nameFr);
        select.innerHTML = '<option value="">' + (language() === "en" ? rule.placeholderEn : rule.placeholderFr) + "</option>";
        host.appendChild(select);

        const status = document.createElement("span");
        status.className = "pmk6xx-status";
        status.setAttribute("aria-hidden", "true");
        status.textContent = "…";
        host.appendChild(status);

        // Avec un champ Koha déjà en Select2, le conteneur visible est le vrai
        // point d'ancrage : l'assistant reste bien placé à sa droite.
        const nativeVisible = select2ContainerFor(field);
        const anchor = nativeVisible && nativeVisible.isConnected ? nativeVisible : field;
        anchor.insertAdjacentElement("afterend", host);

        bindHelperCommitHandler(select, function () {
            if (!select.value && preserveValueOnClear(rule)) {
                syncAssistantFromField(field, select);
                return;
            }
            const selected = select.options[select.selectedIndex];
            setFieldValue(field, select.value || "", selected ? selected.textContent : (select.value || ""));
            dispatchNative(field);
        });

        const syncHandler = function () { syncAssistantFromField(field, select); };
        field.addEventListener("input", syncHandler);
        field.addEventListener("change", syncHandler);
        if (!field.__pmk6xxSyncHandlers) field.__pmk6xxSyncHandlers = {};
        field.__pmk6xxSyncHandlers[rule.id] = syncHandler;

        try {
            const options = await optionsForRule(rule, config);
            if (!host.isConnected) return;

            const current = clean(field.value);
            select.innerHTML = "";
            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = language() === "en" ? rule.placeholderEn : rule.placeholderFr;
            select.appendChild(placeholder);

            options.forEach(function (entry) {
                const option = document.createElement("option");
                option.value = entry.value;
                option.textContent = entry.label || entry.value;
                select.appendChild(option);
            });

            if (current && !options.some(function (entry) { return entry.value === current; })) {
                const option = document.createElement("option");
                option.value = current;
                option.textContent = t("Valeur actuelle — ", "Current value — ") + current;
                select.appendChild(option);
            }

            syncAssistantFromField(field, select);
            select.__pmk6xxDirty = false;
            host.classList.remove("pmk6xx-loading");
            status.textContent = options.length ? String(options.length) : "0";
            status.title = t(options.length + " suggestion(s)", options.length + " suggestion(s)");

            const hasSelect2 = await ensureSelect2(config);
            if (hasSelect2 && host.isConnected) {
                try {
                    destroySelect2(select);
                    window.jQuery(select).select2({
                        width: "100%",
                        placeholder: language() === "en" ? rule.placeholderEn : rule.placeholderFr,
                        allowClear: true,
                        dropdownParent: window.jQuery(document.body)
                    });
                    if (typeof select.__pmk6xxCommitCallback === "function") {
                        bindHelperCommitHandler(select, select.__pmk6xxCommitCallback);
                    }
                } catch (error) {
                    destroySelect2(select);
                    stripSelect2Artifacts(select);
                    console.warn("[PMK 6XX] Select2 indisponible, repli sur la liste native :", error);
                }
            }
        } catch (error) {
            if (!host.isConnected) return;
            host.classList.remove("pmk6xx-loading");
            host.classList.add("pmk6xx-error");
            status.textContent = "!";
            status.title = t(
                "Valeurs Koha indisponibles : le champ natif reste utilisable.",
                "Koha values unavailable: the native field remains usable."
            );
            console.warn("[PMK 6XX] Impossible de charger les suggestions pour", rule.id, error);
        }
    }

    async function bindField(field, rule, config) {
        const boundRules = clean(field.getAttribute("data-pmk6xx-rules"))
            .split(",")
            .map(function (value) { return value.trim(); })
            .filter(Boolean);
        if (boundRules.includes(rule.id)) return;
        if (boundRules.length) {
            console.warn("[PMK 6XX] Contrôle déjà géré par une autre règle, seconde règle ignorée :", rule.id, field);
            return;
        }
        boundRules.push(rule.id);
        field.setAttribute("data-pmk6xx-rules", boundRules.join(","));

        if (config.appearance && config.appearance.mode === "legacy-split") {
            return bindFieldLegacy(field, rule, config);
        }
        return bindFieldInline(field, rule, config);
    }

    function kohaMutationTouchesManaged6xx(index) {
        if (!index) return false;
        const target = document.getElementById(String(index));
        if (!target) return false;

        if (
            target.matches &&
            target.matches(".pmk6xx-assistant, .pmk6xx-native-source")
        ) {
            return true;
        }

        if (
            target.querySelector &&
            target.querySelector(".pmk6xx-assistant, .pmk6xx-native-source")
        ) {
            return true;
        }

        return !!(
            target.closest &&
            target.closest(".pmk6xx-assistant")
        );
    }

    function installKohaMutationGuards() {
        KOHA_MUTATOR_NAMES.forEach(function (name) {
            const current = window[name];
            if (typeof current !== "function" || current.__pmk6xxGuard === true) return;

            const original = current;
            const guarded = function () {
                const activeConfig = cfg();
                if (!pageEnabled(activeConfig)) return original.apply(this, arguments);

                /*
                 * Très important : un clic sur la croix rouge d'une autre zone
                 * ne doit pas démonter les assistants 6XX. On n'intervient que
                 * si CloneField / CloneSubfield / UnCloneField touche réellement
                 * un nœud contenant un assistant PMK.
                 */
                const touchesManaged6xx = kohaMutationTouchesManaged6xx(arguments[0]);
                if (!touchesManaged6xx) {
                    return original.apply(this, arguments);
                }

                // Pour un 6XX réellement géré, on démonte avant le clone afin que
                // Koha ne copie jamais les contrôles PMK sans leurs listeners.
                clearAssistants();
                try {
                    return original.apply(this, arguments);
                } finally {
                    window.setTimeout(scheduleScan, 0);
                    window.setTimeout(scheduleScan, 80);
                }
            };
            guarded.__pmk6xxGuard = true;
            guarded.__pmk6xxOriginal = original;
            window[name] = guarded;
        });
    }

    function clearAssistants() {
        document.querySelectorAll(".pmk6xx-assistant").forEach(function (host) {
            const select = host.querySelector(".pmk6xx-select");
            if (select) {
                removeHelperCommitHandler(select);
                try { delete select.__pmk6xxCommitCallback; } catch (_) { select.__pmk6xxCommitCallback = null; }
                destroySelect2(select);
            }

            const source = host.querySelector(".pmk6xx-native-source");
            if (source && host.parentNode) {
                const nativeContainer = restoreNativeSelect2(source);
                source.classList.remove("pmk6xx-native-source");
                restoreOriginalStyle(source);
                host.parentNode.insertBefore(source, host);
                // Si Koha a recréé Select2 après le montage PMK, son conteneur peut
                // se trouver dans le host : on le replace à côté de son vrai select.
                if (nativeContainer && host.contains(nativeContainer)) {
                    host.parentNode.insertBefore(nativeContainer, host);
                }
                reinitNativeSelect2(source);
            }

            host.remove();
        });

        document.querySelectorAll("[data-pmk6xx-rules]").forEach(function (node) {
            restoreNativeSelect2(node);
            const handlers = node.__pmk6xxSyncHandlers || {};
            Object.keys(handlers).forEach(function (ruleId) {
                const handler = handlers[ruleId];
                if (typeof handler !== "function") return;
                node.removeEventListener("input", handler);
                node.removeEventListener("change", handler);
            });
            try { delete node.__pmk6xxSyncHandlers; } catch (_) { node.__pmk6xxSyncHandlers = null; }
            node.removeAttribute("data-pmk6xx-rules");
        });

        // Filet de sécurité si un conteneur Select2 natif a été remplacé entre-temps.
        document.querySelectorAll(".pmk6xx-native-select2-hidden").forEach(function (container) {
            container.classList.remove("pmk6xx-native-select2-hidden");
        });
    }

    function scan() {
        scanScheduled = false;
        const config = cfg();
        if (!pageEnabled(config)) return;
        installKohaMutationGuards();
        installFormSubmitGuard();
        injectStyles(config);

        // Neutralise toute réinitialisation Select2 tardive du vrai champ Koha
        // et supprime les éventuels contrôles parasites apparus dans la ligne PMK.
        document.querySelectorAll(".pmk6xx-legacy-row").forEach(function (host) {
            pruneLegacyHost(host);
        });
        document.querySelectorAll(".pmk6xx-native-source").forEach(function (field) {
            suspendNativeSelect2(field);
        });

        const rules = Array.isArray(config.rules) ? config.rules.filter(function (rule) { return rule && rule.enabled !== false; }) : [];
        rules.forEach(function (rule) {
            findFields(rule).forEach(function (field) {
                bindField(field, rule, config);
            });
        });
    }

    function scheduleScan() {
        if (scanScheduled) return;
        scanScheduled = true;
        window.requestAnimationFrame(scan);
    }

    function start(config) {
        if (runtimeStarted || !pageEnabled(config)) return;
        runtimeStarted = true;
        installKohaMutationGuards();
        installFormSubmitGuard();
        injectStyles(config);
        scan();

        mutationObserver = new MutationObserver(scheduleScan);
        mutationObserver.observe(document.documentElement, { childList: true, subtree: true });

        window.setTimeout(scan, 400);
        window.setTimeout(scan, 1200);
        window.setTimeout(scan, 2500);
    }

    function refresh(config) {
        optionsCache.clear();
        select2Promise = null;
        try {
            const service = window.PMK6XXConfig && window.PMK6XXConfig.authorisedValues;
            if (service && typeof service.clear === "function") service.clear();
        } catch (_) {}
        if (!pageEnabled(config)) {
            if (mutationObserver) {
                mutationObserver.disconnect();
                mutationObserver = null;
            }
            clearAssistants();
            runtimeStarted = false;
            return;
        }
        clearAssistants();
        runtimeStarted = false;
        start(config);
    }

    const api = window.PMK6XXConfig;
    if (api && api.ready && typeof api.ready.then === "function") {
        api.ready.then(start).catch(function () { start(api.get ? api.get() : null); });
    } else {
        document.addEventListener("DOMContentLoaded", function () { start(cfg()); }, { once: true });
    }

    window.PMK6XXSuggestions = {
        version: "2.3.1-preplugin",
        syncAll: syncAllAssistantsToSources,
        inspect: function () {
            return Array.from(document.querySelectorAll(".pmk6xx-assistant")).map(function (host) {
                const source = host.__pmk6xxSource || host.querySelector(".pmk6xx-native-source");
                const select = host.querySelector(".pmk6xx-select");
                return {
                    ruleId: host.dataset.ruleId || "",
                    sourceName: source ? source.name : "",
                    sourceValue: source ? source.value : "",
                    helperValue: select ? select.value : "",
                    dirty: select ? select.__pmk6xxDirty === true : false,
                    sourceDisabled: source ? !!source.disabled : null
                };
            });
        }
    };

    window.addEventListener("pmk6xx:config-changed", function (event) {
        const config = event && event.detail ? event.detail : cfg();
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () { refresh(config); }, { once: true });
        } else {
            refresh(config);
        }
    });
})();

/*
 Nom du fichier : 036-clear-search-when-barcode.js
 Dépendances : 000-pmk-config-firestore.js 0.4.20+ recommandé (valeurs par défaut intégrées)
 Date de dernière modification : 2026-10-02
 Version : 2.1.5-preplugin
 Auteur : Michael Mundet / refonte PimpMyKoha
 Description : Gère le nettoyage visuel de la barre de recherche catalogue après une
               recherche reconnue comme code-barres. La reconnaissance repose sur une
               liste ordonnée de profils prédéfinis ou personnalisés (index Koha, formats
               numériques/alphanumériques, EAN/UPC/ISBN/ISSN, préfixes, regex, AIM).
               La valeur Koha localStorage.searchbox_value est conservée afin de ne pas
               casser les modules qui utilisent le contexte de la dernière recherche.
               Intègre aussi le bouton d'effacement manuel de l'ancien 053, sous une
               forme compacte et native dans la barre catalogue.
*/
(function () {
    "use strict";

    const MODULE_ID = "catalogue-search-behavior";
    const MODULE_VERSION = "2.1.5-preplugin";
    const TARGET_SELECTOR = "#cat-search-block #search-form";
    const FORM_SELECTOR = "#cat-search-block";
    const CONTEXT_KEY = "catalogue-search-behavior-main";
    const CLEAR_BUTTON_ATTR = "data-pmk036-clear-button";
    const STYLE_ID = "pmk036-catalogue-search-style";

    const DEFAULTS = {
        enabled: true,
        scope: {
            mode: "catalogue-searchbar",
            targetSelector: TARGET_SELECTOR,
            formSelector: FORM_SELECTOR
        },
        behavior: {
            preserveSearchContext: true,
            clearOnAction: "clear",
            onlyIfCurrentEmptyOrMatchesStored: true,
            dispatchInputEvent: true,
            dispatchChangeEvent: false,
            focusAfterClear: false
        },
        clearButton: {
            enabled: true,
            labelFr: "Effacer la recherche",
            labelEn: "Clear search"
        },
        scanner: {
            trimOuterSpaces: true,
            detectAimIdentifier: true,
            stripAimIdentifierBeforeMatch: true
        },
        profiles: [
            {
                id: "koha-barcode-index",
                enabled: true,
                preset: "any",
                nameFr: "Index Koha : Code à barres",
                nameEn: "Koha index: Barcode",
                action: "clear",
                indexMode: "include",
                indexValues: "bc",
                aimIdentifiers: "",
                minLength: 1,
                maxLength: 128,
                prefix: "",
                suffix: "",
                allowSeparators: false,
                validateChecksum: false,
                caseSensitive: false,
                regex: ""
            },
            {
                id: "isbn13",
                enabled: true,
                preset: "isbn13",
                nameFr: "ISBN-13",
                nameEn: "ISBN-13",
                action: "keep",
                indexMode: "any",
                indexValues: "",
                aimIdentifiers: "",
                minLength: 13,
                maxLength: 17,
                prefix: "",
                suffix: "",
                allowSeparators: true,
                validateChecksum: true,
                caseSensitive: false,
                regex: ""
            },
            {
                id: "isbn10",
                enabled: true,
                preset: "isbn10",
                nameFr: "ISBN-10",
                nameEn: "ISBN-10",
                action: "keep",
                indexMode: "any",
                indexValues: "",
                aimIdentifiers: "",
                minLength: 10,
                maxLength: 13,
                prefix: "",
                suffix: "",
                allowSeparators: true,
                validateChecksum: true,
                caseSensitive: false,
                regex: ""
            },
            {
                id: "issn",
                enabled: true,
                preset: "issn",
                nameFr: "ISSN",
                nameEn: "ISSN",
                action: "keep",
                indexMode: "any",
                indexValues: "",
                aimIdentifiers: "",
                minLength: 8,
                maxLength: 9,
                prefix: "",
                suffix: "",
                allowSeparators: true,
                validateChecksum: true,
                caseSensitive: false,
                regex: ""
            },
            {
                id: "ean13",
                enabled: true,
                preset: "ean13",
                nameFr: "EAN-13",
                nameEn: "EAN-13",
                action: "keep",
                indexMode: "any",
                indexValues: "",
                aimIdentifiers: "",
                minLength: 13,
                maxLength: 13,
                prefix: "",
                suffix: "",
                allowSeparators: false,
                validateChecksum: true,
                caseSensitive: false,
                regex: ""
            },
            {
                id: "upca",
                enabled: true,
                preset: "upca",
                nameFr: "UPC-A",
                nameEn: "UPC-A",
                action: "keep",
                indexMode: "any",
                indexValues: "",
                aimIdentifiers: "",
                minLength: 12,
                maxLength: 12,
                prefix: "",
                suffix: "",
                allowSeparators: false,
                validateChecksum: true,
                caseSensitive: false,
                regex: ""
            },
            {
                id: "ean8",
                enabled: true,
                preset: "ean8",
                nameFr: "EAN-8",
                nameEn: "EAN-8",
                action: "keep",
                indexMode: "any",
                indexValues: "",
                aimIdentifiers: "",
                minLength: 8,
                maxLength: 8,
                prefix: "",
                suffix: "",
                allowSeparators: false,
                validateChecksum: true,
                caseSensitive: false,
                regex: ""
            },
            {
                id: "dr-prefix",
                enabled: true,
                preset: "prefix-digits",
                nameFr: "Exemplaire préfixé DR",
                nameEn: "DR-prefixed item barcode",
                action: "clear",
                indexMode: "any",
                indexValues: "",
                aimIdentifiers: "",
                minLength: 11,
                maxLength: 40,
                prefix: "DR",
                suffix: "",
                allowSeparators: false,
                validateChecksum: false,
                caseSensitive: false,
                regex: ""
            },
            {
                id: "numeric-10",
                enabled: true,
                preset: "numeric",
                nameFr: "Exemplaire numérique — 10 chiffres",
                nameEn: "Numeric item barcode — 10 digits",
                action: "clear",
                indexMode: "any",
                indexValues: "",
                aimIdentifiers: "",
                minLength: 10,
                maxLength: 10,
                prefix: "",
                suffix: "",
                allowSeparators: false,
                validateChecksum: false,
                caseSensitive: false,
                regex: ""
            },
            {
                id: "numeric-14",
                enabled: true,
                preset: "numeric",
                nameFr: "Exemplaire numérique — 14 chiffres",
                nameEn: "Numeric item barcode — 14 digits",
                action: "clear",
                indexMode: "any",
                indexValues: "",
                aimIdentifiers: "",
                minLength: 14,
                maxLength: 14,
                prefix: "",
                suffix: "",
                allowSeparators: false,
                validateChecksum: false,
                caseSensitive: false,
                regex: ""
            },
            {
                id: "generic-numeric",
                enabled: false,
                preset: "numeric",
                nameFr: "Numérique générique",
                nameEn: "Generic numeric barcode",
                action: "clear",
                indexMode: "any",
                indexValues: "",
                aimIdentifiers: "",
                minLength: 5,
                maxLength: 40,
                prefix: "",
                suffix: "",
                allowSeparators: false,
                validateChecksum: false,
                caseSensitive: false,
                regex: ""
            },
            {
                id: "generic-alphanumeric",
                enabled: false,
                preset: "alphanumeric",
                nameFr: "Alphanumérique générique",
                nameEn: "Generic alphanumeric barcode",
                action: "clear",
                indexMode: "any",
                indexValues: "",
                aimIdentifiers: "",
                minLength: 5,
                maxLength: 64,
                prefix: "",
                suffix: "",
                allowSeparators: false,
                validateChecksum: false,
                caseSensitive: false,
                regex: ""
            },
            {
                id: "aim-code128",
                enabled: false,
                preset: "any",
                nameFr: "Scanner AIM — famille Code 128",
                nameEn: "AIM scanner — Code 128 family",
                action: "clear",
                indexMode: "any",
                indexValues: "",
                aimIdentifiers: "]C*",
                minLength: 1,
                maxLength: 128,
                prefix: "",
                suffix: "",
                allowSeparators: false,
                validateChecksum: false,
                caseSensitive: false,
                regex: ""
            },
            {
                id: "aim-code39",
                enabled: false,
                preset: "any",
                nameFr: "Scanner AIM — famille Code 39",
                nameEn: "AIM scanner — Code 39 family",
                action: "clear",
                indexMode: "any",
                indexValues: "",
                aimIdentifiers: "]A*",
                minLength: 1,
                maxLength: 128,
                prefix: "",
                suffix: "",
                allowSeparators: false,
                validateChecksum: false,
                caseSensitive: false,
                regex: ""
            },
            {
                id: "aim-ean-upc",
                enabled: false,
                preset: "any",
                nameFr: "Scanner AIM — famille EAN / UPC",
                nameEn: "AIM scanner — EAN / UPC family",
                action: "keep",
                indexMode: "any",
                indexValues: "",
                aimIdentifiers: "]E*",
                minLength: 1,
                maxLength: 128,
                prefix: "",
                suffix: "",
                allowSeparators: false,
                validateChecksum: false,
                caseSensitive: false,
                regex: ""
            }
        ],
        test: {
            value: "0000549383",
            index: "bc",
            aimIdentifier: "",
            result: ""
        }
    };

    let currentConfig = deepClone(DEFAULTS);
    let observer = null;
    let clearButtonSyncTimers = [];
    let behaviorRetryTimers = [];

    function deepClone(value) {
        return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }

    function isPlainObject(value) {
        return value && typeof value === "object" && !Array.isArray(value);
    }

    function deepMerge(base, override) {
        if (Array.isArray(base)) return Array.isArray(override) ? deepClone(override) : deepClone(base);
        if (!isPlainObject(base)) return override === undefined ? deepClone(base) : deepClone(override);
        const out = deepClone(base) || {};
        if (!isPlainObject(override)) return out;
        Object.keys(override).forEach(function (key) {
            const value = override[key];
            if (Array.isArray(value)) out[key] = deepClone(value);
            else if (isPlainObject(value)) out[key] = deepMerge(isPlainObject(out[key]) ? out[key] : {}, value);
            else out[key] = value;
        });
        return out;
    }

    function normalizeConfig(config) {
        const out = deepMerge(DEFAULTS, config || {});
        out.enabled = out.enabled !== false;
        if (!Array.isArray(out.profiles)) out.profiles = deepClone(DEFAULTS.profiles);
        out.profiles = out.profiles.map(normalizeProfile);

        /*
         * Migration des profils historiques déjà enregistrés dans PMK/Firestore.
         * Les tableaux de profils enregistrés remplacent les DEFAULTS : sans cette
         * migration, modifier uniquement DEFAULTS ne corrigerait pas les postes
         * qui ont déjà une configuration sauvegardée.
         */
        const defaultProfilesById = {};
        DEFAULTS.profiles.forEach(function (profile) {
            if (profile && profile.id) defaultProfilesById[profile.id] = profile;
        });

        const drProfile = out.profiles.find(function (profile) {
            return profile && profile.id === "dr-prefix";
        });
        if (drProfile &&
            String(drProfile.prefix || "").toUpperCase() === "DR" &&
            Number(drProfile.minLength) === 12) {
            drProfile.minLength = 11;
        }

        const hasNumeric14 = out.profiles.some(function (profile) {
            return profile && profile.id === "numeric-14";
        });
        if (!hasNumeric14 && defaultProfilesById["numeric-14"]) {
            const numeric14 = normalizeProfile(deepClone(defaultProfilesById["numeric-14"]));
            const numeric10Index = out.profiles.findIndex(function (profile) {
                return profile && profile.id === "numeric-10";
            });
            if (numeric10Index >= 0) out.profiles.splice(numeric10Index + 1, 0, numeric14);
            else out.profiles.push(numeric14);
        }

        if (!isPlainObject(out.test)) out.test = deepClone(DEFAULTS.test);
        return out;
    }

    function normalizeProfile(profile) {
        const p = Object.assign({
            id: "profile-" + Math.random().toString(36).slice(2, 9),
            enabled: true,
            preset: "numeric",
            nameFr: "Nouveau profil",
            nameEn: "New profile",
            action: "clear",
            indexMode: "any",
            indexValues: "",
            aimIdentifiers: "",
            minLength: 1,
            maxLength: 128,
            prefix: "",
            suffix: "",
            allowSeparators: false,
            validateChecksum: false,
            caseSensitive: false,
            regex: ""
        }, profile || {});

        if (["any", "numeric", "alphanumeric", "prefix-digits", "ean8", "ean13", "upca", "isbn10", "isbn13", "issn", "custom-regex"].indexOf(p.preset) === -1) {
            p.preset = "numeric";
        }
        if (["clear", "keep"].indexOf(p.action) === -1) p.action = "clear";
        if (["any", "include", "exclude"].indexOf(p.indexMode) === -1) p.indexMode = "any";
        p.minLength = Math.max(0, Number(p.minLength) || 0);
        p.maxLength = Math.max(p.minLength || 0, Number(p.maxLength) || 128);
        return p;
    }

    function splitRules(value) {
        return String(value || "")
            .split(/[;\n]+/)
            .map(function (item) { return item.trim(); })
            .filter(Boolean);
    }

    function detectAimIdentifier(raw) {
        const value = String(raw || "");
        if (value.length >= 3 && value.charAt(0) === "]" && /^[A-Za-z0-9]{2}$/.test(value.slice(1, 3))) {
            return value.slice(0, 3);
        }
        return "";
    }

    function aimMatches(ruleValue, actualIdentifier) {
        const rules = splitRules(ruleValue);
        if (!rules.length) return true;
        if (!actualIdentifier) return false;
        return rules.some(function (rule) {
            if (rule.endsWith("*")) return actualIdentifier.indexOf(rule.slice(0, -1)) === 0;
            return actualIdentifier === rule;
        });
    }

    function indexMatches(profile, index) {
        const mode = profile.indexMode || "any";
        if (mode === "any") return true;
        const rules = splitRules(profile.indexValues);
        const found = rules.indexOf(String(index || "")) !== -1;
        return mode === "include" ? found : !found;
    }

    function removeAllowedSeparators(value) {
        return String(value || "").replace(/[\s\u00A0\-._]/g, "");
    }

    function compareText(value, expected, caseSensitive, fromEnd) {
        if (!expected) return true;
        let a = String(value || "");
        let b = String(expected || "");
        if (!caseSensitive) {
            a = a.toUpperCase();
            b = b.toUpperCase();
        }
        return fromEnd ? a.endsWith(b) : a.startsWith(b);
    }

    function stripPrefixSuffix(value, profile) {
        let text = String(value || "");
        const prefix = String(profile.prefix || "");
        const suffix = String(profile.suffix || "");
        const caseSensitive = profile.caseSensitive === true;

        if (prefix) {
            if (!compareText(text, prefix, caseSensitive, false)) return null;
            text = text.slice(prefix.length);
        }
        if (suffix) {
            if (!compareText(text, suffix, caseSensitive, true)) return null;
            text = text.slice(0, Math.max(0, text.length - suffix.length));
        }
        return text;
    }

    function validMod10Ean(digits) {
        if (!/^\d+$/.test(digits) || digits.length < 2) return false;
        const body = digits.slice(0, -1);
        const expected = Number(digits.slice(-1));
        let sum = 0;
        for (let i = 0; i < body.length; i += 1) {
            const digit = Number(body.charAt(body.length - 1 - i));
            sum += digit * (i % 2 === 0 ? 3 : 1);
        }
        const check = (10 - (sum % 10)) % 10;
        return check === expected;
    }

    function validIsbn10(value) {
        const compact = removeAllowedSeparators(value).toUpperCase();
        if (!/^\d{9}[\dX]$/.test(compact)) return false;
        let sum = 0;
        for (let i = 0; i < 10; i += 1) {
            const char = compact.charAt(i);
            const digit = char === "X" ? 10 : Number(char);
            sum += digit * (10 - i);
        }
        return sum % 11 === 0;
    }

    function validIssn(value) {
        const compact = removeAllowedSeparators(value).toUpperCase();
        if (!/^\d{7}[\dX]$/.test(compact)) return false;
        let sum = 0;
        for (let i = 0; i < 8; i += 1) {
            const char = compact.charAt(i);
            const digit = char === "X" ? 10 : Number(char);
            sum += digit * (8 - i);
        }
        return sum % 11 === 0;
    }

    function standardValue(rawValue, profile) {
        let value = String(rawValue || "");
        if (profile.allowSeparators === true || ["isbn10", "isbn13", "issn"].indexOf(profile.preset) !== -1) {
            value = removeAllowedSeparators(value);
        }
        return value;
    }

    function lengthMatches(value, profile) {
        const len = String(value || "").length;
        return len >= Number(profile.minLength || 0) && len <= Number(profile.maxLength || 128);
    }

    function matchPreset(value, profile) {
        const preset = profile.preset;
        const caseSensitive = profile.caseSensitive === true;
        const stripped = stripPrefixSuffix(value, profile);
        if (stripped === null) return false;

        if (!lengthMatches(value, profile)) return false;

        if (preset === "any") {
            return stripped.length > 0;
        }

        if (preset === "numeric") {
            return /^\d+$/.test(stripped);
        }

        if (preset === "alphanumeric") {
            return /^[A-Za-z0-9]+$/.test(stripped);
        }

        if (preset === "prefix-digits") {
            if (!String(profile.prefix || "")) return false;
            return /^\d+$/.test(stripped);
        }

        if (preset === "custom-regex") {
            const source = String(profile.regex || "");
            if (!source) return false;
            try {
                return new RegExp(source, caseSensitive ? "" : "i").test(value);
            } catch (_) {
                return false;
            }
        }

        const compact = standardValue(value, profile).toUpperCase();

        if (preset === "ean8") {
            return /^\d{8}$/.test(compact) &&
                (profile.validateChecksum === false || validMod10Ean(compact));
        }

        if (preset === "ean13") {
            return /^\d{13}$/.test(compact) &&
                (profile.validateChecksum === false || validMod10Ean(compact));
        }

        if (preset === "upca") {
            return /^\d{12}$/.test(compact) &&
                (profile.validateChecksum === false || validMod10Ean(compact));
        }

        if (preset === "isbn13") {
            return /^97[89]\d{10}$/.test(compact) &&
                (profile.validateChecksum === false || validMod10Ean(compact));
        }

        if (preset === "isbn10") {
            return /^\d{9}[\dX]$/.test(compact) &&
                (profile.validateChecksum === false || validIsbn10(compact));
        }

        if (preset === "issn") {
            return /^\d{7}[\dX]$/.test(compact) &&
                (profile.validateChecksum === false || validIssn(compact));
        }

        return false;
    }

    function evaluateValue(value, index, explicitAimIdentifier, config) {
        const cfg = normalizeConfig(config || currentConfig);
        let raw = value == null ? "" : String(value);
        if (cfg.scanner.trimOuterSpaces !== false) raw = raw.trim();
        if (!raw) return { matched: false, value: raw, index: String(index || ""), aimIdentifier: "" };

        const detectedAim = cfg.scanner.detectAimIdentifier !== false ? detectAimIdentifier(raw) : "";
        const aimIdentifier = String(explicitAimIdentifier || detectedAim || "");
        let valueForMatch = raw;

        if (cfg.scanner.stripAimIdentifierBeforeMatch !== false && detectedAim) {
            valueForMatch = raw.slice(detectedAim.length);
        }

        /*
         * Priorité réseau Dracénie :
         * les codes-barres exemplaires internes suivent le format 0000 + 6 chiffres.
         * Cette signature est suffisamment spécifique pour être reconnue avant
         * ISBN/EAN et indépendamment de l'index Koha mémorisé.
         *
         * Exemples :
         *   0000544086
         *   0000549383
         *   0000641894
         *
         * On s'appuie toujours sur le profil "numeric-10" afin de respecter son
         * activation et son action configurée dans PMK, mais on ignore volontairement
         * son filtre d'index pour cette signature réseau : un ancien index "nb"
         * conservé dans localStorage ne doit pas empêcher l'effacement du code-barres.
         */
        const normalizedIndex = String(index || "").trim().toLowerCase();

        /*
         * Formats exemplaires observés sur le réseau :
         * - 0000 + 6 chiffres : ex. 0000596498
         * - 14 chiffres       : ex. 00458000045377 / 08302000049884
         * - DR + chiffres     : ex. DR100002740
         *
         * Ces signatures sont prioritaires sur les formats bibliographiques.
         */
        let priorityProfileId = "";
        if (/^0000\d{6}$/.test(valueForMatch)) priorityProfileId = "numeric-10";
        else if (/^\d{14}$/.test(valueForMatch)) priorityProfileId = "numeric-14";
        else if (/^DR\d{9,}$/i.test(valueForMatch)) priorityProfileId = "dr-prefix";

        if (priorityProfileId) {
            for (let i = 0; i < cfg.profiles.length; i += 1) {
                const profile = normalizeProfile(cfg.profiles[i]);
                if (profile.id !== priorityProfileId) continue;
                if (profile.enabled === false) continue;
                if (!aimMatches(profile.aimIdentifiers, aimIdentifier)) continue;
                if (!matchPreset(valueForMatch, profile)) continue;

                return {
                    matched: true,
                    profile: deepClone(profile),
                    profileIndex: i,
                    action: profile.action,
                    value: raw,
                    normalizedValue: valueForMatch,
                    index: String(index || ""),
                    aimIdentifier: aimIdentifier
                };
            }
        }

        /*
         * Pour les autres valeurs numériques de 10 chiffres, conserver l'arbitrage
         * précédent : priorité au profil exemplaire sauf lorsqu'une recherche ISBN
         * est explicitement portée par l'index Koha "nb".
         */
        if (normalizedIndex !== "nb" && /^\d{10}$/.test(valueForMatch)) {
            for (let i = 0; i < cfg.profiles.length; i += 1) {
                const profile = normalizeProfile(cfg.profiles[i]);
                if (profile.id !== "numeric-10") continue;
                if (profile.enabled === false) continue;
                if (!indexMatches(profile, index)) continue;
                if (!aimMatches(profile.aimIdentifiers, aimIdentifier)) continue;
                if (!matchPreset(valueForMatch, profile)) continue;

                return {
                    matched: true,
                    profile: deepClone(profile),
                    profileIndex: i,
                    action: profile.action,
                    value: raw,
                    normalizedValue: valueForMatch,
                    index: String(index || ""),
                    aimIdentifier: aimIdentifier
                };
            }
        }

        for (let i = 0; i < cfg.profiles.length; i += 1) {
            const profile = normalizeProfile(cfg.profiles[i]);
            if (profile.enabled === false) continue;

            // Une recherche explicitement lancée sur l'index ISBN ne doit jamais
            // être captée par le profil exemplaire numérique 10 chiffres.
            if (profile.id === "numeric-10" && normalizedIndex === "nb") continue;

            if (!indexMatches(profile, index)) continue;
            if (!aimMatches(profile.aimIdentifiers, aimIdentifier)) continue;
            if (!matchPreset(valueForMatch, profile)) continue;

            return {
                matched: true,
                profile: deepClone(profile),
                profileIndex: i,
                action: profile.action,
                value: raw,
                normalizedValue: valueForMatch,
                index: String(index || ""),
                aimIdentifier: aimIdentifier
            };
        }

        return {
            matched: false,
            value: raw,
            normalizedValue: valueForMatch,
            index: String(index || ""),
            aimIdentifier: aimIdentifier
        };
    }

    function profileLabel(profile, lang) {
        if (!profile) return "";
        const preferred = lang === "en" ? profile.nameEn : profile.nameFr;
        return String(preferred || profile.nameFr || profile.nameEn || profile.id || "").trim();
    }

    function resultText(result, lang) {
        if (!result || !result.matched) {
            return lang === "en"
                ? "No active profile recognized this value."
                : "Aucun profil actif ne reconnaît cette valeur.";
        }
        const action = result.action === "clear"
            ? (lang === "en" ? "clear the visible search bar" : "vider la barre visible")
            : (lang === "en" ? "keep the visible search" : "conserver la recherche visible");
        const aim = result.aimIdentifier ? " · AIM " + result.aimIdentifier : "";
        const index = result.index ? " · index " + result.index : "";
        return (lang === "en" ? "Recognized: " : "Reconnu : ") +
            profileLabel(result.profile, lang) +
            " · " + action + index + aim;
    }

    function safeStorageGet(key) {
        try {
            return window.localStorage ? window.localStorage.getItem(key) : null;
        } catch (_) {
            return null;
        }
    }

    function getStoredContext() {
        return {
            value: safeStorageGet("searchbox_value") || "",
            index: safeStorageGet("cat_search_pulldown_selection") || "",
            source: "localStorage"
        };
    }

    function getUrlSearchContext() {
        try {
            const params = new URLSearchParams(window.location.search || "");
            const value = params.get("q") || params.get("q_0") || "";
            const index = params.get("idx") || params.get("idx_0") || "";
            return {
                value: String(value || ""),
                index: String(index || ""),
                source: "url"
            };
        } catch (_) {
            return { value: "", index: "", source: "url" };
        }
    }

    function getSearchContext() {
        const stored = getStoredContext();
        if (String(stored.value || "").trim()) return stored;

        const fromUrl = getUrlSearchContext();
        if (String(fromUrl.value || "").trim()) return fromUrl;

        return stored;
    }

    function findSearchInput() {
        try {
            return document.querySelector(currentConfig.scope.targetSelector || TARGET_SELECTOR);
        } catch (_) {
            return document.querySelector(TARGET_SELECTOR);
        }
    }

    function fieldValueMatchesStored(input, storedValue) {
        if (!input || typeof input.value !== "string") return true;
        const current = input.value.trim();
        if (!current) return true;
        const stored = String(storedValue || "").trim();
        if (!stored) return false;
        if (current === stored) return true;

        const currentAim = detectAimIdentifier(current);
        const storedAim = detectAimIdentifier(stored);
        const currentBare = currentAim ? current.slice(currentAim.length) : current;
        const storedBare = storedAim ? stored.slice(storedAim.length) : stored;
        return currentBare === storedBare;
    }

    function interfaceLanguage() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            try {
                const value = String(window.PMKConfig.getLanguage() || "").toLowerCase();
                if (value.indexOf("en") === 0) return "en";
                if (value.indexOf("fr") === 0) return "fr";
            } catch (_) {}
        }
        const htmlLang = String(document.documentElement && document.documentElement.lang || "").toLowerCase();
        return htmlLang.indexOf("en") === 0 ? "en" : "fr";
    }

    function clearButtonLabel() {
        const cfg = currentConfig && currentConfig.clearButton || {};
        const fr = String(cfg.labelFr || DEFAULTS.clearButton.labelFr || "Effacer la recherche").trim();
        const en = String(cfg.labelEn || DEFAULTS.clearButton.labelEn || "Clear search").trim();
        return interfaceLanguage() === "en" ? (en || fr) : (fr || en);
    }

    function injectClearButtonStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
#cat-search-block .pmk036-clear-search {
    align-items: center;
    align-self: stretch;
    background: transparent;
    border: 0;
    border-left: 1px solid var(--bs-border-color, #e0e0e0);
    box-shadow: none;
    color: inherit;
    cursor: pointer;
    display: inline-flex;
    flex: 0 0 31px;
    height: 31px;
    justify-content: center;
    margin: 0;
    min-width: 31px;
    opacity: .42;
    padding: 0;
    position: relative;
    text-shadow: none;
    transition: opacity .12s ease, background-color .12s ease;
}
#cat-search-block .pmk036-clear-search:hover,
#cat-search-block .pmk036-clear-search:focus {
    background: rgba(0, 0, 0, .035);
    opacity: .9;
}
#cat-search-block .pmk036-clear-search:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: -4px;
}
#cat-search-block .pmk036-clear-search i {
    font-size: .82rem;
    line-height: 1;
    margin: 0;
    pointer-events: none;
}
#cat-search-block .pmk036-clear-search[hidden] {
    display: none !important;
}
@media (prefers-reduced-motion: reduce) {
    #cat-search-block .pmk036-clear-search {
        transition: none;
    }
}
`;
        (document.head || document.documentElement).appendChild(style);
    }

    function clearButtonVisible(input) {
        return Boolean(input && typeof input.value === "string" && input.value.trim() !== "");
    }

    function syncClearButton(input, button) {
        if (!input || !button || !button.isConnected) return;
        const label = clearButtonLabel();
        button.hidden = !clearButtonVisible(input);
        button.setAttribute("aria-label", label);
        button.setAttribute("title", label);
    }

    function cancelClearButtonSyncTimers() {
        clearButtonSyncTimers.forEach(function (id) {
            try { window.clearTimeout(id); } catch (_) {}
        });
        clearButtonSyncTimers = [];
    }

    function cancelBehaviorRetryTimers() {
        behaviorRetryTimers.forEach(function (id) {
            try { window.clearTimeout(id); } catch (_) {}
        });
        behaviorRetryTimers = [];
    }

    function removeClearButtons() {
        cancelClearButtonSyncTimers();
        document.querySelectorAll("[" + CLEAR_BUTTON_ATTR + "]").forEach(function (button) {
            try {
                const input = button.__pmk036Input;
                const handler = button.__pmk036SyncHandler;
                if (input && handler) {
                    input.removeEventListener("input", handler);
                    input.removeEventListener("change", handler);
                }
                button.remove();
            } catch (_) {}
        });
    }

    function clearVisibleSearch(input, options) {
        if (!input || typeof input.value !== "string") return false;
        const opts = options && typeof options === "object" ? options : {};

        /*
         * Vider à la fois la valeur courante et la valeur HTML par défaut.
         * Koha (ou un reset du formulaire) ne doit pas pouvoir restaurer
         * immédiatement la valeur affichée après notre nettoyage.
         *
         * Le localStorage Koha searchbox_value n'est PAS modifié : le contexte
         * de la dernière recherche reste donc disponible pour les autres modules.
         */
        input.value = "";
        try { input.defaultValue = ""; } catch (_) {}
        try { input.setAttribute("value", ""); } catch (_) {}

        /*
         * Pour l'effacement automatique après reconnaissance d'un code-barres,
         * ne pas émettre input/change : certains gestionnaires Koha ou scripts
         * tiers peuvent réagir à ces événements et restaurer la dernière valeur.
         * Le bouton manuel conserve le comportement configuré.
         */
        const dispatchEvents = opts.dispatchEvents !== false;

        if (dispatchEvents && currentConfig.behavior.dispatchInputEvent !== false) {
            try { input.dispatchEvent(new Event("input", { bubbles: true })); } catch (_) {}
        }
        if (dispatchEvents && currentConfig.behavior.dispatchChangeEvent === true) {
            try { input.dispatchEvent(new Event("change", { bubbles: true })); } catch (_) {}
        }

        const shouldFocus = opts.focus === true || currentConfig.behavior.focusAfterClear === true;
        if (shouldFocus && typeof input.focus === "function") {
            try { input.focus({ preventScroll: true }); } catch (_) {
                try { input.focus(); } catch (_) {}
            }
        }
        return input.value === "";
    }

    function ensureClearButton(input) {
        const target = input || findSearchInput();
        if (!currentConfig.enabled || !currentConfig.clearButton || currentConfig.clearButton.enabled === false) {
            removeClearButtons();
            return null;
        }
        if (!target) return null;

        let form = null;
        try {
            form = target.closest(currentConfig.scope.formSelector || FORM_SELECTOR);
        } catch (_) {
            form = target.closest(FORM_SELECTOR);
        }
        const container = target.closest(".form-content");
        if (!form || !container || !form.contains(target)) return null;

        injectClearButtonStyle();

        let button = container.querySelector("[" + CLEAR_BUTTON_ATTR + "]");
        if (!button) {
            button = document.createElement("button");
            button.type = "button";
            button.className = "pmk036-clear-search";
            button.setAttribute(CLEAR_BUTTON_ATTR, "1");

            const icon = document.createElement("i");
            icon.className = "fa-solid fa-xmark";
            icon.setAttribute("aria-hidden", "true");
            button.appendChild(icon);

            const sync = function () { syncClearButton(target, button); };
            button.__pmk036Input = target;
            button.__pmk036SyncHandler = sync;

            button.addEventListener("click", function (event) {
                event.preventDefault();
                clearVisibleSearch(target, { focus: true, source: "manual-button" });
                sync();
            });
            target.addEventListener("input", sync);
            target.addEventListener("change", sync);

            target.insertAdjacentElement("afterend", button);
        }

        syncClearButton(target, button);
        cancelClearButtonSyncTimers();
        [0, 120, 500].forEach(function (delay) {
            clearButtonSyncTimers.push(window.setTimeout(function () {
                syncClearButton(target, button);
            }, delay));
        });
        return button;
    }

    function dispatchRecognition(result) {
        if (!result || !result.matched) return;
        try {
            window.dispatchEvent(new CustomEvent("pmk:catalogue-search-recognized", {
                detail: {
                    moduleId: MODULE_ID,
                    profileId: result.profile && result.profile.id,
                    action: result.action,
                    index: result.index,
                    aimIdentifier: result.aimIdentifier
                }
            }));
        } catch (_) {}
    }

    function applyBehavior() {
        if (!currentConfig.enabled) return { applied: false, reason: "disabled" };

        const input = findSearchInput();
        if (!input) return { applied: false, reason: "no-search-input" };

        const context = getSearchContext();
        if (!context.value) return { applied: false, reason: "no-search-context" };

        const result = evaluateValue(context.value, context.index, "", currentConfig);
        if (!result.matched) return { applied: false, reason: "not-recognized", result: result };

        dispatchRecognition(result);

        if (result.action !== currentConfig.behavior.clearOnAction) {
            return { applied: true, cleared: false, result: result };
        }

        if (currentConfig.behavior.onlyIfCurrentEmptyOrMatchesStored !== false &&
            !fieldValueMatchesStored(input, context.value)) {
            return { applied: true, cleared: false, protectedCurrentValue: true, result: result };
        }

        const cleared = clearVisibleSearch(input, {
            dispatchEvents: false,
            source: "automatic-barcode"
        });
        return { applied: true, cleared: cleared, result: result };
    }

    function scheduleBehaviorRetries(input) {
        cancelBehaviorRetryTimers();

        /*
         * Koha peut restaurer la valeur de la barre après DOMContentLoaded.
         * On rejoue donc le comportement pendant une courte fenêtre.
         * fieldValueMatchesStored() protège une éventuelle nouvelle saisie :
         * une valeur différente de la recherche mémorisée ne sera pas effacée.
         */
        [60, 180, 450, 900, 1600].forEach(function (delay) {
            behaviorRetryTimers.push(window.setTimeout(function () {
                const target = input && input.isConnected ? input : findSearchInput();
                if (!target) return;
                applyBehavior();
                ensureClearButton(target);
            }, delay));
        });
    }

    function stopObserver() {
        if (observer) {
            try { observer.disconnect(); } catch (_) {}
            observer = null;
        }
    }

    function ensureRuntime() {
        stopObserver();
        if (!currentConfig.enabled) {
            removeClearButtons();
            return;
        }

        const input = findSearchInput();
        if (input) {
            applyBehavior();
            ensureClearButton(input);
            scheduleBehaviorRetries(input);
            return;
        }

        observer = new MutationObserver(function () {
            const found = findSearchInput();
            if (!found) return;
            applyBehavior();
            ensureClearButton(found);
            scheduleBehaviorRetries(found);
            mountContextAccess();
            stopObserver();
        });
        try {
            observer.observe(document.documentElement, { childList: true, subtree: true });
        } catch (_) {
            stopObserver();
        }
    }

    function mountContextAccess() {
        if (!currentConfig.enabled) return;
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        const input = findSearchInput();
        const anchor = input && (input.closest(".form-content") || input.parentElement);
        if (!anchor) return;
        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "after",
                contextKey: CONTEXT_KEY,
                context: { sectionId: "profiles" }
            });
        } catch (_) {}
    }

    function presetPatch(preset) {
        const common = {
            prefix: "",
            suffix: "",
            regex: "",
            aimIdentifiers: "",
            caseSensitive: false
        };
        const patches = {
            any: Object.assign({}, common, { minLength: 1, maxLength: 128, allowSeparators: false, validateChecksum: false }),
            numeric: Object.assign({}, common, { minLength: 5, maxLength: 40, allowSeparators: false, validateChecksum: false }),
            alphanumeric: Object.assign({}, common, { minLength: 5, maxLength: 64, allowSeparators: false, validateChecksum: false }),
            "prefix-digits": Object.assign({}, common, { minLength: 11, maxLength: 40, prefix: "DR", allowSeparators: false, validateChecksum: false }),
            ean8: Object.assign({}, common, { minLength: 8, maxLength: 8, allowSeparators: false, validateChecksum: true }),
            ean13: Object.assign({}, common, { minLength: 13, maxLength: 13, allowSeparators: false, validateChecksum: true }),
            upca: Object.assign({}, common, { minLength: 12, maxLength: 12, allowSeparators: false, validateChecksum: true }),
            isbn10: Object.assign({}, common, { minLength: 10, maxLength: 13, allowSeparators: true, validateChecksum: true }),
            isbn13: Object.assign({}, common, { minLength: 13, maxLength: 17, allowSeparators: true, validateChecksum: true }),
            issn: Object.assign({}, common, { minLength: 8, maxLength: 9, allowSeparators: true, validateChecksum: true }),
            "custom-regex": Object.assign({}, common, { minLength: 1, maxLength: 128, regex: "^.+$", allowSeparators: false, validateChecksum: false })
        };
        return patches[preset] || patches.numeric;
    }

    function newProfile() {
        return {
            id: "custom-" + Date.now().toString(36),
            enabled: true,
            preset: "numeric",
            nameFr: "Nouveau profil",
            nameEn: "New profile",
            action: "clear",
            indexMode: "any",
            indexValues: "",
            aimIdentifiers: "",
            minLength: 5,
            maxLength: 40,
            prefix: "",
            suffix: "",
            allowSeparators: false,
            validateChecksum: false,
            caseSensitive: false,
            regex: ""
        };
    }

    function updateTestResult(rootObject) {
        if (!rootObject || !rootObject.test) return;
        const lang = window.PMKConfig && typeof window.PMKConfig.getLanguage === "function"
            ? window.PMKConfig.getLanguage()
            : "fr";
        rootObject.test.result = resultText(
            evaluateValue(
                rootObject.test.value,
                rootObject.test.index,
                rootObject.test.aimIdentifier,
                rootObject
            ),
            lang
        );
    }

    function validateConfig(config) {
        const lang = window.PMKConfig && typeof window.PMKConfig.getLanguage === "function"
            ? window.PMKConfig.getLanguage()
            : "fr";
        const fail = function (fr, en) {
            return { ok: false, message: lang === "en" ? en : fr };
        };

        const cfg = normalizeConfig(config);
        if (!Array.isArray(cfg.profiles) || !cfg.profiles.length) {
            return fail("Le 036 doit conserver au moins un profil de reconnaissance.", "Module 036 must keep at least one recognition profile.");
        }

        const ids = new Set();
        for (let i = 0; i < cfg.profiles.length; i += 1) {
            const p = cfg.profiles[i];
            if (!p || p.enabled === false) continue;
            const id = String(p.id || "").trim();
            if (!id) return fail("Un profil actif n'a pas d'identifiant.", "An enabled profile has no identifier.");
            if (ids.has(id)) return fail("Deux profils utilisent le même identifiant : " + id, "Two profiles use the same identifier: " + id);
            ids.add(id);

            if (p.maxLength < p.minLength) {
                return fail("La longueur maximale d'un profil est inférieure à sa longueur minimale.", "A profile maximum length is lower than its minimum length.");
            }

            if (p.preset === "prefix-digits" && !String(p.prefix || "")) {
                return fail("Un profil « préfixe + chiffres » doit définir un préfixe.", "A prefix + digits profile must define a prefix.");
            }

            if (p.preset === "custom-regex") {
                if (!String(p.regex || "")) return fail("Un profil regex actif doit contenir une expression.", "An enabled regex profile must contain an expression.");
                try { new RegExp(p.regex, p.caseSensitive === true ? "" : "i"); } catch (_) {
                    return fail("Expression régulière invalide dans le profil : " + profileLabel(p, "fr"), "Invalid regular expression in profile: " + profileLabel(p, "en"));
                }
            }
        }

        return { ok: true };
    }

    function buildModuleDefinition() {
        const presetOptions = [
            { value: "any", label: { fr: "Toute valeur non vide", en: "Any non-empty value" } },
            { value: "numeric", label: { fr: "Numérique", en: "Numeric" } },
            { value: "alphanumeric", label: { fr: "Alphanumérique", en: "Alphanumeric" } },
            { value: "prefix-digits", label: { fr: "Préfixe + chiffres", en: "Prefix + digits" } },
            { value: "ean8", label: { fr: "EAN-8", en: "EAN-8" } },
            { value: "ean13", label: { fr: "EAN-13", en: "EAN-13" } },
            { value: "upca", label: { fr: "UPC-A", en: "UPC-A" } },
            { value: "isbn10", label: { fr: "ISBN-10", en: "ISBN-10" } },
            { value: "isbn13", label: { fr: "ISBN-13", en: "ISBN-13" } },
            { value: "issn", label: { fr: "ISSN", en: "ISSN" } },
            { value: "custom-regex", label: { fr: "Expression régulière personnalisée", en: "Custom regular expression" } }
        ];

        return {
            id: MODULE_ID,
            schemaVersion: 3,
            name: { fr: "Barre de recherche catalogue", en: "Catalogue search bar" },
            description: {
                fr: "Pilote la barre de recherche catalogue : reconnaissance des codes-barres, nettoyage automatique sécurisé et bouton d'effacement manuel intégré. La dernière recherche Koha reste conservée pour les autres modules.",
                en: "Controls the catalogue search bar: barcode recognition, safe automatic clearing and an integrated manual clear button. Koha's last-search context remains available to other modules."
            },
            category: { fr: "Catalogue / recherche", en: "Catalogue / search" },
            supportedPages: ["Toutes les pages contenant #cat-search-block #search-form"],
            prerequisites: [],
            dependencies: [],
            defaults: deepClone(DEFAULTS),
            validate: validateConfig,
            schema: [
                {
                    type: "section",
                    id: "activation",
                    label: { fr: "Activation et portée", en: "Activation and scope" },
                    description: {
                        fr: "Le module ne touche qu'à la barre « Recherche catalogue ». Les champs de prêt, retour, lecteur, renouvellement et Z39.50 ne sont pas concernés.",
                        en: "The module only targets the Catalogue search bar. Checkout, check-in, patron, renewal and Z39.50 fields are not affected."
                    },
                    fields: [
                        { key: "enabled", type: "boolean", label: { fr: "Activer le module", en: "Enable module" } },
                        { key: "scope.targetSelector", type: "text", advanced: true, label: { fr: "Cible de la barre catalogue", en: "Catalogue search target" } },
                        { key: "scope.formSelector", type: "text", advanced: true, label: { fr: "Formulaire catalogue", en: "Catalogue form" } }
                    ]
                },
                {
                    type: "section",
                    id: "profiles",
                    label: { fr: "Profils de codes-barres", en: "Barcode profiles" },
                    description: {
                        fr: "Les profils sont testés de haut en bas. Le premier profil correspondant décide de l'action. Réordonnez-les pour gérer les formats qui se chevauchent.",
                        en: "Profiles are tested from top to bottom. The first matching profile decides the action. Reorder them to handle overlapping formats."
                    },
                    fields: [
                        {
                            key: "profiles",
                            type: "repeater",
                            label: { fr: "Profils actifs et disponibles", en: "Active and available profiles" },
                            addLabel: { fr: "Ajouter un type de code-barres", en: "Add barcode type" },
                            reorder: true,
                            newItem: newProfile,
                            itemTitle: function (item, index, lang) {
                                return profileLabel(item, lang) || "Profil " + (index + 1);
                            },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Profil actif", en: "Profile enabled" } },
                                { key: "nameFr", type: "text", label: { fr: "Nom français", en: "French name" } },
                                { key: "nameEn", type: "text", label: { fr: "Nom anglais", en: "English name" } },
                                {
                                    key: "action",
                                    type: "select",
                                    label: { fr: "Après reconnaissance", en: "After recognition" },
                                    options: [
                                        { value: "clear", label: { fr: "Vider la barre visible", en: "Clear the visible search bar" } },
                                        { value: "keep", label: { fr: "Conserver la recherche visible", en: "Keep the visible search" } }
                                    ]
                                },
                                {
                                    key: "preset",
                                    type: "select",
                                    refreshOnChange: true,
                                    label: { fr: "Type de reconnaissance", en: "Recognition type" },
                                    options: presetOptions,
                                    onChange: function (rootObject, fieldPath, value) {
                                        const index = fieldPath[fieldPath.length - 2];
                                        if (!Array.isArray(rootObject.profiles) || !rootObject.profiles[index]) return;
                                        Object.assign(rootObject.profiles[index], presetPatch(value));
                                    }
                                },
                                { key: "minLength", type: "number", label: { fr: "Longueur minimale", en: "Minimum length" } },
                                { key: "maxLength", type: "number", label: { fr: "Longueur maximale", en: "Maximum length" } },
                                { key: "prefix", type: "text", label: { fr: "Préfixe requis", en: "Required prefix" } },
                                { key: "suffix", type: "text", label: { fr: "Suffixe requis", en: "Required suffix" } },
                                { key: "allowSeparators", type: "boolean", label: { fr: "Tolérer espaces / tirets / points dans les standards", en: "Allow spaces / hyphens / dots in standards" } },
                                { key: "validateChecksum", type: "boolean", label: { fr: "Vérifier la clé de contrôle quand le standard le permet", en: "Validate check digit when supported" } },
                                { key: "caseSensitive", type: "boolean", advanced: true, label: { fr: "Respecter la casse", en: "Case sensitive" } },
                                {
                                    key: "indexMode",
                                    type: "select",
                                    advanced: true,
                                    label: { fr: "Filtre sur l'index Koha", en: "Koha index filter" },
                                    options: [
                                        { value: "any", label: { fr: "Tous les index", en: "Any index" } },
                                        { value: "include", label: { fr: "Seulement les index indiqués", en: "Only listed indexes" } },
                                        { value: "exclude", label: { fr: "Tous sauf les index indiqués", en: "All except listed indexes" } }
                                    ]
                                },
                                {
                                    key: "indexValues",
                                    type: "text",
                                    advanced: true,
                                    label: { fr: "Index Koha techniques", en: "Technical Koha indexes" },
                                    help: {
                                        fr: "Séparer plusieurs valeurs par « ; ». Exemples Koha : bc = code-barres, nb = ISBN, ns = ISSN. Les valeurs comme kw,phr restent possibles.",
                                        en: "Separate multiple values with ';'. Koha examples: bc = barcode, nb = ISBN, ns = ISSN. Values such as kw,phr are supported."
                                    }
                                },
                                {
                                    key: "aimIdentifiers",
                                    type: "text",
                                    advanced: true,
                                    label: { fr: "Identifiants AIM du scanner", en: "Scanner AIM identifiers" },
                                    help: {
                                        fr: "Optionnel. Séparer par « ; ». Le joker final * est accepté, ex. ]C* pour une famille AIM. Nécessite un scanner configuré pour transmettre cet identifiant.",
                                        en: "Optional. Separate with ';'. A trailing * wildcard is supported, e.g. ]C* for an AIM family. Requires a scanner configured to transmit the identifier."
                                    }
                                },
                                {
                                    key: "regex",
                                    type: "text",
                                    advanced: true,
                                    label: { fr: "Expression régulière personnalisée", en: "Custom regular expression" },
                                    help: {
                                        fr: "Utilisée uniquement avec le type « Expression régulière personnalisée ». Exemple : ^ABC\\d{8}$",
                                        en: "Used only with the Custom regular expression type. Example: ^ABC\\d{8}$"
                                    }
                                },
                                { key: "id", type: "text", advanced: true, label: { fr: "Identifiant interne", en: "Internal identifier" } }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "scanner",
                    label: { fr: "Scanner et lecture", en: "Scanner and input" },
                    fields: [
                        { key: "scanner.trimOuterSpaces", type: "boolean", label: { fr: "Ignorer les espaces au début et à la fin", en: "Ignore leading/trailing spaces" } },
                        { key: "scanner.detectAimIdentifier", type: "boolean", label: { fr: "Détecter les identifiants de symbologie AIM", en: "Detect AIM symbology identifiers" } },
                        { key: "scanner.stripAimIdentifierBeforeMatch", type: "boolean", label: { fr: "Retirer l'identifiant AIM avant de tester la valeur", en: "Strip AIM identifier before matching the value" } }
                    ]
                },
                {
                    type: "section",
                    id: "clear-button",
                    label: { fr: "Bouton d'effacement manuel", en: "Manual clear button" },
                    description: {
                        fr: "Fonction issue de l'ancien 053. Une icône discrète apparaît dans la barre uniquement lorsqu'elle contient du texte. Le clic vide la barre visible, conserve searchbox_value et remet immédiatement le focus dans le champ.",
                        en: "Function inherited from former module 053. A discreet icon appears inside the bar only when it contains text. Clicking clears the visible field, preserves searchbox_value and immediately restores focus to the input."
                    },
                    fields: [
                        { key: "clearButton.enabled", type: "boolean", label: { fr: "Afficher le bouton d'effacement", en: "Show the clear button" } },
                        { key: "clearButton.labelFr", type: "text", advanced: true, label: { fr: "Info-bulle / libellé accessible FR", en: "French tooltip / accessible label" } },
                        { key: "clearButton.labelEn", type: "text", advanced: true, label: { fr: "Info-bulle / libellé accessible EN", en: "English tooltip / accessible label" } }
                    ]
                },
                {
                    type: "section",
                    id: "behavior",
                    label: { fr: "Comportement après reconnaissance", en: "Behavior after recognition" },
                    description: {
                        fr: "Le contexte Koha searchbox_value est toujours conservé : seul l'affichage de la barre est éventuellement vidé. Cela protège les modules qui utilisent la dernière recherche.",
                        en: "Koha's searchbox_value context is always preserved: only the visible search bar may be cleared. This protects modules that use the last search."
                    },
                    fields: [
                        { key: "behavior.onlyIfCurrentEmptyOrMatchesStored", type: "boolean", label: { fr: "Ne jamais effacer une nouvelle saisie différente", en: "Never clear a different new value" } },
                        { key: "behavior.dispatchInputEvent", type: "boolean", advanced: true, label: { fr: "Émettre l'événement input après effacement", en: "Dispatch input event after clearing" } },
                        { key: "behavior.dispatchChangeEvent", type: "boolean", advanced: true, label: { fr: "Émettre aussi l'événement change", en: "Also dispatch change event" } },
                        { key: "behavior.focusAfterClear", type: "boolean", label: { fr: "Remettre le focus dans la barre après effacement", en: "Focus the search bar after clearing" } }
                    ]
                },
                {
                    type: "section",
                    id: "test",
                    label: { fr: "Tester un code", en: "Test a code" },
                    description: {
                        fr: "Saisissez ou scannez une valeur. Le test utilise les profils dans leur ordre actuel et n'effectue aucune recherche Koha.",
                        en: "Enter or scan a value. The test uses profiles in their current order and does not run a Koha search."
                    },
                    fields: [
                        {
                            key: "test.value",
                            type: "text",
                            refreshOnChange: true,
                            label: { fr: "Valeur à tester", en: "Value to test" },
                            onChange: function (rootObject) { updateTestResult(rootObject); }
                        },
                        {
                            key: "test.index",
                            type: "text",
                            refreshOnChange: true,
                            label: { fr: "Index Koha simulé", en: "Simulated Koha index" },
                            help: { fr: "Exemples : bc, nb, ns, kw.", en: "Examples: bc, nb, ns, kw." },
                            onChange: function (rootObject) { updateTestResult(rootObject); }
                        },
                        {
                            key: "test.aimIdentifier",
                            type: "text",
                            refreshOnChange: true,
                            label: { fr: "Identifiant AIM simulé", en: "Simulated AIM identifier" },
                            help: { fr: "Laisser vide si le scanner n'envoie pas d'identifiant AIM.", en: "Leave blank if the scanner does not send an AIM identifier." },
                            onChange: function (rootObject) { updateTestResult(rootObject); }
                        },
                        {
                            key: "test.result",
                            type: "text",
                            readOnly: true,
                            label: { fr: "Résultat", en: "Result" }
                        }
                    ]
                }
            ],
            focusContext: function (main, context) {
                if (!main) return;
                const wanted = context && context.sectionId ? context.sectionId : "profiles";
                const section = main.querySelector('[data-pmk-section-id="' + wanted + '"]') ||
                    main.querySelector('[data-pmk-section-id="profiles"]');
                if (!section) return;
                window.setTimeout(function () {
                    section.scrollIntoView({ block: "start", behavior: "smooth" });
                }, 0);
            }
        };
    }

    function registerModule() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return;
        try { window.PMKConfig.registerModule(buildModuleDefinition()); } catch (_) {}
    }

    function loadConfig() {
        registerModule();
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") {
            return Promise.resolve(deepClone(DEFAULTS));
        }
        return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
            .then(function (cfg) { return normalizeConfig(cfg); })
            .catch(function () { return deepClone(DEFAULTS); });
    }

    function applyConfig(config) {
        currentConfig = normalizeConfig(config);
        if (currentConfig.test) updateTestResult(currentConfig);
        ensureRuntime();
        mountContextAccess();
    }

    function refresh() {
        return loadConfig().then(applyConfig);
    }

    function start() {
        registerModule();
        refresh();
        if (window.PMKConfig && typeof window.PMKConfig.subscribe === "function") {
            try { window.PMKConfig.subscribe(MODULE_ID, applyConfig); } catch (_) {}
        }
    }

    window.PMK036CatalogueSearch = {
        version: MODULE_VERSION,
        moduleId: MODULE_ID,
        defaults: deepClone(DEFAULTS),
        refresh: refresh,
        evaluateValue: function (value, index, aimIdentifier, config) {
            return evaluateValue(value, index, aimIdentifier, config || currentConfig);
        },
        testValue: function (value, index, aimIdentifier, config) {
            const result = evaluateValue(value, index, aimIdentifier, config || currentConfig);
            return Object.assign({}, result, {
                textFr: resultText(result, "fr"),
                textEn: resultText(result, "en")
            });
        },
        applyBehavior: applyBehavior,
        debug: function () {
            const input = findSearchInput();
            const stored = getStoredContext();
            const urlContext = getUrlSearchContext();
            const chosen = getSearchContext();
            return {
                inputFound: Boolean(input),
                inputValue: input && typeof input.value === "string" ? input.value : null,
                inputDefaultValue: input && typeof input.defaultValue === "string" ? input.defaultValue : null,
                inputValueAttribute: input ? input.getAttribute("value") : null,
                currentMatchesChosen: input ? fieldValueMatchesStored(input, chosen.value) : null,
                storedContext: stored,
                urlContext: urlContext,
                chosenContext: chosen,
                evaluation: chosen.value ? evaluateValue(chosen.value, chosen.index, "", currentConfig) : null
            };
        },
        getConfig: function () { return deepClone(currentConfig); },
        destroy: function () {
            stopObserver();
            cancelBehaviorRetryTimers();
            removeClearButtons();
            const style = document.getElementById(STYLE_ID);
            if (style) style.remove();
        }
    };

    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", start, { once: true });
        } else {
            start();
        }
    }
})();

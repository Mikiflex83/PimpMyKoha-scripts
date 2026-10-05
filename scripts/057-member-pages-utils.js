/*
 Nom du fichier : 057-member-pages-utils.js
 Module PMK      : Automatismes de saisie adhérent
 ID PMK          : patron-page-utils
 Version         : 4.0.1-pmk-isolated
 Date            : 2026-09-19
 Auteur          : Michael Mundet / refactorisation PimpMyKoha

 Objectif :
 - conserver STRICTEMENT tous les usages historiques du script 057 ;
 - séparer clairement les automatismes par fonction ;
 - rendre chaque fonction activable et paramétrable ;
 - rester centré sur la page Koha memberentry.pl ;
 - fonctionner avec ou sans le socle PMK (les valeurs historiques sont alors utilisées).

 Référence historique vérifiée (capture réseau HTTP 200 du 09/09/2026) :
 1. Civilité :
      M   -> 2e radio name="sex"
      Mme -> 1er radio name="sex"
      autre -> 3e radio name="sex"
    Déclenchement historique : blur de #btitle.
 2. Téléphone :
      #phone -> #SMSnumber
      validation /^(\+[0-9]{2}|0)[6-7][0-9]{8}$/
      conversion locale vers +33
      traitement sur input + change et au chargement.
 3. Préférences :
      #sms4 et #email4 cochés.
 4. Mot de passe :
      les 4 derniers caractères de #cardnumber alimentent
      #password et #password2 à chaque keyup, dès 4 caractères.
 5. Attribut adhérent :
      #patron_attr_6.selectedIndex = 1.
 6. Identifiant :
      si #othernames existe, #userid = prenom.nom
      en minuscules, sans accents, espaces, tirets, apostrophes ni parenthèses,
      à chaque input sur #firstname / #surname.

 IMPORTANT :
 Les valeurs par défaut ci-dessous reproduisent ces six comportements.
 Les options supplémentaires sont des extensions ; elles ne retirent aucun usage historique.
*/

(function () {
    "use strict";

    const MODULE_ID = "patron-page-utils";
    const MODULE_VERSION = "4.0.1-pmk-isolated";
    const SCRIPT_GUARD = "__pmk057PatronPageUtilsV4";
    const MEMBERENTRY_PATH = "/cgi-bin/koha/members/memberentry.pl";
    const HINT_ATTR = "data-pmk057-hint";
    const CONTEXT_KEY = "patron-page-utils-memberentry";

    if (window[SCRIPT_GUARD]) return;
    window[SCRIPT_GUARD] = true;

    const DEFAULT_CONFIG = {
        enabled: true,

        titleSexEnabled: true,
        titleSexScope: "both",
        titleSelector: "#btitle",
        sexSelector: 'input[type="radio"][name="sex"]',
        titleSexTrigger: "blur",
        titleSexMappings: [
            {
                id: "legacy-mme",
                enabled: true,
                sourceValue: "Mme",
                targetMode: "index",
                targetIndex: 0,
                targetValue: ""
            },
            {
                id: "legacy-m",
                enabled: true,
                sourceValue: "M",
                targetMode: "index",
                targetIndex: 1,
                targetValue: ""
            }
        ],
        titleSexFallbackEnabled: true,
        titleSexFallbackMode: "index",
        titleSexFallbackIndex: 2,
        titleSexFallbackValue: "",

        phoneSmsEnabled: true,
        phoneSmsScope: "both",
        phoneSourceSelector: "#phone",
        smsTargetSelector: "#SMSnumber",
        phoneSmsPattern: "^(\\+[0-9]{2}|0)[6-7][0-9]{8}$",
        phoneSmsFlags: "",
        phoneSmsLocalPrefix: "0",
        phoneSmsInternationalPrefix: "+33",
        phoneSmsNormalizeLocal: true,
        phoneSmsCopySourceToTarget: true,
        phoneSmsOverwrite: "always",
        phoneSmsProcessOnLoad: true,
        phoneSmsListenInput: true,
        phoneSmsListenChange: true,
        smsNormalizeOwnValue: true,
        smsListenInput: true,
        smsListenChange: true,
        phoneSmsShowHints: true,
        phoneSmsCopiedTextFr: "Copié dans numéro SMS",
        phoneSmsCopiedTextEn: "Copied to SMS number",
        phoneSmsFormattedTextFr: "Formaté avec +33",
        phoneSmsFormattedTextEn: "Formatted with +33",
        phoneSmsInvalidTextFr: "Format de numéro invalide",
        phoneSmsInvalidTextEn: "Invalid phone number format",

        messagePrefsEnabled: true,
        messagePrefsScope: "both",
        messagePrefs: [
            {
                id: "legacy-sms4",
                enabled: true,
                name: "SMS 4",
                selector: "#sms4",
                checked: true,
                triggerChange: false
            },
            {
                id: "legacy-email4",
                enabled: true,
                name: "Email 4",
                selector: "#email4",
                checked: true,
                triggerChange: false
            }
        ],

        passwordEnabled: true,
        passwordScope: "both",
        passwordSourceSelector: "#cardnumber",
        passwordTrigger: "keyup",
        passwordMinSourceLength: 4,
        passwordExtractMode: "last",
        passwordExtractLength: 4,
        passwordExtractOffset: 0,
        passwordRegex: "",
        passwordRegexGroup: 0,
        passwordOverwrite: "always",
        passwordClearWhenTooShort: false,
        passwordTargets: [
            {
                id: "legacy-password",
                enabled: true,
                name: "Mot de passe",
                selector: "#password"
            },
            {
                id: "legacy-password2",
                enabled: true,
                name: "Confirmation du mot de passe",
                selector: "#password2"
            }
        ],

        attributeDefaultsEnabled: true,
        attributeDefaultsScope: "both",
        attributeDefaults: [
            {
                id: "legacy-patron-attr-6",
                enabled: true,
                name: "Attribut adhérent 6",
                selector: "#patron_attr_6",
                valueMode: "selected-index",
                selectedIndex: 1,
                value: "",
                checked: true,
                overwrite: "always",
                triggerChange: false
            }
        ],

        useridEnabled: true,
        useridScope: "both",
        useridFirstnameSelector: "#firstname",
        useridSurnameSelector: "#surname",
        useridTargetSelector: "#userid",
        useridRequiredPresenceSelector: "#othernames",
        useridTemplate: "{firstname}.{surname}",
        useridLowercase: true,
        useridStripDiacritics: true,
        useridRemoveSpaces: true,
        useridRemoveHyphens: true,
        useridRemoveApostrophes: true,
        useridRemoveParentheses: true,
        useridAdditionalRemoveRegex: "",
        useridOverwrite: "always",
        useridUpdateOnLoad: false,
        useridListenInput: true,
        useridListenChange: false
    };

    let currentConfig = clone(DEFAULT_CONFIG);
    let runtimeAbort = null;
    let applyGeneration = 0;
    let registered = false;
    let unsubscribe = null;
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

    function bool(value, fallback) {
        return typeof value === "boolean" ? value : fallback;
    }

    function num(value, fallback, min, max) {
        const n = Number(value);
        let out = Number.isFinite(n) ? n : fallback;
        if (Number.isFinite(min)) out = Math.max(min, out);
        if (Number.isFinite(max)) out = Math.min(max, out);
        return out;
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
        return String(prefix || "item") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
    }

    function isMemberEntryPage() {
        return window.location.pathname === MEMBERENTRY_PATH || /\/memberentry\.pl$/.test(window.location.pathname);
    }

    function safeQuery(selector) {
        const value = clean(selector);
        if (!value) return null;
        try {
            return document.querySelector(value);
        } catch (_) {
            return null;
        }
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

    function waitForSelector(selector, timeout) {
        return new Promise(function (resolve, reject) {
            const first = safeQuery(selector);
            if (first) {
                resolve(first);
                return;
            }

            const root = document.documentElement || document.body;
            if (!root) {
                reject(new Error("no_dom_root"));
                return;
            }

            const observer = new MutationObserver(function () {
                const found = safeQuery(selector);
                if (found) {
                    observer.disconnect();
                    resolve(found);
                }
            });

            observer.observe(root, { childList: true, subtree: true });

            const ms = Number.isFinite(Number(timeout)) ? Number(timeout) : 3000;
            window.setTimeout(function () {
                observer.disconnect();
                reject(new Error("timeout"));
            }, ms);
        });
    }

    function currentFormMode() {
        try {
            const params = new URLSearchParams(window.location.search);
            const borrower = clean(params.get("borrowernumber"));
            if (borrower) return "edit";
        } catch (_) {}

        const hidden =
            safeQuery('input[name="borrowernumber"]') ||
            safeQuery("#borrowernumber");

        if (hidden && clean(hidden.value)) return "edit";
        return "create";
    }

    function scopeAllows(scope) {
        const value = ["create", "edit", "both"].includes(scope) ? scope : "both";
        if (value === "both") return true;
        return currentFormMode() === value;
    }

    function shouldWrite(element, overwrite) {
        if (!element) return false;
        if (overwrite !== "if-empty") return true;

        if (element.type === "checkbox" || element.type === "radio") {
            return element.checked === false;
        }

        return clean(element.value) === "";
    }

    function dispatch(element, type) {
        if (!element || !type) return;
        try {
            element.dispatchEvent(new Event(type, { bubbles: true }));
        } catch (_) {}
    }

    function normalizeTitleMapping(item) {
        const src = item && typeof item === "object" ? item : {};
        return {
            id: clean(src.id) || uniqueId("title-sex"),
            enabled: src.enabled !== false,
            sourceValue: String(src.sourceValue == null ? "" : src.sourceValue),
            targetMode: src.targetMode === "value" ? "value" : "index",
            targetIndex: Math.max(0, Math.trunc(num(src.targetIndex, 0, 0))),
            targetValue: String(src.targetValue == null ? "" : src.targetValue)
        };
    }

    function normalizeMessagePref(item) {
        const src = item && typeof item === "object" ? item : {};
        return {
            id: clean(src.id) || uniqueId("message-pref"),
            enabled: src.enabled !== false,
            name: clean(src.name),
            selector: clean(src.selector),
            checked: src.checked !== false,
            triggerChange: src.triggerChange === true
        };
    }

    function normalizePasswordTarget(item) {
        const src = item && typeof item === "object" ? item : {};
        return {
            id: clean(src.id) || uniqueId("password-target"),
            enabled: src.enabled !== false,
            name: clean(src.name),
            selector: clean(src.selector)
        };
    }

    function normalizeAttributeDefault(item) {
        const src = item && typeof item === "object" ? item : {};
        const allowedModes = ["selected-index", "value", "text", "checked"];
        return {
            id: clean(src.id) || uniqueId("attribute"),
            enabled: src.enabled !== false,
            name: clean(src.name),
            selector: clean(src.selector),
            valueMode: allowedModes.includes(src.valueMode) ? src.valueMode : "selected-index",
            selectedIndex: Math.max(0, Math.trunc(num(src.selectedIndex, 0, 0))),
            value: String(src.value == null ? "" : src.value),
            checked: src.checked !== false,
            overwrite: src.overwrite === "if-empty" ? "if-empty" : "always",
            triggerChange: src.triggerChange === true
        };
    }

    function normalizeConfig(config) {
        const src = config && typeof config === "object" ? config : {};

        return {
            enabled: bool(src.enabled, DEFAULT_CONFIG.enabled),

            titleSexEnabled: bool(src.titleSexEnabled, DEFAULT_CONFIG.titleSexEnabled),
            titleSexScope: ["create", "edit", "both"].includes(src.titleSexScope) ? src.titleSexScope : DEFAULT_CONFIG.titleSexScope,
            titleSelector: clean(src.titleSelector) || DEFAULT_CONFIG.titleSelector,
            sexSelector: clean(src.sexSelector) || DEFAULT_CONFIG.sexSelector,
            titleSexTrigger: ["blur", "change", "input"].includes(src.titleSexTrigger) ? src.titleSexTrigger : DEFAULT_CONFIG.titleSexTrigger,
            titleSexMappings: Array.isArray(src.titleSexMappings)
                ? src.titleSexMappings.map(normalizeTitleMapping)
                : clone(DEFAULT_CONFIG.titleSexMappings).map(normalizeTitleMapping),
            titleSexFallbackEnabled: bool(src.titleSexFallbackEnabled, DEFAULT_CONFIG.titleSexFallbackEnabled),
            titleSexFallbackMode: src.titleSexFallbackMode === "value" ? "value" : "index",
            titleSexFallbackIndex: Math.max(0, Math.trunc(num(src.titleSexFallbackIndex, DEFAULT_CONFIG.titleSexFallbackIndex, 0))),
            titleSexFallbackValue: String(src.titleSexFallbackValue == null ? DEFAULT_CONFIG.titleSexFallbackValue : src.titleSexFallbackValue),

            phoneSmsEnabled: bool(src.phoneSmsEnabled, DEFAULT_CONFIG.phoneSmsEnabled),
            phoneSmsScope: ["create", "edit", "both"].includes(src.phoneSmsScope) ? src.phoneSmsScope : DEFAULT_CONFIG.phoneSmsScope,
            phoneSourceSelector: clean(src.phoneSourceSelector) || DEFAULT_CONFIG.phoneSourceSelector,
            smsTargetSelector: clean(src.smsTargetSelector) || DEFAULT_CONFIG.smsTargetSelector,
            phoneSmsPattern: String(src.phoneSmsPattern == null ? DEFAULT_CONFIG.phoneSmsPattern : src.phoneSmsPattern),
            phoneSmsFlags: String(src.phoneSmsFlags == null ? DEFAULT_CONFIG.phoneSmsFlags : src.phoneSmsFlags).replace(/g/g, ""),
            phoneSmsLocalPrefix: String(src.phoneSmsLocalPrefix == null ? DEFAULT_CONFIG.phoneSmsLocalPrefix : src.phoneSmsLocalPrefix),
            phoneSmsInternationalPrefix: String(src.phoneSmsInternationalPrefix == null ? DEFAULT_CONFIG.phoneSmsInternationalPrefix : src.phoneSmsInternationalPrefix),
            phoneSmsNormalizeLocal: bool(src.phoneSmsNormalizeLocal, DEFAULT_CONFIG.phoneSmsNormalizeLocal),
            phoneSmsCopySourceToTarget: bool(src.phoneSmsCopySourceToTarget, DEFAULT_CONFIG.phoneSmsCopySourceToTarget),
            phoneSmsOverwrite: src.phoneSmsOverwrite === "if-empty" ? "if-empty" : "always",
            phoneSmsProcessOnLoad: bool(src.phoneSmsProcessOnLoad, DEFAULT_CONFIG.phoneSmsProcessOnLoad),
            phoneSmsListenInput: bool(src.phoneSmsListenInput, DEFAULT_CONFIG.phoneSmsListenInput),
            phoneSmsListenChange: bool(src.phoneSmsListenChange, DEFAULT_CONFIG.phoneSmsListenChange),
            smsNormalizeOwnValue: bool(src.smsNormalizeOwnValue, DEFAULT_CONFIG.smsNormalizeOwnValue),
            smsListenInput: bool(src.smsListenInput, DEFAULT_CONFIG.smsListenInput),
            smsListenChange: bool(src.smsListenChange, DEFAULT_CONFIG.smsListenChange),
            phoneSmsShowHints: bool(src.phoneSmsShowHints, DEFAULT_CONFIG.phoneSmsShowHints),
            phoneSmsCopiedTextFr: String(src.phoneSmsCopiedTextFr == null ? DEFAULT_CONFIG.phoneSmsCopiedTextFr : src.phoneSmsCopiedTextFr),
            phoneSmsCopiedTextEn: String(src.phoneSmsCopiedTextEn == null ? DEFAULT_CONFIG.phoneSmsCopiedTextEn : src.phoneSmsCopiedTextEn),
            phoneSmsFormattedTextFr: String(src.phoneSmsFormattedTextFr == null ? DEFAULT_CONFIG.phoneSmsFormattedTextFr : src.phoneSmsFormattedTextFr),
            phoneSmsFormattedTextEn: String(src.phoneSmsFormattedTextEn == null ? DEFAULT_CONFIG.phoneSmsFormattedTextEn : src.phoneSmsFormattedTextEn),
            phoneSmsInvalidTextFr: String(src.phoneSmsInvalidTextFr == null ? DEFAULT_CONFIG.phoneSmsInvalidTextFr : src.phoneSmsInvalidTextFr),
            phoneSmsInvalidTextEn: String(src.phoneSmsInvalidTextEn == null ? DEFAULT_CONFIG.phoneSmsInvalidTextEn : src.phoneSmsInvalidTextEn),

            messagePrefsEnabled: bool(src.messagePrefsEnabled, DEFAULT_CONFIG.messagePrefsEnabled),
            messagePrefsScope: ["create", "edit", "both"].includes(src.messagePrefsScope) ? src.messagePrefsScope : DEFAULT_CONFIG.messagePrefsScope,
            messagePrefs: Array.isArray(src.messagePrefs)
                ? src.messagePrefs.map(normalizeMessagePref)
                : clone(DEFAULT_CONFIG.messagePrefs).map(normalizeMessagePref),

            passwordEnabled: bool(src.passwordEnabled, DEFAULT_CONFIG.passwordEnabled),
            passwordScope: ["create", "edit", "both"].includes(src.passwordScope) ? src.passwordScope : DEFAULT_CONFIG.passwordScope,
            passwordSourceSelector: clean(src.passwordSourceSelector) || DEFAULT_CONFIG.passwordSourceSelector,
            passwordTrigger: ["keyup", "input", "change"].includes(src.passwordTrigger) ? src.passwordTrigger : DEFAULT_CONFIG.passwordTrigger,
            passwordMinSourceLength: Math.max(0, Math.trunc(num(src.passwordMinSourceLength, DEFAULT_CONFIG.passwordMinSourceLength, 0))),
            passwordExtractMode: ["last", "first", "range", "regex"].includes(src.passwordExtractMode) ? src.passwordExtractMode : DEFAULT_CONFIG.passwordExtractMode,
            passwordExtractLength: Math.max(0, Math.trunc(num(src.passwordExtractLength, DEFAULT_CONFIG.passwordExtractLength, 0))),
            passwordExtractOffset: Math.max(0, Math.trunc(num(src.passwordExtractOffset, DEFAULT_CONFIG.passwordExtractOffset, 0))),
            passwordRegex: String(src.passwordRegex == null ? DEFAULT_CONFIG.passwordRegex : src.passwordRegex),
            passwordRegexGroup: Math.max(0, Math.trunc(num(src.passwordRegexGroup, DEFAULT_CONFIG.passwordRegexGroup, 0))),
            passwordOverwrite: src.passwordOverwrite === "if-empty" ? "if-empty" : "always",
            passwordClearWhenTooShort: bool(src.passwordClearWhenTooShort, DEFAULT_CONFIG.passwordClearWhenTooShort),
            passwordTargets: Array.isArray(src.passwordTargets)
                ? src.passwordTargets.map(normalizePasswordTarget)
                : clone(DEFAULT_CONFIG.passwordTargets).map(normalizePasswordTarget),

            attributeDefaultsEnabled: bool(src.attributeDefaultsEnabled, DEFAULT_CONFIG.attributeDefaultsEnabled),
            attributeDefaultsScope: ["create", "edit", "both"].includes(src.attributeDefaultsScope) ? src.attributeDefaultsScope : DEFAULT_CONFIG.attributeDefaultsScope,
            attributeDefaults: Array.isArray(src.attributeDefaults)
                ? src.attributeDefaults.map(normalizeAttributeDefault)
                : clone(DEFAULT_CONFIG.attributeDefaults).map(normalizeAttributeDefault),

            useridEnabled: bool(src.useridEnabled, DEFAULT_CONFIG.useridEnabled),
            useridScope: ["create", "edit", "both"].includes(src.useridScope) ? src.useridScope : DEFAULT_CONFIG.useridScope,
            useridFirstnameSelector: clean(src.useridFirstnameSelector) || DEFAULT_CONFIG.useridFirstnameSelector,
            useridSurnameSelector: clean(src.useridSurnameSelector) || DEFAULT_CONFIG.useridSurnameSelector,
            useridTargetSelector: clean(src.useridTargetSelector) || DEFAULT_CONFIG.useridTargetSelector,
            useridRequiredPresenceSelector: String(
                src.useridRequiredPresenceSelector == null
                    ? DEFAULT_CONFIG.useridRequiredPresenceSelector
                    : src.useridRequiredPresenceSelector
            ),
            useridTemplate: String(src.useridTemplate == null ? DEFAULT_CONFIG.useridTemplate : src.useridTemplate),
            useridLowercase: bool(src.useridLowercase, DEFAULT_CONFIG.useridLowercase),
            useridStripDiacritics: bool(src.useridStripDiacritics, DEFAULT_CONFIG.useridStripDiacritics),
            useridRemoveSpaces: bool(src.useridRemoveSpaces, DEFAULT_CONFIG.useridRemoveSpaces),
            useridRemoveHyphens: bool(src.useridRemoveHyphens, DEFAULT_CONFIG.useridRemoveHyphens),
            useridRemoveApostrophes: bool(src.useridRemoveApostrophes, DEFAULT_CONFIG.useridRemoveApostrophes),
            useridRemoveParentheses: bool(src.useridRemoveParentheses, DEFAULT_CONFIG.useridRemoveParentheses),
            useridAdditionalRemoveRegex: String(src.useridAdditionalRemoveRegex == null ? DEFAULT_CONFIG.useridAdditionalRemoveRegex : src.useridAdditionalRemoveRegex),
            useridOverwrite: src.useridOverwrite === "if-empty" ? "if-empty" : "always",
            useridUpdateOnLoad: bool(src.useridUpdateOnLoad, DEFAULT_CONFIG.useridUpdateOnLoad),
            useridListenInput: bool(src.useridListenInput, DEFAULT_CONFIG.useridListenInput),
            useridListenChange: bool(src.useridListenChange, DEFAULT_CONFIG.useridListenChange)
        };
    }

    function removeHints() {
        document.querySelectorAll("[" + HINT_ATTR + "]").forEach(function (node) {
            try { node.remove(); } catch (_) {}
        });
    }

    function addHint(afterElement, kind, message) {
        if (!afterElement || !afterElement.parentNode || !currentConfig.phoneSmsShowHints) return;
        removeHints();

        const node = document.createElement(kind === "invalid" ? "span" : "div");
        node.setAttribute(HINT_ATTR, "1");
        node.className = kind === "invalid" ? "required js2formatsmsnumber" : "hint js2formatsmsnumber";
        node.textContent = message;
        afterElement.insertAdjacentElement("afterend", node);
    }

    function compilePhonePattern(config) {
        try {
            return new RegExp(config.phoneSmsPattern, config.phoneSmsFlags || "");
        } catch (_) {
            try {
                return new RegExp(DEFAULT_CONFIG.phoneSmsPattern);
            } catch (_) {
                return null;
            }
        }
    }

    function isValidPhone(value, config) {
        const pattern = compilePhonePattern(config);
        if (!pattern) return false;
        pattern.lastIndex = 0;
        return pattern.test(String(value || ""));
    }

    function formatPhone(value, config) {
        const raw = String(value || "");
        if (
            config.phoneSmsNormalizeLocal === true &&
            clean(config.phoneSmsLocalPrefix) &&
            raw.startsWith(config.phoneSmsLocalPrefix) &&
            !raw.startsWith("+")
        ) {
            return String(config.phoneSmsInternationalPrefix || "") + raw.slice(config.phoneSmsLocalPrefix.length);
        }
        return raw;
    }

    function pickRadio(radios, mode, index, value) {
        if (!Array.isArray(radios) || !radios.length) return;

        let target = null;
        if (mode === "value") {
            target = radios.find(function (radio) {
                return String(radio.value) === String(value);
            }) || null;
        } else {
            target = radios[Math.max(0, Math.trunc(Number(index) || 0))] || null;
        }

        if (target) target.checked = true;
    }

    function setupTitleSex(config, generation, signal) {
        if (!config.titleSexEnabled || !scopeAllows(config.titleSexScope)) return;

        Promise.all([
            waitForSelector(config.titleSelector, 3000).catch(function () { return null; }),
            waitForSelector(config.sexSelector, 3000).catch(function () { return null; })
        ]).then(function (results) {
            if (generation !== applyGeneration || signal.aborted) return;

            const title = results[0];
            if (!title) return;

            function update() {
                const selectedValue = String(title.value == null ? "" : title.value);
                const radios = safeQueryAll(config.sexSelector).filter(function (node) {
                    return node && node.type === "radio";
                });
                if (!radios.length) return;

                const mapping = config.titleSexMappings.find(function (item) {
                    return item && item.enabled !== false && String(item.sourceValue) === selectedValue;
                });

                if (mapping) {
                    pickRadio(radios, mapping.targetMode, mapping.targetIndex, mapping.targetValue);
                } else if (config.titleSexFallbackEnabled) {
                    pickRadio(
                        radios,
                        config.titleSexFallbackMode,
                        config.titleSexFallbackIndex,
                        config.titleSexFallbackValue
                    );
                }
            }

            title.addEventListener(config.titleSexTrigger, update, { signal: signal });
        });
    }

    function setupPhoneSms(config, generation, signal) {
        if (!config.phoneSmsEnabled || !scopeAllows(config.phoneSmsScope)) return;

        Promise.all([
            waitForSelector(config.phoneSourceSelector, 3000).catch(function () { return null; }),
            waitForSelector(config.smsTargetSelector, 3000).catch(function () { return null; })
        ]).then(function (results) {
            if (generation !== applyGeneration || signal.aborted) return;

            const phone = results[0];
            const sms = results[1];
            if (!phone || !sms) return;

            function processPhoneNumber() {
                removeHints();
                const mobile = String(phone.value || "");

                if (!mobile) return;

                if (isValidPhone(mobile, config)) {
                    const formatted = formatPhone(mobile, config);

                    if (config.phoneSmsCopySourceToTarget && shouldWrite(sms, config.phoneSmsOverwrite)) {
                        sms.value = formatted;
                        dispatch(sms, "change");
                    }

                    addHint(
                        phone,
                        "ok",
                        t(config.phoneSmsCopiedTextFr, config.phoneSmsCopiedTextEn)
                    );
                } else {
                    addHint(
                        phone,
                        "invalid",
                        t(config.phoneSmsInvalidTextFr, config.phoneSmsInvalidTextEn)
                    );
                }
            }

            function processSmsNumber() {
                removeHints();
                const original = String(sms.value || "");
                if (!original) return;

                if (isValidPhone(original, config)) {
                    const formatted = formatPhone(original, config);
                    if (config.smsNormalizeOwnValue && formatted !== original) {
                        sms.value = formatted;
                        dispatch(sms, "change");
                        addHint(
                            sms,
                            "ok",
                            t(config.phoneSmsFormattedTextFr, config.phoneSmsFormattedTextEn)
                        );
                    }
                } else {
                    addHint(
                        sms,
                        "invalid",
                        t(config.phoneSmsInvalidTextFr, config.phoneSmsInvalidTextEn)
                    );
                }
            }

            if (config.phoneSmsListenChange) {
                phone.addEventListener("change", processPhoneNumber, { signal: signal });
            }
            if (config.phoneSmsListenInput) {
                phone.addEventListener("input", processPhoneNumber, { signal: signal });
            }
            if (config.smsListenChange) {
                sms.addEventListener("change", processSmsNumber, { signal: signal });
            }
            if (config.smsListenInput) {
                sms.addEventListener("input", processSmsNumber, { signal: signal });
            }

            if (config.phoneSmsProcessOnLoad && String(phone.value || "")) {
                processPhoneNumber();
            }
        });
    }

    function setupMessagePrefs(config, generation) {
        if (!config.messagePrefsEnabled || !scopeAllows(config.messagePrefsScope)) return;

        config.messagePrefs.forEach(function (rule) {
            if (!rule || rule.enabled === false || !rule.selector) return;

            waitForSelector(rule.selector, 2500).then(function (element) {
                if (generation !== applyGeneration || !element) return;
                element.checked = rule.checked === true;
                if (rule.triggerChange) dispatch(element, "change");
            }).catch(function () {});
        });
    }

    function extractPasswordValue(sourceValue, config) {
        const value = String(sourceValue || "");
        const length = Math.max(0, Math.trunc(config.passwordExtractLength || 0));
        const offset = Math.max(0, Math.trunc(config.passwordExtractOffset || 0));

        if (config.passwordExtractMode === "first") {
            return value.slice(offset, offset + length);
        }

        if (config.passwordExtractMode === "range") {
            return value.slice(offset, offset + length);
        }

        if (config.passwordExtractMode === "regex") {
            if (!clean(config.passwordRegex)) return "";
            try {
                const match = value.match(new RegExp(config.passwordRegex));
                if (!match) return "";
                return String(match[config.passwordRegexGroup] == null ? "" : match[config.passwordRegexGroup]);
            } catch (_) {
                return "";
            }
        }

        if (!length) return "";
        const end = Math.max(0, value.length - offset);
        const start = Math.max(0, end - length);
        return value.slice(start, end);
    }

    function setupPassword(config, generation, signal) {
        if (!config.passwordEnabled || !scopeAllows(config.passwordScope)) return;

        waitForSelector(config.passwordSourceSelector, 3000).then(function (source) {
            if (generation !== applyGeneration || signal.aborted || !source) return;

            function updatePassword() {
                const sourceValue = String(source.value || "");
                const tooShort = sourceValue.length < config.passwordMinSourceLength;

                config.passwordTargets.forEach(function (targetRule) {
                    if (!targetRule || targetRule.enabled === false || !targetRule.selector) return;
                    const target = safeQuery(targetRule.selector);
                    if (!target) return;

                    if (tooShort) {
                        if (config.passwordClearWhenTooShort && shouldWrite(target, config.passwordOverwrite)) {
                            target.value = "";
                        }
                        return;
                    }

                    if (!shouldWrite(target, config.passwordOverwrite)) return;
                    target.value = extractPasswordValue(sourceValue, config);
                });
            }

            source.addEventListener(config.passwordTrigger, updatePassword, { signal: signal });
        }).catch(function () {});
    }

    function applyAttributeDefault(element, rule) {
        if (!element || !rule) return;
        if (!shouldWrite(element, rule.overwrite)) return;

        if (rule.valueMode === "selected-index") {
            if ("selectedIndex" in element) {
                element.selectedIndex = rule.selectedIndex;
            }
        } else if (rule.valueMode === "checked") {
            if ("checked" in element) element.checked = rule.checked === true;
        } else if (rule.valueMode === "text") {
            if ("value" in element) element.value = String(rule.value || "");
            else element.textContent = String(rule.value || "");
        } else {
            if ("value" in element) element.value = String(rule.value || "");
        }

        if (rule.triggerChange) dispatch(element, "change");
    }

    function setupAttributeDefaults(config, generation) {
        if (!config.attributeDefaultsEnabled || !scopeAllows(config.attributeDefaultsScope)) return;

        config.attributeDefaults.forEach(function (rule) {
            if (!rule || rule.enabled === false || !rule.selector) return;

            waitForSelector(rule.selector, 2500).then(function (element) {
                if (generation !== applyGeneration || !element) return;
                applyAttributeDefault(element, rule);
            }).catch(function () {});
        });
    }

    function normalizeUseridPart(value, config) {
        let text = String(value || "");

        if (config.useridLowercase) text = text.toLowerCase();

        if (config.useridStripDiacritics) {
            try {
                text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            } catch (_) {}
        }

        if (config.useridRemoveSpaces) text = text.replace(/\s/g, "");
        if (config.useridRemoveHyphens) text = text.replace(/-/g, "");
        if (config.useridRemoveApostrophes) text = text.replace(/['’]/g, "");
        if (config.useridRemoveParentheses) text = text.replace(/[()]/g, "");

        if (clean(config.useridAdditionalRemoveRegex)) {
            try {
                text = text.replace(new RegExp(config.useridAdditionalRemoveRegex, "g"), "");
            } catch (_) {}
        }

        return text;
    }

    function setupUserid(config, generation, signal) {
        if (!config.useridEnabled || !scopeAllows(config.useridScope)) return;

        const requiredPresence = clean(config.useridRequiredPresenceSelector);

        Promise.all([
            requiredPresence
                ? waitForSelector(requiredPresence, 3000).catch(function () { return null; })
                : Promise.resolve(true),
            waitForSelector(config.useridFirstnameSelector, 3000).catch(function () { return null; }),
            waitForSelector(config.useridSurnameSelector, 3000).catch(function () { return null; }),
            waitForSelector(config.useridTargetSelector, 3000).catch(function () { return null; })
        ]).then(function (results) {
            if (generation !== applyGeneration || signal.aborted) return;

            const guard = results[0];
            const firstname = results[1];
            const surname = results[2];
            const target = results[3];

            if (!guard || !firstname || !surname || !target) return;

            function updateUserid() {
                if (!shouldWrite(target, config.useridOverwrite)) return;

                const first = normalizeUseridPart(firstname.value, config);
                const last = normalizeUseridPart(surname.value, config);

                target.value = String(config.useridTemplate || "")
                    .replace(/\{firstname\}/g, first)
                    .replace(/\{surname\}/g, last);
            }

            if (config.useridListenInput) {
                firstname.addEventListener("input", updateUserid, { signal: signal });
                surname.addEventListener("input", updateUserid, { signal: signal });
            }

            if (config.useridListenChange) {
                firstname.addEventListener("change", updateUserid, { signal: signal });
                surname.addEventListener("change", updateUserid, { signal: signal });
            }

            if (config.useridUpdateOnLoad) updateUserid();
        });
    }

    function stopRuntime() {
        applyGeneration += 1;

        if (runtimeAbort) {
            try { runtimeAbort.abort(); } catch (_) {}
            runtimeAbort = null;
        }

        removeHints();
    }

    function applyConfig(config) {
        currentConfig = normalizeConfig(config || DEFAULT_CONFIG);
        stopRuntime();

        if (!currentConfig.enabled || !isMemberEntryPage()) {
            mountContextAccess();
            return;
        }

        const generation = applyGeneration;
        runtimeAbort = new AbortController();
        const signal = runtimeAbort.signal;

        setupTitleSex(currentConfig, generation, signal);
        setupPhoneSms(currentConfig, generation, signal);
        setupMessagePrefs(currentConfig, generation);
        setupPassword(currentConfig, generation, signal);
        setupAttributeDefaults(currentConfig, generation);
        setupUserid(currentConfig, generation, signal);
        mountContextAccess();
    }

    function titleMappingNew() {
        return normalizeTitleMapping({
            id: uniqueId("title-sex"),
            enabled: true,
            sourceValue: "",
            targetMode: "value",
            targetIndex: 0,
            targetValue: ""
        });
    }

    function messagePrefNew() {
        return normalizeMessagePref({
            id: uniqueId("message-pref"),
            enabled: true,
            name: "",
            selector: "",
            checked: true,
            triggerChange: false
        });
    }

    function passwordTargetNew() {
        return normalizePasswordTarget({
            id: uniqueId("password-target"),
            enabled: true,
            name: "",
            selector: ""
        });
    }

    function attributeDefaultNew() {
        return normalizeAttributeDefault({
            id: uniqueId("attribute"),
            enabled: true,
            name: "",
            selector: "",
            valueMode: "value",
            selectedIndex: 0,
            value: "",
            checked: true,
            overwrite: "if-empty",
            triggerChange: false
        });
    }

    function scopeOptions() {
        return [
            { value: "both", label: { fr: "Création et modification", en: "Create and edit" } },
            { value: "create", label: { fr: "Création uniquement", en: "Create only" } },
            { value: "edit", label: { fr: "Modification uniquement", en: "Edit only" } }
        ];
    }

    function overwriteOptions() {
        return [
            { value: "always", label: { fr: "Toujours remplacer — par défaut", en: "Always replace — default" } },
            { value: "if-empty", label: { fr: "Seulement si la cible est vide", en: "Only when target is empty" } }
        ];
    }

    function pathIndex(path, key) {
        const list = Array.isArray(path) ? path : [];
        for (let i = 0; i < list.length - 1; i += 1) {
            if (list[i] === key && Number.isInteger(list[i + 1])) return list[i + 1];
        }
        return -1;
    }

    function itemFromPath(root, path, key) {
        const index = pathIndex(path, key);
        return root && Array.isArray(root[key]) && index >= 0 ? root[key][index] : null;
    }

    function getAtPath(root, path) {
        let node = root;
        (Array.isArray(path) ? path : []).forEach(function (part) {
            if (node != null) node = node[part];
        });
        return node;
    }

    function setAtPath(root, path, value) {
        const parts = Array.isArray(path) ? path.slice() : [];
        if (!root || !parts.length) return root;

        let node = root;
        for (let i = 0; i < parts.length - 1; i += 1) {
            const part = parts[i];
            const next = parts[i + 1];

            if (node[part] == null) {
                node[part] = Number.isInteger(next) ? [] : {};
            }
            node = node[part];
        }

        node[parts[parts.length - 1]] = value;
        return root;
    }

    function cssEscapeString(value) {
        if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(value));
        return String(value).replace(/["\\]/g, "\\$&");
    }

    function pickerService() {
        return window.PMKConfig && window.PMKConfig.elementPicker;
    }

    function pickerTargetUrl() {
        return isMemberEntryPage()
            ? window.location.pathname + window.location.search
            : MEMBERENTRY_PATH;
    }

    function pickSelector(context, mode) {
        const service = pickerService();

        if (!service || typeof service.pickForConfig !== "function") {
            return Promise.reject(new Error("pmk_common_picker_unavailable"));
        }

        registerPickerAdapter();

        const path = context && Array.isArray(context.fieldPath)
            ? context.fieldPath.slice()
            : [];

        return service.pickForConfig({
            moduleId: MODULE_ID,
            targetUrl: pickerTargetUrl(),
            rootObject: context && context.rootObject ? context.rootObject : {},
            fieldPath: path,
            meta: {
                pickMode: mode || "field",
                fieldPath: path
            },
            adminContext: {
                sectionId: "memberentry"
            },
            options: {
                bannerText: t(
                    "Clique sur le champ Koha à utiliser pour cet automatisme — Échap annule",
                    "Click the Koha field to use for this automation — Esc cancels"
                )
            },
            persistAfterPick: false
        });
    }

    function resolvePickedField(element, request) {
        if (!element || element.nodeType !== 1) return null;

        let candidate = element;

        if (candidate.tagName && candidate.tagName.toLowerCase() === "label") {
            const forId = clean(candidate.getAttribute("for"));
            if (forId) {
                const labelled = document.getElementById(forId);
                if (labelled) candidate = labelled;
            }
        }

        candidate =
            (candidate.closest && candidate.closest("input,select,textarea,button")) ||
            candidate.querySelector && candidate.querySelector("input,select,textarea,button") ||
            candidate;

        const mode = clean(request && request.meta && request.meta.pickMode);

        if (mode === "radio-group" && candidate && candidate.type === "radio" && candidate.name) {
            return candidate;
        }

        return candidate;
    }

    function pickerBuildResult(element, result, request) {
        const target = resolvePickedField(element, request) || element;
        const mode = clean(request && request.meta && request.meta.pickMode);

        if (mode === "radio-group" && target && target.type === "radio" && target.name) {
            result.selector = 'input[type="radio"][name="' + cssEscapeString(target.name) + '"]';
            result.value = result.selector;
        }

        result.targetName =
            clean(target && (target.getAttribute && target.getAttribute("name"))) ||
            clean(target && target.id) ||
            clean(target && target.getAttribute && target.getAttribute("aria-label")) ||
            "";

        return result;
    }

    function pickerApplyPending(draft, pending, picked) {
        const path =
            pending && pending.meta && Array.isArray(pending.meta.fieldPath)
                ? pending.meta.fieldPath
                : [];

        if (!draft || !path.length) return draft;

        const selector = clean(picked && (picked.selector || picked.value));
        if (selector) setAtPath(draft, path, selector);
        return draft;
    }

    function registerPickerAdapter() {
        const service = pickerService();
        if (!service || typeof service.register !== "function") return false;

        service.register(MODULE_ID, {
            resolveTarget: resolvePickedField,
            buildResult: pickerBuildResult,
            applyPending: pickerApplyPending
        });

        return true;
    }

    function isTitleMapValueMode(root, path) {
        const item = itemFromPath(root, path, "titleSexMappings");
        return Boolean(item && item.targetMode === "value");
    }

    function isTitleMapIndexMode(root, path) {
        const item = itemFromPath(root, path, "titleSexMappings");
        return Boolean(item && item.targetMode !== "value");
    }

    function isFallbackValueMode(root) {
        return root && root.titleSexFallbackMode === "value";
    }

    function isFallbackIndexMode(root) {
        return !root || root.titleSexFallbackMode !== "value";
    }

    function isPasswordRange(root) {
        return root && root.passwordExtractMode === "range";
    }

    function isPasswordRegex(root) {
        return root && root.passwordExtractMode === "regex";
    }

    function attributeItem(root, path) {
        return itemFromPath(root, path, "attributeDefaults");
    }

    function attributeMode(root, path, mode) {
        const item = attributeItem(root, path);
        return Boolean(item && item.valueMode === mode);
    }

    function validate(config) {
        const cfg = normalizeConfig(config);

        if (cfg.titleSexEnabled) {
            if (!cfg.titleSelector || !cfg.sexSelector) {
                return { ok: false, message: t("Civilité → sexe : les deux champs doivent être définis.", "Title → sex: both fields must be defined.") };
            }
        }

        if (cfg.phoneSmsEnabled) {
            try {
                new RegExp(cfg.phoneSmsPattern, cfg.phoneSmsFlags || "");
            } catch (_) {
                return { ok: false, message: t("Téléphone → SMS : l’expression de validation est invalide.", "Phone → SMS: validation expression is invalid.") };
            }

            if (!cfg.phoneSourceSelector || !cfg.smsTargetSelector) {
                return { ok: false, message: t("Téléphone → SMS : la source et la cible doivent être définies.", "Phone → SMS: source and target must be defined.") };
            }
        }

        if (cfg.passwordEnabled && !cfg.passwordSourceSelector) {
            return { ok: false, message: t("Mot de passe : le champ source doit être défini.", "Password: source field must be defined.") };
        }

        if (cfg.useridEnabled) {
            if (!cfg.useridFirstnameSelector || !cfg.useridSurnameSelector || !cfg.useridTargetSelector) {
                return { ok: false, message: t("Identifiant : prénom, nom et cible doivent être définis.", "User ID: firstname, surname and target must be defined.") };
            }
            if (!cfg.useridTemplate.includes("{firstname}") && !cfg.useridTemplate.includes("{surname}")) {
                return { ok: false, message: t("Identifiant : le modèle doit utiliser {firstname} ou {surname}.", "User ID: template must use {firstname} or {surname}.") };
            }
        }

        return { ok: true };
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 2,
            name: {
                fr: "Automatismes de saisie adhérent",
                en: "Patron entry automations"
            },
            description: {
                fr: "Automatise certaines opérations sur la fiche d’inscription/modification d’un adhérent.",
                en: "Automates selected operations on the patron registration/edit form."
            },
            category: {
                fr: "Adhérents",
                en: "Patrons"
            },
            supportedPages: [MEMBERENTRY_PATH],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            normalize: normalizeConfig,
            validate: validate,
            schema: [
                {
                    type: "section",
                    id: "title-sex",
                    label: { fr: "Civilité → sexe", en: "Title → sex" },
                    description: {
                        fr: "Par défaut : Mme sélectionne le 1er choix de sexe, M le 2e, toute autre civilité le 3e, au blur de la civilité.",
                        en: "Default: Mme selects the 1st sex option, M the 2nd, any other title the 3rd, on title blur."
                    },
                    fields: [
                        { key: "titleSexEnabled", type: "boolean", label: { fr: "Activer cet automatisme", en: "Enable this automation" } },
                        { key: "titleSexScope", type: "select", label: { fr: "Quand l’appliquer", en: "When to apply" }, options: scopeOptions() },
                        {
                            key: "titleSelector",
                            type: "elementPicker",
                            label: { fr: "Champ Civilité", en: "Title field" },
                            pickLabel: { fr: "Choisir sur la page", en: "Choose on page" },
                            allowManual: true,
                            pick: function (context) { return pickSelector(context, "field"); }
                        },
                        {
                            key: "sexSelector",
                            type: "elementPicker",
                            label: { fr: "Groupe Sexe", en: "Sex radio group" },
                            pickLabel: { fr: "Choisir un bouton du groupe", en: "Choose a radio in the group" },
                            allowManual: true,
                            pick: function (context) { return pickSelector(context, "radio-group"); },
                            help: {
                                fr: "En cliquant sur un bouton radio, PMK mémorise automatiquement tout le groupe portant le même nom.",
                                en: "Clicking a radio button makes PMK target the whole radio group with the same name."
                            }
                        },
                        {
                            key: "titleSexTrigger",
                            type: "select",
                            label: { fr: "Déclenchement", en: "Trigger" },
                            options: [
                                { value: "blur", label: { fr: "Quand on quitte le champ — par défaut", en: "When leaving the field — default" } },
                                { value: "change", label: { fr: "Quand la valeur change", en: "When the value changes" } },
                                { value: "input", label: { fr: "Pendant la saisie", en: "While editing" } }
                            ]
                        },
                        {
                            key: "titleSexMappings",
                            type: "repeater",
                            label: { fr: "Correspondances", en: "Mappings" },
                            addLabel: { fr: "Ajouter une correspondance", en: "Add mapping" },
                            reorder: true,
                            newItem: titleMappingNew,
                            itemTitle: function (item, index) {
                                return clean(item && item.sourceValue)
                                    ? t("Civilité : ", "Title: ") + item.sourceValue
                                    : t("Correspondance ", "Mapping ") + (index + 1);
                            },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Active", en: "Enabled" } },
                                { key: "sourceValue", type: "text", label: { fr: "Valeur de civilité", en: "Title value" } },
                                {
                                    key: "targetMode",
                                    type: "select",
                                    label: { fr: "Identifier le choix sexe par", en: "Identify sex option by" },
                                    refreshOnChange: true,
                                    options: [
                                        { value: "index", label: { fr: "Position dans la liste", en: "Position in list" } },
                                        { value: "value", label: { fr: "Valeur technique du choix", en: "Option value" } }
                                    ]
                                },
                                {
                                    key: "targetIndex",
                                    type: "number",
                                    min: 0,
                                    step: 1,
                                    label: { fr: "Position (0 = premier choix)", en: "Position (0 = first option)" },
                                    when: isTitleMapIndexMode
                                },
                                {
                                    key: "targetValue",
                                    type: "text",
                                    label: { fr: "Valeur cible", en: "Target value" },
                                    when: isTitleMapValueMode
                                }
                            ]
                        },
                        { key: "titleSexFallbackEnabled", type: "boolean", label: { fr: "Traiter toutes les autres civilités", en: "Handle every other title" }, refreshOnChange: true },
                        {
                            key: "titleSexFallbackMode",
                            type: "select",
                            label: { fr: "Choix sexe pour les autres civilités", en: "Sex option for other titles" },
                            refreshOnChange: true,
                            when: function (root) { return root && root.titleSexFallbackEnabled === true; },
                            options: [
                                { value: "index", label: { fr: "Par position", en: "By position" } },
                                { value: "value", label: { fr: "Par valeur", en: "By value" } }
                            ]
                        },
                        {
                            key: "titleSexFallbackIndex",
                            type: "number",
                            min: 0,
                            step: 1,
                            label: { fr: "Position (0 = premier choix)", en: "Position (0 = first option)" },
                            when: function (root) { return root && root.titleSexFallbackEnabled === true && isFallbackIndexMode(root); }
                        },
                        {
                            key: "titleSexFallbackValue",
                            type: "text",
                            label: { fr: "Valeur cible", en: "Target value" },
                            when: function (root) { return root && root.titleSexFallbackEnabled === true && isFallbackValueMode(root); }
                        }
                    ]
                },

                {
                    type: "section",
                    id: "phone-sms",
                    label: { fr: "Téléphone → numéro SMS", en: "Phone → SMS number" },
                    description: {
                        fr: "Par défaut : valide le téléphone principal, copie un mobile valide vers le numéro SMS, convertit 06/07 en +336/+337 et valide également le champ SMS.",
                        en: "Default: validates the main phone, copies a valid mobile to the SMS number, converts 06/07 to +336/+337 and validates the SMS field too."
                    },
                    fields: [
                        { key: "phoneSmsEnabled", type: "boolean", label: { fr: "Activer cet automatisme", en: "Enable this automation" } },
                        { key: "phoneSmsScope", type: "select", label: { fr: "Quand l’appliquer", en: "When to apply" }, options: scopeOptions() },
                        {
                            key: "phoneSourceSelector",
                            type: "elementPicker",
                            label: { fr: "Téléphone source", en: "Source phone field" },
                            pickLabel: { fr: "Choisir sur la page", en: "Choose on page" },
                            allowManual: true,
                            pick: function (context) { return pickSelector(context, "field"); }
                        },
                        {
                            key: "smsTargetSelector",
                            type: "elementPicker",
                            label: { fr: "Champ numéro SMS", en: "SMS number field" },
                            pickLabel: { fr: "Choisir sur la page", en: "Choose on page" },
                            allowManual: true,
                            pick: function (context) { return pickSelector(context, "field"); }
                        },
                        {
                            key: "phoneSmsPattern",
                            type: "text",
                            label: { fr: "Expression de validation", en: "Validation expression" },
                            help: {
                                fr: "Valeur par défaut : ^(\\+[0-9]{2}|0)[6-7][0-9]{8}$",
                                en: "Default value: ^(\\+[0-9]{2}|0)[6-7][0-9]{8}$"
                            }
                        },
                        { key: "phoneSmsInternationalPrefix", type: "text", label: { fr: "Préfixe international ajouté", en: "International prefix to add" } },
                        { key: "phoneSmsLocalPrefix", type: "text", label: { fr: "Préfixe local remplacé", en: "Local prefix to replace" } },
                        { key: "phoneSmsNormalizeLocal", type: "boolean", label: { fr: "Convertir le format local vers l’international", en: "Convert local format to international" }, help: { fr: "Si le numéro commence par le préfixe local configuré (par défaut 0), il est converti vers le préfixe international (par défaut +33). Exemple : 06… devient +336…", en: "When the number starts with the configured local prefix (0 by default), it is converted to the international prefix (+33 by default). Example: 06… becomes +336…." } },
                        { key: "phoneSmsCopySourceToTarget", type: "boolean", label: { fr: "Copier le téléphone valide vers le numéro SMS", en: "Copy valid phone to SMS number" }, help: { fr: "Lorsqu’un téléphone principal correspond au format mobile accepté, sa valeur normalisée est recopiée dans le champ Numéro SMS.", en: "When the main phone matches the accepted mobile format, its normalized value is copied to the SMS number field." } },
                        { key: "phoneSmsOverwrite", type: "select", label: { fr: "Si le numéro SMS contient déjà une valeur", en: "If SMS number already has a value" }, options: overwriteOptions(), help: { fr: "« Toujours remplacer » maintient le SMS identique au téléphone mobile valide. « Seulement si la cible est vide » préserve une valeur SMS déjà saisie.", en: "“Always replace” keeps SMS synchronized with a valid mobile phone. “Only when target is empty” preserves an existing SMS value." } },
                        { key: "phoneSmsProcessOnLoad", type: "boolean", label: { fr: "Traiter le téléphone dès l’ouverture de la fiche — par défaut", en: "Process phone when form opens — default" }, help: { fr: "Dès l’ouverture de la fiche, contrôle le téléphone déjà présent et applique immédiatement la normalisation et la copie selon les autres options.", en: "As soon as the form opens, checks the existing phone and immediately applies normalization and copying according to the other options." } },
                        { key: "phoneSmsListenInput", type: "boolean", label: { fr: "Traiter pendant la saisie du téléphone — par défaut", en: "Process while typing phone — default" }, help: { fr: "Réagit à chaque frappe dans le champ Téléphone. Permet un contrôle immédiat pendant la saisie.", en: "Runs on each input event in the Phone field for immediate checking while typing." } },
                        { key: "phoneSmsListenChange", type: "boolean", label: { fr: "Traiter au changement du téléphone — par défaut", en: "Process on phone change — default" }, help: { fr: "Contrôle le téléphone lors de l’événement change, généralement après validation de la saisie ou sortie du champ.", en: "Checks the phone on the change event, usually after the value is committed or the field is left." } },
                        { key: "smsNormalizeOwnValue", type: "boolean", label: { fr: "Normaliser aussi la valeur saisie directement dans le numéro SMS", en: "Also normalize values typed directly in SMS number" }, help: { fr: "Applique les mêmes règles de formatage lorsque l’agent saisit directement un numéro dans le champ SMS.", en: "Applies the same formatting rules when the agent types directly in the SMS number field." } },
                        { key: "smsListenInput", type: "boolean", label: { fr: "Valider le numéro SMS pendant la saisie — par défaut", en: "Validate SMS number while typing — default" }, help: { fr: "Contrôle le format du Numéro SMS à chaque frappe et met à jour le message d’aide si les messages sont activés.", en: "Checks the SMS number format on each input and updates the hint when messages are enabled." } },
                        { key: "smsListenChange", type: "boolean", label: { fr: "Valider le numéro SMS au changement — par défaut", en: "Validate SMS number on change — default" }, help: { fr: "Contrôle le Numéro SMS lors de l’événement change, notamment quand l’agent quitte le champ après l’avoir modifié.", en: "Checks the SMS number on the change event, notably when the agent leaves the field after editing it." } },
                        { key: "phoneSmsShowHints", type: "boolean", label: { fr: "Afficher les messages sous les champs", en: "Show messages below fields" }, help: { fr: "Affiche sous Téléphone et Numéro SMS les messages de copie, conversion ou format invalide. Désactiver cette option masque uniquement les messages : les automatismes continuent de fonctionner.", en: "Shows copy, conversion and invalid-format messages below Phone and SMS number. Disabling it hides only the messages; the automations keep running." } },
                        { key: "phoneSmsCopiedTextFr", type: "text", label: { fr: "Message FR après copie", en: "FR message after copy" } },
                        { key: "phoneSmsCopiedTextEn", type: "text", label: { fr: "Message EN après copie", en: "EN message after copy" } },
                        { key: "phoneSmsFormattedTextFr", type: "text", label: { fr: "Message FR après formatage", en: "FR message after formatting" } },
                        { key: "phoneSmsFormattedTextEn", type: "text", label: { fr: "Message EN après formatage", en: "EN message after formatting" } },
                        { key: "phoneSmsInvalidTextFr", type: "text", label: { fr: "Message FR si invalide", en: "FR invalid message" } },
                        { key: "phoneSmsInvalidTextEn", type: "text", label: { fr: "Message EN si invalide", en: "EN invalid message" } }
                    ]
                },

                {
                    type: "section",
                    id: "message-prefs",
                    label: { fr: "Préférences de messages", en: "Messaging preferences" },
                    description: {
                        fr: "Positionne automatiquement des cases natives de Koha sur la fiche adhérent. Vous pouvez cibler plusieurs cases et définir pour chacune l’état attendu.",
                        en: "Automatically sets native Koha checkboxes on the patron form. You can target multiple checkboxes and define the expected state for each one."
                    },
                    fields: [
                        { key: "messagePrefsEnabled", type: "boolean", label: { fr: "Activer cet automatisme", en: "Enable this automation" } },
                        { key: "messagePrefsScope", type: "select", label: { fr: "Quand l’appliquer", en: "When to apply" }, options: scopeOptions() },
                        {
                            key: "messagePrefs",
                            type: "repeater",
                            label: { fr: "Cases à positionner", en: "Checkboxes to set" },
                            help: { fr: "Chaque élément correspond à une case à cocher Koha que PMK doit positionner automatiquement. Ajoutez une ligne par préférence ou option à piloter.", en: "Each item targets one Koha checkbox that PMK should set automatically. Add one row per preference or option to control." },
                            addLabel: { fr: "Ajouter une case", en: "Add checkbox" },
                            reorder: true,
                            newItem: messagePrefNew,
                            liveTitleKey: "name",
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Actif", en: "Enabled" }, help: { fr: "Active ou désactive uniquement cette règle, sans supprimer sa configuration.", en: "Enables or disables only this rule without deleting its configuration." } },
                                { key: "name", type: "text", label: { fr: "Nom lisible", en: "Display name" }, help: { fr: "Nom affiché uniquement dans PimpMyKoha pour identifier la règle. Il ne modifie aucun libellé dans Koha.", en: "Name shown only in PimpMyKoha to identify the rule. It does not change any Koha label." } },
                                {
                                    key: "selector",
                                    type: "elementPicker",
                                    label: { fr: "Case Koha", en: "Koha checkbox" },
                                    help: { fr: "Case réellement ciblée dans memberentry.pl. Utilisez « Choisir sur la page » pour sélectionner la bonne case sans connaître son sélecteur CSS.", en: "The actual checkbox targeted in memberentry.pl. Use “Choose on page” to select it without knowing its CSS selector." },
                                    pickLabel: { fr: "Choisir sur la page", en: "Choose on page" },
                                    allowManual: true,
                                    pick: function (context) { return pickSelector(context, "field"); }
                                },
                                { key: "checked", type: "boolean", label: { fr: "Case cochée", en: "Checked" }, help: { fr: "Oui : PMK coche la case. Non : PMK la décoche. C’est l’état final appliqué à cette case.", en: "Yes: PMK checks the box. No: PMK unchecks it. This is the final state applied to the checkbox." } },
                                { key: "triggerChange", type: "boolean", label: { fr: "Déclencher aussi l’événement change", en: "Also trigger change event" }, help: { fr: "Oui : après avoir positionné la case, PMK déclenche aussi l’événement JavaScript « change » pour que Koha ou un autre script réagisse comme après une modification manuelle. Non : seule la valeur cochée/décochée est modifiée.", en: "Yes: after setting the checkbox, PMK also fires the JavaScript “change” event so Koha or another script reacts as after a manual change. No: only the checked state is changed." } }
                            ]
                        }
                    ]
                },

                {
                    type: "section",
                    id: "password",
                    label: { fr: "Mot de passe depuis le numéro de carte", en: "Password from card number" },
                    description: {
                        fr: "Par défaut : dès 4 caractères saisis dans le numéro de carte, les 4 derniers sont copiés dans Mot de passe et Confirmation du mot de passe à chaque keyup.",
                        en: "Default: once 4 characters are present in the card number, the last 4 are copied to Password and Password confirmation on every keyup."
                    },
                    fields: [
                        { key: "passwordEnabled", type: "boolean", label: { fr: "Activer cet automatisme", en: "Enable this automation" } },
                        { key: "passwordScope", type: "select", label: { fr: "Quand l’appliquer", en: "When to apply" }, options: scopeOptions() },
                        {
                            key: "passwordSourceSelector",
                            type: "elementPicker",
                            label: { fr: "Champ source", en: "Source field" },
                            pickLabel: { fr: "Choisir sur la page", en: "Choose on page" },
                            allowManual: true,
                            pick: function (context) { return pickSelector(context, "field"); }
                        },
                        {
                            key: "passwordTrigger",
                            type: "select",
                            label: { fr: "Déclenchement", en: "Trigger" },
                            options: [
                                { value: "keyup", label: { fr: "À chaque relâchement de touche — par défaut", en: "On every keyup — default" } },
                                { value: "input", label: { fr: "Pendant la saisie", en: "While editing" } },
                                { value: "change", label: { fr: "Au changement", en: "On change" } }
                            ]
                        },
                        { key: "passwordMinSourceLength", type: "number", min: 0, step: 1, label: { fr: "Longueur minimale de la source", en: "Minimum source length" } },
                        {
                            key: "passwordExtractMode",
                            type: "select",
                            label: { fr: "Portion à copier", en: "Part to copy" },
                            refreshOnChange: true,
                            options: [
                                { value: "last", label: { fr: "Derniers caractères — par défaut", en: "Last characters — default" } },
                                { value: "first", label: { fr: "Premiers caractères", en: "First characters" } },
                                { value: "range", label: { fr: "Portion à partir d’une position", en: "Range from a position" } },
                                { value: "regex", label: { fr: "Expression régulière", en: "Regular expression" } }
                            ]
                        },
                        {
                            key: "passwordExtractLength",
                            type: "number",
                            min: 0,
                            step: 1,
                            label: { fr: "Nombre de caractères", en: "Number of characters" },
                            when: function (root) { return root && root.passwordExtractMode !== "regex"; }
                        },
                        {
                            key: "passwordExtractOffset",
                            type: "number",
                            min: 0,
                            step: 1,
                            label: { fr: "Décalage", en: "Offset" },
                            when: function (root) { return root && (root.passwordExtractMode === "last" || isPasswordRange(root) || root.passwordExtractMode === "first"); },
                            help: {
                                fr: "0 = comportement normal. En mode « derniers », le décalage retire des caractères à la fin avant l’extraction.",
                                en: "0 = normal behaviour. In last mode, offset skips characters at the end before extraction."
                            }
                        },
                        {
                            key: "passwordRegex",
                            type: "text",
                            label: { fr: "Expression régulière", en: "Regular expression" },
                            when: isPasswordRegex
                        },
                        {
                            key: "passwordRegexGroup",
                            type: "number",
                            min: 0,
                            step: 1,
                            label: { fr: "Groupe capturé à utiliser", en: "Capture group to use" },
                            when: isPasswordRegex
                        },
                        { key: "passwordOverwrite", type: "select", label: { fr: "Si la cible contient déjà une valeur", en: "If target already has a value" }, options: overwriteOptions() },
                        { key: "passwordClearWhenTooShort", type: "boolean", label: { fr: "Vider la cible si la source devient trop courte", en: "Clear target if source becomes too short" } },
                        {
                            key: "passwordTargets",
                            type: "repeater",
                            label: { fr: "Champs à remplir", en: "Fields to fill" },
                            addLabel: { fr: "Ajouter une cible", en: "Add target" },
                            reorder: true,
                            newItem: passwordTargetNew,
                            liveTitleKey: "name",
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Active", en: "Enabled" } },
                                { key: "name", type: "text", label: { fr: "Nom lisible", en: "Display name" } },
                                {
                                    key: "selector",
                                    type: "elementPicker",
                                    label: { fr: "Champ cible", en: "Target field" },
                                    pickLabel: { fr: "Choisir sur la page", en: "Choose on page" },
                                    allowManual: true,
                                    pick: function (context) { return pickSelector(context, "field"); }
                                }
                            ]
                        }
                    ]
                },

                {
                    type: "section",
                    id: "attribute-defaults",
                    label: { fr: "Valeurs automatiques d’attributs adhérent", en: "Automatic patron attribute values" },
                    description: {
                        fr: "Par défaut : #patron_attr_6 est positionné sur selectedIndex = 1. Le moteur accepte maintenant plusieurs attributs et plusieurs modes de valeur.",
                        en: "Default: #patron_attr_6 is set to selectedIndex = 1. The engine now supports multiple attributes and value modes."
                    },
                    fields: [
                        { key: "attributeDefaultsEnabled", type: "boolean", label: { fr: "Activer cet automatisme", en: "Enable this automation" } },
                        { key: "attributeDefaultsScope", type: "select", label: { fr: "Quand l’appliquer", en: "When to apply" }, options: scopeOptions() },
                        {
                            key: "attributeDefaults",
                            type: "repeater",
                            label: { fr: "Valeurs configurées", en: "Configured values" },
                            addLabel: { fr: "Ajouter un attribut", en: "Add attribute" },
                            reorder: true,
                            newItem: attributeDefaultNew,
                            liveTitleKey: "name",
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Active", en: "Enabled" } },
                                { key: "name", type: "text", label: { fr: "Nom lisible", en: "Display name" } },
                                {
                                    key: "selector",
                                    type: "elementPicker",
                                    label: { fr: "Champ / attribut Koha", en: "Koha field / attribute" },
                                    pickLabel: { fr: "Choisir sur la page", en: "Choose on page" },
                                    allowManual: true,
                                    pick: function (context) { return pickSelector(context, "field"); }
                                },
                                {
                                    key: "valueMode",
                                    type: "select",
                                    label: { fr: "Comment renseigner la valeur", en: "How to set the value" },
                                    refreshOnChange: true,
                                    options: [
                                        { value: "selected-index", label: { fr: "Position dans une liste déroulante — par défaut", en: "Select option position — default" } },
                                        { value: "value", label: { fr: "Valeur du champ / option", en: "Field / option value" } },
                                        { value: "text", label: { fr: "Texte", en: "Text" } },
                                        { value: "checked", label: { fr: "Case cochée / décochée", en: "Checked / unchecked" } }
                                    ]
                                },
                                {
                                    key: "selectedIndex",
                                    type: "number",
                                    min: 0,
                                    step: 1,
                                    label: { fr: "Position (0 = premier choix)", en: "Position (0 = first option)" },
                                    when: function (root, path) { return attributeMode(root, path, "selected-index"); }
                                },
                                {
                                    key: "value",
                                    type: "text",
                                    label: { fr: "Valeur", en: "Value" },
                                    when: function (root, path) {
                                        const item = attributeItem(root, path);
                                        return Boolean(item && (item.valueMode === "value" || item.valueMode === "text"));
                                    }
                                },
                                {
                                    key: "checked",
                                    type: "boolean",
                                    label: { fr: "Cochée", en: "Checked" },
                                    when: function (root, path) { return attributeMode(root, path, "checked"); }
                                },
                                { key: "overwrite", type: "select", label: { fr: "Si le champ possède déjà une valeur", en: "If field already has a value" }, options: overwriteOptions() },
                                { key: "triggerChange", type: "boolean", label: { fr: "Déclencher aussi l’événement change", en: "Also trigger change event" } }
                            ]
                        }
                    ]
                },

                {
                    type: "section",
                    id: "userid",
                    label: { fr: "Génération de l’identifiant utilisateur", en: "User ID generation" },
                    description: {
                        fr: "Par défaut : si le champ Autres noms existe, construit prenom.nom à chaque saisie du prénom ou du nom, en retirant accents, espaces, tirets, apostrophes et parenthèses.",
                        en: "Default: if Other names exists, builds firstname.surname whenever firstname or surname changes, removing diacritics, spaces, hyphens, apostrophes and parentheses."
                    },
                    fields: [
                        { key: "useridEnabled", type: "boolean", label: { fr: "Activer cet automatisme", en: "Enable this automation" } },
                        { key: "useridScope", type: "select", label: { fr: "Quand l’appliquer", en: "When to apply" }, options: scopeOptions() },
                        {
                            key: "useridFirstnameSelector",
                            type: "elementPicker",
                            label: { fr: "Champ prénom", en: "Firstname field" },
                            pickLabel: { fr: "Choisir sur la page", en: "Choose on page" },
                            allowManual: true,
                            pick: function (context) { return pickSelector(context, "field"); }
                        },
                        {
                            key: "useridSurnameSelector",
                            type: "elementPicker",
                            label: { fr: "Champ nom", en: "Surname field" },
                            pickLabel: { fr: "Choisir sur la page", en: "Choose on page" },
                            allowManual: true,
                            pick: function (context) { return pickSelector(context, "field"); }
                        },
                        {
                            key: "useridTargetSelector",
                            type: "elementPicker",
                            label: { fr: "Champ identifiant utilisateur", en: "User ID field" },
                            pickLabel: { fr: "Choisir sur la page", en: "Choose on page" },
                            allowManual: true,
                            pick: function (context) { return pickSelector(context, "field"); }
                        },
                        {
                            key: "useridRequiredPresenceSelector",
                            type: "elementPicker",
                            label: { fr: "Champ dont la présence autorise l’automatisme", en: "Field whose presence enables automation" },
                            pickLabel: { fr: "Choisir sur la page", en: "Choose on page" },
                            allowManual: true,
                            clearable: true,
                            pick: function (context) { return pickSelector(context, "field"); },
                            help: {
                                fr: "Valeur par défaut : #othernames. Laisser vide supprime cette condition.",
                                en: "Default value: #othernames. Clear it to remove this condition."
                            }
                        },
                        {
                            key: "useridTemplate",
                            type: "text",
                            label: { fr: "Modèle de l’identifiant", en: "User ID template" },
                            help: {
                                fr: "Variables disponibles : {firstname} et {surname}. Par défaut : {firstname}.{surname}",
                                en: "Available variables: {firstname} and {surname}. Default: {firstname}.{surname}"
                            }
                        },
                        { key: "useridLowercase", type: "boolean", label: { fr: "Passer en minuscules", en: "Lowercase" } },
                        { key: "useridStripDiacritics", type: "boolean", label: { fr: "Retirer les accents", en: "Remove diacritics" } },
                        { key: "useridRemoveSpaces", type: "boolean", label: { fr: "Retirer les espaces", en: "Remove spaces" } },
                        { key: "useridRemoveHyphens", type: "boolean", label: { fr: "Retirer les tirets", en: "Remove hyphens" } },
                        { key: "useridRemoveApostrophes", type: "boolean", label: { fr: "Retirer les apostrophes", en: "Remove apostrophes" } },
                        { key: "useridRemoveParentheses", type: "boolean", label: { fr: "Retirer les parenthèses", en: "Remove parentheses" } },
                        {
                            key: "useridAdditionalRemoveRegex",
                            type: "text",
                            label: { fr: "Autres caractères à retirer (expression régulière)", en: "Other characters to remove (regular expression)" }
                        },
                        { key: "useridOverwrite", type: "select", label: { fr: "Si l’identifiant contient déjà une valeur", en: "If User ID already has a value" }, options: overwriteOptions() },
                        { key: "useridUpdateOnLoad", type: "boolean", label: { fr: "Calculer aussi à l’ouverture de la fiche", en: "Also calculate when form opens" } },
                        { key: "useridListenInput", type: "boolean", label: { fr: "Recalculer pendant la saisie — par défaut", en: "Recalculate while editing — default" } },
                        { key: "useridListenChange", type: "boolean", label: { fr: "Recalculer au changement", en: "Recalculate on change" } }
                    ]
                }
            ]
        };
    }

    function mountContextAccess() {
        const api = window.PMKConfig;
        if (!api || typeof api.mountContextButton !== "function" || !isMemberEntryPage()) return;

        let anchor =
            safeQuery("#pat_memberentrygen legend") ||
            safeQuery("#pat_memberentrygen h1") ||
            safeQuery("main h1") ||
            safeQuery("h1");

        if (!anchor) return;

        try {
            api.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "append",
                contextKey: CONTEXT_KEY,
                context: {
                    sectionId: "information",
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

        if (!unsubscribe && typeof window.PMKConfig.subscribe === "function") {
            unsubscribe = window.PMKConfig.subscribe(MODULE_ID, function (next) {
                applyConfig(next || DEFAULT_CONFIG);
            });
        }

        return true;
    }

    function startWithoutCore() {
        applyConfig(DEFAULT_CONFIG);

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
         * Quelques repassages très légers uniquement pour l'accès contextuel.
         * Les automatismes eux-mêmes ne sont PAS réappliqués en boucle afin
         * de ne jamais écraser une saisie utilisateur à cause d'une mutation DOM.
         */
        window.setTimeout(mountContextAccess, 400);
        window.setTimeout(mountContextAccess, 1200);
    }

    window.PMK057PatronPageUtils = {
        version: MODULE_VERSION,
        moduleId: MODULE_ID,
        defaults: clone(DEFAULT_CONFIG),
        normalizeConfig: normalizeConfig,
        applyConfig: applyConfig,
        stop: stopRuntime,
        detectFormMode: currentFormMode
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();

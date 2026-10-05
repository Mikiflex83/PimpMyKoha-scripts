/*
 Nom du fichier : 118-mail-tel-obligatoire.js
 Module PMK      : patron-required-contact
 Version         : 3.1.0-preplugin
 Date            : 2026-09-20
 Auteur          : Michael Mundet / refactorisation PimpMyKoha

 Objectif :
 - conserver le comportement historique du script 118 sur memberentry.pl ;
 - rendre la règle portable et configurable sans toucher au JavaScript ;
 - permettre, champ par champ, trois états : ignoré, obligatoire seul, ou membre d'un groupe ;
 - permettre à chaque groupe d'exiger au moins N champs renseignés ;
 - conserver exactement le preset Dracénie par défaut :
      #phone, #mobile, #email, #emailpro dans le groupe "contact",
      minimum 1, aucun champ individuellement obligatoire ;
 - conserver le rendu historique par défaut : messages sous champs, bordures rouges,
   bloc contact surligné, scroll/focus et secousse du bouton de sauvegarde ;
 - reprendre la mécanique historique de blocage Koha : submit + check_form_borrowers + clic sauvegarde ;
 - chaîner check_form_borrowers de façon réversible pour conserver la validation native Koha ;
 - utiliser stopImmediatePropagation uniquement quand notre validation échoue, comme le legacy.

 Dépendance : 000-pmk-config-firestore.js optionnelle au runtime.
 Sans PMK, les valeurs Dracénie intégrées ci-dessous sont appliquées.
*/
(function (window, document) {
    "use strict";

    if (!window || !document) return;
    if (window.__PMK118RequiredContactV3) return;
    window.__PMK118RequiredContactV3 = true;

    const MODULE_ID = "patron-required-contact";
    const MODULE_VERSION = "3.1.0-preplugin";
    const MEMBERENTRY_FRAGMENT = "/cgi-bin/koha/members/memberentry.pl";

    const STANDARD_FIELDS = Object.freeze({
        phone:            { selector: "#phone",            fr: "Téléphone principal",       en: "Primary phone" },
        mobile:           { selector: "#mobile",           fr: "Mobile",                    en: "Mobile phone" },
        phonepro:         { selector: "#phonepro",         fr: "Téléphone professionnel",   en: "Work phone" },
        email:            { selector: "#email",            fr: "Courriel",                  en: "Email" },
        emailpro:         { selector: "#emailpro",         fr: "Courriel professionnel",    en: "Work email" },
        fax:              { selector: "#fax",              fr: "Fax",                       en: "Fax" },
        B_phone:          { selector: "#B_phone",          fr: "Téléphone adresse alternative", en: "Alternate address phone" },
        B_email:          { selector: "#B_email",          fr: "Courriel adresse alternative",  en: "Alternate address email" },
        altcontactphone:  { selector: "#altcontactphone",  fr: "Téléphone contact alternatif",  en: "Alternate contact phone" },
        smsalertnumber:   { selector: "#SMSnumber, #smsalertnumber", fr: "Numéro SMS",       en: "SMS number" }
    });

    const DEFAULT_CONFIG = Object.freeze({
        enabled: true,
        scope: "both",
        contactContainerSelector: "#memberentry_contact",
        saveButtonSelector: "#saverecord",
        fields: [
            {
                id: "legacy-phone",
                enabled: true,
                source: "phone",
                customSelector: "",
                labelFr: "Téléphone principal",
                labelEn: "Primary phone",
                rule: "group",
                groupId: "contact"
            },
            {
                id: "legacy-mobile",
                enabled: true,
                source: "mobile",
                customSelector: "",
                labelFr: "Mobile",
                labelEn: "Mobile phone",
                rule: "group",
                groupId: "contact"
            },
            {
                id: "legacy-email",
                enabled: true,
                source: "email",
                customSelector: "",
                labelFr: "Courriel",
                labelEn: "Email",
                rule: "group",
                groupId: "contact"
            },
            {
                id: "legacy-emailpro",
                enabled: true,
                source: "emailpro",
                customSelector: "",
                labelFr: "Courriel professionnel",
                labelEn: "Work email",
                rule: "group",
                groupId: "contact"
            }
        ],
        groups: [
            {
                id: "contact",
                enabled: true,
                labelFr: "Contact",
                labelEn: "Contact",
                minRequired: 1,
                messageFr: "Au moins un champ de contact est obligatoire",
                messageEn: "At least one contact field is required"
            }
        ],
        requiredMessageFr: "Ce champ de contact est obligatoire",
        requiredMessageEn: "This contact field is required",
        appearance: {
            fieldErrorColor: "#cc0000",
            fieldErrorBackground: "#fff5f5",
            containerBorder: "2px solid #cc0000",
            containerBackground: "#fffafa",
            containerPadding: "10px",
            containerBorderRadius: "5px"
        }
    });

    let currentConfig = null;
    let registered = false;
    let unsubscribe = null;
    let boundForm = null;
    let boundSaveButton = null;
    let hasVisibleErrors = false;

    // Le script historique protégeait la sauvegarde à trois niveaux :
    // submit du formulaire, check_form_borrowers et clic sur Enregistrer.
    // On conserve cette mécanique, mais le patch de la fonction Koha est réversible.
    let originalCheckFormBorrowers = null;
    let patchedCheckFormBorrowers = null;
    let checkFormPatchTimer = null;
    let checkFormPatchAttempts = 0;

    const fieldOriginalStyles = new WeakMap();
    const containerOriginalStyles = new WeakMap();

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function clean(value) {
        return String(value == null ? "" : value).trim();
    }

    function lang() {
        const value = String(document.documentElement.lang || "fr").toLowerCase();
        return value.indexOf("en") === 0 ? "en" : "fr";
    }

    function text(fr, en) {
        return lang() === "en" ? (en || fr || "") : (fr || en || "");
    }

    function mergeObject(base, raw) {
        const out = clone(base);
        if (!raw || typeof raw !== "object") return out;
        Object.keys(raw).forEach(function (key) {
            if (Array.isArray(raw[key])) out[key] = clone(raw[key]);
            else if (raw[key] && typeof raw[key] === "object" && !Array.isArray(raw[key])) {
                out[key] = Object.assign({}, out[key] || {}, raw[key]);
            } else out[key] = raw[key];
        });
        return out;
    }

    function normalizeField(field, index) {
        const raw = field || {};
        let source = clean(raw.source) || "phone";
        if (source !== "custom" && !STANDARD_FIELDS[source]) source = "custom";

        let rule = clean(raw.rule) || "ignored";
        if (["ignored", "required", "group"].indexOf(rule) === -1) rule = "ignored";

        const std = STANDARD_FIELDS[source] || {};
        return {
            id: clean(raw.id) || ("field-" + (index + 1)),
            enabled: raw.enabled !== false,
            source: source,
            customSelector: clean(raw.customSelector),
            labelFr: clean(raw.labelFr) || std.fr || ("Champ " + (index + 1)),
            labelEn: clean(raw.labelEn) || std.en || ("Field " + (index + 1)),
            rule: rule,
            groupId: clean(raw.groupId)
        };
    }

    function normalizeGroup(group, index) {
        const raw = group || {};
        let min = parseInt(raw.minRequired, 10);
        if (!Number.isFinite(min) || min < 1) min = 1;
        return {
            id: clean(raw.id) || ("group-" + (index + 1)),
            enabled: raw.enabled !== false,
            labelFr: clean(raw.labelFr) || ("Groupe " + (index + 1)),
            labelEn: clean(raw.labelEn) || ("Group " + (index + 1)),
            minRequired: min,
            messageFr: clean(raw.messageFr) || "Au moins un champ de ce groupe est obligatoire",
            messageEn: clean(raw.messageEn) || "At least one field in this group is required"
        };
    }

    function normalizeConfig(raw) {
        const cfg = mergeObject(DEFAULT_CONFIG, raw || {});
        cfg.enabled = cfg.enabled !== false;
        if (["create", "edit", "both"].indexOf(cfg.scope) === -1) cfg.scope = "both";
        cfg.contactContainerSelector = clean(cfg.contactContainerSelector) || "#memberentry_contact";
        cfg.saveButtonSelector = clean(cfg.saveButtonSelector) || "#saverecord";
        cfg.fields = (Array.isArray(cfg.fields) ? cfg.fields : DEFAULT_CONFIG.fields).map(normalizeField);
        cfg.groups = (Array.isArray(cfg.groups) ? cfg.groups : DEFAULT_CONFIG.groups).map(normalizeGroup);
        cfg.requiredMessageFr = clean(cfg.requiredMessageFr) || DEFAULT_CONFIG.requiredMessageFr;
        cfg.requiredMessageEn = clean(cfg.requiredMessageEn) || DEFAULT_CONFIG.requiredMessageEn;
        cfg.appearance = Object.assign({}, DEFAULT_CONFIG.appearance, cfg.appearance || {});
        return cfg;
    }

    function isMemberEntry() {
        return window.location.pathname.indexOf("memberentry.pl") !== -1;
    }

    function detectFormMode(form) {
        if (!form) return "create";
        const explicit = form.querySelector('input[name="borrowernumber"], #borrowernumber');
        if (explicit && clean(explicit.value)) return "edit";
        const params = new URLSearchParams(window.location.search || "");
        if (clean(params.get("borrowernumber"))) return "edit";
        return "create";
    }

    function scopeAllows(cfg, form) {
        if (!cfg || cfg.scope === "both") return true;
        return cfg.scope === detectFormMode(form);
    }

    function selectorForRule(rule) {
        if (!rule) return "";
        if (rule.source === "custom") return clean(rule.customSelector);
        const std = STANDARD_FIELDS[rule.source];
        return std ? std.selector : "";
    }

    function safeQuery(selector, root) {
        if (!selector) return null;
        try {
            return (root || document).querySelector(selector);
        } catch (_) {
            return null;
        }
    }

    function resolveRuntimeFields(cfg, form) {
        const rows = [];
        (cfg.fields || []).forEach(function (rule, index) {
            if (!rule || rule.enabled === false || rule.rule === "ignored") return;
            const selector = selectorForRule(rule);
            const element = safeQuery(selector, form) || safeQuery(selector, document);
            if (!element) return; // champ masqué/absent sur cette installation : ignoré, fail-open
            rows.push({
                index: index,
                rule: rule,
                selector: selector,
                element: element,
                label: text(rule.labelFr, rule.labelEn)
            });
        });
        return rows;
    }

    function valuePresent(element) {
        if (!element) return false;
        if (element.type === "checkbox" || element.type === "radio") return !!element.checked;
        return clean(element.value) !== "";
    }

    function rememberFieldStyle(field) {
        if (!field || fieldOriginalStyles.has(field)) return;
        fieldOriginalStyles.set(field, {
            borderColor: field.style.borderColor,
            backgroundColor: field.style.backgroundColor
        });
    }

    function restoreFieldStyle(field) {
        if (!field) return;
        const saved = fieldOriginalStyles.get(field);
        field.style.borderColor = saved ? saved.borderColor : "";
        field.style.backgroundColor = saved ? saved.backgroundColor : "";
        fieldOriginalStyles.delete(field);
    }

    function errorIdFor(field) {
        const raw = clean(field && field.id) || clean(field && field.name) || "field";
        return "pmk118-error-" + raw.replace(/[^A-Za-z0-9_-]/g, "-");
    }

    function removeFieldError(field) {
        if (!field) return;
        const id = errorIdFor(field);
        const node = document.getElementById(id);
        if (node && node.getAttribute("data-pmk118-owned") === "1") node.remove();
        restoreFieldStyle(field);
        field.removeAttribute("aria-invalid");
        const described = clean(field.getAttribute("aria-describedby"));
        if (described) {
            const kept = described.split(/\s+/).filter(function (token) { return token !== id; });
            if (kept.length) field.setAttribute("aria-describedby", kept.join(" "));
            else field.removeAttribute("aria-describedby");
        }
    }

    function addFieldError(field, message, cfg) {
        if (!field) return;
        removeFieldError(field);
        rememberFieldStyle(field);

        const host = field.closest("li") || field.parentElement;
        if (!host) return;

        const error = document.createElement("span");
        error.id = errorIdFor(field);
        error.className = "field-error-message pmk118-field-error-message";
        error.setAttribute("data-pmk118-owned", "1");
        error.style.cssText = "color: " + cfg.appearance.fieldErrorColor + "; font-size: 12px; display: block; margin-top: 5px; font-weight: normal;";
        error.textContent = "⚠️ " + message;
        host.appendChild(error);

        field.style.borderColor = cfg.appearance.fieldErrorColor;
        field.style.backgroundColor = cfg.appearance.fieldErrorBackground;
        field.setAttribute("aria-invalid", "true");
        const described = clean(field.getAttribute("aria-describedby"));
        field.setAttribute("aria-describedby", clean(described + " " + error.id));
    }

    function resolveContainer(cfg, runtimeFields) {
        let container = safeQuery(cfg.contactContainerSelector, document);
        if (container) return container;
        if (runtimeFields && runtimeFields.length) {
            container = runtimeFields[0].element.closest("fieldset");
        }
        return container || null;
    }

    function rememberContainerStyle(container) {
        if (!container || containerOriginalStyles.has(container)) return;
        containerOriginalStyles.set(container, {
            border: container.style.border,
            padding: container.style.padding,
            borderRadius: container.style.borderRadius,
            backgroundColor: container.style.backgroundColor
        });
    }

    function highlightContainer(container, cfg) {
        if (!container) return;
        rememberContainerStyle(container);
        container.style.border = cfg.appearance.containerBorder;
        container.style.padding = cfg.appearance.containerPadding;
        container.style.borderRadius = cfg.appearance.containerBorderRadius;
        container.style.backgroundColor = cfg.appearance.containerBackground;
    }

    function restoreContainer(container) {
        if (!container) return;
        const saved = containerOriginalStyles.get(container);
        container.style.border = saved ? saved.border : "";
        container.style.padding = saved ? saved.padding : "";
        container.style.borderRadius = saved ? saved.borderRadius : "";
        container.style.backgroundColor = saved ? saved.backgroundColor : "";
        containerOriginalStyles.delete(container);
    }

    function clearAllErrors() {
        document.querySelectorAll('[data-pmk118-owned="1"].pmk118-field-error-message').forEach(function (node) {
            node.remove();
        });
        fieldOriginalStyles.forEach ? fieldOriginalStyles.forEach(function () {}) : null;
        if (boundForm && currentConfig) {
            resolveRuntimeFields(currentConfig, boundForm).forEach(function (row) {
                removeFieldError(row.element);
            });
            restoreContainer(resolveContainer(currentConfig, resolveRuntimeFields(currentConfig, boundForm)));
        }
        hasVisibleErrors = false;
    }

    function buildValidation(cfg, form) {
        const runtimeFields = resolveRuntimeFields(cfg, form);
        const invalid = [];

        runtimeFields.forEach(function (row) {
            if (row.rule.rule === "required" && !valuePresent(row.element)) {
                invalid.push({
                    row: row,
                    message: text(cfg.requiredMessageFr, cfg.requiredMessageEn),
                    type: "required"
                });
            }
        });

        const groupsById = {};
        (cfg.groups || []).forEach(function (group) {
            if (!group || group.enabled === false) return;
            groupsById[group.id] = group;
        });

        Object.keys(groupsById).forEach(function (groupId) {
            const group = groupsById[groupId];
            const members = runtimeFields.filter(function (row) {
                return row.rule.rule === "group" && row.rule.groupId === groupId;
            });
            if (!members.length) return;

            const filled = members.filter(function (row) { return valuePresent(row.element); }).length;
            // Si certains champs du groupe sont masqués par la configuration Koha,
            // la règle reste réalisable avec les champs réellement présents.
            const effectiveMin = Math.min(Math.max(1, group.minRequired), members.length);
            if (filled >= effectiveMin) return;

            const message = text(group.messageFr, group.messageEn);
            members.forEach(function (row) {
                if (!valuePresent(row.element)) {
                    invalid.push({ row: row, message: message, type: "group", groupId: groupId });
                }
            });
        });

        return {
            ok: invalid.length === 0,
            invalid: invalid,
            runtimeFields: runtimeFields,
            container: resolveContainer(cfg, runtimeFields)
        };
    }

    function renderValidation(result, cfg) {
        result.runtimeFields.forEach(function (row) { removeFieldError(row.element); });
        restoreContainer(result.container);

        if (result.ok) {
            hasVisibleErrors = false;
            return;
        }

        result.invalid.forEach(function (entry) {
            addFieldError(entry.row.element, entry.message, cfg);
        });
        highlightContainer(result.container, cfg);
        hasVisibleErrors = true;
    }

    function shakeSaveButton() {
        const button = boundSaveButton;
        if (!button) return;
        const originalTransform = button.style.transform;
        const steps = [
            [-5, 0],
            [5, 100],
            [-3, 200],
            [3, 300],
            [0, 400]
        ];
        steps.forEach(function (step) {
            window.setTimeout(function () {
                button.style.transform = step[0] === 0 ? originalTransform : ("translateX(" + step[0] + "px)");
            }, step[1]);
        });
    }

    function rejectSubmission(result, cfg) {
        renderValidation(result, cfg);
        shakeSaveButton();
        const first = result.invalid.length ? result.invalid[0].row.element : null;
        if (first) {
            try { first.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) {}
            try { first.focus({ preventScroll: true }); } catch (_) { try { first.focus(); } catch (__) {} }
        }
    }

    function validateNow(showErrors) {
        if (!boundForm || !currentConfig || currentConfig.enabled === false || !scopeAllows(currentConfig, boundForm)) {
            return { ok: true, invalid: [], runtimeFields: [], container: null };
        }
        const result = buildValidation(currentConfig, boundForm);
        if (showErrors) renderValidation(result, currentConfig);
        return result;
    }

    function onFormInput(event) {
        if (!hasVisibleErrors || !currentConfig || !boundForm) return;
        const rows = resolveRuntimeFields(currentConfig, boundForm);
        const belongs = rows.some(function (row) { return row.element === event.target; });
        if (!belongs) return;
        renderValidation(buildValidation(currentConfig, boundForm), currentConfig);
    }

    function onFormBlur(event) {
        if (!hasVisibleErrors || !currentConfig || !boundForm) return;
        const rows = resolveRuntimeFields(currentConfig, boundForm);
        const belongs = rows.some(function (row) { return row.element === event.target; });
        if (!belongs) return;
        renderValidation(buildValidation(currentConfig, boundForm), currentConfig);
    }

    // Validation commune aux trois méthodes historiques de sauvegarde.
    // Retourne true si Koha peut poursuivre, false si PMK doit bloquer.
    function validateBeforeKohaSubmit() {
        if (!currentConfig || currentConfig.enabled === false || !boundForm || !scopeAllows(currentConfig, boundForm)) {
            return true;
        }
        const result = buildValidation(currentConfig, boundForm);
        if (result.ok) {
            renderValidation(result, currentConfig);
            return true;
        }
        rejectSubmission(result, currentConfig);
        return false;
    }

    // Méthode historique 1 : interception du submit réel du formulaire.
    function onSubmit(event) {
        if (validateBeforeKohaSubmit()) return;
        event.preventDefault();
        event.stopPropagation();
    }

    // Méthode historique 3 : interception du clic avant les handlers Koha.
    // Le stopImmediatePropagation n'est utilisé QUE quand la règle PMK échoue.
    // Quand tout est valide, on ne touche à rien et Koha poursuit son cycle normal.
    function onSaveClick(event) {
        if (validateBeforeKohaSubmit()) return;
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    }

    // Méthode historique 2 : chaînage de check_form_borrowers.
    // C'est indispensable sur Koha car certains chemins de sauvegarde passent par cette
    // fonction et peuvent contourner un simple preventDefault sur le bouton.
    function installCheckFormPatch() {
        if (!boundForm || !currentConfig || currentConfig.enabled === false) return false;

        if (patchedCheckFormBorrowers && window.check_form_borrowers === patchedCheckFormBorrowers) {
            return true;
        }

        const kohaCheck = window.check_form_borrowers;
        if (typeof kohaCheck !== "function") return false;

        originalCheckFormBorrowers = kohaCheck;
        patchedCheckFormBorrowers = function () {
            if (!validateBeforeKohaSubmit()) return false;
            return kohaCheck.apply(this, arguments);
        };
        patchedCheckFormBorrowers.__pmk118 = true;
        patchedCheckFormBorrowers.__pmk118Original = originalCheckFormBorrowers;
        window.check_form_borrowers = patchedCheckFormBorrowers;
        return true;
    }

    function scheduleCheckFormPatch() {
        if (installCheckFormPatch()) return;
        checkFormPatchAttempts = 0;

        const retry = function () {
            checkFormPatchTimer = null;
            if (!boundForm || !currentConfig || currentConfig.enabled === false) return;
            if (installCheckFormPatch()) return;
            checkFormPatchAttempts += 1;
            if (checkFormPatchAttempts < 30) {
                checkFormPatchTimer = window.setTimeout(retry, 100);
            }
        };

        checkFormPatchTimer = window.setTimeout(retry, 100);
    }

    function restoreCheckFormPatch() {
        if (checkFormPatchTimer !== null) {
            window.clearTimeout(checkFormPatchTimer);
            checkFormPatchTimer = null;
        }
        checkFormPatchAttempts = 0;

        // Ne restaure la fonction que si notre wrapper est encore celui installé.
        // Si un autre script a remplacé check_form_borrowers après nous, on ne l'écrase pas.
        if (patchedCheckFormBorrowers && window.check_form_borrowers === patchedCheckFormBorrowers) {
            window.check_form_borrowers = originalCheckFormBorrowers;
        }
        originalCheckFormBorrowers = null;
        patchedCheckFormBorrowers = null;
    }

    function unbindRuntime() {
        restoreCheckFormPatch();
        if (boundForm) {
            boundForm.removeEventListener("submit", onSubmit, true);
            boundForm.removeEventListener("input", onFormInput, true);
            boundForm.removeEventListener("blur", onFormBlur, true);
        }
        if (boundSaveButton) boundSaveButton.removeEventListener("click", onSaveClick, true);
        clearAllErrors();
        boundForm = null;
        boundSaveButton = null;
    }

    function bindRuntime(cfg) {
        if (!isMemberEntry()) return;
        const form = document.getElementById("entryform");
        if (!form) return;
        if (!scopeAllows(cfg, form)) return;

        boundForm = form;
        boundSaveButton = safeQuery(cfg.saveButtonSelector, document);

        // Même ordre de protection que le script historique.
        boundForm.addEventListener("submit", onSubmit, true);
        boundForm.addEventListener("input", onFormInput, true);
        boundForm.addEventListener("blur", onFormBlur, true);
        if (boundSaveButton) boundSaveButton.addEventListener("click", onSaveClick, true);
        scheduleCheckFormPatch();

        // Comme le legacy : si le formulaire chargé possède déjà un contact valide,
        // aucun état d'erreur ne reste affiché.
        const initial = buildValidation(cfg, form);
        if (initial.ok) renderValidation(initial, cfg);
    }

    function applyConfig(raw) {
        unbindRuntime();
        currentConfig = normalizeConfig(raw || DEFAULT_CONFIG);
        if (!currentConfig.enabled) return;
        bindRuntime(currentConfig);
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

    function isCustomField(root, path) {
        const item = itemFromPath(root, path, "fields");
        return Boolean(item && item.source === "custom");
    }

    function isGroupedField(root, path) {
        const item = itemFromPath(root, path, "fields");
        return Boolean(item && item.rule === "group");
    }

    function sourceOptions() {
        const options = Object.keys(STANDARD_FIELDS).map(function (key) {
            const f = STANDARD_FIELDS[key];
            return { value: key, label: { fr: f.fr, en: f.en } };
        });
        options.push({ value: "custom", label: { fr: "Champ personnalisé (sélecteur CSS)", en: "Custom field (CSS selector)" } });
        return options;
    }

    function ruleOptions() {
        return [
            { value: "ignored", label: { fr: "Ignoré", en: "Ignored" } },
            { value: "required", label: { fr: "Obligatoire individuellement", en: "Individually required" } },
            { value: "group", label: { fr: "Membre d’un groupe alternatif", en: "Member of an alternative group" } }
        ];
    }

    function scopeOptions() {
        return [
            { value: "both", label: { fr: "Création et modification", en: "Create and edit" } },
            { value: "create", label: { fr: "Création uniquement", en: "Create only" } },
            { value: "edit", label: { fr: "Modification uniquement", en: "Edit only" } }
        ];
    }

    function newField() {
        return {
            id: "field-" + Date.now().toString(36),
            enabled: true,
            source: "phone",
            customSelector: "",
            labelFr: "Nouveau champ",
            labelEn: "New field",
            rule: "ignored",
            groupId: "contact"
        };
    }

    function newGroup() {
        const suffix = Date.now().toString(36);
        return {
            id: "group-" + suffix,
            enabled: true,
            labelFr: "Nouveau groupe",
            labelEn: "New group",
            minRequired: 1,
            messageFr: "Au moins un champ de ce groupe est obligatoire",
            messageEn: "At least one field in this group is required"
        };
    }

    function validateConfig(raw) {
        const cfg = normalizeConfig(raw || {});
        const ids = new Set();
        for (let i = 0; i < cfg.groups.length; i += 1) {
            const g = cfg.groups[i];
            if (!g.id) return { ok: false, message: "Chaque groupe doit avoir un identifiant." };
            if (ids.has(g.id)) return { ok: false, message: "Chaque groupe doit avoir un identifiant unique." };
            ids.add(g.id);
            if (g.minRequired < 1) return { ok: false, message: "Le minimum requis d’un groupe doit être supérieur ou égal à 1." };
        }

        for (let j = 0; j < cfg.fields.length; j += 1) {
            const f = cfg.fields[j];
            if (f.source === "custom" && f.enabled && f.rule !== "ignored") {
                if (!f.customSelector) return { ok: false, message: "Un champ personnalisé actif doit avoir un sélecteur CSS." };
                try { document.querySelector(f.customSelector); } catch (_) {
                    return { ok: false, message: "Sélecteur CSS invalide pour le champ « " + (f.labelFr || f.id) + " »." };
                }
            }
            if (f.rule === "group" && f.enabled && !f.groupId) {
                return { ok: false, message: "Un champ de groupe doit indiquer l’identifiant du groupe." };
            }
        }
        return { ok: true };
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 3,
            name: { fr: "Coordonnées obligatoires", en: "Required contact details" },
            description: {
                fr: "Contrôle les coordonnées sur memberentry.pl. Chaque champ peut être ignoré, obligatoire individuellement ou intégré à un groupe exigeant au moins N valeurs renseignées. Le preset Dracénie historique est fourni par défaut.",
                en: "Validates contact details on memberentry.pl. Each field can be ignored, individually required, or placed in a group requiring at least N filled values. The historical Dracénie preset is the default."
            },
            category: { fr: "Adhérents", en: "Patrons" },
            supportedPages: [MEMBERENTRY_FRAGMENT],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            validate: validateConfig,
            schema: [
                {
                    type: "section",
                    id: "activation",
                    label: { fr: "Activation", en: "Activation" },
                    fields: [
                        { key: "enabled", type: "boolean", label: { fr: "Activer le contrôle des coordonnées", en: "Enable contact validation" } },
                        { key: "scope", type: "select", label: { fr: "Appliquer lors de", en: "Apply when" }, options: scopeOptions() }
                    ]
                },
                {
                    type: "section",
                    id: "fields",
                    label: { fr: "Champs contrôlés", en: "Controlled fields" },
                    description: {
                        fr: "Pour chaque champ : Ignoré = aucune contrainte ; Obligatoire individuellement = ce champ doit être rempli ; Groupe = il participe à une règle « au moins N parmi ». Les champs absents du formulaire Koha courant sont ignorés.",
                        en: "For each field: Ignored = no constraint; Individually required = this field must be filled; Group = it participates in an 'at least N among' rule. Fields absent from the current Koha form are ignored."
                    },
                    fields: [
                        {
                            key: "fields",
                            type: "repeater",
                            label: { fr: "Champs", en: "Fields" },
                            addLabel: { fr: "Ajouter un champ", en: "Add field" },
                            reorder: true,
                            newItem: newField,
                            itemTitle: function (item, index, currentLang) {
                                const l = currentLang === "en" ? clean(item && item.labelEn) : clean(item && item.labelFr);
                                return l || (currentLang === "en" ? "Field " : "Champ ") + (index + 1);
                            },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Actif", en: "Enabled" } },
                                { key: "labelFr", type: "text", label: { fr: "Libellé français", en: "French label" } },
                                { key: "labelEn", type: "text", label: { fr: "Libellé anglais", en: "English label" } },
                                { key: "source", type: "select", refreshOnChange: true, label: { fr: "Champ Koha", en: "Koha field" }, options: sourceOptions() },
                                {
                                    key: "customSelector",
                                    type: "text",
                                    label: { fr: "Sélecteur CSS personnalisé", en: "Custom CSS selector" },
                                    when: isCustomField
                                },
                                { key: "rule", type: "select", refreshOnChange: true, label: { fr: "Règle", en: "Rule" }, options: ruleOptions() },
                                {
                                    key: "groupId",
                                    type: "text",
                                    label: { fr: "Identifiant du groupe", en: "Group ID" },
                                    help: { fr: "Doit correspondre à un groupe défini ci-dessous.", en: "Must match a group defined below." },
                                    when: isGroupedField
                                },
                                { key: "id", type: "text", readOnly: true, advanced: true, label: { fr: "Identifiant technique", en: "Technical ID" } }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "groups",
                    label: { fr: "Groupes alternatifs", en: "Alternative groups" },
                    description: {
                        fr: "Exemple : phone + mobile dans le groupe « téléphone », minimum 1 = au moins l’un des deux doit être renseigné.",
                        en: "Example: phone + mobile in the 'phone' group, minimum 1 = at least one of them must be filled."
                    },
                    fields: [
                        {
                            key: "groups",
                            type: "repeater",
                            label: { fr: "Groupes", en: "Groups" },
                            addLabel: { fr: "Ajouter un groupe", en: "Add group" },
                            reorder: true,
                            newItem: newGroup,
                            itemTitle: function (item, index, currentLang) {
                                const l = currentLang === "en" ? clean(item && item.labelEn) : clean(item && item.labelFr);
                                return l || (currentLang === "en" ? "Group " : "Groupe ") + (index + 1);
                            },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Actif", en: "Enabled" } },
                                { key: "id", type: "text", label: { fr: "Identifiant du groupe", en: "Group ID" } },
                                { key: "labelFr", type: "text", label: { fr: "Nom français", en: "French name" } },
                                { key: "labelEn", type: "text", label: { fr: "Nom anglais", en: "English name" } },
                                { key: "minRequired", type: "number", min: 1, step: 1, label: { fr: "Nombre minimum de champs renseignés", en: "Minimum number of filled fields" } },
                                { key: "messageFr", type: "text", label: { fr: "Message d’erreur français", en: "French error message" } },
                                { key: "messageEn", type: "text", label: { fr: "Message d’erreur anglais", en: "English error message" } }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "messages",
                    label: { fr: "Champs obligatoires seuls", en: "Individually required fields" },
                    fields: [
                        { key: "requiredMessageFr", type: "text", label: { fr: "Message français", en: "French message" } },
                        { key: "requiredMessageEn", type: "text", label: { fr: "Message anglais", en: "English message" } }
                    ]
                },
                {
                    type: "section",
                    id: "advanced",
                    advanced: true,
                    label: { fr: "Avancé", en: "Advanced" },
                    fields: [
                        { key: "contactContainerSelector", type: "text", label: { fr: "Conteneur contact", en: "Contact container" } },
                        { key: "saveButtonSelector", type: "text", label: { fr: "Bouton de sauvegarde", en: "Save button" } }
                    ]
                }
            ]
        };
    }

    function registerWithPMK() {
        if (registered || !window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return false;
        try {
            window.PMKConfig.registerModule(moduleDefinition());
            registered = true;
        } catch (_) {
            return false;
        }

        if (typeof window.PMKConfig.subscribe === "function") {
            try { unsubscribe = window.PMKConfig.subscribe(MODULE_ID, applyConfig); } catch (_) {}
        }

        if (typeof window.PMKConfig.getConfig === "function") {
            Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
                .then(function (cfg) { applyConfig(cfg || DEFAULT_CONFIG); })
                .catch(function () { applyConfig(DEFAULT_CONFIG); });
        } else {
            applyConfig(DEFAULT_CONFIG);
        }
        return true;
    }

    function start() {
        const run = function () {
            if (!isMemberEntry()) return;
            if (!registerWithPMK()) {
                applyConfig(DEFAULT_CONFIG);
                window.addEventListener("pmk:config-ready", function () { registerWithPMK(); }, { once: true });
            }
        };
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
        else run();
    }

    window.PMK118RequiredContact = {
        moduleId: MODULE_ID,
        version: MODULE_VERSION,
        defaults: clone(DEFAULT_CONFIG),
        standardFields: clone(STANDARD_FIELDS),
        apply: applyConfig,
        validateNow: function (showErrors) { return validateNow(showErrors !== false); },
        refresh: function () {
            if (window.PMKConfig && typeof window.PMKConfig.getConfig === "function") {
                return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID)).then(function (cfg) {
                    applyConfig(cfg || DEFAULT_CONFIG);
                    return currentConfig;
                });
            }
            applyConfig(DEFAULT_CONFIG);
            return Promise.resolve(currentConfig);
        }
    };

    window.addEventListener("beforeunload", function () {
        unbindRuntime();
        if (typeof unsubscribe === "function") {
            try { unsubscribe(); } catch (_) {}
        }
    }, { once: true });

    start();
})(window, document);

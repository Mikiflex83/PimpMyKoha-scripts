/*
 Nom du fichier: 017-gestion-litiges-select.js
 Version: 3.2.1
 Date de dernière modification: 2026-09-19
 Auteur: Michael Mundet / adaptation PimpMyKoha
 Description:
 - Moteur transversal « Aides à la saisie ».
 - Fusionne le 017 historique et le 047-request-dropdowns.js.
 - Conserve strictement les valeurs prédéfinies des deux scripts historiques.
 - Le 017 reste en mode ajout de texte dans #borrower_message.
 - Le 047 devient un profil structuré sur #holdnotes.
 - Chaque liste choisit désormais son effet sur la cible : ajouter ou remplacer tout le contenu.
 - Chaque profil choisit la disposition des listes : côte à côte ou les unes sous les autres.
 - Ne remplace plus jamais #non_priority_list_item.
 - Cible et emplacement sélectionnables avec le picker commun PMK.
 - Aperçu intégré + aperçu live via PMKConfig.visualEditor.
 - Configuration centralisée via 000-pmk-config-firestore.js.
*/
(function () {
    "use strict";

    if (window.__PMK017_INPUT_HELPERS__) return;
    window.__PMK017_INPUT_HELPERS__ = true;
    window.__PMK_047_MERGED_INTO_017__ = true;

    const MODULE_ID = "patron-message-templates";
    const MODULE_VERSION = "3.2.1";
    const WRAPPER_CLASS = "pmk-input-helper";
    const STYLE_ID = "pmk-input-helper-styles";

    function clone(value) {
        return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }

    function language() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            return window.PMKConfig.getLanguage();
        }
        const htmlLang = String(document.documentElement.lang || navigator.language || "").toLowerCase();
        return htmlLang.startsWith("en") ? "en" : "fr";
    }

    function i18n(fr, en) {
        return language() === "en" ? en : fr;
    }

    function makeId(prefix) {
        return String(prefix || "profile") + "-" + Date.now().toString(36) + "-" +
            Math.random().toString(36).slice(2, 8);
    }

    const LEGACY_017_GROUPS = [
        {
            enabled: true,
            label: "Gestion des litiges",
            targetAction: "append",
            messages: [
                { enabled: true, label: "Adhérent contacté", text: "Adhérent contacté" },
                { enabled: true, label: "Document perdu : [Numéro exemplaire]", text: "Document perdu : [Numéro exemplaire]" },
                { enabled: true, label: "Document abîmé : [Numéro exemplaire]", text: "Document abîmé : [Numéro exemplaire]" },
                { enabled: true, label: "Demande de consigne de rachat effectuée", text: "Demande de consigne de rachat effectuée" },
                { enabled: true, label: "Rachat à l'identique demandé : [EAN Attendu]", text: "Rachat à l'identique demandé : [EAN Attendu]" },
                { enabled: true, label: "Rachat à document équivalent demandé : [EAN Attendu]", text: "Rachat à document équivalent demandé : [EAN Attendu]" },
                { enabled: true, label: "Documents proposé incorrect :", text: "Documents proposé incorrect :" },
                { enabled: true, label: "Adhérent contacté pour rachat", text: "Adhérent contacté pour rachat" },
                { enabled: true, label: "Document racheté réceptionné. (pensez à supprimer ce message après traitement)", text: "Document racheté réceptionné. (pensez à supprimer ce message après traitement)" },
                { enabled: true, label: "Appelé pour TP4", text: "Appelé pour TP4" },
                { enabled: true, label: "Document neuf réceptionné. En attente de traitement", text: "Document neuf réceptionné. En attente de traitement" },
                { enabled: true, label: "Lettre TP4 à la signature", text: "Lettre TP4 à la signature" },
                { enabled: true, label: "Lettre TP4 envoyée", text: "Lettre TP4 envoyée" },
                { enabled: true, label: "Transmis au service finances", text: "Transmis au service finances" },
                { enabled: true, label: "Note libre :", text: "Note libre :" }
            ]
        }
    ];

    const LEGACY_047_GROUPS = [
        {
            enabled: true,
            label: "Raison de la réservation:",
            targetAction: "replace",
            prefix: "Raison de la réservation: ",
            labelColor: "red",
            messages: [
                { enabled: true, label: "Réservation pour adhérents", text: "Réservation pour adhérents" },
                { enabled: true, label: "Réservation Perso sur carte pro", text: "Réservation Perso sur carte pro" },
                { enabled: true, label: "Réservation Pro Cube", text: "Réservation Pro Cube" },
                { enabled: true, label: "Réservation Pro Portage", text: "Réservation Pro Portage" },
                { enabled: true, label: "Réservation Pro Club lecture", text: "Réservation Pro Club lecture" },
                { enabled: true, label: "Réservation Pro EAC", text: "Réservation Pro EAC" },
                { enabled: true, label: "Réservation Pro Animation", text: "Réservation Pro Animation" },
                { enabled: true, label: "Réservation Pro Gestion des collections", text: "Réservation Pro Gestion des collections" },
                { enabled: true, label: "Réservation Pro Vérification exemplaire", text: "Réservation Pro Vérification exemplaire" },
                { enabled: true, label: "Réservation pour suggestion", text: "Réservation pour suggestion" },
                { enabled: true, label: "Autre", text: "Autre" }
            ]
        },
        {
            enabled: true,
            label: "Site de retrait MEDIABUS",
            targetAction: "append",
            prefix: "Site de retrait MEDIABUS: ",
            labelColor: "blue",
            messages: [
                { enabled: true, label: "Chateaudouble", text: "Chateaudouble" },
                { enabled: true, label: "Bargeme", text: "Bargeme" },
                { enabled: true, label: "St-Antonin", text: "St-Antonin" },
                { enabled: true, label: "Sillans la cascade", text: "Sillans la cascade" },
                { enabled: true, label: "La Bastide", text: "La Bastide" },
                { enabled: true, label: "La Roque-Esclapon", text: "La Roque-Esclapon" },
                { enabled: true, label: "Claviers", text: "Claviers" },
                { enabled: true, label: "Taradeau", text: "Taradeau" },
                { enabled: true, label: "Trans", text: "Trans" },
                { enabled: true, label: "Les Arcs", text: "Les Arcs" }
            ]
        },
        {
            enabled: true,
            label: "Priorité",
            targetAction: "append",
            prefix: "Priorité: ",
            labelColor: "blue",
            messages: [
                { enabled: true, label: "Urgente", text: "Urgente" },
                { enabled: true, label: "Normale", text: "Normale" },
                { enabled: true, label: "Long terme", text: "Long terme" },
                { enabled: true, label: "Test", text: "Test" }
            ]
        }
    ];

    const LEGACY_017_PROFILE = {
        id: "legacy-017-patron-messages",
        enabled: true,
        label: "Messages lecteur — Gestion des litiges",
        mode: "append",
        pages: [
            { pageId: "members.moremember", enabled: true, path: "members/moremember.pl" },
            { pageId: "circ.circulation", enabled: true, path: "circ/circulation.pl" }
        ],
        targetSelector: "#borrower_message",
        targetName: "Message lecteur",
        anchorSelector: "#select_patron_messages",
        anchorName: "Liste native des messages lecteur",
        insertPosition: "after",
        showHeading: true,
        headingFr: "Messages prédéfinis",
        headingEn: "Predefined messages",
        placeholder: "Sélectionnez un message",
        defaultTextIfEmpty: "",
        preserveManualText: true,
        listsLayout: "horizontal",
        groups: LEGACY_017_GROUPS
    };

    const LEGACY_047_PROFILE = {
        id: "legacy-047-holdnotes",
        enabled: true,
        label: "Notes de réservation",
        mode: "compose",
        pages: [
            { pageId: "reserve.request", enabled: true, path: "reserve/request.pl" }
        ],
        targetSelector: "#holdnotes",
        targetName: "Notes",
        anchorSelector: "#holdnotes",
        anchorName: "Notes",
        insertPosition: "after",
        showHeading: false,
        headingFr: "",
        headingEn: "",
        placeholder: " - ",
        defaultTextIfEmpty: "Réservation pour adhérents",
        preserveManualText: true,
        listsLayout: "horizontal",
        groups: LEGACY_047_GROUPS
    };

    const DEFAULT_CONFIG = {
        enabled: true,
        profiles: [
            clone(LEGACY_017_PROFILE),
            clone(LEGACY_047_PROFILE)
        ]
    };

    let currentConfig = clone(DEFAULT_CONFIG);
    let observer = null;
    let unsubscribe = null;
    let injectScheduled = false;
    let composeStates = new WeakMap();

    function normalizePage(page, index) {
        const source = page && typeof page === "object" ? page : {};
        return {
            pageId: String(source.pageId || ("custom.page." + (index + 1))),
            enabled: source.enabled !== false,
            path: String(source.path || "")
        };
    }

    function normalizeMessage(message) {
        const source = message && typeof message === "object" ? message : {};
        return {
            enabled: source.enabled !== false,
            label: source.label === undefined || source.label === null ? "" : String(source.label),
            text: source.text === undefined || source.text === null ? "" : String(source.text)
        };
    }

    function defaultTargetActionForGroup(source) {
        const explicit = String(source && source.targetAction || "").toLowerCase();
        if (explicit === "replace") return "replace";
        if (explicit === "append") return "append";

        // Migration des configurations 017+047 déjà enregistrées avant la v3.1.0.
        // La seule liste historique qui remplace toute la cible par défaut est « Raison de la réservation: ».
        const marker = (
            String(source && source.label || "") + " " +
            String(source && source.prefix || "")
        ).toLowerCase();
        return marker.includes("raison de la réservation") ? "replace" : "append";
    }

    function normalizeGroup(group, mode) {
        const source = group && typeof group === "object" ? group : {};
        return {
            enabled: source.enabled !== false,
            label: source.label === undefined || source.label === null ? "" : String(source.label),
            targetAction: defaultTargetActionForGroup(source),
            prefix: mode === "compose"
                ? (source.prefix === undefined || source.prefix === null ? "" : String(source.prefix))
                : "",
            labelColor: source.labelColor === undefined || source.labelColor === null ? "" : String(source.labelColor),
            messages: Array.isArray(source.messages) ? source.messages.map(normalizeMessage) : []
        };
    }

    function normalizeProfile(profile, index) {
        const source = profile && typeof profile === "object" ? profile : {};
        const mode = source.mode === "compose" ? "compose" : "append";
        return {
            id: String(source.id || ("input-profile-" + (index + 1))),
            enabled: source.enabled !== false,
            label: source.label === undefined || source.label === null
                ? "Profil " + (index + 1)
                : String(source.label),
            mode: mode,
            pages: Array.isArray(source.pages) ? source.pages.map(normalizePage) : [],
            targetSelector: String(source.targetSelector || ""),
            targetName: String(source.targetName || ""),
            anchorSelector: String(source.anchorSelector || ""),
            anchorName: String(source.anchorName || ""),
            insertPosition: source.insertPosition === "before" ? "before" : "after",
            showHeading: source.showHeading !== false,
            headingFr: source.headingFr === undefined || source.headingFr === null ? "" : String(source.headingFr),
            headingEn: source.headingEn === undefined || source.headingEn === null ? "" : String(source.headingEn),
            placeholder: source.placeholder === undefined || source.placeholder === null ? "" : String(source.placeholder),
            defaultTextIfEmpty: source.defaultTextIfEmpty === undefined || source.defaultTextIfEmpty === null
                ? ""
                : String(source.defaultTextIfEmpty),
            preserveManualText: source.preserveManualText !== false,
            listsLayout: source.listsLayout === "vertical" ? "vertical" : "horizontal",
            groups: Array.isArray(source.groups)
                ? source.groups.map(function (group) { return normalizeGroup(group, mode); })
                : []
        };
    }

    function normalizeConfig(config) {
        const source = config && typeof config === "object" ? clone(config) : {};
        let profiles = Array.isArray(source.profiles)
            ? source.profiles.map(normalizeProfile)
            : clone(DEFAULT_CONFIG.profiles);

        const hasLegacy017 =
            Object.prototype.hasOwnProperty.call(source, "groups") ||
            Object.prototype.hasOwnProperty.call(source, "pages") ||
            Object.prototype.hasOwnProperty.call(source, "placeholder");

        if (hasLegacy017) {
            const patron = clone(LEGACY_017_PROFILE);
            if (Array.isArray(source.pages)) patron.pages = clone(source.pages);
            if (Object.prototype.hasOwnProperty.call(source, "placeholder")) {
                patron.placeholder = source.placeholder === null || source.placeholder === undefined
                    ? ""
                    : String(source.placeholder);
            }
            if (Array.isArray(source.groups)) patron.groups = clone(source.groups);

            const index = profiles.findIndex(function (profile) {
                return profile && profile.id === LEGACY_017_PROFILE.id;
            });
            if (index >= 0) profiles[index] = normalizeProfile(patron, index);
            else profiles.unshift(normalizeProfile(patron, 0));

            if (!profiles.some(function (profile) {
                return profile && profile.id === LEGACY_047_PROFILE.id;
            })) {
                profiles.push(normalizeProfile(clone(LEGACY_047_PROFILE), profiles.length));
            }
        }

        return {
            enabled: source.enabled !== false,
            profiles: profiles.map(normalizeProfile)
        };
    }

    function currentPathKey() {
        return String(window.location.pathname || "").replace(/^\/cgi-bin\/koha\//, "");
    }

    function pageMatchesEntry(page) {
        if (!page || page.enabled === false) return false;
        const raw = String(page.path || "").trim();
        if (!raw) return false;
        let wanted = raw;
        if (/^https?:\/\//i.test(raw)) {
            try {
                const url = new URL(raw);
                wanted = url.pathname + url.search;
            } catch (_) {
                return false;
            }
        }
        if (wanted.charAt(0) !== "/") wanted = "/cgi-bin/koha/" + wanted.replace(/^cgi-bin\/koha\//, "");

        let wantedUrl;
        try {
            wantedUrl = new URL(wanted, window.location.origin);
        } catch (_) {
            return false;
        }
        if (wantedUrl.pathname !== window.location.pathname) return false;

        const current = new URL(window.location.href);
        let ok = true;
        wantedUrl.searchParams.forEach(function (value, key) {
            if (current.searchParams.get(key) !== value) ok = false;
        });
        return ok;
    }

    function profileMatchesPage(profile) {
        return Boolean(
            profile &&
            profile.enabled !== false &&
            Array.isArray(profile.pages) &&
            profile.pages.some(pageMatchesEntry)
        );
    }

    function activeProfiles(config) {
        if (!config || config.enabled === false || !Array.isArray(config.profiles)) return [];
        return config.profiles.filter(profileMatchesPage);
    }

    function activeGroups(profile) {
        if (!profile || !Array.isArray(profile.groups)) return [];
        return profile.groups.filter(function (group) {
            return group && group.enabled !== false && String(group.label || "").trim();
        });
    }

    function activeMessages(group) {
        if (!group || !Array.isArray(group.messages)) return [];
        return group.messages.filter(function (message) {
            return message &&
                message.enabled !== false &&
                String(message.label || "").trim() &&
                String(message.text || "").trim();
        });
    }

    function safeQueryAll(root, selector) {
        const value = String(selector || "").trim();
        if (!value) return [];
        try {
            return Array.from((root || document).querySelectorAll(value));
        } catch (_) {
            return [];
        }
    }

    function scopeForTarget(target) {
        return target && (target.closest("form,.modal,fieldset,.page-section") || document);
    }

    function resolveAnchor(target, profile) {
        if (!target) return null;
        const selector = String(profile && profile.anchorSelector || "").trim();
        if (!selector) return target;
        const scope = scopeForTarget(target);
        try {
            return (scope && scope.querySelector(selector)) || document.querySelector(selector) || target;
        } catch (_) {
            return target;
        }
    }

    function insertionNode(anchor) {
        if (!anchor) return null;
        return anchor.closest("li.form-group, li, div.form-group, .form-group") || anchor;
    }

    function notifyTargetChange(target) {
        if (!target) return;
        try { target.dispatchEvent(new Event("input", { bubbles: true })); } catch (_) {}
        try { target.dispatchEvent(new Event("change", { bubbles: true })); } catch (_) {}
    }

    function appendMessage(target, text) {
        const value = String(text || "").trim();
        if (!target || !value) return;
        const existing = String(target.value || "");
        target.value = existing ? existing.replace(/\s+$/, "") + "\n" + value : value;
        notifyTargetChange(target);
        try { target.focus(); } catch (_) {}
    }

    function replaceMessage(target, text) {
        const value = String(text || "").trim();
        if (!target || !value) return;
        target.value = value;
        notifyTargetChange(target);
        try { target.focus(); } catch (_) {}
    }

    function stripManagedSuffix(currentValue, lastGenerated) {
        const current = String(currentValue || "");
        const managed = String(lastGenerated || "");
        if (!managed) return current;
        if (current === managed) return "";
        if (current.endsWith("\n" + managed)) {
            return current.slice(0, -(managed.length + 1)).replace(/\s+$/, "");
        }
        return current;
    }

    function updateCompositeTarget(target, profile, selections) {
        if (!target) return;
        let state = composeStates.get(target);
        if (!state) {
            state = { lastGenerated: "" };
            composeStates.set(target, state);
        }

        let manual = String(target.value || "");
        if (profile.preserveManualText !== false) {
            manual = stripManagedSuffix(manual, state.lastGenerated);
        } else {
            manual = "";
        }

        const lines = [];
        activeGroups(profile).forEach(function (group, groupIndex) {
            const text = selections[groupIndex] || "";
            if (!text) return;
            lines.push(String(group.prefix || "") + text);
        });
        const generated = lines.join("\n");

        target.value = manual
            ? (generated ? manual.replace(/\s+$/, "") + "\n" + generated : manual)
            : generated;

        state.lastGenerated = generated;
        notifyTargetChange(target);
    }

    function ensureHistoricalDefault(target, profile) {
        if (!target || profile.mode !== "compose") return;
        const initial = String(profile.defaultTextIfEmpty || "");
        if (!initial || String(target.value || "").trim()) return;
        target.value = initial;
        composeStates.set(target, { lastGenerated: "" });
        notifyTargetChange(target);
    }

    function buildSelect(target, profile, group, groupIndex, selections) {
        const block = document.createElement("div");
        block.className = "pmk-input-helper-group";
        block.dataset.pmkGroupIndex = String(groupIndex);

        const groupLabel = document.createElement("label");
        groupLabel.className = "col-form-label pmk-input-helper-group-label";
        groupLabel.textContent = String(group.label || "");
        if (String(group.labelColor || "").trim()) {
            groupLabel.style.color = String(group.labelColor);
        }

        const select = document.createElement("select");
        select.className = "form-select form-select-sm pmk-input-helper-select";
        select.setAttribute(
            "aria-label",
            (language() === "en" ? "Input helper — " : "Aide à la saisie — ") + String(group.label || "")
        );

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = String(profile.placeholder || "") ||
            (language() === "en" ? "Select a value" : "Sélectionnez une valeur");
        select.appendChild(placeholder);

        activeMessages(group).forEach(function (message, messageIndex) {
            const option = document.createElement("option");
            option.value = String(messageIndex);
            option.textContent = String(message.label);
            option.dataset.pmkMessageText = String(message.text);
            select.appendChild(option);
        });

        select.addEventListener("change", function () {
            if (!select.value) return;
            const option = select.options[select.selectedIndex];
            const rawText = option && option.dataset ? String(option.dataset.pmkMessageText || "") : "";
            if (!rawText) return;

            const formattedText = profile.mode === "compose"
                ? String(group.prefix || "") + rawText
                : rawText;
            const action = group.targetAction === "replace" ? "replace" : "append";

            if (profile.mode !== "compose") {
                if (action === "replace") replaceMessage(target, formattedText);
                else appendMessage(target, formattedText);
                select.value = "";
                return;
            }

            if (action === "replace") {
                // « Remplacer » signifie bien remplacer TOUT le contenu de la zone cible.
                // Les autres sélections gérées sont annulées pour que l'interface reste cohérente.
                for (let i = 0; i < selections.length; i += 1) selections[i] = "";
                selections[groupIndex] = rawText;
                replaceMessage(target, formattedText);
                composeStates.set(target, { lastGenerated: formattedText });

                const groupsRoot = select.closest(".pmk-input-helper-groups");
                if (groupsRoot) {
                    groupsRoot.querySelectorAll(".pmk-input-helper-select").forEach(function (otherSelect) {
                        if (otherSelect !== select) otherSelect.value = "";
                    });
                }
                return;
            }

            selections[groupIndex] = rawText;
            updateCompositeTarget(target, profile, selections);
        });

        block.appendChild(groupLabel);
        block.appendChild(select);
        return block;
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .pmk-input-helper {
                display: block;
                box-sizing: border-box;
                width: 100%;
                max-width: 48rem;
                margin-top: .55rem;
            }
            .pmk-input-helper-heading {
                display: flex;
                align-items: center;
                gap: .35rem;
                font-weight: 600;
                margin-bottom: .45rem;
            }
            .pmk-input-helper-groups {
                display: grid;
                gap: .6rem .75rem;
                align-items: end;
                width: 100%;
            }
            .pmk-input-helper-groups--horizontal {
                grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
            }
            .pmk-input-helper-groups--vertical {
                grid-template-columns: minmax(0, 1fr);
            }
            .pmk-input-helper-group {
                min-width: 0;
            }
            .pmk-input-helper-group-label {
                display: block;
                font-weight: 600;
                margin-bottom: .2rem;
                padding-top: 0;
            }
            .pmk-input-helper-select {
                width: 100%;
                max-width: 100%;
            }
            @media (max-width: 576px) {
                .pmk-input-helper {
                    max-width: 100%;
                }
                .pmk-input-helper-groups--horizontal {
                    grid-template-columns: 1fr;
                }
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function wrapperSelector(profileId) {
        return "." + WRAPPER_CLASS + '[data-pmk-profile-id="' +
            String(profileId || "").replace(/"/g, '\\"') + '"]';
    }

    function mountContextButton(wrapper, profile) {
        if (!wrapper || !window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        const anchor = wrapper.querySelector(".pmk-input-helper-heading, .pmk-input-helper-group-label");
        if (!anchor) return;
        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "append",
                contextKey: "input-helper-" + String(profile.id || "profile"),
                context: {
                    pageId: currentPathKey(),
                    sectionId: "profiles",
                    profileId: profile.id
                }
            });
        } catch (_) {}
    }

    function injectProfileForTarget(profile, target, targetIndex) {
        if (!profile || !target) return false;
        const scope = scopeForTarget(target);
        const existing = scope && scope.querySelector(wrapperSelector(profile.id) + '[data-pmk-target-index="' + targetIndex + '"]');
        if (existing) return false;

        const anchor = resolveAnchor(target, profile);
        const reference = insertionNode(anchor);
        if (!reference || !reference.parentNode) return false;

        const tag = reference.tagName === "LI" ? "li" : "div";
        const wrapper = document.createElement(tag);
        wrapper.className = "form-group form-row " + WRAPPER_CLASS;
        wrapper.dataset.pmkModule = MODULE_ID;
        wrapper.dataset.pmkProfileId = String(profile.id || "");
        wrapper.dataset.pmkTargetIndex = String(targetIndex);

        if (profile.showHeading !== false) {
            const heading = document.createElement("div");
            heading.className = "pmk-input-helper-heading";
            heading.textContent = language() === "en"
                ? String(profile.headingEn || profile.headingFr || profile.label || "")
                : String(profile.headingFr || profile.headingEn || profile.label || "");
            wrapper.appendChild(heading);
        }

        const groupsWrap = document.createElement("div");
        groupsWrap.className = "pmk-input-helper-groups pmk-input-helper-groups--" +
            (profile.listsLayout === "vertical" ? "vertical" : "horizontal");
        const selections = [];
        activeGroups(profile).forEach(function (group, groupIndex) {
            groupsWrap.appendChild(buildSelect(target, profile, group, groupIndex, selections));
        });
        wrapper.appendChild(groupsWrap);

        if (profile.insertPosition === "before") reference.parentNode.insertBefore(wrapper, reference);
        else reference.parentNode.insertBefore(wrapper, reference.nextSibling);

        ensureHistoricalDefault(target, profile);
        mountContextButton(wrapper, profile);
        return true;
    }

    function clearInjected() {
        document.querySelectorAll("." + WRAPPER_CLASS).forEach(function (node) {
            try { node.remove(); } catch (_) {}
        });
        composeStates = new WeakMap();
    }

    function injectAll() {
        injectScheduled = false;
        clearInjected();

        const profiles = activeProfiles(currentConfig);
        profiles.forEach(function (profile) {
            const targets = safeQueryAll(document, profile.targetSelector);
            targets.forEach(function (target, index) {
                injectProfileForTarget(profile, target, index);
            });
        });
    }

    function scheduleInject() {
        if (injectScheduled) return;
        injectScheduled = true;
        window.requestAnimationFrame(injectAll);
    }

    function mutationIsRelevant(mutation) {
        if (!mutation || mutation.type !== "childList" || !mutation.addedNodes || !mutation.addedNodes.length) return false;
        const profiles = currentConfig && Array.isArray(currentConfig.profiles) ? currentConfig.profiles : [];
        return Array.from(mutation.addedNodes).some(function (node) {
            if (!(node instanceof Element)) return false;
            if (node.closest && node.closest("." + WRAPPER_CLASS)) return false;
            for (let i = 0; i < profiles.length; i += 1) {
                const profile = profiles[i];
                if (!profile || profile.enabled === false) continue;
                const selectors = [profile.targetSelector, profile.anchorSelector].filter(Boolean);
                for (let j = 0; j < selectors.length; j += 1) {
                    try {
                        if (node.matches(selectors[j]) || (node.querySelector && node.querySelector(selectors[j]))) return true;
                    } catch (_) {}
                }
            }
            return false;
        });
    }

    function observeDom() {
        if (observer || !document.documentElement) return;
        observer = new MutationObserver(function (mutations) {
            if (mutations.some(mutationIsRelevant)) scheduleInject();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    function refreshConfig(config) {
        currentConfig = normalizeConfig(config || DEFAULT_CONFIG);
        scheduleInject();
    }

    function profileIndex(path) {
        if (!Array.isArray(path)) return -1;
        const pos = path.indexOf("profiles");
        if (pos < 0) return -1;
        const index = Number(path[pos + 1]);
        return Number.isInteger(index) ? index : -1;
    }

    function profileAt(root, path) {
        const index = profileIndex(path);
        return root && Array.isArray(root.profiles) && index >= 0 ? root.profiles[index] : null;
    }

    function pageToUrl(path) {
        const raw = String(path || "").trim();
        if (!raw) return window.location.pathname + window.location.search;
        if (/^https?:\/\//i.test(raw)) {
            try {
                const url = new URL(raw);
                return url.pathname + url.search;
            } catch (_) {}
        }
        if (raw.charAt(0) === "/") return raw;
        return "/cgi-bin/koha/" + raw.replace(/^cgi-bin\/koha\//, "");
    }

    function targetUrlForProfile(profile) {
        const pages = profile && Array.isArray(profile.pages) ? profile.pages : [];
        const page = pages.find(function (entry) { return entry && entry.enabled !== false && String(entry.path || "").trim(); }) ||
            pages.find(function (entry) { return entry && String(entry.path || "").trim(); });
        return pageToUrl(page && page.path);
    }

    function applyPickerMetadata(root, path, result) {
        const profile = profileAt(root, path);
        if (!profile || !result) return;
        const key = String(path[path.length - 1] || "");
        if (key === "targetSelector") {
            profile.targetName = String(result.targetName || result.selector || profile.targetName || "");
        } else if (key === "anchorSelector") {
            profile.anchorName = String(result.targetName || result.selector || profile.anchorName || "");
        }
    }

    function pickForProfile(context) {
        const picker = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!picker || typeof picker.pickForConfig !== "function") {
            return Promise.reject(new Error("pmk_common_picker_unavailable"));
        }
        const root = context && context.rootObject ? context.rootObject : {};
        const path = context && Array.isArray(context.fieldPath) ? context.fieldPath.slice() : [];
        const profile = profileAt(root, path);
        return picker.pickForConfig({
            moduleId: MODULE_ID,
            targetUrl: targetUrlForProfile(profile),
            rootObject: root,
            fieldPath: path,
            persistAfterPick: false,
            adminContext: { sectionId: "profiles", profileIndex: profileIndex(path) },
            options: {
                bannerText: i18n(
                    "Clique sur l’élément Koha à utiliser — Échap annule",
                    "Click the Koha element to use — Esc cancels"
                )
            }
        });
    }

    function registerPickerAdapter() {
        const picker = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!picker || typeof picker.register !== "function") return false;
        picker.register(MODULE_ID, {
            applyPending: function (draft, pending, picked) {
                applyPickerMetadata(draft, pending && pending.fieldPath || [], picked);
                return draft;
            }
        });
        return true;
    }

    function renderVisualPreview(context) {
        const profile = profileAt(context && context.rootObject, context && context.fieldPath) || LEGACY_017_PROFILE;
        const root = document.createElement("div");
        root.className = "pmk-input-helper";
        root.style.marginTop = "0";
        root.style.maxWidth = "100%";

        if (profile.showHeading !== false) {
            const heading = document.createElement("div");
            heading.className = "pmk-input-helper-heading";
            heading.textContent = language() === "en"
                ? String(profile.headingEn || profile.headingFr || profile.label || "")
                : String(profile.headingFr || profile.headingEn || profile.label || "");
            root.appendChild(heading);
        }

        const groups = document.createElement("div");
        groups.className = "pmk-input-helper-groups pmk-input-helper-groups--" +
            (profile.listsLayout === "vertical" ? "vertical" : "horizontal");
        activeGroups(profile).forEach(function (group) {
            const block = document.createElement("div");
            block.className = "pmk-input-helper-group";
            const label = document.createElement("label");
            label.className = "pmk-input-helper-group-label";
            label.textContent = String(group.label || "");
            if (String(group.labelColor || "").trim()) label.style.color = String(group.labelColor);
            const select = document.createElement("select");
            select.className = "form-select form-select-sm pmk-input-helper-select";
            select.disabled = true;
            const empty = document.createElement("option");
            empty.textContent = String(profile.placeholder || "");
            select.appendChild(empty);
            activeMessages(group).forEach(function (message) {
                const option = document.createElement("option");
                option.textContent = String(message.label || "");
                select.appendChild(option);
            });
            block.appendChild(label);
            block.appendChild(select);
            groups.appendChild(block);
        });
        root.appendChild(groups);
        return root;
    }

    function registerVisualEditorAdapter() {
        const editor = window.PMKConfig && window.PMKConfig.visualEditor;
        if (!editor || typeof editor.register !== "function") return false;
        editor.register(MODULE_ID, {
            capabilities: {
                inlinePreview: true,
                styleEyedropper: false,
                livePreview: true
            },
            renderPreview: renderVisualPreview,
            canPreview: function () {
                return activeProfiles(currentConfig).some(function (profile) {
                    return safeQueryAll(document, profile.targetSelector).length > 0;
                });
            },
            previewDraft: function (draft) {
                const before = clone(currentConfig || DEFAULT_CONFIG);
                const snapshots = [];
                const seen = new Set();
                [before, normalizeConfig(draft || DEFAULT_CONFIG)].forEach(function (cfg) {
                    (cfg.profiles || []).forEach(function (profile) {
                        safeQueryAll(document, profile.targetSelector).forEach(function (target) {
                            if (!target || seen.has(target)) return;
                            seen.add(target);
                            snapshots.push({ target: target, value: target.value });
                        });
                    });
                });

                refreshConfig(draft);
                return function () {
                    refreshConfig(before);
                    snapshots.forEach(function (snapshot) {
                        if (!snapshot.target || !snapshot.target.isConnected) return;
                        snapshot.target.value = snapshot.value;
                        notifyTargetChange(snapshot.target);
                    });
                };
            }
        });
        return true;
    }

    function newPage() {
        return {
            pageId: "custom.page." + Date.now().toString(36),
            enabled: true,
            path: String(window.location.pathname || "").replace(/^\/cgi-bin\/koha\//, "")
        };
    }

    function newMessage() {
        return { enabled: true, label: "", text: "" };
    }

    function newGroup() {
        return { enabled: true, label: "", targetAction: "append", prefix: "", labelColor: "", messages: [] };
    }

    function newProfile() {
        return {
            id: makeId("input-profile"),
            enabled: true,
            label: "Nouvelle aide à la saisie",
            mode: "append",
            pages: [newPage()],
            targetSelector: "",
            targetName: "",
            anchorSelector: "",
            anchorName: "",
            insertPosition: "after",
            showHeading: true,
            headingFr: "Aide à la saisie",
            headingEn: "Input helper",
            placeholder: "Sélectionnez une valeur",
            defaultTextIfEmpty: "",
            preserveManualText: true,
            listsLayout: "horizontal",
            groups: []
        };
    }

    function validate(config) {
        const cfg = normalizeConfig(config);
        const ids = new Set();
        if (!Array.isArray(cfg.profiles)) return { ok: false, message: i18n("La liste des aides à la saisie est invalide.", "The input helper list is invalid.") };
        for (const profile of cfg.profiles) {
            if (!profile.id || ids.has(profile.id)) return { ok: false, message: i18n("Chaque profil doit avoir un identifiant unique.", "Each profile must have a unique identifier.") };
            ids.add(profile.id);
            if (!String(profile.label || "").trim()) return { ok: false, message: i18n("Chaque profil doit avoir un nom.", "Each profile must have a name.") };
            if (!Array.isArray(profile.pages) || !profile.pages.some(function (page) { return String(page && page.path || "").trim(); })) {
                return { ok: false, message: i18n("Chaque profil doit indiquer au moins une page Koha.", "Each profile must specify at least one Koha page.") };
            }
            if (!String(profile.targetSelector || "").trim()) return { ok: false, message: i18n("Chaque profil doit cibler un champ Koha.", "Each profile must target a Koha field.") };
            if (!Array.isArray(profile.groups)) return { ok: false, message: i18n("La liste des groupes est invalide.", "The group list is invalid.") };
            for (const group of profile.groups) {
                if (!group || !String(group.label || "").trim()) return { ok: false, message: i18n("Chaque groupe doit avoir un libellé.", "Each group must have a label.") };
                if (!Array.isArray(group.messages)) return { ok: false, message: i18n("Chaque groupe doit contenir une liste de valeurs valide.", "Each group must contain a valid value list.") };
                for (const message of group.messages) {
                    if (!message || !String(message.label || "").trim()) return { ok: false, message: i18n("Chaque valeur doit avoir un libellé.", "Each value must have a label.") };
                    if (!String(message.text || "").trim()) return { ok: false, message: i18n("Chaque valeur doit avoir un texte à insérer.", "Each value must have insertion text.") };
                }
            }
        }
        return { ok: true };
    }

    function modeOf(root, path) {
        const profile = profileAt(root, path);
        return profile ? profile.mode : "append";
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 4,
            name: { fr: "Ajouter des listes de valeurs prédéfinies pour le remplissage automatique d’un champ", en: "Predefined values for automatic field filling" },
            description: {
                fr: "Ajoute à côté des champs Koha des listes de valeurs prédéfinies permettant de remplir automatiquement le champ sélectionné.",
                en: "Adds predefined-value lists next to Koha fields. Historical modules 017 and 047 are merged here without changing their preset values."
            },
            category: { fr: "Interface / saisie", en: "Interface / input" },
            supportedPages: ["members.moremember", "circ.circulation", "reserve.request"],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            normalize: normalizeConfig,
            validate: validate,
            schema: [
                {
                    type: "section",
                    id: "profiles",
                    label: { fr: "Aides à la saisie", en: "Input helpers" },
                    description: {
                        fr: "Chaque profil choisit les pages Koha, le champ à alimenter et les listes proposées. Le champ cible et l’emplacement du panneau peuvent être sélectionnés directement sur la page.",
                        en: "Each profile chooses Koha pages, the target field and proposed lists. The target field and panel anchor can be selected directly on the page."
                    },
                    fields: [
                        {
                            key: "profiles",
                            type: "repeater",
                            label: { fr: "Profils", en: "Profiles" },
                            addLabel: { fr: "Ajouter une aide", en: "Add helper" },
                            reorder: true,
                            newItem: newProfile,
                            itemTitle: function (item, index, lang) {
                                return String(item && item.label || "").trim() ||
                                    (lang === "en" ? "Helper " : "Aide ") + (index + 1);
                            },
                            liveTitleKey: "label",
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Profil actif", en: "Profile enabled" } },
                                { key: "label", type: "text", label: { fr: "Nom du profil", en: "Profile name" } },
                                {
                                    key: "mode",
                                    type: "select",
                                    refreshOnChange: true,
                                    label: { fr: "Mode de saisie", en: "Input mode" },
                                    options: [
                                        { value: "append", label: { fr: "Listes simples", en: "Simple lists" } },
                                        { value: "compose", label: { fr: "Listes structurées (préfixes / texte initial)", en: "Structured lists (prefixes / initial text)" } }
                                    ]
                                },
                                {
                                    key: "pages",
                                    type: "repeater",
                                    label: { fr: "Pages Koha", en: "Koha pages" },
                                    addLabel: { fr: "Ajouter une page", en: "Add page" },
                                    reorder: true,
                                    newItem: newPage,
                                    itemTitle: function (item, index) {
                                        return String(item && item.path || "").trim() || "Page " + (index + 1);
                                    },
                                    fields: [
                                        { key: "enabled", type: "boolean", label: { fr: "Active", en: "Enabled" } },
                                        { key: "pageId", type: "text", advanced: true, label: { fr: "Identifiant page", en: "Page identifier" } },
                                        { key: "path", type: "text", label: { fr: "Chemin Koha", en: "Koha path" } }
                                    ]
                                },
                                {
                                    key: "targetSelector",
                                    type: "elementPicker",
                                    label: { fr: "Champ Koha à alimenter", en: "Koha field to fill" },
                                    pickLabel: { fr: "Choisir le champ sur la page", en: "Choose field on page" },
                                    emptyLabel: { fr: "Aucun champ choisi", en: "No field selected" },
                                    allowManual: true,
                                    pick: pickForProfile,
                                    onPick: applyPickerMetadata
                                },
                                { key: "targetName", type: "text", readOnly: true, advanced: true, label: { fr: "Champ détecté", en: "Detected field" } },
                                {
                                    key: "anchorSelector",
                                    type: "elementPicker",
                                    label: { fr: "Emplacement du panneau", en: "Panel anchor" },
                                    pickLabel: { fr: "Choisir l’emplacement sur la page", en: "Choose panel anchor on page" },
                                    emptyLabel: { fr: "Même emplacement que le champ cible", en: "Same as target field" },
                                    allowManual: true,
                                    clearable: true,
                                    pick: pickForProfile,
                                    onPick: applyPickerMetadata,
                                    help: {
                                        fr: "Optionnel. Si vide, le panneau est placé à côté du champ cible.",
                                        en: "Optional. If empty, the panel is placed next to the target field."
                                    }
                                },
                                { key: "anchorName", type: "text", readOnly: true, advanced: true, label: { fr: "Emplacement détecté", en: "Detected anchor" } },
                                {
                                    key: "insertPosition",
                                    type: "select",
                                    label: { fr: "Position du panneau", en: "Panel position" },
                                    options: [
                                        { value: "after", label: { fr: "Après le champ / emplacement", en: "After the field / anchor" } },
                                        { value: "before", label: { fr: "Avant le champ / emplacement", en: "Before the field / anchor" } }
                                    ]
                                },
                                {
                                    key: "listsLayout",
                                    type: "select",
                                    refreshOnChange: true,
                                    label: { fr: "Disposition des listes", en: "List layout" },
                                    options: [
                                        { value: "horizontal", label: { fr: "Les unes à côté des autres", en: "Side by side" } },
                                        { value: "vertical", label: { fr: "Les unes sous les autres", en: "Stacked vertically" } }
                                    ],
                                    help: {
                                        fr: "En mode côte à côte, l’affichage reste responsive : les listes repassent automatiquement les unes sous les autres sur un écran étroit.",
                                        en: "In side-by-side mode, the layout remains responsive: lists automatically stack on narrow screens."
                                    }
                                },
                                { key: "showHeading", type: "boolean", refreshOnChange: true, label: { fr: "Afficher un titre au-dessus des listes", en: "Show a heading above the lists" } },
                                {
                                    key: "headingFr", type: "text",
                                    label: { fr: "Titre — français", en: "Heading — French" },
                                    when: function (root, path) { const p = profileAt(root, path); return Boolean(p && p.showHeading !== false); }
                                },
                                {
                                    key: "headingEn", type: "text",
                                    label: { fr: "Titre — anglais", en: "Heading — English" },
                                    when: function (root, path) { const p = profileAt(root, path); return Boolean(p && p.showHeading !== false); }
                                },
                                { key: "placeholder", type: "text", label: { fr: "Choix vide", en: "Empty choice" } },
                                {
                                    key: "defaultTextIfEmpty",
                                    type: "text",
                                    label: { fr: "Texte initial si le champ est vide", en: "Initial text when the field is empty" },
                                    when: function (root, path) { return modeOf(root, path) === "compose"; }
                                },
                                {
                                    key: "preserveManualText",
                                    type: "boolean",
                                    label: { fr: "Préserver le texte saisi manuellement", en: "Preserve manually entered text" },
                                    when: function (root, path) { return modeOf(root, path) === "compose"; }
                                },
                                { type: "visualPreview", label: { fr: "Aperçu du panneau", en: "Panel preview" } },
                                {
                                    key: "groups",
                                    type: "repeater",
                                    label: { fr: "Listes proposées", en: "Proposed lists" },
                                    addLabel: { fr: "Ajouter une liste", en: "Add list" },
                                    reorder: true,
                                    newItem: newGroup,
                                    itemTitle: function (item, index) {
                                        return String(item && item.label || "").trim() || "Liste " + (index + 1);
                                    },
                                    liveTitleKey: "label",
                                    fields: [
                                        { key: "enabled", type: "boolean", label: { fr: "Liste active", en: "List enabled" } },
                                        { key: "label", type: "text", label: { fr: "Libellé de la liste", en: "List label" } },
                                        {
                                            key: "targetAction",
                                            type: "select",
                                            label: { fr: "Effet du choix sur la zone cible", en: "Effect on target field" },
                                            options: [
                                                { value: "append", label: { fr: "Ajouter au contenu existant", en: "Append to existing content" } },
                                                { value: "replace", label: { fr: "Remplacer tout le contenu", en: "Replace all content" } }
                                            ],
                                            help: {
                                                fr: "Réglage propre à cette liste. Par défaut, une nouvelle liste ajoute son choix. La liste historique « Raison de la réservation: » remplace tout le contenu.",
                                                en: "This setting applies only to this list. New lists append by default. The historical ‘Raison de la réservation:’ list replaces all content."
                                            }
                                        },
                                        {
                                            key: "prefix",
                                            type: "text",
                                            label: { fr: "Préfixe ajouté dans le texte", en: "Prefix added to text" },
                                            when: function (root, path) { return modeOf(root, path) === "compose"; }
                                        },
                                        {
                                            key: "labelColor",
                                            type: "text",
                                            advanced: true,
                                            label: { fr: "Couleur du libellé", en: "Label color" }
                                        },
                                        {
                                            key: "messages",
                                            type: "repeater",
                                            label: { fr: "Valeurs", en: "Values" },
                                            addLabel: { fr: "Ajouter une valeur", en: "Add value" },
                                            reorder: true,
                                            newItem: newMessage,
                                            itemTitle: function (item, index) {
                                                return String(item && item.label || "").trim() || "Valeur " + (index + 1);
                                            },
                                            liveTitleKey: "label",
                                            fields: [
                                                { key: "enabled", type: "boolean", label: { fr: "Valeur active", en: "Value enabled" } },
                                                { key: "label", type: "text", label: { fr: "Libellé dans la liste", en: "Label in the list" } },
                                                {
                                                    key: "text",
                                                    type: "textarea",
                                                    label: { fr: "Texte inséré", en: "Inserted text" },
                                                    help: {
                                                        fr: "Le texte est utilisé exactement tel qu’il est saisi.",
                                                        en: "The text is used exactly as entered."
                                                    }
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ],
            focusContext: function (main) {
                if (!main) return;
                const section = main.querySelector('[data-pmk-section-id="profiles"]');
                if (!section) return;
                window.setTimeout(function () {
                    section.scrollIntoView({ block: "start", behavior: "smooth" });
                }, 0);
            }
        };
    }

    function registerDefinition() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return false;
        window.PMKConfig.registerModule(moduleDefinition());
        return true;
    }

    async function loadConfig() {
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") {
            refreshConfig(DEFAULT_CONFIG);
            return;
        }
        try {
            const config = await window.PMKConfig.getConfig(MODULE_ID);
            refreshConfig(config);
        } catch (_) {
            refreshConfig(DEFAULT_CONFIG);
        }

        if (!unsubscribe && typeof window.PMKConfig.subscribe === "function") {
            unsubscribe = window.PMKConfig.subscribe(MODULE_ID, refreshConfig);
        }
    }

    function start() {
        injectStyles();
        registerDefinition();
        registerPickerAdapter();
        registerVisualEditorAdapter();
        observeDom();
        loadConfig();
        scheduleInject();

        document.addEventListener("shown.bs.modal", scheduleInject);
        document.addEventListener("click", function (event) {
            const button = event.target.closest && event.target.closest("#toolbar_addnewmessageLabel");
            if (button) window.requestAnimationFrame(scheduleInject);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }

    window.addEventListener("pmk:config-ready", function () {
        registerDefinition();
        registerPickerAdapter();
        registerVisualEditorAdapter();
        loadConfig();
    });

    const publicApi = {
        version: MODULE_VERSION,
        moduleId: MODULE_ID,
        refresh: scheduleInject,
        defaults: clone(DEFAULT_CONFIG),
        normalize: normalizeConfig
    };

    window.PMK017MessageTemplates = publicApi;
    window.PMK017InputHelpers = publicApi;
})();

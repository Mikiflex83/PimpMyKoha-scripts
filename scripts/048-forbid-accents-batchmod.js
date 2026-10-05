/*
 Nom du fichier : 048-forbid-accents-batchmod.js
 Version : 1.1.2-preplugin
 Date de dernière modification : 2026-09-19
 Auteur : Michael Mundet / refonte PimpMyKoha

 Description :
 - remplace le 048 historique par un moteur transversal « Règles de saisie » ;
 - absorbe le périmètre du 131-saisie-prix.js sans toucher au 035 ;
 - active par défaut un contrôle des champs Koha items.price et items.replacementprice ;
 - pour le preset Prix : chiffres uniquement + point décimal, aucune virgule, 2 décimales par défaut ;
 - permet de cibler n'importe quel champ Koha via le picker commun PMK ;
 - règles illimitées : caractères autorisés ou interdits, presets ou liste personnalisée ;
 - casse automatique : aucune, MAJUSCULES, minuscules, première lettre en majuscule ;
 - information discrète près du champ lorsqu'une saisie est refusée ;
 - clavier, collage, glisser-déposer, mobile/IME et contenu dynamique pris en charge ;
 - aucun enregistrement Koha automatique et aucun console.*.

 Dépendance recommandée :
 - 000-pmk-config-firestore.js v0.4.35+ pour la configuration et le picker commun.

 Fusion :
 - 048-forbid-accents-batchmod.js : remplacé par ce fichier ;
 - 131-saisie-prix.js : ne doit plus être chargé séparément après activation de ce module ;
 - 035-resize-z3950.js : STRICTEMENT INCHANGE et indépendant.
*/
(function () {
    "use strict";

    if (window.__PMK048_INPUT_RULES__) return;
    window.__PMK048_INPUT_RULES__ = true;
    window.__PMK_131_MERGED_INTO_048__ = true;

    const MODULE_ID = "input-rules";
    const MODULE_VERSION = "1.1.2-preplugin";
    const STYLE_ID = "pmk048-input-rules-style";
    const CONTEXT_KEY = "input-rules";
    const BATCHMOD_PATH = "/cgi-bin/koha/tools/batchMod.pl";
    const PRICE_SELECTOR = '[name="items.price"], [name="items.replacementprice"]';
    const PRICE_DEFAULT_DECIMALS = 2;

    const LEGACY_048_ACCENTS = "éèêàâùûôîçï";

    const PRESETS = {
        custom: {
            fr: "Personnalisé",
            en: "Custom",
            characters: ""
        },
        legacy048: {
            fr: "Accents historiques du 048",
            en: "Legacy 048 accented characters",
            characters: LEGACY_048_ACCENTS
        },
        frenchAccents: {
            fr: "Accents et ligatures françaises",
            en: "French accents and ligatures",
            characters: "àâäæçéèêëîïôöœùûüÿÀÂÄÆÇÉÈÊËÎÏÔÖŒÙÛÜŸ"
        },
        digits: {
            fr: "Chiffres 0 à 9",
            en: "Digits 0 to 9",
            characters: "0123456789"
        },
        asciiLetters: {
            fr: "Lettres A-Z / a-z",
            en: "Letters A-Z / a-z",
            characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
        },
        frenchLetters: {
            fr: "Lettres françaises",
            en: "French letters",
            characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzàâäæçéèêëîïôöœùûüÿÀÂÄÆÇÉÈÊËÎÏÔÖŒÙÛÜŸ"
        },
        alphanumeric: {
            fr: "Lettres françaises + chiffres",
            en: "French letters + digits",
            characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzàâäæçéèêëîïôöœùûüÿÀÂÄÆÇÉÈÊËÎÏÔÖŒÙÛÜŸ0123456789"
        },
        price: {
            fr: "Prix : chiffres + point",
            en: "Price: digits + dot",
            characters: "0123456789."
        },
        whitespace: {
            fr: "Espaces et tabulations",
            en: "Spaces and tabs",
            characters: " \t\n\r"
        }
    };

    function clone(value) {
        return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }

    function makeId(prefix) {
        const p = String(prefix || "rule").trim() || "rule";
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return p + "-" + window.crypto.randomUUID();
        }
        return p + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
    }

    function language() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            return window.PMKConfig.getLanguage();
        }
        const lang = String(document.documentElement.lang || navigator.language || "").toLowerCase();
        return lang.startsWith("en") ? "en" : "fr";
    }

    function i18n(fr, en) {
        return language() === "en" ? en : fr;
    }

    function pageKey(path) {
        return String(path || "").trim().replace(/[?#].*$/, "");
    }

    function pageMatches(rule) {
        const configured = pageKey(rule && rule.pagePath);
        if (!configured || configured === "*") return true;
        return pageKey(window.location.pathname) === configured;
    }

    function targetUrl(rule) {
        const path = pageKey(rule && rule.pagePath);
        if (!path || path === "*") return window.location.pathname + window.location.search;
        return path;
    }

    function safeMatches(element, selector) {
        if (!element || element.nodeType !== 1 || !selector) return false;
        try {
            return element.matches(selector);
        } catch (_) {
            return false;
        }
    }

    function isEditableTarget(element) {
        if (!element || element.nodeType !== 1) return false;
        if (element.isContentEditable) return true;
        if (element.tagName === "TEXTAREA") return !element.disabled && !element.readOnly;
        if (element.tagName !== "INPUT") return false;
        if (element.disabled || element.readOnly) return false;
        const type = String(element.type || "text").toLowerCase();
        return ![
            "hidden", "checkbox", "radio", "button", "submit", "reset", "file",
            "range", "color", "date", "datetime-local", "month", "week", "time"
        ].includes(type);
    }

    function fieldValue(element) {
        if (!element) return "";
        return element.isContentEditable ? String(element.textContent || "") : String(element.value || "");
    }

    function setFieldValue(element, value) {
        if (!element) return;
        if (element.isContentEditable) element.textContent = value;
        else element.value = value;
    }

    function presetCharacters(rule) {
        if (!rule) return "";
        if (String(rule.preset || "custom") === "custom") return String(rule.characters || "");
        const preset = PRESETS[String(rule.preset || "")];
        return preset ? String(preset.characters || "") : String(rule.characters || "");
    }

    function charactersSet(rule) {
        return new Set(Array.from(presetCharacters(rule)));
    }

    function isPriceRule(rule) {
        return Boolean(rule && String(rule.preset || "") === "price" && String(rule.characterMode || "allowed") === "allowed");
    }

    function priceDecimals(rule) {
        const value = Number(rule && rule.priceDecimals);
        if (!Number.isFinite(value)) return PRICE_DEFAULT_DECIMALS;
        return Math.max(0, Math.min(6, Math.floor(value)));
    }

    function sanitizePriceValue(value, rule, finalPass) {
        const source = Array.from(String(value || "").replace(/\u00a0/g, " "));
        const decimals = priceDecimals(rule);
        let output = "";
        let separatorSeen = false;
        let decimalCount = 0;

        source.forEach(function (character) {
            if (/^[0-9]$/.test(character)) {
                if (!separatorSeen || decimalCount < decimals) {
                    output += character;
                    if (separatorSeen) decimalCount += 1;
                }
                return;
            }

            if (character === "." && decimals > 0 && !separatorSeen) {
                if (!output) output = "0";
                output += character;
                separatorSeen = true;
            }
        });

        if (finalPass && /\.$/.test(output)) {
            output = output.slice(0, -1);
        }
        return output;
    }

    function characterAllowed(character, rule) {
        const set = charactersSet(rule);
        const mode = String(rule && rule.characterMode || "forbidden");
        if (mode === "allowed") return set.has(character);
        return !set.has(character);
    }

    function applyCharacterRule(value, rule, finalPass) {
        if (isPriceRule(rule)) return sanitizePriceValue(value, rule, finalPass === true);
        return Array.from(String(value || "")).filter(function (character) {
            return characterAllowed(character, rule);
        }).join("");
    }

    function upperFirstLetter(value) {
        const chars = Array.from(String(value || ""));
        for (let i = 0; i < chars.length; i += 1) {
            const current = chars[i];
            if (current.toLocaleUpperCase() !== current.toLocaleLowerCase()) {
                chars[i] = current.toLocaleUpperCase();
                break;
            }
        }
        return chars.join("");
    }

    function applyCase(value, rule) {
        const mode = String(rule && rule.caseMode || "none");
        if (mode === "upper") return String(value || "").toLocaleUpperCase();
        if (mode === "lower") return String(value || "").toLocaleLowerCase();
        if (mode === "first-upper") return upperFirstLetter(value);
        return String(value || "");
    }

    function transformCharactersOnly(value, rules, finalPass) {
        let out = String(value || "");
        (rules || []).forEach(function (rule) {
            out = applyCharacterRule(out, rule, finalPass === true);
        });
        return out;
    }

    function transformValue(value, rules, finalPass) {
        let out = String(value || "");
        (rules || []).forEach(function (rule) {
            out = applyCharacterRule(out, rule, finalPass === true);
            out = applyCase(out, rule);
        });
        return out;
    }

    function candidateWithInsertedText(element, insertedText) {
        if (!element || element.isContentEditable) return null;
        const before = fieldValue(element);
        try {
            if (typeof element.selectionStart === "number" && typeof element.selectionEnd === "number") {
                return before.slice(0, element.selectionStart) + String(insertedText || "") + before.slice(element.selectionEnd);
            }
        } catch (_) {}
        return before + String(insertedText || "");
    }

    function defaultMessage(rule, rejected) {
        const custom = language() === "en"
            ? String(rule.messageEn || rule.messageFr || "").trim()
            : String(rule.messageFr || rule.messageEn || "").trim();
        if (custom) return custom;

        const shown = Array.from(new Set(Array.from(String(rejected || "")))).join(" ");
        if (language() === "en") {
            return shown
                ? "Character not allowed in this field: " + shown
                : "This entry is not allowed in this field.";
        }
        return shown
            ? "Caractère non autorisé dans ce champ : " + shown
            : "Cette saisie n’est pas autorisée dans ce champ.";
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .pmk048-input-feedback {
                display: block;
                width: fit-content;
                max-width: min(34rem, 100%);
                margin-top: .25rem;
                padding: .28rem .48rem;
                border: 1px solid rgba(176, 96, 0, .32);
                border-radius: .35rem;
                background: rgba(255, 193, 7, .12);
                color: #6d4700;
                font-size: .82rem;
                line-height: 1.3;
                overflow-wrap: anywhere;
            }
            .pmk048-input-feedback[hidden] { display: none !important; }
            .pmk048-field-invalid {
                outline: 2px solid rgba(220, 53, 69, .22);
                outline-offset: 1px;
            }
            @media (max-width: 576px) {
                .pmk048-input-feedback {
                    width: 100%;
                    max-width: 100%;
                    box-sizing: border-box;
                }
            }
        `;
        document.head.appendChild(style);
    }

    const feedbackTimers = new WeakMap();

    function feedbackContainerFor(element) {
        if (!element) return null;
        const id = element.getAttribute && element.getAttribute("data-pmk048-feedback-id");
        if (id) {
            const existing = document.getElementById(id);
            if (existing) return existing;
        }

        const box = document.createElement("span");
        box.id = "pmk048-feedback-" + makeId("f");
        box.className = "pmk048-input-feedback";
        box.setAttribute("role", "status");
        box.setAttribute("aria-live", "polite");
        box.hidden = true;

        const anchor = element.closest("li, .form-group, .mb-3, .row, td, th") || element.parentElement;
        if (anchor) anchor.appendChild(box);
        else element.insertAdjacentElement("afterend", box);

        if (element.setAttribute) {
            element.setAttribute("data-pmk048-feedback-id", box.id);
            const describedBy = String(element.getAttribute("aria-describedby") || "").trim();
            if (!describedBy.split(/\s+/).includes(box.id)) {
                element.setAttribute("aria-describedby", (describedBy ? describedBy + " " : "") + box.id);
            }
        }
        return box;
    }

    function showFeedback(element, rule, rejected) {
        if (!rule || rule.showMessage === false || !element) return;
        const box = feedbackContainerFor(element);
        if (!box) return;

        box.textContent = defaultMessage(rule, rejected);
        box.hidden = false;
        element.classList.add("pmk048-field-invalid");

        const previous = feedbackTimers.get(element);
        if (previous) window.clearTimeout(previous);
        const delay = Math.max(800, Number(rule.messageDurationMs || 2600));
        const timer = window.setTimeout(function () {
            box.hidden = true;
            element.classList.remove("pmk048-field-invalid");
            feedbackTimers.delete(element);
        }, delay);
        feedbackTimers.set(element, timer);
    }

    function activeRulesFor(element) {
        if (!currentConfig || currentConfig.enabled === false || !isEditableTarget(element)) return [];
        return (currentConfig.rules || []).filter(function (rule) {
            return rule && rule.enabled !== false && pageMatches(rule) && safeMatches(element, rule.targetSelector);
        });
    }

    function rejectedCharacters(text, rules) {
        const rejected = [];
        Array.from(String(text || "")).forEach(function (character) {
            if ((rules || []).some(function (rule) { return !characterAllowed(character, rule); })) {
                rejected.push(character);
            }
        });
        return rejected.join("");
    }

    function selectionSnapshot(element) {
        try {
            if (typeof element.selectionStart === "number" && typeof element.selectionEnd === "number") {
                return { start: element.selectionStart, end: element.selectionEnd };
            }
        } catch (_) {}
        return null;
    }

    function restoreCaretAfterTransform(element, before, after, selection) {
        if (!selection || !element || element.isContentEditable) return;
        try {
            const prefixBefore = String(before || "").slice(0, selection.start);
            const prefixAfter = transformValue(prefixBefore, activeRulesFor(element));
            const pos = Math.min(Array.from(after).length, Array.from(prefixAfter).length);
            element.setSelectionRange(pos, pos);
        } catch (_) {}
    }

    let internalMutation = false;
    let composingElement = null;

    function normalizeElement(element, notify) {
        const rules = activeRulesFor(element);
        if (!rules.length) return false;
        const before = fieldValue(element);
        const after = transformValue(before, rules);
        if (after === before) return false;

        const rejected = rejectedCharacters(before, rules);
        const selection = selectionSnapshot(element);
        internalMutation = true;
        setFieldValue(element, after);
        restoreCaretAfterTransform(element, before, after, selection);
        internalMutation = false;

        if (notify && rejected) {
            const culprit = rules.find(function (rule) {
                return Array.from(rejected).some(function (c) { return !characterAllowed(c, rule); });
            }) || rules[0];
            showFeedback(element, culprit, rejected);
        }
        return true;
    }

    function onBeforeInput(event) {
        const element = event.target;
        if (!isEditableTarget(element) || element === composingElement || event.isComposing) return;
        const rules = activeRulesFor(element);
        if (!rules.length) return;
        if (!String(event.inputType || "").startsWith("insert")) return;
        if (event.data == null || event.data === "") return;

        const candidate = candidateWithInsertedText(element, event.data);
        if (candidate == null) {
            const rejected = rejectedCharacters(event.data, rules);
            if (!rejected) return;
            event.preventDefault();
            const culprit = rules.find(function (rule) {
                return Array.from(rejected).some(function (c) { return !characterAllowed(c, rule); });
            }) || rules[0];
            showFeedback(element, culprit, rejected);
            return;
        }

        const filteredCandidate = transformCharactersOnly(candidate, rules, false);
        if (candidate === filteredCandidate) return;

        event.preventDefault();
        const rejected = event.data;
        const culprit = rules.find(function (rule) {
            return isPriceRule(rule) || Array.from(String(event.data || "")).some(function (c) { return !characterAllowed(c, rule); });
        }) || rules[0];
        showFeedback(element, culprit, rejected);
    }

    function onPaste(event) {
        const element = event.target;
        if (!isEditableTarget(element)) return;
        const rules = activeRulesFor(element);
        if (!rules.length) return;
        const clipboard = event.clipboardData;
        if (!clipboard || typeof clipboard.getData !== "function") return;
        const raw = clipboard.getData("text");
        if (raw == null) return;

        const candidate = candidateWithInsertedText(element, raw);
        if (candidate == null) {
            const transformed = transformValue(raw, rules, false);
            if (transformed === raw) return;
            event.preventDefault();
            try { document.execCommand("insertText", false, transformed); } catch (_) {}
            showFeedback(element, rules[0], raw);
            return;
        }

        const filteredCandidate = transformCharactersOnly(candidate, rules, false);
        if (candidate === filteredCandidate) return;

        event.preventDefault();
        const before = fieldValue(element);
        let start = before.length;
        let end = start;
        try {
            if (typeof element.selectionStart === "number") start = element.selectionStart;
            if (typeof element.selectionEnd === "number") end = element.selectionEnd;
        } catch (_) {}
        const acceptedFragment = transformValue(raw, rules, false);
        try {
            if (!element.isContentEditable && typeof element.setRangeText === "function") {
                internalMutation = true;
                element.setRangeText(acceptedFragment, start, end, "end");
                internalMutation = false;
                normalizeElement(element, false);
                element.dispatchEvent(new Event("input", { bubbles: true }));
            }
        } catch (_) {
            internalMutation = false;
        }
        showFeedback(element, rules.find(isPriceRule) || rules[0], raw);
    }

    function onInput(event) {
        if (internalMutation) return;
        const element = event.target;
        if (!isEditableTarget(element) || element === composingElement || event.isComposing) return;
        normalizeElement(element, true);
    }

    function onCompositionStart(event) {
        if (isEditableTarget(event.target)) composingElement = event.target;
    }

    function onCompositionEnd(event) {
        const element = event.target;
        if (composingElement === element) composingElement = null;
        if (isEditableTarget(element)) normalizeElement(element, true);
    }

    function finalizeElement(element, notify) {
        const rules = activeRulesFor(element);
        if (!rules.length) return false;
        const before = fieldValue(element);
        const after = transformValue(before, rules, true);
        if (after === before) return false;
        internalMutation = true;
        setFieldValue(element, after);
        internalMutation = false;
        if (notify) showFeedback(element, rules.find(isPriceRule) || rules[0], before);
        return true;
    }

    function onBlur(event) {
        if (isEditableTarget(event.target)) finalizeElement(event.target, false);
    }

    function onSubmit(event) {
        const form = event.target;
        if (!form || form.nodeType !== 1 || String(form.tagName || "").toUpperCase() !== "FORM") return;
        try {
            form.querySelectorAll("input, textarea, [contenteditable='true']").forEach(function (element) {
                if (isEditableTarget(element)) finalizeElement(element, false);
            });
        } catch (_) {}
    }

    function bindDelegatedEvents() {
        if (window.__PMK048_INPUT_RULES_EVENTS__) return;
        window.__PMK048_INPUT_RULES_EVENTS__ = true;
        document.addEventListener("beforeinput", onBeforeInput, true);
        document.addEventListener("paste", onPaste, true);
        document.addEventListener("input", onInput, true);
        document.addEventListener("compositionstart", onCompositionStart, true);
        document.addEventListener("compositionend", onCompositionEnd, true);
        document.addEventListener("blur", onBlur, true);
        document.addEventListener("submit", onSubmit, true);
    }

    function ruleIndex(path) {
        const idx = (path || []).indexOf("rules");
        if (idx < 0) return -1;
        const value = Number(path[idx + 1]);
        return Number.isInteger(value) ? value : -1;
    }

    function ruleAt(root, path) {
        const index = ruleIndex(path);
        return index >= 0 && root && Array.isArray(root.rules) ? root.rules[index] : null;
    }

    function applyPickerMetadata(root, path, result) {
        const rule = ruleAt(root, path);
        if (!rule || !result) return;
        rule.targetName = String(result.targetName || result.selector || rule.targetName || "");
        if (!String(rule.pagePath || "").trim() && result.pagePath) rule.pagePath = String(result.pagePath);
    }

    function pickTarget(context) {
        const picker = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!picker || typeof picker.pickForConfig !== "function") {
            return Promise.reject(new Error("pmk_common_picker_unavailable"));
        }
        const root = context && context.rootObject ? context.rootObject : {};
        const path = context && Array.isArray(context.fieldPath) ? context.fieldPath.slice() : [];
        const rule = ruleAt(root, path);
        return picker.pickForConfig({
            moduleId: MODULE_ID,
            targetUrl: targetUrl(rule),
            rootObject: root,
            fieldPath: path,
            persistAfterPick: false,
            adminContext: { sectionId: "rules", ruleIndex: ruleIndex(path) },
            options: {
                bannerText: i18n(
                    "Clique sur le champ de saisie Koha à contrôler — Échap annule",
                    "Click the Koha input field to control — Esc cancels"
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

    function newRule() {
        return {
            id: makeId("input-rule"),
            enabled: true,
            label: "Nouvelle règle de saisie",
            pagePath: window.location.pathname || "",
            targetSelector: "",
            targetName: "",
            characterMode: "forbidden",
            preset: "custom",
            characters: "",
            priceDecimals: PRICE_DEFAULT_DECIMALS,
            caseMode: "none",
            showMessage: true,
            messageFr: "",
            messageEn: "",
            messageDurationMs: 2600
        };
    }

    const DEFAULT_CONFIG = {
        enabled: true,
        rules: [
            {
                id: "legacy-048-batchmod-accents",
                enabled: true,
                label: "048 — accents interdits en modification par lot",
                pagePath: BATCHMOD_PATH,
                targetSelector: "#cataloguing_additem_newitem input[type='text'], #cataloguing_additem_newitem textarea",
                targetName: "Champs texte de modification des exemplaires",
                characterMode: "forbidden",
                preset: "legacy048",
                characters: LEGACY_048_ACCENTS,
                caseMode: "none",
                showMessage: true,
                messageFr: "Ce caractère accentué n’est pas autorisé dans ce champ.",
                messageEn: "This accented character is not allowed in this field.",
                messageDurationMs: 2600
            },
            {
                id: "legacy-131-price-entry",
                enabled: true,
                label: "Prix des exemplaires — contrôle de saisie",
                pagePath: "*",
                targetSelector: PRICE_SELECTOR,
                targetName: "Prix d'achat et prix de remplacement des exemplaires",
                characterMode: "allowed",
                preset: "price",
                characters: PRESETS.price.characters,
                priceDecimals: PRICE_DEFAULT_DECIMALS,
                caseMode: "none",
                showMessage: true,
                messageFr: "Saisir un prix avec des chiffres et, si nécessaire, un seul point décimal. La virgule est interdite.",
                messageEn: "Enter a price using digits and, if needed, a single decimal point. Commas are not allowed.",
                messageDurationMs: 2600
            }
        ]
    };

    function normalizeRule(rule, index) {
        const source = rule && typeof rule === "object" ? rule : {};
        const base = newRule();
        const out = Object.assign(base, clone(source));
        out.id = String(out.id || makeId("input-rule"));
        out.label = String(out.label || "Règle " + (index + 1));
        out.pagePath = String(out.pagePath || "").trim();
        out.targetSelector = String(out.targetSelector || "").trim();
        out.targetName = String(out.targetName || "").trim();
        out.characterMode = ["allowed", "forbidden"].includes(out.characterMode) ? out.characterMode : "forbidden";
        out.preset = PRESETS[out.preset] ? out.preset : "custom";
        out.characters = String(out.characters == null ? "" : out.characters);
        out.priceDecimals = priceDecimals(out);

        const legacyPricePlaceholder = out.id === "legacy-131-price-entry" &&
            !String(source.targetSelector || "").trim() &&
            (!String(source.pagePath || "").trim() || String(source.label || "").indexOf("à pointer") !== -1);
        if (legacyPricePlaceholder) {
            out.enabled = true;
            out.label = "Prix des exemplaires — contrôle de saisie";
            out.pagePath = "*";
            out.targetSelector = PRICE_SELECTOR;
            out.targetName = "Prix d'achat et prix de remplacement des exemplaires";
            out.characterMode = "allowed";
            out.preset = "price";
            out.characters = PRESETS.price.characters;
            out.priceDecimals = PRICE_DEFAULT_DECIMALS;
            out.messageFr = "Saisir un prix avec des chiffres et au maximum un séparateur décimal (virgule ou point).";
            out.messageEn = "Enter a price using digits and at most one decimal separator (comma or dot).";
        }

        out.caseMode = ["none", "upper", "lower", "first-upper"].includes(out.caseMode) ? out.caseMode : "none";
        out.messageFr = String(out.messageFr || "");
        out.messageEn = String(out.messageEn || "");
        out.messageDurationMs = Math.max(800, Math.min(10000, Number(out.messageDurationMs || 2600)));
        return out;
    }

    function normalizeConfig(config) {
        const source = config && typeof config === "object" ? config : {};
        const rules = Array.isArray(source.rules) ? source.rules : DEFAULT_CONFIG.rules;
        return {
            enabled: source.enabled !== false,
            rules: rules.map(normalizeRule)
        };
    }

    function validate(config) {
        const cfg = normalizeConfig(config);
        const ids = new Set();
        for (let i = 0; i < cfg.rules.length; i += 1) {
            const rule = cfg.rules[i];
            if (!rule.id || ids.has(rule.id)) {
                return { ok: false, message: i18n("Chaque règle doit avoir un identifiant unique.", "Each rule must have a unique identifier.") };
            }
            ids.add(rule.id);
            if (!String(rule.label || "").trim()) {
                return { ok: false, message: i18n("Chaque règle doit avoir un nom.", "Each rule must have a name.") };
            }
            if (rule.enabled !== false && !String(rule.targetSelector || "").trim()) {
                return { ok: false, message: i18n("Une règle active doit cibler un champ Koha.", "An enabled rule must target a Koha field.") };
            }
            if (rule.preset === "custom" && !String(rule.characters || "").length) {
                return { ok: false, message: i18n("Une règle personnalisée doit contenir au moins un caractère.", "A custom rule must contain at least one character.") };
            }
            if (rule.preset === "price" && (!Number.isInteger(Number(rule.priceDecimals)) || Number(rule.priceDecimals) < 0 || Number(rule.priceDecimals) > 6)) {
                return { ok: false, message: i18n("Le nombre de décimales du prix doit être compris entre 0 et 6.", "Price decimal places must be between 0 and 6.") };
            }
            if (rule.targetSelector) {
                try { document.querySelector(rule.targetSelector); } catch (_) {
                    return { ok: false, message: i18n("Un sélecteur de champ est invalide.", "A field selector is invalid.") };
                }
            }
        }
        return { ok: true };
    }

    function presetOptions() {
        return Object.keys(PRESETS).map(function (key) {
            const preset = PRESETS[key];
            return { value: key, label: { fr: preset.fr, en: preset.en } };
        });
    }

    function modeOptions() {
        return [
            { value: "forbidden", label: { fr: "Interdire les caractères de la liste", en: "Forbid characters in the list" } },
            { value: "allowed", label: { fr: "Autoriser uniquement les caractères de la liste", en: "Allow only characters in the list" } }
        ];
    }

    function caseOptions() {
        return [
            { value: "none", label: { fr: "Ne pas modifier la casse", en: "Do not change case" } },
            { value: "upper", label: { fr: "TOUT EN MAJUSCULES", en: "ALL UPPERCASE" } },
            { value: "first-upper", label: { fr: "Première lettre en majuscule", en: "First letter uppercase" } },
            { value: "lower", label: { fr: "tout en minuscules", en: "all lowercase" } }
        ];
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 2,
            name: { fr: "Règles de saisie", en: "Input rules" },
            description: {
                fr: "Contrôle réellement la saisie dans les champs Koha : caractères autorisés/interdits, casse et prix d'exemplaires. La règle prix cible par défaut items.price et items.replacementprice. Remplace le 048 et absorbe le 131 sans modifier le 035.",
                en: "Enforces input rules in Koha fields: allowed/forbidden characters, case and item prices. The price rule targets items.price and items.replacementprice by default. Replaces 048 and absorbs 131 without changing 035."
            },
            category: { fr: "Interface / saisie", en: "Interface / input" },
            supportedPages: ["*"],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            normalize: normalizeConfig,
            validate: validate,
            schema: [
                {
                    type: "section",
                    id: "activation",
                    label: { fr: "Activation", en: "Activation" },
                    fields: [
                        { key: "enabled", type: "boolean", label: { fr: "Activer les règles de saisie", en: "Enable input rules" } }
                    ]
                },
                {
                    type: "section",
                    id: "rules",
                    label: { fr: "Règles de saisie", en: "Input rules" },
                    description: {
                        fr: "Ajoute autant de règles que nécessaire. Pour chaque règle, indique la page puis choisis directement le champ Koha. Les règles sont appliquées dans l’ordre affiché.",
                        en: "Add as many rules as needed. For each rule, specify the page then select the Koha field directly. Rules are applied in the displayed order."
                    },
                    fields: [
                        {
                            key: "rules",
                            type: "repeater",
                            label: { fr: "Règles", en: "Rules" },
                            addLabel: { fr: "Ajouter une règle", en: "Add rule" },
                            emptyLabel: { fr: "Aucune règle configurée.", en: "No configured rule." },
                            reorder: true,
                            newItem: newRule,
                            itemTitle: function (item, index) {
                                return String(item && (item.label || item.targetName || item.targetSelector) || "").trim() || "Règle " + (index + 1);
                            },
                            liveTitleKey: "label",
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Règle active", en: "Rule enabled" } },
                                { key: "label", type: "text", label: { fr: "Nom de la règle", en: "Rule name" } },
                                {
                                    key: "pagePath",
                                    type: "text",
                                    label: { fr: "Page Koha", en: "Koha page" },
                                    help: {
                                        fr: "Chemin de la page, par exemple /cgi-bin/koha/tools/batchMod.pl. Laisser vide ou saisir * pour toutes les pages. Le picker ouvre cette page avant la sélection.",
                                        en: "Page path, for example /cgi-bin/koha/tools/batchMod.pl. Leave blank or use * for all pages. The picker opens this page before selection."
                                    }
                                },
                                {
                                    key: "targetSelector",
                                    type: "elementPicker",
                                    label: { fr: "Champ de saisie Koha", en: "Koha input field" },
                                    pickLabel: { fr: "Choisir le champ sur la page", en: "Choose the field on the page" },
                                    emptyLabel: { fr: "Aucun champ choisi", en: "No field selected" },
                                    allowManual: true,
                                    pick: pickTarget,
                                    onPick: applyPickerMetadata,
                                    help: {
                                        fr: "Choisis directement un input, textarea ou champ éditable. Le mode manuel reste disponible en avancé.",
                                        en: "Select an input, textarea or editable field directly. Manual selector entry remains available in advanced mode."
                                    }
                                },
                                { key: "targetName", type: "text", readOnly: true, advanced: true, label: { fr: "Champ détecté", en: "Detected field" } },
                                {
                                    key: "characterMode",
                                    type: "select",
                                    label: { fr: "Règle de caractères", en: "Character rule" },
                                    options: modeOptions()
                                },
                                {
                                    key: "preset",
                                    type: "select",
                                    refreshOnChange: true,
                                    label: { fr: "Liste prédéfinie", en: "Preset list" },
                                    options: presetOptions(),
                                    help: {
                                        fr: "Le sens de la liste dépend de l’option précédente : interdite ou seule liste autorisée.",
                                        en: "The list is interpreted according to the previous option: forbidden, or the only allowed characters."
                                    }
                                },
                                {
                                    key: "characters",
                                    type: "textarea",
                                    label: { fr: "Caractères personnalisés", en: "Custom characters" },
                                    when: function (root, path) {
                                        const rule = ruleAt(root, path);
                                        return Boolean(rule && rule.preset === "custom");
                                    },
                                    help: {
                                        fr: "Saisis directement les caractères, sans séparateur. Exemple : 0123456789.-",
                                        en: "Enter characters directly, with no separator. Example: 0123456789.-"
                                    }
                                },
                                {
                                    key: "priceDecimals",
                                    type: "number",
                                    min: 0,
                                    max: 6,
                                    label: { fr: "Nombre maximal de décimales", en: "Maximum decimal places" },
                                    when: function (root, path) {
                                        const rule = ruleAt(root, path);
                                        return Boolean(rule && rule.preset === "price");
                                    },
                                    help: {
                                        fr: "Pour le preset Prix, seuls les chiffres et un unique point décimal sont acceptés. La virgule est refusée. Par défaut : 2 décimales.",
                                        en: "For the Price preset, only digits and a single decimal point are accepted. Commas are rejected. Default: 2 decimal places."
                                    }
                                },
                                {
                                    key: "caseMode",
                                    type: "select",
                                    label: { fr: "Casse automatique", en: "Automatic case" },
                                    options: caseOptions()
                                },
                                { key: "showMessage", type: "boolean", refreshOnChange: true, label: { fr: "Informer quand une saisie est refusée", en: "Show a message when input is rejected" } },
                                {
                                    key: "messageFr",
                                    type: "text",
                                    label: { fr: "Message — français", en: "Message — French" },
                                    when: function (root, path) {
                                        const rule = ruleAt(root, path);
                                        return Boolean(rule && rule.showMessage !== false);
                                    },
                                    help: { fr: "Laisser vide pour utiliser le message automatique.", en: "Leave blank to use the automatic message." }
                                },
                                {
                                    key: "messageEn",
                                    type: "text",
                                    label: { fr: "Message — anglais", en: "Message — English" },
                                    when: function (root, path) {
                                        const rule = ruleAt(root, path);
                                        return Boolean(rule && rule.showMessage !== false);
                                    },
                                    help: { fr: "Laisser vide pour utiliser le message automatique.", en: "Leave blank to use the automatic message." }
                                },
                                {
                                    key: "messageDurationMs",
                                    type: "number",
                                    advanced: true,
                                    label: { fr: "Durée du message (ms)", en: "Message duration (ms)" }
                                }
                            ]
                        }
                    ]
                }
            ],
            focusContext: function (main) {
                if (!main) return;
                const section = main.querySelector('[data-pmk-section-id="rules"]');
                if (!section) return;
                window.setTimeout(function () {
                    section.scrollIntoView({ block: "start", behavior: "smooth" });
                }, 0);
            }
        };
    }

    let currentConfig = normalizeConfig(DEFAULT_CONFIG);
    let unsubscribe = null;

    function refreshConfig(config) {
        currentConfig = normalizeConfig(config || DEFAULT_CONFIG);
        mountContextAccess();
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

    function matchingElementsForCurrentPage() {
        const found = [];
        const seen = new Set();
        (currentConfig.rules || []).forEach(function (rule) {
            if (!rule || rule.enabled === false || !pageMatches(rule) || !rule.targetSelector) return;
            try {
                document.querySelectorAll(rule.targetSelector).forEach(function (element) {
                    if (!seen.has(element) && isEditableTarget(element)) {
                        seen.add(element);
                        found.push(element);
                    }
                });
            } catch (_) {}
        });
        return found;
    }

    function mountContextAccess() {
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        const elements = matchingElementsForCurrentPage();
        if (!elements.length) return;
        const first = elements[0];
        const anchor = first.closest("li, .form-group, .mb-3, .row") || first.parentElement || first;
        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "append",
                contextKey: CONTEXT_KEY + "-" + pageKey(window.location.pathname),
                context: { sectionId: "rules" }
            });
        } catch (_) {}
    }

    function start() {
        ensureStyles();
        bindDelegatedEvents();
        registerDefinition();
        registerPickerAdapter();
        loadConfig();
        window.setTimeout(mountContextAccess, 0);
        window.setTimeout(mountContextAccess, 800);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }

    window.addEventListener("pmk:config-ready", function () {
        registerDefinition();
        registerPickerAdapter();
        loadConfig();
    });

    window.PMK048InputRules = {
        version: MODULE_VERSION,
        moduleId: MODULE_ID,
        defaults: clone(DEFAULT_CONFIG),
        presets: clone(PRESETS),
        normalize: normalizeConfig,
        refresh: function () { refreshConfig(currentConfig); },
        testValue: function (value, rule) {
            const normalized = normalizeRule(rule || newRule(), 0);
            return transformValue(value, [normalized], false);
        },
        diagnose: function () {
            return {
                version: MODULE_VERSION,
                enabled: currentConfig.enabled !== false,
                page: window.location.pathname,
                priceSelector: PRICE_SELECTOR,
                matchingPriceFields: document.querySelectorAll(PRICE_SELECTOR).length,
                matchingConfiguredFields: matchingElementsForCurrentPage().length,
                rules: (currentConfig.rules || []).map(function (rule) {
                    let matches = 0;
                    try { matches = pageMatches(rule) && rule.targetSelector ? document.querySelectorAll(rule.targetSelector).length : 0; } catch (_) {}
                    return { id: rule.id, enabled: rule.enabled !== false, label: rule.label, selector: rule.targetSelector, matches: matches };
                })
            };
        }
    };
})();

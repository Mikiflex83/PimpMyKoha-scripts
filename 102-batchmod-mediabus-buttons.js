/*
 Nom du fichier : 102-batchmod-mediabus-buttons.js
 Version : 3.0.0-preplugin
 Date : 2026-09-20

 PimpMyKoha — Boutons modèles exemplaires

 Principes :
 - module autonome, distinct du 110 "Exemplaire Helper" ;
 - conserve les deux boutons historiques MEDIABUS par défaut ;
 - permet de créer un nombre libre de boutons-modèles dans PMK ;
 - chaque bouton peut appliquer plusieurs valeurs à un formulaire exemplaire ;
 - ne soumet JAMAIS le formulaire Koha ;
 - respecte le mécanisme Koha `disable_input` pour une suppression en modification par lot ;
 - valide les valeurs des <select> réellement présents avant application ;
 - déclenche les événements input/change pour synchroniser Koha et Select2 ;
 - reste fail-safe : un champ/une valeur introuvable est ignoré et signalé ;
 - français / anglais ;
 - rendu compact et natif Koha, responsive.
*/
(function () {
    "use strict";

    if (window.__PMK102_ITEM_TEMPLATE_BUTTONS__) return;
    window.__PMK102_ITEM_TEMPLATE_BUTTONS__ = true;

    const MODULE_ID = "item-template-buttons";
    const MODULE_VERSION = "3.0.0-preplugin";
    const TOOLBAR_ID = "pmk-item-template-buttons";
    const STYLE_ID = "pmk-item-template-buttons-style";
    const DIALOG_ID = "pmk-item-template-buttons-dialog";

    const PAGE_DEFINITIONS = [
        {
            id: "tools.batchmod",
            path: "/cgi-bin/koha/tools/batchMod.pl",
            labelFr: "Modification d’exemplaires par lot",
            labelEn: "Batch item modification",
            enabled: true
        },
        {
            id: "cataloguing.additem",
            path: "/cgi-bin/koha/cataloguing/additem.pl",
            labelFr: "Création / modification d’exemplaire",
            labelEn: "Item creation / editing",
            enabled: true
        }
    ];

    /*
     * Liste d'aide pour la configuration.
     * Le moteur runtime n'est PAS limité à cette liste :
     * `__custom__` accepte n'importe quel kohafield réellement présent dans le formulaire.
     */
    const FIELD_OPTIONS = [
        { value: "items.homebranch", fr: "Bibliothèque propriétaire", en: "Home library" },
        { value: "items.holdingbranch", fr: "Bibliothèque actuelle", en: "Current library" },
        { value: "items.enumchron", fr: "Énumération / chronologie", en: "Enumeration / chronology" },
        { value: "items.location", fr: "Localisation", en: "Shelving location" },
        { value: "items.copynumber", fr: "Numéro de copie / sous-localisation locale", en: "Copy number / local sub-location" },
        { value: "items.itemcallnumber", fr: "Cote", en: "Call number" },
        { value: "items.barcode", fr: "Code-barres", en: "Barcode" },
        { value: "items.itype", fr: "Type d’exemplaire", en: "Item type" },
        { value: "items.ccode", fr: "Code collection", en: "Collection code" },
        { value: "items.more_subfields_xml_q", fr: "Public (champ local)", en: "Audience (local field)" },
        { value: "items.notforloan", fr: "Statut non prêtable", en: "Not for loan status" },
        { value: "items.itemlost", fr: "Statut perdu", en: "Lost status" },
        { value: "items.withdrawn", fr: "Statut retiré", en: "Withdrawn status" },
        { value: "items.damaged", fr: "Statut endommagé", en: "Damaged status" },
        { value: "items.restricted", fr: "Restriction", en: "Restriction" },
        { value: "items.more_subfields_xml_t", fr: "Achat / don (champ local)", en: "Purchase / donation (local field)" },
        { value: "items.more_subfields_xml_A", fr: "Fournisseur (champ local)", en: "Vendor (local field)" },
        { value: "items.replacementprice", fr: "Prix de remplacement", en: "Replacement price" },
        { value: "items.price", fr: "Prix", en: "Price" },
        { value: "items.dateaccessioned", fr: "Date d’acquisition", en: "Acquisition date" },
        { value: "items.itemnotes_nonpublic", fr: "Note interne", en: "Internal note" },
        { value: "items.itemnotes", fr: "Note publique / OPAC", en: "Public / OPAC note" },
        { value: "items.uri", fr: "URI", en: "URI" },
        { value: "items.more_subfields_xml_v", fr: "Numéro de revue (champ local)", en: "Issue number (local field)" },
        { value: "items.more_subfields_xml_y", fr: "Sous-localisation / valeur locale y", en: "Local y value" },
        { value: "__custom__", fr: "Autre kohafield…", en: "Other kohafield…" }
    ];

    const HISTORICAL_MODELS = [
        /*
         * L'ordre reproduit le rendu historique réel du script 102 :
         * les deux insertAdjacentElement('afterend') successifs faisaient apparaître
         * "Envoyer" avant "Sortir".
         */
        {
            id: "mediabus-send-reservoir",
            enabled: true,
            labelFr: "Envoyer au reservoir MEDIABUS",
            labelEn: "Send to MEDIABUS reservoir",
            descriptionFr: "Applique les valeurs historiques utilisées pour envoyer un exemplaire au réservoir MEDIABUS.",
            descriptionEn: "Applies the historical values used to send an item to the MEDIABUS reservoir.",
            showOnBatchMod: true,
            showOnAddItem: true,
            groupFr: "",
            groupEn: "",
            iconClass: "",
            variant: "default",
            customBackground: "#408540",
            customTextColor: "#ffffff",
            customBorderColor: "#397a39",
            confirmBeforeApply: false,
            confirmTitleFr: "Appliquer ce modèle ?",
            confirmTitleEn: "Apply this template?",
            confirmMessageFr: "Les champs du formulaire seront préparés, mais Koha ne sera pas enregistré automatiquement.",
            confirmMessageEn: "The form fields will be prepared, but Koha will not be saved automatically.",
            assignments: [
                { enabled: true, target: "items.homebranch", customTarget: "", action: "set", value: "RMDB" },
                { enabled: true, target: "items.holdingbranch", customTarget: "", action: "set", value: "RMDB" },
                { enabled: true, target: "items.enumchron", customTarget: "", action: "set", value: "Sous-sol" },
                { enabled: true, target: "items.notforloan", customTarget: "", action: "set", value: "1" }
            ]
        },
        {
            id: "mediabus-remove-reservoir",
            enabled: true,
            labelFr: "Sortir du reservoir MEDIABUS",
            labelEn: "Remove from MEDIABUS reservoir",
            descriptionFr: "Applique les valeurs historiques utilisées pour sortir un exemplaire du réservoir MEDIABUS.",
            descriptionEn: "Applies the historical values used to remove an item from the MEDIABUS reservoir.",
            showOnBatchMod: true,
            showOnAddItem: true,
            groupFr: "",
            groupEn: "",
            iconClass: "",
            variant: "default",
            customBackground: "#408540",
            customTextColor: "#ffffff",
            customBorderColor: "#397a39",
            confirmBeforeApply: false,
            confirmTitleFr: "Appliquer ce modèle ?",
            confirmTitleEn: "Apply this template?",
            confirmMessageFr: "Les champs du formulaire seront préparés, mais Koha ne sera pas enregistré automatiquement.",
            confirmMessageEn: "The form fields will be prepared, but Koha will not be saved automatically.",
            assignments: [
                { enabled: true, target: "items.homebranch", customTarget: "", action: "set", value: "MDB" },
                { enabled: true, target: "items.holdingbranch", customTarget: "", action: "set", value: "MDB" },
                { enabled: true, target: "items.enumchron", customTarget: "", action: "set", value: "RDC" },
                { enabled: true, target: "items.notforloan", customTarget: "", action: "set", value: "0" }
            ]
        }
    ];

    const DEFAULT_CONFIG = {
        enabled: true,
        pages: PAGE_DEFINITIONS.map(function (page) {
            return {
                id: page.id,
                path: page.path,
                enabled: page.enabled
            };
        }),
        toolbar: {
            showTitle: false,
            titleFr: "Modèles rapides",
            titleEn: "Quick templates",
            compactButtons: true,
            gapPx: 8,
            marginTopPx: 8,
            marginBottomPx: 10,
            showSuccessMessage: false,
            showWarnings: true
        },
        models: clone(HISTORICAL_MODELS)
    };

    let currentConfig = clone(DEFAULT_CONFIG);
    let configRegistered = false;
    let unsubscribe = null;
    let observer = null;
    let mountTimer = null;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function isObject(value) {
        return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    }

    function deepMerge(base, override) {
        if (Array.isArray(base)) {
            return Array.isArray(override) ? clone(override) : clone(base);
        }
        if (!isObject(base)) {
            return override === undefined ? clone(base) : clone(override);
        }
        const out = clone(base);
        if (!isObject(override)) return out;
        Object.keys(override).forEach(function (key) {
            out[key] = Object.prototype.hasOwnProperty.call(base, key)
                ? deepMerge(base[key], override[key])
                : clone(override[key]);
        });
        return out;
    }

    function normalizeText(value) {
        return String(value || "")
            .replace(/\u00a0/g, " ")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function detectLanguage() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            try {
                return window.PMKConfig.getLanguage() === "en" ? "en" : "fr";
            } catch (_) {}
        }
        const lang = String(document.documentElement.lang || navigator.language || "").toLowerCase();
        return lang.startsWith("en") ? "en" : "fr";
    }

    function textByLanguage(fr, en) {
        return detectLanguage() === "en" ? (en || fr || "") : (fr || en || "");
    }

    function isSupportedPath() {
        return PAGE_DEFINITIONS.some(function (page) {
            return page.path === window.location.pathname;
        });
    }

    function pageConfig() {
        const pages = Array.isArray(currentConfig.pages) ? currentConfig.pages : [];
        return pages.find(function (page) {
            return page && page.path === window.location.pathname;
        }) || null;
    }

    function moduleEnabledHere() {
        if (currentConfig.enabled === false) return false;
        const page = pageConfig();
        return Boolean(page && page.enabled !== false);
    }

    function modelVisibleHere(model) {
        if (!model || model.enabled === false) return false;
        if (window.location.pathname === "/cgi-bin/koha/tools/batchMod.pl") {
            return model.showOnBatchMod !== false;
        }
        if (window.location.pathname === "/cgi-bin/koha/cataloguing/additem.pl") {
            return model.showOnAddItem !== false;
        }
        return false;
    }

    function safeNumber(value, fallback, min, max) {
        let n = Number(value);
        if (!Number.isFinite(n)) n = fallback;
        if (Number.isFinite(min)) n = Math.max(min, n);
        if (Number.isFinite(max)) n = Math.min(max, n);
        return n;
    }

    function injectStyles() {
        let style = document.getElementById(STYLE_ID);
        if (style) return style;

        style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #${TOOLBAR_ID} {
                --pmk102-gap: 8px;
                --pmk102-mt: 8px;
                --pmk102-mb: 10px;
                display: block;
                box-sizing: border-box;
                width: 100%;
                margin-top: var(--pmk102-mt);
                margin-bottom: var(--pmk102-mb);
            }
            #${TOOLBAR_ID} .pmk102-title {
                margin: 0 0 .35rem;
                font-size: .9rem;
                font-weight: 600;
                color: #495057;
            }
            #${TOOLBAR_ID} .pmk102-groups {
                display: flex;
                flex-wrap: wrap;
                align-items: flex-end;
                gap: var(--pmk102-gap);
            }
            #${TOOLBAR_ID} .pmk102-group {
                display: inline-flex;
                flex-wrap: wrap;
                align-items: center;
                gap: var(--pmk102-gap);
                min-width: 0;
            }
            #${TOOLBAR_ID} .pmk102-group-label {
                font-size: .78rem;
                font-weight: 600;
                color: #6c757d;
                margin-right: .1rem;
            }
            #${TOOLBAR_ID} .pmk102-button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: .35rem;
                white-space: normal;
                text-align: center;
                line-height: 1.2;
            }
            #${TOOLBAR_ID}.pmk102-compact .pmk102-button {
                min-height: 30px;
                padding-top: .25rem;
                padding-bottom: .25rem;
            }
            #${TOOLBAR_ID} .pmk102-button[data-pmk-variant="custom"] {
                background: var(--pmk102-btn-bg, #408540) !important;
                color: var(--pmk102-btn-text, #fff) !important;
                border-color: var(--pmk102-btn-border, #397a39) !important;
            }
            #${TOOLBAR_ID} .pmk102-button[data-pmk-variant="custom"]:hover,
            #${TOOLBAR_ID} .pmk102-button[data-pmk-variant="custom"]:focus {
                filter: brightness(.95);
            }
            #${TOOLBAR_ID} .pmk102-status {
                display: none;
                margin-top: .45rem;
                padding: .38rem .55rem;
                border: 1px solid #dee2e6;
                border-radius: .25rem;
                background: #f8f9fa;
                color: #495057;
                font-size: .82rem;
                line-height: 1.35;
            }
            #${TOOLBAR_ID} .pmk102-status.is-visible { display: block; }
            #${TOOLBAR_ID} .pmk102-status.is-warning {
                border-color: #ffe69c;
                background: #fff3cd;
                color: #664d03;
            }
            #${TOOLBAR_ID} .pmk102-status.is-success {
                border-color: #badbcc;
                background: #d1e7dd;
                color: #0f5132;
            }
            #${TOOLBAR_ID} .pmk102-status ul {
                margin: .2rem 0 0 1.1rem;
                padding: 0;
            }
            #${TOOLBAR_ID} .pmk102-config-anchor {
                display: inline-flex;
                align-items: center;
                min-height: 30px;
            }

            #${DIALOG_ID} {
                position: fixed;
                inset: 0;
                z-index: 2147483000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 1rem;
                background: rgba(0,0,0,.42);
            }
            #${DIALOG_ID} .pmk102-dialog {
                width: min(34rem, calc(100vw - 2rem));
                max-height: calc(100vh - 2rem);
                overflow: auto;
                background: #fff;
                border: 1px solid #dee2e6;
                border-radius: .4rem;
                box-shadow: 0 .5rem 1.5rem rgba(0,0,0,.18);
            }
            #${DIALOG_ID} .pmk102-dialog-head,
            #${DIALOG_ID} .pmk102-dialog-body,
            #${DIALOG_ID} .pmk102-dialog-actions {
                padding: .8rem 1rem;
            }
            #${DIALOG_ID} .pmk102-dialog-head {
                border-bottom: 1px solid #e9ecef;
            }
            #${DIALOG_ID} .pmk102-dialog-head h3 {
                margin: 0;
                font-size: 1rem;
            }
            #${DIALOG_ID} .pmk102-dialog-body {
                white-space: pre-wrap;
            }
            #${DIALOG_ID} .pmk102-dialog-actions {
                display: flex;
                justify-content: flex-end;
                gap: .5rem;
                border-top: 1px solid #e9ecef;
            }

            @media (max-width: 576px) {
                #${TOOLBAR_ID} .pmk102-groups,
                #${TOOLBAR_ID} .pmk102-group {
                    width: 100%;
                }
                #${TOOLBAR_ID} .pmk102-button {
                    flex: 1 1 12rem;
                    max-width: 100%;
                }
                #${DIALOG_ID} .pmk102-dialog-actions {
                    flex-direction: column-reverse;
                }
                #${DIALOG_ID} .pmk102-dialog-actions .btn {
                    width: 100%;
                }
            }
        `;
        (document.head || document.documentElement).appendChild(style);
        return style;
    }

    function removeToolbar() {
        const toolbar = document.getElementById(TOOLBAR_ID);
        if (toolbar) toolbar.remove();
    }

    function findHistoricalAnchor() {
        const path = window.location.pathname;

        if (path === "/cgi-bin/koha/cataloguing/additem.pl") {
            const legacy = document.getElementById("edititem");
            if (legacy) return legacy;

            const field = document.querySelector('[name="items.homebranch"], [name="items.holdingbranch"], [name="items.barcode"]');
            if (field) {
                const form = field.closest("form");
                if (form) {
                    const heading = form.querySelector("h1, h2, h3, legend");
                    if (heading) return heading;
                }
            }

            return document.querySelector("main h1, main h2, h1, h2");
        }

        if (path === "/cgi-bin/koha/tools/batchMod.pl") {
            const headings = Array.from(document.querySelectorAll("h1, h2, h3"));
            const patterns = [
                "modifier les exemplaires",
                "modification des exemplaires",
                "modify items",
                "batch item modification"
            ];

            const legacyHeading = headings.find(function (heading) {
                const txt = normalizeText(heading.textContent);
                return patterns.some(function (pattern) {
                    return txt.indexOf(normalizeText(pattern)) !== -1;
                });
            });
            if (legacyHeading) return legacyHeading;

            const field = document.querySelector('[name="items.homebranch"], [name="items.holdingbranch"], [name="items.barcode"]');
            if (field) {
                const form = field.closest("form");
                if (form) {
                    let node = form.previousElementSibling;
                    while (node) {
                        if (/^H[1-3]$/.test(node.tagName || "")) return node;
                        node = node.previousElementSibling;
                    }
                    const heading = form.querySelector("h1, h2, h3, legend");
                    if (heading) return heading;
                }
            }

            return document.querySelector("main h1, main h2, h1, h2");
        }

        return null;
    }

    function targetName(assignment) {
        if (!assignment) return "";
        if (assignment.target === "__custom__") {
            return String(assignment.customTarget || "").trim();
        }
        return String(assignment.target || "").trim();
    }

    function fieldOptionLabel(name) {
        const option = FIELD_OPTIONS.find(function (item) {
            return item.value === name;
        });
        return option
            ? textByLanguage(option.fr, option.en)
            : name;
    }

    function findSubfieldLineByKohafield(kohafield) {
        if (!kohafield) return null;
        const lines = document.querySelectorAll(".subfield_line");
        for (const line of lines) {
            const hidden = line.querySelector('input[name="kohafield"]');
            if (hidden && String(hidden.value || "").trim() === kohafield) {
                return line;
            }
        }
        return null;
    }

    function controlsByExactName(name) {
        if (!name) return [];
        return Array.from(document.querySelectorAll("input, select, textarea")).filter(function (node) {
            return String(node.getAttribute("name") || "") === name &&
                String(node.type || "").toLowerCase() !== "hidden";
        });
    }

    function resolveField(target) {
        const line = findSubfieldLineByKohafield(target);
        let controls = [];

        if (line) {
            controls = Array.from(line.querySelectorAll("input, select, textarea")).filter(function (node) {
                return String(node.getAttribute("name") || "") === target &&
                    String(node.type || "").toLowerCase() !== "hidden";
            });

            if (!controls.length) {
                controls = Array.from(line.querySelectorAll("input, select, textarea")).filter(function (node) {
                    const type = String(node.type || "").toLowerCase();
                    const name = String(node.getAttribute("name") || "");
                    return type !== "hidden" &&
                        name !== "disable_input" &&
                        name !== "tag" &&
                        name !== "subfield" &&
                        name !== "kohafield" &&
                        name !== "important";
                });
            }
        }

        if (!controls.length) {
            controls = controlsByExactName(target);
        }

        if (!controls.length) {
            return {
                ok: false,
                reason: textByLanguage(
                    "champ introuvable dans ce formulaire",
                    "field not found in this form"
                ),
                target: target,
                line: line,
                control: null
            };
        }

        /*
         * Si Koha expose plusieurs contrôles portant le même nom, privilégier celui
         * qui se trouve dans le formulaire/éditeur visible puis le premier contrôle.
         */
        const preferred = controls.find(function (node) {
            const style = window.getComputedStyle ? window.getComputedStyle(node) : null;
            return !style || (style.display !== "none" && style.visibility !== "hidden");
        }) || controls[0];

        return {
            ok: true,
            target: target,
            line: line || preferred.closest(".subfield_line"),
            control: preferred
        };
    }

    function getDeleteCheckbox(resolved) {
        const line = resolved && resolved.line
            ? resolved.line
            : (resolved && resolved.control && resolved.control.closest
                ? resolved.control.closest(".subfield_line")
                : null);
        return line ? line.querySelector('input[name="disable_input"]') : null;
    }

    function dispatchFieldEvents(control) {
        if (!control) return;

        try {
            control.dispatchEvent(new Event("input", { bubbles: true }));
        } catch (_) {}

        try {
            control.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (_) {}

        /*
         * Certaines versions de Koha / Select2 écoutent également l'événement jQuery.
         * Le déclenchement est complémentaire, jamais obligatoire.
         */
        try {
            if (window.jQuery) {
                window.jQuery(control).trigger("change");
            }
        } catch (_) {}
    }

    function cancelPendingDeletion(resolved) {
        const checkbox = getDeleteCheckbox(resolved);
        if (!checkbox || !checkbox.checked) return;

        try {
            checkbox.click();
        } catch (_) {
            checkbox.checked = false;
            try {
                checkbox.dispatchEvent(new Event("change", { bubbles: true }));
            } catch (_) {}
        }
    }

    function setSelectValue(select, desired) {
        const raw = String(desired == null ? "" : desired);
        const options = Array.from(select.options || []);

        let option = options.find(function (item) {
            return String(item.value) === raw;
        });

        if (!option) {
            const wanted = normalizeText(raw);
            option = options.find(function (item) {
                return normalizeText(item.textContent) === wanted;
            });
        }

        if (!option) {
            return {
                ok: false,
                reason: textByLanguage(
                    "valeur indisponible dans la liste Koha",
                    "value unavailable in the Koha list"
                )
            };
        }

        select.value = option.value;
        dispatchFieldEvents(select);

        return {
            ok: true,
            value: option.value,
            label: String(option.textContent || "").trim()
        };
    }

    function setControlValue(control, value) {
        if (!control) {
            return {
                ok: false,
                reason: textByLanguage("contrôle absent", "control missing")
            };
        }

        const tag = String(control.tagName || "").toLowerCase();
        const type = String(control.type || "").toLowerCase();

        if (tag === "select") {
            return setSelectValue(control, value);
        }

        if (type === "checkbox") {
            const wanted = ["1", "true", "yes", "on"].includes(normalizeText(value));
            control.checked = wanted;
            dispatchFieldEvents(control);
            return { ok: true, value: wanted ? "1" : "0", label: wanted ? "true" : "false" };
        }

        if (type === "radio") {
            const name = control.getAttribute("name");
            const radios = name
                ? Array.from(document.querySelectorAll('input[type="radio"]')).filter(function (node) {
                    return node.getAttribute("name") === name;
                })
                : [control];
            const wanted = String(value == null ? "" : value);
            const radio = radios.find(function (node) {
                return String(node.value) === wanted;
            });
            if (!radio) {
                return {
                    ok: false,
                    reason: textByLanguage(
                        "valeur radio indisponible",
                        "radio value unavailable"
                    )
                };
            }
            radio.checked = true;
            dispatchFieldEvents(radio);
            return { ok: true, value: wanted, label: wanted };
        }

        control.value = String(value == null ? "" : value);
        dispatchFieldEvents(control);
        return {
            ok: true,
            value: control.value,
            label: control.value
        };
    }

    function clearResolvedField(resolved) {
        const control = resolved.control;
        const deleteCheckbox = getDeleteCheckbox(resolved);

        /*
         * batchMod : utiliser la mécanique native Koha.
         * Cela permet au module 031 de jouer son rôle s'il est actif.
         */
        if (window.location.pathname === "/cgi-bin/koha/tools/batchMod.pl" && deleteCheckbox) {
            if (!deleteCheckbox.checked) {
                try {
                    deleteCheckbox.click();
                } catch (_) {
                    deleteCheckbox.checked = true;
                    try {
                        deleteCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
                    } catch (_) {}
                }
            }

            return {
                ok: true,
                pending: true,
                reason: textByLanguage(
                    "suppression demandée via le mécanisme Koha",
                    "clear requested through Koha's mechanism"
                )
            };
        }

        /*
         * additem : vider le contrôle est la mécanique normale du formulaire.
         * Aucune sauvegarde n'est déclenchée par ce module.
         */
        if (control.tagName && String(control.tagName).toLowerCase() === "select") {
            const emptyOption = Array.from(control.options || []).find(function (option) {
                return String(option.value) === "";
            });
            if (!emptyOption) {
                return {
                    ok: false,
                    reason: textByLanguage(
                        "aucune valeur vide n’est disponible dans cette liste",
                        "no empty value is available in this list"
                    )
                };
            }
        }

        return setControlValue(control, "");
    }

    function applyAssignment(assignment) {
        if (!assignment || assignment.enabled === false) {
            return { skipped: true };
        }

        const target = targetName(assignment);
        if (!target) {
            return {
                ok: false,
                target: "",
                label: textByLanguage("Champ non défini", "Undefined field"),
                reason: textByLanguage(
                    "aucun kohafield n’est configuré",
                    "no kohafield is configured"
                )
            };
        }

        const action = String(assignment.action || "set");
        if (action === "keep") {
            return { skipped: true, target: target };
        }

        const resolved = resolveField(target);
        const label = fieldOptionLabel(target);

        if (!resolved.ok) {
            return {
                ok: false,
                target: target,
                label: label,
                reason: resolved.reason
            };
        }

        if (action === "clear") {
            const cleared = clearResolvedField(resolved);
            return Object.assign({
                target: target,
                label: label
            }, cleared);
        }

        cancelPendingDeletion(resolved);
        const setResult = setControlValue(resolved.control, assignment.value);

        return Object.assign({
            target: target,
            label: label
        }, setResult);
    }

    function applyModel(model) {
        const assignments = Array.isArray(model.assignments) ? model.assignments : [];
        const results = assignments.map(applyAssignment).filter(function (result) {
            return !result.skipped;
        });

        const failures = results.filter(function (result) {
            return result.ok === false;
        });

        const applied = results.filter(function (result) {
            return result.ok !== false;
        });

        showApplicationResult(model, applied, failures);

        try {
            window.dispatchEvent(new CustomEvent("pmk:item-template-applied", {
                detail: {
                    moduleId: MODULE_ID,
                    modelId: model.id,
                    applied: applied.length,
                    failed: failures.length,
                    results: results
                }
            }));
        } catch (_) {}

        return {
            applied: applied,
            failures: failures
        };
    }

    function statusNode() {
        const toolbar = document.getElementById(TOOLBAR_ID);
        return toolbar ? toolbar.querySelector(".pmk102-status") : null;
    }

    function showApplicationResult(model, applied, failures) {
        const status = statusNode();
        if (!status) return;

        const toolbarConfig = currentConfig.toolbar || {};
        const showWarnings = toolbarConfig.showWarnings !== false;
        const showSuccess = toolbarConfig.showSuccessMessage === true;

        status.className = "pmk102-status";
        status.innerHTML = "";

        if (failures.length && showWarnings) {
            status.classList.add("is-visible", "is-warning");

            const strong = document.createElement("strong");
            strong.textContent = textByLanguage(
                "Modèle appliqué partiellement :",
                "Template partially applied:"
            );
            status.appendChild(strong);

            const list = document.createElement("ul");
            failures.forEach(function (failure) {
                const li = document.createElement("li");
                li.textContent = (failure.label || failure.target || "Champ") + " — " + failure.reason;
                list.appendChild(li);
            });
            status.appendChild(list);
            return;
        }

        if (showSuccess) {
            status.classList.add("is-visible", "is-success");
            status.textContent = textByLanguage(
                "Modèle « " + modelLabel(model) + " » appliqué au formulaire (" + applied.length + " champ(s)). Aucun enregistrement automatique.",
                "Template “" + modelLabel(model) + "” applied to the form (" + applied.length + " field(s)). Nothing was saved automatically."
            );
        }
    }

    function modelLabel(model) {
        return textByLanguage(model && model.labelFr, model && model.labelEn) ||
            String(model && model.id || "") ||
            textByLanguage("Modèle", "Template");
    }

    function askConfirmation(model) {
        if (!model || model.confirmBeforeApply !== true) {
            return Promise.resolve(true);
        }

        const title = textByLanguage(model.confirmTitleFr, model.confirmTitleEn) ||
            textByLanguage("Appliquer ce modèle ?", "Apply this template?");
        const message = textByLanguage(model.confirmMessageFr, model.confirmMessageEn) ||
            textByLanguage(
                "Les champs du formulaire seront modifiés, sans enregistrement automatique.",
                "The form fields will be changed without automatic saving."
            );

        if (window.PMKConfig && typeof window.PMKConfig.confirmAction === "function") {
            try {
                return Promise.resolve(window.PMKConfig.confirmAction({
                    title: title,
                    message: message,
                    confirmLabel: textByLanguage("Appliquer", "Apply"),
                    cancelLabel: textByLanguage("Annuler", "Cancel"),
                    danger: false
                })).then(Boolean).catch(function () {
                    return false;
                });
            } catch (_) {}
        }

        return fallbackConfirmAction({
            title: title,
            message: message
        });
    }

    function fallbackConfirmAction(options) {
        return new Promise(function (resolve) {
            injectStyles();

            const existing = document.getElementById(DIALOG_ID);
            if (existing) existing.remove();

            const previousFocus = document.activeElement;
            const backdrop = document.createElement("div");
            backdrop.id = DIALOG_ID;

            const dialog = document.createElement("div");
            dialog.className = "pmk102-dialog";
            dialog.setAttribute("role", "dialog");
            dialog.setAttribute("aria-modal", "true");

            const head = document.createElement("div");
            head.className = "pmk102-dialog-head";

            const title = document.createElement("h3");
            title.textContent = options.title || "";
            head.appendChild(title);

            const body = document.createElement("div");
            body.className = "pmk102-dialog-body";
            body.textContent = options.message || "";

            const actions = document.createElement("div");
            actions.className = "pmk102-dialog-actions";

            const cancel = document.createElement("button");
            cancel.type = "button";
            cancel.className = "btn btn-default";
            cancel.textContent = textByLanguage("Annuler", "Cancel");

            const confirm = document.createElement("button");
            confirm.type = "button";
            confirm.className = "btn btn-primary";
            confirm.textContent = textByLanguage("Appliquer", "Apply");

            actions.appendChild(cancel);
            actions.appendChild(confirm);

            dialog.appendChild(head);
            dialog.appendChild(body);
            dialog.appendChild(actions);
            backdrop.appendChild(dialog);
            document.body.appendChild(backdrop);

            let done = false;
            function finish(value) {
                if (done) return;
                done = true;
                document.removeEventListener("keydown", onKey, true);
                backdrop.remove();
                try {
                    if (previousFocus && typeof previousFocus.focus === "function") {
                        previousFocus.focus();
                    }
                } catch (_) {}
                resolve(value);
            }

            function onKey(event) {
                if (event.key === "Escape") {
                    event.preventDefault();
                    finish(false);
                }
            }

            document.addEventListener("keydown", onKey, true);
            cancel.addEventListener("click", function () { finish(false); });
            confirm.addEventListener("click", function () { finish(true); });
            backdrop.addEventListener("click", function (event) {
                if (event.target === backdrop) finish(false);
            });

            window.setTimeout(function () {
                try { cancel.focus(); } catch (_) {}
            }, 0);
        });
    }

    function buttonVariantClass(variant) {
        switch (variant) {
            case "primary": return "btn btn-primary";
            case "success": return "btn btn-success";
            case "warning": return "btn btn-warning";
            case "danger": return "btn btn-danger";
            case "info": return "btn btn-info";
            case "secondary": return "btn btn-secondary";
            case "custom": return "btn";
            case "default":
            default:
                return "btn btn-default";
        }
    }

    function createModelButton(model) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = buttonVariantClass(model.variant) + " pmk102-button";
        button.dataset.pmkModelId = String(model.id || "");
        button.dataset.pmkVariant = String(model.variant || "default");
        button.title = textByLanguage(model.descriptionFr, model.descriptionEn) || modelLabel(model);

        if (currentConfig.toolbar && currentConfig.toolbar.compactButtons !== false) {
            button.classList.add("btn-sm");
        }

        if (model.variant === "custom") {
            button.style.setProperty("--pmk102-btn-bg", String(model.customBackground || "#408540"));
            button.style.setProperty("--pmk102-btn-text", String(model.customTextColor || "#ffffff"));
            button.style.setProperty("--pmk102-btn-border", String(model.customBorderColor || "#397a39"));
        }

        const iconClass = String(model.iconClass || "").trim();
        if (iconClass) {
            const icon = document.createElement("i");
            icon.className = iconClass;
            icon.setAttribute("aria-hidden", "true");
            button.appendChild(icon);
        }

        const label = document.createElement("span");
        label.textContent = modelLabel(model);
        button.appendChild(label);

        button.addEventListener("click", function (event) {
            event.preventDefault();

            askConfirmation(model).then(function (confirmed) {
                if (!confirmed) return;
                applyModel(model);
            });
        });

        return button;
    }

    function buildToolbar() {
        const models = Array.isArray(currentConfig.models) ? currentConfig.models : [];
        const visibleModels = models.filter(modelVisibleHere);

        if (!visibleModels.length) {
            removeToolbar();
            return null;
        }

        const wrapper = document.createElement("div");
        wrapper.id = TOOLBAR_ID;
        wrapper.dataset.pmkModule = MODULE_ID;

        const toolbarConfig = currentConfig.toolbar || {};
        wrapper.style.setProperty("--pmk102-gap", safeNumber(toolbarConfig.gapPx, 8, 0, 40) + "px");
        wrapper.style.setProperty("--pmk102-mt", safeNumber(toolbarConfig.marginTopPx, 8, 0, 80) + "px");
        wrapper.style.setProperty("--pmk102-mb", safeNumber(toolbarConfig.marginBottomPx, 10, 0, 80) + "px");

        if (toolbarConfig.compactButtons !== false) {
            wrapper.classList.add("pmk102-compact");
        }

        if (toolbarConfig.showTitle === true) {
            const title = document.createElement("div");
            title.className = "pmk102-title";
            title.textContent = textByLanguage(toolbarConfig.titleFr, toolbarConfig.titleEn) ||
                textByLanguage("Modèles rapides", "Quick templates");
            wrapper.appendChild(title);
        }

        const groups = document.createElement("div");
        groups.className = "pmk102-groups";

        /*
         * Les modèles sans groupe restent dans une barre simple, comme le 102 historique.
         * Les modèles portant le même groupe sont regroupés sans imposer de panneau.
         */
        const groupMap = new Map();

        visibleModels.forEach(function (model) {
            const groupName = textByLanguage(model.groupFr, model.groupEn).trim();
            const groupKey = groupName || "__ungrouped__";

            let group = groupMap.get(groupKey);
            if (!group) {
                group = document.createElement("div");
                group.className = "pmk102-group";
                group.dataset.group = groupKey;

                if (groupName) {
                    const groupLabel = document.createElement("span");
                    groupLabel.className = "pmk102-group-label";
                    groupLabel.textContent = groupName;
                    group.appendChild(groupLabel);
                }

                groupMap.set(groupKey, group);
                groups.appendChild(group);
            }

            group.appendChild(createModelButton(model));
        });

        const configAnchor = document.createElement("span");
        configAnchor.className = "pmk102-config-anchor";
        groups.appendChild(configAnchor);

        wrapper.appendChild(groups);

        const status = document.createElement("div");
        status.className = "pmk102-status";
        status.setAttribute("role", "status");
        wrapper.appendChild(status);

        return wrapper;
    }

    function mountContextButton(wrapper) {
        if (!wrapper || !window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        const anchor = wrapper.querySelector(".pmk102-config-anchor");
        if (!anchor) return;

        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "append",
                contextKey: "item-template-buttons",
                context: {
                    pageId: window.location.pathname === "/cgi-bin/koha/tools/batchMod.pl"
                        ? "tools.batchmod"
                        : "cataloguing.additem",
                    sectionId: "models"
                }
            });
        } catch (_) {}
    }

    function render() {
        removeToolbar();

        if (!isSupportedPath() || !moduleEnabledHere()) return false;

        const anchor = findHistoricalAnchor();
        if (!anchor || !anchor.parentNode) return false;

        injectStyles();

        const toolbar = buildToolbar();
        if (!toolbar) return true;

        try {
            anchor.insertAdjacentElement("afterend", toolbar);
        } catch (_) {
            anchor.parentNode.insertBefore(toolbar, anchor.nextSibling);
        }

        mountContextButton(toolbar);
        return true;
    }

    function scheduleRender(delay) {
        if (mountTimer) window.clearTimeout(mountTimer);
        mountTimer = window.setTimeout(function () {
            mountTimer = null;
            render();
        }, typeof delay === "number" ? delay : 50);
    }

    function watchForPageChanges() {
        if (observer || !document.documentElement) return;

        observer = new MutationObserver(function (mutations) {
            if (!moduleEnabledHere()) return;

            let relevant = false;
            for (const mutation of mutations) {
                if (mutation.type !== "childList") continue;
                if (!mutation.addedNodes || !mutation.addedNodes.length) continue;

                for (const node of mutation.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (node.id === TOOLBAR_ID || node.closest("#" + TOOLBAR_ID)) continue;

                    if (
                        node.matches(".subfield_line, form, h1, h2, h3, #edititem") ||
                        node.querySelector(".subfield_line, [name='items.homebranch'], [name='items.holdingbranch'], #edititem")
                    ) {
                        relevant = true;
                        break;
                    }
                }
                if (relevant) break;
            }

            if (relevant && !document.getElementById(TOOLBAR_ID)) {
                scheduleRender(60);
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    function newModel() {
        const stamp = Date.now().toString(36);
        return {
            id: "template-" + stamp,
            enabled: true,
            labelFr: "Nouveau modèle",
            labelEn: "New template",
            descriptionFr: "",
            descriptionEn: "",
            showOnBatchMod: true,
            showOnAddItem: true,
            groupFr: "",
            groupEn: "",
            iconClass: "",
            variant: "default",
            customBackground: "#408540",
            customTextColor: "#ffffff",
            customBorderColor: "#397a39",
            confirmBeforeApply: false,
            confirmTitleFr: "Appliquer ce modèle ?",
            confirmTitleEn: "Apply this template?",
            confirmMessageFr: "Les champs du formulaire seront préparés, mais Koha ne sera pas enregistré automatiquement.",
            confirmMessageEn: "The form fields will be prepared, but Koha will not be saved automatically.",
            assignments: [
                {
                    enabled: true,
                    target: "items.homebranch",
                    customTarget: "",
                    action: "set",
                    value: ""
                }
            ]
        };
    }

    function newAssignment() {
        return {
            enabled: true,
            target: "items.homebranch",
            customTarget: "",
            action: "set",
            value: ""
        };
    }

    function validateConfig(config) {
        if (!config || !Array.isArray(config.models)) {
            return {
                ok: false,
                message: textByLanguage(
                    "La liste des modèles est invalide.",
                    "The template list is invalid."
                )
            };
        }

        for (const model of config.models) {
            if (!model) continue;

            /*
             * L'identifiant est utile pour le diagnostic et l'API publique, mais il
             * n'est volontairement PAS bloquant. Une duplication de modèle depuis
             * l'interface PMK ne doit pas provoquer l'erreur historique
             * « identifiant unique ». Les boutons sont liés à leur objet de config,
             * pas à l'unicité de cet identifiant.
             */
            const id = String(model.id || "").trim();

            /*
             * Un modèle désactivé peut rester en préparation dans la configuration.
             * Les contraintes métier ne deviennent bloquantes qu'au moment où le
             * modèle est activé.
             */
            if (model.enabled === false) continue;

            if (!String(model.labelFr || model.labelEn || "").trim()) {
                return {
                    ok: false,
                    message: textByLanguage(
                        "Chaque bouton-modèle actif doit avoir un libellé.",
                        "Each enabled template button must have a label."
                    )
                };
            }

            if (!Array.isArray(model.assignments) || !model.assignments.length) {
                return {
                    ok: false,
                    message: textByLanguage(
                        "Chaque bouton-modèle doit contenir au moins une action de champ.",
                        "Each template button must contain at least one field action."
                    )
                };
            }

            const seenTargets = new Set();

            for (const assignment of model.assignments) {
                if (!assignment || assignment.enabled === false) continue;

                const target = targetName(assignment);
                if (!target) {
                    return {
                        ok: false,
                        message: textByLanguage(
                            "Une action de champ active n’a pas de kohafield.",
                            "An enabled field action has no kohafield."
                        )
                    };
                }

                const action = String(assignment.action || "set");
                if (action === "set" && String(assignment.value == null ? "" : assignment.value).trim() === "") {
                    return {
                        ok: false,
                        message: textByLanguage(
                            "Le champ « " + target + " » doit avoir une valeur, ou utiliser l’action « Vider / supprimer ».",
                            "Field “" + target + "” must have a value, or use the “Clear / delete” action."
                        )
                    };
                }

                if (seenTargets.has(target)) {
                    return {
                        ok: false,
                        message: textByLanguage(
                            "Un même modèle ne doit pas cibler deux fois le champ « " + target + " ».",
                            "A template must not target the field “" + target + "” twice."
                        )
                    };
                }
                seenTargets.add(target);
            }
        }

        return { ok: true };
    }

    function pmkFieldOptions() {
        return FIELD_OPTIONS.map(function (item) {
            return {
                value: item.value,
                label: {
                    fr: item.fr + (item.value !== "__custom__" ? " — " + item.value : ""),
                    en: item.en + (item.value !== "__custom__" ? " — " + item.value : "")
                }
            };
        });
    }

    function registerWithPMK() {
        if (!window.PMKConfig || configRegistered) return false;
        configRegistered = true;

        window.PMKConfig.registerModule({
            id: MODULE_ID,
            schemaVersion: 3,
            name: {
                fr: "Boutons modèles exemplaires",
                en: "Item template buttons"
            },
            description: {
                fr: "Ajoute directement dans additem.pl et batchMod.pl des boutons qui appliquent des modèles complets de valeurs aux champs exemplaire, sans enregistrer automatiquement. Les deux modèles MEDIABUS historiques sont fournis par défaut.",
                en: "Adds direct buttons to additem.pl and batchMod.pl that apply complete value templates to item fields without saving automatically. The two historical MEDIABUS templates are included by default."
            },
            category: {
                fr: "Catalogue / exemplaires",
                en: "Catalog / items"
            },
            supportedPages: [
                "tools.batchmod",
                "cataloguing.additem"
            ],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            validate: validateConfig,
            schema: [
                {
                    type: "section",
                    id: "activation",
                    label: { fr: "Activation", en: "Activation" },
                    description: {
                        fr: "Le module reste autonome : il n’utilise pas l’Assistant exemplaires 110.",
                        en: "This module remains standalone and does not use item helper 110."
                    },
                    fields: [
                        {
                            key: "enabled",
                            type: "boolean",
                            label: { fr: "Activer les boutons modèles", en: "Enable template buttons" }
                        },
                        {
                            key: "pages",
                            type: "repeater",
                            label: { fr: "Pages Koha", en: "Koha pages" },
                            reorder: false,
                            removable: false,
                            canAdd: function () { return false; },
                            itemTitle: function (item, index, lang) {
                                const def = PAGE_DEFINITIONS[index];
                                return def
                                    ? (lang === "en" ? def.labelEn : def.labelFr)
                                    : String(item && item.path || "Page");
                            },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Activer sur cette page", en: "Enable on this page" } },
                                { key: "id", type: "text", readOnly: true, advanced: true, label: { fr: "Identifiant page", en: "Page identifier" } },
                                { key: "path", type: "text", readOnly: true, label: { fr: "Chemin Koha", en: "Koha path" } }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "toolbar",
                    label: { fr: "Présentation de la barre", en: "Toolbar appearance" },
                    description: {
                        fr: "Les boutons utilisent par défaut les styles natifs Koha et passent automatiquement à la ligne sur petit écran.",
                        en: "Buttons use Koha native styles by default and wrap automatically on small screens."
                    },
                    fields: [
                        { key: "toolbar.showTitle", type: "boolean", label: { fr: "Afficher un titre au-dessus des boutons", en: "Show a title above the buttons" } },
                        { key: "toolbar.titleFr", type: "text", label: { fr: "Titre français", en: "French title" } },
                        { key: "toolbar.titleEn", type: "text", label: { fr: "Titre anglais", en: "English title" } },
                        { key: "toolbar.compactButtons", type: "boolean", label: { fr: "Boutons compacts", en: "Compact buttons" } },
                        { key: "toolbar.gapPx", type: "number", min: 0, max: 40, label: { fr: "Espacement entre boutons (px)", en: "Gap between buttons (px)" } },
                        { key: "toolbar.marginTopPx", type: "number", min: 0, max: 80, label: { fr: "Marge supérieure (px)", en: "Top margin (px)" } },
                        { key: "toolbar.marginBottomPx", type: "number", min: 0, max: 80, label: { fr: "Marge inférieure (px)", en: "Bottom margin (px)" } },
                        { key: "toolbar.showSuccessMessage", type: "boolean", label: { fr: "Afficher un message après application réussie", en: "Show a message after successful application" } },
                        { key: "toolbar.showWarnings", type: "boolean", label: { fr: "Afficher les champs/valeurs non appliqués", en: "Show fields/values that could not be applied" } }
                    ]
                },
                {
                    type: "section",
                    id: "models",
                    label: { fr: "Boutons et modèles", en: "Buttons and templates" },
                    description: {
                        fr: "Chaque bouton peut préparer autant de champs exemplaire que nécessaire. Il ne valide jamais le formulaire Koha. Pour une liste Koha, la valeur peut être le code stocké ou le libellé visible ; le moteur vérifie qu’elle existe réellement avant de l’appliquer.",
                        en: "Each button can prepare as many item fields as needed. It never submits the Koha form. For Koha lists, the value may be the stored code or visible label; the engine verifies it actually exists before applying it."
                    },
                    fields: [
                        {
                            key: "models",
                            type: "repeater",
                            label: { fr: "Boutons modèles", en: "Template buttons" },
                            addLabel: { fr: "Ajouter un bouton modèle", en: "Add template button" },
                            emptyLabel: { fr: "Aucun bouton modèle configuré.", en: "No template button configured." },
                            reorder: true,
                            newItem: newModel,
                            liveTitleKey: "labelFr",
                            itemTitle: function (item, index, lang) {
                                if (!item) return (lang === "en" ? "Template " : "Modèle ") + (index + 1);
                                return lang === "en"
                                    ? (String(item.labelEn || item.labelFr || "").trim() || "Template " + (index + 1))
                                    : (String(item.labelFr || item.labelEn || "").trim() || "Modèle " + (index + 1));
                            },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Bouton actif", en: "Button enabled" } },
                                { key: "id", type: "text", advanced: true, label: { fr: "Identifiant technique (facultatif)", en: "Technical identifier (optional)" }, help: { fr: "Aucune unicité n’est imposée : dupliquer un modèle reste possible sans erreur.", en: "Uniqueness is not enforced, so templates can be duplicated without errors." } },
                                { key: "labelFr", type: "text", label: { fr: "Libellé français", en: "French label" } },
                                { key: "labelEn", type: "text", label: { fr: "Libellé anglais", en: "English label" } },
                                { key: "descriptionFr", type: "textarea", label: { fr: "Infobulle / description française", en: "French tooltip / description" } },
                                { key: "descriptionEn", type: "textarea", label: { fr: "Infobulle / description anglaise", en: "English tooltip / description" } },
                                { key: "showOnBatchMod", type: "boolean", label: { fr: "Afficher sur batchMod.pl", en: "Show on batchMod.pl" } },
                                { key: "showOnAddItem", type: "boolean", label: { fr: "Afficher sur additem.pl", en: "Show on additem.pl" } },
                                { key: "groupFr", type: "text", advanced: true, label: { fr: "Groupe français (facultatif)", en: "French group (optional)" } },
                                { key: "groupEn", type: "text", advanced: true, label: { fr: "Groupe anglais (facultatif)", en: "English group (optional)" } },
                                { key: "iconClass", type: "text", advanced: true, label: { fr: "Classe d’icône Font Awesome (facultatif)", en: "Font Awesome icon class (optional)" }, help: { fr: "Exemple : fa fa-archive. Vide = aucune icône, comme le 102 historique.", en: "Example: fa fa-archive. Blank = no icon, as in historical 102." } },
                                {
                                    key: "variant",
                                    type: "select",
                                    label: { fr: "Style du bouton", en: "Button style" },
                                    options: [
                                        { value: "default", label: { fr: "Koha neutre", en: "Koha neutral" } },
                                        { value: "primary", label: { fr: "Primaire", en: "Primary" } },
                                        { value: "success", label: { fr: "Succès", en: "Success" } },
                                        { value: "warning", label: { fr: "Attention", en: "Warning" } },
                                        { value: "danger", label: { fr: "Danger", en: "Danger" } },
                                        { value: "info", label: { fr: "Information", en: "Info" } },
                                        { value: "secondary", label: { fr: "Secondaire", en: "Secondary" } },
                                        { value: "custom", label: { fr: "Couleurs personnalisées", en: "Custom colors" } }
                                    ]
                                },
                                { key: "customBackground", type: "color", advanced: true, label: { fr: "Fond personnalisé", en: "Custom background" } },
                                { key: "customTextColor", type: "color", advanced: true, label: { fr: "Texte personnalisé", en: "Custom text" } },
                                { key: "customBorderColor", type: "color", advanced: true, label: { fr: "Bordure personnalisée", en: "Custom border" } },
                                { key: "confirmBeforeApply", type: "boolean", label: { fr: "Demander confirmation avant application", en: "Ask for confirmation before applying" } },
                                { key: "confirmTitleFr", type: "text", advanced: true, label: { fr: "Titre confirmation FR", en: "Confirmation title FR" } },
                                { key: "confirmTitleEn", type: "text", advanced: true, label: { fr: "Titre confirmation EN", en: "Confirmation title EN" } },
                                { key: "confirmMessageFr", type: "textarea", advanced: true, label: { fr: "Message confirmation FR", en: "Confirmation message FR" } },
                                { key: "confirmMessageEn", type: "textarea", advanced: true, label: { fr: "Message confirmation EN", en: "Confirmation message EN" } },
                                {
                                    key: "assignments",
                                    type: "repeater",
                                    label: { fr: "Champs préparés par ce bouton", en: "Fields prepared by this button" },
                                    addLabel: { fr: "Ajouter un champ", en: "Add field" },
                                    emptyLabel: { fr: "Aucun champ configuré.", en: "No field configured." },
                                    reorder: true,
                                    newItem: newAssignment,
                                    itemTitle: function (item, index, lang) {
                                        if (!item) return (lang === "en" ? "Field " : "Champ ") + (index + 1);
                                        const target = item.target === "__custom__"
                                            ? String(item.customTarget || "")
                                            : String(item.target || "");
                                        const def = FIELD_OPTIONS.find(function (option) { return option.value === target; });
                                        return def
                                            ? (lang === "en" ? def.en : def.fr)
                                            : (target || ((lang === "en" ? "Field " : "Champ ") + (index + 1)));
                                    },
                                    fields: [
                                        { key: "enabled", type: "boolean", label: { fr: "Action active", en: "Action enabled" } },
                                        {
                                            key: "target",
                                            type: "select",
                                            label: { fr: "Champ exemplaire", en: "Item field" },
                                            options: pmkFieldOptions()
                                        },
                                        {
                                            key: "customTarget",
                                            type: "text",
                                            advanced: true,
                                            label: { fr: "Kohafield personnalisé", en: "Custom kohafield" },
                                            help: {
                                                fr: "À renseigner uniquement si « Autre kohafield… » est choisi. Exemple : items.more_subfields_xml_X.",
                                                en: "Only fill this when “Other kohafield…” is selected. Example: items.more_subfields_xml_X."
                                            }
                                        },
                                        {
                                            key: "action",
                                            type: "select",
                                            label: { fr: "Action", en: "Action" },
                                            options: [
                                                { value: "set", label: { fr: "Définir cette valeur", en: "Set this value" } },
                                                { value: "clear", label: { fr: "Vider / supprimer la valeur", en: "Clear / delete the value" } },
                                                { value: "keep", label: { fr: "Ne pas modifier", en: "Keep unchanged" } }
                                            ]
                                        },
                                        {
                                            key: "value",
                                            type: "text",
                                            label: { fr: "Valeur à appliquer", en: "Value to apply" },
                                            help: {
                                                fr: "Pour une liste Koha, saisir soit le code stocké (ex. RMDB), soit exactement le libellé visible. Le moteur refuse une valeur absente du formulaire.",
                                                en: "For a Koha list, enter either the stored code (e.g. RMDB) or the exact visible label. The engine rejects values missing from the form."
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        });

        window.PMKConfig.getConfig(MODULE_ID)
            .then(function (config) {
                currentConfig = deepMerge(DEFAULT_CONFIG, config || {});
                scheduleRender(0);
            })
            .catch(function () {
                currentConfig = clone(DEFAULT_CONFIG);
                scheduleRender(0);
            });

        if (typeof window.PMKConfig.subscribe === "function") {
            unsubscribe = window.PMKConfig.subscribe(MODULE_ID, function (config) {
                currentConfig = deepMerge(DEFAULT_CONFIG, config || {});
                scheduleRender(0);
            });
        }

        return true;
    }

    function bootstrap() {
        if (!isSupportedPath()) {
            /*
             * On tente quand même l'enregistrement PMK si le socle est présent,
             * afin que le module soit connu de la configuration globale.
             */
            if (registerWithPMK()) return;

            window.addEventListener("pmk:config-ready", registerWithPMK, { once: true });
            return;
        }

        injectStyles();
        watchForPageChanges();

        if (registerWithPMK()) {
            scheduleRender(0);
            return;
        }

        window.addEventListener("pmk:config-ready", function () {
            registerWithPMK();
            scheduleRender(0);
        }, { once: true });

        /*
         * PMK absent : conserver le comportement historique avec les deux modèles
         * MEDIABUS par défaut.
         */
        currentConfig = clone(DEFAULT_CONFIG);
        scheduleRender(0);

        let tries = 0;
        const timer = window.setInterval(function () {
            tries += 1;
            if (registerWithPMK() || tries >= 100) {
                window.clearInterval(timer);
            }
        }, 50);
    }

    window.PMKItemTemplateButtons = {
        moduleId: MODULE_ID,
        version: MODULE_VERSION,
        defaults: clone(DEFAULT_CONFIG),
        fieldOptions: clone(FIELD_OPTIONS),
        applyModelById: function (modelId) {
            const models = Array.isArray(currentConfig.models) ? currentConfig.models : [];
            const model = models.find(function (candidate) {
                return candidate && candidate.id === modelId;
            });
            if (!model || !modelVisibleHere(model)) return false;
            applyModel(model);
            return true;
        },
        refresh: function () {
            scheduleRender(0);
        },
        getConfig: function () {
            return clone(currentConfig);
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
    } else {
        bootstrap();
    }

    window.addEventListener("beforeunload", function () {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        if (mountTimer) {
            window.clearTimeout(mountTimer);
            mountTimer = null;
        }
        if (typeof unsubscribe === "function") {
            try { unsubscribe(); } catch (_) {}
        }
    }, { once: true });
})();

/*
 Nom du fichier: 031-alert-vide-champ-modif-lot.js
 Version: 3.0.0-preplugin
 Date de dernière modification: 2026-09-17
 Auteur: Michael Mundet

 Module PimpMyKoha (phase pré-plugin) : Alerte avant vidage d'un champ

 Objectif :
 - sécuriser la suppression d'un sous-champ exemplaire via les cases Koha `disable_input` ;
 - intercepter l'intention AVANT le gestionnaire natif Koha ;
 - utiliser un dialogue HTML non bloquant ;
 - laisser Koha appliquer lui-même l'état de suppression après confirmation ;
 - restaurer exactement l'état initial après annulation ;
 - fonctionner en français et en anglais ;
 - rester fail-safe si la structure attendue n'est pas présente.

 Important :
 - le module ne supprime aucune donnée lui-même ;
 - aucune validation finale du formulaire n'est déclenchée automatiquement ;
 - aucune boîte `confirm()` native n'est utilisée.
*/
(function () {
    "use strict";

    if (window.__PMK031_BATCH_FIELD_CLEAR_WARNING__) return;
    window.__PMK031_BATCH_FIELD_CLEAR_WARNING__ = true;

    const MODULE_ID = "batchmod-empty-field-warning";
    const MODULE_VERSION = "3.0.0-preplugin";

    const PAGE_DEFINITIONS = [
        {
            id: "tools.batchmod",
            path: "/cgi-bin/koha/tools/batchMod.pl",
            enabled: true
        },
        {
            id: "cataloguing.additem",
            path: "/cgi-bin/koha/cataloguing/additem.pl",
            enabled: false
        }
    ];

    const DEFAULT_CONFIG = {
        enabled: true,
        pages: PAGE_DEFINITIONS,
        protection: {
            mode: "all"
        },
        fieldRules: [],
        dialog: {
            titleFr: "Confirmer le vidage de « {field} »",
            titleEn: "Confirm clearing “{field}”",
            messageFr: "Cette action demandera à Koha de supprimer la valeur de ce champ pour les exemplaires concernés par cette modification. La suppression ne sera effective qu'après l'enregistrement du formulaire.",
            messageEn: "This will ask Koha to clear this field for the items affected by this change. The deletion will only take effect after the form is saved.",
            showMarcReference: true,
            showItemCount: true
        }
    };

    let currentConfig = clone(DEFAULT_CONFIG);
    let guardInstalled = false;
    let contextButtonMounted = false;

    const bypassOnce = new WeakSet();
    const pending = new WeakSet();

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
            out[key] = key in base ? deepMerge(base[key], override[key]) : clone(override[key]);
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

    function getCurrentPageConfig(config) {
        const path = window.location.pathname;
        const pages = Array.isArray(config && config.pages) ? config.pages : [];
        return pages.find(function (page) {
            return page && page.path === path;
        }) || null;
    }

    function isEnabledOnCurrentPage(config) {
        if (!config || config.enabled === false) return false;
        const page = getCurrentPageConfig(config);
        return Boolean(page && page.enabled !== false);
    }

    function isSupportedPath() {
        return PAGE_DEFINITIONS.some(function (page) {
            return page.path === window.location.pathname;
        });
    }

    function getSubfieldLine(checkbox) {
        return checkbox && checkbox.closest
            ? checkbox.closest(".subfield_line")
            : null;
    }

    function getHiddenValue(line, name) {
        if (!line) return "";
        const input = line.querySelector('input[name="' + name + '"]');
        return input ? String(input.value || "").trim() : "";
    }

    function getFieldInfo(checkbox) {
        const line = getSubfieldLine(checkbox);
        const labelNode = line ? line.querySelector("label") : null;
        const rawLabel = labelNode
            ? String(labelNode.textContent || "").replace(/\s+/g, " ").trim()
            : "";

        const label = rawLabel.replace(/^\s*[^-]{1,4}\s*-\s*/, "").trim() || rawLabel || checkbox.value || "Champ";
        const tag = getHiddenValue(line, "tag");
        const subfield = getHiddenValue(line, "subfield");
        const kohafield = getHiddenValue(line, "kohafield") || String(checkbox.value || "").trim();
        const importantRaw = getHiddenValue(line, "important");
        const important = ["1", "true", "yes", "on"].includes(normalizeText(importantRaw));

        return {
            line: line,
            label: label,
            rawLabel: rawLabel,
            tag: tag,
            subfield: subfield,
            marc: tag && subfield ? tag + "$" + subfield : "",
            kohafield: kohafield,
            important: important
        };
    }

    function ruleMatchesField(rule, info) {
        if (!rule || rule.enabled === false) return false;
        const match = normalizeText(rule.match);
        if (!match) return false;

        const candidates = [
            info.kohafield,
            info.marc,
            info.tag + info.subfield,
            info.tag + "$" + info.subfield,
            info.rawLabel,
            info.label
        ].map(normalizeText).filter(Boolean);

        return candidates.some(function (candidate) {
            return candidate === match || candidate.indexOf(match) !== -1;
        });
    }

    function shouldProtect(checkbox) {
        const protection = currentConfig.protection || {};
        const mode = protection.mode || "all";
        const info = getFieldInfo(checkbox);

        if (mode === "important") return info.important;
        if (mode === "custom") {
            const rules = Array.isArray(currentConfig.fieldRules) ? currentConfig.fieldRules : [];
            return rules.some(function (rule) {
                return ruleMatchesField(rule, info);
            });
        }
        return true;
    }

    function countAffectedItems(checkbox) {
        const form = checkbox && checkbox.form
            ? checkbox.form
            : (checkbox && checkbox.closest ? checkbox.closest("form") : null);
        if (!form) return 0;

        const values = new Set();
        form.querySelectorAll('input[name="itemnumber"]').forEach(function (input) {
            const value = String(input.value || "").trim();
            if (value) values.add(value);
        });
        return values.size;
    }

    function replaceTokens(template, values) {
        return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, key) {
            return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : "";
        });
    }

    function buildDialogCopy(checkbox) {
        const lang = detectLanguage();
        const info = getFieldInfo(checkbox);
        const count = countAffectedItems(checkbox);
        const dialog = currentConfig.dialog || DEFAULT_CONFIG.dialog;

        const values = {
            field: info.label || info.kohafield || info.marc || (lang === "en" ? "field" : "champ"),
            marc: info.marc,
            kohafield: info.kohafield,
            count: count
        };

        const title = replaceTokens(
            lang === "en" ? dialog.titleEn : dialog.titleFr,
            values
        );

        const parts = [
            replaceTokens(lang === "en" ? dialog.messageEn : dialog.messageFr, values)
        ];

        if (dialog.showMarcReference !== false && info.marc) {
            parts.push(
                lang === "en"
                    ? "MARC field: " + info.marc
                    : "Champ MARC : " + info.marc
            );
        }

        if (dialog.showItemCount !== false && count > 0) {
            parts.push(
                lang === "en"
                    ? count + " item" + (count > 1 ? "s" : "") + " detected in this batch."
                    : count + " exemplaire" + (count > 1 ? "s" : "") + " détecté" + (count > 1 ? "s" : "") + " dans ce lot."
            );
        }

        parts.push(
            lang === "en"
                ? "Nothing is saved by this confirmation alone."
                : "Cette confirmation n'enregistre aucune modification à elle seule."
        );

        return {
            title: title,
            message: parts.filter(Boolean).join("\n\n"),
            confirmLabel: lang === "en" ? "Confirm clearing" : "Confirmer le vidage",
            cancelLabel: lang === "en" ? "Cancel" : "Annuler"
        };
    }

    function snapshotNativeState(checkbox) {
        const line = getSubfieldLine(checkbox);
        if (!line) return null;

        const controls = Array.from(line.querySelectorAll(".input_marceditor,.tag,.subfield,.mandatory")).map(function (node) {
            return {
                node: node,
                disabled: Boolean(node.disabled)
            };
        });

        const regexLinks = Array.from(line.querySelectorAll(".field_regex")).map(function (node) {
            return {
                node: node,
                display: node.style.display,
                hidden: Boolean(node.hidden)
            };
        });

        let hint = null;
        if (checkbox.id) {
            const hintId = checkbox.id.replace(/^row/, "hint");
            const hintNode = document.getElementById(hintId);
            if (hintNode) {
                hint = {
                    node: hintNode,
                    html: hintNode.innerHTML
                };
            }
        }

        return {
            controls: controls,
            regexLinks: regexLinks,
            hint: hint
        };
    }

    function restoreNativeState(checkbox, snapshot) {
        checkbox.checked = false;
        if (!snapshot) return;

        snapshot.controls.forEach(function (entry) {
            if (entry.node && entry.node.isConnected) entry.node.disabled = entry.disabled;
        });

        snapshot.regexLinks.forEach(function (entry) {
            if (!entry.node || !entry.node.isConnected) return;
            entry.node.style.display = entry.display;
            entry.node.hidden = entry.hidden;
        });

        if (snapshot.hint && snapshot.hint.node && snapshot.hint.node.isConnected) {
            snapshot.hint.node.innerHTML = snapshot.hint.html;
        }
    }

    function injectFallbackDialogStyles() {
        if (document.getElementById("pmk031-fallback-dialog-style")) return;

        const style = document.createElement("style");
        style.id = "pmk031-fallback-dialog-style";
        style.textContent = `
            .pmk031-dialog-backdrop {
                position: fixed;
                inset: 0;
                z-index: 1095;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 1rem;
                background: rgba(0,0,0,.48);
            }
            .pmk031-dialog {
                width: min(520px, 96vw);
                max-height: 90vh;
                overflow: auto;
                background: var(--bs-body-bg, #fff);
                color: var(--bs-body-color, #212529);
                border: 1px solid rgba(0,0,0,.2);
                border-radius: .6rem;
                box-shadow: 0 1rem 3rem rgba(0,0,0,.28);
            }
            .pmk031-dialog-head,
            .pmk031-dialog-body,
            .pmk031-dialog-actions {
                padding: .9rem 1rem;
            }
            .pmk031-dialog-head {
                border-bottom: 1px solid #dee2e6;
            }
            .pmk031-dialog-head h3 {
                margin: 0;
                font-size: 1.08rem;
            }
            .pmk031-dialog-body {
                white-space: pre-line;
                line-height: 1.5;
            }
            .pmk031-dialog-actions {
                display: flex;
                justify-content: flex-end;
                gap: .5rem;
                border-top: 1px solid #dee2e6;
            }
            @media (max-width: 576px) {
                .pmk031-dialog-actions {
                    flex-direction: column-reverse;
                }
                .pmk031-dialog-actions .btn {
                    width: 100%;
                }
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function fallbackConfirmAction(options) {
        return new Promise(function (resolve) {
            injectFallbackDialogStyles();

            const opts = options || {};
            const previousFocus = document.activeElement;

            const backdrop = document.createElement("div");
            backdrop.className = "pmk031-dialog-backdrop";

            const dialog = document.createElement("div");
            dialog.className = "pmk031-dialog";
            dialog.setAttribute("role", "alertdialog");
            dialog.setAttribute("aria-modal", "true");

            const head = document.createElement("div");
            head.className = "pmk031-dialog-head";
            const title = document.createElement("h3");
            title.textContent = opts.title || "";
            head.appendChild(title);

            const body = document.createElement("div");
            body.className = "pmk031-dialog-body";
            body.textContent = opts.message || "";

            const actions = document.createElement("div");
            actions.className = "pmk031-dialog-actions";

            const cancel = document.createElement("button");
            cancel.type = "button";
            cancel.className = "btn btn-default";
            cancel.textContent = opts.cancelLabel || "Cancel";

            const confirmButton = document.createElement("button");
            confirmButton.type = "button";
            confirmButton.className = "btn btn-danger";
            confirmButton.textContent = opts.confirmLabel || "Confirm";

            actions.appendChild(cancel);
            actions.appendChild(confirmButton);
            dialog.appendChild(head);
            dialog.appendChild(body);
            dialog.appendChild(actions);
            backdrop.appendChild(dialog);
            document.body.appendChild(backdrop);

            let done = false;
            function finish(result) {
                if (done) return;
                done = true;
                document.removeEventListener("keydown", onKeyDown, true);
                backdrop.remove();
                if (previousFocus && typeof previousFocus.focus === "function") {
                    try { previousFocus.focus(); } catch (_) {}
                }
                resolve(Boolean(result));
            }

            function onKeyDown(event) {
                if (event.key === "Escape") {
                    event.preventDefault();
                    finish(false);
                }
            }

            cancel.addEventListener("click", function () { finish(false); });
            confirmButton.addEventListener("click", function () { finish(true); });
            backdrop.addEventListener("click", function (event) {
                if (event.target === backdrop) finish(false);
            });
            document.addEventListener("keydown", onKeyDown, true);

            window.setTimeout(function () {
                try { cancel.focus(); } catch (_) {}
            }, 0);
        });
    }

    function askConfirmation(copy) {
        if (window.PMKConfig && typeof window.PMKConfig.confirmAction === "function") {
            try {
                return Promise.resolve(window.PMKConfig.confirmAction({
                    title: copy.title,
                    message: copy.message,
                    confirmLabel: copy.confirmLabel,
                    cancelLabel: copy.cancelLabel,
                    danger: true
                })).then(Boolean).catch(function () { return false; });
            } catch (_) {}
        }
        return fallbackConfirmAction(copy);
    }

    function handleClickCapture(event) {
        if (!isEnabledOnCurrentPage(currentConfig)) return;

        const target = event.target;
        const checkbox = target && target.matches && target.matches('input[name="disable_input"]')
            ? target
            : null;
        if (!checkbox) return;

        if (bypassOnce.has(checkbox)) {
            bypassOnce.delete(checkbox);
            return;
        }

        /*
         * Sur les checkboxes, le navigateur expose déjà l'état proposé au moment
         * de l'événement click. checked=true signifie ici : tentative d'activer
         * la suppression. checked=false correspond au décochage et doit rester
         * entièrement géré par Koha, sans confirmation supplémentaire.
         */
        if (!checkbox.checked) return;
        if (!shouldProtect(checkbox)) return;

        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
        }

        if (pending.has(checkbox)) return;

        const snapshot = snapshotNativeState(checkbox);
        pending.add(checkbox);

        window.setTimeout(function () {
            checkbox.checked = false;

            const copy = buildDialogCopy(checkbox);
            askConfirmation(copy).then(function (confirmed) {
                pending.delete(checkbox);

                if (!checkbox.isConnected) return;

                if (!confirmed) {
                    restoreNativeState(checkbox, snapshot);
                    return;
                }

                /*
                 * Rejoue exactement le clic natif Koha une seule fois.
                 * Le flag bypass empêche PMK de redemander confirmation sur ce clic.
                 */
                bypassOnce.add(checkbox);
                checkbox.click();
            }).catch(function () {
                pending.delete(checkbox);
                if (checkbox.isConnected) restoreNativeState(checkbox, snapshot);
            });
        }, 0);
    }

    function installGuard() {
        if (guardInstalled) return;
        window.addEventListener("click", handleClickCapture, true);
        guardInstalled = true;
    }

    function removeGuard() {
        if (!guardInstalled) return;
        window.removeEventListener("click", handleClickCapture, true);
        guardInstalled = false;
    }

    function mountContextAccess() {
        if (contextButtonMounted) return;
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;

        const anchor =
            document.querySelector("#cataloguing_additem_newitem h2") ||
            document.querySelector("main h1, .main h1, h1");

        if (!anchor) return;

        try {
            const page = getCurrentPageConfig(currentConfig);
            const button = window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "append",
                contextKey: "batch-field-clear-warning",
                context: {
                    page: page ? page.id : "",
                    sectionId: "fields"
                }
            });
            if (button) contextButtonMounted = true;
        } catch (_) {}
    }

    function applyConfig(config) {
        currentConfig = deepMerge(DEFAULT_CONFIG, config || {});

        if (!isSupportedPath()) {
            removeGuard();
            return;
        }

        if (isEnabledOnCurrentPage(currentConfig)) {
            installGuard();
            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", mountContextAccess, { once: true });
            } else {
                mountContextAccess();
            }
        } else {
            removeGuard();
        }
    }

    function loadConfig() {
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") {
            return Promise.resolve(clone(DEFAULT_CONFIG));
        }

        return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
            .then(function (config) {
                return deepMerge(DEFAULT_CONFIG, config || {});
            })
            .catch(function () {
                return clone(DEFAULT_CONFIG);
            });
    }

    function start() {
        if (!isSupportedPath()) return;

        loadConfig().then(applyConfig);

        if (window.PMKConfig && typeof window.PMKConfig.subscribe === "function") {
            try {
                window.PMKConfig.subscribe(MODULE_ID, applyConfig);
            } catch (_) {}
        }
    }

    window.PMK031FieldClearWarning = {
        version: MODULE_VERSION,
        moduleId: MODULE_ID,
        getFieldInfo: getFieldInfo
    };

    start();
})();

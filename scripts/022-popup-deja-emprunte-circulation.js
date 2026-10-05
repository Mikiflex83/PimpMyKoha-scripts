/*
 Nom du fichier: 022-popup-deja-emprunte-circulation.js
 Dépendances: 000-pmk-config-firestore.js 0.4.12+ recommandé
 Date de dernière modification: 2026-09-17
 Auteur: Michael Mundet / refonte PimpMyKoha
 Description: Runtime du module transversal "Remplacement de textes".
              Permet de cibler visuellement des éléments Koha et de remplacer
              des textes sans modifier leur HTML ni leurs gestionnaires d'événements.
              Le comportement historique du script 022 est conservé par défaut.
*/

(function () {
    "use strict";

    if (window.__PMK022TextReplacementLoaded) return;
    window.__PMK022TextReplacementLoaded = true;

    const MODULE_ID = "text-replacement";
    const MODULE_VERSION = "0.1.1";
    const PICKER_STYLE_ID = "pmk022-picker-style";
    const PENDING_PICK_KEY = "pmk022-pending-pick-v1";
    const ORIGINALS = new WeakMap();

    const DEFAULTS = {
        enabled: true,
        observeDom: true,
        observeDelay: 120,
        rules: [
            {
                id: "legacy-already-borrowed-title",
                enabled: true,
                label: "Titre déjà emprunté",
                pages: "/cgi-bin/koha/circ/circulation.pl",
                selector: "#circ_needsconfirmation li.needsconfirm.previssue",
                targetName: "Avertissement « titre déjà emprunté »",
                searchText: "L'adhérent a déjà emprunté ce titre",
                replaceText: "Ce titre est déjà présent dans l'historique de prêt de cet adhérent",
                matchMode: "contains",
                caseSensitive: true,
                replaceAll: true
            }
        ]
    };

    let currentConfig = null;
    let observer = null;
    let observerTimer = 0;

    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function merge(target, source) {
        if (!source || typeof source !== "object") return target;
        Object.keys(source).forEach(function (key) {
            const value = source[key];
            if (Array.isArray(value)) target[key] = deepClone(value);
            else if (value && typeof value === "object") {
                if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) {
                    target[key] = {};
                }
                merge(target[key], value);
            } else {
                target[key] = value;
            }
        });
        return target;
    }

    function normalizeConfig(config) {
        const result = merge(deepClone(DEFAULTS), config || {});
        if (!Array.isArray(result.rules)) result.rules = deepClone(DEFAULTS.rules);
        result.rules = result.rules.map(function (rule, index) {
            const normalizedRule = merge({
                id: "rule-" + (index + 1),
                enabled: true,
                label: "",
                pages: "*",
                selector: "",
                targetName: "",
                searchText: "",
                replaceText: "",
                matchMode: "contains",
                caseSensitive: true,
                replaceAll: true
            }, rule || {});

            // Migration 0.1.1 : les anciens champs de "contexte de sécurité"
            // sont définitivement abandonnés. Ils pouvaient rester dans Firestore
            // après disparition de l'UI et filtrer silencieusement de nouvelles règles.
            delete normalizedRule.contextText;
            delete normalizedRule.contextSelector;
            delete normalizedRule.contextMode;

            return normalizedRule;
        });
        return result;
    }

    function splitPages(value) {
        if (Array.isArray(value)) return value.map(String);
        return String(value || "")
            .split(/[\n,;]+/)
            .map(function (item) { return item.trim(); })
            .filter(Boolean);
    }

    function normalizePath(value) {
        let path = String(value || "").trim();
        if (!path) return "";
        try {
            if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
        } catch (_) {}
        if (path === "*" || path.toLowerCase() === "all") return "*";
        if (!path.startsWith("/")) path = "/" + path;
        if (!path.startsWith("/cgi-bin/koha/")) path = "/cgi-bin/koha" + path;
        return path.replace(/\/+/g, "/");
    }

    function pageMatches(rule) {
        const current = window.location.pathname;
        const pages = splitPages(rule.pages);
        if (!pages.length) return false;
        return pages.some(function (page) {
            const normalized = normalizePath(page);
            return normalized === "*" || normalized === current;
        });
    }

    function safeQueryAll(selector, root) {
        const scope = root || document;
        const value = String(selector || "").trim();
        if (!value) return [];
        try {
            return Array.prototype.slice.call(scope.querySelectorAll(value));
        } catch (_) {
            return [];
        }
    }

    function elementText(element) {
        return String(element && element.textContent || "").replace(/\s+/g, " ").trim();
    }

    function textContains(haystack, needle, caseSensitive) {
        const a = String(haystack || "");
        const b = String(needle || "");
        if (!b) return true;
        return caseSensitive === false
            ? a.toLocaleLowerCase().includes(b.toLocaleLowerCase())
            : a.includes(b);
    }

    function escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function rememberOriginal(node) {
        if (!ORIGINALS.has(node)) ORIGINALS.set(node, node.nodeValue);
    }

    function replacementRegex(rule) {
        const search = String(rule.searchText || "");
        if (!search) return null;

        let source;
        if (String(rule.matchMode || "contains") === "exact") {
            source = "^" + escapeRegExp(search) + "$";
        } else {
            source = escapeRegExp(search);
        }

        let flags = rule.caseSensitive === false ? "i" : "";
        if (rule.replaceAll !== false && String(rule.matchMode || "contains") !== "exact") flags += "g";

        try {
            return new RegExp(source, flags);
        } catch (_) {
            return null;
        }
    }

    function replaceInTextNode(node, rule) {
        if (!node || typeof node.nodeValue !== "string") return false;

        const before = node.nodeValue;
        const search = String(rule.searchText || "");
        if (!search) return false;

        const regex = replacementRegex(rule);
        if (!regex) return false;

        let after = before;

        if (String(rule.matchMode || "contains") === "exact") {
            const lhs = rule.caseSensitive === false ? before.toLocaleLowerCase() : before;
            const rhs = rule.caseSensitive === false ? search.toLocaleLowerCase() : search;
            if (lhs !== rhs) return false;
            after = String(rule.replaceText || "");
        } else {
            if (!textContains(before, search, rule.caseSensitive)) return false;
            after = before.replace(regex, String(rule.replaceText || ""));
        }

        if (after === before) return false;
        rememberOriginal(node);
        node.nodeValue = after;
        return true;
    }

    function processElement(element, rule) {
        if (!element) return false;

        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function (node) {
                    if (!node.parentElement) return NodeFilter.FILTER_REJECT;
                    if (node.parentElement.closest("script, style, textarea, input, select, option")) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let changed = false;
        let node;
        while ((node = walker.nextNode())) {
            if (replaceInTextNode(node, rule)) changed = true;
        }

        return changed;
    }

    function applyRule(rule) {
        if (!rule || rule.enabled === false || !pageMatches(rule)) return false;

        const selector = String(rule.selector || "").trim();
        if (!selector) return false;

        const targets = selector === "body"
            ? [document.body].filter(Boolean)
            : safeQueryAll(selector, document);

        if (!targets.length) return false;

        let changed = false;
        targets.forEach(function (target) {
            if (processElement(target, rule)) changed = true;
        });
        return changed;
    }

    function applyAll() {
        if (!currentConfig || currentConfig.enabled === false) return;
        (currentConfig.rules || []).forEach(applyRule);
    }

    function stopObserver() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        if (observerTimer) {
            clearTimeout(observerTimer);
            observerTimer = 0;
        }
    }

    function startObserver() {
        stopObserver();
        if (!currentConfig || currentConfig.enabled === false || currentConfig.observeDom === false) return;

        observer = new MutationObserver(function () {
            if (observerTimer) clearTimeout(observerTimer);
            observerTimer = window.setTimeout(function () {
                observerTimer = 0;
                applyAll();
            }, Math.max(25, Number(currentConfig.observeDelay) || 120));
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    function refresh(config) {
        currentConfig = normalizeConfig(config || DEFAULTS);
        applyAll();
        startObserver();
        return currentConfig;
    }

    function getCssPath(element) {
        if (!(element instanceof Element)) return "";
        if (element.id) return "#" + CSS.escape(element.id);

        const parts = [];
        let current = element;

        while (current && current.nodeType === 1 && current !== document.body && parts.length < 7) {
            let part = current.tagName.toLowerCase();

            const stableClasses = Array.prototype.slice.call(current.classList || [])
                .filter(function (name) {
                    return name &&
                        !/^active$|^show$|^open$|^selected$|^focus$|^hover$/i.test(name) &&
                        !/^pmk/.test(name);
                })
                .slice(0, 2);

            if (stableClasses.length) {
                part += stableClasses.map(function (name) { return "." + CSS.escape(name); }).join("");
            }

            const parent = current.parentElement;
            if (parent) {
                const siblings = Array.prototype.filter.call(parent.children, function (child) {
                    return child.tagName === current.tagName;
                });
                if (siblings.length > 1 && !stableClasses.length) {
                    part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
                }
            }

            parts.unshift(part);
            const candidate = parts.join(" > ");
            try {
                if (document.querySelectorAll(candidate).length === 1) return candidate;
            } catch (_) {}

            current = current.parentElement;
        }

        return parts.join(" > ");
    }

    function ensurePickerStyle() {
        if (document.getElementById(PICKER_STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = PICKER_STYLE_ID;
        style.textContent = `
            .pmk022-pick-hover {
                outline: 3px solid #0d6efd !important;
                outline-offset: 2px !important;
                cursor: crosshair !important;
            }
            #pmk022-picker-banner {
                position: fixed;
                z-index: 2147483647;
                left: 50%;
                top: 12px;
                transform: translateX(-50%);
                max-width: min(760px, calc(100vw - 24px));
                background: #fff;
                border: 1px solid #adb5bd;
                border-radius: .35rem;
                box-shadow: 0 .35rem 1rem rgba(0,0,0,.22);
                padding: .55rem .75rem;
                font-size: .9rem;
                color: #212529;
            }
        `;
        document.head.appendChild(style);
    }

    function pickElementOnCurrentPage() {
        ensurePickerStyle();

        return new Promise(function (resolve, reject) {
            let hovered = null;
            let done = false;

            const banner = document.createElement("div");
            banner.id = "pmk022-picker-banner";
            banner.innerHTML = '<strong>Sélection PimpMyKoha</strong> — clique sur le texte à modifier. Échap pour annuler.';
            document.body.appendChild(banner);

            function cleanup() {
                if (done) return;
                done = true;
                if (hovered) hovered.classList.remove("pmk022-pick-hover");
                document.removeEventListener("mouseover", onOver, true);
                document.removeEventListener("mouseout", onOut, true);
                document.removeEventListener("click", onClick, true);
                document.removeEventListener("keydown", onKey, true);
                banner.remove();
            }

            function allowedTarget(target) {
                if (!(target instanceof Element)) return null;
                if (target.closest("#pmk022-picker-banner, #pmk-config-overlay, .pmk-config-overlay")) return null;
                return target;
            }

            function onOver(event) {
                const target = allowedTarget(event.target);
                if (!target) return;
                if (hovered && hovered !== target) hovered.classList.remove("pmk022-pick-hover");
                hovered = target;
                hovered.classList.add("pmk022-pick-hover");
            }

            function onOut(event) {
                if (hovered && event.target === hovered) {
                    hovered.classList.remove("pmk022-pick-hover");
                    hovered = null;
                }
            }

            function onClick(event) {
                const target = allowedTarget(event.target);
                if (!target) return;

                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                const selector = getCssPath(target);
                const targetName = elementText(target).slice(0, 160) ||
                    target.getAttribute("aria-label") ||
                    target.getAttribute("title") ||
                    target.tagName.toLowerCase();

                cleanup();

                if (!selector) {
                    reject(new Error("picker_selector_unavailable"));
                    return;
                }

                resolve({
                    value: selector,
                    selector: selector,
                    targetName: targetName,
                    text: elementText(target)
                });
            }

            function onKey(event) {
                if (event.key !== "Escape") return;
                event.preventDefault();
                cleanup();
                reject(new Error("picker_cancelled"));
            }

            document.addEventListener("mouseover", onOver, true);
            document.addEventListener("mouseout", onOut, true);
            document.addEventListener("click", onClick, true);
            document.addEventListener("keydown", onKey, true);
        });
    }

    function resolveRuleIndexFromFieldPath(fieldPath) {
        if (!Array.isArray(fieldPath)) return -1;
        const pos = fieldPath.indexOf("rules");
        if (pos === -1) return -1;
        const index = Number(fieldPath[pos + 1]);
        return Number.isInteger(index) ? index : -1;
    }

    function firstConcretePage(rule) {
        const pages = splitPages(rule && rule.pages);
        for (let i = 0; i < pages.length; i += 1) {
            const path = normalizePath(pages[i]);
            if (path && path !== "*") return path;
        }
        return "";
    }

    function pickForConfig(context) {
        const rootObject = context && context.rootObject ? context.rootObject : null;
        const fieldPath = context && Array.isArray(context.fieldPath) ? context.fieldPath : [];
        const index = resolveRuleIndexFromFieldPath(fieldPath);
        const rule = rootObject && Array.isArray(rootObject.rules) && index >= 0
            ? rootObject.rules[index]
            : null;
        const wantedPage = firstConcretePage(rule);

        if (wantedPage && wantedPage !== window.location.pathname) {
            const pending = {
                moduleId: MODULE_ID,
                ruleIndex: index,
                page: wantedPage,
                draft: deepClone(rootObject || DEFAULTS),
                startedAt: Date.now()
            };
            try {
                sessionStorage.setItem(PENDING_PICK_KEY, JSON.stringify(pending));
            } catch (_) {}

            window.location.href = window.location.origin + wantedPage;
            return new Promise(function () {});
        }

        /*
         * Si le picker est lancé depuis l'administration PMK sur la page
         * courante, on masque temporairement l'overlay sans appeler
         * PMKConfig.closeAdmin(). Ainsi le brouillon et adminState restent
         * intacts pendant que l'utilisateur clique dans la page Koha.
         */
        const overlay = document.getElementById("pmk-config-overlay");
        const overlayWasOpen = Boolean(overlay && overlay.classList.contains("pmk-open"));
        const bodyWasLocked = document.body.classList.contains("pmk-config-open");

        if (overlayWasOpen) overlay.classList.remove("pmk-open");
        if (bodyWasLocked) document.body.classList.remove("pmk-config-open");

        function restoreAdminOverlay() {
            if (overlayWasOpen && overlay) overlay.classList.add("pmk-open");
            if (bodyWasLocked) document.body.classList.add("pmk-config-open");
        }

        return pickElementOnCurrentPage().then(function (result) {
            restoreAdminOverlay();
            return result;
        }).catch(function (error) {
            restoreAdminOverlay();
            throw error;
        });
    }

    async function resumePendingPick() {
        let pending = null;
        try {
            const raw = sessionStorage.getItem(PENDING_PICK_KEY);
            if (raw) pending = JSON.parse(raw);
        } catch (_) {}

        if (!pending || pending.moduleId !== MODULE_ID) return false;

        if (Date.now() - Number(pending.startedAt || 0) > 15 * 60 * 1000) {
            try { sessionStorage.removeItem(PENDING_PICK_KEY); } catch (_) {}
            return false;
        }

        if (normalizePath(pending.page) !== window.location.pathname) return false;

        try { sessionStorage.removeItem(PENDING_PICK_KEY); } catch (_) {}

        window.setTimeout(async function () {
            try {
                const picked = await pickElementOnCurrentPage();
                const draft = normalizeConfig(pending.draft || DEFAULTS);
                const index = Number(pending.ruleIndex);

                if (!Array.isArray(draft.rules) || !draft.rules[index]) return;

                const rule = draft.rules[index];
                rule.selector = String(picked.value || picked.selector || "").trim();
                rule.targetName = picked.targetName || "";
                if (!String(rule.label || "").trim()) rule.label = picked.targetName || ("Règle " + (index + 1));

                // Quand on sélectionne un élément, on préremplit le texte recherché
                // avec son contenu si le champ est encore vide.
                if (!String(rule.searchText || "").trim() && picked.text) {
                    rule.searchText = String(picked.text).trim();
                }

                if (window.PMKConfig && typeof window.PMKConfig.saveConfig === "function") {
                    await window.PMKConfig.saveConfig(MODULE_ID, draft);
                    refresh(draft);

                    if (typeof window.PMKConfig.openAdmin === "function") {
                        await window.PMKConfig.openAdmin(MODULE_ID, {
                            ruleIndex: index,
                            resumedPicker: true
                        });
                    }
                } else {
                    // Repli local si le socle de configuration n'est pas disponible.
                    refresh(draft);
                }
            } catch (error) {
                if (!error || error.message !== "picker_cancelled") {
                    // fail-safe : aucune modification si la sélection échoue
                }
            }
        }, 250);

        return true;
    }

    function mountContextAccess() {
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        if (window.location.pathname !== "/cgi-bin/koha/circ/circulation.pl") return;

        const anchor =
            document.querySelector("#circ_circulation_issue") ||
            document.querySelector("main h1") ||
            document.querySelector("h1");

        if (!anchor) return;

        window.PMKConfig.mountContextButton({
            moduleId: MODULE_ID,
            anchor: anchor,
            contextKey: "circulation-text-replacement",
            title: {
                fr: "Configurer les remplacements de textes",
                en: "Configure text replacements"
            }
        });
    }

    function registerRuntimeModule() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return false;
        // La définition complète se trouve dans 000-pmk-config-firestore.js.
        // Ici on n'écrase rien si elle y est déjà enregistrée.
        return true;
    }

    async function loadConfig() {
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") {
            return deepClone(DEFAULTS);
        }

        try {
            const value = await window.PMKConfig.getConfig(MODULE_ID);
            return value || deepClone(DEFAULTS);
        } catch (_) {
            return deepClone(DEFAULTS);
        }
    }

    async function init() {
        registerRuntimeModule();

        const cfg = await loadConfig();
        refresh(cfg);

        if (window.PMKConfig && typeof window.PMKConfig.onConfigChanged === "function") {
            window.PMKConfig.onConfigChanged(MODULE_ID, function (nextConfig) {
                refresh(nextConfig);
            });
        }

        mountContextAccess();
        resumePendingPick();
    }

    window.PMK022TextReplacement = {
        id: MODULE_ID,
        version: MODULE_VERSION,
        defaults: deepClone(DEFAULTS),
        refresh: refresh,
        apply: applyAll,
        pickElement: pickElementOnCurrentPage,
        pickForConfig: pickForConfig,
        resumePendingPick: resumePendingPick
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();

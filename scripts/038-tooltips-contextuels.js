/* ============================================================
   Nom du fichier : 038-tooltips-contextuels.js
   Module PMK      : contextual-tooltips
   Version         : 2.1.0
   Mise à jour     : 2026-09-18
   Auteur          : Michael Mundet / refonte PimpMyKoha

   Fusionne et remplace :
   - 038-tooltips-adherents-I.js
   - 039-tooltips-adherents-AS.js

   Fonction :
   - info-bulles contextuelles configurables sur n'importe quelle page Koha ;
   - règles illimitées : page/URL + élément + texte FR/EN ;
   - utilise exclusivement le sélecteur visuel commun de PMK ;
   - affiche une tooltip accessible, responsive et intégrée à Koha ;
   - conserve exactement les textes historiques 038/039 dans les valeurs par défaut.
   ============================================================ */
(function () {
    "use strict";

    if (window.__PMK038ContextualTooltipsLoaded) return;
    window.__PMK038ContextualTooltipsLoaded = true;

    const MODULE_ID = "contextual-tooltips";
    const MODULE_VERSION = "2.1.0";
    const TOOLTIP_ID = "pmk-contextual-tooltip";
    const STYLE_ID = "pmk-contextual-tooltip-style";
    const OWNER_ATTR = "data-pmk038-tooltip";

    const DEFAULTS = {
        enabled: true,
        appearance: {
            theme: "koha",
            position: "auto",
            maxWidth: 420,
            fontSize: 14,
            borderRadius: 7,
            offset: 10,
            showDelay: 120,
            hideDelay: 80,
            shadow: true,
            arrow: true,
            backgroundColor: "#ffffff",
            textColor: "#212529",
            borderColor: "#b7c2cc",
            accentColor: "#408540"
        },
        rules: [
            { id: "legacy-I-surname", enabled: true, label: "Catégorie I — Nom", pageUrl: "/cgi-bin/koha/members/memberentry.pl?op=add_form&categorycode=I", selector: "#surname", targetName: "Nom", textFr: "Saisissez le nom de la personne faisant la carte", textEn: "Enter the name of the person for whom the card is being created", position: "inherit" },
            { id: "legacy-I-othernames", enabled: true, label: "Catégorie I — Autres noms", pageUrl: "/cgi-bin/koha/members/memberentry.pl?op=add_form&categorycode=I", selector: "#othernames", targetName: "Autres noms", textFr: "Saisissez la nature de la collectivité ou du service, indiquez le libellé exact (ex. : Service culture, direction des sports…) en précisant la collectivité. Pour les classes, indiquez la classe et l'école (Ex. : École Truc, CM1)", textEn: "Enter the type of organisation or department and its exact name, including the parent authority. For classes, enter the school and class (for example: Example School, CM1).", position: "inherit" },
            { id: "legacy-I-address", enabled: true, label: "Catégorie I — Adresse", pageUrl: "/cgi-bin/koha/members/memberentry.pl?op=add_form&categorycode=I", selector: "#address", targetName: "Adresse", textFr: "Saisissez l'adresse de la personne faisant la carte", textEn: "Enter the address of the person for whom the card is being created", position: "inherit" },
            { id: "legacy-AS-surname", enabled: true, label: "Catégorie AS — Nom", pageUrl: "/cgi-bin/koha/members/memberentry.pl?op=add_form&categorycode=AS", selector: "#surname", targetName: "Nom", textFr: "Saisissez le nom de la personne faisant la carte", textEn: "Enter the name of the person for whom the card is being created", position: "inherit" },
            { id: "legacy-AS-address", enabled: true, label: "Catégorie AS — Adresse", pageUrl: "/cgi-bin/koha/members/memberentry.pl?op=add_form&categorycode=AS", selector: "#address", targetName: "Adresse", textFr: "Saisissez l'adresse de la personne faisant la carte", textEn: "Enter the address of the person for whom the card is being created", position: "inherit" },
            { id: "legacy-AS-othernames", enabled: true, label: "Catégorie AS — Association", pageUrl: "/cgi-bin/koha/members/memberentry.pl?op=add_form&categorycode=AS", selector: "#othernames", targetName: "Autres noms", textFr: "Indiquer le nom de l'association", textEn: "Enter the name of the association", position: "inherit" }
        ]
    };

    let currentConfig = deepClone(DEFAULTS);
    let activeRules = [];
    let activeTarget = null;
    let activeRule = null;
    let previousDescribedBy = null;
    let showTimer = 0;
    let hideTimer = 0;
    let listenersMounted = false;

    function deepClone(value) { return JSON.parse(JSON.stringify(value)); }

    function merge(target, source) {
        if (!source || typeof source !== "object") return target;
        Object.keys(source).forEach(function (key) {
            const value = source[key];
            if (Array.isArray(value)) target[key] = deepClone(value);
            else if (value && typeof value === "object") {
                if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) target[key] = {};
                merge(target[key], value);
            } else target[key] = value;
        });
        return target;
    }

    function normalizeConfig(config) {
        const result = merge(deepClone(DEFAULTS), config || {});
        if (!Array.isArray(result.rules)) result.rules = deepClone(DEFAULTS.rules);
        result.rules = result.rules.map(function (rule, index) {
            return merge({
                id: "tooltip-" + (index + 1), enabled: true, label: "", pageUrl: "*", selector: "",
                targetName: "", textFr: "", textEn: "", position: "inherit"
            }, rule || {});
        });
        return result;
    }

    function language() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            try { return window.PMKConfig.getLanguage() === "en" ? "en" : "fr"; } catch (_) {}
        }
        return (document.documentElement.lang || "").toLowerCase().startsWith("en") ? "en" : "fr";
    }

    function normalizeTargetUrl(value) {
        if (window.PMKConfig && window.PMKConfig.elementPicker && typeof window.PMKConfig.elementPicker.normalizeTargetUrl === "function") {
            return window.PMKConfig.elementPicker.normalizeTargetUrl(value);
        }
        const raw = String(value || "").trim();
        if (!raw || raw === "*" || raw === "all") return "";
        return raw.startsWith("/") ? raw : "/cgi-bin/koha/" + raw.replace(/^\/+/, "");
    }

    function pageMatches(pageUrl) {
        const target = normalizeTargetUrl(pageUrl);
        if (!target) return true;
        let wanted;
        try { wanted = new URL(target, window.location.origin); } catch (_) { return false; }
        if (wanted.pathname !== window.location.pathname) return false;
        const current = new URL(window.location.href);
        let ok = true;
        wanted.searchParams.forEach(function (v, k) {
            if (current.searchParams.get(k) !== v) ok = false;
        });
        return ok;
    }

    function safeSelector(selector) {
        const value = String(selector || "").trim();
        if (!value) return false;
        try { document.createDocumentFragment().querySelector(value); return true; }
        catch (_) { return false; }
    }

    function compileRules(config) {
        return (config.rules || []).filter(function (rule) {
            return rule && rule.enabled !== false && pageMatches(rule.pageUrl) && safeSelector(rule.selector) &&
                String(rule.textFr || rule.textEn || "").trim();
        });
    }

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #${TOOLTIP_ID} {
                position: fixed;
                z-index: 2147483000;
                box-sizing: border-box;
                opacity: 0;
                visibility: hidden;
                transform: translateY(2px);
                transition: opacity .12s ease, transform .12s ease, visibility 0s linear .12s;
                pointer-events: none;
                white-space: normal;
                overflow-wrap: anywhere;
            }
            #${TOOLTIP_ID}.is-visible {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
                transition: opacity .12s ease, transform .12s ease;
            }
            #${TOOLTIP_ID}::after {
                content: "";
                position: absolute;
                width: 10px;
                height: 10px;
                background: var(--pmk-tooltip-bg, #fff);
                transform: rotate(45deg);
                display: var(--pmk-tooltip-arrow, block);
            }
            #${TOOLTIP_ID}[data-position="bottom"]::after { top: -6px; left: calc(50% - 5px); border-left: 1px solid var(--pmk-tooltip-border); border-top: 1px solid var(--pmk-tooltip-border); }
            #${TOOLTIP_ID}[data-position="top"]::after { bottom: -6px; left: calc(50% - 5px); border-right: 1px solid var(--pmk-tooltip-border); border-bottom: 1px solid var(--pmk-tooltip-border); }
            #${TOOLTIP_ID}[data-position="right"]::after { left: -6px; top: calc(50% - 5px); border-left: 1px solid var(--pmk-tooltip-border); border-bottom: 1px solid var(--pmk-tooltip-border); }
            #${TOOLTIP_ID}[data-position="left"]::after { right: -6px; top: calc(50% - 5px); border-right: 1px solid var(--pmk-tooltip-border); border-top: 1px solid var(--pmk-tooltip-border); }
            @media (max-width: 576px) {
                #${TOOLTIP_ID} { max-width: calc(100vw - 24px) !important; }
            }
        `;
        document.head.appendChild(style);
    }

    function tooltipNode() {
        injectStyle();
        let node = document.getElementById(TOOLTIP_ID);
        if (node) return node;
        node = document.createElement("div");
        node.id = TOOLTIP_ID;
        node.setAttribute("role", "tooltip");
        node.setAttribute("aria-hidden", "true");
        document.body.appendChild(node);
        return node;
    }

    function effectiveColors(appearance) {
        const a = appearance || {};
        if (a.theme === "dark") {
            return { bg: "#2f3439", text: "#ffffff", border: "#1f2428", accent: a.accentColor || "#7ab67a" };
        }
        if (a.theme === "custom") {
            return {
                bg: a.backgroundColor || "#ffffff",
                text: a.textColor || "#212529",
                border: a.borderColor || "#b7c2cc",
                accent: a.accentColor || "#408540"
            };
        }
        return { bg: "#ffffff", text: "#212529", border: "#b7c2cc", accent: a.accentColor || "#408540" };
    }

    function applyAppearance(node, config) {
        const a = config.appearance || {};
        const c = effectiveColors(a);
        node.style.setProperty("--pmk-tooltip-bg", c.bg);
        node.style.setProperty("--pmk-tooltip-border", c.border);
        node.style.setProperty("--pmk-tooltip-arrow", a.arrow === false ? "none" : "block");
        node.style.background = c.bg;
        node.style.color = c.text;
        node.style.border = "1px solid " + c.border;
        node.style.borderLeft = "3px solid " + c.accent;
        node.style.borderRadius = Math.max(0, Number(a.borderRadius) || 7) + "px";
        node.style.padding = "10px 12px";
        node.style.fontSize = Math.max(11, Number(a.fontSize) || 14) + "px";
        node.style.lineHeight = "1.45";
        node.style.maxWidth = Math.max(180, Number(a.maxWidth) || 420) + "px";
        node.style.boxShadow = a.shadow === false ? "none" : "0 .35rem 1rem rgba(0,0,0,.18)";
        node.style.textAlign = "left";
    }

    function ruleText(rule) {
        const en = language() === "en";
        return String(en ? (rule.textEn || rule.textFr || "") : (rule.textFr || rule.textEn || "")).trim();
    }

    function findMatch(start) {
        if (!start || start.nodeType !== 1) return null;
        for (let i = 0; i < activeRules.length; i += 1) {
            const rule = activeRules[i];
            let target = null;
            try { target = start.closest(rule.selector); } catch (_) { target = null; }
            if (target) return { rule: rule, target: target };
        }
        return null;
    }

    function choosePosition(targetRect, tipRect, wanted, offset) {
        const margin = 8;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const fits = {
            bottom: targetRect.bottom + offset + tipRect.height <= vh - margin,
            top: targetRect.top - offset - tipRect.height >= margin,
            right: targetRect.right + offset + tipRect.width <= vw - margin,
            left: targetRect.left - offset - tipRect.width >= margin
        };
        if (wanted && wanted !== "auto" && fits[wanted]) return wanted;
        if (fits.bottom) return "bottom";
        if (fits.top) return "top";
        if (fits.right) return "right";
        if (fits.left) return "left";
        return wanted && wanted !== "auto" ? wanted : "bottom";
    }

    function positionTooltip() {
        if (!activeTarget || !activeRule) return;
        const node = tooltipNode();
        const rect = activeTarget.getBoundingClientRect();
        const tip = node.getBoundingClientRect();
        const a = currentConfig.appearance || {};
        const offset = Math.max(4, Number(a.offset) || 10);
        const wanted = activeRule.position && activeRule.position !== "inherit" ? activeRule.position : (a.position || "auto");
        const position = choosePosition(rect, tip, wanted, offset);
        let left = 0, top = 0;
        if (position === "top") {
            left = rect.left + (rect.width - tip.width) / 2;
            top = rect.top - tip.height - offset;
        } else if (position === "left") {
            left = rect.left - tip.width - offset;
            top = rect.top + (rect.height - tip.height) / 2;
        } else if (position === "right") {
            left = rect.right + offset;
            top = rect.top + (rect.height - tip.height) / 2;
        } else {
            left = rect.left + (rect.width - tip.width) / 2;
            top = rect.bottom + offset;
        }
        left = Math.max(8, Math.min(window.innerWidth - tip.width - 8, left));
        top = Math.max(8, Math.min(window.innerHeight - tip.height - 8, top));
        node.style.left = Math.round(left) + "px";
        node.style.top = Math.round(top) + "px";
        node.dataset.position = position;
    }

    function restoreAria() {
        if (!activeTarget) return;
        if (previousDescribedBy === null) activeTarget.removeAttribute("aria-describedby");
        else activeTarget.setAttribute("aria-describedby", previousDescribedBy);
        previousDescribedBy = null;
    }

    function hideNow() {
        clearTimeout(showTimer); showTimer = 0;
        clearTimeout(hideTimer); hideTimer = 0;
        const node = document.getElementById(TOOLTIP_ID);
        if (node) {
            node.classList.remove("is-visible");
            node.setAttribute("aria-hidden", "true");
        }
        restoreAria();
        activeTarget = null;
        activeRule = null;
    }

    function scheduleHide() {
        clearTimeout(showTimer); showTimer = 0;
        clearTimeout(hideTimer);
        const delay = Math.max(0, Number(currentConfig.appearance && currentConfig.appearance.hideDelay) || 0);
        hideTimer = window.setTimeout(hideNow, delay);
    }

    function showNow(match) {
        if (!match || !match.target || !match.rule) return;
        clearTimeout(hideTimer); hideTimer = 0;
        const sameTarget = activeTarget === match.target;
        if (activeTarget && !sameTarget) restoreAria();
        activeTarget = match.target;
        activeRule = match.rule;
        const node = tooltipNode();
        applyAppearance(node, currentConfig);
        node.textContent = ruleText(match.rule);
        if (!sameTarget) previousDescribedBy = activeTarget.getAttribute("aria-describedby");
        const ids = String(activeTarget.getAttribute("aria-describedby") || previousDescribedBy || "").split(/\s+/).filter(Boolean);
        if (!ids.includes(TOOLTIP_ID)) ids.push(TOOLTIP_ID);
        activeTarget.setAttribute("aria-describedby", ids.join(" "));
        node.setAttribute("aria-hidden", "false");
        node.classList.add("is-visible");
        positionTooltip();
        window.requestAnimationFrame(positionTooltip);
    }

    function scheduleShow(match) {
        if (!match || !ruleText(match.rule)) return;
        clearTimeout(hideTimer); hideTimer = 0;
        clearTimeout(showTimer);
        const delay = Math.max(0, Number(currentConfig.appearance && currentConfig.appearance.showDelay) || 0);
        showTimer = window.setTimeout(function () { showNow(match); }, delay);
    }

    function onMouseOver(event) {
        const match = findMatch(event.target);
        if (!match) return;
        if (activeTarget === match.target && activeRule === match.rule) return;
        scheduleShow(match);
    }

    function onMouseOut(event) {
        if (!activeTarget) return;
        if (event.relatedTarget && activeTarget.contains(event.relatedTarget)) return;
        scheduleHide();
    }

    function onFocusIn(event) {
        const match = findMatch(event.target);
        if (match) scheduleShow(match);
    }

    function onFocusOut(event) {
        if (!activeTarget) return;
        if (event.relatedTarget && activeTarget.contains(event.relatedTarget)) return;
        scheduleHide();
    }

    function onClick(event) {
        const match = findMatch(event.target);
        if (match) {
            if (activeTarget === match.target && activeRule === match.rule) showNow(match);
            else scheduleShow(match);
        } else if (activeTarget) {
            scheduleHide();
        }
    }

    function onKeyDown(event) {
        if (event.key === "Escape" && activeTarget) hideNow();
    }

    function onViewportChange() {
        if (activeTarget) positionTooltip();
    }

    function mountListeners() {
        if (listenersMounted) return;
        listenersMounted = true;
        document.addEventListener("mouseover", onMouseOver, true);
        document.addEventListener("mouseout", onMouseOut, true);
        document.addEventListener("focusin", onFocusIn, true);
        document.addEventListener("focusout", onFocusOut, true);
        document.addEventListener("click", onClick, true);
        document.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("resize", onViewportChange, { passive: true });
        window.addEventListener("scroll", onViewportChange, true);
    }

    function unmountListeners() {
        if (!listenersMounted) return;
        listenersMounted = false;
        document.removeEventListener("mouseover", onMouseOver, true);
        document.removeEventListener("mouseout", onMouseOut, true);
        document.removeEventListener("focusin", onFocusIn, true);
        document.removeEventListener("focusout", onFocusOut, true);
        document.removeEventListener("click", onClick, true);
        document.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("resize", onViewportChange, { passive: true });
        window.removeEventListener("scroll", onViewportChange, true);
    }

    function mountContextAccess() {
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        if (!activeRules.length) return;
        const anchor = document.querySelector("h1") || document.querySelector("main h2") || document.querySelector("#main h2");
        if (!anchor) return;
        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "after",
                contextKey: "contextual-tooltips-" + window.location.pathname.replace(/[^a-z0-9]+/gi, "-"),
                context: { sectionId: "rules" }
            });
        } catch (_) {}
    }

    function refresh(config) {
        hideNow();
        currentConfig = normalizeConfig(config || DEFAULTS);
        activeRules = currentConfig.enabled === false ? [] : compileRules(currentConfig);
        if (currentConfig.enabled === false) {
            unmountListeners();
            return;
        }
        mountListeners();
        mountContextAccess();
    }

    function ruleIndex(fieldPath) {
        if (!Array.isArray(fieldPath)) return -1;
        const pos = fieldPath.indexOf("rules");
        if (pos === -1) return -1;
        const index = Number(fieldPath[pos + 1]);
        return Number.isInteger(index) ? index : -1;
    }

    function registerCommonPickerAdapter() {
        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!service || typeof service.register !== "function") return false;
        service.register(MODULE_ID, {
            getOptions: function () {
                return {
                    bannerText: language() === "en"
                        ? "Click the element that should display this tooltip — Esc cancels"
                        : "Clique sur l’élément qui doit afficher cette info-bulle — Échap annule"
                };
            },
            applyPending: function (draft, pending, picked) {
                const index = ruleIndex(pending && pending.fieldPath || []);
                if (!draft || !Array.isArray(draft.rules) || index < 0 || !draft.rules[index]) return draft;
                const rule = draft.rules[index];
                rule.targetName = String(picked && (picked.targetName || picked.selector) || rule.targetName || "");
                if (!String(rule.pageUrl || "").trim() && picked && picked.pageUrl) rule.pageUrl = String(picked.pageUrl);
                if (!String(rule.label || "").trim()) rule.label = rule.targetName || ("Info-bulle " + (index + 1));
                return draft;
            },
            afterPendingSave: function (draft) { refresh(draft); }
        });
        return true;
    }

    function pickForConfig(context) {
        const service = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!service || typeof service.pickForConfig !== "function") return Promise.reject(new Error("pmk_common_picker_unavailable"));
        registerCommonPickerAdapter();
        const rootObject = context && context.rootObject ? context.rootObject : {};
        const fieldPath = context && Array.isArray(context.fieldPath) ? context.fieldPath : [];
        const index = ruleIndex(fieldPath);
        const rule = rootObject && Array.isArray(rootObject.rules) && index >= 0 ? rootObject.rules[index] : null;
        const targetUrl = String(rule && rule.pageUrl || window.location.pathname + window.location.search);
        return service.pickForConfig({
            moduleId: MODULE_ID,
            targetUrl: targetUrl,
            rootObject: rootObject,
            fieldPath: fieldPath,
            meta: { ruleIndex: index },
            adminContext: { sectionId: "rules", ruleIndex: index }
        });
    }

    function registerVisualEditorAdapter() {
        const editor = window.PMKConfig && window.PMKConfig.visualEditor;
        if (!editor || typeof editor.register !== "function") return false;
        editor.register(MODULE_ID, {
            capabilities: {
                inlinePreview: true,
                styleEyedropper: true,
                livePreview: true
            },
            previewModel: function (context) {
                const cfg = normalizeConfig(context && context.rootObject || currentConfig || DEFAULTS);
                const a = cfg.appearance || {};
                const c = effectiveColors(a);
                const first = (cfg.rules || []).find(function (rule) {
                    return rule && rule.enabled !== false;
                }) || {};
                return {
                    text: ruleText(first) || (language() === "en" ? "Tooltip preview" : "Aperçu de l’info-bulle"),
                    style: {
                        fontSize: Math.max(11, Number(a.fontSize) || 14) + "px",
                        color: c.text,
                        backgroundColor: c.bg,
                        borderColor: c.border,
                        borderWidth: "1px",
                        borderStyle: "solid",
                        borderRadius: Math.max(0, Number(a.borderRadius) || 7) + "px",
                        boxShadow: a.shadow === false ? "none" : "0 .35rem 1rem rgba(0,0,0,.18)",
                        lineHeight: "1.45"
                    }
                };
            },
            styleTargetUrl: function (context) {
                const cfg = normalizeConfig(context && context.rootObject || currentConfig || DEFAULTS);
                const first = (cfg.rules || []).find(function (rule) {
                    return rule && rule.enabled !== false && String(rule.pageUrl || "").trim();
                });
                return first ? first.pageUrl : (window.location.pathname + window.location.search);
            },
            applyStyleSample: function (context) {
                const cfg = context && context.rootObject;
                const sample = context && context.sample;
                if (!cfg || !sample) return { rootObject: cfg };
                if (!cfg.appearance || typeof cfg.appearance !== "object") cfg.appearance = {};
                const a = cfg.appearance;
                const visual = window.PMKConfig && window.PMKConfig.visualEditor;
                const toHex = visual && typeof visual.colorToHex === "function"
                    ? visual.colorToHex
                    : function () { return ""; };
                const px = visual && typeof visual.pxNumber === "function"
                    ? visual.pxNumber
                    : function (v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
                a.theme = "custom";
                const fs = px(sample.fontSize, null);
                if (Number.isFinite(fs)) a.fontSize = Math.max(11, Math.min(32, Math.round(fs)));
                const radius = px(sample.borderRadius, null);
                if (Number.isFinite(radius)) a.borderRadius = Math.max(0, Math.min(48, Math.round(radius)));
                a.backgroundColor = toHex(sample.backgroundColor) || a.backgroundColor || "#ffffff";
                a.textColor = toHex(sample.color) || a.textColor || "#212529";
                a.borderColor = toHex(sample.borderColor) || a.borderColor || "#b7c2cc";
                if (a.borderColor) a.accentColor = a.borderColor;
                a.shadow = Boolean(sample.boxShadow && sample.boxShadow !== "none");
                return { rootObject: cfg };
            },
            previewDraft: function (draft) {
                const before = deepClone(currentConfig || DEFAULTS);
                refresh(draft);
                return function () {
                    refresh(before);
                };
            }
        });
        return true;
    }

    function loadConfig() {
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") return Promise.resolve(deepClone(DEFAULTS));
        return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
            .then(function (cfg) { return cfg || deepClone(DEFAULTS); })
            .catch(function () { return deepClone(DEFAULTS); });
    }

    function start() {
        registerCommonPickerAdapter();
        registerVisualEditorAdapter();
        loadConfig().then(refresh);
        if (window.PMKConfig && typeof window.PMKConfig.subscribe === "function") {
            try { window.PMKConfig.subscribe(MODULE_ID, refresh); } catch (_) {}
        }
    }

    function boot() {
        if (window.PMKConfig) start();
        else {
            window.addEventListener("pmk:config-ready", start, { once: true });
            // fonctionnement autonome si le socle PMK n'est pas chargé
            window.setTimeout(function () {
                if (!window.PMKConfig) refresh(DEFAULTS);
            }, 1200);
        }
    }

    window.PMK038ContextualTooltips = {
        id: MODULE_ID,
        version: MODULE_VERSION,
        defaults: deepClone(DEFAULTS),
        refresh: refresh,
        pickForConfig: pickForConfig,
        getActiveRules: function () { return deepClone(activeRules); }
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
})();

/* ============================================================
   106-scroll-buttons.js
   PimpMyKoha — module autonome
   Nom : Navigation rapide — haut / bas de page
   Version : 2.0.2-preplugin
   Date : 2026-09-20

   - conserve le rendu historique par défaut ;
   - personnalisation visuelle complète ;
   - comportement desktop/mobile configurable ;
   - scroll fluide respectant prefers-reduced-motion ;
   - aucun déblocage agressif du scroll par défaut ;
   - option avancée de réparation limitée aux styles inline résiduels ;
   - compatible avec le socle PMK et utilisable seul avec les valeurs par défaut.
   - 2.0.1 : le panneau de configuration PMK ne masque plus les boutons pendant la recette.
   - 2.0.1 : exposition d’un diagnostic runtime PMK106ScrollButtons.
   - 2.0.2 : détection des modales resserrée aux vraies fenêtres ouvertes ; suppression du faux positif générique aria-modal.
   ============================================================ */
(function () {
    "use strict";

    if (window.__PMK106_SCROLL_BUTTONS__) return;
    window.__PMK106_SCROLL_BUTTONS__ = true;

    const MODULE_ID = "scroll-buttons";
    const VERSION = "2.0.2-preplugin";
    const STYLE_ID = "pmk106-scroll-buttons-style";
    const DOWN_ID = "scroll-button-down";
    const UP_ID = "scroll-button-up";
    const DOWN_WRAP_ID = "pmk106-scroll-down-wrap";
    const UP_WRAP_ID = "pmk106-scroll-up-wrap";
    const CONFIG_HOST_ID = "pmk106-config-host";

    const DEFAULT_CONFIG = {
        enabled: true,
        pages: {
            mode: "all",
            patterns: ""
        },
        behavior: {
            smoothScroll: true,
            respectReducedMotion: true,
            upThresholdPx: 200,
            bottomEpsilonPx: 2,
            hideWhenDialogOpen: true
        },
        desktop: {
            showDown: true,
            showUp: true,
            side: "right",
            horizontalOffsetPx: 28,
            downTopPx: 40,
            upBottomPx: 30,
            sizePx: 50
        },
        mobile: {
            breakpointPx: 768,
            showDown: false,
            showUp: true,
            side: "right",
            horizontalOffsetPx: 18,
            downTopPx: 18,
            upBottomPx: 18,
            sizePx: 50
        },
        appearance: {
            backgroundColor: "#408540",
            hoverBackgroundColor: "#0056b3",
            iconColor: "#ffffff",
            borderColor: "#408540",
            borderWidthPx: 0,
            borderRadiusPercent: 50,
            opacity: 1,
            hoverScale: 1,
            shadowEnabled: true,
            shadow: "0 2px 6px rgba(0,0,0,0.3)",
            iconMode: "symbol",
            downSymbol: "▼",
            upSymbol: "▲",
            downFaClass: "fa fa-arrow-down",
            upFaClass: "fa fa-arrow-up",
            iconSizePx: 22,
            zIndex: 10000
        },
        labels: {
            downFr: "Descendre en bas",
            downEn: "Scroll to bottom",
            upFr: "Remonter en haut",
            upEn: "Scroll to top"
        },
        advanced: {
            repairResidualScrollLock: false,
            repairCooldownMs: 1000
        }
    };

    const state = {
        config: null,
        down: null,
        up: null,
        downWrap: null,
        upWrap: null,
        configHost: null,
        ticking: false,
        lastRepairTs: 0,
        resizeObserver: null,
        abortController: null,
        contextMounted: false
    };

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function object(value) {
        return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    }

    function merge(base, override) {
        const out = clone(base);
        Object.keys(object(override)).forEach(function (key) {
            if (out[key] && typeof out[key] === "object" && !Array.isArray(out[key]) &&
                override[key] && typeof override[key] === "object" && !Array.isArray(override[key])) {
                out[key] = merge(out[key], override[key]);
            } else {
                out[key] = clone(override[key]);
            }
        });
        return out;
    }

    function num(value, min, max, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    }

    function text(value, fallback) {
        const s = String(value == null ? "" : value).trim();
        return s || fallback;
    }

    function normalize(config) {
        const cfg = merge(DEFAULT_CONFIG, object(config));
        cfg.enabled = cfg.enabled !== false;

        cfg.pages = merge(DEFAULT_CONFIG.pages, object(cfg.pages));
        if (!["all", "include", "exclude"].includes(cfg.pages.mode)) cfg.pages.mode = "all";
        cfg.pages.patterns = String(cfg.pages.patterns || "");

        cfg.behavior = merge(DEFAULT_CONFIG.behavior, object(cfg.behavior));
        cfg.behavior.smoothScroll = cfg.behavior.smoothScroll !== false;
        cfg.behavior.respectReducedMotion = cfg.behavior.respectReducedMotion !== false;
        cfg.behavior.hideWhenDialogOpen = cfg.behavior.hideWhenDialogOpen !== false;
        cfg.behavior.upThresholdPx = num(cfg.behavior.upThresholdPx, 0, 10000, 200);
        cfg.behavior.bottomEpsilonPx = num(cfg.behavior.bottomEpsilonPx, 0, 500, 2);

        ["desktop", "mobile"].forEach(function (section) {
            cfg[section] = merge(DEFAULT_CONFIG[section], object(cfg[section]));
            cfg[section].showDown = cfg[section].showDown !== false;
            cfg[section].showUp = cfg[section].showUp !== false;
            cfg[section].side = cfg[section].side === "left" ? "left" : "right";
            cfg[section].horizontalOffsetPx = num(cfg[section].horizontalOffsetPx, 0, 500, DEFAULT_CONFIG[section].horizontalOffsetPx);
            cfg[section].downTopPx = num(cfg[section].downTopPx, 0, 500, DEFAULT_CONFIG[section].downTopPx);
            cfg[section].upBottomPx = num(cfg[section].upBottomPx, 0, 500, DEFAULT_CONFIG[section].upBottomPx);
            cfg[section].sizePx = num(cfg[section].sizePx, 28, 100, DEFAULT_CONFIG[section].sizePx);
        });
        cfg.mobile.breakpointPx = num(cfg.mobile.breakpointPx, 320, 1600, 768);

        cfg.appearance = merge(DEFAULT_CONFIG.appearance, object(cfg.appearance));
        cfg.appearance.backgroundColor = text(cfg.appearance.backgroundColor, "#408540");
        cfg.appearance.hoverBackgroundColor = text(cfg.appearance.hoverBackgroundColor, "#0056b3");
        cfg.appearance.iconColor = text(cfg.appearance.iconColor, "#ffffff");
        cfg.appearance.borderColor = text(cfg.appearance.borderColor, cfg.appearance.backgroundColor);
        cfg.appearance.borderWidthPx = num(cfg.appearance.borderWidthPx, 0, 12, 0);
        cfg.appearance.borderRadiusPercent = num(cfg.appearance.borderRadiusPercent, 0, 50, 50);
        cfg.appearance.opacity = num(cfg.appearance.opacity, 0.15, 1, 1);
        cfg.appearance.hoverScale = num(cfg.appearance.hoverScale, 1, 1.5, 1);
        cfg.appearance.shadowEnabled = cfg.appearance.shadowEnabled !== false;
        cfg.appearance.shadow = String(cfg.appearance.shadow || DEFAULT_CONFIG.appearance.shadow);
        cfg.appearance.iconMode = cfg.appearance.iconMode === "fontawesome" ? "fontawesome" : "symbol";
        cfg.appearance.downSymbol = String(cfg.appearance.downSymbol == null ? "▼" : cfg.appearance.downSymbol).slice(0, 8) || "▼";
        cfg.appearance.upSymbol = String(cfg.appearance.upSymbol == null ? "▲" : cfg.appearance.upSymbol).slice(0, 8) || "▲";
        cfg.appearance.downFaClass = text(cfg.appearance.downFaClass, "fa fa-arrow-down");
        cfg.appearance.upFaClass = text(cfg.appearance.upFaClass, "fa fa-arrow-up");
        cfg.appearance.iconSizePx = num(cfg.appearance.iconSizePx, 10, 48, 22);
        cfg.appearance.zIndex = Math.round(num(cfg.appearance.zIndex, 100, 200000, 10000));

        cfg.labels = merge(DEFAULT_CONFIG.labels, object(cfg.labels));
        Object.keys(DEFAULT_CONFIG.labels).forEach(function (key) {
            cfg.labels[key] = text(cfg.labels[key], DEFAULT_CONFIG.labels[key]);
        });

        cfg.advanced = merge(DEFAULT_CONFIG.advanced, object(cfg.advanced));
        cfg.advanced.repairResidualScrollLock = cfg.advanced.repairResidualScrollLock === true;
        cfg.advanced.repairCooldownMs = num(cfg.advanced.repairCooldownMs, 250, 10000, 1000);
        return cfg;
    }

    function language() {
        try {
            if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
                return window.PMKConfig.getLanguage() === "en" ? "en" : "fr";
            }
        } catch (_) {}
        return String(document.documentElement.lang || "fr").toLowerCase().indexOf("en") === 0 ? "en" : "fr";
    }

    function lines(value) {
        return String(value || "")
            .split(/\r?\n/)
            .map(function (line) { return line.trim(); })
            .filter(Boolean);
    }

    function wildcardMatch(value, pattern) {
        if (!pattern) return false;
        const escaped = pattern
            .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, ".*");
        try { return new RegExp("^" + escaped + "$").test(value); }
        catch (_) { return value === pattern; }
    }

    function pageAllowed(cfg) {
        if (!cfg.enabled) return false;
        if (cfg.pages.mode === "all") return true;
        const patterns = lines(cfg.pages.patterns);
        if (!patterns.length) return cfg.pages.mode !== "include";
        const current = window.location.pathname;
        const matched = patterns.some(function (pattern) { return wildcardMatch(current, pattern); });
        return cfg.pages.mode === "include" ? matched : !matched;
    }

    function getScrollElement() {
        return document.scrollingElement || document.documentElement || document.body;
    }

    function getScrollY() {
        const el = getScrollElement();
        return window.pageYOffset || (el && el.scrollTop) || 0;
    }

    function getMaxScrollTop() {
        const el = getScrollElement();
        if (!el) return 0;
        return Math.max(0, el.scrollHeight - el.clientHeight);
    }

    function blockingDialogs() {
        // Ne jamais utiliser [aria-modal="true"] seul : Koha/PMK peuvent conserver
        // dans le DOM des composants accessibles qui ne sont pas réellement ouverts.
        const selectors = [
            ".modal.show",
            ".modal.in",
            ".offcanvas.show",
            ".ui-dialog",
            ".pmk-shared-dialog-backdrop"
        ];
        const seen = new Set();
        const matches = [];
        selectors.forEach(function (selector) {
            Array.from(document.querySelectorAll(selector)).forEach(function (node) {
                if (!node || node === state.configHost || seen.has(node)) return;
                // Le panneau de configuration PMK ne doit jamais masquer la navigation rapide.
                if (node.closest && (node.closest(".pmk-config-overlay") || node.closest(".pmk-config-dialog") || node.closest("[data-pmk-config-root]"))) return;
                const style = window.getComputedStyle(node);
                if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) === 0) return;
                const rect = node.getBoundingClientRect();
                const intersectsViewport = rect.width > 1 && rect.height > 1 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
                if (!intersectsViewport) return;
                seen.add(node);
                matches.push(node);
            });
        });
        return matches;
    }

    function dialogIsVisible() {
        return blockingDialogs().length > 0;
    }

    function isMobile(cfg) {
        return window.innerWidth <= cfg.mobile.breakpointPx;
    }

    function responsiveConfig(cfg) {
        return isMobile(cfg) ? cfg.mobile : cfg.desktop;
    }

    function reducedMotion(cfg) {
        if (!cfg.behavior.respectReducedMotion || !window.matchMedia) return false;
        try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
        catch (_) { return false; }
    }

    function scrollToY(top) {
        const cfg = state.config || DEFAULT_CONFIG;
        const target = Math.max(0, Math.min(Number(top) || 0, getMaxScrollTop()));
        const smooth = cfg.behavior.smoothScroll && !reducedMotion(cfg);
        try {
            window.scrollTo({ top: target, behavior: smooth ? "smooth" : "auto" });
            return;
        } catch (_) {}
        try { window.scrollTo(0, target); }
        catch (_) {
            const el = getScrollElement();
            if (el) el.scrollTop = target;
        }
    }

    function iconMarkup(direction, cfg) {
        const a = cfg.appearance;
        if (a.iconMode === "fontawesome") {
            const cls = direction === "down" ? a.downFaClass : a.upFaClass;
            return '<i class="' + cls.replace(/[<>"']/g, "") + '" aria-hidden="true"></i>';
        }
        const symbol = direction === "down" ? a.downSymbol : a.upSymbol;
        const span = document.createElement("span");
        span.textContent = symbol;
        return '<span aria-hidden="true">' + span.innerHTML + '</span>';
    }

    function labels(cfg) {
        const lang = language();
        return {
            down: lang === "en" ? cfg.labels.downEn : cfg.labels.downFr,
            up: lang === "en" ? cfg.labels.upEn : cfg.labels.upFr
        };
    }

    function injectStyles(cfg) {
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement("style");
            style.id = STYLE_ID;
            document.head.appendChild(style);
        }
        const a = cfg.appearance;
        style.textContent = `
            .pmk106-scroll-wrap {
                position: fixed;
                z-index: ${a.zIndex};
                pointer-events: none;
            }
            .pmk106-scroll-btn {
                box-sizing: border-box;
                display: none;
                align-items: center;
                justify-content: center;
                padding: 0;
                margin: 0;
                background: ${a.backgroundColor};
                color: ${a.iconColor};
                border: ${a.borderWidthPx}px solid ${a.borderColor};
                border-radius: ${a.borderRadiusPercent}%;
                cursor: pointer;
                opacity: ${a.opacity};
                box-shadow: ${a.shadowEnabled ? a.shadow : "none"};
                line-height: 1;
                touch-action: manipulation;
                pointer-events: auto;
                transition: background-color .2s ease, opacity .2s ease, transform .15s ease, box-shadow .2s ease;
            }
            .pmk106-scroll-btn:hover,
            .pmk106-scroll-btn:focus-visible {
                background: ${a.hoverBackgroundColor};
                color: ${a.iconColor};
                transform: scale(${a.hoverScale});
            }
            .pmk106-scroll-btn:focus-visible {
                outline: 3px solid rgba(13,110,253,.35);
                outline-offset: 2px;
            }
            .pmk106-scroll-btn span,
            .pmk106-scroll-btn i {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: ${a.iconSizePx}px;
                line-height: 1;
                color: inherit;
                pointer-events: none;
            }
            #${CONFIG_HOST_ID} {
                position: fixed;
                z-index: ${a.zIndex + 1};
                display: none;
            }
            #${CONFIG_HOST_ID} .pmk-context-config {
                width: 24px;
                height: 24px;
                min-width: 24px;
                padding: 0 !important;
                margin: 0 !important;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                color: #495057;
                background: rgba(255,255,255,.88);
                border: 1px solid rgba(0,0,0,.14);
                box-shadow: 0 1px 4px rgba(0,0,0,.12);
                opacity: .28;
                pointer-events: auto;
                text-decoration: none;
            }
            #${CONFIG_HOST_ID}:hover .pmk-context-config,
            #${CONFIG_HOST_ID} .pmk-context-config:focus-visible { opacity: 1; }
            @media (prefers-reduced-motion: reduce) {
                .pmk106-scroll-btn { transition: none; }
            }
            @media print {
                .pmk106-scroll-wrap, #${CONFIG_HOST_ID} { display: none !important; }
            }
        `;
    }

    function ensureElements(cfg) {
        if (!document.body) return;
        injectStyles(cfg);

        let downWrap = document.getElementById(DOWN_WRAP_ID);
        if (!downWrap) {
            downWrap = document.createElement("div");
            downWrap.id = DOWN_WRAP_ID;
            downWrap.className = "pmk106-scroll-wrap";
            document.body.appendChild(downWrap);
        }
        let upWrap = document.getElementById(UP_WRAP_ID);
        if (!upWrap) {
            upWrap = document.createElement("div");
            upWrap.id = UP_WRAP_ID;
            upWrap.className = "pmk106-scroll-wrap";
            document.body.appendChild(upWrap);
        }

        let down = document.getElementById(DOWN_ID);
        if (!down) {
            down = document.createElement("button");
            down.type = "button";
            down.id = DOWN_ID;
            down.className = "pmk106-scroll-btn";
            down.addEventListener("click", function () {
                repairResidualScrollLock("click-down");
                scrollToY(getMaxScrollTop());
            });
            downWrap.appendChild(down);
        }

        let up = document.getElementById(UP_ID);
        if (!up) {
            up = document.createElement("button");
            up.type = "button";
            up.id = UP_ID;
            up.className = "pmk106-scroll-btn";
            up.addEventListener("click", function () {
                repairResidualScrollLock("click-up");
                scrollToY(0);
            });
            upWrap.appendChild(up);
        }

        let configHost = document.getElementById(CONFIG_HOST_ID);
        if (!configHost) {
            configHost = document.createElement("div");
            configHost.id = CONFIG_HOST_ID;
            document.body.appendChild(configHost);
        }

        state.downWrap = downWrap;
        state.upWrap = upWrap;
        state.down = down;
        state.up = up;
        state.configHost = configHost;
        refreshButtonContents(cfg);
        mountContextConfig();
    }

    function refreshButtonContents(cfg) {
        if (!state.down || !state.up) return;
        const copy = labels(cfg);
        state.down.title = copy.down;
        state.down.setAttribute("aria-label", copy.down);
        state.down.innerHTML = iconMarkup("down", cfg);
        state.up.title = copy.up;
        state.up.setAttribute("aria-label", copy.up);
        state.up.innerHTML = iconMarkup("up", cfg);
    }

    function positionElements(cfg) {
        if (!state.downWrap || !state.upWrap || !state.down || !state.up) return;
        const r = responsiveConfig(cfg);
        const size = r.sizePx + "px";
        [state.down, state.up].forEach(function (btn) {
            btn.style.width = size;
            btn.style.height = size;
        });

        [state.downWrap, state.upWrap].forEach(function (wrap) {
            wrap.style.left = "";
            wrap.style.right = "";
            wrap.style[r.side] = r.horizontalOffsetPx + "px";
        });
        state.downWrap.style.top = r.downTopPx + "px";
        state.downWrap.style.bottom = "";
        state.upWrap.style.bottom = r.upBottomPx + "px";
        state.upWrap.style.top = "";
    }

    function setButtonVisible(button, visible) {
        if (!button) return;
        button.style.setProperty("display", visible ? "flex" : "none", "important");
        button.setAttribute("aria-hidden", visible ? "false" : "true");
        button.tabIndex = visible ? 0 : -1;
    }

    function positionConfigHost(cfg, downVisible, upVisible) {
        const host = state.configHost;
        if (!host || !host.firstElementChild) return;
        if (!downVisible && !upVisible) {
            host.style.display = "none";
            return;
        }
        const r = responsiveConfig(cfg);
        const beside = Math.max(0, r.horizontalOffsetPx + r.sizePx - 10);
        host.style.display = "block";
        host.style.left = "";
        host.style.right = "";
        host.style.top = "";
        host.style.bottom = "";
        host.style[r.side] = beside + "px";
        if (upVisible) host.style.bottom = Math.max(0, r.upBottomPx + r.sizePx - 10) + "px";
        else host.style.top = Math.max(0, r.downTopPx + r.sizePx - 10) + "px";
    }

    function updateVisibility() {
        state.ticking = false;
        const cfg = state.config;
        if (!cfg || !pageAllowed(cfg) || !state.down || !state.up) return;

        positionElements(cfg);
        const r = responsiveConfig(cfg);
        const max = getMaxScrollTop();
        const y = getScrollY();
        const scrollable = max > Math.max(2, cfg.behavior.bottomEpsilonPx);
        const dialogHidden = cfg.behavior.hideWhenDialogOpen && dialogIsVisible();

        const downVisible = !dialogHidden && scrollable && r.showDown && y < max - cfg.behavior.bottomEpsilonPx;
        const upVisible = !dialogHidden && scrollable && r.showUp && y > cfg.behavior.upThresholdPx;
        setButtonVisible(state.down, downVisible);
        setButtonVisible(state.up, upVisible);
        positionConfigHost(cfg, downVisible, upVisible);
    }

    function scheduleUpdate() {
        if (state.ticking) return;
        state.ticking = true;
        window.requestAnimationFrame(updateVisibility);
    }

    function repairResidualScrollLock() {
        const cfg = state.config;
        if (!cfg || !cfg.advanced.repairResidualScrollLock) return;
        const now = Date.now();
        if (now - state.lastRepairTs < cfg.advanced.repairCooldownMs) return;
        if (dialogIsVisible()) return;

        const html = document.documentElement;
        const body = document.body;
        if (!html || !body) return;
        let changed = false;

        // Réparation volontairement prudente : uniquement les styles INLINE.
        // On ne retire ni classes Koha/Bootstrap ni règles CSS calculées.
        [html, body].forEach(function (node) {
            const overflow = String(node.style.overflow || "").toLowerCase();
            const overflowY = String(node.style.overflowY || "").toLowerCase();
            if (overflow === "hidden") { node.style.overflow = ""; changed = true; }
            if (overflowY === "hidden") { node.style.overflowY = ""; changed = true; }
        });
        if (String(body.style.position || "").toLowerCase() === "fixed") {
            body.style.position = "";
            body.style.top = "";
            body.style.left = "";
            body.style.right = "";
            body.style.width = "";
            changed = true;
        }
        if (changed) state.lastRepairTs = now;
    }

    function bindListeners() {
        if (state.abortController) state.abortController.abort();
        state.abortController = typeof AbortController === "function" ? new AbortController() : null;
        const signal = state.abortController ? { signal: state.abortController.signal } : undefined;

        window.addEventListener("scroll", scheduleUpdate, Object.assign({ passive: true }, signal || {}));
        window.addEventListener("resize", scheduleUpdate, Object.assign({ passive: true }, signal || {}));

        if (state.config && state.config.advanced.repairResidualScrollLock) {
            window.addEventListener("wheel", repairResidualScrollLock, Object.assign({ passive: true }, signal || {}));
            window.addEventListener("touchstart", repairResidualScrollLock, Object.assign({ passive: true }, signal || {}));
            window.addEventListener("keydown", function (event) {
                if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Spacebar"].includes(event.key)) {
                    repairResidualScrollLock();
                }
            }, signal || undefined);
        }

        if (state.resizeObserver) state.resizeObserver.disconnect();
        state.resizeObserver = null;
        if (typeof ResizeObserver === "function" && document.documentElement) {
            state.resizeObserver = new ResizeObserver(scheduleUpdate);
            try { state.resizeObserver.observe(document.documentElement); } catch (_) {}
            if (document.body) {
                try { state.resizeObserver.observe(document.body); } catch (_) {}
            }
        }
    }

    function mountContextConfig() {
        if (state.contextMounted || !state.configHost) return;
        try {
            const pmk = window.PMKConfig;
            if (!pmk || typeof pmk.mountContextButton !== "function") return;
            const button = pmk.mountContextButton({
                moduleId: MODULE_ID,
                anchor: state.configHost,
                contextKey: "quick-scroll",
                context: { sectionId: "visual" }
            });
            if (button) state.contextMounted = true;
        } catch (_) {}
    }

    function cleanup() {
        [DOWN_WRAP_ID, UP_WRAP_ID, CONFIG_HOST_ID, STYLE_ID].forEach(function (id) {
            const node = document.getElementById(id);
            if (node) node.remove();
        });
        if (state.abortController) state.abortController.abort();
        state.abortController = null;
        if (state.resizeObserver) state.resizeObserver.disconnect();
        state.resizeObserver = null;
        state.down = null;
        state.up = null;
        state.downWrap = null;
        state.upWrap = null;
        state.configHost = null;
        state.contextMounted = false;
    }

    function applyConfig(config) {
        const cfg = normalize(config);
        state.config = cfg;
        if (!pageAllowed(cfg)) {
            cleanup();
            state.config = cfg;
            return;
        }
        ensureElements(cfg);
        bindListeners();
        scheduleUpdate();
        registerVisualAdapter();
    }

    function previewButton(direction, cfg, size) {
        const btn = document.createElement("span");
        btn.style.display = "inline-flex";
        btn.style.alignItems = "center";
        btn.style.justifyContent = "center";
        btn.style.width = size + "px";
        btn.style.height = size + "px";
        btn.style.background = cfg.appearance.backgroundColor;
        btn.style.color = cfg.appearance.iconColor;
        btn.style.border = cfg.appearance.borderWidthPx + "px solid " + cfg.appearance.borderColor;
        btn.style.borderRadius = cfg.appearance.borderRadiusPercent + "%";
        btn.style.boxShadow = cfg.appearance.shadowEnabled ? cfg.appearance.shadow : "none";
        btn.style.opacity = String(cfg.appearance.opacity);
        btn.style.fontSize = Math.min(cfg.appearance.iconSizePx, size * 0.55) + "px";
        btn.style.lineHeight = "1";
        btn.style.boxSizing = "border-box";
        if (cfg.appearance.iconMode === "fontawesome") {
            const i = document.createElement("i");
            i.className = direction === "down" ? cfg.appearance.downFaClass : cfg.appearance.upFaClass;
            btn.appendChild(i);
        } else {
            btn.textContent = direction === "down" ? cfg.appearance.downSymbol : cfg.appearance.upSymbol;
        }
        return btn;
    }

    function registerVisualAdapter() {
        try {
            const visual = window.PMKConfig && window.PMKConfig.visualEditor;
            if (!visual || typeof visual.register !== "function") return;
            visual.register(MODULE_ID, {
                capabilities: { inlinePreview: true, livePreview: false, styleEyedropper: false },
                renderPreview: function (context) {
                    const cfg = normalize(context && context.rootObject ? context.rootObject : state.config || DEFAULT_CONFIG);
                    const wrap = document.createElement("div");
                    wrap.style.display = "flex";
                    wrap.style.alignItems = "center";
                    wrap.style.gap = "16px";
                    wrap.style.padding = "8px 4px";
                    const size = Math.max(34, Math.min(64, cfg.desktop.sizePx));
                    wrap.appendChild(previewButton("down", cfg, size));
                    wrap.appendChild(previewButton("up", cfg, size));
                    const note = document.createElement("span");
                    note.textContent = language() === "en" ? "Historical default appearance is fully editable." : "Rendu historique par défaut, entièrement personnalisable.";
                    note.style.color = "#6c757d";
                    note.style.fontSize = ".85rem";
                    wrap.appendChild(note);
                    return wrap;
                }
            });
        } catch (_) {}
    }

    function loadConfig() {
        const pmk = window.PMKConfig;
        if (!pmk || typeof pmk.getConfig !== "function") return Promise.resolve(clone(DEFAULT_CONFIG));
        return Promise.resolve(pmk.getConfig(MODULE_ID))
            .then(normalize)
            .catch(function () { return clone(DEFAULT_CONFIG); });
    }

    function runtimeDiagnostic() {
        const cfg = state.config || normalize(DEFAULT_CONFIG);
        const max = getMaxScrollTop();
        const y = getScrollY();
        const r = responsiveConfig(cfg);
        return {
            version: VERSION,
            loaded: true,
            pageAllowed: pageAllowed(cfg),
            enabled: cfg.enabled !== false,
            viewportWidth: window.innerWidth,
            mobileMode: window.innerWidth <= cfg.mobile.breakpointPx,
            showDown: !!r.showDown,
            showUp: !!r.showUp,
            scrollY: y,
            maxScrollTop: max,
            scrollable: max > Math.max(2, cfg.behavior.bottomEpsilonPx),
            dialogVisible: cfg.behavior.hideWhenDialogOpen && dialogIsVisible(),
            blockingDialogs: blockingDialogs().map(function (node) {
                return { tag: node.tagName, id: node.id || "", className: String(node.className || "") };
            }),
            downExists: !!state.down,
            upExists: !!state.up,
            downDisplay: state.down ? window.getComputedStyle(state.down).display : null,
            upDisplay: state.up ? window.getComputedStyle(state.up).display : null
        };
    }

    window.PMK106ScrollButtons = {
        version: VERSION,
        refresh: scheduleUpdate,
        diagnostic: runtimeDiagnostic
    };

    function start() {
        registerVisualAdapter();
        loadConfig().then(applyConfig);
        const pmk = window.PMKConfig;
        if (pmk && typeof pmk.subscribe === "function") {
            try { pmk.subscribe(MODULE_ID, applyConfig); } catch (_) {}
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();

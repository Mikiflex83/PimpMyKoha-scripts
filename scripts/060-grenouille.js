/*
 Nom du fichier : 060-grenouille.js
 Modules PMK :
   - Mascotte — Grenouilles  (mascot-frogs)
   - Mascotte — Agents       (mascot-agents)

 Version : 4.1.0-pmk-split-responsive
 Date    : 2026-09-19
 Auteur  : Michael Mundet / refactorisation PimpMyKoha

 Objectif :
 - conserver strictement les deux comportements historiques du 060 ;
 - les présenter comme deux modules PMK séparés ;
 - partager un seul moteur d'insertion pour éviter toute duplication ;
 - permettre de choisir visuellement l'emplacement avec le picker commun PMK ;
 - garder les emplacements historiques comme valeurs par défaut.

 Valeurs historiques conservées :
 1) Mascotte — Grenouilles
    - emplacement : après #logo ;
    - 8 images : grenouille2.png à grenouille9.png ;
    - clic sur l'image : joue un son aléatoire ;
    - 6 sons : SFB-frogs1.mp3 à SFB-frogs6.mp3.

 2) Mascotte — Agents
    - emplacement : au début de #header_search ;
    - 25 images : grenouilles1.png à grenouilles25.png ;
    - 25 noms historiques conservés ;
    - hauteur : 45 px ;
    - largeur : auto ;
    - le nom est affiché dans title au survol.

 Dépendance recommandée :
 - 000-pmk-config-firestore.js v0.4.43 ou ultérieur.
 - Le script reste fonctionnel avec ses valeurs historiques si le socle PMK
   n'est pas encore chargé.
*/

(function () {
    "use strict";

    const SCRIPT_GUARD = "__pmk060MascotsSplitV4";
    if (window[SCRIPT_GUARD]) return;
    window[SCRIPT_GUARD] = true;

    const VERSION = "4.1.0-pmk-split-responsive";
    const BASE_URL = "https://catalogue.example.org/userfiles/image/zPortailElems/grenouilles/";

    const FROG_MODULE_ID = "mascot-frogs";
    const AGENT_MODULE_ID = "mascot-agents";

    const ATTR_GENERATED = "data-pmk-060-mascot";
    const ATTR_MODULE = "data-pmk-060-module";

    const AGENT_NAMES = [
        "Valérie", "Sébastien", "Caroline", "Nathalie", "Michael",
        "Pascale", "Sara", "Nadja", "Solange", "Anita",
        "Zélia", "Nathalie", "Nour", "Isabelle T.", "Marion C.",
        "David", "Virginie", "Thibault", "Laure R.", "Mathieu",
        "Cécile", "Camille", "Gerard", "Hugo", "Alicia"
    ];

    const FROG_DEFAULTS = {
        enabled: true,
        pages: "*",
        locationSelector: "#logo",
        locationName: "Logo Koha",
        position: "after",
        altFr: "Grenouille",
        altEn: "Frog",
        imageHeight: 0,
        imageWidth: 0,
        responsiveEnabled: true,
        responsiveHideBelowPx: 640,
        responsiveFullSizeAtPx: 1100,
        responsiveMinScale: 0.65,
        soundEnabled: true,
        images: Array.from({ length: 8 }, function (_, i) {
            const n = i + 2;
            return {
                id: "grenouille-" + n,
                enabled: true,
                name: "Grenouille " + n,
                url: BASE_URL + "grenouille" + n + ".png"
            };
        }),
        sounds: Array.from({ length: 6 }, function (_, i) {
            const n = i + 1;
            return {
                id: "frog-sound-" + n,
                enabled: true,
                name: "Son grenouille " + n,
                url: BASE_URL + "SFB-frogs" + n + ".mp3"
            };
        })
    };

    const AGENT_DEFAULTS = {
        enabled: true,
        pages: "*",
        locationSelector: "#header_search",
        locationName: "Barre de recherche Koha",
        position: "inside-start",
        altFr: "Grenouille",
        altEn: "Frog",
        imageHeight: 45,
        imageWidth: 0,
        responsiveEnabled: true,
        responsiveHideBelowPx: 640,
        responsiveFullSizeAtPx: 1100,
        responsiveMinScale: 0.65,
        showNameOnHover: true,
        images: AGENT_NAMES.map(function (name, i) {
            const n = i + 1;
            return {
                id: "agent-" + n,
                enabled: true,
                name: name,
                url: BASE_URL + "grenouilles" + n + ".png"
            };
        })
    };

    const states = {
        [FROG_MODULE_ID]: {
            config: clone(FROG_DEFAULTS),
            selectedImageId: "",
            selectedImageUrl: "",
            observer: null,
            applyTimer: null,
            unsubscribe: null,
            registered: false
        },
        [AGENT_MODULE_ID]: {
            config: clone(AGENT_DEFAULTS),
            selectedImageId: "",
            selectedImageUrl: "",
            observer: null,
            applyTimer: null,
            unsubscribe: null,
            registered: false
        }
    };

    let coreWaitTimer = null;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function clean(value) {
        return String(value == null ? "" : value).trim();
    }

    function asBool(value, fallback) {
        if (value === undefined || value === null) return fallback;
        return value !== false;
    }

    function asNumber(value, fallback, min, max) {
        let n = Number(value);
        if (!Number.isFinite(n)) n = fallback;
        if (Number.isFinite(min)) n = Math.max(min, n);
        if (Number.isFinite(max)) n = Math.min(max, n);
        return n;
    }

    function language() {
        try {
            if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
                const lang = clean(window.PMKConfig.getLanguage()).toLowerCase();
                if (lang.startsWith("en")) return "en";
                if (lang.startsWith("fr")) return "fr";
            }
        } catch (_) {}
        const htmlLang = clean(document.documentElement.getAttribute("lang")).toLowerCase();
        return htmlLang.startsWith("en") ? "en" : "fr";
    }

    function t(fr, en) {
        return language() === "en" ? en : fr;
    }

    function normalizePages(value) {
        if (Array.isArray(value)) return value.map(clean).filter(Boolean);
        return String(value == null ? "*" : value)
            .split(/[\n,;]+/)
            .map(clean)
            .filter(Boolean);
    }

    function pageMatches(config) {
        const patterns = normalizePages(config && config.pages);
        if (!patterns.length) return false;
        const path = window.location.pathname;
        return patterns.some(function (pattern) {
            if (pattern === "*" || pattern.toLowerCase() === "all") return true;
            if (pattern.endsWith("*")) return path.startsWith(pattern.slice(0, -1));
            return path === pattern;
        });
    }

    function normalizeImage(item, fallback, index, prefix) {
        const src = item && typeof item === "object" ? item : {};
        const fb = fallback && typeof fallback === "object" ? fallback : {};
        return {
            id: clean(src.id) || clean(fb.id) || prefix + "-" + (index + 1),
            enabled: src.enabled !== false,
            name: Object.prototype.hasOwnProperty.call(src, "name") ? String(src.name || "") : String(fb.name || ""),
            url: Object.prototype.hasOwnProperty.call(src, "url") ? clean(src.url) : clean(fb.url)
        };
    }

    function normalizeImages(raw, fallback, prefix) {
        if (!Array.isArray(raw)) return clone(fallback);
        return raw.map(function (item, index) {
            return normalizeImage(item, fallback[index], index, prefix);
        });
    }

    function normalizeSound(item, fallback, index) {
        const src = item && typeof item === "object" ? item : {};
        const fb = fallback && typeof fallback === "object" ? fallback : {};
        return {
            id: clean(src.id) || clean(fb.id) || "sound-" + (index + 1),
            enabled: src.enabled !== false,
            name: Object.prototype.hasOwnProperty.call(src, "name") ? String(src.name || "") : String(fb.name || ""),
            url: Object.prototype.hasOwnProperty.call(src, "url") ? clean(src.url) : clean(fb.url)
        };
    }

    function normalizeFrogConfig(raw) {
        const src = raw && typeof raw === "object" ? raw : {};
        return {
            enabled: src.enabled !== false,
            pages: Object.prototype.hasOwnProperty.call(src, "pages") ? String(src.pages || "") : FROG_DEFAULTS.pages,
            locationSelector: clean(src.locationSelector) || FROG_DEFAULTS.locationSelector,
            locationName: Object.prototype.hasOwnProperty.call(src, "locationName") ? String(src.locationName || "") : FROG_DEFAULTS.locationName,
            position: ["before", "after", "inside-start", "inside-end"].includes(src.position) ? src.position : FROG_DEFAULTS.position,
            altFr: Object.prototype.hasOwnProperty.call(src, "altFr") ? String(src.altFr || "") : FROG_DEFAULTS.altFr,
            altEn: Object.prototype.hasOwnProperty.call(src, "altEn") ? String(src.altEn || "") : FROG_DEFAULTS.altEn,
            imageHeight: asNumber(src.imageHeight, FROG_DEFAULTS.imageHeight, 0, 1000),
            imageWidth: asNumber(src.imageWidth, FROG_DEFAULTS.imageWidth, 0, 1000),
            responsiveEnabled: src.responsiveEnabled !== false,
            responsiveHideBelowPx: asNumber(src.responsiveHideBelowPx, FROG_DEFAULTS.responsiveHideBelowPx, 320, 1200),
            responsiveFullSizeAtPx: asNumber(src.responsiveFullSizeAtPx, FROG_DEFAULTS.responsiveFullSizeAtPx, 641, 2500),
            responsiveMinScale: asNumber(src.responsiveMinScale, FROG_DEFAULTS.responsiveMinScale, 0.25, 1),
            soundEnabled: src.soundEnabled !== false,
            images: normalizeImages(src.images, FROG_DEFAULTS.images, "grenouille"),
            sounds: Array.isArray(src.sounds)
                ? src.sounds.map(function (item, index) { return normalizeSound(item, FROG_DEFAULTS.sounds[index], index); })
                : clone(FROG_DEFAULTS.sounds)
        };
    }

    function normalizeAgentConfig(raw) {
        const src = raw && typeof raw === "object" ? raw : {};
        return {
            enabled: src.enabled !== false,
            pages: Object.prototype.hasOwnProperty.call(src, "pages") ? String(src.pages || "") : AGENT_DEFAULTS.pages,
            locationSelector: clean(src.locationSelector) || AGENT_DEFAULTS.locationSelector,
            locationName: Object.prototype.hasOwnProperty.call(src, "locationName") ? String(src.locationName || "") : AGENT_DEFAULTS.locationName,
            position: ["before", "after", "inside-start", "inside-end"].includes(src.position) ? src.position : AGENT_DEFAULTS.position,
            altFr: Object.prototype.hasOwnProperty.call(src, "altFr") ? String(src.altFr || "") : AGENT_DEFAULTS.altFr,
            altEn: Object.prototype.hasOwnProperty.call(src, "altEn") ? String(src.altEn || "") : AGENT_DEFAULTS.altEn,
            imageHeight: asNumber(src.imageHeight, AGENT_DEFAULTS.imageHeight, 0, 1000),
            imageWidth: asNumber(src.imageWidth, AGENT_DEFAULTS.imageWidth, 0, 1000),
            responsiveEnabled: src.responsiveEnabled !== false,
            responsiveHideBelowPx: asNumber(src.responsiveHideBelowPx, AGENT_DEFAULTS.responsiveHideBelowPx, 320, 1200),
            responsiveFullSizeAtPx: asNumber(src.responsiveFullSizeAtPx, AGENT_DEFAULTS.responsiveFullSizeAtPx, 641, 2500),
            responsiveMinScale: asNumber(src.responsiveMinScale, AGENT_DEFAULTS.responsiveMinScale, 0.25, 1),
            showNameOnHover: src.showNameOnHover !== false,
            images: normalizeImages(src.images, AGENT_DEFAULTS.images, "agent")
        };
    }

    function normalizeFor(moduleId, raw) {
        return moduleId === FROG_MODULE_ID ? normalizeFrogConfig(raw) : normalizeAgentConfig(raw);
    }

    function activeItems(items) {
        return (Array.isArray(items) ? items : []).filter(function (item) {
            return item && item.enabled !== false && clean(item.url);
        });
    }

    function randomItem(items) {
        const list = activeItems(items);
        if (!list.length) return null;
        return list[Math.floor(Math.random() * list.length)];
    }

    function safeQuery(selector) {
        const value = clean(selector);
        if (!value) return null;
        try { return document.querySelector(value); } catch (_) { return null; }
    }

    function generatedSelector(moduleId) {
        return "[" + ATTR_GENERATED + "=\"1\"][" + ATTR_MODULE + "=\"" + moduleId + "\"]";
    }

    function currentGenerated(moduleId) {
        return document.querySelector(generatedSelector(moduleId));
    }

    function removeGenerated(moduleId) {
        document.querySelectorAll(generatedSelector(moduleId)).forEach(function (node) {
            try { node.remove(); } catch (_) {}
        });
    }

    function resetSelection(moduleId) {
        const state = states[moduleId];
        if (!state) return;
        state.selectedImageId = "";
        state.selectedImageUrl = "";
    }

    function selectedImage(moduleId, config) {
        const state = states[moduleId];
        if (!state) return null;

        const available = activeItems(config.images);
        if (!available.length) {
            resetSelection(moduleId);
            return null;
        }

        const existing = available.find(function (item) {
            return (state.selectedImageId && item.id === state.selectedImageId) ||
                   (state.selectedImageUrl && clean(item.url) === state.selectedImageUrl);
        });

        if (existing) return existing;

        const picked = available[Math.floor(Math.random() * available.length)];
        state.selectedImageId = clean(picked.id);
        state.selectedImageUrl = clean(picked.url);
        return picked;
    }

    function imageAlt(moduleId, config, item) {
        const configured = language() === "en" ? clean(config.altEn) : clean(config.altFr);
        if (configured) return configured;
        if (moduleId === AGENT_MODULE_ID && item && clean(item.name)) return clean(item.name);
        return moduleId === FROG_MODULE_ID ? t("Grenouille", "Frog") : t("Mascotte agent", "Staff mascot");
    }

    function applyDimensions(img, config) {
        if (!img) return;
        const h = Number(config.imageHeight);
        const w = Number(config.imageWidth);
        const responsive = config.responsiveEnabled !== false;
        const hideBelow = Number(config.responsiveHideBelowPx) || 640;
        const fullAt = Math.max(hideBelow + 1, Number(config.responsiveFullSizeAtPx) || 1100);
        const minScale = Math.max(0.25, Math.min(1, Number(config.responsiveMinScale) || 0.65));
        const viewport = Math.max(0, window.innerWidth || document.documentElement.clientWidth || fullAt);

        if (responsive && viewport <= hideBelow) {
            img.style.display = "none";
            return;
        }
        img.style.removeProperty("display");

        let scale = 1;
        if (responsive && viewport < fullAt) {
            const progress = (viewport - hideBelow) / (fullAt - hideBelow);
            scale = minScale + Math.max(0, Math.min(1, progress)) * (1 - minScale);
        }

        if (Number.isFinite(h) && h > 0) img.style.height = Math.max(1, Math.round(h * scale)) + "px";
        else {
            img.style.removeProperty("height");
            img.style.maxHeight = responsive ? Math.round(100 * scale) + "%" : "";
        }

        if (Number.isFinite(w) && w > 0) img.style.width = Math.max(1, Math.round(w * scale)) + "px";
        else if (Number.isFinite(h) && h > 0) img.style.width = "auto";
        else {
            img.style.removeProperty("width");
            img.style.transformOrigin = "center center";
            img.style.transform = responsive && scale < 0.999 ? "scale(" + scale.toFixed(3) + ")" : "";
        }
    }

    function insertAt(target, node, position) {
        if (!target || !node) return false;
        try {
            if (position === "before") {
                if (!target.parentNode) return false;
                target.parentNode.insertBefore(node, target);
                return true;
            }
            if (position === "after") {
                if (!target.parentNode) return false;
                target.parentNode.insertBefore(node, target.nextSibling);
                return true;
            }
            if (position === "inside-end") {
                target.appendChild(node);
                return true;
            }
            target.insertBefore(node, target.firstChild);
            return true;
        } catch (_) {
            return false;
        }
    }

    function playRandomFrogSound() {
        const cfg = states[FROG_MODULE_ID].config;
        if (!cfg || cfg.soundEnabled === false) return;
        const sound = randomItem(cfg.sounds);
        if (!sound || !clean(sound.url)) return;

        try {
            const audio = new Audio(clean(sound.url));
            const promise = audio.play();
            if (promise && typeof promise.catch === "function") promise.catch(function () {});
        } catch (_) {}
    }

    function buildMascot(moduleId, config, item) {
        const img = document.createElement("img");
        img.setAttribute(ATTR_GENERATED, "1");
        img.setAttribute(ATTR_MODULE, moduleId);
        img.src = clean(item.url);
        img.alt = imageAlt(moduleId, config, item);
        img.decoding = "async";

        applyDimensions(img, config);

        if (moduleId === FROG_MODULE_ID) {
            img.id = "grenouille-logo-060";
            img.style.cursor = config.soundEnabled === false ? "" : "pointer";
            img.addEventListener("click", playRandomFrogSound);
        } else {
            img.id = "grenouille-header-060";
            if (config.showNameOnHover !== false && clean(item.name)) {
                img.title = clean(item.name);
            }
        }

        return img;
    }

    function moduleShouldRun(moduleId, config) {
        return Boolean(config && config.enabled !== false && pageMatches(config));
    }

    function applyModule(moduleId) {
        const state = states[moduleId];
        if (!state) return;

        const config = state.config;
        const existing = currentGenerated(moduleId);

        if (!moduleShouldRun(moduleId, config)) {
            if (existing) removeGenerated(moduleId);
            return;
        }

        const target = safeQuery(config.locationSelector);
        if (!target) {
            if (existing && !existing.isConnected) removeGenerated(moduleId);
            return;
        }

        const item = selectedImage(moduleId, config);
        if (!item) {
            removeGenerated(moduleId);
            return;
        }

        if (existing && existing.isConnected) {
            const sameUrl = clean(existing.getAttribute("src")) === clean(item.url) ||
                (() => {
                    try {
                        return new URL(existing.src, window.location.origin).href === new URL(item.url, window.location.origin).href;
                    } catch (_) {
                        return false;
                    }
                })();

            if (sameUrl) {
                existing.alt = imageAlt(moduleId, config, item);
                applyDimensions(existing, config);

                if (moduleId === FROG_MODULE_ID) {
                    existing.style.cursor = config.soundEnabled === false ? "" : "pointer";
                } else if (config.showNameOnHover !== false && clean(item.name)) {
                    existing.title = clean(item.name);
                } else {
                    existing.removeAttribute("title");
                }

                return;
            }
        }

        removeGenerated(moduleId);
        const img = buildMascot(moduleId, config, item);
        insertAt(target, img, config.position);
    }

    function scheduleApply(moduleId) {
        const state = states[moduleId];
        if (!state) return;
        if (state.applyTimer) window.clearTimeout(state.applyTimer);
        state.applyTimer = window.setTimeout(function () {
            state.applyTimer = null;
            applyModule(moduleId);
            mountContextButton(moduleId);
        }, 40);
    }

    function applyConfig(moduleId, config, options) {
        const state = states[moduleId];
        if (!state) return;
        state.config = normalizeFor(moduleId, config);

        if (!options || options.resetSelection !== false) {
            resetSelection(moduleId);
        }

        scheduleApply(moduleId);
    }

    function startObserver(moduleId) {
        const state = states[moduleId];
        if (!state || state.observer) return;

        state.observer = new MutationObserver(function (mutations) {
            let relevant = false;
            for (const mutation of mutations) {
                if (mutation.type !== "childList") continue;

                const changedGenerated = Array.from(mutation.addedNodes || []).concat(Array.from(mutation.removedNodes || []))
                    .some(function (node) {
                        return node && node.nodeType === 1 &&
                            ((node.matches && node.matches(generatedSelector(moduleId))) ||
                             (node.querySelector && node.querySelector(generatedSelector(moduleId))));
                    });

                if (!changedGenerated) {
                    relevant = true;
                    break;
                }
            }
            if (relevant) scheduleApply(moduleId);
        });

        state.observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    function targetNameFromCandidate(candidate) {
        if (!candidate || candidate.nodeType !== 1) return "";
        return clean(candidate.getAttribute("aria-label")) ||
            clean(candidate.getAttribute("title")) ||
            clean(candidate.textContent).slice(0, 100) ||
            candidate.id ||
            candidate.tagName.toLowerCase();
    }

    function pickerFor(moduleId, context) {
        const picker = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!picker || typeof picker.pickForConfig !== "function") {
            return Promise.reject(new Error("pmk_common_picker_unavailable"));
        }

        return picker.pickForConfig({
            moduleId: moduleId,
            targetUrl: window.location.pathname + window.location.search,
            rootObject: context && context.rootObject ? context.rootObject : {},
            fieldPath: context && Array.isArray(context.fieldPath) ? context.fieldPath.slice() : [],
            persistAfterPick: false,
            adminContext: {
                sectionId: "placement"
            },
            options: {
                bannerText: t(
                    "Clique sur l’emplacement de la mascotte — Échap annule",
                    "Click the mascot location — Esc cancels"
                )
            }
        });
    }

    function onLocationPick(rootObject, fieldPath, result) {
        if (!rootObject || !result) return;
        rootObject.locationName = String(result.targetName || result.selector || "");
    }

    function registerPickerAdapter(moduleId) {
        const picker = window.PMKConfig && window.PMKConfig.elementPicker;
        if (!picker || typeof picker.register !== "function") return false;

        picker.register(moduleId, {
            buildResult: function (candidate, result) {
                result.targetName = targetNameFromCandidate(candidate);
                return result;
            },
            applyPending: function (draft, pending, picked) {
                if (draft && picked) draft.locationName = String(picked.targetName || picked.selector || "");
                return draft;
            }
        });

        return true;
    }

    function newFrogImage() {
        return {
            id: "grenouille-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
            enabled: true,
            name: "",
            url: ""
        };
    }

    function newAgentImage() {
        return {
            id: "agent-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
            enabled: true,
            name: "",
            url: ""
        };
    }

    function newSound() {
        return {
            id: "frog-sound-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
            enabled: true,
            name: "",
            url: ""
        };
    }

    function itemTitle(item, index, lang, fallbackFr, fallbackEn) {
        const name = clean(item && item.name);
        if (name) return name;
        const n = index + 1;
        return lang === "en" ? fallbackEn + " " + n : fallbackFr + " " + n;
    }

    function commonPlacementFields(moduleId, defaultDescriptionFr, defaultDescriptionEn) {
        return [
            {
                key: "pages",
                type: "textarea",
                rows: 2,
                label: { fr: "Pages Koha concernées", en: "Koha pages" },
                help: {
                    fr: "Par défaut « * » : la mascotte s’affiche partout où son emplacement existe. Une page par ligne si tu veux limiter son périmètre.",
                    en: "Default “*”: the mascot appears wherever its target exists. Use one path per line to restrict its scope."
                }
            },
            {
                key: "locationSelector",
                type: "elementPicker",
                label: { fr: "Emplacement", en: "Location" },
                pickLabel: { fr: "Choisir sur la page", en: "Choose on page" },
                emptyLabel: { fr: "Aucun emplacement sélectionné", en: "No location selected" },
                allowManual: true,
                pick: function (context) { return pickerFor(moduleId, context); },
                onPick: onLocationPick,
                help: {
                    fr: defaultDescriptionFr,
                    en: defaultDescriptionEn
                }
            },
            {
                key: "locationName",
                type: "readonly",
                advanced: true,
                label: { fr: "Emplacement détecté", en: "Detected location" }
            },
            {
                key: "position",
                type: "select",
                label: { fr: "Position dans l’emplacement", en: "Position at location" },
                options: [
                    { value: "before", label: { fr: "Avant l’élément choisi", en: "Before selected element" } },
                    { value: "after", label: { fr: "Après l’élément choisi", en: "After selected element" } },
                    { value: "inside-start", label: { fr: "À l’intérieur, au début", en: "Inside, at start" } },
                    { value: "inside-end", label: { fr: "À l’intérieur, à la fin", en: "Inside, at end" } }
                ]
            }
        ];
    }

    function validateCommon(config, kindLabel) {
        const errors = [];
        if (!clean(config.locationSelector)) {
            errors.push(kindLabel + " : emplacement manquant.");
        }

        const ids = new Set();
        (config.images || []).forEach(function (item, index) {
            if (!item || item.enabled === false) return;
            const id = clean(item.id);
            if (!id) errors.push(kindLabel + " : image " + (index + 1) + " sans identifiant.");
            else if (ids.has(id)) errors.push(kindLabel + " : identifiant d’image dupliqué : " + id);
            else ids.add(id);
            if (!clean(item.url)) errors.push(kindLabel + " : image active " + (index + 1) + " sans URL.");
        });

        return errors;
    }

    function validateFrogs(config) {
        const cfg = normalizeFrogConfig(config);
        const errors = validateCommon(cfg, "Mascotte grenouilles");

        const soundIds = new Set();
        (cfg.sounds || []).forEach(function (item, index) {
            if (!item || item.enabled === false) return;
            const id = clean(item.id);
            if (!id) errors.push("Mascotte grenouilles : son " + (index + 1) + " sans identifiant.");
            else if (soundIds.has(id)) errors.push("Mascotte grenouilles : identifiant de son dupliqué : " + id);
            else soundIds.add(id);
            if (!clean(item.url)) errors.push("Mascotte grenouilles : son actif " + (index + 1) + " sans URL.");
        });

        return errors;
    }

    function validateAgents(config) {
        return validateCommon(normalizeAgentConfig(config), "Mascotte agents");
    }

    function frogDefinition() {
        return {
            id: FROG_MODULE_ID,
            schemaVersion: 1,
            name: { fr: "Mascotte — Grenouilles", en: "Mascot — Frogs" },
            description: {
                fr: "Affiche aléatoirement une grenouille dans l’interface Koha et peut jouer un son au clic. Les huit images et les six sons historiques du 060 sont conservés par défaut.",
                en: "Randomly displays a frog in Koha and can play a sound on click. The eight historical images and six sounds from script 060 are preserved by default."
            },
            category: { fr: "Interface / ambiance", en: "Interface / ambience" },
            supportedPages: ["*"],
            prerequisites: [],
            dependencies: [],
            defaults: clone(FROG_DEFAULTS),
            normalize: normalizeFrogConfig,
            validate: validateFrogs,
            schema: [
                {
                    type: "section",
                    id: "general",
                    label: { fr: "Fonctionnement", en: "Behaviour" },
                    description: {
                        fr: "Le préréglage reproduit strictement le comportement historique : une image choisie parmi grenouille2.png à grenouille9.png est insérée après le logo Koha ; un clic joue aléatoirement l’un des six sons SFB-frogs1.mp3 à SFB-frogs6.mp3.",
                        en: "The preset strictly reproduces the historical behaviour: one image from grenouille2.png to grenouille9.png is inserted after the Koha logo; clicking it randomly plays one of the six SFB-frogs1.mp3 to SFB-frogs6.mp3 sounds."
                    },
                    fields: [
                        { key: "enabled", type: "boolean", label: { fr: "Module actif", en: "Module enabled" } },
                        { key: "soundEnabled", type: "boolean", label: { fr: "Jouer un son au clic", en: "Play sound on click" } }
                    ]
                },
                {
                    type: "section",
                    id: "placement",
                    label: { fr: "Emplacement", en: "Location" },
                    description: {
                        fr: "L’emplacement historique reste sélectionné par défaut. Le bouton « Choisir sur la page » permet d’utiliser le moteur de pick commun PMK sans avoir à connaître un sélecteur CSS.",
                        en: "The historical location remains selected by default. “Choose on page” uses the shared PMK picker without requiring CSS selector knowledge."
                    },
                    fields: commonPlacementFields(
                        FROG_MODULE_ID,
                        "Valeur historique : #logo, avec insertion après le logo.",
                        "Historical value: #logo, inserted after the logo."
                    )
                },
                {
                    type: "section",
                    id: "appearance",
                    label: { fr: "Affichage", en: "Display" },
                    fields: [
                        {
                            key: "imageHeight",
                            type: "number",
                            min: 0,
                            max: 1000,
                            label: { fr: "Hauteur forcée (px)", en: "Forced height (px)" },
                            help: {
                                fr: "0 = taille naturelle, comme dans le 060 historique.",
                                en: "0 = natural size, matching the historical 060."
                            }
                        },
                        {
                            key: "imageWidth",
                            type: "number",
                            min: 0,
                            max: 1000,
                            label: { fr: "Largeur forcée (px)", en: "Forced width (px)" },
                            help: { fr: "0 = largeur naturelle.", en: "0 = natural width." }
                        },
                        { key: "responsiveEnabled", type: "boolean", label: { fr: "Adapter la taille à l’écran", en: "Scale with screen size" } },
                        { key: "responsiveHideBelowPx", type: "number", min: 320, max: 1200, label: { fr: "Masquer sous cette largeur (px)", en: "Hide below this width (px)" }, help: { fr: "Valeur par défaut : 640 px. Les mascottes sont entièrement masquées sur petit écran/mobile.", en: "Default: 640 px. Mascots are fully hidden on small/mobile screens." } },
                        { key: "responsiveFullSizeAtPx", type: "number", min: 641, max: 2500, label: { fr: "Taille historique atteinte à partir de (px)", en: "Reach historical size from (px)" }, help: { fr: "La taille diminue progressivement entre le seuil mobile et cette largeur.", en: "Size decreases progressively between the mobile threshold and this width." } },
                        { key: "responsiveMinScale", type: "number", min: 0.25, max: 1, step: 0.05, label: { fr: "Échelle minimale avant masquage", en: "Minimum scale before hiding" } },
                        { key: "altFr", type: "text", label: { fr: "Texte alternatif français", en: "French alt text" } },
                        { key: "altEn", type: "text", label: { fr: "Texte alternatif anglais", en: "English alt text" } }
                    ]
                },
                {
                    type: "section",
                    id: "images",
                    label: { fr: "Grenouilles", en: "Frogs" },
                    description: {
                        fr: "Les huit URL historiques sont préchargées. Tu peux en ajouter, en retirer ou en désactiver sans limite arbitraire.",
                        en: "The eight historical URLs are preloaded. You may add, remove or disable entries without an arbitrary limit."
                    },
                    fields: [
                        {
                            key: "images",
                            type: "repeater",
                            label: { fr: "Images disponibles", en: "Available images" },
                            addLabel: { fr: "Ajouter une grenouille", en: "Add a frog" },
                            reorder: true,
                            removable: true,
                            newItem: newFrogImage,
                            itemTitle: function (item, index, lang) {
                                return itemTitle(item, index, lang, "Grenouille", "Frog");
                            },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Image active", en: "Image enabled" } },
                                { key: "name", type: "text", label: { fr: "Nom", en: "Name" } },
                                { key: "url", type: "text", label: { fr: "URL de l’image", en: "Image URL" } },
                                { key: "id", type: "text", advanced: true, label: { fr: "Identifiant", en: "Identifier" } }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "sounds",
                    label: { fr: "Sons", en: "Sounds" },
                    description: {
                        fr: "Les six sons historiques sont préchargés et restent tous actifs par défaut.",
                        en: "The six historical sounds are preloaded and all remain enabled by default."
                    },
                    fields: [
                        {
                            key: "sounds",
                            type: "repeater",
                            label: { fr: "Sons disponibles", en: "Available sounds" },
                            addLabel: { fr: "Ajouter un son", en: "Add a sound" },
                            reorder: true,
                            removable: true,
                            newItem: newSound,
                            itemTitle: function (item, index, lang) {
                                return itemTitle(item, index, lang, "Son", "Sound");
                            },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Son actif", en: "Sound enabled" } },
                                { key: "name", type: "text", label: { fr: "Nom", en: "Name" } },
                                { key: "url", type: "text", label: { fr: "URL du son", en: "Sound URL" } },
                                { key: "id", type: "text", advanced: true, label: { fr: "Identifiant", en: "Identifier" } }
                            ]
                        }
                    ]
                }
            ]
        };
    }

    function agentDefinition() {
        return {
            id: AGENT_MODULE_ID,
            schemaVersion: 1,
            name: { fr: "Mascotte — Agents", en: "Mascot — Staff" },
            description: {
                fr: "Affiche aléatoirement une mascotte agent dans la barre de recherche Koha. Les 25 images, les 25 noms et la hauteur historique de 45 px sont conservés par défaut.",
                en: "Randomly displays a staff mascot in the Koha search header. The 25 historical images, 25 names and historical 45 px height are preserved by default."
            },
            category: { fr: "Interface / ambiance", en: "Interface / ambience" },
            supportedPages: ["*"],
            prerequisites: [],
            dependencies: [],
            defaults: clone(AGENT_DEFAULTS),
            normalize: normalizeAgentConfig,
            validate: validateAgents,
            schema: [
                {
                    type: "section",
                    id: "general",
                    label: { fr: "Fonctionnement", en: "Behaviour" },
                    description: {
                        fr: "Le préréglage reproduit strictement le comportement historique : une image choisie parmi grenouilles1.png à grenouilles25.png est insérée au début de #header_search, avec son nom historique en infobulle et une hauteur de 45 px.",
                        en: "The preset strictly reproduces the historical behaviour: one image from grenouilles1.png to grenouilles25.png is inserted at the start of #header_search, with its historical name as a tooltip and a height of 45 px."
                    },
                    fields: [
                        { key: "enabled", type: "boolean", label: { fr: "Module actif", en: "Module enabled" } },
                        { key: "showNameOnHover", type: "boolean", label: { fr: "Afficher le nom au survol", en: "Show name on hover" } }
                    ]
                },
                {
                    type: "section",
                    id: "placement",
                    label: { fr: "Emplacement", en: "Location" },
                    description: {
                        fr: "L’emplacement historique reste sélectionné par défaut. Le picker commun permet de choisir un autre élément Koha.",
                        en: "The historical location remains selected by default. The shared picker can select another Koha element."
                    },
                    fields: commonPlacementFields(
                        AGENT_MODULE_ID,
                        "Valeur historique : #header_search, avec insertion à l’intérieur au début.",
                        "Historical value: #header_search, inserted inside at the start."
                    )
                },
                {
                    type: "section",
                    id: "appearance",
                    label: { fr: "Affichage", en: "Display" },
                    fields: [
                        {
                            key: "imageHeight",
                            type: "number",
                            min: 0,
                            max: 1000,
                            label: { fr: "Hauteur (px)", en: "Height (px)" },
                            help: {
                                fr: "Valeur historique : 45 px. 0 = taille naturelle.",
                                en: "Historical value: 45 px. 0 = natural size."
                            }
                        },
                        {
                            key: "imageWidth",
                            type: "number",
                            min: 0,
                            max: 1000,
                            label: { fr: "Largeur forcée (px)", en: "Forced width (px)" },
                            help: {
                                fr: "0 = largeur automatique, comportement historique.",
                                en: "0 = automatic width, matching historical behaviour."
                            }
                        },
                        { key: "responsiveEnabled", type: "boolean", label: { fr: "Adapter la taille à l’écran", en: "Scale with screen size" } },
                        { key: "responsiveHideBelowPx", type: "number", min: 320, max: 1200, label: { fr: "Masquer sous cette largeur (px)", en: "Hide below this width (px)" }, help: { fr: "Valeur par défaut : 640 px. Les mascottes sont entièrement masquées sur petit écran/mobile.", en: "Default: 640 px. Mascots are fully hidden on small/mobile screens." } },
                        { key: "responsiveFullSizeAtPx", type: "number", min: 641, max: 2500, label: { fr: "Taille historique atteinte à partir de (px)", en: "Reach historical size from (px)" } },
                        { key: "responsiveMinScale", type: "number", min: 0.25, max: 1, step: 0.05, label: { fr: "Échelle minimale avant masquage", en: "Minimum scale before hiding" } },
                        { key: "altFr", type: "text", label: { fr: "Texte alternatif français", en: "French alt text" } },
                        { key: "altEn", type: "text", label: { fr: "Texte alternatif anglais", en: "English alt text" } }
                    ]
                },
                {
                    type: "section",
                    id: "agents",
                    label: { fr: "Mascottes agents", en: "Staff mascots" },
                    description: {
                        fr: "Les 25 couples image/nom historiques sont préchargés. Le nom reste attaché à son image : supprimer ou déplacer une ligne ne peut donc plus décaler les correspondances.",
                        en: "The 25 historical image/name pairs are preloaded. Each name stays attached to its image, so removing or moving a row cannot shift the mapping."
                    },
                    fields: [
                        {
                            key: "images",
                            type: "repeater",
                            label: { fr: "Agents disponibles", en: "Available staff mascots" },
                            addLabel: { fr: "Ajouter une mascotte agent", en: "Add a staff mascot" },
                            reorder: true,
                            removable: true,
                            newItem: newAgentImage,
                            itemTitle: function (item, index, lang) {
                                return itemTitle(item, index, lang, "Agent", "Staff mascot");
                            },
                            fields: [
                                { key: "enabled", type: "boolean", label: { fr: "Mascotte active", en: "Mascot enabled" } },
                                { key: "name", type: "text", label: { fr: "Nom de l’agent", en: "Staff name" } },
                                { key: "url", type: "text", label: { fr: "URL de l’image", en: "Image URL" } },
                                { key: "id", type: "text", advanced: true, label: { fr: "Identifiant", en: "Identifier" } }
                            ]
                        }
                    ]
                }
            ]
        };
    }

    function contextAnchor(moduleId) {
        const generated = currentGenerated(moduleId);
        if (generated && generated.isConnected) return generated;

        const cfg = states[moduleId] && states[moduleId].config;
        if (cfg) {
            const target = safeQuery(cfg.locationSelector);
            if (target) return target;
        }
        return null;
    }

    function mountContextButton(moduleId) {
        const api = window.PMKConfig;
        if (!api || typeof api.mountContextButton !== "function") return;

        const anchor = contextAnchor(moduleId);
        if (!anchor) return;

        try {
            api.mountContextButton({
                moduleId: moduleId,
                anchor: anchor,
                position: "after",
                contextKey: "060-" + moduleId + "-" + window.location.pathname,
                context: { sectionId: "placement" }
            });
        } catch (_) {}
    }

    async function loadModuleConfig(moduleId) {
        const api = window.PMKConfig;
        const defaults = moduleId === FROG_MODULE_ID ? FROG_DEFAULTS : AGENT_DEFAULTS;
        if (!api || typeof api.getConfig !== "function") return clone(defaults);

        try {
            const value = await api.getConfig(moduleId);
            return normalizeFor(moduleId, value || defaults);
        } catch (_) {
            return clone(defaults);
        }
    }

    function definitionFor(moduleId) {
        return moduleId === FROG_MODULE_ID ? frogDefinition() : agentDefinition();
    }

    function registerModule(moduleId) {
        const api = window.PMKConfig;
        if (!api || typeof api.registerModule !== "function") return false;

        const state = states[moduleId];
        if (!state) return false;

        registerPickerAdapter(moduleId);

        if (!state.registered) {
            api.registerModule(definitionFor(moduleId));
            state.registered = true;
        }
        return true;
    }

    async function startModuleWithCore(moduleId) {
        if (!registerModule(moduleId)) return false;

        const state = states[moduleId];
        const cfg = await loadModuleConfig(moduleId);
        applyConfig(moduleId, cfg, { resetSelection: true });
        startObserver(moduleId);
        mountContextButton(moduleId);

        if (!state.unsubscribe && typeof window.PMKConfig.subscribe === "function") {
            state.unsubscribe = window.PMKConfig.subscribe(moduleId, function (next) {
                applyConfig(moduleId, next || (moduleId === FROG_MODULE_ID ? FROG_DEFAULTS : AGENT_DEFAULTS), {
                    resetSelection: true
                });
                startObserver(moduleId);
                mountContextButton(moduleId);
            });
        }

        return true;
    }

    function startWithoutCore() {
        applyConfig(FROG_MODULE_ID, FROG_DEFAULTS, { resetSelection: true });
        applyConfig(AGENT_MODULE_ID, AGENT_DEFAULTS, { resetSelection: true });
        startObserver(FROG_MODULE_ID);
        startObserver(AGENT_MODULE_ID);

        let attempts = 0;
        if (coreWaitTimer) window.clearInterval(coreWaitTimer);

        coreWaitTimer = window.setInterval(function () {
            attempts += 1;
            if (window.PMKConfig && typeof window.PMKConfig.registerModule === "function") {
                window.clearInterval(coreWaitTimer);
                coreWaitTimer = null;
                startModuleWithCore(FROG_MODULE_ID);
                startModuleWithCore(AGENT_MODULE_ID);
            } else if (attempts >= 100) {
                window.clearInterval(coreWaitTimer);
                coreWaitTimer = null;
            }
        }, 100);
    }

    function init() {
        if (window.PMKConfig && typeof window.PMKConfig.registerModule === "function") {
            startModuleWithCore(FROG_MODULE_ID);
            startModuleWithCore(AGENT_MODULE_ID);
        } else {
            startWithoutCore();
        }

        window.setTimeout(function () {
            scheduleApply(FROG_MODULE_ID);
            scheduleApply(AGENT_MODULE_ID);
        }, 300);

        window.setTimeout(function () {
            scheduleApply(FROG_MODULE_ID);
            scheduleApply(AGENT_MODULE_ID);
        }, 1200);

        let resizeTimer = null;
        window.addEventListener("resize", function () {
            if (resizeTimer) window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(function () {
                scheduleApply(FROG_MODULE_ID);
                scheduleApply(AGENT_MODULE_ID);
            }, 100);
        });
    }

    window.PMK060Mascots = {
        version: VERSION,
        modules: {
            frogs: {
                id: FROG_MODULE_ID,
                defaults: clone(FROG_DEFAULTS),
                normalize: normalizeFrogConfig,
                apply: function (config) { applyConfig(FROG_MODULE_ID, config, { resetSelection: true }); },
                reapply: function () { scheduleApply(FROG_MODULE_ID); }
            },
            agents: {
                id: AGENT_MODULE_ID,
                defaults: clone(AGENT_DEFAULTS),
                normalize: normalizeAgentConfig,
                apply: function (config) { applyConfig(AGENT_MODULE_ID, config, { resetSelection: true }); },
                reapply: function () { scheduleApply(AGENT_MODULE_ID); }
            }
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();

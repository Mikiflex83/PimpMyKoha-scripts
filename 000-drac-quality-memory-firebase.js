/* ============================================================
   PimpMyKoha - Pré-plugin - Configuration commune des modules
   Fichier : 000-pmk-config-firestore.js
   Version : 0.3.0

   Rôle :
   - registre commun des modules isolés ;
   - lecture/écriture des configurations dans Firestore ;
   - valeurs par défaut si Firestore est indisponible ;
   - interface d'administration commune, responsive et discrète ;
   - accès global discret depuis le menu utilisateur Koha ;
   - raccourcis contextuels vers une configuration unique par module.

   IMPORTANT :
   - Firestore est provisoire avant intégration au plugin PimpMyKoha ;
   - la logique métier des modules ne dépend pas directement de Firebase ;
   - le contrôle d'affichage de l'administration côté Koha n'est PAS une
     sécurité Firestore. Les règles Firestore restent l'autorité réelle.
   ============================================================ */

(function () {
    "use strict";

    if (window.PMKConfig) return;

    const CORE_VERSION = "0.3.0";
    const FIREBASE_SDK_VERSION = "12.19.0";
    const FIREBASE_APP_NAME = "pmk-preplugin";
    const FIRESTORE_COLLECTION = "pimpmykoha_preplugin_modules";

    /*
     * Projet Firebase provisoire déjà utilisé pendant la phase isolée.
     * Peut être remplacé AVANT le chargement de ce fichier par :
     * window.PMK_FIREBASE_CONFIG = { ... };
     */
    const DEFAULT_FIREBASE_CONFIG = {
        apiKey: "YOUR_FIREBASE_APIKEY",
        authDomain: "YOUR_FIREBASE_AUTHDOMAIN",
        projectId: "YOUR_FIREBASE_PROJECTID",
        storageBucket: "YOUR_FIREBASE_STORAGEBUCKET",
        messagingSenderId: "YOUR_FIREBASE_MESSAGINGSENDERID",
        appId: "YOUR_FIREBASE_APPID"
    };

    const firebaseConfig = Object.assign(
        {},
        DEFAULT_FIREBASE_CONFIG,
        window.PMK_FIREBASE_CONFIG || {}
    );

    const modules = new Map();
    const cache = new Map();
    const status = new Map();
    const listeners = new Map();

    let firebaseReadyPromise = null;
    let adminGuard = function () { return true; };
    let adminState = null;

    function deepClone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function isPlainObject(value) {
        return value && typeof value === "object" && !Array.isArray(value);
    }

    function deepMerge(base, override) {
        if (Array.isArray(base)) {
            return Array.isArray(override) ? deepClone(override) : deepClone(base);
        }
        if (!isPlainObject(base)) {
            return override === undefined ? deepClone(base) : deepClone(override);
        }

        const out = deepClone(base) || {};
        if (!isPlainObject(override)) return out;

        Object.keys(override).forEach(function (key) {
            if (Array.isArray(override[key])) {
                out[key] = deepClone(override[key]);
            } else if (isPlainObject(override[key]) && isPlainObject(out[key])) {
                out[key] = deepMerge(out[key], override[key]);
            } else {
                out[key] = deepClone(override[key]);
            }
        });
        return out;
    }

    function detectLanguage() {
        const htmlLang = (document.documentElement.getAttribute("lang") || "").toLowerCase();
        if (htmlLang.startsWith("fr")) return "fr";
        if (htmlLang.startsWith("en")) return "en";

        const navLang = (navigator.language || "").toLowerCase();
        if (navLang.startsWith("fr")) return "fr";
        return "en";
    }

    function text(value, lang) {
        const currentLang = lang || detectLanguage();
        if (value === null || value === undefined) return "";
        if (typeof value === "string") return value;
        if (typeof value === "object") {
            return value[currentLang] || value.fr || value.en || "";
        }
        return String(value);
    }

    function escapeHtml(value) {
        return String(value === undefined || value === null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function safeId(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "");
    }

    function fireStatus(moduleId, patch) {
        const current = status.get(moduleId) || {};
        const next = Object.assign({}, current, patch || {});
        status.set(moduleId, next);
        return next;
    }

    function notify(moduleId, config) {
        const set = listeners.get(moduleId);
        if (!set) return;
        set.forEach(function (callback) {
            try {
                callback(deepClone(config));
            } catch (_) {
                /* volontairement silencieux en production */
            }
        });
    }

    function loadScriptOnce(src, id) {
        return new Promise(function (resolve, reject) {
            const existing = document.getElementById(id);
            if (existing) {
                if (existing.dataset.pmkLoaded === "1") {
                    resolve();
                    return;
                }
                existing.addEventListener("load", resolve, { once: true });
                existing.addEventListener("error", reject, { once: true });
                return;
            }

            const script = document.createElement("script");
            script.id = id;
            script.src = src;
            script.async = true;
            script.addEventListener("load", function () {
                script.dataset.pmkLoaded = "1";
                resolve();
            }, { once: true });
            script.addEventListener("error", reject, { once: true });
            document.head.appendChild(script);
        });
    }

    async function ensureFirebase() {
        if (firebaseReadyPromise) return firebaseReadyPromise;

        firebaseReadyPromise = (async function () {
            if (!window.firebase || typeof window.firebase.initializeApp !== "function") {
                await loadScriptOnce(
                    "https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION + "/firebase-app-compat.js",
                    "pmk-firebase-app-compat"
                );
            }

            if (!window.firebase || typeof window.firebase.firestore !== "function") {
                await loadScriptOnce(
                    "https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION + "/firebase-firestore-compat.js",
                    "pmk-firebase-firestore-compat"
                );
            }

            if (!window.firebase || typeof window.firebase.initializeApp !== "function") {
                throw new Error("firebase_unavailable");
            }

            let app = null;
            if (Array.isArray(window.firebase.apps)) {
                app = window.firebase.apps.find(function (candidate) {
                    return candidate && candidate.name === FIREBASE_APP_NAME;
                }) || null;
            }

            if (!app) {
                app = window.firebase.initializeApp(firebaseConfig, FIREBASE_APP_NAME);
            }

            return {
                app: app,
                db: app.firestore()
            };
        })();

        return firebaseReadyPromise;
    }

    function getDefinition(moduleId) {
        return modules.get(moduleId) || null;
    }

    function getDefaults(moduleId) {
        const def = getDefinition(moduleId);
        return deepClone(def && def.defaults ? def.defaults : {});
    }

    async function readFromFirestore(moduleId) {
        const firebaseApi = await ensureFirebase();
        const snapshot = await firebaseApi.db
            .collection(FIRESTORE_COLLECTION)
            .doc(moduleId)
            .get();

        if (!snapshot.exists) return null;
        const data = snapshot.data() || {};
        return data.config || null;
    }

    async function writeToFirestore(moduleId, config) {
        const def = getDefinition(moduleId);
        const firebaseApi = await ensureFirebase();
        const payload = {
            moduleId: moduleId,
            schemaVersion: def && def.schemaVersion ? def.schemaVersion : 1,
            config: deepClone(config),
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        };

        await firebaseApi.db
            .collection(FIRESTORE_COLLECTION)
            .doc(moduleId)
            .set(payload, { merge: true });
    }

    async function getConfig(moduleId, options) {
        const opts = options || {};
        const def = getDefinition(moduleId);
        if (!def) throw new Error("unknown_module");

        if (!opts.force && cache.has(moduleId)) {
            return deepClone(cache.get(moduleId));
        }

        const defaults = getDefaults(moduleId);

        try {
            const stored = await readFromFirestore(moduleId);
            const merged = stored ? deepMerge(defaults, stored) : defaults;
            cache.set(moduleId, merged);
            fireStatus(moduleId, {
                storage: stored ? "firestore" : "defaults",
                readOk: true,
                readError: null
            });
            return deepClone(merged);
        } catch (error) {
            cache.set(moduleId, defaults);
            fireStatus(moduleId, {
                storage: "defaults",
                readOk: false,
                readError: error && error.code ? error.code : "firestore_read_failed"
            });
            return deepClone(defaults);
        }
    }

    async function saveConfig(moduleId, config) {
        const def = getDefinition(moduleId);
        if (!def) throw new Error("unknown_module");

        if (typeof def.validate === "function") {
            const validation = def.validate(deepClone(config));
            if (validation && validation.ok === false) {
                const error = new Error(validation.message || "invalid_configuration");
                error.pmkValidation = true;
                throw error;
            }
        }

        await writeToFirestore(moduleId, config);
        cache.set(moduleId, deepClone(config));
        fireStatus(moduleId, {
            storage: "firestore",
            readOk: true,
            readError: null,
            writeOk: true,
            writeError: null
        });
        notify(moduleId, config);
        return deepClone(config);
    }

    async function resetConfig(moduleId) {
        const defaults = getDefaults(moduleId);
        await saveConfig(moduleId, defaults);
        return defaults;
    }

    function subscribe(moduleId, callback) {
        if (!listeners.has(moduleId)) listeners.set(moduleId, new Set());
        listeners.get(moduleId).add(callback);
        return function () {
            const set = listeners.get(moduleId);
            if (set) set.delete(callback);
        };
    }

    function mountGlobalAdminAccess() {
        const existing = document.getElementById("pmk-global-config-entry");
        if (!canOpenAdmin() || !modules.size) {
            if (existing) existing.remove();
            return null;
        }
        if (existing) return existing;

        const menu = document.querySelector("#logged-in-dropdown > ul.dropdown-menu");
        if (!menu) return null;

        const li = document.createElement("li");
        li.id = "pmk-global-config-entry";
        li.className = "nav-item";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "dropdown-item";
        button.style.border = "0";
        button.style.background = "transparent";
        button.style.width = "100%";
        button.style.textAlign = "left";
        button.innerHTML = '<i class="fa fa-gear fa-fw" aria-hidden="true"></i> <span>PimpMyKoha</span>';
        button.title = text({
            fr: "Ouvrir la configuration des modules PimpMyKoha",
            en: "Open PimpMyKoha module settings"
        });
        button.addEventListener("click", function (event) {
            event.preventDefault();
            openAdmin();
        });

        li.appendChild(button);

        const logout = menu.querySelector("#logout");
        const logoutLi = logout && logout.closest("li");
        if (logoutLi) menu.insertBefore(li, logoutLi);
        else menu.appendChild(li);

        return li;
    }

    function scheduleGlobalAdminAccess() {
        const mount = function () {
            window.setTimeout(mountGlobalAdminAccess, 0);
        };
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", mount, { once: true });
        } else {
            mount();
        }
    }

    function registerModule(definition) {
        if (!definition || !definition.id) return false;

        const normalized = Object.assign({
            schemaVersion: 1,
            defaults: {},
            schema: [],
            name: definition.id,
            description: "",
            category: "",
            supportedPages: [],
            prerequisites: [],
            dependencies: []
        }, definition);

        modules.set(normalized.id, normalized);
        scheduleGlobalAdminAccess();
        return true;
    }

    function setAdminGuard(callback) {
        adminGuard = typeof callback === "function" ? callback : function () { return true; };
        scheduleGlobalAdminAccess();
    }

    function canOpenAdmin() {
        try {
            return adminGuard() !== false;
        } catch (_) {
            return false;
        }
    }

    function configsEqual(a, b) {
        try {
            return JSON.stringify(a) === JSON.stringify(b);
        } catch (_) {
            return false;
        }
    }

    function normalize(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function adminIsDirty() {
        return Boolean(
            adminState &&
            adminState.draft &&
            adminState.savedConfig &&
            !configsEqual(adminState.draft, adminState.savedConfig)
        );
    }

    function refreshAdminChrome() {
        if (!adminState) return;
        const overlay = document.getElementById("pmk-config-overlay");
        if (!overlay) return;
        const lang = detectLanguage();
        const dirty = adminIsDirty();
        adminState.dirty = dirty;

        const save = overlay.querySelector(".pmk-config-save");
        if (save && !adminState.saving) {
            save.disabled = adminState.loading || !dirty;
            save.innerHTML = dirty
                ? '<i class="fa fa-floppy-disk" aria-hidden="true"></i> ' + escapeHtml(text({ fr: "Enregistrer les modifications", en: "Save changes" }, lang))
                : '<i class="fa fa-check" aria-hidden="true"></i> ' + escapeHtml(text({ fr: "À jour", en: "Up to date" }, lang));
        }

        const cancel = overlay.querySelector(".pmk-config-cancel");
        if (cancel) cancel.disabled = adminState.loading || !dirty;

        renderStorageStatus();
    }

    function markAdminDirty() {
        if (!adminState) return;
        adminState.dirty = adminIsDirty();
        refreshAdminChrome();
    }

    function getFieldOptions(field, rootObject, fieldPath) {
        return typeof field.options === "function"
            ? field.options(rootObject, fieldPath)
            : (field.options || []);
    }

    function shouldHideSimpleField(field, rootObject, fieldPath) {
        if (!adminState || adminState.showAdvanced) return false;
        if (field.advanced === true) return true;
        if (field.type === "readonly") return true;
        if (field.type === "select") {
            const options = getFieldOptions(field, rootObject, fieldPath);
            if (Array.isArray(options) && options.length <= 1) return true;
        }
        return false;
    }

    function injectAdminStyles() {
        if (document.getElementById("pmk-config-styles")) return;

        const style = document.createElement("style");
        style.id = "pmk-config-styles";
        style.textContent = `
            body.pmk-config-open { overflow: hidden; }
            .pmk-context-config {
                opacity: .42;
                padding: .1rem .3rem !important;
                margin-left: .3rem;
                vertical-align: middle;
                text-decoration: none !important;
            }
            .pmk-context-config:hover,
            .pmk-context-config:focus { opacity: 1; }

            .pmk-config-overlay {
                position: fixed;
                inset: 0;
                z-index: 1065;
                background: rgba(21, 27, 32, .52);
                display: none;
                align-items: center;
                justify-content: center;
                padding: 1rem;
            }
            .pmk-config-overlay.pmk-open { display: flex; }

            .pmk-config-dialog {
                width: min(1280px, 97vw);
                height: min(900px, 94vh);
                background: var(--bs-body-bg, #fff);
                color: var(--bs-body-color, #212529);
                border: 1px solid rgba(0,0,0,.18);
                border-radius: .65rem;
                box-shadow: 0 1rem 2.5rem rgba(0,0,0,.22);
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            .pmk-config-header {
                padding: .9rem 1.1rem;
                display: flex;
                align-items: center;
                gap: .75rem;
                border-bottom: 1px solid #dee2e6;
                flex: 0 0 auto;
                background: var(--bs-body-bg, #fff);
            }
            .pmk-config-brand {
                display: flex;
                align-items: center;
                gap: .65rem;
                min-width: 0;
                flex: 1;
            }
            .pmk-config-brand-icon {
                width: 2rem;
                height: 2rem;
                border-radius: .5rem;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                background: rgba(13,110,253,.09);
                flex: 0 0 auto;
            }
            .pmk-config-title-wrap { min-width: 0; }
            .pmk-config-kicker {
                color: #6c757d;
                font-size: .78rem;
                line-height: 1.1;
                margin-bottom: .12rem;
            }
            .pmk-config-title {
                margin: 0;
                font-size: 1.08rem;
                line-height: 1.25;
                overflow-wrap: anywhere;
            }
            .pmk-config-close { flex: 0 0 auto; }

            .pmk-config-body {
                flex: 1 1 auto;
                min-height: 0;
                display: grid;
                grid-template-columns: 285px minmax(0, 1fr);
                overflow: hidden;
            }

            .pmk-config-sidebar {
                min-width: 0;
                border-right: 1px solid #dee2e6;
                background: rgba(0,0,0,.018);
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            .pmk-config-sidebar-head {
                padding: .9rem;
                border-bottom: 1px solid #e8eaed;
                flex: 0 0 auto;
            }
            .pmk-config-sidebar-title {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: .5rem;
                font-weight: 700;
                margin-bottom: .55rem;
            }
            .pmk-module-search { width: 100%; }
            .pmk-config-nav {
                padding: .65rem;
                overflow-y: auto;
                flex: 1 1 auto;
            }
            .pmk-module-nav-item {
                width: 100%;
                border: 1px solid transparent;
                background: transparent;
                border-radius: .45rem;
                padding: .62rem .68rem;
                margin: 0 0 .3rem;
                text-align: left;
                display: flex;
                gap: .55rem;
                align-items: flex-start;
                color: inherit;
            }
            .pmk-module-nav-item:hover,
            .pmk-module-nav-item:focus {
                background: rgba(13,110,253,.06);
                border-color: rgba(13,110,253,.14);
            }
            .pmk-module-nav-item.is-active {
                background: rgba(13,110,253,.11);
                border-color: rgba(13,110,253,.28);
            }
            .pmk-module-state-dot {
                width: .62rem;
                height: .62rem;
                border-radius: 50%;
                margin-top: .28rem;
                background: #adb5bd;
                flex: 0 0 auto;
            }
            .pmk-module-state-dot.is-on { background: #198754; }
            .pmk-module-nav-copy { min-width: 0; flex: 1; }
            .pmk-module-nav-name {
                display: block;
                font-weight: 650;
                line-height: 1.25;
                overflow-wrap: anywhere;
            }
            .pmk-module-nav-meta {
                display: block;
                margin-top: .18rem;
                color: #6c757d;
                font-size: .78rem;
                line-height: 1.2;
            }
            .pmk-nav-empty {
                color: #6c757d;
                padding: .8rem .55rem;
                font-size: .9rem;
            }

            .pmk-config-main {
                min-width: 0;
                overflow-y: auto;
                padding: 1.15rem 1.3rem 2rem;
                scroll-behavior: smooth;
            }

            .pmk-module-hero {
                border: 1px solid #dee2e6;
                border-radius: .65rem;
                padding: 1rem 1.05rem;
                margin-bottom: 1rem;
                background: rgba(0,0,0,.012);
            }
            .pmk-module-hero-top {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 1rem;
            }
            .pmk-module-heading { margin: 0; font-size: 1.3rem; }
            .pmk-config-module-description {
                color: #5f666d;
                margin-top: .3rem;
                max-width: 74ch;
            }
            .pmk-module-switch {
                min-width: 190px;
                border: 1px solid #dee2e6;
                border-radius: .55rem;
                background: var(--bs-body-bg, #fff);
                padding: .62rem .72rem;
            }
            .pmk-module-switch .form-check { margin: 0; }
            .pmk-module-switch-label { font-weight: 700; }
            .pmk-module-switch-help {
                color: #6c757d;
                font-size: .8rem;
                margin-top: .18rem;
            }
            .pmk-hero-tools {
                display: flex;
                flex-wrap: wrap;
                gap: .45rem;
                margin-top: .85rem;
                align-items: center;
            }
            .pmk-summary-pill {
                display: inline-flex;
                align-items: center;
                gap: .3rem;
                border-radius: 999px;
                padding: .24rem .55rem;
                background: rgba(0,0,0,.045);
                font-size: .82rem;
            }
            .pmk-advanced-toggle { margin-left: auto; }

            .pmk-config-alert { margin-bottom: 1rem; }

            .pmk-config-section,
            .pmk-repeater {
                border: 1px solid #dee2e6;
                border-radius: .6rem;
                background: var(--bs-body-bg, #fff);
                padding: .95rem;
                margin-bottom: 1rem;
            }
            .pmk-config-section-title {
                font-size: 1.02rem;
                margin: 0 0 .18rem;
            }
            .pmk-config-section-description {
                color: #6c757d;
                font-size: .9rem;
                margin-bottom: .8rem;
            }

            .pmk-field { margin-bottom: .9rem; }
            .pmk-field:last-child { margin-bottom: 0; }
            .pmk-field > label,
            .pmk-field > .pmk-label {
                display: block;
                font-weight: 650;
                margin-bottom: .32rem;
            }
            .pmk-field-help {
                display: block;
                margin-top: .28rem;
                color: #6c757d;
                font-size: .84rem;
                line-height: 1.35;
            }
            .pmk-field-boolean {
                border: 1px solid #e5e7ea;
                border-radius: .48rem;
                padding: .58rem .68rem;
                background: rgba(0,0,0,.012);
            }
            .pmk-field-boolean .form-check { margin: 0; }
            .pmk-readonly-value {
                padding: .42rem .58rem;
                border: 1px dashed #ced4da;
                border-radius: .35rem;
                background: rgba(0,0,0,.025);
                overflow-wrap: anywhere;
                font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                font-size: .83rem;
            }

            .pmk-repeater-heading {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: .65rem;
                margin-bottom: .75rem;
                flex-wrap: wrap;
            }
            .pmk-repeater-title-line {
                display: flex;
                align-items: center;
                gap: .45rem;
            }
            .pmk-repeater-count {
                display: inline-flex;
                min-width: 1.55rem;
                height: 1.55rem;
                padding: 0 .4rem;
                border-radius: 999px;
                align-items: center;
                justify-content: center;
                background: rgba(0,0,0,.06);
                font-size: .78rem;
                font-weight: 700;
            }
            .pmk-repeater-item {
                border: 1px solid #dee2e6;
                border-radius: .52rem;
                margin-bottom: .62rem;
                overflow: hidden;
                background: var(--bs-body-bg, #fff);
            }
            .pmk-repeater-item:last-child { margin-bottom: 0; }
            .pmk-repeater-item-header {
                padding: .56rem .62rem;
                background: rgba(0,0,0,.022);
                display: flex;
                align-items: center;
                gap: .45rem;
                cursor: pointer;
            }
            .pmk-repeater-item-header:hover { background: rgba(0,0,0,.038); }
            .pmk-repeater-toggle {
                border: 0;
                background: transparent;
                padding: .15rem .2rem;
                color: #6c757d;
                flex: 0 0 auto;
            }
            .pmk-repeater-toggle i { transition: transform .16s ease; }
            .pmk-repeater-item.is-open .pmk-repeater-toggle i { transform: rotate(90deg); }
            .pmk-repeater-item-title {
                flex: 1;
                min-width: 0;
                font-weight: 650;
                overflow-wrap: anywhere;
            }
            .pmk-item-state {
                font-size: .72rem;
                border-radius: 999px;
                padding: .13rem .42rem;
                background: #e9ecef;
                color: #495057;
                flex: 0 0 auto;
            }
            .pmk-item-state.is-on { background: #d1e7dd; color: #0f5132; }
            .pmk-repeater-actions {
                display: flex;
                align-items: center;
                gap: .12rem;
                flex: 0 0 auto;
            }
            .pmk-repeater-actions .btn { text-decoration: none; }
            .pmk-repeater-item-body {
                display: none;
                padding: .82rem;
                border-top: 1px solid #e9ecef;
            }
            .pmk-repeater-item.is-open > .pmk-repeater-item-body { display: block; }
            .pmk-empty {
                color: #6c757d;
                font-style: italic;
                margin: .2rem 0;
            }

            .pmk-tech-details {
                margin-top: .75rem;
                border-top: 1px solid #e9ecef;
                padding-top: .7rem;
                font-size: .86rem;
            }
            .pmk-tech-details summary {
                cursor: pointer;
                color: #5d646b;
                font-weight: 600;
            }
            .pmk-tech-grid {
                display: grid;
                grid-template-columns: minmax(130px, max-content) minmax(0,1fr);
                gap: .32rem .7rem;
                margin-top: .55rem;
            }
            .pmk-tech-grid dt { font-weight: 650; }
            .pmk-tech-grid dd { margin: 0; overflow-wrap: anywhere; }

            .pmk-config-footer {
                padding: .72rem 1rem;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: .75rem;
                border-top: 1px solid #dee2e6;
                flex: 0 0 auto;
                background: var(--bs-body-bg, #fff);
                flex-wrap: wrap;
            }
            .pmk-config-footer-status {
                display: flex;
                gap: .4rem;
                align-items: center;
                flex-wrap: wrap;
            }
            .pmk-storage-badge { font-size: .78rem; }
            .pmk-config-footer-actions {
                display: flex;
                gap: .4rem;
                flex-wrap: wrap;
                margin-left: auto;
            }

            @media (max-width: 900px) {
                .pmk-config-overlay { padding: .3rem; }
                .pmk-config-dialog { width: 100%; height: 98vh; }
                .pmk-config-body { grid-template-columns: 1fr; grid-template-rows: auto minmax(0,1fr); }
                .pmk-config-sidebar {
                    border-right: 0;
                    border-bottom: 1px solid #dee2e6;
                    max-height: 185px;
                }
                .pmk-config-sidebar-head { padding: .6rem .75rem; }
                .pmk-config-nav {
                    display: flex;
                    gap: .35rem;
                    overflow-x: auto;
                    overflow-y: hidden;
                    padding: .45rem .6rem;
                }
                .pmk-module-nav-item {
                    width: 220px;
                    min-width: 220px;
                    margin: 0;
                }
                .pmk-config-main { padding: .8rem; }
                .pmk-module-hero-top { display: block; }
                .pmk-module-switch { margin-top: .75rem; min-width: 0; }
                .pmk-advanced-toggle { margin-left: 0; }
            }

            @media (max-width: 576px) {
                .pmk-config-header { padding: .65rem .7rem; }
                .pmk-config-main { padding: .65rem; }
                .pmk-module-hero { padding: .75rem; }
                .pmk-config-footer { align-items: stretch; }
                .pmk-config-footer-actions { width: 100%; margin-left: 0; }
                .pmk-config-footer-actions .btn { flex: 1 1 auto; }
                .pmk-action-label { display: none; }
                .pmk-tech-grid { grid-template-columns: 1fr; gap: .15rem; }
            }
        `;
        document.head.appendChild(style);
    }

    function ensureAdminShell() {
        injectAdminStyles();

        let overlay = document.getElementById("pmk-config-overlay");
        if (overlay) return overlay;

        overlay = document.createElement("div");
        overlay.id = "pmk-config-overlay";
        overlay.className = "pmk-config-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-labelledby", "pmk-config-title");

        overlay.innerHTML = `
            <div class="pmk-config-dialog">
                <div class="pmk-config-header">
                    <div class="pmk-config-brand">
                        <span class="pmk-config-brand-icon"><i class="fa fa-sliders" aria-hidden="true"></i></span>
                        <div class="pmk-config-title-wrap">
                            <div class="pmk-config-kicker">PimpMyKoha</div>
                            <h2 id="pmk-config-title" class="pmk-config-title"></h2>
                        </div>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-secondary pmk-config-close" aria-label="Fermer" title="Fermer">
                        <i class="fa fa-times" aria-hidden="true"></i>
                    </button>
                </div>
                <div class="pmk-config-body">
                    <aside class="pmk-config-sidebar">
                        <div class="pmk-config-sidebar-head">
                            <div class="pmk-config-sidebar-title">
                                <span class="pmk-sidebar-title-text">Modules</span>
                                <span class="badge text-bg-secondary pmk-module-count"></span>
                            </div>
                            <input type="search" class="form-control form-control-sm pmk-module-search" autocomplete="off" />
                        </div>
                        <nav class="pmk-config-nav" aria-label="Modules PimpMyKoha"></nav>
                    </aside>
                    <main class="pmk-config-main"></main>
                </div>
                <div class="pmk-config-footer">
                    <div class="pmk-config-footer-status"></div>
                    <div class="pmk-config-footer-actions">
                        <button type="button" class="btn btn-sm btn-outline-secondary pmk-config-cancel"></button>
                        <button type="button" class="btn btn-sm btn-outline-secondary pmk-config-defaults"></button>
                        <button type="button" class="btn btn-sm btn-primary pmk-config-save"></button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.addEventListener("click", function (event) {
            if (event.target === overlay) closeAdmin();
        });

        overlay.querySelector(".pmk-config-close").addEventListener("click", function () { closeAdmin(); });
        overlay.querySelector(".pmk-config-save").addEventListener("click", saveCurrentAdminDraft);
        overlay.querySelector(".pmk-config-defaults").addEventListener("click", restoreCurrentDefaults);
        overlay.querySelector(".pmk-config-cancel").addEventListener("click", discardCurrentChanges);
        overlay.querySelector(".pmk-module-search").addEventListener("input", function (event) {
            if (!adminState) return;
            adminState.navQuery = event.target.value || "";
            renderModuleNav();
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && overlay.classList.contains("pmk-open")) {
                closeAdmin();
            }
        });

        return overlay;
    }

    function closeAdmin(force) {
        const overlay = document.getElementById("pmk-config-overlay");
        if (!overlay) return;
        if (!force && adminIsDirty()) {
            const lang = detectLanguage();
            const leave = window.confirm(text({
                fr: "Des modifications ne sont pas enregistrées. Fermer sans les enregistrer ?",
                en: "You have unsaved changes. Close without saving them?"
            }, lang));
            if (!leave) return;
        }
        overlay.classList.remove("pmk-open");
        document.body.classList.remove("pmk-config-open");
        adminState = null;
    }

    function getAtPath(root, path) {
        return path.reduce(function (current, key) {
            if (current === undefined || current === null) return undefined;
            return current[key];
        }, root);
    }

    function setAtPath(root, path, value) {
        if (!path.length) return;
        let current = root;
        for (let i = 0; i < path.length - 1; i += 1) {
            const key = path[i];
            if (current[key] === undefined || current[key] === null) {
                current[key] = typeof path[i + 1] === "number" ? [] : {};
            }
            current = current[key];
        }
        current[path[path.length - 1]] = value;
    }

    function createEmptyFromFields(fields) {
        const item = {};
        (fields || []).forEach(function (field) {
            if (!field || !field.key) return;
            if (field.default !== undefined) {
                item[field.key] = deepClone(
                    typeof field.default === "function" ? field.default() : field.default
                );
                return;
            }
            if (field.type === "boolean") item[field.key] = false;
            else if (field.type === "repeater") item[field.key] = [];
            else if (field.type === "select") {
                const options = typeof field.options === "function" ? field.options() : (field.options || []);
                item[field.key] = options.length ? options[0].value : "";
            } else item[field.key] = "";
        });
        return item;
    }

    function renderField(field, parent, rootObject, path, definition) {
        if (!field) return;

        const lang = detectLanguage();

        if (field.type === "section") {
            if (typeof field.when === "function" && field.when(rootObject, path.slice()) === false) return;

            const section = document.createElement("section");
            section.className = "pmk-config-section";
            if (field.id) section.setAttribute("data-pmk-section-id", field.id);

            if (field.label) {
                const heading = document.createElement("h4");
                heading.className = "pmk-config-section-title";
                heading.textContent = text(field.label, lang);
                section.appendChild(heading);
            }

            if (field.description) {
                const description = document.createElement("div");
                description.className = "pmk-config-section-description";
                description.textContent = text(field.description, lang);
                section.appendChild(description);
            }

            (field.fields || []).forEach(function (childField) {
                renderField(childField, section, rootObject, path, definition);
            });

            if (section.children.length) parent.appendChild(section);
            return;
        }

        if (!field.key) return;
        if (typeof field.when === "function" && field.when(rootObject, path.slice()) === false) return;

        const fieldPath = path.concat(field.key);
        if (shouldHideSimpleField(field, rootObject, fieldPath)) return;

        const currentValue = getAtPath(rootObject, fieldPath);

        if (field.type === "repeater") {
            renderRepeater(field, parent, rootObject, fieldPath, definition);
            return;
        }

        const wrapper = document.createElement("div");
        wrapper.className = "pmk-field" + (field.type === "boolean" ? " pmk-field-boolean" : "");

        if (field.type === "boolean") {
            const label = document.createElement("label");
            label.className = "form-check form-switch d-flex align-items-center gap-2";

            const input = document.createElement("input");
            input.type = "checkbox";
            input.className = "form-check-input";
            input.checked = Boolean(currentValue);
            input.addEventListener("change", function () {
                setAtPath(rootObject, fieldPath, input.checked);
                if (typeof field.onChange === "function") {
                    field.onChange(rootObject, fieldPath.slice(), input.checked);
                }
                markAdminDirty();
            });

            const span = document.createElement("span");
            span.textContent = text(field.label, lang);

            label.appendChild(input);
            label.appendChild(span);
            wrapper.appendChild(label);
        } else if (field.type === "readonly") {
            const label = document.createElement("div");
            label.className = "pmk-label";
            label.textContent = text(field.label, lang);
            const value = document.createElement("div");
            value.className = "pmk-readonly-value";
            value.textContent = currentValue === undefined || currentValue === null ? "" : String(currentValue);
            wrapper.appendChild(label);
            wrapper.appendChild(value);
        } else {
            const label = document.createElement("label");
            label.textContent = text(field.label, lang);
            wrapper.appendChild(label);

            let control;
            if (field.type === "select") {
                control = document.createElement("select");
                control.className = "form-select form-select-sm";
                const options = getFieldOptions(field, rootObject, fieldPath);

                options.forEach(function (option) {
                    const el = document.createElement("option");
                    el.value = option.value;
                    el.textContent = text(option.label, lang);
                    if (String(currentValue) === String(option.value)) el.selected = true;
                    control.appendChild(el);
                });
            } else {
                control = document.createElement("input");
                control.type = field.type === "number" ? "number" : "text";
                control.className = "form-control form-control-sm";
                control.value = currentValue === undefined || currentValue === null ? "" : String(currentValue);
                if (field.placeholder) control.placeholder = text(field.placeholder, lang);
            }

            if (field.readOnly) control.disabled = true;

            const updateValue = function () {
                let value = control.value;
                if (field.type === "number") value = value === "" ? null : Number(value);
                setAtPath(rootObject, fieldPath, value);
                if (typeof field.onChange === "function") {
                    field.onChange(rootObject, fieldPath.slice(), value);
                }
                markAdminDirty();
            };

            control.addEventListener("change", updateValue);
            if (field.type !== "select") control.addEventListener("input", updateValue);

            wrapper.appendChild(control);
        }

        if (field.help) {
            const help = document.createElement("small");
            help.className = "pmk-field-help";
            help.textContent = text(field.help, lang);
            wrapper.appendChild(help);
        }

        parent.appendChild(wrapper);
    }

    function renderRepeater(field, parent, rootObject, fieldPath, definition) {
        const lang = detectLanguage();
        let items = getAtPath(rootObject, fieldPath);
        if (!Array.isArray(items)) {
            items = [];
            setAtPath(rootObject, fieldPath, items);
        }

        const section = document.createElement("section");
        section.className = "pmk-repeater";

        const heading = document.createElement("div");
        heading.className = "pmk-repeater-heading";

        const titleLine = document.createElement("div");
        titleLine.className = "pmk-repeater-title-line";
        const title = document.createElement("strong");
        title.textContent = text(field.label, lang);
        titleLine.appendChild(title);
        const count = document.createElement("span");
        count.className = "pmk-repeater-count";
        count.textContent = String(items.length);
        titleLine.appendChild(count);
        heading.appendChild(titleLine);

        const canAdd = typeof field.canAdd === "function"
            ? field.canAdd(deepClone(rootObject), fieldPath.slice(), deepClone(items)) !== false
            : true;

        if (canAdd) {
            const addButton = document.createElement("button");
            addButton.type = "button";
            addButton.className = "btn btn-sm btn-outline-primary";
            addButton.innerHTML = '<i class="fa fa-plus" aria-hidden="true"></i> ' +
                escapeHtml(text(field.addLabel || { fr: "Ajouter", en: "Add" }, lang));
            addButton.addEventListener("click", function () {
                let newItem;
                if (typeof field.newItem === "function") {
                    newItem = field.newItem(deepClone(rootObject), fieldPath.slice());
                } else if (field.newItem !== undefined) {
                    newItem = deepClone(field.newItem);
                } else {
                    newItem = createEmptyFromFields(field.fields || []);
                }
                items.push(newItem);
                markAdminDirty();
                renderSelectedModuleForm();
            });
            heading.appendChild(addButton);
        }

        section.appendChild(heading);

        if (!items.length) {
            const empty = document.createElement("div");
            empty.className = "pmk-empty";
            empty.textContent = text(field.emptyLabel || {
                fr: "Aucun élément configuré.",
                en: "No configured item."
            }, lang);
            section.appendChild(empty);
        }

        items.forEach(function (item, index) {
            const card = document.createElement("div");
            card.className = "pmk-repeater-item" + (index === 0 ? " is-open" : "");

            const cardHeader = document.createElement("div");
            cardHeader.className = "pmk-repeater-item-header";

            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "pmk-repeater-toggle";
            toggle.setAttribute("aria-label", text({ fr: "Afficher ou masquer les réglages", en: "Show or hide settings" }, lang));
            toggle.innerHTML = '<i class="fa fa-chevron-right" aria-hidden="true"></i>';
            cardHeader.appendChild(toggle);

            const itemTitle = document.createElement("div");
            itemTitle.className = "pmk-repeater-item-title";
            if (typeof field.itemTitle === "function") {
                itemTitle.textContent = field.itemTitle(item, index, lang) || ("#" + (index + 1));
            } else if (field.itemTitleKey && item && item[field.itemTitleKey]) {
                itemTitle.textContent = String(item[field.itemTitleKey]);
            } else {
                itemTitle.textContent = text(field.itemLabel || { fr: "Élément", en: "Item" }, lang) + " " + (index + 1);
            }
            cardHeader.appendChild(itemTitle);

            if (item && typeof item.enabled === "boolean") {
                const state = document.createElement("span");
                state.className = "pmk-item-state" + (item.enabled ? " is-on" : "");
                state.textContent = item.enabled
                    ? text({ fr: "Actif", en: "On" }, lang)
                    : text({ fr: "Inactif", en: "Off" }, lang);
                cardHeader.appendChild(state);
            }

            const actions = document.createElement("div");
            actions.className = "pmk-repeater-actions";

            if (field.reorder !== false && items.length > 1) {
                const up = document.createElement("button");
                up.type = "button";
                up.className = "btn btn-sm btn-link";
                up.title = text({ fr: "Monter", en: "Move up" }, lang);
                up.innerHTML = '<i class="fa fa-arrow-up" aria-hidden="true"></i>';
                up.disabled = index === 0;
                up.addEventListener("click", function (event) {
                    event.stopPropagation();
                    if (index <= 0) return;
                    const moved = items.splice(index, 1)[0];
                    items.splice(index - 1, 0, moved);
                    markAdminDirty();
                    renderSelectedModuleForm();
                });
                actions.appendChild(up);

                const down = document.createElement("button");
                down.type = "button";
                down.className = "btn btn-sm btn-link";
                down.title = text({ fr: "Descendre", en: "Move down" }, lang);
                down.innerHTML = '<i class="fa fa-arrow-down" aria-hidden="true"></i>';
                down.disabled = index === items.length - 1;
                down.addEventListener("click", function (event) {
                    event.stopPropagation();
                    if (index >= items.length - 1) return;
                    const moved = items.splice(index, 1)[0];
                    items.splice(index + 1, 0, moved);
                    markAdminDirty();
                    renderSelectedModuleForm();
                });
                actions.appendChild(down);
            }

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "btn btn-sm btn-link text-danger";
            remove.title = text({ fr: "Retirer", en: "Remove" }, lang);
            remove.innerHTML = '<i class="fa fa-trash" aria-hidden="true"></i><span class="pmk-action-label"> ' +
                escapeHtml(text({ fr: "Retirer", en: "Remove" }, lang)) + '</span>';
            remove.addEventListener("click", function (event) {
                event.stopPropagation();
                const question = text({
                    fr: "Retirer cet élément de la configuration ?",
                    en: "Remove this item from the configuration?"
                }, lang);
                if (!window.confirm(question)) return;
                items.splice(index, 1);
                markAdminDirty();
                renderSelectedModuleForm();
            });
            actions.appendChild(remove);

            cardHeader.appendChild(actions);
            card.appendChild(cardHeader);

            const cardBody = document.createElement("div");
            cardBody.className = "pmk-repeater-item-body";

            (field.fields || []).forEach(function (childField) {
                renderField(childField, cardBody, rootObject, fieldPath.concat(index), definition);
            });

            card.appendChild(cardBody);
            const toggleCard = function (event) {
                if (event && event.target.closest(".pmk-repeater-actions")) return;
                card.classList.toggle("is-open");
            };
            toggle.addEventListener("click", function (event) {
                event.stopPropagation();
                toggleCard();
            });
            itemTitle.addEventListener("click", toggleCard);
            cardHeader.addEventListener("dblclick", toggleCard);

            section.appendChild(card);
        });

        parent.appendChild(section);
    }

    function setAdminAlert(kind, message) {
        const main = document.querySelector("#pmk-config-overlay .pmk-config-main");
        if (!main) return;

        const old = main.querySelector(".pmk-config-alert");
        if (old) old.remove();
        if (!message) return;

        const alert = document.createElement("div");
        alert.className = "alert alert-" + kind + " pmk-config-alert";
        alert.setAttribute("role", "alert");
        alert.textContent = message;
        main.prepend(alert);
    }

    function renderModuleNav() {
        if (!adminState) return;
        const overlay = document.getElementById("pmk-config-overlay");
        const nav = overlay.querySelector(".pmk-config-nav");
        const count = overlay.querySelector(".pmk-module-count");
        const search = overlay.querySelector(".pmk-module-search");
        const lang = detectLanguage();
        const query = normalize(adminState.navQuery || "");

        if (search) {
            search.placeholder = text({ fr: "Rechercher un module…", en: "Search modules…" }, lang);
            if (search.value !== (adminState.navQuery || "")) search.value = adminState.navQuery || "";
        }
        const title = overlay.querySelector(".pmk-sidebar-title-text");
        if (title) title.textContent = text({ fr: "Modules", en: "Modules" }, lang);
        if (count) count.textContent = String(modules.size);

        nav.innerHTML = "";

        const defs = Array.from(modules.values())
            .sort(function (a, b) {
                return text(a.name, lang).localeCompare(text(b.name, lang));
            })
            .filter(function (def) {
                if (!query) return true;
                const haystack = normalize([
                    text(def.name, lang),
                    text(def.description, lang),
                    text(def.category, lang),
                    def.id
                ].join(" "));
                return haystack.includes(query);
            });

        if (!defs.length) {
            const empty = document.createElement("div");
            empty.className = "pmk-nav-empty";
            empty.textContent = text({ fr: "Aucun module ne correspond à la recherche.", en: "No module matches your search." }, lang);
            nav.appendChild(empty);
            return;
        }

        defs.forEach(function (def) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "pmk-module-nav-item" + (adminState.moduleId === def.id ? " is-active" : "");

            const preview = adminState.moduleId === def.id && adminState.draft
                ? adminState.draft
                : (cache.has(def.id) ? cache.get(def.id) : (def.defaults || {}));
            const previewEnabled = !preview || preview.enabled !== false;

            const dot = document.createElement("span");
            dot.className = "pmk-module-state-dot" + (previewEnabled ? " is-on" : "");
            button.appendChild(dot);

            const copy = document.createElement("span");
            copy.className = "pmk-module-nav-copy";
            const name = document.createElement("span");
            name.className = "pmk-module-nav-name";
            name.textContent = text(def.name, lang);
            copy.appendChild(name);

            const meta = document.createElement("span");
            meta.className = "pmk-module-nav-meta";
            meta.textContent = previewEnabled
                ? text({ fr: "Activé", en: "Enabled" }, lang)
                : text({ fr: "Désactivé", en: "Disabled" }, lang);
            if (def.category) meta.textContent += " · " + text(def.category, lang);
            copy.appendChild(meta);
            button.appendChild(copy);

            button.addEventListener("click", function () {
                selectAdminModule(def.id, null);
            });
            nav.appendChild(button);
        });
    }

    function renderStorageStatus() {
        if (!adminState) return;
        const overlay = document.getElementById("pmk-config-overlay");
        if (!overlay) return;
        const footerStatus = overlay.querySelector(".pmk-config-footer-status");
        if (!footerStatus) return;
        const moduleStatus = status.get(adminState.moduleId) || {};
        const lang = detectLanguage();
        const dirty = adminIsDirty();

        const badges = [];
        if (moduleStatus.readOk === false) {
            badges.push('<span class="badge text-bg-warning pmk-storage-badge" title="Firestore">' +
                escapeHtml(text({ fr: "Stockage indisponible", en: "Storage unavailable" }, lang)) + '</span>');
        } else if (moduleStatus.writeOk === false) {
            badges.push('<span class="badge text-bg-danger pmk-storage-badge" title="Firestore">' +
                escapeHtml(text({ fr: "Dernier enregistrement échoué", en: "Last save failed" }, lang)) + '</span>');
        } else if (moduleStatus.storage === "firestore") {
            badges.push('<span class="badge text-bg-success pmk-storage-badge" title="Firestore">' +
                escapeHtml(text({ fr: "Configuration synchronisée", en: "Configuration synced" }, lang)) + '</span>');
        } else {
            badges.push('<span class="badge text-bg-secondary pmk-storage-badge">' +
                escapeHtml(text({ fr: "Valeurs par défaut", en: "Default values" }, lang)) + '</span>');
        }

        if (dirty) {
            badges.push('<span class="badge text-bg-warning pmk-storage-badge">' +
                escapeHtml(text({ fr: "Modifications non enregistrées", en: "Unsaved changes" }, lang)) + '</span>');
        }
        footerStatus.innerHTML = badges.join(" ");
    }

    async function selectAdminModule(moduleId, context) {
        if (!adminState) return;
        if (!modules.has(moduleId)) return;

        if (adminState.moduleId && adminState.moduleId !== moduleId && adminIsDirty()) {
            const lang = detectLanguage();
            const discard = window.confirm(text({
                fr: "Les modifications du module actuel ne sont pas enregistrées. Les abandonner et ouvrir un autre module ?",
                en: "The current module has unsaved changes. Discard them and open another module?"
            }, lang));
            if (!discard) return;
        }

        adminState.moduleId = moduleId;
        adminState.context = context || null;
        adminState.loading = true;
        adminState.saving = false;
        adminState.draft = null;
        adminState.savedConfig = null;
        adminState.dirty = false;

        renderModuleNav();
        refreshAdminChrome();

        const overlay = document.getElementById("pmk-config-overlay");
        const main = overlay.querySelector(".pmk-config-main");
        const lang = detectLanguage();

        main.innerHTML = '<div class="d-flex align-items-center gap-2 text-muted p-3">' +
            '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>' +
            '<span>' + escapeHtml(text({ fr: "Chargement des réglages…", en: "Loading settings…" }, lang)) + '</span></div>';

        const config = await getConfig(moduleId, { force: true });
        if (!adminState || adminState.moduleId !== moduleId) return;

        adminState.draft = deepClone(config);
        adminState.savedConfig = deepClone(config);
        adminState.loading = false;
        adminState.dirty = false;
        renderModuleNav();
        renderSelectedModuleForm();
    }

    function renderSelectedModuleForm() {
        if (!adminState || !adminState.moduleId || !adminState.draft) return;

        const overlay = document.getElementById("pmk-config-overlay");
        const main = overlay.querySelector(".pmk-config-main");
        const def = modules.get(adminState.moduleId);
        const lang = detectLanguage();

        main.innerHTML = "";

        const hero = document.createElement("section");
        hero.className = "pmk-module-hero";

        const heroTop = document.createElement("div");
        heroTop.className = "pmk-module-hero-top";

        const intro = document.createElement("div");
        const heading = document.createElement("h3");
        heading.className = "pmk-module-heading";
        heading.textContent = text(def.name, lang);
        intro.appendChild(heading);
        if (def.description) {
            const description = document.createElement("div");
            description.className = "pmk-config-module-description";
            description.textContent = text(def.description, lang);
            intro.appendChild(description);
        }
        heroTop.appendChild(intro);

        const activation = document.createElement("div");
        activation.className = "pmk-module-switch";
        const activationLabel = document.createElement("label");
        activationLabel.className = "form-check form-switch d-flex align-items-center gap-2";
        const activationInput = document.createElement("input");
        activationInput.type = "checkbox";
        activationInput.className = "form-check-input";
        activationInput.checked = adminState.draft.enabled !== false;
        const activationText = document.createElement("span");
        activationText.className = "pmk-module-switch-label";
        activationText.textContent = activationInput.checked
            ? text({ fr: "Module activé", en: "Module enabled" }, lang)
            : text({ fr: "Module désactivé", en: "Module disabled" }, lang);
        activationLabel.appendChild(activationInput);
        activationLabel.appendChild(activationText);
        activation.appendChild(activationLabel);
        const activationHelp = document.createElement("div");
        activationHelp.className = "pmk-module-switch-help";
        activationHelp.textContent = text({
            fr: "Ce réglage active ou désactive uniquement ce module.",
            en: "This setting only enables or disables this module."
        }, lang);
        activation.appendChild(activationHelp);
        activationInput.addEventListener("change", function () {
            adminState.draft.enabled = activationInput.checked;
            activationText.textContent = activationInput.checked
                ? text({ fr: "Module activé", en: "Module enabled" }, lang)
                : text({ fr: "Module désactivé", en: "Module disabled" }, lang);
            markAdminDirty();
            renderModuleNav();
        });
        heroTop.appendChild(activation);
        hero.appendChild(heroTop);

        const tools = document.createElement("div");
        tools.className = "pmk-hero-tools";

        const pageCount = Array.isArray(adminState.draft.pages)
            ? adminState.draft.pages.filter(function (page) { return page && page.enabled !== false; }).length
            : (Array.isArray(def.supportedPages) ? def.supportedPages.length : 0);
        if (pageCount) {
            const pages = document.createElement("span");
            pages.className = "pmk-summary-pill";
            pages.innerHTML = '<i class="fa fa-file" aria-hidden="true"></i> ' +
                escapeHtml(text({ fr: "Pages actives : ", en: "Active pages: " }, lang) + pageCount);
            tools.appendChild(pages);
        }

        const advanced = document.createElement("button");
        advanced.type = "button";
        advanced.className = "btn btn-sm btn-outline-secondary pmk-advanced-toggle";
        advanced.innerHTML = adminState.showAdvanced
            ? '<i class="fa fa-eye-slash" aria-hidden="true"></i> ' + escapeHtml(text({ fr: "Masquer les détails techniques", en: "Hide technical details" }, lang))
            : '<i class="fa fa-gear" aria-hidden="true"></i> ' + escapeHtml(text({ fr: "Afficher les réglages avancés", en: "Show advanced settings" }, lang));
        advanced.addEventListener("click", function () {
            adminState.showAdvanced = !adminState.showAdvanced;
            renderSelectedModuleForm();
        });
        tools.appendChild(advanced);
        hero.appendChild(tools);

        const technical = document.createElement("details");
        technical.className = "pmk-tech-details";
        const techSummary = document.createElement("summary");
        techSummary.textContent = text({ fr: "Informations techniques du module", en: "Module technical information" }, lang);
        technical.appendChild(techSummary);
        const dl = document.createElement("dl");
        dl.className = "pmk-tech-grid";
        const addTech = function (label, value) {
            if (!value) return;
            const dt = document.createElement("dt");
            dt.textContent = label;
            const dd = document.createElement("dd");
            dd.textContent = value;
            dl.appendChild(dt);
            dl.appendChild(dd);
        };
        addTech(text({ fr: "Identifiant", en: "Identifier" }, lang), def.id);
        addTech(text({ fr: "Catégorie", en: "Category" }, lang), text(def.category, lang));
        if (Array.isArray(def.prerequisites) && def.prerequisites.length) {
            addTech(text({ fr: "Prérequis", en: "Prerequisites" }, lang), def.prerequisites.map(function (item) { return text(item, lang); }).join(", "));
        }
        if (Array.isArray(def.dependencies) && def.dependencies.length) {
            addTech(text({ fr: "Dépendances", en: "Dependencies" }, lang), def.dependencies.map(function (item) { return text(item, lang); }).join(", "));
        }
        addTech(text({ fr: "Version du schéma", en: "Schema version" }, lang), String(def.schemaVersion || 1));
        technical.appendChild(dl);
        hero.appendChild(technical);

        main.appendChild(hero);

        const moduleStatus = status.get(adminState.moduleId) || {};
        if (moduleStatus.readOk === false) {
            const warning = document.createElement("div");
            warning.className = "alert alert-warning pmk-config-alert";
            warning.textContent = text({
                fr: "Les réglages enregistrés n'ont pas pu être chargés. Les valeurs par défaut sont affichées pour le moment.",
                en: "Saved settings could not be loaded. Default values are currently displayed."
            }, lang);
            main.appendChild(warning);
        }

        const schema = def.schema || [];
        schema.forEach(function (field) {
            if (field && field.key === "enabled" && field.type === "boolean") return;
            renderField(field, main, adminState.draft, [], def);
        });

        if (!schema.length) {
            const empty = document.createElement("div");
            empty.className = "alert alert-light border";
            empty.textContent = text({ fr: "Ce module ne possède pas encore de réglages supplémentaires.", en: "This module has no additional settings yet." }, lang);
            main.appendChild(empty);
        }

        const title = overlay.querySelector("#pmk-config-title");
        title.textContent = text({
            fr: "Configuration — " + text(def.name, "fr"),
            en: "Settings — " + text(def.name, "en")
        }, lang);

        overlay.querySelector(".pmk-config-defaults").innerHTML = '<i class="fa fa-rotate-left" aria-hidden="true"></i> ' +
            escapeHtml(text({ fr: "Valeurs par défaut", en: "Defaults" }, lang));
        overlay.querySelector(".pmk-config-cancel").innerHTML = '<i class="fa fa-undo" aria-hidden="true"></i> ' +
            escapeHtml(text({ fr: "Annuler les modifications", en: "Discard changes" }, lang));
        overlay.querySelector(".pmk-config-close").setAttribute("aria-label", text({ fr: "Fermer", en: "Close" }, lang));
        overlay.querySelector(".pmk-config-close").title = text({ fr: "Fermer", en: "Close" }, lang);

        refreshAdminChrome();

        if (adminState.context && typeof def.focusContext === "function") {
            try {
                def.focusContext(main, deepClone(adminState.context));
            } catch (_) {
                /* aucun impact sur l'interface */
            }
        }
    }

    async function saveCurrentAdminDraft() {
        if (!adminState || adminState.loading || adminState.saving || !adminState.moduleId || !adminState.draft) return;
        if (!adminIsDirty()) return;

        const overlay = document.getElementById("pmk-config-overlay");
        const saveButton = overlay.querySelector(".pmk-config-save");
        const lang = detectLanguage();
        const moduleId = adminState.moduleId;
        const draft = deepClone(adminState.draft);

        adminState.saving = true;
        saveButton.disabled = true;
        saveButton.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> ' +
            escapeHtml(text({ fr: "Enregistrement…", en: "Saving…" }, lang));

        try {
            await saveConfig(moduleId, draft);
            if (!adminState || adminState.moduleId !== moduleId) return;
            adminState.draft = deepClone(draft);
            adminState.savedConfig = deepClone(draft);
            adminState.dirty = false;
            renderModuleNav();
            renderSelectedModuleForm();
            setAdminAlert("success", text({
                fr: "Les modifications ont été enregistrées.",
                en: "Changes have been saved."
            }, lang));
        } catch (error) {
            const code = error && error.code ? error.code : "firestore_write_failed";
            const message = error && error.pmkValidation
                ? error.message
                : text({
                    fr: "L'enregistrement a échoué. Aucune modification n'a été considérée comme enregistrée. Code : " + code,
                    en: "Saving failed. No changes were considered saved. Code: " + code
                }, lang);
            setAdminAlert("danger", message);
            fireStatus(moduleId, {
                writeOk: false,
                writeError: code
            });
        } finally {
            if (adminState) adminState.saving = false;
            refreshAdminChrome();
        }
    }

    function discardCurrentChanges() {
        if (!adminState || !adminState.savedConfig || !adminIsDirty()) return;
        const lang = detectLanguage();
        const confirmDiscard = window.confirm(text({
            fr: "Annuler toutes les modifications non enregistrées de ce module ?",
            en: "Discard all unsaved changes for this module?"
        }, lang));
        if (!confirmDiscard) return;
        adminState.draft = deepClone(adminState.savedConfig);
        adminState.dirty = false;
        renderModuleNav();
        renderSelectedModuleForm();
        setAdminAlert("info", text({
            fr: "Les modifications non enregistrées ont été annulées.",
            en: "Unsaved changes were discarded."
        }, lang));
    }

    async function restoreCurrentDefaults() {
        if (!adminState || !adminState.moduleId) return;
        const lang = detectLanguage();
        const question = text({
            fr: "Charger les valeurs par défaut de ce module ? Elles ne remplaceront la configuration enregistrée qu'après avoir cliqué sur « Enregistrer les modifications ».",
            en: "Load this module's default values? They will only replace the saved configuration after you click “Save changes”."
        }, lang);
        if (!window.confirm(question)) return;

        adminState.draft = getDefaults(adminState.moduleId);
        adminState.dirty = adminIsDirty();
        renderModuleNav();
        renderSelectedModuleForm();
        setAdminAlert("info", text({
            fr: "Valeurs par défaut chargées. Vérifie-les puis enregistre si tu souhaites les conserver.",
            en: "Default values loaded. Review them, then save if you want to keep them."
        }, lang));
    }

    async function openAdmin(moduleId, context) {
        if (!canOpenAdmin()) return false;
        if (!modules.size) return false;

        const overlay = ensureAdminShell();
        const firstModuleId = moduleId && modules.has(moduleId)
            ? moduleId
            : Array.from(modules.keys())[0];

        adminState = {
            moduleId: firstModuleId,
            context: context || null,
            draft: null,
            savedConfig: null,
            loading: true,
            saving: false,
            dirty: false,
            showAdvanced: false,
            navQuery: ""
        };

        overlay.classList.add("pmk-open");
        document.body.classList.add("pmk-config-open");
        renderModuleNav();
        refreshAdminChrome();
        await selectAdminModule(firstModuleId, context || null);
        return true;
    }

    function mountContextButton(options) {
        const opts = options || {};
        if (!opts.moduleId || !modules.has(opts.moduleId) || !canOpenAdmin()) return null;

        let anchor = opts.anchor;
        if (typeof anchor === "string") anchor = document.querySelector(anchor);
        if (!anchor || !anchor.parentNode) return null;

        const key = "pmk-config-" + safeId(opts.moduleId) + "-" + safeId(opts.contextKey || "default");
        if (document.getElementById(key)) return document.getElementById(key);

        const def = modules.get(opts.moduleId);
        const lang = detectLanguage();
        const button = document.createElement("button");
        button.type = "button";
        button.id = key;
        button.className = "btn btn-link btn-sm pmk-context-config";
        button.title = text({
            fr: "Configurer " + text(def.name, "fr"),
            en: "Configure " + text(def.name, "en")
        }, lang);
        button.setAttribute("aria-label", button.title);
        button.innerHTML = '<i class="fa fa-gear" aria-hidden="true"></i>';
        button.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            openAdmin(opts.moduleId, opts.context || null);
        });

        injectAdminStyles();

        if (opts.position === "before") anchor.parentNode.insertBefore(button, anchor);
        else if (opts.position === "after") anchor.parentNode.insertBefore(button, anchor.nextSibling);
        else anchor.appendChild(button);

        return button;
    }

    window.PMKConfig = {
        version: CORE_VERSION,
        storageCollection: FIRESTORE_COLLECTION,
        registerModule: registerModule,
        getConfig: getConfig,
        saveConfig: saveConfig,
        resetConfig: resetConfig,
        subscribe: subscribe,
        openAdmin: openAdmin,
        closeAdmin: closeAdmin,
        mountContextButton: mountContextButton,
        mountGlobalAdminAccess: mountGlobalAdminAccess,
        setAdminGuard: setAdminGuard,
        canOpenAdmin: canOpenAdmin,
        getLanguage: detectLanguage,
        text: text,
        getStatus: function (moduleId) {
            return Object.assign({}, status.get(moduleId) || {});
        },
        listModules: function () {
            return Array.from(modules.values()).map(function (def) {
                return {
                    id: def.id,
                    name: deepClone(def.name),
                    description: deepClone(def.description),
                    category: deepClone(def.category),
                    supportedPages: deepClone(def.supportedPages || []),
                    prerequisites: deepClone(def.prerequisites || []),
                    dependencies: deepClone(def.dependencies || []),
                    schemaVersion: def.schemaVersion || 1
                };
            });
        },
        clearCache: function (moduleId) {
            if (moduleId) cache.delete(moduleId);
            else cache.clear();
        }
    };

    window.dispatchEvent(new CustomEvent("pmk:config-ready"));
})();

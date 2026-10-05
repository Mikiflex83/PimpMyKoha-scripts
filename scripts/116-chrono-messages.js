/*
 * 116-chrono-messages.js
 * PimpMyKoha — Chronologie des messages lecteur
 * Version : 2.0.0-preplugin
 * Date : 2026-09-20
 *
 * Fonction historique conservée :
 * - circulation.pl et moremember.pl uniquement ;
 * - cible historique : #messages.circmessage ul ;
 * - affichage Dracénie par défaut : plus ancien -> plus récent.
 *
 * Configuration PMK volontairement minimale :
 * - activer / désactiver ;
 * - ordre : plus ancien -> plus récent / plus récent -> plus ancien.
 *
 * Le module ne modifie jamais le contenu des messages. Il déplace uniquement
 * les noeuds <li> existants et sait restaurer l'ordre Koha capturé au chargement.
 */
(function (window, document) {
    "use strict";

    if (!window || !document) return;
    if (window.__PMK116PatronMessageChronologyV2) return;
    window.__PMK116PatronMessageChronologyV2 = true;

    const MODULE_ID = "patron-message-chronology";
    const MODULE_VERSION = "2.0.0-preplugin";

    const SUPPORTED_PATHS = new Set([
        "/cgi-bin/koha/circ/circulation.pl",
        "/cgi-bin/koha/members/moremember.pl"
    ]);

    const DEFAULT_CONFIG = Object.freeze({
        enabled: true,
        order: "oldest-first"
    });

    const originalOrders = new Map();
    const contextAnchors = new Set();
    let currentConfig = clone(DEFAULT_CONFIG);
    let unsubscribeConfig = null;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function normalizeConfig(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        return {
            enabled: source.enabled !== false,
            order: source.order === "newest-first" ? "newest-first" : "oldest-first"
        };
    }

    function isSupportedPage() {
        return SUPPORTED_PATHS.has(window.location.pathname);
    }

    function findMessageLists() {
        if (!isSupportedPage()) return [];

        /*
         * Le premier sélecteur est exactement celui du 116 historique.
         * Le second couvre le conteneur Koha utilisé sur certaines variantes
         * de fiche lecteur, sans élargir la recherche à toutes les listes
         * .circmessage (qui peuvent aussi contenir des alertes sans rapport).
         */
        const selectors = [
            "#messages.circmessage ul",
            "#patron_messages ul"
        ];

        const lists = [];
        const seen = new Set();
        selectors.forEach(function (selector) {
            document.querySelectorAll(selector).forEach(function (list) {
                if (!seen.has(list)) {
                    seen.add(list);
                    lists.push(list);
                }
            });
        });
        return lists;
    }

    function directMessages(list) {
        if (!list) return [];
        return Array.from(list.children).filter(function (node) {
            return node && node.tagName === "LI";
        });
    }

    function rememberNativeOrder(list) {
        if (!list || originalOrders.has(list)) return;
        originalOrders.set(list, directMessages(list));
    }

    function currentNativeSequence(list) {
        rememberNativeOrder(list);

        const native = (originalOrders.get(list) || []).filter(function (node) {
            return node && node.isConnected && node.parentElement === list;
        });

        /*
         * Si Koha ou un autre module ajoute un message après la capture initiale,
         * on le conserve aussi, dans son ordre DOM actuel, sans jamais le perdre.
         */
        const known = new Set(native);
        directMessages(list).forEach(function (node) {
            if (!known.has(node)) {
                native.push(node);
                known.add(node);
            }
        });

        originalOrders.set(list, native.slice());
        return native;
    }

    function placeInOrder(list, nodes) {
        if (!list || !nodes.length) return;
        const fragment = document.createDocumentFragment();
        nodes.forEach(function (node) {
            if (node && node.parentElement === list) fragment.appendChild(node);
        });
        list.appendChild(fragment);
    }

    function restoreList(list) {
        if (!list || !originalOrders.has(list)) return;
        placeInOrder(list, currentNativeSequence(list));
        list.removeAttribute("data-pmk116-order");
    }

    function restoreAll() {
        originalOrders.forEach(function (_nodes, list) {
            if (list && list.isConnected) restoreList(list);
        });
    }

    function applyOrderToList(list, order) {
        if (!list) return;
        const native = currentNativeSequence(list);
        const wanted = order === "oldest-first" ? native.slice().reverse() : native.slice();
        placeInOrder(list, wanted);
        list.setAttribute("data-pmk116-order", order);
        mountContextAccess(list);
    }

    function mountContextAccess(list) {
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        const anchor = list.closest("#messages.circmessage, #patron_messages, .circmessage") || list.parentElement;
        if (!anchor || contextAnchors.has(anchor)) return;
        contextAnchors.add(anchor);
        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "append",
                contextKey: "pmk116-messages",
                context: { sectionId: "settings" }
            });
        } catch (_) {}
    }

    function validateConfig(config) {
        const cfg = normalizeConfig(config);
        if (!["oldest-first", "newest-first"].includes(cfg.order)) {
            return {
                ok: false,
                message: "L'ordre des messages est invalide."
            };
        }
        return { ok: true };
    }

    function buildModuleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 1,
            name: {
                fr: "Chronologie des messages lecteur",
                en: "Patron message chronology"
            },
            description: {
                fr: "Classe les messages lecteur affichés par Koha sur les écrans de circulation et de fiche lecteur.",
                en: "Orders patron messages displayed by Koha on circulation and patron detail pages."
            },
            category: {
                fr: "Lecteurs / communication",
                en: "Patrons / communication"
            },
            supportedPages: ["circ.circulation", "members.moremember"],
            prerequisites: [],
            dependencies: [],
            defaults: clone(DEFAULT_CONFIG),
            validate: validateConfig,
            schema: [
                {
                    type: "section",
                    id: "settings",
                    label: { fr: "Réglages", en: "Settings" },
                    fields: [
                        {
                            key: "enabled",
                            type: "boolean",
                            label: {
                                fr: "Activer le classement des messages lecteur",
                                en: "Enable patron message ordering"
                            }
                        },
                        {
                            key: "order",
                            type: "select",
                            label: {
                                fr: "Ordre d'affichage",
                                en: "Display order"
                            },
                            options: [
                                {
                                    value: "oldest-first",
                                    label: {
                                        fr: "Plus ancien → plus récent — historique Dracénie",
                                        en: "Oldest → newest — Dracénie historical default"
                                    }
                                },
                                {
                                    value: "newest-first",
                                    label: {
                                        fr: "Plus récent → plus ancien — ordre Koha historique",
                                        en: "Newest → oldest — historical Koha order"
                                    }
                                }
                            ]
                        }
                    ]
                }
            ],
            focusContext: function (main) {
                if (!main) return;
                const section = main.querySelector('[data-pmk-section-id="settings"]');
                if (section) {
                    window.setTimeout(function () {
                        section.scrollIntoView({ block: "start", behavior: "smooth" });
                    }, 0);
                }
            }
        };
    }

    function registerModule() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") return false;
        try {
            window.PMKConfig.registerModule(buildModuleDefinition());
        } catch (_) {
            return false;
        }

        if (typeof window.PMKConfig.subscribe === "function" && !unsubscribeConfig) {
            try {
                unsubscribeConfig = window.PMKConfig.subscribe(MODULE_ID, function (config) {
                    applyConfig(config);
                });
            } catch (_) {}
        }
        return true;
    }

    function loadConfig() {
        registerModule();
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== "function") {
            return Promise.resolve(clone(DEFAULT_CONFIG));
        }
        return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
            .then(normalizeConfig)
            .catch(function () {
                return clone(DEFAULT_CONFIG);
            });
    }

    function applyConfig(config) {
        currentConfig = normalizeConfig(config);
        restoreAll();

        if (!isSupportedPage() || currentConfig.enabled === false) return false;

        const lists = findMessageLists();
        lists.forEach(function (list) {
            rememberNativeOrder(list);
            applyOrderToList(list, currentConfig.order);
        });
        return lists.length > 0;
    }

    function start() {
        if (registerModule()) {
            loadConfig().then(applyConfig);
            return;
        }

        /* Sans PMK, on conserve exactement le comportement historique. */
        applyConfig(DEFAULT_CONFIG);

        const onReady = function () {
            window.removeEventListener("pmk:config-ready", onReady);
            loadConfig().then(applyConfig);
        };
        window.addEventListener("pmk:config-ready", onReady, { once: true });

        window.setTimeout(function () {
            if (window.PMKConfig) loadConfig().then(applyConfig);
        }, 6000);
    }

    window.PMK116PatronMessageChronology = {
        moduleId: MODULE_ID,
        version: MODULE_VERSION,
        defaults: clone(DEFAULT_CONFIG),
        refresh: function () {
            return loadConfig().then(applyConfig);
        },
        restore: restoreAll
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})(window, document);

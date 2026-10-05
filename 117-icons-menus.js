/*
 Nom du fichier : 117-icons-menus.js
 Module PMK : menu-icons
 Version : 3.1.0-preplugin
 Date : 2026-09-21

 Evolution PMK du script historique 117-icons-menus.js.

 OBJECTIFS :
 - conserver strictement le rendu historique par défaut sur .sidebar_menu ;
 - rendre éditables les correspondances historiques libellé -> icône ;
 - permettre des règles personnalisées illimitées sur n'importe quel menu ou sous-menu Koha ;
 - permettre de cibler un élément par picker, sélecteur CSS ou texte ;
 - permettre de remplacer, ajouter ou masquer une icône ;
 - supporter Font Awesome et une image personnalisée ;
 - bibliothèque visuelle Font Awesome avec recherche et aperçu ;
 - conserver activation/désactivation à chaud et restauration propre du DOM ;
 - aucune dépendance CDN ajoutée.
*/
(function (window, document) {
    "use strict";

    if (!window || !document) return;
    if (window.__PMK117MenuIconsV3) return;
    window.__PMK117MenuIconsV3 = true;

    const MODULE_ID = "menu-icons";
    const MODULE_VERSION = "3.1.0-preplugin";
    const PICKER_STYLE_ID = "pmk117-picker-style";
    const PENDING_PICK_KEY = "PimpMyKoha.117.pendingPick.v1";
    const CUSTOM_ICON_ATTR = "data-pmk117-owned";
    const HOST_ATTR = "data-pmk117-host";

    const LEGACY_ICON_MAP = Object.freeze({
                // --- Accueil et Liens Généraux ---
                "Accueil Outils": "fas fa-home",
                "Page d'accueil Acquisitions": "fas fa-shopping-cart",
    
                // --- Menu Adhérents & Fiche Utilisateur ---
                "Prêter": "fas fa-book",
                "Prêt par lot": "fas fa-layer-group",
                "Détails": "fas fa-info-circle",
                "Comptabilité": "fas fa-dollar-sign",
                "Historique de prêts": "fas fa-history",
                "Historique des réservations": "fas fa-clock",
                "Log des modifications": "fas fa-edit",
                "Notifications": "fas fa-bell",
                "Statistiques": "fas fa-chart-bar",
                "Fichiers": "fas fa-folder",
                "Suggestions d'achat": "fas fa-lightbulb",
                "Suggestions": "fas fa-lightbulb",
                "Listes d'adhérents": "fas fa-users-cog",
                "Clubs d'adhérents": "fas fa-puzzle-piece",
                "Commentaires": "fas fa-comments",
                "Importer des adhérents": "fas fa-user-plus",
                "Notifications et tickets": "fas fa-envelope-open-text",
                "Paramétrage des relances": "fas fa-exclamation-circle",
                "Créateur de cartes d'adhérent": "fas fa-id-badge",
                "Suppression et anonymisation des adhérents par lot": "fas fa-user-slash",
                "Modification d'adhérents par lot": "fas fa-user-edit",
                "Catégories d'adhérents": "fas fa-address-card",
                "Types d'attributs d'adhérent": "fas fa-id-card",
                "Types de suspension d'adhérent": "fas fa-ban",
    
                // --- Circulation & Libre service ---
                "Circulation en libre accès (SIP2)": "fas fa-exchange-alt",
                "Rendre": "fas fa-arrow-left",
                "Renouveler": "fas fa-redo",
                "Choisir un site": "fas fa-map-marker-alt",
                "Catalogage rapide": "fas fa-bolt",
                "Modification des dates de retour par lot": "fas fa-calendar-minus",
                "Modifier en lot des réservations": "fas fa-calendar-alt",
                "Collections tournantes": "fas fa-sync",
                "Règles de circulation et de pénalités": "fas fa-gavel",
                "Limites de transfert réseau": "fas fa-exchange-alt",
                "Matrice des coûts de transport": "fas fa-money-bill-alt",
                "Alertes de circulation": "fas fa-bell",
                "Collecte sur rendez-vous": "fas fa-calendar-check",
    
                // --- Réservations ---
                "File de réservations": "fas fa-list-ol",
                "Réservations à traiter": "fas fa-bookmark",
                "Réservations mises de coté": "fas fa-archive",
                "Ratios de réservation": "fas fa-percentage",
    
                // --- Transferts ---
                "Transférer": "fas fa-random",
                "Transferts à envoyer": "fas fa-paper-plane",
                "Transferts à recevoir": "fas fa-download",
    
                // --- Retards ---
                "Retards avec amendes": "fas fa-exclamation-triangle",
                "Retards": "fas fa-clock",
    
                // --- Périodiques ---
                "Réclamations": "fas fa-exclamation-circle",
                "Vérifier l'expiration": "fas fa-calendar-times",
                "Gestion des périodicités": "fas fa-hourglass-half",
                "Gestion des modèles de numérotation": "fas fa-list-ol",
                "Rechercher dans Mana-KB": "fas fa-search-plus",
                "Gestion des champs des abonnements": "fas fa-sliders-h",
                "Assistant statistiques sur les périodiques": "fas fa-chart-line",
    
                // --- Acquisitions ---
                "Commandes en retard": "fas fa-hourglass-start",
                "Factures": "fas fa-file-invoice-dollar",
                "Messages EDIFACT": "fas fa-exchange-alt",
                "Assistant statistiques Acquisitions": "fas fa-chart-bar",
                "Commandes par poste budgétaire": "fas fa-chart-pie",
                "Monnaies": "fas fa-coins",
                "Gérer les champs des factures": "fas fa-file-invoice",
                "Gérer les champs des paniers de commandes": "fas fa-shopping-basket",
                "Gérer les champs des lignes de commandes": "fas fa-list-ul",
    
                // --- Rapports Guidés ---
                "Rapports sauvegardés": "fas fa-save",
                "Voir dictionnaire": "fas fa-book",
                "Bibliothèque de rapports Koha": "fas fa-code-branch",
                "Schéma de la base de données Koha": "fas fa-database",
    
                // --- Administration : Catalogue & Grilles MARC ---
                "Grille des notices bibliographiques MARC": "fas fa-th-list",
                "Test de grille de catalogage bibliagement MARC": "fas fa-vial",
                "Grilles des notices d'autorité": "fas fa-user-shield",
                "Liens Koha => MARC": "fas fa-link",
                "Configuration de la classification": "fas fa-folder-tree",
                "Règles de concordance": "fas fa-compress-arrows-alt",
                "Sources de notices": "fas fa-search-plus",
                "Règles de fusion de notices": "fas fa-clone",
                "Configuration des Sets OAI": "fas fa-cubes",
                "Champs de recherche des exemplaires": "fas fa-search",
                "Configuration du moteur de recherche (Elasticsearch)": "fas fa-search",
                "Normal": "fas fa-book",
                "MARC": "fas fa-database",
                "Marc avec étiquettes": "fas fa-tags",
                "Exemplaires": "fas fa-copy",
                "Rotation des stocks": "fas fa-sync-alt",
                "Rotation": "fas fa-sync-alt",
                "Modifications d'exemplaires par ancienneté": "fas fa-history",
                
                // Imports / Exports catalogue
                "Import des notices dans le réservoir": "fas fa-upload",
                "Gérer les notices importées dans le réservoir": "fas fa-tasks",
                "Télécharger des notices dans le réservoir": "fas fa-upload",
                "Gestion des notices téléchargées": "fas fa-tasks",
                "Exporter les données du catalogue": "fas fa-download",
                
                // Modifications par lot catalogue
                "Modification d'exemplaires par lots": "fas fa-edit",
                "Suppression d'exemplaires par lots": "fas fa-trash",
                "Modification de notices par lot": "fas fa-edit",
                "Suppression de notices en lot": "fas fa-trash",
                "Suppression de notices par lot": "fas fa-trash",
                "Modèles de transformation MARC": "fas fa-sliders-h",
                "Mots-clés": "fas fa-tags",
    
                // Rapports globaux
                "Inventaire/Récolement": "fas fa-clipboard-list",
                "Inventaire": "fas fa-clipboard-list",
                "Récolement": "fas fa-clipboard-list",
                "Problèmes de catalogage": "fas fa-exclamation-circle",
    
                // --- Administration : Paramètres de Base & Comptabilité ---
                "Préférences système": "fas fa-cog",
                "Préférences": "fas fa-cog",
                "Bibliothèques": "fas fa-building",
                "Groupes de bibliothèques": "fas fa-warehouse",
                "Types de document": "fas fa-file-alt",
                "Valeurs autorisées": "fas fa-check-square",
                "Types de débit": "fas fa-money-check-alt",
                "Types de crédit": "fas fa-credit-card",
                "Villes et communes": "fas fa-map-marker-alt",
    
                // --- Administration : Paramètres Acquisitions ---
                "Devises et taux de change": "fas fa-money-bill-wave",
                "Budgets": "fas fa-wallet",
                "Postes budgétaires": "fas fa-chart-pie",
                "Comptes EDI": "fas fa-laptop-code",
                "EAN des bibliothèques": "fas fa-barcode",
    
                // --- Administration : Paramètres divers ---
                "Fournisseurs d'identité": "fas fa-id-card-alt",
                "Serveurs Z39.50/SRU": "fas fa-server",
                "Entrepôts OAI": "fas fa-archive",
                "Serveurs SMTP": "fas fa-server",
                "Transferts de fichiers": "fas fa-file-export",
                "Voulez-vous dire ?": "fas fa-question-circle",
                "Configurer les colonnes": "fas fa-columns",
                "Alertes sonores": "fas fa-volume-up",
                "Partager vos statistiques d'utilisation": "fas fa-chart-line",
                "Partager du contenu avec Mana KB": "fas fa-cloud-upload-alt",
                "Champs supplémentaires": "fas fa-plus-square",
                "Raccourcis clavier": "fas fa-keyboard",
    
                // --- Outils & Plugins & Tâches ---
                "Créateur d'étiquettes rapide": "fas fa-tags",
                "Créateur d'étiquettes": "fas fa-tag",
                "Générateur d'images de codes à barres": "fas fa-barcode",
                "Téléverser une image de couverture locale": "fas fa-image",
                "Calendrier": "fas fa-calendar-alt",
                "profils CSV": "fas fa-file-csv",
                "Visualiseur des logs": "fas fa-history",
                "Annonces": "fas fa-bullhorn",
                "Personnalisations HTML": "fas fa-code",
                "Pages": "fas fa-file-code",
                "Éditeur de citations": "fas fa-quote-left",
                "Outil de Plugins": "fas fa-plug",
                "Plugins": "fas fa-plug",
                "Téléchargements": "fas fa-download",
                "Accès aux fichiers": "fas fa-folder-open",
                "Tâches": "fas fa-tasks",
                "Acquisitions": "fas fa-shopping-cart",
                "Administration": "fas fa-cog",
                "Configuration": "fas fa-cogs",
                "Contrôle des autorités": "fas fa-user-shield",
                "Autorités": "fa fa-fw fa-link",
                "Catalogage": "fas fa-book-open",
                "Circulation": "fas fa-exchange-alt",
                "Contenu enrichi": "fas fa-star",
                "Gestion des ressources électroniques": "fas fa-file-alt",
                "Internationalisation": "fas fa-globe",
                "Prêt entre bibliothèques": "fas fa-external-link-alt",
                "Usage local": "fas fa-home",
                "Logs": "fas fa-file-archive",
                "Catalogue Public en Ligne (OPAC)": "fas fa-book-reader",
                "Adhérents": "fas fa-users",
                "Conservation": "fas fa-shield-alt",
                "Recherche": "fas fa-search",
                "Périodiques": "fas fa-newspaper",
                "Interface professionnelle": "fas fa-desktop",
                "Outils": "fas fa-tools",
                "Services web": "fas fa-plug",
    
                // --- Icône par défaut ---
                "default": "fas fa-thumbtack"
            });


    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function buildLegacyRules(iconMap) {
        return Object.keys(iconMap || {})
            .filter(function (key) { return key !== "default"; })
            .map(function (text, index) {
                return {
                    id: "legacy-" + String(index + 1),
                    enabled: true,
                    text: text,
                    iconClass: String(iconMap[text] || "")
                };
            });
    }

    const DEFAULT_CONFIG = {
        enabled: true,
        observeDom: true,
        observeDelayMs: 100,
        legacy: {
            enabled: true,
            overrideExistingIcons: false,
            defaultIconClass: String(LEGACY_ICON_MAP.default || "fas fa-thumbtack"),
            rules: buildLegacyRules(LEGACY_ICON_MAP)
        },
        customRules: []
    };

    let currentConfig = deepClone(DEFAULT_CONFIG);
    let registered = false;
    let unsubscribe = null;
    let observer = null;
    let observerTimer = 0;
    let runtimeRecords = [];

    function cleanText(value) {
        return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    }

    function iconLabelFromClass(iconClass) {
        const token = String(iconClass || "").split(/\s+/).filter(function (part) { return /^fa-/.test(part); }).pop() || "fa-circle";
        return token.replace(/^fa-/, "").replace(/-/g, " ");
    }

    function buildFontAwesomeLibrary() {
        const seen = new Set();
        const items = [];
        Object.keys(LEGACY_ICON_MAP || {}).forEach(function (key) {
            const cls = cleanText(LEGACY_ICON_MAP[key]);
            if (!cls || seen.has(cls)) return;
            seen.add(cls);
            items.push({
                className: cls,
                label: key === "default" ? "Punaise / défaut" : key,
                search: (key + " " + iconLabelFromClass(cls) + " " + cls).toLowerCase()
            });
        });
        items.sort(function (a, b) {
            return a.label.localeCompare(b.label, "fr", { sensitivity: "base" });
        });
        return items;
    }

    const FONT_AWESOME_LIBRARY = buildFontAwesomeLibrary();

    function openFontAwesomeLibrary(options) {
        options = options || {};
        const lang = options.language === "en" ? "en" : "fr";
        const current = cleanText(options.current || "");
        return new Promise(function (resolve, reject) {
            const previous = document.getElementById("pmk117-icon-library");
            if (previous) previous.remove();

            const overlay = document.createElement("div");
            overlay.id = "pmk117-icon-library";
            overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center;padding:16px";

            const panel = document.createElement("div");
            panel.style.cssText = "width:min(880px,96vw);max-height:88vh;background:#fff;border-radius:8px;box-shadow:0 12px 40px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden";
            overlay.appendChild(panel);

            const header = document.createElement("div");
            header.style.cssText = "display:flex;gap:10px;align-items:center;padding:12px 14px;border-bottom:1px solid #ddd";
            const title = document.createElement("strong");
            title.textContent = lang === "en" ? "Choose a Font Awesome icon" : "Choisir une icône Font Awesome";
            title.style.flex = "1";
            const close = document.createElement("button");
            close.type = "button";
            close.className = "btn btn-sm btn-outline-secondary";
            close.textContent = "×";
            header.append(title, close);
            panel.appendChild(header);

            const search = document.createElement("input");
            search.type = "search";
            search.className = "form-control form-control-sm";
            search.placeholder = lang === "en" ? "Search: book, user, calendar…" : "Rechercher : livre, utilisateur, calendrier…";
            search.style.cssText = "margin:12px 14px;width:calc(100% - 28px)";
            panel.appendChild(search);

            const count = document.createElement("div");
            count.style.cssText = "padding:0 14px 8px;color:#6c757d;font-size:12px";
            panel.appendChild(count);

            const grid = document.createElement("div");
            grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(125px,1fr));gap:8px;padding:0 14px 14px;overflow:auto";
            panel.appendChild(grid);

            function cleanup() {
                document.removeEventListener("keydown", onKey, true);
                if (overlay.isConnected) overlay.remove();
            }
            function cancel() {
                cleanup();
                reject(new Error("picker_cancelled"));
            }
            function choose(item) {
                cleanup();
                resolve(item.className);
            }
            function onKey(event) {
                if (event.key === "Escape") {
                    event.preventDefault();
                    cancel();
                }
            }
            function render() {
                const q = cleanText(search.value).toLowerCase();
                const filtered = FONT_AWESOME_LIBRARY.filter(function (item) {
                    return !q || item.search.indexOf(q) !== -1;
                });
                count.textContent = String(filtered.length) + (lang === "en" ? " icons" : " icônes");
                grid.innerHTML = "";
                filtered.forEach(function (item) {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.className = "btn btn-light";
                    button.style.cssText = "min-height:74px;border:1px solid #ddd;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:8px;white-space:normal";
                    if (item.className === current) {
                        button.style.outline = "2px solid #0d6efd";
                        button.style.outlineOffset = "1px";
                    }
                    const icon = document.createElement("i");
                    icon.className = item.className;
                    icon.style.fontSize = "22px";
                    icon.setAttribute("aria-hidden", "true");
                    const label = document.createElement("span");
                    label.textContent = item.label;
                    label.style.cssText = "font-size:11px;line-height:1.15;text-align:center";
                    button.append(icon, label);
                    button.title = item.className;
                    button.addEventListener("click", function () { choose(item); });
                    grid.appendChild(button);
                });
            }

            close.addEventListener("click", cancel);
            overlay.addEventListener("click", function (event) { if (event.target === overlay) cancel(); });
            search.addEventListener("input", render);
            document.addEventListener("keydown", onKey, true);
            document.body.appendChild(overlay);
            render();
            window.setTimeout(function () { search.focus(); }, 0);
        });
    }

    function getLegacyRuleFromPath(root, path) {
        if (!root || !root.legacy || !Array.isArray(root.legacy.rules) || !Array.isArray(path)) return null;
        const pos = path.indexOf("rules");
        if (pos === -1) return null;
        const index = Number(path[pos + 1]);
        return Number.isInteger(index) ? root.legacy.rules[index] : null;
    }

    function renderFaPreview(iconClass, label) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid #ddd;border-radius:6px;background:#f8f9fa";
        const icon = document.createElement("i");
        icon.className = cleanText(iconClass) || "fas fa-circle";
        icon.style.fontSize = "22px";
        icon.setAttribute("aria-hidden", "true");
        const text = document.createElement("span");
        text.textContent = label || cleanText(iconClass) || "—";
        wrap.append(icon, text);
        return wrap;
    }

    function renderLegacyDefaultPreview(context) {
        const root = context && context.rootObject;
        return renderFaPreview(root && root.legacy && root.legacy.defaultIconClass, cleanText(root && root.legacy && root.legacy.defaultIconClass));
    }

    function renderLegacyRulePreview(context) {
        const rule = getLegacyRuleFromPath(context && context.rootObject, context && context.fieldPath || []);
        return renderFaPreview(rule && rule.iconClass, rule && rule.text);
    }

    function renderCustomRulePreview(context) {
        const rule = getCustomRuleFromPath(context && context.rootObject, context && context.fieldPath || []);
        if (!rule) return renderFaPreview("fas fa-circle", "—");
        if (rule.iconType === "image") {
            const wrap = document.createElement("div");
            wrap.style.cssText = "display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid #ddd;border-radius:6px;background:#f8f9fa";
            if (rule.imageUrl) {
                const img = document.createElement("img");
                img.src = rule.imageUrl;
                img.alt = "";
                img.style.cssText = "width:" + clampNumber(rule.sizePx,16,8,96) + "px;height:" + clampNumber(rule.sizePx,16,8,96) + "px;object-fit:contain";
                wrap.appendChild(img);
            }
            const text = document.createElement("span");
            text.textContent = rule.imageUrl || (context.language === "en" ? "No image URL" : "Aucune URL d’image");
            wrap.appendChild(text);
            return wrap;
        }
        if (rule.iconType === "none") {
            const node = document.createElement("div");
            node.textContent = context.language === "en" ? "No icon" : "Aucune icône";
            node.style.cssText = "padding:8px 10px;border:1px solid #ddd;border-radius:6px;background:#f8f9fa";
            return node;
        }
        const preview = renderFaPreview(rule.iconClass, rule.iconClass);
        const icon = preview.querySelector("i");
        if (icon) {
            icon.style.fontSize = clampNumber(rule.sizePx,16,8,96) + "px";
            if (rule.color) icon.style.color = rule.color;
        }
        return preview;
    }

    async function chooseLegacyDefaultIcon(context) {
        const root = context && context.rootObject;
        if (!root || !root.legacy) return { changed:false };
        const selected = await openFontAwesomeLibrary({ current:root.legacy.defaultIconClass, language:context.language });
        root.legacy.defaultIconClass = selected;
        return { changed:true, refresh:true };
    }

    async function chooseLegacyRuleIcon(context) {
        const rule = getLegacyRuleFromPath(context && context.rootObject, context && context.fieldPath || []);
        if (!rule) return { changed:false };
        const selected = await openFontAwesomeLibrary({ current:rule.iconClass, language:context.language });
        rule.iconClass = selected;
        return { changed:true, refresh:true };
    }

    async function chooseCustomRuleIcon(context) {
        const rule = getCustomRuleFromPath(context && context.rootObject, context && context.fieldPath || []);
        if (!rule) return { changed:false };
        const selected = await openFontAwesomeLibrary({ current:rule.iconClass, language:context.language });
        rule.iconType = "fa";
        rule.iconClass = selected;
        return { changed:true, refresh:true };
    }

    function clampNumber(value, fallback, min, max) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, n));
    }

    function splitPages(value) {
        if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
        return String(value || "")
            .split(/[\n,;]+/)
            .map(cleanText)
            .filter(Boolean);
    }

    function normalizePath(value) {
        const raw = cleanText(value);
        if (!raw || raw === "*" || raw.toLowerCase() === "all") return raw;
        try {
            const url = new URL(raw, window.location.origin);
            return url.pathname;
        } catch (_) {
            return raw.charAt(0) === "/" ? raw : "/" + raw;
        }
    }

    function normalizeLegacyRules(rawRules, rawIconMap) {
        const base = buildLegacyRules(LEGACY_ICON_MAP);
        const mapByText = new Map(base.map(function (rule) { return [rule.text, rule]; }));

        if (rawIconMap && typeof rawIconMap === "object") {
            Object.keys(rawIconMap).forEach(function (key) {
                if (key === "default") return;
                if (mapByText.has(key)) {
                    mapByText.get(key).iconClass = cleanText(rawIconMap[key]) || mapByText.get(key).iconClass;
                }
            });
        }

        if (!Array.isArray(rawRules) || !rawRules.length) return base;

        const out = [];
        rawRules.forEach(function (rule, index) {
            if (!rule || typeof rule !== "object") return;
            const text = cleanText(rule.text || rule.label);
            if (!text) return;
            out.push({
                id: cleanText(rule.id) || ("legacy-custom-" + String(index + 1)),
                enabled: rule.enabled !== false,
                text: text,
                iconClass: cleanText(rule.iconClass || rule.className || (mapByText.get(text) && mapByText.get(text).iconClass))
            });
        });

        return out.length ? out : base;
    }

    function normalizeCustomRule(rule, index) {
        rule = rule && typeof rule === "object" ? rule : {};
        const iconType = ["fa", "image", "none"].indexOf(rule.iconType) !== -1 ? rule.iconType : "fa";
        const targetMode = ["selector", "text"].indexOf(rule.targetMode) !== -1 ? rule.targetMode : "selector";
        const textMode = ["exact", "contains"].indexOf(rule.textMode) !== -1 ? rule.textMode : "exact";
        const position = rule.position === "append" ? "append" : "prepend";
        return {
            id: cleanText(rule.id) || ("rule-" + String(index + 1)),
            enabled: rule.enabled !== false,
            name: cleanText(rule.name || rule.label),
            pages: cleanText(rule.pages || "*") || "*",
            targetMode: targetMode,
            selector: cleanText(rule.selector || rule.targetSelector),
            targetName: cleanText(rule.targetName),
            text: cleanText(rule.text || rule.matchText),
            textMode: textMode,
            menuSelector: cleanText(rule.menuSelector) ||
                'nav a, .sidebar_menu a, .navbar a, .dropdown-menu a, [role="menu"] a, [role="menuitem"]',
            iconType: iconType,
            iconClass: cleanText(rule.iconClass || "fas fa-circle"),
            imageUrl: cleanText(rule.imageUrl),
            sizePx: clampNumber(rule.sizePx, 16, 8, 96),
            color: cleanText(rule.color),
            position: position,
            replaceExisting: rule.replaceExisting !== false
        };
    }

    function normalizeConfig(raw) {
        raw = raw && typeof raw === "object" ? raw : {};
        const legacyRaw = raw.legacy && typeof raw.legacy === "object" ? raw.legacy : {};
        const legacyRules = normalizeLegacyRules(
            legacyRaw.rules || raw.legacyRules,
            raw.iconMap
        );
        const customRulesRaw = Array.isArray(raw.customRules)
            ? raw.customRules
            : (Array.isArray(raw.rules) ? raw.rules : []);

        return {
            enabled: raw.enabled !== false,
            observeDom: raw.observeDom !== false,
            observeDelayMs: clampNumber(raw.observeDelayMs, 100, 30, 2000),
            legacy: {
                enabled: legacyRaw.enabled !== false,
                overrideExistingIcons: legacyRaw.overrideExistingIcons === true,
                defaultIconClass: cleanText(
                    legacyRaw.defaultIconClass ||
                    (raw.iconMap && raw.iconMap.default) ||
                    LEGACY_ICON_MAP.default ||
                    "fas fa-thumbtack"
                ),
                rules: legacyRules
            },
            customRules: customRulesRaw.map(normalizeCustomRule)
        };
    }

    function pageMatches(rule) {
        const pages = splitPages(rule && rule.pages);
        if (!pages.length) return true;
        const current = window.location.pathname;
        return pages.some(function (page) {
            const normalized = normalizePath(page);
            return normalized === "*" || normalized === "all" || normalized === current;
        });
    }

    function recordInserted(node) {
        runtimeRecords.push({ type: "inserted", node: node });
    }

    function recordMutation(node) {
        if (!node) return;
        runtimeRecords.push({
            type: "mutation",
            node: node,
            className: node.className && typeof node.className === "string" ? node.className : null,
            style: node.getAttribute ? node.getAttribute("style") : null,
            hidden: "hidden" in node ? Boolean(node.hidden) : null,
            ariaHidden: node.getAttribute ? node.getAttribute("aria-hidden") : null,
            owned: node.getAttribute ? node.getAttribute(CUSTOM_ICON_ATTR) : null,
            host: node.getAttribute ? node.getAttribute(HOST_ATTR) : null
        });
    }

    function restoreMutation(record) {
        const node = record && record.node;
        if (!node || !node.isConnected) return;
        if (record.className !== null) node.className = record.className;
        if (record.style === null) node.removeAttribute("style");
        else node.setAttribute("style", record.style);
        if (record.hidden !== null) node.hidden = record.hidden;
        if (record.ariaHidden === null) node.removeAttribute("aria-hidden");
        else node.setAttribute("aria-hidden", record.ariaHidden);
        if (record.owned === null) node.removeAttribute(CUSTOM_ICON_ATTR);
        else node.setAttribute(CUSTOM_ICON_ATTR, record.owned);
        if (record.host === null) node.removeAttribute(HOST_ATTR);
        else node.setAttribute(HOST_ATTR, record.host);
    }

    function restoreRuntime() {
        for (let i = runtimeRecords.length - 1; i >= 0; i -= 1) {
            const record = runtimeRecords[i];
            if (!record) continue;
            if (record.type === "inserted") {
                if (record.node && record.node.parentNode) record.node.parentNode.removeChild(record.node);
            } else if (record.type === "mutation") {
                restoreMutation(record);
            }
        }
        runtimeRecords = [];
    }

    function findLegacyMatch(linkText) {
        const rules = currentConfig.legacy.rules || [];
        for (let i = 0; i < rules.length; i += 1) {
            const rule = rules[i];
            if (!rule || rule.enabled === false) continue;
            const text = cleanText(rule.text);
            if (text && linkText.indexOf(text) !== -1) {
                return { found: true, iconClass: cleanText(rule.iconClass) };
            }
        }
        return {
            found: false,
            iconClass: cleanText(currentConfig.legacy.defaultIconClass) || "fas fa-thumbtack"
        };
    }

    function applyHistoricalBehavior() {
        if (!currentConfig.legacy.enabled) return 0;
        const sidebarMenus = document.querySelectorAll(".sidebar_menu");
        if (!sidebarMenus.length) return 0;

        let touched = 0;
        sidebarMenus.forEach(function (menu) {
            menu.querySelectorAll("ul li a").forEach(function (link) {
                const linkText = cleanText(link.textContent);
                let existingIcon = link.querySelector("i");
                const match = findLegacyMatch(linkText);
                const targetClass = match.found
                    ? (match.iconClass || currentConfig.legacy.defaultIconClass)
                    : currentConfig.legacy.defaultIconClass;

                if (existingIcon) {
                    const isHistoricalPin = existingIcon.classList.contains("fa-thumbtack");
                    if (!currentConfig.legacy.overrideExistingIcons && !isHistoricalPin) return;
                    if (!match.found && isHistoricalPin) return;
                    if (!targetClass || existingIcon.className === targetClass) return;
                    recordMutation(existingIcon);
                    existingIcon.className = targetClass;
                    existingIcon.setAttribute(CUSTOM_ICON_ATTR, "legacy");
                    touched += 1;
                    return;
                }

                if (!targetClass) return;
                const icon = document.createElement("i");
                icon.className = targetClass;
                icon.style.marginRight = "8px";
                icon.setAttribute(CUSTOM_ICON_ATTR, "legacy");
                link.prepend(icon);
                recordInserted(icon);
                touched += 1;
            });
        });
        return touched;
    }

    function cssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
        return String(value).replace(/[^a-zA-Z0-9_-]/g, function (c) { return "\\" + c; });
    }

    function stableSelector(element) {
        if (!element || element.nodeType !== 1) return "";

        if (element.id) {
            try {
                const byId = "#" + cssEscape(element.id);
                if (document.querySelectorAll(byId).length === 1) return byId;
            } catch (_) {}
        }

        if (element.tagName === "A") {
            const href = element.getAttribute("href");
            if (href) {
                const escapedHref = String(href).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
                const exact = 'a[href="' + escapedHref + '"]';
                try {
                    if (document.querySelectorAll(exact).length === 1) return exact;
                } catch (_) {}
            }
        }

        const parts = [];
        let node = element;
        while (node && node !== document.body && parts.length < 7) {
            let part = node.tagName.toLowerCase();
            if (node.id) {
                part += "#" + cssEscape(node.id);
                parts.unshift(part);
                break;
            }
            const classes = Array.from(node.classList || []).filter(function (name) {
                return !/^pmk|^active$|^selected$|^hover$|^focus$|^show$|^open$/.test(name);
            });
            if (classes.length) part += "." + cssEscape(classes[0]);
            const parent = node.parentElement;
            if (parent && !classes.length) {
                const peers = Array.from(parent.children).filter(function (x) { return x.tagName === node.tagName; });
                if (peers.length > 1) part += ":nth-of-type(" + (peers.indexOf(node) + 1) + ")";
            }
            parts.unshift(part);
            node = parent;
        }
        return parts.join(" > ");
    }

    function resolveRuleTargets(rule) {
        if (!rule || rule.enabled === false || !pageMatches(rule)) return [];

        if (rule.targetMode === "text") {
            let candidates = [];
            try { candidates = Array.from(document.querySelectorAll(rule.menuSelector)); }
            catch (_) { return []; }
            const wanted = cleanText(rule.text);
            if (!wanted) return [];
            return candidates.filter(function (element) {
                const actual = cleanText(element.textContent);
                return rule.textMode === "contains" ? actual.indexOf(wanted) !== -1 : actual === wanted;
            });
        }

        if (!rule.selector) return [];
        try {
            return Array.from(document.querySelectorAll(rule.selector));
        } catch (_) {
            return [];
        }
    }

    function findExistingIcon(host) {
        if (!host || !host.querySelector) return null;
        return host.querySelector(
            'i[class*="fa-"], i.fa, i.fas, i.far, i.fab, span[class*="fa-"], svg.svg-inline--fa, [' + CUSTOM_ICON_ATTR + ']'
        );
    }

    function applyVisualStyles(node, rule) {
        if (!node || !node.style) return;
        const size = clampNumber(rule.sizePx, 16, 8, 96);
        if (rule.iconType === "image") {
            node.style.width = size + "px";
            node.style.height = size + "px";
            node.style.objectFit = "contain";
            node.style.verticalAlign = "middle";
        } else {
            node.style.fontSize = size + "px";
            if (rule.color) node.style.color = rule.color;
        }
        node.style.marginRight = rule.position === "prepend" ? "8px" : "0";
        node.style.marginLeft = rule.position === "append" ? "8px" : "0";
    }

    function insertIcon(host, rule) {
        let node = null;
        if (rule.iconType === "image") {
            if (!rule.imageUrl) return null;
            node = document.createElement("img");
            node.src = rule.imageUrl;
            node.alt = "";
            node.setAttribute("aria-hidden", "true");
        } else if (rule.iconType === "fa") {
            if (!rule.iconClass) return null;
            node = document.createElement("i");
            node.className = rule.iconClass;
            node.setAttribute("aria-hidden", "true");
        }
        if (!node) return null;

        node.setAttribute(CUSTOM_ICON_ATTR, "custom");
        applyVisualStyles(node, rule);

        if (rule.position === "append") host.appendChild(node);
        else host.insertBefore(node, host.firstChild);

        recordInserted(node);
        return node;
    }

    function hideExistingIcon(icon) {
        if (!icon) return;
        recordMutation(icon);
        icon.style.setProperty("display", "none", "important");
        icon.setAttribute("aria-hidden", "true");
    }

    function applyCustomRuleToHost(host, rule) {
        if (!host || host.nodeType !== 1) return 0;
        const existing = findExistingIcon(host);

        if (rule.iconType === "none") {
            if (existing) {
                hideExistingIcon(existing);
                return 1;
            }
            return 0;
        }

        if (existing && !rule.replaceExisting) return 0;

        if (rule.iconType === "fa" && existing && existing.tagName === "I") {
            recordMutation(existing);
            existing.className = rule.iconClass;
            existing.setAttribute(CUSTOM_ICON_ATTR, "custom");
            applyVisualStyles(existing, rule);
            return 1;
        }

        if (existing && rule.replaceExisting) hideExistingIcon(existing);
        return insertIcon(host, rule) ? 1 : 0;
    }

    function applyCustomRules() {
        let touched = 0;
        (currentConfig.customRules || []).forEach(function (rule) {
            resolveRuleTargets(rule).forEach(function (host) {
                touched += applyCustomRuleToHost(host, rule);
            });
        });
        return touched;
    }

    function applyAll() {
        let touched = 0;
        touched += applyHistoricalBehavior();
        touched += applyCustomRules();
        return touched;
    }

    function stopObserver() {
        clearTimeout(observerTimer);
        observerTimer = 0;
        if (observer) observer.disconnect();
        observer = null;
    }

    function mutationIsOnlyOurs(mutation) {
        if (!mutation) return false;
        const added = Array.from(mutation.addedNodes || []);
        if (!added.length) return false;
        return added.every(function (node) {
            return node.nodeType === 1 && (
                node.hasAttribute && node.hasAttribute(CUSTOM_ICON_ATTR) ||
                node.querySelector && node.querySelector("[" + CUSTOM_ICON_ATTR + "]")
            );
        });
    }

    function startObserver() {
        if (observer || !document.body || !currentConfig.observeDom) return;
        observer = new MutationObserver(function (mutations) {
            if (mutations.length && mutations.every(mutationIsOnlyOurs)) return;
            clearTimeout(observerTimer);
            observerTimer = window.setTimeout(function () {
                stopObserver();
                restoreRuntime();
                applyAll();
                startObserver();
            }, currentConfig.observeDelayMs);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function applyConfig(rawConfig) {
        stopObserver();
        restoreRuntime();
        currentConfig = normalizeConfig(rawConfig);
        if (!currentConfig.enabled) return 0;
        const touched = applyAll();
        startObserver();
        return touched;
    }

    function validateConfig(config) {
        if (!config || typeof config !== "object") {
            return { ok: false, message: "Configuration invalide." };
        }

        const normalized = normalizeConfig(config);
        for (let i = 0; i < normalized.customRules.length; i += 1) {
            const rule = normalized.customRules[i];
            if (!rule.enabled) continue;
            if (rule.targetMode === "selector" && !rule.selector) {
                return { ok: false, message: "Une règle active doit avoir un élément ciblé ou un sélecteur CSS." };
            }
            if (rule.targetMode === "text" && !rule.text) {
                return { ok: false, message: "Une règle active en mode texte doit préciser le libellé à rechercher." };
            }
            if (rule.iconType === "fa" && !rule.iconClass) {
                return { ok: false, message: "Une règle Font Awesome active doit préciser une classe d’icône." };
            }
            if (rule.iconType === "image" && !rule.imageUrl) {
                return { ok: false, message: "Une règle image active doit préciser l’adresse de l’image." };
            }
        }

        return { ok: true };
    }

    function getCustomRuleFromPath(root, path) {
        if (!root || !Array.isArray(path)) return null;
        const pos = path.indexOf("customRules");
        if (pos === -1) return null;
        const index = Number(path[pos + 1]);
        return Number.isInteger(index) && Array.isArray(root.customRules) ? root.customRules[index] : null;
    }

    function resolveCustomRuleIndexFromFieldPath(path) {
        if (!Array.isArray(path)) return -1;
        const pos = path.indexOf("customRules");
        if (pos === -1) return -1;
        const index = Number(path[pos + 1]);
        return Number.isInteger(index) ? index : -1;
    }

    function firstConcretePage(rule) {
        const pages = splitPages(rule && rule.pages);
        for (let i = 0; i < pages.length; i += 1) {
            const path = normalizePath(pages[i]);
            if (path && path !== "*" && path !== "all") return path;
        }
        return "";
    }

    function pickElementOnCurrentPage() {
        return new Promise(function (resolve, reject) {
            const overlay = document.getElementById("pmk-config-overlay");
            const previousDisplay = overlay ? overlay.style.display : "";
            if (overlay) overlay.style.display = "none";

            let style = document.getElementById(PICKER_STYLE_ID);
            if (!style) {
                style = document.createElement("style");
                style.id = PICKER_STYLE_ID;
                style.textContent = [
                    ".pmk117-picker-hover{outline:3px solid #2f7d32!important;outline-offset:2px!important;cursor:crosshair!important;}",
                    ".pmk117-picker-banner{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483646;background:#fff;border:1px solid #bbb;border-radius:4px;padding:8px 12px;box-shadow:0 2px 8px rgba(0,0,0,.25);font-size:14px;max-width:calc(100vw - 20px)}"
                ].join("");
                document.head.appendChild(style);
            }

            const banner = document.createElement("div");
            banner.className = "pmk117-picker-banner";
            banner.textContent = (document.documentElement.lang || "").toLowerCase().startsWith("en")
                ? "Click the menu or submenu to customize — Escape to cancel"
                : "Cliquez sur le menu ou sous-menu à personnaliser — Échap pour annuler";
            document.body.appendChild(banner);

            let hovered = null;

            function normalizeTarget(target) {
                if (!target || !target.closest) return target;
                return target.closest("a, button, [role='menuitem']") || target;
            }

            function cleanup() {
                if (hovered) hovered.classList.remove("pmk117-picker-hover");
                document.removeEventListener("mouseover", over, true);
                document.removeEventListener("mouseout", out, true);
                document.removeEventListener("click", click, true);
                document.removeEventListener("keydown", key, true);
                if (banner.isConnected) banner.remove();
                if (overlay) overlay.style.display = previousDisplay;
            }

            function over(event) {
                if (hovered) hovered.classList.remove("pmk117-picker-hover");
                const target = normalizeTarget(event.target);
                hovered = target && target.nodeType === 1 ? target : null;
                if (hovered && !hovered.closest(".pmk117-picker-banner")) hovered.classList.add("pmk117-picker-hover");
            }

            function out(event) {
                const target = normalizeTarget(event.target);
                if (target && target.classList) target.classList.remove("pmk117-picker-hover");
            }

            function click(event) {
                if (event.target && event.target.closest && event.target.closest(".pmk117-picker-banner")) return;
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                const element = normalizeTarget(event.target);
                const selector = stableSelector(element);
                const targetName = cleanText(element && element.textContent).slice(0, 160) ||
                    (element && element.tagName ? element.tagName.toLowerCase() : "menu");

                cleanup();
                if (!selector) return reject(new Error("selector_unavailable"));

                resolve({
                    value: selector,
                    selector: selector,
                    targetName: targetName,
                    tag: element && element.tagName ? element.tagName.toLowerCase() : "",
                    href: element && element.getAttribute ? (element.getAttribute("href") || "") : ""
                });
            }

            function key(event) {
                if (event.key !== "Escape") return;
                event.preventDefault();
                cleanup();
                reject(new Error("picker_cancelled"));
            }

            document.addEventListener("mouseover", over, true);
            document.addEventListener("mouseout", out, true);
            document.addEventListener("click", click, true);
            document.addEventListener("keydown", key, true);
        });
    }

    function pickForConfig(context) {
        const rootObject = context && context.rootObject ? context.rootObject : null;
        const fieldPath = context && Array.isArray(context.fieldPath) ? context.fieldPath : [];
        const index = resolveCustomRuleIndexFromFieldPath(fieldPath);
        const rule = rootObject && Array.isArray(rootObject.customRules) && index >= 0
            ? rootObject.customRules[index]
            : null;
        const wantedPage = firstConcretePage(rule);

        if (wantedPage && window.location.pathname !== wantedPage) {
            const pending = {
                moduleId: MODULE_ID,
                ruleIndex: index,
                page: wantedPage,
                draft: deepClone(rootObject || DEFAULT_CONFIG),
                startedAt: Date.now()
            };
            try { sessionStorage.setItem(PENDING_PICK_KEY, JSON.stringify(pending)); } catch (_) {}
            window.location.href = window.location.origin + wantedPage;
            return new Promise(function () {});
        }

        return pickElementOnCurrentPage();
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
                const draft = normalizeConfig(pending.draft || DEFAULT_CONFIG);
                const index = Number(pending.ruleIndex);
                if (!Number.isInteger(index) || !draft.customRules[index]) return;

                draft.customRules[index].targetMode = "selector";
                draft.customRules[index].selector = picked.selector;
                draft.customRules[index].targetName = picked.targetName || picked.selector;
                if (!cleanText(draft.customRules[index].name)) {
                    draft.customRules[index].name = draft.customRules[index].targetName;
                }

                if (window.PMKConfig && typeof window.PMKConfig.saveConfig === "function") {
                    await window.PMKConfig.saveConfig(MODULE_ID, draft);
                    applyConfig(draft);
                    if (typeof window.PMKConfig.openAdmin === "function") {
                        await window.PMKConfig.openAdmin(MODULE_ID, { ruleIndex: index });
                    }
                } else {
                    applyConfig(draft);
                }
            } catch (_) {}
        }, 0);

        return true;
    }

    function moduleDefinition() {
        const legacyCount = buildLegacyRules(LEGACY_ICON_MAP).length;
        return {
            id: MODULE_ID,
            schemaVersion: 4,
            name: {
                fr: "Icônes des menus",
                en: "Menu icons"
            },
            description: {
                fr: "Personnalise les icônes de tous les menus et sous-menus Koha via une bibliothèque visuelle Font Awesome ou un logo personnalisé. Le rendu historique Dracénie reste le preset par défaut.",
                en: "Customizes Koha menu and submenu icons using a visual Font Awesome library or a custom logo. The historical Dracénie rendering remains the default preset."
            },
            category: {
                fr: "Navigation et interface",
                en: "Navigation and interface"
            },
            prerequisites: [],
            dependencies: [],
            defaults: deepClone(DEFAULT_CONFIG),
            validate: validateConfig,
            schema: [
                {
                    type: "section",
                    id: "activation",
                    label: { fr: "Activation", en: "Activation" },
                    description: {
                        fr: "Le module restaure proprement les icônes natives lorsqu’il est désactivé.",
                        en: "The module cleanly restores native icons when disabled."
                    },
                    fields: [
                        {
                            key: "enabled",
                            type: "boolean",
                            label: { fr: "Activer les icônes des menus", en: "Enable menu icons" }
                        },
                        {
                            key: "observeDom",
                            type: "boolean",
                            label: { fr: "Suivre les menus chargés dynamiquement", en: "Track dynamically loaded menus" }
                        }
                    ]
                },
                {
                    type: "section",
                    id: "historical",
                    label: { fr: "Preset historique Dracénie", en: "Historical Dracénie preset" },
                    description: {
                        fr: "Les " + legacyCount + " correspondances historiques sont conservées et deviennent modifiables. Par défaut, le comportement reste strictement celui du 117 historique.",
                        en: "The " + legacyCount + " historical mappings are preserved and can now be edited. By default, behavior remains identical to the historical script 117."
                    },
                    fields: [
                        {
                            key: "legacy.enabled",
                            type: "boolean",
                            label: { fr: "Utiliser le preset historique", en: "Use historical preset" }
                        },
                        {
                            key: "legacy.overrideExistingIcons",
                            type: "boolean",
                            label: { fr: "Remplacer aussi les icônes natives déjà présentes", en: "Also replace existing native icons" },
                            help: {
                                fr: "Désactivé par défaut pour reproduire le legacy. Les règles personnalisées peuvent toujours remplacer une icône précise.",
                                en: "Disabled by default to preserve legacy behavior. Custom rules can still replace a specific icon."
                            }
                        },
                        {
                            type: "custom",
                            label: { fr: "Icône par défaut", en: "Default icon" },
                            render: renderLegacyDefaultPreview
                        },
                        {
                            type: "action",
                            buttonLabel: { fr: "Choisir dans la bibliothèque d’icônes", en: "Choose from icon library" },
                            iconClass: "fas fa-search",
                            action: chooseLegacyDefaultIcon
                        },
                        {
                            key: "legacy.defaultIconClass",
                            type: "text",
                            advanced: true,
                            label: { fr: "Classe Font Awesome — saisie manuelle", en: "Font Awesome class — manual entry" },
                            help: {
                                fr: "Mode avancé. Défaut historique : fas fa-thumbtack.",
                                en: "Advanced mode. Historical default: fas fa-thumbtack."
                            }
                        },
                        {
                            key: "legacy.rules",
                            type: "repeater",
                            reorder: true,
                            removable: false,
                            canAdd: function () { return false; },
                            itemTitle: function (item, index) {
                                return cleanText(item && item.text) || ("Menu " + String(index + 1));
                            },
                            fields: [
                                {
                                    key: "enabled",
                                    type: "boolean",
                                    label: { fr: "Correspondance active", en: "Mapping enabled" }
                                },
                                {
                                    key: "text",
                                    type: "text",
                                    label: { fr: "Texte du menu", en: "Menu text" },
                                    help: {
                                        fr: "La première correspondance partielle gagne, comme dans le script historique.",
                                        en: "The first partial match wins, as in the historical script."
                                    }
                                },
                                {
                                    type: "custom",
                                    label: { fr: "Icône actuelle", en: "Current icon" },
                                    render: renderLegacyRulePreview
                                },
                                {
                                    type: "action",
                                    buttonLabel: { fr: "Choisir une icône", en: "Choose an icon" },
                                    iconClass: "fas fa-search",
                                    action: chooseLegacyRuleIcon
                                },
                                {
                                    key: "iconClass",
                                    type: "text",
                                    advanced: true,
                                    label: { fr: "Classe Font Awesome — saisie manuelle", en: "Font Awesome class — manual entry" },
                                    placeholder: { fr: "fas fa-book", en: "fas fa-book" }
                                }
                            ]
                        }
                    ]
                },
                {
                    type: "section",
                    id: "custom",
                    label: { fr: "Menus et sous-menus personnalisés", en: "Custom menus and submenus" },
                    description: {
                        fr: "Ajoutez autant de règles que nécessaire. Le picker permet de sélectionner directement n’importe quel menu ou sous-menu Koha, y compris hors des barres latérales.",
                        en: "Add as many rules as needed. The picker can directly target any Koha menu or submenu, including outside sidebars."
                    },
                    fields: [
                        {
                            key: "customRules",
                            type: "repeater",
                            addLabel: { fr: "Ajouter une personnalisation d’icône", en: "Add icon customization" },
                            itemLabel: { fr: "Icône", en: "Icon" },
                            itemTitle: function (item, index) {
                                return cleanText(item && (item.name || item.targetName || item.text)) ||
                                    ("Icône " + String(index + 1));
                            },
                            newItem: function () {
                                return {
                                    id: "rule-" + Date.now().toString(36),
                                    enabled: true,
                                    name: "",
                                    pages: window.location.pathname || "*",
                                    targetMode: "selector",
                                    selector: "",
                                    targetName: "",
                                    text: "",
                                    textMode: "exact",
                                    menuSelector: 'nav a, .sidebar_menu a, .navbar a, .dropdown-menu a, [role="menu"] a, [role="menuitem"]',
                                    iconType: "fa",
                                    iconClass: "fas fa-circle",
                                    imageUrl: "",
                                    sizePx: 16,
                                    color: "",
                                    position: "prepend",
                                    replaceExisting: true
                                };
                            },
                            fields: [
                                {
                                    key: "enabled",
                                    type: "boolean",
                                    label: { fr: "Règle active", en: "Rule enabled" }
                                },
                                {
                                    key: "name",
                                    type: "text",
                                    label: { fr: "Nom de la règle", en: "Rule name" }
                                },
                                {
                                    key: "pages",
                                    type: "text",
                                    label: { fr: "Pages Koha", en: "Koha pages" },
                                    help: {
                                        fr: "Chemins séparés par des virgules. Utilisez * pour toutes les pages.",
                                        en: "Comma-separated paths. Use * for all pages."
                                    }
                                },
                                {
                                    key: "targetMode",
                                    type: "select",
                                    refreshOnChange: true,
                                    label: { fr: "Méthode de ciblage", en: "Targeting method" },
                                    options: [
                                        { value: "selector", label: { fr: "Picker / sélecteur CSS", en: "Picker / CSS selector" } },
                                        { value: "text", label: { fr: "Libellé du menu", en: "Menu label" } }
                                    ]
                                },
                                {
                                    key: "selector",
                                    type: "picker",
                                    label: { fr: "Menu ou sous-menu ciblé", en: "Target menu or submenu" },
                                    pickLabel: { fr: "Choisir sur la page", en: "Pick on page" },
                                    clearLabel: { fr: "Effacer", en: "Clear" },
                                    allowManual: true,
                                    pick: pickForConfig,
                                    when: function (root, path) {
                                        const rule = getCustomRuleFromPath(root, path);
                                        return Boolean(rule && rule.targetMode !== "text");
                                    },
                                    help: {
                                        fr: "Le picker cible de préférence le lien ou bouton de menu, et mémorise un sélecteur stable.",
                                        en: "The picker prefers the menu link or button and stores a stable selector."
                                    }
                                },
                                {
                                    key: "targetName",
                                    type: "text",
                                    readOnly: true,
                                    advanced: true,
                                    label: { fr: "Élément détecté", en: "Detected element" }
                                },
                                {
                                    key: "text",
                                    type: "text",
                                    label: { fr: "Libellé à rechercher", en: "Label to match" },
                                    when: function (root, path) {
                                        const rule = getCustomRuleFromPath(root, path);
                                        return Boolean(rule && rule.targetMode === "text");
                                    }
                                },
                                {
                                    key: "textMode",
                                    type: "select",
                                    label: { fr: "Correspondance du libellé", en: "Label matching" },
                                    options: [
                                        { value: "exact", label: { fr: "Exacte", en: "Exact" } },
                                        { value: "contains", label: { fr: "Contient", en: "Contains" } }
                                    ],
                                    when: function (root, path) {
                                        const rule = getCustomRuleFromPath(root, path);
                                        return Boolean(rule && rule.targetMode === "text");
                                    }
                                },
                                {
                                    key: "menuSelector",
                                    type: "text",
                                    advanced: true,
                                    label: { fr: "Zones de menus à parcourir", en: "Menu areas to scan" },
                                    when: function (root, path) {
                                        const rule = getCustomRuleFromPath(root, path);
                                        return Boolean(rule && rule.targetMode === "text");
                                    }
                                },
                                {
                                    key: "iconType",
                                    type: "select",
                                    refreshOnChange: true,
                                    label: { fr: "Type d’icône", en: "Icon type" },
                                    options: [
                                        { value: "fa", label: { fr: "Font Awesome — bibliothèque visuelle", en: "Font Awesome — visual library" } },
                                        { value: "image", label: { fr: "Logo / image personnalisé", en: "Custom logo / image" } },
                                        { value: "none", label: { fr: "Aucune icône", en: "No icon" } }
                                    ]
                                },
                                {
                                    type: "custom",
                                    label: { fr: "Aperçu", en: "Preview" },
                                    render: renderCustomRulePreview
                                },
                                {
                                    type: "action",
                                    buttonLabel: { fr: "Choisir dans la bibliothèque Font Awesome", en: "Choose from Font Awesome library" },
                                    iconClass: "fas fa-search",
                                    action: chooseCustomRuleIcon,
                                    when: function (root, path) {
                                        const rule = getCustomRuleFromPath(root, path);
                                        return Boolean(rule && rule.iconType === "fa");
                                    }
                                },
                                {
                                    key: "iconClass",
                                    type: "text",
                                    advanced: true,
                                    label: { fr: "Classe Font Awesome — saisie manuelle", en: "Font Awesome class — manual entry" },
                                    placeholder: { fr: "fas fa-book", en: "fas fa-book" },
                                    when: function (root, path) {
                                        const rule = getCustomRuleFromPath(root, path);
                                        return Boolean(rule && rule.iconType === "fa");
                                    }
                                },
                                {
                                    key: "imageUrl",
                                    type: "text",
                                    label: { fr: "URL du logo / de l’image", en: "Logo / image URL" },
                                    help: { fr: "Utilisez une ressource HTTPS ou une image servie par votre installation. Aucun CDN n’est ajouté par le 117.", en: "Use an HTTPS resource or an image served by your installation. Module 117 adds no CDN." },
                                    when: function (root, path) {
                                        const rule = getCustomRuleFromPath(root, path);
                                        return Boolean(rule && rule.iconType === "image");
                                    }
                                },
                                {
                                    key: "sizePx",
                                    type: "number",
                                    min: 8,
                                    max: 96,
                                    label: { fr: "Taille (px)", en: "Size (px)" },
                                    when: function (root, path) {
                                        const rule = getCustomRuleFromPath(root, path);
                                        return Boolean(rule && rule.iconType !== "none");
                                    }
                                },
                                {
                                    key: "color",
                                    type: "color",
                                    label: { fr: "Couleur", en: "Color" },
                                    when: function (root, path) {
                                        const rule = getCustomRuleFromPath(root, path);
                                        return Boolean(rule && rule.iconType === "fa");
                                    }
                                },
                                {
                                    key: "position",
                                    type: "select",
                                    label: { fr: "Position", en: "Position" },
                                    options: [
                                        { value: "prepend", label: { fr: "Avant le libellé", en: "Before label" } },
                                        { value: "append", label: { fr: "Après le libellé", en: "After label" } }
                                    ],
                                    when: function (root, path) {
                                        const rule = getCustomRuleFromPath(root, path);
                                        return Boolean(rule && rule.iconType !== "none");
                                    }
                                },
                                {
                                    key: "replaceExisting",
                                    type: "boolean",
                                    label: { fr: "Remplacer l’icône existante", en: "Replace existing icon" },
                                    help: {
                                        fr: "Si désactivé, la règle n’ajoute rien lorsqu’une icône existe déjà.",
                                        en: "If disabled, the rule adds nothing when an icon already exists."
                                    },
                                    when: function (root, path) {
                                        const rule = getCustomRuleFromPath(root, path);
                                        return Boolean(rule && rule.iconType !== "none");
                                    }
                                }
                            ]
                        }
                    ]
                }
            ]
        };
    }

    function registerWithPMK() {
        if (registered || !window.PMKConfig || typeof window.PMKConfig.registerModule !== "function") {
            return false;
        }

        try {
            window.PMKConfig.registerModule(moduleDefinition());
            registered = true;
        } catch (_) {
            return false;
        }

        if (typeof window.PMKConfig.subscribe === "function") {
            try {
                unsubscribe = window.PMKConfig.subscribe(MODULE_ID, applyConfig);
            } catch (_) {}
        }

        if (typeof window.PMKConfig.getConfig === "function") {
            Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
                .then(applyConfig)
                .catch(function () { applyConfig(DEFAULT_CONFIG); });
        } else {
            applyConfig(DEFAULT_CONFIG);
        }

        return true;
    }

    function mountContextAccess() {
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        const anchor = document.querySelector(".sidebar_menu h5, .sidebar_menu h4, .sidebar_menu h3, .sidebar_menu");
        if (!anchor) return;
        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "after",
                contextKey: "menu-icons",
                context: { pagePath: window.location.pathname }
            });
        } catch (_) {}
    }

    function start() {
        const run = function () {
            if (!registerWithPMK()) {
                applyConfig(DEFAULT_CONFIG);
                window.addEventListener("pmk:config-ready", function () {
                    registerWithPMK();
                    mountContextAccess();
                    resumePendingPick();
                }, { once: true });
            } else {
                mountContextAccess();
                resumePendingPick();
            }
        };

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", run, { once: true });
        } else {
            run();
        }
    }

    window.PMK117MenuIcons = {
        moduleId: MODULE_ID,
        version: MODULE_VERSION,
        defaults: deepClone(DEFAULT_CONFIG),
        refresh: function () {
            if (window.PMKConfig && typeof window.PMKConfig.getConfig === "function") {
                return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID)).then(applyConfig);
            }
            return Promise.resolve(applyConfig(DEFAULT_CONFIG));
        },
        apply: applyConfig,
        restore: restoreRuntime,
        iconMap: deepClone(LEGACY_ICON_MAP),
        pickElement: pickElementOnCurrentPage,
        stableSelector: stableSelector
    };

    window.addEventListener("beforeunload", function () {
        stopObserver();
        if (typeof unsubscribe === "function") {
            try { unsubscribe(); } catch (_) {}
        }
    }, { once: true });

    start();
})(window, document);

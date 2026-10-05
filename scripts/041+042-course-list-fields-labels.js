/*
 Nom du fichier: 041+042-course-list-fields-labels.js
 Version: 3.0.0-preplugin
 Date de dernière modification: 2026-09-18
 Auteur: Michael Mundet

 Module PimpMyKoha (phase pré-plugin) : Réserves de cours modifiées

 Objectif :
 - adapter le module natif Koha « Réserves de cours » en gestion de listes d'exemplaires ;
 - conserver les personnalisations historiques des anciens 041 / 042 ;
 - cibler les éléments Koha par leur structure réelle plutôt que parcourir tout le DOM ;
 - rester compatible français / anglais ;
 - couvrir le parcours staff complet : liste, fiche, création, ajout et retrait d'exemplaires ;
 - rester fail-safe si Koha change sa structure.

 Important :
 - aucune donnée Koha n'est modifiée par ce script ;
 - les valeurs des champs masqués restent présentes et sont soumises normalement par Koha ;
 - aucun remplacement global de mots n'est effectué dans les contenus utilisateur.
*/
(function () {
    "use strict";

    if (window.__PMK041042_COURSE_LIST_UI__) return;
    window.__PMK041042_COURSE_LIST_UI__ = true;

    const MODULE_ID = "course-list-ui";
    const MODULE_VERSION = "3.0.0-preplugin";

    const PAGE_DEFINITIONS = [
        {
            id: "course_reserves.list",
            path: "/cgi-bin/koha/course_reserves/course-reserves.pl",
            enabled: true
        },
        {
            id: "course_reserves.course",
            path: "/cgi-bin/koha/course_reserves/course.pl",
            enabled: true
        },
        {
            id: "course_reserves.details",
            path: "/cgi-bin/koha/course_reserves/course-details.pl",
            enabled: true
        },
        {
            id: "course_reserves.add-items",
            path: "/cgi-bin/koha/course_reserves/add_items.pl",
            enabled: true
        },
        {
            id: "course_reserves.batch-add-items",
            path: "/cgi-bin/koha/course_reserves/batch_add_items.pl",
            enabled: true
        },
        {
            id: "course_reserves.batch-rm-items",
            path: "/cgi-bin/koha/course_reserves/batch_rm_items.pl",
            enabled: true
        }
    ];

    const DEFAULT_CONFIG = {
        enabled: true,
        pages: PAGE_DEFINITIONS,
        labels: {
            moduleTitleFr: "Listes d'exemplaires",
            moduleTitleEn: "Item lists",
            listNameFr: "Nom de la liste",
            listNameEn: "List name",
            departmentFr: "Pôle",
            departmentEn: "Unit",
            listTypeFr: "Type de liste",
            listTypeEn: "List type",
            endDateFr: "Date de fin liste",
            endDateEn: "List end date",
            responsiblesFr: "Responsable(s)",
            responsiblesEn: "Responsible person(s)",
            responsibleSearchFr: "Rechercher responsable liste",
            responsibleSearchEn: "Search list manager"
        },
        display: {
            hideSection: true,
            hideStudentsCount: true,
            updatePlaceholders: true
        }
    };

    let currentConfig = clone(DEFAULT_CONFIG);
    let tableObserver = null;
    let contextButton = null;
    let pmkReadyListenerInstalled = false;
    let pmkSubscribed = false;

    const textSnapshots = new Map();
    const attributeSnapshots = new Map();
    const styleSnapshots = new Map();
    let titleSnapshot = null;

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

    function detectLanguage() {
        if (window.PMKConfig && typeof window.PMKConfig.getLanguage === "function") {
            try {
                return window.PMKConfig.getLanguage() === "en" ? "en" : "fr";
            } catch (_) {}
        }
        const lang = String(document.documentElement.lang || navigator.language || "").toLowerCase();
        return lang.startsWith("en") ? "en" : "fr";
    }

    function label(key) {
        const lang = detectLanguage();
        const labels = currentConfig.labels || DEFAULT_CONFIG.labels;
        const suffix = lang === "en" ? "En" : "Fr";
        const value = labels[key + suffix];
        if (String(value || "").trim()) return String(value).trim();
        return String(DEFAULT_CONFIG.labels[key + suffix] || "").trim();
    }

    function copy(fr, en) {
        return detectLanguage() === "en" ? en : fr;
    }

    function normalizeText(value) {
        return String(value || "")
            .replace(/\u00a0/g, " ")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[’'`]/g, "")
            .replace(/[.:?#]/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function currentPage() {
        const path = window.location.pathname;
        return PAGE_DEFINITIONS.find(function (page) {
            return page.path === path;
        }) || null;
    }

    function configuredPage(pageId) {
        const pages = Array.isArray(currentConfig.pages) ? currentConfig.pages : [];
        return pages.find(function (page) {
            return page && page.id === pageId;
        }) || null;
    }

    function isEnabledForPage(pageId) {
        if (!currentConfig || currentConfig.enabled === false) return false;
        const page = configuredPage(pageId);
        return Boolean(page && page.enabled !== false);
    }

    function snapshotTextNode(node) {
        if (!node || node.nodeType !== Node.TEXT_NODE) return;
        if (!textSnapshots.has(node)) textSnapshots.set(node, node.nodeValue);
    }

    function setTextNode(node, value) {
        if (!node || node.nodeType !== Node.TEXT_NODE) return;
        snapshotTextNode(node);
        const original = String(node.nodeValue || "");
        const leading = (original.match(/^\s*/) || [""])[0];
        const trailing = (original.match(/\s*$/) || [""])[0];
        node.nodeValue = leading + String(value || "") + trailing;
    }

    function directTextNodes(element) {
        if (!element) return [];
        return Array.from(element.childNodes || []).filter(function (node) {
            return node.nodeType === Node.TEXT_NODE && String(node.nodeValue || "").trim();
        });
    }

    function setDirectText(element, value) {
        if (!element) return false;
        const nodes = directTextNodes(element);
        if (!nodes.length) return false;
        setTextNode(nodes[nodes.length - 1], value);
        return true;
    }

    function replaceDirectText(element, replacements) {
        if (!element) return false;
        let changed = false;
        directTextNodes(element).forEach(function (node) {
            let text = String(node.nodeValue || "");
            let next = text;
            replacements.forEach(function (entry) {
                (entry.aliases || []).forEach(function (alias) {
                    if (!alias || next.indexOf(alias) === -1) return;
                    next = next.split(alias).join(entry.value);
                });
            });
            if (next !== text) {
                snapshotTextNode(node);
                node.nodeValue = next;
                changed = true;
            }
        });
        return changed;
    }

    function snapshotAttribute(element, name) {
        if (!element) return;
        if (!attributeSnapshots.has(element)) attributeSnapshots.set(element, new Map());
        const attrs = attributeSnapshots.get(element);
        if (!attrs.has(name)) {
            attrs.set(name, element.hasAttribute(name) ? element.getAttribute(name) : null);
        }
    }

    function setAttributeValue(element, name, value) {
        if (!element) return;
        snapshotAttribute(element, name);
        element.setAttribute(name, String(value || ""));
    }

    function snapshotDisplay(element) {
        if (!element || styleSnapshots.has(element)) return;
        styleSnapshots.set(element, element.style.display);
    }

    function hideElement(element) {
        if (!element) return;
        snapshotDisplay(element);
        element.style.display = "none";
        element.setAttribute("data-pmk-course-list-hidden", "1");
    }

    function hideFieldRow(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return;
        const row = field.closest("li") || field;
        hideElement(row);
    }

    function rememberTitle() {
        if (titleSnapshot === null) titleSnapshot = document.title;
    }

    function replaceDocumentTitle(replacements) {
        rememberTitle();
        let next = document.title;
        replacements.forEach(function (entry) {
            (entry.aliases || []).forEach(function (alias) {
                if (!alias || next.indexOf(alias) === -1) return;
                next = next.split(alias).join(entry.value);
            });
        });
        document.title = next;
    }

    function restoreUi() {
        disconnectDynamicBindings();

        textSnapshots.forEach(function (value, node) {
            if (node && node.isConnected) node.nodeValue = value;
        });
        textSnapshots.clear();

        attributeSnapshots.forEach(function (attrs, element) {
            if (!element || !element.isConnected) return;
            attrs.forEach(function (value, name) {
                if (value === null) element.removeAttribute(name);
                else element.setAttribute(name, value);
            });
        });
        attributeSnapshots.clear();

        styleSnapshots.forEach(function (value, element) {
            if (!element || !element.isConnected) return;
            element.style.display = value;
            element.removeAttribute("data-pmk-course-list-hidden");
        });
        styleSnapshots.clear();

        document.querySelectorAll(".pmk-course-list-column-hidden").forEach(function (element) {
            element.classList.remove("pmk-course-list-column-hidden");
        });

        if (titleSnapshot !== null) {
            document.title = titleSnapshot;
            titleSnapshot = null;
        }
    }

    function ensureStyle() {
        if (document.getElementById("pmk-course-list-ui-style")) return;
        const style = document.createElement("style");
        style.id = "pmk-course-list-ui-style";
        style.textContent = `
            .pmk-course-list-column-hidden { display: none !important; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function setLabelFor(fieldId, value) {
        const element = document.querySelector('label[for="' + fieldId + '"]');
        if (element) setDirectText(element, value + ":");
    }

    function setSpanLabelByAliases(root, aliases, value) {
        if (!root) return null;
        const targets = root.querySelectorAll("span.label");
        const normalizedAliases = aliases.map(normalizeText);
        for (const span of targets) {
            if (normalizedAliases.includes(normalizeText(span.textContent))) {
                setDirectText(span, value + ":");
                return span;
            }
        }
        return null;
    }

    function findTableHeader(table, aliases, currentValue) {
        if (!table) return null;
        const wanted = aliases.concat(currentValue ? [currentValue] : []).map(normalizeText);
        const headers = Array.from(table.querySelectorAll("thead tr:first-child > th"));
        return headers.find(function (header) {
            return wanted.includes(normalizeText(header.textContent));
        }) || null;
    }

    function renameTableHeader(table, aliases, value) {
        const header = findTableHeader(table, aliases, value);
        if (header) setDirectText(header, value);
        return header;
    }

    function hideTableColumn(table, aliases) {
        const header = findTableHeader(table, aliases, "");
        if (!header || !header.parentElement) return false;
        const headers = Array.from(header.parentElement.children);
        const index = headers.indexOf(header);
        if (index < 0) return false;

        Array.from(table.querySelectorAll("tr")).forEach(function (row) {
            const cells = Array.from(row.children || []);
            if (cells[index]) cells[index].classList.add("pmk-course-list-column-hidden");
        });
        return true;
    }

    function changeBreadcrumbRoot() {
        const rootLink = document.querySelector('.breadcrumbs a[href="/cgi-bin/koha/course_reserves/course-reserves.pl"], #breadcrumbs a[href="/cgi-bin/koha/course_reserves/course-reserves.pl"]');
        if (rootLink) setDirectText(rootLink, label("moduleTitle"));
    }

    function applyCourseForm() {
        const form = document.querySelector('form[action="/cgi-bin/koha/course_reserves/mod_course.pl"], form[action$="/course_reserves/mod_course.pl"]');
        if (!form) return;

        setLabelFor("department", label("department"));
        setLabelFor("course_number", label("endDate"));
        setLabelFor("course_name", label("listName"));
        setLabelFor("term", label("listType"));
        setLabelFor("find_instructor", label("responsibleSearch"));

        const termField = document.getElementById("term");
        if (termField && termField.tagName !== "SELECT") {
            const termRow = termField.closest("li");
            const termLabel = termRow ? termRow.querySelector("span.label") : null;
            if (termLabel) setDirectText(termLabel, label("listType") + ":");
        }

        const instructorLabel = Array.from(form.querySelectorAll("span.label")).find(function (span) {
            return ["instructors", "enseignants", "responsables", "responsable(s)"].includes(normalizeText(span.textContent));
        });
        if (instructorLabel) setDirectText(instructorLabel, label("responsibles") + ":");

        if (currentConfig.display && currentConfig.display.updatePlaceholders !== false) {
            const courseNumber = document.getElementById("course_number");
            const courseName = document.getElementById("course_name");
            const instructor = document.getElementById("find_instructor");
            if (courseNumber) setAttributeValue(courseNumber, "placeholder", label("endDate"));
            if (courseName) setAttributeValue(courseName, "placeholder", label("listName"));
            if (instructor) setAttributeValue(instructor, "placeholder", label("responsibleSearch"));
        }

        if (currentConfig.display && currentConfig.display.hideSection !== false) {
            hideFieldRow("section");
        }
        if (currentConfig.display && currentConfig.display.hideStudentsCount !== false) {
            hideFieldRow("students_count");
        }

        const emptyDepartment = document.querySelector('#department option[value=""]');
        if (emptyDepartment) {
            setDirectText(emptyDepartment, copy("Sélectionner un pôle", "Select a unit"));
        }

        const editing = Boolean(form.querySelector('input[name="course_id"]'));
        const heading = document.querySelector("main h1 span, .main h1 span, h1 span");
        const activeCrumb = document.querySelector(".breadcrumbs .breadcrumb-item.active span, #breadcrumbs .breadcrumb-item.active span, .breadcrumb .active span");
        const legend = form.querySelector("fieldset.rows > legend");

        if (editing) {
            if (heading) replaceDirectText(heading, [
                { aliases: ["Edit ", "Modifier "], value: copy("Modifier ", "Edit ") }
            ]);
            if (activeCrumb) replaceDirectText(activeCrumb, [
                { aliases: ["Edit ", "Modifier "], value: copy("Modifier ", "Edit ") }
            ]);
            if (legend) setDirectText(legend, copy("Modifier la liste", "Edit list"));
        } else {
            if (heading) setDirectText(heading, copy("Nouvelle liste", "New list"));
            if (activeCrumb) setDirectText(activeCrumb, copy("Nouvelle liste", "New list"));
            if (legend) setDirectText(legend, copy("Créer une liste", "Create list"));
        }

        changeBreadcrumbRoot();
        replaceDocumentTitle([
            { aliases: ["Course reserves", "Réserves de cours"], value: label("moduleTitle") },
            { aliases: ["New course", "Nouveau cours"], value: copy("Nouvelle liste", "New list") }
        ]);
    }

    function applyCourseListTable() {
        const table = document.getElementById("course_reserves_table");
        if (!table) return;

        renameTableHeader(table, ["Name", "Nom"], label("listName"));
        renameTableHeader(table, ["Dept.", "Dept", "Department", "Département", "Dépt.", "Dépt"], label("department"));
        renameTableHeader(table, ["Course #", "Course number", "Numéro du cours", "Numéro de cours", "N° du cours", "N° de cours", "N° cours", "No de cours"], label("endDate"));
        renameTableHeader(table, ["Term", "Semester", "Terme", "Session", "Semestre", "Période"], label("listType"));
        renameTableHeader(table, ["Instructors", "Enseignants", "Enseignant(s)"], label("responsibles"));

        if (currentConfig.display && currentConfig.display.hideSection !== false) {
            hideTableColumn(table, ["Section"]);
        }
        if (currentConfig.display && currentConfig.display.hideStudentsCount !== false) {
            hideTableColumn(table, ["# of students", "Number of students", "Nombre d'étudiants", "Nb d'étudiants", "# d'étudiants"]);
        }
    }

    function applyCourseListPage() {
        const h1 = document.querySelector("main h1, .main h1, h1");
        if (h1) setDirectText(h1, label("moduleTitle"));

        const newCourse = document.getElementById("new_course");
        if (newCourse) setDirectText(newCourse, copy("Nouvelle liste", "New list"));

        const batchRemove = document.getElementById("batch_rm");
        if (batchRemove) setDirectText(batchRemove, copy("Suppression par lot de listes", "Batch remove from lists"));

        changeBreadcrumbRoot();
        applyCourseListTable();
        bindTableRefresh(applyCourseListTable);

        replaceDocumentTitle([
            { aliases: ["Course reserves", "Réserves de cours"], value: label("moduleTitle") }
        ]);
    }

    function findSummaryRowByAliases(root, aliases) {
        if (!root) return null;
        const wanted = aliases.map(normalizeText);
        const labels = Array.from(root.querySelectorAll("li > span.label"));
        const span = labels.find(function (candidate) {
            return wanted.includes(normalizeText(candidate.textContent));
        });
        return span ? { label: span, row: span.closest("li") } : null;
    }

    function applyCourseDetailsTable() {
        const table = document.getElementById("course_reserves_table");
        if (!table) return;
        renameTableHeader(
            table,
            ["Other course reserves", "Autres réserves de cours"],
            copy("Autres listes d'exemplaires", "Other item lists")
        );
    }

    function applyCourseDetailsPage() {
        changeBreadcrumbRoot();

        const heading = document.querySelector("main h1, .main h1, h1");
        if (heading) {
            replaceDirectText(heading, [
                {
                    aliases: ["Course details for ", "Détails du cours ", "Détails du cours pour "],
                    value: copy("Détails de la liste ", "List details for ")
                }
            ]);
        }

        const activeCrumb = document.querySelector(".breadcrumbs .breadcrumb-item.active span, #breadcrumbs .breadcrumb-item.active span, .breadcrumb .active span");
        if (activeCrumb) {
            replaceDirectText(activeCrumb, [
                {
                    aliases: ["Course details for ", "Détails du cours ", "Détails du cours pour "],
                    value: copy("Détails de la liste ", "List details for ")
                }
            ]);
        }

        const toolbar = document.getElementById("toolbar");
        if (toolbar) {
            toolbar.querySelectorAll('a[href*="/course_reserves/add_items.pl"]').forEach(function (button) {
                setDirectText(button, copy("Ajouter un exemplaire", "Add item"));
            });
            toolbar.querySelectorAll('a[href*="/course_reserves/batch_add_items.pl"]').forEach(function (button) {
                setDirectText(button, copy("Ajouter par lot", "Batch add items"));
            });

            const removeAll = document.getElementById("rm_items_button");
            const edit = document.getElementById("edit_course");
            const removeCourse = document.getElementById("delete_course_button");
            if (removeAll) setDirectText(removeAll, copy("Retirer tous les exemplaires", "Remove all items"));
            if (edit) setDirectText(edit, copy("Modifier la liste", "Edit list"));
            if (removeCourse) setDirectText(removeCourse, copy("Supprimer la liste", "Delete list"));
        }

        const summaryRoot = document.querySelector(".page-section .rows") || document.querySelector(".rows");
        if (summaryRoot) {
            const mappings = [
                { aliases: ["Course name", "Nom du cours"], value: label("listName") },
                { aliases: ["Department", "Département"], value: label("department") },
                { aliases: ["Course number", "Numéro du cours", "Numéro de cours", "N° du cours", "N° de cours"], value: label("endDate") },
                { aliases: ["Term", "Semester", "Terme", "Session", "Semestre", "Période"], value: label("listType") },
                { aliases: ["Instructors", "Enseignants", "Enseignant(s)"], value: label("responsibles") }
            ];

            mappings.forEach(function (mapping) {
                const found = findSummaryRowByAliases(summaryRoot, mapping.aliases);
                if (found && found.label) setDirectText(found.label, mapping.value + ":");
            });

            if (currentConfig.display && currentConfig.display.hideSection !== false) {
                const section = findSummaryRowByAliases(summaryRoot, ["Section"]);
                if (section && section.row) hideElement(section.row);
            }

            if (currentConfig.display && currentConfig.display.hideStudentsCount !== false) {
                const students = findSummaryRowByAliases(summaryRoot, ["Student count", "Number of students", "Nombre d'étudiants"]);
                if (students && students.row) hideElement(students.row);
            }
        }

        applyCourseDetailsTable();
        bindTableRefresh(applyCourseDetailsTable);

        replaceDocumentTitle([
            { aliases: ["Course reserves", "Réserves de cours"], value: label("moduleTitle") },
            {
                aliases: ["Course details for", "Détails du cours pour", "Détails du cours"],
                value: copy("Détails de la liste", "List details for")
            }
        ]);
    }

    function applyAddItemsPage() {
        changeBreadcrumbRoot();

        const bodyId = document.body ? document.body.id : "";
        const isStep2 = bodyId === "courses_add_items_step2";
        const activeCrumb = document.querySelector(".breadcrumbs .breadcrumb-item.active span, #breadcrumbs .breadcrumb-item.active span, .breadcrumb .active span");
        const heading = document.querySelector("main h1, .main h1, h1");

        if (!isStep2) {
            if (activeCrumb) setDirectText(activeCrumb, copy("Ajouter des exemplaires", "Add items"));
            if (heading) {
                replaceDirectText(heading, [
                    {
                        aliases: ["Add reserves for ", "Ajouter des réserves pour "],
                        value: copy("Ajouter des exemplaires à ", "Add items to ")
                    }
                ]);
            }

            const firstLegend = document.querySelector("form fieldset.rows legend");
            if (firstLegend) setDirectText(firstLegend, copy("Ajouter des exemplaires : scanner le code-barres", "Add items: scan barcode"));
        } else {
            if (activeCrumb) {
                replaceDirectText(activeCrumb, [
                    { aliases: ["Edit", "Modifier"], value: copy("Modifier", "Edit") },
                    { aliases: ["Reserve", "Réserver"], value: copy("Ajouter", "Add") }
                ]);
            }

            if (heading) {
                const mode = heading.querySelector("span");
                if (mode) {
                    const current = normalizeText(mode.textContent);
                    const isEdit = current === "edit" || current === "modifier";
                    setDirectText(mode, isEdit ? copy("Modifier", "Edit") : copy("Ajouter", "Add"));
                }
                replaceDirectText(heading, [
                    { aliases: [" for ", " pour "], value: copy(" dans la liste ", " in list ") }
                ]);
            }

            const already = document.getElementById("already_on_reserve_this");
            if (already) {
                setDirectText(already, copy(
                    "Cet exemplaire est déjà présent dans cette liste.",
                    "This item is already in this list."
                ));
            }

            const countInfo = document.getElementById("already_on_reserve");
            if (countInfo) {
                replaceDirectText(countInfo, [
                    {
                        aliases: [
                            "Number of courses reserving this item:",
                            "Nombre de cours réservant cet exemplaire :"
                        ],
                        value: copy("Nombre de listes contenant cet exemplaire :", "Number of lists containing this item:")
                    },
                    {
                        aliases: [
                            "Number of courses reserving this bibliographic record:",
                            "Nombre de cours réservant cette notice bibliographique :"
                        ],
                        value: copy("Nombre de listes contenant cette notice :", "Number of lists containing this record:")
                    }
                ]);
            }
        }

        replaceDocumentTitle([
            { aliases: ["Course reserves", "Réserves de cours"], value: label("moduleTitle") },
            { aliases: ["Add reserves", "Ajouter des réserves"], value: copy("Ajouter des exemplaires", "Add items") },
            { aliases: ["Edit reserve", "Modifier une réserve"], value: copy("Modifier dans la liste", "Edit list item") }
        ]);
    }

    function applyBatchAddPage() {
        changeBreadcrumbRoot();

        const activeCrumb = document.querySelector(".breadcrumbs .breadcrumb-item.active span, #breadcrumbs .breadcrumb-item.active span, .breadcrumb .active span");
        if (activeCrumb) setDirectText(activeCrumb, copy("Ajout par lot", "Batch add items"));

        const heading = document.querySelector("main h1, .main h1, h1");
        if (heading) {
            replaceDirectText(heading, [
                {
                    aliases: ["Add reserves for ", "Ajouter des réserves pour "],
                    value: copy("Ajout par lot dans ", "Batch add items to ")
                }
            ]);
        }

        const firstLegend = document.querySelector("form fieldset.rows legend");
        if (firstLegend) setDirectText(firstLegend, copy("Ajouter des exemplaires : scanner les codes-barres", "Add items: scan barcodes"));

        const viewCourse = document.querySelector('a.btn[href*="course-details.pl"]');
        if (viewCourse) setDirectText(viewCourse, copy("Voir la liste", "View list"));

        replaceDocumentTitle([
            { aliases: ["Course reserves", "Réserves de cours"], value: label("moduleTitle") },
            { aliases: ["Add reserves", "Ajouter des réserves"], value: copy("Ajout par lot", "Batch add items") }
        ]);
    }

    function applyBatchRemovePage() {
        changeBreadcrumbRoot();

        const batchLabel = copy("Suppression par lot de listes", "Batch remove from lists");
        const activeCrumb = document.querySelector(".breadcrumbs .breadcrumb-item.active span, #breadcrumbs .breadcrumb-item.active span, .breadcrumb .active span");
        const heading = document.querySelector("main h1, .main h1, h1");
        if (activeCrumb) setDirectText(activeCrumb, batchLabel);
        if (heading) setDirectText(heading, batchLabel);

        const legend = document.querySelector("form fieldset.rows legend");
        if (legend) setDirectText(legend, copy("Retirer des exemplaires : scanner les codes-barres", "Remove items: scan barcodes"));

        const warning = document.querySelector("fieldset.action p");
        if (warning) {
            setDirectText(warning, copy(
                "Les exemplaires seront retirés de toutes les listes auxquelles ils sont rattachés.",
                "Items will be removed from every list they are attached to."
            ));
        }

        const returnButton = document.querySelector('a.btn[href="/cgi-bin/koha/course_reserves/course-reserves.pl"]');
        if (returnButton) setDirectText(returnButton, copy("Retour aux listes", "Back to lists"));

        replaceDocumentTitle([
            { aliases: ["Course reserves", "Réserves de cours"], value: label("moduleTitle") },
            { aliases: ["Batch remove reserves", "Suppression par lot des réserves de cours", "Remove reserves", "Retirer des réserves"], value: batchLabel }
        ]);
    }

    function disconnectDynamicBindings() {
        if (tableObserver) {
            try { tableObserver.disconnect(); } catch (_) {}
            tableObserver = null;
        }

        if (window.jQuery) {
            try {
                window.jQuery("#course_reserves_table").off("draw.dt.pmkCourseListUi");
            } catch (_) {}
        }
    }

    function bindTableRefresh(callback) {
        const table = document.getElementById("course_reserves_table");
        if (!table || typeof callback !== "function") return;

        if (window.jQuery) {
            try {
                window.jQuery(table)
                    .off("draw.dt.pmkCourseListUi")
                    .on("draw.dt.pmkCourseListUi", function () {
                        window.setTimeout(callback, 0);
                    });
            } catch (_) {}
        }

        const tbody = table.tBodies && table.tBodies[0];
        if (tbody && typeof MutationObserver === "function") {
            let scheduled = false;
            tableObserver = new MutationObserver(function () {
                if (scheduled) return;
                scheduled = true;
                window.setTimeout(function () {
                    scheduled = false;
                    callback();
                }, 0);
            });
            tableObserver.observe(tbody, { childList: true, subtree: true });
        }
    }

    function mountContextAccess(pageId) {
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== "function") return;
        if (contextButton && contextButton.isConnected) return;

        const anchor = document.querySelector("main h1, .main h1, h1, #toolbar");
        if (!anchor) return;

        try {
            contextButton = window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: "append",
                contextKey: "course-list-ui",
                context: {
                    page: pageId,
                    sectionId: "terminology"
                }
            }) || null;
        } catch (_) {}
    }

    function removeContextAccess() {
        if (contextButton && contextButton.isConnected) {
            try { contextButton.remove(); } catch (_) {}
        }
        contextButton = null;
    }

    function applyCurrentPage() {
        const page = currentPage();
        restoreUi();

        if (!page || !isEnabledForPage(page.id)) {
            removeContextAccess();
            return;
        }

        ensureStyle();

        switch (page.id) {
            case "course_reserves.course":
                applyCourseForm();
                break;
            case "course_reserves.list":
                applyCourseListPage();
                break;
            case "course_reserves.details":
                applyCourseDetailsPage();
                break;
            case "course_reserves.add-items":
                applyAddItemsPage();
                break;
            case "course_reserves.batch-add-items":
                applyBatchAddPage();
                break;
            case "course_reserves.batch-rm-items":
                applyBatchRemovePage();
                break;
            default:
                return;
        }

        mountContextAccess(page.id);
    }

    function applyConfig(config) {
        currentConfig = deepMerge(DEFAULT_CONFIG, config || {});
        applyCurrentPage();
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

    function connectPmkConfig() {
        if (!window.PMKConfig) return false;

        loadConfig().then(applyConfig);

        if (!pmkSubscribed && typeof window.PMKConfig.subscribe === "function") {
            try {
                window.PMKConfig.subscribe(MODULE_ID, applyConfig);
                pmkSubscribed = true;
            } catch (_) {}
        }
        return true;
    }

    function start() {
        if (!currentPage()) return;

        const launch = function () {
            if (!connectPmkConfig()) applyConfig(DEFAULT_CONFIG);
        };

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", launch, { once: true });
        } else {
            launch();
        }

        if (!window.PMKConfig && !pmkReadyListenerInstalled) {
            pmkReadyListenerInstalled = true;
            window.addEventListener("pmk:config-ready", function () {
                connectPmkConfig();
            }, { once: true });
        }
    }

    window.PMK041042CourseListUI = {
        version: MODULE_VERSION,
        moduleId: MODULE_ID,
        pages: clone(PAGE_DEFINITIONS),
        refresh: applyCurrentPage
    };

    start();
})();

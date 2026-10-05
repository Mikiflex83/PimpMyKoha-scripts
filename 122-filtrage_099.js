(function () {
  // --- Restriction : ne s'exécute que sur la page addbiblio.pl ---
  if (!/\/cgi-bin\/koha\/cataloguing\/addbiblio\.pl/i.test(location.pathname)) {
    return;
  }

  const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_APIKEY",
    authDomain: "YOUR_FIREBASE_AUTHDOMAIN",
    projectId: "YOUR_FIREBASE_PROJECTID",
    storageBucket: "YOUR_FIREBASE_STORAGEBUCKET",
    messagingSenderId: "YOUR_FIREBASE_MESSAGINGSENDERID",
    appId: "YOUR_FIREBASE_APPID"
  };

  // --- Activer les logs ---
  const DEBUG = true;

  function log(...args) {
    if (DEBUG) {
      (function(){})('[Koha099-Highlight]', ...args);
    }
  }

  // --- Utilitaires ---
  const norm = s => (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const parseLevel = name => {
    const s = norm(name);
    if (/domaine\s*0?99\$?a/.test(s)) return "a";
    if (/sous[- ]domaine\s*0?99\$?b/.test(s)) return "b";
    if (/th[eè]me\s*0?99\$?e/.test(s)) return "e";
    if (/sujet\s*0?99\$?f/.test(s)) return "f";
    return "";
  };

  const cleanLabel = s => {
    const txt = (s || "").trim();
    if (!txt) return "";
    const m = txt.match(/^(.*?)\s*\((?:Sous[- ]?domaine|Domaine|Th[eè]me(?:s)?|Sujet|Forme\s*\/\s*Genre|Genre(?:\s+litt[eè]raire)?)[^)]*\)/i);
    if (m) return m[1].trim();
    return txt.replace(/\s*\(\d+\)\s*$/, "").trim();
  };

  const extractPathKey = node => {
    const p = (node.parentPath || node.path || node.parent || "").trim();
    return norm(p);
  };

  const findTagScopes = () => [...document.querySelectorAll('li.tag.clearfix[id^="tag_099_"]')];

  const findFieldInScope = (scope, code) =>
    scope.querySelector(`select[name^="tag_099_subfield_${code}_"]`) ||
    scope.querySelector(`input[name^="tag_099_subfield_${code}_"]`);

  const findFFieldInScope = scope => {
    const all = [...scope.querySelectorAll('select[name^="tag_099_subfield_f_"]')];
    if (!all.length) return null;
    return all.find(s => !s.value) || all[0];
  };

  // --- Indexation des données ---

  // Reproduit la logique d'attachement de buildTree() :
  // un noeud supprimé, ou un noeud dont la chaîne de parents n'est plus
  // rattachée à la racine, ne doit pas être utilisé par les listes 099.
  const getTreeParentPath = node => {
    if (!node) return "";
    if (typeof node.parentPath === "string") return node.parentPath.trim();
    if (typeof node.parent === "string") return node.parent.trim();
    return "";
  };

  const getTreeNodeName = node => (node?.name || node?.label || "").toString().trim();

  const getTreeFullPath = node => {
    const name = getTreeNodeName(node);
    const parentPath = getTreeParentPath(node);
    return parentPath ? `${parentPath}/${name}` : name;
  };

  const buildActiveTreeContext = rows => {
    // 1. Exclure les documents explicitement supprimés.
    const activeRows = (rows || []).filter(row => !row.deleted);

    // 2. Reconstituer le même index de chemins que buildTree().
    const byPath = new Map();
    activeRows.forEach(row => {
      const fullPath = getTreeFullPath(row);
      if (fullPath) byPath.set(fullPath, row);
    });

    // 3. Ne conserver que les noeuds réellement atteignables depuis la racine.
    //    Cela élimine aussi les descendants/orphelins d'un ancien noeud supprimé.
    const reachablePaths = new Set();
    activeRows.forEach(row => {
      if (getTreeParentPath(row) === "") {
        const fullPath = getTreeFullPath(row);
        if (fullPath) reachablePaths.add(fullPath);
      }
    });

    let changed = true;
    let guard = 0;
    while (changed && guard++ < activeRows.length + 2) {
      changed = false;
      activeRows.forEach(row => {
        const fullPath = getTreeFullPath(row);
        if (!fullPath || reachablePaths.has(fullPath)) return;
        const parentPath = getTreeParentPath(row);
        if (parentPath && reachablePaths.has(parentPath) && byPath.has(parentPath)) {
          reachablePaths.add(fullPath);
          changed = true;
        }
      });
    }

    const reachableRows = activeRows.filter(row => reachablePaths.has(getTreeFullPath(row)));

    return {
      allRows: rows || [],
      rows: reachableRows,
      byPath,
      reachablePaths,
      excludedDeleted: (rows || []).length - activeRows.length,
      excludedOrphans: activeRows.length - reachableRows.length
    };
  };

  const findAncestorByLevel = (node, wantedLevel, treeCtx) => {
    let parentPath = getTreeParentPath(node);
    let guard = 0;

    while (parentPath && guard++ < 100) {
      if (!treeCtx.reachablePaths.has(parentPath)) return null;
      const parent = treeCtx.byPath.get(parentPath);
      if (!parent) return null;

      if (parseLevel(getTreeNodeName(parent)) === wantedLevel) return parent;
      parentPath = getTreeParentPath(parent);
    }
    return null;
  };

  const getAncestorLabelKeys = (node, treeCtx) => {
    const keys = [];
    let parentPath = getTreeParentPath(node);
    let guard = 0;

    while (parentPath && guard++ < 100) {
      if (!treeCtx.reachablePaths.has(parentPath)) break;
      const parent = treeCtx.byPath.get(parentPath);
      if (!parent) break;
      const label = cleanLabel(getTreeNodeName(parent));
      if (label) keys.push(norm(label));
      parentPath = getTreeParentPath(parent);
    }
    return keys;
  };

  const buildIndex = rows => {
    const treeCtx = buildActiveTreeContext(rows);
    rows = treeCtx.rows;

    log('Construction de l\'index à partir de', rows.length, 'noeuds atteignables',
      `(${treeCtx.excludedDeleted} supprimés, ${treeCtx.excludedOrphans} orphelins exclus)`);

    const idx = { a: [], bByA: new Map(), eByAB: new Map(), fByABE: new Map() };

    for (const r of rows) {
      if (parseLevel(getTreeNodeName(r)) !== "a") continue;
      const label = cleanLabel(getTreeNodeName(r));
      if (!label) continue;
      idx.a.push({ label, raw: r, key: norm(label) });
    }
    idx.a = [...new Map(idx.a.map(x => [x.key, x])).values()]
      .sort((x, y) => x.label.localeCompare(y.label, "fr"));

    for (const r of rows) {
      if (parseLevel(getTreeNodeName(r)) !== "b") continue;
      const label = cleanLabel(getTreeNodeName(r));
      if (!label) continue;

      const aRow = findAncestorByLevel(r, "a", treeCtx);
      if (!aRow) continue;
      const aKey = norm(cleanLabel(getTreeNodeName(aRow)));
      const a = idx.a.find(x => x.key === aKey);
      if (!a) continue;

      if (!idx.bByA.has(a.key)) idx.bByA.set(a.key, []);
      idx.bByA.get(a.key).push({ label, raw: r, key: norm(label), aKey: a.key });
    }
    for (const [k, arr] of idx.bByA) {
      idx.bByA.set(k, [...new Map(arr.map(x => [x.key, x])).values()]
        .sort((x, y) => x.label.localeCompare(y.label, "fr")));
    }

    for (const r of rows) {
      if (parseLevel(getTreeNodeName(r)) !== "e") continue;
      const label = cleanLabel(getTreeNodeName(r));
      if (!label) continue;

      const aRow = findAncestorByLevel(r, "a", treeCtx);
      const bRow = findAncestorByLevel(r, "b", treeCtx);
      if (!aRow || !bRow) continue;

      const aKey = norm(cleanLabel(getTreeNodeName(aRow)));
      const bKey = norm(cleanLabel(getTreeNodeName(bRow)));
      const a = idx.a.find(x => x.key === aKey);
      if (!a) continue;
      const b = (idx.bByA.get(a.key) || []).find(x => x.key === bKey);
      if (!b) continue;

      const abKey = `${a.key}|||${b.key}`;
      if (!idx.eByAB.has(abKey)) idx.eByAB.set(abKey, []);
      idx.eByAB.get(abKey).push({ label, raw: r, key: norm(label), aKey: a.key, bKey: b.key });
    }
    for (const [k, arr] of idx.eByAB) {
      idx.eByAB.set(k, [...new Map(arr.map(x => [x.key, x])).values()]
        .sort((x, y) => x.label.localeCompare(y.label, "fr")));
    }

    for (const r of rows) {
      if (parseLevel(getTreeNodeName(r)) !== "f") continue;
      const label = cleanLabel(getTreeNodeName(r));
      if (!label) continue;

      const aRow = findAncestorByLevel(r, "a", treeCtx);
      const bRow = findAncestorByLevel(r, "b", treeCtx);
      const eRow = findAncestorByLevel(r, "e", treeCtx);
      if (!aRow || !bRow || !eRow) continue;

      const aKey = norm(cleanLabel(getTreeNodeName(aRow)));
      const bKey = norm(cleanLabel(getTreeNodeName(bRow)));
      const eKey = norm(cleanLabel(getTreeNodeName(eRow)));
      const a = idx.a.find(x => x.key === aKey);
      if (!a) continue;
      const b = (idx.bByA.get(a.key) || []).find(x => x.key === bKey);
      if (!b) continue;
      const e = (idx.eByAB.get(`${a.key}|||${b.key}`) || []).find(x => x.key === eKey);
      if (!e) continue;

      const abeKey = `${a.key}|||${b.key}|||${e.key}`;
      if (!idx.fByABE.has(abeKey)) idx.fByABE.set(abeKey, []);
      idx.fByABE.get(abeKey).push({ label, raw: r, key: norm(label) });
    }
    for (const [k, arr] of idx.fByABE) {
      idx.fByABE.set(k, [...new Map(arr.map(x => [x.key, x])).values()]
        .sort((x, y) => x.label.localeCompare(y.label, "fr")));
    }

    log('Index construit:');
    log('  - Domaines (a):', idx.a.length);
    log('  - Sous-domaines (b):', idx.bByA.size, 'groupes');
    log('  - Thèmes (e):', idx.eByAB.size, 'groupes');
    log('  - Sujets (f):', idx.fByABE.size, 'groupes');

    // Diagnostic accessible via l'objet global : window.Koha099TreeDebug
    window.Koha099TreeDebug = {
      totalRows: (treeCtx.excludedDeleted + treeCtx.excludedOrphans + rows.length),
      activeReachableRows: rows.length,
      excludedDeleted: treeCtx.excludedDeleted,
      excludedOrphans: treeCtx.excludedOrphans,
      find(text) {
        const needle = norm(text || "");
        return treeCtx.allRows.filter(r => {
          const hay = `${getTreeNodeName(r)} ${getTreeParentPath(r)}`;
          return norm(hay).includes(needle);
        }).map(r => ({
          id: r.id,
          name: getTreeNodeName(r),
          parentPath: getTreeParentPath(r),
          deleted: r.deleted,
          reachable: treeCtx.reachablePaths.has(getTreeFullPath(r)),
          level: parseLevel(getTreeNodeName(r))
        }));
      }
    };

    return idx;
  };

  // --- Récupérer les valeurs sélectionnées ---
  const getCurrentValues = (scope) => {
    const aField = findFieldInScope(scope, "a");
    const bField = findFieldInScope(scope, "b");
    const eField = findFieldInScope(scope, "e");
    const fField = findFFieldInScope(scope);

    const getValue = field => {
      if (!field) return "";
      if (field.tagName === "SELECT") {
        const selected = field.options[field.selectedIndex];
        return selected ? (selected.textContent || selected.value || "") : (field.value || "");
      }
      return field.value || "";
    };

    const values = {
      a: getValue(aField),
      b: getValue(bField),
      e: getValue(eField),
      f: getValue(fField)
    };
    
    log('Valeurs actuelles:', values);
    return values;
  };

  // --- Vérifier si une valeur est autorisée ---
  const isValueAllowed = (value, allowedLabels, fieldName) => {
    if (!value) {
      log(`  ${fieldName}: valeur vide, considérée comme autorisée`);
      return true;
    }
    if (allowedLabels.length === 0) {
      log(`  ${fieldName}: aucune option autorisée, valeur non autorisée`);
      return false;
    }
    const valueNorm = norm(value);
    const isAllowed = allowedLabels.some(label => norm(label) === valueNorm);
    log(`  ${fieldName}: "${value}" ${isAllowed ? 'autorisée ✓' : 'NON AUTORISÉE ✗'} (parmi ${allowedLabels.length} options)`);
    return isAllowed;
  };

  // --- Trouver le conteneur Select2 associé à un select ---
  const findSelect2Container = (select) => {
    if (!select) return null;
    
    // Méthode 1: chercher le conteneur Select2 via l'ID
    if (select.id) {
      const containerId = 'select2-' + select.id + '-container';
      const container = document.getElementById(containerId);
      if (container) return container.closest('.select2-container');
    }
    
    // Méthode 2: via data-select2-id
    const select2Id = select.getAttribute('data-select2-id');
    if (select2Id) {
      const container = document.querySelector(`.select2-container[data-select2-id="${select2Id}"]`);
      if (container) return container;
    }
    
    // Méthode 3: chercher dans le parent proche
    const parent = select.parentElement;
    if (parent && parent.classList.contains('select2')) {
      return parent.querySelector('.select2-container') || parent.closest('.select2-container');
    }
    
    // Méthode 4: chercher tous les conteneurs et vérifier la correspondance
    const allContainers = document.querySelectorAll('.select2-container');
    for (const container of allContainers) {
      const labelledBy = container.getAttribute('aria-labelledby');
      if (labelledBy && select.id && labelledBy.includes(select.id)) {
        return container;
      }
      
      // Vérifier si le select est un enfant de ce conteneur
      if (container.contains(select)) {
        return container;
      }
    }
    
    return null;
  };

  // --- APPLIQUER LA SURBRILLANCE ---
  const applyHighlightToField = (field, isInvalid, fieldName) => {
    if (!field) {
      log(`  ${fieldName}: champ non trouvé`);
      return;
    }

    // Trouver le conteneur Select2
    const select2Container = findSelect2Container(field);
    
    log(`  ${fieldName}: SURBRILLANCE = ${isInvalid ? 'ACTIVÉE 🟠' : 'DÉSACTIVÉE'}`);
    log(`  ${fieldName}: conteneur Select2 trouvé = ${!!select2Container}`);
    
    if (isInvalid) {
      // AJOUTER LA CLASSE AU SELECT NATIF
      field.classList.add('koha099-invalid');
      
      if (select2Container) {
        // AJOUTER LA CLASSE AU CONTENEUR SELECT2
        select2Container.classList.add('koha099-invalid');
        select2Container.setAttribute('data-invalid', 'true');
        select2Container.setAttribute('title', '⚠️ Valeur non autorisée');
        log(`  ${fieldName}: classe ajoutée au conteneur Select2`);
        
        // STYLES INLINE SUR LE CONTENEUR (VERSION COMPACTE)
        select2Container.style.border = '1.5px solid #e67e22 !important';
        select2Container.style.borderRadius = '3px !important';
        select2Container.style.backgroundColor = '#fef5e7 !important';
        select2Container.style.boxShadow = '0 0 0 2px rgba(230, 126, 34, 0.15) !important';
        
        // STYLES SUR .select2-selection
        const selection = select2Container.querySelector('.select2-selection');
        if (selection) {
          selection.style.border = '1.5px solid #e67e22 !important';
          selection.style.backgroundColor = '#fef5e7 !important';
          selection.style.borderRadius = '3px !important';
        }
        
        // STYLES SUR .select2-selection__rendered (COMPACT)
        const rendered = select2Container.querySelector('.select2-selection__rendered');
        if (rendered) {
          rendered.style.color = '#9c5a1a !important';
          rendered.style.fontWeight = '600 !important';
          rendered.style.backgroundColor = '#fef5e7 !important';
          rendered.style.padding = '2px 6px !important';
          rendered.style.lineHeight = '1.2 !important';
        }
        
        // STYLES SUR .select2-selection__arrow
        const arrow = select2Container.querySelector('.select2-selection__arrow');
        if (arrow) {
          arrow.style.backgroundColor = '#fef5e7 !important';
          arrow.style.borderLeft = '1px solid #e67e22 !important';
        }
        
        log(`  ${fieldName}: ✅ surbrillance APPLIQUÉE sur Select2`);
      } else {
        log(`  ${fieldName}: ⚠️ conteneur Select2 introuvable, application sur le select natif uniquement`);
      }
      
      field.title = '⚠️ Valeur non autorisée';
    } else {
      // RETIRER LA SURBRILLANCE
      field.classList.remove('koha099-invalid');
      field.title = '';
      
      if (select2Container) {
        select2Container.classList.remove('koha099-invalid');
        select2Container.removeAttribute('data-invalid');
        select2Container.removeAttribute('title');
        
        select2Container.style.border = '';
        select2Container.style.borderRadius = '';
        select2Container.style.backgroundColor = '';
        select2Container.style.boxShadow = '';
        
        const selection = select2Container.querySelector('.select2-selection');
        if (selection) {
          selection.style.border = '';
          selection.style.backgroundColor = '';
          selection.style.borderRadius = '';
        }
        
        const rendered = select2Container.querySelector('.select2-selection__rendered');
        if (rendered) {
          rendered.style.color = '';
          rendered.style.fontWeight = '';
          rendered.style.backgroundColor = '';
          rendered.style.padding = '';
          rendered.style.lineHeight = '';
        }
        
        const arrow = select2Container.querySelector('.select2-selection__arrow');
        if (arrow) {
          arrow.style.backgroundColor = '';
          arrow.style.borderLeft = '';
        }
      }
      log(`  ${fieldName}: surbrillance retirée`);
    }
  };

  // --- Filtrer les options SELECT natif ---
  const filterSelectOptions = (select, allowedLabels, forceHideAll, currentValue, fieldName) => {
    if (!select || !select.options) {
      log(`  ${fieldName}: select non trouvé`);
      return;
    }

    log(`  ${fieldName}: filtrage avec ${allowedLabels.length} labels autorisés`);

    const allowedSet = new Set(allowedLabels.map(norm));
    let hasVisibleOption = false;

    for (let i = 0; i < select.options.length; i++) {
      const opt = select.options[i];
      const optLabel = norm(opt.textContent);

      if (opt.value === "") {
        opt.style.display = "";
        opt.disabled = false;
        opt.removeAttribute('hidden');
        continue;
      }

      if (forceHideAll || allowedLabels.length === 0) {
        opt.style.display = "none";
        opt.disabled = true;
        opt.setAttribute('hidden', 'hidden');
        continue;
      }

      if (allowedSet.has(optLabel)) {
        opt.style.display = "";
        opt.disabled = false;
        opt.removeAttribute('hidden');
        if (opt.value !== "") hasVisibleOption = true;
      } else {
        opt.style.display = "none";
        opt.disabled = true;
        opt.setAttribute('hidden', 'hidden');
      }
    }

    if (!hasVisibleOption && allowedLabels.length > 0) {
      for (let i = 0; i < select.options.length; i++) {
        const opt = select.options[i];
        if (opt.value !== "") {
          opt.style.display = "none";
          opt.disabled = true;
          opt.setAttribute('hidden', 'hidden');
        }
      }
    }

    // Appliquer la surbrillance
    const isCurrentValueAllowed = isValueAllowed(currentValue, allowedLabels, fieldName);
    const isInvalid = !isCurrentValueAllowed && currentValue !== '';
    log(`  ${fieldName}: isInvalid = ${isInvalid}`);
    
    // APPLIQUER LA SURBRILLANCE
    applyHighlightToField(select, isInvalid, fieldName);
  };

  // --- Désactiver ou vider un select ---
  const setSelectDisabled = (select, disabled, reason, fieldName) => {
    if (!select) {
      log(`  ${fieldName}: select non trouvé`);
      return;
    }
    
    if (select.disabled === disabled) {
      return;
    }
    
    select.disabled = disabled;
    
    if (disabled) {
      select.style.opacity = '0.6';
      select.style.cursor = 'not-allowed';
      select.title = reason || 'Sélectionnez d\'abord le niveau supérieur';
      
      const emptyOpt = [...select.options].find(o => o.value === "");
      if (emptyOpt) {
        select.selectedIndex = emptyOpt.index;
      } else if (select.options.length > 0) {
        select.selectedIndex = 0;
      }
      select.value = "";
      
      applyHighlightToField(select, false, fieldName);
    } else {
      select.style.opacity = '1';
      select.style.cursor = 'default';
      select.title = '';
    }
    
    if (window.jQuery) {
      try {
        window.jQuery(select).trigger('change');
      } catch (e) {}
    }
  };

  // --- Appliquer les filtres ---
  let filterTimeout = null;

  const applyFilters = (idx, scope) => {
    if (filterTimeout) {
      clearTimeout(filterTimeout);
      filterTimeout = null;
    }

    filterTimeout = setTimeout(() => {
      log('=== APPLY FILTERS ===');
      
      const values = getCurrentValues(scope);

      const aMatch = idx.a.find(x => norm(x.label) === norm(values.a));
      log('Domaine trouvé:', aMatch ? aMatch.label : 'Aucun');
      
      let bList = [];
      let bMatch = null;
      let bLabels = [];
      
      if (aMatch) {
        bList = idx.bByA.get(aMatch.key) || [];
        bMatch = bList.find(x => norm(x.label) === norm(values.b));
        bLabels = bList.map(x => x.label);
        log('Sous-domaines disponibles:', bList.length);
      }

      let eList = [];
      let eMatch = null;
      let eLabels = [];
      
      if (aMatch && bMatch) {
        const abKey = `${aMatch.key}|||${bMatch.key}`;
        eList = idx.eByAB.get(abKey) || [];
        eMatch = eList.find(x => norm(x.label) === norm(values.e));
        eLabels = eList.map(x => x.label);
        log('Thèmes disponibles:', eList.length);
      }

      let fList = [];
      let fLabels = [];
      
      if (aMatch && bMatch && eMatch) {
        const abeKey = `${aMatch.key}|||${bMatch.key}|||${eMatch.key}`;
        fList = idx.fByABE.get(abeKey) || [];
        fLabels = fList.map(x => x.label);
        log('Sujets disponibles:', fList.length);
      }

      const bField = findFieldInScope(scope, "b");
      const eField = findFieldInScope(scope, "e");
      const fField = findFFieldInScope(scope);

      const processField = (field, allowedLabels, isDisabled, reason, forceHideAll, currentValue, fieldName) => {
        if (!field) {
          log(`  ${fieldName}: champ non trouvé`);
          return;
        }
        
        if (isDisabled) {
          setSelectDisabled(field, true, reason, fieldName);
          filterSelectOptions(field, [], true, currentValue, fieldName);
        } else {
          setSelectDisabled(field, false, null, fieldName);
          filterSelectOptions(field, allowedLabels, false, currentValue, fieldName);
        }
      };

      processField(bField, bLabels, !aMatch, 'Sélectionnez d\'abord un Domaine', true, values.b, '$b (Sous-domaine)');
      processField(eField, eLabels, !(aMatch && bMatch), aMatch ? 'Sélectionnez d\'abord un Sous-domaine' : 'Sélectionnez d\'abord un Domaine', true, values.e, '$e (Thème)');
      processField(fField, fLabels, !(aMatch && bMatch && eMatch), 'Sélectionnez d\'abord un Thème', true, values.f, '$f (Sujet)');

      log('=== FIN APPLY FILTERS ===');
      filterTimeout = null;
    }, 100);
  };

  // --- Réappliquer la surbrillance après délai (Select2 ready) ---
  const reapplyHighlightAfterDelay = (scope, idx) => {
    setTimeout(() => {
      log('=== REAPPLY HIGHLIGHT (Select2 ready) ===');
      const values = getCurrentValues(scope);
      const aMatch = idx.a.find(x => norm(x.label) === norm(values.a));
      
      let bMatch = null;
      let eMatch = null;
      let fMatch = null;
      
      if (aMatch) {
        const bList = idx.bByA.get(aMatch.key) || [];
        bMatch = bList.find(x => norm(x.label) === norm(values.b));
      }
      
      if (aMatch && bMatch) {
        const abKey = `${aMatch.key}|||${bMatch.key}`;
        const eList = idx.eByAB.get(abKey) || [];
        eMatch = eList.find(x => norm(x.label) === norm(values.e));
      }
      
      if (aMatch && bMatch && eMatch) {
        const abeKey = `${aMatch.key}|||${bMatch.key}|||${eMatch.key}`;
        const fList = idx.fByABE.get(abeKey) || [];
        fMatch = fList.find(x => norm(x.label) === norm(values.f));
      }

      const bField = findFieldInScope(scope, "b");
      const eField = findFieldInScope(scope, "e");
      const fField = findFFieldInScope(scope);

      const bLabels = aMatch ? (idx.bByA.get(aMatch.key) || []).map(x => x.label) : [];
      const eLabels = (aMatch && bMatch) ? (idx.eByAB.get(`${aMatch.key}|||${bMatch.key}`) || []).map(x => x.label) : [];
      const fLabels = (aMatch && bMatch && eMatch) ? (idx.fByABE.get(`${aMatch.key}|||${bMatch.key}|||${eMatch.key}`) || []).map(x => x.label) : [];

      const isBInvalid = !isValueAllowed(values.b, bLabels, '$b') && values.b !== '';
      const isEInvalid = !isValueAllowed(values.e, eLabels, '$e') && values.e !== '';
      const isFInvalid = !isValueAllowed(values.f, fLabels, '$f') && values.f !== '';

      log(`Réapplication surbrillance: b=${isBInvalid}, e=${isEInvalid}, f=${isFInvalid}`);
      
      applyHighlightToField(bField, isBInvalid, '$b (retry)');
      applyHighlightToField(eField, isEInvalid, '$e (retry)');
      applyHighlightToField(fField, isFInvalid, '$f (retry)');
    }, 800);
  };

  // --- Mise en place des écouteurs ---
  const setupListeners = (idx, scope) => {
    const aField = findFieldInScope(scope, "a");
    const bField = findFieldInScope(scope, "b");
    const eField = findFieldInScope(scope, "e");

    const onFieldChange = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      log('Changement détecté sur', e.target ? e.target.name : 'inconnu');
      setTimeout(() => applyFilters(idx, scope), 50);
    };

    const attachListener = (field, callback) => {
      if (!field || field._listenerAttached) return;
      field._listenerAttached = true;
      
      field.addEventListener("change", callback);
      
      if (window.jQuery) {
        try {
          window.jQuery(field).on("change.select2", callback);
        } catch (e) {}
      }
    };

    attachListener(aField, onFieldChange);
    attachListener(bField, onFieldChange);
    attachListener(eField, onFieldChange);
  };

  // --- Initialisation d'un scope ---
  const initScope = (idx, scope) => {
    if (scope._initialized) return;
    scope._initialized = true;
    log('=== INIT SCOPE ===');
    
    applyFilters(idx, scope);
    setupListeners(idx, scope);
    
    // NOUVEAU : Réappliquer la surbrillance une fois Select2 initialisé
    reapplyHighlightAfterDelay(scope, idx);
  };

  // --- Ajouter le style ---
  const addStyle = () => {
    if (document.getElementById('koha099_filter_style')) return;
    
    const style = document.createElement('style');
    style.id = 'koha099_filter_style';
    style.textContent = `
      /* Masquer les options désactivées dans le SELECT natif */
      select option[hidden],
      select option[style*="display: none"] {
        display: none !important;
      }
      
      /* Masquer les options désactivées dans Select2 */
      .select2-container--default .select2-results__option[aria-disabled="true"] {
        display: none !important;
      }
      
      /* Style pour les selects désactivés */
      select:disabled {
        opacity: 0.6 !important;
        cursor: not-allowed !important;
      }
      
      /* ===== SURBRILLANCE ORANGE DISCRÈTE ET COMPACTE ===== */
      
      /* Conteneur principal Select2 en surbrillance */
      .select2-container.koha099-invalid {
        border: 1.5px solid #e67e22 !important;
        border-radius: 3px !important;
        background-color: #fef5e7 !important;
        box-shadow: 0 0 0 2px rgba(230, 126, 34, 0.15) !important;
      }
      
      /* L'élément de sélection à l'intérieur */
      .select2-container.koha099-invalid .select2-selection {
        border: 1.5px solid #e67e22 !important;
        background: #fef5e7 !important;
        border-radius: 3px !important;
      }
      
      /* Le texte affiché (rendered) - VERSION COMPACTE */
      .select2-container.koha099-invalid .select2-selection__rendered {
        color: #9c5a1a !important;
        font-weight: 600 !important;
        background-color: #fef5e7 !important;
        padding: 2px 6px !important;
        line-height: 1.2 !important;
      }
      
      /* Ajouter un warning icon */
      .select2-container.koha099-invalid .select2-selection__rendered::after {
        content: " ⚠️" !important;
        color: #e67e22 !important;
        font-size: 13px !important;
        font-weight: 600 !important;
      }
      
      /* La flèche de dropdown */
      .select2-container.koha099-invalid .select2-selection__arrow {
        background-color: #fef5e7 !important;
        border-left: 1px solid #e67e22 !important;
      }
      
      /* Sélecteur natif en surbrillance */
      select.koha099-invalid {
        border: 1.5px solid #e67e22 !important;
        background-color: #fef5e7 !important;
        box-shadow: 0 0 0 2px rgba(230, 126, 34, 0.15) !important;
        color: #9c5a1a !important;
        font-weight: 600 !important;
      }
    `;
    document.head.appendChild(style);
    log('Style CSS ajouté');
  };

  // --- Initialisation ---
  const init = (idx) => {
    let attempts = 0;
    const maxAttempts = 30;

    const checkAndApply = () => {
      const scopes = findTagScopes();
      
      if (scopes.length === 0) {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkAndApply, 300);
        }
        return;
      }

      log(`${scopes.length} scope(s) trouvé(s)`);
      scopes.forEach(scope => initScope(idx, scope));

      const observer = new MutationObserver(() => {
        const newScopes = findTagScopes();
        newScopes.forEach(scope => {
          if (!scope._initialized) {
            initScope(idx, scope);
          }
        });
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    };

    checkAndApply();
  };

  // --- Bootstrap ---
  const boot = async () => {
    try {
      log('=== BOOT START ===');
      addStyle();

      const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js");
      const firebaseFirestore = await import("https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js");
      
      const { getFirestore, collection, getDocs } = firebaseFirestore;

      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app);
      const treeCollection = collection(db, "treeData");

      log('Récupération des données Firebase...');
      const snapshot = await getDocs(treeCollection);
      
      const rows = [];
      snapshot.forEach(doc => rows.push({ id: doc.id, ...doc.data() }));
      
      log(`${rows.length} lignes récupérées de Firebase`);
      
      if (rows.length === 0) {
        (function(){})("Aucune donnée treeData trouvée dans Firebase");
        return;
      }

      const idx = buildIndex(rows);
      init(idx);
      log('=== BOOT COMPLETE ===');

    } catch (error) {
      (function(){})("Erreur lors de l'initialisation:", error);
    }
  };

  // --- Démarrer ---
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

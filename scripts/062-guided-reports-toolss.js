//-----------------------------------------------------------------------------------------------------------------------------
// 062-guided-reports-tools: kit autonome pour les résultats de rapports Koha + configuration PMK pré-plugin
//-----------------------------------------------------------------------------------------------------------------------------
(function(){
  'use strict';

  try {
    if (window.location.pathname.indexOf('guided_reports.pl') === -1) return;

    function localWaitForSelector(selector, timeout) {
      return new Promise(function(resolve, reject) {
        var el = document.querySelector(selector);
        if (el) return resolve(el);
        var obs = new MutationObserver(function() {
          var node = document.querySelector(selector);
          if (node) {
            obs.disconnect();
            resolve(node);
          }
        });
        obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
        if (typeof timeout === 'number') {
          setTimeout(function() {
            obs.disconnect();
            reject(new Error('Timed out waiting for ' + selector));
          }, timeout);
        }
      });
    }

    var waitForSelector = (window.KOHA_UTILS && typeof window.KOHA_UTILS.waitForSelector === 'function')
      ? window.KOHA_UTILS.waitForSelector
      : localWaitForSelector;

    // Configuration PMK pré-plugin : toutes les fonctions historiques restent actives par défaut.
    var MODULE_ID = 'guided-reports-tools';
    var pmkConfig = null;
    var externalConfig = window.GUIDED_REPORTS_TOOLS || {};

    var DEFAULT_FEATURES = {
      generalSearch: true,
      columnFilters: true,
      filterHighlight: true,
      sorting: true,
      visibleColumns: true,
      stickyHeader: true,
      rowHighlight: true,
      cellStatistics: true,
      columnReordering: true,
      report5191Preset: true
    };

    var FEATURES = Object.assign({}, DEFAULT_FEATURES);
    var CONFIG = { debounce: 250 };
    var SPECIAL_REPORT_IDS = ['5191'];

    function refreshRuntimeConfig() {
      /*
       * La configuration PMK est l'autorité lorsqu'elle est disponible.
       * L'ancien objet window.GUIDED_REPORTS_TOOLS n'est utilisé qu'en
       * secours lorsque PMK n'est réellement pas chargé. Cela évite
       * qu'une ancienne configuration globale à true réactive une option
       * explicitement désactivée dans PMK.
       */
      var featureOverrides = pmkConfig && pmkConfig.features
        ? pmkConfig.features
        : (externalConfig.features || {});

      FEATURES = Object.assign({}, DEFAULT_FEATURES, featureOverrides);

      var debounceValue = 250;
      try {
        if (pmkConfig && pmkConfig.debounce != null) {
          debounceValue = Number(pmkConfig.debounce);
        } else if (externalConfig.debounce != null) {
          debounceValue = Number(externalConfig.debounce);
        }
      } catch (e) {}
      if (!isFinite(debounceValue) || debounceValue < 0) debounceValue = 250;
      CONFIG.debounce = debounceValue;

      // Le 5191 reste volontairement un comportement interne du 062.
      SPECIAL_REPORT_IDS = ['5191'];
    }

    function getPmkApi() {
      try {
        if (
          window.PMKConfig &&
          typeof window.PMKConfig.getConfig === 'function'
        ) {
          return window.PMKConfig;
        }
      } catch (e) {}
      return null;
    }

    function waitForPmkApi(timeout) {
      var maxWait = typeof timeout === 'number' ? timeout : 6000;
      var startedAt = Date.now();

      return new Promise(function(resolve) {
        function check() {
          var api = getPmkApi();
          if (api) {
            resolve(api);
            return;
          }
          if ((Date.now() - startedAt) >= maxWait) {
            resolve(null);
            return;
          }
          window.setTimeout(check, 50);
        }
        check();
      });
    }

    function loadPmkConfig() {
      return waitForPmkApi(6000).then(function(api) {
        if (!api) return null;
        try {
          return Promise.resolve(api.getConfig(MODULE_ID, { force: true }))
            .catch(function() { return null; });
        } catch (e) {
          return null;
        }
      });
    }

    function subscribeToPmkChanges() {
      var api = getPmkApi();
      if (!api || typeof api.subscribe !== 'function') return;

      try {
        api.subscribe(MODULE_ID, function(nextConfig) {
          /*
           * Le 062 installe des listeners, des lignes de filtres, des styles
           * et peut réordonner/masquer des colonnes. Un rechargement contrôlé
           * est donc le moyen le plus sûr de garantir qu'une désactivation
           * retire réellement tout ce qui était déjà monté dans la page.
           */
          pmkConfig = nextConfig || null;
          refreshRuntimeConfig();
          window.location.reload();
        });
      } catch (e) {}
    }

    function begin() {
      refreshRuntimeConfig();

      if (pmkConfig && pmkConfig.enabled === false) return;
      if (pmkConfig && pmkConfig.page && pmkConfig.page.enabled === false) return;

    // Koha récent expose #report_results. On conserve le sélecteur historique en secours.
    var tableSelector = document.querySelector('#report_results') ? '#report_results' : '.pages + table';

    waitForSelector(tableSelector, 3000).then(function(table) {
      try {
        // Relecture tardive : si PMK a fini de charger après le 062, les interrupteurs sont tout de même pris en compte.
        refreshRuntimeConfig();
        if (!table) return;
        if (table.dataset.grtInited === '1') return;

        var headerRow = table.tHead && table.tHead.rows && table.tHead.rows[0]
          ? table.tHead.rows[0]
          : table.querySelector('tr');
        if (!headerRow || !headerRow.cells || !headerRow.cells.length) return;

        var tbody = table.tBodies && table.tBodies[0] ? table.tBodies[0] : null;
        if (!tbody) return;

        var originalRowOrder = Array.from(tbody.rows || []);
        var highlightedRows = [];
        var sortColumns = [];
        var columnVisibilityState = {};
        var filterRow = null;
        var searchInput = null;
        var toolsWrapper = null;
        var selectedCells = new Set();

        function debounce(fn, wait) {
          var t;
          return function() {
            var args = arguments;
            var ctx = this;
            clearTimeout(t);
            t = setTimeout(function() { fn.apply(ctx, args); }, wait);
          };
        }

        function escapeRegExp(s) {
          return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        function getBodyRows() {
          return Array.from(tbody.rows || []);
        }

        function getColumnIndexById(colId) {
          var headers = Array.from(headerRow.cells || []);
          for (var i = 0; i < headers.length; i++) {
            if (headers[i].dataset.grtColId === colId) return i;
          }
          return -1;
        }

        function getCellByColId(row, colId) {
          if (!row || !row.cells) return null;
          var idx = getColumnIndexById(colId);
          return idx >= 0 ? row.cells[idx] : null;
        }

        function cacheRow(row) {
          if (!row) return;
          try {
            row.dataset.grtText = Array.from(row.querySelectorAll('td')).map(function(cell) {
              return (cell && cell.innerText ? cell.innerText : '').toLowerCase();
            }).join('||');
          } catch (e) {}
        }

        function cacheAllRows() {
          getBodyRows().forEach(cacheRow);
        }

        function removeHighlights(root) {
          if (!root) return;
          var spans = root.querySelectorAll('span.grt-highlight');
          for (var i = 0; i < spans.length; i++) {
            var span = spans[i];
            span.replaceWith(document.createTextNode(span.textContent || ''));
          }
          try { root.normalize(); } catch (e) {}
        }

        // Surbrillance non destructive : on ne reconstruit jamais le innerHTML d'une cellule Koha.
        function highlightTextNodes(cell, term) {
          if (!cell || !term) return;
          var regex;
          try { regex = new RegExp(escapeRegExp(term), 'gi'); } catch (e) { return; }

          var nodes = [];
          var walker = document.createTreeWalker(
            cell,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode: function(node) {
                if (!node || !node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                var parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest('span.grt-highlight')) return NodeFilter.FILTER_REJECT;
                if (/^(SCRIPT|STYLE|TEXTAREA|OPTION)$/i.test(parent.tagName || '')) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
              }
            }
          );

          var node;
          while ((node = walker.nextNode())) nodes.push(node);

          nodes.forEach(function(textNode) {
            var text = textNode.nodeValue || '';
            regex.lastIndex = 0;
            if (!regex.test(text)) return;
            regex.lastIndex = 0;

            var frag = document.createDocumentFragment();
            var last = 0;
            var match;
            while ((match = regex.exec(text))) {
              if (match.index > last) frag.appendChild(document.createTextNode(text.slice(last, match.index)));
              var mark = document.createElement('span');
              mark.className = 'grt-highlight';
              mark.textContent = match[0];
              frag.appendChild(mark);
              last = match.index + match[0].length;
              if (match[0].length === 0) regex.lastIndex++;
            }
            if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
            try { textNode.parentNode.replaceChild(frag, textNode); } catch (e) {}
          });
        }

        function detectDateFormat(dateString) {
          if (/^\d{2}-\d{2}-\d{4}$/.test(dateString)) return 'DD-MM-YYYY';
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return 'YYYY-MM-DD';
          return null;
        }

        function parseDate(dateString, format) {
          if (format === 'DD-MM-YYYY') {
            var parts = dateString.split('-');
            return new Date(parts[2], parts[1] - 1, parts[0]);
          }
          if (format === 'YYYY-MM-DD') return new Date(dateString);
          return null;
        }

        function customCompare(a, b, asc) {
          a = (a || '').trim();
          b = (b || '').trim();
          if (!a && !b) return 0;
          if (!a) return asc ? -1 : 1;
          if (!b) return asc ? 1 : -1;

          var parseDuration = function(str) {
            var match = str.match(/(\d+)\s*mois.*?(\d+)\s*jours?/i);
            if (match) return parseInt(match[1], 10) * 30 + parseInt(match[2], 10);
            return null;
          };

          var durA = parseDuration(a);
          var durB = parseDuration(b);
          if (durA !== null && durB !== null) return asc ? durA - durB : durB - durA;

          var parseCote = function(str) {
            var match = str.match(/^(\d+(?:\.\d+)?)(?:\s+(.+))?$/);
            if (match) {
              return {
                type: 'dewey',
                number: parseFloat(match[1]),
                suffix: match[2] ? match[2].trim() : ''
              };
            }
            return { type: 'alpha', text: str };
          };

          var coteA = parseCote(a);
          var coteB = parseCote(b);
          if (coteA.type === 'dewey' && coteB.type === 'dewey') {
            if (coteA.number !== coteB.number) return asc ? coteA.number - coteB.number : coteB.number - coteA.number;
            return asc
              ? coteA.suffix.localeCompare(coteB.suffix, 'fr', { numeric: true })
              : coteB.suffix.localeCompare(coteA.suffix, 'fr', { numeric: true });
          }
          if (coteA.type === 'dewey' && coteB.type === 'alpha') return asc ? -1 : 1;
          if (coteA.type === 'alpha' && coteB.type === 'dewey') return asc ? 1 : -1;
          if (coteA.type === 'alpha' && coteB.type === 'alpha') {
            return asc
              ? coteA.text.localeCompare(coteB.text, 'fr', { numeric: true })
              : coteB.text.localeCompare(coteA.text, 'fr', { numeric: true });
          }

          var numA = parseFloat(a.replace(',', '.'));
          var numB = parseFloat(b.replace(',', '.'));
          if (!isNaN(numA) && !isNaN(numB)) return asc ? numA - numB : numB - numA;

          var parseDateGeneric = function(str) {
            var m;
            if ((m = str.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/))) return new Date(+m[3], m[2] - 1, +m[1]);
            if ((m = str.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/))) return new Date(+m[1], m[2] - 1, +m[3]);
            return null;
          };

          var dateA = parseDateGeneric(a);
          var dateB = parseDateGeneric(b);
          if (dateA && dateB) return asc ? dateA - dateB : dateB - dateA;

          return asc
            ? a.localeCompare(b, 'fr', { numeric: true })
            : b.localeCompare(a, 'fr', { numeric: true });
        }

        function assignColumnIds() {
          var headers = Array.from(headerRow.cells || []);
          headers.forEach(function(th, idx) {
            var colId = th.dataset.grtColId || ('grt-col-' + idx);
            th.dataset.grtColId = colId;
            if (!(colId in columnVisibilityState)) {
              columnVisibilityState[colId] = window.getComputedStyle(th).display !== 'none';
            }
          });

          getBodyRows().forEach(function(row) {
            headers.forEach(function(th, idx) {
              if (row.cells && row.cells[idx]) row.cells[idx].dataset.grtColId = th.dataset.grtColId;
            });
          });

          if (filterRow) {
            headers.forEach(function(th, idx) {
              if (filterRow.cells && filterRow.cells[idx]) filterRow.cells[idx].dataset.grtColId = th.dataset.grtColId;
            });
          }
        }

        function setColumnVisibility(colId, visible) {
          if (!colId) return;
          columnVisibilityState[colId] = !!visible;
          var cells = table.querySelectorAll('[data-grt-col-id="' + colId + '"]');
          cells.forEach(function(cell) {
            try {
              if (visible) {
                cell.style.display = '';
                if (cell.dataset) delete cell.dataset.grtHidden;
                if (cell.classList) cell.classList.remove('grt-hidden');
              } else {
                cell.style.display = 'none';
                if (cell.dataset) cell.dataset.grtHidden = '1';
                if (cell.classList) cell.classList.add('grt-hidden');
              }
            } catch (e) {}
          });

          var toggle = document.querySelector('input[data-grt-toggle-col="' + colId + '"]');
          try { if (toggle) toggle.checked = !!visible; } catch (e) {}
        }

        function isSpecialReport() {
          try {
            if (location.pathname !== '/cgi-bin/koha/reports/guided_reports.pl') return false;
            var params = new URLSearchParams(location.search);
            var urlId = String(params.get('id') || '');
            if (SPECIAL_REPORT_IDS.indexOf(urlId) !== -1) return true;

            var hiddenId = document.querySelector('#limitselect input[name="id"]');
            if (hiddenId && SPECIAL_REPORT_IDS.indexOf(String(hiddenId.value || '')) !== -1) return true;

            var sql = document.querySelector('#sql');
            if (sql && sql.value) {
              return SPECIAL_REPORT_IDS.some(function(id) {
                return sql.value.indexOf('saved_sql.id: ' + id) !== -1;
              });
            }
          } catch (e) {}
          return false;
        }

        function applyReport5191Preset() {
          if (!FEATURES.report5191Preset || !isSpecialReport()) return false;

          var DEFAULT_VISIBLE = new Set([
            'grt-col-0', 'grt-col-1', 'grt-col-2',
            'grt-col-6', 'grt-col-7', 'grt-col-8',
            'grt-col-9', 'grt-col-11'
          ]);

          Array.from(headerRow.cells || []).forEach(function(th, idx) {
            var headerText = (th.innerText || th.textContent || '').trim().toLowerCase();
            var colId = th.dataset.grtColId || ('grt-col-' + idx);
            if (headerText === 'code collection' || headerText === 'collection') DEFAULT_VISIBLE.add(colId);
          });

          Array.from(headerRow.cells || []).forEach(function(th, idx) {
            var colId = th.dataset.grtColId || ('grt-col-' + idx);
            setColumnVisibility(colId, DEFAULT_VISIBLE.has(colId));
          });
          return true;
        }

        function markExistingHiddenCols() {
          Array.from(headerRow.cells || []).forEach(function(th, idx) {
            try {
              var colId = th.dataset.grtColId || ('grt-col-' + idx);
              var hidden = window.getComputedStyle(th).display === 'none';
              if (hidden) setColumnVisibility(colId, false);
            } catch (e) {}
          });
        }

        function createFilterRow() {
          if (!FEATURES.columnFilters) return null;

          var row = document.createElement('tr');
          row.className = 'grt-filter-row';
          row.id = 'grt-filter-row';

          Array.from(headerRow.cells || []).forEach(function(headerCell, idx) {
            var filterName = (headerCell.innerText || headerCell.textContent || '').trim() || ('Colonne ' + (idx + 1));
            var cell = document.createElement('th');
            var colId = headerCell.dataset.grtColId || ('grt-col-' + idx);
            cell.dataset.grtColId = colId;

            var input = document.createElement('input');
            input.type = 'text';
            input.value = '';
            input.setAttribute('data-column-index', idx);
            input.placeholder = 'Filtrer...';
            input.setAttribute('aria-label', 'Filtrer ' + filterName);
            input.addEventListener('input', debounce(applyFilters, CONFIG.debounce));
            cell.appendChild(input);

            if (columnVisibilityState[colId] === false) cell.style.display = 'none';
            row.appendChild(cell);
          });

          if (headerRow.parentNode) headerRow.parentNode.appendChild(row);
          return row;
        }

        function currentFilterForIndex(idx) {
          if (!filterRow || !filterRow.cells || !filterRow.cells[idx]) return '';
          var input = filterRow.cells[idx].querySelector('input[data-column-index]');
          return input ? String(input.value || '').trim().toLowerCase() : '';
        }

        function applyFilters() {
          table.querySelectorAll('span.grt-highlight').forEach(function(span) {
            span.replaceWith(document.createTextNode(span.textContent || ''));
          });

          var searchTerm = FEATURES.generalSearch && searchInput
            ? String(searchInput.value || '').trim().toLowerCase()
            : '';

          getBodyRows().forEach(function(row) {
            var cells = Array.from(row.cells || []);
            var visible = true;

            if (searchTerm) {
              var rowText = row.dataset.grtText || cells.map(function(cell) {
                return (cell && cell.innerText ? cell.innerText : '').toLowerCase();
              }).join(' ');
              if (rowText.indexOf(searchTerm) === -1) visible = false;
            }

            if (visible && FEATURES.columnFilters && filterRow) {
              for (var j = 0; j < cells.length; j++) {
                var filterCell = filterRow.cells[j];
                if (!filterCell || window.getComputedStyle(filterCell).display === 'none') continue;
                var filterValue = currentFilterForIndex(j);
                if (filterValue && (cells[j].textContent || '').toLowerCase().indexOf(filterValue) === -1) {
                  visible = false;
                  break;
                }
              }
            }

            row.style.display = visible ? '' : 'none';

            if (visible && FEATURES.columnFilters && FEATURES.filterHighlight && filterRow) {
              for (var k = 0; k < cells.length; k++) {
                var visibleFilterCell = filterRow.cells[k];
                if (!visibleFilterCell || window.getComputedStyle(visibleFilterCell).display === 'none') continue;
                var visibleFilter = currentFilterForIndex(k);
                if (visibleFilter) highlightTextNodes(cells[k], visibleFilter);
              }
            }
          });
        }

        function createToolsWrapper() {
          var needsTools = FEATURES.columnFilters || FEATURES.sorting || FEATURES.visibleColumns || FEATURES.generalSearch;
          try {
            if (
              window.PMKConfig &&
              typeof window.PMKConfig.canOpenAdmin === 'function' &&
              window.PMKConfig.canOpenAdmin()
            ) needsTools = true;
          } catch (e) {}
          if (!needsTools) return null;

          var wrapper = document.createElement('div');
          wrapper.className = 'grt-tools';

          var limitSelectForm = document.getElementById('limitselect');
          if (limitSelectForm && limitSelectForm.parentNode) {
            limitSelectForm.parentNode.insertBefore(wrapper, limitSelectForm.nextSibling);
          } else if (table.parentNode) {
            // Koha récent n'a plus forcément le formulaire #limitselect : on garde les outils juste au-dessus du tableau.
            table.parentNode.insertBefore(wrapper, table);
          }
          return wrapper;
        }

        function createColumnToggleUI(buttonContainer) {
          if (!FEATURES.visibleColumns || !buttonContainer) return;

          var wrap = document.createElement('div');
          wrap.className = 'grt-columns-toggle';
          wrap.id = 'grt-columns-toggle';

          var title = document.createElement('div');
          title.className = 'grt-columns-title';
          title.textContent = 'Colonnes visibles';
          wrap.appendChild(title);

          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn btn-default grt-columns-button';
          button.textContent = 'Colonnes visibles';
          button.setAttribute('aria-expanded', 'false');
          button.setAttribute('aria-controls', wrap.id);
          button.addEventListener('click', function() {
            var visible = window.getComputedStyle(wrap).display !== 'none';
            wrap.style.display = visible ? 'none' : 'block';
            button.setAttribute('aria-expanded', String(!visible));
          });

          var anchor = document.createElement('div');
          anchor.className = 'grt-columns-anchor';
          anchor.appendChild(button);

          document.addEventListener('click', function(event) {
            if (!anchor.contains(event.target) && window.getComputedStyle(wrap).display !== 'none') {
              wrap.style.display = 'none';
              button.setAttribute('aria-expanded', 'false');
            }
          });

          var grid = document.createElement('div');
          grid.className = 'grt-columns-grid';

          Array.from(headerRow.cells || []).forEach(function(th, idx) {
            var colId = th.dataset.grtColId || ('grt-col-' + idx);
            var label = document.createElement('label');
            var input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = columnVisibilityState[colId] !== false;
            input.dataset.grtToggleCol = colId;

            var text = document.createElement('span');
            var headerName = (th.innerText || th.textContent || '').trim();
            text.textContent = headerName || ('Colonne ' + (idx + 1));

            input.addEventListener('change', function() {
              setColumnVisibility(colId, input.checked);
              applyFilters();
            });

            label.appendChild(input);
            label.appendChild(text);
            grid.appendChild(label);
          });

          wrap.appendChild(grid);
          anchor.appendChild(wrap);
          buttonContainer.appendChild(anchor);
        }

        function sortTable() {
          if (!FEATURES.sorting || !sortColumns.length) return;
          var rowsArray = getBodyRows();
          var fragment = document.createDocumentFragment();

          rowsArray.sort(function(rowA, rowB) {
            for (var idx = 0; idx < sortColumns.length; idx++) {
              var col = sortColumns[idx];
              var cellA = getCellByColId(rowA, col.colId);
              var cellB = getCellByColId(rowB, col.colId);
              var textA = cellA && cellA.textContent ? cellA.textContent.trim() : '';
              var textB = cellB && cellB.textContent ? cellB.textContent.trim() : '';
              var comp = customCompare(textA, textB, col.asc);
              if (comp !== 0) return comp;
            }
            return 0;
          });

          requestAnimationFrame(function() {
            rowsArray.forEach(function(row) { fragment.appendChild(row); });
            tbody.appendChild(fragment);
          });
        }

        function renderSortIcons() {
          Array.from(headerRow.cells || []).forEach(function(cell) {
            cell.classList.remove('asc', 'desc');
            var old = cell.querySelector('.sort-icon');
            if (old) old.remove();
          });

          sortColumns.forEach(function(col) {
            var idx = getColumnIndexById(col.colId);
            if (idx < 0 || !headerRow.cells[idx]) return;
            var cell = headerRow.cells[idx];
            var sortIcon = document.createElement('span');
            sortIcon.className = 'sort-icon grt-sort-icon ' + (col.asc ? 'asc' : 'desc');
            sortIcon.innerHTML = col.asc ? '&#9650;' : '&#9660;';
            cell.classList.add(col.asc ? 'asc' : 'desc');
            cell.appendChild(sortIcon);
          });
        }

        function resetSorting() {
          sortColumns.length = 0;
          renderSortIcons();
          var fragment = document.createDocumentFragment();
          originalRowOrder.forEach(function(row) { fragment.appendChild(row); });
          tbody.appendChild(fragment);
          applyFilters();
        }

        function moveCell(row, sourceIndex, targetIndex) {
          if (!row || !row.children) return;
          var cells = Array.from(row.children);
          var source = cells[sourceIndex];
          var target = cells[targetIndex];
          if (!source || !target || source === target) return;

          if (sourceIndex < targetIndex) {
            row.insertBefore(source, target.nextSibling);
          } else {
            row.insertBefore(source, target);
          }
        }

        function refreshFilterIndexes() {
          if (!filterRow) return;
          Array.from(filterRow.cells || []).forEach(function(cell, idx) {
            var input = cell.querySelector('input[data-column-index]');
            if (input) input.setAttribute('data-column-index', idx);
          });
        }

        function setupColumnReordering() {
          if (!FEATURES.columnReordering) return;

          var isDragging = false;
          var sourceColumnIndex = null;
          var justDragged = false;

          function handleDragStart(event) {
            var th = event.currentTarget || event.target.closest('th');
            if (!th) return;
            isDragging = true;
            sourceColumnIndex = th.cellIndex;
            try {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', String(sourceColumnIndex));
            } catch (e) {}
          }

          function handleDragOver(event) {
            event.preventDefault();
            try { event.dataTransfer.dropEffect = 'move'; } catch (e) {}
          }

          function handleDragEnd() {
            isDragging = false;
            sourceColumnIndex = null;
            justDragged = true;
            setTimeout(function() { justDragged = false; }, 50);
          }

          function handleDrop(event) {
            event.preventDefault();
            try {
              var th = event.currentTarget || event.target.closest('th');
              if (!th) return;
              var targetIndex = th.cellIndex;
              var src = parseInt(event.dataTransfer.getData('text/plain'), 10);
              if (isNaN(src)) src = sourceColumnIndex;
              if (isNaN(src) || src === targetIndex) return;

              moveCell(headerRow, src, targetIndex);
              if (filterRow) moveCell(filterRow, src, targetIndex);
              getBodyRows().forEach(function(row) { moveCell(row, src, targetIndex); });

              refreshFilterIndexes();
              renderSortIcons();
              cacheAllRows();
              applyFilters();
            } catch (e) {
            } finally {
              isDragging = false;
              sourceColumnIndex = null;
              justDragged = true;
              setTimeout(function() { justDragged = false; }, 50);
            }
          }

          Array.from(headerRow.querySelectorAll('th')).forEach(function(header) {
            try {
              header.setAttribute('draggable', 'true');
              header.addEventListener('dragstart', handleDragStart);
              header.addEventListener('dragover', handleDragOver);
              header.addEventListener('dragend', handleDragEnd);
              header.addEventListener('drop', handleDrop);
            } catch (e) {}
          });

          headerRow.dataset.grtDragEnabled = '1';
          headerRow.__grtJustDragged = function() { return justDragged; };
        }

        function parseNumericValue(text) {
          var normalized = String(text || '')
            .replace(/\u00a0/g, ' ')
            .trim()
            .replace(/\s+/g, '')
            .replace(',', '.');
          if (!normalized) return null;
          var value = parseFloat(normalized);
          return isNaN(value) ? null : value;
        }

        function calculerStats(cells) {
          var values = [];
          cells.forEach(function(cell) {
            var value = parseNumericValue(cell.textContent);
            if (value !== null) values.push(value);
          });

          if (!values.length) {
            return {
              somme: 0,
              moyenne: 'Calcul impossible',
              minimum: 'Calcul impossible',
              maximum: 'Calcul impossible'
            };
          }

          var somme = values.reduce(function(total, value) { return total + value; }, 0);
          return {
            somme: somme,
            moyenne: (somme / values.length).toFixed(2),
            minimum: Math.min.apply(Math, values),
            maximum: Math.max.apply(Math, values)
          };
        }

        function updateStatsDiv(event) {
          if (!FEATURES.cellStatistics) return;
          var statsDiv = document.getElementById('grt-stats');
          if (event.shiftKey) {
            if (!statsDiv) {
              statsDiv = document.createElement('div');
              statsDiv.id = 'grt-stats';
              document.body.appendChild(statsDiv);
            }
            var stats = calculerStats(selectedCells);
            statsDiv.innerHTML = '<p>Somme : ' + stats.somme + '</p>' +
              '<p>Moyenne : ' + stats.moyenne + '</p>' +
              '<p>Minimum : ' + stats.minimum + '</p>' +
              '<p>Maximum : ' + stats.maximum + '</p>';
            statsDiv.style.display = 'block';
          } else if (statsDiv) {
            statsDiv.style.display = 'none';
          }
        }

        function cellClickHandler(event) {
          if (!FEATURES.cellStatistics) return;
          var cell = event.target.closest('td');
          if (!cell) return;
          if (event.shiftKey) {
            selectedCells.add(cell);
            cell.classList.add('grt-stat-selected');
          }
          updateStatsDiv(event);
        }

        function shiftUpHandler() {
          if (!FEATURES.cellStatistics) return;
          selectedCells.forEach(function(cell) { cell.classList.remove('grt-stat-selected'); });
          selectedCells.clear();
          var statsDiv = document.getElementById('grt-stats');
          if (statsDiv) statsDiv.style.display = 'none';
        }

        function publishColumnsReady(is5191) {
          try {
            var detail = {
              tableSelector: table.id ? ('#' + table.id) : tableSelector
            };
            if (is5191) detail.report = 5191;

            window.GRT = window.GRT || {};
            window.GRT.columnsReady = true;
            window.GRT.columnsReadyPromise = Promise.resolve(detail);
            document.dispatchEvent(new CustomEvent('grt:columns-ready', { detail: detail }));
          } catch (e) {}
        }

        function setupObservers() {
          try {
            var debSetColumnVisibility = debounce(function(colId, visible) {
              if (columnVisibilityState[colId] !== visible) setColumnVisibility(colId, visible);
            }, 50);

            var headerObserver = new MutationObserver(function(mutations) {
              mutations.forEach(function(mutation) {
                try {
                  var th = mutation.target && mutation.target.closest ? mutation.target.closest('th') : null;
                  if (!th || !headerRow.contains(th)) return;
                  var colId = th.dataset.grtColId;
                  if (!colId) return;
                  var hidden = window.getComputedStyle(th).display === 'none';
                  debSetColumnVisibility(colId, !hidden);
                } catch (e) {}
              });
            });
            headerObserver.observe(headerRow, {
              attributes: true,
              subtree: true,
              attributeFilter: ['style', 'class']
            });

            var tableObserver = new MutationObserver(function(mutations) {
              mutations.forEach(function(mutation) {
                try {
                  var target = mutation.target;
                  if (mutation.type === 'attributes' && target && target.nodeName === 'TD') {
                    var colId = target.dataset.grtColId;
                    if (!colId) return;
                    var hidden = window.getComputedStyle(target).display === 'none';
                    if (columnVisibilityState[colId] !== !hidden) debSetColumnVisibility(colId, !hidden);
                  }
                } catch (e) {}
              });
            });
            tableObserver.observe(tbody, {
              attributes: true,
              subtree: true,
              attributeFilter: ['style', 'class']
            });

            var childListObserver = new MutationObserver(function() {
              try {
                assignColumnIds();
                cacheAllRows();
                Object.keys(columnVisibilityState).forEach(function(colId) {
                  setColumnVisibility(colId, columnVisibilityState[colId]);
                });
                applyFilters();
              } catch (e) {}
            });
            childListObserver.observe(table, { childList: true, subtree: true });
            setTimeout(function() {
              try { childListObserver.disconnect(); } catch (e) {}
            }, 2000);
          } catch (e) {}
        }

        // Styles historiques, avec une classe dédiée à la sélection statistique.
        if (!document.getElementById('grt-styles')) {
          var style = document.createElement('style');
          style.id = 'grt-styles';
          style.type = 'text/css';
          style.textContent = '\n.grt-filter-row{display:none;}\n.grt-filter-row th{padding:6px 4px;background:#f6f8fb;}\n.grt-filter-row input[type="text"]{box-sizing:border-box;width:100%;height:32px;padding:5px 8px;border:1px solid #c7d1dc;border-radius:4px;background:#fff;color:#263746;}\n.grt-filter-row input[type="text"]:focus{outline:0;border-color:#287ea3;box-shadow:0 0 0 2px rgba(40,126,163,.15);}\n.grt-highlight{background:yellow;padding:0 2px;border-radius:2px;}\n.grt-highlighted td, .grt-highlighted{background:#fffbdd !important;}\n.grt-stat-selected{background:yellow !important;}\n.grt-sort-icon.asc, .grt-sort-icon.desc{margin-left:6px;font-size:0.9em;}\n.grt-sticky th{position:sticky;top:0;background:#fff;z-index:3;}\n.grt-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0;position:relative;z-index:10;}\n.grt-tools button{height:34px;padding:0 12px;border:1px solid #c7d1dc;border-radius:4px;background:#fff;color:#34495a;font-weight:600;cursor:pointer;transition:background .15s,border-color .15s,color .15s,box-shadow .15s;}\n.grt-tools button:hover{border-color:#287ea3;background:#eef7fb;color:#1d607e;}\n.grt-tools button:focus{outline:0;box-shadow:0 0 0 2px rgba(40,126,163,.15);}\n.grt-general-search{min-width:260px;height:34px;padding:6px 10px;border:1px solid #c7d1dc;border-radius:4px;}\n.grt-general-search:focus{outline:0;border-color:#287ea3;box-shadow:0 0 0 2px rgba(40,126,163,.15);}\n.grt-columns-anchor{position:relative;}\n.grt-columns-button[aria-expanded="true"]{border-color:#287ea3;background:#eaf5f9;color:#1d607e;}\n.grt-columns-toggle{display:none;position:absolute;top:calc(100% + 5px);left:0;min-width:220px;max-height:360px;overflow-y:auto;padding:11px;border:1px solid #d8e0e8;border-radius:6px;background:#fff;box-shadow:0 5px 16px rgba(30,45,60,.16);}\n.grt-columns-title{margin-bottom:8px;font-size:13px;font-weight:600;color:#526273;}\n.grt-columns-grid{display:flex;flex-direction:column;gap:2px;}\n.grt-columns-grid label{display:flex;align-items:center;gap:8px;padding:7px 8px;font-weight:400;border-radius:4px;cursor:pointer;}\n.grt-columns-grid label:hover{background:#f1f6f8;}\n.grt-columns-grid input{width:16px;height:16px;accent-color:#287ea3;}\n#grt-stats{position:fixed;right:10px;top:80px;background:white;border:1px solid #ccc;padding:8px;z-index:9999;}\n';
          document.head.appendChild(style);
        }

        var chartDiv = document.querySelector('.clearfix#chart');
        if (chartDiv) {
          var newParagraph = document.createElement('p');
          newParagraph.innerHTML = '';
          chartDiv.appendChild(newParagraph);
        }

        assignColumnIds();
        markExistingHiddenCols();
        var reportPresetApplied = applyReport5191Preset();

        filterRow = createFilterRow();
        assignColumnIds();

        if (FEATURES.stickyHeader) {
          try {
            headerRow.classList.add('grt-sticky');
            table.style.borderCollapse = 'separate';
          } catch (e) {}
        }

        if (FEATURES.rowHighlight) {
          tbody.addEventListener('click', function(event) {
            var tr = event.target.closest('tr');
            if (!tr) return;
            var index = highlightedRows.indexOf(tr);
            var isAltPressed = event.altKey;
            if (index === -1) {
              if (!isAltPressed) {
                highlightedRows.forEach(function(row) { row.classList.remove('grt-highlighted'); });
                highlightedRows = [];
              }
              tr.classList.add('grt-highlighted');
              highlightedRows.push(tr);
            } else if (!isAltPressed) {
              tr.classList.remove('grt-highlighted');
              highlightedRows.splice(index, 1);
            }
          });
        }

        toolsWrapper = createToolsWrapper();

        // Accès contextuel discret à la configuration du 062 pour les superlibrarian.
        try {
          if (
            toolsWrapper &&
            window.PMKConfig &&
            typeof window.PMKConfig.mountContextButton === 'function'
          ) {
            window.PMKConfig.mountContextButton({
              moduleId: MODULE_ID,
              anchor: toolsWrapper,
              contextKey: 'report-results',
              context: { sectionId: 'features' }
            });
          }
        } catch (e) {}

        if (FEATURES.columnFilters && toolsWrapper && filterRow) {
          var filterToggleButton = document.createElement('button');
          filterToggleButton.type = 'button';
          filterToggleButton.textContent = 'Filtres';
          filterToggleButton.className = 'btn btn-default grt-filter-toggle';
          filterToggleButton.setAttribute('aria-expanded', 'false');
          filterToggleButton.setAttribute('aria-controls', 'grt-filter-row');
          toolsWrapper.appendChild(filterToggleButton);

          filterToggleButton.addEventListener('click', function() {
            var visible = filterRow.style.display !== 'table-row';
            filterRow.style.display = visible ? 'table-row' : 'none';
            Object.keys(columnVisibilityState).forEach(function(colId) {
              setColumnVisibility(colId, columnVisibilityState[colId]);
            });
            filterToggleButton.setAttribute('aria-expanded', String(visible));
          });

          var resetButton = document.createElement('button');
          resetButton.type = 'button';
          resetButton.textContent = 'Réinitialiser les filtres';
          resetButton.className = 'btn btn-default grt-reset';
          toolsWrapper.appendChild(resetButton);
          resetButton.addEventListener('click', function() {
            filterRow.querySelectorAll('input[data-column-index]').forEach(function(input) { input.value = ''; });
            applyFilters();
          });
        }

        if (FEATURES.sorting) {
          headerRow.addEventListener('click', function(event) {
            var th = event.target.closest('th');
            if (!th || !headerRow.contains(th)) return;
            if (headerRow.__grtJustDragged && headerRow.__grtJustDragged()) return;

            var colId = th.dataset.grtColId;
            if (!colId) return;
            var existingIndex = -1;
            for (var i = 0; i < sortColumns.length; i++) {
              if (sortColumns[i].colId === colId) {
                existingIndex = i;
                break;
              }
            }

            if (existingIndex !== -1) sortColumns[existingIndex].asc = !sortColumns[existingIndex].asc;
            else sortColumns.push({ colId: colId, asc: true });

            renderSortIcons();
            requestAnimationFrame(sortTable);
          });

          if (toolsWrapper) {
            var resetSortButton = document.createElement('button');
            resetSortButton.type = 'button';
            resetSortButton.textContent = 'Réinitialiser les tris';
            resetSortButton.className = 'btn btn-default grt-reset-sort';
            toolsWrapper.appendChild(resetSortButton);
            resetSortButton.addEventListener('click', resetSorting);
          }
        }

        createColumnToggleUI(toolsWrapper);

        if (FEATURES.generalSearch && toolsWrapper) {
          searchInput = document.createElement('input');
          searchInput.type = 'text';
          searchInput.placeholder = 'Rechercher dans toutes les colonnes...';
          searchInput.classList.add('grt-general-search');
          toolsWrapper.appendChild(searchInput);
          searchInput.addEventListener('input', debounce(applyFilters, CONFIG.debounce));
        }

        if (FEATURES.cellStatistics) {
          tbody.addEventListener('click', function(event) {
            if (event.target && event.target.closest('td')) cellClickHandler(event);
          });
          document.addEventListener('keydown', function(event) {
            if (event.key === 'Shift') document.body.classList.add('grt-shiftPressed');
          });
          document.addEventListener('keyup', function(event) {
            if (event.key === 'Shift') {
              document.body.classList.remove('grt-shiftPressed');
              shiftUpHandler();
            }
          });
        }

        setupColumnReordering();
        cacheAllRows();
        setupObservers();

        table.dataset.grtInited = '1';
        publishColumnsReady(reportPresetApplied);

      } catch (e) {
        (function(){})('062-guided-reports-tools inner error:', e);
      }
    }).catch(function() {
      /* table not present in time */
    });
    }

    loadPmkConfig().then(function(config) {
      pmkConfig = config;
      refreshRuntimeConfig();
      subscribeToPmkChanges();
      begin();
    }).catch(function() {
      pmkConfig = null;
      refreshRuntimeConfig();
      subscribeToPmkChanges();
      begin();
    });

  } catch (err) {
    (function(){})('062-guided-reports-tools error:', err);
  }
})();

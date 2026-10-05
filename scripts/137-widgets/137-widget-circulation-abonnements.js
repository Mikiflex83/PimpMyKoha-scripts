/* ============================================================
   PimpMyKoha 137 — Widgets & blocs d’accueil
   Généré le 22/09/2026
   Sous-widget autonome.
   IMPORTANT : conserver ce fichier séparé pour la maintenance.
   ============================================================ */
const WIDGET_ID = 'circulation-abonnements';
const STYLE_ID = 'pmk137-style-circulation-abonnements';
const STYLE_TEXT = `    :root {
        /* Couleurs proches de l'interface staff Koha */
        --sub-report-koha-green: #408540;
        --sub-report-koha-green-dark: #006100;
        --sub-report-bg: #f8f9fa;
        --sub-report-bg-soft: #f4f4f4;
        --sub-report-border: #d8d8d8;
        --sub-report-border-light: #e7e7e7;
        --sub-report-text: #333333;
        --sub-report-text-muted: #666666;
    }

    .sub-report-container {
        position: relative;
        max-width: 420px !important;
        margin: 0 auto 0.9rem auto;
        overflow: hidden;
        background: #ffffff;
        border: 1px solid var(--sub-report-border);
        border-radius: 4px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        color: var(--sub-report-text);
        font-family: inherit;
    }

    .sub-report-header {
        margin: 0;
        padding: 0.6rem 0.7rem;
        background: var(--sub-report-bg-soft);
        border-bottom: 1px solid var(--sub-report-border);
        border-left: 4px solid var(--sub-report-koha-green);
        color: var(--sub-report-text);
        font-family: inherit;
        font-size: 1rem;
        font-weight: 600;
        line-height: 1.3;
        text-align: left;
    }

    .sub-report-accordion {
        margin: 0;
        border: 0;
        border-bottom: 1px solid var(--sub-report-border-light);
        background: #ffffff;
    }

    .sub-report-accordion summary {
        position: relative;
        padding: 0.52rem 1.8rem 0.52rem 0.7rem;
        background: #ffffff;
        color: var(--sub-report-text);
        font-size: 0.8rem;
        font-weight: 600;
        line-height: 1.3;
        list-style: none;
        cursor: pointer;
        user-select: none;
    }

    .sub-report-accordion summary:hover {
        background: #f7f7f7;
        color: var(--sub-report-koha-green-dark);
    }

    .sub-report-accordion summary::after {
        content: "›";
        position: absolute;
        top: 50%;
        right: 0.72rem;
        color: var(--sub-report-koha-green);
        font-size: 1rem;
        font-weight: 700;
        transform: translateY(-50%) rotate(90deg);
        transition: transform 0.15s ease;
    }

    .sub-report-accordion[open] summary::after {
        transform: translateY(-50%) rotate(-90deg);
    }

    .sub-report-accordion summary::-webkit-details-marker {
        display: none;
    }

    .sub-report-filters {
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
        padding: 0.7rem;
        background: var(--sub-report-bg);
        border-top: 1px solid var(--sub-report-border-light);
    }

    .sub-report-filter-group {
        width: 100%;
    }

    .sub-report-filter-group label {
        display: block;
        margin-bottom: 0.22rem;
        color: var(--sub-report-text);
        font-size: 0.76rem;
        font-weight: 600;
        line-height: 1.2;
    }

    .sub-report-select {
        width: 100%;
        min-height: 30px;
        padding: 0.35rem 0.45rem;
        background: #ffffff;
        border: 1px solid #bcbcbc;
        border-radius: 3px;
        color: var(--sub-report-text);
        font-family: inherit;
        font-size: 0.75rem;
        line-height: 1.3;
    }

    .sub-report-select:focus {
        border-color: var(--sub-report-koha-green);
        outline: 0;
        box-shadow: 0 0 0 2px rgba(64, 133, 64, 0.15);
    }

    .sub-report-reset {
        align-self: flex-start;
        padding: 0.36rem 0.7rem;
        background: #ffffff;
        border: 1px solid #bcbcbc;
        border-radius: 3px;
        color: var(--sub-report-text);
        font-family: inherit;
        font-size: 0.75rem;
        font-weight: 500;
        line-height: 1.25;
        cursor: pointer;
    }

    .sub-report-reset:hover {
        background: #eeeeee;
        border-color: #9f9f9f;
        color: var(--sub-report-koha-green-dark);
    }

    .sub-report-reset:focus {
        border-color: var(--sub-report-koha-green);
        outline: 0;
        box-shadow: 0 0 0 2px rgba(64, 133, 64, 0.15);
    }

    .sub-report-table {
        width: 100%;
        margin: 0;
        border-collapse: collapse;
        background: #ffffff;
        color: var(--sub-report-text);
        font-size: 0.7rem;
    }

    .sub-report-table th,
    .sub-report-table td {
        padding: 0.42rem;
        border-bottom: 1px solid var(--sub-report-border-light);
        text-align: left;
        vertical-align: middle;
        white-space: nowrap;
    }

    .sub-report-table th {
        background: var(--sub-report-bg-soft);
        border-bottom: 1px solid var(--sub-report-border);
        color: var(--sub-report-text);
        font-weight: 600;
        cursor: pointer;
    }

    .sub-report-table th:hover {
        background: #ebebeb;
        color: var(--sub-report-koha-green-dark);
    }

    .sub-report-table tbody tr:nth-child(even) {
        background: #fbfbfb;
    }

    .sub-report-table tbody tr:hover {
        background: #f3f7f3;
    }

    .sub-report-chart-container {
        padding: 0.65rem 0.7rem 0.7rem;
        background: #ffffff;
    }

    .sub-report-chart-container canvas {
        max-width: 100%;
    }

    .sub-report-chart {
        width: 100% !important;
        height: 300px !important;
    }

    .sub-report-loading {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.88);
        color: var(--sub-report-text-muted);
        font-family: inherit;
        font-size: 0.8rem;
        font-weight: 600;
        z-index: 10;
    }

    @media (max-width: 480px) {
        .sub-report-container {
            max-width: 100% !important;
        }
    }

    .sub-report-error {
        display: none;
        margin: 0.55rem 0.7rem;
        padding: 0.5rem 0.6rem;
        background: #fff7f7;
        border: 1px solid #e0b4b4;
        border-radius: 3px;
        color: #8a2f2f;
        font-size: 0.74rem;
        line-height: 1.35;
    }

    .sub-report-error.is-visible {
        display: block;
    }



    /* ============================================================
       LÉGENDE DES GRAPHIQUES
       Les échantillons sont dessinés sur canvas avec le même
       borderDash et la même couleur que la série réelle.
       ============================================================ */

    .sub-report-html-legend {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        gap: 7px 12px;
        margin: 7px 4px 1px;
        padding: 4px 0 0;
        color: var(--sub-report-text);
        font-size: 0.66rem;
        line-height: 1.2;
    }

    .sub-report-legend-item {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        max-width: 100%;
        padding: 2px 3px;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;
    }

    .sub-report-legend-item:hover {
        color: var(--sub-report-koha-green-dark);
        text-decoration: underline;
    }

    .sub-report-legend-item.is-hidden {
        opacity: 0.38;
        text-decoration: line-through;
    }

    .sub-report-legend-sample {
        flex: 0 0 44px;
        width: 44px;
        height: 10px;
        display: block;
    }

    .sub-report-legend-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }`;
const HTML_TEXT = `<!-- Rapport de Circulation -->
<div class="sub-report-container" id="circulationReport">
<h1 class="sub-report-header">Circulation</h1>
<details class="sub-report-accordion">
<summary>Filtres</summary>
<div class="sub-report-filters">
<div class="sub-report-filter-group"><label for="filterSite">Site</label><select id="filterSite" class="sub-report-select" multiple="multiple"></select></div>
<div class="sub-report-filter-group"><label for="filterDate">Date</label><select id="filterDate" class="sub-report-select">
<option value="tous" selected="selected">Tous</option>
</select></div>
<div class="sub-report-filter-group"><label for="filterType">Type</label><select id="filterType" class="sub-report-select">
<option value="tous" selected="selected">Tous</option>
<option value="Issues">Pr&ecirc;ts</option>
<option value="Renews">Renouvellements</option>
<option value="Returns">Retours</option>
</select></div>
<button id="resetFiltersCirculation" class="sub-report-reset" onclick="resetFiltersCirculation()">R&eacute;initialiser</button></div>
</details><details class="sub-report-accordion">
<summary>Donn&eacute;es brutes</summary>
<table id="dataTableCirculation" class="sub-report-table">
<thead>
<tr>
<th data-key="site">Site</th>
<th data-key="date">Date</th>
<th data-key="Issues">Pr&ecirc;ts</th>
<th data-key="Renews">Renouv.</th>
<th data-key="Returns">Retours</th>
</tr>
</thead>
<tbody></tbody>
</table>
</details>
<div class="sub-report-chart-container" id="chartContainerCirculation"></div>
<div class="sub-report-loading" id="loadingSpinnerCirculation" style="display: none;">Chargement...</div>
</div>
<!-- Rapport d'Abonnements -->
<div class="sub-report-container" id="subscriptionReport">
<h1 class="sub-report-header">Abonnements</h1>
<details class="sub-report-accordion">
<summary>Filtres</summary>
<div class="sub-report-filters">
<div class="sub-report-filter-group"><label for="filterSiteSubscription">Site</label><select id="filterSiteSubscription" class="sub-report-select" multiple="multiple"></select></div>
<div class="sub-report-filter-group"><label for="filterDateSubscription">Date</label><select id="filterDateSubscription" class="sub-report-select">
<option value="tous" selected="selected">Tous</option>
</select></div>
<div class="sub-report-filter-group"><label for="filterTypeSubscription">Type</label><select id="filterTypeSubscription" class="sub-report-select">
<option value="tous" selected="selected">Tous</option>
<option value="inscription">Nouveaux</option>
<option value="renouvellement">Renouvellements</option>
</select></div>
<button id="resetFiltersSubscription" class="sub-report-reset" onclick="resetFiltersSubscription()">R&eacute;initialiser</button></div>
</details><details class="sub-report-accordion">
<summary>Donn&eacute;es brutes</summary>
<table id="dataTableSubscription" class="sub-report-table">
<thead>
<tr>
<th data-key="site">Site</th>
<th data-key="date">Date</th>
<th data-key="Nouveaux_abonnes">Nouveaux</th>
<th data-key="Renouvellements">Renouv.</th>
</tr>
</thead>
<tbody></tbody>
</table>
</details>
<div class="sub-report-chart-container" id="chartContainerSubscription"></div>
<div class="sub-report-loading" id="loadingSpinnerSubscription" style="display: none;">Chargement...</div>
</div>`;

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLE_TEXT;
    document.head.appendChild(style);
}

async function mount(container) {
    if (!container || container.dataset.pmk137Mounted === WIDGET_ID) return;
    container.dataset.pmk137Mounted = WIDGET_ID;
    ensureStyle();
    container.innerHTML = HTML_TEXT;

    await window.PMKHomeWidgets.loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js');
    await window.PMKHomeWidgets.loadScript('https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js');

    (() => {
        'use strict';

        /* ============================================================
           CONFIGURATION
           ============================================================ */

        const API_ENDPOINT_CIRCULATION = '/cgi-bin/koha/svc/report?id=4918';
        const API_ENDPOINT_SUBSCRIPTION = '/cgi-bin/koha/svc/report?id=4878';
        const FETCH_TIMEOUT_MS = 30000;

        let rawDataCirculation = [];
        let rawDataSubscription = [];

        let sortConfigCirculation = { key: null, direction: 1 };
        let sortConfigSubscription = { key: null, direction: 1 };

        let chartCirculation = null;
        let chartSubscription = null;

        const SITE_COLORS = [
            '#408540',
            '#2f6f9f',
            '#7a5c9e',
            '#b06b35',
            '#9b4f69',
            '#3f7f75',
            '#6a7180',
            '#8a6d3b',
            '#5f7f46',
            '#4f6fa8',
            '#8a5f5f',
            '#4b7f8c'
        ];

        /* ============================================================
           OUTILS COMMUNS
           ============================================================ */

        function toInteger(value) {
            const parsed = Number.parseInt(value, 10);
            return Number.isFinite(parsed) ? parsed : 0;
        }

        function escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        function getLoggedInBranchCode() {
            const candidates = [
                document.querySelector('.logged-in-branch-code'),
                document.querySelector('[data-branchcode]'),
                document.querySelector('[data-branch-code]')
            ].filter(Boolean);

            for (const element of candidates) {
                const value =
                    element.getAttribute('data-branchcode') ||
                    element.getAttribute('data-branch-code') ||
                    element.textContent;

                if (value && value.trim()) {
                    return value.trim();
                }
            }

            return '';
        }

        async function fetchReport(endpoint) {
            const controller = new AbortController();
            const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

            try {
                const response = await fetch(endpoint, {
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin',
                    signal: controller.signal
                });

                if (!response.ok) {
                    throw new Error(`Erreur HTTP ${response.status}`);
                }

                const jsonData = await response.json();

                if (!Array.isArray(jsonData)) {
                    throw new Error('Réponse du rapport Koha invalide.');
                }

                return jsonData;
            } catch (error) {
                if (error.name === 'AbortError') {
                    throw new Error('Le rapport Koha met plus de 30 secondes à répondre.');
                }
                throw error;
            } finally {
                window.clearTimeout(timeoutId);
            }
        }

        function getSiteColor(site) {
            let hash = 0;
            const value = String(site || '');

            for (let i = 0; i < value.length; i += 1) {
                hash = ((hash << 5) - hash) + value.charCodeAt(i);
                hash |= 0;
            }

            return SITE_COLORS[Math.abs(hash) % SITE_COLORS.length];
        }


        /**
         * Conserve la couleur de famille d'un site mais crée une nuance légère
         * pour distinguer les types de données lorsqu'ils se superposent.
         * amount < 0 = plus sombre ; amount > 0 = plus clair.
         */
        function adjustHexColor(hex, amount = 0) {
            const match = /^#([0-9a-f]{6})$/i.exec(String(hex || '').trim());
            if (!match || !amount) return hex;

            const value = match[1];
            const channels = [0, 2, 4].map(offset =>
                Number.parseInt(value.slice(offset, offset + 2), 16)
            );

            const adjusted = channels.map(channel => {
                if (amount > 0) {
                    return Math.round(channel + (255 - channel) * (amount / 100));
                }
                return Math.round(channel * (1 + amount / 100));
            });

            return `#${adjusted
                .map(channel => Math.max(0, Math.min(255, channel))
                .toString(16)
                .padStart(2, '0'))
                .join('')}`;
        }

        /**
         * Dessine dans la légende exactement le même style de trait
         * que celui utilisé par Chart.js (couleur + borderDash).
         */
        function drawLegendLineSample(canvas, dataset) {
            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;

            ctx.clearRect(0, 0, width, height);
            ctx.save();

            ctx.strokeStyle = dataset.borderColor || '#666666';
            ctx.lineWidth = Number(dataset.borderWidth) || 2;
            ctx.setLineDash(Array.isArray(dataset.borderDash) ? dataset.borderDash : []);

            ctx.beginPath();
            ctx.moveTo(1, height / 2);
            ctx.lineTo(width - 1, height / 2);
            ctx.stroke();

            ctx.restore();
        }

        /**
         * Légende HTML cliquable :
         * - l'échantillon est réellement dessiné avec le borderDash de la série ;
         * - un clic masque / réaffiche la série comme la légende native Chart.js.
         */
        function renderHtmlLineLegend(chart, chartContainer) {
            const oldLegend = chartContainer.querySelector('.sub-report-html-legend');
            if (oldLegend) oldLegend.remove();

            if (!chart || chart.data.datasets.length > 12) {
                return;
            }

            const legend = document.createElement('div');
            legend.className = 'sub-report-html-legend';
            legend.setAttribute('aria-label', 'Légende du graphique');

            chart.data.datasets.forEach((dataset, datasetIndex) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'sub-report-legend-item';
                button.title = `Afficher ou masquer : ${dataset.label}`;

                const sample = document.createElement('canvas');
                sample.className = 'sub-report-legend-sample';

                // Taille intrinsèque volontairement supérieure à la taille CSS
                // pour un rendu net sur les écrans haute densité.
                sample.width = 88;
                sample.height = 20;

                drawLegendLineSample(sample, {
                    ...dataset,
                    borderWidth: (Number(dataset.borderWidth) || 2) * 2,
                    borderDash: Array.isArray(dataset.borderDash)
                        ? dataset.borderDash.map(value => value * 2)
                        : []
                });

                const label = document.createElement('span');
                label.className = 'sub-report-legend-label';
                label.textContent = dataset.label;

                button.appendChild(sample);
                button.appendChild(label);

                const syncState = () => {
                    const visible = chart.isDatasetVisible(datasetIndex);
                    button.classList.toggle('is-hidden', !visible);
                    button.setAttribute('aria-pressed', visible ? 'true' : 'false');
                };

                syncState();

                button.addEventListener('click', () => {
                    const currentlyVisible = chart.isDatasetVisible(datasetIndex);
                    chart.setDatasetVisibility(datasetIndex, !currentlyVisible);
                    chart.update();
                    syncState();
                });

                legend.appendChild(button);
            });

            chartContainer.appendChild(legend);
        }

        function showReportError(reportId, message) {
            const report = document.getElementById(reportId);
            if (!report) return;

            let box = report.querySelector('.sub-report-error');

            if (!box) {
                box = document.createElement('div');
                box.className = 'sub-report-error';
                box.setAttribute('role', 'alert');

                const chartContainer = report.querySelector('.sub-report-chart-container');
                if (chartContainer) {
                    report.insertBefore(box, chartContainer);
                } else {
                    report.appendChild(box);
                }
            }

            box.textContent = message || '';
            box.classList.toggle('is-visible', Boolean(message));
        }

        function destroyChart(chart) {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        }

        function setupExclusiveAllOption(select, onChange) {
            let previousValues = new Set(
                Array.from(select.selectedOptions).map(option => option.value)
            );

            select.addEventListener('change', () => {
                const currentValues = new Set(
                    Array.from(select.selectedOptions).map(option => option.value)
                );

                const allOption = Array.from(select.options)
                    .find(option => option.value === 'tous');

                const newlySelected = Array.from(currentValues)
                    .filter(value => !previousValues.has(value));

                if (newlySelected.includes('tous')) {
                    Array.from(select.options).forEach(option => {
                        option.selected = option.value === 'tous';
                    });
                } else if (allOption && allOption.selected && currentValues.size > 1) {
                    allOption.selected = false;
                }

                if (!select.selectedOptions.length && allOption) {
                    allOption.selected = true;
                }

                previousValues = new Set(
                    Array.from(select.selectedOptions).map(option => option.value)
                );

                onChange();
            });
        }

        function sortData(data, sortConfig) {
            if (!sortConfig.key) {
                return data;
            }

            return data.sort((a, b) => {
                const valA = a[sortConfig.key];
                const valB = b[sortConfig.key];

                const numA = Number(valA);
                const numB = Number(valB);

                if (Number.isFinite(numA) && Number.isFinite(numB)) {
                    return (numA - numB) * sortConfig.direction;
                }

                return String(valA ?? '').localeCompare(
                    String(valB ?? ''),
                    'fr',
                    { numeric: true, sensitivity: 'base' }
                ) * sortConfig.direction;
            });
        }

        /* ============================================================
           RAPPORT DE CIRCULATION
           ============================================================ */

        async function initializeCirculation() {
            try {
                showLoadingCirculation();
                showReportError('circulationReport', '');
                await loadDataCirculation();
                populateFiltersCirculation();
                addFilterListenersCirculation();
                addSortListenersCirculation();
                renderTableCirculation();
            } catch (error) {
                showErrorCirculation(error);
            } finally {
                hideLoadingCirculation();
            }
        }

        async function loadDataCirculation() {
            const jsonData = await fetchReport(API_ENDPOINT_CIRCULATION);

            rawDataCirculation = jsonData
                .filter(row => Array.isArray(row))
                .map(row => ({
                    site: String(row[0] ?? '').trim(),
                    date: String(row[1] ?? '').trim(),
                    Issues: toInteger(row[2]),
                    Renews: toInteger(row[3]),
                    Returns: toInteger(row[4])
                }));
        }

        function populateFiltersCirculation() {
            const userSite = getLoggedInBranchCode();
            const selectSite = document.getElementById('filterSite');

            const uniqueSites = [...new Set(rawDataCirculation.map(item => item.site))]
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));

            let optionsHTML = '<option value="tous">Tous</option>';
            optionsHTML += uniqueSites.map(site => {
                const selected = site === userSite ? ' selected' : '';
                return `<option value="${escapeHtml(site)}"${selected}>${escapeHtml(site)}</option>`;
            }).join('');

            selectSite.innerHTML = optionsHTML;

            if (!userSite || !uniqueSites.includes(userSite)) {
                selectSite.options[0].selected = true;
            }

            const selectDate = document.getElementById('filterDate');
            const uniqueDates = [...new Set(rawDataCirculation.map(item => item.date))]
                .filter(Boolean)
                .sort();

            let dateOptions = '<option value="tous" selected>Tous</option>';
            dateOptions += uniqueDates
                .map(date => `<option value="${escapeHtml(date)}">${escapeHtml(date)}</option>`)
                .join('');

            selectDate.innerHTML = dateOptions;
        }

        function filterDataCirculation() {
            const selectedSites = Array.from(
                document.getElementById('filterSite').selectedOptions
            ).map(option => option.value);

            const sitesFilter = selectedSites.includes('tous') ? [] : selectedSites;
            const selectedDate = document.getElementById('filterDate').value;
            const typeFilter = document.getElementById('filterType').value;

            return rawDataCirculation.filter(item => {
                if (sitesFilter.length && !sitesFilter.includes(item.site)) return false;
                if (selectedDate !== 'tous' && item.date !== selectedDate) return false;

                if (typeFilter !== 'tous' && item[typeFilter] <= 0) {
                    return false;
                }

                return true;
            });
        }

        function renderTableCirculation() {
            const tbody = document.querySelector('#dataTableCirculation tbody');
            let filteredData = filterDataCirculation();

            filteredData = sortData(filteredData, sortConfigCirculation);

            if (!filteredData.length) {
                tbody.innerHTML = '<tr><td colspan="5">Aucune donnée</td></tr>';
            } else {
                tbody.innerHTML = filteredData.map(item => `
                    <tr>
                        <td>${escapeHtml(item.site)}</td>
                        <td>${escapeHtml(item.date)}</td>
                        <td>${item.Issues}</td>
                        <td>${item.Renews}</td>
                        <td>${item.Returns}</td>
                    </tr>
                `).join('');
            }

            renderLineChartCirculation();
        }

        function renderLineChartCirculation() {
            const filteredData = filterDataCirculation();
            const allDates = [...new Set(filteredData.map(item => item.date))]
                .filter(Boolean)
                .sort();

            const dataBySite = {};

            filteredData.forEach(item => {
                if (!dataBySite[item.site]) {
                    dataBySite[item.site] = {};
                }

                if (!dataBySite[item.site][item.date]) {
                    dataBySite[item.site][item.date] = {
                        Issues: 0,
                        Renews: 0,
                        Returns: 0
                    };
                }

                dataBySite[item.site][item.date].Issues += item.Issues;
                dataBySite[item.site][item.date].Renews += item.Renews;
                dataBySite[item.site][item.date].Returns += item.Returns;
            });

            const typeFilter = document.getElementById('filterType').value;

            const types = {
                Issues: {
                    label: 'Prêts',
                    dash: [],
                    shade: 0,
                    pointStyle: 'circle'
                },
                Renews: {
                    label: 'Renouvellements',
                    dash: [8, 4],
                    shade: -18,
                    pointStyle: 'rectRot'
                },
                Returns: {
                    label: 'Retours',
                    dash: [2, 4],
                    shade: 18,
                    pointStyle: 'triangle'
                }
            };

            const datasets = [];

            Object.keys(dataBySite)
                .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }))
                .forEach(site => {
                    Object.entries(types).forEach(([type, config]) => {
                        if (typeFilter !== 'tous' && typeFilter !== type) {
                            return;
                        }

                        const baseColor = getSiteColor(site);
                        const seriesColor = adjustHexColor(baseColor, config.shade);

                        datasets.push({
                            label: `${config.label} - ${site}`,
                            data: allDates.map(date =>
                                dataBySite[site][date]
                                    ? dataBySite[site][date][type]
                                    : 0
                            ),
                            borderColor: seriesColor,
                            backgroundColor: seriesColor,
                            borderDash: config.dash,
                            borderWidth: 2,
                            fill: false,
                            tension: 0.15,
                            pointStyle: config.pointStyle,
                            pointRadius: allDates.length > 55 ? 1.5 : 3,
                            pointHoverRadius: 5,
                            pointBorderWidth: 1,
                            pointBorderColor: seriesColor,
                            pointBackgroundColor: '#ffffff'
                        });
                    });
                });

            const chartContainer = document.getElementById('chartContainerCirculation');

            destroyChart(chartCirculation);
            chartCirculation = null;
            chartContainer.innerHTML = '';

            if (!allDates.length || !datasets.length) {
                return;
            }

            const canvas = document.createElement('canvas');
            canvas.id = 'lineChartCirculation';
            canvas.className = 'sub-report-chart';
            chartContainer.appendChild(canvas);

            chartCirculation = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: {
                    labels: allDates,
                    datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: 'Activité de circulation par site'
                        },
                        tooltip: {
                            callbacks: {
                                title(context) {
                                    if (!context.length) return '';

                                    const parsedDate = new Date(context[0].parsed.x);
                                    if (Number.isNaN(parsedDate.getTime())) {
                                        return context[0].label || '';
                                    }

                                    return parsedDate.toLocaleDateString('fr-FR', {
                                        weekday: 'long',
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric'
                                    });
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            type: 'time',
                            time: {
                                parser: 'yyyy-MM-dd',
                                unit: 'day',
                                displayFormats: {
                                    day: 'dd/MM'
                                },
                                tooltipFormat: 'eeee d MMMM yyyy'
                            },
                            title: {
                                display: true,
                                text: 'Date'
                            }
                        },
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Nombre de mouvements'
                            }
                        }
                    }
                }
            });

            renderHtmlLineLegend(chartCirculation, chartContainer);
        }

        function addFilterListenersCirculation() {
            setupExclusiveAllOption(
                document.getElementById('filterSite'),
                renderTableCirculation
            );

            document.getElementById('filterDate')
                .addEventListener('change', renderTableCirculation);

            document.getElementById('filterType')
                .addEventListener('change', renderTableCirculation);
        }

        function addSortListenersCirculation() {
            document.querySelectorAll('#dataTableCirculation th').forEach(header => {
                header.addEventListener('click', () => {
                    const key = header.getAttribute('data-key');

                    if (sortConfigCirculation.key === key) {
                        sortConfigCirculation.direction *= -1;
                    } else {
                        sortConfigCirculation.key = key;
                        sortConfigCirculation.direction = 1;
                    }

                    renderTableCirculation();
                });
            });
        }

        function showLoadingCirculation() {
            document.getElementById('loadingSpinnerCirculation').style.display = 'flex';
        }

        function hideLoadingCirculation() {
            document.getElementById('loadingSpinnerCirculation').style.display = 'none';
        }

        function showErrorCirculation(error) {
            destroyChart(chartCirculation);
            chartCirculation = null;
            showReportError(
                'circulationReport',
                `Impossible de charger les données de circulation : ${error.message}`
            );
        }

        window.resetFiltersCirculation = function resetFiltersCirculation() {
            const siteSelect = document.getElementById('filterSite');

            Array.from(siteSelect.options).forEach((option, index) => {
                option.selected = index === 0;
            });

            document.getElementById('filterDate').selectedIndex = 0;
            document.getElementById('filterType').selectedIndex = 0;

            sortConfigCirculation = { key: null, direction: 1 };
            renderTableCirculation();
        };

        /* ============================================================
           RAPPORT D'ABONNEMENTS
           ============================================================ */

        async function initializeSubscription() {
            try {
                showLoadingSubscription();
                showReportError('subscriptionReport', '');
                await loadDataSubscription();
                populateFiltersSubscription();
                addFilterListenersSubscription();
                addSortListenersSubscription();
                renderTableSubscription();
            } catch (error) {
                showErrorSubscription(error);
            } finally {
                hideLoadingSubscription();
            }
        }

        async function loadDataSubscription() {
            const jsonData = await fetchReport(API_ENDPOINT_SUBSCRIPTION);

            rawDataSubscription = jsonData
                .filter(row => Array.isArray(row))
                .map(row => ({
                    site: String(row[0] ?? '').trim(),
                    date: String(row[1] ?? '').trim(),
                    Nouveaux_abonnes: toInteger(row[2]),
                    Renouvellements: toInteger(row[3])
                }));
        }

        function populateFiltersSubscription() {
            const userSite = getLoggedInBranchCode();
            const selectSite = document.getElementById('filterSiteSubscription');

            const uniqueSites = [...new Set(rawDataSubscription.map(item => item.site))]
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));

            let optionsHTML = '<option value="tous">Tous</option>';
            optionsHTML += uniqueSites.map(site => {
                const selected = site === userSite ? ' selected' : '';
                return `<option value="${escapeHtml(site)}"${selected}>${escapeHtml(site)}</option>`;
            }).join('');

            selectSite.innerHTML = optionsHTML;

            if (!userSite || !uniqueSites.includes(userSite)) {
                selectSite.options[0].selected = true;
            }

            const selectDate = document.getElementById('filterDateSubscription');
            const uniqueDates = [...new Set(rawDataSubscription.map(item => item.date))]
                .filter(Boolean)
                .sort();

            let dateOptions = '<option value="tous" selected>Tous</option>';
            dateOptions += uniqueDates
                .map(date => `<option value="${escapeHtml(date)}">${escapeHtml(date)}</option>`)
                .join('');

            selectDate.innerHTML = dateOptions;
        }

        function filterDataSubscription() {
            const selectedSites = Array.from(
                document.getElementById('filterSiteSubscription').selectedOptions
            ).map(option => option.value);

            const sitesFilter = selectedSites.includes('tous') ? [] : selectedSites;
            const selectedDate = document.getElementById('filterDateSubscription').value;
            const typeFilter = document.getElementById('filterTypeSubscription').value;

            return rawDataSubscription.filter(item => {
                if (sitesFilter.length && !sitesFilter.includes(item.site)) return false;
                if (selectedDate !== 'tous' && item.date !== selectedDate) return false;

                if (typeFilter === 'inscription' && item.Nouveaux_abonnes <= 0) {
                    return false;
                }

                if (typeFilter === 'renouvellement' && item.Renouvellements <= 0) {
                    return false;
                }

                return true;
            });
        }

        function renderTableSubscription() {
            const tbody = document.querySelector('#dataTableSubscription tbody');
            let filteredData = filterDataSubscription();

            filteredData = sortData(filteredData, sortConfigSubscription);

            if (!filteredData.length) {
                tbody.innerHTML = '<tr><td colspan="4">Aucune donnée</td></tr>';
            } else {
                tbody.innerHTML = filteredData.map(item => `
                    <tr>
                        <td>${escapeHtml(item.site)}</td>
                        <td>${escapeHtml(item.date)}</td>
                        <td>${item.Nouveaux_abonnes}</td>
                        <td>${item.Renouvellements}</td>
                    </tr>
                `).join('');
            }

            renderLineChartSubscription();
        }

        function renderLineChartSubscription() {
            const filteredData = filterDataSubscription();
            const allDates = [...new Set(filteredData.map(item => item.date))]
                .filter(Boolean)
                .sort();

            const dataBySite = {};

            filteredData.forEach(item => {
                if (!dataBySite[item.site]) {
                    dataBySite[item.site] = {};
                }

                if (!dataBySite[item.site][item.date]) {
                    dataBySite[item.site][item.date] = {
                        Nouveaux_abonnes: 0,
                        Renouvellements: 0
                    };
                }

                dataBySite[item.site][item.date].Nouveaux_abonnes += item.Nouveaux_abonnes;
                dataBySite[item.site][item.date].Renouvellements += item.Renouvellements;
            });

            const typeFilter = document.getElementById('filterTypeSubscription').value;
            const datasets = [];

            Object.keys(dataBySite)
                .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }))
                .forEach(site => {
                    const color = getSiteColor(site);

                    if (typeFilter === 'tous' || typeFilter === 'inscription') {
                        const seriesColor = color;

                        datasets.push({
                            label: `Nouveaux abonnés - ${site}`,
                            data: allDates.map(date =>
                                dataBySite[site][date]
                                    ? dataBySite[site][date].Nouveaux_abonnes
                                    : 0
                            ),
                            borderColor: seriesColor,
                            backgroundColor: seriesColor,
                            borderDash: [],
                            borderWidth: 2,
                            fill: false,
                            tension: 0.15,
                            pointStyle: 'circle',
                            pointRadius: allDates.length > 55 ? 1.5 : 3,
                            pointHoverRadius: 5,
                            pointBorderWidth: 1,
                            pointBorderColor: seriesColor,
                            pointBackgroundColor: '#ffffff'
                        });
                    }

                    if (typeFilter === 'tous' || typeFilter === 'renouvellement') {
                        const seriesColor = adjustHexColor(color, -18);

                        datasets.push({
                            label: `Renouvellements - ${site}`,
                            data: allDates.map(date =>
                                dataBySite[site][date]
                                    ? dataBySite[site][date].Renouvellements
                                    : 0
                            ),
                            borderColor: seriesColor,
                            backgroundColor: seriesColor,
                            borderDash: [8, 4],
                            borderWidth: 2,
                            fill: false,
                            tension: 0.15,
                            pointStyle: 'rectRot',
                            pointRadius: allDates.length > 55 ? 1.5 : 3,
                            pointHoverRadius: 5,
                            pointBorderWidth: 1,
                            pointBorderColor: seriesColor,
                            pointBackgroundColor: '#ffffff'
                        });
                    }
                });

            const chartContainer = document.getElementById('chartContainerSubscription');

            destroyChart(chartSubscription);
            chartSubscription = null;
            chartContainer.innerHTML = '';

            if (!allDates.length || !datasets.length) {
                return;
            }

            const canvas = document.createElement('canvas');
            canvas.id = 'lineChartSubscription';
            canvas.className = 'sub-report-chart';
            chartContainer.appendChild(canvas);

            chartSubscription = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: {
                    labels: allDates,
                    datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: 'Évolution des abonnements par site'
                        },
                        tooltip: {
                            callbacks: {
                                title(context) {
                                    if (!context.length) return '';

                                    const parsedDate = new Date(context[0].parsed.x);
                                    if (Number.isNaN(parsedDate.getTime())) {
                                        return context[0].label || '';
                                    }

                                    return parsedDate.toLocaleDateString('fr-FR', {
                                        weekday: 'long',
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric'
                                    });
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            type: 'time',
                            time: {
                                parser: 'yyyy-MM-dd',
                                unit: 'day',
                                displayFormats: {
                                    day: 'dd/MM'
                                },
                                tooltipFormat: 'eeee d MMMM yyyy'
                            },
                            title: {
                                display: true,
                                text: 'Date'
                            }
                        },
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Nombre d\'abonnements'
                            }
                        }
                    }
                }
            });

            renderHtmlLineLegend(chartSubscription, chartContainer);
        }

        function addFilterListenersSubscription() {
            setupExclusiveAllOption(
                document.getElementById('filterSiteSubscription'),
                renderTableSubscription
            );

            document.getElementById('filterDateSubscription')
                .addEventListener('change', renderTableSubscription);

            document.getElementById('filterTypeSubscription')
                .addEventListener('change', renderTableSubscription);
        }

        function addSortListenersSubscription() {
            document.querySelectorAll('#dataTableSubscription th').forEach(header => {
                header.addEventListener('click', () => {
                    const key = header.getAttribute('data-key');

                    if (sortConfigSubscription.key === key) {
                        sortConfigSubscription.direction *= -1;
                    } else {
                        sortConfigSubscription.key = key;
                        sortConfigSubscription.direction = 1;
                    }

                    renderTableSubscription();
                });
            });
        }

        function showLoadingSubscription() {
            document.getElementById('loadingSpinnerSubscription').style.display = 'flex';
        }

        function hideLoadingSubscription() {
            document.getElementById('loadingSpinnerSubscription').style.display = 'none';
        }

        function showErrorSubscription(error) {
            destroyChart(chartSubscription);
            chartSubscription = null;
            showReportError(
                'subscriptionReport',
                `Impossible de charger les données d'abonnements : ${error.message}`
            );
        }

        window.resetFiltersSubscription = function resetFiltersSubscription() {
            const siteSelect = document.getElementById('filterSiteSubscription');

            Array.from(siteSelect.options).forEach((option, index) => {
                option.selected = index === 0;
            });

            document.getElementById('filterDateSubscription').selectedIndex = 0;
            document.getElementById('filterTypeSubscription').selectedIndex = 0;

            sortConfigSubscription = { key: null, direction: 1 };
            renderTableSubscription();
        };

        /* ============================================================
           INITIALISATION INDÉPENDANTE DES DEUX RAPPORTS
           ============================================================ */

        initializeCirculation();
        initializeSubscription();

    })();
}

window.PMKHomeWidgets?.register({
    id: WIDGET_ID,
    name: 'Circulation & abonnements',
    target: 'announcements-column',
    mount
});

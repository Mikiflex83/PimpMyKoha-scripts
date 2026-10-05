/*
 Nom du fichier : page-qr-code.js
 Module canonique : page-qr-code
 Héritage : 086-qr-code-book-detail.js
 Version : 2.1.0-preplugin
 Date : 2026-09-21
 Auteur : Michael Mundet / refonte PimpMyKoha

 Description :
 - Remplace le QR permanent du legacy 086 par un bouton Koha compact placé aux emplacements historiques.
 - Le clic ouvre un petit volet contenant le QR code de l'URL courante.
 - Le QR est généré par le service natif Koha /cgi-bin/koha/svc/barcode.
 - Aucune bibliothèque QR externe et aucun CDN ne sont utilisés.
 - La taille des modules du QR s'adapte automatiquement à la longueur de l'URL.
 - Un bouton « Agrandir » permet d'afficher le QR dans une modale uniquement à la demande.
 - Les quatre pages historiques du 086 restent préconfigurées.
 - En mode automatique, le bouton reprend les ancrages historiques du 086, en haut à droite.
 - Le bouton affiche uniquement l'icône QR par défaut ; le texte reste activable dans la configuration.
 - L'emplacement peut aussi être choisi via le picker PMK.
*/
(function () {
    'use strict';

    if (window.__PMK_PAGE_QR_CODE_V2__) return;
    window.__PMK_PAGE_QR_CODE_V2__ = true;

    const MODULE_ID = 'page-qr-code';
    const MODULE_VERSION = '2.1.0-preplugin';
    const STYLE_ID = 'pmk086-page-qr-style';
    const HOST_ATTR = 'data-pmk086-host';
    const PANEL_ID = 'pmk086-qr-panel';
    const MODAL_ID = 'pmk086-qr-modal';
    const PICKER_STYLE_ID = 'pmk086-picker-style';
    const PENDING_PICK_KEY = 'pmk086-pending-pick';

    const DEFAULTS = {
        enabled: true,
        button: {
            showText: false,
            labelFr: 'QR mobile',
            labelEn: 'Mobile QR',
            titleFr: 'Afficher le QR code de cette page',
            titleEn: 'Show the QR code for this page'
        },
        panel: {
            titleFr: 'Ouvrir sur un mobile',
            titleEn: 'Open on a mobile device',
            instructionFr: 'Scannez ce QR code pour retrouver cette page.',
            instructionEn: 'Scan this QR code to open this page.',
            compactImageWidth: 236,
            closeOnOutsideClick: true,
            showExpandButton: true,
            showCopyButton: true
        },
        qr: {
            servicePath: '/cgi-bin/koha/svc/barcode',
            moduleSizeMode: 'auto',
            manualModuleSize: 6,
            autoMinModuleSize: 5,
            autoMaxModuleSize: 10,
            denseLengthWarning: 700,
            veryLongLengthWarning: 1800
        },
        pages: [
            {
                id: 'catalogue-detail',
                enabled: true,
                labelFr: 'Fiche notice',
                labelEn: 'Record detail',
                path: '/cgi-bin/koha/catalogue/detail.pl',
                queryContains: '',
                placement: 'auto',
                target: null
            },
            {
                id: 'catalogue-search',
                enabled: true,
                labelFr: 'Résultats catalogue',
                labelEn: 'Catalogue results',
                path: '/cgi-bin/koha/catalogue/search.pl',
                queryContains: '',
                placement: 'auto',
                target: null
            },
            {
                id: 'course-details',
                enabled: true,
                labelFr: 'Réserve de cours',
                labelEn: 'Course reserve',
                path: '/cgi-bin/koha/course_reserves/course-details.pl',
                queryContains: '',
                placement: 'auto',
                target: null
            },
            {
                id: 'guided-reports',
                enabled: true,
                labelFr: 'Rapport SQL',
                labelEn: 'SQL report',
                path: '/cgi-bin/koha/reports/guided_reports.pl',
                queryContains: '',
                placement: 'auto',
                target: null
            }
        ]
    };

    let currentConfig = deepClone(DEFAULTS);
    let unsubscribe = null;
    let observer = null;
    let retryTimers = [];
    let currentRule = null;
    let outsideHandler = null;
    let escapeHandler = null;
    let resizeHandler = null;

    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function isObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value);
    }

    function deepMerge(base, extra) {
        const out = deepClone(base);
        if (!isObject(extra)) return out;
        Object.keys(extra).forEach(function (key) {
            if (isObject(extra[key]) && isObject(out[key])) out[key] = deepMerge(out[key], extra[key]);
            else out[key] = deepClone(extra[key]);
        });
        return out;
    }

    function clamp(value, min, max) {
        const n = Number(value);
        if (!Number.isFinite(n)) return min;
        return Math.min(max, Math.max(min, n));
    }

    function language() {
        const lang = String(document.documentElement.lang || '').toLowerCase();
        return lang.indexOf('en') === 0 ? 'en' : 'fr';
    }

    function localized(fr, en) {
        return language() === 'en' ? (en || fr || '') : (fr || en || '');
    }

    function normalizePath(path) {
        const raw = String(path || '').trim();
        if (!raw) return '';
        try {
            if (/^https?:\/\//i.test(raw)) return new URL(raw).pathname;
        } catch (_) {}
        return raw.charAt(0) === '/' ? raw.split('?')[0].split('#')[0] : '/' + raw.split('?')[0].split('#')[0];
    }

    function normalizeConfig(config) {
        const cfg = deepMerge(DEFAULTS, config || {});
        cfg.enabled = cfg.enabled !== false;
        cfg.button.showText = cfg.button.showText !== false;
        cfg.panel.compactImageWidth = clamp(cfg.panel.compactImageWidth, 180, 320);
        cfg.panel.closeOnOutsideClick = cfg.panel.closeOnOutsideClick !== false;
        cfg.panel.showExpandButton = cfg.panel.showExpandButton !== false;
        cfg.panel.showCopyButton = cfg.panel.showCopyButton !== false;
        cfg.qr.moduleSizeMode = cfg.qr.moduleSizeMode === 'manual' ? 'manual' : 'auto';
        cfg.qr.manualModuleSize = clamp(cfg.qr.manualModuleSize, 2, 20);
        cfg.qr.autoMinModuleSize = clamp(cfg.qr.autoMinModuleSize, 2, 20);
        cfg.qr.autoMaxModuleSize = clamp(cfg.qr.autoMaxModuleSize, cfg.qr.autoMinModuleSize, 20);
        cfg.qr.denseLengthWarning = clamp(cfg.qr.denseLengthWarning, 100, 10000);
        cfg.qr.veryLongLengthWarning = clamp(cfg.qr.veryLongLengthWarning, cfg.qr.denseLengthWarning, 20000);
        cfg.qr.servicePath = String(cfg.qr.servicePath || DEFAULTS.qr.servicePath).trim() || DEFAULTS.qr.servicePath;
        cfg.pages = Array.isArray(cfg.pages) ? cfg.pages.map(function (page, index) {
            const p = Object.assign({
                id: 'page-' + (index + 1),
                enabled: true,
                labelFr: 'Page Koha',
                labelEn: 'Koha page',
                path: '',
                queryContains: '',
                placement: 'auto',
                target: null
            }, page || {});
            p.enabled = p.enabled !== false;
            p.path = normalizePath(p.path);
            p.queryContains = String(p.queryContains || '').trim();
            if (['auto', 'append', 'prepend', 'before', 'after'].indexOf(p.placement) === -1) p.placement = 'auto';
            return p;
        }) : deepClone(DEFAULTS.pages);
        return cfg;
    }

    function pageMatches(page) {
        if (!page || page.enabled === false) return false;
        const wanted = normalizePath(page.path);
        if (!wanted || wanted !== window.location.pathname) return false;
        if (page.queryContains && window.location.search.indexOf(page.queryContains) === -1) return false;
        return true;
    }

    function currentPageRule(config) {
        const cfg = config || currentConfig;
        return (cfg.pages || []).find(pageMatches) || null;
    }

    function autoAnchorForPath(path) {
        const map = {
            '/cgi-bin/koha/catalogue/detail.pl': [
                '.technique',
                '.page-header .btn-toolbar',
                '#catalogue_detail_biblio .btn-toolbar',
                '.content-header .btn-toolbar',
                '.page-header',
                '#catalogue_detail_biblio h1',
                '#catalogue_detail_biblio .page-section'
            ],
            '/cgi-bin/koha/catalogue/search.pl': [
                '#searchresults',
                '.page-header .btn-toolbar',
                '.content-header .btn-toolbar',
                '#searchresults .btn-toolbar',
                '.page-header'
            ],
            '/cgi-bin/koha/course_reserves/course-details.pl': [
                '.page-section',
                '.page-header .btn-toolbar',
                '.content-header .btn-toolbar',
                '.page-section .btn-toolbar',
                '.page-header'
            ],
            '/cgi-bin/koha/reports/guided_reports.pl': [
                '.page-section',
                '.page-header .btn-toolbar',
                '.content-header .btn-toolbar',
                '.page-section .btn-toolbar',
                '.page-header'
            ]
        };
        const selectors = (map[path] || []).concat([
            '.page-header .btn-toolbar',
            '.content-header .btn-toolbar',
            '.btn-toolbar',
            '.page-header',
            'main h1',
            'h1',
            '.page-section',
            'main'
        ]);
        for (let i = 0; i < selectors.length; i += 1) {
            try {
                const el = document.querySelector(selectors[i]);
                if (el) return el;
            } catch (_) {}
        }
        return null;
    }

    function resolveTarget(target) {
        if (!target) return null;
        if (typeof target === 'string') {
            try { return document.querySelector(target); } catch (_) { return null; }
        }
        if (target.selector) {
            try {
                const direct = document.querySelector(target.selector);
                if (direct) return direct;
            } catch (_) {}
        }
        if (target.id) {
            const byId = document.getElementById(target.id);
            if (byId) return byId;
        }
        if (target.href) {
            try {
                const matches = Array.from(document.querySelectorAll('a[href]'));
                const found = matches.find(function (a) {
                    return String(a.getAttribute('href') || '').replace(/&amp;/g, '&') === target.href;
                });
                if (found) return found;
            } catch (_) {}
        }
        return null;
    }

    function anchorForRule(rule) {
        return resolveTarget(rule && rule.target) || autoAnchorForPath(window.location.pathname);
    }

    function isHistoricalPath(path) {
        return [
            '/cgi-bin/koha/catalogue/detail.pl',
            '/cgi-bin/koha/catalogue/search.pl',
            '/cgi-bin/koha/course_reserves/course-details.pl',
            '/cgi-bin/koha/reports/guided_reports.pl'
        ].indexOf(path) !== -1;
    }

    function prepareHistoricalAnchor(anchor) {
        if (!anchor || anchor.nodeType !== 1) return;
        try {
            const computed = window.getComputedStyle(anchor);
            if (computed.position !== 'static') return;
            if (!anchor.hasAttribute('data-pmk086-original-position')) {
                anchor.setAttribute('data-pmk086-original-position', anchor.style.position || '');
            }
            anchor.style.position = 'relative';
            anchor.setAttribute('data-pmk086-position-patched', '1');
        } catch (_) {}
    }

    function restoreHistoricalAnchors() {
        document.querySelectorAll('[data-pmk086-position-patched="1"]').forEach(function (anchor) {
            const original = anchor.getAttribute('data-pmk086-original-position') || '';
            if (original) anchor.style.position = original;
            else anchor.style.removeProperty('position');
            anchor.removeAttribute('data-pmk086-position-patched');
            anchor.removeAttribute('data-pmk086-original-position');
        });
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.pmk086-host{display:inline-flex;align-items:center;margin:.2rem .35rem .2rem 0;vertical-align:middle}',
            '.pmk086-host.pmk086-host--historical{position:absolute;top:.5em;right:.5em;margin:0;z-index:20}',
            '.pmk086-trigger{display:inline-flex!important;align-items:center;justify-content:center;gap:.38rem;white-space:nowrap;min-width:2.35rem;min-height:2.15rem;padding:.3rem .55rem}',
            '.pmk086-trigger>.fa-qrcode{font-size:1.35rem;line-height:1}',
            '.pmk086-trigger .pmk086-label{line-height:1.2}',
            '.pmk086-panel{position:fixed;z-index:2147483000;width:min(330px,calc(100vw - 24px));background:var(--bs-body-bg,#fff);color:var(--bs-body-color,#212529);border:1px solid var(--bs-border-color,#ced4da);border-radius:.65rem;box-shadow:0 .65rem 1.6rem rgba(0,0,0,.18);overflow:hidden}',
            '.pmk086-panel[hidden]{display:none!important}',
            '.pmk086-panel-header{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.72rem .85rem;border-bottom:1px solid var(--bs-border-color,#dee2e6);background:var(--bs-tertiary-bg,#f8f9fa)}',
            '.pmk086-panel-title{font-weight:600;font-size:.95rem;margin:0}',
            '.pmk086-close{border:0;background:transparent;padding:.2rem .35rem;line-height:1;border-radius:.35rem;color:inherit}',
            '.pmk086-close:hover,.pmk086-close:focus{background:rgba(0,0,0,.06)}',
            '.pmk086-panel-body{padding:.85rem;text-align:center}',
            '.pmk086-help{font-size:.84rem;margin:0 0 .7rem;color:var(--bs-secondary-color,#6c757d)}',
            '.pmk086-qr-stage{display:flex;align-items:center;justify-content:center;min-height:170px;background:#fff;border:1px solid var(--bs-border-color,#dee2e6);border-radius:.55rem;padding:.65rem;overflow:hidden}',
            '.pmk086-qr-stage img{display:block;height:auto;image-rendering:pixelated;max-width:100%}',
            '.pmk086-status{font-size:.78rem;margin:.55rem 0 0;color:var(--bs-secondary-color,#6c757d)}',
            '.pmk086-status.is-warning{font-weight:600}',
            '.pmk086-status.is-error{font-weight:600}',
            '.pmk086-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:.45rem;margin-top:.75rem}',
            '.pmk086-actions .btn{display:inline-flex;align-items:center;gap:.35rem}',
            '.pmk086-modal{position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:24px}',
            '.pmk086-modal[hidden]{display:none!important}',
            '.pmk086-modal-card{position:relative;background:#fff;border-radius:.75rem;box-shadow:0 1rem 3rem rgba(0,0,0,.35);padding:1rem;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);overflow:auto}',
            '.pmk086-modal-card img{display:block;width:auto;height:auto;max-width:88vmin;max-height:88vmin;image-rendering:pixelated}',
            '.pmk086-modal-close{position:absolute;top:.35rem;right:.35rem;width:2rem;height:2rem;border:1px solid #ced4da;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;z-index:2}',
            '.pmk086-picker-hover{outline:3px solid #2f7d32!important;outline-offset:2px!important;cursor:crosshair!important}',
            '.pmk086-picker-banner{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483646;background:#fff;border:1px solid #bbb;border-radius:4px;padding:8px 12px;box-shadow:0 2px 8px rgba(0,0,0,.25);font-size:14px;max-width:calc(100vw - 20px)}',
            '@media (max-width:575.98px){.pmk086-panel{width:calc(100vw - 20px)}.pmk086-host{margin:.2rem 0}}'
        ].join('');
        document.head.appendChild(style);
    }

    function moduleSizeForPayload(payload, config) {
        const cfg = config || currentConfig;
        if (cfg.qr.moduleSizeMode === 'manual') return clamp(cfg.qr.manualModuleSize, 2, 20);
        const len = String(payload || '').length;
        let size = 5;
        if (len > 180) size = 6;
        if (len > 350) size = 7;
        if (len > 600) size = 8;
        if (len > 900) size = 9;
        if (len > 1400) size = 10;
        return clamp(size, cfg.qr.autoMinModuleSize, cfg.qr.autoMaxModuleSize);
    }

    function buildQrUrl(payload, config) {
        const cfg = config || currentConfig;
        const url = new URL(cfg.qr.servicePath, window.location.origin);
        url.searchParams.set('barcode', String(payload || ''));
        url.searchParams.set('type', 'QRcode');
        url.searchParams.set('modulesize', String(moduleSizeForPayload(payload, cfg)));
        url.searchParams.set('notext', '1');
        return url.toString();
    }

    function removeHandlers() {
        if (outsideHandler) document.removeEventListener('mousedown', outsideHandler, true);
        if (escapeHandler) document.removeEventListener('keydown', escapeHandler, true);
        if (resizeHandler) {
            window.removeEventListener('resize', resizeHandler);
            window.removeEventListener('scroll', resizeHandler, true);
        }
        outsideHandler = null;
        escapeHandler = null;
        resizeHandler = null;
    }

    function closeModal() {
        const modal = document.getElementById(MODAL_ID);
        if (modal) modal.remove();
    }

    function closePanel() {
        const panel = document.getElementById(PANEL_ID);
        const trigger = document.querySelector('[' + HOST_ATTR + '] .pmk086-trigger');
        if (panel) panel.hidden = true;
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        closeModal();
        removeHandlers();
    }

    function positionPanel(trigger, panel) {
        if (!trigger || !panel || panel.hidden) return;
        const rect = trigger.getBoundingClientRect();
        const margin = 8;
        const panelRect = panel.getBoundingClientRect();
        let left = rect.left;
        let top = rect.bottom + margin;
        if (left + panelRect.width > window.innerWidth - margin) left = window.innerWidth - panelRect.width - margin;
        if (left < margin) left = margin;
        if (top + panelRect.height > window.innerHeight - margin && rect.top - panelRect.height - margin >= margin) {
            top = rect.top - panelRect.height - margin;
        }
        if (top < margin) top = margin;
        panel.style.left = Math.round(left) + 'px';
        panel.style.top = Math.round(top) + 'px';
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                const ok = document.execCommand('copy');
                ta.remove();
                ok ? resolve() : reject(new Error('copy_failed'));
            } catch (e) { reject(e); }
        });
    }

    function openLargeQr(src, alt) {
        closeModal();
        const modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'pmk086-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', alt);

        const card = document.createElement('div');
        card.className = 'pmk086-modal-card';

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'pmk086-modal-close';
        close.setAttribute('aria-label', localized('Fermer', 'Close'));
        close.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        close.addEventListener('click', closeModal);

        const img = document.createElement('img');
        img.src = src;
        img.alt = alt;

        card.appendChild(close);
        card.appendChild(img);
        modal.appendChild(card);
        modal.addEventListener('mousedown', function (event) {
            if (event.target === modal) closeModal();
        });
        document.body.appendChild(modal);
        close.focus();
    }

    function fillQr(panel, payload) {
        const stage = panel.querySelector('.pmk086-qr-stage');
        const status = panel.querySelector('.pmk086-status');
        const expand = panel.querySelector('[data-pmk086-action="expand"]');
        if (!stage || !status) return;

        stage.textContent = localized('Génération du QR code…', 'Generating QR code…');
        status.className = 'pmk086-status';
        status.textContent = '';

        const src = buildQrUrl(payload, currentConfig);
        const img = document.createElement('img');
        img.alt = localized('QR code de la page courante', 'QR code for the current page');
        img.style.width = currentConfig.panel.compactImageWidth + 'px';
        img.src = src;

        img.addEventListener('load', function () {
            stage.textContent = '';
            stage.appendChild(img);
            const len = payload.length;
            const moduleSize = moduleSizeForPayload(payload, currentConfig);
            if (len >= currentConfig.qr.veryLongLengthWarning) {
                status.className = 'pmk086-status is-warning';
                status.textContent = localized(
                    'URL très longue : QR très dense. Utilisez « Agrandir » pour faciliter le scan.',
                    'Very long URL: the QR code is dense. Use “Enlarge” for easier scanning.'
                );
            } else if (len >= currentConfig.qr.denseLengthWarning) {
                status.className = 'pmk086-status is-warning';
                status.textContent = localized(
                    'QR dense : taille des modules adaptée automatiquement (' + moduleSize + ' px).',
                    'Dense QR: module size was increased automatically (' + moduleSize + ' px).'
                );
            } else {
                status.textContent = localized(
                    'Généré par Koha · modules ' + moduleSize + ' px',
                    'Generated by Koha · ' + moduleSize + ' px modules'
                );
            }
            if (expand) {
                expand.disabled = false;
                expand.onclick = function () { openLargeQr(src, img.alt); };
            }
            const trigger = document.querySelector('[' + HOST_ATTR + '] .pmk086-trigger');
            if (trigger) positionPanel(trigger, panel);
        });

        img.addEventListener('error', function () {
            stage.textContent = localized('QR code indisponible', 'QR code unavailable');
            status.className = 'pmk086-status is-error';
            status.textContent = localized(
                'Koha n’a pas pu générer ce QR. L’URL peut être exceptionnellement longue ; vous pouvez toujours copier le lien.',
                'Koha could not generate this QR. The URL may be exceptionally long; you can still copy the link.'
            );
            if (expand) expand.disabled = true;
            const trigger = document.querySelector('[' + HOST_ATTR + '] .pmk086-trigger');
            if (trigger) positionPanel(trigger, panel);
        });
    }

    function createPanel(trigger) {
        const existing = document.getElementById(PANEL_ID);
        if (existing) existing.remove();

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.className = 'pmk086-panel';
        panel.hidden = true;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'false');
        panel.setAttribute('aria-labelledby', PANEL_ID + '-title');

        const header = document.createElement('div');
        header.className = 'pmk086-panel-header';
        const title = document.createElement('p');
        title.id = PANEL_ID + '-title';
        title.className = 'pmk086-panel-title';
        title.textContent = localized(currentConfig.panel.titleFr, currentConfig.panel.titleEn);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'pmk086-close';
        close.setAttribute('aria-label', localized('Fermer', 'Close'));
        close.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        close.addEventListener('click', closePanel);
        header.appendChild(title);
        header.appendChild(close);

        const body = document.createElement('div');
        body.className = 'pmk086-panel-body';
        const help = document.createElement('p');
        help.className = 'pmk086-help';
        help.textContent = localized(currentConfig.panel.instructionFr, currentConfig.panel.instructionEn);
        const stage = document.createElement('div');
        stage.className = 'pmk086-qr-stage';
        const status = document.createElement('p');
        status.className = 'pmk086-status';
        const actions = document.createElement('div');
        actions.className = 'pmk086-actions';

        if (currentConfig.panel.showExpandButton) {
            const expand = document.createElement('button');
            expand.type = 'button';
            expand.className = 'btn btn-default btn-sm';
            expand.setAttribute('data-pmk086-action', 'expand');
            expand.disabled = true;
            expand.innerHTML = '<i class="fa-solid fa-expand" aria-hidden="true"></i><span>' + localized('Agrandir', 'Enlarge') + '</span>';
            actions.appendChild(expand);
        }

        if (currentConfig.panel.showCopyButton) {
            const copy = document.createElement('button');
            copy.type = 'button';
            copy.className = 'btn btn-default btn-sm';
            copy.setAttribute('data-pmk086-action', 'copy');
            copy.innerHTML = '<i class="fa-solid fa-link" aria-hidden="true"></i><span>' + localized('Copier le lien', 'Copy link') + '</span>';
            copy.addEventListener('click', function () {
                const original = copy.innerHTML;
                copyText(window.location.href).then(function () {
                    copy.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i><span>' + localized('Copié', 'Copied') + '</span>';
                    window.setTimeout(function () { copy.innerHTML = original; }, 1300);
                }).catch(function () {});
            });
            actions.appendChild(copy);
        }

        body.appendChild(help);
        body.appendChild(stage);
        body.appendChild(status);
        if (actions.childNodes.length) body.appendChild(actions);
        panel.appendChild(header);
        panel.appendChild(body);
        document.body.appendChild(panel);

        return panel;
    }

    function openPanel(trigger) {
        let panel = document.getElementById(PANEL_ID);
        if (!panel) panel = createPanel(trigger);
        const wasHidden = panel.hidden;
        if (!wasHidden) {
            closePanel();
            return;
        }

        panel.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        positionPanel(trigger, panel);
        fillQr(panel, window.location.href);

        outsideHandler = function (event) {
            if (currentConfig.panel.closeOnOutsideClick === false) return;
            if (panel.contains(event.target) || trigger.contains(event.target)) return;
            closePanel();
        };
        escapeHandler = function (event) {
            if (event.key === 'Escape') closePanel();
        };
        resizeHandler = function () { positionPanel(trigger, panel); };
        document.addEventListener('mousedown', outsideHandler, true);
        document.addEventListener('keydown', escapeHandler, true);
        window.addEventListener('resize', resizeHandler);
        window.addEventListener('scroll', resizeHandler, true);
    }

    function createHost(rule, anchor) {
        const host = document.createElement('span');
        host.className = 'pmk086-host';
        host.setAttribute(HOST_ATTR, '1');
        host.setAttribute('data-pmk086-page', rule.id || 'page');

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-default btn-sm pmk086-trigger';
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', PANEL_ID);
        button.setAttribute('title', localized(currentConfig.button.titleFr, currentConfig.button.titleEn));
        button.innerHTML = '<i class="fa-solid fa-qrcode" aria-hidden="true"></i>' +
            (currentConfig.button.showText ? '<span class="pmk086-label"></span>' : '');
        const label = button.querySelector('.pmk086-label');
        if (label) label.textContent = localized(currentConfig.button.labelFr, currentConfig.button.labelEn);
        if (!currentConfig.button.showText) button.setAttribute('aria-label', localized(currentConfig.button.labelFr, currentConfig.button.labelEn));
        button.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            openPanel(button);
        });
        host.appendChild(button);

        let placement = rule.placement || 'auto';
        const resolvedCustomTarget = resolveTarget(rule && rule.target);
        const historicalAuto = placement === 'auto' && !resolvedCustomTarget && isHistoricalPath(window.location.pathname);

        if (historicalAuto) {
            prepareHistoricalAnchor(anchor);
            host.classList.add('pmk086-host--historical');
            try {
                anchor.insertBefore(host, anchor.firstChild);
            } catch (_) {
                try { anchor.appendChild(host); } catch (_) { return null; }
            }
            return host;
        }

        if (placement === 'auto') {
            if (anchor.matches && anchor.matches('.btn-toolbar,.toolbar,.btn-group')) placement = 'append';
            else if (anchor.matches && anchor.matches('h1,h2,.page-header,.content-header')) placement = 'after';
            else placement = 'prepend';
        }

        try {
            if (placement === 'append') anchor.appendChild(host);
            else if (placement === 'prepend') anchor.insertBefore(host, anchor.firstChild);
            else if (placement === 'before') anchor.parentNode.insertBefore(host, anchor);
            else anchor.parentNode.insertBefore(host, anchor.nextSibling);
        } catch (_) {
            try { anchor.appendChild(host); } catch (_) { return null; }
        }
        return host;
    }

    function mountContextAccess(host, rule) {
        if (!host || !window.PMKConfig || typeof window.PMKConfig.mountContextButton !== 'function') return;
        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: host,
                position: 'after',
                contextKey: 'page-qr-code-' + (rule && rule.id ? rule.id : window.location.pathname),
                context: { sectionId: 'pages', pageId: rule && rule.id ? rule.id : '' }
            });
        } catch (_) {}
    }

    function clearRetries() {
        retryTimers.forEach(function (id) { try { window.clearTimeout(id); } catch (_) {} });
        retryTimers = [];
    }

    function stopObserver() {
        if (observer) {
            try { observer.disconnect(); } catch (_) {}
            observer = null;
        }
    }

    function removeRuntime() {
        clearRetries();
        stopObserver();
        closePanel();
        document.querySelectorAll('[' + HOST_ATTR + ']').forEach(function (node) { node.remove(); });
        restoreHistoricalAnchors();
        const panel = document.getElementById(PANEL_ID);
        if (panel) panel.remove();
        closeModal();
        currentRule = null;
    }

    function render() {
        removeRuntime();
        ensureStyles();
        if (!currentConfig.enabled) return;

        currentRule = currentPageRule(currentConfig);
        if (!currentRule) return;

        const tryMount = function () {
            if (document.querySelector('[' + HOST_ATTR + ']')) return true;
            const anchor = anchorForRule(currentRule);
            if (!anchor) return false;
            const host = createHost(currentRule, anchor);
            if (!host) return false;
            mountContextAccess(host, currentRule);
            return true;
        };

        if (tryMount()) return;

        [250, 700, 1600].forEach(function (delay) {
            retryTimers.push(window.setTimeout(tryMount, delay));
        });

        observer = new MutationObserver(function () {
            if (tryMount()) stopObserver();
        });
        try { observer.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) { stopObserver(); }
        retryTimers.push(window.setTimeout(stopObserver, 5000));
    }

    function selectorPart(element) {
        if (!element || element.nodeType !== 1) return '';
        if (element.id) return '#' + CSS.escape(element.id);
        const tag = element.tagName.toLowerCase();
        const stableAttrs = ['data-testid', 'data-action', 'data-number', 'name', 'role'];
        for (let i = 0; i < stableAttrs.length; i += 1) {
            const attr = stableAttrs[i];
            const value = element.getAttribute(attr);
            if (value && String(value).length < 120) {
                return tag + '[' + attr + '="' + CSS.escape(String(value)) + '"]';
            }
        }
        const classes = Array.from(element.classList || []).filter(function (name) {
            return name && !/^active$|^show$|^open$|^selected$|^focus$|^hover$/.test(name) && name.indexOf('pmk') !== 0;
        }).slice(0, 2);
        return tag + classes.map(function (name) { return '.' + CSS.escape(name); }).join('');
    }

    function stableSelector(element) {
        if (!element || element.nodeType !== 1) return '';
        if (element.id) return '#' + CSS.escape(element.id);
        const parts = [];
        let node = element;
        for (let depth = 0; node && node.nodeType === 1 && depth < 5; depth += 1) {
            const part = selectorPart(node);
            if (!part) break;
            parts.unshift(part);
            const selector = parts.join(' > ');
            try {
                if (document.querySelectorAll(selector).length === 1) return selector;
            } catch (_) {}
            node = node.parentElement;
        }
        return parts.join(' > ');
    }

    function fingerprint(element) {
        const selector = stableSelector(element);
        return {
            selector: selector,
            id: element.id || '',
            href: element.tagName === 'A' ? String(element.getAttribute('href') || '').replace(/&amp;/g, '&') : '',
            label: String(element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100)
        };
    }

    function pickElementOnCurrentPage() {
        return new Promise(function (resolve, reject) {
            ensureStyles();
            const overlay = document.getElementById('pmk-config-overlay');
            const previousDisplay = overlay ? overlay.style.display : '';
            if (overlay) overlay.style.display = 'none';

            let pickerStyle = document.getElementById(PICKER_STYLE_ID);
            if (!pickerStyle) {
                pickerStyle = document.createElement('style');
                pickerStyle.id = PICKER_STYLE_ID;
                document.head.appendChild(pickerStyle);
            }

            const banner = document.createElement('div');
            banner.className = 'pmk086-picker-banner';
            banner.textContent = localized('Cliquez sur l’emplacement du bouton QR — Échap pour annuler', 'Click where the QR button should be placed — Escape to cancel');
            document.body.appendChild(banner);

            let hovered = null;
            function cleanup() {
                if (hovered) hovered.classList.remove('pmk086-picker-hover');
                document.removeEventListener('mouseover', over, true);
                document.removeEventListener('mouseout', out, true);
                document.removeEventListener('click', click, true);
                document.removeEventListener('keydown', key, true);
                if (banner.isConnected) banner.remove();
                if (overlay) overlay.style.display = previousDisplay;
            }
            function over(event) {
                if (hovered) hovered.classList.remove('pmk086-picker-hover');
                hovered = event.target && event.target.nodeType === 1 ? event.target : null;
                if (hovered && !hovered.closest('.pmk086-picker-banner')) hovered.classList.add('pmk086-picker-hover');
            }
            function out(event) {
                if (event.target && event.target.classList) event.target.classList.remove('pmk086-picker-hover');
            }
            function click(event) {
                if (event.target && event.target.closest && event.target.closest('.pmk086-picker-banner')) return;
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                const target = fingerprint(event.target);
                cleanup();
                if (!target.selector && !target.id && !target.href) return reject(new Error('selector_unavailable'));
                resolve(target);
            }
            function key(event) {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                cleanup();
                reject(new Error('picker_cancelled'));
            }
            document.addEventListener('mouseover', over, true);
            document.addEventListener('mouseout', out, true);
            document.addEventListener('click', click, true);
            document.addEventListener('keydown', key, true);
        });
    }

    function resolvePageIndexFromPath(path) {
        if (!Array.isArray(path)) return -1;
        const pos = path.indexOf('pages');
        if (pos === -1) return -1;
        const index = Number(path[pos + 1]);
        return Number.isInteger(index) ? index : -1;
    }

    function targetPageUrl(page) {
        const path = normalizePath(page && page.path);
        return path ? window.location.origin + path : window.location.href;
    }

    function pickForConfig(context) {
        const index = resolvePageIndexFromPath(context.path);
        const page = index >= 0 && context.root && Array.isArray(context.root.pages) ? context.root.pages[index] : null;
        const wantedPage = normalizePath(page && page.path);
        if (wantedPage && wantedPage !== window.location.pathname) {
            const pending = {
                moduleId: MODULE_ID,
                pageIndex: index,
                page: wantedPage,
                draft: deepClone(context.root),
                startedAt: Date.now()
            };
            try { sessionStorage.setItem(PENDING_PICK_KEY, JSON.stringify(pending)); } catch (_) {}
            window.location.href = targetPageUrl(page);
            return new Promise(function () {});
        }
        return pickElementOnCurrentPage().then(function (target) { return { value: target }; });
    }

    function formatTarget(target, root, path, lang) {
        if (!target) return lang === 'en' ? 'Automatic placement' : 'Emplacement automatique';
        if (target.label) return target.label;
        if (target.selector) return target.selector;
        return lang === 'en' ? 'Selected location' : 'Emplacement sélectionné';
    }

    function newPage() {
        return {
            id: 'custom-' + Date.now().toString(36),
            enabled: true,
            labelFr: 'Page personnalisée',
            labelEn: 'Custom page',
            path: window.location.pathname,
            queryContains: '',
            placement: 'after',
            target: null
        };
    }

    function validateConfig(config) {
        const cfg = normalizeConfig(config);
        if (!Array.isArray(cfg.pages) || !cfg.pages.length) return { ok: false, message: 'Au moins une page doit être configurée.' };
        for (let i = 0; i < cfg.pages.length; i += 1) {
            const page = cfg.pages[i];
            if (page.enabled === false) continue;
            if (!page.path) return { ok: false, message: 'La page QR ' + (i + 1) + ' doit avoir un chemin Koha.' };
        }
        if (cfg.qr.moduleSizeMode === 'manual' && (cfg.qr.manualModuleSize < 2 || cfg.qr.manualModuleSize > 20)) {
            return { ok: false, message: 'La taille manuelle des modules QR doit être comprise entre 2 et 20.' };
        }
        return { ok: true };
    }

    function moduleDefinition() {
        return {
            id: MODULE_ID,
            schemaVersion: 2,
            name: { fr: 'QR mobile de la page', en: 'Page mobile QR' },
            description: {
                fr: 'Ajoute un bouton discret ouvrant un petit volet QR. Le QR est généré nativement par Koha à partir de l’URL courante, sans CDN ni bibliothèque externe.',
                en: 'Adds a discreet button opening a compact QR panel. The QR is generated natively by Koha from the current URL, with no CDN or external QR library.'
            },
            category: { fr: 'Interface / navigation', en: 'Interface / navigation' },
            supportedPages: [
                '/cgi-bin/koha/catalogue/detail.pl',
                '/cgi-bin/koha/catalogue/search.pl',
                '/cgi-bin/koha/course_reserves/course-details.pl',
                '/cgi-bin/koha/reports/guided_reports.pl'
            ],
            prerequisites: [],
            dependencies: [],
            defaults: deepClone(DEFAULTS),
            validate: validateConfig,
            schema: [
                {
                    type: 'section',
                    id: 'activation',
                    label: { fr: 'Activation', en: 'Activation' },
                    description: {
                        fr: 'Le QR n’est jamais affiché en permanence. Seul un bouton compact est injecté sur les pages activées, à l’emplacement historique par défaut.',
                        en: 'The QR is never permanently displayed. Only a compact button is added to enabled pages, using the historical location by default.'
                    },
                    fields: [
                        { key: 'enabled', type: 'boolean', label: { fr: 'Activer les QR mobiles', en: 'Enable mobile QR codes' } }
                    ]
                },
                {
                    type: 'section',
                    id: 'appearance',
                    label: { fr: 'Bouton et volet', en: 'Button and panel' },
                    fields: [
                        { key: 'button.showText', type: 'boolean', label: { fr: 'Afficher le texte à côté de l’icône QR', en: 'Show text next to the QR icon' } },
                        { key: 'button.labelFr', type: 'text', label: { fr: 'Libellé du bouton — français', en: 'Button label — French' } },
                        { key: 'button.labelEn', type: 'text', label: { fr: 'Libellé du bouton — anglais', en: 'Button label — English' } },
                        { key: 'panel.titleFr', type: 'text', label: { fr: 'Titre du volet — français', en: 'Panel title — French' } },
                        { key: 'panel.titleEn', type: 'text', label: { fr: 'Titre du volet — anglais', en: 'Panel title — English' } },
                        { key: 'panel.instructionFr', type: 'text', label: { fr: 'Texte d’aide — français', en: 'Help text — French' } },
                        { key: 'panel.instructionEn', type: 'text', label: { fr: 'Texte d’aide — anglais', en: 'Help text — English' } },
                        { key: 'panel.compactImageWidth', type: 'number', label: { fr: 'Largeur du QR dans le petit volet (px)', en: 'QR width in compact panel (px)' } },
                        { key: 'panel.showExpandButton', type: 'boolean', label: { fr: 'Afficher le bouton « Agrandir »', en: 'Show the “Enlarge” button' } },
                        { key: 'panel.showCopyButton', type: 'boolean', label: { fr: 'Afficher « Copier le lien »', en: 'Show “Copy link”' } }
                    ]
                },
                {
                    type: 'section',
                    id: 'quality',
                    label: { fr: 'Lisibilité du QR', en: 'QR readability' },
                    description: {
                        fr: 'En mode automatique, PimpMyKoha augmente la taille des modules quand l’URL devient longue. Le QR reste compact dans le volet ; « Agrandir » affiche sa version la plus lisible uniquement à la demande.',
                        en: 'In automatic mode, PimpMyKoha increases module size as the URL gets longer. The QR remains compact in the panel; “Enlarge” shows a more readable version only on demand.'
                    },
                    fields: [
                        {
                            key: 'qr.moduleSizeMode',
                            type: 'select',
                            label: { fr: 'Taille des modules', en: 'Module size' },
                            options: [
                                { value: 'auto', label: { fr: 'Automatique selon la longueur de l’URL', en: 'Automatic based on URL length' } },
                                { value: 'manual', label: { fr: 'Manuelle', en: 'Manual' } }
                            ]
                        },
                        {
                            key: 'qr.manualModuleSize',
                            type: 'number',
                            label: { fr: 'Taille manuelle d’un module (px)', en: 'Manual module size (px)' },
                            when: function (root) { return root.qr && root.qr.moduleSizeMode === 'manual'; }
                        },
                        { key: 'qr.autoMinModuleSize', type: 'number', advanced: true, label: { fr: 'Taille automatique minimale', en: 'Automatic minimum module size' } },
                        { key: 'qr.autoMaxModuleSize', type: 'number', advanced: true, label: { fr: 'Taille automatique maximale', en: 'Automatic maximum module size' } },
                        { key: 'qr.denseLengthWarning', type: 'number', advanced: true, label: { fr: 'Seuil URL dense (caractères)', en: 'Dense URL threshold (characters)' } },
                        { key: 'qr.veryLongLengthWarning', type: 'number', advanced: true, label: { fr: 'Seuil URL très longue (caractères)', en: 'Very long URL threshold (characters)' } },
                        {
                            key: 'qr.servicePath',
                            type: 'text',
                            advanced: true,
                            label: { fr: 'Service QR natif Koha', en: 'Native Koha QR service' },
                            help: {
                                fr: 'Valeur recommandée : /cgi-bin/koha/svc/barcode. Ne la modifier que pour une installation Koha atypique.',
                                en: 'Recommended value: /cgi-bin/koha/svc/barcode. Change it only for an unusual Koha installation.'
                            }
                        }
                    ]
                },
                {
                    type: 'section',
                    id: 'pages',
                    label: { fr: 'Pages actives', en: 'Enabled pages' },
                    description: {
                        fr: 'Les quatre pages historiques du 086 sont préconfigurées. Sans sélection personnalisée, le bouton reprend automatiquement l’emplacement historique du 086, en haut à droite du bloc concerné. Vous pouvez le remplacer avec le picker.',
                        en: 'The four historical 086 pages are preconfigured. Without a custom selection, the button automatically reuses the historical 086 location at the top right of the relevant block. You can override it with the picker.'
                    },
                    fields: [
                        {
                            key: 'pages',
                            type: 'repeater',
                            label: { fr: 'Pages QR', en: 'QR pages' },
                            addLabel: { fr: 'Ajouter une page', en: 'Add page' },
                            reorder: true,
                            newItem: newPage,
                            itemTitle: function (item, index, lang) {
                                if (!item) return 'Page ' + (index + 1);
                                return lang === 'en' ? (item.labelEn || item.labelFr || item.path) : (item.labelFr || item.labelEn || item.path);
                            },
                            fields: [
                                { key: 'enabled', type: 'boolean', label: { fr: 'Page active', en: 'Page enabled' } },
                                { key: 'labelFr', type: 'text', label: { fr: 'Nom français', en: 'French name' } },
                                { key: 'labelEn', type: 'text', label: { fr: 'Nom anglais', en: 'English name' } },
                                { key: 'path', type: 'text', label: { fr: 'Page Koha', en: 'Koha page' }, help: { fr: 'Exemple : /cgi-bin/koha/catalogue/detail.pl', en: 'Example: /cgi-bin/koha/catalogue/detail.pl' } },
                                { key: 'queryContains', type: 'text', advanced: true, label: { fr: 'La requête doit contenir (optionnel)', en: 'Query must contain (optional)' } },
                                {
                                    key: 'target',
                                    type: 'picker',
                                    label: { fr: 'Emplacement du bouton', en: 'Button location' },
                                    pickLabel: { fr: 'Choisir sur la page', en: 'Pick on page' },
                                    clearLabel: { fr: 'Revenir à l’emplacement automatique', en: 'Use automatic placement' },
                                    help: {
                                        fr: 'Laissez vide pour reprendre l’emplacement historique du 086 sur les quatre pages préconfigurées. Le picker peut naviguer vers la page configurée avant la sélection.',
                                        en: 'Leave empty to reuse the historical 086 location on the four preconfigured pages. The picker can navigate to the configured page before selection.'
                                    },
                                    formatValue: formatTarget,
                                    pick: pickForConfig
                                },
                                {
                                    key: 'placement',
                                    type: 'select',
                                    advanced: true,
                                    label: { fr: 'Insertion par rapport à l’élément choisi', en: 'Insertion relative to selected element' },
                                    options: [
                                        { value: 'auto', label: { fr: 'Automatique', en: 'Automatic' } },
                                        { value: 'append', label: { fr: 'À l’intérieur, à la fin', en: 'Inside, at end' } },
                                        { value: 'prepend', label: { fr: 'À l’intérieur, au début', en: 'Inside, at start' } },
                                        { value: 'after', label: { fr: 'Juste après', en: 'Immediately after' } },
                                        { value: 'before', label: { fr: 'Juste avant', en: 'Immediately before' } }
                                    ]
                                },
                                { key: 'id', type: 'text', advanced: true, label: { fr: 'Identifiant interne', en: 'Internal identifier' } }
                            ]
                        }
                    ]
                }
            ],
            focusContext: function (main, context) {
                if (!main) return;
                const wanted = context && context.sectionId ? context.sectionId : 'pages';
                const section = main.querySelector('[data-pmk-section-id="' + wanted + '"]') || main.querySelector('[data-pmk-section-id="pages"]');
                if (!section) return;
                window.setTimeout(function () { section.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 0);
            }
        };
    }

    function registerModule() {
        if (!window.PMKConfig || typeof window.PMKConfig.registerModule !== 'function') return false;
        try { window.PMKConfig.registerModule(moduleDefinition()); return true; } catch (_) { return false; }
    }

    function loadConfig() {
        if (!window.PMKConfig || typeof window.PMKConfig.getConfig !== 'function') return Promise.resolve(deepClone(DEFAULTS));
        return Promise.resolve(window.PMKConfig.getConfig(MODULE_ID))
            .then(function (cfg) { return normalizeConfig(cfg || DEFAULTS); })
            .catch(function () { return deepClone(DEFAULTS); });
    }

    function applyConfig(config) {
        currentConfig = normalizeConfig(config || DEFAULTS);
        render();
    }

    function refresh() {
        return loadConfig().then(applyConfig);
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
                const target = await pickElementOnCurrentPage();
                const draft = normalizeConfig(pending.draft || DEFAULTS);
                const index = Number(pending.pageIndex);
                if (!Number.isInteger(index) || !draft.pages[index]) return;
                draft.pages[index].target = target;
                if (window.PMKConfig && typeof window.PMKConfig.saveConfig === 'function') {
                    await window.PMKConfig.saveConfig(MODULE_ID, draft);
                    applyConfig(draft);
                    if (typeof window.PMKConfig.openAdmin === 'function') {
                        await window.PMKConfig.openAdmin(MODULE_ID, { pageIndex: index, sectionId: 'pages' });
                    }
                } else {
                    applyConfig(draft);
                }
            } catch (error) {
                if (!error || error.message !== 'picker_cancelled') {
                    try { console.warn('PMK page-qr-code picker:', error); } catch (_) {}
                }
            }
        }, 120);
        return true;
    }

    function startWithCore() {
        registerModule();
        refresh().then(resumePendingPick);
        if (!unsubscribe && window.PMKConfig && typeof window.PMKConfig.subscribe === 'function') {
            try { unsubscribe = window.PMKConfig.subscribe(MODULE_ID, applyConfig); } catch (_) {}
        }
    }

    function start() {
        ensureStyles();
        currentConfig = normalizeConfig(DEFAULTS);
        render();
        if (window.PMKConfig) startWithCore();
        else document.addEventListener('pmk:config-ready', startWithCore, { once: true });
    }

    window.PMKPageQrCode = {
        id: MODULE_ID,
        version: MODULE_VERSION,
        defaults: deepClone(DEFAULTS),
        normalize: normalizeConfig,
        refresh: refresh,
        render: render,
        chooseModuleSize: moduleSizeForPayload,
        buildQrUrl: buildQrUrl,
        pickElement: pickElementOnCurrentPage,
        stableSelector: stableSelector,
        diagnose: function () {
            const rule = currentPageRule(currentConfig);
            return {
                version: MODULE_VERSION,
                enabled: currentConfig.enabled,
                path: window.location.pathname,
                matchedPage: rule ? rule.id : null,
                payloadLength: window.location.href.length,
                moduleSize: moduleSizeForPayload(window.location.href, currentConfig),
                qrUrlLength: buildQrUrl(window.location.href, currentConfig).length,
                hostPresent: Boolean(document.querySelector('[' + HOST_ATTR + ']')),
                nativeService: currentConfig.qr.servicePath
            };
        },
        destroy: function () {
            removeRuntime();
            if (typeof unsubscribe === 'function') {
                try { unsubscribe(); } catch (_) {}
                unsubscribe = null;
            }
            const style = document.getElementById(STYLE_ID);
            if (style) style.remove();
        }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();

/* ============================================================
   000-pmk-cover-resolver.js
   PimpMyKoha — moteur transverse de résolution des couvertures
   Version : 1.0.0
   Date : 2026-10-01

   Objectif :
   - moteur commun pour 066-067 (listes personnelles) et 142 (bibliographies) ;
   - sources uniquement issues de Koha / de ce que Koha rend déjà disponible ;
   - DOM courant, HTML detail.pl, Electre via endpoint Koha, source existante, MARC 856 ;
   - aucun appel direct codé vers Google Books / Open Library / Amazon ;
   - cache par biblionumber / ISBN ;
   - file globale limitée à 4 résolutions simultanées ;
   - chargement différé possible à l'approche du viewport ;
   - fallback automatique si une image échoue ou est vide/minuscule.
   ============================================================ */
(function (window, document) {
    'use strict';

    if (!window || !document) return;
    if (window.PMKCoverResolver && window.PMKCoverResolver.version) return;

    const VERSION = '1.0.0';
    const MAX_CONCURRENCY = 4;
    const MIN_VALID_IMAGE_SIZE = 20;

    const resolutionCache = new Map();
    const detailHtmlCache = new Map();
    const marcCache = new Map();

    let activeJobs = 0;
    const pendingJobs = [];

    function clean(value) {
        return String(value == null ? '' : value)
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function absoluteUrl(value) {
        const url = clean(value);
        if (!url) return '';
        try {
            return new URL(url, window.location.origin).href;
        } catch (_) {
            return url;
        }
    }

    function uniqueCoverCandidates(values) {
        const out = [];
        const seen = new Set();

        (values || []).flat(Infinity).forEach(value => {
            const url = absoluteUrl(value);
            if (!url) return;

            const lowered = url.toLowerCase();
            if (
                lowered.includes('/img/spinner') ||
                lowered.includes('favicon') ||
                lowered.includes('blank.gif') ||
                lowered.includes('transparent') ||
                lowered === 'about:blank'
            ) return;

            if (seen.has(url)) return;
            seen.add(url);
            out.push(url);
        });

        return out;
    }

    function normalizeIsbn(value) {
        const source = Array.isArray(value) ? value[0] : value;
        const first = clean(source).split(/[\s,;]+/)[0] || '';
        return first.replace(/[^0-9Xx]/g, '').toUpperCase();
    }

    function isbnValues(value) {
        const source = Array.isArray(value) ? value : [value];
        const out = [];

        source.forEach(entry => {
            String(entry || '')
                .split(/[\s,;|]+/)
                .map(part => normalizeIsbn(part))
                .filter(Boolean)
                .forEach(isbn => {
                    if (!out.includes(isbn)) out.push(isbn);
                });
        });

        return out;
    }

    function isbn13to10(value) {
        const isbn = normalizeIsbn(value);
        if (/^\d{9}[\dX]$/.test(isbn)) return isbn;
        if (!/^978\d{10}$/.test(isbn)) return '';

        const core = isbn.slice(3, 12);
        let sum = 0;
        for (let i = 0; i < 9; i += 1) sum += (10 - i) * Number(core[i]);
        const check = (11 - (sum % 11)) % 11;
        return core + (check === 10 ? 'X' : String(check));
    }

    function marcValue(marc, tag, code) {
        return marc?.[String(tag)]?.[String(code)] ?? '';
    }

    function firstMarcValue(marc, candidates) {
        for (const [tag, code] of candidates || []) {
            const value = marcValue(marc, tag, code);
            if (Array.isArray(value)) {
                const first = value.find(Boolean);
                if (first) return clean(first);
            } else if (clean(value)) {
                return clean(value);
            }
        }
        return '';
    }

    function electreIsbn10Candidates(input, marc) {
        const values = [
            ...isbnValues(input?.isbn),
            ...isbnValues(marcValue(marc || {}, '010', 'a'))
        ];
        const out = [];
        values.forEach(value => {
            const isbn10 = isbn13to10(value);
            if (isbn10 && !out.includes(isbn10)) out.push(isbn10);
        });
        return out;
    }

    function runQueued(task) {
        return new Promise((resolve, reject) => {
            pendingJobs.push({ task, resolve, reject });
            drainQueue();
        });
    }

    function drainQueue() {
        while (activeJobs < MAX_CONCURRENCY && pendingJobs.length) {
            const job = pendingJobs.shift();
            activeJobs += 1;
            Promise.resolve()
                .then(job.task)
                .then(job.resolve, job.reject)
                .finally(() => {
                    activeJobs -= 1;
                    drainQueue();
                });
        }
    }

    async function fetchDetailHtml(biblionumber) {
        const id = clean(biblionumber);
        if (!id) return '';
        if (detailHtmlCache.has(id)) return await detailHtmlCache.get(id);

        const promise = (async () => {
            const response = await fetch(
                '/cgi-bin/koha/catalogue/detail.pl?biblionumber=' + encodeURIComponent(id),
                {
                    credentials: 'same-origin',
                    headers: { Accept: 'text/html,application/xhtml+xml' }
                }
            );
            if (!response.ok) throw new Error('HTTP ' + response.status + ' — fiche notice ' + id);
            return await response.text();
        })();

        detailHtmlCache.set(id, promise);
        try {
            return await promise;
        } catch (error) {
            detailHtmlCache.delete(id);
            throw error;
        }
    }

    function imgCandidateUrls(img) {
        if (!img) return [];
        const urls = [
            img.getAttribute('src'),
            img.getAttribute('data-src'),
            img.getAttribute('data-original'),
            img.getAttribute('data-lazy-src')
        ];
        const srcset = clean(img.getAttribute('srcset'));
        if (srcset) {
            srcset.split(',').forEach(part => {
                const url = clean(part.trim().split(/\s+/)[0]);
                if (url) urls.push(url);
            });
        }
        return uniqueCoverCandidates(urls);
    }

    function extractKohaCoverCandidatesFromHtml(htmlText) {
        if (!htmlText) return [];
        const doc = new DOMParser().parseFromString(htmlText, 'text/html');
        const urls = [];

        [
            '#biblio-cover-slider .cover-image img',
            '.bookcoverimg .cover-image img',
            '#biblio-cover-slider img',
            '.bookcoverimg img',
            '#custom-img',
            '.imgcouv',
            '.imgcouvlist',
            '.thumbimg'
        ].forEach(selector => {
            doc.querySelectorAll(selector).forEach(img => {
                urls.push(...imgCandidateUrls(img));
                const link = img.closest('a[href]')?.getAttribute('href');
                if (link && /\/catalogue\/image\.pl\?/i.test(link)) urls.push(link);
            });
        });

        return uniqueCoverCandidates(urls);
    }

    function currentBiblionumber() {
        try {
            return clean(new URL(window.location.href).searchParams.get('biblionumber'));
        } catch (_) {
            return '';
        }
    }

    function extractLiveKohaCoverCandidates(biblionumber) {
        const bibId = clean(biblionumber);
        if (!bibId || currentBiblionumber() !== bibId) return [];

        const urls = [];
        document.querySelectorAll(
            '#biblio-cover-slider img, .bookcoverimg img, .imgcouv, .imgcouvlist, .thumbimg'
        ).forEach(img => urls.push(...imgCandidateUrls(img)));
        return uniqueCoverCandidates(urls);
    }

    function addMarcValue(target, tag, code, value) {
        const cleanValue = clean(value);
        if (!cleanValue) return;
        if (!target[tag]) target[tag] = {};
        const previous = target[tag][code];
        if (previous == null || previous === '') target[tag][code] = cleanValue;
        else if (Array.isArray(previous)) {
            if (!previous.includes(cleanValue)) previous.push(cleanValue);
        } else if (previous !== cleanValue) {
            target[tag][code] = [previous, cleanValue];
        }
    }

    function parseMarcXml(xmlText) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, 'application/xml');
        if (doc.querySelector('parsererror')) throw new Error('MARCXML illisible.');

        const marc = {};
        Array.from(doc.getElementsByTagNameNS('*', 'datafield')).forEach(field => {
            const tag = clean(field.getAttribute('tag'));
            if (!tag) return;
            Array.from(field.getElementsByTagNameNS('*', 'subfield')).forEach(subfield => {
                const code = clean(subfield.getAttribute('code'));
                if (!code) return;
                addMarcValue(marc, tag, code, subfield.textContent);
            });
        });
        return marc;
    }

    async function fetchMarcXml(url) {
        const response = await fetch(url, {
            credentials: 'same-origin',
            headers: { Accept: 'application/marcxml+xml' }
        });
        if (!response.ok) throw new Error('HTTP ' + response.status + ' — ' + url);
        const xml = await response.text();
        if (!xml || !/<(?:\w+:)?record\b/i.test(xml)) throw new Error('Réponse MARCXML invalide — ' + url);
        return xml;
    }

    async function fetchMarcForBiblio(biblionumber) {
        const id = clean(biblionumber);
        if (!id) return {};
        if (marcCache.has(id)) return await marcCache.get(id);

        const promise = (async () => {
            const encoded = encodeURIComponent(id);
            const urls = [
                '/api/v1/biblios/' + encoded,
                '/api/v1/public/biblios/' + encoded
            ];
            for (const url of urls) {
                try {
                    return parseMarcXml(await fetchMarcXml(url));
                } catch (_) {}
            }
            return {};
        })();

        marcCache.set(id, promise);
        try {
            return await promise;
        } catch (error) {
            marcCache.delete(id);
            return {};
        }
    }

    function marc856CoverCandidates(marc) {
        const raw = marcValue(marc || {}, '856', 'u');
        const values = Array.isArray(raw) ? raw : [raw];
        return uniqueCoverCandidates(
            values
                .map(value => clean(value))
                .filter(value => /^https?:\/\//i.test(value) || value.startsWith('/'))
        );
    }

    async function fetchElectreCoverViaKoha(input, marc) {
        const candidates = electreIsbn10Candidates(input, marc);
        if (!candidates.length) return '';

        for (const isbn10 of candidates) {
            const url = '/api/v1/contrib/electre/image'
                + '?isbn10=' + encodeURIComponent(isbn10)
                + '&side=staff'
                + '&result_page=true';
            try {
                const response = await fetch(url, {
                    credentials: 'same-origin',
                    headers: { Accept: 'text/plain, application/json;q=0.9, */*;q=0.8' }
                });
                if (!response.ok) continue;
                let value = clean(await response.text());
                value = value.replace(/^"(.*)"$/s, '$1').trim();
                if (value && value !== 'null' && value !== 'undefined') return absoluteUrl(value);
            } catch (_) {}
        }
        return '';
    }

    function sourceCandidates(input) {
        return uniqueCoverCandidates([
            input?.cover,
            input?.imgSrc,
            ...(Array.isArray(input?.coverCandidates) ? input.coverCandidates : [])
        ]);
    }

    function resolutionKey(input, marc) {
        const bibId = clean(input?.biblionumber);
        if (bibId) return 'bib:' + bibId;
        const isbn = normalizeIsbn(input?.isbn || firstMarcValue(marc || {}, [['010', 'a']]));
        return isbn ? 'isbn:' + isbn : '';
    }

    async function resolveCandidates(input = {}, options = {}) {
        const suppliedMarc = options.marc || input.marc || null;
        const initialKey = resolutionKey(input, suppliedMarc || {});
        if (initialKey && resolutionCache.has(initialKey)) return await resolutionCache.get(initialKey);

        const promise = runQueued(async () => {
            const bibId = clean(input?.biblionumber);
            const source = sourceCandidates(input);
            const live = extractLiveKohaCoverCandidates(bibId);

            let detail = [];
            let marc = suppliedMarc || {};

            const tasks = [];
            if (bibId) {
                tasks.push(
                    fetchDetailHtml(bibId)
                        .then(extractKohaCoverCandidatesFromHtml)
                        .catch(() => [])
                );
                if (!suppliedMarc) tasks.push(fetchMarcForBiblio(bibId));
            }

            if (tasks.length) {
                const results = await Promise.all(tasks);
                detail = results[0] || [];
                if (!suppliedMarc && results.length > 1) marc = results[1] || {};
            }

            const electre = await fetchElectreCoverViaKoha(input, marc);
            const from856 = marc856CoverCandidates(marc);

            return uniqueCoverCandidates([
                live,
                detail,
                electre,
                source,
                from856
            ]);
        });

        const cacheKey = initialKey || resolutionKey(input, suppliedMarc || {});
        if (cacheKey) resolutionCache.set(cacheKey, promise);

        try {
            return await promise;
        } catch (error) {
            if (cacheKey) resolutionCache.delete(cacheKey);
            return sourceCandidates(input);
        }
    }

    function waitUntilNearViewport(element, rootMargin = '300px') {
        if (!element || !('IntersectionObserver' in window)) return Promise.resolve();
        return new Promise(resolve => {
            const observer = new IntersectionObserver(entries => {
                if (entries.some(entry => entry.isIntersecting)) {
                    observer.disconnect();
                    resolve();
                }
            }, { root: null, rootMargin });
            observer.observe(element);
        });
    }

    function bindImage(img, input = {}, options = {}) {
        if (!img) return Promise.resolve([]);
        if (img.dataset.pmkCoverResolverBound === '1') return Promise.resolve([]);
        img.dataset.pmkCoverResolverBound = '1';

        const removeOnExhausted = options.removeOnExhausted !== false;
        const deferUntilVisible = options.deferUntilVisible === true;
        const resolveOnErrorOnly = options.resolveOnErrorOnly === true;
        const initial = sourceCandidates(input);

        let candidates = initial.slice();
        let index = -1;
        let fullResolved = false;
        let resolving = null;
        let finished = false;

        img.loading = img.loading || 'lazy';
        img.decoding = 'async';
        img.style.visibility = 'hidden';

        function exhaust() {
            if (finished) return;
            finished = true;
            img.style.visibility = '';
            if (removeOnExhausted) img.remove();
            else img.style.display = 'none';
        }

        async function ensureFullCandidates() {
            if (fullResolved) return candidates;
            if (resolving) return await resolving;
            resolving = (async () => {
                if (deferUntilVisible) await waitUntilNearViewport(img, options.rootMargin || '300px');
                const resolved = await resolveCandidates(input, options);
                candidates = uniqueCoverCandidates([candidates, resolved]);
                fullResolved = true;
                return candidates;
            })();
            try {
                return await resolving;
            } finally {
                resolving = null;
            }
        }

        async function nextCandidate(forceResolve = false) {
            if (finished) return;
            index += 1;

            if (index >= candidates.length && (!fullResolved || forceResolve)) {
                await ensureFullCandidates();
            }

            if (index >= candidates.length) {
                exhaust();
                return;
            }

            img.style.visibility = 'hidden';
            img.src = candidates[index];
        }

        img.addEventListener('error', () => {
            void nextCandidate(true);
        });

        img.addEventListener('load', () => {
            if (finished) return;
            if (
                img.naturalWidth > 0 &&
                img.naturalHeight > 0 &&
                (img.naturalWidth < MIN_VALID_IMAGE_SIZE || img.naturalHeight < MIN_VALID_IMAGE_SIZE)
            ) {
                void nextCandidate(true);
                return;
            }
            img.style.visibility = 'visible';
        });

        if (initial.length) {
            index = 0;
            img.src = initial[0];
            if (!resolveOnErrorOnly) void ensureFullCandidates();
        } else {
            index = -1;
            void nextCandidate(true);
        }

        return Promise.resolve(candidates);
    }

    function clearCache() {
        resolutionCache.clear();
        detailHtmlCache.clear();
        marcCache.clear();
    }

    window.PMKCoverResolver = Object.freeze({
        version: VERSION,
        maxConcurrency: MAX_CONCURRENCY,
        resolveCandidates,
        bindImage,
        uniqueCandidates: uniqueCoverCandidates,
        fetchMarcForBiblio,
        clearCache,
        stats() {
            return {
                resolutionCache: resolutionCache.size,
                detailHtmlCache: detailHtmlCache.size,
                marcCache: marcCache.size,
                activeJobs,
                pendingJobs: pendingJobs.length
            };
        }
    });

    try {
        window.dispatchEvent(new CustomEvent('pmk:cover-resolver-ready', {
            detail: { version: VERSION }
        }));
    } catch (_) {}
})(window, document);

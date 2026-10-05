/*
 Nom du fichier : 070-address-autocomplete-memberentry.js
 Version : 3.1.1
 Date : 2026-09-19
 Auteur : Michael Mundet / consolidation PimpMyKoha

 Module PimpMyKoha : 070 — Autocomplétion des adresses

 Fonction :
   - ajoute une autocomplétion d'adresse sur members/memberentry.pl ;
   - utilise l'API d'autocomplétion de la Géoplateforme ;
   - peut favoriser les résultats proches d'une ville de référence sans exclure
     les autres résultats ;
   - l'utilisateur ne saisit jamais de coordonnées : la ville de référence est
     résolue automatiquement puis mise en cache localement ;
   - remplit l'adresse, le code postal et la ville ;
   - restaure les adresses complètes numérotées : le numéro (bis/ter compris)
     est conservé dans le champ Adresse comme dans le script historique ;
   - l'adresse principale est active par défaut ;
   - l'adresse secondaire Koha peut être activée séparément ;
   - la saisie manuelle Koha reste toujours possible ;
   - navigation clavier, annulation des requêtes obsolètes et comportement fail-safe.

 API :
   https://data.geopf.fr/geocodage/completion/
*/
(function () {
    'use strict';

    var MODULE_ID = '070';
    var PAGE_PATH = '/cgi-bin/koha/members/memberentry.pl';
    var STYLE_ID = 'pmk070-address-autocomplete-style';
    var CACHE_KEY = 'PimpMyKoha.070.referencePlace.v1';
    var API_URL = 'https://data.geopf.fr/geocodage/completion/';

    var DEFAULT_CONFIG = {
        enabled: true,
        page: {
            enabled: true,
            pageId: 'members.memberentry',
            path: PAGE_PATH
        },
        addresses: {
            primary: {
                enabled: true,
                addressSelector: '#address, input[name="address"]',
                zipcodeSelector: '#zipcode, input[name="zipcode"]',
                citySelector: '#city, input[name="city"]'
            },
            secondary: {
                enabled: false,
                addressSelector: '#B_address, input[name="B_address"]',
                zipcodeSelector: '#B_zipcode, input[name="B_zipcode"]',
                citySelector: '#B_city, input[name="B_city"]'
            }
        },
        search: {
            minChars: 3,
            debounceMs: 300,
            maxResults: 6,
            requestTimeoutMs: 6000
        },
        geoBias: {
            enabled: true,
            referenceCity: 'Draguignan',
            referencePostalCode: '83300',
            cacheDays: 30
        }
    };

    var currentConfig = clone(DEFAULT_CONFIG);
    var unsubscribe = null;
    var pmkInitialized = false;
    var mounted = [];
    var referencePromise = null;
    var referencePromiseKey = '';
    var queryCache = new Map();

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function isObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function deepMerge(base, extra) {
        if (Array.isArray(base)) return Array.isArray(extra) ? clone(extra) : clone(base);
        if (!isObject(base)) return extra === undefined ? clone(base) : clone(extra);
        var out = clone(base);
        if (!isObject(extra)) return out;
        Object.keys(extra).forEach(function (key) {
            if (Array.isArray(extra[key])) out[key] = clone(extra[key]);
            else if (isObject(extra[key]) && isObject(out[key])) out[key] = deepMerge(out[key], extra[key]);
            else if (extra[key] !== undefined) out[key] = clone(extra[key]);
        });
        return out;
    }

    function clampInt(value, fallback, min, max) {
        var number = Number(value);
        if (!Number.isFinite(number)) number = fallback;
        number = Math.round(number);
        return Math.min(max, Math.max(min, number));
    }

    function cleanText(value) {
        return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    }

    function normalizeText(value) {
        return cleanText(value)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    function normalizeConfig(config) {
        var cfg = deepMerge(DEFAULT_CONFIG, isObject(config) ? config : {});
        cfg.enabled = cfg.enabled !== false;
        cfg.page = deepMerge(DEFAULT_CONFIG.page, cfg.page || {});
        cfg.page.enabled = cfg.page.enabled !== false;
        cfg.page.pageId = DEFAULT_CONFIG.page.pageId;
        cfg.page.path = PAGE_PATH;

        cfg.addresses = deepMerge(DEFAULT_CONFIG.addresses, cfg.addresses || {});
        cfg.addresses.primary.enabled = cfg.addresses.primary.enabled !== false;
        cfg.addresses.secondary.enabled = cfg.addresses.secondary.enabled === true;

        cfg.search = deepMerge(DEFAULT_CONFIG.search, cfg.search || {});
        cfg.search.minChars = clampInt(cfg.search.minChars, 3, 2, 8);
        cfg.search.debounceMs = clampInt(cfg.search.debounceMs, 300, 150, 1500);
        cfg.search.maxResults = clampInt(cfg.search.maxResults, 6, 1, 15);
        cfg.search.requestTimeoutMs = clampInt(cfg.search.requestTimeoutMs, 6000, 1500, 20000);

        cfg.geoBias = deepMerge(DEFAULT_CONFIG.geoBias, cfg.geoBias || {});
        cfg.geoBias.enabled = cfg.geoBias.enabled !== false;
        cfg.geoBias.referenceCity = cleanText(cfg.geoBias.referenceCity);
        cfg.geoBias.referencePostalCode = cleanText(cfg.geoBias.referencePostalCode).replace(/[^0-9A-Za-z-]/g, '');
        cfg.geoBias.cacheDays = clampInt(cfg.geoBias.cacheDays, 30, 1, 365);
        return cfg;
    }

    function language() {
        var lang = String(document.documentElement.lang || '').toLowerCase();
        return lang.indexOf('en') === 0 ? 'en' : 'fr';
    }

    function t(fr, en) {
        return language() === 'en' ? en : fr;
    }

    function safeStorageGet(key) {
        try { return window.localStorage.getItem(key); }
        catch (_) { return null; }
    }

    function safeStorageSet(key, value) {
        try {
            window.localStorage.setItem(key, value);
            return true;
        } catch (_) {
            return false;
        }
    }

    function safeJsonParse(value, fallback) {
        try { return JSON.parse(value); }
        catch (_) { return fallback; }
    }

    function dispatchValue(input, value) {
        if (!input) return;
        input.value = value == null ? '' : String(value);
        try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
        try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
    }

    function firstElement(selector) {
        if (!selector) return null;
        try { return document.querySelector(selector); }
        catch (_) { return null; }
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.pmk070-autocomplete-host{position:relative;}',
            '.pmk070-suggestions{position:absolute;z-index:1055;display:none;box-sizing:border-box;min-width:260px;max-width:min(620px,calc(100vw - 32px));max-height:280px;overflow:auto;margin-top:2px;padding:3px;background:#fff;border:1px solid #b7c2cc;border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,.14);}',
            '.pmk070-suggestions[aria-hidden="false"]{display:block;}',
            '.pmk070-option{display:block;width:100%;margin:0;padding:7px 9px;border:0;border-radius:3px;background:transparent;color:inherit;text-align:left;line-height:1.3;cursor:pointer;}',
            '.pmk070-option:hover,.pmk070-option[aria-selected="true"]{background:#eef4f7;}',
            '.pmk070-option-main{display:block;font-weight:600;}',
            '.pmk070-option-meta{display:block;margin-top:1px;color:#687078;font-size:.86em;}',
            '.pmk070-message{padding:7px 9px;color:#687078;font-size:.9em;}',
            '.pmk070-message.pmk070-error{color:#8a4b08;}',
            '@media (max-width:767px){.pmk070-suggestions{max-width:calc(100vw - 24px);}}'
        ].join('\n');
        (document.head || document.documentElement).appendChild(style);
    }

    function requestJson(url, signal, timeoutMs) {
        var timeoutController = null;
        var timeoutId = null;
        var finalSignal = signal || null;

        if (!signal && typeof AbortController !== 'undefined') {
            timeoutController = new AbortController();
            finalSignal = timeoutController.signal;
        }
        if (timeoutController) {
            timeoutId = window.setTimeout(function () {
                try { timeoutController.abort(); } catch (_) {}
            }, timeoutMs);
        }

        return fetch(url, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            headers: { 'Accept': 'application/json' },
            signal: finalSignal || undefined
        }).then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        }).finally(function () {
            if (timeoutId) window.clearTimeout(timeoutId);
        });
    }

    function buildUrl(params) {
        var search = new URLSearchParams();
        Object.keys(params || {}).forEach(function (key) {
            var value = params[key];
            if (value === undefined || value === null || value === '') return;
            search.set(key, String(value));
        });
        return API_URL + '?' + search.toString();
    }

    function numericCoordinate(value) {
        var n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function isCommuneLike(result) {
        var kind = normalizeText(result && result.kind);
        var poiTypes = Array.isArray(result && result.poiType)
            ? result.poiType.map(normalizeText)
            : [normalizeText(result && result.poiType)];
        return kind === 'commune'
            || kind === 'municipality'
            || poiTypes.indexOf('commune') !== -1
            || poiTypes.indexOf('administratif') !== -1;
    }

    function resultPostcodes(result) {
        var out = [];
        if (result && result.zipcode) out.push(String(result.zipcode));
        if (Array.isArray(result && result.zipcodes)) {
            result.zipcodes.forEach(function (value) { out.push(String(value)); });
        }
        return Array.from(new Set(out.filter(Boolean)));
    }

    function scoreReferenceResult(result, wantedCity, wantedPostalCode) {
        if (!result) return -Infinity;
        var x = numericCoordinate(result.x);
        var y = numericCoordinate(result.y);
        if (x === null || y === null) return -Infinity;

        var wanted = normalizeText(wantedCity);
        var city = normalizeText(result.city);
        var street = normalizeText(result.street);
        var fulltext = normalizeText(result.fulltext);
        var names = Array.isArray(result.names) ? result.names.map(normalizeText) : [];
        var score = 0;

        if (wanted && city === wanted) score += 120;
        if (wanted && names.indexOf(wanted) !== -1) score += 110;
        if (wanted && street === wanted) score += 70;
        if (wanted && fulltext.indexOf(wanted) === 0) score += 45;
        if (isCommuneLike(result)) score += 55;

        if (wantedPostalCode) {
            var postcodes = resultPostcodes(result);
            if (postcodes.indexOf(String(wantedPostalCode)) !== -1) score += 150;
            else score -= 25;
        }

        var classification = Number(result.classification);
        if (Number.isFinite(classification)) score += Math.max(0, 12 - classification);
        return score;
    }

    function referenceCacheKey(cfg) {
        return normalizeText(cfg.geoBias.referenceCity) + '|' + String(cfg.geoBias.referencePostalCode || '').toLowerCase();
    }

    function readReferenceCache(cfg) {
        var raw = safeJsonParse(safeStorageGet(CACHE_KEY), null);
        if (!raw || raw.key !== referenceCacheKey(cfg)) return null;
        if (!Number.isFinite(Number(raw.x)) || !Number.isFinite(Number(raw.y))) return null;
        var maxAge = cfg.geoBias.cacheDays * 86400000;
        if (!Number.isFinite(Number(raw.savedAt)) || Date.now() - Number(raw.savedAt) > maxAge) return null;
        return {
            x: Number(raw.x),
            y: Number(raw.y),
            label: cleanText(raw.label),
            city: cleanText(raw.city),
            zipcode: cleanText(raw.zipcode)
        };
    }

    function writeReferenceCache(cfg, result) {
        if (!result) return;
        safeStorageSet(CACHE_KEY, JSON.stringify({
            key: referenceCacheKey(cfg),
            savedAt: Date.now(),
            x: result.x,
            y: result.y,
            label: result.label || '',
            city: result.city || '',
            zipcode: result.zipcode || ''
        }));
    }

    function resolveReferencePlace(cfg) {
        if (!cfg.geoBias.enabled || !cfg.geoBias.referenceCity) return Promise.resolve(null);

        var cached = readReferenceCache(cfg);
        if (cached) return Promise.resolve(cached);

        var key = referenceCacheKey(cfg);
        if (referencePromise && referencePromiseKey === key) return referencePromise;
        referencePromiseKey = key;

        var text = cfg.geoBias.referenceCity;
        if (cfg.geoBias.referencePostalCode) text += ' ' + cfg.geoBias.referencePostalCode;

        var url = buildUrl({
            text: text,
            type: 'PositionOfInterest,StreetAddress',
            poiType: 'administratif',
            maximumResponses: 15
        });

        referencePromise = requestJson(url, null, cfg.search.requestTimeoutMs)
            .then(function (data) {
                var results = Array.isArray(data && data.results) ? data.results : [];
                var best = null;
                var bestScore = -Infinity;
                results.forEach(function (result) {
                    var score = scoreReferenceResult(
                        result,
                        cfg.geoBias.referenceCity,
                        cfg.geoBias.referencePostalCode
                    );
                    if (score > bestScore) {
                        bestScore = score;
                        best = result;
                    }
                });

                if (!best) return null;
                var resolved = {
                    x: Number(best.x),
                    y: Number(best.y),
                    label: cleanText(best.fulltext || [best.city, best.zipcode].filter(Boolean).join(' ')),
                    city: cleanText(best.city || cfg.geoBias.referenceCity),
                    zipcode: cleanText(best.zipcode || cfg.geoBias.referencePostalCode)
                };
                writeReferenceCache(cfg, resolved);
                return resolved;
            })
            .catch(function () { return null; })
            .finally(function () {
                referencePromise = null;
                referencePromiseKey = '';
            });

        return referencePromise;
    }

    function extractAddressPartFromFulltext(result) {
        var full = cleanText(result && result.fulltext);
        if (!full) return '';

        var city = cleanText(result && result.city);
        var zipcode = cleanText(result && result.zipcode);
        var suffix = cleanText([zipcode, city].filter(Boolean).join(' '));

        if (suffix) {
            var escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            var suffixRegex = new RegExp('(?:,\\s*|\\s+)' + escaped + '$', 'i');
            var withoutSuffix = cleanText(full.replace(suffixRegex, ''));
            if (withoutSuffix && withoutSuffix !== full) return withoutSuffix;
        }

        // Fallback pour les réponses où CP/ville ne sont pas exposés dans
        // des propriétés distinctes mais restent présents à la fin de fulltext.
        var generic = full.match(/^(.*?)(?:,\s*|\s+)(?:[0-9]{5})\s+.+$/);
        if (generic && generic[1]) return cleanText(generic[1]);

        return full;
    }

    function houseNumberFromAddress(value) {
        var text = cleanText(value);
        if (!text) return '';
        var match = text.match(/^(\d{1,6}(?:\s*(?:bis|ter|quater|quinquies|[A-Za-z]))?)\b/i);
        return match ? cleanText(match[1]) : '';
    }

    function resultHouseNumber(result) {
        var direct = cleanText(result && (result.number || result.housenumber));
        if (direct) return direct;
        return houseNumberFromAddress(extractAddressPartFromFulltext(result));
    }

    function addressFromResult(result) {
        var fullAddress = extractAddressPartFromFulltext(result);
        var number = resultHouseNumber(result);
        var street = cleanText(result && result.street);

        /*
         * Restauration du comportement historique du 070 : une adresse
         * numérotée reste numérotée dans le champ Koha Adresse.
         *
         * La Géoplateforme peut fournir le numéro uniquement dans fulltext
         * alors que street ne contient que le nom de voie. On privilégie donc
         * le morceau d'adresse complet lorsque celui-ci commence par un numéro.
         */
        if (fullAddress && houseNumberFromAddress(fullAddress)) return fullAddress;

        if (street) return cleanText([number, street].filter(Boolean).join(' '));
        if (fullAddress) return fullAddress;
        return '';
    }

    function queryHouseNumber(query) {
        return houseNumberFromAddress(query);
    }

    function rankNumberedResults(results, query) {
        var wantedNumber = normalizeText(queryHouseNumber(query));
        return (results || []).map(function (result, index) {
            var resultNumber = normalizeText(resultHouseNumber(result));
            var bucket = 2;

            if (wantedNumber) {
                if (resultNumber === wantedNumber) bucket = 0;
                else if (resultNumber) bucket = 1;
                else bucket = 3;
            } else {
                // Sans numéro saisi, on conserve l'ordre de proximité du
                // service. Les adresses numérotées ne sont pas artificiellement
                // remontées devant une voie pertinente.
                bucket = 0;
            }

            return { result: result, index: index, bucket: bucket };
        }).sort(function (a, b) {
            return a.bucket - b.bucket || a.index - b.index;
        }).map(function (entry) { return entry.result; });
    }

    function displayLabel(result) {
        var full = cleanText(result && result.fulltext);
        if (full) return full;
        return cleanText([
            addressFromResult(result),
            result && result.zipcode,
            result && result.city
        ].filter(Boolean).join(' '));
    }

    function uniqueResults(results, maxResults) {
        var seen = Object.create(null);
        var out = [];
        (results || []).forEach(function (result) {
            if (!result || out.length >= maxResults) return;
            var label = displayLabel(result);
            if (!label) return;
            var key = normalizeText(label);
            if (!key || seen[key]) return;
            seen[key] = true;
            out.push(result);
        });
        return out;
    }

    function cacheQuery(key, results) {
        queryCache.set(key, results);
        while (queryCache.size > 60) {
            var firstKey = queryCache.keys().next().value;
            queryCache.delete(firstKey);
        }
    }

    function fetchAddressSuggestions(query, cfg, signal) {
        return resolveReferencePlace(cfg).then(function (reference) {
            var cacheKey = normalizeText(query) + '|' + (reference ? reference.x + ',' + reference.y : '') + '|' + cfg.search.maxResults;
            if (queryCache.has(cacheKey)) return clone(queryCache.get(cacheKey));

            var wantedNumber = queryHouseNumber(query);
            // L'API Géoplateforme accepte maximum 15 réponses.
            // Avec 6 résultats configurés, l'ancienne formule demandait 18
            // et provoquait une réponse HTTP 400 sur les recherches numérotées.
            var requestedMaximum = wantedNumber
                ? Math.min(15, Math.max(cfg.search.maxResults, cfg.search.maxResults * 3))
                : Math.min(15, cfg.search.maxResults);

            var params = {
                text: query,
                type: 'StreetAddress',
                maximumResponses: requestedMaximum
            };
            if (reference) params.lonlat = reference.x + ',' + reference.y;

            return requestJson(buildUrl(params), signal, cfg.search.requestTimeoutMs)
                .then(function (data) {
                    var raw = Array.isArray(data && data.results) ? data.results : [];
                    var ranked = rankNumberedResults(raw, query);

                    /*
                     * Si l'utilisateur a commencé par un numéro, on évite qu'une
                     * simple voie sans numéro remplace sa saisie. On conserve en
                     * priorité les réponses réellement numérotées. S'il n'y en a
                     * aucune, les résultats du service restent affichés afin de
                     * ne jamais bloquer la saisie manuelle.
                     */
                    if (wantedNumber) {
                        var numbered = ranked.filter(function (result) {
                            return Boolean(resultHouseNumber(result));
                        });
                        if (numbered.length) ranked = numbered;
                    }

                    var results = uniqueResults(ranked, cfg.search.maxResults);
                    cacheQuery(cacheKey, results);
                    return clone(results);
                });
        });
    }

    function setListGeometry(instance) {
        if (!instance || !instance.input || !instance.list) return;
        var input = instance.input;
        var list = instance.list;
        var parent = input.parentElement;
        if (!parent) return;

        var parentRect = parent.getBoundingClientRect();
        var inputRect = input.getBoundingClientRect();
        list.style.left = Math.max(0, inputRect.left - parentRect.left) + 'px';
        list.style.top = (inputRect.bottom - parentRect.top + 2) + 'px';
        list.style.width = Math.max(260, inputRect.width) + 'px';
    }

    function closeList(instance) {
        if (!instance || !instance.list) return;
        instance.results = [];
        instance.activeIndex = -1;
        instance.list.innerHTML = '';
        instance.list.setAttribute('aria-hidden', 'true');
        instance.input.setAttribute('aria-expanded', 'false');
        instance.input.removeAttribute('aria-activedescendant');
    }

    function renderMessage(instance, message, error) {
        instance.results = [];
        instance.activeIndex = -1;
        instance.list.innerHTML = '';
        var div = document.createElement('div');
        div.className = 'pmk070-message' + (error ? ' pmk070-error' : '');
        div.textContent = message;
        instance.list.appendChild(div);
        setListGeometry(instance);
        instance.list.setAttribute('aria-hidden', 'false');
        instance.input.setAttribute('aria-expanded', 'true');
    }

    function selectResult(instance, result) {
        if (!instance || !result) return;
        var address = addressFromResult(result);
        var city = cleanText(result.city);
        var zipcode = cleanText(result.zipcode);

        if (address) dispatchValue(instance.input, address);
        if (city && instance.cityInput) dispatchValue(instance.cityInput, city);
        if (zipcode && instance.zipcodeInput) dispatchValue(instance.zipcodeInput, zipcode);
        closeList(instance);
        try { instance.input.focus({ preventScroll: true }); } catch (_) { instance.input.focus(); }
    }

    function updateActiveOption(instance, nextIndex) {
        var buttons = instance.list.querySelectorAll('.pmk070-option');
        if (!buttons.length) return;
        var count = buttons.length;
        nextIndex = ((nextIndex % count) + count) % count;
        instance.activeIndex = nextIndex;
        buttons.forEach(function (button, index) {
            var selected = index === nextIndex;
            button.setAttribute('aria-selected', selected ? 'true' : 'false');
            if (selected) {
                instance.input.setAttribute('aria-activedescendant', button.id);
                try { button.scrollIntoView({ block: 'nearest' }); } catch (_) {}
            }
        });
    }

    function renderResults(instance, results) {
        instance.results = results;
        instance.activeIndex = -1;
        instance.list.innerHTML = '';

        if (!results.length) {
            renderMessage(instance, t('Aucune adresse trouvée.', 'No address found.'), false);
            return;
        }

        results.forEach(function (result, index) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'pmk070-option';
            button.id = instance.id + '-option-' + index;
            button.setAttribute('role', 'option');
            button.setAttribute('aria-selected', 'false');

            var main = document.createElement('span');
            main.className = 'pmk070-option-main';
            main.textContent = addressFromResult(result) || displayLabel(result);
            button.appendChild(main);

            var locality = cleanText([result.zipcode, result.city].filter(Boolean).join(' '));
            if (locality) {
                var meta = document.createElement('span');
                meta.className = 'pmk070-option-meta';
                meta.textContent = locality;
                button.appendChild(meta);
            }

            button.addEventListener('mousedown', function (event) {
                event.preventDefault();
            });
            button.addEventListener('click', function () {
                selectResult(instance, result);
            });
            instance.list.appendChild(button);
        });

        setListGeometry(instance);
        instance.list.setAttribute('aria-hidden', 'false');
        instance.input.setAttribute('aria-expanded', 'true');
    }

    function destroyInstance(instance) {
        if (!instance) return;
        if (instance.timer) window.clearTimeout(instance.timer);
        if (instance.requestTimeoutTimer) window.clearTimeout(instance.requestTimeoutTimer);
        if (instance.controller) {
            try { instance.controller.abort(); } catch (_) {}
        }
        (instance.listeners || []).forEach(function (entry) {
            try { entry.target.removeEventListener(entry.type, entry.handler, entry.options); } catch (_) {}
        });
        if (instance.list && instance.list.parentNode) instance.list.parentNode.removeChild(instance.list);
        if (instance.input) {
            instance.input.removeAttribute('aria-autocomplete');
            instance.input.removeAttribute('aria-controls');
            instance.input.removeAttribute('aria-expanded');
            instance.input.removeAttribute('aria-activedescendant');
            instance.input.removeAttribute('data-pmk070-mounted');
            if (instance.previousAutocomplete === null) instance.input.removeAttribute('autocomplete');
            else instance.input.setAttribute('autocomplete', instance.previousAutocomplete);
        }
        if (instance.host && instance.host.getAttribute('data-pmk070-host') === '1') {
            instance.host.removeAttribute('data-pmk070-host');
            instance.host.classList.remove('pmk070-autocomplete-host');
        }
    }

    function destroyAll() {
        mounted.forEach(destroyInstance);
        mounted = [];
    }

    function addListener(instance, target, type, handler, options) {
        target.addEventListener(type, handler, options);
        instance.listeners.push({ target: target, type: type, handler: handler, options: options });
    }

    function mountField(kind, fieldConfig, cfg) {
        if (!fieldConfig || fieldConfig.enabled !== true) return null;
        var input = firstElement(fieldConfig.addressSelector);
        if (!input || input.getAttribute('data-pmk070-mounted') === '1') return null;

        var zipcodeInput = firstElement(fieldConfig.zipcodeSelector);
        var cityInput = firstElement(fieldConfig.citySelector);
        var host = input.parentElement;
        if (!host) return null;

        ensureStyle();
        host.classList.add('pmk070-autocomplete-host');
        host.setAttribute('data-pmk070-host', '1');

        var id = 'pmk070-' + kind + '-' + Math.random().toString(36).slice(2, 9);
        var list = document.createElement('div');
        list.id = id + '-list';
        list.className = 'pmk070-suggestions';
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-hidden', 'true');
        host.appendChild(list);

        var previousAutocomplete = input.hasAttribute('autocomplete') ? input.getAttribute('autocomplete') : null;
        input.setAttribute('data-pmk070-mounted', '1');
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-controls', list.id);
        input.setAttribute('aria-expanded', 'false');

        var instance = {
            id: id,
            kind: kind,
            input: input,
            zipcodeInput: zipcodeInput,
            cityInput: cityInput,
            host: host,
            list: list,
            results: [],
            activeIndex: -1,
            timer: null,
            controller: null,
            requestTimeoutTimer: null,
            requestSerial: 0,
            previousAutocomplete: previousAutocomplete,
            listeners: []
        };

        function performSearch(query) {
            if (instance.controller) {
                try { instance.controller.abort(); } catch (_) {}
            }
            if (instance.requestTimeoutTimer) {
                window.clearTimeout(instance.requestTimeoutTimer);
                instance.requestTimeoutTimer = null;
            }
            instance.controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            var signal = instance.controller ? instance.controller.signal : null;
            var serial = ++instance.requestSerial;

            if (instance.controller && cfg.search.requestTimeoutMs > 0) {
                instance.requestTimeoutTimer = window.setTimeout(function () {
                    try { instance.controller.abort(); } catch (_) {}
                }, cfg.search.requestTimeoutMs);
            }

            fetchAddressSuggestions(query, cfg, signal)
                .then(function (results) {
                    if (serial !== instance.requestSerial) return;
                    renderResults(instance, results);
                })
                .catch(function (error) {
                    if (serial !== instance.requestSerial) return;
                    if (error && error.name === 'AbortError') {
                        renderMessage(
                            instance,
                            t('La recherche a pris trop de temps — saisie manuelle possible.', 'The search took too long — manual entry remains available.'),
                            true
                        );
                        return;
                    }
                    renderMessage(
                        instance,
                        t('Service d’adresses indisponible — saisie manuelle possible.', 'Address service unavailable — manual entry remains available.'),
                        true
                    );
                })
                .finally(function () {
                    if (serial === instance.requestSerial && instance.requestTimeoutTimer) {
                        window.clearTimeout(instance.requestTimeoutTimer);
                        instance.requestTimeoutTimer = null;
                    }
                });
        }

        addListener(instance, input, 'input', function () {
            if (instance.timer) window.clearTimeout(instance.timer);
            var query = cleanText(input.value);
            if (query.length < cfg.search.minChars) {
                closeList(instance);
                return;
            }
            instance.timer = window.setTimeout(function () {
                performSearch(query);
            }, cfg.search.debounceMs);
        });

        addListener(instance, input, 'keydown', function (event) {
            var open = instance.list.getAttribute('aria-hidden') === 'false';
            if (!open) return;

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                updateActiveOption(instance, instance.activeIndex + 1);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                updateActiveOption(instance, instance.activeIndex <= 0 ? instance.results.length - 1 : instance.activeIndex - 1);
            } else if (event.key === 'Enter') {
                if (instance.activeIndex >= 0 && instance.results[instance.activeIndex]) {
                    event.preventDefault();
                    selectResult(instance, instance.results[instance.activeIndex]);
                }
            } else if (event.key === 'Escape') {
                event.preventDefault();
                closeList(instance);
            } else if (event.key === 'Tab') {
                closeList(instance);
            }
        });

        addListener(instance, input, 'focus', function () {
            if (instance.results.length) {
                setListGeometry(instance);
                instance.list.setAttribute('aria-hidden', 'false');
                input.setAttribute('aria-expanded', 'true');
            }
        });

        addListener(instance, document, 'mousedown', function (event) {
            if (event.target === input || list.contains(event.target)) return;
            closeList(instance);
        }, true);

        addListener(instance, window, 'resize', function () {
            if (instance.list.getAttribute('aria-hidden') === 'false') setListGeometry(instance);
        });

        return instance;
    }

    function mountContextButton() {
        if (!window.PMKConfig || typeof window.PMKConfig.mountContextButton !== 'function') return;
        var input = firstElement(currentConfig.addresses.primary.addressSelector);
        if (!input) return;
        var anchor = input.parentElement || input;
        try {
            window.PMKConfig.mountContextButton({
                moduleId: MODULE_ID,
                anchor: anchor,
                position: 'append',
                contextKey: 'member-address-autocomplete',
                context: {
                    pageId: 'members.memberentry',
                    sectionId: 'geography'
                }
            });
        } catch (_) {}
    }

    function render() {
        destroyAll();
        if (window.location.pathname !== PAGE_PATH) return;
        if (!currentConfig.enabled || !currentConfig.page.enabled) return;

        if (currentConfig.addresses.primary.enabled) {
            var primary = mountField('primary', currentConfig.addresses.primary, currentConfig);
            if (primary) mounted.push(primary);
        }
        if (currentConfig.addresses.secondary.enabled) {
            var secondary = mountField('secondary', currentConfig.addresses.secondary, currentConfig);
            if (secondary) mounted.push(secondary);
        }

        if (currentConfig.geoBias.enabled && currentConfig.geoBias.referenceCity) {
            resolveReferencePlace(currentConfig).catch(function () {});
        }

        mountContextButton();
    }

    async function initializePmk() {
        if (pmkInitialized || !window.PMKConfig) return;
        pmkInitialized = true;

        try {
            var cfg = await window.PMKConfig.getConfig(MODULE_ID);
            currentConfig = normalizeConfig(deepMerge(DEFAULT_CONFIG, cfg || {}));
        } catch (_) {
            currentConfig = normalizeConfig(DEFAULT_CONFIG);
        }

        if (typeof window.PMKConfig.subscribe === 'function') {
            try {
                unsubscribe = window.PMKConfig.subscribe(MODULE_ID, function (cfg) {
                    currentConfig = normalizeConfig(deepMerge(DEFAULT_CONFIG, cfg || {}));
                    referencePromise = null;
                    referencePromiseKey = '';
                    queryCache.clear();
                    render();
                });
            } catch (_) {}
        }

        render();
    }

    function start() {
        currentConfig = normalizeConfig(DEFAULT_CONFIG);
        render();

        if (window.PMKConfig) initializePmk();
        else window.addEventListener('pmk:config-ready', initializePmk, { once: true });
    }

    window.PMK070 = {
        moduleId: MODULE_ID,
        version: '3.1.0',
        defaults: clone(DEFAULT_CONFIG),
        getConfig: function () { return clone(currentConfig); },
        resolveReferencePlace: function () { return resolveReferencePlace(currentConfig); },
        render: render,
        destroy: function () {
            destroyAll();
            if (typeof unsubscribe === 'function') {
                try { unsubscribe(); } catch (_) {}
                unsubscribe = null;
            }
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();

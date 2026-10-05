(function () {
    'use strict';

    if (window.__KOHA_GUIDES_CORE_V2__) return;
    window.__KOHA_GUIDES_CORE_V2__ = true;

    const VERSION = '2.0.4';
    const STATE_KEY = 'koha.guides.practice.v2';
    const DEFAULT_TTL = 2 * 60 * 60 * 1000;
    const INTRO_JS = 'https://cdn.jsdelivr.net/npm/intro.js@6.0.0/intro.min.js';
    const INTRO_CSS = 'https://cdn.jsdelivr.net/npm/intro.js@6.0.0/introjs.min.css';

    const registry = [];
    const previousApi = window.KOHA_GUIDES;

    let activeIntro = null;
    let runtime = null;
    let resumeTimer = null;
    let assetsPromise = null;

    function now() {
        return Date.now();
    }

    function qs(selector, root) {
        if (!selector) return null;
        if (selector instanceof Element || selector === document || selector === window) return selector;
        if (typeof selector === 'function') {
            try { return selector(); } catch (_) { return null; }
        }
        try { return (root || document).querySelector(selector); } catch (_) { return null; }
    }

    function qsa(selector, root) {
        if (!selector) return [];
        try { return Array.from((root || document).querySelectorAll(selector)); } catch (_) { return []; }
    }

    function visible(el) {
        if (!el || !(el instanceof Element)) return false;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    }

    function text(v) {
        return String(v == null ? '' : v);
    }

    function esc(v) {
        return text(v)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function resolveValue(v, context) {
        if (typeof v === 'function') {
            try { return v(context || buildContext()); } catch (e) { return ''; }
        }
        return v;
    }

    function buildContext() {
        const state = loadState();
        return {
            api,
            state,
            path: location.pathname,
            search: location.search,
            url: location.href,
            bodyId: document.body ? document.body.id : '',
            qs,
            qsa,
            visible,
            esc
        };
    }

    function addStyle() {
        if (document.getElementById('koha-guides-v2-style')) return;
        const style = document.createElement('style');
        style.id = 'koha-guides-v2-style';
        style.textContent = `
            .kg-choice-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px}
            .kg-choice{width:min(680px,100%);background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.25);padding:22px;color:#222}
            .kg-choice h2{margin:0 0 8px;font-size:22px}.kg-choice p{margin:0 0 18px;color:#555}
            .kg-choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
            .kg-choice button{width:100%;text-align:left;border:1px solid #d7d7d7;border-radius:10px;background:#fff;padding:16px;cursor:pointer}
            .kg-choice button:hover,.kg-choice button:focus{border-color:#6b8e23;outline:2px solid rgba(107,142,35,.15)}
            .kg-choice strong{display:block;font-size:16px;margin-bottom:5px}.kg-choice small{display:block;color:#666;line-height:1.4}
            .kg-choice-close{margin-top:14px!important;width:auto!important;padding:7px 12px!important}
            .introjs-tooltip.kg-practice-tooltip{min-width:330px;max-width:470px;box-sizing:border-box}
            .introjs-tooltip.kg-practice-tooltip .introjs-skipbutton{width:auto!important;height:auto!important;min-width:0!important;line-height:1.2!important;top:7px!important;right:7px!important;padding:4px 7px!important;margin:0!important;font-size:11px!important;font-weight:600!important;border:1px solid #d5d5d5!important;border-radius:5px!important;background:#fff!important;color:#666!important;text-decoration:none!important;box-shadow:none!important}
            .introjs-tooltip.kg-practice-tooltip .introjs-skipbutton:hover,.introjs-tooltip.kg-practice-tooltip .introjs-skipbutton:focus{background:#f3f3f3!important;color:#333!important;border-color:#bdbdbd!important}
            .kg-practice-head{display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#4f6f18}
            .kg-practice-dot{width:9px;height:9px;border-radius:50%;background:#6b8e23;display:inline-block}
            .kg-practice-status{margin-top:12px;padding:9px 10px;border-radius:7px;background:#f5f7f2;color:#445;font-size:13px;line-height:1.35}
            .kg-practice-status.is-ok{background:#edf7ea;color:#245d1b}.kg-practice-status.is-error{background:#fff0f0;color:#8a1f1f}
            .kg-current-btn,.kg-return-btn{margin-top:10px!important;border:1px solid #6b8e23!important;background:#fff!important;color:#35510d!important;padding:7px 11px!important;border-radius:6px!important}
            .kg-summary{display:grid;gap:5px;margin-top:8px}.kg-summary div{display:grid;grid-template-columns:145px 1fr;gap:10px}.kg-summary b{color:#444}
            .kg-danger{border-left:4px solid #b44;padding-left:10px;margin-top:10px}.kg-success{border-left:4px solid #4b8c2a;padding-left:10px;margin-top:10px}
            .kg-inline-link{display:inline-block;margin-top:10px}
            @media(max-width:640px){.kg-choice-grid{grid-template-columns:1fr}.introjs-tooltip.kg-practice-tooltip{min-width:0;max-width:calc(100vw - 30px)}}
        `;
        document.head.appendChild(style);
    }

    function loadIntroAssets() {
        if (typeof window.introJs === 'function') return Promise.resolve();
        if (assetsPromise) return assetsPromise;

        assetsPromise = new Promise((resolve, reject) => {
            if (!document.querySelector('link[data-koha-guides-introcss]')) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = INTRO_CSS;
                link.dataset.kohaGuidesIntrocss = '1';
                document.head.appendChild(link);
            }

            const existing = document.querySelector('script[data-koha-guides-introjs]');
            if (existing) {
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', reject, { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = INTRO_JS;
            script.async = true;
            script.dataset.kohaGuidesIntrojs = '1';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Impossible de charger Intro.js'));
            document.head.appendChild(script);
        });

        return assetsPromise;
    }

    function safeParse(raw) {
        try { return JSON.parse(raw); } catch (_) { return null; }
    }

    function loadState() {
        const state = safeParse(sessionStorage.getItem(STATE_KEY));
        if (!state) return null;
        const ttl = Number(state.ttl || DEFAULT_TTL);
        const t = Number(state.updatedAt || state.startedAt || 0);
        if (!t || now() - t > ttl) {
            sessionStorage.removeItem(STATE_KEY);
            return null;
        }
        return state;
    }

    function saveState(state) {
        state.updatedAt = now();
        sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
        return state;
    }

    function clearState() {
        sessionStorage.removeItem(STATE_KEY);
    }

    function normalizeDefinition(arg1, arg2) {
        let def;
        if (typeof arg1 === 'string' && Array.isArray(arg2)) {
            def = { id: arg1, match: arg1, steps: arg2 };
        } else if (typeof arg1 === 'string') {
            def = Object.assign({}, arg2 || {}, { id: (arg2 && arg2.id) || arg1 });
        } else if (typeof arg1 === 'function' && Array.isArray(arg2)) {
            def = { id: 'guide-' + (registry.length + 1), match: arg1, steps: arg2 };
        } else {
            def = Object.assign({}, arg1 || {});
        }
        if (!def.id) def.id = 'guide-' + (registry.length + 1);
        return def;
    }

    function register(arg1, arg2) {
        const def = normalizeDefinition(arg1, arg2);
        const idx = registry.findIndex(g => g.id === def.id);
        if (idx >= 0) registry[idx] = def;
        else registry.push(def);
        registry.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
        scheduleResume();
        return def;
    }

    function matchRule(rule, def) {
        const ctx = buildContext();
        if (typeof rule === 'function') {
            try { return !!rule(ctx, def); } catch (_) { return false; }
        }
        if (rule instanceof RegExp) return rule.test(location.href);
        if (Array.isArray(rule)) return rule.some(r => matchRule(r, def));
        if (typeof rule === 'string') return location.pathname === rule || location.href.includes(rule);
        if (!rule || typeof rule !== 'object') return false;

        if (rule.pathname) {
            const vals = Array.isArray(rule.pathname) ? rule.pathname : [rule.pathname];
            if (!vals.some(v => v instanceof RegExp ? v.test(location.pathname) : location.pathname === v)) return false;
        }
        if (rule.pathIncludes) {
            const vals = Array.isArray(rule.pathIncludes) ? rule.pathIncludes : [rule.pathIncludes];
            if (!vals.every(v => location.pathname.includes(v))) return false;
        }
        if (rule.searchIncludes) {
            const vals = Array.isArray(rule.searchIncludes) ? rule.searchIncludes : [rule.searchIncludes];
            if (!vals.every(v => location.search.includes(v))) return false;
        }
        if (rule.bodyId) {
            const vals = Array.isArray(rule.bodyId) ? rule.bodyId : [rule.bodyId];
            if (!vals.includes(document.body ? document.body.id : '')) return false;
        }
        if (rule.selector && !qs(rule.selector)) return false;
        return true;
    }

    function matches(def) {
        if (!def) return false;
        if (def.disabled) return false;

        const explicitMatcher = def.match ?? def.matches ?? def.test ?? def.when;
        if (explicitMatcher !== undefined) {
            if (typeof explicitMatcher === 'function' || explicitMatcher instanceof RegExp || typeof explicitMatcher === 'string' || Array.isArray(explicitMatcher) || (explicitMatcher && typeof explicitMatcher === 'object')) {
                return matchRule(explicitMatcher, def);
            }
        }

        const pathRule = def.pathname ?? def.path ?? def.paths ?? def.route ?? def.routes;
        const bodyRule = def.bodyId ?? def.bodyIds;
        const selectorRule = def.selector ?? def.requiredSelector;
        if (pathRule || bodyRule || selectorRule) {
            return matchRule({ pathname: pathRule, bodyId: bodyRule, selector: selectorRule }, def);
        }

        if (def.urlIncludes) {
            const vals = Array.isArray(def.urlIncludes) ? def.urlIncludes : [def.urlIncludes];
            return vals.every(v => location.href.includes(v));
        }
        if (def.url) {
            if (def.url instanceof RegExp) return def.url.test(location.href);
            const vals = Array.isArray(def.url) ? def.url : [def.url];
            return vals.some(v => location.href === v || location.href.includes(v));
        }
        return true;
    }

    function getGuide(id) {
        return registry.find(g => g.id === id) || null;
    }

    function currentGuide(preferredId) {
        if (preferredId) return getGuide(preferredId);
        return registry.find(matches) || null;
    }

    function resolveSteps(def) {
        const candidate = def && (def.steps || (def.tour && def.tour.steps));
        const raw = typeof candidate === 'function' ? candidate(buildContext()) : candidate;
        if (!Array.isArray(raw)) return [];
        return raw.map(step => {
            const s = Object.assign({}, step);
            s.title = resolveValue(s.title, buildContext());
            s.intro = resolveValue(s.intro != null ? s.intro : s.text, buildContext());
            const el = resolveValue(s.element, buildContext());
            if (typeof el === 'string') {
                const found = qs(el);
                if (found) s.element = found;
                else if (s.optional || s.skipIfMissing) return null;
            }
            return s;
        }).filter(Boolean);
    }

    async function startClassic(defOrId) {
        const def = typeof defOrId === 'string' ? getGuide(defOrId) : (defOrId || currentGuide());
        if (!def) return false;
        await loadIntroAssets();
        addStyle();
        const steps = resolveSteps(def);
        if (!steps.length) return false;

        if (activeIntro) {
            try { activeIntro.exit(); } catch (_) {}
        }

        const intro = window.introJs();
        activeIntro = intro;
        const options = Object.assign({
            steps,
            nextLabel: 'Suivant',
            prevLabel: 'Précédent',
            doneLabel: 'Terminer',
            skipLabel: 'Quitter',
            showProgress: true,
            showBullets: false,
            exitOnOverlayClick: false,
            disableInteraction: false,
            scrollToElement: true,
            tooltipClass: 'custom-tooltip',
            highlightClass: 'custom-highlight'
        }, def.options || def.introOptions || {});

        intro.setOptions(options);
        intro.onexit(() => { if (activeIntro === intro) activeIntro = null; });
        intro.oncomplete(() => { if (activeIntro === intro) activeIntro = null; });
        intro.start();
        return true;
    }

    function showModeChoice(def) {
        addStyle();
        const old = document.querySelector('.kg-choice-backdrop');
        if (old) old.remove();

        const backdrop = document.createElement('div');
        backdrop.className = 'kg-choice-backdrop';
        backdrop.innerHTML = `
            <div class="kg-choice" role="dialog" aria-modal="true" aria-label="Choix du guide">
                <h2>${esc(def.title || 'Guide interactif')}</h2>
                <p>Choisissez la manière dont vous souhaitez être accompagné.</p>
                <div class="kg-choice-grid">
                    <button type="button" data-mode="classic">
                        <strong>📖 Découvrir cet écran</strong>
                        <small>Explications guidées avec Précédent / Suivant, sans obligation de manipulation.</small>
                    </button>
                    <button type="button" data-mode="practice">
                        <strong>🖱️ Faire l’opération pas à pas</strong>
                        <small>Le guide attend vos vraies actions dans Koha et reprend automatiquement après les changements de page.</small>
                    </button>
                </div>
                <button type="button" class="kg-choice-close">Annuler</button>
            </div>`;
        document.body.appendChild(backdrop);

        const close = () => backdrop.remove();
        backdrop.addEventListener('click', e => {
            if (e.target === backdrop || e.target.closest('.kg-choice-close')) return close();
            const btn = e.target.closest('[data-mode]');
            if (!btn) return;
            const mode = btn.dataset.mode;
            close();
            Promise.resolve(mode === 'practice' ? startPractice(def) : startClassic(def))
                .catch(error => {
                    console.error('[KOHA_GUIDES] Impossible de démarrer le guide', error);
                    const message = document.createElement('div');
                    message.className = 'alert alert-danger';
                    message.style.position = 'fixed';
                    message.style.zIndex = '2147483001';
                    message.style.right = '20px';
                    message.style.bottom = '20px';
                    message.textContent = 'Impossible de démarrer le guide interactif. Rechargez la page puis réessayez.';
                    document.body.appendChild(message);
                    setTimeout(() => message.remove(), 6000);
                });
        });
    }

    function start(idOrOptions) {
        let preferredId = null;
        let forcedMode = null;
        if (typeof idOrOptions === 'string') preferredId = idOrOptions;
        else if (idOrOptions && typeof idOrOptions === 'object') {
            preferredId = idOrOptions.id || null;
            forcedMode = idOrOptions.mode || null;
        }

        const def = currentGuide(preferredId);
        if (!def) return false;
        if (forcedMode === 'practice' && def.practice) return startPractice(def);
        if (forcedMode === 'classic') return startClassic(def);
        if (def.practice) return showModeChoice(def);
        return startClassic(def);
    }

    function normalizePractice(def) {
        if (!def || !def.practice) return null;
        const practice = typeof def.practice === 'function' ? def.practice(buildContext()) : def.practice;
        if (!practice) return null;
        const phases = Array.isArray(practice.phases)
            ? practice.phases
            : Object.entries(practice.phases || {}).map(([id, value]) => Object.assign({ id }, value));
        return Object.assign({}, practice, { phases });
    }

    function phaseMatches(phase) {
        if (!phase) return false;
        if (typeof phase.match === 'function' || phase.match instanceof RegExp || typeof phase.match === 'string' || Array.isArray(phase.match) || (phase.match && typeof phase.match === 'object')) {
            return matchRule(phase.match, phase);
        }
        return true;
    }

    function resolvePhase(practice, state) {
        const current = practice.phases.find(p => p.id === state.phase);
        if (current && phaseMatches(current)) return current;
        const found = practice.phases.find(phaseMatches);
        if (found) {
            state.phase = found.id;
            state.stepIndex = 0;
            state.stepId = null;
            saveState(state);
            return found;
        }
        return null;
    }

    function shouldSkip(step, ctx) {
        if (!step) return true;
        if (typeof step.skipIf === 'function') {
            try { return !!step.skipIf(ctx); } catch (_) { return false; }
        }
        return !!step.skip;
    }

    function normalizePracticeSteps(phase) {
        const raw = typeof phase.steps === 'function' ? phase.steps(buildContext()) : phase.steps;
        return Array.isArray(raw) ? raw : [];
    }

    function setRuntimeStatus(message, kind) {
        if (!runtime) return;
        runtime.status = { message, kind: kind || '' };
        const box = document.querySelector('.introjs-tooltip .kg-practice-status');
        if (box) {
            box.textContent = message;
            box.className = 'kg-practice-status' + (kind ? ' is-' + kind : '');
        }
    }

    function cleanupRuntime() {
        if (!runtime) return;
        for (const fn of runtime.cleanups || []) {
            try { fn(); } catch (_) {}
        }
        runtime = null;
    }

    function stopPractice(clear) {
        if (activeIntro) {
            try {
                if (runtime) runtime.internalExit = true;
                activeIntro.exit();
            } catch (_) {}
        }
        activeIntro = null;
        cleanupRuntime();
        if (clear !== false) clearState();
    }

    function completePractice() {
        stopPractice(true);
    }

    function stateDataPatch(patch) {
        const state = loadState();
        if (!state) return null;
        state.data = Object.assign({}, state.data || {}, patch || {});
        return saveState(state);
    }

    function nextStep(def, practice, phase, steps, state) {
        state.stepIndex = Number(state.stepIndex || 0) + 1;
        state.stepId = null;
        saveState(state);
        runPractice(def, practice, state);
    }

    function transitionPhase(state, phaseId) {
        state.phase = phaseId;
        state.stepIndex = 0;
        state.stepId = null;
        saveState(state);
    }

    function showSuccessThenNext(def, practice, phase, steps, state, message) {
        const completedRuntime = runtime;
        if (!completedRuntime) return;

        setRuntimeStatus(message || '✓ Étape validée', 'ok');
        setTimeout(() => {
            // Si une autre étape a déjà pris la main, ne surtout pas la fermer.
            if (runtime !== completedRuntime) return;

            completedRuntime.internalExit = true;
            const completedIntro = activeIntro;
            if (completedIntro) {
                try { completedIntro.exit(); } catch (_) {}
            }
            if (runtime === completedRuntime) cleanupRuntime();
            if (activeIntro === completedIntro) activeIntro = null;

            // Une attente peut avoir changé de phase avant d'arriver ici.
            // Dans ce cas la nouvelle phase doit démarrer à l'étape 0.
            const phaseChanged = !!(phase && state.phase && state.phase !== phase.id);
            if (!phaseChanged) {
                state.stepIndex = Number(state.stepIndex || 0) + 1;
                state.stepId = null;
                saveState(state);
            }

            // Intro.js termine son nettoyage DOM après exit().
            // Décaler le redémarrage évite que l'ancien overlay supprime le nouveau.
            setTimeout(() => runPractice(def, practice, state), 120);
        }, 350);
    }

    function resolveWaitTarget(wait, step) {
        return qs(resolveValue((wait && wait.target) || step.element, buildContext()));
    }

    function checkWait(wait, event, target) {
        if (!wait) return true;
        if (typeof wait.check === 'function') {
            try { return wait.check(event, target, buildContext()); } catch (_) { return false; }
        }
        if (wait.requiredValue !== undefined) {
            return target && String(target.value) === String(wait.requiredValue);
        }
        if (target && target.type === 'file') return !!(target.files && target.files.length);
        return true;
    }

    function decoratePracticeTooltip(step, state, wait) {
        setTimeout(() => {
            const tooltip = document.querySelector('.introjs-tooltip');
            const textBox = tooltip && tooltip.querySelector('.introjs-tooltiptext');
            if (!tooltip || !textBox) return;
            tooltip.classList.add('kg-practice-tooltip');

            if (!textBox.querySelector('.kg-practice-head')) {
                const head = document.createElement('div');
                head.className = 'kg-practice-head';
                head.innerHTML = '<span class="kg-practice-dot"></span><span>À vous de jouer</span>';
                textBox.prepend(head);
            }

            let status = textBox.querySelector('.kg-practice-status');
            if (!status) {
                status = document.createElement('div');
                status.className = 'kg-practice-status';
                status.textContent = (wait && wait.status) || 'En attente de votre action…';
                textBox.appendChild(status);
            }

            if (runtime && runtime.status && runtime.status.message) {
                setRuntimeStatus(runtime.status.message, runtime.status.kind);
            }

            if (wait && wait.acceptCurrent) {
                const target = resolveWaitTarget(wait, step);
                const valid = checkWait(wait, null, target);
                if (valid && !textBox.querySelector('.kg-current-btn')) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'kg-current-btn';
                    btn.textContent = wait.acceptCurrentLabel || 'Conserver ce choix';
                    btn.addEventListener('click', () => {
                        if (!runtime || runtime.done) return;
                        runtime.done = true;
                        if (typeof wait.onComplete === 'function') {
                            try { wait.onComplete(null, target, buildContext()); } catch (_) {}
                        }
                        if (wait.nextPhase) transitionPhase(state, wait.nextPhase);
                        showSuccessThenNext(runtime.def, runtime.practice, runtime.phase, runtime.steps, state, wait.successMessage);
                    });
                    textBox.appendChild(btn);
                }
            }
        }, 0);
    }

    function bindEventWait(step, wait, state) {
        const targets = typeof wait.target === 'string' ? qsa(wait.target) : [resolveWaitTarget(wait, step)].filter(Boolean);
        if (!targets.length) {
            setRuntimeStatus('Élément attendu introuvable sur cette page.', 'error');
            return;
        }

        const eventName = wait.event || 'change';
        const handler = event => {
            if (!runtime || runtime.done) return;
            const target = event.currentTarget || event.target;
            if (!checkWait(wait, event, target)) return;

            if (typeof wait.onEvent === 'function') {
                try {
                    const patch = wait.onEvent(event, target, buildContext());
                    if (patch && typeof patch === 'object') state.data = Object.assign({}, state.data || {}, patch);
                } catch (_) {}
            }

            if (wait.navigate) {
                if (wait.nextPhase) transitionPhase(state, wait.nextPhase);
                else saveState(state);
                runtime.done = true;
                runtime.internalExit = true;
                return;
            }

            if (typeof wait.waitFor === 'function') {
                setRuntimeStatus(wait.waitingMessage || 'Action reçue. Koha traite la demande…');
                pollCondition(step, wait, state);
                return;
            }

            runtime.done = true;
            if (wait.nextPhase) transitionPhase(state, wait.nextPhase);
            showSuccessThenNext(runtime.def, runtime.practice, runtime.phase, runtime.steps, state, wait.successMessage);
        };

        targets.forEach(target => target.addEventListener(eventName, handler, !!wait.capture));
        runtime.cleanups.push(() => targets.forEach(target => target.removeEventListener(eventName, handler, !!wait.capture)));
    }

    function pollCondition(step, wait, state) {
        if (!runtime || runtime.polling) return;
        runtime.polling = true;
        const started = now();
        const interval = Math.max(250, Number(wait.interval || 500));
        const timeout = Math.max(0, Number(wait.timeout || 120000));

        let timer = null;
        let cancelled = false;
        runtime.cleanups.push(() => { cancelled = true; if (timer) clearTimeout(timer); });

        const tick = async () => {
            if (cancelled || !runtime || runtime.done) return;

            try {
                if (typeof wait.failure === 'function') {
                    const fail = await wait.failure(buildContext());
                    if (fail) {
                        runtime.polling = false;
                        setRuntimeStatus(typeof fail === 'string' ? fail : (wait.failureMessage || 'Koha a signalé une erreur. Corrigez puis réessayez.'), 'error');
                        return;
                    }
                }

                const ok = typeof wait.waitFor === 'function'
                    ? await wait.waitFor(buildContext())
                    : (typeof wait.check === 'function' ? await wait.check(null, resolveWaitTarget(wait, step), buildContext()) : false);

                if (ok) {
                    runtime.done = true;
                    runtime.polling = false;
                    if (typeof wait.onComplete === 'function') {
                        try {
                            const patch = await wait.onComplete(buildContext());
                            if (patch && typeof patch === 'object') state.data = Object.assign({}, state.data || {}, patch);
                        } catch (_) {}
                    }
                    if (wait.nextPhase) transitionPhase(state, wait.nextPhase);
                    else saveState(state);
                    showSuccessThenNext(runtime.def, runtime.practice, runtime.phase, runtime.steps, state, wait.successMessage);
                    return;
                }
            } catch (_) {}

            if (timeout && now() - started > timeout) {
                runtime.polling = false;
                setRuntimeStatus(wait.timeoutMessage || 'Le délai est inhabituellement long. Le guide reste ouvert ; vous pouvez réessayer ou quitter.', 'error');
                return;
            }
            timer = setTimeout(tick, interval);
        };

        tick();
    }

    function bindWait(step, state) {
        const wait = step.wait;
        if (!wait) return;

        if (wait.type === 'condition') {
            setRuntimeStatus(wait.status || 'En attente de Koha…');
            pollCondition(step, wait, state);
            return;
        }

        bindEventWait(step, wait, state);
    }

    async function showPracticeStep(def, practice, phase, steps, state, step) {
        await loadIntroAssets();
        addStyle();

        const elementValue = resolveValue(step.element, buildContext());
        const element = qs(elementValue) || (elementValue instanceof Element ? elementValue : null);
        if (!element && (step.optional || step.skipIfMissing)) {
            nextStep(def, practice, phase, steps, state);
            return;
        }

        const introText = resolveValue(step.intro != null ? step.intro : step.text, buildContext());
        const title = resolveValue(step.title, buildContext());
        const wait = step.wait || null;

        const intro = window.introJs();
        const stepRuntime = {
            def, practice, phase, steps, state, step,
            cleanups: [], done: false, internalExit: false, polling: false,
            status: null
        };
        activeIntro = intro;
        runtime = stepRuntime;

        const introStep = { intro: introText || '', position: step.position || 'auto' };
        if (title) introStep.title = title;
        if (element) introStep.element = element;

        intro.setOptions(Object.assign({
            steps: [introStep],
            showProgress: false,
            showBullets: false,
            exitOnOverlayClick: false,
            disableInteraction: false,
            scrollToElement: true,
            showButtons: !wait,
            nextLabel: step.nextLabel || 'Continuer',
            prevLabel: 'Précédent',
            doneLabel: step.doneLabel || 'Continuer',
            skipLabel: 'Quitter',
            tooltipClass: 'kg-practice-tooltip',
            highlightClass: 'custom-highlight'
        }, practice.introOptions || {}, step.introOptions || {}));

        intro.onafterchange(() => {
            if (runtime !== stepRuntime || activeIntro !== intro) return;
            decoratePracticeTooltip(step, state, wait);

            // Intro.js peut traiter son bouton « skip » comme une fin d'étape sur
            // une visite composée d'une seule étape. Or, en mode pratique, chaque
            // écran est volontairement une mini-visite d'une étape. On intercepte
            // donc « Quitter » AVANT Intro.js : fermeture réelle du parcours,
            // suppression de la reprise sessionStorage et surtout aucune avance.
            if (!stepRuntime.quitGuardInstalled) {
                stepRuntime.quitGuardInstalled = true;
                const quitHandler = event => {
                    const target = event.target && event.target.closest
                        ? event.target.closest('.introjs-skipbutton')
                        : null;
                    if (!target || runtime !== stepRuntime || activeIntro !== intro) return;

                    event.preventDefault();
                    event.stopPropagation();
                    if (typeof event.stopImmediatePropagation === 'function') {
                        event.stopImmediatePropagation();
                    }

                    stepRuntime.done = true;
                    stepRuntime.internalExit = true;
                    clearState();

                    // Détacher nos attentes avant de demander à Intro.js de fermer.
                    cleanupRuntime();
                    if (activeIntro === intro) activeIntro = null;
                    try { intro.exit(); } catch (_) {}
                };
                document.addEventListener('click', quitHandler, true);
                stepRuntime.cleanups.push(() => document.removeEventListener('click', quitHandler, true));
            }
        });
        intro.onexit(() => {
            // Un ancien Intro.js peut encore émettre onexit après le démarrage
            // de l'étape suivante. Ne jamais toucher au runtime d'une autre étape.
            if (runtime !== stepRuntime) return;
            const internal = stepRuntime.internalExit;
            cleanupRuntime();
            if (activeIntro === intro) activeIntro = null;
            if (!internal) clearState();
        });
        intro.oncomplete(() => {
            if (runtime !== stepRuntime || stepRuntime.done) return;
            stepRuntime.done = true;
            const completePhase = !!phase.completeOnFinish && Number(state.stepIndex || 0) >= steps.length - 1;
            stepRuntime.internalExit = true;

            // Important : Intro.js retire encore son overlay/tooltip après oncomplete.
            // On laisse cette instance finir son nettoyage avant de lancer la suivante.
            cleanupRuntime();
            if (activeIntro === intro) activeIntro = null;

            if (completePhase || step.completePractice) {
                clearState();
                return;
            }

            state.stepIndex = Number(state.stepIndex || 0) + 1;
            state.stepId = null;
            saveState(state);
            setTimeout(() => runPractice(def, practice, state), 120);
        });

        state.stepId = step.id || String(state.stepIndex || 0);
        saveState(state);
        intro.start();
        if (wait) bindWait(step, state);
    }

    async function runPractice(def, practice, state) {
        if (!def || !practice || !state) return false;
        const phase = resolvePhase(practice, state);
        if (!phase) return false;

        const steps = normalizePracticeSteps(phase);
        let idx = Number(state.stepIndex || 0);
        const ctx = buildContext();
        while (idx < steps.length && shouldSkip(steps[idx], ctx)) {
            idx += 1;
            state.stepIndex = idx;
            state.stepId = null;
            saveState(state);
        }

        if (idx >= steps.length) {
            if (phase.nextPhase) {
                transitionPhase(state, phase.nextPhase);
                return runPractice(def, practice, state);
            }
            if (phase.completeOnFinish) {
                clearState();
                return true;
            }
            return true;
        }

        return showPracticeStep(def, practice, phase, steps, state, steps[idx]);
    }

    async function startPractice(defOrId, options) {
        const def = typeof defOrId === 'string' ? getGuide(defOrId) : (defOrId || currentGuide());
        if (!def || !def.practice) return false;
        const practice = normalizePractice(def);
        if (!practice || !practice.phases.length) return false;

        stopPractice(false);
        const existing = loadState();
        let state;

        if (options && options.resume && existing && existing.guideId === def.id) {
            state = existing;
        } else {
            const matched = practice.phases.find(phaseMatches);
            state = {
                guideId: def.id,
                mode: 'practice',
                phase: (matched && matched.id) || practice.initialPhase || practice.phases[0].id,
                stepIndex: 0,
                stepId: null,
                startedAt: now(),
                updatedAt: now(),
                ttl: Number(practice.expiresMs || DEFAULT_TTL),
                data: {}
            };
            saveState(state);
        }

        return runPractice(def, practice, state);
    }

    function resumePractice() {
        const state = loadState();
        if (!state || state.mode !== 'practice') return false;
        const def = getGuide(state.guideId);
        if (!def || !def.practice) return false;
        return startPractice(def, { resume: true });
    }

    function scheduleResume() {
        clearTimeout(resumeTimer);
        resumeTimer = setTimeout(() => {
            const state = loadState();
            if (!state) return;
            const def = getGuide(state.guideId);
            if (!def || !def.practice) return;
            const practice = normalizePractice(def);
            if (!practice) return;
            const phase = practice.phases.find(phaseMatches);
            if (!phase) return;
            resumePractice();
        }, 350);
    }

    function installLauncherFallback() {
        const existing = document.querySelector('#tutoriel,[data-koha-guide-launcher],.koha-guide-launcher');
        if (existing && !existing.dataset.kohaGuidesBound) {
            existing.dataset.kohaGuidesBound = '1';
            existing.addEventListener('click', e => {
                e.preventDefault();
                start();
            });
            return;
        }

        if (existing) return;
        const active = currentGuide();
        if (!active) return;

        const host = document.querySelector('#sidebarBottom,.sidebar_menu,.toolbar,#toolbar') || null;
        if (!host) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-default btn-sm koha-guide-launcher';
        btn.dataset.kohaGuideLauncher = '1';
        btn.textContent = 'Guide interactif';
        btn.addEventListener('click', () => start());
        host.appendChild(btn);
    }

    const api = {
        version: VERSION,
        registry,
        guides: registry,
        register,
        registerGuide: register,
        addGuide: register,
        getGuide,
        currentGuide,
        start,
        startGuide: start,
        launch: start,
        launchTour: start,
        startClassic,
        startPractice,
        resumePractice,
        stopPractice,
        clearPractice: clearState,
        getPracticeState: loadState,
        patchPracticeData: stateDataPatch,
        helpers: { qs, qsa, visible, esc, buildContext }
    };

    window.KOHA_GUIDES = api;
    window.startIntro = function (stepsOrId, options) {
        if (Array.isArray(stepsOrId)) {
            return startClassic({ id: 'legacy-inline', steps: stepsOrId, options: options || {} });
        }
        return start(stepsOrId);
    };
    window.launchTour = function (idOrOptions) { return start(idOrOptions); };

    if (previousApi && previousApi !== api) {
        try {
            const previousGuides = Array.isArray(previousApi.registry)
                ? previousApi.registry
                : (Array.isArray(previousApi.guides) ? previousApi.guides : []);
            previousGuides.forEach(g => register(g));
        } catch (_) {}
    }

    function ready() {
        addStyle();
        installLauncherFallback();
        scheduleResume();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
    else ready();
})();

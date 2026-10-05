(function () {
  'use strict';

  const KT = window.KohaTools;
  if (!KT || !KT.Config) return;

  const MODULE_ID = 'patron-age-display';
  const CFG = KT.Config.getCanonical(MODULE_ID);
  const Scope = KT.getService && KT.getService('scope');

  if (!CFG || !CFG.enabled || !['shadow', 'live'].includes(CFG.mode)) return;
  if (Scope && !Scope.match(CFG.general && CFG.general.scope).ok) return;

  const runtime = {
    id: MODULE_ID,
    description: 'Personnalise l’âge affiché par Koha depuis la date de naissance, avec choix entre années, années + mois ou années + mois + jours.',
    sourceFiles: ['098-age-calculation-member-detail.js'],
    parity: 'adapted-current-koha',
    reloadRequiredOnConfigChange: true,

    init: function () {
      if (window['__KT_PARITY_' + MODULE_ID]) return;
      window['__KT_PARITY_' + MODULE_ID] = true;

      const path = window.location.pathname || '';
      const isMoremember = /\/members\/moremember\.pl$/.test(path);
      const isMemberentry = /\/members\/memberentry\.pl$/.test(path);
      const isMemberdetails = /\/members\/memberdetails\.pl$/.test(path);

      if (!isMoremember && !isMemberentry && !isMemberdetails) return;

      const state = {
        generated: [],
        modified: [],
        boundInputs: []
      };

      function record(level, kind, extra) {
        if (typeof KT.record === 'function') {
          KT.record(Object.assign({ module: MODULE_ID, level: level, kind: kind }, extra || {}));
        }
      }

      function normaliseSpaces(value) {
        return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      }

      function parseDate(value) {
        const text = normaliseSpaces(value);
        let m;

        // Formats Koha les plus courants : JJ/MM/AAAA, JJ-MM-AAAA, AAAA-MM-JJ.
        m = text.match(/(?:^|\D)(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\D|$)/);
        if (m) {
          return validDate(parseInt(m[3], 10), parseInt(m[2], 10), parseInt(m[1], 10));
        }

        m = text.match(/(?:^|\D)(\d{4})-(\d{1,2})-(\d{1,2})(?:\D|$)/);
        if (m) {
          return validDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
        }

        return null;
      }

      function validDate(year, month, day) {
        if (!year || !month || !day || year < 1800 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) {
          return null;
        }
        const d = new Date(year, month - 1, day);
        if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
        return d;
      }

      function calculateAge(birth, now) {
        now = now || new Date();
        let age = now.getFullYear() - birth.getFullYear();
        const monthDelta = now.getMonth() - birth.getMonth();
        if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) age--;
        return age >= 0 && age <= 130 ? age : null;
      }

      function ageText(age) {
        const lang = String(document.documentElement.lang || '').toLowerCase();
        if (lang.indexOf('en') === 0) return '(' + age + ' years)';
        return '(' + age + ' ans)';
      }

      function rememberOriginal(span) {
        if (!span || span.dataset.pmk098OriginalText !== undefined) return;
        span.dataset.pmk098OriginalText = span.textContent || '';
        state.modified.push(span);
      }

      function updateExistingAgeSpan(span, birth) {
        if (!span || !birth) return false;
        const age = calculateAge(birth);
        if (age === null) return false;

        rememberOriginal(span);

        // Important : on conserve LE MÊME élément .age_years.
        // Le module 049 y attache ses classes, attributs et événements.
        span.textContent = ageText(age);
        span.dataset.pmk098AgeDisplay = '1';
        span.dataset.pmk098Age = String(age);
        return true;
      }

      function makeGeneratedAge(birth) {
        const age = calculateAge(birth);
        if (age === null) return null;

        const span = document.createElement('span');
        span.className = 'age_years pmk098-age-display';
        span.dataset.pmk098Generated = '1';
        span.dataset.pmk098AgeDisplay = '1';
        span.dataset.pmk098Age = String(age);
        span.style.marginLeft = '8px';
        span.style.color = '#555';
        span.textContent = ageText(age);
        state.generated.push(span);
        return span;
      }

      function textWithoutAgeAndAstro(container) {
        if (!container) return '';
        const clone = container.cloneNode(true);
        clone.querySelectorAll('.age_years, [data-koha-astro-sign="1"], .pmk-astro049-sign').forEach(function (el) {
          el.remove();
        });
        return normaliseSpaces(clone.textContent || '');
      }

      function birthFromAgeSpan(span) {
        if (!span) return null;

        const row = span.closest('li, dd, .form-group, .form-row, .rows, .patroninfo-section');
        if (row) {
          const parsed = parseDate(textWithoutAgeAndAstro(row));
          if (parsed) return parsed;
        }

        let node = span.previousSibling;
        let hops = 0;
        while (node && hops < 6) {
          const parsed = parseDate(node.textContent || '');
          if (parsed) return parsed;
          node = node.previousSibling;
          hops++;
        }
        return null;
      }

      function labelLooksLikeDob(text) {
        return /date\s+de\s+naissance|date\s+of\s+birth|birth\s*date|birthdate/i.test(normaliseSpaces(text));
      }

      function findDobRows() {
        const rows = [];

        document.querySelectorAll('li, dt, label, .form-group, .form-row').forEach(function (node) {
          if (!labelLooksLikeDob(node.textContent || '')) return;

          let container = node;
          if (node.tagName === 'DT' && node.nextElementSibling) container = node.nextElementSibling;
          else if (node.tagName === 'LABEL') container = node.closest('li, .form-group, .form-row') || node.parentElement;

          if (container && rows.indexOf(container) === -1) rows.push(container);
        });

        return rows;
      }

      function applyMoremember() {
        let applied = 0;
        const spans = Array.from(document.querySelectorAll('.age_years'));

        spans.forEach(function (span) {
          const birth = birthFromAgeSpan(span);
          if (birth && updateExistingAgeSpan(span, birth)) applied++;
        });

        // Fallback : si Koha n'affiche plus .age_years mais garde la date de naissance,
        // on ajoute l'âge sans toucher au reste du contenu.
        if (!spans.length) {
          findDobRows().forEach(function (row) {
            const birth = parseDate(textWithoutAgeAndAstro(row));
            if (!birth || row.querySelector('.age_years')) return;
            const span = makeGeneratedAge(birth);
            if (span) {
              row.appendChild(document.createTextNode(' '));
              row.appendChild(span);
              applied++;
            }
          });
        }

        return applied;
      }

      function findDobInput() {
        return document.querySelector(
          '#dateofbirth, input[name="dateofbirth"], input[name="borrower_dateofbirth"], input[data-patron-field="dateofbirth"]'
        );
      }

      function ensureInputAge(input) {
        if (!input) return 0;
        const birth = parseDate(input.value || input.getAttribute('value') || '');
        const host = input.closest('li, .form-group, .form-row') || input.parentElement;
        if (!host) return 0;

        let span = host.querySelector('.pmk098-age-display[data-pmk098-generated="1"]');

        if (!birth) {
          if (span) span.hidden = true;
          return 0;
        }

        const age = calculateAge(birth);
        if (age === null) {
          if (span) span.hidden = true;
          return 0;
        }

        if (!span) {
          span = makeGeneratedAge(birth);
          if (!span) return 0;
          input.insertAdjacentElement('afterend', span);
        } else {
          span.textContent = ageText(age);
          span.dataset.pmk098Age = String(age);
        }

        span.hidden = false;
        return 1;
      }

      function bindInput(input) {
        if (!input || input.dataset.pmk098Bound === '1') return;
        input.dataset.pmk098Bound = '1';
        const handler = function () { ensureInputAge(input); };
        input.addEventListener('input', handler);
        input.addEventListener('change', handler);
        state.boundInputs.push({ input: input, handler: handler });
      }

      function applyMemberentry() {
        const input = findDobInput();
        if (!input) return 0;
        bindInput(input);
        return ensureInputAge(input);
      }

      function applyMemberdetails() {
        let applied = 0;

        document.querySelectorAll('.age_years').forEach(function (span) {
          const birth = birthFromAgeSpan(span);
          if (birth && updateExistingAgeSpan(span, birth)) applied++;
        });

        if (applied) return applied;

        findDobRows().forEach(function (row) {
          const birth = parseDate(textWithoutAgeAndAstro(row));
          if (!birth || row.querySelector('.age_years')) return;
          const span = makeGeneratedAge(birth);
          if (!span) return;
          row.appendChild(document.createTextNode(' '));
          row.appendChild(span);
          applied++;
        });

        return applied;
      }

      function apply() {
        let applied = 0;
        if (isMoremember) applied = applyMoremember();
        else if (isMemberentry) applied = applyMemberentry();
        else if (isMemberdetails) applied = applyMemberdetails();

        record('info', 'patron-age-applied', {
          path: path,
          targets: applied
        });
      }

      // Koha peut finir certains blocs après DOMContentLoaded : une passe immédiate,
      // puis une seconde très courte suffit sans observer toute la page en continu.
      apply();
      window.setTimeout(apply, 250);

      runtime._state = state;
    },

    destroy: function () {
      const state = runtime._state;
      if (!state) return true;

      state.boundInputs.forEach(function (entry) {
        entry.input.removeEventListener('input', entry.handler);
        entry.input.removeEventListener('change', entry.handler);
        delete entry.input.dataset.pmk098Bound;
      });

      state.generated.forEach(function (el) {
        if (el && el.parentNode) el.remove();
      });

      state.modified.forEach(function (span) {
        if (!span) return;
        if (span.dataset.pmk098OriginalText !== undefined) {
          span.textContent = span.dataset.pmk098OriginalText;
          delete span.dataset.pmk098OriginalText;
        }
        delete span.dataset.pmk098AgeDisplay;
        delete span.dataset.pmk098Age;
      });

      runtime._state = null;
      delete window['__KT_PARITY_' + MODULE_ID];
      return true;
    },

    onConfigChange: function () {
      return { reloadRequired: true };
    }
  };

  KT.registerModule(runtime);

  if (CFG.mode === 'shadow') {
    if (typeof KT.record === 'function') {
      KT.record({
        module: MODULE_ID,
        level: 'info',
        kind: 'shadow-current-koha-adaptation',
        sources: runtime.sourceFiles
      });
    }
    return;
  }

  runtime.init();
})();

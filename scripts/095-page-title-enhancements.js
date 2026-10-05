/*
 Nom du fichier: 095-page-title-enhancements.js
 Dépendances: KOHA_UTILS.waitFor (fallback included)
 Date de dernière modification: 2026-02-21
 Auteur: Michael Mundet
 Description: Améliore les titres de page pour `detail.pl` et `search.pl`.
*/

(function(){
  'use strict';
  try{
    (function(){})('095-page-title-enhancements: loaded');
    const waitFor = (selector, timeout) => {
      if (window.KOHA_UTILS && typeof window.KOHA_UTILS.waitFor === 'function') return window.KOHA_UTILS.waitFor(selector, timeout);
      return new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        const obs = new MutationObserver(() => { const found = document.querySelector(selector); if (found) { obs.disconnect(); resolve(found); } });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => { obs.disconnect(); reject(new Error('timeout')); }, timeout || 3000);
      });
    };

    if (window.location.pathname && window.location.pathname.includes('/detail.pl')){
      waitFor('.biblio_header h1', 3000).then(h => { try{ if (h) document.title = `${(h.textContent||'').trim()} — Catalogue`; }catch(e){ (function(){})('095: set title failed', e); } }).catch(()=>{});
    }

    if (window.location.pathname && window.location.pathname.includes('/search.pl')){
      waitFor('.result, body', 2000).then(() => {
        try{
          const results = document.querySelectorAll('.result').length;
          const q = new URLSearchParams(location.search).get('q') || '';
          if (q) document.title = `${results} résultats pour « ${q} » — Catalogue`;
        }catch(e){ (function(){})('095: set search title failed', e); }
      }).catch(()=>{});
    }

  }catch(e){ (function(){})('095-page-title-enhancements: failed', e); }
})();

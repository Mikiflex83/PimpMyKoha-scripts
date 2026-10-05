/*
 Nom du fichier: 092-popup-info-site-transfert.js
 Dépendances: KOHA_UTILS.waitFor (fallback included), jQuery optional
 Date de dernière modification: 2026-02-21
 Auteur: Michael Mundet
 Description: Affiche une pop-up d'information pour les sites de transfert.
*/

(function(){
  'use strict';
  try{
    (function(){})('092-popup-info-site-transfert: loaded');
    if (!window.location.pathname || !window.location.pathname.includes('/transfer.pl')) return;

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

    waitFor('.site-info, #siteInfoModal', 3000).then(() => {
      try{
        document.querySelectorAll('.site-info').forEach(el => {
          el.addEventListener('click', function(e){
            e.preventDefault(); const info = this.dataset.info || this.title || this.textContent; const modal = document.getElementById('siteInfoModal'); if (modal){ modal.querySelector('.modal-body').textContent = info; try{ if (window.jQuery) window.jQuery(modal).modal('show'); }catch(e){ (function(){})('092: show modal failed', e); } } else { alert(info); }
          });
        });
      }catch(e){ (function(){})('092: init failed', e); }
    }).catch(()=>{});

  }catch(e){ (function(){})('092-popup-info-site-transfert: failed', e); }
})();

/*
 Nom du fichier: 093-cancel-hold-and-transfer.js
 Dépendances: KOHA_UTILS.waitFor (fallback included), jQuery optional
 Date de dernière modification: 2026-02-21
 Auteur: Michael Mundet
 Description: Affiche un modal pour annuler une réservation et la transférer vers un autre site.
*/

(function(){
  'use strict';
  try{
    (function(){})('093-cancel-hold-and-transfer: loaded');
    if (!window.location.pathname || (!window.location.pathname.includes('/holds.pl') && !window.location.pathname.includes('/request.pl'))) return;

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

    waitFor('#cancel_and_transfer, #confirmCancelAndTransferModal', 3000).then(() => {
      try{
        document.querySelectorAll('#cancel_and_transfer').forEach(btn => {
          btn.addEventListener('click', function(e){
            e.preventDefault(); const holdId = this.dataset.holdId; const targetSite = this.dataset.site; if (!holdId || !targetSite) return alert('Données manquantes');
            const confirmModal = document.getElementById('confirmCancelAndTransferModal'); if (!confirmModal) return alert('Modal non trouvé'); confirmModal.querySelector('.modal-body').textContent = `Annuler la réservation ${holdId} et transférer vers ${targetSite} ?`;
            try{ if (window.jQuery) window.jQuery(confirmModal).modal('show'); }catch(e){ (function(){})('093: show modal failed', e); }

            const confirmBtn = confirmModal.querySelector('.confirm-btn'); if (confirmBtn){ confirmBtn.onclick = function(){ fetch(`/cgi-bin/koha/holds.pl?action=cancel_and_transfer&hold_id=${encodeURIComponent(holdId)}&site=${encodeURIComponent(targetSite)}`, { method:'POST' }).then(r=>r.json()).then(j=>{ if (j && j.success) location.reload(); else alert('Échec'); }).catch(()=>alert('Erreur réseau')); }; }
          });
        });
      }catch(e){ (function(){})('093: init handlers failed', e); }
    }).catch(()=>{});

  }catch(e){ (function(){})('093-cancel-hold-and-transfer: failed', e); }
})();

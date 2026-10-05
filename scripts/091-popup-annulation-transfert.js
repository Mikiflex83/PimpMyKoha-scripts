/*
 Nom du fichier: 091-popup-annulation-transfert.js
 Dépendances: KOHA_UTILS.waitFor (fallback included), jQuery optional for modal
 Date de dernière modification: 2026-02-21
 Auteur: Michael Mundet
 Description: Gère le popup d'annulation de transfert et expose `forceTransferPopup` helper.
*/

(function(){
  'use strict';
  try{
    (function(){})('091-popup-annulation-transfert: loaded');
    if (!window.location.pathname || !window.location.pathname.includes('/returns.pl')) return;

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

    waitFor('.action-transfer-cancel, .confirm-cancel, #cancelTransferModal', 3000).then(() => {
      try{
        document.querySelectorAll('.action-transfer-cancel').forEach(btn => {
          btn.addEventListener('click', function(e){
            e.preventDefault(); const id = this.dataset.transferId; const modal = document.getElementById('cancelTransferModal'); if (modal) { modal.querySelector('.confirm-cancel').dataset.id = id; try{ if (window.jQuery) window.jQuery(modal).modal('show'); }catch(e){ (function(){})('091: show modal failed', e); } }
          });
        });

        document.querySelectorAll('.confirm-cancel').forEach(c => {
          c.addEventListener('click', function(){ const id = this.dataset.id; if (!id) return; fetch(`/cgi-bin/koha/returns.pl?action=cancel_transfer&id=${encodeURIComponent(id)}`, { method:'POST' }).then(r=>r.json()).then(j=>{ if (j && j.success) location.reload(); else alert('Échec annulation'); }).catch(()=>alert('Erreur réseau')); });
        });
      }catch(e){ (function(){})('091: init handlers failed', e); }
    }).catch(()=>{});

    // helper global (utilisé par certains templates)
    window.forceTransferPopup = function(id){
      try{
        const modal = document.getElementById('cancelTransferModal'); if (!modal) return false; modal.querySelector('.confirm-cancel').dataset.id = id; try{ if (window.jQuery) window.jQuery(modal).modal('show'); }catch(e){ (function(){})('091: force show modal failed', e); } return true;
      }catch(e){ (function(){})('091: forceTransferPopup failed', e); return false; }
    };

  }catch(e){ (function(){})('091-popup-annulation-transfert: failed', e); }
})();

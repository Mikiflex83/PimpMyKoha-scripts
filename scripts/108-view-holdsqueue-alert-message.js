/*
 Nom du fichier: 108-view-holdsqueue-alert-message.js
 Dépendances: Aucune
 Date de dernière modification: 2026-06-05
 Auteur: Michael Mundet
 Description: Affiche un message d'information en haut de la zone de filtres sur view_holdsqueue.pl.
*/

(function(){
  'use strict';

  if (!window.location.pathname.includes('/circ/view_holdsqueue.pl')) return;

  const MESSAGE_ID = 'koha-holdsqueue-alert-message';
  const MESSAGE_TEXT = "Les rapports sont innaccessibles pour le moment. La liste des réservations n'est donc pas présentées comme vous en avez l'habitude. un ticket est en cours.";

  function injectMessage(){
    if (document.getElementById(MESSAGE_ID)) return true;

    const target = document.querySelector('fieldset.rows');
    if (!target) return false;

    const message = document.createElement('div');
    message.id = MESSAGE_ID;
    message.setAttribute('role', 'status');
    message.style.cssText = [
      'margin:0 0 12px 0',
      'padding:10px 12px',
      'border:1px solid #f0ad4e',
      'border-radius:4px',
      'background:#fff8e1',
      'color:#7a4b00',
      'font-weight:600'
    ].join(';');
    message.textContent = MESSAGE_TEXT;

    target.insertBefore(message, target.firstChild);
    return true;
  }

  if (!injectMessage()) {
    const observer = new MutationObserver(function(){
      if (injectMessage()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function(){ observer.disconnect(); }, 5000);
  }
})();
/*
 Nom du fichier: 023-deplacer-bouton-signaler-probleme.js
 Dépendances: aucune
 Date de dernière modification: 2026-02-21
 Auteur: Michael Mundet
 Description: Transforme le lien 'Signaler un problème' en bouton et le place après le bouton Réserver sur la page détail.
*/

(function(){
  document.addEventListener('DOMContentLoaded', function(){
    if (window.location.pathname.includes('detail.pl')) {
      const concernLink = document.querySelector('#newconcern');
      const reserveButton = document.querySelector('#placehold');

      if (concernLink && reserveButton) {
        // Modifier le texte du lien
        concernLink.textContent = "Signaler un problème dans cette notice";

        // Créer un nouveau bouton
        const newButton = document.createElement('button');
        newButton.className = "btn btn-default";

        // Créer l’icône et le texte
        const icon = document.createElement('i');
        icon.className = "fa fa-exclamation-triangle";
        icon.style.marginRight = "5px";
        newButton.appendChild(icon);
        newButton.appendChild(document.createTextNode(concernLink.textContent));

        // Attributs pour déclencher le modal
        newButton.setAttribute('data-toggle', 'modal');
        newButton.setAttribute('data-target', '#addConcernModal');

        // Ajouter après le bouton Réserver
        reserveButton.parentNode.insertBefore(newButton, reserveButton.nextSibling);

        // Déclencher le modal en cliquant sur le bouton
        newButton.addEventListener('click', () => {
          concernLink.click(); // Réutilise le comportement du lien original
        });
      }
    }
  });
})();
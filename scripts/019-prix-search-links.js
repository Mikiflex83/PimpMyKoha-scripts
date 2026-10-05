/*
 Nom du fichier: 019-prix-search-links.js
 Dépendances: aucune
 Date de dernière modification: 2026-02-21
 Auteur: Michael Mundet
 Description: Ajoute un panneau latéral listant des recherches prédéfinies par prix littéraires pour faciliter la navigation.
*/

(function(){
  document.addEventListener('DOMContentLoaded', function(){
  if (window.location.pathname.includes('search.pl')) {

  // Vérifie si le conteneur existe déjà
  if (!document.getElementById('drac-search-prices')) {

    const prixList = [
      "Prix Goncourt","Prix Goncourt des lycéens","Prix Renaudot",
      "Grand prix du roman de l'Académie française","Prix Femina",
      "Prix Médicis","Prix Interallié","Prix du roman Fnac",
      "Prix des Cinq Continents de la Francophonie","Prix Sorcières",
      "Prix Décembre","Grand prix des lectrices de Elle","Prix des libraires",
      "Prix de Flore","Prix Jean Giono","Prix des libraires de Nancy Le Point",
      "Prix Anaïs Nin","Prix littéraire du Monde","Prix Blù Jean",
      "Prix Landerneau","Prix Vendredi","Prix Maison de la presse",
      "Prix du Livre Inter","Prix Landerneau polar","Prix du Polar en séries",
      "Prix du Salon Le livre sur la place","Prix Wepler","Prix Hennessy du livre",
      "Prix Transfuge du meilleur roman de langue française",
      "Prix des libraires de Nancy et des journalistes du Point",
      "Prix du roman des étudiants France Culture",
      "Prix littéraire de la vocation Marcel Bleustein","Prix Relay",
      "Prix Gouttes de sang d'encre","Prix Cezam inter","Prix des lecteurs Quais du polar",
      "Prix Locus","Prix Imaginales","Prix Page des libraires","Prix Orange du Livre",
      "Prix Trop Virilo","Prix Pierre Bottero","Prix Jules Rimet","Prix Arsène Lupin",
      "Prix Femina étranger","Prix Médicis essai","Prix du Style","Prix Le Vaudeville",
      "Prix Pulitzer","Prix du deuxième roman","Prix Stanislas","Prix Envoyé par la Poste",
      "Prix du public"
    ];

    // Injecte le style
    const style = document.createElement('style');
    style.innerHTML = `
      #drac-search-prices {
          border: 1px solid #408540;
          border-radius: 5px 5px 0 0;
          padding: 0.3em;
      }
      #drac-search-prices h4 {
          background-color: #408540;
          color: white;
          font-size: 90%;
          margin: 0 0 0.2em 0;
          padding: 0.4em 0.2em;
          border-radius: 5px 5px 0 0;
          text-align: center;
      }
      #drac-search-prices a {
          display: block;
          margin: 2px 0;
          color: #006400;
          text-decoration: none;
      }
      #drac-search-prices a:hover {
          text-decoration: underline;
      }
      #drac-toggle-btn {
          display: block;
          margin: 5px auto;
          padding: 5px 10px;
          background-color: #408540;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
      }
      #drac-toggle-btn:hover {
          background-color: #306b36;
      }
    `;
    document.head.appendChild(style);

    const aside = document.querySelector('aside');
    if (!aside) return;

    // Crée le conteneur principal
    const container = document.createElement('div');
    container.id = 'drac-search-prices';

    const header = document.createElement('h4');
    header.textContent = 'Recherche par Prix Littéraire :';
    container.appendChild(header);

    // Préparer les fragments
    const initialFragment = document.createDocumentFragment();
    const hiddenFragment = document.createDocumentFragment();

    prixList.forEach((prix, index) => {
      const link = document.createElement('a');
      link.href = `https://koha.example.org/cgi-bin/koha/catalogue/search.pl?idx=nt&q=%22${encodeURIComponent(prix)}%22&sort_by=pubdate_dsc&count=25`;
      link.textContent = prix;
      link.target = '_blank';
      if (index < 15) {
        initialFragment.appendChild(link);
      } else {
        hiddenFragment.appendChild(link);
      }
    });

    container.appendChild(initialFragment);

    // Bouton "Afficher plus / moins"
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'drac-toggle-btn';
    toggleBtn.textContent = 'Afficher plus';
    let isExpanded = false;

    toggleBtn.addEventListener('click', () => {
      if (isExpanded) {
        // Retirer les prix supplémentaires
        while (container.children.length > 16) { // 15 prix + header
          container.removeChild(container.lastChild);
        }
        toggleBtn.textContent = 'Afficher plus';
      } else {
        // Ajouter les prix cachés
        container.appendChild(hiddenFragment.cloneNode(true));
        toggleBtn.textContent = 'Afficher moins';
      }
      isExpanded = !isExpanded;
    });

    aside.appendChild(container);
    aside.appendChild(toggleBtn);
  }
}
  });
})();
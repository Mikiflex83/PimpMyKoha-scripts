/* Guide détaillé - circ/circulation-home.pl */
(function(){
  'use strict';
  if (window.__kohaGuideCirculationHomeLoadedV6) return;
  window.__kohaGuideCirculationHomeLoadedV6 = true;
  if (!window.KOHA_GUIDES) return;
  const k = window.KOHA_GUIDES, s = k.stepAny;

  k.register(function(ctx){
    if (!/\/circ\/circulation-home\.pl$/.test(ctx.path)) return [];
    return k.compactSteps([
      s(['main h1','h1'], 'Circulation', 'Point d’entrée des opérations de prêt, retour, renouvellement, réservations et transferts.', 'bottom'),
      s(['#header_search'], 'Actions rapides', 'Cette barre permet de passer d’une opération à l’autre sans revenir au menu : particulièrement utile au comptoir.', 'bottom'),
      s(['#circ_search-tab'], 'Prêter', 'Saisissez le numéro de carte de l’adhérent. Vérifiez ensuite les messages de compte avant de scanner les documents.', 'bottom'),
      s(['#checkin_search-tab'], 'Rendre', 'Scannez les documents en retour. Lisez les messages de transfert, réservation ou anomalie avant de poser le document sur une pile physique.', 'bottom'),
      s(['#renew_search-tab'], 'Renouveler', 'Le renouvellement reste soumis aux règles de circulation, aux réservations et aux restrictions éventuelles.', 'bottom'),
      s(['#catalog_search-tab'], 'Catalogue', 'Permet de vérifier une notice ou un exemplaire pendant une opération de circulation.', 'bottom'),
      s(['a[href="/cgi-bin/koha/circ/circulation.pl"]'], 'Prêt', 'Ouvre l’écran de prêt standard.', 'right'),
      s(['a[href="/cgi-bin/koha/circ/returns.pl"]'], 'Retour', 'Ouvre l’écran de retour en série.', 'right'),
      s(['a[href="/cgi-bin/koha/circ/renew.pl"]'], 'Renouvellement', 'Ouvre l’outil de renouvellement.', 'right'),
      s(['a[href*="pendingreserves.pl"]'], 'Réservations à traiter', 'Liste des réservations qui nécessitent une préparation ou une action du réseau.', 'left'),
      s(['a[href*="waitingreserves.pl"]'], 'Réservations en attente', 'Suivi des documents mis de côté et attendant leur retrait.', 'left'),
      s(['a[href*="branchtransfers.pl"]'], 'Transferts', 'Enregistre l’envoi manuel d’exemplaires vers un autre site. Votre installation ajoute aussi un outil de transfert multiple.', 'left'),
      s(['a[href*="transferstoreceive.pl"]'], 'Transferts à recevoir', 'Contrôle les documents attendus sur le site.', 'left'),
      s(['a[href*="transfers_to_send.pl"]'], 'Transferts à envoyer', 'Prépare les documents devant partir en navette.', 'left'),
      s(['a[href*="overdue.pl"]'], 'Retards', 'Vue de suivi des documents en retard. À utiliser avec les règles locales de relance et de gestion des situations usager.', 'left'),
      s(['#offline-circulation'], 'Circulation hors ligne', 'Solution de continuité lorsque la connexion au serveur Koha n’est pas disponible. Les opérations devront être synchronisées ensuite.', 'top'),
      s(['#lastborrower-window'], 'Dernier adhérent', 'Retour rapide vers le dernier compte traité, utile lorsque l’on a quitté momentanément la circulation.', 'bottom')
    ]);
  });
})();

# PimpMyKoha

PimpMyKoha rassemble des scripts de personnalisation de l’interface professionnelle de Koha, développés par Michaël Mundet à partir des usages du réseau des médiathèques de la Dracénie.

Ils répondent à des besoins de circulation, de gestion des collections, de recherche, de contrôle des données et de présentation de l’interface. Tous les scripts de cette collection sont utilisés sur son installation, selon son retour ; leur compatibilité avec une autre installation dépend de la version de Koha et des paramètres locaux.

## Quelques fonctionnalités

- **Recherche et facettes — 055** : présentation et configuration des filtres de recherche.
- **Autorités — 138-pages/138-page-authorities.js** : contrôle des autorités, recherche de doublons et outils de fusion.
- **Bibliographies et publications — 142** : publications à partir de notices et d’exemplaires, en lien avec les listes.
- **Personnalisation — 001 et socle 000** : libellés et éléments d’interface, avec une configuration commune.
- **Périodiques — 029** : adaptations du suivi des abonnements et du bulletinage.

## Contenu du dépôt

Le dossier `scripts/` contient l’intégralité des fichiers transmis : scripts principaux, chargeurs, sous-modules, guides et ressources graphiques. Des variantes historiques et des copies `.txt` sont conservées ; tous les fichiers ne doivent pas être chargés simultanément.

Les dossiers `137-widgets/`, `138-pages/` et `guides/` contiennent des ressources chargées par leurs modules respectifs.

## Utilisation

Ce dépôt présente les scripts existants. Il ne contient pas encore de plugin Koha installable. Les fichiers JavaScript sont hébergés puis appelés depuis la préférence `IntranetUserJS` ; le socle `000-pmk-config-firestore.js` doit précéder les modules qui utilisent sa configuration. Certains modules disposent de leur propre chargeur et chargent leurs ressources à la demande.

Avant utilisation, adapter les URL, les sites, les rapports SQL, les valeurs autorisées et les règles métier à l’installation cible. Les paramètres Firebase ont été remplacés par des marqueurs `YOUR_FIREBASE_…`, les mots de passe locaux par des marqueurs et les liens internes par des domaines d’exemple. Les fonctions concernées nécessitent donc une configuration locale pour fonctionner.

Pour les listes PMK, le fonctionnement existant repose sur un profil logique choisi dans Koha ; il ne nécessite pas l’ajout d’une connexion Firebase utilisateur.

Les versions de Koha compatibles restent à documenter par module. Les contrôles de syntaxe effectués ne remplacent pas des essais dans Koha. Les traitements qui modifient les données doivent être essayés sur une installation de test.

## Évolution

L’objectif est de faire évoluer progressivement cet ensemble vers un plugin configurable pour d’autres installations. Cette perspective n’est pas une affirmation de compatibilité universelle.

## Retours

Pour signaler un problème, préciser le fichier, la version de Koha, le navigateur et les étapes de reproduction, en retirant les données personnelles des exemples.

## Licence

La licence de redistribution reste à préciser. La publication du code ne vaut pas attribution automatique d’une licence ; les dépendances tierces conservent leurs conditions propres.

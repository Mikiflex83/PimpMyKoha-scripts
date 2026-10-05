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

Les sous-dossiers `scripts/137-widgets/`, `scripts/138-pages/` et `scripts/guides/` contiennent des ressources chargées par leurs modules respectifs.

## Utilisation

Ce dépôt présente les scripts existants. Il ne contient pas encore de plugin Koha installable. Les fichiers JavaScript sont hébergés puis appelés depuis la préférence `IntranetUserJS` ; le socle `000-pmk-config-firestore.js` doit précéder les modules qui utilisent sa configuration. Certains modules disposent de leur propre chargeur et chargent leurs ressources à la demande.

Avant utilisation, adapter les URL, les sites, les rapports SQL, les valeurs autorisées et les règles métier à l’installation cible. Les paramètres Firebase ont été remplacés par des marqueurs `YOUR_FIREBASE_…`, les mots de passe locaux par des marqueurs et les liens internes par des domaines d’exemple. Les fonctions concernées nécessitent donc une configuration locale pour fonctionner.

Pour les listes PMK, le fonctionnement existant repose sur un profil logique choisi dans Koha ; il ne nécessite pas l’ajout d’une connexion Firebase utilisateur.

Les versions de Koha compatibles restent à documenter par module. Les contrôles de syntaxe effectués ne remplacent pas des essais dans Koha. Les traitements qui modifient les données doivent être essayés sur une installation de test.

### Code à placer dans IntranetUserJS

Le fichier [IntranetUserJS.js](IntranetUserJS.js), à la racine du dépôt, contient un **chargeur d’exemple** adapté aux fichiers présents.

1. Héberger le **contenu du dossier `scripts/`** sur un serveur accessible depuis le navigateur des agents, en conservant les sous-dossiers `guides/`, `137-widgets/` et `138-pages/`.
2. Dans le chargeur, remplacer `https://koha.example.org/public/koha-scripts/` par l’URL réelle de cet hébergement, avec un `/` final. Plusieurs sous-chargeurs utilisent aussi le chemin `/public/koha-scripts/` : s’il change, adapter leurs chemins également.
3. Ouvrir **Administration → Préférences système**, puis rechercher **IntranetUserJS**.
4. Copier le contenu du fichier `IntranetUserJS.js` dans cette préférence, **sans balises `<script>`**, puis enregistrer. Sur une installation déjà personnalisée, sauvegarder le contenu existant et intégrer le chargeur sans dupliquer les appels.
5. Recharger l’interface et contrôler le chargement des modules. Modifier la valeur `REL` lors d’une mise à jour pour renouveler les URL des scripts principaux ; les ressources chargées par les sous-chargeurs peuvent avoir leur propre gestion du cache.

Le chargeur respecte l’ordre des modules du chargeur fourni. L’appel du module 018 utilise `018-element-formatting.js`, présent dans le dépôt. Les 13 autres appels absents restent en commentaire. Le tableau de bord externe, dont les fichiers ne figurent pas dans ce dépôt, n’est pas chargé.

**Le dépôt GitHub sert à distribuer les sources : son URL n’est pas l’URL d’hébergement à placer dans `base`.** Déposer les fichiers sur GitHub ne les installe pas dans Koha.

**Installation Dracénie existante : conserver le chargeur et les réglages de production.** Cette copie publique contient des paramètres neutralisés et des URL d’exemple ; elle n’est pas un remplacement direct de la version en service.

## Évolution

L’objectif est de faire évoluer progressivement cet ensemble vers un plugin configurable pour d’autres installations. Cette perspective n’est pas une affirmation de compatibilité universelle.

## Retours

Pour signaler un problème, préciser le fichier, la version de Koha, le navigateur et les étapes de reproduction, en retirant les données personnelles des exemples.

## Licence

La licence de redistribution reste à préciser. La publication du code ne vaut pas attribution automatique d’une licence ; les dépendances tierces conservent leurs conditions propres.

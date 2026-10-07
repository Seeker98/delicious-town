import type { Messages } from '../..';

const site: Messages['site'] = {
  changelogTitle: 'Journal des mises à jour',
  linksTitle: 'Liens',
  linksEmpty: 'Aucun lien pour le moment.',
  linksLoadFailed: 'Impossible de charger les liens',
  clockTitle: 'Heure actuelle (heure de Pékin)',
  nextRound: (left) => `Prochain tour dans ${left}`,
  changelog: {
    fix1007:
      'Une série de petits correctifs : dans les prédictions, les événements terminés affichent d’abord les plus récents ; aux gobelets, s’arrêter après la manche 3 fait toujours les gros titres et réussir les 4 manches est toujours annoncé à toute la ville (plus de limite d’une fois par jour), et le tableau des récompenses reste visible avec la manche en cours mise en évidence pendant que vous décidez ; les descriptions des tables du Dernier bonbon suivent les vraies règles ; la page « Les miens » des rachats indique que le dividende d’hier n’a pas encore été versé tant qu’il ne l’est pas ; les liens de connexion quotidienne et de remplissage d’huile de l’accueil sont plus faciles à toucher ; les liens de noms dans le texte sont soulignés au survol de la souris ou quand on les sélectionne au clavier',
    links1007:
      'Les liens texte de tout le jeu ressemblent désormais à ceux de l’accueil : couleur de la marque, sans soulignement, avec un « › » à la fin quand ils mènent à une autre page et un « ‹ » au début quand ils ramènent en arrière. Les actions sur la page même (renvoyer, actualiser, annuler, répondre) ont le même aspect que les liens, sans soulignement ni marge en plus',
    cup1007:
      'Le jeu des gobelets du bar change : jusqu’à 4 manches avec 2, 3, 5 puis 7 gobelets, et un dé sous un seul d’entre eux. Chaque fois que vous trouvez, vous pouvez vous arrêter et prendre la récompense de la manche, ou passer à la suivante ; si vous vous trompez, vous repartez sans rien. Plus vous allez loin, plus la récompense est grande : s’arrêter après la manche 3 fait les gros titres, et réussir les 4 manches rapporte 8 grosses récompenses et une annonce à toute la ville. Chaque partie coûte 1 bon mystère, sans hausse avec la série ; la probabilité de trouver est d’une sur le nombre de gobelets (la chance aide toujours)',
    deal1007:
      'Nouveau jeu au bar, « À prendre ou à laisser » : 10 boîtes sur la table, chacune avec des ingrédients, la plus grosse avec cinq ingrédients universels de niveau 5. Choisissez votre boîte, puis ouvrez les autres manche après manche. Après chaque manche, le banquier de la ville propose des pièces pour votre boîte : acceptez et repartez, ou continuez d’ouvrir ; si vous refusez jusqu’au bout, vous gardez le contenu de votre boîte. 10 000 pièces la partie, 3 parties par jour',
    spice1007:
      'Nouveau jeu au bar, « Mélange secret » : le barman mélange 4 condiments parmi 10 dans un ordre précis. À chaque essai, vous donnez une combinaison et recevez une réponse en A et B (A : bon condiment à la bonne place ; B : bon condiment à la mauvaise place). Vous avez jusqu’à 8 essais, et plus vous trouvez vite, meilleur est le prix : en 4 essais ou moins, gros prix, renommée et passage aux nouvelles. 2 bons mystère par partie, 5 parties par jour',
    nim1007:
      'Nouveau jeu au bar, « Le dernier bonbon » : à tour de rôle avec le barman, prenez quelques bonbons dans un tas (chaque table a sa limite) ; celui qui prend le dernier gagne. La table débutants coûte 1 bon mystère, vous choisissez qui commence et le barman se trompe parfois ; la table experts coûte 2 bons mystère, une pièce décide qui commence et le barman ne se trompe jamais. Une victoire donne de la renommée et un prix ; 10 parties par jour pour les deux tables',
    homeLinks1007:
      'Accueil réorganisé : les liens texte ont tous la couleur de la marque, sans soulignement, et finissent par « › » ; le pointage est un lien texte, une coche fine s’affiche une fois pointé et la ligne du cadeau disparaît ; remettre de l’huile est une icône avec du texte au lieu d’un bouton ; les raccourcis ustensiles, entrepôt et boutique sont remplacés par « Recettes apprises/total » et votre spécialité en vente ; une nouvelle ligne « Patrimoine » indique la valeur totale des restaurants que vous possédez, avec un lien vers les Rachats ; les nouveaux restaurants qui n’ont encore réglé aucun tour accèdent aussi à l’historique des gains et aux étages depuis l’accueil. Dans Plus, Inviter des amis (dans Mon compte), Météo (en haut à droite de l’accueil), Rachats, Étages et tables et Historique des gains disparaissent, Infos du restaurant passe dans Autres et « Ustensiles et points » devient simplement « Ustensiles »',
    npc1007:
      'La classe, les échanges et le Fonds de développement passent de la Place à la Guilde. Gros Mangeur, sur la Place, était en fait le maire : il s’appelle désormais Maire Grosse Marmite et se trouve à la Guilde, avec sa discussion quotidienne (un ingrédient et une graine), la question « où est le Garçon hip-hop » et l’échange d’objets rares. Frère 13 (klaxons quotidiens, bons d’ingrédients) et Carmen (bons d’ingrédients mystères, et un offert à la première visite) sont aussi à la Guilde ; Gary gère le Fonds de développement. Le juge Gros Mangeur devient lui aussi le Maire Grosse Marmite. Le taoïste Fan apparaît à l’expertise du temple et Kai sur la page des événements : touchez-les pour une autre réplique. La Place garde Nouvelles, Habitants et Classements',
    duel1007:
      'Les résultats du duel culinaire se lisent désormais comme l’avis des juges : chaque juge passe en revue ses critères (victoire écrasante, au coude-à-coude ou déroute totale) et donne un score ; le résultat montre aussi le plat spécial de chaque camp (« Pas de plat spécial » s’il n’y en a pas). Le juge Vieux Fauché est remplacé par Gordon, et Carmen par Joe',
    home1007:
      'Accueil plus compact : les pièces, l’EXP et l’huile du dernier tour s’affichent en icônes (celle de l’EXP est la même que sur votre barre d’EXP), avec l’historique des gains et les étages à droite de leurs lignes ; un raccourci pour améliorer le bidon d’huile est à côté de votre huile ; le pointage quotidien et les points d’activité partagent une ligne, et une coche apparaît une fois pointé. Les cartes, lignes et titres de tout le jeu sont un peu moins espacés, pour en voir plus à l’écran',
    acquire1006:
      'Nouvelle fonctionnalité « Rachats » (dans Plus) : les restaurants de 2 étoiles ou plus ont une valorisation, et vous pouvez racheter le restaurant d’un autre à ce prix. L’ancien propriétaire reçoit 90\u00a0% et 10\u00a0% part en taxe. Les restaurants rachetés versent chaque jour un dividende à leur propriétaire ; s’occuper du propriétaire une fois par jour vous rapporte 5 ingrédients et augmente son dividende de moitié. Vous pouvez racheter votre restaurant à sa valorisation, et les propriétaires peuvent le mettre en vente avec une remise ou le lâcher. La page des autres restaurants montre leur valorisation et leur propriétaire, et les rachats, achats en vente et rachats de soi-même de 10 000 000 pièces ou plus font les nouvelles',
    backlog8:
      'Dans le guide du wiki, le nombre de recettes de la Rue des débutants et de la plus grande rue, les recettes nécessaires pour 2 étoiles, les conditions de la vente à emporter et de la Bourse et le bonus d’EXP de départ suivent désormais les valeurs par défaut actuelles du jeu ; les règles du duel indiquent aussi quels attributs compte chaque note selon les pondérations actuelles',
    perf1006:
      'Le site télécharge environ 140 Ko de moins au premier chargement (la police d’icônes ne contient que les icônes utilisées), et le Marché, le Bar, l’Ichiban Kuji, le Temple et la Place s’ouvrent plus vite',
    backlog7:
      'Le nom du restaurant de M. Krab et son message d’accueil s’affichent désormais dans votre langue ; les pourcentages suivent le format de votre langue (virgule décimale et espace avant %), et le détail du taux de renforcement n’est plus collé au nombre ; « nom × quantité » ne se coupe plus sur deux lignes sur les écrans étroits ; si votre accès à la Bourse est gelé, la Bourse et les prédictions de l’activité du jour l’indiquent ; la liste des recettes du wiki affiche au plus 1 000 entrées puis propose d’affiner par recherche ou par rue, et une rue inconnue dans l’adresse affiche toutes les recettes',
    backlog6:
      'Les règles du duel indiquent le nombre de juges réellement utilisé sur ce serveur ; l’ustensile lâché par un ancien a sa propre ligne sur la carte de résultat et fait l’objet d’une nouvelle ; l’échange d’éclats des plats signature permet d’en échanger plusieurs à la fois ; le « Comment l’obtenir » des objets d’expertise mentionne les coups critiques sur le gardien du Temple ; les pages d’objets du wiki listent aussi la Promo du jour, le marché noir, les récompenses aléatoires et l’amélioration de gemmes comme sources',
    visual1006:
      'Corrections de mise en page sur mobile : le tableau des caractéristiques du détail d’ustensile a maintenant une ligne par caractéristique ; les raisons de blocage dans l’activité du jour ont leur propre ligne ; la liste déroulante d’échange d’éclats des plats signature ne déborde plus et affiche « Choisir un plat » ; la liste des bonus actifs et les lignes de fragments passent à la ligne si besoin ; la carte de résultat du duel affiche le nom traduit de l’ancien et les scores avec la virgule décimale',
    stealForget1006:
      'Rater l’espionnage d’un cours est moins sévère : au lieu d’oublier complètement (niveau du cours × 3 + 1) recettes au hasard, (niveau du cours × 2 + 1) recettes au hasard perdent 1 niveau de qualité, et seules celles de qualité Commun sont oubliées ; pour les cours de niveau 4 et plus, le risque d’oublier aussi un plat signature de niveau inférieur passe de niveau × 5 % à niveau × 2 %',
    frTimes1006:
      'Les quantités d’objets suivent maintenant la typographie française, avec des espaces autour du × (par exemple « Riz × 3 »)',
    web1006:
      'En échangeant des ingrédients avec vos amis ou M. Krab, vous pouvez chercher par nom, et ceux qui vous manquent pour vos recettes apparaissent en premier avec la quantité manquante ; l’astuce pour changer de rue sur la page des recettes peut être masquée jusqu’à la prochaine étoile ; « Tout récupérer » pour les livraisons n’apparaît que si une commande est arrivée ; toucher « Recettes » dans la barre du bas quand vous regardez une autre rue vous ramène à la vôtre ; l’onglet du fonds de développement sur la place permet de réessayer si votre restaurant ne se charge pas',
    checks1006:
      'Dans l’activité du jour, la bourse et les prédictions indiquent s’il manque encore des jours depuis l’inscription ou la vérification de l’e-mail, « Récupérer les récompenses d’événement » apparaît comme indisponible quand aucun événement n’est en cours, et les livraisons affichent le nombre d’étoiles réellement exigé par ce serveur. Les pierres bleues et vertes de rang 6 comptent désormais comme rang 6 (elles coûtaient l’énergie et les frais de retrait d’un rang 5)',
    luckGem1006:
      'Nouvelle gemme, la Pierre du destin : sertissez-la pour gagner de la chance (rangs 1 à 6 : +1, 2, 4, 8, 16, 24). Le rang 1 est vendu à la boutique (pièces), dans la Promo du jour et au marché noir, il tombe aussi des récompenses aléatoires et monte de rang comme les autres gemmes. Au bar, la chance au Chifoumi n’augmente plus que la probabilité de gagner, et il reste toujours au moins 10 % de risque de perdre ; avant, avec beaucoup de chance, on ne pouvait plus perdre',
    mcLearn1006:
      'Apprendre les plats signature est plus facile : décomposez les fragments inutiles en éclats, et 3 éclats d’un niveau donnent 1 fragment de n’importe quel plat de ce niveau. Le Sceau Délice réussit maintenant 40 % du temps au lieu de 28 %, et le Sceau de jade du Dieu de la cuisine est à la boutique (300 000). L’expertise du Temple indique comment obtenir chaque objet, et le guide a une section « Comment apprendre les plats signature »',
    power1006:
      'La page de l’équipement affiche maintenant votre puissance d’attaque et de défense en duel (avec tous les bonus de Chance et ceux des ensembles), et la Tour des chefs indique « Ma puissance d’attaque » : les deux pages concordent',
    mcTabs1006:
      'La page des plats signature a maintenant des onglets par niveau et par voie : choisissez un niveau en haut et une voie en bas, les plats appris et les fragments sont filtrés ensemble, avec le nombre sur chaque onglet. Votre choix est gardé pour la prochaine fois',
    gearIncome1006:
      'L’équipement porté (gemmes comprises) ajoute maintenant des pièces finales, de l’EXP finale et plus de chances d’obtenir des plats signature en or ; plus les caractéristiques sont élevées, plus le bonus est grand (la Créativité compte le plus, la Chance ne compte pas), et la page de l’équipement indique combien. Les plats signature se vendent plus cher aux clients selon leur niveau (niveau 3 ×2,5, niveau 4 ×3,2), car ceux de niveau 2 à 5 ne remboursaient pas le prix de leurs ingrédients. Les duels culinaires utilisent toujours la valeur d’origine par portion',
    elders1006:
      'Les gardiens de la Tour des chefs sont maintenant des Anciens : chaque étage porte son propre équipement complet (+3 à +6) et les points d’attribut de son niveau, que vous pouvez déplier pour les voir. Une vraie victoire peut faire tomber une pièce de l’ensemble de l’Ancien (20 % aux étages 1 à 3, moins plus haut). Les étages 1 et 2 sont un peu plus durs qu’avant et les étages 6 à 10 nettement plus faciles. Le bonus aléatoire de la Créativité dans les duels culinaires baisse un peu et ne vaut plus davantage que les autres attributs',
    duel1006:
      'Les duels culinaires (Tour des chefs, Classement des chefs et duels entre amis) sont maintenant départagés par des juges : à chaque duel, 5 des 10 juges sont tirés au sort, chacun regarde quelques-unes des cinq notes, et le premier camp à 3 voix gagne. De meilleurs attributs sont maintenant bien plus fiables ; la Créativité et la Chance ajoutent un bonus aléatoire. Voir « Règles du duel culinaire » sur la page de la Tour des chefs',
    barPrize1006:
      'Gagner au bar au Chifoumi, aux Gobelets, au Cocktail Mémoire et aux Fléchettes rapporte maintenant surtout des ingrédients au lieu de petites sommes de pièces et d’EXP. Plus la victoire est difficile (série plus longue, niveau plus avancé, fléchettes parfaites), plus l’ingrédient est de haut niveau et plus il a de chances d’être rare',
    align1006:
      'L’étiquette du type de rue (pièces, équilibrée ou EXP) sur les pages des recettes et du déménagement est maintenant alignée avec le texte du bonus',
    krab1006:
      'Le garde-manger de M. Krab est maintenant bien rempli : tous les ingrédients de niveau 1 à 5, jusqu’à des centaines pour les plus courants et moins pour les rares, réapprovisionnés chaque jour. Le nombre d’échanges quotidiens avec M. Krab ne change pas',
    guide1006:
      'Le wiki du jeu a maintenant un guide de jeu : trois rythmes de jeu, quoi faire à chaque connexion, quand déménager et où dépenser ses pièces en premier. La page des recettes suggère de déménager quand votre rue n’a pas assez de recettes pour l’étoile suivante',
    batch9:
      'Chaque réassort du marché ajoute désormais un ingrédient dont ont besoin les recettes de la Rue des débutants (Treize épices, Tofu, Sucre candi…) : les nouveaux joueurs ne restent plus bloqués des jours. La page des recettes, la page de déménagement et le wiki du jeu indiquent si une rue est à pièces, équilibrée ou à EXP, et d’où vient son bonus',
    streets1005:
      'Bonus des rues rééquilibrés : les rues qui rapportent plus de pièces donnent moins d’EXP et inversement, et les revenus totaux des rues sont bien plus proches. Cela s’applique aussi aux restaurants déjà installés : les pièces baissent le plus rue du Guangdong et rues Fusion I et II, et l’EXP monte le plus rue du Shandong, rue de Grèce et rue Chop Suey (voir le bonus de rue sur la page de déménagement). Sous le niveau 40, l’EXP de chaque tour reçoit un bonus, +200 % au niveau 1 et de moins en moins à chaque niveau : les nouveaux joueurs montent plus vite',
    hostLimit1005:
      'Chaque joueur ne peut désormais fouiller que quelques emplacements par restaurant et par jour, et écraser que quelques cafards par jour chez un même ami (pas de limite chez vous ni chez M. Krab). Le garde-manger et le restaurant de l’ami indiquent ce qu’il vous reste aujourd’hui',
    browse1005:
      'En revenant d’une recette ou d’une fiche du wiki, la rue, les filtres et la page sont conservés. La page des recettes affiche le bonus de la rue choisie. Toucher un cafard que vous avez posé indique que vous ne pouvez pas l’écraser vous-même',
    renumber1005:
      'Les objets, ingrédients et recettes ont été renumérotés par catégorie : les identifiants du wiki du jeu et de l’API ouverte ont changé, et les anciens liens du wiki redirigent vers les nouveaux. Vos objets, vos recettes apprises et votre historique ne changent pas',
    retire1005:
      "Wiki du jeu : 117 anciens objets impossibles à obtenir en jeu (ustensiles et médailles réservés à certains joueurs du jeu d'origine, un paquet de test et un ancien paquet de mise à jour) ne sont plus listés ; ceux qui les possèdent déjà les gardent et peuvent toujours s'en servir",
    tasks1005:
      "Tâches : les activités soumises à un niveau (bourse, prédictions…) ou fermées sur ce serveur s'affichent verrouillées ; la bulle de l'heure se ferme en touchant ailleurs ; l'icône du courrier est alignée",
    looks1005:
      "Apparence : désormais, les portes achetées (et celle installée actuellement) vous appartiennent, y revenir est gratuit ; les messages d'étoiles insuffisantes indiquent vos étoiles actuelles ; le wiki indique les étoiles requises pour les affiches et trophées",
    visual1005:
      "Anglais, français et espagnol : le singulier et le pluriel suivent le nombre (1 pièce, 1 jour…) ; sur mobile, les caractéristiques des ustensiles tiennent sur un écran, les effets météo ne sont plus répétés et les durées de plus d'un jour s'affichent en jours",
    perf1005:
      "La page d'accueil, les tâches et le badge des événements se chargent plus vite ; le catalogue des objets n'est plus retéléchargé s'il n'a pas changé",
    rules1005:
      "Ichiban Kuji : le premier lot ouvert à minuit le 1er du mois prend le thème et les titres du nouveau mois ; les remboursements du Fonds de développement sont arrondis plus précisément ; une erreur au règlement du Pronostic du marché n'annule plus la question du marché dans Prédictions",
    wiki1005:
      'Wiki du jeu : les ustensiles affichent leurs bonus de set et les gemmes le nom du rang suivant ; changer vite de page sur un réseau lent ne mélange plus les pages, et les erreurs de chargement sont signalées',
    fixes1005:
      'Petites corrections : la ligne du Maire se débloque seule à l’heure du Hip-hop Boy ; les dépôts et retraits du Fonds apparaissent dans votre journal ; les affiches et trophées pas encore utilisables sont grisés dans le choix des installations',
    posters:
      'La boutique ajoute 4 nouveaux niveaux d’affiches et de trophées du Dieu de la cuisine, disponibles dès 4, 6, 8 et 10★, pour des bonus de pièces et d’EXP qui suivent en fin de partie',
    scarcity:
      'Les ingrédients aléatoires ont une chance d’être justement ceux qui manquent à vos recettes, plus souvent avec une chance élevée ; les récompenses du Bar et de la Tour peuvent donner des ingrédients rares',
    site: 'Ajout d’un journal des mises à jour et d’une page de liens ; la barre du haut affiche l’heure',
    oilToast:
      'Chaque table occupée consomme au moins 1 huile ; les messages s’affichent en haut et ne cachent plus les boutons',
    fund: 'Nouveau Fonds de développement sur la Place : déposez des pièces 7 jours, récupérez 90 % plus une médaille d’EXP et un titre temporaire',
    kujiDeluxe:
      'L’Ichiban Kuji ajoute un tirage de luxe ; le prix A et le dernier prix donnent le titre limité du mois',
    titleShop: 'Nouvelle boutique de titres dans Apparence : des titres temporaires contre des pièces',
    coinSink:
      'Économie : plats moins chers, ingrédients de haut niveau plus chers, des pièces pour monter en étoiles et déménager',
    newbiePack:
      'Pack de bienvenue et tickets d’ingrédient aléatoire niv. 1 à 5 ; les anciens restaurants l’obtiennent avec le code XINSHOULIBAO',
    wiki: 'Nouveau wiki du jeu : objets, ingrédients, recettes, ustensiles et rues',
    quests:
      'Quêtes refaites : chapitres, quêtes annexes et hebdomadaires, plus une liste du jour sur l’accueil',
    newStreets:
      '16 nouvelles rues étrangères et plus de mille recettes ; on n’apprend que les plats de sa rue',
    languages: 'Disponible en chinois traditionnel, anglais, français et espagnol',
    craft: 'La fusion ne tire plus les ingrédients dont votre placard est déjà plein',
    home: 'Page d’accueil repensée',
    exchange:
      'Ouverture de la Bourse : échangez des ingrédients rares entre joueurs ; les niv. 3 à 5 se vendent au système',
    predict: 'Ouverture des prédictions : achetez et vendez des parts « oui/non », réglées au résultat',
    kuji: 'Ouverture de l’Ichiban Kuji, avec des figurines limitées à thème chaque mois',
    activities:
      'Événements temporaires : objectifs, grille, passe de combat, échanges, objectifs et bonus de serveur',
  },
};
export default site;

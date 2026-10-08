import type { Messages } from '../..';

const site: Messages['site'] = {
  changelogTitle: 'Journal des mises à jour',
  linksTitle: 'Liens',
  linksEmpty: 'Aucun lien pour le moment.',
  linksLoadFailed: 'Impossible de charger les liens',
  clockTitle: 'Heure actuelle (heure de Pékin)',
  nextRound: (left) => `Prochain tour dans ${left}`,
  changelog: {
    robust1008:
      "Si le dividende de rachat n'est pas versé, il est retenté 10 minutes plus tard (avant, il fallait attendre le lendemain)\u202f; ouvrir une nouvelle page hors ligne affiche désormais un message au lieu de ne rien faire\u202f; l'horloge en haut se resynchronise avec le serveur quand vous revenez dans l'appli\u202f; après une déconnexion ou un changement de compte, les pastilles du courrier et des demandes d'ami n'affichent plus les chiffres du compte précédent",
    ux1008:
      "En changeant de page, on revient en haut (avant, on restait à la hauteur de la page précédente)\u202f; «\u202fN points à répartir\u202f» dans les Infos du restaurant mène directement au cadre des points de la page Ustensiles\u202f; en choisissant les ingrédients d'épreuve, ceux qui ne suffisent pas parce que le plat les utilise aussi sont grisés avec la raison, et une recherche sans résultat l'indique\u202f; la pénalité du Kraken sur la valeur d'épreuve s'applique à la valeur réellement prise en compte\u202f; sur mobile, le lien vers l'activité de la page des Quêtes passe au-dessus des onglets quand il ne tient pas\u202f; et quelques petites corrections sur des boutons et des textes pour lecteurs d'écran",
    zhComma1008:
      "Texte chinois\u202f: les virgules deviennent une virgule anglaise suivie d'une espace, pour gagner de la place",
    gemStrength1008:
      "Page des gemmes\u202f: le «\u202fÉnergie\u202f: N\u202f» à la fin de l'explication est désormais sur sa propre ligne, «\u202fMon énergie\u202f: N\u202f», pour préciser qu'il s'agit de votre énergie actuelle",
    perf1008:
      "Pages plus rapides à charger\u202f: moins d'allers-retours inutiles avec le serveur\u202f; l'accueil du restaurant, l'Historique des gains, les Infos du restaurant, les Recettes et les Rachats chargent leurs données en même temps\u202f; en rouvrant le jeu, les fichiers déjà téléchargés sont réutilisés",
    pages1008:
      "Page des revenus\u202f: l'historique est désormais en haut, avec les totaux du jour et une colonne Clients, et les bonus sont regroupés dans une section dépliable qui n'affiche que ceux différents de 0\u202f; les liens entre les Quêtes et la page d'activité n'occupent plus une ligne à part\u202f; la page Équipement affiche d'abord les emplacements et les boutons, et les explications sur la puissance et le reste passent dans «\u202fComment ces chiffres sont calculés\u202f»\u202f; le détail d'un ustensile n'affiche que les caractéristiques non nulles et indique clairement quand il ne peut pas recevoir de gemmes",
    fixes1008:
      "Les comptes à rebours et les temps restants suivent désormais l'heure du serveur, même si l'horloge de votre appareil est décalée\u202f; remplacer un équipement qui n'a pas expiré demande toujours confirmation\u202f; dans l'Historique des objets, les entrées qui ne sont pas d'aujourd'hui affichent la date\u202f; les grands nombres de progression des quêtes ont un séparateur de milliers\u202f; la quête principale «\u202fPlacer un équipement\u202f» mène désormais à l'accueil\u202f; Progression des recettes affiche «\u202fChargement\u202f» pendant le chargement",
    tasksSplit1008:
      "Le pointage et l'activité du jour ont désormais leur propre page, ouverte depuis les points d'activité de l'accueil\u202f; la page Quêtes a trois onglets (Principale, Hebdo, Secondaires), avec une icône cadeau sur ceux qui ont des récompenses à récupérer, et s'ouvre depuis le nouveau lien Quêtes sur la ligne de la quête principale de l'accueil\u202f; l'entrée Quêtes a été retirée du menu Plus",
    cookbookProgress1008:
      'La page Recettes propose une Vue d’ensemble de la progression\u202f: la progression totale par qualité, puis, rue par rue, le nombre de recettes de chaque qualité ou mieux, avec votre rue actuelle mise en évidence et les cases complètes en vert',
    gameTime1008:
      "Toutes les heures affichées dans le jeu (nouvelles de la ville, courrier, forum, fil des amis, historique de l'entrepôt, etc.) sont désormais à l'heure de Pékin, comme l'horloge en haut de la page, et non plus selon le fuseau horaire de votre appareil\u202f; le guide du débutant précise que l'énergie se recharge d'un point toutes les 10 minutes",
    renownTicket1008:
      'La boutique de renommée de la Tour des chefs propose désormais en permanence des Tickets d’ingrédient aléatoire niv. 4 (50 de renommée, 3 par semaine) et niv. 5 (80 de renommée, 2 par semaine)',
    economy1008:
      'Quelques façons de transformer des objets en pièces ont été ajustées\u202f: les objets qui ont un prix en diamants, quelle que soit leur provenance, se revendent à la boutique au plus 2\u202f000 pièces par diamant\u202f; les Pièces d’or du marché noir coûtent désormais 50 diamants\u202f; les tickets de l’Ichiban Kuji coûtent désormais 40\u202f000 pièces\u202f; les Bons d’ingrédient mystère, les Bons d’ingrédient mystère au hasard, toutes les cartes d’exploration et les Éclats de fragment ne se revendent plus à la boutique, ils servent seulement à être utilisés\u202f; la Bourse n’achète plus les ingrédients de niveau 7 (son stock existant reste en vente)',
    business1008:
      'Nouvelle ligne de quêtes secondaires «\u202fGestion\u202f» (dès le chapitre 2)\u202f: ajouter des tables, améliorer le bidon d’huile, installer des équipements, rester ouvert de nombreux tours en une journée et gagner de 100\u202f000 à 1\u202f000\u202f000 pièces de règlement en une journée. Les pièces et les tours comptent votre meilleure journée\u202f; une journée compte une fois totalisée, juste après minuit',
    sideB1008:
      'Encore des quêtes secondaires\u202f: nouvelles lignes Recettes mystères, Gardien, Gardiens de la tour, Devinettes du Marché, Livraison experte, Acquisitions, Gemmes, Collection, Pointage et activité et Social\u202f; la ligne Ville ajoute le Fonds de développement, la question du Maire, le classement hebdomadaire du Garçon hip-hop, le Marteau de Thor et la Lampe magique\u202f; la ligne Temple ajoute la faveur du Kraken, les tentacules et 50 repas. Les séries de pointage comptent votre plus longue série, et les pointages des 30 derniers jours sont déjà pris en compte',
    sideA1008:
      'Plus de quêtes secondaires\u202f: la ligne du bar comprend l’essai de chaque nouveau jeu et 500 puis 2\u202f000 parties\u202f; deux nouvelles lignes, «\u202fChance au bar\u202f» (séries au chifoumi, Gobelets réussis, Piment du Diable, 100 parties de machine à sous…) et «\u202fAs du bar\u202f» (fléchettes, Cocktail Mémoire, Le dernier bonbon, Mélange secret, À prendre ou à laisser)\u202f; la Bourse ajoute les échanges avec le système, la vente à prix bradé au système, l’achat et la vente d’ingrédients rares et 500 échanges\u202f; les prédictions ajoutent la revente anticipée, la détention de 100 et 200 parts, et un gain ou une perte d’un certain montant en un règlement\u202f; l’Ichiban Kuji ajoute le tirage d’un Prix A et l’Ichiban Kuji de luxe\u202f; Chez soi partout ajoute des quêtes de la rue Chop Suey, la dernière étant «\u202fMal du pays\u202f»\u202f: apprendre tous ses plats',
    krab1008:
      'Les Pièces Krab ne peuvent plus être revendues à la boutique\u202f; elles servent uniquement à la machine à sous et à l’échange du maire',
    quest1008:
      'Changements de quêtes\u202f: passer à 1 étoile donne aussi 1 Recette mystère, 1 Sceau Délice, 1 Carte d’exploration et 9 [Niveau 1]•Éclat de fragment (de quoi échanger une spécialité de niveau 1)\u202f; la recette et la carte que donnaient les quêtes d’expertise et d’exploration sont déplacées ici\u202f; passer à 2 étoiles donne aussi 1 Pass à emporter\u202f; dès 1 étoile, les quêtes hebdomadaires comprennent «\u00a0Récupérer les cartes d’exploration de la semaine\u00a0», 3 cartes par semaine\u202f; la quête «\u00a0réunir 4 plantes en pot\u00a0» disparaît et le Dernier Prix de l’Ichiban Kuji donne en plus 1 Krabby Patty\u202f; le chapitre «\u00a0La voie des festins divins\u00a0» et «\u00a0Monter une recette en Mets divin\u00a0», pas encore faisables, sont masqués pour l’instant',
    rank1008:
      'Les classements de séries au chifoumi, aux gobelets et à la roue des numéros prennent maintenant la meilleure série atteinte dans la semaine, avec un tableau pour cette semaine et un pour la semaine dernière\u202f: perdre une partie ne fait plus sortir du classement, et une série qui continue après le lundi compte toujours, dans la semaine où elle a atteint ce nombre\u202f; à égalité, le premier arrivé passe devant',
    odds1007:
      'Le cadeau de connexion quotidienne donne maintenant 1 à 5 diamants quand il en donne (1 à 3 avant)\u202f; sous le tableau des lots de la machine à sous, une note précise que les probabilités sont par case sans le lot garanti, et en combien de tirages tombe en moyenne un lot rare en le comptant',
    misc1007d:
      'Les cartes d’agrandissement petite, moyenne et grande sont maintenant à la boutique (30\u202f000, 120\u202f000 et 200\u202f000 pièces)\u202f; l’échange du maire affiche d’abord l’illimité, puis ce que vous pouvez échanger, ce qui vous manque et ce qui est épuisé, du moins cher au plus cher dans chaque groupe\u202f; quand un rachat est bloqué, le message précise que c’est parce que vous vous êtes connectés récemment depuis le même appareil ou réseau\u202f; après une mise à jour, une ancienne page qui n’arrive pas à en ouvrir une nouvelle se recharge une fois',
    retire1007:
      'Un lot d’objets inutilisés a été retiré\u202f: ils n’apparaissent plus dans la boutique, au marché noir, dans la promo du jour ni dans aucune récompense. Ceux que vous possédez déjà restent affichés et peuvent être utilisés ou vendus',
    cluster1007:
      'Changements du gardien du temple\u202f: le «\u202fMissile rapide\u202f» reprend son nom d’origine, «\u202fMissile à fragmentation\u202f», et inflige 3200 par tir au lieu de 2000 (un peu moins que 36 missiles standard)\u202f; le missile standard passe à 2400 pièces\u202f; la récompense pour avoir vaincu le gardien augmente avec ses PV, donc plus d’étoiles donnent plus d’ingrédients et plus de chances d’ingrédients mystère (parfois plusieurs). La valeur d’épreuve plafonne désormais à 30\u202f% au lieu de 50\u202f% (au-delà, elle compte pour 30\u202f%), et les duels de la tour et entre amis ne comptent plus la valeur d’épreuve',
    ui1007c:
      'Épreuves du temple\u202f: l’ingrédient principal et le secondaire sont maintenant deux cases au-dessus d’une liste d’ingrédients groupée par niveau, avec recherche\u202f; les niveaux inférieurs au plat sont repliés. Bons d’ingrédient de Frère 13\u202f: les niveaux sont des boutons qui indiquent combien de bons vous avez, les ingrédients qui manquent à votre rue et ceux que vous n’avez pas passent en premier, avec combien vous en avez et combien il en manque, et on choisit avec +',
    batch1007b:
      'Les échanges avec les amis passent à 10 par jour tous amis confondus, et chaque joueur peut être sollicité au plus 20 fois par jour, quel que soit le nombre d’étoiles (avec beaucoup d’étoiles, vous gardez au moins 3 échanges avec M. Krab)\u202f; les gemmes sont renommées par rang\u202f: pierre brute, spirituelle et divine, puis jade brut, spirituel et divin\u202f; une icône cadeau à côté de l’activité du jour sur l’accueil signale une récompense à récupérer\u202f; en classe, on peut filtrer les plats signature par niveau pour ouvrir un cours\u202f; le marché de luxe ferme pour l’instant\u202f; dans la boutique de la tour, les statues affichent «\u202f1 max\u202f» à la place de la quantité',
    parens1007:
      'Dans l’interface en chinois (y compris les descriptions d’objets et les noms de recettes), les parenthèses pleine chasse sont maintenant des parenthèses normales avec une espace de chaque côté, pour faire tenir plus de texte par ligne',
    ui1007:
      'Petits ajustements d’interface : À prendre ou à laisser liste maintenant les boîtes ouvertes à chaque manche et leur contenu ; le « Récupérer » de la quête principale sur l’accueil est maintenant une icône cadeau avec du texte, et les boutons verts ailleurs prennent la couleur de la marque ; les filtres par niveau et par voie des plats signature sont maintenant de petites pastilles ; les plats signature ne sont plus dans « Plus » : on y accède depuis l’accueil',
    misc1007:
      'La discussion quotidienne avec Sœur Wen a déménagé de la place au bar ; le Pack d’ingrédient universel au hasard ne donne plus qu’un ingrédient universel, et le Pack de départ offre aussi 10 ingrédients universels de niveau 1, 10 de niveau 2 et 5 de niveau 3 ; les cafards posés par des amis partent d’eux-mêmes au bout de 4 heures au plus ; les ingrédients de niveau 6 ne peuvent plus être échangés à la bourse pour l’instant, et leurs ordres en cours sont retirés et rendus sur votre compte de bourse ; la tâche « Manger gratis » compte dès que vous commencez ; le frigo affiche aussi le niveau de chaque ingrédient et combien il en faut encore pour votre rue ; le remplissage d’huile utilise une icône de goutte',
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

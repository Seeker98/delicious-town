import type { Messages } from '../..';

const site: Messages['site'] = {
  changelogTitle: 'Journal des mises à jour',
  linksTitle: 'Liens',
  linksEmpty: 'Aucun lien pour le moment.',
  linksLoadFailed: 'Impossible de charger les liens',
  clockTitle: 'Heure actuelle (heure de Pékin)',
  nextRound: (left) => `Prochain tour dans ${left}`,
  changelog: {
    batch9:
      'Chaque réassort du marché ajoute désormais un ingrédient dont ont besoin les recettes de la Rue des débutants (Treize épices, Tofu, Travers de porc…) : les nouveaux joueurs ne restent plus bloqués des jours. La page des recettes, la page de déménagement et le wiki du jeu indiquent si une rue est à pièces, équilibrée ou à EXP, et d’où vient son bonus',
    streets1005:
      'Bonus des rues rééquilibrés : les rues qui rapportent plus de pièces donnent moins d’EXP et inversement, et les revenus totaux des rues sont bien plus proches. Cela s’applique aussi aux restaurants déjà installés : les pièces baissent le plus rue du Guangdong et rues Fusion I et II, et l’EXP monte le plus rue du Shandong, rue de Grèce et rue Chop Suey (voir le bonus de rue sur la page de déménagement). Sous le niveau 40, l’EXP de chaque tour reçoit un bonus, +200 % au niveau 1 et de moins en moins à chaque niveau : les nouveaux joueurs montent plus vite',
    hostLimit1005:
      'Chaque joueur peut désormais fouiller au plus 3 emplacements par restaurant et par jour, et écraser au plus 3 cafards par jour chez un même ami (pas de limite chez vous ni chez M. Krab). Le garde-manger et le restaurant de l’ami indiquent ce qu’il vous reste aujourd’hui',
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

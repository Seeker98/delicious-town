import type { Messages } from '../..';

const guide: Messages['guide'] = {
  title: 'Guide',
  wikiHint: 'Un objet, un ingrédient, une recette ? Voir les données du jeu',
  codes: 'Codes de bienvenue',
  codesNoRest:
    'Disponibles une fois que vous avez rejoint un serveur et ouvert un restaurant. Chaque restaurant peut récupérer chaque code une fois.',
  codesNote: 'Chaque restaurant peut récupérer chaque code une fois, dès que son niveau est suffisant.',
  minLevel: (n) => `Dès le niveau ${n}`,
  take: 'Récupérer',
  taken: 'Récupéré',
  ended: 'Terminé',
  unavailable: 'Indisponible pour le moment',
  took: (text) => `Récupéré : ${text}`,
  takeFailed: 'Impossible de récupérer',
  loadFailed: 'Impossible de charger les codes de bienvenue',
  start: 'Premier jour',
  startItems: [
    [
      "Votre restaurant tourne tout seul : il fait ses comptes à chaque tour, et les clients s'installent à vos tables. Plus de tables, plus de plats appris et des recettes de meilleure qualité rapportent plus de pièces et d'EXP.",
    ],
    [
      "Le service consomme de l'huile, et le restaurant ferme quand il n'y en a plus : pensez à en remettre sur la page d'accueil.",
    ],
    [
      'Les ingrédients servent à apprendre des recettes, cuisiner des plats signature et préparer les commandes à emporter. Achetez-les au ',
      { to: '/market', text: 'Marché' },
      ', mais vérifiez d’abord qu’il reste de la place dans le garde-manger.',
    ],
    [
      "L'énergie se recharge à chaque tour. Apprendre des plats signature, défier la Tour des chefs, écraser des cafards, etc. coûtent de l'énergie ; les cartes d'énergie la rechargent.",
    ],
    [
      'Commencez par : répartir vos points dans ',
      { to: '/rest/equip', text: 'Ustensiles' },
      ", remettre de l'huile sur la page d'accueil, apprendre de nouveaux plats dans ",
      { to: '/cookbooks', text: 'Recettes' },
      ", puis pointer sur la page d'accueil.",
    ],
    [
      'Les étoiles, les déménagements et les changements de nom se font à la ',
      { to: '/society', text: 'Guilde' },
      '.',
    ],
    [
      'Suivez les ',
      { to: '/rest/tasks', text: 'Quêtes' },
      " : la quête principale compte 12 chapitres, chacun avec quelques quêtes à faire dans n'importe quel ordre. Récupérez-les toutes, puis la récompense du chapitre ; le chapitre suivant se débloque à un certain niveau ou nombre d'étoiles. Chaque nouvelle fonctionnalité ouvre ses quêtes secondaires, et il y a des quêtes hebdomadaires selon vos étoiles.",
    ],
  ],
  daily: 'Chaque jour',
  dailyItems: [
    { to: '/', text: "Pointer sur la page d'accueil : une fois par jour, pour un pack de pointage" },
    {
      to: '/rest/tasks',
      text: "Tâches et activité : faites les tâches du jour pour gagner des points d'activité et récupérer leurs récompenses ; les quêtes hebdomadaires repartent le lundi à 0 h",
    },
    {
      to: '/town',
      text: 'Place : secouez la bourse de M. Krab',
    },
    {
      to: '/society/mayor',
      text: 'Guilde : discutez chaque jour avec le Maire Grosse Marmite (ingrédient et graine) et dites-lui où est le Garçon hip-hop ; Frère 13 donne des klaxons chaque jour ; Carmen offre un bon d’ingrédient mystère à la première visite',
    },
    {
      to: '/yard',
      text: 'Potager : plantez, arrosez, chassez insectes et mauvaises herbes, récoltez à temps, et volez dans les potagers de vos amis',
    },
    {
      to: '/market',
      text: 'Marché : le marché du jour se renouvelle toutes les deux heures en journée, le marché des promos toutes les heures et le marché de luxe trois fois par jour',
    },
    {
      to: '/bar',
      text: 'Bar : discutez une fois par jour avec Sœur Wen pour des bons mystère ; quelques mini-jeux par jour, et Cocktail Mémoire et fléchettes donnent des récompenses',
    },
    {
      to: '/tower',
      text: 'Tour des chefs : défiez les gardiens de la tour pour de la renommée, à dépenser dans la boutique de renommée',
    },
    {
      to: '/takeaway',
      text: 'À emporter : prenez et livrez des commandes pour des pièces ; votre livreur progresse aussi',
    },
  ],
  faq: 'Questions fréquentes',
  faqItems: [
    {
      q: 'Contre quoi échanger les ingrédients universels ? ',
      a: [
        "Échangez-les dans le garde-manger : 2 ingrédients universels de niveau 1 contre 1 ingrédient rare de niveau 2 au hasard, 2 de niveau 2 contre 1 ingrédient rare de niveau 3 au hasard. Ceux de niveau 3 et plus ne s'échangent pas : ils peuvent seulement remplacer un ingrédient manquant de même niveau pour apprendre une recette.",
      ],
    },
    {
      q: 'Et s’il me manque toujours le même ingrédient ?',
      a: [
        'Les ingrédients aléatoires (packs cadeaux, tickets d’ingrédient aléatoire, Combiner, récompenses du Bar et de la Tour, Temple, le Maire Grosse Marmite) ont une chance d’être justement celui qui manque à votre prochaine recette, et plus votre chance est élevée, plus c’est probable. Vous pouvez aussi le remplacer par un ingrédient universel, ou l’acheter au Marché ou à la Bourse (la Bourse ne vend que des ingrédients rares).',
      ],
    },
    {
      q: 'Comment rendre ses ustensiles plus forts ? ',
      a: [
        "Le renfort peut échouer. Les ustensiles haut de gamme demandent un niveau minimum : on ne peut pas les équiper avant de l'atteindre.",
      ],
    },
    {
      q: 'Quelle différence entre les rues ? ',
      a: [
        'La médaille de chaque rue donne un bonus différent. Les déménagements se font à la ',
        { to: '/society', text: 'Guilde' },
        '.',
      ],
    },
    {
      q: 'Des règles pour les noms et les annonces ? ',
      a: [
        "Pas de noms de PNJ, pas d'insultes ni de publicité. Après un signalement confirmé, le nom est changé d'office ou l'annonce effacée.",
      ],
    },
    {
      q: 'Où utiliser un code cadeau ? ',
      a: ['« Plus → Autres → Code cadeau », ou le champ en haut de la boîte aux lettres.'],
    },
    {
      q: 'Faut-il attendre le résultat d’une prédiction ? ',
      a: [
        "Non. Avant l'échéance, vous pouvez vendre vos parts au prix actuel à tout moment : vendez pour limiter la perte si vous pensez vous être trompé, ou pour prendre le gain quand le prix vous convient.",
      ],
    },
    {
      q: 'Comment obtenir des diamants ? ',
      a: [
        "Le pack de pointage quotidien peut en contenir ; les récompenses d'activité de 100 et 150 points ; ",
        { to: '/rest/tasks', text: 'les quêtes hebdomadaires' },
        ' ; les packs du classement des chefs et du classement mensuel d’affinité du Kraken ; les prix A, B, C et Dernier Prix de l’Ichiban Kuji ; les amis invités qui atteignent les niv. 10 et 30 ; un message du forum mis en avant ; les récompenses d’événements et les codes cadeaux.',
      ],
    },
    {
      q: 'Comment obtenir des Krabby Patty, et à quoi servent-ils ? ',
      a: [
        'On peut en gagner à la machine à sous du ',
        { to: '/bar', text: 'Bar' },
        ' ; secouer la bourse de M. Krab sur la place en fait parfois tomber un ; la quête secondaire « Réussir une Épreuve » en donne un aussi. Échangez-les contre des objets rares auprès du ',
        { to: '/society/mayor', text: 'Maire Grosse Marmite, à la Guilde' },
        '.',
      ],
    },
  ],
  rules: 'Règles du jeu',
  rulesItems: [
    'Interdit d’utiliser plusieurs comptes pour amasser des ressources ou de transférer des ressources entre comptes.',
    'Interdit de profiter des bugs. Si vous en trouvez un, signalez-le aux administrateurs dans la section « Suggestions » du forum, sans décrire comment faire, et ne l’exploitez pas.',
    'Insultes, publicité, contenus illégaux ou inappropriés interdits. Vous pouvez signaler ce genre de messages, klaxons, noms de restaurant et annonces.',
    'Les infractions entraînent un bannissement de 1 jour, 7 jours ou définitif.',
    "Les statistiques de l'administration ne sont que des indices ; chaque sanction est vérifiée par une personne.",
  ],
};
export default guide;

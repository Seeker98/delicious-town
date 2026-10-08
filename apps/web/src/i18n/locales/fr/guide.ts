import type { Messages } from '../..';

const guide: Messages['guide'] = {
  title: 'Guide',
  wikiHint: 'Un objet, un ingrédient, une recette\u202f? Voir les données du jeu',
  codes: 'Codes de bienvenue',
  codesNoRest:
    'Disponibles une fois que vous avez rejoint un serveur et ouvert un restaurant. Chaque restaurant peut récupérer chaque code une fois.',
  codesNote: 'Chaque restaurant peut récupérer chaque code une fois, dès que son niveau est suffisant.',
  minLevel: (n) => `Dès le niveau ${n}`,
  take: 'Récupérer',
  taken: 'Récupéré',
  ended: 'Terminé',
  unavailable: 'Indisponible pour le moment',
  took: (text) => `Récupéré\u202f: ${text}`,
  takeFailed: 'Impossible de récupérer',
  loadFailed: 'Impossible de charger les codes de bienvenue',
  start: 'Premier jour',
  startItems: [
    [
      "Votre restaurant tourne tout seul\u202f: il fait ses comptes à chaque tour, et les clients s'installent à vos tables. Plus de tables, plus de plats appris et des recettes de meilleure qualité rapportent plus de pièces et d'EXP.",
    ],
    [
      "Le service consomme de l'huile, et le restaurant ferme quand il n'y en a plus\u202f: pensez à en remettre sur la page d'accueil.",
    ],
    [
      'Les ingrédients servent à apprendre des recettes, cuisiner des plats signature et préparer les commandes à emporter. Achetez-les au ',
      { to: '/market', text: 'Marché' },
      ', mais vérifiez d’abord qu’il reste de la place dans le garde-manger.',
    ],
    [
      "L'énergie se recharge d'un point toutes les 10 minutes (2 quand la chance sourit) jusqu'au maximum. Apprendre des plats signature, défier la Tour des chefs, écraser des cafards, etc. coûtent de l'énergie\u202f; les cartes d'énergie la rechargent.",
    ],
    [
      'Commencez par\u202f: répartir vos points dans ',
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
      "\u202f: la quête principale avance chapitre par chapitre, chacun avec quelques quêtes à faire dans n'importe quel ordre. Récupérez-les toutes, puis la récompense du chapitre\u202f; le chapitre suivant se débloque à un certain niveau ou nombre d'étoiles. Chaque nouvelle fonctionnalité ouvre ses quêtes secondaires, et il y a des quêtes hebdomadaires selon vos étoiles.",
    ],
  ],
  daily: 'Chaque jour',
  dailyItems: [
    { to: '/', text: "Pointer sur la page d'accueil\u202f: une fois par jour, pour un pack de pointage" },
    {
      to: '/rest/activation',
      text: "Activité du jour\u202f: faites les tâches du jour pour gagner des points d'activité et récupérer leurs récompenses",
    },
    {
      to: '/town',
      text: 'Place\u202f: secouez la bourse de M. Krab',
    },
    {
      to: '/society/mayor',
      text: 'Guilde\u202f: discutez chaque jour avec le Maire Grosse Marmite (ingrédient et graine) et dites-lui où est le Garçon hip-hop\u202f; Frère 13 donne des klaxons chaque jour\u202f; Carmen offre un bon d’ingrédient mystère à la première visite',
    },
    {
      to: '/yard',
      text: 'Potager\u202f: plantez, arrosez, chassez insectes et mauvaises herbes, récoltez à temps, et volez dans les potagers de vos amis',
    },
    {
      to: '/market',
      text: 'Marché\u202f: le marché du jour se renouvelle toutes les deux heures en journée et le marché des promos toutes les heures',
    },
    {
      to: '/bar',
      text: 'Bar\u202f: discutez une fois par jour avec Sœur Wen pour des bons mystère\u202f; quelques mini-jeux par jour, et Cocktail Mémoire et fléchettes donnent des récompenses',
    },
    {
      to: '/tower',
      text: 'Tour des chefs\u202f: défiez les gardiens de la tour pour de la renommée, à dépenser dans la boutique de renommée',
    },
    {
      to: '/takeaway',
      text: 'À emporter\u202f: prenez et livrez des commandes pour des pièces\u202f; votre livreur progresse aussi',
    },
  ],
  faq: 'Questions fréquentes',
  faqItems: [
    {
      q: 'Contre quoi échanger les ingrédients universels\u202f? ',
      a: [
        "Échangez-les dans le garde-manger\u202f: 2 ingrédients universels de niveau 1 contre 1 ingrédient rare de niveau 2 au hasard, 2 de niveau 2 contre 1 ingrédient rare de niveau 3 au hasard. Ceux de niveau 3 et plus ne s'échangent pas\u202f: ils peuvent seulement remplacer un ingrédient manquant de même niveau pour apprendre une recette.",
      ],
    },
    {
      q: 'Et s’il me manque toujours le même ingrédient\u202f?',
      a: [
        'Les ingrédients aléatoires (packs cadeaux, tickets d’ingrédient aléatoire, Combiner, récompenses du Bar et de la Tour, Temple, le Maire Grosse Marmite) ont une chance d’être justement celui qui manque à votre prochaine recette, et plus votre chance est élevée, plus c’est probable. Vous pouvez aussi le remplacer par un ingrédient universel, ou l’acheter au Marché ou à la Bourse (la Bourse ne vend que des ingrédients rares).',
      ],
    },
    {
      q: 'Comment rendre ses ustensiles plus forts\u202f? ',
      a: [
        "Le renfort peut échouer. Les ustensiles haut de gamme demandent un niveau minimum\u202f: on ne peut pas les équiper avant de l'atteindre.",
      ],
    },
    {
      q: 'Quelle différence entre les rues\u202f? ',
      a: [
        'La médaille de chaque rue donne un bonus différent. Les déménagements se font à la ',
        { to: '/society', text: 'Guilde' },
        '.',
      ],
    },
    {
      q: 'Des règles pour les noms et les annonces\u202f? ',
      a: [
        "Pas de noms de PNJ, pas d'insultes ni de publicité. Après un signalement confirmé, le nom est changé d'office ou l'annonce effacée.",
      ],
    },
    {
      q: 'Où utiliser un code cadeau\u202f? ',
      a: ['«\u202fPlus → Autres → Code cadeau\u202f», ou le champ en haut de la boîte aux lettres.'],
    },
    {
      q: 'Faut-il attendre le résultat d’une prédiction\u202f? ',
      a: [
        "Non. Avant l'échéance, vous pouvez vendre vos parts au prix actuel à tout moment\u202f: vendez pour limiter la perte si vous pensez vous être trompé, ou pour prendre le gain quand le prix vous convient.",
      ],
    },
    {
      q: 'Comment obtenir des diamants\u202f? ',
      a: [
        "Le pack de pointage quotidien peut en contenir\u202f; les récompenses d'activité de 100 et 120 points\u202f; ",
        { to: '/rest/tasks?tab=weekly', text: 'les quêtes hebdomadaires' },
        '\u202f; les packs du classement des chefs et du classement mensuel d’affinité du Kraken\u202f; les prix A, B, C et Dernier Prix de l’Ichiban Kuji\u202f; les amis invités qui atteignent les niv. 10 et 30\u202f; un message du forum mis en avant\u202f; les récompenses d’événements et les codes cadeaux.',
      ],
    },
    {
      q: 'Comment obtenir des Krabby Patty, et à quoi servent-ils\u202f? ',
      a: [
        'On peut en gagner à la machine à sous du ',
        { to: '/bar', text: 'Bar' },
        '\u202f; secouer la bourse de M. Krab sur la place en fait parfois tomber un\u202f; la quête secondaire «\u202fRéussir une Épreuve\u202f» en donne un aussi. Échangez-les contre des objets rares auprès du ',
        { to: '/society/mayor', text: 'Maire Grosse Marmite, à la Guilde' },
        '.',
      ],
    },
  ],
  rules: 'Règles du jeu',
  rulesItems: [
    'Interdit d’utiliser plusieurs comptes pour amasser des ressources ou de transférer des ressources entre comptes.',
    'Interdit de profiter des bugs. Si vous en trouvez un, signalez-le aux administrateurs dans la section «\u202fSuggestions\u202f» du forum, sans décrire comment faire, et ne l’exploitez pas.',
    'Insultes, publicité, contenus illégaux ou inappropriés interdits. Vous pouvez signaler ce genre de messages, klaxons, noms de restaurant et annonces.',
    'Les infractions entraînent un bannissement de 1 jour, 7 jours ou définitif.',
    "Les statistiques de l'administration ne sont que des indices\u202f; chaque sanction est vérifiée par une personne.",
  ],
};
export default guide;

import type { Messages } from '../..';
import { formatNum, formatPct } from '../../../utils/format';
import { plFr } from '../../helpers';

const wiki: Messages['wiki'] = {
  title: 'Données du jeu',
  intro: 'Objets, ingrédients, recettes, ustensiles et rues du jeu, synchronisés avec les données du jeu.',
  searchAll: 'Chercher dans tous les noms',
  search: 'Chercher un nom',
  noResult: 'Aucun résultat',
  loadFailed: 'Chargement impossible, réessayez plus tard',
  notFound: 'Cette entrée n’existe pas',
  back: 'Retour à la liste',
  home: 'Accueil des données du jeu',
  more: (n) => `Afficher ${n} de plus`,
  maxShown: (n) => `${n} au maximum\u202f; affinez avec la recherche ou le filtre de rue`,
  count: (n) => `${formatNum(n)} ${n <= 1 ? 'entrée' : 'entrées'}`,
  apiLink: 'API ouverte\u202f: pour les joueurs qui veulent étudier le jeu ou créer des outils',
  kinds: {
    goods: 'Objets',
    foods: 'Ingrédients',
    cookbooks: 'Recettes',
    equips: 'Ustensiles',
    streets: 'Rues',
  },
  all: 'Tous',
  rareOnly: 'Rares seulement',
  allStreets: 'Toutes les rues',
  level: (n) => `Niv. ${n}`,
  coin: (n) => `${n} ${plFr(n, 'pièce', 'pièces')}`,
  diamond: (n) => `${n} ${plFr(n, 'diamant', 'diamants')}`,
  renown: (n) => `${n} renommée`,
  units: { coin: 'Pièces', exp: 'EXP', diamond: 'Diamants' },
  rare: 'Rare',
  common: 'Commun',
  goodsTypes: {
    '0': 'Consommables',
    '1': 'Objets',
    '2': 'Packs cadeaux',
    '3': 'Équipements',
    '4': 'Ustensiles',
    '5': 'Gemmes',
    '9': 'Médailles',
    '10': 'Souvenirs',
  },
  foodTypes: { '0': 'Condiments et fruits secs', '1': 'Viande, œufs et laitages', '2': 'Fruits et légumes' },
  sections: {
    gift: 'Peut contenir',
    sources: 'Comment l’obtenir',
    usedIn: 'Peut être échangé contre',
    equip: 'Caractéristiques',
    stress: 'Total des caractéristiques après renfort',
    gem: 'Caractéristiques de la gemme',
    suit: 'Bonus d’ensemble',
    cookbooks: (n) => `Recettes qui l’utilisent (${n})`,
    mysterious: 'Plats signature qui l’utilisent',
    grades: 'Ingrédients par qualité',
    medal: 'Médaille de rue',
    streetCookbooks: 'Recettes de cette rue',
  },
  fields: {
    star: 'Étoiles',
    needStar: (n) => `Disponible dès ${n} ${plFr(n, 'étoile', 'étoiles')}`,
    type: 'Type',
    level: 'Niveau',
    stackable: 'Empilable',
    maxNum: (n) => `${n} au maximum`,
    invalidHours: (n) => `Dure ${n} ${plFr(n, 'heure', 'heures')}`,
    part: 'Emplacement',
    minLevel: (n) => `Équipable dès le niv. ${n}`,
    suit: 'Ensemble',
    noSuit: 'Ne fait partie d’aucun ensemble',
    essence: (n) => `${n} essence par renfort`,
    holes: (a, b) => `${a} au départ, jusqu’à ${b}`,
    baseAttrs: 'Caractéristiques de base',
    enhance: 'Renfort',
    sockets: 'Emplacements',
    stressLevel: (n) => `+${n}`,
    gemLevel: (n) => `Rang ${n}`,
    nextGem: 'Rang suivant',
    systemPrice: 'Prix système',
    seed: (n) => `Se cultive au potager, ${n} par récolte`,
    fromGrade: (g) => `dès ${g}`,
    street: 'Rue',
    recommend: (n) => `Niv. conseillé ${n}`,
    price: 'Prix',
    taste: 'Goût',
    cookName: 'Cuisine',
    bonus: 'Bonus de rue',
    focus: 'Type de rue',
    theme: 'Ambiance',
    cookbookCount: (n) => `${n} ${plFr(n, 'plat', 'plats')}`,
    suitTier: (n) => `${n} ${plFr(n, 'pièce', 'pièces')}`,
  },
  gift: {
    randomGoods: (level, num) => `Un objet de niv. ${level} au hasard\u202f×\u202f${num}`,
    randomFoods: (level, num) => `Ingrédients communs de niv. ${level} au hasard\u202f×\u202f${num}`,
    masterFoods: (num) => `Ingrédients universels au hasard\u202f×\u202f${num}`,
    range: (min, max, unit) => `${unit} ${min}–${max}`,
    note: 'Seul le contenu possible est listé, pas les probabilités.',
  },
  sources: {
    special: 'Promo du jour (au hasard chaque jour)',
    black: (n) => `Marché noir\u202f: ${n} diamants`,
    award: 'Récompenses aléatoires de la Tour des chefs, du bar, etc.',
    gemFromBefore: 'Amélioration de gemme\u202f: deux ',
    gemFromAfter: ' en donnent une',
    shop: 'Toujours en boutique\u202f: ',
    renownShop: (n, rotating) =>
      `Boutique de renommée\u202f: ${n} renommée${rotating ? ' (en rotation)' : ''}`,
    exchange: 'Échange\u202f: ',
    times: (n) => (n < 0 ? '' : ` (${n} par joueur)`),
    none: 'Aucune source directe dans les données du jeu\u202f: peut venir d’événements, de packs cadeaux, de quêtes ou d’autres activités.',
  },
  /** 玩法攻略（问题记录 384）：来自快速模拟里三种机器人的做法 */
  guide: {
    title: 'Guide de jeu',
    link: 'Guide de jeu\u202f: trois rythmes de jeu et quoi faire à chaque connexion',
    intro:
      'Ce guide vient de la simulation d’équilibrage du jeu\u202f: des robots ont joué 30 jours à trois rythmes (assidu, régulier, occasionnel). Voici ce qu’ils ont fait et jusqu’où ils sont allés. Les chiffres sont des estimations, la vraie partie sera différente\u202f: prenez-les comme un repère.',
    sections: [
      {
        title: 'Trois rythmes',
        items: [
          'Assidu\u202f: passe toutes les heures, du matin jusque tard le soir. 1 étoile vers le jour 2, niveau 30 vers le jour 7\u202f; les 2 étoiles dépendent du nombre de recettes apprises\u202f: déménagez dès que la page des recettes le suggère, plus c’est tôt, plus c’est rapide.',
          'Régulier\u202f: passe trois fois par jour (matin, midi et soir). 1 étoile vers le jour 3, niveau 30 vers le jour 9, 2 étoiles vers le jour 18.',
          'Occasionnel\u202f: passe une fois chaque soir. 1 étoile vers le jour 4, niveau 30 vers le jour 23\u202f; 2 étoiles prennent en général plus d’un mois, et ce n’est pas grave.',
        ],
      },
      {
        title: 'À chaque connexion, dans cet ordre',
        items: [
          'Pointez et récupérez les récompenses de points d’activité.',
          'Utilisez les objets de l’entrepôt qui s’utilisent directement\u202f: tables, coffrets, tickets d’ingrédient aléatoire.',
          'Mettez tous les points d’attribut en Cuisine.',
          'Remettez de l’huile sous 60\u202f%\u202f; un restaurant fermé rouvre dès qu’il a de l’huile.',
          'Écrasez les cafards de votre propre restaurant.',
          'Récupérez les quêtes\u202f: quête principale, quêtes secondaires et récompenses de chapitre dès qu’elles sont prêtes.',
          'Remplissez les emplacements d’équipement vides\u202f; s’il n’y en a pas en entrepôt, achetez-en de bon marché.',
          'Quand il ne manque que le bon de passage d’étoile et les pièces pour l’étoile suivante, achetez le bon et montez d’étoile\u202f; si vous n’avez pas assez, mettez de côté plutôt que de dépenser ailleurs.',
          'Agrandissez le bidon d’huile dès que votre niveau et vos étoiles le permettent.',
          'Achetez des tables, mais gardez de quoi refaire le plein d’huile plus 20 000 en réserve.',
          'Au marché, n’achetez que les ingrédients qui manquent à vos recettes\u202f: d’abord le Marché du jour, puis le Marché des promos (e-mail vérifié requis). Chaque réassort du Marché du jour a une place pour un ingrédient dont la Rue des débutants a besoin.',
          'Participez aux pronostics du marché au passage.',
          'Apprenez les recettes\u202f: d’abord les nouvelles, puis améliorez celles que vous connaissez.',
          'Utilisez les combinaisons gratuites du jour pour transformer les ingrédients inutiles en ingrédients de niveau supérieur.',
        ],
      },
      {
        title: 'Quand déménager',
        items: [
          (n) =>
            `On ne peut apprendre que les recettes de sa rue. La ${n.startStreet.name} n’en a que ${formatNum(n.startStreet.cookbooks)}, et 2 étoiles en demandent ${formatNum(n.star2Cookbooks)}\u202f: il faudra déménager tôt ou tard.`,
          'Quand même toutes les recettes restantes de votre rue ne suffisent pas pour l’étoile suivante, la page des recettes vous prévient. Préparez-vous alors à déménager\u202f: n’attendez pas les dernières recettes difficiles, déménagez dès que l’apprentissage ralentit.',
          (n) =>
            `On apprend plus vite dans une rue qui a beaucoup de recettes\u202f: la ${n.biggestStreet.name} en a ${formatNum(n.biggestStreet.cookbooks)}, plus que toute autre rue.`,
          'Les rues sont à pièces, équilibrées ou à EXP\u202f: allez dans une rue des pièces quand il vous faut des pièces, dans une rue de l’EXP pour monter de niveau. La page de déménagement et la page des recettes indiquent le type et le bonus de chaque rue.',
          'Déménager demande une carte de déménagement (inutile avec un permis de travail du bureau des déménagements) et des frais, divisés par deux quand vous avez de la chance.',
        ],
      },
      {
        title: 'Où dépenser ses pièces en premier',
        items: [
          'D’abord l’huile\u202f: sans huile, le restaurant ferme et ne gagne rien.',
          'Ensuite les étoiles\u202f: bons de passage d’étoile et pièces pour monter d’étoile.',
          'Seulement après, les tables et les équipements.',
          (n) =>
            `Ouvrir la vente à emporter demande ${n.takeaway.star} ${plFr(n.takeaway.star, 'étoile', 'étoiles')} et ${formatNum(n.takeaway.renown)} de renommée (dépensés à l’ouverture), plus ${formatNum(n.takeaway.coin / 1_000_000)} ${plFr(n.takeaway.coin / 1_000_000, 'million', 'millions')} de pièces et ${formatNum(n.takeaway.diamond)} diamants ou un Pass à emporter\u202f: si elle vous intéresse, commencez à économiser tôt.`,
        ],
      },
      {
        title: 'Autres activités',
        items: [
          'Secouez la bourse de M. Krab et discutez avec Sœur Wen au Bar une fois par jour, puis discutez avec le Maire Grosse Marmite et Frère 13 à la Guilde\u202f: tous ont quelque chose pour vous.',
          'Faites la Tour des chefs chaque jour\u202f: vous gagnez de la renommée que vous gagniez ou perdiez. L’Ancien du premier étage est niveau 8\u202f; vous pouvez le battre vers le niveau 10 (un peu plus tôt avec l’équipement d’apprenti).',
          (n) =>
            n.exchange.level === n.predict.level && n.exchange.days === n.predict.days
              ? `À partir du niveau ${n.exchange.level}, avec un compte d’au moins ${n.exchange.days} jours et un e-mail vérifié, la Bourse et les Prédictions sont ouvertes.`
              : `À partir du niveau ${n.exchange.level}, avec un compte d’au moins ${n.exchange.days} jours et un e-mail vérifié, la Bourse est ouverte\u202f; les Prédictions demandent le niveau ${n.predict.level} et ${n.predict.days} jours.`,
          'Porter des ustensiles augmente les revenus de chaque tour.',
          (n) =>
            `Sous le niveau ${n.newbieExp.maxLevel}, l’EXP de chaque tour reçoit un bonus (${formatPct(n.newbieExp.rate, { sign: true })} au niveau 1, de moins en moins à chaque niveau)\u202f: les premiers niveaux vont très vite.`,
          (n) =>
            `Les restaurants de ${n.acquire.minStar} étoiles ou plus ont une valorisation et peuvent être rachetés via le lien Rachats de la ligne Patrimoine sur la page d’accueil\u202f: vous payez la valorisation, l’ancien propriétaire reçoit ${formatPct(1 - n.acquire.taxRate, { digits: 0 })} et ${formatPct(n.acquire.taxRate, { digits: 0 })} part en taxe\u202f; vous pouvez en posséder jusqu’à ${n.acquire.maxHoldings}. Les restaurants rachetés versent chaque jour un dividende à leur propriétaire (${formatPct(n.acquire.dividendRate, { digits: 0 })} des pièces de règlement de la veille, s’ils ont fait au moins ${n.acquire.minRounds} tours). Un restaurant racheté peut s’occuper de son propriétaire une fois par jour et reçoit ${n.acquire.tendFoods} ingrédients\u202f; le dividende de ce jour augmente de ${formatPct(n.acquire.tendBonus, { digits: 0 })}. Un restaurant racheté peut se racheter à sa valorisation\u202f; il est ensuite à l’abri des rachats pendant ${n.acquire.protectDays} jours.`,
        ],
      },
      {
        title: 'Comment apprendre les plats signature',
        items: [
          'Il faut 3 fragments d’un plat pour l’apprendre\u202f; on peut cuisiner dès 1 étoile.',
          'Expertise (dès 1 étoile)\u202f: au Temple, utilisez 1 Recette mystère et 1 objet d’expertise\u202f; en cas de réussite, vous obtenez un fragment d’un plat au hasard. Le Sceau Délice donne les niveaux 1 à 6 et réussit 40\u202f% du temps (90 000 à la boutique)\u202f; le Sceau de jade du Dieu de la cuisine les niveaux 2 à 5, 52\u202f% (300 000 à la boutique)\u202f; les Formules secrètes du Seau de l’Enfer (niveaux 1 à 3) et du Krabby Patty (niveaux 3 à 5) réussissent toujours, se vendent contre des diamants au marché noir et tombent aussi des récompenses aléatoires de la Tour des chefs et du bar\u202f; celle du Krabby Patty est aussi le prix du champion des plats signature d’hier.',
          'Échange d’éclats\u202f: décomposez les fragments inutiles en éclats du même niveau\u202f; 3 éclats d’un niveau donnent 1 fragment de n’importe quel plat de ce niveau, alors gardez les éclats du niveau voulu.',
          'Leçons\u202f: trouvez un joueur qui connaît le plat et donne un cours, payez les frais et un peu d’énergie, et vous l’apprendrez presque toujours du premier coup.',
        ],
      },
    ],
  },
  api: {
    title: 'API ouverte',
    intro:
      'Données statiques du jeu en lecture seule, les mêmes que les pages de données du jeu, pour les joueurs qui veulent étudier le jeu ou créer des outils. Aucune donnée en direct sur les joueurs ou les serveurs.',
    base: 'Adresse de base',
    langParam: 'Chaque point d’accès accepte un paramètre lang\u202f: zh-CN (par défaut), zh-TW, en, fr, es.',
    endpoints: 'Points d’accès',
    path: 'Chemin',
    content: 'Contenu',
    list: {
      index: 'Index\u202f: version des données, langues, quantités',
      goods: 'Liste des objets',
      goodsId:
        'Détail d’un objet\u202f: description, caractéristiques d’ustensile et de gemme, contenu des packs, sources, échanges',
      foods: 'Liste des ingrédients',
      foodsId: 'Détail d’un ingrédient\u202f: recettes et plats signature qui l’utilisent, graine du potager',
      cookbooks: 'Liste des recettes (sans ingrédients)',
      cookbooksId: 'Détail d’une recette\u202f: ingrédients des qualités 1 à 10',
      equips: 'Liste des ustensiles et ensembles',
      streets: 'Rues, cuisines, bonus et médailles de rue',
    },
    format: 'Format de réponse',
    formatText:
      'Comme l’API du jeu\u202f: { ok, data }. data contient toujours version (version des données) et lang. Une entrée introuvable renvoie 404 avec un code d’erreur.',
    cache: 'Versions et cache',
    cacheText:
      'version change quand les données du jeu sont mises à jour. Les réponses peuvent être mises en cache une heure\u202f; envoyez le dernier ETag pour recevoir 304 si rien n’a changé.',
    cors: 'Accès depuis d’autres sites',
    corsText:
      'N’importe quel site peut lire ces points d’accès directement depuis le navigateur (sans informations de connexion).',
    limit: 'Limite de fréquence',
    limitText:
      'Environ 120 requêtes par minute et par IP\u202f; au-delà, vous recevez 429, attendez un peu et réessayez.',
    example: 'Exemple',
    notIncluded: 'Non inclus',
    notIncludedText:
      'Les données en direct des joueurs, restaurants et serveurs (météo, prix de la bourse, classements, etc.), les probabilités de butin et les récompenses d’événements.',
  },
};
export default wiki;

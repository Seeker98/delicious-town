import type { Messages } from '../..';
import { plFr } from '../../helpers';

const society: Messages['society'] = {
  title: 'Guilde',
  links: {
    star: {
      label: 'Gagner une étoile',
      desc: 'Niveau, recettes et certificats suffisants ? Passez à l’étoile suivante',
    },
    oil: { label: "Agrandir le bidon d'huile", desc: "Augmente la réserve d'huile, moins de fermetures" },
    rename: { label: 'Renommer', desc: 'Nécessite une carte de renommage' },
    move: { label: 'Déménager', desc: 'Changer de rue ; le badge de rue change aussi' },
  },
  move: {
    title: 'Déménager',
    hint: (street, cost) =>
      `Vous êtes à ${street}. Il faut 1 carte de déménagement (gratuit avec un permis du bureau des déménagements) et environ ${cost} ${plFr(cost, 'pièce', 'pièces')} (moitié prix avec de la chance).`,
    pick: 'Choisir une nouvelle rue',
    bonus: (desc) => `Bonus de la rue : ${desc}`,
    option: (name, cook) => `${name} (${cook})`,
    btn: 'Déménager',
    done: (street) => `Déménagé : ${street}`,
    failed: 'Échec du déménagement',
  },
  oil: {
    title: (level, max) => `Agrandir le bidon d'huile (niveau ${level}, max ${max})`,
    next: (level, max) => `Au niveau ${level}, le max passe à ${max}`,
    maxed: 'Déjà au niveau maximum',
    btn: 'Agrandir',
    done: "Bidon d'huile agrandi",
    failed: "Échec de l'agrandissement",
  },
  rename: {
    title: 'Renommer',
    hint: "Nécessite 1 carte de renommage. 9 caractères max : caractères chinois, lettres et chiffres. Ne doit pas être le nom d'un autre restaurant du serveur.",
    placeholder: 'Nouveau nom',
    btn: 'Renommer',
    done: (name) => `Renommé en « ${name} »`,
    failed: 'Échec du renommage',
  },
  star: {
    title: (star) => `Gagner une étoile (actuellement ${star}★)`,
    notOpen: (star) => `${star}★ n'est pas encore ouvert`,
    award: 'Récompenses : ',
    maxed: "Déjà au nombre d'étoiles maximum",
    btn: (star) => `Passer à ${star}★`,
    done: (star) => `Bravo, vous passez à ${star}★ !`,
    failed: "Échec du passage d'étoile",
  },
  needs: { level: 'Niveau du restaurant', star: 'Étoiles', cookbooks: 'Recettes apprises', coin: 'Pièces' },
  needLine: (label, have, need) => `${label} : ${have} / ${need}`,
};
export default society;

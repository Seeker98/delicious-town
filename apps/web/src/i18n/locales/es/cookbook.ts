import type { Messages } from '../..';
import { plEs } from '../../helpers';

const cookbook: Messages['cookbook'] = {
  filters: {
    all: 'Todas',
    learnable: 'Aprendibles',
    upgradable: 'Mejorables',
    unlearned: 'Sin aprender',
    learned: 'Aprendidas',
  },
  loadFailed: 'No se pudieron cargar las recetas',
  learnFailed: 'No se pudo aprender',
  maxed: 'Nivel máx.',
  lackFoods: 'Faltan ingredientes',
  otherStreet: (street) => `Múdate a ${street} para aprenderla`,
  learn: 'Aprender',
  upgrade: 'Mejorar',
  useMaster: (level) => `Con universal nv. ${level}`,
  counts: (streetLearned, streetTotal, learned, total) =>
    `Esta calle: ${streetLearned}/${streetTotal} aprendidas · ${learned} / ${total} ${plEs(total, 'receta', 'recetas')} en total`,
  info: (street, level, taste, coin) => `${street} · Dificultad ${level} · Sabor ${taste} · Precio ${coin}`,
  grade: 'Calidad',
  foodsNeeded: 'Ingredientes necesarios',
};
export default cookbook;

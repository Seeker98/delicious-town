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
  streetDesc: (desc) => `Bonificación de la calle: ${desc}`,
  moveHint: (star, need, gap) =>
    `Aunque aprendas todas las recetas que quedan en esta calle, no llegarás a las ${need} recetas que hacen falta para ${star} ${plEs(star, 'estrella', 'estrellas')} (faltan ${gap}). Cuando ya casi no aprendas nada aquí, múdate a una calle con más recetas.`,
  moveHintClose: 'Ocultar hasta la próxima estrella',
  moveLink: 'Mudarse',
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
  progress: {
    link: 'Resumen de progreso',
    title: 'Progreso de recetas',
    back: 'Volver a recetas',
    summary: (grade, n, total, pct) => `${grade} o mejor: ${n} / ${total} (${pct})`,
    note: 'Cada casilla cuenta las recetas de esta calidad o mejor; tu calle actual aparece resaltada y las casillas completas, en verde.',
    street: 'Calle',
    all: 'Todas',
    loadFailed: 'No se pudo cargar el progreso de recetas',
  },
};
export default cookbook;

import type { Messages } from '../..';

const cupboard: Messages['cupboard'] = {
  tabs: { cupboard: 'Despensa', fridge: 'Nevera' },
  newBadge: 'Nuevo',
  summary: (p) =>
    `Huecos ${p.used}/${p.slots} · Bloqueados ${p.lockUsed}/${p.lockSlots} · Máx. ${p.max} de cada uno · Te quedan ${p.free} procesados gratis hoy · Objetivo de la calle: calidad ${p.grade}`,
  levelCount: (label, n) => `${label} (${n})`,
  levelEmpty: 'No hay ingredientes de este nivel',
  streetNeed: (n) => `La calle necesita ${n}`,
  decompose: (n) => `Descomponer ×${n}`,
  compose: (n) => `Combinar ×${n}`,
  lock: 'Bloquear',
  unlock: 'Desbloquear',
  exchange: (n) => `Cambiar por raros ×${n}`,
  master1: '2 ingredientes universales de nivel 1 → 1 ingrediente raro aleatorio de nivel 2.',
  master2: '2 ingredientes universales de nivel 2 → 1 ingrediente raro aleatorio de nivel 3.',
  masterHigh:
    'Los ingredientes universales de nivel 3 o más no se cambian por raros. Solo sirven para sustituir un ingrediente que falte del mismo nivel al aprender una receta.',
  handleHint: (decomposeMax, composeMax) =>
    `Hasta ${decomposeMax} por descomposición y ${composeMax} por combinación (número par). Descomponer: 1 → 2 oportunidades de un ingrediente de nivel inferior. Combinar: 2 → 1 oportunidad de un ingrediente de nivel superior, nunca uno que ya esté lleno en la despensa.`,
  handleResult: (success, chances, strengthUsed) =>
    `${success}/${chances} con éxito${strengthUsed ? ', gastaste 1 de energía' : ''}`,
  handleFailed: 'No se pudo procesar',
  exchangeFailed: 'No se pudo cambiar',
  loadFailed: 'No se pudo cargar la despensa',
  thawConfirm: (n, name, coin) => `¿Descongelar ${n} ${name} por ${coin} monedas?`,
  thawFailed: 'No se pudo descongelar',
  fridgeEmpty: 'La nevera está vacía',
  noRoom: 'No cabe en la despensa',
  thaw: (n, coin) => `Descongelar ×${n} (${coin} monedas)`,
};
export default cupboard;

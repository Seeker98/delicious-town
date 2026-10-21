import type { Messages } from '../..';
import { plEs } from '../../helpers';

const cupboard: Messages['cupboard'] = {
  tabs: { cupboard: 'Estante', fridge: 'Nevera' },
  newBadge: 'Nuevo',
  levelCount: (label, n) => `${label} (${n})`,
  meta: {
    slots: (used, all) => `Huecos ${used}/${all}`,
    lock: (used, all) => `Bloqueados ${used}/${all}`,
    rules: (free, max, grade) =>
      `${free} ${plEs(free, 'proceso gratis', 'procesos gratis')} hoy · máx. ${max} por ingrediente · objetivo de la calle: calidad ${grade}`,
  },
  have: (n) => `Tienes ${n}`,
  howMany: 'Cuántos',
  locked: 'Bloqueado',
  levelEmpty: 'No hay ingredientes de este nivel',
  search: {
    placeholder: 'Buscar ingredientes',
    clear: 'Borrar la búsqueda',
    none: (q) => `Ningún ingrediente se llama «${q}»`,
    elseFridge: 'Prueba otra palabra o mira la nevera',
    elseShelf: 'Prueba otra palabra o mira el estante',
  },
  /** 橱柜空着（界面改版 P4：空状态） */
  empty: {
    title: 'La estantería está vacía',
    body: 'Necesitas ingredientes para aprender y cocinar platos. Compra algunos en el mercado',
    link: 'Ir al mercado',
  },
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
    `Hasta ${decomposeMax} por descomposición y ${composeMax} por combinación (número par). Descomponer: 1 → 2 oportunidades de un ingrediente de nivel inferior. Combinar: 2 → 1 oportunidad de un ingrediente de nivel superior, nunca uno que ya esté lleno en la despensa. Dentro de tus procesados gratis del día, cada vez no cuesta energía sin importar la cantidad; después, cada ingrediente descompuesto u obtenido cuesta 1 de energía.`,
  handleResult: (success, chances, strength) =>
    `${success}/${chances} con éxito${strength > 0 ? `, gastaste ${strength} de energía` : ''}`,
  paidHead: 'Hoy ya no te quedan procesados gratis: ',
  paidDecompose: (n) => `descomponer ${n} cuesta ${n} de energía`,
  paidCompose: (n, out) => `combinar ${n} (salen ${out}) cuesta ${out} de energía`,
  handleFailed: 'No se pudo procesar',
  exchangeFailed: 'No se pudo cambiar',
  loadFailed: 'No se pudo cargar la despensa',
  thawConfirm: (n, name, coin) => `¿Descongelar ${n} ${name} por ${coin} ${plEs(coin, 'moneda', 'monedas')}?`,
  thawFailed: 'No se pudo descongelar',
  fridgeEmpty: 'La nevera está vacía',
  noRoom: 'No cabe en la despensa',
  thaw: (n, coin) => `Descongelar ×${n} (${coin} ${plEs(coin, 'moneda', 'monedas')})`,
  thawDebt: (debt) => ` Primero se pagan ${debt} ${plEs(debt, 'moneda', 'monedas')} de deuda de la nevera.`,
  freeze: (n) => `A la nevera ×${n}`,
  freezeConfirm: (n, name, coin, kinds, daily) =>
    `¿Meter ${n} ${name} en la nevera por ${coin} ${plEs(coin, 'moneda', 'monedas')} de entrada? Después la nevera tendrá ${kinds} ${plEs(kinds, 'tipo', 'tipos')} y costará unas ${daily} ${plEs(daily, 'moneda', 'monedas')} al día.`,
  freezeTier: (mult) => ` La nevera sube de tramo: la tarifa diaria de toda la nevera ×${mult}.`,
  freezeFailed: 'No se pudo meter en la nevera',
  freezeDebt: 'Debes tarifas de la nevera; págalas antes de meter comida',
  fee: {
    summary: (kinds, mult, daily) =>
      `Nevera: ${kinds} ${plEs(kinds, 'tipo', 'tipos')}${mult > 1 ? ` · tarifa ×${mult}` : ''} · unas ${daily} ${plEs(daily, 'moneda', 'monedas')} al día`,
    rules: (entry, daily, thaw, tiers) =>
      `Meter comida en la nevera cuesta el ${entry} del precio de mercado y descongelar el ${thaw}; guardarla cuesta cada día el ${daily} del valor de la nevera${tiers}`,
    tier: (from, mult) => `, toda la nevera ×${mult} desde ${from} tipos`,
    next: (left, mult, daily) =>
      `Con ${left} ${plEs(left, 'tipo', 'tipos')} más pasas al siguiente tramo (×${mult}), unas ${daily} ${plEs(daily, 'moneda', 'monedas')} al día`,
    debt: (debt, days) =>
      `Debes ${debt} ${plEs(debt, 'moneda', 'monedas')} de la nevera. Hasta pagarlas no puedes descongelar (al descongelar se paga primero) ni meter comida; tras ${days} días de deuda se vende comida de la nevera para pagarla`,
  },
};
export default cupboard;

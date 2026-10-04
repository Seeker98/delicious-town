import { SHARED_GOODS } from '@dt/shared';
import type { Messages } from '../..';
import { formatNum } from '../../../utils/format';
import { list, num, str, type P } from '../../helpers';

const WEEKLY: Record<string, string> = {
  'flip.caught': 'atrapados revolviendo despensas',
  'flip.flipped': 'despensas revueltas',
  'roach.kill': 'cucarachas eliminadas',
};
const rank = (k: number) => `${k}.º`;

function predictResult(p: P): string {
  const head = `Predicción «${str(p.title)}»`;
  if (p.outcome === null || p.outcome === undefined) {
    return `${head} anulada. Se devolvió a los participantes el ${Math.round(num(p.voidRatio) * 100)} % de su apuesta neta`;
  }
  const result = `${head}: resultado ${p.outcome ? 'Sí' : 'No'}`;
  const players = num(p.players);
  if (players === 0) return result;
  const winners = num(p.winners);
  return winners === 0
    ? `${result}. Participaron ${players} restaurantes y nadie acertó`
    : `${result}. Participaron ${players} restaurantes, acertaron ${winners} y se repartieron ${formatNum(num(p.paid))} monedas`;
}

const news: Messages['news'] = {
  render: {
    'bar.cup': (w, p) => `${w} acertó el vaso ${num(p.times)} veces seguidas en el bar`,
    'bar.fg': (w, p) => `${w} ganó ${num(p.times)} rondas seguidas de piedra, papel o tijera en el bar`,
    'bar.num': (w) => `${w} acertó el número en la ruleta del bar`,
    'bar.slot': (w, p, x) =>
      `${w} ganó ${p.kind === 'foods' ? x.foodName(num(p.itemId)) : x.goodsName(num(p.itemId))}×${num(p.num)} en la tragaperras del bar`,
    'bar.devil': (w, p) =>
      `${w} se bebió tres Chiles del Diablo sin pestañear y ganó ${num(p.payout)} vales misteriosos`,
    'bar.memory': (w) => `${w} recordó los 7 ingredientes del Cóctel Memoria`,
    'bar.darts': (w) => `${w} clavó tres dardos en la diana y dejó boquiabierto al dueño del bar`,
    'equip.stress': (w, p, x) => `${w} reforzó ${x.goodsName(num(p.goodsId))} a +${num(p.stress)}`,
    'friend.weekly': (w, p, x) =>
      `${w} quedó ${rank(num(p.rank))} la semana pasada (${WEEKLY[str(p.key)] ?? 'clasificación'}) y gana ${x.goodsName(num(p.goodsId))}`,
    'gem.broken': (w, p, x) =>
      `${w} falló al mejorar una gema y rompió ${x.goodsName(num(p.goodsId))}×${num(p.num)}`,
    'gem.levelUp': (w, p, x) =>
      `${w} obtuvo ${x.goodsName(num(p.goodsId))}×${num(p.num)} al mejorar una gema`,
    'forum.pin': (w, p) => `La publicación «${str(p.title)}» de ${w} fue fijada`,
    'forum.feature': (w, p) => `La publicación «${str(p.title)}» de ${w} fue destacada`,
    'hiphop.event': (w) => `¡${w} inició un evento hip-hop!`,
    'hiphop.krab': (w, p, x) =>
      `${w} consiguió ${x.goodsName(SHARED_GOODS.krabCoin)}×${num(p.num)} dando propinas`,
    'hiphop.weekly': (w, p, x) =>
      `Enhorabuena a ${w}, ${rank(num(p.rank))} en las propinas semanales, que gana ${x.goodsName(num(p.goodsId))} (160 horas)`,
    'market.manual': (w, p, x) =>
      `${w} se abasteció de platos del día: ${list(p.foods)
        .map((id) => x.foodName(num(id)))
        .join(', ')}`,
    'market.restock': (_w, p, x) =>
      `El mercado se abasteció: ${list(p.foods)
        .map((id) => x.foodName(num(id)))
        .join(', ')}`,
    'mc.champion': (w, p) => `${w} tuvo ayer el plato estrella más valioso (${formatNum(num(p.value))})`,
    'mc.cook': (w, p, x) => `${w} cocinó ${x.mcName(num(p.mcId))}×${num(p.num)}`,
    'oil.expand': (w, p) => `${w} amplió su bidón de aceite al nivel ${num(p.level)}`,
    'plankton.appear': (w) => `Plancton se instaló en ${w} y no quiere irse`,
    'plankton.driven': (w) => `${w} echó a Plancton`,
    'rest.move': (w, p, x) => `${w} se mudó a ${x.streetName(num(p.to))}`,
    'rest.rename': (_w, p) => `${str(p.from)} ahora se llama ${str(p.to)}`,
    'restaurant.open': (w) => `${w} abrió sus puertas`,
    'shop.special': (_w, p, x) => `Oferta del día en la tienda: ${x.goodsName(num(p.goodsId))}`,
    'star.up': (w, p) => `${w} alcanzó ${num(p.star)} estrellas`,
    'takeaway.customer': (w, p, x) =>
      `${w} se encontró con ${x.goodsName(num(p.goodsId))} repartiendo a domicilio`,
    'temple.explore.rare': (w, p, x) =>
      `${w} encontró ${list(p.foods)
        .map((f) => `${x.foodName(num((f as P).foodsId))}×${num((f as P).num)}`)
        .join(', ')} explorando el templo`,
    'temple.guardian.rare': (w, p, x) =>
      `${w} derrotó a la bestia guardiana y obtuvo ${x.foodName(num(p.foodsId))}`,
    'activity.coopRank': (_w, p) =>
      `Clasificación de aportes de «${str(p.title)}»: ${list(p.top)
        .map(
          (r) => `${rank(num((r as P).rank))} ${str((r as P).name)} (${formatNum(num((r as P).points))} pts)`,
        )
        .join(', ')}`,
    'tower.rank.week': (_w, p) =>
      `Clasificación semanal de la Torre de chefs: ${list(p.top)
        .map((r) => `${rank(num((r as P).rank))} ${str((r as P).name)}`)
        .join(', ')}`,
    'tower.shop.rare': (w, p, x) =>
      `${w} canjeó ${x.goodsName(num(p.goodsId))} en la tienda de la Torre de chefs`,
    'weather.change': (w, p, x) =>
      p.by !== undefined
        ? `${w} usó el martillo de Thor: ${x.weatherName(num(p.from))} pasó a ${x.weatherName(num(p.to))}`
        : `Cambió el tiempo: ${x.weatherName(num(p.from))} pasó a ${x.weatherName(num(p.to))}`,
    'town.broadcast': (w, p) => `${w}: ${str(p.text)}`,
    'town.bless': (w, p) => `${w} pidió un deseo y recibió: ${str(p.blessName) || str(p.name)}`,
    'town.shake.lucky': (w, p, x) =>
      `¡Enhorabuena! ${w} metió la mano en el bolsillo de Don Krab y sacó ${x.goodsName(num(p.goodsId))}×${num(p.num)}`,
    'kuji.big': (w, p) =>
      p.tier === 'last'
        ? `¡${w} sacó el último boleto del Ichiban Kuji${p.line === 'deluxe' ? ' de lujo' : ''} y se llevó el Último Premio!`
        : `¡${w} ganó el premio ${str(p.tier)} en el Ichiban Kuji${p.line === 'deluxe' ? ' de lujo' : ''}!`,
    'kuji.win': (w, p) =>
      `${w} ganó el premio ${str(p.tier)} en el Ichiban Kuji${p.line === 'deluxe' ? ' de lujo' : ''}`,
    'icon.buy': (w, p, x) =>
      `${w} compró el título limitado «${x.icon?.(str(p.key))?.title ?? str(p.title)}»`,
    'town.exchange': (w, p, x) => `${w} canjeó ${x.goodsName(num(p.goodsId))}×${num(p.num)} con el alcalde`,
    'predict.result': (_w, p) => predictResult(p),
  },
  unknown: 'Pasó algo en el pueblo',
  someone: 'Un restaurante',
};
export default news;

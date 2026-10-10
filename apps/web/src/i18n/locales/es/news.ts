import { SHARED_GOODS } from '@dt/shared';
import type { Messages } from '../..';
import { formatNum } from '../../../utils/format';
import { list, num, str, type P, plEs } from '../../helpers';

const WEEKLY: Record<string, string> = {
  'flip.caught': 'atrapados revolviendo despensas',
  'flip.flipped': 'despensas revueltas',
  'roach.kill': 'cucarachas eliminadas',
};
const rank = (k: number) => `${k}.º`;

/** Fondo de Desarrollo (240-2): una frase por clase; clase desconocida → frase simple */
function fundNews(w: string, p: P): string {
  const coin = formatNum(num(p.coin));
  if (p.tier === 'A')
    return `👑 ¡El capital ancla entra con fuerza! [${w}] inyecta ${coin} ${plEs(coin, 'moneda', 'monedas')} de golpe y se asegura el puesto de inversor líder clase A del Fondo de Desarrollo!`;
  if (p.tier === 'B')
    return `¡Jugada maestra! [${w}] bloquea ${coin} ${plEs(coin, 'moneda', 'monedas')} en participaciones clase B del Fondo de Desarrollo!`;
  if (p.tier === 'C')
    return `¡La economía real se recupera! [${w}] suscribió ${coin} ${plEs(coin, 'moneda', 'monedas')} en participaciones clase C del Fondo de Desarrollo`;
  return `[${w}] depositó ${coin} ${plEs(coin, 'moneda', 'monedas')} en el Fondo de Desarrollo`;
}

function predictResult(p: P): string {
  const head = `Predicción «${str(p.title)}»`;
  if (p.outcome === null || p.outcome === undefined) {
    return `${head} anulada. Se devolvió a los participantes el ${Math.round(num(p.voidRatio) * 100)}\u00a0% de su apuesta neta`;
  }
  const result = `${head}: resultado ${p.outcome ? 'Sí' : 'No'}`;
  const players = num(p.players);
  if (players === 0) return result;
  const winners = num(p.winners);
  return winners === 0
    ? `${result}. ${plEs(players, 'Participó', 'Participaron')} ${players} ${plEs(players, 'restaurante', 'restaurantes')} y nadie acertó`
    : `${result}. ${plEs(players, 'Participó', 'Participaron')} ${players} ${plEs(players, 'restaurante', 'restaurantes')}, ${plEs(winners, 'acertó', 'acertaron')} ${winners} y se ${plEs(formatNum(num(p.paid)), 'repartió', 'repartieron')} ${formatNum(num(p.paid))} ${plEs(formatNum(num(p.paid)), 'moneda', 'monedas')}`;
}

const news: Messages['news'] = {
  render: {
    // 改版前（问题记录 427-5）的新闻没有 round，按连中次数写
    'bar.cup': (w, p) =>
      p.round == null
        ? `${w} acertó el vaso ${num(p.times)} ${plEs(num(p.times), 'vez seguida', 'veces seguidas')} en el bar`
        : `${w} superó ${num(p.round)} ${plEs(num(p.round), 'ronda', 'rondas')} del juego de los vasos en el bar y encontró el dado entre ${num(p.cups)} vasos`,
    'bar.cup.big': (w, p) =>
      `¡${w} superó ${num(p.round)} ${plEs(num(p.round), 'ronda', 'rondas')} del juego de los vasos en el bar y encontró el dado entre ${num(p.cups)} vasos!`,
    'bar.fg': (w, p) =>
      `${w} ganó ${num(p.times)} ${plEs(num(p.times), 'ronda seguida', 'rondas seguidas')} de piedra, papel o tijera en el bar`,
    'bar.num': (w) => `${w} acertó el número en la ruleta del bar`,
    'bar.slot': (w, p, x) =>
      `${w} ganó ${p.kind === 'foods' ? x.foodName(num(p.itemId)) : x.goodsName(num(p.itemId))}×${num(p.num)} en la tragaperras del bar`,
    'bar.devil': (w, p) =>
      `${w} se bebió tres Chiles del Diablo sin pestañear y ganó ${num(p.payout)} ${plEs(num(p.payout), 'vale misterioso', 'vales misteriosos')}`,
    'bar.memory': (w) => `${w} recordó los 7 ingredientes del Cóctel Memoria`,
    'bar.spice': (w, p) =>
      `${w} descubrió la mezcla secreta del bar en solo ${num(p.tries)} ${plEs(Number(p.tries), 'intento', 'intentos')}`,
    'bar.deal': (w, p, x) =>
      `${w} rechazó todas las ofertas en Trato o no trato y abrió ${x.foodName(num(p.foodsId))} ×${num(p.num)}`,
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
    'star.up': (w, p) => `${w} alcanzó ${num(p.star)} ${plEs(num(p.star), 'estrella', 'estrellas')}`,
    'takeaway.customer': (w, p, x) =>
      `${w} se encontró con ${x.goodsName(num(p.goodsId))} repartiendo a domicilio`,
    'temple.explore.rare': (w, p, x) =>
      `${w} encontró ${list(p.foods)
        .map((f) => `${x.foodName(num((f as P).foodsId))}×${num((f as P).num)}`)
        .join(', ')} explorando el templo`,
    'temple.guardian.rare': (w, p, x) =>
      `${w} derrotó a la bestia guardiana y obtuvo ${x.foodName(num(p.foodsId))}${p.num ? `×${num(p.num)}` : ''}`,
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
    'tower.elder': (w, p, x) =>
      `${w} venció al anciano del piso ${num(p.floor)} de la Torre de chefs y consiguió ${x.goodsName(num(p.goodsId))}`,
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
    'acquire.big': (w, p) =>
      `${w} ${p.way === 'listed' ? 'compró' : 'adquirió'} «${str(p.name)}» por ${formatNum(num(p.price))} ${plEs(num(p.price), 'moneda', 'monedas')}`,
    'acquire.redeem': (w, p) =>
      `${w} se recompró por ${formatNum(num(p.price))} ${plEs(num(p.price), 'moneda', 'monedas')}`,
    'fund.big': (w, p) => fundNews(w, p),
    'fund.deposit': (w, p) => fundNews(w, p),
    'icon.buy': (w, p, x) =>
      `${w} compró el título limitado «${x.icon?.(str(p.key))?.title ?? str(p.title)}»`,
    'town.exchange': (w, p, x) =>
      `${w} canjeó ${x.goodsName(num(p.goodsId))}×${num(p.num)} con el Alcalde Gran Olla`,
    'predict.result': (_w, p) => predictResult(p),
    'bulk.deal': (_w, p, x) =>
      `Suscripción mayorista: ${x.foodName(num(p.foodsId))} ×${num(p.sold)} vendido a ${formatNum(num(p.price))} monedas, suscrito ${Math.round((num(p.demand) / Math.max(1, num(p.qty))) * 10) / 10} veces`,
    'wishtree.win': (w, p, x) =>
      `¡El deseo de ${w} en el Árbol de los deseos se cumplió: ${x.goodsName(num(p.goodsId))} ×${num(p.num)}! (${num(p.entries)} ${num(p.entries) === 1 ? 'deseo' : 'deseos'})`,
  },
  unknown: 'Pasó algo en el pueblo',
  someone: 'Un restaurante',
  /** 目录里已经没有的星愿（下架去掉了），外文里不显示中文名 */
  blessGone: 'un deseo estelar',
};
export default news;

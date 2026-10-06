import type { RestLogDto } from '@dt/shared';
import type { Messages } from '../..';
import type { Names } from '../../../utils/events';
import { formatNum } from '../../../utils/format';
import fund from './fund';
import { n, type P, plEs } from '../../helpers';

const mcNameOf = (names: Names, id: number) => names.mcName?.(id) ?? `Plato estrella ${id}`;
const seedNameOf = (names: Names, id: number) => names.seedName?.(id) ?? `Semilla ${id}`;
const holdHours = (p: P) => (p.holdHours === undefined ? 24 : n(p, 'holdHours'));
const heldNote = (p: P) =>
  p.held
    ? ` (operación sospechosa: ganancias congeladas ${holdHours(p)} ${plEs(holdHours(p), 'hora', 'horas')})`
    : '';
const coinFoods = (p: P, names: Names, coin: (s: string) => string) =>
  [
    ...(n(p, 'coin') > 0 ? [coin(formatNum(n(p, 'coin')))] : []),
    ...(Array.isArray(p.foods) ? p.foods : []).map(
      (f) => `${names.foodName(Number((f as P).foodsId))}×${Number((f as P).num)}`,
    ),
  ].join(', ');
function predictNet(p: P): string {
  if (p.net === undefined) return '';
  const d = n(p, 'coin') - n(p, 'net');
  return `, balance ${d > 0 ? '+' : ''}${formatNum(d)}`;
}
const side = (p: P) => (p.side === 'buy' ? 'de compra' : 'de venta');

function describeFeed(item: RestLogDto, foodName: (id: number) => string): string {
  const p = item.params;
  const who = String(p.byName ?? 'Alguien');
  switch (item.type) {
    case 'takeaway.hired':
      return `${who} te contrató como repartidor`;
    case 'dine.start':
      return `${who} está comiendo gratis en la mesa ${String(p.table)} de tu restaurante`;
    case 'dine.expelled':
      return `${who} te echó de su restaurante; pagaste ${String(p.coin)} ${plEs(String(p.coin), 'moneda', 'monedas')}`;
    case 'roach.laid':
      return `${who} soltó una cucaracha en la mesa ${String(p.table)} de tu restaurante`;
    case 'roach.killed':
      return `${who} eliminó la cucaracha de tu mesa ${String(p.table)}`;
    case 'friend.refuel':
      return `${who} te puso ${String(p.oil)} de aceite`;
    case 'friend.flip':
      if (p.outcome === 'food')
        return `${who} revolvió tu despensa y se llevó ${foodName(Number(p.foodsId))}`;
      if (p.outcome === 'caught')
        return `${who} cayó en una ratonera al revolver tu despensa y te dejó ${String(p.coin)} ${plEs(String(p.coin), 'moneda', 'monedas')}`;
      return `${who} revolvió tu despensa y no encontró nada`;
    case 'exchange':
      return p.result === 'caught'
        ? `${who} fue atrapado intentando cambiar tus ingredientes bloqueados`
        : `${who} intercambió ingredientes contigo`;
    case 'mc.eaten':
      return `${who} probó tu plato estrella`;
    case 'lesson.taught':
      if (!p.success) return `${who} ${p.type === 2 ? 'no logró espiar' : 'no aprendió nada'} en tu clase`;
      return `${who} ${p.type === 2 ? 'espió con éxito' : 'aprendió un plato estrella'} en tu clase`;
    case 'thumb':
      return `${who} te dio un me gusta`;
    case 'friend.apply':
      return `${who} te envió una solicitud de amistad`;
    case 'yard.helped': {
      const what =
        p.what === 'weed'
          ? 'quitó las malas hierbas de'
          : p.what === 'deworm'
            ? 'quitó los bichos de'
            : 'regó';
      return `${who} ${what} tu ${foodName(Number(p.foodsId))}`;
    }
    case 'yard.stolen': {
      const caught = p.punished ? `; tu border collie lo atrapó y dejó ${foodName(Number(p.punished))}` : '';
      return `${who} robó tu ${foodName(Number(p.foodsId))}×${String(p.num)}${caught}`;
    }
    case 'friend.accept':
      return `${who} aceptó tu solicitud de amistad`;
    default:
      return item.type;
  }
}

const events: Messages['events'] = {
  gain: 'Obtenido',
  loss: 'Gastado',
  kind: {
    coin: 'Monedas',
    diamond: 'Diamantes',
    exp: 'EXP',
    renown: 'Renombre',
    oil: 'Aceite',
    strength: 'Energía',
  },
  remnant: (names, id) => `Fragmento de ${mcNameOf(names, id)}`,
  seed: (names, id) => seedNameOf(names, id),
  basket: (name) => `Cesta · ${name}`,
  activityCurrency: (name, num) => `${name ?? 'Moneda del evento'}×${num} (moneda del evento)`,
  lucky: ' (con suerte)',
  sep: ', ',
  groupSep: '; ',
  more: (text, count) => `${text} y más (${count} en total)`,
  logs: {
    'mc.learn': (p, names) => `Aprendiste el plato estrella «${mcNameOf(names, n(p, 'mcId'))}»`,
    'mc.levelUp': (p, names) => `Dominio de «${mcNameOf(names, n(p, 'mcId'))}» al nivel ${n(p, 'curlevel')}`,
    'mc.forget': (p, names) => {
      const k = Array.isArray(p.cookbooks) ? p.cookbooks.length : 0;
      const lost = typeof p.lost === 'number' ? p.lost : 0;
      if (typeof p.grades === 'number')
        return `Espionaje fallido: ${k} ${plEs(k, 'receta bajó', 'recetas bajaron')} ${p.grades} ${plEs(p.grades, 'nivel de calidad', 'niveles de calidad')}${lost > 0 ? `, ${lost} ${plEs(typeof p.lost === 'number' ? p.lost : 0, 'se olvidó', 'se olvidaron')}` : ''}${p.mcId ? ` y olvidaste el plato estrella «${mcNameOf(names, n(p, 'mcId'))}»` : ''}`;
      return `Espionaje fallido: olvidaste ${k} ${plEs(k, 'receta', 'recetas')}${p.mcId ? ` y el plato estrella «${mcNameOf(names, n(p, 'mcId'))}»` : ''}`;
    },
    'temple.trial': (p, names) =>
      p.success
        ? `«${mcNameOf(names, n(p, 'mcId'))}» superó la prueba: valor de prueba +${n(p, 'worth')}\u00a0%, EXP de prueba +${n(p, 'exp')}\u00a0%`
        : `«${mcNameOf(names, n(p, 'mcId'))}» no superó la prueba`,
    'kraken.forget': (p, names) =>
      `El Kraken quedó descontento; olvidaste el plato estrella «${mcNameOf(names, n(p, 'mcId'))}»`,
    'equip.stress': (p, names) =>
      `Refuerzo de ${names.goodsName(n(p, 'goodsId'))} a +${n(p, 'to')}: ${p.success ? 'éxito' : 'fallo'}`,
    'level.up': (p) => `El restaurante subió al nivel ${n(p, 'to')}`,
    'star.up': (p) => `El restaurante alcanzó ${n(p, 'star')} ${plEs(n(p, 'star'), 'estrella', 'estrellas')}`,
    'oil.expand': (p) =>
      `Bidón de aceite ampliado al nivel ${n(p, 'level')} (máx. ${formatNum(n(p, 'oilMax'))})`,
    'rest.closed': () => 'Se acabó el aceite; el restaurante cerró',
    'rest.reopen': () => 'Se llenó el aceite; el restaurante volvió a abrir',
    'rest.rename': (p) => `Restaurante renombrado a «${String(p.to ?? '')}»`,
    'rest.move': () => 'El restaurante se mudó',
    'mouse.escape': () => 'Vino un ratón, pero por suerte no pasó nada',
    'mouse.trap': (p) =>
      `La ratonera atrapó un ratón: obtuviste ${formatNum(n(p, 'coin'))} ${plEs(formatNum(n(p, 'coin')), 'moneda', 'monedas')}`,
    'mouse.steal': (p, names) => `Un ratón robó ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')}`,
    'mouse.nothing': () => 'Vino un ratón pero no robó nada',
    'mouse.map': () => 'Un ratón dejó un mapa de exploración',
    'krab.happy': () => 'A Don Krab le encantó la comida',
    'krab.angry': () => 'Don Krab se fue decepcionado',
    'krab.husky': () => 'Don Krab acarició al husky y no se enfadó',
    'krab.painting': () => 'Don Krab admiró el cuadro y se fue satisfecho',
    'krab.driven': () => 'Echaste al enfadado Don Krab',
    'plankton.appear': () => 'Plancton vino al restaurante',
    'plankton.driven': () => 'Echaste a Plancton',
    'fridge.drop': (p, names) =>
      `La nevera estaba llena; se tiró ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')}`,
    'goods.drop': (p, names) =>
      `Superaste el límite de posesión; se tiró ${names.goodsName(n(p, 'goodsId'))}×${n(p, 'num')}`,
    'device.place': (p, names) => `Colocaste ${names.goodsName(n(p, 'goodsId'))}`,
    'store.use': (p, names) => `Usaste ${names.goodsName(n(p, 'goodsId'))}×${n(p, 'num')}`,
    'admin.grant': (p) => `Compensación: ${String(p.reason ?? '')}`,
    redeem: (p) => `Usaste el código ${String(p.code ?? '')}`,
    'bar.darts': (p) =>
      `Dardos en el bar: ${p.result === 'win' ? 'victoria' : p.result === 'draw' ? 'empate' : 'derrota'}`,
    'bar.devil': (p) =>
      p.result === 'win'
        ? `Chile del Diablo: aguantaste ${n(p, 'survived')} ${plEs(n(p, 'survived'), 'vaso', 'vasos')} y ganaste`
        : `Chile del Diablo: aguantaste ${n(p, 'survived')} ${plEs(n(p, 'survived'), 'vaso', 'vasos')} y caíste`,
    'bar.memory': (p) => `Cóctel Memoria nivel ${n(p, 'level')}: ${p.correct ? 'acertaste' : 'fallaste'}`,
    // 收购（问题记录 421）
    'acquire.bought': (p) =>
      `${p.way === 'listed' ? 'Compraste' : 'Adquiriste'} «${String(p.name ?? '')}»${p.way === 'listed' ? ' (en venta)' : ''} por ${formatNum(n(p, 'price'))} monedas`,
    'acquire.taken': (p) =>
      `«${String(p.byName ?? '')}» adquirió tu restaurante por ${formatNum(n(p, 'price'))} monedas`,
    'acquire.sold': (p) =>
      `«${String(p.to ?? '')}» te compró «${String(p.name ?? '')}»; recibiste ${formatNum(n(p, 'got'))} monedas`,
    'acquire.redeemed': (p) =>
      `Recompraste tu restaurante a «${String(p.from ?? '')}» por ${formatNum(n(p, 'price'))} monedas`,
    'acquire.lost': (p) =>
      `«${String(p.name ?? '')}» se recompró; recibiste ${formatNum(n(p, 'got'))} monedas`,
    'acquire.released': (p) => `Soltaste «${String(p.name ?? '')}»`,
    'acquire.freed': (p) => `«${String(p.byName ?? '')}» soltó tu restaurante; vuelves a ser independiente`,
    'acquire.dividend': (p) =>
      `Dividendos de ayer de tus ${n(p, 'n')} restaurante(s): ${formatNum(n(p, 'coin'))} monedas`,
    'acquire.tended': (p) =>
      `Atendiste el restaurante para tu dueño «${String(p.ownerName ?? '')}» y recibiste ${n(p, 'n')} ingredientes`,
    'dine.started': (p) => `Empezaste a comer gratis en «${String(p.hostName ?? '')}»`,
    'dine.ended': (p) => `Terminaste de comer gratis en «${String(p.hostName ?? '')}»`,
    'forum.post': (p) => `Publicaste el tema n.º ${n(p, 'postId')} en el foro`,
    'forum.reply': (p) => `Respondiste al tema n.º ${n(p, 'postId')} del foro`,
    'forum.edit': (p) => `Editaste el tema n.º ${n(p, 'postId')} del foro`,
    'forum.delete': (p) => `Borraste el tema n.º ${n(p, 'postId')} del foro`,
    'forum.reply.delete': (p) => `Borraste una respuesta en el tema n.º ${n(p, 'postId')}`,
    'forum.admin': (p) => `Moderaste el tema n.º ${n(p, 'postId')} del foro`,
    'friend.weekly': (p, names) =>
      `${n(p, 'rank')}.º en la clasificación semanal de amigos, ganas ${names.goodsName(n(p, 'goodsId'))}`,
    'hiphop.event': () => 'El Chico hip-hop organizó un evento en el restaurante',
    'hiphop.tip': () => 'Diste propina al Chico hip-hop',
    'hiphop.wage': (p, names) => `Cobraste el sueldo del Chico hip-hop (${names.goodsName(n(p, 'cardId'))})`,
    'hiphop.weekly': (p, names) =>
      `${n(p, 'rank')}.º en la clasificación hip-hop semanal, ganas ${names.goodsName(n(p, 'goodsId'))}`,
    'market.manual': (p) =>
      `Te abasteciste a mano en el mercado por ${formatNum(n(p, 'cost'))} ${plEs(formatNum(n(p, 'cost')), 'moneda', 'monedas')}`,
    'market.share': (p, names) =>
      `Compraron tus ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')} compartidos en el mercado`,
    'takeaway.open': () => 'Abriste el servicio a domicilio',
    'takeaway.refresh': (p) =>
      `Actualizaste los pedidos a domicilio (${n(p, 'times')} ${plEs(n(p, 'times'), 'vez', 'veces')} hoy)`,
    'takeaway.deliver': () => 'Enviaste un pedido a domicilio',
    'takeaway.claim': (p) =>
      p.success
        ? `Pedido entregado: obtuviste ${formatNum(n(p, 'coin'))} ${plEs(formatNum(n(p, 'coin')), 'moneda', 'monedas')}`
        : 'El reparto falló',
    'takeaway.rebate': (p) =>
      `Repartiste como repartidor: obtuviste ${formatNum(n(p, 'coin'))} ${plEs(formatNum(n(p, 'coin')), 'moneda', 'monedas')} y ${formatNum(n(p, 'exp'))} EXP`,
    'takeaway.hire': () => 'Contrataste a un amigo como repartidor',
    'takeaway.dismiss': () => 'Pagaste y despediste a un repartidor',
    'tower.rank.week': (p, names) =>
      `${n(p, 'rank')}.º en la clasificación semanal de la Torre de chefs, ganas ${names.goodsName(n(p, 'goodsId'))}`,
    'town.exchange': (p) => `Hiciste ${n(p, 'num')} ${plEs(n(p, 'num'), 'canje', 'canjes')} en el Gremio`,
    'town.levelTicket': (p) =>
      `Usaste un vale de ingredientes de nivel ${n(p, 'level')} por ${n(p, 'total')} ${plEs(n(p, 'total'), 'ingrediente', 'ingredientes')}`,
    'town.mysteryTicket': (p, names) =>
      `Conseguiste ${names.foodName(n(p, 'foodsId'))} con un vale de ingrediente misterioso`,
    'town.feast': () => 'Participaste en el banquete de la plaza',
    'town.hammer': () => 'Golpeaste con el martillo del clima y cambiaste el tiempo',
    'town.mayor': (p) =>
      p.right
        ? 'Respondiste bien a la pregunta del Alcalde Gran Olla'
        : 'Respondiste mal a la pregunta del Alcalde Gran Olla',
    'town.shake': (p) =>
      `Sacudiste el árbol del dinero: ${formatNum(n(p, 'coin'))} ${plEs(formatNum(n(p, 'coin')), 'moneda', 'monedas')}`,
    'town.talk': () => 'Charlaste con los vecinos',
    'town.wish': () => 'Pediste un deseo en la plaza',
    'exchange.order': (p, names) =>
      `Pusiste una orden ${side(p)} en la bolsa: ${names.foodName(n(p, 'foodsId'))} ×${n(p, 'qty')} a ${formatNum(n(p, 'price'))} cada uno${n(p, 'filled') > 0 ? ` (${n(p, 'filled')} ejecutados al instante)` : ''}${heldNote(p)}`,
    'exchange.fill': (p, names) =>
      p.side === 'sell'
        ? `Orden de venta ejecutada: ${names.foodName(n(p, 'foodsId'))} ×${n(p, 'qty')} a ${formatNum(n(p, 'price'))} cada uno, comisión ${formatNum(n(p, 'fee'))}${p.held ? heldNote(p) : ' (ganancias en tu cuenta de la bolsa)'}`
        : `Orden de compra ejecutada: ${names.foodName(n(p, 'foodsId'))} ×${n(p, 'qty')} a ${formatNum(n(p, 'price'))} cada uno${p.held ? heldNote(p) : ' (ingredientes en tu cuenta de la bolsa)'}`,
    'exchange.cancel': (p, names) =>
      `Cancelaste una orden ${side(p)}: ${names.foodName(n(p, 'foodsId'))}, se devolvieron ${n(p, 'left')}`,
    'exchange.expire': (p, names) =>
      `Venció una orden ${side(p)}: ${names.foodName(n(p, 'foodsId'))}, los ${n(p, 'left')} restantes volvieron a tu cuenta de la bolsa`,
    'exchange.withdraw': (p, names) =>
      `Retiraste de tu cuenta de la bolsa: ${coinFoods(p, names, (c) => `${c} ${plEs(c, 'moneda', 'monedas')}`)}`,
    'exchange.freezeCancel': (p, names) =>
      `Tu bolsa fue congelada y se canceló una orden ${side(p)}: ${names.foodName(n(p, 'foodsId'))}, los ${n(p, 'left')} restantes volvieron a tu cuenta de la bolsa`,
    'exchange.confiscate': (p, names) =>
      `Se confiscaron las ganancias congeladas de la bolsa: ${coinFoods(p, names, (c) => `${c} ${plEs(c, 'moneda', 'monedas')}`)}`,
    'predict.trade': (p) =>
      `Predicción «${String(p.title ?? '')}»: ${p.dir === 'sell' ? 'vendiste' : 'compraste'} ${n(p, 'qty')} ${plEs(n(p, 'qty'), 'participación', 'participaciones')} ${p.side === 'no' ? 'No' : 'Sí'} por ${formatNum(n(p, 'amount'))}, comisión ${formatNum(n(p, 'fee'))}`,
    'predict.settle': (p) =>
      `Predicción «${String(p.title ?? '')}»: resultado ${p.outcome ? 'Sí' : 'No'}, recibiste ${formatNum(n(p, 'coin'))} ${plEs(formatNum(n(p, 'coin')), 'moneda', 'monedas')}${predictNet(p)}`,
    'predict.refund': (p) =>
      `Predicción «${String(p.title ?? '')}» anulada: ${plEs(formatNum(n(p, 'coin')), 'se devolvió', 'se devolvieron')} ${formatNum(n(p, 'coin'))} ${plEs(formatNum(n(p, 'coin')), 'moneda', 'monedas')}${predictNet(p)}`,
    'kuji.buy': (p) =>
      `Compraste ${n(p, 'num')} ${plEs(n(p, 'num'), 'boleto', 'boletos')} de Ichiban Kuji${p.line === 'deluxe' ? ' de lujo' : ''} por ${formatNum(n(p, 'coin'))} ${plEs(formatNum(n(p, 'coin')), 'moneda', 'monedas')}`,
    'kuji.activation': (p) =>
      `Recogiste el premio de actividad de ${n(p, 'points')} ${plEs(n(p, 'points'), 'punto', 'puntos')} y ${n(p, 'num')} ${plEs(n(p, 'num'), 'boleto', 'boletos')} de Ichiban Kuji extra`,
    'kuji.draw': (p) => {
      const tiers = Object.entries((p.tiers ?? {}) as Record<string, number>)
        .map(([k, v]) => `premio ${k} ×${v}`)
        .join(', ');
      return `Sacaste ${n(p, 'num')} ${plEs(n(p, 'num'), 'boleto', 'boletos')} del sorteo n.º ${n(p, 'seq')} del Ichiban Kuji${p.line === 'deluxe' ? ' de lujo' : ''}: ${tiers}${p.last ? ', y el Último Premio' : ''}`;
    },
    'fund.deposit': (p) =>
      `Depositaste ${formatNum(n(p, 'coin'))} ${plEs(formatNum(n(p, 'coin')), 'moneda', 'monedas')} en el Fondo de Desarrollo (${fund.tierName(String(p.tier ?? ''))})`,
    'fund.claim': (p, names) =>
      `Cobraste tu depósito del Fondo de Desarrollo: recuperaste ${formatNum(n(p, 'coin'))} ${plEs(formatNum(n(p, 'coin')), 'moneda', 'monedas')} y ${names.goodsName(n(p, 'medal'))}`,
    'fund.withdraw': (p) =>
      `Retiraste tu depósito del Fondo de Desarrollo antes de tiempo: recuperaste ${formatNum(n(p, 'coin'))} ${plEs(formatNum(n(p, 'coin')), 'moneda', 'monedas')}`,
    'activity.claim': (p) => `Reclamaste las recompensas del evento «${String(p.title ?? '')}»`,
    'activity.unlock': (p) => `Desbloqueaste las recompensas premium del evento «${String(p.title ?? '')}»`,
    'activity.exchange': (p) =>
      `Hiciste ${String(p.times ?? 1)} ${plEs(String(p.times ?? 1), 'canje', 'canjes')} en el evento «${String(p.title ?? '')}»`,
    'mail.claim': (p) => `Reclamaste los adjuntos del correo «${String(p.title ?? '')}»`,
    'admin.rename': (p) =>
      `Un administrador cambió el nombre del restaurante de «${String(p.from ?? '')}» a «${String(p.to ?? '')}»: ${String(p.reason ?? '')}`,
    'market.guess': (p) =>
      `Resultado de la apuesta del mercado: ${n(p, 'hits')} ${plEs(n(p, 'hits'), 'acierto', 'aciertos')}`,
    'market.guess.refund': (p) => {
      const [day, hour] = String(p.period ?? '').split('@');
      return `La ronda de apuestas del mercado del ${day} a las ${Number(hour)}:00 no se sorteó; se devolvió tu inscripción`;
    },
  },
  feed: describeFeed,
};
export default events;

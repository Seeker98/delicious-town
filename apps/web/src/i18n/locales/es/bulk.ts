import type { Messages } from '../..';
import { plEs } from '../../helpers';

const bulk: Messages['bulk'] = {
  tab: 'Suscripción mayorista',
  intro:
    'Cada día sale un lote de un ingrediente. Puja un precio por unidad y una cantidad; al cierre, el precio de la última unidad que entra es el precio único que pagan todos, y lo congelado de más se devuelve.',
  helpTitle: 'Cómo funciona la suscripción mayorista',
  help: (cap, group, raisePct, cooldown, windowMin, openHour, blindMin) => [
    `Cada día a las ${openHour}:00 sale un lote nuevo, que dura un día`,
    'Las unidades se reparten de mayor a menor precio (a igual precio, gana la puja anterior); la puja de la última unidad repartida es el precio único que pagan todos',
    `Como máximo ${cap} ${plEs(cap, 'unidad', 'unidades')} por jugador en este lote; si en total se pujan menos de ${group}, el lote fracasa y se devuelve todo`,
    'Al pujar se congela precio × cantidad; tras el cierre pagas el precio final y se devuelve el resto',
    `Las pujas solo pueden subir: precio y cantidad solo aumentan, y cada subida de precio es de al menos el ${raisePct}\u00a0%`,
    `El lote puede cerrarse en cualquier momento de los últimos ${windowMin} minutos y las pujas posteriores no cuentan; tras cada puja hay que esperar ${cooldown} ${plEs(cooldown, 'segundo', 'segundos')}`,
    'Si no consigues ninguna unidad pero tu puja quedó cerca del precio final, recibes un vale de ingrediente al azar',
    'Los mismos requisitos que la bolsa',
    ...(blindMin > 0
      ? [
          `Desde ${blindMin} minutos antes del final, el precio previsto, el umbral y las unidades pujadas se congelan en ese momento; quién entra se sabe al cierre`,
        ]
      : []),
  ],
  off: 'La suscripción mayorista aún no está abierta en este servidor',
  none: (openHour) => `Ahora no hay ningún lote; cada día sale uno nuevo a las ${openHour}:00`,
  food: (name, level) => `${name} (nivel ${level})`,
  lotLine: (qty, reserve, cap) => `${qty} unidades, precio de salida ${reserve}, máximo ${cap} por jugador`,
  price: (n) => `Precio final previsto: ${n}`,
  threshold: (n) => `Para entrar, puja al menos ${n}`,
  demand: (ratio, bidders) =>
    `Suscrito ${ratio} veces, ${bidders} ${plEs(bidders, 'participante', 'participantes')}`,
  grouped: (ok, group) =>
    ok ? 'Ya hay pujas suficientes' : `Aún faltan pujas (hacen falta ${group} unidades)`,
  ends: (time, min) => `Cierra hacia las ${time}: en cualquier momento de los últimos ${min} minutos`,
  mineTitle: 'Mi puja',
  mineLine: (price, qty, frozen) => `${price} × ${qty}, ${frozen} monedas congeladas`,
  inAll: (won) => `Todo dentro (${won})`,
  inPart: (won, qty) => `${won} / ${qty} dentro`,
  out: 'Todavía fuera',
  raiseMore: '; sube la puja para entrar con más',
  estimate: (n) => `Si cerrara ahora pagarías unas ${n} monedas`,
  priceLabel: 'Precio por unidad',
  qtyLabel: 'Cantidad',
  minRaise: (n) => `Para subir el precio, puja al menos ${n}`,
  freeze: (total, extra, again) =>
    again
      ? `${total} monedas congeladas en total, ${extra} más esta vez.`
      : `Congela ${total} monedas (precio × cantidad).`,
  settleNote: 'Al cierre pagas el precio final único, nunca más que tu puja; se devuelve el resto.',
  estimateAll: (price, total) => `Al precio previsto de ${price}, conseguirlas todas costaría unas ${total}.`,
  estimateOut: 'Con este precio ahora no entrarías; puja por encima del umbral para entrar.',
  blindNote: (time) =>
    `Tramo final: las cifras de arriba se quedaron congeladas a las ${time}; las pujas posteriores se conocen al cierre`,
  blindMine: 'En el tramo final no se muestra quién entra; se sabe al cierre',
  estimateBlind: 'Tramo final: si entras y cuánto pagas se sabe al cierre.',
  partialHint:
    'Si tu precio queda justo en el corte puede que solo consigas parte de las unidades: a igual precio gana la puja anterior, y las que no entren se devuelven íntegras.',
  reasons: {
    invalid: 'Escribe números enteros en precio y cantidad',
    reserve: (n) => `El precio no puede ser menor que el de salida, ${n}`,
    cap: (n) => `Como máximo ${n} por jugador`,
    shrink: 'Solo puedes subir el precio o la cantidad, no bajarlos',
    same: 'Tu puja no ha cambiado',
    raise: (n) => `Sube el precio al menos a ${n}`,
    coin: 'No tienes monedas suficientes para congelar',
  },
  bid: 'Pujar',
  raise: 'Subir puja',
  cooldown: (n) => `Podrás volver a pujar en ${n} ${plEs(n, 'segundo', 'segundos')}`,
  confirm: (total, extra, qty) =>
    `¿Hacer esta puja?\n${total} monedas congeladas en total, ${extra} ahora. Al cierre pagas el precio final único y se devuelve el resto.\nPuede que solo consigas parte de las ${qty} unidades; las que no entren se devuelven íntegras.`,
  bidDone: 'Puja hecha',
  recentTitle: 'Resultados recientes',
  noRecent: 'Todavía no ha terminado ningún lote',
  result: (name, sold, price, ratio) => `${name} ×${sold} vendido a ${price}, suscrito ${ratio} veces`,
  failed: (name) => `${name}: pujas insuficientes, el lote fracasó y se devolvió todo`,
  cancelled: (name) => `${name}: cancelado, se devolvió todo`,
  myPending: 'Lo mío: en liquidación',
  myWon: (won, paid, refunded) => `Lo mío: ${won} unidades, pagado ${paid}, devuelto ${refunded}`,
  myLost: (refunded, consolation) =>
    `Lo mío: ninguna, devuelto ${refunded}${consolation ? ', con premio de consolación' : ''}`,
  loadFailed: 'No se pudo cargar la suscripción mayorista',
  bidFailed: 'La puja falló',
};
export default bulk;

import type { Messages } from '../..';
import { plEs } from '../../helpers';

const futures: Messages['futures'] = {
  tabSpot: 'Al contado',
  tabFutures: 'Futuros',
  intro:
    'Encarga un ingrediente concreto: pagas un depósito para fijar el precio y el resto se cobra solo en la entrega.',
  helpTitle: 'Cómo funcionan los futuros',
  help: (hours, pct) => [
    `Pagas el ${pct}\u00a0% del total como depósito. A las ${hours} horas se entrega solo: si el restaurante tiene monedas suficientes, se cobra el resto y los ingredientes van a la despensa (lo que no quepa va a tu cuenta de la bolsa).`,
    'Si al vencer no tienes monedas para el resto, o cancelas antes, el pedido queda impagado: pierdes el depósito y el cupo de hoy no se devuelve.',
    'El precio por unidad se fija al pedir: el precio de referencia de la bolsa, entre el precio por nivel del mercado y el doble, más un 20\u00a0%.',
    'Cada ingrediente tiene un cupo diario para todo el servidor y cada jugador un límite diario total. Ambos se reinician a medianoche.',
  ],
  personLeft: (n, max) => `Hoy puedes encargar ${n} más (${max} al día)`,
  off: 'En este servidor no se pueden encargar futuros ahora. Los pedidos existentes se entregan igualmente',
  blocked: {
    exchange_level: (n) => `Los futuros se desbloquean con el restaurante en nivel ${n}`,
    exchange_age: (n) => `Tu cuenta debe tener ${n} ${plEs(n, 'día', 'días')} para encargar futuros`,
    exchange_email: 'Verifica tu correo para encargar futuros',
    exchange_frozen: 'Tu bolsa está congelada, no puedes encargar futuros',
  },
  filters: { all: 'Todos', rare: 'Raros', normal: 'Comunes', street: 'Los que pide mi calle' },
  search: 'Buscar ingrediente',
  level: (n) => `Nivel ${n}`,
  foodLine: (price, left) => `${price} monedas · quedan ${left} hoy`,
  soldOut: 'Agotado por hoy',
  empty: 'Ningún ingrediente coincide',
  qty: 'Cantidad',
  total: (s) => `Total ${s} monedas`,
  deposit: (s) => `Depósito ${s}`,
  balance: (s) => `Resto ${s}`,
  dueAt: (time) => `Entrega ${time}`,
  warn: 'Si al vencer no tienes monedas para el resto, o cancelas antes, el pedido queda impagado y el depósito no se devuelve.',
  order: 'Encargar (pagar depósito)',
  ordered: 'Encargado. Se entregará solo al vencer',
  orderFailed: 'No se pudo encargar',
  mine: 'Mis futuros',
  none: 'Aún no tienes futuros',
  line: (name, qty, price) => `${name}×${qty} · ${price} cada uno`,
  openLine: (left, balance) => `Entrega en ${left}, resto ${balance} monedas`,
  delivered: (wallet) => (wallet > 0 ? `Entregado (${wallet} a tu cuenta de la bolsa)` : 'Entregado'),
  defaulted: (deposit) => `Impagado, depósito de ${deposit} monedas perdido`,
  cancelled: 'Cancelado',
  cancel: 'Cancelar',
  cancelConfirm: (deposit) =>
    `Cancelar cuenta como impago: no se devuelven el depósito de ${deposit} monedas ni el cupo de hoy. ¿Cancelar el pedido?`,
  cancelDone: 'Pedido cancelado',
  cancelFailed: 'No se pudo cancelar',
  loadFailed: 'No se pudieron cargar los futuros',
};
export default futures;

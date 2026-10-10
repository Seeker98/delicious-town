import type { Messages } from '../..';
import { plEs } from '../../helpers';

const wealth: Messages['wealth'] = {
  intro:
    'Deposita monedas unos días: al vencer recuperas todo el capital y además recibes paquetes de suministros del mercado, que al abrirlos te dan un ingrediente que le falta a tu calle.',
  helpTitle: 'Cómo funciona',
  helpTerm: (days, unit, per, pack) =>
    `${days} ${plEs(days, 'día', 'días')}: ${per} «${pack}» por cada ${unit} monedas`,
  helpRules: (maxActive, maxTotal, earlyPct, minLevel) => [
    `Hasta ${maxActive} ${plEs(maxActive, 'depósito', 'depósitos')} a la vez y ${maxTotal} monedas en total`,
    'Al vencer, pulsa Cobrar: recuperas todo el capital y los paquetes van a tu almacén; si no cobras, el depósito te espera',
    `Retirar antes solo devuelve el ${earlyPct}\u00a0% del capital y sin paquetes; tras vencer solo se puede cobrar`,
    'El paquete elige el ingrediente al abrirlo: uno del nivel del paquete que le falte a la calle donde estés entonces; si no falta ninguno, uno al azar de ese nivel',
    `Disponible desde el nivel ${minLevel} del restaurante`,
  ],
  myCoin: (n) => `Mis monedas: ${n}`,
  term: (days, pack) => `${days} ${plEs(days, 'día', 'días')} · ${pack}`,
  qty: 'Depositar',
  unitSuffix: (unit) => `× ${unit} monedas`,
  left: (n) => `Aún puedes depositar ${n} monedas`,
  summary: (amount, due, packs, pack) =>
    `Depositas ${amount} monedas, vence el ${due}: recuperas todo el capital y recibes «${pack}» ×${packs}`,
  needLevel: (n) => `Los depósitos se desbloquean en el nivel ${n} del restaurante`,
  countFull: (n) =>
    `Ya tienes ${n} ${plEs(n, 'depósito', 'depósitos')}; cobra o retira uno antes de depositar otro`,
  totalFull: (total) => `Tus depósitos ya llegan al límite de ${total} monedas`,
  notEnough: 'No tienes monedas suficientes',
  deposit: 'Depositar',
  depositConfirm: (amount, days, packs, pack, earlyPct) =>
    `¿Depositar ${amount} monedas?\nVence en ${days} ${plEs(days, 'día', 'días')}: recuperas todo el capital y recibes «${pack}» ×${packs}. Retirar antes solo devuelve el ${earlyPct}\u00a0% y sin paquetes.`,
  deposited: 'Depositado',
  mine: 'Mis depósitos',
  none: 'Todavía no tienes depósitos',
  line: (amount, days) => `${amount} monedas · ${days} ${plEs(days, 'día', 'días')}`,
  packLine: (pack, packs) => `Al vencer: «${pack}» ×${packs}`,
  dueAt: (time) => `Vence: ${time}`,
  mature: 'Vencido: ya puedes cobrarlo',
  claim: 'Cobrar',
  claimed: (pack, packs) => `¡Cobrado! Capital devuelto y «${pack}» ×${packs} en tu almacén`,
  withdraw: (pct) => `Retirar antes (devuelve el ${pct}\u00a0%, sin intereses)`,
  withdrawConfirm: (back, amount) =>
    `¿Retirar antes? Depositaste ${amount} monedas y solo recuperas ${back}, sin paquetes.`,
  withdrawn: (n) => `Has retirado ${n} ${plEs(n, 'moneda', 'monedas')}`,
  loadFailed: 'No se pudieron cargar los depósitos',
  failed: 'La operación falló',
};
export default wealth;

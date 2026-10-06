import type { Messages } from '../..';
import { plEs } from '../../helpers';

const TIERS: Record<string, string> = {
  A: 'A · Inversor Ancla',
  B: 'B · Capital de Crecimiento',
  C: 'C · Liquidez',
};

const fund: Messages['fund'] = {
  rule: (days, back, early) =>
    `Los depósitos vencen a los ${days} ${plEs(days, 'día', 'días')}: recuperas el ${back}\u00a0% del capital y una medalla de EXP. Retirar antes solo devuelve el ${early}\u00a0% y sin medalla. Un depósito a la vez por restaurante; las medallas del fondo no se acumulan.`,
  myCoin: (n) => `Mis monedas: ${n}`,
  tierName: (key) => TIERS[key] ?? key,
  tierLine: (coin, back) =>
    `Deposita ${coin} ${plEs(coin, 'moneda', 'monedas')} y recupera ${back} al vencer`,
  medalLine: (name, pct) => `Al vencer: «${name}», EXP +${pct}\u00a0%`,
  iconLine: (title) => `Incluye el título temporal «${title}», que vence con la medalla`,
  days: (n) => `Plazo: ${n} ${plEs(n, 'día', 'días')}`,
  deposit: 'Depositar',
  notEnough: 'No tienes monedas suficientes',
  depositConfirm: (tier, coin, back, days) =>
    `¿Depositar ${coin} ${plEs(coin, 'moneda', 'monedas')} en el Fondo de Desarrollo (${tier})?\nVence en ${days} ${plEs(days, 'día', 'días')}: recuperarás ${back} ${plEs(back, 'moneda', 'monedas')} y una medalla. Si retiras antes solo recuperas una parte y sin medalla.`,
  deposited: (tier) => `Suscrito: ${tier}`,
  mine: 'Mi depósito',
  depositLine: (tier, coin) => `${tier}: ${coin} ${plEs(coin, 'moneda', 'monedas')}`,
  maturesAt: (time) => `Vence: ${time}`,
  mature: 'Vencido: ya puedes reclamar',
  claim: (back) => `Reclamar ${back} ${plEs(back, 'moneda', 'monedas')} y la medalla`,
  claimed: '¡Reclamado! La medalla está en tu almacén',
  withdraw: (early) => `Retirar antes (solo ${early} ${plEs(early, 'moneda', 'monedas')})`,
  withdrawConfirm: (early, back) =>
    `¿Retirar ahora? Solo recuperas ${early} ${plEs(early, 'moneda', 'monedas')} y sin medalla; al vencer obtendrías ${back} ${plEs(back, 'moneda', 'monedas')} y la medalla.`,
  withdrawn: (n) => `Retiraste ${n} ${plEs(n, 'moneda', 'monedas')}`,
  loadFailed: 'No se pudo cargar el fondo',
  failed: 'La operación falló',
};
export default fund;

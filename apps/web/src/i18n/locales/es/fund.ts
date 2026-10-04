import type { Messages } from '../..';

const TIERS: Record<string, string> = {
  A: 'A · Inversor Ancla',
  B: 'B · Capital de Crecimiento',
  C: 'C · Liquidez',
};

const fund: Messages['fund'] = {
  rule: (days, back, early) =>
    `Los depósitos vencen a los ${days} días: recuperas el ${back} % del capital y una medalla de EXP. Retirar antes solo devuelve el ${early} % y sin medalla. Un depósito a la vez por restaurante; las medallas del fondo no se acumulan.`,
  myCoin: (n) => `Mis monedas: ${n}`,
  tierName: (key) => TIERS[key] ?? key,
  tierLine: (coin, back) => `Deposita ${coin} monedas y recupera ${back} al vencer`,
  medalLine: (name, pct) => `Al vencer: «${name}», EXP +${pct} %`,
  iconLine: (title) => `Incluye el título temporal «${title}», que vence con la medalla`,
  days: (n) => `Plazo: ${n} días`,
  deposit: 'Depositar',
  notEnough: 'No tienes monedas suficientes',
  depositConfirm: (tier, coin, back, days) =>
    `¿Depositar ${coin} monedas en el Fondo de Desarrollo (${tier})?\nVence en ${days} días: recuperarás ${back} monedas y una medalla. Si retiras antes solo recuperas una parte y sin medalla.`,
  deposited: (tier) => `Suscrito: ${tier}`,
  mine: 'Mi depósito',
  depositLine: (tier, coin) => `${tier}: ${coin} monedas`,
  maturesAt: (time) => `Vence: ${time}`,
  mature: 'Vencido: ya puedes reclamar',
  claim: (back) => `Reclamar ${back} monedas y la medalla`,
  claimed: '¡Reclamado! La medalla está en tu almacén',
  withdraw: (early) => `Retirar antes (solo ${early} monedas)`,
  withdrawConfirm: (early, back) =>
    `¿Retirar ahora? Solo recuperas ${early} monedas y sin medalla; al vencer obtendrías ${back} monedas y la medalla.`,
  withdrawn: (n) => `Retiraste ${n} monedas`,
  loadFailed: 'No se pudo cargar el fondo',
  failed: 'La operación falló',
};
export default fund;

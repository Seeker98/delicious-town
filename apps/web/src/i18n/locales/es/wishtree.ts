import type { Messages } from '../..';

const wishtree: Messages['wishtree'] = {
  loadFailed: 'No se pudo cargar el Árbol de los deseos',
  wishFailed: 'No se pudo pedir el deseo',
  intro: 'Cada día el árbol da un objeto, y uno de los restaurantes que pidieron un deseo se lo lleva.',
  helpTitle: 'Cómo funciona el Árbol de los deseos',
  help: (hour, minLevel, titleDays, titleName) => [
    `El sorteo es cada día a las ${hour}:00 y a la vez el árbol da un objeto nuevo, igual para todo el servidor`,
    `Los restaurantes de nivel ${minLevel} o más pueden pedir 1 deseo por ronda, gratis`,
    `En el sorteo se elige al azar 1 restaurante que pidió un deseo: recibe el objeto y el título «${titleName}» (válido ${titleDays} días tras recogerlo), por correo`,
    'Cada restaurante que no gana recibe al momento una recompensa aleatoria',
  ],
  off: 'El Árbol de los deseos aún no está abierto en este servidor',
  today: 'Hoy el árbol da',
  entries: (n) => `${n} ${n === 1 ? 'deseo' : 'deseos'} hasta ahora`,
  drawAt: (time) => `Sorteo: ${time}`,
  wish: 'Pedir un deseo',
  wished: 'Deseo pedido, esperando el sorteo',
  need: (level) => `Tu restaurante necesita nivel ${level} para pedir un deseo`,
  done: '¡Deseo pedido! Nos vemos en el sorteo',
  none: (hour) => `Ahora no hay ronda. El árbol da un objeto nuevo cada día a las ${hour}:00`,
  recentTitle: 'Rondas recientes',
  noRecent: 'Aún no ha habido sorteos',
  empty: 'Nadie pidió un deseo',
  winner: (name, n) => `Ganó ${name} (${n} ${n === 1 ? 'deseo' : 'deseos'})`,
  mine: '¡Ganaste! El premio está en tu buzón',
  lost: (award) => `No ganaste, recibiste ${award}`,
  pending: 'No ganaste. Tu premio de consolación llegará enseguida',
};
export default wishtree;

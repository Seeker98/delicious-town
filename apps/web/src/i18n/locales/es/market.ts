import type { Messages } from '../..';
import { plEs } from '../../helpers';

const market: Messages['market'] = {
  sections: {
    daily: 'Mercado diario',
    special: 'Mercado de ofertas',
    premium: 'Mercado premium (requiere el Collar del Amor)',
  },
  specialNote: (min) =>
    `requiere correo verificado, 1 de cada por persona; una compra por red cada ${min} min`,
  manualConfirm: (cost, time) =>
    `¿Gastar ${cost} ${plEs(cost, 'moneda', 'monedas')} para poner 4 platos del día a la venta? Se retirarán en la próxima reposición diaria (${time}).`,
  manualDone: (renown) => `Reposición hecha. Renombre +${renown}`,
  manualFailed: 'No se pudo reponer',
  buyFailed: 'No se pudo comprar',
  capShared: (shared, can) =>
    `Tu red o dispositivo ya compró ${shared} en esta ronda (el límite cuenta por restaurante, dispositivo y red). Puedes comprar ${can} más`,
  capSlots: 'Tu despensa no tiene huecos libres. Libera uno primero',
  capFull: (max) => `Tu despensa está llena de este ingrediente (máx. ${max} de cada uno)`,
  capRoom: (max, have, room) =>
    `Máx. ${max} de cada ingrediente; tienes ${have}, así que puedes comprar ${room} más`,
  guessFailed: 'No se pudo apostar',
  loadFailed: 'No se pudo cargar el mercado',
  nextStock: (time) => `Próxima reposición ${time}`,
  manualBtn: (cost) => `Reponer a mano (${cost} ${plEs(cost, 'moneda', 'monedas')})`,
  specialWait: (min) => `Acabas de comprar una oferta. Tu red debe esperar ${min} min para comprar otra`,
  empty: 'Aún no hay género',
  hot: 'Popular',
  ownFree: 'Tu propio género, gratis',
  stockedBy: (name) => `Puesto por ${name}`,
  left: (n) => `Quedan ${n}`,
  priceLine: (price, left, bought, limit) =>
    `${price} ${plEs(price, 'moneda', 'monedas')} · quedan ${left} · comprado ${bought}/${limit}`,
  buy: 'Comprar',
  guess: {
    title: 'Apuesta del mercado',
    hint: (hour) => `Adivina qué venderá el próximo mercado diario (${hour}:00)`,
    last: (n) => `La última vez acertaste ${n}`,
    joined: (list) => `Apostado: ${list}`,
    rule: (max, cost) =>
      `Elige hasta ${max}, cuesta ${cost} ${plEs(cost, 'vale misterioso', 'vales misteriosos')}`,
    join: (n) => `Apostar (${n} elegidos)`,
  },
  sis: {
    name: 'Hermana del Huerto',
    chat: [
      '¿Eres nuevo? Mira primero «Más → Otros → Guía». También hay un código de bienvenida.',
      'Cada ingrediente tiene un límite en la despensa, no compres demasiado de golpe.',
      'El clima afecta a tus clientes. Acuérdate de mirar el tiempo de hoy.',
      'Los ingredientes universales de nivel 1 y 2 se cambian por raros en la despensa. Del nivel 3 en adelante solo sirven para sustituir un ingrediente al aprender recetas.',
      'El mercado diario se repone cada dos horas durante el día.',
      'El mercado de ofertas se repone cada hora. Ahí salen más baratos los ingredientes de nivel alto.',
      'Cosecha el huerto en cuanto madure, o alguien te lo robará.',
      '¡Mis verduras son las más frescas del pueblo!',
      'Cuantos más platos sepas cocinar, más clientes vendrán.',
      'Regístrate cada día en la página de inicio para llevarte un regalo.',
      'Don Krab ha vuelto a regatear. Bah.',
      'La hermana Wen reparte vales en la plaza cada día. Ve a charlar con ella.',
      'El Glotón puede comerse medio puesto mío en un día.',
      'Date una vuelta por el Gremio: si aciertas la pregunta del Alcalde Gran Olla, hay premio.',
      'Los ingredientes parecen caros, pero una buena receta se amortiza enseguida.',
      'Si aciertas la apuesta del mercado, los premios valen la pena.',
      'Con más amigos hay más ayuda y mejores negocios.',
      'Si estás cansado, descansa. La energía se recupera un poco cada ronda.',
      '¿Dudas? Mira la sección «Guías» del foro.',
      'El mercado premium solo se repone tres veces al día. Si te lo pierdes, toca esperar.',
    ],
    specialLeft: (n) => `${plEs(n, 'Queda', 'Quedan')} ${n} ${plEs(n, 'oferta', 'ofertas')}. ¡Date prisa!`,
    specialSoldOut: (time) => `Las ofertas se agotaron. Próxima reposición a las ${time}.`,
    nextDaily: (time) => `El mercado diario se repone a las ${time}. Pásate a verlo.`,
    guessOpen: 'Aún no has apostado en esta ronda. ¿Lo intentas abajo?',
    hasCard: 'Tienes un permiso de trabajo del mercado. Repón a mano si no quieres esperar.',
    cupboardFull: 'Tu despensa está llena. Haz sitio antes de comprar más.',
  },
};
export default market;

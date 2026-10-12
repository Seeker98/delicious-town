import type { Messages } from '../..';
import { plEs } from '../../helpers';

const misc: Messages['misc'] = {
  redeem: {
    title: 'Canjear código',
    note: 'El equipo del juego reparte los códigos y no distinguen mayúsculas. Cada restaurante puede usar un código una sola vez, y el premio llega al momento.',
  },
  weather: {
    loadFailed: 'No se pudo cargar el clima',
    noEffect: 'No afecta al negocio',
    zeroStarLine: 'A los restaurantes de 0 estrellas no les afecta el clima',
    until: (time) => `Hasta las ${time}`,
    krabPre: 'Hoy Don Krab está en ',
    krabPost: ': los restaurantes de esta calle tienen más probabilidad de recibir clientes misteriosos.',
    holiday: (n) => `Hoy es festivo: probabilidad de Vale Delicioso ×${n}`,
    slot: (from, to, next) => `${from} – ${to} · cambia a las ${next}:00`,
    coverSlot: (from, to, natural) => `${from} – ${to} · luego vuelve a ${natural}`,
    cover: (who, item, natural, now, minutes, next) => [
      { b: who },
      ` usó ${item} para cambiar ${natural} por ${now}: quedan `,
      { b: `${minutes} min` },
      `. El tiempo de fondo sigue cambiando; el próximo cambio es a las ${next}:00.`,
    ],
    someone: 'Alguien',
    how: {
      title: 'Cómo funciona el tiempo',
      fold: 'Ocultar',
      unfold: 'Mostrar',
      lines: (hours) => [
        `El tiempo cambia cada 4 horas (${hours.map((h) => `${h}:00`).join(', ')}) y sigue al tiempo actual: no nieva justo después del sol y la lluvia aumenta poco a poco.`,
        'La previsión de abajo da la probabilidad de cada tipo en el próximo cambio.',
        'Con mal tiempo, la brújula celeste (elige un tipo) o los palillos del tiempo (uno de dos) lo cambian durante 1 hora para todo el pueblo.',
      ],
    },
    forecast: {
      title: 'Previsión',
      next: (time) => `Próximo a las ${time}`,
      note: 'El tiempo sigue al actual: no pasa del sol a la nieve de golpe.',
    },
    types: ['', 'Soleado', 'Lluvia', 'Nieve y hielo', 'Viento, arena y niebla'],
    tools: {
      title: 'Cambiar el tiempo',
      compassSub: 'Elige un tipo de tiempo, el destino decide el resto · 1 hora',
      lotsSub: 'Agita dos palillos, quédate con uno · 1 hora',
      have: (n) => `Tienes ${n}`,
      use: 'Usar',
      pick: 'Elegir',
      toMayor: 'Con el alcalde',
      toShop: 'Tienda',
      rule: (hours) =>
        `Una vez cada ${hours} horas por jugador; nadie puede volver a cambiarlo en la hora siguiente a un cambio.`,
      locked: (minutes, time) =>
        `Alguien acaba de cambiar el tiempo. Inténtalo en ${minutes} min (después de las ${time}).`,
      cooling: (used, ready) => `Usaste uno a las ${used}. Podrás usar otro después de las ${ready}.`,
      done: (name, time) => `Ahora el tiempo es ${name} hasta las ${time}`,
      failed: 'No se pudo cambiar el tiempo',
    },
    compass: {
      title: 'Brújula celeste: elige un tipo',
      sub: 'El destino elige el tiempo exacto; dura 1 hora para todo el pueblo. La brújula nunca trae lluvia ácida ni helada.',
      cannot: 'El tiempo actual no puede pasar a este tipo',
      go: 'Usar 1 brújula celeste',
      pickFirst: 'Elige primero un tipo',
    },
    lots: {
      title: 'Palillos del tiempo',
      readySub:
        'Agita dos palillos y quédate con uno; el tiempo cambia durante 1 hora. Siguen al tiempo actual y de vez en cuando sale un tiempo especial.',
      draw: 'Agitar (usa 1 palillo del tiempo)',
      pickTitle: 'Palillos del tiempo: quédate con uno',
      pickSub: 'Ya salieron los palillos. Quédate con uno; el tiempo cambia durante 1 hora.',
      lot: (n) => `Palillo ${n}`,
      take: (name) => `Quedarme con ${name}`,
      countdown: (s) => `Si no eliges en ${s} s, se usa el palillo 1`,
    },
  },
  invite: {
    title: 'Invitar amigos',
    loadFailed: 'No se pudo cargar la información de invitaciones',
    copied: 'Copiado',
    copyFailed: 'No se pudo copiar; selecciónalo y cópialo a mano',
    myCode: 'Mi código de invitación',
    copy: 'Copiar código',
    copyLink: 'Copiar enlace',
    rules: (cap, lv1, lv2) =>
      `Tus amigos reciben un pack de inicio al abrir su restaurante. Cuando verifiquen su correo, recibirás un premio cuando su restaurante llegue al nivel ${lv1} y otro al nivel ${lv2}. ${plEs(cap, 'Cuenta', 'Cuentan')} como máximo ${cap} ${plEs(cap, 'amigo', 'amigos')} al mes.`,
    month: (n, cap) => `Contados este mes: ${n} / ${cap}`,
    empty: 'Aún no has invitado a nadie',
    entrySub: (n, cap) => `${n} / ${cap} invitados este mes · ganas premios cuando tus amigos suben de nivel`,
    entrySubPlain: 'Ganas premios cuando tus amigos suben de nivel',
    monthLabel: 'Contados este mes',
    stepOpen: 'Tu amigo abre',
    stepOpenGift: 'Pack inicial',
    stepLevel: (n) => `Amigo en nivel ${n}`,
    stepYou: 'Recibes uno',
    stepAgain: 'Uno más',
    rulesShort: (cap) =>
      `Un amigo cuenta cuando verifica su correo. Como máximo ${cap} ${cap === 1 ? 'amigo' : 'amigos'} al mes.`,
    listTitle: 'Amigos que invité',
    people: (n) => `${n} ${n === 1 ? 'persona' : 'personas'}`,
    level: (n) => `Nivel ${n}`,
    noRest: 'Aún sin restaurante',
    unverified: 'Correo sin verificar',
    stage: {
      sent: (lv) => `Premio de nivel ${lv} enviado`,
      pending: (lv) =>
        `Premio de nivel ${lv} pendiente (se envía cuando abras un restaurante en ese servidor)`,
      capped: (lv) => `Premio de nivel ${lv} por encima del límite del mes`,
    },
  },
};
export default misc;

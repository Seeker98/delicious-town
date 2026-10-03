import type { Messages } from '../..';

const misc: Messages['misc'] = {
  redeem: {
    title: 'Canjear código',
    note: 'El equipo del juego reparte los códigos y no distinguen mayúsculas. Cada restaurante puede usar un código una sola vez, y el premio llega al momento.',
  },
  weather: {
    loadFailed: 'No se pudo cargar el clima',
    noEffect: 'No afecta al negocio',
    zeroStar: ' (a los restaurantes de 0 estrellas no les afecta el clima)',
    until: (time) => `Hasta las ${time}`,
    krabPre: 'Hoy Don Krab está en ',
    krabPost: ': los restaurantes de esta calle tienen más probabilidad de recibir clientes misteriosos.',
    holiday: (n) => `Hoy es festivo: probabilidad de Vale Delicioso ×${n}`,
    hammer: 'Con el Martillo de Thor puedes cambiar el clima: ',
    toSquare: 'Ir a la Plaza',
  },
  invite: {
    title: 'Invitar amigos',
    loadFailed: 'No se pudo cargar la información de invitaciones',
    copied: 'Copiado',
    copyFailed: 'No se pudo copiar; selecciónalo y cópialo a mano',
    myCode: 'Mi código de invitación',
    copy: 'Copiar',
    copyLink: 'Copiar enlace',
    rules: (cap) =>
      `Tus amigos reciben un pack de inicio al abrir su restaurante. Cuando verifiquen su correo, recibirás un premio cuando su restaurante llegue al nivel 10 y otro al nivel 30. Cuentan como máximo ${cap} amigos al mes.`,
    month: (n, cap) => `Contados este mes: ${n} / ${cap}`,
    empty: 'Aún no has invitado a nadie',
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

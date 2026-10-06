import type { Messages } from '../..';
import { n, num, str, plEs } from '../../helpers';

const server: Messages['server'] = {
  mail: {
    'activity.unclaimed': {
      title: (p) => `Premios sin recoger de «${str(p.activity)}»`,
      body: () =>
        'Al terminar el evento aún tenías estos premios sin recoger, así que te los enviamos por correo.',
    },
    'activity.rank': {
      title: (p) => `«${str(p.activity)}»: premio del puesto ${n(p, 'rank')} de la clasificación`,
      body: () =>
        'Gracias por tu aportación al esfuerzo común del servidor. Aquí tienes tu premio por clasificación.',
    },
    grant: { title: () => 'Compensación', body: null },
    'invite.welcome': {
      title: () => 'Bienvenido al pueblo',
      body: () => 'Un amigo te ha invitado, así que aquí tienes un pack de inicio.',
    },
    'invite.reward': {
      title: () => 'Premio por invitación',
      body: (p) =>
        `«${str(p.rest)}», a quien invitaste, ha llegado al nivel ${n(p, 'level')}. ¡Gracias por traer a un amigo al pueblo!`,
    },
    'hat.upgrade': {
      title: () => 'Mejora del sombrero de patrocinador',
      body: (p) => `Tu restaurante llegó a 6 estrellas: ${str(p.jade)} pasa a ser ${str(p.xuan)}.`,
    },
    'report.handled': {
      title: () => 'Resultado de la denuncia',
      body: (p) =>
        `El contenido que denunciaste (${str(p.targetName)}) ya se ha tratado. Gracias por cuidar el pueblo.`,
    },
    'report.rejected': {
      title: () => 'Resultado de la denuncia',
      body: (p) =>
        `El contenido que denunciaste (${str(p.targetName)}) se ha revisado y no incumple las normas.`,
    },
    'report.penalty': {
      title: () => 'Aviso de infracción',
      body: (p) => {
        const actions: Record<string, string> = {
          delete: 'eliminado',
          clear: 'vaciado',
          rename: 'renombrado de oficio',
        };
        const what = actions[str(p.action)] ?? 'registrado como infracción';
        const ban =
          p.banDays === null || p.banDays === undefined
            ? ''
            : num(p.banDays) === 0
              ? ' Tu cuenta ha sido baneada de forma permanente.'
              : ` Tu cuenta ha sido baneada durante ${num(p.banDays)} ${plEs(num(p.banDays), 'día', 'días')}.`;
        return `Tu contenido (${str(p.targetName)}) incumple las normas y ha sido ${what}.${ban}\nNota: ${str(p.note)}`;
      },
    },
  },
  reportTargets: {
    post: 'mensaje',
    reply: 'respuesta',
    broadcast: 'bocina',
    rest_name: 'nombre del restaurante',
    notice: 'anuncio del restaurante',
  },
  predict: {
    krab: {
      title: (from, to) => `¿Aparecerá Don Krab mañana en las calles ${from}–${to}?`,
      desc: (hour) =>
        `Según dónde lo coloque el sistema mañana a las ${hour}:00; los cambios tras echarlo no cuentan.`,
      note: (day, hour, street) => `${day}, ${hour}:00: Don Krab apareció en la calle ${street}`,
    },
    hiphop: {
      title: (place) =>
        place === null
          ? '¿Irá mañana el Chico hip-hop al restaurante de algún jugador?'
          : `¿Aparecerá mañana el Chico hip-hop en: ${place}?`,
      desc: (hour) => `Según dónde aparezca el Chico hip-hop mañana a las ${hour}:00.`,
      note: (day, place) => `${day}: el Chico hip-hop apareció en: ${place}`,
    },
    market: {
      title: (hour, level) =>
        `¿Saldrán ingredientes raros de nivel ${level} en el estante diario del mercado hoy a las ${hour}:00?`,
      desc: (hour) =>
        `Según el estante diario que repone el sistema a las ${hour}:00; lo que reponen los jugadores no cuenta.`,
      yes: (day, hour, level, foods) =>
        `${day}, ${hour}:00: el estante diario tuvo ingredientes raros de nivel ${level}: ${foods}`,
      no: (day, hour, level) =>
        `${day}, ${hour}:00: el estante diario no tuvo ingredientes raros de nivel ${level}`,
    },
    weather: {
      title: (hour, type) => `¿El clima automático de hoy a las ${hour}:00 será de tipo ${type}?`,
      desc: (hour) =>
        `Según el clima que elige el sistema a las ${hour}:00; los cambios posteriores con el Martillo de Thor no cuentan.`,
      note: (day, hour, weather, type) => `${day}, ${hour}:00: el clima automático fue ${weather} (${type})`,
      hammer: (weather) =>
        `; luego alguien lo cambió a ${weather} con el Martillo de Thor, lo cual no cuenta`,
      types: ['', 'soleado', 'lluvia', 'nieve', 'viento/arena/niebla'],
    },
    stats: {
      title: '¿Superarán hoy las monedas de negocio de todo el servidor a las de ayer?',
      desc: (close) =>
        `Según las monedas que ganen hoy todos los restaurantes del servidor; se decide después de las 0:00 de mañana. Solo cuenta como «Sí» si es estrictamente mayor que ayer. Las operaciones cierran a las ${close}:00.`,
      note: (day, today, prevDay, yesterday) => `${day}: ${today}; ${prevDay}: ${yesterday}`,
    },
    voidMissing: 'Faltan datos, anulado automáticamente',
  },
  talk: {
    bigEater: '¡Tienes buen gusto! ¡Yo también lo creo! ¡Jajaja!',
    carmenFirst: '¿Primera vez por aquí? Toma este vale de ingrediente misterioso.',
    bigEaterFirst: '¡Tú! Tienes mucha personalidad, ¿eh?',
    wenjie: '¡Con Rejoice se nota enseguida el estilo!',
    bro13: '¡¡¡Si lo quieres, ve a por ello!!!',
    mayorRight: '¡Gracias, voy a buscarlo ahora mismo para compensarle!',
    mayorWrong: '¿¡Crees que me voy a creer cualquier sitio que digas!?',
  },
  takeawayFail: [
    '¡Un atasco enorme!',
    '¡Se pinchó la rueda delantera!',
    '¡Una ex se plantó en medio de la calle!',
    '¡La moto eléctrica se quedó sin batería!',
    '¡Una caída!',
    '¡Demasiados pedidos a la vez!',
    '¡El cliente no quedó contento!',
    '¡El cliente canceló el pedido!',
  ],
  appraiseFail: [
    'No es más que un montón de papel higiénico',
    'Solo hay unos garabatos que nadie entiende',
    'La letra está cubierta de grasa, no se lee nada',
    'Resulta que es un menú caducado',
  ],
  effect: {
    device: 'Instalación',
    equip: 'Utensilios',
    hangover: 'Resaca',
    suit: (name, need) => `${name} (${need} ${plEs(need, 'pieza', 'piezas')})`,
    suitFallback: 'Conjunto',
    bless: (name) => `Deseo de hoy: ${name}`,
  },
};
export default server;

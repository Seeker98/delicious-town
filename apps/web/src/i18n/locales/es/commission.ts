import type { Messages } from '../..';
import { formatNum } from '../../../utils/format';
import { plEs } from '../../helpers';

/** Comisión del pueblo (2026-10-16): página, cargos, frases y puntos del día */
const commission: Messages['commission'] = {
  title: 'Comisión del pueblo',
  briefTitle: 'Puntos del día',
  briefHint: 'Toca una fila para verlos',
  noticesTitle: 'Comunicados de la comisión',
  noticesEmpty: 'La comisión aún no ha publicado ningún comunicado.',
  noticesFoot: 'Los comunicados también salen en las noticias de la Plaza.',
  newTag: 'Nuevo',
  loadFailed: 'No se pudo cargar la comisión',
  members: {
    mayor: {
      name: 'Alcalde Gran Olla',
      role: 'Presidente',
      duty: 'Dirige la comisión y publica los comunicados',
      lines: [
        'Somos seis, cada uno con su cartera. Cuando cambia una regla, se anuncia aquí primero.',
        'Los comunicados también salen en las noticias. Si te perdiste uno, búscalo aquí.',
      ],
    },
    squid: {
      name: 'Calamardo',
      role: 'Comisario de Salud y Seguridad Alimentaria',
      duty: 'Cucarachas, ratones e higiene del restaurante',
      lines: [
        'Una cucaracha en una mesa ocupada y esa mesa no gana nada esa ronda.',
        'La ratonera va primero: un ratón atrapado te deja unas monedas.',
        'Las instalaciones antiplagas van en las ranuras 4 y 5, que se abren con 2 estrellas.',
        'Cada día a las 0:00 reviso los restaurantes de 2 estrellas o más y anoto el resultado en la actividad del restaurante.',
      ],
    },
    fandao: {
      name: 'Taoísta Fan',
      role: 'Comisario de Clima y Tiempo',
      duty: 'Tiempo y temporadas',
      lines: [
        'Cada cambio de tiempo queda registrado en las noticias.',
        'Con tiempo especial, todos los platos estrella están de temporada.',
      ],
    },
    garden: {
      name: 'Hermana del Huerto',
      role: 'Comisaria de Mercados y Competencia',
      duty: 'Mercado y Bolsa',
      lines: [
        'Cuando se agota una tanda del mercado de ofertas, espera a la siguiente.',
        'En la Bolsa se puede comerciar cualquier ingrediente, pero el sistema solo opera con los raros.',
      ],
    },
    gary: {
      name: 'Gary',
      role: 'Comisario de Economía y Finanzas',
      duty: 'Fondo de Desarrollo y ahorro',
      lines: [
        'Fondo de Desarrollo del Pueblo: al vencer recuperas la mayor parte del depósito y una medalla de EXP.',
        'Depósitos: espera al vencimiento y recuperas todas tus monedas, con paquetes de suministros como intereses.',
      ],
    },
    bro13: {
      name: 'Hermano 13',
      role: 'Comisario de Comunicación',
      duty: 'Bocinas y Diario del pueblo',
      lines: ['Ven a charlar conmigo cada día y te doy bocinas.', 'Toca la bocina y todo el pueblo te oye.'],
    },
  },
  brief: {
    squid: (kills, visits, steals) =>
      `El pueblo mató ${formatNum(kills)} ${plEs(kills, 'cucaracha', 'cucarachas')} hoy; los ratones vinieron ${formatNum(visits)} ${plEs(visits, 'vez', 'veces')} y robaron ${formatNum(steals)} ${plEs(steals, 'vez', 'veces')}`,
    fandao: (weather, time) => `${weather} ahora, cambia a las ${time}`,
    garden: (n, names) =>
      `Quedan ${n} ${plEs(n, 'producto', 'productos')} en el mercado de ofertas: ${names}`,
    /** 特价菜场食材名之间 */
    sep: ', ',
    gardenMore: (names) => `${names}, etc.`,
    gardenNone: (time) => `El mercado de ofertas se agotó; siguiente tanda a las ${time}`,
    gary: (coin) => `Monedas del pueblo en el Fondo y el ahorro: ${coin}`,
    bro13: (title) => `Diario: ${title}`,
    bro13None: 'Aún no hay diario',
    off: 'No está abierto en este servidor',
  },
  sheet: {
    duty: 'Cartera',
    today: 'El pueblo hoy',
    mine: 'Tu restaurante',
    mineNone: 'Aún sin revisar',
    tapHint: 'Toca el retrato para otra frase',
    rule: 'Una revisión al día a las 0:00, para restaurantes de 2 estrellas o más; las cucarachas de amigos no cuentan',
    go: {
      squid: 'Ver mis revisiones',
      fandao: 'Ver el tiempo',
      garden: 'Ir al Mercado',
      gary: 'Ir al Banco',
      bro13: 'Ir a la Plaza',
    },
  },
};
export default commission;

import type { Messages } from '../..';
import { formatNum, formatPct } from '../../../utils/format';
import { plEs } from '../../helpers';

const wiki: Messages['wiki'] = {
  title: 'Datos del juego',
  intro:
    'Objetos, ingredientes, recetas, utensilios y calles del juego, sincronizados con los datos del juego.',
  searchAll: 'Buscar en todos los nombres',
  search: 'Buscar por nombre',
  noResult: 'No se encontró nada',
  loadFailed: 'No se pudo cargar, inténtalo más tarde',
  notFound: 'Esta entrada no existe',
  back: 'Volver a la lista',
  home: 'Inicio de datos del juego',
  more: (n) => `Mostrar ${n} más`,
  maxShown: (n) => `Se muestran como máximo ${n}; usa la búsqueda o el filtro de calle para acotar`,
  count: (n) => `${formatNum(n)} ${n === 1 ? 'entrada' : 'entradas'}`,
  apiLink: 'API abierta: para quienes quieran estudiar el juego o crear herramientas',
  kinds: {
    goods: 'Objetos',
    foods: 'Ingredientes',
    cookbooks: 'Recetas',
    equips: 'Utensilios',
    streets: 'Calles',
  },
  all: 'Todos',
  rareOnly: 'Solo raros',
  allStreets: 'Todas las calles',
  level: (n) => `Nv. ${n}`,
  coin: (n) => `${n} ${plEs(n, 'moneda', 'monedas')}`,
  diamond: (n) => `${n} ${plEs(n, 'diamante', 'diamantes')}`,
  renown: (n) => `${n} de renombre`,
  units: { coin: 'Monedas', exp: 'EXP', diamond: 'Diamantes' },
  rare: 'Raro',
  common: 'Común',
  goodsTypes: {
    '0': 'Consumibles',
    '1': 'Objetos',
    '2': 'Packs de regalo',
    '3': 'Instalaciones',
    '4': 'Utensilios',
    '5': 'Gemas',
    '9': 'Medallas',
    '10': 'Recuerdos',
  },
  foodTypes: { '0': 'Condimentos y frutos secos', '1': 'Carne, huevos y lácteos', '2': 'Frutas y verduras' },
  sections: {
    gift: 'Puede contener',
    sources: 'Cómo conseguirlo',
    usedIn: 'Se puede canjear por',
    equip: 'Atributos del utensilio',
    stress: 'Total de atributos tras mejorar',
    gem: 'Atributos de la gema',
    suit: 'Bonificación de conjunto',
    cookbooks: (n) => `Recetas que lo usan (${n})`,
    mysterious: 'Platos estrella que lo usan',
    grades: 'Ingredientes por calidad',
    medal: 'Medalla de calle',
    streetCookbooks: 'Recetas de esta calle',
  },
  fields: {
    star: 'Estrellas',
    needStar: (n) => `Disponible desde ${n} ${plEs(n, 'estrella', 'estrellas')}`,
    type: 'Tipo',
    level: 'Nivel',
    stackable: 'Apilable',
    maxNum: (n) => `Máximo ${n}`,
    invalidHours: (n) => `Dura ${n} ${plEs(n, 'hora', 'horas')}`,
    part: 'Ranura',
    minLevel: (n) => `Se equipa desde nv. ${n}`,
    suit: 'Conjunto',
    noSuit: 'No pertenece a ningún conjunto',
    essence: (n) => `${n} de esencia por mejora`,
    holes: (a, b) => `${a} al principio, hasta ${b}`,
    baseAttrs: 'Atributos base',
    enhance: 'Mejora',
    sockets: 'Huecos',
    stressLevel: (n) => `+${n}`,
    gemLevel: (n) => `Grado ${n}`,
    nextGem: 'Grado siguiente',
    systemPrice: 'Precio del sistema',
    seed: (n) => `Se cultiva en el huerto, ${n} por cosecha`,
    fromGrade: (g) => `desde ${g}`,
    street: 'Calle',
    recommend: (n) => `Nv. recomendado ${n}`,
    price: 'Precio',
    taste: 'Sabor',
    cookName: 'Cocina',
    bonus: 'Bonificación de la calle',
    focus: 'Tipo de calle',
    theme: 'Ambiente',
    cookbookCount: (n) => `${n} ${plEs(n, 'plato', 'platos')}`,
    suitTier: (n) => `${n} ${plEs(n, 'pieza', 'piezas')}`,
  },
  gift: {
    randomGoods: (level, num) => `Un objeto de nv. ${level} al azar×${num}`,
    randomFoods: (level, num) => `Ingredientes comunes de nv. ${level} al azar×${num}`,
    masterFoods: (num) => `Ingredientes universales al azar×${num}`,
    range: (min, max, unit) => `${unit} ${min}–${max}`,
    note: 'Solo se indica lo que puede contener, no las probabilidades.',
  },
  sources: {
    special: 'Oferta del día (al azar cada día)',
    black: (n) => `Mercado negro: ${n} diamantes`,
    award: 'Premios aleatorios de la Torre de chefs, el bar y más',
    gemFromBefore: 'Mejora de gemas: dos ',
    gemFromAfter: ' forman una',
    shop: 'Siempre en la tienda: ',
    renownShop: (n, rotating) => `Tienda de renombre: ${n} de renombre${rotating ? ' (rotativo)' : ''}`,
    exchange: 'Canje: ',
    times: (n) => (n < 0 ? '' : ` (${n} por jugador)`),
    none: 'No hay una fuente directa en los datos del juego: puede venir de eventos, packs de regalo, misiones u otras actividades.',
  },
  /** 玩法攻略（问题记录 384）：来自快速模拟里三种机器人的做法 */
  guide: {
    title: 'Guía de juego',
    link: 'Guía de juego: tres ritmos de juego y qué hacer cada vez que entras',
    intro:
      'Esta guía sale de la simulación de equilibrio del juego: unos bots jugaron 30 días a tres ritmos (constante, normal y ocasional). Aquí está lo que hicieron y hasta dónde llegaron. Las cifras son estimaciones y la partida real será distinta, así que tómalas como referencia.',
    sections: [
      {
        title: 'Tres ritmos',
        items: [
          'Constante: entra cada hora desde la mañana hasta tarde por la noche. 1 estrella hacia el día 2 y nivel 30 hacia el día 7; las 2 estrellas dependen de cuántas recetas sabes, así que múdate en cuanto la página de recetas lo sugiera: cuanto antes, más rápido.',
          'Normal: entra tres veces al día (mañana, mediodía y noche). 1 estrella hacia el día 3, nivel 30 hacia el día 9 y 2 estrellas hacia el día 18.',
          'Ocasional: entra una vez cada noche. 1 estrella hacia el día 4 y nivel 30 hacia el día 23; las 2 estrellas suelen tardar más de un mes, y no pasa nada.',
        ],
      },
      {
        title: 'Cada vez que entres, en este orden',
        items: [
          'Regístrate y recoge las recompensas de puntos de actividad.',
          'Usa los objetos del almacén que se usan directamente: mesas, paquetes de regalo, vales de ingrediente aleatorio.',
          'Pon todos los puntos de atributo en Cocina.',
          'Echa aceite cuando baje del 60 %; un restaurante cerrado vuelve a abrir en cuanto tiene aceite.',
          'Elimina las cucarachas de tu propio restaurante.',
          'Recoge las misiones: misión principal, misiones secundarias y recompensas de capítulo en cuanto estén listas.',
          'Llena los huecos de instalaciones vacíos; si no tienes ninguna en el almacén, compra las baratas.',
          'Cuando solo te falten el vale de subida de estrella y las monedas para la siguiente estrella, compra el vale y sube; si no te llega, ahorra en vez de gastar en otra cosa.',
          'Amplía el bidón de aceite en cuanto tu nivel y tus estrellas lo permitan.',
          'Compra mesas, pero guarda lo necesario para llenar el aceite y 20 000 más de reserva.',
          'En el mercado, compra solo los ingredientes que les faltan a tus recetas: primero el Mercado diario y luego el Mercado de ofertas (requiere correo verificado). Cada reposición del Mercado diario tiene un hueco con un ingrediente que necesita la Calle de los novatos.',
          'De paso, apúntate a las apuestas del mercado.',
          'Aprende recetas: primero las nuevas y luego mejora las que ya sabes.',
          'Usa las combinaciones gratis del día para convertir los ingredientes que no necesitas en otros de nivel superior.',
        ],
      },
      {
        title: 'Cuándo mudarse',
        items: [
          (n) =>
            `Solo puedes aprender las recetas de la calle en la que estás. La ${n.startStreet.name} tiene solo ${formatNum(n.startStreet.cookbooks)}, y las 2 estrellas piden ${formatNum(n.star2Cookbooks)}, así que tarde o temprano tendrás que mudarte.`,
          'Cuando ni aprendiendo todas las recetas que quedan en tu calle llegues a la siguiente estrella, la página de recetas te avisa. Prepárate entonces para mudarte: no esperes a las últimas recetas difíciles, múdate en cuanto aprendas más despacio.',
          (n) =>
            `Se aprende más rápido en calles con muchas recetas: la ${n.biggestStreet.name} tiene ${formatNum(n.biggestStreet.cookbooks)}, más que ninguna otra.`,
          'Las calles son de monedas, equilibradas o de EXP: si te faltan monedas, ve a una calle de monedas; para subir de nivel, a una de EXP. La página de mudanza y la de recetas muestran el tipo y la bonificación de cada calle.',
          'Mudarse cuesta una tarjeta de mudanza (no hace falta con un permiso de trabajo de la oficina de mudanzas) y una tarifa, que se reduce a la mitad cuando tienes suerte.',
        ],
      },
      {
        title: 'En qué gastar primero',
        items: [
          'Primero el aceite: sin aceite el restaurante cierra y no gana nada.',
          'Después las estrellas: vales de subida de estrella y monedas para subir.',
          'Solo entonces mesas e instalaciones.',
          (n) =>
            `Abrir el reparto a domicilio pide ${n.takeaway.star} ${plEs(n.takeaway.star, 'estrella', 'estrellas')} y ${formatNum(n.takeaway.renown)} de renombre (se gastan al abrirlo), además de ${formatNum(n.takeaway.coin / 1_000_000)} ${plEs(n.takeaway.coin / 1_000_000, 'millón', 'millones')} de monedas y ${formatNum(n.takeaway.diamond)} diamantes o un Pase a domicilio: si te interesa, empieza a ahorrar pronto.`,
        ],
      },
      {
        title: 'Otras actividades',
        items: [
          'Sacude la bolsa de Don Krab y charla con la Hermana Wen en el Bar una vez al día; luego charla con el Alcalde Gran Olla y el Hermano 13 en el Gremio: todos tienen algo para ti.',
          'Sube la Torre de chefs cada día: ganes o pierdas te da renombre. El anciano de la primera planta es de nivel 8; hacia el nivel 10 puedes ganarle (algo antes con el equipo de aprendiz).',
          (n) =>
            n.exchange.level === n.predict.level && n.exchange.days === n.predict.days
              ? `Desde el nivel ${n.exchange.level}, con una cuenta de al menos ${n.exchange.days} días y el correo verificado, puedes usar la Bolsa y las Predicciones.`
              : `Desde el nivel ${n.exchange.level}, con una cuenta de al menos ${n.exchange.days} días y el correo verificado, puedes usar la Bolsa; las Predicciones piden nivel ${n.predict.level} y ${n.predict.days} días.`,
          'Llevar utensilios sube los ingresos de cada ronda.',
          (n) =>
            `Por debajo del nivel ${n.newbieExp.maxLevel}, la EXP de cada ronda recibe un extra (${formatPct(n.newbieExp.rate, { sign: true })} en el nivel 1 y menos en cada nivel), así que los primeros niveles van muy rápido.`,
          (n) =>
            `Los restaurantes de ${n.acquire.minStar} estrellas o más tienen valoración y se pueden adquirir desde el enlace Adquisiciones de la línea Patrimonio en la página de inicio: pagas su valoración, el dueño anterior recibe el ${formatPct(1 - n.acquire.taxRate, { digits: 0 })} y el ${formatPct(n.acquire.taxRate, { digits: 0 })} es impuesto; puedes tener hasta ${n.acquire.maxHoldings}. Los restaurantes adquiridos pagan a su dueño un dividendo diario (el ${formatPct(n.acquire.dividendRate, { digits: 0 })} de las monedas de liquidación del día anterior, si hicieron al menos ${n.acquire.minRounds} rondas). Un restaurante adquirido puede atender a su dueño una vez al día y recibe ${n.acquire.tendFoods} ingredientes; el dividendo de ese día sube un ${formatPct(n.acquire.tendBonus, { digits: 0 })}. Un restaurante adquirido puede recomprarse por su valoración y luego no puede ser adquirido durante ${n.acquire.protectDays} días.`,
        ],
      },
      {
        title: 'Cómo aprender platos estrella',
        items: [
          'Necesitas 3 fragmentos de un plato para aprenderlo; puedes cocinar desde 1 estrella.',
          'Tasación (desde 1 estrella): en el Templo, usa 1 Receta misteriosa y 1 objeto de tasación; si sale bien, consigues un fragmento de un plato al azar. El Sello Delicia da niveles 1 a 6 y acierta un 40 % (90 000 en la tienda); el Sello de jade del Dios de la Cocina niveles 2 a 5, un 52 % (300 000 en la tienda); las Fórmulas secretas del Balde de Carnada (niveles 1 a 3) y de la Cangreburger (niveles 3 a 5) siempre aciertan, se venden por diamantes en el mercado negro y también salen en los premios aleatorios de la Torre de chefs y del bar; la de la Cangreburger es además el premio del campeón de platos estrella de ayer.',
          'Canje de trozos: descompón los fragmentos que no necesites en trozos del mismo nivel; 3 trozos de un nivel te dan 1 fragmento de cualquier plato de ese nivel, así que guarda trozos del nivel que quieras.',
          'Clases: busca a un jugador que sepa el plato y dé clase, paga la matrícula y algo de energía, y casi siempre lo aprendes a la primera.',
        ],
      },
    ],
  },
  api: {
    title: 'API abierta',
    intro:
      'Datos estáticos del juego de solo lectura, los mismos que las páginas de datos del juego, para quienes quieran estudiar el juego o crear herramientas. No incluye datos en vivo de jugadores ni servidores.',
    base: 'Dirección base',
    langParam: 'Cada endpoint acepta el parámetro lang: zh-CN (por defecto), zh-TW, en, fr, es.',
    endpoints: 'Endpoints',
    path: 'Ruta',
    content: 'Contenido',
    list: {
      index: 'Índice: versión de datos, idiomas, cantidades',
      goods: 'Lista de objetos',
      goodsId:
        'Detalle de objeto: descripción, atributos de utensilio y gema, contenido de packs, fuentes, canjes',
      foods: 'Lista de ingredientes',
      foodsId: 'Detalle de ingrediente: recetas y platos estrella que lo usan, semilla del huerto',
      cookbooks: 'Lista de recetas (sin ingredientes)',
      cookbooksId: 'Detalle de receta: ingredientes de las calidades 1 a 10',
      equips: 'Lista de utensilios y conjuntos',
      streets: 'Calles, cocinas, bonificaciones y medallas de calle',
    },
    format: 'Formato de respuesta',
    formatText:
      'Igual que la API del juego: { ok, data }. data siempre incluye version (versión de datos) y lang. Si no existe, devuelve 404 con un código de error.',
    cache: 'Versiones y caché',
    cacheText:
      'version cambia cuando se actualizan los datos del juego. Las respuestas se pueden guardar una hora; envía el último ETag y recibirás 304 si nada cambió.',
    cors: 'Acceso desde otros sitios',
    corsText:
      'Cualquier sitio web puede leer estos endpoints directamente desde el navegador (sin datos de sesión).',
    limit: 'Límite de frecuencia',
    limitText:
      'Unas 120 peticiones por minuto por IP; si te pasas recibes 429, espera un poco y vuelve a intentarlo.',
    example: 'Ejemplo',
    notIncluded: 'No incluido',
    notIncludedText:
      'Datos en vivo de jugadores, restaurantes y servidores (clima, precios del mercado, clasificaciones, etc.), probabilidades de botín y recompensas de eventos.',
  },
};
export default wiki;

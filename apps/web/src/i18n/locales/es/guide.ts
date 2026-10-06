import type { Messages } from '../..';

const guide: Messages['guide'] = {
  title: 'Guía',
  wikiHint: '¿Buscas objetos, ingredientes o recetas? Mira los datos del juego',
  codes: 'Códigos de bienvenida',
  codesNoRest:
    'Disponibles cuando entres en un servidor y abras un restaurante. Cada restaurante puede canjear cada código una vez.',
  codesNote: 'Cada restaurante puede canjear cada código una vez, en cuanto tenga el nivel necesario.',
  minLevel: (n) => `Desde nivel ${n}`,
  take: 'Recoger',
  taken: 'Recogido',
  ended: 'Terminado',
  unavailable: 'No disponible por ahora',
  took: (text) => `Recogido: ${text}`,
  takeFailed: 'No se pudo recoger',
  loadFailed: 'No se pudieron cargar los códigos de bienvenida',
  start: 'El primer día',
  startItems: [
    [
      'Tu restaurante funciona solo: liquida cada ronda y los clientes van ocupando tus mesas. Más mesas, más platos aprendidos y recetas de mejor calidad dan más monedas y EXP.',
    ],
    [
      'Abrir consume aceite y, si se acaba, el restaurante cierra: recuerda rellenarlo en la página de inicio.',
    ],
    [
      'Los ingredientes sirven para aprender recetas, cocinar platos estrella y preparar pedidos a domicilio. Cómpralos en el ',
      { to: '/market', text: 'Mercado' },
      ', pero antes comprueba que quede hueco en la despensa.',
    ],
    [
      'La energía se recupera cada ronda. Aprender platos estrella, desafiar la Torre de chefs, aplastar cucarachas, etc. cuestan energía; las tarjetas de energía la recargan.',
    ],
    [
      'Empieza por esto: asigna tus puntos en ',
      { to: '/rest/equip', text: 'Utensilios y puntos' },
      ', rellena el aceite en la página de inicio, aprende platos nuevos en ',
      { to: '/cookbooks', text: 'Recetas' },
      ' y regístrate en la página de inicio.',
    ],
    [
      'Las estrellas, las mudanzas y los cambios de nombre se hacen en el ',
      { to: '/society', text: 'Gremio' },
      '.',
    ],
    [
      'Sigue las ',
      { to: '/rest/tasks', text: 'Misiones' },
      ': la misión principal tiene 12 capítulos, cada uno con unas misiones que puedes hacer en cualquier orden. Recógelas todas y luego la recompensa del capítulo; el siguiente capítulo se desbloquea con cierto nivel o estrellas. Cada función nueva abre sus misiones secundarias, y hay misiones semanales según tus estrellas.',
    ],
  ],
  daily: 'Rutina diaria',
  dailyItems: [
    { to: '/', text: 'Regístrate en la página de inicio: una vez al día, por un pack de registro' },
    {
      to: '/rest/tasks',
      text: 'Tareas y actividad: haz las tareas diarias para sumar puntos de actividad y recoger sus premios; las misiones semanales se reinician el lunes a las 0:00',
    },
    {
      to: '/town',
      text: 'Plaza: charla una vez al día con la Hermana Wen para recibir vales misteriosos; sacude la bolsa de Don Krab',
    },
    {
      to: '/society/mayor',
      text: 'Gremio: charla a diario con el Alcalde Gran Olla (ingrediente y semilla) y dile dónde está hoy el Chico hip-hop; el Hermano 13 da bocinas cada día; Carmen regala un vale de ingrediente misterioso en tu primera visita',
    },
    {
      to: '/yard',
      text: 'Huerto: planta, riega, quita bichos y malas hierbas, cosecha a tiempo y roba en los huertos de tus amigos',
    },
    {
      to: '/market',
      text: 'Mercado: el mercado diario se renueva cada dos horas durante el día, el de ofertas cada hora y el premium tres veces al día',
    },
    { to: '/bar', text: 'Bar: unos cuantos minijuegos al día; Cóctel Memoria y los dardos dan premios' },
    {
      to: '/tower',
      text: 'Torre de chefs: desafía a los guardianes de la torre para ganar renombre y gástalo en la tienda de renombre',
    },
    {
      to: '/takeaway',
      text: 'A domicilio: acepta y entrega pedidos por monedas; tu repartidor también sube de nivel',
    },
  ],
  faq: 'Preguntas frecuentes',
  faqItems: [
    {
      q: '¿Por qué se cambian los ingredientes universales? ',
      a: [
        'Se cambian en la despensa: 2 ingredientes universales de nivel 1 por 1 ingrediente raro de nivel 2 al azar, y 2 de nivel 2 por 1 ingrediente raro de nivel 3 al azar. Los de nivel 3 o más no se cambian: solo pueden sustituir a un ingrediente que falte del mismo nivel al aprender una receta.',
      ],
    },
    {
      q: '¿Y si siempre me falta el mismo ingrediente?',
      a: [
        'Los ingredientes aleatorios (packs de regalo, vales de ingrediente aleatorio, Combinar, premios del Bar y de la Torre, el Templo, el Alcalde Gran Olla) pueden ser justo el que le falta a tu próxima receta, y cuanta más suerte tengas, más probable es. También puedes cubrirlo con un ingrediente universal, o comprarlo en el Mercado o en la Bolsa (la Bolsa solo vende ingredientes raros).',
      ],
    },
    {
      q: '¿Cómo se hacen más fuertes los utensilios? ',
      a: [
        'La mejora puede fallar. Los utensilios de gama alta piden un nivel mínimo y no se pueden equipar antes.',
      ],
    },
    {
      q: '¿En qué se diferencian las calles? ',
      a: [
        'La medalla de cada calle da una bonificación distinta. Las mudanzas se hacen en el ',
        { to: '/society', text: 'Gremio' },
        '.',
      ],
    },
    {
      q: '¿Hay normas para los nombres y anuncios? ',
      a: [
        'Nada de nombres de PNJ, insultos ni publicidad. Si una denuncia se confirma, el nombre se cambia de oficio o el anuncio se borra.',
      ],
    },
    {
      q: '¿Dónde uso un código? ',
      a: ['«Más → Otros → Canjear código», o el cuadro de canje en la parte superior del buzón.'],
    },
    {
      q: '¿Hay que esperar al resultado de una predicción? ',
      a: [
        'No. Antes del cierre puedes vender tus participaciones al precio actual cuando quieras: vende para cortar pérdidas si crees que te equivocaste, o para asegurar la ganancia cuando el precio te convenga.',
      ],
    },
    {
      q: '¿Cómo consigo diamantes? ',
      a: [
        'El pack de registro diario puede traer algunos; los premios de actividad de 100 y 150 puntos; ',
        { to: '/rest/tasks', text: 'las misiones semanales' },
        '; los packs de la clasificación de chefs y de la clasificación mensual de afinidad del Kraken; los premios A, B, C y Último premio del Ichiban Kuji; los amigos invitados que llegan a nv. 10 y 30; un mensaje del foro destacado; los premios de eventos y los códigos.',
      ],
    },
    {
      q: '¿Cómo consigo Cangreburgers y para qué sirven? ',
      a: [
        'Puedes ganarlas en la tragaperras del ',
        { to: '/bar', text: 'Bar' },
        '; sacudir la bolsa de Don Krab en la plaza a veces suelta una; la misión secundaria «Completar una Prueba» también da una. Cámbialas por objetos raros con el ',
        { to: '/society/mayor', text: 'Alcalde Gran Olla del Gremio' },
        '.',
      ],
    },
  ],
  rules: 'Normas del juego',
  rulesItems: [
    'Prohibido usar varias cuentas para acumular recursos o pasar recursos de una cuenta a otra.',
    'Prohibido aprovecharse de fallos. Si encuentras uno, avisa a los administradores en la sección «Sugerencias» del foro, sin explicar cómo se hace, y no lo uses.',
    'Prohibidos los insultos, la publicidad y el contenido ilegal o inapropiado. Puedes denunciar mensajes, bocinas, nombres de restaurante y anuncios así.',
    'Saltarse las normas supone un baneo de 1 día, 7 días o permanente.',
    'Las estadísticas de administración son solo avisos; cada sanción la revisa una persona antes.',
  ],
};
export default guide;

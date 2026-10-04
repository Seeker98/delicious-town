import type { Messages } from '../..';

const site: Messages['site'] = {
  changelogTitle: 'Registro de cambios',
  linksTitle: 'Enlaces',
  linksEmpty: 'Todavía no hay enlaces.',
  linksLoadFailed: 'No se pudieron cargar los enlaces',
  clockTitle: 'Hora actual (hora de Pekín)',
  nextRound: (left) => `Siguiente ronda en ${left}`,
  changelog: {
    looks1005:
      'Aspecto: a partir de ahora, las puertas que compras (y la que tienes puesta) son tuyas y volver a ellas es gratis; los avisos de estrellas insuficientes muestran tus estrellas actuales; la wiki indica las estrellas necesarias para carteles y trofeos',
    visual1005:
      'Inglés, francés y español: el singular y el plural siguen al número (1 moneda, 1 día…); en el móvil los atributos de los utensilios caben en una pantalla, los efectos del clima ya no salen dos veces y los tiempos de más de un día se muestran en días',
    perf1005:
      'La página principal, las tareas y el aviso de eventos cargan más rápido; el catálogo de objetos ya no se vuelve a descargar si no ha cambiado',
    rules1005:
      'Ichiban Kuji: el primer lote abierto a medianoche del día 1 usa el tema y los títulos del nuevo mes; los reembolsos del Fondo de Desarrollo se redondean con más precisión; un error al resolver la Apuesta del mercado ya no anula la pregunta del mercado en Predicciones',
    wiki1005:
      'Wiki del juego: los utensilios muestran sus bonus de conjunto y las gemas el nombre del siguiente nivel; cambiar rápido de página con mala conexión ya no mezcla páginas, y los errores de carga se avisan',
    fixes1005:
      'Arreglos menores: la fila del Alcalde se desbloquea sola a la hora del Chico Hip-hop; los depósitos y retiros del Fondo aparecen en tu registro; los carteles y trofeos que aún no puedes usar salen en gris al elegir instalaciones',
    posters:
      'La tienda añade 4 nuevos niveles de carteles y trofeos del Dios de la Cocina, disponibles desde 4, 6, 8 y 10★, para que los bonus de monedas y EXP sigan el ritmo al final',
    scarcity:
      'Los ingredientes aleatorios pueden ser justo los que le faltan a tus recetas, con más probabilidad cuanta más suerte tengas; los premios del Bar y de la Torre ya pueden dar ingredientes raros',
    site: 'Se añaden un registro de cambios y una página de enlaces; la barra superior muestra la hora',
    oilToast:
      'Cada mesa con cliente gasta al menos 1 de aceite; los avisos salen arriba y ya no tapan los botones',
    fund: 'Nuevo Fondo de Desarrollo en la Plaza: deposita monedas 7 días y recupera el 90 % más una medalla de EXP y un título temporal',
    kujiDeluxe:
      'El Ichiban Kuji suma un sorteo de lujo; el premio A y el último dan el título limitado del mes',
    titleShop: 'Nueva tienda de títulos en Apariencia: títulos temporales a cambio de monedas',
    coinSink:
      'Economía: platos más baratos, ingredientes de nivel alto más caros, monedas para subir estrellas y mudarse',
    newbiePack:
      'Pack de bienvenida y vales de ingrediente aleatorio nv. 1 a 5; los restaurantes antiguos lo reciben con el código XINSHOULIBAO',
    wiki: 'Nueva wiki del juego: objetos, ingredientes, recetas, utensilios y calles',
    quests:
      'Misiones renovadas: capítulos, misiones secundarias y semanales, y una lista del día en el inicio',
    newStreets: '16 nuevas calles extranjeras y más de mil recetas; solo se aprenden los platos de tu calle',
    languages: 'Disponible en chino tradicional, inglés, francés y español',
    craft: 'La fusión ya no elige ingredientes de los que tu despensa está llena',
    home: 'Página de inicio rediseñada',
    exchange:
      'Abre la Bolsa: intercambia ingredientes raros entre jugadores; los de nv. 3 a 5 se venden al sistema',
    predict:
      'Abren las predicciones: compra y vende participaciones «sí/no» que se liquidan con el resultado',
    kuji: 'Abre el Ichiban Kuji, con figuras limitadas temáticas cada mes',
    activities: 'Eventos temporales: objetivos, bingo, pase de batalla, canjes, metas y bonus de servidor',
  },
};
export default site;

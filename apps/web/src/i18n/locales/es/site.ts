import type { Messages } from '../..';

const site: Messages['site'] = {
  changelogTitle: 'Registro de cambios',
  linksTitle: 'Enlaces',
  linksEmpty: 'Todavía no hay enlaces.',
  linksLoadFailed: 'No se pudieron cargar los enlaces',
  clockTitle: 'Hora actual (hora de Pekín)',
  nextRound: (left) => `Siguiente ronda en ${left}`,
  changelog: {
    backlog8:
      'En la guía de la wiki del juego, las recetas de la Calle de los novatos y de la calle más grande, las recetas necesarias para 2 estrellas, los requisitos del reparto a domicilio y de la Bolsa y el extra de EXP inicial siguen ahora los valores predeterminados actuales del juego; las reglas del duelo también indican qué atributos usa cada puntuación según los pesos actuales',
    perf1006:
      'La web descarga unos 140 KB menos la primera vez (la fuente de iconos solo incluye los que usamos), y el Mercado, el Bar, el Ichiban Kuji, el Templo y la Plaza abren más rápido',
    backlog7:
      'El nombre del restaurante de Don Krab y su mensaje de bienvenida ahora aparecen en tu idioma; los porcentajes siguen el formato de tu idioma (coma decimal y espacio antes de %) y el desglose de la probabilidad de mejora ya no va pegado al número; en la interfaz francesa, «nombre × cantidad» ya no se parte en dos líneas en pantallas estrechas; si tu acceso a la Bolsa está congelado, la Bolsa y las predicciones de la actividad de hoy lo indican; la lista de recetas de la wiki muestra como máximo 1000 y luego sugiere acotar con la búsqueda o la calle, y una calle inexistente en la dirección muestra todas las recetas',
    backlog6:
      'Las reglas del duelo indican cuántos jueces usa realmente este servidor; el utensilio que suelta un anciano sale en su propia línea en la tarjeta de resultado y aparece en las noticias; el canje de trozos en los platos estrella permite cambiar varios a la vez; el «Cómo conseguirlo» de los objetos de tasación incluye los golpes críticos al guardián del Templo; las páginas de objetos de la wiki muestran también la Oferta del día, el mercado negro, los premios aleatorios y las mejoras de gemas como fuentes',
    visual1006:
      'Ajustes de diseño en móvil: la tabla de atributos del detalle de utensilios ahora tiene una fila por atributo; los motivos de bloqueo en la actividad de hoy van en su propia línea; el desplegable de canje de trozos en los platos estrella ya no se sale de la pantalla y muestra «Elige un plato»; la lista de bonificaciones y las filas de fragmentos pasan a otra línea si no caben; la tarjeta de resultado del duelo muestra el nombre traducido del anciano y las puntuaciones con la coma decimal',
    stealForget1006:
      'Fallar al espiar una clase castiga menos: antes olvidabas por completo (nivel de la clase × 3 + 1) recetas al azar; ahora (nivel de la clase × 2 + 1) recetas al azar bajan 1 nivel de calidad y solo se olvidan las de calidad Común; en clases de nivel 4 o más, la probabilidad de olvidar además un plato estrella de nivel inferior baja de nivel × 5 % a nivel × 2 %',
    frTimes1006:
      'En la interfaz en francés, las cantidades de objetos siguen ahora la tipografía francesa, con espacios alrededor del × (p. ej. «Riz × 3»)',
    web1006:
      'Al cambiar ingredientes con amigos o con Don Krab ahora puedes buscar por nombre, y los que te faltan para tus recetas salen primero con cuántos faltan; el aviso de mudarse de calle en la página de recetas se puede ocultar hasta la siguiente estrella; «Reclamar todo» en los repartos solo aparece si ha llegado alguno; tocar «Recetas» en la barra inferior mientras ves otra calle te devuelve a la tuya; la pestaña del Fondo de Desarrollo en la plaza permite reintentar si tu restaurante no carga',
    checks1006:
      'En la actividad de hoy, el mercado y las predicciones de eventos indican si aún faltan días desde el registro o verificar el correo, «Reclamar premios de eventos por tiempo limitado» aparece como no disponible si no hay ningún evento en curso y los repartos muestran las estrellas que exige este servidor. Las piedras de rango 6 azul y verde cuentan ahora como rango 6 (antes costaban energía y la retirada como rango 5)',
    luckGem1006:
      'Nueva gema, la Piedra del destino: engástala para ganar suerte (rangos 1 a 6: +1, 2, 4, 8, 16, 24). El rango 1 se vende en la tienda de monedas, en la Oferta del día y en el mercado negro, también sale en premios aleatorios y sube de rango como las demás gemas. En el bar, la suerte en Piedra, papel o tijera ahora solo sube la probabilidad de ganar, y siempre queda al menos un 10 % de perder; antes, con mucha suerte, ya no se podía perder',
    mcLearn1006:
      'Aprender platos estrella es más fácil: descompón los fragmentos que no necesites en trozos, y 3 trozos de un nivel te dan 1 fragmento de cualquier plato de ese nivel. El Sello Delicia ahora acierta un 40 % en vez de un 28 %, y el Sello de jade del Dios de la Cocina está en la tienda (300 000). La tasación del Templo indica cómo conseguir cada objeto, y la guía tiene una sección «Cómo aprender platos estrella»',
    power1006:
      'La página de equipo ahora muestra tu poder de ataque y de defensa en los duelos (con todos los extras de Suerte y los del conjunto), y la Torre de chefs dice “Mi poder de ataque”, así que ambas páginas coinciden',
    mcTabs1006:
      'La página de platos estrella ahora tiene pestañas por nivel y por vía: elige un nivel arriba y una vía abajo, y se filtran tanto los platos aprendidos como los fragmentos, con el número en cada pestaña. Recuerda tu elección para la próxima vez',
    gearIncome1006:
      'El equipo puesto (con gemas) ahora suma monedas finales, EXP final y más probabilidad de platos estrella de oro; más atributos dan más (la Creatividad cuenta más, la Suerte no cuenta) y la página de equipo muestra cuánto. Los platos estrella se venden a los clientes por más según su nivel (nivel 3 ×2,5, nivel 4 ×3,2), porque antes los de nivel 2 a 5 no recuperaban el coste de los ingredientes. Los duelos de cocina siguen usando el valor original por ración',
    elders1006:
      'Los guardianes de la Torre de chefs ahora son Ancianos: cada piso lleva su propio equipo completo (+3 a +6) y los puntos de atributo de su nivel, que puedes desplegar para verlos. Una victoria real puede soltar una pieza del conjunto del Anciano (20 % en los pisos 1–3, menos más arriba). Los pisos 1–2 son algo más difíciles que antes y los pisos 6–10 bastante más fáciles. El extra aleatorio de la Creatividad en los duelos de cocina baja un poco y ya no vale más que otros atributos',
    duel1006:
      'Los duelos de cocina (Torre de chefs, Clasificación de chefs y duelos con amigos) ahora los deciden jueces: en cada duelo se eligen al azar 5 de 10 jueces, cada uno se fija en algunas de las cinco puntuaciones y gana el primero que llega a 3 votos. Tener mejores atributos es ahora mucho más fiable; la Creatividad y la Suerte dan un extra aleatorio. Mira «Reglas del duelo de cocina» en la página de la Torre de chefs',
    barPrize1006:
      'Ganar en el bar a Piedra, papel o tijera, Adivina el vaso, Cóctel Memoria y Dardos ahora da casi siempre ingredientes en vez de pocas monedas y EXP. Cuanto más difícil la victoria (racha más larga, nivel más avanzado, dardos perfectos), de más nivel es el ingrediente y más probable que sea raro',
    align1006:
      'La etiqueta del tipo de calle (de monedas, equilibrada o de EXP) en las páginas de recetas y de mudanza ahora está alineada con el texto de la bonificación',
    krab1006:
      'La despensa de Don Krab ahora está llena: todos los ingredientes de nivel 1 a 5, hasta cientos de los comunes y menos de los raros, repuestos cada día. El número de cambios diarios con Don Krab no cambia',
    guide1006:
      'La wiki del juego tiene ahora una guía de juego: tres ritmos de juego, qué hacer cada vez que entras, cuándo mudarse y en qué gastar primero. La página de recetas sugiere mudarte cuando tu calle no tiene recetas suficientes para la siguiente estrella',
    batch9:
      'Cada reposición diaria del mercado añade ahora un ingrediente que necesitan las recetas de la Calle de los novatos (Trece especias, Tofu, Azúcar cande…), así que los nuevos jugadores ya no se atascan durante días. La página de recetas, la de mudanza y la wiki del juego muestran si una calle es de monedas, equilibrada o de EXP, y por qué tiene su bonificación',
    streets1005:
      'Bonificaciones de las calles reequilibradas: las calles que dan más monedas dan menos EXP y al revés, y los ingresos totales de las calles están mucho más igualados. También se aplica a los restaurantes que ya están en una calle: las monedas bajan más en la Calle Guangdong y las Calles Fusión I y II, y la EXP sube más en las Calles Shandong, Grecia y Chop Suey (mira la bonificación de la calle en la página de mudanza). Por debajo del nivel 40, la EXP de cada ronda recibe un extra, +200% en el nivel 1 y menos en cada nivel, así que los nuevos jugadores suben más rápido',
    hostLimit1005:
      'Cada jugador puede revolver como máximo 3 huecos de la despensa por restaurante al día, y eliminar como máximo 3 cucarachas al día en el restaurante de un mismo amigo (sin límite en el tuyo ni en el de Don Krab). La despensa y el restaurante del amigo muestran cuántas veces te quedan hoy',
    browse1005:
      'Al volver de una receta o de una ficha de la wiki se mantienen la calle, los filtros y la página. La página de recetas muestra la bonificación de la calle elegida. Al tocar una cucaracha que pusiste se explica que no puedes eliminarla tú',
    renumber1005:
      'Objetos, ingredientes y recetas se han renumerado por categoría: los identificadores de la wiki del juego y de la API abierta han cambiado, y los enlaces antiguos de la wiki redirigen a los nuevos. Lo que tienes, las recetas que has aprendido y tu historial no cambian',
    retire1005:
      'Wiki del juego: ya no aparecen 117 objetos antiguos que no se pueden conseguir en el juego (utensilios y medallas exclusivos de jugadores del juego original, un paquete de prueba y un paquete de actualización antiguo); quien ya los tenga los conserva y puede seguir usándolos',
    tasks1005:
      'Tareas: las actividades con requisito de nivel (bolsa, predicciones…) o cerradas en este servidor aparecen bloqueadas; la ventanita de la hora se cierra al tocar fuera; el icono del correo está alineado',
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

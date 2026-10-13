import type { Messages } from '../..';

const site: Messages['site'] = {
  changelogTitle: 'Registro de cambios',
  linksTitle: 'Enlaces',
  linksEmpty: 'Aún no hay enlaces',
  linksEmptyBody: '¿Hiciste un sitio sobre el pueblo? Avísales a los administradores en el foro',
  linksLoadFailed: 'No se pudieron cargar los enlaces',
  clockTitle: 'Hora actual (hora de Pekín)',
  newMark: 'Nuevo',
  clTotal: (n) => `${n} ${n === 1 ? 'entrada' : 'entradas'}`,
  clLatest: (d) => `Última: ${d}`,
  clMore: (n) => `Ver ${n} ${n === 1 ? 'día' : 'días'} más`,
  clColon: ': ',
  monthDay: (m, d) =>
    new Date(Date.UTC(2000, m - 1, d)).toLocaleDateString('es', {
      timeZone: 'UTC',
      month: 'long',
      day: 'numeric',
    }),
  ymd: (y, m, d) =>
    new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  monthShort: (m) =>
    new Date(Date.UTC(2000, m - 1, 1)).toLocaleDateString('es', { timeZone: 'UTC', month: 'short' }),
  weekday: (w) =>
    new Date(Date.UTC(2000, 0, 2 + w)).toLocaleDateString('es', { timeZone: 'UTC', weekday: 'short' }),
  nextRound: (left) => `Siguiente ronda en ${left}`,
  changelog: {
    cuts21013:
      'Menos objetos, segunda tanda: se quitan las estatuas Apolo, Monumento al Renacimiento Africano, Vulgar y El pensador, la Llave de luz estelar, el Border collie, el Libro del Dios de las Estrellas, la Lámpara de queroseno, el Corazón acelerado y el Atrapasueños; con ellos desaparecen las monedas a EXP, echar a mano al enfadado Don Krab, repetir la tasación, los Sellos de jade del Dios de la Cocina en los críticos al guardián y las entregas fallidas convertidas en éxito; la tienda de renombre ahora tiene una de las estatuas restantes cada semana',
    yard1013:
      'Se quita el huerto: siembra, robo de cosechas, cesta, fórmulas y abono desaparecen, junto con el Pergamino de la estrella y la luna; también se quitan los pasos del huerto en las misiones principales y secundarias, y el capítulo 5 de la misión principal ahora se llama «Utensilios y Torre de chefs»',
    cuts1013:
      'Menos objetos: se quitan los cuadros, la Lámpara mágica y el Deseo del pueblo, el Collar del amor y Misión cumplida (ración extra en las entregas); el Mercado premium ahora pide una medalla del fondo de nivel B o superior; las recompensas de actividad ya no se duplican; las misiones secundarias pierden los pasos «Tener 7 cuadros» y «Pedir un deseo con la Lámpara mágica»',
    special1013:
      'Los platos especiales se venden distinto: los clientes exigentes satisfechos siguen tomando 2 raciones a precio completo y los que no quedan satisfechos o se van no toman ninguna; los clientes normales ahora piden 1 ración (a mitad de precio) solo en cerca de la mitad de sus mesas cada ronda, en vez de en todas. La página de platos especiales muestra las cifras de tu servidor',
    fix1013b:
      'Más pequeños arreglos: la tienda indica cuánto te falta en vez de «Te quedan 0»; los recuerdos del almacén se abren para ver su descripción completa; en la lista de recetas, los platos al máximo tienen su imagen de ingrediente, la paginación va dentro de la tarjeta y el detalle alinea los ingredientes de cada grado; los plazos de ahorro indican cuántos paquetes recibes por cantidad depositada; una puja fallida en la Suscripción mayorista conserva lo que escribiste y el panel de puja se actualiza cada 30 segundos mientras está abierto; los lectores de pantalla nombran la casilla de cantidad y ya no leen como interruptores las casillas que abren un panel',
    home1013:
      'Inicio más compacto: las monedas, la EXP y el aceite de la última ronda van en una sola tarjeta con las mesas, Mi local pasa a tres casillas pequeñas, las noticias del pueblo muestran 2 líneas y las instalaciones van de cuatro en cuatro, con las bloqueadas resumidas en una línea. Toca las monedas, la energía, los diamantes, el renombre o el anillo de nivel bajo el banner para ver qué es, cómo conseguirlo y para qué sirve',
    fix1013:
      'Pequeños arreglos: un restaurante cerrado vuelve a abrir en cuanto recibe aceite, venga de donde venga; el mercado cobra exactamente el precio unitario mostrado, mantiene el panel abierto si la compra falla y reactiva las ofertas al terminar la espera; los pedidos de futuros se limitan a lo que tus monedas cubren de señal; los ahorros y el fondo de desarrollo pasan a Cobrar al vencer aunque tengas la página abierta; el árbol de los deseos muestra las últimas rondas por fecha de sorteo; los vales de la tragaperras llevan separador de miles',
    handle1013:
      'Procesado en la despensa: dentro de tus procesados gratis del día, cada vez no cuesta energía sin importar la cantidad; después, cada ingrediente que obtengas combinando o que descompongas cuesta 1 de energía (antes, 1 por vez). El panel se cierra al terminar para que el resultado no quede tapado',
    picky1012:
      'Ajuste de los clientes exigentes: piden un plato de tu calle 9 de cada 10 veces y de otras calles 1 de cada 10, sin depender ya de las estrellas; con 30 o más platos de tu calle aprendidos siempre eligen uno que sabes cocinar, con menos pueden pedir uno que no has aprendido y marcharse, y esa mesa no da ingresos; si tu calidad no llega, quedan insatisfechos pero pagan la mitad del precio del plato (antes, una pequeña tarifa base); la tasa de exigentes sube un 2\u00a0% por estrella (antes un 6\u00a0%) y lo que pase del 30\u00a0% cuenta solo un tercio',
    jobcard1012:
      'Cambio en los permisos de trabajo: el Chico hip-hop y el ranking de propinas desaparecen; los permisos ahora salen del ranking de temporada (página del tiempo: cada domingo a las 23:00, los 3 primeros con al menos 200 puntos de temporada en la semana sacan uno cada uno). Los permisos llevan nombre de oficio y hay seis nuevos (Corredor de la bolsa, Operador de futuros, Asesor de inversiones, Asesor de fusiones, Dependiente del Kuji, Analista de predicciones) que rebajan una comisión de su sistema; todos dan monedas y EXP finales +5\u00a0%, y los sueldos bajan mucho. La pregunta del alcalde pasa a ser adivinar el próximo tiempo: si aciertas hay premio, fallar no penaliza',
    shiling1012:
      'Temporadas: cada clima pone de temporada dos vías de platos estrella, y una tanda cocinada de temporada es de temporada (desde 1 estrella). Los clientes que comen platos de temporada te dan puntos de temporada para la tienda de temporada de la página del clima (fragmentos, brújulas celestes, palillos del tiempo); elegir el plato de prueba ahora cuesta puntos de temporada. Se quitan el Kraken y la tienda de tentáculos, la olla del alcalde ya no da semillas y las recompensas aleatorias ya no dan abono ni fórmulas arcanas. Las semillas que tenías valen 5 puntos de temporada cada una, los tentáculos 30',
    weather1012:
      'Cambios en el tiempo: ahora cambia cada 4 horas y sigue al tiempo actual, y la página del tiempo muestra la previsión del próximo cambio y una guía breve. El Martillo de Thor se sustituye por la brújula celeste (eliges un tipo; el alcalde cambia 1 por semana y también sale en el último premio del Ichiban Kuji y en el árbol de los deseos) y los palillos del tiempo (agitas dos y te quedas con uno; 1 al día en la tienda). Ambos duran 1 hora y nadie más puede cambiar el tiempo en la hora siguiente',
    season1012:
      'La Sazón ya puede recibir puntos como la Cocina, el Corte y el Control del fuego, y la tarjeta de reinicio también los devuelve. Los ancianos de la torre también reparten puntos a la Sazón; cada planta se reequilibró y no es más fácil que antes',
    tables1012:
      'Al subir de nivel, la nueva mesa se coloca sola: primero una Mesa A del almacén y, si no hay, se compra al precio de la tienda. Si faltan monedas o las plantas están llenas, no se cobra nada y las novedades del restaurante explican por qué',
    tower1012:
      'En la torre, toca una planta para abrir el panel del anciano; las pruebas y los desafíos están ahí y las filas ya no tienen botón de desafío',
    mousetrap1012:
      'Las ratoneras ahora atrapan a los ratones que vienen a robar ingredientes con la probabilidad que indican, igual que a los amigos que revuelven tu despensa (antes se comprobaba primero tu suerte, y cuanta más tenías, menos servía la ratonera). Las descripciones y las novedades del restaurante lo explican',
    cupboard1012:
      'La despensa ahora es una lista, un ingrediente por fila: una imagen pequeña, el nivel tras el nombre, lo que aún pide la calle debajo y la cantidad a la derecha. Un buscador filtra por nombre, en el estante y en la nevera',
    thumbs1012:
      'Devolver todos ya no marca un fallo cuando le diste me gusta a alguien antes de que te lo diera a ti: ya cuenta como devuelto',
    account1012:
      'Inicio de sesión, cuenta, centro de ayuda y biblioteca rediseñados: las páginas de entrada y registro muestran la puerta del pueblo, cada campo tiene su título y su propia línea de error, y el ojo muestra la contraseña; cada servidor es una tarjeta con tu restaurante; idioma, apariencia y contraseña se cambian en paneles; las recompensas de los códigos tienen imágenes y tu código de invitación está en un recuadro punteado; el centro de ayuda son mosaicos y la guía se pliega; el registro de cambios y la biblioteca parecen un periódico, las listas tienen imágenes y las fichas de objetos, ingredientes, recetas y calles se leen como un pequeño manual',
    social1012:
      'Gremio, Plaza, Foro, Amigos y Correo rediseñados: el Gremio y la Plaza tienen imagen de cabecera, y el alcalde, el Hermano 13 y Carmen tienen retrato en una fila que muestra con quién has charlado hoy; subir estrella y ampliar el bidón dicen qué falta, y cambiar de nombre o mudarse se hace en un panel; responde al alcalde tocando un sitio, elige cantidades de objetos raros en un panel y los ingredientes misteriosos de Carmen en una cuadrícula; un panel para elegir especialidad y certificado al dar clase; el diario del pueblo parece un periódico, los anuncios y el martillo de Thor usan paneles y las clasificaciones tienen medallas y avatares; los temas del foro son tarjetas, la respuesta va abajo y editar/borrar están en «⋯»; las filas de amigos indican comida gratis, huecos de despensa y cucarachas, el restaurante de un amigo usa tu misma cabecera con una cuadrícula de acciones y mesas que se pueden tocar; los adjuntos del correo tienen iconos y cada correo se abre en un panel',
    play1012:
      'Bar, Templo y Torre de chefs rehechos: los tres tienen una imagen de cabecera con tus vales, energía o poder de chef; el inicio del bar es una cuadrícula de los diez juegos con las partidas de hoy y las que siguen en curso, cada juego tiene su página, las reglas son una lista corta en Reglas y las recompensas llevan imagen; en el templo, tasar, disparar, explorar y alimentar eligen la cantidad en un panel, y la prueba abre un panel de ingredientes desde las casillas principal y secundaria; la torre muestra un piso por fila, cada piso se abre con su guardián y el equipo del anciano, y los resultados de los duelos y los jueces se abren desde abajo',
    trade1012:
      'Tienda, Bolsa, Adquisiciones, Ichiban Kuji, Predicciones, Reparto y Banco rehechos: la tienda muestra un objeto por fila con filtros y un botón de precio que abre un panel de compra; la bolsa muestra un ingrediente por fila con su variación, y el libro de órdenes y la orden se abren desde abajo, igual que futuros y pujas al por mayor; los rankings de adquisiciones abren un panel con lo que recibe el dueño y el impuesto; el kuji muestra una fila por premio y los resultados en un panel; cada predicción tiene su página con gráfico y tu balance en cada caso; el reparto marca cada requisito y el repartidor se elige en un panel; el chico hip-hop empieza plegado en una fila',
    pages1011:
      'Páginas del restaurante rehechas: los 12 avatares tienen dibujo y avatares y puertas son casillas con imagen; la página de utensilios muestra una ranura por fila con el nombre completo, los atributos son barras (morado oscuro para puntos, claro para utensilios) y cambiar utensilios o asignar puntos se abre desde abajo; el detalle de un utensilio tiene un anillo de probabilidad y huecos de gemas; «Hoy» en misiones es una barra de actividad con sus niveles y las misiones son filas en una tarjeta; las recetas muestran uno de tres botones según puedas aprenderlas y las especialidades van de 12 en 12; el almacén es una cuadrícula con un panel por objeto; tocar una mesa abre un panel e Ingresos tiene un pequeño gráfico de las últimas 30 rondas',
    market1011:
      'La despensa es ahora una cuadrícula de mochila: iconos grandes, cantidad en la esquina, ingredientes de nivel 2 o más y universales con color, y al tocar una casilla se abre un panel con lo que tienes, la meta de la calle, la cantidad y las acciones de descomponer, combinar, canjear o bloquear; la nevera muestra una fila por ingrediente. El mercado muestra un ingrediente por fila con su nivel tras el nombre y un botón de precio que abre un panel de compra con atajos 10 / 100 / máx., el total y tu saldo, y un aviso si no te llegan las monedas',
    home1011b:
      'La portada tiene un nuevo diseño: la fachada es más grande y cuelga un cartel de «Cerrado» cuando se acaba el aceite; el nivel se muestra en un anillo de experiencia; el aceite y el llenado están en una tarjeta de estado arriba, con llenado en un toque cuando está cerrado; la última ronda muestra tres números grandes; registro, misión principal, actividad del día y consejos de novato son fichas grandes de 2×2, con el registro en morado mientras no lo hagas; recetas, plato especial y patrimonio están en «Mi restaurante»; las páginas principales tienen títulos más grandes',
    kitchen1011:
      'Cada ingrediente tiene ahora un pequeño icono según su tipo (carne, pescado, verdura, fruta y más), visible en la alacena, la nevera, el mercado y el detalle de recetas. La alacena es una cuadrícula de cuatro columnas con una tarjeta para el ingrediente elegido; el mercado, el almacén y los platos especiales usan − y + para las cantidades, y vender, tirar o desechar pide confirmación en un panel inferior. El detalle de recetas muestra una fila por grado, con los ingredientes que faltan en rojo y los grados aprendidos marcados; las páginas muestran bloques grises mientras cargan y una pista con enlace cuando están vacías',
    rest1011:
      'La portada muestra ahora la fachada de tu restaurante, con la puerta que elegiste en Aspecto; monedas, diamantes, energía y lo demás tienen iconos de color, y también las instalaciones y las ranuras de utensilios. Las confirmaciones salen desde abajo, con botón rojo para desmontar o vender; las cantidades se ajustan con − y +; la lista de misiones es más compacta, con una barra morada junto a las que puedes reclamar; los preajustes y el procesado en lote de utensilios se abren en un panel inferior; las páginas muestran bloques grises mientras cargan',
    ia1011:
      'El registro y la actividad diaria son ahora la pestaña «Hoy» de Misiones; los platos estrella y el progreso de recetas son pestañas de Recetas; las gemas, una pestaña de Utensilios; el fondo y el ahorro de Gary pasan al nuevo «Banco» del pueblo; los códigos de novato y las invitaciones están en la página Códigos. Las pestañas se guardan en la dirección: se pueden compartir y Atrás no pierde el sitio; las subclasificaciones son un desplegable; la Oferta del día ahora se llama Ofertas limitadas',
    shell1011:
      '«Más» ahora es «Pueblo», con los lugares agrupados en Comercio, Ocio y Público. Toca tu avatar arriba a la derecha para «Yo»: info, aspecto, utensilios, almacén, códigos, ajustes y centro de ayuda. Los títulos están en la barra superior y el botón atrás sube un nivel',
    theme1011:
      'Nuevos colores amatista, con botones, campos y pestañas renovados. Llega el modo oscuro: elige Según el sistema, Claro u Oscuro en Apariencia, dentro de Mi cuenta',
    wishtree1011:
      'La plaza tiene un nuevo Árbol de los deseos: el sorteo es cada día a las 20:00 y a la vez el árbol da un objeto nuevo. Desde el nivel 10, cada restaurante puede pedir 1 deseo gratis por ronda; en el sorteo se elige un restaurante que pidió deseo y recibe el objeto y el título «Deseo cumplido» durante 3 días (por correo). Los demás reciben una recompensa aleatoria',
    ui1011:
      'Las entradas de actividad sobre lo que te hacen tus amigos (comer sin pagar, dejar cucarachas, intercambiar ingredientes, etc.) ahora llevan directamente a su restaurante, y los intercambios indican qué ingrediente de qué nivel se cambió por cuál. La lista de pendientes de la portada suma una fila de la bolsa cuando cumples sus requisitos, con la suscripción mayorista en curso y cuánto se ha pujado. La suscripción mayorista se oculta en la última hora: el precio previsto, el umbral y las unidades pujadas se congelan en ese momento, y quién entra se sabe al cierre',
    bulk1010:
      'La bolsa tiene una nueva pestaña de Suscripción mayorista: cada día a las 20:00 sale un lote de un ingrediente (niveles 1 a 5). Puja un precio por unidad y una cantidad; el precio de la última unidad que entra es el precio único que pagan todos, y lo congelado de más se devuelve. Cada jugador puede llevarse hasta el 25\u00a0%; si en total se puja menos del 30\u00a0%, el lote fracasa y se devuelve todo. El lote cierra en un momento al azar de los últimos 5 minutos y entre pujas hay que esperar 5 segundos. Quien se queda justo fuera recibe un vale de ingrediente al azar de nivel 2',
    wealth1010:
      'La Asociación tiene una nueva página de Depósitos: deposita monedas 3, 7 o 14 días y al vencer recuperas todo el capital, además de un paquete de suministros del mercado de nivel 3, 4 o 5 por cada 1.000.000 de monedas. Al abrir el paquete recibes un ingrediente de su nivel que le falte a la calle donde estés. Hasta 3 depósitos y 10.000.000 de monedas en total, desde el nivel 20; retirar antes devuelve el 95\u00a0% y sin paquetes',
    futures1010:
      'La bolsa tiene una nueva pestaña de Futuros: encarga un ingrediente concreto, paga un depósito del 30\u00a0% para fijar el precio y se entrega solo a los 3 días, cuando se cobra el resto (lo que no quepa en la despensa va a tu cuenta de la bolsa). Si al vencer no puedes pagar el resto, o cancelas antes, el pedido queda impagado y el depósito no se devuelve. Cada ingrediente tiene un cupo diario para todo el servidor y cada jugador puede encargar hasta 50 al día en total',
    backlog1010:
      'Cada botón de premio de actividad muestra ahora qué da ese nivel. Cuando alguien termina de comer gratis y se va, el dueño baneado ya no recibe objeto y el objeto del dueño nunca es un Vale misterioso. La clasificación de vales ganados del Chile del Diablo cuenta ahora la ganancia neta (lo cobrado menos la apuesta) y la tabla de pagos ya no cambia a mitad de partida. Si alguien responde a una respuesta del autor del tema, el registro dice cuál, y responder a mensajes borrados ya no avisa a su autor. La página de invitaciones muestra los niveles de premio del servidor. Los guardianes de la torre se llaman ahora Vigías de la torre, para no confundirlos con el Guardián. También se corrigieron algunos textos, etiquetas para lectores de pantalla y la posición de los avisos',
    fix1010:
      'Los ratones eligen ahora qué robar según la cantidad: lo que tienes en abundancia se llevan más a menudo y los ingredientes raros de los que solo tienes unos pocos casi nunca se tocan. En Plantas y mesas, las mesas de una misma fila tienen ahora la misma altura',
    rank1010:
      'Las clasificaciones tienen ahora tablas de esta semana y de la pasada para más juegos del bar: Dardos (victorias), El último caramelo (mesas de principiantes y de expertos por separado), Mezcla secreta (menos intentos en una partida y mezclas acertadas), Cóctel Memoria (rondas completas), Chile del Diablo (vales ganados) y Trato o no trato (premios mayores). Salvo en Cóctel Memoria, el conteo empieza con esta actualización',
    ui1010:
      'Al asignar puntos, cada casilla se detiene en los puntos que te quedan y hay un botón Todo. En Plantas y mesas, cada mesa muestra lo que pidió o la especialidad que comió; toca una mesa para ver el grado pedido, el tuyo y si el cliente quedó satisfecho. Las cucarachas se señalan ahora en el enlace Plantas y mesas del inicio y en los botones de planta. Cuando alguien termina de comer gratis y se va, el dueño recibe ahora un objeto al azar. Los nombres de otros restaurantes en Noticias del pueblo son ahora enlaces. Al visitar un restaurante se ve su calle y, en orden, los títulos, el aviso, la adquisición y los utensilios. La página del Gremio es más compacta, las instalaciones del inicio van de tres en tres, los títulos quedan alineados con el texto de al lado y los colores de resalte son ahora el mismo naranja oscuro',
    feed1009:
      'El inicio tiene una nueva tarjeta «Actividad del restaurante» que muestra quién pasó por tu restaurante y qué ocurrió en él, con un punto en lo nuevo. La actividad incluye ahora también a quien termina de comer gratis y se va, las respuestas a tus temas del foro, cuando adquieren o sueltan tu restaurante, cuando un restaurante tuyo se recompra, los ratones que roban ingredientes, las compras de tu reposición manual y los ingredientes tirados por tener la nevera llena; también aparece ya cuando te contratan como repartidor. El total de me gusta recibidos se ve al visitar un restaurante y en la información del restaurante. El inicio solo muestra los anuncios de las últimas 12 horas. Las recompensas de misiones ya no se reclaman desde el inicio: el enlace Misiones muestra un icono de regalo cuando hay recompensas principales, semanales o secundarias, y te lleva a reclamarlas',
    ui1009:
      'Los avisos de acciones aparecen ahora como pequeñas cápsulas en la parte inferior de la pantalla, sin tapar la parte superior de la página, y los avisos breves de éxito duran menos. En la página de ingresos, la sección de bonificaciones, plegada, vuelve a estar arriba',
    titles1009:
      'Las insignias de título usan ahora el mismo estilo amarillo en tu inicio y al visitar otros restaurantes. Ahora puedes recibir títulos por correo o código de canje; los temporales indican cuánto duran. Tras reclamarlos, elige cuáles mostrar en la página Apariencia',
    devil1009:
      'Cambios en el Chile del Diablo: hasta 20 partidas al día; lo que ganas sigue ahora una tabla fija. Apostando 1 vale, aguantar 1/2/3 vasos devuelve 1/2/3 (igual que antes); con 5 devuelve 7/9/12, con 10 devuelve 14/18/25 y con 20 devuelve 27/36/49, algo menos que antes. La tabla aparece en el juego',
    fix1009:
      'Una tanda de pequeños arreglos: la descripción del Collar del amor ya no menciona el mercado premium; la etapa de misión secundaria de entrar en el top 10 de la clasificación de aportes de un evento limitado ahora cuenta todos los puestos hasta el 10, no solo los que reciben premio; el Diario del pueblo permite volver a días anteriores y separa mejor los párrafos; el éxito estimado de la Prueba usa coma decimal; los deseos retirados ya no aparecen con nombre chino en las noticias',
    daily1009:
      'Nuevo: el Diario del pueblo. Cada mañana cuenta lo más destacado del día anterior (grandes premios del Ichiban Kuji, adquisiciones, subidas de estrellas, resultados de predicciones y más). Está arriba del todo en Noticias del pueblo y también tiene un enlace en la página de inicio; puedes ver los 7 días anteriores y tocar el nombre de un restaurante para visitarlo. Lo escribe una IA a partir de las noticias del juego y solo cuenta cosas que han pasado de verdad; mientras el diario de un día no está listo, verás los titulares de ese día. Por ahora el diario solo está en inglés',
    act1008:
      'Cambios en los puntos de actividad: una tirada de Ichiban Kuji da 10 puntos; divertirse en el bar da 2 puntos cada vez, hasta 10 veces al día; comprar en el Mercado cuenta 2 veces al día; combinar o descomponer ingredientes da 3 puntos cada vez, hasta 5 veces; los desafíos de la Torre de chefs dan 5 puntos cada vez, hasta 2 veces; nueva tarea «Dar o recibir un me gusta», 2 puntos cada vez, hasta 5 veces. El máximo diario pasa de 193 a 220 puntos. También cambian los premios: 50 puntos dan además 10 Vales misteriosos, 100 puntos dan además 10.000 monedas, 120 puntos dan un Boleto Ichiban Kuji y 4 diamantes, 150 puntos dan EXP y 2 Tarjetas de energía pequeñas, y 180 puntos dan 1 Mapa de exploración',
    retire1008:
      'Otro lote de objetos ya no se puede conseguir (44 tipos, entre ellos animales del zodiaco, mascotas, plantas, adornos y algunas placas): desaparecen los 36 canjes del alcalde que los daban. Los que ya tienes mantienen sus efectos',
    text1008:
      'Números en misiones y reglas: las misiones secundarias del favor del Kraken, el nivel de amigos invitados y las participaciones en Predicciones muestran ahora los valores reales de este servidor; si el límite de participaciones de este servidor es menor que 200, el paso de «tener todas» cuenta con ese límite y ya no bloquea las misiones siguientes; varios ingredientes misteriosos iguales de una misma bestia guardiana salen ahora en una sola noticia; las reglas del duelo de cocina indican que el plato estrella no suma el valor de prueba',
    punct1008:
      'Textos en francés y español: el espaciado de la puntuación ahora es uniforme. En español, entre un número y el símbolo de porcentaje va siempre un espacio de no separación; en francés, un espacio fino de no separación delante de los dos puntos, el punto y coma, los signos de interrogación y exclamación y el de porcentaje, y dentro de las comillas. Así estos signos ya no pasan solos a la línea siguiente',
    robust1008:
      'Dividendos de adquisición: si los ingresos del día anterior aún no están contabilizados, primero se contabilizan y luego se pagan, y un pago fallido se reintenta 10 minutos después (antes los dividendos de ese día se perdían); al abrir una página nueva sin conexión ahora se avisa en vez de no hacer nada; el reloj de arriba se vuelve a sincronizar con el servidor al volver a la app; al cerrar sesión o cambiar de cuenta, los indicadores de correo y de solicitudes de amistad ya no muestran los números de la cuenta anterior',
    ux1008:
      'Al cambiar de página se vuelve arriba (antes se quedaba a la altura de la página anterior); «N puntos por asignar» en la Info del restaurante lleva directamente al cuadro de puntos de la página de Utensilios; al elegir ingredientes de prueba, los que no alcanzan porque el plato también los usa salen en gris con el motivo, y una búsqueda sin resultados lo indica; la penalización del Kraken al valor de prueba usa el valor que realmente se aplica; en móviles, el enlace a la actividad de la página de Misiones pasa encima de las pestañas cuando no cabe; además, algunos arreglos pequeños en botones y textos para lectores de pantalla',
    zhComma1008:
      'Texto en chino: las comas pasan a ser una coma inglesa seguida de un espacio, para ahorrar sitio',
    gemStrength1008:
      'Página de gemas: el «Energía: N» del final de la explicación ahora va en su propia línea, «Mi energía: N», para dejar claro que es tu energía actual',
    perf1008:
      'Las páginas cargan más rápido: menos idas y vueltas innecesarias con el servidor; la página principal del restaurante, el Registro de ingresos, la Info del restaurante, las Recetas y las Adquisiciones cargan sus datos a la vez; al volver a abrir el juego se reutilizan los archivos ya descargados',
    pages1008:
      'Página de ingresos: el historial está ahora arriba, con los totales de hoy y una columna de clientes, y las bonificaciones van en una sección desplegable que solo muestra las que no son 0; los enlaces entre Misiones y la página de actividad ya no ocupan una línea propia; la página de Equipo muestra primero los huecos y los botones, y las notas sobre el poder de chef y lo demás van en «Cómo se calculan estos números»; el detalle del equipo solo muestra los atributos con valor y dice claramente cuándo un objeto no admite gemas',
    fixes1008:
      'Las cuentas atrás y los tiempos restantes siguen ahora la hora del servidor, así que son correctos aunque el reloj de tu dispositivo vaya mal; sustituir una instalación que no ha caducado siempre pide confirmación; las entradas del Registro de objetos que no son de hoy muestran la fecha; los números grandes del progreso de misiones llevan separador de miles; la misión principal «Colocar una instalación» lleva ahora a la página de inicio; Progreso de recetas muestra «Cargando» mientras carga',
    tasksSplit1008:
      'El registro y la actividad del día tienen ahora su propia página, que se abre desde los puntos de actividad de la página de inicio; la página de Misiones tiene tres pestañas (Principal, Semanales, Secundarias), con un icono de regalo en las que tienen premios por recoger, y se abre desde el nuevo enlace Misiones de la fila de la misión principal en la página de inicio; se quitó la entrada de Misiones del menú Más',
    cookbookProgress1008:
      'La página de Recetas tiene un nuevo Resumen de progreso: el progreso total por calidad y, por calle, cuántas recetas tienes de cada calidad o mejor; tu calle actual aparece resaltada y las casillas completas, en verde',
    gameTime1008:
      'Todas las horas del juego (noticias del pueblo, correo, foro, novedades de amigos, registros del almacén y más) usan ahora la hora de Pekín, igual que el reloj de la parte superior, en lugar de la zona horaria de tu dispositivo; la guía de inicio indica que la energía se recupera 1 punto cada 10 minutos',
    renownTicket1008:
      'La tienda de renombre de la Torre de chefs ahora siempre vende Vales de ingrediente aleatorio nv. 4 (50 de renombre, 3 por semana) y nv. 5 (80 de renombre, 2 por semana)',
    economy1008:
      'Ajustamos algunas formas de convertir objetos en monedas: los objetos que tienen precio en diamantes, se consigan como se consigan, se venden a la tienda por como máximo 2.000 monedas por diamante; las Monedas de oro del mercado negro ahora cuestan 50 diamantes; los boletos de Ichiban Kuji ahora cuestan 40.000 monedas; los Vales de ingrediente misterioso, los Vales de ingrediente misterioso al azar, todos los mapas de exploración y los Trozos de fragmento ya no se pueden vender a la tienda, solo usar; la Bolsa ya no compra ingredientes de nivel 7 (sus existencias se siguen vendiendo)',
    business1008:
      'Nueva línea de misiones secundarias «Negocio» (desde el capítulo 2): añadir mesas, mejorar el bidón de aceite, colocar instalaciones, mantener el restaurante abierto muchas rondas en un día y ganar de 100.000 a 1.000.000 monedas de liquidación en un día. Las monedas y rondas diarias cuentan tu mejor día; cada día cuenta cuando se suma, justo después de medianoche',
    sideB1008:
      'Más misiones secundarias: nuevas líneas Recetas misteriosas, Guardián, Vigías de la torre, Adivinanzas del Mercado, Reparto experto, Adquisiciones, Gemas, Colección, Registro y actividad y Social; la línea del Pueblo añade el Fondo de Desarrollo, la pregunta del Alcalde, la clasificación semanal del Chico hip-hop, el Martillo de Thor y la Lámpara mágica; la del Templo añade el favor del Kraken, los tentáculos y 50 comidas. Las rachas de registro cuentan tu racha más larga, y los registros de los últimos 30 días ya están incluidos',
    sideA1008:
      'Más misiones secundarias: la línea del bar incluye probar cada juego nuevo y jugar 500 y 2000 veces; dos líneas nuevas, «Suerte en el bar» (rachas de piedra, papel o tijera, superar Adivina el vaso, Chile del Diablo, 100 tiradas en la tragaperras y más) y «As del bar» (dardos, Cóctel Memoria, El último caramelo, Mezcla secreta, Trato o no trato); la Bolsa añade operar con el sistema, malvender al sistema, comprar y vender ingredientes raros y 500 operaciones; las predicciones añaden vender antes de tiempo, tener 100 y 200 participaciones y ganar o perder cierta cantidad en una liquidación; el Ichiban Kuji añade sacar un Premio A y el Ichiban Kuji de lujo; Hogar en todo el mundo añade misiones de la calle Chop Suey, y la última, «Nostalgia», es aprender todos sus platos',
    krab1008:
      'Las Monedas Krab ya no se pueden vender a la tienda; solo sirven para la tragaperras y el canje del alcalde',
    quest1008:
      'Cambios en las misiones: al llegar a 1 estrella también recibes 1 Receta misteriosa, 1 Sello Delicia, 1 Mapa de exploración y 9 [Nivel 1]•Trozo de fragmento (suficientes para canjear una especialidad de nivel 1); la receta y el mapa que daban las misiones de tasación y exploración pasan aquí; al llegar a 2 estrellas recibes también 1 Pase a domicilio; desde 1 estrella, las misiones semanales incluyen «Recoger los mapas de exploración de la semana», 3 mapas cada semana; se quita la misión de reunir 4 macetas y el Último Premio del Ichiban Kuji da además 1 Cangreburger; el capítulo «El camino de los festines divinos» y «Subir una receta a Manjar divino», que aún no se pueden hacer, se ocultan por ahora',
    rank1008:
      'Las clasificaciones de rachas de piedra, papel o tijera, adivina el vaso y la ruleta de números ahora ordenan por la mejor racha alcanzada en la semana, con tablas de esta semana y de la pasada: perder una partida ya no te saca de la tabla; una racha que sigue después del lunes sigue contando y queda en la semana en que llegó a esa cifra; en caso de empate va primero quien llegó antes',
    odds1007:
      'El regalo de registro diario da ahora 1–5 diamantes cuando da diamantes (antes 1–3); bajo la tabla de premios de la tragaperras, una nota aclara que las probabilidades son por casilla sin contar el premio asegurado, y cada cuántas tiradas sale de media un premio raro contándolo',
    misc1007d:
      'Las tarjetas de ampliación pequeña, mediana y grande ya están en la tienda de monedas (30.000, 120.000 y 200.000); el canje del alcalde muestra primero lo ilimitado, luego lo que puedes canjear, lo que te falta y lo agotado, de más barato a más caro en cada grupo; cuando no puedes adquirir un restaurante, el aviso explica que es porque habéis entrado hace poco desde el mismo dispositivo o red; tras una actualización, una página antigua que no puede abrir otra se recarga sola una vez',
    retire1007:
      'Se ha retirado un lote de objetos sin uso: ya no aparecen en la tienda, el mercado negro, la oferta del día ni en ninguna recompensa. Los que ya tienes se siguen mostrando y se pueden usar o vender',
    cluster1007:
      'Cambios en el guardián del templo: el «Misil rápido» recupera su nombre original, «Misil de racimo», y hace 3200 por disparo en vez de 2000 (algo menos que 36 misiles estándar); el misil estándar baja a 2400 monedas; la recompensa por derrotar al guardián crece con su vida, así que con más estrellas da más ingredientes y más probabilidad de ingredientes misteriosos (a veces más de uno). El valor de prueba ahora llega como mucho al 30\u00a0% en vez del 50\u00a0% (lo que pase de ahí cuenta como 30\u00a0%), y los duelos de la torre y entre amigos ya no cuentan el valor de prueba',
    ui1007c:
      'Pruebas del templo: el ingrediente principal y el secundario son ahora dos casillas sobre una lista de ingredientes agrupada por nivel, con búsqueda; los niveles por debajo del plato empiezan plegados. Vales de ingredientes de Hermano 13: los niveles son botones que muestran cuántos vales tienes, primero salen los ingredientes que le faltan a tu calle y los que no tienes, con cuántos tienes y cuántos faltan, y se elige con +',
    batch1007b:
      'Los cambios con amigos ahora son 10 al día entre todos tus amigos, y a cada jugador se le puede cambiar como máximo 20 veces al día, sin importar las estrellas (con muchas estrellas tienes al menos 3 cambios con Don Krab); las gemas cambian de nombre por rango: piedra en bruto, espiritual y divina, luego jade en bruto, espiritual y divino; un icono de regalo junto a la actividad de hoy en la portada indica que hay recompensa por reclamar; en el aula puedes filtrar los platos estrella por nivel al abrir una clase; el mercado premium cierra por ahora; en la tienda de la torre, las estatuas muestran «Máx. 1» donde iría la cantidad',
    parens1007:
      'En la interfaz en chino (incluidas las descripciones de objetos y los nombres de recetas), los paréntesis de ancho completo ahora son de ancho normal con un espacio a cada lado, así cabe más texto en cada línea',
    ui1007:
      'Pequeños ajustes de interfaz: Trato o no trato muestra ahora las cajas abiertas en cada ronda y su contenido; el «Reclamar» de la misión principal en la página principal es ahora un icono de regalo con texto, y los botones verdes del resto del juego usan el color de la marca; los filtros por nivel y por vía de los platos estrella son ahora pequeñas píldoras; los platos estrella ya no están en «Más»: entra desde la página principal',
    misc1007:
      'La charla diaria con la Hermana Wen se ha mudado de la plaza al bar; el Pack de ingrediente universal al azar ahora solo da un ingrediente universal, y el Pack de inicio también da 10 ingredientes universales de nivel 1, 10 de nivel 2 y 5 de nivel 3; las cucarachas que ponen los amigos se van solas como mucho a las 4 horas; los ingredientes de nivel 6 no se pueden comerciar en la bolsa por ahora, y sus órdenes abiertas se retiran y se devuelven a tu cuenta de la bolsa; la tarea «Comer gratis» cuenta en cuanto empiezas; la nevera también muestra el nivel de cada ingrediente y cuántos necesita aún tu calle; repostar usa ahora un icono de gota de aceite',
    fix1007:
      'Un lote de pequeños arreglos: en las predicciones, los eventos terminados muestran primero los más recientes; en los vasos, plantarse tras la ronda 3 siempre sale en las noticias y superar las 4 rondas siempre se anuncia a todo el pueblo (ya no hay límite de uno al día), y la tabla de premios sigue visible con la ronda actual marcada mientras decides si plantarte; las descripciones de las mesas de El último caramelo siguen las reglas reales; la página «Míos» de adquisiciones indica que el dividendo de ayer aún no se ha pagado hasta que se paga; los enlaces de registro diario y repostar de la página principal son más fáciles de pulsar; los enlaces de nombres dentro del texto se subrayan al pasar el ratón o al seleccionarlos con el teclado',
    links1007:
      'Los enlaces de texto de todo el juego ahora se ven como los de la página principal: color de la marca, sin subrayado, con un «›» al final cuando llevan a otra página y un «‹» al principio cuando vuelven atrás. Las acciones de la misma página, como reenviar, actualizar, cancelar o responder, se ven igual que los enlaces, sin subrayado ni relleno extra',
    cup1007:
      'El juego de los vasos del bar cambia: hasta 4 rondas con 2, 3, 5 y 7 vasos, y un dado bajo uno solo. Cada vez que aciertas, puedes plantarte y llevarte el premio de esa ronda o seguir a la siguiente; si fallas, te quedas sin nada. Cuanto más avanzas, mayor el premio: plantarte tras la ronda 3 sale en las noticias, y superar las 4 rondas da 8 grandes premios y un anuncio para todo el pueblo. Cada partida cuesta 1 vale misterioso, ya no sube con la racha; la probabilidad es uno entre el número de vasos (la suerte sigue ayudando)',
    deal1007:
      'Nuevo juego del bar, «Trato o no trato»: 10 cajas en la mesa, cada una con ingredientes; la mayor tiene cinco ingredientes universales de nivel 5. Elige una como tu caja y abre las demás ronda a ronda. Tras cada ronda, el banquero del pueblo te ofrece monedas por tu caja: acepta y te vas, o sigue abriendo; si nunca aceptas, te llevas lo que haya en tu caja. 10.000 monedas por partida, 3 partidas al día',
    spice1007:
      'Nuevo juego del bar, «Mezcla secreta»: el barman mezcla 4 de 10 condimentos en un orden concreto. En cada intento entregas una combinación y recibes una respuesta en A y B (A: condimento correcto en el sitio correcto; B: condimento correcto en otro sitio). Tienes hasta 8 intentos y, cuanto antes la descubras, mejor premio: en 4 intentos o menos ganas un gran premio, renombre y sales en las noticias. 2 vales misteriosos por partida, 5 partidas al día',
    nim1007:
      'Nuevo juego del bar, «El último caramelo»: por turnos con el barman, coges unos cuantos caramelos de un montón (cada mesa tiene un límite); quien coge el último gana. La mesa de principiantes cuesta 1 vale misterioso, eliges quién empieza y el barman a veces se despista; la mesa de expertos cuesta 2 vales misteriosos, una moneda decide quién empieza y el barman nunca falla. Si ganas, recibes renombre y un premio; 10 partidas al día entre las dos mesas',
    homeLinks1007:
      'Inicio reorganizado: los enlaces de texto usan todos el color de la marca, sin subrayado y terminan en «›»; el registro diario es un enlace de texto, al registrarte aparece una marca fina y ya no se muestra la línea del regalo; echar aceite es un icono con texto en vez de un botón; los accesos a utensilios, almacén y tienda se sustituyen por «Recetas aprendidas/total» y tu especialidad a la venta; una nueva línea «Patrimonio» muestra el valor total de los restaurantes que posees, con un enlace a Adquisiciones; los restaurantes nuevos que aún no han liquidado ninguna ronda también llegan al registro de ingresos y a las plantas desde el inicio. En Más se quitan Invitar amigos (está en Mi cuenta), Clima (arriba a la derecha del inicio), Adquisiciones, Plantas y mesas y Registro de ingresos; Info del restaurante pasa a Otros y «Utensilios y puntos» ahora es solo «Utensilios»',
    npc1007:
      'El Aula, los canjes y el Fondo de Desarrollo pasan de la Plaza al Gremio. El Glotón de la Plaza era el alcalde y ahora se llama Alcalde Gran Olla, en el Gremio: allí están su charla diaria (ingrediente y semilla), la pregunta de dónde está el Chico hip-hop y el canje de objetos raros. El Hermano 13 (bocinas diarias, vales de ingredientes) y Carmen (vales de ingredientes misteriosos, y uno gratis en la primera visita) también están en el Gremio; Gary lleva el Fondo de Desarrollo. El juez de cocina El Glotón también pasa a ser el Alcalde Gran Olla. El Taoísta Fan aparece en la tasación del templo y Kai en la página de eventos temporales: tócalos para otra frase. La Plaza conserva Noticias, Vecinos y Clasificaciones',
    duel1007:
      'Los resultados del duelo de cocina ahora son comentarios de los jueces: cada juez repasa los aspectos que valora (victoria aplastante, muy parejo o derrota total) y da un marcador; el resultado también muestra el plato especial de cada lado («Sin plato especial» si no hay). El juez Viejo Pobretón pasa a ser Gordon, y Carmen pasa a ser Joe',
    home1007:
      'Inicio más compacto: las monedas, la EXP y el aceite de la última ronda ahora son iconos (el de EXP es el mismo que en tu barra de EXP), y los enlaces al historial y a las plantas están a la derecha de sus filas; junto al aceite hay un acceso para mejorar el bidón; el registro diario y los puntos de actividad comparten fila, y al registrarte solo aparece una marca. Las tarjetas, filas y títulos de todo el juego tienen algo menos de espacio, así cabe más en pantalla',
    acquire1006:
      'Nueva función «Adquisiciones» (en Más): los restaurantes de 2 estrellas o más tienen una valoración y puedes adquirir el restaurante de otro por ese precio. El dueño anterior recibe el 90\u00a0% y el 10\u00a0% es impuesto. Los restaurantes adquiridos pagan un dividendo diario a su dueño; atender al dueño una vez al día te da 5 ingredientes y sube su dividendo a la mitad más. Puedes recomprar tu restaurante por su valoración, y los dueños pueden ponerlo en venta con descuento o soltarlo. La página de otros restaurantes muestra su valoración y su dueño, y las adquisiciones, compras en venta y recompras de 10.000.000 de monedas o más salen en las noticias',
    backlog8:
      'En la guía de la wiki del juego, las recetas de la Calle de los novatos y de la calle más grande, las recetas necesarias para 2 estrellas, los requisitos del reparto a domicilio y de la Bolsa y el extra de EXP inicial siguen ahora los valores predeterminados actuales del juego; las reglas del duelo también indican qué atributos usa cada puntuación según los pesos actuales',
    perf1006:
      'La web descarga unos 140 KB menos la primera vez (la fuente de iconos solo incluye los que usamos), y el Mercado, el Bar, el Ichiban Kuji, el Templo y la Plaza abren más rápido',
    backlog7:
      'El nombre del restaurante de Don Krab y su mensaje de bienvenida ahora aparecen en tu idioma; los porcentajes siguen el formato de tu idioma (coma decimal y espacio antes de\u00a0%) y el desglose de la probabilidad de mejora ya no va pegado al número; en la interfaz francesa, «nombre × cantidad» ya no se parte en dos líneas en pantallas estrechas; si tu acceso a la Bolsa está congelado, la Bolsa y las predicciones de la actividad de hoy lo indican; la lista de recetas de la wiki muestra como máximo 1000 y luego sugiere acotar con la búsqueda o la calle, y una calle inexistente en la dirección muestra todas las recetas',
    backlog6:
      'Las reglas del duelo indican cuántos jueces usa realmente este servidor; el utensilio que suelta un anciano sale en su propia línea en la tarjeta de resultado y aparece en las noticias; el canje de trozos en los platos estrella permite cambiar varios a la vez; el «Cómo conseguirlo» de los objetos de tasación incluye los golpes críticos al guardián del Templo; las páginas de objetos de la wiki muestran también la Oferta del día, el mercado negro, los premios aleatorios y las mejoras de gemas como fuentes',
    visual1006:
      'Ajustes de diseño en móvil: la tabla de atributos del detalle de utensilios ahora tiene una fila por atributo; los motivos de bloqueo en la actividad de hoy van en su propia línea; el desplegable de canje de trozos en los platos estrella ya no se sale de la pantalla y muestra «Elige un plato»; la lista de bonificaciones y las filas de fragmentos pasan a otra línea si no caben; la tarjeta de resultado del duelo muestra el nombre traducido del anciano y las puntuaciones con la coma decimal',
    stealForget1006:
      'Fallar al espiar una clase castiga menos: antes olvidabas por completo (nivel de la clase × 3 + 1) recetas al azar; ahora (nivel de la clase × 2 + 1) recetas al azar bajan 1 nivel de calidad y solo se olvidan las de calidad Común; en clases de nivel 4 o más, la probabilidad de olvidar además un plato estrella de nivel inferior baja de nivel × 5\u00a0% a nivel × 2\u00a0%',
    frTimes1006:
      'En la interfaz en francés, las cantidades de objetos siguen ahora la tipografía francesa, con espacios alrededor del × (p. ej. «Riz × 3»)',
    web1006:
      'Al cambiar ingredientes con amigos o con Don Krab ahora puedes buscar por nombre, y los que te faltan para tus recetas salen primero con cuántos faltan; el aviso de mudarse de calle en la página de recetas se puede ocultar hasta la siguiente estrella; «Reclamar todo» en los repartos solo aparece si ha llegado alguno; tocar «Recetas» en la barra inferior mientras ves otra calle te devuelve a la tuya; la pestaña del Fondo de Desarrollo en la plaza permite reintentar si tu restaurante no carga',
    checks1006:
      'En la actividad de hoy, el mercado y las predicciones de eventos indican si aún faltan días desde el registro o verificar el correo, «Reclamar premios de eventos por tiempo limitado» aparece como no disponible si no hay ningún evento en curso y los repartos muestran las estrellas que exige este servidor. Las piedras de rango 6 azul y verde cuentan ahora como rango 6 (antes costaban energía y la retirada como rango 5)',
    luckGem1006:
      'Nueva gema, la Piedra del destino: engástala para ganar suerte (rangos 1 a 6: +1, 2, 4, 8, 16, 24). El rango 1 se vende en la tienda de monedas, en la Oferta del día y en el mercado negro, también sale en premios aleatorios y sube de rango como las demás gemas. En el bar, la suerte en Piedra, papel o tijera ahora solo sube la probabilidad de ganar, y siempre queda al menos un 10\u00a0% de perder; antes, con mucha suerte, ya no se podía perder',
    mcLearn1006:
      'Aprender platos estrella es más fácil: descompón los fragmentos que no necesites en trozos, y 3 trozos de un nivel te dan 1 fragmento de cualquier plato de ese nivel. El Sello Delicia ahora acierta un 40\u00a0% en vez de un 28\u00a0%, y el Sello de jade del Dios de la Cocina está en la tienda (300 000). La tasación del Templo indica cómo conseguir cada objeto, y la guía tiene una sección «Cómo aprender platos estrella»',
    power1006:
      'La página de equipo ahora muestra tu poder de ataque y de defensa en los duelos (con todos los extras de Suerte y los del conjunto), y la Torre de chefs dice “Mi poder de ataque”, así que ambas páginas coinciden',
    mcTabs1006:
      'La página de platos estrella ahora tiene pestañas por nivel y por vía: elige un nivel arriba y una vía abajo, y se filtran tanto los platos aprendidos como los fragmentos, con el número en cada pestaña. Recuerda tu elección para la próxima vez',
    gearIncome1006:
      'El equipo puesto (con gemas) ahora suma monedas finales, EXP final y más probabilidad de platos estrella de oro; más atributos dan más (la Creatividad cuenta más, la Suerte no cuenta) y la página de equipo muestra cuánto. Los platos estrella se venden a los clientes por más según su nivel (nivel 3 ×2,5, nivel 4 ×3,2), porque antes los de nivel 2 a 5 no recuperaban el coste de los ingredientes. Los duelos de cocina siguen usando el valor original por ración',
    elders1006:
      'Los guardianes de la Torre de chefs ahora son Ancianos: cada piso lleva su propio equipo completo (+3 a +6) y los puntos de atributo de su nivel, que puedes desplegar para verlos. Una victoria real puede soltar una pieza del conjunto del Anciano (20\u00a0% en los pisos 1–3, menos más arriba). Los pisos 1–2 son algo más difíciles que antes y los pisos 6–10 bastante más fáciles. El extra aleatorio de la Creatividad en los duelos de cocina baja un poco y ya no vale más que otros atributos',
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
      'Bonificaciones de las calles reequilibradas: las calles que dan más monedas dan menos EXP y al revés, y los ingresos totales de las calles están mucho más igualados. También se aplica a los restaurantes que ya están en una calle: las monedas bajan más en la Calle Guangdong y las Calles Fusión I y II, y la EXP sube más en las Calles Shandong, Grecia y Chop Suey (mira la bonificación de la calle en la página de mudanza). Por debajo del nivel 40, la EXP de cada ronda recibe un extra, +200\u00a0% en el nivel 1 y menos en cada nivel, así que los nuevos jugadores suben más rápido',
    hostLimit1005:
      'Cada jugador solo puede revolver unos pocos huecos de la despensa por restaurante al día, y eliminar unas pocas cucarachas al día en el restaurante de un mismo amigo (sin límite en el tuyo ni en el de Don Krab). La despensa y el restaurante del amigo muestran cuántas veces te quedan hoy',
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
    fund: 'Nuevo Fondo de Desarrollo en la Plaza: deposita monedas 7 días y recupera el 90\u00a0% más una medalla de EXP y un título temporal',
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

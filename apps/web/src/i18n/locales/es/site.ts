import type { Messages } from '../..';

const site: Messages['site'] = {
  changelogTitle: 'Registro de cambios',
  linksTitle: 'Enlaces',
  linksEmpty: 'Todavía no hay enlaces.',
  linksLoadFailed: 'No se pudieron cargar los enlaces',
  clockTitle: 'Hora actual (hora de Pekín)',
  nextRound: (left) => `Siguiente ronda en ${left}`,
  changelog: {
    sideB1008:
      'Más misiones secundarias: nuevas líneas Recetas misteriosas, Guardián, Guardianes de la torre, Adivinanzas del Mercado, Reparto experto, Adquisiciones, Gemas, Colección, Registro y actividad y Social; la línea del Pueblo añade el Fondo de Desarrollo, la pregunta del Alcalde, la clasificación semanal del Chico hip-hop, el Martillo de Thor y la Lámpara mágica; la del Templo añade el favor del Kraken, los tentáculos y 50 comidas. Las rachas de registro cuentan tu racha más larga, y los registros de los últimos 30 días ya están incluidos',
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
      'Cambios en el guardián del templo: el «Misil rápido» recupera su nombre original, «Misil de racimo», y hace 3200 por disparo en vez de 2000 (algo menos que 36 misiles estándar); el misil estándar baja a 2400 monedas; la recompensa por derrotar al guardián crece con su vida, así que con más estrellas da más ingredientes y más probabilidad de ingredientes misteriosos (a veces más de uno). El valor de prueba ahora llega como mucho al 30 % en vez del 50 % (lo que pase de ahí cuenta como 30 %), y los duelos de la torre y entre amigos ya no cuentan el valor de prueba',
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

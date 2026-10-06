import type { Messages } from '../..';

/** NPC de las páginas de funciones (incidencias 441, 443) */
const npc: Messages['npc'] = {
  mayor: {
    name: 'Alcalde Gran Olla',
    lines: [
      'Cangreburgers, Vales Delicioso, fragmentos: cámbialos conmigo por objetos raros.',
      '¿Adónde fue hoy el Chico hip-hop? Dímelo; si aciertas, tendrás una bonificación.',
      'Soy el Alcalde Gran Olla. ¡Olla, no Glotón! No me confundas con El Glotón.',
    ],
  },
  bro13: {
    name: 'Hermano 13',
    lines: [
      'Ven a charlar conmigo cada día y te daré una bocina.',
      'Un vale de ingrediente se cambia por un ingrediente normal del mismo nivel; puedes elegir varios a la vez.',
    ],
  },
  carmen: {
    name: 'Carmen',
    lines: [
      'Dame un vale de ingrediente misterioso y elige el ingrediente misterioso que quieras.',
      'Los ingredientes misteriosos sirven para los platos estrella: elige bien.',
    ],
  },
  gary: {
    name: 'Gary',
    lines: [
      'Fondo de Desarrollo del Pueblo: al vencer recuperas la mayor parte del depósito y una medalla de EXP.',
      'Retirar antes devuelve menos y no da medalla; piénsalo bien.',
      'Cada restaurante solo puede tener un depósito a la vez.',
    ],
  },
  fanDao: {
    name: 'Taoísta Fan',
    lines: [
      'Cada tasación cuesta una Receta Misteriosa y un objeto de tasación.',
      'Si la tasación sale bien, recibes un fragmento de un plato estrella; con 3 lo aprendes.',
      'Los fragmentos que no uses se pueden descomponer en trozos; 3 trozos de un nivel se cambian por un fragmento de cualquier plato de ese nivel.',
    ],
  },
  xiaoKai: {
    name: 'Kai',
    lines: [
      '¿Terminaste una tarea del evento temporal? No olvides reclamar la recompensa.',
      'Las recompensas sin reclamar llegan al correo cuando termina el evento.',
    ],
  },
  links: {
    classroom: { label: 'Aula', desc: 'Enseñar, aprender y aprender a escondidas platos estrella' },
    mayor: {
      label: 'Alcalde Gran Olla',
      desc: 'Cambiar por objetos raros; decirle dónde está el Chico hip-hop',
    },
    bro13: { label: 'Hermano 13', desc: 'Una bocina cada día; cambiar vales de ingredientes' },
    carmen: { label: 'Carmen', desc: 'Cambiar vales de ingredientes misteriosos' },
    fund: { label: 'Gary', desc: 'Fondo de Desarrollo del Pueblo' },
  },
  titles: {
    classroom: 'Aula',
    mayor: 'Intercambio de objetos raros',
    bro13: 'Intercambio de ingredientes',
    carmen: 'Intercambio de ingredientes misteriosos',
    fund: 'Fondo de Desarrollo del Pueblo',
  },
  off: 'Esta función aún no está disponible en este servidor',
};
export default npc;

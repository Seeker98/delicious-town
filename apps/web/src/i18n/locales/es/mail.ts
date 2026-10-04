import type { Messages } from '../..';
import { plEs } from '../../helpers';

const mail: Messages['mail'] = {
  title: 'Buzón',
  loadFailed: 'No se pudo cargar el correo',
  claimFailed: 'No se pudo reclamar',
  deleteFailed: 'No se pudo borrar',
  claimAllPartial: (claimed, failed) => `Reclamaste ${claimed}; ${failed} fallaron. Inténtalo más tarde.`,
  claimAll: 'Reclamar todo',
  empty: 'No hay correo',
  claim: 'Reclamar',
  delete: 'Borrar',
  daysLeft: (n) => ` · quedan ${n} ${plEs(n, 'día', 'días')}`,
  needLevel: (n) => `· requiere nv. ${n}`,
  claimed: '· Reclamado',
  broken: '· El adjunto ya no es válido; contacta con soporte',
  items: (text) => `Adjuntos: ${text}`,
  redeem: {
    placeholder: 'Escribe un código',
    label: 'Código',
    btn: 'Canjear',
    done: (text) => `Canjeado: ${text}`,
    failed: 'No se pudo canjear',
  },
};
export default mail;

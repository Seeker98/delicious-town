import type { Messages } from '../..';

const common: Messages['common'] = {
  loading: 'Cargando…',
  confirm: 'Aceptar',
  cancel: 'Cancelar',
  language: 'Idioma',
  loadFailed: 'Error al cargar',
  langLoadFailed: 'No se pudo cambiar el idioma. Comprueba tu conexión e inténtalo de nuevo.',
  langSaveFailed: 'Idioma cambiado, pero no se pudo guardar en tu cuenta. Volverá al anterior al recargar.',
  collapse: 'Mostrar menos',
  expand: 'Mostrar',
  prevPage: 'Anterior',
  nextPage: 'Siguiente',
  all: 'Todo',
  other: 'Otros',
  opFailed: 'No se pudo completar la acción',
  loadMore: 'Cargar más',
  paren: (s) => ` (${s})`,
  qty: (name, num) => `${name}×${num}`,
  times: '×',
  parenOpen: ' (',
  parenClose: ')',
  colon: (s) => `${s}: `,
  semi: '; ',
};
export default common;

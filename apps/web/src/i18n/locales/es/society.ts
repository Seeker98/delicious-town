import type { Messages } from '../..';

const society: Messages['society'] = {
  title: 'Gremio',
  links: {
    star: {
      label: 'Subir estrella',
      desc: '¿Tienes el nivel, las recetas y los certificados? Consigue la siguiente estrella',
    },
    oil: { label: 'Ampliar el bidón de aceite', desc: 'Más capacidad de aceite, menos cierres' },
    rename: { label: 'Cambiar nombre', desc: 'Requiere una tarjeta de cambio de nombre' },
    move: { label: 'Mudarse', desc: 'Cambiar de calle; la insignia de calle cambia con ella' },
  },
  move: {
    title: 'Mudarse',
    hint: (street, cost) =>
      `Estás en ${street}. Necesitas 1 tarjeta de mudanza (gratis con permiso de la oficina de mudanzas) y unas ${cost} monedas (mitad de precio con suerte).`,
    pick: 'Elige una calle nueva',
    bonus: (desc) => `Bonificación de la calle: ${desc}`,
    option: (name, cook) => `${name} (${cook})`,
    btn: 'Mudarse',
    done: (street) => `Te mudaste a ${street}`,
    failed: 'No se pudo mudar',
  },
  oil: {
    title: (level, max) => `Ampliar el bidón de aceite (nivel ${level}, máx. ${max})`,
    next: (level, max) => `En el nivel ${level} el máximo pasa a ${max}`,
    maxed: 'Ya está al nivel máximo',
    btn: 'Ampliar',
    done: 'Bidón de aceite ampliado',
    failed: 'No se pudo ampliar',
  },
  rename: {
    title: 'Cambiar nombre',
    hint: 'Requiere 1 tarjeta de cambio de nombre. Hasta 9 caracteres: caracteres chinos, letras y números. No puede coincidir con otro restaurante del servidor.',
    placeholder: 'Nombre nuevo',
    btn: 'Cambiar nombre',
    done: (name) => `Ahora te llamas «${name}»`,
    failed: 'No se pudo cambiar el nombre',
  },
  star: {
    title: (star) => `Subir estrella (ahora ${star}★)`,
    notOpen: (star) => `${star}★ aún no está disponible`,
    award: 'Recompensas: ',
    maxed: 'Ya tienes el máximo de estrellas',
    btn: (star) => `Subir a ${star}★`,
    done: (star) => `¡Enhorabuena, subiste a ${star}★!`,
    failed: 'No se pudo subir de estrella',
  },
  needs: {
    level: 'Nivel del restaurante',
    star: 'Estrellas',
    cookbooks: 'Recetas aprendidas',
    coin: 'Monedas',
  },
  needLine: (label, have, need) => `${label}: ${have} / ${need}`,
};
export default society;

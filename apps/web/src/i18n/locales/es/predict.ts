import type { Messages } from '../..';

const predict: Messages['predict'] = {
  title: 'Predicciones',
  reasons: {
    predict_level: (level) => `Tu restaurante debe ser de nivel ${level} para hacer predicciones`,
    predict_age: (days) => `Tu cuenta debe tener al menos ${days} días para hacer predicciones`,
    predict_email: 'Verifica tu correo para hacer predicciones',
  },
  status: { open: 'Abierta', closed: 'Esperando resultado', resolved: 'Resuelta', void: 'Anulada' },
  yes: 'Sí',
  no: 'No',
  result: (yes) => `Resultado: ${yes ? 'Sí' : 'No'}`,
  closedAt: 'Cerrada',
  leftHm: (h, m) => `Quedan ${h} h ${m} min`,
  leftM: (m) => `Quedan ${m} min`,
  intro:
    'Compra «Sí» o «No». Al cerrar, cada participación del lado ganador paga 1.000 monedas. El precio es la probabilidad que todos creen que tiene, y sube o baja con las compras y ventas. No hace falta esperar al resultado: puedes vender en cualquier momento antes del cierre para asegurar ganancias o cortar pérdidas. Toca un evento para ver el detalle.',
  running: 'Abiertas',
  noRunning: 'Ahora no hay predicciones abiertas',
  auto: 'Pregunta del sistema',
  yesPct: (n) => `Sí ${n} %`,
  noPct: (n) => `No ${n} %`,
  holding: (yes, no) => ` · Tengo Sí ${yes} / No ${no}`,
  ended: 'Terminadas',
  endedHold: (yes, no) => `Tenía Sí ${yes} / No ${no}`,
  profit: (n) => ` · Balance ${n}`,
  note: (text) => `Base del resultado: ${text}`,
  detail: {
    action: (buy, yes) => `${buy ? 'Comprar' : 'Vender'} ${yes ? 'Sí' : 'No'}`,
    traded: (action, qty, buy, total) =>
      `${action} ${qty} participaciones, ${buy ? 'gastaste' : 'recibiste'} ${total} monedas`,
    failed: 'No se pudo operar',
    closeAt: (time) => `Cierra ${time}`,
    noChart: 'Aún no hay operaciones. El gráfico de precios aparecerá cuando alguien compre o venda',
    hold: (yes, no, net) => `Tengo Sí ${yes}, No ${no}; inversión neta ${net} monedas`,
    sellAll: (n) => ` (vender todo ahora daría unas ${n} monedas)`,
    outcome: (label, got) => `Si sale ${label}: recibes ${got} monedas, balance`,
    help: 'Cómo se calcula el balance',
    helpItems: (unit, example, feePct) => [
      `Al cerrar, cada participación del lado ganador paga ${unit} monedas y el lado perdedor no vale nada. Por ejemplo, si «Sí» está al 63 %, 1 participación cuesta unas ${example} monedas; si sale «Sí» recuperas ${unit}, y si sale «No» pierdes lo que pagaste.`,
      'El precio es la probabilidad que todos creen que tiene: cuanta más gente compra «Sí», más caro está «Sí» y más barato «No»; cuanto más compras de una vez, más cara sale cada participación siguiente.',
      'No hace falta esperar al resultado: puedes vender al precio actual en cualquier momento antes del cierre. ¿Crees que te equivocaste? Vende para cortar la pérdida. ¿El precio subió lo suficiente? Vende para asegurar la ganancia. Lo que ganas o pierdes es la diferencia entre lo que obtienes al vender y lo que pagaste al comprar.',
      `Comprar y vender cobran una comisión del ${feePct} % (sobre el importe, redondeada hacia arriba).`,
      'Inversión neta = lo que pagaste al comprar (con comisión) − lo que recuperaste al vender; balance = pago al cerrar − inversión neta.',
      'Si la predicción se anula, se devuelve la inversión neta; si alguien vendió antes con ganancia y el sistema no recaudó suficiente, la devolución es proporcional.',
    ],
    buy: 'Comprar',
    sell: 'Vender',
    shares: 'participaciones',
    submit: 'Confirmar',
    estimate: (buy, total, fee, pct) =>
      `${buy ? 'Coste estimado' : 'Ingreso estimado'} ${total} monedas (comisión ${fee} incluida); «Sí» quedará al ${pct} % tras la operación`,
    enterQty: 'Escribe cuántas participaciones (no puedes vender más de las que tienes)',
    summary: 'Balance de esta predicción',
    summaryLine: (bought, sold, fees, net) =>
      `Compraste ${bought}, vendiste ${sold} (comisiones ${fees}), inversión neta ${net}`,
    resolved: (label, held, unit, payout) =>
      `Resultado ${label}: ${held} participaciones ${label} × ${unit} = ${payout}`,
    voided: (pct, payout) => `Anulada: se devuelve el ${pct} % de la inversión neta, ${payout} en total`,
    waiting: 'Cerrada, esperando el resultado',
    summaryHint: '(pago al cerrar − inversión neta)',
    mine: 'Mis operaciones',
    mineHint: 'Cada operación que hiciste en esta predicción; los importes incluyen comisión',
    mineLine: (action, qty, per, buy, total) =>
      `${action} ${qty} participaciones a unos ${per} cada una, ${buy ? 'gastaste' : 'recibiste'} ${total}`,
    trades: 'Últimas operaciones del servidor',
    tradesHint:
      'Las 20 últimas operaciones de todos (anónimas): muestran qué operaciones subieron o bajaron el precio',
    noTrades: 'Aún no hay operaciones',
    tradeLine: (action, qty, per, pct) =>
      `${action} ${qty} participaciones a unos ${per} cada una, «Sí» al ${pct} % después`,
  },
};
export default predict;

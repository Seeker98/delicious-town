import { GOODS, type Tuning } from '@dt/config';
import { gameDay, type BarAwardDto, type NimDto, type NimTable, type NimTableInfoDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState, limitReached } from '../../core/errors';
import { restLog, type Op } from '../../core/op';
import { gainRenown } from '../../core/resources';
import { randomAward } from '../award/random';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { consumeGoods } from '../store/goods';
import { badInput } from './common';
import { assertNoRound, endRound, loadRound, saveRound } from './round';
import { nimBartenderTake } from './rules';

/** 最后一颗糖的服务端局面（设计 §5）；全部公开，没有要藏的 */
export interface NimState {
  table: NimTable;
  k: number;
  pile: number;
  left: number;
  /** 新手桌还没选先后时为 false */
  started: boolean;
  /** 高手桌抛硬币的结果；新手桌为 null */
  coin: 'me' | 'bartender' | null;
  log: Array<{ who: 'me' | 'bartender'; take: number }>;
}

const between = (o: Op, [lo, hi]: readonly [number, number]) => lo + o.rng.int(hi - lo + 1);

/** 进行中的局给前端看的样子 */
export function nimView(s: NimState): NimDto {
  return {
    table: s.table,
    k: s.k,
    pile: s.pile,
    left: s.left,
    log: s.log,
    needFirst: !s.started,
    coin: s.coin,
    result: null,
    renown: 0,
    award: null,
  };
}

/** 两张桌子给前端看的数值：不给调酒师的失手概率 */
export function nimTables(n: Tuning['bar']['nim']): Record<NimTable, NimTableInfoDto> {
  const info = (x: Tuning['bar']['nim']['tables'][NimTable]): NimTableInfoDto => ({
    cost: x.cost,
    k: x.k,
    pile: x.pile,
    renown: x.renown,
    awardLevel: x.awardLevel,
    first: x.first,
    careless: x.mistake > 0,
  });
  return { novice: info(n.tables.novice), expert: info(n.tables.expert) };
}

/** 调酒师拿一步；拿完返回 true */
function bartender(o: Op, s: NimState): boolean {
  const take = nimBartenderTake(s.left, s.k, o.tuning.bar.nim.tables[s.table].mistake, o.rng);
  s.left -= take;
  s.log.push({ who: 'bartender', take });
  return s.left === 0;
}

/** 结束：赢了加声望、发一份奖励；删掉局面、写个人日志 */
async function finish(o: Op, s: NimState, win: boolean): Promise<NimDto> {
  const t = o.tuning.bar.nim.tables[s.table];
  await endRound(o, 'nim');
  let award: BarAwardDto | null = null;
  if (win) {
    gainRenown(o, t.renown);
    // 支线“酒桌高手”：按桌子分开记赢（问题记录 515）
    await emitAction(o, `bar.nim.${s.table}`);
    award = await randomAward(o, { level: t.awardLevel, noTicket: true, bar: true });
  }
  restLog(o, 'bar.nim', { table: s.table, result: win ? 'win' : 'lose' });
  return { ...nimView(s), result: win ? 'win' : 'lose', renown: win ? t.renown : 0, award };
}

/** 开局（设计 §4.3）：扣礼券、计次数；高手桌抛硬币，调酒师先拿时开局就有他一步 */
export async function nimStart(o: Op, table: NimTable): Promise<NimDto> {
  const n = o.tuning.bar.nim;
  const t = n.tables[table];
  await assertNoRound(o, 'nim');
  const day = gameDay(o.now);
  if ((await getDaily(o.tx, o.rest.id, 'bar.nim', day)) >= n.dailyMax)
    throw limitReached('bar_daily', { max: n.dailyMax });
  await consumeGoods(o, GOODS.mysteryTicket, t.cost);
  await incrementDaily(o.tx, o.rest.id, 'bar.nim', 1, day);
  const k = between(o, t.k);
  const pile = between(o, t.pile);
  const s: NimState = { table, k, pile, left: pile, started: t.first !== 'choose', coin: null, log: [] };
  if (t.first === 'coin') {
    s.coin = o.rng.chance(0.5) ? 'me' : 'bartender';
    // 糖果数下限大于 k 上限（数值校验），调酒师第一步拿不完；万一拿完了照样判输，不留下拿不了的局（#190 审查）
    if (s.coin === 'bartender' && bartender(o, s)) {
      await emitAction(o, 'bar.play');
      await emitAction(o, 'bar.nim');
      return finish(o, s, false);
    }
  }
  await saveRound(o, 'nim', s);
  await emitAction(o, 'bar.play');
  await emitAction(o, 'bar.nim');
  return nimView(s);
}

/** 新手桌选先后：选调酒师先拿时他接着拿一步 */
export async function nimFirst(o: Op, who: 'me' | 'bartender'): Promise<NimDto> {
  const s = await loadRound<NimState>(o, 'nim');
  if (!s) throw invalidState('no_round');
  if (s.started) throw invalidState('nim_started');
  s.started = true;
  if (who === 'bartender' && bartender(o, s)) return finish(o, s, false);
  await saveRound(o, 'nim', s);
  return nimView(s);
}

/** 玩家拿 num 颗；拿完就赢，否则调酒师接着拿，他拿完就输 */
export async function nimTake(o: Op, num: number): Promise<NimDto> {
  const s = await loadRound<NimState>(o, 'nim');
  if (!s) throw invalidState('no_round');
  if (!s.started) throw invalidState('need_first');
  if (num < 1 || num > s.k || num > s.left) throw badInput('num');
  s.left -= num;
  s.log.push({ who: 'me', take: num });
  if (s.left === 0) return finish(o, s, true);
  if (bartender(o, s)) return finish(o, s, false);
  await saveRound(o, 'nim', s);
  return nimView(s);
}

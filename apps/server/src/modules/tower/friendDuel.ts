import type { Kysely } from 'kysely';
import { gameDay, type DuelInfoDto, type DuelResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState, limitReached, requirement } from '../../core/errors';
import type { PairOp } from '../../core/pair';
import { gainRenown, spendStrength } from '../../core/resources';
import type { DB, RestaurantRow } from '../../db/schema';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { KEY, sparAwards } from './common';
import { duel, duelPower } from './duel';
import { duelRenown, duelTier, type TowerTuning } from './rules';
import { playerSide, sideDto } from './sides';

export async function duelInfo(
  db: Kysely<DB>,
  me: RestaurantRow,
  targetId: number,
  t: TowerTuning,
  now: Date,
): Promise<DuelInfoDto> {
  const day = gameDay(now);
  return {
    left: Math.max(0, t.duelPerFriend - (await getDaily(db, me.id, KEY.duel(targetId), day))),
    spar: await getDaily(db, me.id, KEY.spar, day),
    strength: me.strength,
    duelStrength: t.duelStrength,
  };
}

/**
 * 好友切磋（设计文档 §3.4）：我进攻、对方防守，对方不受影响。声望按厨力分档和今日切磋总次数（裁定 7、8）。
 * 随机数顺序：对决 → 切磋奖励
 */
export async function friendDuel(p: PairOp): Promise<DuelResultDto> {
  const o = p.me;
  const t = o.tuning.tower;
  if (p.them.rest.npc) throw invalidState('npc');
  if (o.rest.renown < 0) throw requirement('renown', { what: 'duel' });
  if (o.rest.star_level < 1) throw requirement('star', { need: 1 });
  const day = gameDay(o.now);
  if ((await getDaily(o.tx, o.rest.id, KEY.duel(p.them.rest.id), day)) >= t.duelPerFriend)
    throw limitReached('duel', { max: t.duelPerFriend });
  spendStrength(o, t.duelStrength);
  const me = await playerSide(o, 'attack');
  const them = await playerSide(p.them, 'defend');
  const r = duel(me, them, o.rng);
  const before = await getDaily(o.tx, o.rest.id, KEY.spar, day);
  const renown = duelRenown(duelTier(duelPower(me.attrs), duelPower(them.attrs), t), r.win, before, t);
  gainRenown(o, renown);
  const awards = r.win && before < t.sparMaxAt ? await sparAwards(o, before) : [];
  await incrementDaily(o.tx, o.rest.id, KEY.duel(p.them.rest.id), 1, day);
  await incrementDaily(o.tx, o.rest.id, KEY.spar, 1, day);
  await emitAction(o, 'tower.friendDuel');
  return {
    win: r.win,
    me: sideDto(me, r.me),
    them: sideDto(them, r.them),
    renown,
    awards,
    test: false,
    rank: null,
  };
}

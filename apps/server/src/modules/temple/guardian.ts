import { GOODS } from '@dt/config';
import { gameDay, pickWeighted, type MissileResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState, notEnough, requirement } from '../../core/errors';
import { opAgg, opLuck } from '../../core/luck';
import { opNeedPick } from '../../core/scarcity';
import { opNews, type Op } from '../../core/op';
import { drawDtTickets } from '../../core/tickets';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { consumeGoods, countGoods, grantGoodsOp, hasValidHonor } from '../store/goods';
import { addFoodsMerged, badInput, bump, pickFood, toList } from './common';
import { guardianFoods, guardianHp, shoot } from './rules';

/** 发射飞弹（规格书 09 §9.1，设计文档 §3.1） */
export async function shootMissiles(
  o: Op,
  weather: Record<string, number>,
  b: { goodsId: number; num: number },
): Promise<MissileResultDto> {
  const t = o.tuning.temple;
  const base = o.config.missiles.get(b.goodsId);
  if (!base) throw badInput('not_missile');
  // 伤害按本区服 tuning 覆盖（试玩修复 14；终审：后台改分区数值要生效）
  const over = t.missileAttack.find(([id]) => id === b.goodsId);
  const def = over ? { ...base, attack: [over[1], over[2]] as [number, number] } : base;
  if (o.rest.star_level < 1) throw requirement('star', { need: 1 });
  const day = gameDay(o.now);
  if ((await getDaily(o.tx, o.rest.id, 'guardian.killed', day)) > 0) throw invalidState('guardian_down');
  const have = await countGoods(o, b.goodsId);
  if (have < 1) throw notEnough('goods', 1, 0, b.goodsId);
  const hpMax = guardianHp(o.rest.star_level, t);
  let hpLeft = Math.max(0, hpMax - (await getDaily(o.tx, o.rest.id, 'guardian.damage', day)));
  if (hpLeft === 0) throw invalidState('guardian_down');

  const agg = await opAgg(o);
  const { rate: luck } = await opLuck(o);
  const dream = await hasValidHonor(o, GOODS.dreamNet);
  const net = o.config.requireGoods(GOODS.dreamNet).effects;
  const sealRate = dream
    ? ((b.goodsId === GOODS.missileSpeed ? net.critSpeedGSRate : net.critGSRate) ?? 0)
    : 0;
  const input = {
    def,
    luckRate: luck,
    hitBonus: weather.hitRate ?? 0,
    critBonus: (agg.missileCritRate ?? 0) + (weather.missileCrit ?? 0),
    sealRate,
  };
  const shots: MissileResultDto['shots'] = [];
  let total = 0;
  let tickets = 0;
  let maps = 0;
  let seals = 0;
  let killed = false;
  for (let i = 0; i < Math.min(b.num, have) && !killed; i++) {
    const s = shoot(input, t, o.rng);
    total += s.damage;
    tickets += s.ticket;
    if (s.map) maps += 1;
    if (s.seal) seals += 1;
    hpLeft = Math.max(0, hpLeft - s.damage);
    killed = hpLeft === 0;
    shots.push({ hit: s.hit, crit: s.crit, damage: s.damage, killed });
  }
  await consumeGoods(o, b.goodsId, shots.length);
  await incrementDaily(o.tx, o.rest.id, 'guardian.damage', total, day);
  if (tickets > 0) await grantGoodsOp(o, GOODS.mysteryTicket, tickets);
  if (maps > 0) await grantGoodsOp(o, GOODS.mapNormal, maps);
  if (seals > 0) await grantGoodsOp(o, GOODS.seal, seals);

  const foods = new Map<number, number>();
  let rare: number | null = null;
  if (killed) {
    await incrementDaily(o.tx, o.rest.id, 'guardian.killed', 1, day);
    // 个人缺料倾向（问题记录 50）
    const needPick = await opNeedPick(o);
    if (o.rng.chance(t.guardianRareRate + luck / 4)) {
      rare = needPick(
        (id) => o.config.foods.get(id)?.level === 7,
        () => pickWeighted(o.config.foodPools.get(7)!, o.rng).id,
      );
      bump(foods, rare);
      opNews(o, 'temple.guardian.rare', { foodsId: rare });
    }
    for (const x of guardianFoods(t, o.rng))
      for (let k = 0; k < x.num; k++) bump(foods, pickFood(o, x.level, needPick));
  }
  await addFoodsMerged(o, foods);
  const dtTickets = await drawDtTickets(o, Math.floor(total / 100) * (dream ? 2 : 1));
  await emitAction(o, 'temple.missile');
  return {
    shots,
    hpMax,
    hpLeft,
    killed,
    drops: { tickets, maps, seals, dtTickets, rare, foods: toList(foods) },
  };
}

import { GOODS, type Tuning } from '@dt/config';
import { gameParts, type LotsDrawDto, type WeatherToolResultDto, type WeatherToolsDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps } from '../../core/deps';
import { invalidState, notEnough } from '../../core/errors';
import { opNews, restLog, type Op } from '../../core/op';
import { consumeGoods, countGoods } from '../store/goods';
import { cooldownError, setTownRest, townRest } from '../town/common';
import { goodsCounts } from '../town/exchange';
import { compassRow, drawLots, pickRow, WEATHER_TYPES } from './chain';
import { isNight } from './rules';
import type { WorldSnapshot } from './service';

/**
 * 司天罗盘、晴雨签（天气改版设计 §2）：盖一层天气 1 小时，不改底下的天气链。
 * 盖着的 1 小时里、有人摇了签还没选时，谁都不能再改（用户 2026-10-12）；两件共用每人 4 小时冷却
 */

const nightNow = (o: Op) => isNight(gameParts(o.now).hour, o.tuning.world);

/** 锁住本区服的 world_state 行，查全镇锁和我的冷却；两人同时用只有一个成功 */
async function lockAndCheck(o: Op): Promise<void> {
  const ws = await o.tx
    .selectFrom('world_state')
    .select(['cover_until', 'lot_until'])
    .where('shard_id', '=', o.shardId)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const locks = [ws.cover_until, ws.lot_until].filter((x): x is Date => x !== null && x > o.now);
  if (locks.length > 0) {
    const until = new Date(Math.max(...locks.map((x) => x.getTime())));
    throw cooldownError('weather_lock', until, o.now);
  }
  const tr = await townRest(o);
  if (tr.tool_at) {
    const until = new Date(tr.tool_at.getTime() + o.tuning.world.tool.cooldownHours * 3_600_000);
    if (until > o.now) throw cooldownError('weather_tool', until, o.now);
  }
}

async function useOne(o: Op, goodsId: number): Promise<void> {
  const have = await countGoods(o, goodsId);
  if (have < 1) throw notEnough('goods', 1, have, goodsId);
  await consumeGoods(o, goodsId, 1, { source: 'weather.tool' });
}

/** 盖上天气：写 world_state，发新闻、个人动态 */
async function cover(o: Op, s: WorldSnapshot, goodsId: number, to: number): Promise<WeatherToolResultDto> {
  const until = new Date(o.now.getTime() + o.tuning.world.tool.coverMinutes * 60_000);
  await o.tx
    .updateTable('world_state')
    .set({
      cover_weather_id: to,
      cover_until: until,
      cover_by: o.rest.id,
      cover_goods: goodsId,
      lot_by: null,
      lot_choices: null,
      lot_until: null,
      updated_at: o.now,
    })
    .where('shard_id', '=', o.shardId)
    .execute();
  opNews(o, 'weather.tool', { goodsId, from: s.weather.id, to });
  restLog(o, 'weather.tool', { goodsId, from: s.weather.id, to });
  return { from: s.weather.id, to, until: until.toISOString() };
}

/** 司天罗盘：选一类，只能选从当前自然天气转得过去的类；类内按 q × 阶梯抽，不出酸雨、冰冻 */
export async function compassUse(o: Op, s: WorldSnapshot, type: number): Promise<WeatherToolResultDto> {
  const row = compassRow(o.config.bundle.weatherChain, o.config.weather, s.natural.id, type, nightNow(o));
  if (row.size === 0) throw invalidState('compass_type', { type });
  await lockAndCheck(o);
  await useOne(o, GOODS.compass);
  const to = pickRow(row, o.rng)!;
  await setTownRest(o, { tool_at: o.now });
  await emitAction(o, 'weather.tool');
  return cover(o, s, GOODS.compass, to);
}

/** 晴雨签：摇出两支就扣签、开始冷却；lotsSec 秒内选，不选按第一支（world/service 的 settleLots） */
export async function lotsDraw(o: Op, s: WorldSnapshot): Promise<LotsDrawDto> {
  await lockAndCheck(o);
  const choices = drawLots(o.config.bundle.weatherChain, o.config.weather, s.natural.id, nightNow(o), o.rng);
  if (choices.length === 0) throw invalidState('no_weather');
  await useOne(o, GOODS.weatherLots);
  const until = new Date(o.now.getTime() + o.tuning.world.tool.lotsSec * 1000);
  await o.tx
    .updateTable('world_state')
    .set({ lot_by: o.rest.id, lot_choices: JSON.stringify(choices), lot_until: until, updated_at: o.now })
    .where('shard_id', '=', o.shardId)
    .execute();
  await setTownRest(o, { tool_at: o.now });
  await emitAction(o, 'weather.tool');
  return { choices, until: until.toISOString() };
}

/** 晴雨签：挑一支（只有摇签的人、在到时之前） */
export async function lotsPick(o: Op, s: WorldSnapshot, index: number): Promise<WeatherToolResultDto> {
  const ws = await o.tx
    .selectFrom('world_state')
    .select(['lot_by', 'lot_choices', 'lot_until'])
    .where('shard_id', '=', o.shardId)
    .forUpdate()
    .executeTakeFirstOrThrow();
  if (ws.lot_by !== o.rest.id || !ws.lot_until || ws.lot_until <= o.now || !ws.lot_choices?.length)
    throw invalidState('no_lots');
  const to = ws.lot_choices[index] ?? ws.lot_choices[0]!;
  return cover(o, s, GOODS.weatherLots, to);
}

export async function toolsView(
  d: GameDeps,
  restId: number,
  s: WorldSnapshot,
  tuning: Tuning,
  now: Date,
): Promise<WeatherToolsDto> {
  const t = tuning.world.tool;
  const have = await goodsCounts(d.db, restId, [GOODS.compass, GOODS.weatherLots], now);
  const tr = await d.db
    .selectFrom('town_rest')
    .select('tool_at')
    .where('rest_id', '=', restId)
    .executeTakeFirst();
  const ready = tr?.tool_at ? new Date(tr.tool_at.getTime() + t.cooldownHours * 3_600_000) : null;
  const locks = [s.cover?.until, s.lot?.until].filter((x): x is Date => !!x && x > now);
  const night = isNight(gameParts(now).hour, tuning.world);
  return {
    now: now.toISOString(),
    compass: have.get(GOODS.compass) ?? 0,
    lots: have.get(GOODS.weatherLots) ?? 0,
    compassGoodsId: GOODS.compass,
    lotsGoodsId: GOODS.weatherLots,
    readyAt: ready && ready > now ? ready.toISOString() : null,
    lockedUntil: locks.length > 0 ? new Date(Math.max(...locks.map((x) => x.getTime()))).toISOString() : null,
    pendingLots:
      s.lot && s.lot.by === restId ? { choices: s.lot.choices, until: s.lot.until.toISOString() } : null,
    compassOptions: WEATHER_TYPES.map((type) => ({
      type,
      weathers: [...compassRow(d.config.bundle.weatherChain, d.config.weather, s.natural.id, type, night)]
        .map(([id, p]) => ({ id, p }))
        .sort((a, b) => b.p - a.p || a.id - b.id),
    })),
    cooldownHours: t.cooldownHours,
    coverMinutes: t.coverMinutes,
    lotsSec: t.lotsSec,
  };
}

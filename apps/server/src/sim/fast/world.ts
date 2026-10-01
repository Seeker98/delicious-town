import type { GameConfig, Tuning } from '@dt/config';
import { gameParts, hashSeed, latestSlot, seededRng, type Rng } from '@dt/shared';
import { buildGlobals } from '../../modules/settlement/globals';
import type { SettleGlobals } from '../../modules/settlement/types';
import { rollKrabStreet, rollWeather } from '../../modules/world/rules';
import type { FastRest } from './state';

/** 模拟区服的世界状态（world/service.ts 的快照） */
export interface FastWorld {
  weather: Record<string, number>;
  weatherId: number;
  krabStreet: number | null;
  planktonRestId: number | null;
}

export function newWorld(config: GameConfig, tuning: Tuning, now: Date, rng: Rng): FastWorld {
  const w = rollWeather(config, gameParts(now).hour, tuning.world, rng);
  return {
    weather: w.effects,
    weatherId: w.id,
    krabStreet: rollKrabStreet(tuning.world, rng),
    planktonRestId: null,
  };
}

/**
 * 整点的第一轮：在天气时刻重掷天气，在巡街时刻重掷蟹老板的街（world/service.ts 的定时任务）。
 * 种子和真实定时任务完全相同（按区服 id 和时段），这样核对时两边看到同样的天气
 */
export function advanceWorld(
  w: FastWorld,
  config: GameConfig,
  tuning: Tuning,
  now: Date,
  shardId: number,
): void {
  const { hour, minute } = gameParts(now);
  if (minute >= 4) return;
  if (tuning.world.weatherHours.includes(hour)) {
    const slot = latestSlot(now, tuning.world.weatherHours);
    const x = rollWeather(config, slot.hour, tuning.world, seededRng(hashSeed(shardId, 'weather', slot.key)));
    w.weather = x.effects;
    w.weatherId = x.id;
  }
  if (hour === tuning.world.krabHour) {
    const slot = latestSlot(now, [tuning.world.krabHour]);
    w.krabStreet = rollKrabStreet(tuning.world, seededRng(hashSeed(shardId, 'krab', slot.key)));
  }
}

/** 痞老板没有落脚的店时，在一星以上、冷却已过的店里按 id 顺序随机挑一家（settleShardRound）；机器人不驱赶，选中后一直待着 */
export function pickPlankton(w: FastWorld, rests: FastRest[], now: Date, rng: Rng): void {
  if (w.planktonRestId !== null) return;
  const cands = rests
    .filter(
      (r) => r.state === 1 && r.star >= 1 && (!r.planktonCooldownUntil || r.planktonCooldownUntil <= now),
    )
    .sort((a, b) => a.id - b.id);
  if (cands.length > 0) w.planktonRestId = cands[rng.int(cands.length)]!.id;
}

export function globalsOf(w: FastWorld, config: GameConfig, tuning: Tuning, now: Date): SettleGlobals {
  return buildGlobals(config, tuning, {
    weather: w.weather,
    krabStreet: w.krabStreet,
    planktonRestId: w.planktonRestId,
    holidayMultiplier: config.holidayMultiplier(now),
    naturalRoach: true,
    bless: {},
  });
}

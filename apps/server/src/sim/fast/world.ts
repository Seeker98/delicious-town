import type { GameConfig, Tuning } from '@dt/config';
import { gameParts, type Rng } from '@dt/shared';
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

/** 整点的第一轮：在天气时刻重掷天气，在巡街时刻重掷蟹老板的街（world/service.ts 的定时任务） */
export function advanceWorld(
  w: FastWorld,
  config: GameConfig,
  tuning: Tuning,
  now: Date,
  rngFor: (tag: string) => Rng,
): void {
  const { day, hour, minute } = gameParts(now);
  if (minute >= 4) return;
  if (tuning.world.weatherHours.includes(hour)) {
    const x = rollWeather(config, hour, tuning.world, rngFor(`weather:${day}@${hour}`));
    w.weather = x.effects;
    w.weatherId = x.id;
  }
  if (hour === tuning.world.krabHour) w.krabStreet = rollKrabStreet(tuning.world, rngFor(`krab:${day}`));
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

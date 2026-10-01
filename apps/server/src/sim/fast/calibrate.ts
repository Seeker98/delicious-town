import { resolveShardSettings, type GameConfig } from '@dt/config';
import type { Persona } from '../bot';
import { runSim } from '../run';
import { compareCalibration, PERSONA_NAMES } from './metrics';
import { runFast } from './run';

export interface CalibrateOptions {
  adminUrl: string;
  redisUrl: string;
  bundlePath: string;
  days: number;
  seed: number;
  start: Date;
  /** 每种画像几个机器人，比较中位数（越多越稳，全真那边越慢） */
  bots: number;
}

const PERSONAS: Persona['key'][] = ['diligent', 'normal', 'casual'];
const FIELD: Record<string, string> = { level: '等级', star: '星级', coin: '银币', learned: '食谱' };

/**
 * 核对（快速模拟设计 §8）：同样天数和种子、每种画像 bots 个、不算旁支，
 * 快速模型和全真模拟器各跑一遍，逐天比较中位数；返回是否通过
 */
export async function calibrate(
  o: CalibrateOptions,
  config: GameConfig,
  log: (s: string) => void,
): Promise<boolean> {
  log('全真模拟器运行中（一次性库 dt_sim）…');
  const full = await runSim(
    {
      adminUrl: o.adminUrl,
      dbName: 'dt_sim',
      redisUrl: o.redisUrl,
      bundlePath: o.bundlePath,
      days: o.days,
      botsPerPersona: o.bots,
      personas: PERSONAS,
      seed: o.seed,
      start: o.start,
    },
    (m) => log(`  全真：${m}`),
  );
  const fast = runFast(
    '快速',
    {
      days: o.days,
      botsPerPersona: o.bots,
      personas: PERSONAS,
      seed: o.seed,
      start: o.start,
      tuning: resolveShardSettings(config, {}).tuning,
      side: null,
      stuckDays: 5,
    },
    config,
  );
  const { rows, pass } = compareCalibration(fast.days, full.days);
  log('天\t画像\t项目\t快速\t全真\t');
  for (const r of rows.filter((x) => x.day > 0))
    log(
      `${r.day}\t${PERSONA_NAMES[r.persona]}\t${FIELD[r.field]}\t${r.fast}\t${r.full}\t${r.ok ? '✓' : '✗'}`,
    );
  log(pass ? '通过' : '不通过：快速模型和游戏规则跑偏了，检查最近改过的结算或成长规则');
  return pass;
}

import { describe, expect, it } from 'vitest';
import { resolveShardSettings } from '@dt/config';
import { testConfig } from '../../../test/config';
import { runFast, type FastOptions } from './run';

const config = testConfig();
const tuning = resolveShardSettings(config, {}).tuning;
const opts = (patch: Partial<FastOptions> = {}): FastOptions => ({
  days: 2,
  botsPerPersona: 2,
  personas: ['diligent', 'normal', 'casual'],
  seed: 1,
  start: new Date('2026-10-01T16:00:00Z'),
  tuning,
  side: null,
  stuckDays: 5,
  ...patch,
});

describe('跑一套数值（设计 §4、§7）', () => {
  it('同样参数跑两次结果完全一样；起点和每天每个机器人各一行快照', () => {
    const a = runFast('基准', opts(), config);
    const b = runFast('基准', opts(), config);
    expect(a.days).toEqual(b.days);
    expect(a.days.filter((d) => d.day === 0)).toHaveLength(6);
    expect(a.days.filter((d) => d.day === 2)).toHaveLength(6);
  }, 60_000);

  it('只跑一种画像时，结果里没有其他画像（Review Focus 5）', () => {
    const r = runFast('基准', opts({ personas: ['diligent'], days: 1 }), config);
    expect(new Set(r.days.map((d) => d.persona))).toEqual(new Set(['diligent']));
    expect(Object.keys(r.income)).toEqual(['diligent']);
  }, 60_000);

  it('勤快玩家两天会升级，银币来自结算', () => {
    const r = runFast('基准', opts({ personas: ['diligent'], botsPerPersona: 1 }), config);
    const last = r.days.find((d) => d.day === 2)!;
    expect(last.level).toBeGreaterThan(1);
    expect(r.income.diligent!.settlement!.coin).toBeGreaterThan(0);
    expect(last.settleCoin).toBeGreaterThan(0);
  }, 60_000);
});

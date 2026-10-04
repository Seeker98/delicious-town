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
    // 银币流出按来源汇总（问题记录 240）：两天里至少会买菜
    expect(r.spend.diligent!['market.buy']).toBeGreaterThan(0);
  }, 60_000);
});

describe('卡点从"等级够了"那天算起（终审 I-1，和全真模拟的 detectStuck 一致）', () => {
  it('第 2 天升到 1 星、第 20 天等级才够：第 20 天不算卡住，第 25 天卡 5 天', async () => {
    const { trackStuck } = await import('./run');
    const t = { star: 0, since: null as number | null };
    expect(trackStuck(t, 0, 0, false, 5)).toBeNull();
    expect(trackStuck(t, 2, 1, false, 5)).toBeNull();
    expect(trackStuck(t, 19, 1, false, 5)).toBeNull();
    expect(trackStuck(t, 20, 1, true, 5)).toBeNull();
    expect(trackStuck(t, 24, 1, true, 5)).toBeNull();
    expect(trackStuck(t, 25, 1, true, 5)).toBe(5);
    // 升星后重新算
    expect(trackStuck(t, 26, 2, true, 5)).toBeNull();
    expect(trackStuck(t, 31, 2, true, 5)).toBe(5);
  });
});

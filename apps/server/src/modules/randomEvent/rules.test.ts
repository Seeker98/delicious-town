import { describe, expect, it } from 'vitest';
import type { RandomEventDef, RandomQuizDef } from '@dt/config';
import { gameTime } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  chainWeight,
  eventCandidates,
  quizCandidates,
  slotOf,
  whenCtx,
  whenMatches,
  type PastRow,
} from './rules';

const t = testConfig().tuning.randomEvents;
const ev = (id: number) => testConfig().randomEvents.get(id)!;

describe('随机事件规则（设计稿 §3、§6）', () => {
  it('时段: 4 小时一段, 带结束时间', () => {
    const s = slotOf(gameTime('2026-11-02', 13, 25), 4);
    expect(s.key).toBe('2026-11-02#3');
    expect(s.end.getTime()).toBe(gameTime('2026-11-02', 16, 0).getTime());
  });

  it('出现条件: 跨午夜的时段、星期、日期、天气、等级', () => {
    const c = whenCtx(gameTime('2026-11-05', 1, 0), 10, 5); // 周四凌晨 1 点、小雨
    expect(c).toMatchObject({ weekday: 4, month: 11, mmdd: '11-05' });
    expect(whenMatches({ hours: [20, 4] }, c)).toBe(true);
    expect(whenMatches({ hours: [16, 18] }, c)).toBe(false);
    expect(whenMatches({ weekdays: [4] }, c)).toBe(true);
    expect(whenMatches({ dates: ['11-01', '11-10'] }, c)).toBe(true);
    expect(whenMatches({ dates: ['12-20', '01-05'] }, c)).toBe(false);
    expect(whenMatches({ weather: [5] }, c)).toBe(false);
    expect(whenMatches({ minLevel: 10 }, c)).toBe(false);
  });

  it('连续剧: 前置选对了且隔够天数才出, 每多等一天加权重; 出过就不再出', () => {
    const past: PastRow[] = [{ kind: 'choice', refId: 111, choice: 'a', day: '2026-11-01', quizIds: [] }];
    expect(chainWeight(ev(112), past, '2026-11-01', t)).toBe(0); // 当天不出
    expect(chainWeight(ev(112), past, '2026-11-02', t)).toBe(10);
    expect(chainWeight(ev(112), past, '2026-11-04', t)).toBe(20);
    expect(chainWeight(ev(112), past, '2026-12-30', t)).toBe(t.chainWeightMax);
    expect(chainWeight(ev(151), past, '2026-11-02', t)).toBe(0); // 选的是 a，走不到 b 那条
    const done = [
      ...past,
      { kind: 'notice' as const, refId: 112, choice: null, day: '2026-11-03', quizIds: [] },
    ];
    expect(chainWeight(ev(112), done, '2026-11-05', t)).toBe(0);
    expect(chainWeight(ev(113), done, '2026-11-05', t)).toBeGreaterThan(0);
  });

  it('候选: 7 天内出过的不出; 新手不出减益', () => {
    const all = [...testConfig().randomEvents.values()];
    const c = whenCtx(gameTime('2026-11-02', 10, 0), 1, 5);
    const past: PastRow[] = [{ kind: 'notice', refId: 1, choice: null, day: '2026-10-27', quizIds: [] }];
    const ids = eventCandidates(all, past, c, '2026-11-02', t, { quizNight: true }).map((x) => x.e.id);
    expect(ids).not.toContain(1);
    expect(ids.every((id) => !ev(id).debuff)).toBe(true);
    const later = eventCandidates(all, past, c, '2026-11-03', t, { quizNight: true }).map((x) => x.e.id);
    expect(later).toContain(1);
  });

  it('题: 知识题答过不再出, 全答过从最早答的重出; 选择题 14 天内不重出', () => {
    const quiz: RandomQuizDef[] = [
      { id: 1, type: 'game', q: 'q', choices: ['a', 'b'], answer: 0, recheck: false },
      { id: 2, type: 'fact', q: 'q', choices: ['a', 'b'], answer: 0, recheck: false, year: 2026 },
      { id: 3, type: 'opinion', q: 'q', choices: ['a', 'b'], results: [{}, {}], recheck: false },
    ];
    const row = (refId: number, day: string): PastRow => ({
      kind: 'quiz',
      refId,
      choice: '0',
      day,
      quizIds: [],
    });
    const ids = (past: PastRow[], only: 'any' | 'knowledge' = 'any') =>
      quizCandidates(quiz, past, '2026-11-20', t, only).map((q) => q.id);
    expect(ids([row(1, '2026-11-01')])).toEqual([2, 3]);
    expect(ids([row(1, '2026-11-01'), row(2, '2026-11-02'), row(3, '2026-11-10')])).toEqual([1]);
    expect(ids([row(3, '2026-11-06')])).toEqual([1, 2, 3]);
    // 问答夜答过的也算
    expect(
      ids([{ kind: 'quizNight', refId: 40, choice: null, day: '2026-11-01', quizIds: [1] }], 'knowledge'),
    ).toEqual([2]);
  });

  it('所有事件的出现条件都能在某个时刻满足 (防止写错的时段让事件永远出不来)', () => {
    const e: RandomEventDef[] = [...testConfig().randomEvents.values()];
    for (const x of e) {
      const w = x.when;
      if (!w) continue;
      const hour = w.hours ? w.hours[0] : 12;
      const day = w.dates ? `2026-${w.dates[0]}` : '2026-11-05';
      const c = { ...whenCtx(gameTime(day, hour, 0), w.weather?.[0] ?? 1, 99) };
      if (w.weekdays) c.weekday = w.weekdays[0]!;
      if (w.months) c.month = w.months[0]!;
      expect(whenMatches(w, c), `event ${x.id}`).toBe(true);
    }
  });
});

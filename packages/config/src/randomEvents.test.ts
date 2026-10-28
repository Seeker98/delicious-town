import { describe, expect, it } from 'vitest';
import {
  buildRandomContent,
  eventLines,
  eventTexts,
  hasDebuff,
  rawRandomEvent,
  rawRandomQuiz,
} from './randomEvents';
import { realBuild } from './testBundle';

describe('随机事件和问答（设计稿 2026-10-28）', () => {
  const b = realBuild().bundle!;

  it('第一批: 40 个事件 (食评家第二段分两条) 和 30 道题', () => {
    expect(b.randomEvents).toHaveLength(41);
    expect(b.randomQuiz).toHaveLength(30);
  });

  it('带减益的事件构建时自动标出来', () => {
    const ev = (id: number) => b.randomEvents.find((e) => e.id === id)!;
    expect(ev(1).debuff).toBe(false);
    expect(ev(2).debuff).toBe(true); // 上座率 -5%
    expect(ev(34).debuff).toBe(true); // 耗油 +10%
    expect(ev(3).debuff).toBe(true); // 选项 a 挑剔率 +10%
    expect(hasDebuff({ spRate: -0.1, taNeedtimeRate: -0.2 })).toBe(false);
  });

  /**
   * 游戏知识题的答案要和现在的天气数据一致（2026-10-28：样例里有题还写着早已删掉的卖艺男孩）。
   * 天气数据改了这里会失败：改题目或删题
   */
  it('天气题: 正确选项在这一项上严格最大 (或最小)', () => {
    const weather = new Map(b.weather.map((w) => [w.name, w.effects as Record<string, number>]));
    const cases: Array<[number, string, 'max' | 'min']> = [
      [1, 'foodsOperRate', 'max'],
      [2, 'marketCoin', 'min'],
      [3, 'expRate', 'max'],
      [13, 'shilingRate', 'max'],
      [14, 'equipRate', 'max'],
      [15, 'spRate', 'min'],
      [17, 'mcGoldRate', 'max'],
    ];
    for (const [id, key, dir] of cases) {
      const q = b.randomQuiz.find((x) => x.id === id)!;
      const values = q.choices.map((c) => {
        const w = weather.get(c);
        expect(w, `quiz ${id}: 没有叫“${c}”的天气`).toBeDefined();
        return (w![key] ?? 0) * (dir === 'max' ? 1 : -1);
      });
      const best = values[q.answer!]!;
      values.forEach((v, i) => {
        if (i !== q.answer) expect(v, `quiz ${id} 选项 ${q.choices[i]}`).toBeLessThan(best);
      });
    }
    // 血月多出来的是蟑螂
    expect(weather.get('血月')!.roachRate).toBeGreaterThan(0);
  });

  it('现实题都写了年份', () => {
    for (const q of b.randomQuiz.filter((x) => x.type === 'fact'))
      expect(q.year, `quiz ${q.id}`).toBeDefined();
  });

  it('译文按摊平的顺序还原；条数不对时整段用原文', () => {
    const e = b.randomEvents.find((x) => x.id === 3)!;
    const src = eventLines(e);
    expect(src).toHaveLength(4); // 两个选项，各一个名字、一个结果
    const t = eventTexts(e, { name: 'T', desc: 'D', lines: ['a', 'a1', 'b', 'b1'] });
    expect(t).toMatchObject({
      title: 'T',
      body: 'D',
      outcome: null,
      options: [
        { key: 'a', label: 'a', outcomes: ['a1'] },
        { key: 'b', label: 'b', outcomes: ['b1'] },
      ],
    });
    expect(eventTexts(e, { lines: ['x'] }).options[0]!.label).toBe(src[0]);
  });

  it('校验: 数值越界、前置不存在、选择题没写各选项结果、知识题答案越界都报错', () => {
    const errors: string[] = [];
    const ev = (x: unknown) => rawRandomEvent.parse(x);
    buildRandomContent(
      [
        ev({
          id: 1,
          kind: 'notice',
          title: 't',
          body: 'b',
          outcome: { text: 'x', effects: { atRate: 0.3 }, hours: 1 },
        }),
        ev({
          id: 2,
          kind: 'notice',
          title: 't',
          body: 'b',
          outcome: { text: 'x', effects: { atRate: -0.1 }, hours: 1 },
        }),
        ev({ id: 3, kind: 'notice', title: 't', body: 'b', after: { events: [99] }, outcome: { text: 'x' } }),
        ev({
          id: 4,
          kind: 'notice',
          title: 't',
          body: 'b',
          outcome: { text: 'x', effects: { spRate: 0.1 } },
        }),
      ],
      [
        rawRandomQuiz.parse({ id: 1, type: 'opinion', q: 'q', choices: ['a', 'b'] }),
        rawRandomQuiz.parse({ id: 2, type: 'game', q: 'q', choices: ['a', 'b'], answer: 2 }),
        rawRandomQuiz.parse({ id: 3, type: 'fact', q: 'q', choices: ['a', 'b'], answer: 0 }),
      ],
      { weatherIds: new Set([1]) },
      errors,
    );
    expect(errors).toEqual([
      'random_events 1 outcome 0: atRate 0.3 out of range',
      'random_events 2 outcome 0: atRate debuff below -0.05',
      'random_events 3: after unknown event 99',
      'random_events 4 outcome 0: effects need hours',
      'random_quiz 1: results must match choices',
      'random_quiz 2: answer out of range',
      'random_quiz 3: fact quiz needs year',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { ACTIVITY_ACTIONS } from '../activity';
import { activityBody } from './activity';

const award = { coin: 100 };
const base = {
  shardId: 1,
  title: '国庆签到',
  body: '签到领礼',
  startsAt: '2026-10-01T00:00:00.000Z',
  endsAt: '2026-10-08T00:00:00.000Z',
  minLevel: 1,
};
const goal = (key = 'signin', target = 1) => ({ key, target, award });
const paths = (b: unknown) => {
  const r = activityBody.safeParse(b);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}:${i.message}`);
};

describe('活动定义校验（设计 §3.2）', () => {
  it('签到在可选行为里，名字是中文', () => {
    expect(ACTIVITY_ACTIONS.signin).toBe('签到');
    expect(ACTIVITY_ACTIONS['market.buy']).toBe('菜场买菜');
  });

  it('目标清单：合法的能过，类型化成 goals', () => {
    const r = activityBody.parse({ ...base, kind: 'goals', def: { goals: [goal('signin', 3)] } });
    expect(r.kind).toBe('goals');
    expect(r.def).toEqual({ goals: [goal('signin', 3)] });
  });

  it('结束不晚于开始、行为键不在列表、次数为 0 都报错，路径带 def', () => {
    expect(paths({ ...base, endsAt: base.startsAt, kind: 'goals', def: { goals: [goal()] } })).toContain(
      'endsAt:before_start',
    );
    expect(paths({ ...base, kind: 'goals', def: { goals: [goal('nope')] } })).toContain(
      'def.goals.0.key:unknown_action',
    );
    expect(paths({ ...base, kind: 'goals', def: { goals: [goal('signin', 0)] } })[0]).toMatch(
      /^def\.goals\.0\.target:/,
    );
  });

  it('九宫格：格子数要等于尺寸平方', () => {
    const cells = Array.from({ length: 8 }, () => goal());
    expect(
      paths({ ...base, kind: 'grid', def: { size: 3, cells, lineAward: award, fullAward: award } }),
    ).toContain('def.cells:cell_count');
    const ok = Array.from({ length: 16 }, () => goal());
    expect(
      paths({ ...base, kind: 'grid', def: { size: 4, cells: ok, lineAward: award, fullAward: award } }),
    ).toEqual([]);
  });

  it('战令：积分不递增、一档两边都空、规则行为重复、解锁价格全空都报错', () => {
    const pass = (patch: Record<string, unknown>) => ({
      ...base,
      kind: 'pass',
      def: {
        rules: [{ key: 'signin', points: 10, dailyCap: 10 }],
        levels: [
          { points: 10, free: award, premium: null },
          { points: 20, free: null, premium: award },
        ],
        unlock: { diamond: 100 },
        ...patch,
      },
    });
    expect(paths(pass({}))).toEqual([]);
    expect(
      paths(
        pass({
          levels: [
            { points: 20, free: award, premium: null },
            { points: 20, free: award, premium: null },
          ],
        }),
      ),
    ).toContain('def.levels.1.points:not_increasing');
    expect(paths(pass({ levels: [{ points: 10, free: null, premium: null }] }))).toContain(
      'def.levels.0:empty_level',
    );
    expect(
      paths(
        pass({
          rules: [
            { key: 'signin', points: 1, dailyCap: 1 },
            { key: 'signin', points: 2, dailyCap: 2 },
          ],
        }),
      ),
    ).toContain('def.rules:duplicate_key');
    expect(paths(pass({ unlock: {} }))).toContain('def.unlock:empty_price');
  });
});

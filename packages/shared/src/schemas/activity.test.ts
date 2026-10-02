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

describe('全服加成定义（148-4 设计 §5）', () => {
  const boost = (items: Array<{ key: string; factor: number }>) => ({
    ...base,
    kind: 'boost',
    def: { items },
  });
  it('合法的能过；边界值能过', () => {
    expect(paths(boost([{ key: 'exp', factor: 5 }]))).toEqual([]);
    expect(paths(boost([{ key: 'marketPrice', factor: 0.5 }]))).toEqual([]);
  });
  it('超出范围、未知键、重复键、多于两位小数、全部为 1 都报错并带路径', () => {
    expect(paths(boost([{ key: 'exp', factor: 5.01 }]))).toContain('def.items.0.factor:out_of_range');
    expect(paths(boost([{ key: 'marketPrice', factor: 0.49 }]))).toContain('def.items.0.factor:out_of_range');
    expect(paths(boost([{ key: 'nope', factor: 2 }]))).toContain('def.items.0.key:unknown_boost');
    expect(
      paths(
        boost([
          { key: 'exp', factor: 2 },
          { key: 'exp', factor: 3 },
        ]),
      ),
    ).toContain('def.items:duplicate_key');
    expect(paths(boost([{ key: 'exp', factor: 1.234 }]))).toContain('def.items.0.factor:two_decimals');
    expect(paths(boost([{ key: 'exp', factor: 1 }]))).toContain('def.items:no_effect');
  });
  it('boostText 用中文名和倍数', async () => {
    const { boostText } = await import('../boost');
    expect(
      boostText([
        { key: 'exp', factor: 2 },
        { key: 'marketPrice', factor: 0.8 },
      ]),
    ).toBe('经营经验 ×2、菜场价格 ×0.8');
  });
});

describe('终审 I1：全服加成对所有等级生效', () => {
  it('全服加成的最低等级只能是 1', () => {
    const b = { ...base, kind: 'boost', def: { items: [{ key: 'exp', factor: 2 }] } };
    expect(paths({ ...b, minLevel: 30 })).toContain('minLevel:boost_all_levels');
    expect(paths({ ...b, minLevel: 1 })).toEqual([]);
  });
});

describe('兑换活动定义（148-2 设计 §3）', () => {
  const award = { coin: 1 };
  const def = (patch: Record<string, unknown> = {}) => ({
    currencies: [{ name: '福' }, { name: '禄' }],
    drops: [{ key: 'market.buy', chance: 0.05, currency: 0, num: 1, dailyCap: 10 }],
    shop: [
      {
        cost: [
          { currency: 0, num: 1 },
          { currency: 1, num: 1 },
        ],
        award,
        limit: 3,
      },
    ],
    graceHours: 24,
    ...patch,
  });
  const ex = (patch: Record<string, unknown> = {}) => ({ ...base, kind: 'exchange', def: def(patch) });
  it('合法的能过', () => {
    expect(paths(ex())).toEqual([]);
  });
  it('货币名为空、超长、重名都报错', () => {
    expect(paths(ex({ currencies: [{ name: '' }] }))[0]).toMatch(/^def\.currencies\.0\.name:/);
    expect(paths(ex({ currencies: [{ name: '一二三四五六七' }] }))[0]).toMatch(/^def\.currencies\.0\.name:/);
    expect(paths(ex({ currencies: [{ name: '福' }, { name: '福' }] }))).toContain(
      'def.currencies:duplicate_name',
    );
  });
  it('引用不存在的货币、概率越界或超过 4 位小数、消耗为空或重复都报错', () => {
    expect(
      paths(ex({ drops: [{ key: 'market.buy', chance: 0.05, currency: 5, num: 1, dailyCap: 1 }] })),
    ).toContain('def.drops.0.currency:no_currency');
    expect(
      paths(ex({ drops: [{ key: 'market.buy', chance: 0, currency: 0, num: 1, dailyCap: 1 }] }))[0],
    ).toMatch(/^def\.drops\.0\.chance:/);
    expect(
      paths(ex({ drops: [{ key: 'market.buy', chance: 0.00001, currency: 0, num: 1, dailyCap: 1 }] })),
    ).toContain('def.drops.0.chance:four_decimals');
    expect(paths(ex({ shop: [{ cost: [], award, limit: 1 }] }))[0]).toMatch(/^def\.shop\.0\.cost:/);
    expect(
      paths(
        ex({
          shop: [
            {
              cost: [
                { currency: 0, num: 1 },
                { currency: 0, num: 2 },
              ],
              award,
              limit: 1,
            },
          ],
        }),
      ),
    ).toContain('def.shop.0.cost:duplicate_currency');
    expect(paths(ex({ shop: [{ cost: [{ currency: 9, num: 1 }], award, limit: 1 }] }))).toContain(
      'def.shop.0.cost.0.currency:no_currency',
    );
  });
  it('兑换期默认 24 小时', () => {
    const { graceHours, ...rest } = def();
    void graceHours;
    const r = activityBody.parse({ ...base, kind: 'exchange', def: rest });
    expect((r.def as { graceHours: number }).graceHours).toBe(24);
  });
});

describe('全服合力定义（148-3 设计 §3）', () => {
  const award = { coin: 1 };
  const def = (patch: Record<string, unknown> = {}) => ({
    rules: [{ key: 'market.buy', points: 10, dailyCap: 100 }],
    milestones: [
      { target: 100, minContribution: 0, award },
      { target: 500, minContribution: 20, award },
    ],
    ranks: [
      { from: 1, to: 1, award },
      { from: 2, to: 3, award },
    ],
    ...patch,
  });
  const co = (patch: Record<string, unknown> = {}) => ({ ...base, kind: 'coop', def: def(patch) });
  it('合法的能过；名次段可以为空', () => {
    expect(paths(co())).toEqual([]);
    expect(paths(co({ ranks: [] }))).toEqual([]);
  });
  it('目标分不递增、名次段颠倒或重叠、超过 100 名、规则行为重复都报错', () => {
    expect(
      paths(
        co({
          milestones: [
            { target: 100, minContribution: 0, award },
            { target: 100, minContribution: 0, award },
          ],
        }),
      ),
    ).toContain('def.milestones.1.target:not_increasing');
    expect(paths(co({ ranks: [{ from: 3, to: 2, award }] }))).toContain('def.ranks.0.to:bad_range');
    expect(
      paths(
        co({
          ranks: [
            { from: 1, to: 3, award },
            { from: 3, to: 5, award },
          ],
        }),
      ),
    ).toContain('def.ranks.1.from:overlap');
    expect(paths(co({ ranks: [{ from: 1, to: 101, award }] }))[0]).toMatch(/^def\.ranks\.0\.to:/);
    expect(
      paths(
        co({
          rules: [
            { key: 'signin', points: 1, dailyCap: 1 },
            { key: 'signin', points: 2, dailyCap: 2 },
          ],
        }),
      ),
    ).toContain('def.rules:duplicate_key');
  });
});

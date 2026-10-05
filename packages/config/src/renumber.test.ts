import { describe, expect, it } from 'vitest';
import { patchJsonText, rewriteIds, TUNING_ID_PATHS, type IdMaps } from './renumber';
import { tuningRefs } from './itemRefs';
import { realBuild } from './testBundle';

const maps: IdMaps = {
  goods: new Map([
    [1, 10001],
    [87, 60301],
    [108, 60401],
    [110, 60402],
  ]),
  foods: new Map([
    [101, 1001],
    [467, 9001],
  ]),
  cookbooks: new Map([[1, 106001]]),
};
const run = (v: unknown, opts?: Parameters<typeof rewriteIds>[2]) => rewriteIds(v, maps, opts);

describe('按键名改写编号（重新编号 PR 4）', () => {
  it('键名、列表、带种类的对象都换；数量、等级、街道这些同名旁边的数字不换', () => {
    const r = run({
      goodsId: 1,
      num: 101,
      level: 1,
      items: { goods: [{ id: 1, num: 87 }], foods: [{ id: 101, num: 1 }], coin: 1 },
      rewards: [
        { kind: 'goods', id: 87, num: 1 },
        { kind: 'coin', id: null, num: 5 },
      ],
      award: { kind: 'foods', itemId: 467, num: 2 },
      foods: [101, 467],
      log: { foodsId: 101, cookbookId: 1, from: 1, to: 1 },
    });
    expect(r.value).toEqual({
      goodsId: 10001,
      num: 101,
      level: 1,
      items: { goods: [{ id: 10001, num: 87 }], foods: [{ id: 1001, num: 1 }], coin: 1 },
      rewards: [
        { kind: 'goods', id: 60301, num: 1 },
        { kind: 'coin', id: null, num: 5 },
      ],
      award: { kind: 'foods', itemId: 9001, num: 2 },
      foods: [1001, 9001],
      log: { foodsId: 1001, cookbookId: 106001, from: 1, to: 1 },
    });
    expect(r.orphans).toEqual([]);
  });

  it('列表元素是 [编号, 数量] 时只换第 0 个；列表键的值不是数组时不管', () => {
    const r = run({ featureReward: { goods: [[1, 87]] }, awardRates: { goods: 0.2, foods: 0.5 } });
    expect(r.value).toEqual({
      featureReward: { goods: [[10001, 87]] },
      awardRates: { goods: 0.2, foods: 0.5 },
    });
  });

  it('礼包里 type 写种类：id 为 0（随机）不换；同一个字段不会换两次', () => {
    const r = run({
      gift: [
        { type: 'goods', id: 1, num: 20, rate: 1 },
        { type: 'goods', id: 0, level: 7, num: 1, rate: 0.2 },
      ],
      goods: [{ kind: 'goods', id: 1, num: 1 }],
    });
    expect(r.value).toEqual({
      gift: [
        { type: 'goods', id: 10001, num: 20, rate: 1 },
        { type: 'goods', id: 0, level: 7, num: 1, rate: 0.2 },
      ],
      goods: [{ kind: 'goods', id: 10001, num: 1 }],
    });
  });

  it('对照表里没有、也不在新号段的记为 orphans，原样保留；已在新号段的不动', () => {
    const r = run({ goodsId: 999, foodsId: 1001, cookbookId: 51 });
    expect(r.value).toEqual({ goodsId: 999, foodsId: 1001, cookbookId: 51 });
    expect(r.orphans).toEqual([
      { kind: 'goods', id: 999, path: ['goodsId'] },
      { kind: 'cookbooks', id: 51, path: ['cookbookId'] },
    ]);
  });

  it('按位置的规则（* 是任意下标或键）和只对这一处生效的键名', () => {
    const r = run(
      { data: [{ id: 1, type: 3 }], figures: { A: 1 }, give: 101, take: 467 },
      {
        paths: [
          [['data', '*', 'id'], 'goods'],
          [['figures', '*'], 'goods'],
        ],
        keys: { give: 'foods', take: 'foods' },
      },
    );
    expect(r.value).toEqual({
      data: [{ id: 10001, type: 3 }],
      figures: { A: 10001 },
      give: 1001,
      take: 9001,
    });
    expect([...r.edits]).toEqual([
      ['["data",0,"id"]', 10001],
      ['["figures","A"]', 10001],
      ['["give"]', 1001],
      ['["take"]', 9001],
    ]);
  });

  it('按位置认的对象键（交易所参考价覆盖按食材编号做键）：键换成新编号，查不到的记 orphans', () => {
    const r = run(
      { exchange: { refOverrides: { '101': 5000, '1002': 7, '999': 1 } } },
      { keyPaths: [[['exchange', 'refOverrides'], 'foods']] },
    );
    expect(r.value).toEqual({ exchange: { refOverrides: { '1001': 5000, '1002': 7, '999': 1 } } });
    expect(r.orphans).toEqual([{ kind: 'foods', id: 999, path: ['exchange', 'refOverrides', '999'] }]);
  });

  it('不改传进来的对象', () => {
    const input = { goodsId: 1 };
    run(input);
    expect(input).toEqual({ goodsId: 1 });
  });
});

describe('按路径替换 JSON 文本里的数字（保留排版）', () => {
  it('只换指定位置，空格、换行、键顺序原样', () => {
    const text = '{\n  "a": [ 1, {"goodsId":87} ],\n "b" : -2.5e3, "c": "1"\n}\n';
    const out = patchJsonText(
      text,
      new Map([
        ['["a",0]', 10001],
        ['["a",1,"goodsId"]', 60301],
      ]),
    );
    expect(out).toBe('{\n  "a": [ 10001, {"goodsId":60301} ],\n "b" : -2.5e3, "c": "1"\n}\n');
  });

  it('有没用上的路径时报错（防止规则和文件对不上）', () => {
    expect(() => patchJsonText('{"a":1}', new Map([['["b"]', 2]]))).toThrow('["b"]');
  });

  it('字符串里的转义引号、括号不影响定位', () => {
    const text = '{"s":"a\\"]}[","n":1}';
    expect(patchJsonText(text, new Map([['["n"]', 2]]))).toBe('{"s":"a\\"]}[","n":2}');
  });
});

describe('区服数值里的编号（TUNING_ID_PATHS）', () => {
  it('和 tuningRefs 认的编号一一对应：改写后引用的编号正好是原编号的对照，别的数字一个没动', () => {
    const t = realBuild().bundle!.tuning;
    const before = tuningRefs(t);
    const shift = (ids: Iterable<number>) =>
      new Map([...ids].map((id) => [id, id + 1_000_000] as [number, number]));
    const all: IdMaps = {
      goods: shift(before.filter((r) => r.kind === 'goods').map((r) => r.id)),
      foods: shift(before.filter((r) => r.kind === 'foods').map((r) => r.id)),
      cookbooks: new Map(),
    };
    const r = rewriteIds(t, all, { paths: TUNING_ID_PATHS });
    const after = tuningRefs(r.value as typeof t);
    expect(after.map((x) => `${x.kind} ${x.id} ${x.where}`)).toEqual(
      before.map((x) => `${x.kind} ${x.id + 1_000_000} ${x.where}`),
    );
    expect(r.edits.size).toBe(before.length);
    expect(r.orphans).toEqual([]);
  });
});

describe('tuningRefs', () => {
  it('商店可丢弃的道具也算引用（下架检查要看到）', () => {
    const t = realBuild().bundle!.tuning;
    expect(
      tuningRefs(t)
        .filter((r) => r.where === '商店丢弃')
        .map((r) => r.id),
    ).toEqual(t.shop.discardable);
  });
});

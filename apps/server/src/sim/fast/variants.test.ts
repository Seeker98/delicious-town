import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/config';
import { EventEmitter } from 'node:events';
import { buildVariants, runVariants, watchWorker } from './variants';

const config = testConfig();
const base = config.tuning;
const none = () => ({});

describe('多套数值（设计 §6）', () => {
  it('--set 生成"路径=值"命名的几套，基准在第一个；路径可以带或不带 tuning. 前缀', () => {
    const vs = buildVariants(config, { variants: [], set: 'settlement.expMultiplier=4,5' }, none);
    expect(vs.map((v) => v.name)).toEqual([
      '基准',
      'settlement.expMultiplier=4',
      'settlement.expMultiplier=5',
    ]);
    expect(vs[1]!.tuning.settlement.expMultiplier).toBe(4);
    const vs2 = buildVariants(config, { variants: [], set: 'tuning.settlement.expMultiplier=7' }, none);
    expect(vs2[1]!.tuning.settlement.expMultiplier).toBe(7);
  });

  it('--variant 读覆盖文件，深合并后校验；不合法时报错并带上名字', () => {
    const ok = buildVariants(config, { variants: ['快=a.json'] }, () => ({
      tuning: { settlement: { expMultiplier: 9 } },
    }));
    expect(ok[1]!.name).toBe('快');
    expect(ok[1]!.tuning.settlement.expMultiplier).toBe(9);
    expect(ok[1]!.tuning.market).toEqual(base.market);
    expect(() =>
      buildVariants(config, { variants: ['坏=b.json'] }, () => ({
        tuning: { settlement: { expMultiplier: 'x' } },
      })),
    ).toThrow(/坏/);
  });

  it('超过 8 套时报错', () => {
    expect(() =>
      buildVariants(config, { variants: [], set: 'settlement.expMultiplier=1,2,3,4,5,6,7,8' }, none),
    ).toThrow(/8/);
  });

  it('两套数值一样时结果也一样（Review Focus 1，公共随机数）', async () => {
    const vs = buildVariants(
      config,
      { variants: [], set: `settlement.expMultiplier=${base.settlement.expMultiplier}` },
      none,
    );
    const rs = await runVariants(
      vs,
      {
        days: 1,
        botsPerPersona: 1,
        personas: ['diligent'],
        seed: 3,
        start: new Date('2026-10-01T16:00:00Z'),
        side: null,
        stuckDays: 5,
      },
      config,
      false,
    );
    expect(rs[1]!.days).toEqual(rs[0]!.days);
  }, 60_000);
});

describe('写错的覆盖要报错，不能悄悄当成"没影响"（终审 I-2）', () => {
  it('--set 的路径不存在时报错', () => {
    expect(() => buildVariants(config, { variants: [], set: 'settlement.expMultiplir=4' }, none)).toThrow(
      /settlement\.expMultiplir/,
    );
  });

  it('覆盖文件里有不存在的数值、少了 tuning 外层、或有 tuning 以外的键时报错', () => {
    expect(() =>
      buildVariants(config, { variants: ['a=x.json'] }, () => ({ tuning: { settlement: { nope: 1 } } })),
    ).toThrow(/settlement\.nope/);
    expect(() =>
      buildVariants(config, { variants: ['b=x.json'] }, () => ({ settlement: { expMultiplier: 4 } })),
    ).toThrow(/tuning/);
    expect(() =>
      buildVariants(config, { variants: ['c=x.json'] }, () => ({ tuning: {}, restaurant: { coin: 1 } })),
    ).toThrow(/restaurant/);
  });

  it('覆盖成和当前一样的值不算错（公共随机数测试要用）', () => {
    expect(() =>
      buildVariants(
        config,
        { variants: [], set: `settlement.expMultiplier=${base.settlement.expMultiplier}` },
        none,
      ),
    ).not.toThrow();
  });
});

describe('backlog 快速模拟：--set 可以写多次、线程没发回结果', () => {
  it('写两次 --set：两组都加进来', () => {
    const vs = buildVariants(
      config,
      { variants: [], set: ['settlement.expMultiplier=4', 'market.dailyKinds=6'] },
      none,
    );
    expect(vs.map((v) => v.name)).toEqual(['基准', 'settlement.expMultiplier=4', 'market.dailyKinds=6']);
  });

  it('线程正常退出却没发回结果：报错，不会一直卡住', async () => {
    const w = new EventEmitter();
    const p = watchWorker(w, '基准', () => {});
    w.emit('exit', 0);
    await expect(p).rejects.toThrow('没有发回结果');
  });

  it('线程发回结果后退出：拿到结果', async () => {
    const w = new EventEmitter();
    const p = watchWorker(w, '基准', () => {});
    w.emit('message', { kind: 'done', result: { name: '基准' } });
    w.emit('exit', 0);
    await expect(p).resolves.toMatchObject({ name: '基准' });
  });
});

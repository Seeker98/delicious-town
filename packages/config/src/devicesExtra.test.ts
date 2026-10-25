import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { artBreedOf, artEffectsOf, GOODS_TYPE } from './ids';
import { defaultDataDir, readSourceDir } from './source';
import { gid } from './testItems';

const source = () => readSourceDir(defaultDataDir());

/** 后期加的 4 张海报、4 个奖杯（问题记录 146） */
const POSTERS = () =>
  [
    '13 哥宣传海报',
    '镇长宣传海报',
    '蟹老板宣传海报',
    '食神宣传海报',
    '小镇食神奖杯(铂金)',
    '小镇食神奖杯(钻石)',
    '小镇食神奖杯(星耀)',
    '小镇食神奖杯(传说)',
  ].map(gid);

describe('更多宣传海报和奖杯（问题记录 146）', () => {
  it('8 个新道具：设施、设施位、效果、24 小时、价格、需要星级；不进随机奖励池', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const rows = POSTERS().map((id) => {
      const g = bundle!.goods.find((x) => x.id === id)!;
      return [g.type, g.deviceType, g.effects, g.coin, g.onSale, g.needStar, g.awardFlag, g.level];
    });
    expect(rows).toEqual([
      [GOODS_TYPE.device, 1, { time: 24, coinValue: 8 }, 40000, true, 4, null, 4],
      [GOODS_TYPE.device, 1, { time: 24, coinValue: 15 }, 70000, true, 6, null, 5],
      [GOODS_TYPE.device, 1, { time: 24, coinValue: 30 }, 120000, true, 8, null, 6],
      [GOODS_TYPE.device, 1, { time: 24, coinValue: 50 }, 240000, true, 10, null, 7],
      [GOODS_TYPE.device, 2, { time: 24, expValue: 4 }, 40000, true, 4, null, 4],
      [GOODS_TYPE.device, 2, { time: 24, expValue: 5 }, 60000, true, 6, null, 5],
      [GOODS_TYPE.device, 2, { time: 24, expValue: 6 }, 80000, true, 8, null, 6],
      [GOODS_TYPE.device, 2, { time: 24, expValue: 7 }, 150000, true, 10, null, 7],
    ]);
    // 现有的普通海报照旧：同样的效果格式，没有星级门槛
    expect(bundle!.goods.find((g) => g.id === gid('普通宣传海报'))).toMatchObject({
      effects: { time: 24, coinValue: 2 },
    });
    expect(
      bundle!.goods
        .filter((g) => !POSTERS().includes(g.id) && !(g.id >= 30600 && g.id < 30800))
        .every((g) => g.needStar === undefined),
    ).toBe(true);
  });

  it('检查：星级越界、设施位不对、id 重复', () => {
    const src = source();
    const goods = structuredClone(src['master/goods']) as Array<Record<string, unknown>>;
    const posters = goods.filter((g) => g.src === 'poster');
    posters[0]!.needStar = 13;
    posters[1]!.deviceType = 6;
    posters[2]!.id = gid('普通宣传海报');
    // 负数星级（质量期 ②）
    posters[3]!.needStar = -1;
    const errs = buildBundle({ ...src, 'master/goods': goods }).errors.join('\n');
    expect(errs).toContain(`goods ${posters[0]!.id as number} needStar 13`);
    expect(errs).toContain(`goods ${gid('食神宣传海报')} needStar -1`);
    expect(errs).toContain(`goods ${posters[1]!.id as number} poster deviceType 6`);
    expect(errs).toContain(`goods: duplicate id ${gid('普通宣传海报')}`);
  });
});

describe('艺术品设施（乐台、屏风，2026-10-17）', () => {
  it('两个设施位 1 星开；18 件 24 小时的道具；8 件银币店、4 件只在黑市、其余没有渠道；软上限两组 2 星可用', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const b = bundle!;
    expect(b.devices.filter((d) => d.id >= 10)).toEqual([
      expect.objectContaining({ id: 10, name: '乐台', deviceType: 7, needStar: 1 }),
      expect.objectContaining({ id: 11, name: '屏风', deviceType: 8, needStar: 1 }),
    ]);
    const art = b.goods.filter((g) => g.id >= 30600 && g.id < 30800);
    expect(art).toHaveLength(19);
    for (const g of art) {
      expect(g.type).toBe(GOODS_TYPE.device);
      expect(g.effects.time).toBe(24);
    }
    const coin = Object.fromEntries(art.filter((g) => g.onSale && g.coin > 0).map((g) => [g.id, g.coin]));
    expect(coin).toEqual({
      30601: 17000,
      30602: 30000,
      30604: 16000,
      30605: 25000,
      30701: 8000,
      30702: 12000,
      30704: 20000,
      30705: 28000,
    });
    const black = Object.fromEntries(
      b.shopPools.black
        .filter((id) => id >= 30600 && id < 30800)
        .map((id) => [id, b.goods.find((g) => g.id === id)!.diamond]),
    );
    expect(black).toEqual({ 30603: 4, 30606: 4, 30703: 2, 30706: 3 });
    expect(art.filter((g) => g.needStar === 2).map((g) => g.id)).toEqual([
      30604, 30605, 30606, 30701, 30702, 30703,
    ]);
    // 金唱片两个位置都能摆（设施类型 9），四项全加
    expect(b.goods.find((g) => g.id === 30609)).toMatchObject({
      deviceType: 9,
      effects: { time: 24, atRate: 0.1, atSoftCapAdd: 0.11, spRate: 0.09, spSoftCapAdd: 0.08 },
    });
    // 乾坤通景巨屏（2026-10-25）：只能后台发，七项加成 + 孕育参数
    const scroll = b.goods.find((g) => g.id === 30710)!;
    expect(scroll).toMatchObject({
      name: '《山河社稷 · 万象天工》乾坤通景巨屏',
      deviceType: 9,
      onSale: false,
      coin: 0,
      diamond: 0,
      effects: {
        time: 24,
        atRate: 0.16,
        atSoftCapAdd: 0.14,
        spRate: 0.14,
        spSoftCapAdd: 0.12,
        coinRate: 0.5,
        expRate: 0.25,
        mcGoldRate: 0.25,
        breedEveryHours: 2,
        breedTimes: 12,
        breedMaxLevel: 5,
        breedMaxOdds: 65,
      },
    });
    expect(scroll.needStar).toBeUndefined();
    expect(b.shopPools.black).not.toContain(30710);
  });

  it('检查：艺术品必须是设施、设施类型 7/8/9、只能加上座率挑剔率和两个软上限', () => {
    const src = source();
    const goods = structuredClone(src['master/goods']) as Array<Record<string, unknown> & { id: number }>;
    const g = (id: number) => goods.find((x) => x.id === id)!;
    g(30601).deviceType = 1;
    g(30602).value = { time: 24, luckValue: 1 };
    g(30701).type = 1;
    const errs = buildBundle({ ...src, 'master/goods': goods }).errors;
    expect(errs).toContain('goods 30601 art deviceType 1');
    expect(errs).toContain('goods 30602 art value key luckValue not allowed');
    expect(errs).toContain('goods 30701 art must be a device');
  });

  it('检查：孕育参数四个要么都有要么都没有，必须是正整数', () => {
    const src = source();
    const goods = structuredClone(src['master/goods']) as Array<Record<string, unknown> & { id: number }>;
    const g = (id: number) => goods.find((x) => x.id === id)!;
    g(30702).value = { time: 24, breedEveryHours: 2 };
    g(30703).value = { time: 24, breedEveryHours: 2, breedTimes: 1.5, breedMaxLevel: 5, breedMaxOdds: 65 };
    const errs = buildBundle({ ...src, 'master/goods': goods }).errors;
    expect(errs).toContain(
      'goods 30702 art breed needs all of breedEveryHours, breedTimes, breedMaxLevel, breedMaxOdds',
    );
    expect(errs).toContain('goods 30703 art value breedTimes must be a positive integer');
  });

  it('artBreedOf / artEffectsOf：孕育参数单独取出，不进加成', () => {
    const { bundle } = buildBundle(source());
    const scroll = bundle!.goods.find((x) => x.id === 30710)!.effects;
    expect(artBreedOf(scroll)).toEqual({ everyHours: 2, times: 12, maxLevel: 5, maxOdds: 65 });
    const eff = artEffectsOf(scroll);
    expect(eff.coinRate).toBe(0.5);
    expect(Object.keys(eff).filter((k) => k === 'time' || k.startsWith('breed'))).toEqual([]);
    expect(artBreedOf(bundle!.goods.find((x) => x.id === 30609)!.effects)).toBeNull();
  });
});

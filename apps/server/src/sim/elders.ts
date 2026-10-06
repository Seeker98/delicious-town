/**
 * 赛厨长老生成器（问题记录 408）：按每层的等级、套装、强化，模拟出最难打的加点和强化分配，
 * 写到 packages/config/data/game/tower_elders.json。
 *   pnpm -F @dt/server elders            生成
 *   pnpm -F @dt/server elders --report   另外打印典型玩家几级能打过
 *
 * - 长老：等级属性点只加厨艺、刀工、火候（和玩家一样）；厨具基础属性按正常随机的期望；强化增量按最优分。
 * - “最难打”：对同级、穿当前等级最好套装 +5、加点平均、厨具按期望的典型玩家，胜率最低的分配。
 * - 守塔人当天的特色菜按这一层菜池的期望每份价值算。随机数用固定种子，同样的配置每次生成一样的结果。
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EQUIP_ATTRS,
  buildBundle,
  createGameConfig,
  defaultDataDir,
  elderAttrs,
  elderErrors,
  readSourceDir,
  stressSteps,
  type ElderInput,
  type EquipAttrs,
  type GameConfig,
} from '@dt/config';
import { seededRng, type Rng } from '@dt/shared';
import { activeSuits, attrSeq, attrSummary, suitPct, zeroAttrs } from '../modules/equip/rules';
import { suitEffect } from '../modules/equip/power';
import { duel, type DuelSide, type DuelTuning } from '../modules/tower/duel';

/** 每层长老：等级、穿的厨具、强化、掉落（用户 2026-10-06 定） */
export const ELDER_SPECS: ReadonlyArray<Omit<ElderInput, 'points' | 'pieces'> & { ids: number[] }> = [
  { floor: 1, level: 8, stress: 3, ids: [40001, 40002, 40003], drops: [40001, 40002, 40003] },
  { floor: 2, level: 27, stress: 5, ids: [40004, 40005, 40006, 40007], drops: [40004, 40005, 40006, 40007] },
  { floor: 3, level: 39, stress: 5, ids: [40101, 40102, 40103, 40104], drops: [40101, 40102, 40103, 40104] },
  { floor: 4, level: 49, stress: 5, ids: [40201, 40202, 40203, 40204], drops: [40201, 40202, 40203, 40204] },
  {
    floor: 5,
    level: 61,
    stress: 5,
    ids: [40401, 40402, 40404, 40405, 40403],
    drops: [40401, 40402, 40403, 40404, 40405],
  },
  // 度玛只有镬、瓶、冠，铲、刃用巴贝雷特；只掉度玛的三件
  { floor: 6, level: 67, stress: 5, ids: [40401, 40402, 40301, 40302, 40303], drops: [40301, 40302, 40303] },
  {
    floor: 7,
    level: 75,
    stress: 5,
    ids: [40801, 40802, 40803, 40804, 40805],
    drops: [40801, 40802, 40803, 40804, 40805],
  },
  {
    floor: 8,
    level: 81,
    stress: 5,
    ids: [40601, 40602, 40603, 40604, 40605],
    drops: [40601, 40602, 40603, 40604, 40605],
  },
  // 阿尼玛没有自己的套装：穿、掉阿卡玛
  {
    floor: 9,
    level: 87,
    stress: 6,
    ids: [40601, 40602, 40603, 40604, 40605],
    drops: [40601, 40602, 40603, 40604, 40605],
  },
  {
    floor: 10,
    level: 94,
    stress: 5,
    ids: [40704, 40703, 40701, 40702, 40705],
    drops: [40701, 40702, 40703, 40704, 40705],
  },
];

/** 典型玩家各等级能穿的最好的一套（最低等级从高到低） */
const PLAYER_SETS: ReadonlyArray<[number, number[]]> = [
  [90, [40704, 40703, 40701, 40702, 40705]],
  [80, [40601, 40602, 40603, 40604, 40605]],
  [70, [40801, 40802, 40803, 40804, 40805]],
  [60, [40401, 40402, 40404, 40405, 40403]],
  [50, [40501, 40502, 40503, 40504]],
  [40, [40201, 40202, 40203, 40204]],
  [13, [40101, 40102, 40103, 40104]],
  [0, [40001, 40002, 40003]],
];

type Ratio = Record<(typeof EQUIP_ATTRS)[number], number>;
type PointRatio = { cook: number; cutting: number; fire: number };

/** 按比例把 n 分成整数（最大余数法，余数相同按顺序） */
export function splitInt<K extends string>(
  n: number,
  ratio: Record<K, number>,
  keys: readonly K[],
): Record<K, number> {
  const out = {} as Record<K, number>;
  let used = 0;
  const frac: Array<[K, number]> = [];
  for (const k of keys) {
    const x = n * ratio[k];
    out[k] = Math.floor(x);
    used += out[k];
    frac.push([k, x - out[k]]);
  }
  frac.sort((a, b) => b[1] - a[1]);
  for (let i = 0; i < n - used; i++) out[frac[i % frac.length]![0]] += 1;
  return out;
}

/** 厨具基础属性按正常随机的期望：部位顺序上第一项约一半，第二项约四分之一……最后一项拿剩下的 */
export function expectedBase(config: GameConfig, id: number): EquipAttrs {
  const def = config.requireGoods(id).equip!;
  const out = zeroAttrs();
  if (def.total === null) {
    for (const k of EQUIP_ATTRS) out[k] = def.ranges[k] as number;
    return out;
  }
  let left = def.total;
  const seq = attrSeq(def.part);
  seq.forEach((k, i) => {
    const r = def.ranges[k];
    const hi = typeof r === 'number' ? r : r[1];
    const v = i === seq.length - 1 ? left : Math.min(hi, Math.round(left / 2));
    out[k] = v;
    left -= v;
  });
  return out;
}

/**
 * 强化增量按比例分，但和游戏里一样每一级的增量只能整份加到一项（tower_elders 校验 gainReachable）：
 * 从大的一级开始，给离目标份额还差最多的那项；差得一样多时按属性顺序
 */
export function assignSteps(steps: readonly number[], ratio: Ratio): EquipAttrs {
  const total = steps.reduce((s, x) => s + x, 0);
  const out = zeroAttrs();
  for (const step of [...steps].sort((a, b) => b - a)) {
    let best: (typeof EQUIP_ATTRS)[number] = EQUIP_ATTRS[0];
    let gap = -Infinity;
    for (const k of EQUIP_ATTRS) {
      const g = total * ratio[k] - out[k];
      if (g > gap + 1e-9) {
        best = k;
        gap = g;
      }
    }
    out[best] += step;
  }
  return out;
}

export function elderOf(
  config: GameConfig,
  spec: (typeof ELDER_SPECS)[number],
  pts: PointRatio,
  gain: Ratio,
): ElderInput {
  const t = config.tuning.rest;
  const P = t.attrPerLevel * (spec.level - 1);
  return {
    floor: spec.floor,
    level: spec.level,
    stress: spec.stress,
    drops: spec.drops,
    points: splitInt(P, pts, ['cook', 'cutting', 'fire'] as const),
    pieces: spec.ids.map((id) => {
      const table = config.requireGoods(id).equip!.stressTable;
      return {
        id,
        base: expectedBase(config, id),
        gain: assignSteps(stressSteps(table, spec.stress), gain),
      };
    }),
  };
}

/** 典型玩家（进攻）：加点平均分到厨艺刀工火候，最好的一套，厨具基础和强化都按期望（强化按部位顺序约一半给第一项） */
export function typicalPlayer(config: GameConfig, level: number, stress: number): DuelSide {
  const t = config.tuning.rest;
  const ids = PLAYER_SETS.find(([lv]) => level >= lv)![1];
  const P = t.attrPerLevel * (level - 1);
  const points = {
    ...zeroAttrs(),
    ...splitInt(P, { cook: 1 / 3, cutting: 1 / 3, fire: 1 / 3 }, ['cook', 'cutting', 'fire'] as const),
  };
  const gear = zeroAttrs();
  for (const id of ids) {
    const def = config.requireGoods(id).equip!;
    const base = expectedBase(config, id);
    let g = def.stressTable[stress]! - def.stressTable[0]!;
    const seq = attrSeq(def.part);
    seq.forEach((k, i) => {
      const v = i === seq.length - 1 ? g : Math.round(g / 2);
      base[k] += v;
      g -= v;
    });
    for (const k of EQUIP_ATTRS) gear[k] += base[k];
  }
  const list = activeSuits(
    ids.map((id) => config.requireGoods(id).equip!.suitId),
    config.suits,
  );
  const { total } = attrSummary(points, gear, suitPct(list));
  const atk = (k: string) => 1 + suitEffect(list, k);
  return {
    name: `${level} 级玩家`,
    attrs: {
      ...total,
      cook: Math.round(total.cook * atk('attackCook')),
      cutting: Math.round(total.cutting * atk('attackCutting')),
      fire: Math.round(total.fire * atk('attackFire')),
      luck: t.luckPerLevel * (level - 1) + gear.luck + suitEffect(list, 'luckValue'),
    },
    mcPrice: 0,
    dish: null,
  };
}

/** 这一层守塔人当天特色菜的期望每份价值（watchman.ts：等级 [⌊(层−2)/2⌋, +3]，营养值 × (1 + rand × priceSpread)） */
export function expectedMc(config: GameConfig, floor: number): number {
  const f = config.towerFloors.get(floor)!;
  if (!f.mc) return 0;
  const lo = Math.floor((floor - 2) / 2);
  const pool = config.bundle.mysteriousCookbooks.filter((m) => m.level >= lo && m.level <= lo + 3);
  if (pool.length === 0) return 0;
  const avg = pool.reduce((s, m) => s + m.nutritive, 0) / pool.length;
  return Math.round(avg * (1 + config.tuning.tower.watchmanCook.priceSpread / 2));
}

export function winRate(me: DuelSide, them: DuelSide, t: DuelTuning, n: number, rng: Rng): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (duel(me, them, t, rng).win) k++;
  return k / n;
}

function* grid(step: number): Generator<Ratio> {
  const n = Math.round(1 / step);
  for (let a = 0; a <= n; a++)
    for (let b = 0; a + b <= n; b++)
      for (let c = 0; a + b + c <= n; c++)
        for (let d = 0; a + b + c + d <= n; d++)
          for (let e = 0; a + b + c + d + e <= n; e++)
            yield {
              cook: a / n,
              cutting: b / n,
              fire: c / n,
              season: d / n,
              creatives: e / n,
              luck: (n - a - b - c - d - e) / n,
            };
}
const POINTS: PointRatio[] = [];
for (let a = 0; a <= 4; a++)
  for (let b = 0; a + b <= 4; b++) POINTS.push({ cook: a / 4, cutting: b / 4, fire: (4 - a - b) / 4 });

/** 一层的最难打分配：先粗搜（强化 0.2 步长），再在最优附近细搜（0.1、0.05） */
export function hardestElder(config: GameConfig, spec: (typeof ELDER_SPECS)[number], rng: Rng): ElderInput {
  const t = config.tuning.tower.duel;
  const ctx = { goods: config.goods, suits: config.suits, ...config.tuning.rest };
  const player = typicalPlayer(config, spec.level, 5);
  const mc = expectedMc(config, spec.floor);
  const rate = (pts: PointRatio, gain: Ratio, n: number) => {
    const e = elderOf(config, spec, pts, gain);
    return winRate(
      player,
      { name: '长老', attrs: elderAttrs(e, ctx).attrs, mcPrice: mc, dish: null },
      t,
      n,
      rng,
    );
  };
  let best = { pts: POINTS[0]!, gain: [...grid(0.2)][0]!, r: 2 };
  for (const gain of grid(0.2))
    for (const pts of POINTS) {
      const r = rate(pts, gain, 200);
      if (r < best.r) best = { pts, gain, r };
    }
  for (const [step, radius, n] of [
    [0.1, 0.41, 500],
    [0.05, 0.21, 1500],
  ] as const) {
    const center = best;
    best = { ...center, r: rate(center.pts, center.gain, n) };
    for (const gain of grid(step)) {
      if (EQUIP_ATTRS.reduce((s, k) => s + Math.abs(gain[k] - center.gain[k]), 0) > radius) continue;
      for (const pts of POINTS) {
        const r = rate(pts, gain, n);
        if (r < best.r) best = { pts, gain, r };
      }
    }
  }
  return elderOf(config, spec, best.pts, best.gain);
}

function main(): void {
  // 从配置源现场构建，忽略旧的长老数据：改了强化表、加点数以后旧数据通不过校验，也能重新生成（问题记录 408 审查）
  const built = buildBundle(readSourceDir(defaultDataDir()), { ignoreElders: true });
  if (!built.bundle) throw new Error(built.errors.join('\n'));
  const config = createGameConfig(built.bundle);
  const ctx = { goods: config.goods, suits: config.suits, ...config.tuning.rest };
  const report = process.argv.includes('--report');
  const floors: ElderInput[] = [];
  for (const spec of ELDER_SPECS) {
    const e = hardestElder(config, spec, seededRng(408 * 100 + spec.floor));
    const errs = elderErrors(e, ctx);
    if (errs.length > 0) throw new Error(errs.join('\n'));
    floors.push(e);
    const { attrs, power } = elderAttrs(e, ctx);
    let line = `${spec.floor} 层 ${spec.level} 级 +${spec.stress}：厨力 ${power} ${JSON.stringify(attrs)}`;
    if (report) {
      const them = { name: '长老', attrs, mcPrice: expectedMc(config, spec.floor), dish: null };
      const rng = seededRng(1);
      const reach = (stress: number, target: number) => {
        for (let lv = 1; lv <= 130; lv++)
          if (winRate(typicalPlayer(config, lv, stress), them, config.tuning.tower.duel, 2000, rng) >= target)
            return lv;
        return '>130';
      };
      line += `；典型玩家赢一半：+5 ${reach(5, 0.5)} 级，+3 ${reach(3, 0.5)} 级`;
    }
    console.log(line);
  }
  const out = join(defaultDataDir(), 'game/tower_elders.json');
  writeFileSync(
    out,
    JSON.stringify(
      {
        note: '赛厨长老（问题记录 408）：由 pnpm -F @dt/server elders 生成，别手改；改等级、厨具、强化在 apps/server/src/sim/elders.ts 的 ELDER_SPECS',
        floors,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`写入 ${out}`);
}

if (process.argv[1]?.endsWith('elders.ts')) main();

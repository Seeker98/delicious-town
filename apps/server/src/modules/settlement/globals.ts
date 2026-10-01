import type { GameConfig, Tuning } from '@dt/config';
import type { CookbookCounts, TableState } from '../../db/schema';
import type { SettleGlobals, SettleInput, SettleRest, SpecialDish } from './types';

export function buildGlobals(
  config: GameConfig,
  tuning: Tuning,
  patch: Partial<SettleGlobals> = {},
): SettleGlobals {
  return {
    weather: {},
    krabStreet: null,
    planktonRestId: null,
    holidayMultiplier: 1,
    naturalRoach: true,
    bless: {},
    tuning,
    cookbooks: config.cookbookIndex,
    grade: (g) => config.grade(g),
    needFoods: (id, grade) => config.requireCookbook(id).needFoods[grade] ?? [],
    food: (id) => config.requireFood(id),
    ...patch,
  };
}

/** 数据库里的 cookbook_counts 可能是旧的 {}，统一补全 */
export function normalizeCounts(raw: unknown): CookbookCounts {
  const r = (raw ?? {}) as Partial<CookbookCounts>;
  const grade = Array.from({ length: 11 }, (_, i) => r.grade?.[i] ?? 0);
  return { learned: r.learned ?? 0, grade, street: { ...(r.street ?? {}) } };
}

/** 拼结算输入需要的全部数据（快速模拟设计 §4.2）：真实结算从数据库组，快速模型从内存组 */
export interface SettleSource {
  rest: SettleRest;
  tables: TableState[];
  levels: Uint8Array;
  counts: unknown;
  agg: Record<string, number>;
  special: SpecialDish | null;
  cupboard: ReadonlyMap<number, number> | null;
  now: Date;
}

/** 真实结算和快速模型共用：两边拼出来的结算输入一定一致 */
export function toSettleInput(s: SettleSource): SettleInput {
  return {
    rest: s.rest,
    tables: s.tables,
    // 只换成 Uint8Array 视图，不复制（结算不改它；每轮复制 2KB 在快速模拟里很费时）
    levels: new Uint8Array(s.levels.buffer, s.levels.byteOffset, s.levels.byteLength),
    counts: normalizeCounts(s.counts),
    agg: s.agg,
    special: s.special,
    cupboard: s.cupboard,
    now: s.now,
  };
}

export interface InputPatch {
  rest?: Partial<SettleRest>;
  tables?: TableState[];
  /** 食谱 id → 品级 */
  cookbooks?: Record<number, number>;
  agg?: Record<string, number>;
  special?: SpecialDish | null;
  cupboard?: ReadonlyMap<number, number> | null;
  now?: Date;
}

/** 测试和模拟器用：按补丁构造一份结算输入，默认是一家 0 星新手街 4 桌的新店 */
export function buildInput(config: GameConfig, patch: InputPatch = {}): SettleInput {
  const levels = new Uint8Array(config.maxCookbookId + 1);
  const counts: CookbookCounts = { learned: 0, grade: Array(11).fill(0) as number[], street: {} };
  for (const [id, grade] of Object.entries(patch.cookbooks ?? {})) {
    const cb = config.requireCookbook(Number(id));
    levels[cb.id] = grade;
    if (grade > 0) {
      counts.learned += 1;
      counts.grade[grade]! += 1;
      counts.street[String(cb.streetId)] = (counts.street[String(cb.streetId)] ?? 0) + 1;
    }
  }
  return {
    rest: {
      id: 1,
      level: 1,
      star: 0,
      oil: 1000,
      oilMax: 1000,
      coin: 0,
      streetId: 0,
      renown: 10,
      luck: 0,
      cteOn: false,
      cookfoodsFlag: 0,
      ...patch.rest,
    },
    tables: patch.tables ?? Array.from({ length: 4 }, (_, i) => ({ no: i + 1, floor: 1, customer: 0 })),
    levels,
    counts,
    agg: patch.agg ?? {},
    special: patch.special ?? null,
    cupboard: patch.cupboard ?? null,
    now: patch.now ?? new Date('2026-09-30T04:00:00Z'),
  };
}

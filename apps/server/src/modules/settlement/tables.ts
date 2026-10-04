import { dishCoin } from '../../core/prices';
import { GOODS } from '@dt/config';
import type { Rng } from '@dt/shared';
import type { TableResult, TableState } from '../../db/schema';
import type { Drop, Flags, Rates, SettleGlobals, SettleInput, SettleLog } from './types';

/** 一家店同时最多几张蟑螂桌（问题记录 228）：桌数 × 比例向上取整，至少 1 张 */
export function roachCap(tableCount: number, share: number): number {
  return Math.max(1, Math.ceil(tableCount * share - 1e-9));
}

export interface Learned {
  all: number[];
  local: number[];
  other: number[];
}

/** 已学食谱按"本街 / 外街"分组（每轮每店扫一遍 levels，约 2400 字节） */
export function splitLearned(levels: Uint8Array, street: Int16Array, streetId: number): Learned {
  const all: number[] = [];
  const local: number[] = [];
  const other: number[] = [];
  const n = Math.min(levels.length, street.length);
  for (let id = 1; id < n; id++) {
    if (levels[id]! === 0 || street[id]! < 0) continue;
    all.push(id);
    (street[id] === streetId ? local : other).push(id);
  }
  return { all, local, other };
}

/** 规格书 01 §1.5E：原值为 0 或加上之后 ≤0 时为 0 */
export function realValue(x: number, add: number): number {
  return x === 0 ? 0 : Math.max(0, x + add);
}

export interface Candidate {
  cookbookId: number;
  req: number;
}

export interface TableOutcome {
  tables: TableState[];
  oil: number;
  coin: number;
  exp: number;
  customers: Record<string, number>;
  drops: Drop[];
  logs: SettleLog[];
  candidates: Candidate[];
  specialUsed: number;
  planktonAppeared: boolean;
}

/** 白食桌每轮（规格书 01 §1.5B）：店主的油、白食者本轮累计的经验、店主被吃掉的银币 */
export function dineAccrual(
  f: { level: number; since: string },
  now: Date,
  star: number,
  base: { oilBase: number; coinBase: number; expBase: number },
  rng: Rng,
): { oil: number; exp: number; loss: number } {
  const tt = Math.floor(Math.sqrt(f.level));
  const hours = (now.getTime() - Date.parse(f.since)) / 3_600_000;
  if (hours < 7) {
    return {
      oil: base.oilBase + 1 + Math.floor(Math.sqrt(tt)),
      exp: (base.expBase + star) * 3 + rng.int(6 * tt),
      loss: (base.coinBase + star) * 3 + rng.int(3 * tt),
    };
  }
  return {
    oil: base.oilBase + 1,
    exp: base.expBase + star + rng.int(tt),
    loss: base.coinBase + star + rng.int(tt),
  };
}

/** 付费的顾客类型：普通、挑剔、章鱼哥、痞老板、蟹老板 */
const PAYING: ReadonlySet<number> = new Set([1, 2, 6, 7, 8]);

const r2 = (x: number) => Math.round(x * 100) / 100;

/** 逐桌分配（规格书 01 §1.5；设计文档 裁定 1：每桌银币加成只加一次） */
export function allocateTables(
  input: SettleInput,
  g: SettleGlobals,
  rates: Rates,
  flags: Flags,
  rng: Rng,
): TableOutcome {
  const { rest } = input;
  const s = rest.star;
  const t = g.tuning.settlement;
  const rt = g.tuning.rest;
  const coinBase = rt.coinBase - Math.floor(s / 2);
  const expBase = rt.expBase + Math.floor(s / 2);
  const oilBase = rt.oilBase;
  const learned = splitLearned(input.levels, g.cookbooks.street, rest.streetId);
  const sameKrabStreet = g.krabStreet !== null && g.krabStreet === rest.streetId;
  const isHost = g.planktonRestId === rest.id;
  const special = input.special ? { ...input.special } : null;

  const out: TableOutcome = {
    tables: [],
    oil: 0,
    coin: 0,
    exp: 0,
    customers: {},
    drops: [],
    logs: [],
    candidates: [],
    specialUsed: 0,
    planktonAppeared: false,
  };
  const count = (type: number) => {
    out.customers[String(type)] = (out.customers[String(type)] ?? 0) + 1;
  };
  /** 规格书 01 §1.7 */
  const eatSpecial = (portions: number, half: boolean): { coin: number; exp: number } => {
    if (!special || special.leftNum <= 0) return { coin: 0, exp: 0 };
    const n = Math.min(portions, special.leftNum);
    special.leftNum -= n;
    out.specialUsed += n;
    return {
      coin: special.price * n * (1 + flags.mcCoinRate) * (half ? 0.5 : 1),
      exp: (half ? 1 : special.level) * (1 + flags.mcExpRate),
    };
  };

  let seatedLimit = rates.seated;
  // 店里已经坐着痞老板时，本轮不会再出现第二个
  let planktonShown = input.tables.some((x) => x.customer === 7);
  const sorted = [...input.tables].sort((a, b) => a.no - b.no);
  // 蟑螂上限：原有的算在内；本轮被蟑螂药消灭的腾出名额（问题记录 228）
  const roachMax = roachCap(input.tables.length, t.roachMaxShare);
  let roaches = input.tables.filter((x) => x.customer === 3).length;

  for (const table of sorted) {
    let oil = oilBase;
    let coin = coinBase;
    let exp = expBase;
    let mcCoin = 0;
    let mcExp = 0;
    let satisfied = false;
    let type = 0;
    let next: TableState = { no: table.no, floor: table.floor, customer: 0 };
    const extra: Partial<TableResult> = {};

    // B. 白食桌
    if (table.customer === 9 && table.freeloader) {
      const f = table.freeloader;
      const acc = dineAccrual(f, input.now, s, { oilBase, coinBase, expBase }, rng);
      oil = acc.oil;
      const loss = acc.loss;
      const fexp = acc.exp;
      if (table.no <= seatedLimit) seatedLimit += 1;
      const oilT = realValue(oil, rates.oilValue.total);
      out.oil += oilT;
      out.coin -= loss;
      next = {
        ...next,
        customer: 9,
        freeloader: { ...f, coin: f.coin + loss, exp: f.exp + fexp },
        last: { type: 9, coin: -loss, exp: 0, oil: r2(oilT) },
      };
      out.tables.push(next);
      count(9);
      continue;
    }

    // C. 蟑螂桌
    if (table.customer === 3) {
      const killed = rng.chance(flags.roachClear);
      if (killed) roaches -= 1;
      type = killed ? -3 : 3;
      next = killed
        ? { ...next, customer: -3 }
        : { ...next, customer: 3, ...(table.roach ? { roach: table.roach } : {}) };
      next.last = { type, coin: 0, exp: 0, oil: 0 };
      out.tables.push(next);
      count(type);
      continue;
    }

    if (table.customer === 7) {
      // D. 痞老板桌：保持，×5
      type = 7;
      next.customer = 7;
      oil *= t.planktonMultiplier;
      coin *= t.planktonMultiplier;
      exp *= t.planktonMultiplier;
    } else if (
      isHost &&
      !planktonShown &&
      s > 0 &&
      rng.chance(t.planktonRateBase + t.planktonRatePerStar * s)
    ) {
      // A1. 痞老板出现
      type = 7;
      next.customer = 7;
      planktonShown = true;
      oil *= t.planktonMultiplier;
      coin *= t.planktonMultiplier;
      exp *= t.planktonMultiplier;
      out.drops.push({ goodsId: GOODS.plankton, num: 1 });
      out.logs.push({ type: 'plankton.appear', params: { table: table.no } });
      out.planktonAppeared = true;
    } else if (
      g.naturalRoach &&
      roaches < roachMax &&
      rng.chance((t.roachRateBase - t.roachRatePerStar * s) * flags.roachMul)
    ) {
      // A2. 蟑螂（到上限就不再长）
      roaches += 1;
      type = 3;
      next = { ...next, customer: 3, roach: { by: null, at: input.now.toISOString() } };
    } else if (table.no > seatedLimit) {
      // A3. 空桌
      type = 0;
    } else if (
      s >= t.squidwardMinStar &&
      rng.chance(t.squidwardRate * Math.sqrt(2 * s) * (sameKrabStreet ? 1 : t.squidwardOtherStreetFactor))
    ) {
      // A4. 章鱼哥
      type = 6;
      next.customer = 6;
      oil = 1;
      coin = 1;
      exp = 1;
      if (special && special.leftNum > 0) {
        const n = Math.min(t.squidwardPortions, special.leftNum);
        special.leftNum -= n;
        out.specialUsed += n;
        if (flags.flute) {
          exp = special.price * t.squidwardPortions * (1 + flags.mcCoinRate);
          satisfied = true;
        }
      }
      exp *= flags.sqExpRate;
    } else if (rng.chance(rates.spRate.total)) {
      if (
        rest.streetId !== 0 &&
        rng.chance(
          t.krabRate * (sameKrabStreet ? t.krabSameStreetFactor : 1) + flags.luckRate / t.krabLuckDivisor,
        )
      ) {
        // 神秘顾客（蟹老板）
        type = 8;
        next.customer = 8;
        const req = rng.intMin1(t.krabMaxGrade);
        const cb = learned.all.length > 0 ? learned.all[rng.int(learned.all.length)]! : null;
        const grade = cb === null ? 0 : input.levels[cb]!;
        Object.assign(extra, { req, grade, ...(cb !== null ? { cookbookId: cb } : {}) });
        if (cb !== null && grade >= req) {
          satisfied = true;
          oil = oil + oil + grade;
          exp += t.krabExpPerGrade * grade;
          coin +=
            dishCoin(g.cookbooks.coin[cb]!, t.dishCoinRate) *
            (1 + g.grade(grade).spCoinAddRate) *
            t.krabCoinMultiplier;
          out.drops.push({ goodsId: GOODS.krabHappy, num: 1 });
          out.logs.push({ type: 'krab.happy', params: { cookbookId: cb, grade, req } });
        } else if (flags.husky && rng.chance(t.huskyRate)) {
          out.logs.push({ type: 'krab.husky', params: { req } });
        } else if (flags.paintingTop && rng.chance(t.painting13Rate)) {
          out.drops.push({ goodsId: GOODS.krabHappy, num: 1, hours: t.painting13Hours });
          out.logs.push({ type: 'krab.painting', params: { req } });
        } else {
          coin /= 2;
          exp /= 2;
          out.drops.push({ goodsId: GOODS.krabAngry, num: 1 });
          out.logs.push({ type: 'krab.angry', params: { req } });
        }
      } else {
        // 普通挑剔顾客
        type = 2;
        next.customer = 2;
        const req = rng.intMin1(Math.min(s, t.pickyMaxGrade));
        const localRate = rest.streetId === 0 ? 1 : rt.localRateBase - rt.localRatePerStar * s;
        const local = rng.chance(localRate);
        const pool = local ? learned.local : learned.other;
        const cb = pool.length > 0 ? pool[rng.int(pool.length)]! : null;
        if (cb !== null) {
          const grade = input.levels[cb]!;
          Object.assign(extra, { req, grade, cookbookId: cb });
          oil = oil + oil + grade;
          exp += grade * (local ? 1 : 2);
          if (grade >= req) {
            satisfied = true;
            coin += dishCoin(g.cookbooks.coin[cb]!, t.dishCoinRate) * (1 + g.grade(grade).spCoinAddRate);
            const m = eatSpecial(2, false);
            mcCoin += m.coin;
            mcExp += m.exp;
            if (req >= t.cookfoodsMinGrade && grade >= t.cookfoodsMinGrade) {
              out.candidates.push({ cookbookId: cb, req });
            }
          } else {
            coin += grade;
            if (flags.ali) {
              const m = eatSpecial(1, false);
              mcCoin += m.coin;
              mcExp += m.exp;
            }
          }
        } else {
          Object.assign(extra, { req });
          exp /= 2;
          if (flags.ali) {
            const m = eatSpecial(1, true);
            mcCoin += m.coin;
            mcExp += m.exp;
          }
        }
        if (!satisfied && !flags.husky) coin /= 2;
      }
    } else {
      // 普通顾客
      type = 1;
      next.customer = 1;
      const m = eatSpecial(1, true);
      mcCoin += m.coin;
      mcExp += m.exp;
    }

    // E. 每桌最终值
    let oilT = 0;
    let coinT = 0;
    let expT = 0;
    if (PAYING.has(type)) {
      oilT = realValue(oil, rates.oilValue.total);
      // 全服银币倍率（148-4 全服加成，默认 1）
      coinT = (coin + rates.coinValue.total + mcCoin) * t.coinMultiplier;
      expT = realValue(exp + mcExp, rates.expValue.total) * t.expMultiplier;
    }
    const cond = satisfied ? coinT * flags.spCoinRate : 0;
    out.oil += oilT;
    out.coin += coinT + cond;
    out.exp += expT;
    next.last = {
      type,
      coin: r2(coinT + cond),
      exp: r2(expT),
      oil: r2(oilT),
      ...extra,
      ...(type === 2 || type === 8 ? { satisfied } : {}),
    };
    out.tables.push(next);
    count(type);
  }
  return out;
}

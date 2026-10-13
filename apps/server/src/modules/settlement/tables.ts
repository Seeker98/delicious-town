import { dishCoin } from '../../core/prices';
import { GOODS, type CookbookIndex } from '@dt/config';
import { gradeOf } from '../cookbook/rules';
import { PAYING_CUSTOMERS, type Rng } from '@dt/shared';
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

/** 已学食谱按"本街 / 外街"分组，返回食谱 id（每轮每店扫一遍 levels）；levels 按存储位存（重新编号 PR 3） */
export function splitLearned(
  levels: Uint8Array,
  idx: Pick<CookbookIndex, 'idAt' | 'street'>,
  streetId: number,
): Learned {
  const all: number[] = [];
  const local: number[] = [];
  const other: number[] = [];
  const n = Math.min(levels.length, idx.idAt.length);
  for (let s = 0; s < n; s++) {
    if (levels[s]! === 0) continue;
    const id = idx.idAt[s]!;
    if (id < 0 || idx.street[id]! < 0) continue;
    all.push(id);
    (idx.street[id] === streetId ? local : other).push(id);
  }
  return { all, local, other };
}

/**
 * 挑剔顾客点本街菜（挑剔顾客调整 2026-10-12）：本街学会 n 道，有 n ÷ min(hitCount, 本街菜数) 的机会点到会做的（返回 null）；
 * 否则从本街没学会的菜里随机点一道，返回它（这桌走人）。判定取一次随机数，走人时再取一次挑菜
 */
export function missedDish(
  localLearned: readonly number[],
  streetIds: readonly number[],
  hitCount: number,
  rng: Rng,
): number | null {
  const need = Math.min(hitCount, streetIds.length);
  if (rng.chance(need <= 0 ? 1 : localLearned.length / need)) return null;
  const known = new Set(localLearned);
  const left = streetIds.filter((id) => !known.has(id));
  return left.length > 0 ? left[rng.int(left.length)]! : null;
}

/** 规格书 01 §1.5E：原值为 0 或加上之后 ≤0 时为 0 */
export function realValue(x: number, add: number): number {
  return x === 0 ? 0 : Math.max(0, x + add);
}

/** 每桌耗油：同 realValue，但有客人的桌至少耗 1 油（问题记录 346：节油类的每桌 −N 不能把油减成 0） */
export function tableOil(x: number, add: number): number {
  return x === 0 ? 0 : Math.max(1, x + add);
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
const PAYING: ReadonlySet<number> = new Set(PAYING_CUSTOMERS);

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
  const learned = splitLearned(input.levels, g.cookbooks, rest.streetId);
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
  /**
   * 规格书 01 §1.7；普通顾客（normal）每份付 normalSpecialPriceRate 成、经验 1（特色菜卖法 2026-10-13：原来固定半价）。
   * 每份银币不取整，整轮合计时再取整
   */
  const eatSpecial = (portions: number, normal: boolean): { coin: number; exp: number; n: number } => {
    if (!special || special.leftNum <= 0) return { coin: 0, exp: 0, n: 0 };
    const n = Math.min(portions, special.leftNum);
    special.leftNum -= n;
    out.specialUsed += n;
    // 卖出倍率按特色菜等级（问题记录 412）：只在这里乘，赛厨的“养”、品尝等用原价
    const sale = g.tuning.mysterious.saleRates[special.level - 1] ?? 1;
    return {
      coin: special.price * sale * n * (1 + flags.mcCoinRate) * (normal ? t.normalSpecialPriceRate : 1),
      exp: (normal ? 1 : special.level) * (1 + flags.mcExpRate),
      n,
    };
  };

  /** 普通顾客桌：全部分完以后再挑几桌吃特色菜（特色菜卖法 2026-10-13）；记下这桌算最终值前的银币、经验 */
  const normals: Array<{ at: number; coin: number; exp: number }> = [];

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
    /** 这桌吃了几份特色菜（问题记录 559） */
    let mcNum = 0;
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
      const oilT = tableOil(oil, rates.oilValue.total);
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

    // C. 蟑螂桌。别人放的待满 roachForeignHours 就跑掉，这张桌子本轮照空桌处理（问题记录 457）
    const foreignExpired =
      table.customer === 3 &&
      table.roach?.by != null &&
      input.now.getTime() - Date.parse(table.roach.at) >= t.roachForeignHours * 3_600_000;
    if (foreignExpired) roaches -= 1;
    if (table.customer === 3 && !foreignExpired) {
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
        mcNum += n;
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
        const grade = cb === null ? 0 : gradeOf(input.levels, g.cookbooks.slotOf, cb);
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
        } else {
          coin /= 2;
          exp /= 2;
          out.drops.push({ goodsId: GOODS.krabAngry, num: 1 });
          out.logs.push({ type: 'krab.angry', params: { req } });
        }
      } else {
        // 普通挑剔顾客（挑剔顾客调整 2026-10-12）
        type = 2;
        next.customer = 2;
        const req = rng.intMin1(Math.min(s, t.pickyMaxGrade));
        const localRate = rest.streetId === 0 ? 1 : rt.localRateBase - rt.localRatePerStar * s;
        const local = rng.chance(localRate);
        // 本街：按 学会数 ÷ pickyHitCount 的机会点到会做的，否则点到没学会的菜、走人
        const unlearned = local
          ? missedDish(learned.local, g.cookbooks.idsByStreet.get(rest.streetId) ?? [], t.pickyHitCount, rng)
          : null;
        const pool = local ? learned.local : learned.other;
        const cb = unlearned !== null || pool.length === 0 ? null : pool[rng.int(pool.length)]!;
        if (unlearned !== null) {
          // 走人：这桌这一轮银币、经验、油都是 0（-2 不在付费顾客里）
          type = -2;
          next.customer = -2;
          Object.assign(extra, { req, cookbookId: unlearned });
        } else if (cb !== null) {
          const grade = gradeOf(input.levels, g.cookbooks.slotOf, cb);
          Object.assign(extra, { req, grade, cookbookId: cb });
          oil = oil + oil + grade;
          exp += grade * (local ? 1 : 2);
          const dish = dishCoin(g.cookbooks.coin[cb]!, t.dishCoinRate) * (1 + g.grade(grade).spCoinAddRate);
          if (grade >= req) {
            satisfied = true;
            coin += dish;
            const m = eatSpecial(2, false);
            mcCoin += m.coin;
            mcNum += m.n;
            mcExp += m.exp;
            if (req >= t.cookfoodsMinGrade && grade >= t.cookfoodsMinGrade) {
              out.candidates.push({ cookbookId: cb, req });
            }
          } else {
            // 品级不够：按自己的品级算的挑剔价付几成
            coin += dish * t.pickyShortPayRate;
          }
        } else {
          // 外街一道都没学会：银币、经验减半
          Object.assign(extra, { req });
          exp /= 2;
          coin /= 2;
        }
      }
    } else {
      // 普通顾客：特色菜等全部桌子分完再挑（见循环后面）
      type = 1;
      next.customer = 1;
      normals.push({ at: out.tables.length, coin, exp });
    }

    // E. 每桌最终值
    let oilT = 0;
    let coinT = 0;
    let expT = 0;
    if (PAYING.has(type)) {
      oilT = tableOil(oil, rates.oilValue.total);
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
      ...(mcNum > 0 ? { mcNum, ...(special?.mcId !== undefined ? { mcId: special.mcId } : {}) } : {}),
    };
    out.tables.push(next);
    count(type);
  }

  // 普通顾客吃特色菜（特色菜卖法 2026-10-13）：随机挑 ⌊桌数 × normalSpecialShare⌋ 桌各吃 1 份；
  // 挑剔顾客、章鱼哥已经先吃过，一批剩得不够时先卖给它们。全挑时不取随机数，按桌号吃
  const pick = Math.floor(normals.length * t.normalSpecialShare + 1e-9);
  if (special && special.leftNum > 0 && pick > 0) {
    const chosen = [...normals];
    if (pick < chosen.length) {
      for (let i = 0; i < pick; i++) {
        const j = i + rng.int(chosen.length - i);
        [chosen[i], chosen[j]] = [chosen[j]!, chosen[i]!];
      }
      chosen.length = pick;
      chosen.sort((a, b) => a.at - b.at);
    }
    for (const c of chosen) {
      const m = eatSpecial(1, true);
      if (m.n === 0) break;
      const table = out.tables[c.at]!;
      const last = table.last!;
      const coinT = (c.coin + rates.coinValue.total + m.coin) * t.coinMultiplier;
      const expT = realValue(c.exp + m.exp, rates.expValue.total) * t.expMultiplier;
      const before = realValue(c.exp, rates.expValue.total) * t.expMultiplier;
      out.coin += m.coin * t.coinMultiplier;
      out.exp += expT - before;
      table.last = {
        ...last,
        coin: r2(coinT),
        exp: r2(expT),
        mcNum: m.n,
        ...(special.mcId !== undefined ? { mcId: special.mcId } : {}),
      };
    }
  }
  return out;
}

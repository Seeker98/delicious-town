import { FOODS, GOODS } from '@dt/config';
import { luckRate, type BarAwardDto } from '@dt/shared';
import type { TestGame } from '../../../test/game';
import { Mean, Tally, Trials, luckOf, mean, rate, shops, spread, times, trials } from './harness';

/** 酒吧小游戏（设计 4C-1、4C-3 和之后的改版）。每个玩法：期望按数值表算，和实测比 */

const LUCK = 100;
const RICH = { goods: { [GOODS.mysteryTicket]: 10_000_000, [GOODS.krabCoin]: 1_000_000 } };
/** 每日次数放开，一家店能一直玩 */
const NO_DAILY = {
  tuning: {
    bar: {
      memory: { dailyMax: 1e9 },
      darts: { dailyMax: 1e9 },
      deal: { dailyMax: 1e9 },
      spice: { dailyMax: 1e9 },
      nim: { dailyMax: 1e9 },
    },
  },
};

/** 酒吧奖励的类型（bar.prize.rates）：所有酒吧玩法发的奖励合起来数 */
const awardKinds = new Tally<string>();
const countAward = (a: BarAwardDto | null) => {
  if (a) awardKinds.add(a.kind);
};

/** ODDS_BAR=fg,num 只跑其中几项（fg num cup slot devil deal darts nim spice awards） */
const want = (key: string) => !process.env.ODDS_BAR || process.env.ODDS_BAR.split(',').includes(key);

export async function barOdds(t: TestGame): Promise<void> {
  const bar = t.game.bar;
  const tb = t.deps.config.tuning.bar;

  // ---------- 划拳（幸运按每局开始时的算：赢了可能发加幸运的勋章） ----------
  if (want('fg'))
    for (const luck of [0, LUCK]) {
      const ctxs = await shops(t, 16, { ...RICH, patch: { luck } });
      const win = new Trials();
      const draw = new Trials();
      const lose = new Trials();
      const n = times(40_000);
      await spread(ctxs, n, async (ctx) => {
        const lr = luckRate(await luckOf(t, ctx.restaurantId));
        const d = (await bar.fg(ctx, { hand: 0 })).data;
        const w = Math.min(tb.fgWinRate + lr, 1 - tb.fgDrawRate - tb.fgLoseMin);
        win.add(w, d.result === 'win');
        draw.add(tb.fgDrawRate, d.result === 'draw');
        lose.add(1 - w - tb.fgDrawRate, d.result === 'lose');
        countAward(d.award);
      });
      trials('划拳', `起始幸运 ${luck}：胜`, win);
      trials('划拳', `起始幸运 ${luck}：平`, draw);
      trials('划拳', `起始幸运 ${luck}：负`, lose);
    }

  // ---------- 转数字 ----------
  if (want('num'))
    for (const luck of [0, LUCK]) {
      const ctxs = await shops(t, 16, { ...RICH, patch: { luck } });
      const hit = new Trials();
      let win = 0;
      let missNext = 0;
      let missSame = 0;
      let onlyGoods = 0;
      let miss = 0;
      const n = times(60_000);
      await spread(ctxs, n, async (ctx) => {
        const lr = luckRate(await luckOf(t, ctx.restaurantId));
        const d = (await bar.num(ctx, { num: 13 })).data;
        hit.add(1 / tb.numMax + lr / tb.numLuckDiv, d.win);
        if (d.win) {
          win++;
          if (d.award?.kind === 'goods') onlyGoods++;
          return;
        }
        miss++;
        if (d.barNum === 14) missNext++;
        if (d.barNum === 13) missSame++;
      });
      trials('转数字', `起始幸运 ${luck}：中`, hit);
      rate('转数字', `幸运 ${luck}：没中时转到某个别的数（14）`, missNext, miss, 1 / (tb.numMax - 1));
      rate('转数字', `幸运 ${luck}：没中时转到猜的数`, missSame, miss, 0);
      rate('转数字', `幸运 ${luck}：中了发的是物品`, onlyGoods, win, 1);
    }

  // ---------- 猜酒杯：每轮都继续，直到猜错或通关 ----------
  if (want('cup')) {
    const c = tb.cup;
    for (const luck of [0, LUCK]) {
      const ctxs = await shops(t, 16, { ...RICH, patch: { luck } });
      const byRound = c.cups.map(() => new Trials());
      const n = times(40_000);
      await spread(ctxs, n, async (ctx) => {
        // 一局里不发奖（收手或通关才发），开局读一次幸运就够
        const lr = luckRate(await luckOf(t, ctx.restaurantId));
        for (let round = 0; ; round++) {
          const d = (await bar.cupGuess(ctx, { cup: 0, round: round === 0 ? null : round })).data;
          byRound[round]!.add(Math.min(c.maxRate, (1 + lr) / c.cups[round]!), d.result !== 'lose');
          if (d.result === 'lose') return;
          if (d.result === 'clear') {
            d.awards?.forEach(countAward);
            return;
          }
          await bar.cupNext(ctx);
        }
      });
      c.cups.forEach((cups, round) =>
        trials('猜酒杯', `起始幸运 ${luck}：第 ${round + 1} 轮（${cups} 杯）猜中`, byRound[round]!),
      );
    }
  }

  // ---------- 老虎机：每格的奖项 ----------
  if (want('slot')) {
    const ctxs = await shops(t, 16, { ...RICH, verified: true });
    const cells = new Tally<number>();
    const n = times(20_000);
    const per = 10;
    await spread(ctxs, n, async (ctx) => {
      const d = (await bar.slot(ctx, { times: per })).data;
      for (const spin of d.spins) for (const id of spin) cells.add(id);
    });
    const expected = slotExpected(t.deps.config.bundle.slotAwards, tb);
    for (const a of t.deps.config.bundle.slotAwards)
      rate(
        '老虎机',
        `奖项 ${a.id}（${a.kind}${a.rare ? '，稀有' : ''}${a.id === tb.slotFloorAwardId ? '，保底' : ''}）每格`,
        cells.get(a.id),
        cells.n,
        expected.get(a.id)!,
      );
  }

  // ---------- 魔鬼辣杯：玩家每次喝编号最小的空杯 ----------
  if (want('devil')) {
    const d = tb.devil;
    for (const stake of [1, d.stakes.at(-1)!]) {
      const ctxs = await shops(t, 16, RICH);
      const survived = new Tally<string>();
      const back = new Mean();
      const n = times(30_000);
      await spread(ctxs, n, async (ctx) => {
        let s = (await bar.devilStart(ctx, { stake })).data;
        for (;;) {
          s = (await bar.devilDrink(ctx, { cup: s.cups.indexOf(null) })).data;
          if (s.result === 'lose') {
            survived.add(`输，活过 ${s.survived}`);
            back.add(0);
            break;
          }
          if (s.result === 'win') {
            survived.add(`赢，活过 ${s.survived}`);
            back.add(s.payout / stake);
            break;
          }
        }
      });
      // 特辣酒等可能地在 6 杯里；第 1、3、5 杯是玩家喝，第 2、4、6 杯是调酒师
      const p = 1 / d.cups;
      for (let i = 0; i < d.cups; i++) {
        const mine = i % 2 === 0;
        const key = mine ? `输，活过 ${i / 2}` : `赢，活过 ${(i + 1) / 2}`;
        rate('魔鬼辣杯', `押 ${stake}：${key}`, survived.get(key), n, p);
      }
      let ev = 0;
      for (let s = 1; 2 * s <= d.cups; s++) ev += Math.round(stake * d.rate ** s) / stake;
      mean('魔鬼辣杯', `押 ${stake}：拿回 / 押注（不算宿醉）`, back, ev * p);
    }
  }

  // ---------- 一掷千金 ----------
  if (want('deal')) {
    const dl = tb.deal;
    const foods = t.deps.config.bundle.foods;
    /** 一份奖品的期望价值：普通食材按出现权重抽 */
    const prizeValue = dl.prizes.map((p) => {
      if (p.kind === 'master') return t.deps.config.requireFood(FOODS.masterBase + p.level).coin * p.num;
      const pool = foods.filter((f) => f.level === p.level && f.odds === 100 && !f.retired);
      const w = pool.reduce((a, f) => a + f.weight, 0);
      return (pool.reduce((a, f) => a + f.weight * f.coin, 0) / w) * p.num;
    });
    const avg = prizeValue.reduce((a, b) => a + b, 0) / prizeValue.length;
    const ctxs = await shops(t, 16, { ...RICH, patch: { coin: 1e12 } }, NO_DAILY);
    const keep = new Mean();
    const offers = dl.opens.map(() => new Mean());
    let top = 0;
    const n = times(8_000);
    await spread(ctxs, n, async (ctx) => {
      await bar.dealStart(ctx);
      await bar.dealPick(ctx, { box: 0 });
      let next = 1;
      for (let round = 0; ; round++) {
        let d = (await bar.dealOpen(ctx, { box: next++ })).data;
        while (d.offer === null) d = (await bar.dealOpen(ctx, { box: next++ })).data;
        offers[round]!.add(d.offer);
        const end = (await bar.dealAnswer(ctx, { deal: false })).data;
        if (end.result === 'box') {
          keep.add(end.prize!.value);
          const best = Math.max(...end.all!.map((b) => b.value));
          if (end.prize!.value === best) top++;
          return;
        }
      }
    });
    mean('一掷千金', `一路不成交：开出的价值（开局 ${dl.cost.toLocaleString()} 银币）`, keep, avg);
    rate('一掷千金', '自己的箱子是最大奖', top, n, 1 / dl.prizes.length);
    offers.forEach((m, r) => mean('一掷千金', `第 ${r + 1} 轮报价（只报实测）`, m, null));
  }

  // ---------- 飞镖：随手点（准星位置等可能） ----------
  if (want('darts')) {
    const d = tb.darts;
    const ctxs = await shops(t, 16, RICH, NO_DAILY);
    const score = new Tally<number>();
    const boss = new Tally<number>();
    const result = new Tally<string>();
    const n = times(10_000);
    await spread(ctxs, n, async (ctx) => {
      await bar.dartsStart(ctx);
      for (let i = 0; i < 3; i++) {
        await bar.dartsAim(ctx);
        const r = (await bar.dartsThrow(ctx, { elapsedMs: 0 })).data;
        score.add(r.score);
        if (r.finished) {
          r.boss!.forEach((b) => boss.add(b));
          result.add(r.result!);
          countAward(r.award);
        }
      }
    });
    // 准星在 [-1, 1] 上等可能：落在第 i 环的概率 = 2 × (半径 − 上一环半径) / 2
    const mine = new Map<number, number>();
    let prev = 0;
    for (const [r, s] of d.rings) {
      mine.set(s, (mine.get(s) ?? 0) + (r - prev));
      prev = r;
    }
    mine.set(0, (mine.get(0) ?? 0) + (1 - prev));
    for (const [s, p] of mine) rate('飞镖', `随手点：${s} 分`, score.get(s), score.n, p);
    const bw = d.bossOdds.reduce((a, [, w]) => a + w, 0);
    for (const [s, w] of d.bossOdds) rate('飞镖', `老板：${s} 分`, boss.get(s), boss.n, w / bw);
    const exact = dartsExact(
      [...mine],
      d.bossOdds.map(([s, w]) => [s, w / bw] as [number, number]),
    );
    rate('飞镖', '随手点：赢', result.get('win'), n, exact.win);
    rate('飞镖', '随手点：平', result.get('draw'), n, exact.draw);
  }

  // ---------- 最后一颗糖：玩家按必胜策略拿 ----------
  if (want('nim'))
    for (const table of ['novice', 'expert'] as const) {
      const tt = tb.nim.tables[table];
      const ctxs = await shops(t, 16, RICH, NO_DAILY);
      let win = 0;
      let meFirst = 0;
      const ks = new Tally<number>();
      const piles = new Tally<number>();
      const n = times(20_000);
      await spread(ctxs, n, async (ctx) => {
        let s = (await bar.nimStart(ctx, { table })).data;
        ks.add(s.k);
        piles.add(s.pile);
        if (s.needFirst) {
          // 新手桌自己选：剩的不是 k+1 的倍数就先拿
          s = (await bar.nimFirst(ctx, { who: s.left % (s.k + 1) === 0 ? 'bartender' : 'me' })).data;
        } else if (s.coin === 'me') meFirst++;
        while (s.result === null) {
          const r = s.left % (s.k + 1);
          s = (await bar.nimTake(ctx, { num: r === 0 ? 1 : r })).data;
        }
        if (s.result === 'win') win++;
      });
      const [k0, k1] = tt.k;
      const [p0, p1] = tt.pile;
      // 必胜策略的胜率：选先后的桌子必赢；抛硬币的桌子 = 自己先 × 剩的不是倍数 + 他先 × 是倍数
      let good = 0;
      let all = 0;
      for (let k = k0; k <= k1; k++)
        for (let p = p0; p <= p1; p++) {
          all++;
          if (p % (k + 1) !== 0) good++;
        }
      const expected = tt.first === 'choose' ? 1 : 0.5 * (good / all) + 0.5 * (1 - good / all);
      rate('最后一颗糖', `${table}：按必胜策略拿，赢`, win, n, expected);
      if (tt.first === 'coin') rate('最后一颗糖', `${table}：抛硬币自己先`, meFirst, n, 0.5);
      rate('最后一颗糖', `${table}：k 取最小值`, ks.get(k0), n, 1 / (k1 - k0 + 1));
      rate('最后一颗糖', `${table}：糖果数取最小值`, piles.get(p0), n, 1 / (p1 - p0 + 1));
    }

  // ---------- 秘制调料：配方等可能；按“和已有回答都对得上的第一个组合”猜 ----------
  if (want('spice')) {
    const sp = tb.spice;
    const all = permutations(sp.kinds, sp.length);
    const ctxs = await shops(t, 16, RICH, NO_DAILY);
    const first = new Tally<number>();
    const tier = new Tally<string>();
    const n = times(5_000);
    await spread(ctxs, n, async (ctx) => {
      let s = (await bar.spiceStart(ctx)).data;
      let cand = all;
      while (s.result === null) {
        const guess = cand[0]!;
        s = (await bar.spiceGuess(ctx, { guess })).data;
        const last = s.guesses.at(-1)!;
        cand = cand.filter((c) => {
          const sc = score(c, guess);
          return sc.a === last.a && sc.b === last.b;
        });
      }
      first.add(s.secret![0]!);
      tier.add(s.result === 'win' ? `第 ${s.tier! + 1} 档` : '输');
      countAward(s.award ?? null);
    });
    rate('秘制调料', '配方第 1 位是 0 号调料', first.get(0), n, 1 / sp.kinds);
    for (const [k, v] of [...tier.map].sort()) rate('秘制调料', `简单策略：${k}（只报实测）`, v, n, null);
  }

  // ---------- 酒吧奖励的类型（上面所有赢的局合起来） ----------
  if (want('awards'))
    for (const [k, p] of Object.entries(tb.prize.rates))
      rate('酒吧奖励', `类型 ${k}`, awardKinds.get(k), awardKinds.n, p);
}

/**
 * 老虎机每格出各奖项的长期频率（含保底）：fail = 连续没出稀有的格数，
 * 每格先判保底（fail 达到 slotFloorSpins × slotCells 必出，之前按 fail × slotFloorRate 提前出），
 * 没保底就按权重抽；出了稀有（含保底奖）fail 归零。按“从 fail = 0 走到下一次稀有”这一段平均
 */
function slotExpected(
  awards: ReadonlyArray<{ id: number; odds: number; rare: boolean }>,
  tb: { slotCells: number; slotFloorSpins: number; slotFloorRate: number; slotFloorAwardId: number },
): Map<number, number> {
  const total = awards.reduce((a, x) => a + x.odds, 0);
  const rareP = awards.filter((x) => x.rare).reduce((a, x) => a + x.odds, 0) / total;
  const acc = new Map(awards.map((x) => [x.id, 0]));
  let reach = 1;
  let cells = 0;
  for (let f = 0; ; f++) {
    const forced = Math.floor(f / tb.slotCells) >= tb.slotFloorSpins;
    const qf = forced ? 1 : Math.min(1, f * tb.slotFloorRate);
    cells += reach;
    for (const x of awards)
      acc.set(
        x.id,
        acc.get(x.id)! + reach * ((1 - qf) * (x.odds / total) + (x.id === tb.slotFloorAwardId ? qf : 0)),
      );
    reach *= (1 - qf) * (1 - rareP);
    if (forced) break;
  }
  return new Map([...acc].map(([id, v]) => [id, v / cells]));
}

function dartsExact(mine: Array<[number, number]>, boss: Array<[number, number]>) {
  const sum3 = (d: Array<[number, number]>) => {
    let m = new Map<number, number>([[0, 1]]);
    for (let i = 0; i < 3; i++) {
      const n = new Map<number, number>();
      for (const [s, p] of m) for (const [x, q] of d) n.set(s + x, (n.get(s + x) ?? 0) + p * q);
      m = n;
    }
    return m;
  };
  const a = sum3(mine);
  const b = sum3(boss);
  let win = 0;
  let draw = 0;
  for (const [x, p] of a)
    for (const [y, q] of b) {
      if (x > y) win += p * q;
      else if (x === y) draw += p * q;
    }
  return { win, draw };
}

function permutations(kinds: number, len: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const rec = () => {
    if (cur.length === len) {
      out.push([...cur]);
      return;
    }
    for (let i = 0; i < kinds; i++)
      if (!cur.includes(i)) {
        cur.push(i);
        rec();
        cur.pop();
      }
  };
  rec();
  return out;
}

function score(secret: readonly number[], guess: readonly number[]) {
  let a = 0;
  let b = 0;
  guess.forEach((x, i) => {
    if (secret[i] === x) a++;
    else if (secret.includes(x)) b++;
  });
  return { a, b };
}

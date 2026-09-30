import { luckRate, type Rng } from '@dt/shared';

export interface DuelAttrs {
  cook: number;
  cutting: number;
  fire: number;
  season: number;
  creatives: number;
  luck: number;
}

export interface DuelSide {
  name: string;
  /** 刀工、火候已按进攻 / 防守算好 */
  attrs: DuelAttrs;
  /** 在售特色菜每份价值；没有为 0 */
  mcPrice: number;
}

/** 色、香、味、形、养 */
export type Scores = number[];

const round1 = (x: number): number => Math.round(x * 10) / 10;

/** 厨力 = 五项属性 + ⌊幸运/2⌋（规格书 20.18） */
export function duelPower(a: DuelAttrs): number {
  return a.cook + a.cutting + a.fire + a.season + a.creatives + Math.floor(a.luck / 2);
}

/**
 * 五项评分（规格书 11.1，原版 getCookAttr）。每项：基础 + 波动，波动 = (创意×0.4 + 1) × (正 ? 1.1 : −0.9) × rand；
 * 正 = rand < 0.5，否则再抽一个 rand < 幸运率（短路）。每项 < 0 记 0，保留 1 位小数
 */
export function duelScores(s: DuelSide, rng: Rng): Scores {
  const a = s.attrs;
  const rate = luckRate(a.luck);
  const amp = a.creatives * 0.4 + 1;
  const wave = () => {
    const up = rng.next() < 0.5 || rng.next() < rate;
    return amp * (up ? 1.1 : -0.9) * rng.next();
  };
  const bases = [
    a.cook * 0.7 + a.cutting * 0.3,
    a.cook * 0.7 + a.season * 0.5,
    a.fire * 0.5 + a.season * 0.5,
    a.fire * 0.4 + a.cutting * 0.7,
    a.fire * 0.2 + a.season * 0.1 + a.cutting * 0.1 + s.mcPrice * 0.6,
  ];
  return bases.map((b) => Math.max(0, round1(b + wave())));
}

export function sumScores(s: Scores): number {
  return round1(s.reduce((x, y) => x + y, 0));
}

/** 赢 ≥ 4 项，或赢 3 项且五项总和 ≥ 对方（平项不算赢） */
export function duelWin(me: Scores, them: Scores): boolean {
  const wins = me.filter((v, i) => v > (them[i] ?? 0)).length;
  return wins >= 4 || (wins === 3 && sumScores(me) >= sumScores(them));
}

/** 一局对决：随机数顺序是挑战方五项、再被挑战方五项 */
export function duel(
  me: DuelSide,
  them: DuelSide,
  rng: Rng,
): { win: boolean; me: { scores: Scores; sum: number }; them: { scores: Scores; sum: number } } {
  const a = duelScores(me, rng);
  const b = duelScores(them, rng);
  return { win: duelWin(a, b), me: { scores: a, sum: sumScores(a) }, them: { scores: b, sum: sumScores(b) } };
}

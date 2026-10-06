import type { Tuning } from '@dt/config';
import {
  DUEL_JUDGE_ITEMS,
  DUEL_JUDGES,
  luckRate,
  type DuelJudgeDto,
  type DuelJudgeId,
  type Rng,
} from '@dt/shared';

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

export type DuelTuning = Tuning['tower']['duel'];

/**
 * 五项评分（问题记录 396）。每项 = 属性 × 权重之和 + 特色菜每份价值 × mc + 波动，
 * 波动 = 创意 × wave × max(0, 1 + 幸运率) × rand，每项按色香味形养的顺序各抽一个随机数。每项 < 0 记 0，保留 1 位小数
 */
export function duelScores(s: DuelSide, t: DuelTuning, rng: Rng): Scores {
  const a = s.attrs;
  const amp = a.creatives * t.wave * Math.max(0, 1 + luckRate(a.luck));
  return t.weights.map((w) => {
    const base =
      a.cook * w.cook + a.cutting * w.cutting + a.fire * w.fire + a.season * w.season + s.mcPrice * w.mc;
    return Math.max(0, round1(base + amp * rng.next()));
  });
}

export function sumScores(s: Scores): number {
  return round1(s.reduce((x, y) => x + y, 0));
}

/** 从 10 位评委里不重复地抽 n 位（部分洗牌，抽 n 个随机数），按上场顺序 */
export function pickJudges(n: number, rng: Rng): DuelJudgeId[] {
  const ids: DuelJudgeId[] = DUEL_JUDGES.map((j) => j.id);
  const k = Math.min(n, ids.length);
  for (let i = 0; i < k; i++) {
    const j = i + rng.int(ids.length - i);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  return ids.slice(0, k);
}

export function sumJudged(judges: readonly DuelJudgeDto[], side: 'me' | 'them'): number {
  return round1(judges.reduce((x, j) => x + j[side], 0));
}

/**
 * 评委依次打分：比双方在关注项目上的和，高的一方得一票，相同谁都不得；一方先拿到 need 票就结束。
 * 赢 = 票多；票数相同时比上场评委的总分，总分也相同算挑战方赢（沿用原来的“总和 ≥ 对方”）
 */
export function judgeDuel(
  me: Scores,
  them: Scores,
  ids: readonly DuelJudgeId[],
  need: number,
): { win: boolean; judges: DuelJudgeDto[]; votes: [number, number] } {
  const judges: DuelJudgeDto[] = [];
  const votes: [number, number] = [0, 0];
  for (const id of ids) {
    const items = DUEL_JUDGE_ITEMS.get(id)!;
    const sum = (s: Scores) => round1(items.reduce((x, i) => x + (s[i] ?? 0), 0));
    const j = { id, me: sum(me), them: sum(them) };
    judges.push(j);
    if (j.me > j.them) votes[0]++;
    else if (j.them > j.me) votes[1]++;
    if (votes[0] >= need || votes[1] >= need) break;
  }
  const win =
    votes[0] !== votes[1] ? votes[0] > votes[1] : sumJudged(judges, 'me') >= sumJudged(judges, 'them');
  return { win, judges, votes };
}

/** 一局对决：随机数顺序是挑战方五项、被挑战方五项、再抽评委；过半票数赢 */
export function duel(
  me: DuelSide,
  them: DuelSide,
  t: DuelTuning,
  rng: Rng,
): {
  win: boolean;
  me: { scores: Scores; sum: number };
  them: { scores: Scores; sum: number };
  judges: DuelJudgeDto[];
  votes: [number, number];
  /** 这一局请了几位评委（有一方先过半就提前结束，上场的可能更少） */
  judgeCount: number;
} {
  const a = duelScores(me, t, rng);
  const b = duelScores(them, t, rng);
  const ids = pickJudges(t.judges, rng);
  const r = judgeDuel(a, b, ids, Math.floor(ids.length / 2) + 1);
  return {
    ...r,
    me: { scores: a, sum: sumScores(a) },
    them: { scores: b, sum: sumScores(b) },
    judgeCount: ids.length,
  };
}

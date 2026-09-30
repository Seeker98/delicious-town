import { GOODS, type Tuning } from '@dt/config';
import { buildPool, pickWeighted, type NpcKey, type Rng } from '@dt/shared';

/** [min, max] 闭区间里的整数 */
export function rollRange(range: readonly [number, number], rng: Rng): number {
  return range[0] + rng.int(range[1] - range[0] + 1);
}

/** 大胃哥的食材等级（规格书 12.2：50% 1 级 / 25% 2 / 13% 3 / 9% 4 / 3% 5） */
export function pickBigEaterLevel(weights: readonly number[], rng: Rng): number {
  const pool = buildPool(
    weights.map((w, i) => ({ level: i + 1, w })),
    (x) => x.w,
  );
  return pickWeighted(pool, rng).level;
}

/** 台词照原版 NPCTools */
export const NPC_TALK: Record<NpcKey, string> = {
  bigEater: '你真有品味! 我也是这样觉得的! 哈哈哈!',
  wenjie: '用了飘柔就明显气质上来了!',
  bro13: '爱就直接去做!!!',
};
export const BIG_EATER_FIRST_TALK = '你! 很有个性是吧!';

type ShakeTuning = Tuning['town']['shake'];

/** 摇到的银币 = (base − rand[0, rand)) × 星级，至少 1（设计文档 §3.4） */
export function shakeCoin(star: number, s: ShakeTuning, rng: Rng): number {
  return Math.max(1, (s.base - rng.int(s.rand)) * star);
}

/** 流水号尾数彩蛋（设计文档 裁定 14） */
export function shakeEgg(id: number, s: ShakeTuning): { goodsId: number; num: number } | null {
  if (id % s.eggMod !== s.eggTail) return null;
  return Math.floor(id / s.eggMod) % s.burgerEvery === 1
    ? { goodsId: GOODS.krabBurger, num: s.burgerNum }
    : { goodsId: GOODS.krabCoin, num: s.krabCoinNum };
}

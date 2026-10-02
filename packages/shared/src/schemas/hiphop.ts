import { z } from 'zod';

/**
 * 嘻哈男孩出没地点：1 菜场、2 商店、3 酒吧、4 协会、5 厨塔、6 神殿、9 某家餐厅（原版）；
 * 10 交易所、11 事件预测、12 一番赏、13 广场、14 菜园、15 外卖（问题记录 256，编号避开原版）
 */
export const HIPHOP_PLACES = [1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 14, 15, 9] as const;
export type HiphopPlace = (typeof HIPHOP_PLACES)[number];
export const HIPHOP_PLACE_NAMES: Record<HiphopPlace, string> = {
  1: '菜场',
  2: '商店',
  3: '酒吧',
  4: '协会',
  5: '厨塔',
  6: '神殿',
  9: '某家餐厅',
  10: '交易所',
  11: '事件预测',
  12: '一番赏',
  13: '广场',
  14: '菜园',
  15: '外卖',
};
/** 地点对应的功能开关：区服关掉这个功能时，嘻哈男孩不去那里（null 表示总是开着） */
export const HIPHOP_PLACE_FEATURE: Record<HiphopPlace, string | null> = {
  1: 'market',
  2: 'shop',
  3: 'bar',
  4: null,
  5: 'tower',
  6: 'temple',
  9: null,
  10: 'exchange',
  11: 'predict',
  12: 'kuji',
  13: 'town',
  14: 'yard',
  15: 'takeaway',
};

export const hiphopPlace = z
  .number()
  .int()
  .refine((p): p is HiphopPlace => (HIPHOP_PLACES as readonly number[]).includes(p));

export const hiphopQuery = z
  .object({
    place: z.coerce.number().int().optional(),
    restId: z.coerce.number().int().positive().optional(),
  })
  .refine((q) => (q.place === undefined) !== (q.restId === undefined));

export const hiphopTipBody = z.object({
  place: hiphopPlace,
  restId: z.number().int().positive().optional(),
  kind: z.enum(['food', 'coin', 'diamond']),
  num: z.number().int().min(1),
  foodsId: z.number().int().positive().optional(),
});
export type HiphopTipBody = z.infer<typeof hiphopTipBody>;

export const mayorBody = z.object({ place: hiphopPlace });

export type HiphopSpotDto =
  | { here: false }
  | {
      here: true;
      place: HiphopPlace;
      restId: number | null;
      food: { id: number; level: number };
      worth: number;
      myWeekWorth: number;
      closeAt: string;
    };

/** reply：thanks 没到门槛；wanted 到了门槛没中蟹币；krab 中了 */
export interface HiphopTipDto {
  worth: number;
  exp: number;
  krabCoin: number;
  tickets: number;
  rainbow: boolean;
  /** 打赏的是他想要的食材（或银币、钻石） */
  fresh: boolean;
  reply: 'thanks' | 'wanted' | 'krab';
}

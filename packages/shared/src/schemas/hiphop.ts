import { z } from 'zod';

/** 嘻哈男孩出没地点：1 菜场、2 商店、3 酒吧、4 协会、5 厨塔、6 神殿、9 某家餐厅 */
export const HIPHOP_PLACES = [1, 2, 3, 4, 5, 6, 9] as const;
export type HiphopPlace = (typeof HIPHOP_PLACES)[number];
export const HIPHOP_PLACE_NAMES: Record<HiphopPlace, string> = {
  1: '菜场',
  2: '商店',
  3: '酒吧',
  4: '协会',
  5: '厨塔',
  6: '神殿',
  9: '某家餐厅',
};

export const hiphopPlace = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(9),
]);

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

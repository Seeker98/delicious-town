import { z } from 'zod';

export const selectShardBody = z.object({ shardId: z.number().int().positive() });

export interface ShardDto {
  id: number;
  name: string;
  status: 'open' | 'closed';
  openedAt: string;
  hasRestaurant: boolean;
  /** 我在这个区服的店（界面改版 P11：切换区服页一服一张卡）；没开店为 null */
  rest: ShardRestDto | null;
}

export interface ShardRestDto {
  id: number;
  name: string;
  level: number;
  /** 选的头像编号，没选为 null */
  avatar: number | null;
  starLevel: number;
  streetId: number;
}

export interface SelectShardResult {
  shardId: number;
  restaurantId: number | null;
  /** 本区服蟹老板餐厅的编号（同 MeDto.npcRestId） */
  npcRestId: number | null;
}

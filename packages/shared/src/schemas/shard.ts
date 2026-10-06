import { z } from 'zod';

export const selectShardBody = z.object({ shardId: z.number().int().positive() });

export interface ShardDto {
  id: number;
  name: string;
  status: 'open' | 'closed';
  openedAt: string;
  hasRestaurant: boolean;
}

export interface SelectShardResult {
  shardId: number;
  restaurantId: number | null;
  /** 本区服蟹老板餐厅的编号（同 MeDto.npcRestId） */
  npcRestId: number | null;
}

import { SPONSOR_HATS, type HatTier } from '@dt/config';
import { HAT_PREFIX } from '@dt/shared';
import { recordChange } from '../../core/resources';
import type { Op } from '../../core/op';
import { createEquips } from './instances';

const TIER_OF = new Map<number, HatTier>(
  (Object.entries(SPONSOR_HATS) as Array<[HatTier, number]>).map(([tier, id]) => [id, tier]),
);

/** 命名帽子的显示名（设计 裁定 23） */
export function hatDisplayName(tier: HatTier, name: string): string {
  return `${HAT_PREFIX[tier]}•${name}之帽`;
}

/** 厨具实例的显示名：只有赞助帽子且有名字时才有，否则 null（前端用道具名） */
export function equipDisplayName(goodsId: number, customName: string | null): string | null {
  const tier = TIER_OF.get(goodsId);
  return tier && customName ? hatDisplayName(tier, customName) : null;
}

/** 发一顶命名帽子：生成实例、写名字、记流水；返回实例 id */
export async function grantHatOp(op: Op, tier: HatTier, name: string, source: string): Promise<number> {
  const goodsId = SPONSOR_HATS[tier];
  const [id] = await createEquips(op.tx, op.config, op.rest.id, goodsId, 1, op.now, op.rng);
  await op.tx.updateTable('equip').set({ custom_name: name }).where('id', '=', id!).execute();
  recordChange(op, 'goods', 1, { source }, goodsId);
  return id!;
}

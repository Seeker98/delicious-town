import type { GameConfig } from '@dt/config';

/**
 * 加成来源的显示名称（问题记录：生效的加成里显示 equip）。
 * device 按设施位；equip 是穿戴厨具的幸运合计；suit 的 sourceId = 套装 id × 10 + 档位下标（2B 设计文档）；
 * honor / street 是道具
 */
export function effectSourceName(e: { sourceType: string; sourceId: number }, config: GameConfig): string {
  if (e.sourceType === 'device') return config.devices.get(e.sourceId)?.name ?? '设施';
  if (e.sourceType === 'equip') return '厨具';
  if (e.sourceType === 'suit') {
    const suit = config.suits.get(Math.floor(e.sourceId / 10));
    const tier = suit?.tiers[e.sourceId % 10];
    return suit && tier ? `${suit.name}（${tier.need} 件）` : '套装';
  }
  return config.goods.get(e.sourceId)?.name ?? e.sourceType;
}

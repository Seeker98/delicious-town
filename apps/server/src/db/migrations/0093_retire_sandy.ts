import type { Kysely } from 'kysely';
import { dropRetiredGoods } from './0071_item_cuts';

/**
 * 珊迪、派大星、海绵宝宝下架（用户 2026-10-23）：外卖神秘顾客、烹制特色菜点赞不再发；
 * 持有的、正在生效的加成来源都清掉，加成缓存标脏（下次结算或操作按没有它们重算）。
 * down 什么也不做：下架的道具回不来
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  await dropRetiredGoods(db, RETIRED_GOODS);
}

/** 珊迪、派大星、海绵宝宝 */
export const RETIRED_GOODS = [60506, 60507, 60508];

export async function down(): Promise<void> {
  // 下架的道具回不来
}

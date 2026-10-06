import { retiredOf, type GameConfig } from '@dt/config';
import type { AdminItemsDto } from '@dt/shared';
import { analyzeItems } from '../../items/analyze';

/**
 * 后台道具整理只读页（问题记录 429）：和本地道具整理工具（pnpm -F @dt/server items）同一份分析，
 * 按线上正在用的配置算；配置在进程里不变，算一次缓存起来。
 * 下架仍用本地工具改 retired.json、提交、发版（用户 2026-10-06 定：后台只读）。
 * 已下架的道具在配置里去掉了奖励档位、不在商店卖，所以这里看到的是下架以后的来源
 */
export function createAdminItems(config: GameConfig) {
  let cached: AdminItemsDto | null = null;
  return {
    report(): AdminItemsDto {
      cached ??= analyzeItems(config, retiredOf(config.bundle));
      return cached;
    },
  };
}

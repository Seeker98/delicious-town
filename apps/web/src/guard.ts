import type { MeDto } from '@dt/shared';

export interface RouteFlags {
  /** 不需要登录 */
  public?: boolean;
  /** 只给未登录用户看（登录、注册、忘记密码） */
  guestOnly?: boolean;
  /** 需要当前区服已有餐厅 */
  needRestaurant?: boolean;
  /** 不要求开店，但已开店时按游戏内显示（底部导航、返回） */
  gameChrome?: boolean;
}

export type GuardResult = true | { name: string; query?: Record<string, string> };

export function resolveGuard(flags: RouteFlags, me: MeDto | null, fullPath: string): GuardResult {
  if (flags.public) return me && flags.guestOnly ? { name: me.restaurantId ? 'home' : 'shards' } : true;
  if (!me) return { name: 'login', query: { redirect: fullPath } };
  if (flags.needRestaurant && !me.restaurantId) return { name: me.shardId ? 'create-restaurant' : 'shards' };
  return true;
}

import type { RestLogDto } from '@dt/shared';

/**
 * 餐厅动态"看过"到哪一条（问题记录 553）：好友页动态卡读出来时记下最新一条的时间，首页比它新的加小圆点。
 * 只是这台设备上的提示，存不了（隐私模式等）就当都没看过
 */
const seenKey = (restId: number) => `dt.feedSeen.${restId}`;

export function feedSeenAt(restId: number): string | null {
  try {
    return localStorage.getItem(seenKey(restId));
  } catch {
    return null;
  }
}

/** items 新的在前；只往后记，不倒回去 */
export function markFeedSeen(restId: number, items: RestLogDto[]): void {
  const top = items[0]?.at;
  if (!top) return;
  const cur = feedSeenAt(restId);
  if (cur !== null && cur >= top) return;
  try {
    localStorage.setItem(seenKey(restId), top);
  } catch {
    // 存不了就算了，下次照样显示小圆点
  }
}

/** 帖子被回复的动态点了去那个帖子 */
export function feedLink(item: RestLogDto): string | null {
  return item.type === 'forum.replied' && typeof item.params.postId === 'number'
    ? `/forum/${item.params.postId}`
    : null;
}

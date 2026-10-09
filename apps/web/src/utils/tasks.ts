import type { QuestDto, QuestsDto } from '@dt/shared';

/** 任务页的三个选项卡（问题记录：任务分卡；用户 2026-10-08 定每周单独一卡） */
export const TASK_TABS = ['main', 'weekly', 'side'] as const;
export type TaskTab = (typeof TASK_TABS)[number];

const canClaim = (x: QuestDto) => x.done && !x.claimed;

/** 各卡有没有能领的：任务页卡上的礼物图标、首页任务入口的礼物图标（问题记录 555）都按这个 */
export function claimableTabs(q: QuestsDto | null): Record<TaskTab, boolean> {
  if (!q) return { main: false, weekly: false, side: false };
  return {
    main: q.main.some(canClaim) || (q.leftover ?? []).some(canClaim) || !!q.chapter?.claimable,
    weekly: !!q.weekly && (q.weekly.quests.some(canClaim) || q.weekly.full.claimable),
    side: q.lines.some((l) => !!l.quest && l.lockedStar === null && canClaim(l.quest)),
  };
}

/** 第一个有奖励可领的卡，按 主线 → 每周 → 支线；都没有为 null */
export function firstClaimableTab(q: QuestsDto | null): TaskTab | null {
  const c = claimableTabs(q);
  return TASK_TABS.find((x) => c[x]) ?? null;
}

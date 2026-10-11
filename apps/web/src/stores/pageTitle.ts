import { defineStore } from 'pinia';
import { onBeforeUnmount, watchEffect } from 'vue';
import type { ArtName } from '../art/generated/names';

/** 顶栏右边的一枚余额胶囊（界面改版 P9：酒吧游戏页的礼券、蟹币、银币） */
export interface PageChip {
  art: ArtName;
  text: string;
  /** 读屏念的完整说法（“神秘礼券 12”） */
  label: string;
}

/** 页面的动态标题（店名、帖子标题、NPC 名；界面改版 P2a）：顶栏优先显示它，没有时显示路由标题 */
export const usePageTitleStore = defineStore('pageTitle', {
  state: () => ({ title: null as string | null, chip: null as PageChip | null }),
});

/** 页面里调用：标题跟着 get() 变；数据还没读回来（空）时不写；页面卸载时清掉，不残留到下一页 */
export function usePageTitle(get: () => string | null | undefined): void {
  const s = usePageTitleStore();
  const stop = watchEffect(() => {
    s.title = get() || null;
  });
  onBeforeUnmount(() => {
    stop();
    s.title = null;
  });
}

/** 页面里调用：顶栏右边显示一枚余额胶囊，跟着 get() 变；页面卸载时清掉 */
export function usePageChip(get: () => PageChip | null | undefined): void {
  const s = usePageTitleStore();
  const stop = watchEffect(() => {
    s.chip = get() ?? null;
  });
  onBeforeUnmount(() => {
    stop();
    s.chip = null;
  });
}

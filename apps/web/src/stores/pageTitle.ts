import { defineStore } from 'pinia';
import { onBeforeUnmount, watchEffect } from 'vue';

/** 页面的动态标题（店名、帖子标题、NPC 名；界面改版 P2a）：顶栏优先显示它，没有时显示路由标题 */
export const usePageTitleStore = defineStore('pageTitle', {
  state: () => ({ title: null as string | null }),
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

import { defineStore } from 'pinia';

/** 达成成就的提示（成就系统 2026-10-19）：顶上浮出一张卡，3.5 秒收起；同时最多 3 张 */
export interface AchToast {
  id: number;
  key: string;
  pts: number;
}

let seq = 0;
const MAX = 3;
const MS = 3500;

export const useAchieveToastStore = defineStore('achieveToast', {
  state: () => ({ items: [] as AchToast[] }),
  actions: {
    push(key: string, pts: number) {
      const id = ++seq;
      this.items.push({ id, key, pts });
      while (this.items.length > MAX) this.items.shift();
      setTimeout(() => this.remove(id), MS);
    },
    remove(id: number) {
      this.items = this.items.filter((x) => x.id !== id);
    },
  },
});

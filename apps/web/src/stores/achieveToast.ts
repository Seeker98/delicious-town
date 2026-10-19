import { defineStore } from 'pinia';

/** 达成成就的提示（成就系统 2026-10-19）：顶上浮出一张卡，3.5 秒收起；同时最多 3 张 */
export interface AchToast {
  id: number;
  key: string;
  pts: number;
  /** 跨过里程碑解锁的头像框编号（成就 PR③）：这时 key 为空，pts 是里程碑的成就点 */
  frame?: number;
}

let seq = 0;
const MAX = 3;
const MS = 3500;

export const useAchieveToastStore = defineStore('achieveToast', {
  state: () => ({ items: [] as AchToast[] }),
  actions: {
    push(key: string, pts: number, frame?: number) {
      const id = ++seq;
      this.items.push(frame === undefined ? { id, key, pts } : { id, key, pts, frame });
      while (this.items.length > MAX) this.items.shift();
      setTimeout(() => this.remove(id), MS);
    },
    remove(id: number) {
      this.items = this.items.filter((x) => x.id !== id);
    },
  },
});

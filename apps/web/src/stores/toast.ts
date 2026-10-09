import { defineStore } from 'pinia';

export interface Toast {
  id: number;
  text: string;
  variant: 'success' | 'danger' | 'info';
  /**
   * 显示时再生成文字：得失提示里的道具名要用道具目录，推送时目录可能还没加载完，
   * 目录到了以后名字跟着换（backlog 测试不稳定：以前一直显示"道具27"这类占位名）
   */
  render?: () => string;
}

let seq = 0;
/** 同时显示的上限、各种提示停留的时间（问题记录 545） */
const MAX_TOASTS = 2;
const TOAST_MS: Record<Toast['variant'], number> = { success: 2000, info: 3000, danger: 5000 };

export const useToastStore = defineStore('toast', {
  state: () => ({ items: [] as Toast[] }),
  actions: {
    /**
     * ms 不传时：成功提示 2 秒、普通提示 3 秒、错误提示 5 秒（问题记录 344：提示不能点掉了，错误多停一会儿；
     * 545：改成底部的小胶囊，成功的停短一点）。最多同时 2 条，新的挤掉最早的
     */
    push(text: string, variant: Toast['variant'] = 'success', ms?: number, render?: () => string) {
      const id = ++seq;
      this.items.push({ id, text, variant, ...(render ? { render } : {}) });
      while (this.items.length > MAX_TOASTS) this.items.shift();
      setTimeout(() => this.remove(id), ms ?? TOAST_MS[variant]);
    },
    remove(id: number) {
      this.items = this.items.filter((t) => t.id !== id);
    },
  },
});

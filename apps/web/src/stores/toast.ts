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

export const useToastStore = defineStore('toast', {
  state: () => ({ items: [] as Toast[] }),
  actions: {
    push(text: string, variant: Toast['variant'] = 'success', ms = 3000, render?: () => string) {
      const id = ++seq;
      this.items.push({ id, text, variant, ...(render ? { render } : {}) });
      if (this.items.length > 5) this.items.shift();
      setTimeout(() => this.remove(id), ms);
    },
    remove(id: number) {
      this.items = this.items.filter((t) => t.id !== id);
    },
  },
});

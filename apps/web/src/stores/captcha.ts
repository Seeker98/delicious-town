import { defineStore } from 'pinia';

/** 当前这一次验证的等待者：放在 store 外面，不进响应式状态 */
let waiting: Promise<string | null> | null = null;
let settle: ((token: string | null) => void) | null = null;

/**
 * 人机验证框（防脚本 PR②）：后台点名的账号写操作被要求验证时弹出。
 * 同时撞上验证的几个请求共用这一次：`ask` 在已有一个等着时返回同一个 Promise
 */
export const useCaptchaStore = defineStore('captcha', {
  state: () => ({ open: false }),
  actions: {
    ask(): Promise<string | null> {
      if (waiting) return waiting;
      this.open = true;
      waiting = new Promise((resolve) => {
        settle = resolve;
      });
      return waiting;
    },
    /** 拿到令牌，或关掉（null） */
    answer(token: string | null) {
      const s = settle;
      waiting = null;
      settle = null;
      this.open = false;
      s?.(token);
    },
  },
});

import { defineStore } from 'pinia';
import { endpoints } from '../api/endpoints';

/**
 * 顶栏未读数：路由切换时刷新，30 秒内不重复请求（领取、删除、已读后强制刷新）。
 * 换号时 $reset 清掉 pending：清空之后才回来的那次请求认不出自己，就不写数、不记节流（稳健性批终审）
 */
export const useMailStore = defineStore('mail', {
  state: () => ({ unread: 0, at: 0, pending: null as Promise<void> | null }),
  actions: {
    refresh(opts: { force?: boolean } = {}): Promise<void> {
      if (this.pending) return this.pending;
      if (!opts.force && Date.now() - this.at < 30_000) return Promise.resolve();
      const p: Promise<void> = Promise.resolve()
        .then(() => endpoints.mailUnread())
        .then((r) => {
          if (this.pending !== p) return;
          this.unread = r.count;
          this.at = Date.now();
        })
        .catch(() => undefined)
        .finally(() => {
          if (this.pending === p) this.pending = null;
        });
      this.pending = p;
      return p;
    },
  },
});

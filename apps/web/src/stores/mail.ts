import { defineStore } from 'pinia';
import { endpoints } from '../api/endpoints';

/** 顶栏未读数：路由切换时刷新，30 秒内不重复请求（领取、删除、已读后强制刷新） */
export const useMailStore = defineStore('mail', {
  state: () => ({ unread: 0, at: 0, pending: null as Promise<void> | null }),
  actions: {
    refresh(opts: { force?: boolean } = {}): Promise<void> {
      if (this.pending) return this.pending;
      if (!opts.force && Date.now() - this.at < 30_000) return Promise.resolve();
      this.pending = Promise.resolve()
        .then(() => endpoints.mailUnread())
        .then((r) => {
          this.unread = r.count;
          this.at = Date.now();
        })
        .catch(() => undefined)
        .finally(() => {
          this.pending = null;
        });
      return this.pending;
    },
  },
});

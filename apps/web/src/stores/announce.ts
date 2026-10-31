import { defineStore } from 'pinia';
import type { AnnouncementDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';

/** 公告这么久内读过就用读过的（性能 2026-10-31） */
const FRESH_MS = 60_000;

/**
 * 进游戏后的公告列表（子项目 6A）：首页横幅和重要公告弹窗共用一次请求（性能 2026-10-31：原来进首页各读一次）。
 * 一起要时共用在读的请求；一分钟内读过直接用
 */
export const useAnnounceStore = defineStore('announce', {
  state: () => ({ items: [] as AnnouncementDto[], at: 0 }),
  actions: {
    load(): Promise<AnnouncementDto[]> {
      const p = inflight.get(this);
      if (p) return p;
      if (this.at > 0 && Date.now() - this.at < FRESH_MS) return Promise.resolve(this.items);
      const req = endpoints
        .announcements()
        .then((r) => {
          this.items = r.items;
          this.at = Date.now();
          return r.items;
        })
        .finally(() => inflight.delete(this));
      inflight.set(this, req);
      return req;
    },
    /** 弹窗里关掉了一条重要公告：记着的也改成已看，一分钟内重新挂载弹窗时不再弹 */
    markSeen(id: number) {
      this.items = this.items.map((a) => (a.id === id ? { ...a, seen: true } : a));
    },
  },
});

/** 正在读的请求按 store 实例记（同 restaurant store：测试里每条用例新建 pinia） */
const inflight = new WeakMap<object, Promise<AnnouncementDto[]>>();

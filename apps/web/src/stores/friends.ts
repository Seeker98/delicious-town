import { defineStore } from 'pinia';
import { endpoints } from '../api/endpoints';

/** 红点这么久内读过就不再读（性能 2026-10-31：原来每次切页面都读一次整张申请列表） */
const PENDING_FRESH_MS = 30_000;

/**
 * 待处理的好友申请数（导航红点）；换号 $reset 后才回来的请求不写（epoch 每次 $reset 换一个新对象）。
 * seq（backlog 1010）：只认最后一次请求或直接写入，先发后到的旧结果不覆盖。
 * at：上次发请求或直接写入的时间，30 秒内切页面不再读（同顶栏未读邮件）；$reset 后清零
 */
export const useFriendsStore = defineStore('friends', {
  state: () => ({ pending: 0, epoch: {} as object, seq: 0, at: 0 }),
  actions: {
    async refreshPending(opts: { force?: boolean } = {}) {
      if (!opts.force && this.at > 0 && Date.now() - this.at < PENDING_FRESH_MS) return;
      this.at = Date.now();
      const epoch = this.epoch;
      const seq = ++this.seq;
      try {
        const n = (await endpoints.friendRequests()).length;
        if (this.epoch === epoch && this.seq === seq) this.pending = n;
      } catch {
        // 红点取不到不影响使用；下次切页面再试
        if (this.epoch === epoch && this.seq === seq) this.at = 0;
      }
    },
    /** 页面刚读到申请列表时直接写，之前发出的请求回来不再覆盖 */
    setPending(n: number) {
      this.seq++;
      this.pending = n;
      this.at = Date.now();
    },
  },
});

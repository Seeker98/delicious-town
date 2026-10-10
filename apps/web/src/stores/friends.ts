import { defineStore } from 'pinia';
import { endpoints } from '../api/endpoints';

/**
 * 待处理的好友申请数（导航红点）；换号 $reset 后才回来的请求不写（epoch 每次 $reset 换一个新对象）。
 * seq（backlog 1010）：只认最后一次请求或直接写入，先发后到的旧结果不覆盖
 */
export const useFriendsStore = defineStore('friends', {
  state: () => ({ pending: 0, epoch: {} as object, seq: 0 }),
  actions: {
    async refreshPending() {
      const epoch = this.epoch;
      const seq = ++this.seq;
      try {
        const n = (await endpoints.friendRequests()).length;
        if (this.epoch === epoch && this.seq === seq) this.pending = n;
      } catch {
        // 红点取不到不影响使用
      }
    },
    /** 页面刚读到申请列表时直接写，之前发出的请求回来不再覆盖 */
    setPending(n: number) {
      this.seq++;
      this.pending = n;
    },
  },
});

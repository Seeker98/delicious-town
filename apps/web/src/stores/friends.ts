import { defineStore } from 'pinia';
import { endpoints } from '../api/endpoints';

/** 待处理的好友申请数（导航红点）；换号 $reset 后才回来的请求不写（epoch 每次 $reset 换一个新对象） */
export const useFriendsStore = defineStore('friends', {
  state: () => ({ pending: 0, epoch: {} as object }),
  actions: {
    async refreshPending() {
      const epoch = this.epoch;
      try {
        const n = (await endpoints.friendRequests()).length;
        if (this.epoch === epoch) this.pending = n;
      } catch {
        // 红点取不到不影响使用
      }
    },
  },
});

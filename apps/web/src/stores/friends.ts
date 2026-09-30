import { defineStore } from 'pinia';
import { endpoints } from '../api/endpoints';

/** 待处理的好友申请数（导航红点） */
export const useFriendsStore = defineStore('friends', {
  state: () => ({ pending: 0 }),
  actions: {
    async refreshPending() {
      try {
        this.pending = (await endpoints.friendRequests()).length;
      } catch {
        // 红点取不到不影响使用
      }
    },
  },
});

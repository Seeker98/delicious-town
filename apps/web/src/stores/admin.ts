import { defineStore } from 'pinia';
import type { AdminMeDto, AdminShardDto } from '@dt/shared';
import { adminApi } from '../api/admin';

export const useAdminStore = defineStore('admin', {
  state: () => ({
    me: null as AdminMeDto | null,
    loaded: false,
    shards: [] as AdminShardDto[],
    /** 后台当前查看的区服 */
    shardId: null as number | null,
  }),
  getters: {
    isAdmin: (s) => s.me?.role === 'admin',
  },
  actions: {
    async load() {
      try {
        this.me = await adminApi.me();
        this.shards = await adminApi.shards();
        this.shardId ??= this.shards[0]?.id ?? null;
      } catch {
        this.me = null;
      } finally {
        this.loaded = true;
      }
    },
  },
});

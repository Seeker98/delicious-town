import { defineStore } from 'pinia';
import type { ShardDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';

/**
 * 区服列表（界面改版 P11）：切换区服页一服一张卡；“我”、账号页、开店页要写现在的区服名。
 * 读过一次就留着，切换区服页每次打开重新读（refresh）
 */
export const useShardsStore = defineStore('shards', {
  state: () => ({ list: null as ShardDto[] | null }),
  getters: {
    nameOf:
      (s) =>
      (id: number | null | undefined): string =>
        s.list?.find((x) => x.id === id)?.name ?? '',
  },
  actions: {
    async refresh(): Promise<ShardDto[]> {
      this.list = await endpoints.listShards();
      return this.list;
    },
    /** 没读过才读；读失败不报错（只是区服名不显示） */
    async load(): Promise<void> {
      if (this.list) return;
      await this.refresh().catch(() => undefined);
    },
  },
});

import { defineStore } from 'pinia';
import type { RestaurantDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';

export const useRestaurantStore = defineStore('restaurant', {
  state: () => ({
    rest: null as RestaurantDto | null,
    /**
     * 食谱页搬街提示用的下一星要求（backlog 384 审查）：按“店 id:当前星级”记住，离开食谱页再回来不重读；
     * 升星后星级变了才重读。value 为 null 表示下一星不用学菜或已满星
     */
    starNeed: null as { key: string; value: { star: number; need: number } | null } | null,
  }),
  getters: {
    /** 本区服这个功能是否开着；还没读到餐厅时当作开着（问题记录 248） */
    featureOn: (s) => (name: string) => !(s.rest?.disabledFeatures ?? []).includes(name),
  },
  actions: {
    async refresh(): Promise<RestaurantDto> {
      this.rest = await endpoints.overview();
      return this.rest;
    },
  },
});

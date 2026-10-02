import { defineStore } from 'pinia';
import type { RestaurantDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';

export const useRestaurantStore = defineStore('restaurant', {
  state: () => ({ rest: null as RestaurantDto | null }),
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

import { defineStore } from 'pinia';
import type { RestaurantDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';

export const useRestaurantStore = defineStore('restaurant', {
  state: () => ({ rest: null as RestaurantDto | null }),
  actions: {
    async refresh(): Promise<RestaurantDto> {
      this.rest = await endpoints.overview();
      return this.rest;
    },
  },
});

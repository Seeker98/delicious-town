import { defineStore } from 'pinia';
import type { MeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';

export const useSessionStore = defineStore('session', {
  state: () => ({ me: null as MeDto | null, loaded: false }),
  actions: {
    async load() {
      try {
        this.me = await endpoints.me();
      } catch {
        this.me = null;
      } finally {
        this.loaded = true;
      }
    },
    async logout() {
      try {
        await endpoints.logout();
      } finally {
        this.me = null;
      }
    },
  },
});

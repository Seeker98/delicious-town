import { defineStore } from 'pinia';
import type { CatalogDto, CatalogFoodDto, CatalogGoodsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { setNameResolver } from '../i18n/zh-CN';

const KEY = 'dt_catalog';

export const useCatalogStore = defineStore('catalog', {
  state: () => ({
    goodsMap: new Map<number, CatalogGoodsDto>(),
    foodsMap: new Map<number, CatalogFoodDto>(),
    streets: [] as CatalogDto['streets'],
    loaded: false,
  }),
  actions: {
    apply(c: CatalogDto) {
      this.goodsMap = new Map(c.goods.map((g) => [g.id, g]));
      this.foodsMap = new Map(c.foods.map((f) => [f.id, f]));
      this.streets = c.streets;
      this.loaded = true;
      setNameResolver({ goodsName: (id) => this.goodsName(id), foodName: (id) => this.foodName(id) });
    },
    /** 目录按配置版本缓存在浏览器里（只是加速；读不到时直接请求） */
    async load() {
      if (this.loaded) return;
      try {
        const cached = localStorage.getItem(KEY);
        if (cached) this.apply(JSON.parse(cached) as CatalogDto);
      } catch {
        // 存储不可用时忽略
      }
      const fresh = await endpoints.catalog();
      this.apply(fresh);
      try {
        localStorage.setItem(KEY, JSON.stringify(fresh));
      } catch {
        // 忽略
      }
    },
    goodsName(id: number): string {
      return this.goodsMap.get(id)?.name ?? `道具${id}`;
    },
    foodName(id: number): string {
      return this.foodsMap.get(id)?.name ?? `食材${id}`;
    },
    goods(id: number): CatalogGoodsDto | undefined {
      return this.goodsMap.get(id);
    },
    food(id: number): CatalogFoodDto | undefined {
      return this.foodsMap.get(id);
    },
    streetName(id: number): string {
      return this.streets.find((s) => s.id === id)?.name ?? '';
    },
  },
});

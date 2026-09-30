import { defineStore } from 'pinia';
import type { CatalogDto, CatalogFoodDto, CatalogGoodsDto, CatalogMcDto, LooksDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { setNameResolver } from '../i18n/zh-CN';

const KEY = 'dt_catalog';

export const useCatalogStore = defineStore('catalog', {
  state: () => ({
    goodsMap: new Map<number, CatalogGoodsDto>(),
    foodsMap: new Map<number, CatalogFoodDto>(),
    mcMap: new Map<number, CatalogMcDto>(),
    seedsMap: new Map<number, { id: number; foodsId: number; level: number }>(),
    streets: [] as CatalogDto['streets'],
    looks: null as LooksDto | null,
    loaded: false,
  }),
  actions: {
    apply(c: CatalogDto) {
      this.goodsMap = new Map(c.goods.map((g) => [g.id, g]));
      this.foodsMap = new Map(c.foods.map((f) => [f.id, f]));
      this.streets = c.streets;
      this.looks = c.looks ?? null;
      this.loaded = true;
      this.mcMap = new Map((c.mysterious ?? []).map((m) => [m.id, m]));
      this.seedsMap = new Map((c.seeds ?? []).map((s) => [s.id, s]));
      setNameResolver({
        goodsName: (id) => this.goodsName(id),
        foodName: (id) => this.foodName(id),
        mcName: (id) => this.mcName(id),
      });
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
    mcName(id: number): string {
      return this.mcMap.get(id)?.name ?? `特色菜${id}`;
    },
    seedName(id: number): string {
      const s = this.seedsMap.get(id);
      return s ? `${this.foodName(s.foodsId)}种子` : `种子${id}`;
    },
    mc(id: number): CatalogMcDto | undefined {
      return this.mcMap.get(id);
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

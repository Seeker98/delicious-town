import { defineStore } from 'pinia';
import type {
  CatalogDataEntry,
  CatalogDataKind,
  CatalogDto,
  CatalogFoodDto,
  CatalogGoodsDto,
  CatalogMcDto,
  LooksDto,
} from '@dt/shared';
import type { Locale } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { activeLocale } from '../i18n';
import { setNameResolver } from '../i18n/zh-CN';
import { activeMessages } from '../i18n';

/** 浏览器缓存按语言分开（问题记录 272） */
const keyOf = (l: string) => `dt_catalog_${l}`;

export const useCatalogStore = defineStore('catalog', {
  state: () => ({
    goodsMap: new Map<number, CatalogGoodsDto>(),
    foodsMap: new Map<number, CatalogFoodDto>(),
    mcMap: new Map<number, CatalogMcDto>(),
    seedsMap: new Map<number, { id: number; foodsId: number; level: number }>(),
    streets: [] as CatalogDto['streets'],
    looks: null as LooksDto | null,
    weatherMap: new Map<number, string>(),
    /** 天气效果说明（问题记录 272 起按语言） */
    weatherNotes: new Map<number, string>(),
    /** 设施、套装的名字：加成来源用（问题记录 272） */
    devicesMap: new Map<number, string>(),
    suitsMap: new Map<number, NonNullable<CatalogDto['suits']>[number]>(),
    /** 任务、厨塔各层等服务端直接给名字的数据（问题记录 272） */
    dataMap: new Map<string, CatalogDataEntry>(),
    loaded: false,
    /** 上次从服务器读目录的时间（毫秒）：refreshIfMissing 限频用 */
    fetchedAt: 0,
  }),
  actions: {
    apply(c: CatalogDto) {
      this.goodsMap = new Map(c.goods.map((g) => [g.id, g]));
      this.foodsMap = new Map(c.foods.map((f) => [f.id, f]));
      this.streets = c.streets;
      this.weatherMap = new Map(c.weather.map((w) => [w.id, w.name]));
      this.weatherNotes = new Map(c.weather.flatMap((w) => (w.note ? [[w.id, w.note] as const] : [])));
      this.devicesMap = new Map(c.devices.map((d) => [d.id, d.name]));
      this.suitsMap = new Map((c.suits ?? []).map((s) => [s.id, s]));
      this.dataMap = new Map(
        Object.entries(c.data ?? {}).flatMap(([k, list]) => list.map((x) => [`${k}:${x.id}`, x] as const)),
      );
      this.looks = c.looks ?? null;
      this.loaded = true;
      this.mcMap = new Map((c.mysterious ?? []).map((m) => [m.id, m]));
      this.seedsMap = new Map((c.seeds ?? []).map((s) => [s.id, s]));
      setNameResolver({
        goodsName: (id) => this.goodsName(id),
        foodName: (id) => this.foodName(id),
        mcName: (id) => this.mcName(id),
        seedName: (id) => this.seedName(id),
      });
    },
    /** 目录按配置版本缓存在浏览器里（只是加速；读不到时直接请求） */
    async load() {
      if (this.loaded) return;
      const l = activeLocale();
      try {
        const cached = localStorage.getItem(keyOf(l));
        if (cached) this.apply(JSON.parse(cached) as CatalogDto);
      } catch {
        // 存储不可用时忽略
      }
      await this.reload(l);
    },
    /** 按语言重新读目录（切换语言时调用，问题记录 272） */
    async reload(l: Locale = activeLocale()): Promise<void> {
      const fresh = await endpoints.catalog(l);
      // 读的过程中又切了语言：丢掉过时的结果，按新语言重读（首次读目录时 set() 不会替我们重读）
      if (l !== activeLocale()) return this.reload(activeLocale());
      this.apply(fresh);
      this.fetchedAt = Date.now();
      try {
        localStorage.setItem(keyOf(l), JSON.stringify(fresh));
      } catch {
        // 忽略
      }
    },
    /**
     * 有目录里没有的道具 id 时重新读一次目录（问题记录 276）：页面开着时服务器发版加了新道具，
     * 不刷新页面也能显示名字和类型。一分钟最多重读一次
     */
    async refreshIfMissing(goodsIds: number[]): Promise<void> {
      if (goodsIds.every((id) => this.goodsMap.has(id))) return;
      if (Date.now() - this.fetchedAt < 60_000) return;
      this.fetchedAt = Date.now();
      try {
        await this.reload();
      } catch {
        // 读不到就沿用旧目录，名字显示成"道具 id"（各语言的占位）
      }
    },
    goodsName(id: number): string {
      return this.goodsMap.get(id)?.name ?? activeMessages().errors.fallbackName.goods(id);
    },
    foodName(id: number): string {
      return this.foodsMap.get(id)?.name ?? activeMessages().errors.fallbackName.food(id);
    },
    mcName(id: number): string {
      return this.mcMap.get(id)?.name ?? activeMessages().errors.fallbackName.mc(id);
    },
    seedName(id: number): string {
      const s = this.seedsMap.get(id);
      const f = activeMessages().errors.fallbackName;
      return s ? f.seedOf(this.foodName(s.foodsId)) : f.seed(id);
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
    /** fallback：目录里没有时用的名字（通常是服务端给的），不传时写"天气 id" */
    weatherName(id: number, fallback?: string): string {
      return this.weatherMap.get(id) ?? fallback ?? activeMessages().errors.fallbackName.weather(id);
    },
    /** 按 id 取当前语言的数据名字；目录里没有（旧缓存）时返回 undefined，调用处用服务端给的原文 */
    data(kind: CatalogDataKind, id: number): CatalogDataEntry | undefined {
      return this.dataMap.get(`${kind}:${id}`);
    },
    weatherNote(id: number): string | undefined {
      return this.weatherNotes.get(id);
    },
    /** 个性图标的名字和说明 */
    icon(key: string): LooksDto['icons'][number] | undefined {
      return this.looks?.icons.find((x) => x.key === key);
    },
    deviceName(id: number): string | undefined {
      return this.devicesMap.get(id);
    },
    suit(id: number): NonNullable<CatalogDto['suits']>[number] | undefined {
      return this.suitsMap.get(id);
    },
    streetName(id: number, fallback = ''): string {
      return this.streets.find((s) => s.id === id)?.name ?? fallback;
    },
  },
});

import { defineStore } from 'pinia';
import type {
  CatalogAchLineDto,
  CatalogTrophyDto,
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
import { CONTENT_ART, type ArtName } from '../art/generated/names';
import { goodsArt } from '../utils/goodsArt';
import { achName as achNameOf, trophyName as trophyNameOf } from '../utils/achieve';
import { activeLocale } from '../i18n';
import { setNameResolver } from '../i18n/zh-CN';
import { activeMessages } from '../i18n';

/** 浏览器缓存按语言分开（问题记录 272） */
const keyOf = (l: string) => `dt_catalog_${l}`;

/**
 * 正在进行的首次读取：几处同时调 load 时共用。按目录实例记（换了 pinia 就是新的一份），
 * 不放模块级变量：测试里没等上一条读完，下一条会挂到旧请求上（backlog）
 */
const loadingOf = new WeakMap<object, Promise<void>>();
/**
 * 当前用着的目录原文和语言（按目录实例记）：启动时先用浏览器里存的，再请求一次；
 * 没变时服务端回 304，浏览器照样给整份内容，一样就不再重建一遍、不再写回浏览器（约 800KB）
 */
const appliedOf = new WeakMap<object, { l: Locale; json: string }>();

export const useCatalogStore = defineStore('catalog', {
  state: () => ({
    goodsMap: new Map<number, CatalogGoodsDto>(),
    foodsMap: new Map<number, CatalogFoodDto>(),
    mcMap: new Map<number, CatalogMcDto>(),
    streets: [] as CatalogDto['streets'],
    looks: null as LooksDto | null,
    weatherMap: new Map<number, string>(),
    /** 天气效果说明（问题记录 272 起按语言） */
    weatherNotes: new Map<number, string>(),
    /** 天气大类、是否特殊天气（天气改版；旧目录缓存没有） */
    weatherKinds: new Map<number, { type: number; special: boolean }>(),
    /** 设施、套装的名字：加成来源用（问题记录 272） */
    devicesMap: new Map<number, string>(),
    suitsMap: new Map<number, NonNullable<CatalogDto['suits']>[number]>(),
    /** 任务、厨塔各层等服务端直接给名字的数据（问题记录 272） */
    dataMap: new Map<string, CatalogDataEntry>(),
    /** 成就线（菜系线已展开）、成就编号、奖杯（成就系统 2026-10-19；旧目录缓存没有） */
    achLines: [] as CatalogAchLineDto[],
    achById: new Map<string, { line: CatalogAchLineDto; tier: CatalogAchLineDto['tiers'][number] }>(),
    trophyMap: new Map<string, CatalogTrophyDto>(),
    loaded: false,
    /** 上次从服务器读目录的时间（毫秒）：refreshIfMissing 限频用 */
    fetchedAt: 0,
  }),
  actions: {
    apply(c: CatalogDto) {
      appliedOf.delete(this);
      this.goodsMap = new Map(c.goods.map((g) => [g.id, g]));
      this.foodsMap = new Map(c.foods.map((f) => [f.id, f]));
      this.streets = c.streets;
      this.weatherMap = new Map(c.weather.map((w) => [w.id, w.name]));
      this.weatherNotes = new Map(c.weather.flatMap((w) => (w.note ? [[w.id, w.note] as const] : [])));
      this.weatherKinds = new Map(
        c.weather.flatMap((w) => (w.type ? [[w.id, { type: w.type, special: !!w.special }] as const] : [])),
      );
      this.devicesMap = new Map(c.devices.map((d) => [d.id, d.name]));
      this.suitsMap = new Map((c.suits ?? []).map((s) => [s.id, s]));
      this.dataMap = new Map(
        Object.entries(c.data ?? {}).flatMap(([k, list]) => list.map((x) => [`${k}:${x.id}`, x] as const)),
      );
      this.looks = c.looks ?? null;
      this.achLines = c.achievements ?? [];
      this.achById = new Map(
        this.achLines.flatMap((line) => line.tiers.map((tier) => [tier.id, { line, tier }] as const)),
      );
      this.trophyMap = new Map((c.trophies ?? []).map((x) => [x.key, x]));
      this.loaded = true;
      this.mcMap = new Map((c.mysterious ?? []).map((m) => [m.id, m]));
      setNameResolver({
        goodsName: (id) => this.goodsName(id),
        foodName: (id) => this.foodName(id),
        mcName: (id) => this.mcName(id),
      });
    },
    /**
     * 目录按配置版本缓存在浏览器里（只是加速；读不到时直接请求）。
     * 几处同时调（App 和刚打开的页面）只请求一次（稳健性批）；读失败不记住，下次照样重读
     */
    load(): Promise<void> {
      if (this.loaded) return Promise.resolve();
      const pending = loadingOf.get(this);
      if (pending) return pending;
      const loading = (async () => {
        const l = activeLocale();
        try {
          const cached = localStorage.getItem(keyOf(l));
          if (cached) {
            this.apply(JSON.parse(cached) as CatalogDto);
            appliedOf.set(this, { l, json: cached });
          }
        } catch {
          // 存储不可用时忽略
        }
        await this.reload(l);
      })().finally(() => {
        loadingOf.delete(this);
      });
      loadingOf.set(this, loading);
      return loading;
    },
    /** 按语言重新读目录（切换语言时调用，问题记录 272） */
    async reload(l: Locale = activeLocale()): Promise<void> {
      const fresh = await endpoints.catalog(l);
      // 读的过程中又切了语言：丢掉过时的结果，按新语言重读（首次读目录时 set() 不会替我们重读）
      if (l !== activeLocale()) return this.reload(activeLocale());
      this.fetchedAt = Date.now();
      const json = JSON.stringify(fresh);
      const was = appliedOf.get(this);
      if (was && was.l === l && was.json === json) return;
      this.apply(fresh);
      appliedOf.set(this, { l, json });
      try {
        localStorage.setItem(keyOf(l), json);
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
    /**
     * 食材的图形（界面改版 P4）：按目录里的类别画 food-<类别>；没写类别（旧目录缓存）、查不到编号、
     * 网页里还没有这张图（目录比网页新）都画通用图 food-misc
     */
    foodArt(id: number): ArtName {
      const name = `food-${this.foodsMap.get(id)?.art ?? 'misc'}`;
      return (CONTENT_ART as readonly string[]).includes(name) ? (name as ArtName) : 'food-misc';
    },
    /**
     * 门的图形（P4 终审遗留：首页头图、装扮、好友餐厅原来各写一份）：按目录里的门画 door-<款式>；
     * 目录还没读到、查不到这扇门、网页里还没有这张图都画木门
     */
    doorArt(id: number): ArtName {
      const name = `door-${this.looks?.doors.find((d) => d.id === id)?.art || 'wood'}`;
      return (CONTENT_ART as readonly string[]).includes(name) ? (name as ArtName) : 'door-wood';
    },
    /** 头像的图形（界面改版 P7）：没设头像、查不到、网页里还没有这张图都是 null，页面画首字圆圈 */
    avatarArt(id: number | null | undefined): ArtName | null {
      const art = this.looks?.avatars.find((a) => a.id === id)?.art;
      const name = `avatar-${art}`;
      return art && (CONTENT_ART as readonly string[]).includes(name) ? (name as ArtName) : null;
    },
    mcName(id: number): string {
      return this.mcMap.get(id)?.name ?? activeMessages().errors.fallbackName.mc(id);
    },
    cookbookName(id: number): string {
      return this.data('cookbooks', id)?.name ?? activeMessages().errors.fallbackName.cookbook(id);
    },
    mc(id: number): CatalogMcDto | undefined {
      return this.mcMap.get(id);
    },
    /** 道具配图：目录里单个道具写了 art 就用它，否则按小类（界面改版 P9） */
    goodsArt(id: number): ArtName {
      return goodsArt(id, this.goodsMap.get(id)?.art);
    },
    goods(id: number): CatalogGoodsDto | undefined {
      return this.goodsMap.get(id);
    },
    food(id: number): CatalogFoodDto | undefined {
      return this.foodsMap.get(id);
    },
    /** 食材等级（动态里写明几级，问题记录 587）；目录里没有时 undefined */
    foodLevel(id: number): number | undefined {
      return this.foodsMap.get(id)?.level;
    },
    /** fallback：目录里没有时用的名字（通常是服务端给的），不传时写"天气 id" */
    weatherName(id: number, fallback?: string): string {
      return this.weatherMap.get(id) ?? fallback ?? activeMessages().errors.fallbackName.weather(id);
    },
    /** 按 id 取当前语言的数据名字；目录里没有（旧缓存）时返回 undefined，调用处用服务端给的原文 */
    data(kind: CatalogDataKind, id: number): CatalogDataEntry | undefined {
      return this.dataMap.get(`${kind}:${id}`);
    },
    weather(id: number): { type: number; special: boolean } | undefined {
      return this.weatherKinds.get(id);
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
    /** 成就名（线名 + 档）、奖杯名（成就系统 2026-10-19）；目录里没有时写编号 */
    achName(id: string): string {
      return achNameOf(id, this);
    },
    trophyName(key: string): string {
      return trophyNameOf(key, this);
    },
    streetName(id: number, fallback = ''): string {
      return this.streets.find((s) => s.id === id)?.name ?? fallback;
    },
  },
});

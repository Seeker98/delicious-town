import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { OpenCookbookDto, OpenFoodDto, OpenGoodsDto, OpenMysteriousDto } from '@dt/shared';
import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { useToastStore } from '../../stores/toast';
import WikiCookbookView from './WikiCookbookView.vue';
import WikiFoodView from './WikiFoodView.vue';
import WikiGoodsView from './WikiGoodsView.vue';
import WikiMysteriousView from './WikiMysteriousView.vue';
import WikiStreetView from './WikiStreetView.vue';
import { usePageTitleStore } from '../../stores/pageTitle';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    openGoodsDetail: vi.fn(),
    openFood: vi.fn(),
    openCookbook: vi.fn(),
    openCookbooks: vi.fn(),
    openStreets: vi.fn(),
    openGoods: vi.fn(),
    openEquips: vi.fn(),
    openMysterious: vi.fn(),
    openMysteriousDetail: vi.fn(),
  },
}));

const meta = { version: 'v1', lang: 'zh-CN' as const };
const streets = {
  ...meta,
  items: [
    {
      id: 0,
      name: '湖南街',
      cookName: '湘菜',
      desc: '湘菜售价 +5%',
      theme: '湘菜香辣下饭',
      focus: 'balanced' as const,
      medal: { id: 140, name: '湖南街勋章', desc: '湖南街的勋章' },
      cookbookCount: 2,
    },
  ],
};
const goods = (p: Partial<OpenGoodsDto> = {}): OpenGoodsDto => ({
  ...meta,
  id: 115,
  name: '每日签到礼包',
  type: 2,
  level: 1,
  coin: 0,
  diamond: 0,
  onSale: false,
  desc: '每天签到送的礼包',
  stackable: true,
  maxNum: 999,
  invalidHours: null,
  needStar: 0,
  equip: null,
  gem: null,
  gift: null,
  sources: {
    shop: null,
    renownShop: null,
    exchange: [],
    special: false,
    black: null,
    award: false,
    gemFrom: null,
  },
  usedIn: [],
  ...p,
});

async function mountAt(component: object, pattern: string, path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: pattern, component },
      { path: '/:p(.*)', component: { template: '<div />' } },
    ],
  });
  await router.push(path);
  const w = mount(component, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}
const hrefs = (w: Awaited<ReturnType<typeof mountAt>>, sel: string) =>
  w.findAll(`${sel} a`).map((a) => a.attributes('href'));

describe('游戏资料详情（问题记录 142）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.openStreets).mockResolvedValue(streets);
  });

  it('礼包：列出能开出的东西（道具、食材带链接，随机项写等级），写明不给概率；没有来源时写说明', async () => {
    vi.mocked(endpoints.openGoodsDetail).mockResolvedValue(
      goods({
        gift: [
          { kind: 'goods', id: 1, name: '神秘礼券', num: 20 },
          { kind: 'randomGoods', level: 7, num: 1 },
          { kind: 'foods', id: 239, name: '松露', num: 2 },
          { kind: 'masterFoods', num: 1 },
          { kind: 'coin', min: 1000, max: 19999 },
        ],
      }),
    );
    const w = await mountAt(WikiGoodsView, '/wiki/goods/:id', '/wiki/goods/115');
    expect(usePageTitleStore().title).toBe('每日签到礼包');
    const gift = w.get('[data-testid="wiki-gift"]');
    expect(gift.text()).toContain('神秘礼券×20');
    expect(gift.text()).toContain('随机一件 7 级道具×1');
    expect(gift.text()).toContain('随机万能食材×1');
    expect(gift.text()).toContain('银币 1,000~19,999');
    expect(gift.text()).toContain('不写概率');
    expect(hrefs(w, '[data-testid="wiki-gift"]')).toEqual(['/wiki/goods/1', '/wiki/foods/239']);
    expect(w.get('[data-testid="wiki-sources"]').text()).toContain('游戏配置里没有直接的获得途径');
  });

  it('厨具：部位、等级门槛、套装、基础属性、强化表；来源写商店价格和兑换规则', async () => {
    vi.mocked(endpoints.openGoodsDetail).mockResolvedValue(
      goods({
        id: 30,
        name: '见习之铲',
        type: 4,
        coin: 500,
        onSale: true,
        equip: {
          part: 1,
          minLevel: 10,
          suitId: 4,
          suitName: '见习套装',
          essence: 1,
          hole: 0,
          maxHole: 2,
          ranges: { cook: [2, 4], cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 },
          stressTable: [2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18],
        },
        sources: {
          shop: { coin: 500, diamond: 0 },
          renownShop: { renown: 60, rotating: true },
          exchange: [
            {
              goodsId: 30,
              goodsName: '见习之铲',
              num: 1,
              need: [{ goodsId: 180, name: '蟹黄堡', num: 2 }],
              times: 1,
            },
          ],
          special: true,
          black: 12,
          award: true,
          gemFrom: { id: 29, name: '[一阶]•天机原石' },
        },
      }),
    );
    const w = await mountAt(WikiGoodsView, '/wiki/goods/:id', '/wiki/goods/30');
    // 界面改版 P11：部位和等级门槛挪到名字下面那一行分类里
    const kick = w.get('[data-testid="wiki-entry"] .dt-entry-kick').text();
    expect(kick).toContain('厨具');
    expect(kick).toContain('铲');
    expect(kick).toContain('10 级可以穿');
    expect(w.get('.dt-entry-name').text()).toBe('见习之铲');
    const eq = w.get('[data-testid="wiki-equip"]');
    expect(eq.element.tagName).toBe('DL');
    expect(eq.text()).toContain('见习套装');
    expect(eq.text()).toContain('厨艺 2~4');
    expect(eq.text()).not.toContain('刀工');
    expect(w.get('[data-testid="wiki-stress"]').text()).toContain('+10');
    expect(w.get('[data-testid="wiki-stress"]').text()).toContain('18');
    const src = w.get('[data-testid="wiki-sources"]');
    expect(src.text()).toContain('500 银币');
    expect(src.text()).toContain('声望商店: 60 声望 (轮换上架)');
    expect(src.text()).toContain('蟹黄堡×2');
    expect(src.text()).toContain('每人限兑 1 次');
    expect(hrefs(w, '[data-testid="wiki-sources"]')).toContain('/wiki/goods/180');
    // 限时折扣（原来叫今日特价，界面改版 P2b）、钻石黑市、随机奖励、宝石升阶（视觉第三轮）
    expect(src.text()).toContain('限时折扣');
    expect(src.text()).toContain('钻石黑市: 12 钻石');
    expect(src.text()).toContain('随机奖励');
    expect(src.text()).toContain('两颗[一阶]•天机原石');
    expect(hrefs(w, '[data-testid="wiki-sources"]')).toContain('/wiki/goods/29');
  });

  it('厨具：写出套装效果（几件、效果），套装数据从厨具列表取（backlog #115）', async () => {
    vi.mocked(endpoints.openEquips).mockResolvedValue({
      ...meta,
      items: [],
      suits: [
        {
          id: 4,
          name: '见习套装',
          maxNum: 3,
          tiers: [
            { need: 2, desc: '厨艺+5' },
            { need: 3, desc: '刀工+8' },
          ],
        },
      ],
    });
    vi.mocked(endpoints.openGoodsDetail).mockResolvedValue(
      goods({
        id: 30,
        name: '见习之铲',
        type: 4,
        equip: {
          part: 1,
          minLevel: 0,
          suitId: 4,
          suitName: '见习套装',
          essence: 1,
          hole: 0,
          maxHole: 0,
          ranges: { cook: 3 },
          stressTable: [3],
        },
      }),
    );
    const w = await mountAt(WikiGoodsView, '/wiki/goods/:id', '/wiki/goods/30');
    const suit = w.get('[data-testid="wiki-suit"]');
    expect(suit.text()).toContain('2 件');
    expect(suit.text()).toContain('厨艺+5');
    expect(suit.text()).toContain('刀工+8');
  });

  it('宝石的“下一阶”链接写下一阶宝石的名字，名字由详情直接给，不拉整张道具列表（backlog #115）', async () => {
    vi.mocked(endpoints.openGoodsDetail).mockResolvedValue(
      goods({
        id: 501,
        name: '一阶红宝石',
        type: 5,
        gem: { level: 1, nextId: 502, nextName: '二阶红宝石', attrs: { cook: 2 } },
      }),
    );
    const w = await mountAt(WikiGoodsView, '/wiki/goods/:id', '/wiki/goods/501');
    expect(w.get('[data-testid="wiki-gem"] a').text()).toBe('二阶红宝石');
    expect(endpoints.openGoods).not.toHaveBeenCalled();
  });

  it('后期海报写几星可用；没有门槛的不写（backlog 146）', async () => {
    vi.mocked(endpoints.openGoodsDetail).mockResolvedValue(
      goods({ id: 93201, name: '13 哥宣传海报', needStar: 4 }),
    );
    const w = await mountAt(WikiGoodsView, '/wiki/goods/:id', '/wiki/goods/93201');
    expect(w.get('[data-testid="wiki-need-star"]').text()).toBe('4 星可用');
    vi.mocked(endpoints.openGoodsDetail).mockResolvedValue(goods({ id: 13 }));
    const v = await mountAt(WikiGoodsView, '/wiki/goods/:id', '/wiki/goods/13');
    expect(v.find('[data-testid="wiki-need-star"]').exists()).toBe(false);
  });

  it('套装效果读不到时照样显示厨具、不弹提示（补充信息，backlog #115）', async () => {
    vi.mocked(endpoints.openEquips).mockRejectedValue(new Error('net'));
    vi.mocked(endpoints.openGoodsDetail).mockResolvedValue(
      goods({
        id: 30,
        name: '见习锅铲',
        type: 9,
        equip: {
          part: 1,
          minLevel: 0,
          suitId: 4,
          suitName: '见习套装',
          essence: 1,
          hole: 0,
          maxHole: 0,
          ranges: {},
          stressTable: [],
        },
      }),
    );
    const w = await mountAt(WikiGoodsView, '/wiki/goods/:id', '/wiki/goods/30');
    expect(usePageTitleStore().title).toBe('见习锅铲');
    expect(w.find('[data-testid="wiki-suit"]').exists()).toBe(false);
    expect(useToastStore().items).toEqual([]);
  });

  it('先打开 A（慢）再打开 B：A 晚到也不会盖掉 B（backlog #115）', async () => {
    let slow: (v: OpenGoodsDto) => void = () => undefined;
    vi.mocked(endpoints.openGoodsDetail).mockImplementation((_l, id) =>
      id === 1 ? new Promise((r) => (slow = r)) : Promise.resolve(goods({ id: 2, name: '乙道具' })),
    );
    const w = await mountAt(WikiGoodsView, '/wiki/goods/:id', '/wiki/goods/1');
    await w.vm.$router.push('/wiki/goods/2');
    await flushPromises();
    expect(usePageTitleStore().title).toBe('乙道具');
    slow(goods({ id: 1, name: '甲道具' }));
    await flushPromises();
    expect(usePageTitleStore().title).toBe('乙道具');
    expect(w.text()).not.toContain('甲道具');
  });

  it('读失败（不是不存在）时弹提示（backlog #115）', async () => {
    vi.mocked(endpoints.openGoodsDetail).mockRejectedValue(new Error('net'));
    const w = await mountAt(WikiGoodsView, '/wiki/goods/:id', '/wiki/goods/9');
    expect(w.find('[data-testid="wiki-error"]').exists()).toBe(true);
    expect(useToastStore().items.map((x) => x.variant)).toContain('danger');
  });

  it('不存在的道具写没有这一条', async () => {
    vi.mocked(endpoints.openGoodsDetail).mockRejectedValue(new ApiError('NOT_FOUND'));
    const w = await mountAt(WikiGoodsView, '/wiki/goods/:id', '/wiki/goods/51');
    expect(w.get('[data-testid="wiki-error"]').text()).toBe('没有这一条');
    // 不存在不算读失败，不弹提示
    expect(useToastStore().items).toEqual([]);
  });

  it('食材：属性、用到它的食谱（带街道和最低品级、链接）、特色菜', async () => {
    const food: OpenFoodDto = {
      ...meta,
      id: 239,
      name: '松露',
      level: 2,
      coin: 900,
      fairCoin: 1280,
      rare: true,
      type: 2,
      maxNum: 99,
      cookbooks: [{ id: 1, name: '南煎丸子', streetId: 0, grade: 3, mainFoodId: 239 }],
      mysterious: [{ id: 7, name: '佛跳墙' }],
    };
    vi.mocked(endpoints.openFood).mockResolvedValue(food);
    const w = await mountAt(WikiFoodView, '/wiki/foods/:id', '/wiki/foods/239');
    // 菜场价、公允价两行（公允价阶梯 2026-10-15）
    expect(w.get('.dt-entry-dl').text()).toContain('菜场价900 银币');
    expect(w.get('.dt-entry-dl').text()).toContain('公允价1,280 银币');
    // 稀有写在名字下面那一行分类里（界面改版 P11）
    expect(w.get('.dt-entry-kick').text()).toContain('稀有');
    const cb = w.get('[data-testid="wiki-cookbooks"]');
    // 小标题后面小字写几道（界面改版 P11）
    expect(cb.get('h3.dt-entry-h').text()).toContain('用到它的食谱');
    expect(cb.get('h3.dt-entry-h small').text()).toBe('1 道');
    expect(cb.text()).toContain('湖南街');
    expect(cb.text()).toContain('上品起');
    expect(hrefs(w, '[data-testid="wiki-cookbooks"]')).toEqual(['/wiki/cookbooks/1']);
    expect(w.get('[data-testid="wiki-mysterious"]').text()).toContain('佛跳墙');
    // 点进特色菜词条（2026-10-17）
    expect(hrefs(w, '[data-testid="wiki-mysterious"]')).toEqual(['/wiki/mysterious/7']);
  });

  it('特色菜（2026-10-17）：资料表、食材链接、当令天气、残卷来源、道的加成', async () => {
    vi.mocked(endpoints.openMysterious).mockResolvedValue({
      ...meta,
      items: [
        { id: 9, name: '秘·佛跳墙', level: 5, road: 2, nutritive: 120, mainFoodId: 239 },
        { id: 7, name: '秘·松露蛋', level: 1, road: 1, nutritive: 8, mainFoodId: 239 },
        { id: 8, name: '秘·松露汤', level: 3, road: 2, nutritive: 40, mainFoodId: null },
      ],
      roads: [
        { road: 1, weathers: [{ id: 1, name: '晴' }] },
        {
          road: 2,
          weathers: [
            { id: 2, name: '阴' },
            { id: 10, name: '小雨' },
          ],
        },
      ],
      special: [
        { id: 6, name: '虹' },
        { id: 7, name: '飓风' },
      ],
      rules: { remnants: 3, shilingMinStar: 1, same: 0.02, sameMax: 0.3, other: 0.005, otherMax: 0.1 },
    });
    const mc: OpenMysteriousDto = {
      ...meta,
      id: 8,
      name: '秘·松露汤',
      level: 3,
      road: 2,
      nutritive: 40,
      mainFoodId: 239,
      taste: [1],
      coin: 12_000,
      saleRate: 2.5,
      foods: [
        { id: 239, name: '松露' },
        { id: 240, name: '鸡蛋' },
      ],
      inSeason: [
        { id: 2, name: '阴' },
        { id: 10, name: '小雨' },
      ],
      sources: {
        appraise: [
          { id: 10812, name: '美味印章', rate: 0.4, min: 1, max: 3 },
          { id: 10814, name: '蟹黄堡秘方', rate: 1, min: 3, max: 5 },
        ],
        fragments: 3,
        shilingShop: { rare: false, price: 240, weekly: 6 },
      },
    };
    vi.mocked(endpoints.openMysteriousDetail).mockResolvedValue(mc);
    const w = await mountAt(WikiMysteriousView, '/wiki/mysterious/:id', '/wiki/mysterious/8');
    expect(w.get('.dt-entry-kick').text()).toContain('特色菜 · 二道');
    const dl = w.get('.dt-entry-dl').text();
    expect(dl).toContain('等级3 级');
    expect(dl).toContain('营养值40');
    expect(dl).toContain('卖给顾客每份价值 ×2.5');
    expect(dl).toContain('残卷单价12,000 银币');
    expect(w.get('[data-testid="wiki-road-link"]').attributes('href')).toBe('/wiki/mysterious?f=2');
    expect(hrefs(w, '[data-testid="wiki-mc-foods"]')).toEqual(['/wiki/foods/239', '/wiki/foods/240']);
    expect(w.get('[data-testid="wiki-mc-season"]').text()).toBe(
      '阴、小雨；特殊天气 (虹、飓风) 一道到六道全部当令。',
    );
    const src = w.get('[data-testid="wiki-mc-sources"]').text();
    expect(src).toContain('鉴定: 美味印章 (1~3 级随机一道, 40%)、蟹黄堡秘方 (3~5 级随机一道, 必定成功)');
    expect(src).toContain('碎片兑换: 3 张 3 级碎片换 1 张');
    expect(src).toContain('时令铺: 240 时令值一张 (每周限 6 张)');
    expect(src).toContain('学艺');
    expect(hrefs(w, '[data-testid="wiki-mc-sources"]')).toEqual(['/wiki/goods/10812', '/wiki/goods/10814']);
    expect(w.get('[data-testid="wiki-mc-road"]').text()).toBe(
      '已学会的其他二道特色菜, 每道让这道菜下锅的份数 +2% (最多 +30%)；别的道每道 +0.5% (最多 +10%)。',
    );
    expect(w.get('[data-testid="wiki-mc-guide"]').attributes('href')).toBe('/wiki/guide');
  });

  it('特色菜：时令铺里 6 级是珍稀残卷；不存在写没有这一条', async () => {
    vi.mocked(endpoints.openMysterious).mockResolvedValue({
      ...meta,
      items: [
        { id: 9, name: '秘·佛跳墙', level: 5, road: 2, nutritive: 120, mainFoodId: 239 },
        { id: 7, name: '秘·松露蛋', level: 1, road: 1, nutritive: 8, mainFoodId: 239 },
        { id: 8, name: '秘·松露汤', level: 3, road: 2, nutritive: 40, mainFoodId: null },
      ],
      roads: [
        { road: 1, weathers: [{ id: 1, name: '晴' }] },
        {
          road: 2,
          weathers: [
            { id: 2, name: '阴' },
            { id: 10, name: '小雨' },
          ],
        },
      ],
      special: [
        { id: 6, name: '虹' },
        { id: 7, name: '飓风' },
      ],
      rules: { remnants: 3, shilingMinStar: 1, same: 0.02, sameMax: 0.3, other: 0.005, otherMax: 0.1 },
    });
    vi.mocked(endpoints.openMysteriousDetail).mockResolvedValue({
      ...meta,
      id: 9,
      name: '秘·佛跳墙',
      level: 6,
      road: 2,
      nutritive: 120,
      mainFoodId: null,
      taste: [],
      coin: 1,
      saleRate: 1,
      foods: [],
      inSeason: [],
      sources: { appraise: [], fragments: null, shilingShop: { rare: true, price: 1500, weekly: 1 } },
    });
    const w = await mountAt(WikiMysteriousView, '/wiki/mysterious/:id', '/wiki/mysterious/9');
    const src = w.get('[data-testid="wiki-mc-sources"]').text();
    expect(src).toContain('时令铺珍稀残卷: 1,500 时令值一张 (每周限 1 张)');
    expect(src).not.toContain('鉴定');
    expect(src).not.toContain('碎片');
    vi.mocked(endpoints.openMysteriousDetail).mockRejectedValue(new ApiError('NOT_FOUND'));
    const w2 = await mountAt(WikiMysteriousView, '/wiki/mysterious/:id', '/wiki/mysterious/99');
    expect(w2.get('[data-testid="wiki-error"]').text()).toBe('没有这一条');
  });

  it('菜谱：名字下面写食谱 · 菜系 · 口味；资料表写街道链接、推荐等级、售价；各品级食材带链接', async () => {
    const cb: OpenCookbookDto = {
      ...meta,
      id: 1,
      name: '南煎丸子',
      streetId: 0,
      level: 5,
      coin: 120,
      mainFoodId: 239,
      taste: [2, 5],
      desc: '湘菜, 口味咸鲜',
      grades: Array.from({ length: 10 }, (_, i) => ({
        grade: i + 1,
        foods: [{ foodsId: 239, name: '松露', num: i + 1 }],
      })),
    };
    vi.mocked(endpoints.openCookbook).mockResolvedValue(cb);
    const w = await mountAt(WikiCookbookView, '/wiki/cookbooks/:id', '/wiki/cookbooks/1');
    expect(w.get('.dt-entry-name').text()).toBe('南煎丸子');
    expect(w.get('.dt-entry-kick').text()).toBe('食谱 · 湘菜 · 口味甘、咸');
    // 资料表：左边标签、右边内容
    const dl = w.get('dl.dt-entry-dl');
    expect(dl.findAll('dt').map((x) => x.text())).toEqual(['街道', '推荐等级', '售价']);
    expect(dl.findAll('dd').map((x) => x.text())).toEqual(['湖南街', '5 级', '120 银币']);
    // 界面改版 P11：描述那一段去掉了（和分类行重复）
    expect(w.text()).not.toContain('湘菜, 口味咸鲜');
    expect(w.get('[data-testid="wiki-street-link"]').attributes('href')).toBe('/wiki/streets/0');
    const g = w.get('[data-testid="wiki-grades"]');
    expect(g.text()).toContain('天馔');
    expect(g.text()).toContain('松露×10');
    expect(hrefs(w, '[data-testid="wiki-grades"]')).toHaveLength(10);
  });

  it('街道：菜系、加成、勋章链接、这条街的菜谱', async () => {
    vi.mocked(endpoints.openCookbooks).mockResolvedValue({
      ...meta,
      items: [
        { id: 1, name: '南煎丸子', streetId: 0, level: 5, coin: 120, mainFoodId: 239 },
        { id: 2, name: '寿司', streetId: 14, level: 5, coin: 120, mainFoodId: null },
      ],
    });
    const w = await mountAt(WikiStreetView, '/wiki/streets/:id', '/wiki/streets/0');
    expect(w.text()).toContain('湘菜售价 +5%');
    // 菜系和街道类型写在名字下面那一行分类里（问题记录 378 方案 C；界面改版 P11）
    expect(w.get('.dt-entry-kick').text()).toBe('街道 · 湘菜 · 均衡街');
    expect(w.find('[data-testid="wiki-street-focus"]').exists()).toBe(false);
    // 为什么是这个加成（问题记录 380）
    expect(w.get('[data-testid="wiki-street-theme"]').text()).toBe('湘菜香辣下饭');
    expect(w.get('[data-testid="wiki-medal"]').attributes('href')).toBe('/wiki/goods/140');
    expect(hrefs(w, '[data-testid="wiki-street-cookbooks"]')).toEqual(['/wiki/cookbooks/1']);
  });
});

describe('食材、菜谱详情：晚到的旧请求不盖新页面（backlog #115）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.openStreets).mockResolvedValue(streets);
  });
  const food = (id: number, name: string): OpenFoodDto => ({
    ...meta,
    id,
    name,
    level: 1,
    coin: 1,
    fairCoin: 1,
    rare: false,
    type: 2,
    maxNum: 99,
    cookbooks: [],
    mysterious: [],
  });
  const cookbook = (id: number, name: string): OpenCookbookDto => ({
    ...meta,
    id,
    name,
    streetId: 0,
    level: 1,
    coin: 1,
    taste: [],
    desc: null,
    mainFoodId: null,
    grades: [],
  });

  // “返回列表”回到进来前的列表地址：界面改版 P2a 起由顶栏返回负责，测试在 router.test.ts

  it('旧链接（重新编号前的编号）：接口跳到新编号后，地址栏也换成新编号（设计 §5）', async () => {
    vi.mocked(endpoints.openGoodsDetail).mockResolvedValue(goods({ id: 10001, name: '神秘礼券' }));
    vi.mocked(endpoints.openFood).mockResolvedValue(food(1001, '大米'));
    vi.mocked(endpoints.openCookbook).mockResolvedValue(cookbook(106001, '南煎丸子'));
    const g = await mountAt(WikiGoodsView, '/wiki/goods/:id', '/wiki/goods/1');
    expect(g.vm.$router.currentRoute.value.fullPath).toBe('/wiki/goods/10001');
    const f = await mountAt(WikiFoodView, '/wiki/foods/:id', '/wiki/foods/101');
    expect(f.vm.$router.currentRoute.value.fullPath).toBe('/wiki/foods/1001');
    const c = await mountAt(WikiCookbookView, '/wiki/cookbooks/:id', '/wiki/cookbooks/1');
    expect(c.vm.$router.currentRoute.value.fullPath).toBe('/wiki/cookbooks/106001');
    expect(usePageTitleStore().title).toBe('南煎丸子');
  });

  it('食材', async () => {
    let slow: (v: OpenFoodDto) => void = () => undefined;
    vi.mocked(endpoints.openFood).mockImplementation((_l, id) =>
      id === 1 ? new Promise((r) => (slow = r)) : Promise.resolve(food(2, '乙食材')),
    );
    const w = await mountAt(WikiFoodView, '/wiki/foods/:id', '/wiki/foods/1');
    await w.vm.$router.push('/wiki/foods/2');
    await flushPromises();
    slow(food(1, '甲食材'));
    await flushPromises();
    expect(usePageTitleStore().title).toBe('乙食材');
    expect(w.text()).not.toContain('甲食材');
  });

  it('菜谱；读失败时弹提示', async () => {
    let slow: (v: OpenCookbookDto) => void = () => undefined;
    vi.mocked(endpoints.openCookbook).mockImplementation((_l, id) =>
      id === 1 ? new Promise((r) => (slow = r)) : Promise.resolve(cookbook(2, '乙菜')),
    );
    const w = await mountAt(WikiCookbookView, '/wiki/cookbooks/:id', '/wiki/cookbooks/1');
    await w.vm.$router.push('/wiki/cookbooks/2');
    await flushPromises();
    slow(cookbook(1, '甲菜'));
    await flushPromises();
    expect(usePageTitleStore().title).toBe('乙菜');
    expect(w.text()).not.toContain('甲菜');
    vi.mocked(endpoints.openCookbook).mockRejectedValue(new Error('net'));
    await w.vm.$router.push('/wiki/cookbooks/3');
    await flushPromises();
    expect(useToastStore().items.map((x) => x.variant)).toContain('danger');
  });

  it('街道详情读失败时弹提示（质量期 ①b 终审）', async () => {
    vi.mocked(endpoints.openStreets).mockRejectedValue(new Error('net'));
    const w = await mountAt(WikiStreetView, '/wiki/streets/:id', '/wiki/streets/0');
    expect(w.find('[data-testid="wiki-error"]').exists()).toBe(true);
    expect(useToastStore().items.map((x) => x.variant)).toContain('danger');
  });
});

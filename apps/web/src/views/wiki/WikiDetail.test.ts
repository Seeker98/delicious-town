import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { OpenCookbookDto, OpenFoodDto, OpenGoodsDto } from '@dt/shared';
import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { useToastStore } from '../../stores/toast';
import WikiCookbookView from './WikiCookbookView.vue';
import WikiFoodView from './WikiFoodView.vue';
import WikiGoodsView from './WikiGoodsView.vue';
import WikiStreetView from './WikiStreetView.vue';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    openGoodsDetail: vi.fn(),
    openFood: vi.fn(),
    openCookbook: vi.fn(),
    openCookbooks: vi.fn(),
    openStreets: vi.fn(),
    openGoods: vi.fn(),
    openEquips: vi.fn(),
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
  sources: { shop: null, renownShop: null, exchange: [] },
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
    expect(w.get('h5').text()).toContain('每日签到礼包');
    const gift = w.get('[data-testid="wiki-gift"]');
    expect(gift.text()).toContain('神秘礼券 ×20');
    expect(gift.text()).toContain('随机一件 7 级道具 ×1');
    expect(gift.text()).toContain('随机万能食材 ×1');
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
        },
      }),
    );
    const w = await mountAt(WikiGoodsView, '/wiki/goods/:id', '/wiki/goods/30');
    const eq = w.get('[data-testid="wiki-equip"]');
    expect(eq.text()).toContain('铲');
    expect(eq.text()).toContain('10 级可以穿');
    expect(eq.text()).toContain('见习套装');
    expect(eq.text()).toContain('厨艺 2~4');
    expect(eq.text()).not.toContain('刀工');
    expect(w.get('[data-testid="wiki-stress"]').text()).toContain('+10');
    expect(w.get('[data-testid="wiki-stress"]').text()).toContain('18');
    const src = w.get('[data-testid="wiki-sources"]');
    expect(src.text()).toContain('500 银币');
    expect(src.text()).toContain('声望商店：60 声望（轮换上架）');
    expect(src.text()).toContain('蟹黄堡 ×2');
    expect(src.text()).toContain('每人限兑 1 次');
    expect(hrefs(w, '[data-testid="wiki-sources"]')).toContain('/wiki/goods/180');
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
    expect(w.text()).toContain('见习锅铲');
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
    expect(w.text()).toContain('乙道具');
    slow(goods({ id: 1, name: '甲道具' }));
    await flushPromises();
    expect(w.text()).toContain('乙道具');
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

  it('食材：属性、菜园种子、用到它的菜谱（带街道和最低品级、链接）、特色菜', async () => {
    const food: OpenFoodDto = {
      ...meta,
      id: 239,
      name: '松露',
      level: 2,
      coin: 900,
      rare: true,
      type: 2,
      maxNum: 99,
      seed: { id: 5, harvestNum: 20 },
      cookbooks: [{ id: 1, name: '南煎丸子', streetId: 0, grade: 3 }],
      mysterious: [{ id: 7, name: '佛跳墙' }],
    };
    vi.mocked(endpoints.openFood).mockResolvedValue(food);
    const w = await mountAt(WikiFoodView, '/wiki/foods/:id', '/wiki/foods/239');
    expect(w.text()).toContain('稀有');
    expect(w.text()).toContain('菜园能种出来，每次收获 20 个');
    const cb = w.get('[data-testid="wiki-cookbooks"]');
    expect(cb.text()).toContain('用到它的菜谱（1 道）');
    expect(cb.text()).toContain('湖南街');
    expect(cb.text()).toContain('上品起');
    expect(hrefs(w, '[data-testid="wiki-cookbooks"]')).toEqual(['/wiki/cookbooks/1']);
    expect(w.get('[data-testid="wiki-mysterious"]').text()).toContain('佛跳墙');
  });

  it('菜谱：街道链接、推荐等级、口味、描述；各品级食材带链接', async () => {
    const cb: OpenCookbookDto = {
      ...meta,
      id: 1,
      name: '南煎丸子',
      streetId: 0,
      level: 5,
      coin: 120,
      taste: [2, 5],
      desc: '湘菜，口味咸鲜',
      grades: Array.from({ length: 10 }, (_, i) => ({
        grade: i + 1,
        foods: [{ foodsId: 239, name: '松露', num: i + 1 }],
      })),
    };
    vi.mocked(endpoints.openCookbook).mockResolvedValue(cb);
    const w = await mountAt(WikiCookbookView, '/wiki/cookbooks/:id', '/wiki/cookbooks/1');
    expect(w.text()).toContain('推荐 5 级');
    expect(w.text()).toContain('甘、咸');
    expect(w.text()).toContain('湘菜，口味咸鲜');
    expect(w.get('[data-testid="wiki-street-link"]').attributes('href')).toBe('/wiki/streets/0');
    const g = w.get('[data-testid="wiki-grades"]');
    expect(g.text()).toContain('天馔');
    expect(g.text()).toContain('松露 ×10');
    expect(hrefs(w, '[data-testid="wiki-grades"]')).toHaveLength(10);
  });

  it('街道：菜系、加成、勋章链接、这条街的菜谱', async () => {
    vi.mocked(endpoints.openCookbooks).mockResolvedValue({
      ...meta,
      items: [
        { id: 1, name: '南煎丸子', streetId: 0, level: 5, coin: 120 },
        { id: 2, name: '寿司', streetId: 14, level: 5, coin: 120 },
      ],
    });
    const w = await mountAt(WikiStreetView, '/wiki/streets/:id', '/wiki/streets/0');
    expect(w.text()).toContain('湘菜');
    expect(w.text()).toContain('湘菜售价 +5%');
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
    rare: false,
    type: 2,
    maxNum: 99,
    seed: null,
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
    grades: [],
  });

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
    expect(c.text()).toContain('南煎丸子');
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
    expect(w.text()).toContain('乙食材');
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
    expect(w.text()).toContain('乙菜');
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

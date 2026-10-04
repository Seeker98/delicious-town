import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { OpenCookbookDto, OpenFoodDto, OpenGoodsDto } from '@dt/shared';
import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
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

  it('不存在的道具写没有这一条', async () => {
    vi.mocked(endpoints.openGoodsDetail).mockRejectedValue(new ApiError('NOT_FOUND'));
    const w = await mountAt(WikiGoodsView, '/wiki/goods/:id', '/wiki/goods/51');
    expect(w.get('[data-testid="wiki-error"]').text()).toBe('没有这一条');
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

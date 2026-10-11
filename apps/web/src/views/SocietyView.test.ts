import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { LessonsDto, OilNeedDto, StarNeedDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { townData } from '../components/town/testData';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import SocietyView from './SocietyView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    hiphopSpot: vi.fn().mockResolvedValue({ here: false }),
    starNeed: vi.fn(),
    oilNeed: vi.fn(),
    moveCost: vi.fn(),
    town: vi.fn(),
    lessons: vi.fn(),
    overview: vi.fn().mockRejectedValue(new Error('offline')),
    move: vi.fn(),
    rename: vi.fn(),
  },
}));

const starNeed = (patch: Partial<StarNeedDto> = {}): StarNeedDto => ({
  star: 2,
  nextStar: 3,
  available: true,
  checks: [
    { key: 'level', need: 20, have: 25, ok: true },
    { key: 'cookbooks', need: 30, have: 28, ok: false },
    { key: 'coin', need: 100_000, have: 5_000, ok: false },
  ],
  award: null,
  ok: false,
  ...patch,
});
const oilNeed = (patch: Partial<OilNeedDto> = {}): OilNeedDto => ({
  oilLevel: 3,
  oilMax: 6_000,
  nextLevel: 4,
  nextOilMax: 8_000,
  checks: [{ key: 'coin', need: 1000, have: 2000, ok: true }],
  ok: true,
  ...patch,
});
const lessons = (patch: Partial<LessonsDto> = {}): LessonsDto => ({
  items: [],
  mine: null,
  certs: [],
  canForceClose: false,
  forceCloseCoinPerLevel: 0,
  forgetPerLevel: 1,
  forgetGrades: 1,
  ...patch,
});

async function mountView(path = '/society') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }],
  });
  await router.push(path);
  // 改名、搬家面板 Teleport 到 body：测试里把 teleport 桩掉
  const w = mount(SocietyView, { global: { plugins: [router], stubs: { teleport: true } } });
  await flushPromises();
  return { w, router };
}
const hrefs = (w: ReturnType<typeof mount>) => w.findAll('a').map((a) => a.attributes('href'));

describe('协会（问题记录 441、443；界面改版 P10）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().loaded = true;
    vi.mocked(endpoints.starNeed).mockResolvedValue(starNeed());
    vi.mocked(endpoints.oilNeed).mockResolvedValue(oilNeed());
    vi.mocked(endpoints.moveCost).mockResolvedValue({ cost: 20_000 });
    vi.mocked(endpoints.town).mockResolvedValue(townData());
    vi.mocked(endpoints.lessons).mockResolvedValue(lessons());
  });

  it('三位 NPC、升星、扩油、教室各链到自己的页面；改名、搬家是按钮；盖乐瑞搬去了银行（界面改版 P2b）', async () => {
    const { w } = await mountView();
    expect(hrefs(w)).toEqual([
      '/society/mayor',
      '/society/bro13',
      '/society/carmen',
      '/society/star',
      '/society/oil',
      '/society/classroom',
    ]);
    expect(w.get('[data-testid="society-npc-mayor"]').text()).toContain('镇长大胃锅');
    expect(w.find('[data-testid="society-rename"]').element.tagName).toBe('BUTTON');
    expect(w.find('[data-testid="society-move"]').element.tagName).toBe('BUTTON');
    expect(w.text()).not.toContain('盖乐瑞');
  });

  it('区服关掉的功能对应的入口不显示：广场关了没有三位兑换的 NPC，神秘食谱关了没有教室', async () => {
    useRestaurantStore().rest = { disabledFeatures: ['town', 'mysterious', 'fund', 'wealth'] } as never;
    const { w } = await mountView();
    expect(hrefs(w)).toEqual(['/society/star', '/society/oil']);
    expect(w.find('[data-testid="society-npcs"]').exists()).toBe(false);
    // 关掉的功能不请求接口
    expect(endpoints.town).not.toHaveBeenCalled();
    expect(endpoints.lessons).not.toHaveBeenCalled();
    // 改名、搬家一直在
    expect(w.find('[data-testid="society-rename"]').exists()).toBe(true);
    expect(w.find('[data-testid="society-move"]').exists()).toBe(true);
  });

  it('NPC 格子标今天聊没聊；卡门没领见面礼、今天也没聊时标“有见面礼”', async () => {
    vi.mocked(endpoints.town).mockResolvedValue(
      townData({
        talked: { bigEater: true, wenjie: false, bro13: false, carmen: false },
        bigEaterGift: false,
      }),
    );
    const { w } = await mountView();
    expect(w.get('[data-testid="society-npc-tag-mayor"]').text()).toBe('今天聊过了');
    expect(w.get('[data-testid="society-npc-tag-bro13"]').text()).toBe('今天还没聊');
    expect(w.get('[data-testid="society-npc-tag-carmen"]').text()).toBe('有见面礼');

    vi.mocked(endpoints.town).mockResolvedValue(townData({ bigEaterGift: true }));
    const again = (await mountView()).w;
    expect(again.find('[data-testid="society-npc-tag-carmen"]').exists()).toBe(false);
  });

  it('广场数据读不到时 NPC 格子照样能点，只是不标状态', async () => {
    vi.mocked(endpoints.town).mockRejectedValue(new Error('x'));
    const { w } = await mountView();
    expect(w.find('[data-testid="society-npc-mayor"]').exists()).toBe(true);
    expect(w.find('[data-testid^="society-npc-tag-"]').exists()).toBe(false);
  });

  it('办事卡片：升星写差几项和第一项差多少，扩油够了标“可以扩”，搬家写现在的街和大约多少银币', async () => {
    useRestaurantStore().rest = { streetId: 3, streetName: '美食街', disabledFeatures: [] } as never;
    vi.mocked(endpoints.lessons).mockResolvedValue(
      lessons({
        items: [{ id: 1 }, { id: 2 }, { id: 5 }] as never,
        mine: { id: 5 } as never,
      }),
    );
    const { w } = await mountView();
    expect(w.get('[data-testid="society-star"]').text()).toBe('2 星');
    expect(w.get('[data-testid="society-oil"]').text()).toBe('油壶 3 级 · 上限 6,000');
    const star = w.get('[data-testid="society-link-star"]');
    expect(star.text()).toContain('升 3 星还差 2 项: 已学食谱 28 / 30');
    expect(star.get('b.text-danger').text()).toBe('2 项');
    const oil = w.get('[data-testid="society-link-oil"]');
    expect(oil.text()).toContain('升到 4 级, 上限 8,000');
    expect(oil.get('.dt-tag').text()).toBe('可以扩');
    expect(w.get('[data-testid="society-move"]').text()).toContain('现在在 美食街 · 约 20,000 银币');
    // 教室：别人开的课几门、我有没有开课
    expect(w.get('[data-testid="society-link-classroom"]').text()).toContain('2 门课在上 · 我在开课');
  });

  it('升星都够了写可以升；最高星写已满；扩油不够写差几项、不标“可以扩”', async () => {
    vi.mocked(endpoints.starNeed).mockResolvedValue(starNeed({ ok: true, checks: [] }));
    vi.mocked(endpoints.oilNeed).mockResolvedValue(
      oilNeed({ ok: false, checks: [{ key: 'coin', need: 1000, have: 10, ok: false }] }),
    );
    const { w } = await mountView();
    expect(w.get('[data-testid="society-link-star"]').text()).toContain('可以升到 3 星了');
    expect(w.get('[data-testid="society-link-oil"]').text()).toContain('升到 4 级还差 1 项');
    expect(w.get('[data-testid="society-link-oil"]').find('.dt-tag').exists()).toBe(false);

    vi.mocked(endpoints.starNeed).mockResolvedValue(starNeed({ nextStar: null }));
    const top = (await mountView()).w;
    expect(top.get('[data-testid="society-link-star"]').text()).toContain('已经是最高星级');
  });

  it('状态接口读不到时只写固定说明，入口照样在', async () => {
    vi.mocked(endpoints.starNeed).mockRejectedValue(new Error('x'));
    vi.mocked(endpoints.oilNeed).mockRejectedValue(new Error('x'));
    vi.mocked(endpoints.moveCost).mockRejectedValue(new Error('x'));
    const { w } = await mountView();
    expect(w.find('[data-testid="society-star"]').exists()).toBe(false);
    expect(w.get('[data-testid="society-link-star"]').text()).toContain('等级、食谱、凭证够了就能升星');
    expect(w.get('[data-testid="society-link-oil"]').text()).toContain('提高油上限, 减少停业');
    expect(w.get('[data-testid="society-move"]').text()).toContain('换一条街, 街道勋章跟着换');
  });

  it('点改名、搬家从下面弹出面板', async () => {
    const { w } = await mountView();
    expect(w.find('[data-testid="rename-input"]').exists()).toBe(false);
    expect(w.find('[data-testid="move-street"]').exists()).toBe(false);
    await w.get('[data-testid="society-rename"]').trigger('click');
    expect(w.find('[data-testid="rename-input"]').exists()).toBe(true);
    await w.get('[data-testid="society-move"]').trigger('click');
    expect(w.find('[data-testid="rename-input"]').exists()).toBe(false);
    expect(w.find('[data-testid="move-street"]').exists()).toBe(true);
    // 搬家费用传给面板
    expect(w.get('[data-testid="move-cost"]').text()).toBe('约 20,000 银币, 幸运时半价');
  });

  it('旧地址 /society/move 跳过来带 ?sheet=move：打开搬家面板，地址上去掉 sheet', async () => {
    const { w, router } = await mountView('/society?sheet=move');
    expect(w.find('[data-testid="move-street"]').exists()).toBe(true);
    expect(router.currentRoute.value.query.sheet).toBeUndefined();
  });
});

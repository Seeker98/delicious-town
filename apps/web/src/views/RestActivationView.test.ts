import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { ActivationDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import RestActivationView from './RestActivationView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { activation: vi.fn(), signIn: vi.fn(), claimActivation: vi.fn() },
}));

const act = (patch: Partial<ActivationDto> = {}): ActivationDto => ({
  total: 120,
  signedIn: false,
  star: 1,
  level: 10,
  items: [
    {
      id: 1,
      name: '签到',
      points: 10,
      limit: 1,
      count: 1,
      needStar: 0,
      needLevel: 0,
      needDays: 0,
      blocked: null,
      off: false,
    },
    {
      id: 2,
      name: '打蟑螂',
      points: 1,
      limit: 12,
      count: 3,
      needStar: 0,
      needLevel: 0,
      needDays: 0,
      blocked: null,
      off: false,
    },
    {
      id: 50,
      name: '配送外卖',
      points: 5,
      limit: 2,
      count: 0,
      needStar: 2,
      needLevel: 0,
      needDays: 0,
      blocked: null,
      off: false,
    },
    {
      id: 901,
      name: '交易所成交',
      points: 5,
      limit: 1,
      count: 0,
      needStar: 0,
      needLevel: 30,
      needDays: 0,
      blocked: null,
      off: false,
    },
    {
      id: 903,
      name: '一番赏抽赏',
      points: 5,
      limit: 1,
      count: 0,
      needStar: 0,
      needLevel: 0,
      needDays: 0,
      blocked: null,
      off: true,
    },
  ],
  rewards: [
    { points: 50, award: { exp: 500 }, claimed: true, multiplier: 1 },
    { points: 100, award: { diamond: 2 }, claimed: false, multiplier: 1 },
    { points: 150, award: { diamond: 5 }, claimed: false, multiplier: 1 },
  ],
  kujiTicket: null,
  ...patch,
});

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: {} }],
  });
  const w = mount(RestActivationView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

/** 签到和今日活跃单独一页（问题记录：活跃和任务页太长，活跃单拎出来）；这些测试原来在 RestTasksView.test */
describe('RestActivationView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.activation).mockResolvedValue(act());
    vi.mocked(endpoints.signIn).mockResolvedValue({});
  });

  it('活跃项名按目录取当前语言；目录里没有时用服务端给的（问题记录 272）', async () => {
    useCatalogStore().apply({
      version: 'v:en',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
      data: {
        tasks: [],
        chapters: [],
        questLines: [],
        activation: [{ id: 1, name: 'Check in' }],
        bless: [],
        tower: [],
        formulas: [],
        kujiThemes: [],
        proficiency: [],
        cookbooks: [],
      },
    });
    const w = await mountView();
    expect(w.get('[data-testid="act-1"]').text()).toContain('Check in');
    expect(w.get('[data-testid="act-2"]').text()).toContain('打蟑螂');
  });

  it('有去任务页的入口（终审：以前收藏任务页的玩家两边都能找到）', async () => {
    const w = await mountView();
    expect(w.get('[data-testid="to-tasks"]').attributes('href')).toBe('/rest/tasks');
    // 和签到按钮放在卡片标题那一行，不单独占一行（问题记录 530）
    expect(w.find('[data-testid="activation-head"] [data-testid="to-tasks"]').exists()).toBe(true);
    expect(w.find('[data-testid="activation-head"] [data-testid="signin"]').exists()).toBe(true);
  });

  it('读取失败、还没读到时也有去任务页的入口（终审 M2）', async () => {
    vi.mocked(endpoints.activation).mockRejectedValue(new Error('x'));
    const w = await mountView();
    expect(w.get('[data-testid="to-tasks"]').attributes('href')).toBe('/rest/tasks');
  });

  it('签到按钮', async () => {
    const w = await mountView();
    await w.find('[data-testid="signin"]').trigger('click');
    await flushPromises();
    expect(endpoints.signIn).toHaveBeenCalled();
  });

  it('活跃项：没做满的写进度排前面，星级不够的写几星开放，做满的标"✓ 已满"排后面（问题记录：灰色黑色分不清）', async () => {
    const w = await mountView();
    expect(w.findAll('[data-testid^="act-"]').map((x) => x.attributes('data-testid'))).toEqual([
      'act-2',
      'act-50',
      'act-901',
      'act-903',
      'act-1',
    ]);
    expect(w.find('[data-testid="act-2"]').text()).toContain('3/12');
    expect(w.find('[data-testid="act-50"]').text()).toContain('🔒 2 星开放');
    expect(w.find('[data-testid="act-50"]').classes()).toContain('dt-act-locked');
    // 等级不够、区服没开的也标锁定（问题记录 360）
    expect(w.find('[data-testid="act-901"]').text()).toContain('🔒 30 级解锁');
    expect(w.find('[data-testid="act-901"]').classes()).toContain('dt-act-locked');
    expect(w.find('[data-testid="act-903"]').text()).toContain('🔒 本服未开放');
    expect(w.find('[data-testid="act-1"]').text()).toContain('✓ 已满');
    expect(w.find('[data-testid="act-1"]').classes()).toContain('dt-act-done');
  });

  it('交易所注册天数不够、邮箱没验证，没有能领奖的限时活动，也标锁定写原因（backlog 第 ⑥ 批）', async () => {
    const item = (id: number, blocked: 'days' | 'email' | 'frozen' | 'noActivity', needDays = 0) => ({
      id,
      name: String(id),
      points: 5,
      limit: 1,
      count: 0,
      needStar: 0,
      needLevel: 0,
      needDays,
      blocked,
      off: false,
    });
    vi.mocked(endpoints.activation).mockResolvedValue(
      act({
        items: [item(901, 'days', 7), item(902, 'email'), item(903, 'frozen'), item(904, 'noActivity')],
      }),
    );
    const w = await mountView();
    expect(w.find('[data-testid="act-901"]').text()).toContain('🔒 注册满 7 天解锁');
    expect(w.find('[data-testid="act-902"]').text()).toContain('🔒 验证邮箱后解锁');
    // 交易所被冻结的店（backlog 下架编号审查）
    expect(w.find('[data-testid="act-903"]').text()).toContain('🔒 交易所已被冻结');
    expect(w.find('[data-testid="act-904"]').text()).toContain('现在没有进行中的限时活动');
    for (const id of [901, 902, 903, 904])
      expect(w.find(`[data-testid="act-${id}"]`).classes()).toContain('dt-act-locked');
  });

  it('活跃奖励三种样子：已领、可以领（实心）、还差几点', async () => {
    const w = await mountView();
    const claimed = w.find('[data-testid="claim-50"]');
    expect(claimed.text()).toBe('✓ 已领 50 点经验 500');
    expect(claimed.attributes('disabled')).toBeDefined();
    const ready = w.find('[data-testid="claim-100"]');
    expect(ready.text()).toBe('领 100 点奖励钻石 2');
    expect(ready.classes()).toContain('btn-primary');
    expect(ready.attributes('disabled')).toBeUndefined();
    const far = w.find('[data-testid="claim-150"]');
    expect(far.text()).toBe('150 点 (还差 30)钻石 5');
    expect(far.attributes('disabled')).toBeDefined();
  });

  it('每档按钮写出这一档送什么（backlog B6）', async () => {
    const w = await mountView();
    expect(w.get('[data-testid="claim-award-50"]').text()).toBe('经验 500');
    expect(w.get('[data-testid="claim-award-100"]').text()).toBe('钻石 2');
    expect(w.get('[data-testid="claim-150"]').text()).toContain('钻石 5');
  });

  it('写明哪一档另送几张券；区服关掉一番赏时不写', async () => {
    vi.mocked(endpoints.activation).mockResolvedValue(act({ kujiTicket: { points: 150, num: 1 } }));
    expect((await mountView()).get('[data-testid="act-kuji-hint"]').text()).toBe(
      '领 150 点奖励另送一番赏抽赏券 ×1',
    );
    vi.mocked(endpoints.activation).mockResolvedValue(act());
    expect((await mountView()).find('[data-testid="act-kuji-hint"]').exists()).toBe(false);
  });

  it('活跃度块的标题用卡片标题样式，和任务页各块一样', async () => {
    const card = (await mountView()).get('[data-testid="card-activation"]');
    expect(card.find('h6').exists()).toBe(false);
    expect(card.get('.dt-card-title').text()).toBe('今日活跃 120');
  });
});

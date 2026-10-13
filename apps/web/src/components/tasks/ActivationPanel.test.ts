import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { ActivationDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useCatalogStore } from '../../stores/catalog';
import ActivationPanel from './ActivationPanel.vue';

vi.mock('../../api/endpoints', () => ({
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
    { points: 50, award: { exp: 500 }, claimed: true },
    { points: 100, award: { diamond: 2 }, claimed: false },
    { points: 150, award: { diamond: 5 }, claimed: false },
  ],
  kujiTicket: null,
  ...patch,
});

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: {} }],
  });
  const w = mount(ActivationPanel, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

/** 签到和今日活跃：任务页的“今日”标签（界面改版 P2b，原来单独一页 /rest/activation） */
describe('ActivationPanel', () => {
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
        tower: [],
        kujiThemes: [],
        proficiency: [],
        cookbooks: [],
      },
    });
    const w = await mountView();
    expect(w.get('[data-testid="act-1"]').text()).toContain('Check in');
    expect(w.get('[data-testid="act-2"]').text()).toContain('打蟑螂');
  });

  it('签到按钮在卡片标题那一行（问题记录 530）；在任务页里，不再放去任务页的入口（界面改版 P2b）', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="activation-head"] [data-testid="signin"]').exists()).toBe(true);
    expect(w.find('[data-testid="to-tasks"]').exists()).toBe(false);
  });

  it('读失败：写读取失败，不再一直显示骨架（backlog P3）', async () => {
    vi.mocked(endpoints.activation).mockRejectedValue(new Error('x'));
    const w = await mountView();
    expect(w.find('[data-testid="activation-skeleton"]').exists()).toBe(false);
    expect(w.find('[data-testid="activation-failed"]').exists()).toBe(true);
  });

  it('签到按钮', async () => {
    const w = await mountView();
    const btn = w.get('[data-testid="signin"]');
    expect(btn.element.tagName).toBe('BUTTON');
    expect(btn.text()).toBe('签到');
    await btn.trigger('click');
    await flushPromises();
    expect(endpoints.signIn).toHaveBeenCalled();
  });

  it('签过到了写“今天已签到”小标签，不再是按钮', async () => {
    vi.mocked(endpoints.activation).mockResolvedValue(act({ signedIn: true }));
    const w = await mountView();
    const tag = w.get('[data-testid="activation-head"] [data-testid="signin"]');
    expect(tag.element.tagName).toBe('SPAN');
    expect(tag.classes()).toEqual(expect.arrayContaining(['dt-tag', 'dt-tag-ok']));
    expect(tag.text()).toBe('今天已签到');
  });

  it('活跃项：没做满的写进度排前面，星级不够的写几星开放，做满的收起来标"已满"排后面（问题记录：灰色黑色分不清）', async () => {
    const w = await mountView();
    expect(w.findAll('.dt-row[data-testid^="act-"]').map((x) => x.attributes('data-testid'))).toEqual([
      'act-2',
      'act-50',
      'act-901',
      'act-903',
      'act-1',
    ]);
    expect(w.text()).toContain('做什么能加活跃');
    expect(w.get('[data-testid="act-2"]').text()).toContain('3/12');
    expect(w.get('[data-testid="act-2"]').classes()).not.toContain('is-locked');
    // 锁定的灰掉写原因（锁符号换成图标）和每次几点，不写进度
    const star = w.get('[data-testid="act-50"]');
    expect(star.text()).toContain('2 星开放');
    expect(star.text()).toContain('每次 5 点');
    expect(star.text()).not.toContain('🔒');
    expect(star.text()).not.toContain('0/2');
    expect(star.find('.bi-lock-fill').exists()).toBe(true);
    expect(star.classes()).toContain('is-locked');
    // 等级不够、区服没开的也标锁定（问题记录 360）
    expect(w.get('[data-testid="act-901"]').text()).toContain('30 级解锁');
    expect(w.get('[data-testid="act-901"]').classes()).toContain('is-locked');
    expect(w.get('[data-testid="act-903"]').text()).toContain('本服未开放');
    expect(w.get('[data-testid="act-903"]').classes()).toContain('is-locked');
    // 做满的收进折叠行，折叠行写几项和名字
    const fold = w.get('[data-testid="act-done"]');
    expect(fold.element.tagName).toBe('DETAILS');
    expect(fold.get('summary').text()).toBe('已做满 1 项 · 签到');
    const full = fold.get('[data-testid="act-1"]');
    expect(full.get('.dt-tag.dt-tag-ok').text()).toBe('已满');
  });

  it('排序：做了一部分的在最前，再是没做的，没开放的最后；没有做满的就没有折叠行（界面改版 P7）', async () => {
    const item = (id: number, count: number, needStar = 0) => ({
      id,
      name: String(id),
      points: 1,
      limit: 5,
      count,
      needStar,
      needLevel: 0,
      needDays: 0,
      blocked: null,
      off: false,
    });
    vi.mocked(endpoints.activation).mockResolvedValue(
      act({ items: [item(11, 0, 3), item(12, 0), item(13, 2), item(14, 0)] }),
    );
    const w = await mountView();
    expect(w.findAll('.dt-row[data-testid^="act-"]').map((x) => x.attributes('data-testid'))).toEqual([
      'act-13',
      'act-12',
      'act-14',
      'act-11',
    ]);
    expect(w.find('[data-testid="act-done"]').exists()).toBe(false);
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
    expect(w.get('[data-testid="act-901"]').text()).toContain('注册满 7 天解锁');
    expect(w.get('[data-testid="act-902"]').text()).toContain('验证邮箱后解锁');
    // 交易所被冻结的店（backlog 下架编号审查）
    expect(w.get('[data-testid="act-903"]').text()).toContain('交易所已被冻结');
    expect(w.get('[data-testid="act-904"]').text()).toContain('现在没有进行中的限时活动');
    for (const id of [901, 902, 903, 904]) {
      const row = w.get(`[data-testid="act-${id}"]`);
      expect(row.classes()).toContain('is-locked');
      expect(row.find('.bi-lock-fill').exists()).toBe(true);
      expect(row.text()).not.toContain('🔒');
    }
  });

  it('活跃奖励三种样子：已领、可以领（实心）、还差几点', async () => {
    const w = await mountView();
    const claimed = w.get('[data-testid="claim-50"]');
    expect(claimed.element.tagName).toBe('SPAN');
    expect(claimed.classes()).toEqual(expect.arrayContaining(['dt-tag', 'dt-tag-ok']));
    expect(claimed.text()).toBe('已领');
    const ready = w.get('[data-testid="claim-100"]');
    expect(ready.element.tagName).toBe('BUTTON');
    expect(ready.text()).toBe('领奖');
    expect(ready.classes()).toContain('btn-primary');
    expect(ready.attributes('disabled')).toBeUndefined();
    expect(w.get('[data-testid="tier-100"]').classes()).toContain('is-ready');
    await ready.trigger('click');
    await flushPromises();
    expect(endpoints.claimActivation).toHaveBeenCalledWith(100);
    const far = w.get('[data-testid="claim-150"]');
    expect(far.element.tagName).toBe('SPAN');
    expect(far.classes()).toContain('dt-tag');
    expect(far.text()).toBe('还差 30');
    expect(w.get('[data-testid="tier-150"]').classes()).not.toContain('is-ready');
    expect(w.get('[data-testid="tier-50"]').classes()).not.toContain('is-ready');
  });

  it('每档写出这一档送什么（backlog B6）', async () => {
    const w = await mountView();
    expect(w.get('[data-testid="claim-award-50"]').text()).toBe('经验 500');
    expect(w.get('[data-testid="claim-award-100"]').text()).toBe('钻石 2');
    expect(w.get('[data-testid="claim-award-150"]').text()).toBe('钻石 5');
    expect(w.get('[data-testid="tier-150"]').text()).toContain('钻石 5');
  });

  it('写明哪一档另送几张券；区服关掉一番赏时不写', async () => {
    vi.mocked(endpoints.activation).mockResolvedValue(act({ kujiTicket: { points: 150, num: 1 } }));
    const w = await mountView();
    expect(w.get('[data-testid="tier-150"] .dt-row-sub').text()).toBe('另送一番赏抽赏券 ×1');
    expect(w.get('[data-testid="tier-100"]').text()).not.toContain('抽赏券');
    vi.mocked(endpoints.activation).mockResolvedValue(act());
    expect((await mountView()).text()).not.toContain('抽赏券');
  });

  it('活跃度卡片头写今日活跃和最高一档，下面一条进度条（界面改版 P7）', async () => {
    const card = (await mountView()).get('[data-testid="card-activation"]');
    expect(card.find('h6').exists()).toBe(false);
    const head = card.get('[data-testid="activation-head"]');
    expect(head.text()).toContain('今日活跃');
    expect(head.get('.dt-act-total').text().replace(/\s+/g, ' ')).toBe('今日活跃 120 / 150');
    const bar = card.get('[role="progressbar"]');
    expect(bar.attributes('aria-valuenow')).toBe('120');
    expect(bar.attributes('aria-valuemax')).toBe('150');
    expect(bar.findAll('.dt-act-node')).toHaveLength(3);
    expect(bar.findAll('.dt-act-node.is-on')).toHaveLength(2);
  });

  it('还没读回来时是骨架行（界面改版 P3）', async () => {
    vi.mocked(endpoints.activation).mockReturnValue(new Promise(() => undefined));
    const w = await mountView();
    expect(w.find('[data-testid="activation-skeleton"]').exists()).toBe(true);
  });
});

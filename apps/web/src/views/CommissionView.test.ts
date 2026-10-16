import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { CommissionDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import CommissionView from './CommissionView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { commission: vi.fn() },
}));

const data = (patch: Partial<CommissionDto> = {}): CommissionDto => ({
  notices: [
    { id: 2, member: 'squid', body: '从今天起每天巡查', createdAt: new Date().toISOString() },
    { id: 1, member: 'mayor', body: '委员会成立', createdAt: '2026-01-01T00:00:00.000Z' },
  ],
  brief: {
    hygiene: { roachKills: 7, mouseVisits: 2, mouseSteals: 1 },
    weather: { id: 1, until: '2026-10-16T07:40:00.000Z' },
    market: { foodsIds: [], next: '2026-10-16T08:00:00.000Z' },
    finance: { coin: 1_240_000 },
    daily: null,
  },
  myHygiene: {
    day: '2026-10-15',
    roachHours: 3.2,
    roachAuto: 2,
    mouse: 4,
    stolen: 5,
    trapped: 1,
    roachDevice: null,
    mouseDevice: null,
    at: '2026-10-15T16:00:00.000Z',
  },
  ...patch,
});

async function mountView(path = '/commission') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }],
  });
  await router.push(path);
  // 委员面板 Teleport 到 body：测试里把 teleport 桩掉
  const w = mount(CommissionView, { global: { plugins: [router], stubs: { teleport: true } } });
  await flushPromises();
  return { w, router };
}

describe('小镇委员会页（2026-10-16）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().loaded = true;
    vi.mocked(endpoints.commission).mockResolvedValue(data());
  });

  it('今日要点五位委员一人一行；公报按接口顺序，三天内的标“新”', async () => {
    const { w } = await mountView();
    expect(w.findAll('[data-testid^="cm-row-"]').map((r) => r.attributes('data-testid'))).toEqual([
      'cm-row-squid',
      'cm-row-fandao',
      'cm-row-garden',
      'cm-row-gary',
      'cm-row-bro13',
    ]);
    expect(w.get('[data-testid="cm-brief-squid"]').text()).toBe(
      '全镇今天灭了 7 只蟑螂；老鼠来了 2 次, 偷走 1 次',
    );
    expect(w.get('[data-testid="cm-brief-garden"]').text()).toContain('特价菜场卖完了');
    expect(w.get('[data-testid="cm-brief-gary"]').text()).toContain('1,240,000');
    expect(w.get('[data-testid="cm-brief-bro13"]').text()).toBe('还没有日报');
    const notices = w.findAll('[data-testid="cm-notice"]');
    expect(notices.map((n) => n.find('p').text())).toEqual(['从今天起每天巡查', '委员会成立']);
    expect(notices[0]!.text()).toContain('章鱼哥 · 卫生与食品安全委员');
    expect(notices[0]!.text()).toContain('新');
    expect(notices[1]!.find('.dt-tag-warn').exists()).toBe(false);
    expect(w.find('[data-testid="cm-sheet"]').exists()).toBe(false);
  });

  it('点章鱼哥那一行：地址带 ?m=squid，面板里有分管、今天全镇、本店最近一次巡查，按钮去餐厅动态', async () => {
    const { w, router } = await mountView();
    await w.get('[data-testid="cm-row-squid"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.m).toBe('squid');
    const sheet = w.get('[data-testid="cm-sheet"]');
    expect(sheet.text()).toContain('蟑螂、老鼠、店里的卫生');
    expect(w.get('[data-testid="cm-mine"]').text()).toContain('章鱼哥来巡查 (10/15): 蟑螂占桌 3.2 桌·小时');
    expect(w.get('[data-testid="cm-go"]').attributes('href')).toBe('/friends?tab=feed');
  });

  it('?m= 直接打开面板（餐厅动态链过来）；还没巡查过写“还没巡查过”；不认识的 m 不打开', async () => {
    vi.mocked(endpoints.commission).mockResolvedValue(data({ myHygiene: null }));
    const { w } = await mountView('/commission?m=squid');
    expect(w.get('[data-testid="cm-mine"]').text()).toBe('还没巡查过');
    const other = await mountView('/commission?m=krab');
    expect(other.w.find('[data-testid="cm-sheet"]').exists()).toBe(false);
  });

  it('没有公报写空状态；特价菜场还有货时列几种，多了写“等”；区服没开菜场写没开', async () => {
    vi.mocked(endpoints.commission).mockResolvedValue(
      data({
        notices: [],
        brief: { ...data().brief, market: { foodsIds: [1001, 1002, 1003, 1004], next: '' } },
      }),
    );
    const { w } = await mountView();
    expect(w.text()).toContain('委员会还没发过公报。');
    expect(w.get('[data-testid="cm-brief-garden"]').text()).toMatch(/^特价菜场还有 4 种: .+ 等$/);
    vi.mocked(endpoints.commission).mockResolvedValue(data({ brief: { ...data().brief, market: null } }));
    const off = await mountView();
    expect(off.w.get('[data-testid="cm-brief-garden"]').text()).toBe('这个区服没开');
  });

  it('读不到时显示错误', async () => {
    vi.mocked(endpoints.commission).mockRejectedValue(new Error('offline'));
    const { w } = await mountView();
    expect(w.find('.alert-danger').exists()).toBe(true);
  });
});

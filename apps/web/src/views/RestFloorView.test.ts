import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import { useSessionStore } from '../stores/session';
import RestFloorView from './RestFloorView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { floor: vi.fn(), roachKill: vi.fn(), dineExpel: vi.fn() },
}));

/** 底部面板用 Teleport：测试里原地渲染 */
const mountView = () => mount(RestFloorView, { global: { stubs: { teleport: true } } });

describe('RestFloorView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useSessionStore().me = {
      accountId: 1,
      username: 'u',
      email: 'u@x',
      emailVerified: true,
      role: 'player',
      shardId: 1,
      restaurantId: 7,
      lang: null,
      npcRestId: null,
    };
    vi.mocked(endpoints.floor).mockResolvedValue([
      { no: 1, floor: 1, customer: 3, roach: true, roachBy: 9 },
      {
        no: 2,
        floor: 1,
        customer: 9,
        freeloaderRestId: 9,
        freeloaderName: '乙',
        freeloaderSince: new Date(Date.now() - 40 * 60_000).toISOString(),
      },
      {
        no: 3,
        floor: 1,
        customer: 9,
        freeloaderRestId: 8,
        freeloaderName: '丙',
        freeloaderSince: new Date(Date.now() - 5 * 60_000).toISOString(),
      },
    ]);
    vi.mocked(endpoints.roachKill).mockResolvedValue({ strength: 1, coin: 15, exp: 10, tickets: 0 });
    vi.mocked(endpoints.dineExpel).mockResolvedValue({ hostCoin: 20, dinerLoss: 10 });
  });

  it('点自己店里的蟑螂消灭', async () => {
    const w = mountView();
    await flushPromises();
    await w.find('[data-testid="table-1"]').trigger('click');
    await w.find('[data-testid="act-kill"]').trigger('click');
    await flushPromises();
    expect(endpoints.roachKill).toHaveBeenCalledWith(7, 1);
  });

  it('白食满 30 分钟才能请走', async () => {
    const w = mountView();
    await flushPromises();
    await w.find('[data-testid="table-3"]').trigger('click');
    expect(w.find('[data-testid="act-expel"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="table-2"]').trigger('click');
    await w.find('[data-testid="act-expel"]').trigger('click');
    await flushPromises();
    expect(endpoints.dineExpel).toHaveBeenCalledWith(2);
  });

  it('点开一桌写点了什么、要几品、你的几品、满不满意，吃了特色菜再写一行（问题记录 559）', async () => {
    const catalog = useCatalogStore();
    catalog.dataMap = new Map([['cookbooks:5', { id: 5, name: '宫保鸡丁' }]]) as never;
    catalog.mcMap = new Map([[42, { id: 42, name: '佛跳墙' }]]) as never;
    vi.mocked(endpoints.floor).mockResolvedValue([
      {
        no: 4,
        floor: 1,
        customer: 2,
        last: {
          type: 2,
          coin: 30,
          exp: 5,
          oil: 3,
          req: 3,
          grade: 2,
          cookbookId: 5,
          satisfied: false,
          mcId: 42,
          mcNum: 1,
        },
      },
    ]);
    const w = mountView();
    await flushPromises();
    await w.find('[data-testid="table-4"]').trigger('click');
    const lines = w.findAll('[data-testid="table-order"]').map((x) => x.text());
    expect(lines).toEqual([
      '点了「宫保鸡丁」, 要上品, 你的是中品, 不满意, 付一半菜钱',
      '吃了特色菜「佛跳墙」×1',
    ]);
  });

  it('点开挑剔顾客走了的桌：写点了哪道没学会的菜、走了，下面说明这一轮没有收入（挑剔顾客调整）', async () => {
    const catalog = useCatalogStore();
    catalog.dataMap = new Map([['cookbooks:5', { id: 5, name: '宫保鸡丁' }]]) as never;
    vi.mocked(endpoints.floor).mockResolvedValue([
      { no: 4, floor: 1, customer: -2, last: { type: -2, coin: 0, exp: 0, oil: 0, req: 1, cookbookId: 5 } },
    ]);
    const w = mountView();
    await flushPromises();
    await w.find('[data-testid="table-4"]').trigger('click');
    expect(w.findAll('[data-testid="table-order"]').map((x) => x.text())).toEqual([
      '点了「宫保鸡丁」, 你还没学会这道菜, 他走了',
    ]);
    expect(w.get('[data-testid="table-left-note"]').text()).toContain('这一轮这桌没有收入');
    expect(w.text()).not.toContain('上一轮 0 银');
  });

  it('点一桌从底部弹出面板（界面改版 P7）；灭蟑螂是主按钮，赶白食是危险描边；普通桌没有操作按钮', async () => {
    const w = mountView();
    await flushPromises();
    await w.get('[data-testid="table-1"]').trigger('click');
    const dlg = w.get('[role="dialog"]');
    expect(dlg.text()).toContain('第 1 桌 · 蟑螂');
    expect(dlg.find('[data-testid="table-detail"]').exists()).toBe(true);
    expect(dlg.get('[data-testid="act-kill"]').classes()).toContain('btn-primary');
    await w.get('[data-testid="table-2"]').trigger('click');
    expect(w.get('[data-testid="act-expel"]').classes()).toContain('btn-outline-danger');
  });
});

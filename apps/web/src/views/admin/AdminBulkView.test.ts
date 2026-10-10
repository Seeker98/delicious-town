import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminBulkFoodDto, AdminBulkLotDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import AdminBulkView from './AdminBulkView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: {
    bulkFoods: vi.fn(),
    updateBulkFoods: vi.fn(),
    syncBulkFoods: vi.fn(),
    bulkLots: vi.fn(),
    cancelBulkLot: vi.fn(),
  },
}));

const row = (p: Partial<AdminBulkFoodDto> & { foodsId: number }): AdminBulkFoodDto => ({
  level: 3,
  rare: true,
  inList: true,
  enabled: true,
  futuresEnabled: true,
  reserve: 11_088,
  ...p,
});
const lot = (p: Partial<AdminBulkLotDto> & { id: number }): AdminBulkLotDto => ({
  day: '2026-10-12',
  foodsId: 31,
  level: 3,
  qty: 80,
  reserve: 11_088,
  opensAt: '2026-10-12T12:00:00Z',
  endsAt: '2026-10-13T12:00:00Z',
  closeAt: '2026-10-13T11:57:31Z',
  status: 'open',
  price: null,
  sold: null,
  bidders: 3,
  demand: 40,
  ...p,
});
const FOODS = [
  row({ foodsId: 31 }),
  row({ foodsId: 32, enabled: false, futuresEnabled: false }),
  row({ foodsId: 21, level: 2, rare: false, inList: false, enabled: false, futuresEnabled: null }),
];
const LOTS = [lot({ id: 9 }), lot({ id: 8, status: 'settled', price: 12_000, sold: 80 })];
const T = (s: string) => `[data-testid="${s}"]`;

async function mountView() {
  const w = mount(AdminBulkView);
  await flushPromises();
  return w;
}

describe('AdminBulkView（大宗认购设计 §3.3）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    setActivePinia(createPinia());
    const admin = useAdminStore();
    admin.me = { accountId: 1, username: 'boss', role: 'admin' };
    admin.shardId = 1;
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [
        { id: 31, name: '火腿', level: 3, odds: 60 },
        { id: 32, name: '香菇', level: 3, odds: 65 },
        { id: 21, name: '青菜', level: 2, odds: 100 },
      ],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    vi.mocked(adminApi.bulkFoods).mockResolvedValue(FOODS);
    vi.mocked(adminApi.bulkLots).mockResolvedValue(LOTS);
    vi.mocked(adminApi.updateBulkFoods).mockResolvedValue(null);
    vi.mocked(adminApi.syncBulkFoods).mockResolvedValue(null);
    vi.mocked(adminApi.cancelBulkLot).mockResolvedValue(null);
  });

  it('清单按等级、稀有、状态、名字筛选；写期货里的状态和起拍价', async () => {
    const w = await mountView();
    expect(w.findAll('[data-testid^="ab-food-"]')).toHaveLength(3);
    await w.get(T('ab-level')).setValue('2');
    expect(w.findAll('[data-testid^="ab-food-"]')).toHaveLength(1);
    await w.get(T('ab-level')).setValue('');
    await w.get(T('ab-state')).setValue('off');
    expect(w.findAll('[data-testid^="ab-food-"]').map((x) => x.attributes('data-testid'))).toEqual([
      'ab-food-32',
    ]);
    await w.get(T('ab-state')).setValue('');
    await w.get(T('ab-q')).setValue('火腿');
    const r = w.get(T('ab-food-31')).text();
    expect(r).toContain('11,088');
    expect(r).toContain('启用');
  });

  it('勾选后批量停用、启用', async () => {
    const w = await mountView();
    await w.get(T('ab-check-31')).setValue(true);
    await w.get(T('ab-batch-disable')).trigger('click');
    await flushPromises();
    expect(adminApi.updateBulkFoods).toHaveBeenCalledWith([{ foodsId: 31, enabled: false }]);
    await w.get(T('ab-check-21')).setValue(true);
    await w.get(T('ab-batch-enable')).trigger('click');
    await flushPromises();
    expect(adminApi.updateBulkFoods).toHaveBeenLastCalledWith([{ foodsId: 21, enabled: true }]);
  });

  it('从期货同步：先确认，确认后同步并重读', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const w = await mountView();
    await w.get(T('ab-sync')).trigger('click');
    expect(adminApi.syncBulkFoods).not.toHaveBeenCalled();
    await w.get(T('ab-sync')).trigger('click');
    await flushPromises();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(adminApi.syncBulkFoods).toHaveBeenCalled();
    expect(adminApi.bulkFoods).toHaveBeenCalledTimes(2);
  });

  it('批次列表：收盘时刻、人数、份数、状态；进行中的能取消（确认后），其他没有按钮', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountView();
    const open = w.get(T('ab-lot-9')).text();
    expect(open).toContain('3');
    expect(open).toContain('40');
    expect(w.find(T('ab-cancel-8')).exists()).toBe(false);
    await w.get(T('ab-cancel-9')).trigger('click');
    await flushPromises();
    expect(adminApi.cancelBulkLot).toHaveBeenCalledWith(9);
    expect(adminApi.bulkLots).toHaveBeenCalledTimes(2);
  });

  it('协管只能看：没有同步、批量、取消按钮', async () => {
    useAdminStore().me = { accountId: 2, username: 'mod', role: 'mod' };
    const w = await mountView();
    expect(w.find(T('ab-sync')).exists()).toBe(false);
    expect(w.find(T('ab-batch-enable')).exists()).toBe(false);
    expect(w.find(T('ab-cancel-9')).exists()).toBe(false);
    expect(w.find(T('ab-check-31')).exists()).toBe(false);
  });
});

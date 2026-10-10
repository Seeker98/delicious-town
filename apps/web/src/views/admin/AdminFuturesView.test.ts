import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminFuturesFoodDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import AdminFuturesView from './AdminFuturesView.vue';

vi.mock('../../api/admin', () => ({ adminApi: { futuresFoods: vi.fn(), updateFuturesFoods: vi.fn() } }));

const row = (p: Partial<AdminFuturesFoodDto> & { foodsId: number }): AdminFuturesFoodDto => ({
  level: 3,
  rare: true,
  inList: true,
  enabled: true,
  dailyQuota: null,
  defaultQuota: 100,
  streets: [1],
  ref: 9000,
  levelPrice: 9000,
  unitPrice: 10800,
  ordered: 0,
  ...p,
});
const LIST = [
  row({ foodsId: 31, ordered: 7, streets: [1, 2] }),
  row({ foodsId: 32, enabled: false, dailyQuota: 5 }),
  row({ foodsId: 21, level: 2, rare: false, inList: false, enabled: false, defaultQuota: 500, streets: [2] }),
];
const T = (s: string) => `[data-testid="${s}"]`;

async function mountView() {
  const w = mount(AdminFuturesView);
  await flushPromises();
  return w;
}

describe('AdminFuturesView（期货设计 §5.3）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      streets: [
        { id: 1, name: '川菜街' },
        { id: 2, name: '粤菜街' },
      ],
      weather: [],
      devices: [],
    } as never);
    vi.mocked(adminApi.futuresFoods).mockResolvedValue(LIST);
    vi.mocked(adminApi.updateFuturesFoods).mockResolvedValue(null);
  });

  it('按当前区服读；每行写名字、等级、稀有、街道数、参考价、等级价、期货价、额度、今天已订', async () => {
    const w = await mountView();
    expect(adminApi.futuresFoods).toHaveBeenCalledWith(1);
    const r = w.get(T('fut-row-31')).text();
    for (const x of ['31', '火腿', '3', '稀有', '9,000', '10,800', '7']) expect(r).toContain(x);
    expect(w.get(T('fut-streets-31')).text()).toBe('2');
    expect(w.get(T('fut-quota-31')).text()).toContain('100');
    expect(w.get(T('fut-quota-31')).classes()).toContain('text-muted');
    expect(w.get(T('fut-quota-32')).text()).toContain('5');
    expect(w.get(T('fut-row-21')).text()).toContain('不在表里');
  });

  it('筛选：等级、稀有 / 普通、上架 / 下架 / 不在表里、名字、街道', async () => {
    const w = await mountView();
    const ids = () => w.findAll('[data-testid^="fut-row-"]').map((x) => x.attributes('data-testid'));
    await w.get(T('fut-level')).setValue('2');
    expect(ids()).toEqual(['fut-row-21']);
    await w.get(T('fut-level')).setValue('');
    await w.get(T('fut-kind')).setValue('rare');
    expect(ids()).toEqual(['fut-row-31', 'fut-row-32']);
    await w.get(T('fut-kind')).setValue('');
    await w.get(T('fut-state')).setValue('off');
    expect(ids()).toEqual(['fut-row-32']);
    await w.get(T('fut-state')).setValue('out');
    expect(ids()).toEqual(['fut-row-21']);
    await w.get(T('fut-state')).setValue('');
    await w.get(T('fut-street')).setValue('1');
    expect(ids()).toEqual(['fut-row-31', 'fut-row-32']);
    await w.get(T('fut-street')).setValue('');
    await w.get(T('fut-q')).setValue('香');
    expect(ids()).toEqual(['fut-row-32']);
  });

  it('勾选几行一键上架、下架；全选当前筛选结果；改完重读', async () => {
    const w = await mountView();
    await w.get(T('fut-check-31')).setValue(true);
    await w.get(T('fut-check-21')).setValue(true);
    await w.get(T('fut-off')).trigger('click');
    await flushPromises();
    expect(adminApi.updateFuturesFoods).toHaveBeenLastCalledWith([
      { foodsId: 31, enabled: false },
      { foodsId: 21, enabled: false },
    ]);
    expect(adminApi.futuresFoods).toHaveBeenCalledTimes(2);
    await w.get(T('fut-kind')).setValue('rare');
    await w.get(T('fut-all')).trigger('click');
    await w.get(T('fut-on')).trigger('click');
    await flushPromises();
    expect(adminApi.updateFuturesFoods).toHaveBeenLastCalledWith([
      { foodsId: 31, enabled: true },
      { foodsId: 32, enabled: true },
    ]);
  });

  it('单行改额度；清空恢复默认（发 null）', async () => {
    const w = await mountView();
    await w.get(T('fut-quota-input-31')).setValue('12');
    await w.get(T('fut-quota-save-31')).trigger('click');
    await flushPromises();
    expect(adminApi.updateFuturesFoods).toHaveBeenLastCalledWith([{ foodsId: 31, dailyQuota: 12 }]);
    await w.get(T('fut-quota-input-32')).setValue('');
    await w.get(T('fut-quota-save-32')).trigger('click');
    await flushPromises();
    expect(adminApi.updateFuturesFoods).toHaveBeenLastCalledWith([{ foodsId: 32, dailyQuota: null }]);
  });

  it('协管只读：没有勾选框和按钮', async () => {
    useAdminStore().me = { accountId: 2, username: 'm', role: 'mod' };
    const w = await mountView();
    expect(w.find(T('fut-check-31')).exists()).toBe(false);
    expect(w.find(T('fut-on')).exists()).toBe(false);
    expect(w.find(T('fut-quota-input-31')).exists()).toBe(false);
  });
});

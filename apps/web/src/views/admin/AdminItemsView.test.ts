import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminItemRow, AdminItemsDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import AdminItemsView from './AdminItemsView.vue';

vi.mock('../../api/admin', () => ({ adminApi: { items: vi.fn() } }));

const row = (o: Partial<AdminItemRow>): AdminItemRow => ({
  kind: 'goods',
  id: 1,
  name: '体力卡',
  category: '消耗品',
  level: 0,
  desc: '',
  gives: [{ where: '商店', n: 1 }],
  uses: [{ where: '加体力', n: 1 }],
  code: false,
  noSource: false,
  noUse: false,
  notes: [],
  retired: false,
  ...o,
});
const data: AdminItemsDto = {
  maxGrade: 6,
  grades: [{ grade: 1, name: '普通', open: true, foodLevels: { 1: 12 } }],
  rows: [
    row({}),
    row({ id: 20001, name: '开发测试礼包', category: '礼包', retired: true, gives: [], noSource: true }),
    row({ id: 2, name: '孤儿道具', gives: [], uses: [], noSource: true, noUse: true }),
    row({
      id: 3,
      name: '礼包里的东西',
      gives: [
        { where: '礼包 A', n: 2, retired: true },
        { where: '礼包 B', n: 1, dead: true },
      ],
      notes: ['只能靠菜园获得'],
    }),
    row({ kind: 'foods', id: 101, name: '大米', category: '1 级食材', level: 1 }),
  ],
};

describe('后台道具整理只读页（问题记录 429）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(adminApi.items).mockResolvedValue(data);
  });

  it('默认看道具：名字、编号、类型、来源和用途；下架和没来源的打标；写明怎么下架', async () => {
    const w = mount(AdminItemsView);
    await flushPromises();
    expect(w.text()).toContain('pnpm -F @dt/server items');
    const rows = w.findAll('[data-testid^="item-goods-"]');
    expect(rows).toHaveLength(4);
    const dev = w.get('[data-testid="item-goods-20001"]').text();
    expect(dev).toContain('开发测试礼包');
    expect(dev).toContain('已下架');
    // 已下架的本来就没有来源，不再标红（终审 I1）
    expect(dev).not.toContain('没有来源');
    const gift = w.get('[data-testid="item-goods-3"]').text();
    expect(gift).toContain('礼包 A×2（已下架）');
    expect(gift).toContain('礼包 B（拿不到）');
    expect(gift).toContain('只能靠菜园获得');
  });

  it('筛选：没有来源、没有用途、已下架；搜名字或编号；切到食材', async () => {
    const w = mount(AdminItemsView);
    await flushPromises();
    await w.get('[data-testid="items-filter"]').setValue('noUse');
    expect(w.findAll('[data-testid^="item-goods-"]').map((x) => x.attributes('data-testid'))).toEqual([
      'item-goods-2',
    ]);
    // 没有来源只算没下架的（终审 I1）
    await w.get('[data-testid="items-filter"]').setValue('noSource');
    expect(w.findAll('[data-testid^="item-goods-"]').map((x) => x.attributes('data-testid'))).toEqual([
      'item-goods-2',
    ]);
    await w.get('[data-testid="items-filter"]').setValue('retired');
    expect(w.findAll('[data-testid^="item-goods-"]')).toHaveLength(1);
    await w.get('[data-testid="items-filter"]').setValue('notes');
    expect(w.findAll('[data-testid^="item-goods-"]').map((x) => x.attributes('data-testid'))).toEqual([
      'item-goods-3',
    ]);
    await w.get('[data-testid="items-filter"]').setValue('all');
    await w.get('[data-testid="items-search"]').setValue('20001');
    expect(w.findAll('[data-testid^="item-goods-"]')).toHaveLength(1);
    // 页面上编号写成 #20001，照抄也能搜到
    await w.get('[data-testid="items-search"]').setValue('#20001');
    expect(w.findAll('[data-testid^="item-goods-"]')).toHaveLength(1);
    await w.get('[data-testid="items-search"]').setValue('');
    await w.get('[data-testid="items-kind-foods"]').trigger('click');
    expect(w.find('[data-testid="item-foods-101"]').exists()).toBe(true);
    expect(w.find('[data-testid^="item-goods-"]').exists()).toBe(false);
  });

  it('读取失败：写读取失败、带重试（终审 Minor 5）', async () => {
    vi.mocked(adminApi.items).mockRejectedValueOnce(new Error('x'));
    const w = mount(AdminItemsView);
    await flushPromises();
    expect(w.text()).not.toContain('加载中');
    await w.get('[data-testid="items-retry"]').trigger('click');
    await flushPromises();
    expect(w.findAll('[data-testid^="item-goods-"]')).toHaveLength(4);
  });

  it('写明只按默认区服数值算（终审 I2：顶部切区服不影响这页）', async () => {
    const w = mount(AdminItemsView);
    await flushPromises();
    expect(w.text()).toContain('默认区服数值');
  });
});

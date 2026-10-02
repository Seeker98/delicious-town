import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminActivityDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { ApiError } from '../../api/client';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import AdminActivitiesView from './AdminActivitiesView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: {
    activities: vi.fn(),
    createActivity: vi.fn(),
    updateActivity: vi.fn(),
    endActivity: vi.fn(),
    deleteActivity: vi.fn(),
  },
}));

const row: AdminActivityDto = {
  id: 7,
  shardId: 1,
  kind: 'goals',
  def: { goals: [{ key: 'signin', target: 1, award: { coin: 5 } }] },
  title: '国庆签到',
  body: '说明',
  startsAt: '2026-10-01T00:00:00.000Z',
  endsAt: '2099-10-08T00:00:00.000Z',
  minLevel: 1,
  state: 'running',
  participants: 12,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  actor: 'boss',
};

describe('AdminActivitiesView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    useAdminStore().me = { accountId: 1, username: 'boss', role: 'admin' };
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    vi.mocked(adminApi.activities).mockResolvedValue([row]);
    vi.mocked(adminApi.createActivity).mockResolvedValue(row);
  });

  it('列表显示状态和参与店数', async () => {
    const w = mount(AdminActivitiesView);
    await flushPromises();
    expect(w.text()).toContain('国庆签到');
    expect(w.text()).toContain('进行中');
    expect(w.text()).toContain('12');
  });

  it('签到模板填入四行；提交时带上类型和定义', async () => {
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-new"]').trigger('click');
    await w.find('[data-testid="ac-title"]').setValue('签到');
    await w.find('[data-testid="ac-body"]').setValue('说明');
    await w.find('[data-testid="ac-signin-template"]').trigger('click');
    expect(w.findAll('[data-testid^="goal-row-"]')).toHaveLength(4);
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    const b = vi.mocked(adminApi.createActivity).mock.calls[0]![0];
    expect(b.kind).toBe('goals');
    expect(b.shardId).toBe(1);
    expect(b.def).toMatchObject({ goals: [{ key: 'signin', target: 1 }, {}, {}, { target: 7 }] });
  });

  it('九宫格：切到 4×4 有 16 格；服务端字段错误显示在对应格子下', async () => {
    vi.mocked(adminApi.createActivity).mockRejectedValue(
      new ApiError('VALIDATION_FAILED', { issues: [{ path: 'def.cells.4.target', message: 'too_small' }] }),
    );
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-new"]').trigger('click');
    await w.find('[data-testid="ac-kind"]').setValue('grid');
    await w.find('[data-testid="grid-size"]').setValue('4');
    expect(w.findAll('[data-testid^="grid-cell-"]')).toHaveLength(16);
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="grid-cell-4"]').trigger('click');
    expect(w.find('[data-testid="err-def.cells.4.target"]').text()).toBe('填写的内容不正确');
  });

  it('已开始的活动编辑时类型、时间、定义只读，只能改标题说明和结束时间', async () => {
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-edit-7"]').trigger('click');
    expect(w.text()).toContain('活动已开始，只能改标题、说明和延长结束时间');
    expect(w.find('[data-testid="ac-kind"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="ac-starts"]').attributes('disabled')).toBeDefined();
    expect(w.find('fieldset[data-testid="ac-def"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="ac-title"]').attributes('disabled')).toBeUndefined();
  });
});

describe('AdminActivitiesView 终审修复', () => {
  const goalsRow = (id: number, coins: number[]): AdminActivityDto => ({
    ...row,
    id,
    state: 'pending',
    def: { goals: coins.map((c, i) => ({ key: 'signin', target: i + 1, award: { coin: c } })) },
  });
  const gridRow: AdminActivityDto = {
    ...row,
    id: 9,
    state: 'pending',
    kind: 'grid',
    def: {
      size: 3,
      cells: Array.from({ length: 9 }, (_, i) => ({ key: 'signin', target: 1, award: { coin: i + 1 } })),
      lineAward: { coin: 100 },
      fullAward: { coin: 1000 },
    },
  };
  const coinOf = (w: ReturnType<typeof mount>, prefix: string) =>
    (w.find(`[data-testid="${prefix}-coin"]`).element as HTMLInputElement).value;

  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    useAdminStore().me = { accountId: 1, username: 'boss', role: 'admin' };
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
    } as never);
  });

  it('I1 九宫格：点另一格时奖励编辑器显示那一格的奖励', async () => {
    vi.mocked(adminApi.activities).mockResolvedValue([gridRow]);
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-edit-9"]').trigger('click');
    expect(coinOf(w, 'cell0')).toBe('1');
    await w.find('[data-testid="grid-cell-4"]').trigger('click');
    expect(coinOf(w, 'cell4')).toBe('5');
  });

  it('I1 目标清单：删掉中间一行后，下面的行显示自己的奖励', async () => {
    vi.mocked(adminApi.activities).mockResolvedValue([goalsRow(5, [1, 3, 5])]);
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-edit-5"]').trigger('click');
    await w.find('[data-testid="goal-del-1"]').trigger('click');
    expect(w.findAll('[data-testid^="goal-row-"]')).toHaveLength(2);
    expect(coinOf(w, 'goal1')).toBe('5');
  });

  it('I1 表单开着时编辑另一个活动，编辑器换成新活动的奖励', async () => {
    vi.mocked(adminApi.activities).mockResolvedValue([goalsRow(5, [1]), goalsRow(6, [9])]);
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-edit-5"]').trigger('click');
    expect(coinOf(w, 'goal0')).toBe('1');
    await w.find('[data-testid="ac-edit-6"]').trigger('click');
    expect(coinOf(w, 'goal0')).toBe('9');
  });

  it('I2 已开始的活动只改标题：开始和结束时间按服务端原值发回（不截断到分钟）', async () => {
    const running = { ...row, startsAt: '2026-10-01T00:00:30.500Z', endsAt: '2099-10-08T00:00:30.500Z' };
    vi.mocked(adminApi.activities).mockResolvedValue([running]);
    vi.mocked(adminApi.updateActivity).mockResolvedValue(running);
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-edit-7"]').trigger('click');
    await w.find('[data-testid="ac-title"]').setValue('新标题');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    const b = vi.mocked(adminApi.updateActivity).mock.calls[0]![1];
    expect(b.title).toBe('新标题');
    expect(b.startsAt).toBe('2026-10-01T00:00:30.500Z');
    expect(b.endsAt).toBe('2099-10-08T00:00:30.500Z');
  });
});

describe('AdminActivitiesView 全服加成', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    useAdminStore().me = { accountId: 1, username: 'boss', role: 'admin' };
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    vi.mocked(adminApi.activities).mockResolvedValue([]);
    vi.mocked(adminApi.createActivity).mockResolvedValue(row);
  });
  it('选全服加成：每行项目 + 倍数，提示范围；提交 items', async () => {
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-new"]').trigger('click');
    await w.find('[data-testid="ac-kind"]').setValue('boost');
    expect(w.find('[data-testid="boost-range-0"]').text()).toBe('1~5');
    await w.find('[data-testid="boost-add"]').trigger('click');
    await w.find('[data-testid="boost-key-1"]').setValue('marketPrice');
    expect(w.find('[data-testid="boost-range-1"]').text()).toBe('0.5~1');
    await w.find('[data-testid="boost-factor-1"]').setValue('0.8');
    await w.find('[data-testid="ac-title"]').setValue('国庆');
    await w.find('[data-testid="ac-body"]').setValue('说明');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    const b = vi.mocked(adminApi.createActivity).mock.calls[0]![0];
    expect(b.kind).toBe('boost');
    expect(b.def).toEqual({
      items: [
        { key: 'exp', factor: 2 },
        { key: 'marketPrice', factor: 0.8 },
      ],
    });
  });
});

describe('终审 I1：后台全服加成不显示最低等级', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    useAdminStore().me = { accountId: 1, username: 'boss', role: 'admin' };
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    vi.mocked(adminApi.activities).mockResolvedValue([]);
    vi.mocked(adminApi.createActivity).mockResolvedValue(row);
  });
  it('选全服加成时隐藏最低等级输入框，提交时最低等级为 1', async () => {
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-new"]').trigger('click');
    await w.find('[data-testid="ac-min-level"]').setValue(20);
    await w.find('[data-testid="ac-kind"]').setValue('boost');
    expect(w.find('[data-testid="ac-min-level"]').exists()).toBe(false);
    await w.find('[data-testid="ac-title"]').setValue('双倍');
    await w.find('[data-testid="ac-body"]').setValue('说明');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    expect(vi.mocked(adminApi.createActivity).mock.calls[0]![0].minLevel).toBe(1);
  });
});

describe('AdminActivitiesView 兑换活动', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    useAdminStore().me = { accountId: 1, username: 'boss', role: 'admin' };
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    vi.mocked(adminApi.activities).mockResolvedValue([]);
    vi.mocked(adminApi.createActivity).mockResolvedValue(row);
  });
  it('货币、掉落（百分比换算）、兑换表、兑换期都进提交内容', async () => {
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-new"]').trigger('click');
    await w.find('[data-testid="ac-kind"]').setValue('exchange');
    await w.find('[data-testid="cur-name-0"]').setValue('福');
    await w.find('[data-testid="cur-add"]').trigger('click');
    await w.find('[data-testid="cur-name-1"]').setValue('禄');
    await w.find('[data-testid="drop-chance-0"]').setValue('5');
    await w.find('[data-testid="shop-cost-add-0"]').trigger('click');
    await w.find('[data-testid="shop-cost-cur-0-1"]').setValue('1');
    await w.find('[data-testid="ex-grace"]').setValue('48');
    await w.find('[data-testid="ac-title"]').setValue('集福');
    await w.find('[data-testid="ac-body"]').setValue('说明');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    const b = vi.mocked(adminApi.createActivity).mock.calls[0]![0];
    expect(b.kind).toBe('exchange');
    expect(b.def).toMatchObject({
      currencies: [{ name: '福' }, { name: '禄' }],
      drops: [{ key: 'signin', chance: 0.05, currency: 0, num: 1, dailyCap: 10 }],
      shop: [
        {
          cost: [
            { currency: 0, num: 1 },
            { currency: 1, num: 1 },
          ],
          limit: 1,
        },
      ],
      graceHours: 48,
    });
  });
});

describe('终审：兑换活动编辑器的字段错误和货币删除', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    useAdminStore().me = { accountId: 1, username: 'boss', role: 'admin' };
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    vi.mocked(adminApi.activities).mockResolvedValue([]);
  });
  it('货币名、掉落规则、兑换期的服务端错误显示在对应位置', async () => {
    vi.mocked(adminApi.createActivity).mockRejectedValue(
      new ApiError('VALIDATION_FAILED', {
        issues: [
          { path: 'def.currencies.0.name', message: 'too_small' },
          { path: 'def.drops.0.dailyCap', message: 'too_big' },
          { path: 'def.graceHours', message: 'too_big' },
        ],
      }),
    );
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-new"]').trigger('click');
    await w.find('[data-testid="ac-kind"]').setValue('exchange');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="err-def.currencies.0.name"]').text()).toBe('填写的内容不正确');
    expect(w.find('[data-testid="err-def.drops.0.dailyCap"]').text()).toBe('填写的内容不正确');
    expect(w.find('[data-testid="err-def.graceHours"]').text()).toBe('填写的内容不正确');
  });
  it('被掉落或兑换引用的货币不能删；没被引用的能删', async () => {
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-new"]').trigger('click');
    await w.find('[data-testid="ac-kind"]').setValue('exchange');
    await w.find('[data-testid="cur-add"]').trigger('click');
    expect(w.find('[data-testid="cur-del-0"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="cur-del-1"]').attributes('disabled')).toBeUndefined();
    await w.find('[data-testid="cur-del-1"]').trigger('click');
    expect(w.find('[data-testid="cur-name-1"]').exists()).toBe(false);
  });
});

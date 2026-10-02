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

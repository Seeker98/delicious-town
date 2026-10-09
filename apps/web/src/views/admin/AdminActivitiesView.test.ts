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

  it('任何一份奖励超过上限：保存按钮灰掉，点了也不提交（backlog）', async () => {
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-new"]').trigger('click');
    await w.find('[data-testid="ac-title"]').setValue('签到');
    await w.find('[data-testid="ac-signin-template"]').trigger('click');
    await w.find('[data-testid$="-coin"]').setValue('999999999999');
    await flushPromises();
    expect(w.find('[data-testid="ac-save"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    expect(adminApi.createActivity).not.toHaveBeenCalled();
    await w.find('[data-testid$="-coin"]').setValue('100');
    await flushPromises();
    expect(w.find('[data-testid="ac-save"]').attributes('disabled')).toBeUndefined();
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

  it('道具不存在（保存时校验）：错误显示在那份奖励或解锁价格下面（问题记录 270）', async () => {
    const unknown = (path: string) => ({ path, message: 'unknown' });
    vi.mocked(adminApi.createActivity).mockRejectedValue(
      new ApiError('VALIDATION_FAILED', { issues: [unknown('def.goals.0.award.goods.0.id')] }),
    );
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-new"]').trigger('click');
    await w.find('[data-testid="ac-kind"]').setValue('goals');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="err-def.goals.0.award"]').text()).toBe('道具或食材不存在');

    vi.mocked(adminApi.createActivity).mockRejectedValue(
      new ApiError('VALIDATION_FAILED', {
        issues: [unknown('def.levels.0.premium.foods.0.id'), unknown('def.unlock.goods.0.id')],
      }),
    );
    await w.find('[data-testid="ac-kind"]').setValue('pass');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="err-def.levels.0.premium"]').text()).toBe('道具或食材不存在');
    expect(w.find('[data-testid="err-def.unlock"]').text()).toBe('道具或食材不存在');
  });

  it('各类活动的奖励都有推荐奖励（问题记录 505）；战令的解锁价格没有', async () => {
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-new"]').trigger('click');
    for (const kind of ['goals', 'grid', 'pass', 'exchange', 'coop']) {
      await w.find('[data-testid="ac-kind"]').setValue(kind);
      expect(w.findAll('[data-testid$="-presets"]').length, kind).toBeGreaterThan(0);
    }
    // 切回战令再看解锁价格（终审：停在合力时战令编辑器没挂载，断言是空的）
    await w.find('[data-testid="ac-kind"]').setValue('pass');
    expect(
      w.find('[data-testid="unlock-goods-id-0"]').exists() ||
        w.find('[data-testid="unlock-add-goods"]').exists(),
    ).toBe(true);
    expect(w.find('[data-testid="unlock-presets"]').exists()).toBe(false);
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
    // 推荐奖励的按钮也在禁用的 fieldset 里：点不了（505 遗留：缺的测试）
    const presetBtns = w.findAll('button[data-testid*="-preset-"]');
    expect(presetBtns.length).toBeGreaterThan(0);
    expect(presetBtns.every((b) => b.element.matches(':disabled'))).toBe(true);
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
  it('删掉中间一项兑换后，下面的项保留自己的内容一起提交（backlog 148-2）', async () => {
    vi.mocked(adminApi.createActivity).mockResolvedValue({} as never);
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-new"]').trigger('click');
    await w.find('[data-testid="ac-kind"]').setValue('exchange');
    await w.find('[data-testid="ac-title"]').setValue('兑换');
    await w.find('[data-testid="ac-body"]').setValue('说明');
    await w.find('[data-testid="shop-add"]').trigger('click');
    await w.find('[data-testid="shop-limit-1"]').setValue('7');
    await w.find('[data-testid="shop-del-0"]').trigger('click');
    expect((w.find('[data-testid="shop-limit-0"]').element as HTMLInputElement).value).toBe('7');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    const b = vi.mocked(adminApi.createActivity).mock.calls[0]![0];
    expect((b.def as { shop: Array<{ limit: number }> }).shop.map((x) => x.limit)).toEqual([7]);
  });
});

describe('AdminActivitiesView 全服合力（148-3）', () => {
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
  const open = async (kind: string) => {
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-new"]').trigger('click');
    await w.find('[data-testid="ac-kind"]').setValue(kind);
    await w.find('[data-testid="ac-title"]').setValue('合力');
    await w.find('[data-testid="ac-body"]').setValue('说明');
    return w;
  };

  it('规则、里程碑、名次段都进提交内容；可以增删', async () => {
    const w = await open('coop');
    await w.find('[data-testid="ms-add"]').trigger('click');
    await w.find('[data-testid="ms-target-1"]').setValue('5000');
    await w.find('[data-testid="ms-min-1"]').setValue('100');
    await w.find('[data-testid="rank-add"]').trigger('click');
    await w.find('[data-testid="rank-to-1"]').setValue('10');
    await w.find('[data-testid="rank-add"]').trigger('click');
    await w.find('[data-testid="rank-del-2"]').trigger('click');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    const b = vi.mocked(adminApi.createActivity).mock.calls[0]![0];
    expect(b.kind).toBe('coop');
    expect(b.def).toMatchObject({
      rules: [{ key: 'signin', points: 10, dailyCap: 10 }],
      milestones: [
        { target: 1000, minContribution: 0 },
        { target: 5000, minContribution: 100 },
      ],
      ranks: [
        { from: 1, to: 1 },
        { from: 2, to: 10 },
      ],
    });
  });

  it('服务端字段错误显示在对应行', async () => {
    vi.mocked(adminApi.createActivity).mockRejectedValue(
      new ApiError('VALIDATION_FAILED', {
        issues: [
          { path: 'def.milestones.1.target', message: 'not_increasing' },
          { path: 'def.ranks.0.to', message: 'bad_range' },
        ],
      }),
    );
    const w = await open('coop');
    await w.find('[data-testid="ms-add"]').trigger('click');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="err-def.milestones.1.target"]').text()).toBe('积分要比上一档高');
    expect(w.find('[data-testid="err-def.ranks.0.to"]').text()).toBe('起始名次不能大于结束名次');
  });

  it('战令的规则表改用共用组件后照常提交', async () => {
    const w = await open('pass');
    await w.find('[data-testid="rule-points-0"]').setValue('7');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    const b = vi.mocked(adminApi.createActivity).mock.calls[0]![0];
    expect(b.def).toMatchObject({ rules: [{ key: 'signin', points: 7, dailyCap: 10 }] });
  });
});

describe('问题记录 232：保存失败时定位到第一处错误', () => {
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
  it('说明没填：滚到说明的错误、说明框标红并获得焦点', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    vi.mocked(adminApi.createActivity).mockRejectedValue(
      new ApiError('VALIDATION_FAILED', { issues: [{ path: 'body', message: 'too_small' }] }),
    );
    const w = mount(AdminActivitiesView, { attachTo: document.body });
    await flushPromises();
    await w.find('[data-testid="ac-new"]').trigger('click');
    await w.find('[data-testid="ac-title"]').setValue('合力');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    const body = w.find('[data-testid="ac-body"]');
    expect(body.classes()).toContain('is-invalid');
    expect(w.find('[data-testid="ac-title"]').classes()).not.toContain('is-invalid');
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(w.find('[data-testid="err-body"]').element);
    expect(document.activeElement).toBe(body.element);
    w.unmount();
  });
});

describe('问题记录 232：错误在编辑器的行里', () => {
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
  it('滚到那一行的错误，不会停在前面带红字的删除按钮上', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    vi.mocked(adminApi.createActivity).mockRejectedValue(
      new ApiError('VALIDATION_FAILED', { issues: [{ path: 'def.goals.2.target', message: 'too_small' }] }),
    );
    const w = mount(AdminActivitiesView, { attachTo: document.body });
    await flushPromises();
    await w.find('[data-testid="ac-new"]').trigger('click');
    await w.find('[data-testid="ac-signin-template"]').trigger('click');
    await w.find('[data-testid="ac-title"]').setValue('签到');
    await w.find('[data-testid="ac-body"]').setValue('说明');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    expect(scroll.mock.contexts[0]).toBe(w.find('[data-testid="err-def.goals.2.target"]').element);
    w.unmount();
  });
});

describe('backlog 后台 1a：活动编辑器', () => {
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
  const openNew = async (kind: string) => {
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-new"]').trigger('click');
    await w.find('[data-testid="ac-kind"]').setValue(kind);
    await w.find('[data-testid="ac-title"]').setValue('标题');
    await w.find('[data-testid="ac-body"]').setValue('说明');
    return w;
  };
  const fail = (path: string, message: string) =>
    vi
      .mocked(adminApi.createActivity)
      .mockRejectedValue(new ApiError('VALIDATION_FAILED', { issues: [{ path, message }] }));

  it('积分规则某一行的分数出错时，错误显示在那一行', async () => {
    fail('def.rules.0.dailyCap', 'too_small');
    const w = await openNew('pass');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="err-def.rules.0.dailyCap"]').text()).toBe('填写的内容不正确');
  });

  it('全服加成某一行的项目出错时，错误显示在那一行', async () => {
    fail('def.items.0.key', 'unknown_boost');
    const w = await openNew('boost');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="err-def.items.0.key"]').text()).toBe('请选择加成项目');
  });

  it('九宫格出错时自动选中第一个出错的格子', async () => {
    fail('def.cells.5.target', 'too_small');
    const w = await openNew('grid');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('第 6 格');
    expect(w.find('[data-testid="err-def.cells.5.target"]').exists()).toBe(true);
  });

  it('表单顶部的字段（如开始时间）出错时也显示出来', async () => {
    fail('startsAt', 'too_small');
    const w = await openNew('goals');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="err-startsAt"]').text()).toContain('填写的内容不正确');
  });

  it('没选区服又选了"当前区服"：不提交，提示先选区服', async () => {
    useAdminStore().shardId = null;
    const w = await openNew('goals');
    await w.find('[data-testid="ac-save"]').trigger('click');
    await flushPromises();
    expect(adminApi.createActivity).not.toHaveBeenCalled();
    expect(w.find('[data-testid="err-shardId"]').text()).toContain('先在顶部选择区服');
  });

  it('兑换活动在兑换期内，列表状态显示"兑换中"', async () => {
    const ended = new Date(Date.now() - 3_600_000).toISOString();
    vi.mocked(adminApi.activities).mockResolvedValue([
      {
        ...row,
        kind: 'exchange',
        endsAt: ended,
        state: 'settled',
        def: { currencies: [{ name: '月饼' }], drops: [], shop: [], graceHours: 24 },
      } as never,
      { ...row, id: 8, title: '旧活动', endsAt: ended, state: 'settled' },
    ]);
    const w = mount(AdminActivitiesView);
    await flushPromises();
    const rows = w.findAll('tbody tr');
    expect(rows[0]!.text()).toContain('兑换中');
    expect(rows[1]!.text()).toContain('已补发');
  });

  it('已结束的活动：提示只能改标题和说明，结束时间不能改', async () => {
    vi.mocked(adminApi.activities).mockResolvedValue([
      { ...row, endsAt: '2026-10-02T00:00:00.000Z', state: 'settled' },
    ]);
    const w = mount(AdminActivitiesView);
    await flushPromises();
    await w.find('[data-testid="ac-edit-7"]').trigger('click');
    expect(w.text()).toContain('活动已结束，只能改标题和说明');
    expect(w.find('[data-testid="ac-ends"]').attributes('disabled')).toBeDefined();
  });
});

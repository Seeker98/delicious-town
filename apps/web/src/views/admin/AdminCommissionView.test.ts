import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminCommissionNoticeDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminCommissionView from './AdminCommissionView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: {
    commissionNotices: vi.fn(),
    createCommissionNotice: vi.fn(),
    removeCommissionNotice: vi.fn(),
  },
}));

const row = (patch: Partial<AdminCommissionNoticeDto> = {}): AdminCommissionNoticeDto => ({
  id: 3,
  shardId: 1,
  member: 'squid',
  body: '从今天起每天巡查',
  createdAt: '2026-10-16T06:00:00.000Z',
  deletedAt: null,
  actor: 'boss',
  ...patch,
});

describe('后台：委员会公报（2026-10-16）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    useAdminStore().me = { accountId: 1, username: 'boss', role: 'admin' };
    vi.mocked(adminApi.commissionNotices).mockResolvedValue([
      row(),
      row({ id: 2, deletedAt: '2026-10-16T07:00:00.000Z' }),
    ]);
    vi.mocked(adminApi.createCommissionNotice).mockResolvedValue({ id: 4 });
    vi.mocked(adminApi.removeCommissionNotice).mockResolvedValue(null);
  });

  it('选署名、写内容，预览小镇新闻里的样子；确认后发到当前区服', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(AdminCommissionView);
    await flushPromises();
    await w.get('[data-testid="cm-member-gary"]').trigger('click');
    await w.get('[data-testid="cm-body"]').setValue(' 理财到期改发补给包 ');
    expect(w.get('[data-testid="cm-preview"]').text()).toBe(
      '【公报】盖乐瑞 (经济与金融委员): 理财到期改发补给包',
    );
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(adminApi.createCommissionNotice).toHaveBeenCalledWith({
      shardId: 1,
      member: 'gary',
      body: '理财到期改发补给包',
    });
    expect(adminApi.commissionNotices).toHaveBeenCalledTimes(2);
  });

  it('选全部区服时 shardId 为空；取消确认不发', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = mount(AdminCommissionView);
    await flushPromises();
    await w.get('[data-testid="cm-scope"]').setValue('all');
    await w.get('[data-testid="cm-body"]').setValue('委员会成立');
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(adminApi.createCommissionNotice).not.toHaveBeenCalled();
    ask.mockReturnValue(true);
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(adminApi.createCommissionNotice).toHaveBeenCalledWith({
      shardId: null,
      member: 'mayor',
      body: '委员会成立',
    });
  });

  it('已发的能撤回，撤回过的只显示状态；协管看不到发布表单和撤回', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(AdminCommissionView);
    await flushPromises();
    expect(w.text()).toContain('已撤回');
    expect(w.find('[data-testid="cm-remove-2"]').exists()).toBe(false);
    await w.get('[data-testid="cm-remove-3"]').trigger('click');
    await flushPromises();
    expect(adminApi.removeCommissionNotice).toHaveBeenCalledWith(3);

    useAdminStore().me = { accountId: 2, username: 'mod', role: 'mod' };
    const m = mount(AdminCommissionView);
    await flushPromises();
    expect(m.find('[data-testid="cm-body"]').exists()).toBe(false);
    expect(m.find('[data-testid="cm-remove-3"]').exists()).toBe(false);
  });
});

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAnnouncementDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminAnnounceView from './AdminAnnounceView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: {
    announcements: vi.fn(),
    createAnnouncement: vi.fn(),
    updateAnnouncement: vi.fn(),
    deleteAnnouncement: vi.fn(),
  },
}));

const row: AdminAnnouncementDto = {
  id: 4,
  shardId: null,
  title: '停服维护',
  body: '今晚',
  important: true,
  startsAt: '2026-10-01T00:00:00.000Z',
  endsAt: '2026-10-02T00:00:00.000Z',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  actor: 'boss',
};

describe('AdminAnnounceView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    useAdminStore().me = { accountId: 1, username: 'boss', role: 'admin' };
    vi.mocked(adminApi.announcements).mockResolvedValue([row]);
    vi.mocked(adminApi.createAnnouncement).mockResolvedValue(row);
  });

  it('新建：全部区服、重要，时间转成 ISO 提交', async () => {
    const w = mount(AdminAnnounceView);
    await flushPromises();
    expect(w.text()).toContain('停服维护');
    await w.find('[data-testid="an-scope"]').setValue('all');
    await w.find('[data-testid="an-title"]').setValue('开服活动');
    await w.find('[data-testid="an-body"]').setValue('欢迎');
    await w.find('[data-testid="an-important"]').setValue(true);
    await w.find('[data-testid="an-starts"]').setValue('2026-10-01T08:00');
    await w.find('[data-testid="an-ends"]').setValue('2026-10-08T08:00');
    await w.find('[data-testid="an-save"]').trigger('click');
    await flushPromises();
    expect(adminApi.createAnnouncement).toHaveBeenCalledWith({
      shardId: null,
      title: '开服活动',
      body: '欢迎',
      important: true,
      startsAt: new Date('2026-10-01T08:00').toISOString(),
      endsAt: new Date('2026-10-08T08:00').toISOString(),
    });
  });

  it('删除要确认，取消就不删；协管看不到编辑表单', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = mount(AdminAnnounceView);
    await flushPromises();
    await w.find('[data-testid="an-delete-4"]').trigger('click');
    expect(adminApi.deleteAnnouncement).not.toHaveBeenCalled();
    useAdminStore().me = { accountId: 2, username: 'm', role: 'mod' };
    const m = mount(AdminAnnounceView);
    await flushPromises();
    expect(m.find('[data-testid="an-save"]').exists()).toBe(false);
  });
});

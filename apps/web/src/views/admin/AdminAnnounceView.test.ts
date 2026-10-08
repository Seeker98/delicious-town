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
      // 输入框按北京时间：08:00 = 00:00Z（终审：后台的机器在别的时区时不能跟着设备走）
      startsAt: '2026-10-01T00:00:00.000Z',
      endsAt: '2026-10-08T00:00:00.000Z',
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

  it('编辑别的区服的公告时保持原区服，不会被改成当前区服（终审 I2）', async () => {
    vi.mocked(adminApi.announcements).mockResolvedValue([{ ...row, shardId: 2 }]);
    vi.mocked(adminApi.updateAnnouncement).mockResolvedValue(row);
    const w = mount(AdminAnnounceView);
    await flushPromises();
    await w.find('[data-testid="an-edit-4"]').trigger('click');
    await w.find('[data-testid="an-save"]').trigger('click');
    await flushPromises();
    expect(adminApi.updateAnnouncement).toHaveBeenCalledWith(4, expect.objectContaining({ shardId: 2 }));
  });

  it('没选区服时不能选"当前区服"，免得变成全部区服的公告（终审 I2）', async () => {
    useAdminStore().shardId = null;
    const w = mount(AdminAnnounceView);
    await flushPromises();
    const opt = w.find('[data-testid="an-scope"] option[value="shard"]');
    expect(opt.attributes('disabled')).toBeDefined();
  });
});

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminMailView from './AdminMailView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: {
    mails: vi.fn(),
    sendMail: vi.fn(),
    revokeMail: vi.fn(),
    restaurant: vi.fn(),
    searchPlayers: vi.fn(),
  },
}));

describe('AdminMailView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    useAdminStore().me = { accountId: 1, username: 'boss', role: 'admin' };
    vi.mocked(adminApi.mails).mockResolvedValue([]);
    vi.mocked(adminApi.sendMail).mockResolvedValue({ id: 5 } as never);
  });

  it('发区服邮件前确认，写明收件范围；发送内容带附件', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(AdminMailView);
    await flushPromises();
    await w.find('[data-testid="mail-scope"]').setValue('shard');
    await w.find('[data-testid="mail-title"]').setValue('开服礼');
    await w.find('[data-testid="mail-body"]').setValue('欢迎');
    await w.find('[data-testid="ri-coin"]').setValue('100');
    await w.find('[data-testid="mail-send"]').trigger('click');
    await flushPromises();
    expect(ask.mock.calls[0]![0]).toContain('当前区服所有已开的店');
    expect(adminApi.sendMail).toHaveBeenCalledWith({
      scope: 'shard',
      shardId: 1,
      title: '开服礼',
      body: '欢迎',
      items: { coin: 100 },
    });
  });

  it('撤回要确认；已撤回的不显示撤回按钮', async () => {
    vi.mocked(adminApi.mails).mockResolvedValue([
      {
        id: 7,
        scope: 'shard',
        shardId: 1,
        restId: null,
        minLevel: null,
        title: 't',
        body: 'b',
        items: null,
        source: 'admin',
        createdAt: '',
        expiresAt: '',
        revokedAt: null,
        claimedCount: 2,
        actor: 'op',
      },
      {
        id: 8,
        scope: 'shard',
        shardId: 1,
        restId: null,
        minLevel: null,
        title: 't',
        body: 'b',
        items: null,
        source: 'admin',
        createdAt: '',
        expiresAt: '',
        revokedAt: '2026-10-01T00:00:00Z',
        claimedCount: 0,
        actor: 'op',
      },
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = mount(AdminMailView);
    await flushPromises();
    await w.find('[data-testid="mail-revoke-7"]').trigger('click');
    expect(adminApi.revokeMail).not.toHaveBeenCalled();
    expect(w.find('[data-testid="mail-revoke-8"]').exists()).toBe(false);
    expect(w.text()).toContain('已领 2');
  });
});

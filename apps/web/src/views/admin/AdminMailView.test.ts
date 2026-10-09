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
    titles: vi.fn(),
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
    expect(ask.mock.calls[0]![0]).toContain('附件：银币 100');
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

  it('发给几家店（定制称号设计 三）：逗号或空格分隔，重复的只算一次；有一家查不到就不能发', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(adminApi.restaurant).mockImplementation(async (id: number) => {
      if (id === 99) throw new Error('404');
      return {
        overview: { name: `店${id}`, shardId: 1 },
        owner: { username: `u${id}` },
        shardName: '一服',
      } as never;
    });
    const w = mount(AdminMailView);
    await flushPromises();
    await w.find('[data-testid="mail-scope"]').setValue('rest');
    await w.find('[data-testid="mail-title"]').setValue('定制称号');
    await w.find('[data-testid="mail-body"]').setValue('送你');
    await w.find('[data-testid="ri-coin"]').setValue('1');
    await w.find('[data-testid="mail-rest"]').setValue('3, 5 3，99');
    await flushPromises();
    expect(w.find('[data-testid="mail-rest-who-3"]').text()).toContain('店3');
    expect(w.find('[data-testid="mail-rest-who-99"]').classes()).toContain('text-danger');
    expect(w.find('[data-testid="mail-send"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="mail-rest"]').setValue('3 5 3');
    await flushPromises();
    expect(w.find('[data-testid="mail-send"]').attributes('disabled')).toBeUndefined();
    await w.find('[data-testid="mail-send"]').trigger('click');
    await flushPromises();
    expect(ask.mock.calls[0]![0]).toContain('发给 2 家店（每家一封）');
    expect(adminApi.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'rest', shardId: 1, restIds: [3, 5] }),
    );
    expect(vi.mocked(adminApi.sendMail).mock.calls[0]![0]).not.toHaveProperty('restId');
  });

  it('改了店 id、新店名还没查回来时不能发，确认框里不会是旧店名（backlog 1010）', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.mocked(adminApi.restaurant).mockImplementation(async (id: number) => {
      if (id === 4) await gate;
      return { overview: { name: `店${id}`, shardId: 1 }, owner: { username: `u${id}` }, shardName: '一服' } as never;
    });
    const w = mount(AdminMailView);
    await flushPromises();
    await w.find('[data-testid="mail-scope"]').setValue('rest');
    await w.find('[data-testid="mail-title"]').setValue('t');
    await w.find('[data-testid="mail-body"]').setValue('b');
    await w.find('[data-testid="mail-rest"]').setValue('3');
    await flushPromises();
    expect(w.find('[data-testid="mail-send"]').attributes('disabled')).toBeUndefined();
    await w.find('[data-testid="mail-rest"]').setValue('4');
    await flushPromises();
    expect(w.find('[data-testid="mail-send"]').attributes('disabled')).toBeDefined();
    release();
    await flushPromises();
    expect(w.find('[data-testid="mail-send"]').attributes('disabled')).toBeUndefined();
    expect(w.find('[data-testid="mail-rest-who-4"]').text()).toContain('店4');
  });

  it('邮件附件可以加称号', async () => {
    const w = mount(AdminMailView);
    await flushPromises();
    expect(w.find('[data-testid="ri-add-icon"]').exists()).toBe(true);
  });
});

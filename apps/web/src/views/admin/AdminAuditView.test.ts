import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../api/admin';
import AdminAuditView from './AdminAuditView.vue';

vi.mock('../../api/admin', () => ({ adminApi: { audit: vi.fn() } }));

describe('AdminAuditView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('动作显示中文，命令行操作人显示"命令行"，可以加载更多', async () => {
    vi.mocked(adminApi.audit)
      .mockResolvedValueOnce({
        items: [
          {
            id: 2,
            actor: 'boss',
            action: 'shard.override',
            target: 'shard:1',
            detail: { note: '加速' },
            ip: '1.1.1.1',
            at: '2026-09-30T00:00:00.000Z',
          },
        ],
        nextBefore: 'c1',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 1,
            actor: null,
            action: 'player.role',
            target: 'account:1',
            detail: {},
            ip: null,
            at: '2026-09-29T00:00:00.000Z',
          },
        ],
        nextBefore: null,
      });
    const w = mount(AdminAuditView);
    await flushPromises();
    expect(w.text()).toContain('修改区服数值');
    await w.find('[data-testid="audit-more"]').trigger('click');
    await flushPromises();
    // 默认看最近 7 天（界面改版 P12）
    expect(adminApi.audit).toHaveBeenLastCalledWith({
      actor: undefined,
      action: undefined,
      days: 7,
      before: 'c1',
    });
    expect(w.text()).toContain('命令行');
    expect(w.find('[data-testid="audit-more"]').exists()).toBe(false);
  });
});

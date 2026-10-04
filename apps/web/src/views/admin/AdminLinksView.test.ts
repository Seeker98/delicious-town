import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminLinkDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminLinksView from './AdminLinksView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: { links: vi.fn(), createLink: vi.fn(), updateLink: vi.fn(), deleteLink: vi.fn() },
}));

const row: AdminLinkDto = {
  id: 3,
  name: '贴吧',
  url: 'https://example.com',
  note: '',
  sort: 0,
  updatedAt: '2026-10-04T00:00:00Z',
};

describe('AdminLinksView（问题记录 348）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().me = { accountId: 1, username: 'boss', role: 'admin' };
    vi.mocked(adminApi.links).mockResolvedValue([row]);
    vi.mocked(adminApi.createLink).mockResolvedValue(row);
    vi.mocked(adminApi.updateLink).mockResolvedValue(row);
    vi.mocked(adminApi.deleteLink).mockResolvedValue(null);
  });

  it('新建、编辑、删除（删除要确认）', async () => {
    const w = mount(AdminLinksView);
    await flushPromises();
    expect(w.text()).toContain('贴吧');
    await w.get('[data-testid="ln-name"]').setValue(' Wiki ');
    await w.get('[data-testid="ln-url"]').setValue('https://example.org');
    await w.get('[data-testid="ln-sort"]').setValue('2');
    await w.get('[data-testid="ln-save"]').trigger('click');
    await flushPromises();
    expect(adminApi.createLink).toHaveBeenCalledWith({
      name: 'Wiki',
      url: 'https://example.org',
      note: '',
      sort: 2,
    });
    await w.get('[data-testid="ln-edit-3"]').trigger('click');
    await w.get('[data-testid="ln-name"]').setValue('贴吧2');
    await w.get('[data-testid="ln-save"]').trigger('click');
    await flushPromises();
    expect(adminApi.updateLink).toHaveBeenCalledWith(3, {
      name: '贴吧2',
      url: 'https://example.com',
      note: '',
      sort: 0,
    });
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await w.get('[data-testid="ln-delete-3"]').trigger('click');
    expect(adminApi.deleteLink).not.toHaveBeenCalled();
    await w.get('[data-testid="ln-delete-3"]').trigger('click');
    await flushPromises();
    expect(adminApi.deleteLink).toHaveBeenCalledWith(3);
  });

  it('协管只能看列表', async () => {
    useAdminStore().me = { accountId: 2, username: 'mod', role: 'mod' };
    const w = mount(AdminLinksView);
    await flushPromises();
    expect(w.find('[data-testid="ln-save"]').exists()).toBe(false);
    expect(w.find('[data-testid="ln-delete-3"]').exists()).toBe(false);
  });
});

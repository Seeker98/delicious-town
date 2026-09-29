import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GrantDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminGrantsView from './AdminGrantsView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: { grantPreview: vi.fn(), createGrant: vi.fn(), grants: vi.fn() },
}));

const done: GrantDto = {
  id: 1,
  shardId: 1,
  target: 'rest',
  restId: 3,
  minLevel: null,
  items: { coin: 500 },
  reason: '补偿',
  status: 'done',
  total: 1,
  doneCount: 1,
  failedCount: 0,
  actor: 'boss',
  createdAt: '2026-09-30T00:00:00.000Z',
  finishedAt: '2026-09-30T00:00:00.000Z',
};

function setup(role: 'mod' | 'admin') {
  const admin = useAdminStore();
  admin.me = { accountId: 1, username: 'boss', role };
  admin.shardId = 1;
  return mount(AdminGrantsView);
}

describe('AdminGrantsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(adminApi.grants).mockResolvedValue([done]);
    vi.mocked(adminApi.createGrant).mockResolvedValue(done);
  });

  it('单店：只提交填了的内容', async () => {
    const w = setup('admin');
    await flushPromises();
    await w.find('[data-testid="grant-rest"]').setValue('3');
    await w.find('[data-testid="grant-coin"]').setValue('500');
    await w.find('[data-testid="grant-add-goods"]').trigger('click');
    await w.find('[data-testid="grant-goods-id-0"]').setValue('1');
    await w.find('[data-testid="grant-goods-num-0"]').setValue('2');
    await w.find('[data-testid="grant-reason"]').setValue('补偿');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(adminApi.createGrant).toHaveBeenCalledWith({
      shardId: 1,
      target: 'rest',
      restId: 3,
      items: { coin: 500, goods: [{ id: 1, num: 2 }] },
      reason: '补偿',
    });
  });

  it('全区服：先预览人数并确认，取消就不发', async () => {
    vi.mocked(adminApi.grantPreview).mockResolvedValue({ count: 42 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = setup('admin');
    await flushPromises();
    await w.find('[data-testid="grant-target-shard"]').setValue(true);
    await w.find('[data-testid="grant-min-level"]').setValue('10');
    await w.find('[data-testid="grant-coin"]').setValue('100');
    await w.find('[data-testid="grant-reason"]').setValue('全服补偿');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(adminApi.grantPreview).toHaveBeenCalledWith(1, 10);
    expect(confirm.mock.calls[0]![0]).toContain('42');
    expect(adminApi.createGrant).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(adminApi.createGrant).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'shard', minLevel: 10 }),
    );
    confirm.mockRestore();
  });

  it('协管只能看记录', async () => {
    const w = setup('mod');
    await flushPromises();
    expect(w.find('form').exists()).toBe(false);
    expect(w.text()).toContain('补偿');
  });
});

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminCodeDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminCodesView from './AdminCodesView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: {
    codes: vi.fn(),
    createCode: vi.fn(),
    createCodeBatch: vi.fn(),
    disableCode: vi.fn(),
    exportCodeBatch: vi.fn(),
  },
}));

const batch: AdminCodeDto = {
  id: 7,
  kind: 'single',
  code: null,
  batchId: 7,
  count: 3,
  usedCount: 1,
  maxUses: 1,
  items: { hats: [{ tier: 'jade', name: '大橘' }] },
  shardId: null,
  minLevel: null,
  startsAt: null,
  endsAt: null,
  note: '赞助',
  disabled: false,
  actor: 'boss',
  createdAt: '2026-10-01T00:00:00.000Z',
};

describe('AdminCodesView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    useAdminStore().me = { accountId: 1, username: 'boss', role: 'admin' };
    vi.mocked(adminApi.codes).mockResolvedValue([batch]);
    vi.mocked(adminApi.createCode).mockResolvedValue({
      ...batch,
      kind: 'shared',
      code: 'KAIFU',
      batchId: null,
    });
    vi.mocked(adminApi.exportCodeBatch).mockResolvedValue({
      codes: ['AAAAAAAAAA', 'BBBBBBBBBB', 'CCCCCCCCCC'],
    });
  });

  it('建通用码：自定码、次数上限、当前区服；附件来自编辑器', async () => {
    const w = mount(AdminCodesView);
    await flushPromises();
    await w.find('[data-testid="code-kind"]').setValue('shared');
    await w.find('[data-testid="code-text"]').setValue('kaifu');
    await w.find('[data-testid="code-max"]').setValue('100');
    await w.find('[data-testid="code-scope"]').setValue('shard');
    await w.find('[data-testid="code-note"]').setValue('开服');
    await w.find('[data-testid="ri-coin"]').setValue('100');
    await w.find('[data-testid="code-create"]').trigger('click');
    await flushPromises();
    expect(adminApi.createCode).toHaveBeenCalledWith({
      code: 'KAIFU',
      maxUses: 100,
      shardId: 1,
      note: '开服',
      items: { coin: 100 },
    });
  });

  it('批次一行显示已用 1/3 和附件；导出显示整批的码；停用要确认', async () => {
    const w = mount(AdminCodesView);
    await flushPromises();
    expect(w.text()).toContain('1 / 3');
    expect(w.text()).toContain('玉•大橘之帽');
    await w.find('[data-testid="code-export-7"]').trigger('click');
    await flushPromises();
    expect((w.find('[data-testid="code-export-text"]').element as HTMLTextAreaElement).value).toBe(
      'AAAAAAAAAA\nBBBBBBBBBB\nCCCCCCCCCC',
    );
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await w.find('[data-testid="code-disable-7"]').trigger('click');
    expect(adminApi.disableCode).not.toHaveBeenCalled();
  });
});

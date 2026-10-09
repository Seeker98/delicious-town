import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminCodeDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { ApiError } from '../../api/client';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import AdminCodesView from './AdminCodesView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: {
    codes: vi.fn(),
    createCode: vi.fn(),
    createCodeBatch: vi.fn(),
    disableCode: vi.fn(),
    enableCode: vi.fn(),
    exportCodeBatch: vi.fn(),
    titles: vi.fn(),
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

describe('backlog 后台 1a：兑换码页', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().shardId = 1;
    useAdminStore().me = { accountId: 1, username: 'boss', role: 'admin' };
    vi.mocked(adminApi.codes).mockResolvedValue([batch]);
  });
  const fill = async (w: ReturnType<typeof mount>) => {
    await w.find('[data-testid="code-kind"]').setValue('shared');
    await w.find('[data-testid="code-text"]').setValue('kaifu');
    await w.find('[data-testid="ri-coin"]').setValue('100');
  };

  it('自定码已存在：提示"这个码已经存在"', async () => {
    vi.mocked(adminApi.createCode).mockRejectedValue(
      new ApiError('VALIDATION_FAILED', { issues: [{ path: 'code', message: 'taken' }] }),
    );
    const w = mount(AdminCodesView);
    await flushPromises();
    await fill(w);
    await w.find('[data-testid="code-create"]').trigger('click');
    await flushPromises();
    expect(useToastStore().items.at(-1)?.text).toBe('兑换码 KAIFU 已经存在，换一个');
  });

  it('没选区服时选"当前区服"：提示先选区服，建码按钮不可点', async () => {
    useAdminStore().shardId = null;
    const w = mount(AdminCodesView);
    await flushPromises();
    await fill(w);
    await w.find('[data-testid="code-scope"]').setValue('shard');
    expect(w.find('[data-testid="code-scope-hint"]').text()).toContain('请先在顶部选择区服');
    expect(w.find('[data-testid="code-create"]').attributes('disabled')).toBeDefined();
  });

  it('按码搜索：带上搜索词重新读列表', async () => {
    const w = mount(AdminCodesView);
    await flushPromises();
    await w.find('[data-testid="code-search"]').setValue('xinshou');
    await w.find('[data-testid="code-search-form"]').trigger('submit');
    await flushPromises();
    expect(adminApi.codes).toHaveBeenLastCalledWith(1, 'xinshou');
  });

  it('已停用的码可以重新启用（要确认）', async () => {
    vi.mocked(adminApi.codes).mockResolvedValue([{ ...batch, disabled: true }]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(AdminCodesView);
    await flushPromises();
    expect(w.find('[data-testid="code-disable-7"]').exists()).toBe(false);
    await w.find('[data-testid="code-enable-7"]').trigger('click');
    await flushPromises();
    expect(adminApi.enableCode).toHaveBeenCalledWith(7);
  });

  it('附件带称号（定制称号设计 三）：共享码提示会被转发；称号比码先过期时提示', async () => {
    vi.mocked(adminApi.titles).mockResolvedValue([
      {
        key: 'c2',
        id: 2,
        title: '面霸',
        desc: null,
        note: null,
        source: 'custom',
        retired: false,
        owners: 0,
        createdBy: null,
        createdAt: null,
      },
    ]);
    const w = mount(AdminCodesView);
    await flushPromises();
    await w.find('[data-testid="code-kind"]').setValue('shared');
    expect(w.find('[data-testid="code-icon-shared-hint"]').exists()).toBe(false);
    await w.find('[data-testid="ri-add-icon"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="ri-icon-0-select"]').setValue('c2');
    expect(w.find('[data-testid="code-icon-shared-hint"]').text()).toContain('一次性码');
    await w.find('[data-testid="code-ends"]').setValue('2026-11-30T00:00');
    await w.find('[data-testid="ri-icon-0-mode"]').setValue('until');
    await w.find('[data-testid="ri-icon-0-until"]').setValue('2026-11-01T00:00');
    expect(w.find('[data-testid="code-icon-until-hint"]').exists()).toBe(true);
    await w.find('[data-testid="ri-icon-0-until"]').setValue('2026-12-01T00:00');
    expect(w.find('[data-testid="code-icon-until-hint"]').exists()).toBe(false);
    await w.find('[data-testid="code-kind"]').setValue('single');
    expect(w.find('[data-testid="code-icon-shared-hint"]').exists()).toBe(false);
  });
});

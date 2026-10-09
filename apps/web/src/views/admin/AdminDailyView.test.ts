import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminDailyDetailDto, AdminDailyRowDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import AdminDailyView from './AdminDailyView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: {
    dailyList: vi.fn(),
    dailyGet: vi.fn(),
    dailyPublish: vi.fn(),
    dailyHide: vi.fn(),
    dailyEdit: vi.fn(),
    dailyRegenerate: vi.fn(),
  },
}));

const row: AdminDailyRowDto = {
  shardId: 3,
  day: '2026-10-08',
  status: 'draft',
  title: '小镇又热闹了',
  tokensIn: 3000,
  tokensOut: 950,
  attempts: 1,
  regenerations: 0,
  error: null,
  generatedAt: '2026-10-08T16:10:00.000Z',
  publishedAt: null,
};
const detail: AdminDailyDetailDto = {
  ...row,
  facts: { events: [{ text: '{r:7} 升到了 4 星' }] },
  content: {
    'zh-CN': { title: '小镇又热闹了', body: '{r:7} 升到了 4 星' },
    en: { title: 'Busy day', body: '{r:7} reached 4 stars' },
    'zh-TW': { title: '小鎮又熱鬧了', body: '{r:7} 升到了 4 星' },
  },
  rests: { 7: '小王的店' },
};

async function open() {
  useAdminStore().me = { accountId: 1, username: 'boss', role: 'admin' };
  useAdminStore().shardId = 3;
  vi.mocked(adminApi.dailyList).mockResolvedValue([
    row,
    { ...row, day: '2026-10-07', status: 'pending', title: null, error: 'writer http 402' },
  ]);
  vi.mocked(adminApi.dailyGet).mockResolvedValue(detail);
  const w = mount(AdminDailyView);
  await flushPromises();
  return w;
}

describe('后台小镇日报页', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('列表：日期、状态、标题、token、错误', async () => {
    const w = await open();
    expect(adminApi.dailyList).toHaveBeenCalledWith(3);
    const rows = w.findAll('[data-testid="adl-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain('待审');
    expect(rows[0]!.text()).toContain('小镇又热闹了');
    expect(rows[0]!.text()).toContain('3,000');
    expect(rows[1]!.text()).toContain('writer http 402');
  });

  it('点开一天：素材、预览（店名换好）、可改简中和英文；保存调用 edit', async () => {
    const w = await open();
    await w.findAll('[data-testid="adl-row"]')[0]!.trigger('click');
    await flushPromises();
    expect(adminApi.dailyGet).toHaveBeenCalledWith(3, '2026-10-08');
    expect(w.find('[data-testid="adl-facts"]').text()).toContain('升到了 4 星');
    expect(w.find('[data-testid="adl-preview"]').text()).toContain('小王的店 升到了 4 星');
    await w.find('[data-testid="adl-zh-title"]').setValue('改过的标题');
    vi.mocked(adminApi.dailyEdit).mockResolvedValue(detail);
    await w.find('[data-testid="adl-save"]').trigger('click');
    await flushPromises();
    expect(adminApi.dailyEdit).toHaveBeenCalledWith(3, '2026-10-08', {
      zh: { title: '改过的标题', body: '{r:7} 升到了 4 星' },
      en: { title: 'Busy day', body: '{r:7} reached 4 stars' },
    });
  });

  it('发布、撤下、重新生成；出错时提示', async () => {
    const w = await open();
    await w.findAll('[data-testid="adl-row"]')[0]!.trigger('click');
    await flushPromises();
    vi.mocked(adminApi.dailyPublish).mockResolvedValue({ ...detail, status: 'published' });
    await w.find('[data-testid="adl-publish"]').trigger('click');
    await flushPromises();
    expect(adminApi.dailyPublish).toHaveBeenCalledWith(3, '2026-10-08');
    vi.mocked(adminApi.dailyHide).mockResolvedValue({ ...detail, status: 'hidden' });
    await w.find('[data-testid="adl-hide"]').trigger('click');
    await flushPromises();
    expect(adminApi.dailyHide).toHaveBeenCalledWith(3, '2026-10-08');
    vi.mocked(adminApi.dailyRegenerate).mockRejectedValue(new Error('boom'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const push = vi.spyOn(useToastStore(), 'push');
    await w.find('[data-testid="adl-regenerate"]').trigger('click');
    await flushPromises();
    expect(adminApi.dailyRegenerate).toHaveBeenCalledWith(3, '2026-10-08');
    expect(push).toHaveBeenLastCalledWith(expect.any(String), 'danger');
  });
  it('改了没保存：发布、撤下、重新生成都灰掉并提示，保存后恢复（终审 I3）', async () => {
    const w = await open();
    await w.findAll('[data-testid="adl-row"]')[0]!.trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="adl-publish"]').attributes('disabled')).toBeUndefined();
    await w.find('[data-testid="adl-en-body"]').setValue('fixed {r:7} reached 4 stars');
    for (const b of ['adl-publish', 'adl-hide', 'adl-regenerate'])
      expect(w.find(`[data-testid="${b}"]`).attributes('disabled'), b).toBeDefined();
    expect(w.find('[data-testid="adl-dirty"]').exists()).toBe(true);
    vi.mocked(adminApi.dailyEdit).mockResolvedValue({
      ...detail,
      content: { ...detail.content!, en: { title: 'Busy day', body: 'fixed {r:7} reached 4 stars' } },
    });
    await w.find('[data-testid="adl-save"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="adl-publish"]').attributes('disabled')).toBeUndefined();
    expect(w.find('[data-testid="adl-dirty"]').exists()).toBe(false);
  });
});

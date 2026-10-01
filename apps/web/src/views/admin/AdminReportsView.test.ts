import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportCaseDto, ReportDetailDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminReportsView from './AdminReportsView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: { reports: vi.fn(), report: vi.fn(), resolveReport: vi.fn(), rejectReport: vi.fn() },
}));

const caseDto: ReportCaseDto = {
  id: 11,
  shardId: 1,
  targetType: 'notice',
  targetId: 5,
  targetRestId: 5,
  targetRestName: '坏店',
  targetAccountId: 9,
  targetUsername: 'bad',
  snapshot: '加我微信领福利',
  status: 'open',
  reporterCount: 2,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T01:00:00.000Z',
  handledBy: null,
  handledAt: null,
  action: null,
  banDays: null,
  note: null,
};
const detailDto: ReportDetailDto = {
  ...caseDto,
  current: '加我微信领福利',
  entries: [
    { restName: '甲店', reason: 'ad', detail: '广告', createdAt: '2026-10-01T00:00:00.000Z' },
    { restName: '乙店', reason: 'abuse', detail: '', createdAt: '2026-10-01T01:00:00.000Z' },
  ],
  priorCases: 1,
};

async function mountView(role: 'mod' | 'admin' = 'mod') {
  useAdminStore().me = { accountId: 1, username: 'boss', role };
  useAdminStore().shardId = 1;
  const w = mount(AdminReportsView);
  await flushPromises();
  await w.find(`[data-testid="report-row-${caseDto.id}"]`).trigger('click');
  await flushPromises();
  return w;
}

describe('AdminReportsView（子项目 6B-1）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(adminApi.reports).mockResolvedValue([caseDto]);
    vi.mocked(adminApi.report).mockResolvedValue(detailDto);
    vi.mocked(adminApi.resolveReport).mockResolvedValue({ ...caseDto, status: 'resolved' });
    vi.mocked(adminApi.rejectReport).mockResolvedValue({ ...caseDto, status: 'rejected' });
  });

  it('列表和详情：举报人、理由、以前被处理过几次', async () => {
    const w = await mountView();
    expect(adminApi.reports).toHaveBeenCalledWith({ shardId: 1, status: 'open' });
    expect(w.text()).toContain('坏店');
    expect(w.text()).toContain('甲店');
    expect(w.text()).toContain('广告');
    expect(w.text()).toContain('以前被处理过 1 次');
  });

  it('处理：填说明、选 7 天、确认后调用 resolve；协管看不到永久', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountView('mod');
    expect(w.find('[data-testid="report-ban"] option[value="0"]').exists()).toBe(false);
    await w.find('[data-testid="report-note"]').setValue('发广告');
    await w.find('[data-testid="report-ban"]').setValue('7');
    await w.find('[data-testid="report-resolve"]').trigger('click');
    await flushPromises();
    expect(ask.mock.calls[0]![0]).toContain('清空这家店的公告');
    expect(ask.mock.calls[0]![0]).toContain('封号 7 天');
    expect(adminApi.resolveReport).toHaveBeenCalledWith(caseDto.id, { note: '发广告', banDays: 7 });
  });

  it('管理员能选永久；店名类型有新名字输入框', async () => {
    vi.mocked(adminApi.reports).mockResolvedValue([{ ...caseDto, targetType: 'rest_name' }]);
    vi.mocked(adminApi.report).mockResolvedValue({ ...detailDto, targetType: 'rest_name' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountView('admin');
    expect(w.find('[data-testid="report-ban"] option[value="0"]').exists()).toBe(true);
    await w.find('[data-testid="report-note"]').setValue('不雅');
    await w.find('[data-testid="report-new-name"]').setValue('新名字');
    await w.find('[data-testid="report-ban"]').setValue('0');
    await w.find('[data-testid="report-resolve"]').trigger('click');
    await flushPromises();
    expect(adminApi.resolveReport).toHaveBeenCalledWith(caseDto.id, {
      note: '不雅',
      banDays: 0,
      newName: '新名字',
    });
  });

  it('驳回；当前内容已没有时写已删除', async () => {
    vi.mocked(adminApi.report).mockResolvedValue({ ...detailDto, current: null });
    const w = await mountView();
    expect(w.text()).toContain('已删除');
    await w.find('[data-testid="report-note"]').setValue('没问题');
    await w.find('[data-testid="report-reject"]').trigger('click');
    await flushPromises();
    expect(adminApi.rejectReport).toHaveBeenCalledWith(caseDto.id, { note: '没问题' });
  });
});

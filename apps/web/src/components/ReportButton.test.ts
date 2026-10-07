import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import ReportButton from './ReportButton.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { report: vi.fn() } }));

describe('ReportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('放在加粗的店名旁边也不加粗，保持灰色不显眼（问题记录 451 审查）', () => {
    const w = mount(ReportButton, { props: { targetType: 'notice', targetId: 9 } });
    const open = w.get('[data-testid="report-open"]');
    expect(open.classes()).toEqual(expect.arrayContaining(['dt-link-btn', 'text-muted', 'fw-normal']));
  });

  it('选理由、写说明、提交；成功后显示已收到', async () => {
    vi.mocked(endpoints.report).mockResolvedValue({ ok: true } as never);
    const w = mount(ReportButton, { props: { targetType: 'notice', targetId: 9 } });
    await w.find('[data-testid="report-open"]').trigger('click');
    await w.find('[data-testid="report-reason-ad"]').setValue(true);
    await w.find('[data-testid="report-detail"]').setValue('加微信');
    await w.find('[data-testid="report-submit"]').trigger('click');
    await flushPromises();
    expect(endpoints.report).toHaveBeenCalledWith({
      targetType: 'notice',
      targetId: 9,
      reason: 'ad',
      detail: '加微信',
    });
    expect(w.text()).toContain('已收到举报');
  });

  it('失败显示中文原因', async () => {
    vi.mocked(endpoints.report).mockRejectedValue(new ApiError('INVALID_STATE', { reason: 'report_dup' }));
    const w = mount(ReportButton, { props: { targetType: 'post', targetId: 1 } });
    await w.find('[data-testid="report-open"]').trigger('click');
    await w.find('[data-testid="report-submit"]').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('你已经举报过这条内容了');
  });
});

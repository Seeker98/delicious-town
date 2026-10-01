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

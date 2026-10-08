import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { ApiError } from '../api/client';
import RedeemBox from './RedeemBox.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { redeem: vi.fn() } }));

describe('RedeemBox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('兑换成功写明得到什么、清空输入并通知父组件；失败写原因', async () => {
    vi.mocked(endpoints.redeem).mockResolvedValue({ code: 'KAIFU', items: { coin: 100 } });
    const w = mount(RedeemBox);
    await w.find('[data-testid="redeem-input"]').setValue(' kaifu ');
    await w.find('[data-testid="redeem-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.redeem).toHaveBeenCalledWith('kaifu');
    expect(w.text()).toContain('兑换成功: 银币 100');
    expect((w.find('[data-testid="redeem-input"]').element as HTMLInputElement).value).toBe('');
    expect(w.emitted('redeemed')).toHaveLength(1);
    vi.mocked(endpoints.redeem).mockRejectedValue(new ApiError('INVALID_STATE', { reason: 'code_used' }));
    await w.find('[data-testid="redeem-input"]').setValue('KAIFU');
    await w.find('[data-testid="redeem-go"]').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('这个兑换码你已经用过了');
  });
});

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

  // 界面改版 P11：成功在卡下面出一块绿底“领到了”，奖励拆成胶囊；失败写一行红字
  it('兑换成功写明得到什么、清空输入并通知父组件；失败写原因', async () => {
    vi.mocked(endpoints.redeem).mockResolvedValue({ code: 'KAIFU', items: { coin: 100 } });
    const w = mount(RedeemBox);
    await w.find('[data-testid="redeem-input"]').setValue(' kaifu ');
    await w.find('[data-testid="redeem-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.redeem).toHaveBeenCalledWith('kaifu');
    const done = w.find('[data-testid="redeem-result"]');
    expect(done.classes()).toContain('dt-redeem-done');
    expect(done.text()).toContain('领到了');
    expect(done.findAll('.dt-mail-chip').map((c) => c.text())).toEqual(['银币 100']);
    expect((w.find('[data-testid="redeem-input"]').element as HTMLInputElement).value).toBe('');
    expect(w.emitted('redeemed')).toHaveLength(1);
    vi.mocked(endpoints.redeem).mockRejectedValue(new ApiError('INVALID_STATE', { reason: 'code_used' }));
    await w.find('[data-testid="redeem-input"]').setValue('KAIFU');
    await w.find('[data-testid="redeem-go"]').trigger('click');
    await flushPromises();
    const bad = w.find('[data-testid="redeem-result"]');
    expect(bad.classes()).toEqual(expect.arrayContaining(['dt-field-hint', 'is-bad']));
    expect(bad.text()).toContain('这个兑换码你已经用过了');
    expect(w.find('.dt-redeem-done').exists()).toBe(false);
  });
});

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RedeemView from './RedeemView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { redeem: vi.fn() } }));

describe('RedeemView（问题记录 164）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('独立的兑换码页：有输入框和说明', async () => {
    const w = mount(RedeemView);
    await flushPromises();
    expect(w.find('[data-testid="redeem-input"]').exists()).toBe(true);
    expect(w.text()).toContain('同一个码每家店只能用一次');
  });
});

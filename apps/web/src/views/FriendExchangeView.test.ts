import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import FriendExchangeView from './FriendExchangeView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { exchangeFoods: vi.fn(), exchange: vi.fn() } }));

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/friends/:restId/exchange', component: FriendExchangeView }],
  });
  await router.push('/friends/2/exchange');
  const w = mount(FriendExchangeView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('FriendExchangeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.exchangeFoods).mockResolvedValue({
      level: 1,
      theirs: [{ foodsId: 11, num: 3, locked: false, fee: 20 }],
      mine: [
        { foodsId: 12, num: 5 },
        { foodsId: 13, num: 1 },
      ],
      left: 14,
      storm: false,
      npc: false,
    });
    vi.mocked(endpoints.exchange).mockResolvedValue({ result: 'ok', fee: 20, redPantsFoodsId: null });
  });

  it('选对方的和我的（不足 2 个的不能选），确认后交换', async () => {
    const w = await mountView();
    expect(w.text()).toContain('今天还能换 14 次');
    expect(w.find('[data-testid="mine-13"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="theirs-11"]').trigger('click');
    await w.find('[data-testid="mine-12"]').trigger('click');
    expect(w.find('[data-testid="confirm"]').text()).toContain('手续费 20');
    await w.find('[data-testid="confirm"]').trigger('click');
    await flushPromises();
    expect(endpoints.exchange).toHaveBeenCalledWith({ restId: 2, giveFoodsId: 12, takeFoodsId: 11 });
  });
});

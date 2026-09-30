import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import FriendFlipView from './FriendFlipView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { flipSlots: vi.fn(), flip: vi.fn() } }));

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/friends/:restId/flip', component: FriendFlipView }],
  });
  await router.push('/friends/2/flip');
  const w = mount(FriendFlipView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('FriendFlipView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.flipSlots).mockResolvedValue({
      slots: 5,
      cooling: [{ slotNo: 2, until: new Date(Date.now() + 3 * 3600_000).toISOString() }],
      todayTimes: 0,
    });
    vi.mocked(endpoints.flip).mockResolvedValue({
      outcome: 'nothing',
      foodsId: null,
      coin: 0,
      strength: 1,
      dtTickets: 0,
    });
  });

  it('冷却中的位置不能点；点其他位置翻橱并显示结果', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="slot-2"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="slot-2"]').text()).toMatch(/2 小时/);
    await w.find('[data-testid="slot-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.flip).toHaveBeenCalledWith(2, 1);
    expect(w.text()).toContain('什么都没有');
  });
});

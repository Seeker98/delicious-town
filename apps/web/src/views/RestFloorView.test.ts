import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { useSessionStore } from '../stores/session';
import RestFloorView from './RestFloorView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { floor: vi.fn(), roachKill: vi.fn(), dineExpel: vi.fn() },
}));

describe('RestFloorView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useSessionStore().me = {
      accountId: 1,
      username: 'u',
      email: 'u@x',
      emailVerified: true,
      role: 'player',
      shardId: 1,
      restaurantId: 7,
      lang: null,
    };
    vi.mocked(endpoints.floor).mockResolvedValue([
      { no: 1, floor: 1, customer: 3, roach: true, roachBy: 9 },
      {
        no: 2,
        floor: 1,
        customer: 9,
        freeloaderRestId: 9,
        freeloaderName: '乙',
        freeloaderSince: new Date(Date.now() - 40 * 60_000).toISOString(),
      },
      {
        no: 3,
        floor: 1,
        customer: 9,
        freeloaderRestId: 8,
        freeloaderName: '丙',
        freeloaderSince: new Date(Date.now() - 5 * 60_000).toISOString(),
      },
    ]);
    vi.mocked(endpoints.roachKill).mockResolvedValue({ strength: 1, coin: 15, exp: 10, tickets: 0 });
    vi.mocked(endpoints.dineExpel).mockResolvedValue({ hostCoin: 20, dinerLoss: 10 });
  });

  it('点自己店里的蟑螂消灭', async () => {
    const w = mount(RestFloorView);
    await flushPromises();
    await w.find('[data-testid="table-1"]').trigger('click');
    await w.find('[data-testid="act-kill"]').trigger('click');
    await flushPromises();
    expect(endpoints.roachKill).toHaveBeenCalledWith(7, 1);
  });

  it('白食满 30 分钟才能请走', async () => {
    const w = mount(RestFloorView);
    await flushPromises();
    await w.find('[data-testid="table-3"]').trigger('click');
    expect(w.find('[data-testid="act-expel"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="table-2"]').trigger('click');
    await w.find('[data-testid="act-expel"]').trigger('click');
    await flushPromises();
    expect(endpoints.dineExpel).toHaveBeenCalledWith(2);
  });
});

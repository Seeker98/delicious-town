import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import TicketPanel from './TicketPanel.vue';
import { exchangeData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: { townLevelTicket: vi.fn(), townMysteryTicket: vi.fn() },
}));

describe('TicketPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('N 级券：填数量，合计不超过持有数才能换', async () => {
    vi.mocked(endpoints.townLevelTicket).mockResolvedValue({ foods: [{ foodsId: 101, num: 2 }] });
    const w = mount(TicketPanel, { props: { data: exchangeData() } });
    expect(w.find('[data-testid="lt-have"]').text()).toBe('持有 3 张');
    expect(w.find('[data-testid="lt-go"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="lt-num-101"]').setValue(2);
    await w.find('[data-testid="lt-num-102"]').setValue(2);
    expect(w.find('[data-testid="lt-go"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="lt-num-102"]').setValue(0);
    await w.find('[data-testid="lt-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.townLevelTicket).toHaveBeenCalledWith(1, [{ foodsId: 101, num: 2 }]);
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('神秘券：选一种食材再换', async () => {
    vi.mocked(endpoints.townMysteryTicket).mockResolvedValue({ foods: [{ foodsId: 702, num: 1 }] });
    const w = mount(TicketPanel, { props: { data: exchangeData() } });
    expect(w.find('[data-testid="mt-go"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="mt-food"]').setValue('702');
    await w.find('[data-testid="mt-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.townMysteryTicket).toHaveBeenCalledWith(702);
  });
});

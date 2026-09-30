import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import FriendDuel from './FriendDuel.vue';
import { duelResult } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { duelInfo: vi.fn(), friendDuel: vi.fn() } }));

describe('FriendDuel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.duelInfo).mockResolvedValue({ left: 10, spar: 0, strength: 100, duelStrength: 5 });
    vi.mocked(endpoints.friendDuel).mockResolvedValue(
      duelResult({ them: { ...duelResult().them, name: '乙店' } }),
    );
  });

  it('写明今天还能切磋几次；切磋后显示结果并刷新次数', async () => {
    const w = mount(FriendDuel, { props: { restId: 2 } });
    await flushPromises();
    expect(endpoints.duelInfo).toHaveBeenCalledWith(2);
    expect(w.find('[data-testid="act-duel"]').text()).toBe('切磋（今天还能 10 次）');
    await w.find('[data-testid="act-duel"]').trigger('click');
    await flushPromises();
    expect(endpoints.friendDuel).toHaveBeenCalledWith(2);
    expect(w.find('[data-testid="duel-result"]').text()).toContain('乙店');
    expect(endpoints.duelInfo).toHaveBeenCalledTimes(2);
  });

  it('次数用完、体力不够时灰掉并写明原因', async () => {
    vi.mocked(endpoints.duelInfo).mockResolvedValue({ left: 0, spar: 12, strength: 100, duelStrength: 5 });
    const w = mount(FriendDuel, { props: { restId: 2 } });
    await flushPromises();
    expect(w.find('[data-testid="act-duel"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="duel-block"]').text()).toBe('今天和它切磋的次数用完了');
    vi.mocked(endpoints.duelInfo).mockResolvedValue({ left: 3, spar: 0, strength: 2, duelStrength: 5 });
    const tired = mount(FriendDuel, { props: { restId: 2 } });
    await flushPromises();
    expect(tired.find('[data-testid="duel-block"]').text()).toBe('体力不够（要 5）');
  });
});

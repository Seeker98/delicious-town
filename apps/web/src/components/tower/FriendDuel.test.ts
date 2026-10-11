import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { useToastStore } from '../../stores/toast';
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
    // 结果面板用 Teleport 挂到 body 上：测试里桩掉（界面改版 P9）
    const w = mount(FriendDuel, { props: { restId: 2 }, global: { stubs: { teleport: true } } });
    await flushPromises();
    expect(endpoints.duelInfo).toHaveBeenCalledWith(2);
    expect(w.get('[data-testid="act-duel"]').text()).toContain('好友对决');
    expect(w.get('[data-testid="duel-left"]').text()).toBe('今天还能比 10 次');
    expect(w.find('[data-testid="duel-result"]').exists()).toBe(false);
    vi.mocked(endpoints.duelInfo).mockResolvedValue({ left: 9, spar: 1, strength: 95, duelStrength: 5 });
    await w.find('[data-testid="act-duel"]').trigger('click');
    await flushPromises();
    expect(endpoints.friendDuel).toHaveBeenCalledWith(2);
    // 结果从下面弹出
    expect(w.get('.dt-sheet-title').text()).toBe('对决结果');
    expect(w.find('[data-testid="duel-result"]').text()).toContain('乙店');
    expect(endpoints.duelInfo).toHaveBeenCalledTimes(2);
    expect(w.get('[data-testid="duel-left"]').text()).toBe('今天还能比 9 次');
    // 关掉结果面板
    await w.get('.dt-sheet-actions button').trigger('click');
    expect(w.find('[data-testid="duel-result"]').exists()).toBe(false);
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
    expect(tired.find('[data-testid="duel-block"]').text()).toBe('体力不够 (要 5)');
  });
  it('区服没开放厨塔时整块不显示、也不弹错误（最终审查 Important 2）', async () => {
    vi.mocked(endpoints.duelInfo).mockRejectedValue(new ApiError('FEATURE_DISABLED', { feature: 'tower' }));
    const w = mount(FriendDuel, { props: { restId: 2 } });
    await flushPromises();
    expect(w.find('[data-testid="act-duel"]').exists()).toBe(false);
    expect(useToastStore().items).toHaveLength(0);
  });
});

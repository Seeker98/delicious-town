import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import RidersPanel from './RidersPanel.vue';
import { rider, takeawayData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: { takeawayCandidates: vi.fn(), takeawayHire: vi.fn(), takeawayDismiss: vi.fn() },
}));

const friend = rider({
  id: 32,
  restId: 5,
  name: '乙店',
  self: false,
  exp: 3,
  busy: 0,
  dismissCoin: 150,
  dismissExp: 1500,
});

describe('RidersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.takeawayCandidates).mockResolvedValue([
      { restId: 5, name: '乙店', level: 20, star: 1, block: 'mine' },
      { restId: 6, name: '丙店', level: 10, star: 1, block: null },
      { restId: 7, name: '丁店', level: 3, star: 0, block: 'star' },
    ]);
    vi.mocked(endpoints.takeawayHire).mockResolvedValue({ riderId: 33 });
    vi.mocked(endpoints.takeawayDismiss).mockResolvedValue({ coin: 150, exp: 1500 });
  });

  it('骑手的等级、经验和属性；解雇写明花费，确认后调用', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = mount(RidersPanel, {
      props: { data: takeawayData({ riders: [rider(), friend], riderCap: 3 }) },
    });
    await flushPromises();
    expect(w.find('[data-testid="rider-31"]').text()).toContain('我的店 (自己)');
    expect(w.find('[data-testid="rider-31"]').text()).toContain('经验 6/1,300');
    expect(w.find('[data-testid="rider-31"]').text()).toContain('成功率 80%');
    expect(w.find('[data-testid="dismiss-31"]').exists()).toBe(false);
    await w.find('[data-testid="dismiss-32"]').trigger('click');
    await flushPromises();
    expect(confirm.mock.calls[0]![0]).toContain('花 150 银币，得到 1,500 经验');
    expect(endpoints.takeawayDismiss).toHaveBeenCalledWith(32);
    expect(w.emitted('reload')).toHaveLength(1);
    confirm.mockRestore();
  });

  it('正在配送的骑手不能解雇', async () => {
    const w = mount(RidersPanel, {
      props: { data: takeawayData({ riders: [rider(), { ...friend, busy: 1 }] }) },
    });
    await flushPromises();
    expect(w.find('[data-testid="dismiss-32"]').attributes('disabled')).toBeDefined();
  });

  it('可雇的好友：不能雇的写原因；雇佣后刷新列表；满员时都灰掉', async () => {
    const w = mount(RidersPanel, {
      props: { data: takeawayData({ riders: [rider(), friend], riderCap: 3 }) },
    });
    await flushPromises();
    expect(w.find('[data-testid="hire-why-5"]').text()).toBe('已经是你的骑手');
    expect(w.find('[data-testid="hire-why-7"]').text()).toBe('要 1 星以上');
    await w.find('[data-testid="hire-6"]').trigger('click');
    await flushPromises();
    expect(endpoints.takeawayHire).toHaveBeenCalledWith(6);
    expect(endpoints.takeawayCandidates).toHaveBeenCalledTimes(2);
    expect(w.emitted('reload')).toHaveLength(1);
    const full = mount(RidersPanel, {
      props: { data: takeawayData({ riders: [rider(), friend], riderCap: 2 }) },
    });
    await flushPromises();
    expect(full.find('[data-testid="hire-why-6"]').text()).toBe('骑手已满员');
    expect(full.find('[data-testid="hire-6"]').attributes('disabled')).toBeDefined();
  });
});

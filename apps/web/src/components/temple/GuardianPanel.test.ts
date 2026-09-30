import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import GuardianPanel from './GuardianPanel.vue';
import { templeData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { templeMissile: vi.fn() } }));

describe('GuardianPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.templeMissile).mockResolvedValue({
      shots: [
        { hit: true, crit: true, damage: 10000, killed: false },
        { hit: false, crit: false, damage: 0, killed: false },
      ],
      hpMax: 15000,
      hpLeft: 2000,
      killed: false,
      drops: { tickets: 1, maps: 0, seals: 0, dtTickets: 3, rare: null, foods: [] },
    });
  });

  it('显示血量；发射数量不超过持有；结果逐枚列出并通知刷新', async () => {
    const w = mount(GuardianPanel, { props: { data: templeData() } });
    expect(w.find('[data-testid="hp"]').text()).toContain('12,000 / 15,000');
    await w.find('[data-testid="num"]').setValue('9');
    await w.find('[data-testid="fire"]').trigger('click');
    await flushPromises();
    expect(endpoints.templeMissile).toHaveBeenCalledWith(17, 3);
    const shots = w.find('[data-testid="shots"]').text();
    expect(shots).toContain('暴击');
    expect(shots).toContain('没打中');
    expect(w.emitted('reload')).toBeTruthy();
  });

  it('今天已击败：按钮灰掉并写明原因', () => {
    const w = mount(GuardianPanel, {
      props: { data: templeData({ guardian: { hpMax: 15000, hpLeft: 0, killed: true } }) },
    });
    expect(w.find('[data-testid="fire"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="block"]').text()).toContain('明天再来');
  });
});

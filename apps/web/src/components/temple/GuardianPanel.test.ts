import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import GuardianPanel from './GuardianPanel.vue';
import { templeData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { templeMissile: vi.fn() } }));

/** 数量面板用 Teleport 挂到 body 上：测试里把 teleport 桩掉，面板内容就留在 wrapper 里（同 ShopView.test） */
const mountPanel = (data = templeData()) =>
  mount(GuardianPanel, { props: { data }, global: { stubs: { teleport: true } } });

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
    const w = mountPanel();
    expect(w.find('[data-testid="hp"]').text()).toContain('12,000 / 15,000');
    expect(w.find('[data-testid="missile-17"]').text()).toContain('持有 3');
    await w.find('[data-testid="fire-open-17"]').trigger('click');
    await w.find('[data-testid="num"]').setValue('9');
    await w.find('[data-testid="qty-ok"]').trigger('click');
    await flushPromises();
    expect(endpoints.templeMissile).toHaveBeenCalledWith(17, 3);
    const shots = w.findAll('[data-testid="shots"] [data-testid="shot"]').map((x) => x.text());
    expect(shots).toHaveLength(2);
    expect(shots[0]).toContain('10,000 暴击');
    expect(shots[1]).toBe('没打中');
    const drops = w.find('[data-testid="drops"]').text();
    expect(drops).toContain('神秘礼券');
    expect(drops).toContain('美味券');
    expect(drops).not.toContain('探险图');
    expect(w.emitted('reload')).toBeTruthy();
  });

  it('今天已击败：按钮灰掉并写明原因', async () => {
    const w = mountPanel(templeData({ guardian: { hpMax: 15000, hpLeft: 0, killed: true } }));
    await w.find('[data-testid="fire-open-17"]').trigger('click');
    expect(w.find('[data-testid="qty-ok"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="qty-reason"]').text()).toContain('明天再来');
  });

  it('没有这种飞弹：按钮灰掉并写明原因', async () => {
    const w = mountPanel();
    await w.find('[data-testid="fire-open-18"]').trigger('click');
    expect(w.find('[data-testid="qty-ok"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="qty-reason"]').text()).toContain('没有这种飞弹');
  });
});

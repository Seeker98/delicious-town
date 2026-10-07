import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import SlotPanel from './SlotPanel.vue';
import { barData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { barSlot: vi.fn(), barExchange: vi.fn() } }));

const slotOf = (patch: Partial<ReturnType<typeof barData>['slot']>) => ({ ...barData().slot, ...patch });

describe('SlotPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('抽 1 次：显示每格的奖项和合并后的奖励，并通知刷新', async () => {
    vi.mocked(endpoints.barSlot).mockResolvedValue({
      spins: [[1, 0, 100]],
      rewards: [
        { awardId: 1, kind: 'foods', itemId: 101, num: 1 },
        { awardId: 100, kind: 'goods', itemId: 180, num: 1 },
      ],
      krabCoins: 2,
      floorLeft: 100,
    });
    const w = mount(SlotPanel, { props: { data: barData() } });
    await w.find('[data-testid="slot-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.barSlot).toHaveBeenCalledWith(1);
    const text = w.find('[data-testid="slot-result"]').text();
    expect(text).toContain('第 1 次：食材101 / 空 / 道具180');
    expect(text).toContain('得到 食材101×1、道具180×1');
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('蟹币只够 1 次：抽 10 次灰掉并写明原因，抽 1 次可用；没验证邮箱时都灰掉（Review Focus 5）', () => {
    const w = mount(SlotPanel, { props: { data: barData({ krabCoins: 3 }) } });
    expect(w.find('[data-testid="slot-1"]').attributes('disabled')).toBeUndefined();
    expect(w.find('[data-testid="slot-10"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="slot-block"]').text()).toContain('蟹币不够');
    const u = mount(SlotPanel, { props: { data: barData({ slot: slotOf({ emailVerified: false }) }) } });
    expect(u.find('[data-testid="slot-1"]').attributes('disabled')).toBeDefined();
    expect(u.find('[data-testid="slot-10"]').attributes('disabled')).toBeDefined();
    expect(u.find('[data-testid="slot-block"]').text()).toContain('验证邮箱');
  });

  it('礼券换蟹币：数量不超过 礼券÷100 和 99；不够 100 张时灰掉并写明原因', async () => {
    vi.mocked(endpoints.barExchange).mockResolvedValue({ krabCoins: 5, tickets: 50 });
    const w = mount(SlotPanel, { props: { data: barData({ tickets: 250 }) } });
    await w.find('[data-testid="ex-num"]').setValue('5');
    await w.find('[data-testid="ex-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.barExchange).toHaveBeenCalledWith(2);
    expect(w.emitted('reload')).toHaveLength(1);
    const poor = mount(SlotPanel, { props: { data: barData({ tickets: 50 }) } });
    expect(poor.find('[data-testid="ex-go"]').attributes('disabled')).toBeDefined();
    expect(poor.find('[data-testid="ex-block"]').text()).toContain('神秘礼券不够');
  });

  it('距离保底、奖池概率和稀有标记、我的统计', () => {
    const w = mount(SlotPanel, {
      props: {
        data: barData({
          slot: slotOf({
            floorLeft: 97,
            stats: [
              { awardId: 0, num: 3 },
              { awardId: 1, num: 6 },
            ],
          }),
        }),
      },
    });
    expect(w.find('[data-testid="floor-left"]').text()).toBe('97');
    const pool = w.find('[data-testid="slot-pool"]');
    expect(pool.findAll('tr')).toHaveLength(3);
    expect(pool.text()).toContain('3.00%');
    expect(pool.text()).toContain('稀有');
    // 表上是单格概率，下面写算上保底平均每几次出一次稀有（问题记录 511）
    expect(w.find('[data-testid="slot-rare-every"]').text()).toBe(
      '表里是每格的概率，不算保底；算上保底，平均每 90 次出一次稀有',
    );
    const stats = w.find('[data-testid="slot-stats"]').text();
    expect(stats).toContain('共 9 格');
    expect(stats).toContain('食材101 6 格');
  });
});

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import { useCatalogStore } from '../../stores/catalog';
import SlotPanel from './SlotPanel.vue';
import { barData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { barSlot: vi.fn(), barExchange: vi.fn() } }));

const slotOf = (patch: Partial<ReturnType<typeof barData>['slot']>) => ({ ...barData().slot, ...patch });
/** 换蟹币、奖池、统计都在 Teleport 到 body 的底部面板里：测试里把 teleport 桩掉（界面改版 P9） */
const mountSlot = (data: ReturnType<typeof barData>) =>
  mount(SlotPanel, { props: { data }, global: { stubs: { teleport: true } } });

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
    const catalog = useCatalogStore();
    const w = mountSlot(barData({ krabCoins: 20 }));
    expect(w.findAll('.dt-slot-reel').map((r) => r.text())).toEqual(['?', '?', '?']);
    await w.find('[data-testid="slot-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.barSlot).toHaveBeenCalledWith(1);
    // 三个转轮：食材、空、物品
    const reels = w.findAll('.dt-slot-reel');
    expect(reels[0]!.find('use').attributes('href')).toContain(`#${catalog.foodArt(101)}`);
    expect(reels[1]!.text()).toBe('空');
    expect(reels[1]!.find('svg').exists()).toBe(false);
    expect(reels[2]!.find('use').attributes('href')).toContain(`#${catalog.goodsArt(180)}`);
    const res = w.find('[data-testid="slot-result"]');
    expect(res.find('b').text()).toBe('得到');
    expect(res.findAll('[data-testid="award-chip"]').map((c) => c.text())).toEqual([
      '食材101×1',
      '道具180×1',
    ]);
    // 只抽一次不再逐次列出（转轮就是这一次）
    expect(res.findAll('li')).toHaveLength(0);
    expect(w.emitted('reload')).toHaveLength(1);

    // 抽多次：逐次列出每格的奖项，转轮停在最后一次
    vi.mocked(endpoints.barSlot).mockResolvedValue({
      spins: [
        [1, 0, 100],
        [0, 0, 0],
      ],
      rewards: [
        { awardId: 1, kind: 'foods', itemId: 101, num: 1 },
        { awardId: 100, kind: 'goods', itemId: 180, num: 1 },
      ],
      krabCoins: 10,
      floorLeft: 90,
    });
    await w.find('[data-testid="slot-10"]').trigger('click');
    await flushPromises();
    expect(endpoints.barSlot).toHaveBeenLastCalledWith(10);
    expect(w.findAll('[data-testid="slot-result"] li').map((l) => l.text())).toEqual([
      '第 1 次: 食材101 / 空 / 道具180',
      '第 2 次: 空 / 空 / 空',
    ]);
    expect(w.findAll('.dt-slot-reel').map((r) => r.text())).toEqual(['空', '空', '空']);

    // 什么也没抽到
    vi.mocked(endpoints.barSlot).mockResolvedValue({
      spins: [[0, 0, 0]],
      rewards: [],
      krabCoins: 9,
      floorLeft: 89,
    });
    await w.find('[data-testid="slot-1"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="slot-result"]').text()).toBe('什么也没抽到');
    expect(w.find('[data-testid="award-chip"]').exists()).toBe(false);
  });

  it('蟹币只够 1 次：抽 10 次灰掉并写明原因，抽 1 次可用；没验证邮箱时都灰掉（Review Focus 5）', () => {
    const w = mountSlot(barData({ krabCoins: 3 }));
    expect(w.find('[data-testid="slot-1"]').attributes('disabled')).toBeUndefined();
    expect(w.find('[data-testid="slot-10"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="slot-block"]').text()).toContain('蟹币不够');
    const u = mountSlot(barData({ slot: slotOf({ emailVerified: false }) }));
    expect(u.find('[data-testid="slot-1"]').attributes('disabled')).toBeDefined();
    expect(u.find('[data-testid="slot-10"]').attributes('disabled')).toBeDefined();
    expect(u.find('[data-testid="slot-block"]').text()).toContain('验证邮箱');
  });

  it('礼券换蟹币：数量不超过 礼券÷100 和 99；不够 100 张时灰掉并写明原因', async () => {
    vi.mocked(endpoints.barExchange).mockResolvedValue({ krabCoins: 5, tickets: 50 });
    const w = mountSlot(barData({ tickets: 250 }));
    // 换蟹币收进底部面板，点“换”才打开
    expect(w.find('[data-testid="ex-num"]').exists()).toBe(false);
    await w.find('[data-testid="ex-open"]').trigger('click');
    await w.find('[data-testid="ex-num"]').setValue('5');
    expect(w.find<HTMLInputElement>('[data-testid="ex-num"]').element.value).toBe('2');
    expect(w.find('[data-testid="qty-ok"]').text()).toBe('换 2 个 (200 张礼券)');
    await w.find('[data-testid="qty-ok"]').trigger('click');
    await flushPromises();
    expect(endpoints.barExchange).toHaveBeenCalledWith(2);
    expect(w.emitted('reload')).toHaveLength(1);
    // 换完面板收起
    expect(w.find('[data-testid="qty-ok"]').exists()).toBe(false);

    const rich = mountSlot(barData({ tickets: 50000 }));
    await rich.find('[data-testid="ex-open"]').trigger('click');
    await rich.find('[data-testid="qty-max"]').trigger('click');
    expect(rich.find('[data-testid="qty-ok"]').text()).toBe('换 99 个 (9,900 张礼券)');

    const poor = mountSlot(barData({ tickets: 50 }));
    await poor.find('[data-testid="ex-open"]').trigger('click');
    expect(poor.find('[data-testid="qty-ok"]').attributes('disabled')).toBeDefined();
    expect(poor.find('[data-testid="qty-reason"]').text()).toContain('神秘礼券不够');
  });

  it('距离保底、奖池概率和稀有标记、我的统计', async () => {
    const w = mountSlot(
      barData({
        slot: slotOf({
          floorLeft: 97,
          stats: [
            { awardId: 0, num: 3 },
            { awardId: 1, num: 6 },
          ],
        }),
      }),
    );
    expect(w.find('[data-testid="bar-info-sub"]').text()).toBe('再抽 97 次必出稀有');
    expect(w.find('[data-testid="slot-rare-every"]').text()).toBe('算上保底, 平均每 90 次出一次稀有');
    expect(w.find('[data-testid="slot-pool"]').exists()).toBe(false);
    await w.find('[data-testid="slot-pool-open"]').trigger('click');
    const pool = w.find('[data-testid="slot-pool"]');
    expect(pool.findAll('tr')).toHaveLength(3);
    expect(pool.text()).toContain('3.00%');
    expect(pool.text()).toContain('稀有');
    // 表上是单格概率，下面写算上保底平均每几次出一次稀有（问题记录 511）
    expect(w.text()).toContain('表里是每格的概率, 不算保底；算上保底, 平均每 90 次出一次稀有');
    const stats = w.find('[data-testid="slot-stats"]').text();
    expect(stats).toContain('共 9 格');
    expect(stats).toContain('食材101 6 格');
    await w.find('[data-testid="slot-stats-open"]').trigger('click');
    const table = w.find('[data-testid="slot-stats-table"]');
    expect(table.findAll('tr').map((r) => r.findAll('td').map((d) => d.text()))).toEqual([
      ['空', '3 格'],
      ['食材101', '6 格'],
    ]);
    expect(w.text()).toContain('共 9 格');
  });

  it('有神灯时副标题写上保底机会翻倍；没抽过时统计写还没抽过', () => {
    const w = mountSlot(barData({ slot: slotOf({ lamp: true, floorLeft: 50 }) }));
    expect(w.find('[data-testid="bar-info-sub"]').text()).toBe('再抽 50 次必出稀有 · 有神灯: 保底机会翻倍');
    expect(w.find('[data-testid="slot-stats"]').text()).toBe('还没抽过');
  });
});

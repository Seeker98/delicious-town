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

  it('N 级券：点 + 选食材，再点加减；合计到券数时不能再加；兑换按选的发（问题记录 491）', async () => {
    vi.mocked(endpoints.townLevelTicket).mockResolvedValue({ foods: [{ foodsId: 101, num: 2 }] });
    const w = mount(TicketPanel, { props: { data: exchangeData() } });
    expect(w.get('[data-testid="lt-picked"]').text()).toBe('已选 0 / 3 张');
    expect(w.get('[data-testid="lt-go"]').attributes('disabled')).toBeDefined();
    // 没选的只有一个 +，选了才出现加减
    expect(w.find('[data-testid="lt-minus-101"]').exists()).toBe(false);
    await w.get('[data-testid="lt-add-101"]').trigger('click');
    await w.get('[data-testid="lt-plus-101"]').trigger('click');
    expect(w.get('[data-testid="lt-num-101"]').text()).toBe('2');
    await w.get('[data-testid="lt-add-102"]').trigger('click');
    expect(w.get('[data-testid="lt-picked"]').text()).toBe('已选 3 / 3 张');
    expect(w.get('[data-testid="lt-plus-101"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="lt-minus-102"]').trigger('click');
    expect(w.find('[data-testid="lt-minus-102"]').exists()).toBe(false);
    await w.get('[data-testid="lt-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.townLevelTicket).toHaveBeenCalledWith(1, [{ foodsId: 101, num: 2 }]);
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('等级换成一排按钮并写每级有几张券，默认停在第一个有券的等级（问题记录 491）', async () => {
    const w = mount(TicketPanel, {
      props: { data: exchangeData({ levelTickets: [0, 0, 2, 0, 1] }), part: 'level' },
    });
    expect(w.findAll('[data-testid^="lt-level-"]').map((b) => b.text())).toEqual([
      '1 级',
      '2 级',
      '3 级 ×2',
      '4 级',
      '5 级 ×1',
    ]);
    expect(w.get('[data-testid="lt-level-3"]').attributes('aria-pressed')).toBe('true');
    expect(w.find('[data-testid="lt-add-301"]').exists()).toBe(true);
    await w.get('[data-testid="lt-level-5"]').trigger('click');
    expect(w.find('[data-testid="lt-add-501"]').exists()).toBe(true);
    expect(w.get('[data-testid="lt-picked"]').text()).toBe('已选 0 / 1 张');
  });

  it('食材排序：本街还缺的在前 (缺得多的先)，再是我没有的，再其他；写有几个、缺几个；按名字搜（问题记录 491）', async () => {
    const w = mount(TicketPanel, {
      props: {
        data: exchangeData({
          levelFoods: [[101, 102, 103, 104, 105], [201], [301], [401], [501]],
          foodHave: { 102: 5, 104: 1, 105: 2 },
          streetNeed: { 104: 4, 103: 2, 102: 2 },
        }),
        part: 'level',
      },
    });
    const ids = () => w.findAll('[data-testid^="lt-food-"]').map((x) => x.attributes('data-testid'));
    // 104 缺 3、103 缺 2；101 没有；102 够用、105 有
    expect(ids()).toEqual(['lt-food-104', 'lt-food-103', 'lt-food-101', 'lt-food-102', 'lt-food-105']);
    expect(w.get('[data-testid="lt-food-104"]').text()).toContain('缺 3');
    expect(w.get('[data-testid="lt-food-104"]').text()).toContain('有 1');
    expect(w.get('[data-testid="lt-food-102"]').text()).not.toContain('缺');
    await w.get('[data-testid="lt-search"]').setValue('食材103');
    expect(ids()).toEqual(['lt-food-103']);
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

  it('兑换失败后也通知刷新', async () => {
    vi.mocked(endpoints.townLevelTicket).mockRejectedValue(new Error('x'));
    const w = mount(TicketPanel, { props: { data: exchangeData() } });
    await w.get('[data-testid="lt-add-101"]').trigger('click');
    await w.find('[data-testid="lt-go"]').trigger('click');
    await flushPromises();
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('part：只显示 N 级券（13 哥）或只显示神秘券（卡门，问题记录 441）', () => {
    const level = mount(TicketPanel, { props: { data: exchangeData(), part: 'level' } });
    expect(level.find('[data-testid="lt-level-1"]').exists()).toBe(true);
    expect(level.find('[data-testid="mt-food"]').exists()).toBe(false);
    const mystery = mount(TicketPanel, { props: { data: exchangeData(), part: 'mystery' } });
    expect(mystery.find('[data-testid="lt-level-1"]').exists()).toBe(false);
    expect(mystery.find('[data-testid="mt-food"]').exists()).toBe(true);
  });
});

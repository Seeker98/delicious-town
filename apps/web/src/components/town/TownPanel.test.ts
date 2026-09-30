import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import TownPanel from './TownPanel.vue';
import { blessData, townData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    townTalk: vi.fn(),
    townShake: vi.fn(),
    townWish: vi.fn(),
    townFeast: vi.fn(),
    townHammer: vi.fn(),
  },
}));

describe('TownPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('NPC：聊过的变灰；聊天后提示台词和奖励并通知刷新', async () => {
    vi.mocked(endpoints.townTalk).mockResolvedValue({
      npc: 'wenjie',
      talk: '用了飘柔就明显气质上来了!',
      rewards: [{ kind: 'goods', id: 1, num: 5 }],
    });
    const w = mount(TownPanel, {
      props: { data: townData({ talked: { bigEater: true, wenjie: false, bro13: false } }) },
    });
    expect(w.find('[data-testid="talk-bigEater"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="talk-wenjie"]').trigger('click');
    await flushPromises();
    expect(endpoints.townTalk).toHaveBeenCalledWith('wenjie');
    expect(useToastStore().items.at(-1)!.text).toBe('雯姐：用了飘柔就明显气质上来了! 获得 道具1×5');
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('摇钱包：摇过的变灰；提示银币和彩蛋', async () => {
    expect(
      mount(TownPanel, { props: { data: townData({ shaken: true }) } })
        .find('[data-testid="shake"]')
        .attributes('disabled'),
    ).toBeDefined();
    vi.mocked(endpoints.townShake).mockResolvedValue({ coin: 12000, egg: { goodsId: 180, num: 1 } });
    const w = mount(TownPanel, { props: { data: townData() } });
    await w.find('[data-testid="shake"]').trigger('click');
    await flushPromises();
    expect(useToastStore().items.at(-1)!.text).toBe('摇到银币 12,000，还从裤兜里掏出了 道具180×1');
  });

  it('星愿：没人许愿时有神灯才能许；自选食材要先选', async () => {
    const none = mount(TownPanel, { props: { data: townData() } });
    expect(none.find('[data-testid="wish"]').attributes('disabled')).toBeDefined();
    expect(none.find('[data-testid="wish-block"]').text()).toBe('持有神灯才能许愿');

    const today = townData({
      bless: { today: blessData(), restName: '小李的店', hasLamp: false, activation: 130, feasted: false },
    });
    vi.mocked(endpoints.townFeast).mockResolvedValue({ rewards: [{ kind: 'foods', id: 501, num: 1 }] });
    // 自选范围来自目录里的食材：放一个 5 级、一个 1 级
    useCatalogStore().foodsMap = new Map([
      [501, { id: 501, name: '鲍鱼', level: 5, odds: 100, coin: 1, type: null }],
      [101, { id: 101, name: '大米', level: 1, odds: 70, coin: 1, type: null }],
    ]);
    const w = mount(TownPanel, { props: { data: today } });
    expect(w.findAll('[data-testid="feast-food"] option').map((o) => o.text())).toEqual(['选择食材', '鲍鱼']);
    expect(w.find('[data-testid="bless-name"]').text()).toBe('心想事成');
    expect(w.find('[data-testid="bless-reward"]').text()).toBe('自选 5 级食材 ×1');
    expect(w.find('[data-testid="feast"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="feast-food"]').setValue('501');
    await w.find('[data-testid="feast"]').trigger('click');
    await flushPromises();
    expect(endpoints.townFeast).toHaveBeenCalledWith(501);
  });

  it('活跃度不够时共飨按钮灰掉并写明差多少', () => {
    const w = mount(TownPanel, {
      props: {
        data: townData({
          bless: {
            today: blessData({ type: 3, num: 200000, levels: null }),
            restName: '甲',
            hasLamp: true,
            activation: 30,
            feasted: false,
          },
        }),
      },
    });
    expect(w.find('[data-testid="feast"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="feast-block"]').text()).toBe('今天活跃度 30，要 120 才能领');
    expect(w.find('[data-testid="bless-reward"]').text()).toBe('银币 200,000（持有神灯多领 10%）');
  });

  it('雷神锤：选类型用银币，或用钻石；冷却中全部灰掉', async () => {
    vi.mocked(endpoints.townHammer).mockResolvedValue({
      from: 1,
      to: 13,
      gift: { goodsId: 19, num: 1 },
      cooldownUntil: '2026-09-30T10:00:00.000Z',
    });
    const w = mount(TownPanel, { props: { data: townData() } });
    await w.find('[data-testid="hammer-2"]').trigger('click');
    await flushPromises();
    expect(endpoints.townHammer).toHaveBeenCalledWith({ mode: 'coin', type: 2 });
    await w.find('[data-testid="hammer-diamond"]').trigger('click');
    await flushPromises();
    expect(endpoints.townHammer).toHaveBeenLastCalledWith({ mode: 'diamond' });
    const cool = mount(TownPanel, {
      props: {
        data: townData({
          hammer: {
            has: true,
            readyAt: '2026-09-30T10:00:00.000Z',
            townReadyAt: null,
            coin: 100000,
            diamond: 8,
          },
        }),
      },
    });
    expect(cool.find('[data-testid="hammer-1"]').attributes('disabled')).toBeDefined();
    expect(cool.find('[data-testid="hammer-diamond"]').attributes('disabled')).toBeDefined();
  });
});

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { endpoints } from '../../api/endpoints';
import { useCatalogStore } from '../../stores/catalog';
import { useRestaurantStore } from '../../stores/restaurant';
import { useToastStore } from '../../stores/toast';
import TownPanel from './TownPanel.vue';
import { blessData, townData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    townTalk: vi.fn(),
    townMayor: vi.fn(),
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
      talk: 'wenjie',
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

  describe('冷却按服务器时间倒计时（终审 I1）', () => {
    afterEach(() => vi.useRealTimers());
    it('全镇 90 秒间隔结束后换天气按钮自己恢复', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
      vi.setSystemTime(new Date('2026-09-30T04:00:00.000Z'));
      const data = townData({
        hammer: {
          has: true,
          readyAt: null,
          townReadyAt: '2026-09-30T04:00:03.000Z',
          coin: 100000,
          diamond: 8,
        },
      });
      const w = mount(TownPanel, { props: { data } });
      expect(w.find('[data-testid="hammer-block"]').text()).toBe('刚换过天气，3 秒后才能再换');
      expect(w.find('[data-testid="hammer-1"]').attributes('disabled')).toBeDefined();
      vi.advanceTimersByTime(3000);
      await nextTick();
      expect(w.find('[data-testid="hammer-block"]').exists()).toBe(false);
      expect(w.find('[data-testid="hammer-1"]').attributes('disabled')).toBeUndefined();
    });
  });

  it('镇长问答：区服关掉的功能对应的地点不列出来（问题记录 256：嘻哈男孩不会去那里）', async () => {
    useRestaurantStore().rest = { disabledFeatures: ['kuji', 'temple'] } as never;
    const w = mount(TownPanel, { props: { data: townData() } });
    await w.find('[data-testid="mayor-open"]').trigger('click');
    expect(w.find('[data-testid="mayor-12"]').exists()).toBe(false);
    expect(w.find('[data-testid="mayor-6"]').exists()).toBe(false);
    expect(w.find('[data-testid="mayor-10"]').text()).toBe('交易所');
    expect(w.find('[data-testid="mayor-9"]').exists()).toBe(true);
  });

  it('镇长问答：点开后选地点，提示回话和道具；答过就不能再答', async () => {
    vi.mocked(endpoints.townMayor).mockResolvedValue({
      npc: 'mayor',
      talk: 'mayorRight',
      rewards: [{ kind: 'goods', id: 231, num: 1 }],
    });
    const w = mount(TownPanel, { props: { data: townData() } });
    expect(w.find('[data-testid="mayor-3"]').exists()).toBe(false);
    await w.find('[data-testid="mayor-open"]').trigger('click');
    expect(
      w.findAll('[data-testid^="mayor-"]').filter((b) => /mayor-\d/.test(b.attributes('data-testid')!)),
    ).toHaveLength(13);
    await w.find('[data-testid="mayor-3"]').trigger('click');
    await flushPromises();
    expect(endpoints.townMayor).toHaveBeenCalledWith(3);
    expect(useToastStore().items.at(-1)!.text).toBe(
      '镇长：谢谢你，我现在就去找他，好好弥补他！ 获得 道具231×1',
    );
    expect(w.emitted('reload')).toHaveLength(1);

    const done = mount(TownPanel, { props: { data: townData({ mayor: { answered: true } }) } });
    expect(done.find('[data-testid="mayor-open"]').exists()).toBe(false);
    expect(done.text()).toContain('今天已经告诉过镇长了');
  });

  it('NPC 和钱包的按钮放在右侧操作区，和说明文字分开（问题记录 110）', () => {
    const w = mount(TownPanel, { props: { data: townData() } });
    for (const id of ['talk-bigEater', 'talk-wenjie', 'talk-bro13', 'shake'])
      expect(w.find('.dt-item-actions [data-testid="' + id + '"]').exists()).toBe(true);
  });

  it('操作失败后也通知刷新：页面可能已经过时（比如别人刚许过愿、跨天了）', async () => {
    vi.mocked(endpoints.townShake).mockRejectedValue(new Error('x'));
    const w = mount(TownPanel, { props: { data: townData() } });
    await w.find('[data-testid="shake"]').trigger('click');
    await flushPromises();
    expect(w.emitted('reload')).toHaveLength(1);
  });
});

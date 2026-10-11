import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { endpoints } from '../../api/endpoints';
import { useCatalogStore } from '../../stores/catalog';
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

/** 换天气、选食材面板 Teleport 到 body：测试里把 teleport 桩掉（界面改版 P10） */
const mountIt = (data: ReturnType<typeof townData>) =>
  mount(TownPanel, { props: { data }, global: { stubs: { teleport: true } } });

describe('TownPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('雯姐的每天聊天搬到了酒吧：广场没有 NPC 聊天了（问题记录 453）', () => {
    const w = mountIt(townData());
    expect(w.find('[data-testid="talk-wenjie"]').exists()).toBe(false);
    // 广场没有 NPC 了，不留空的“NPC”标题（终审）
    expect(w.findAll('h2, h6').map((h) => h.text())).not.toContain('NPC');
  });

  it('摇钱包：摇过的变灰；提示银币和彩蛋', async () => {
    // 界面改版 P10：摇过的按钮换成“今天摇过了”小标签，点不了
    const shaken = mountIt(townData({ shaken: true })).get('[data-testid="shake"]');
    expect(shaken.element.tagName).toBe('SPAN');
    expect(shaken.text()).toBe('今天摇过了');
    vi.mocked(endpoints.townShake).mockResolvedValue({ coin: 12000, egg: { goodsId: 180, num: 1 } });
    const w = mountIt(townData());
    await w.find('[data-testid="shake"]').trigger('click');
    await flushPromises();
    expect(useToastStore().items.at(-1)!.text).toBe('摇到银币 12,000, 还从裤兜里掏出了 道具180×1');
  });

  it('星愿：没人许愿时有神灯才能许；自选食材要先选', async () => {
    const none = mountIt(townData());
    // 界面改版 P10：没有神灯时不放许愿按钮，写明原因
    expect(none.find('[data-testid="wish"]').exists()).toBe(false);
    expect(none.find('[data-testid="wish-block"]').text()).toBe('持有神灯才能许愿');
    const lamp = mountIt(
      townData({ bless: { today: null, restName: null, hasLamp: true, activation: 0, feasted: false } }),
    );
    expect(lamp.find('[data-testid="wish"]').attributes('disabled')).toBeUndefined();
    expect(lamp.find('[data-testid="wish-block"]').exists()).toBe(false);

    const today = townData({
      bless: { today: blessData(), restName: '小李的店', hasLamp: false, activation: 130, feasted: false },
    });
    vi.mocked(endpoints.townFeast).mockResolvedValue({ rewards: [{ kind: 'foods', id: 501, num: 1 }] });
    // 自选范围来自目录里的食材：放一个 5 级、一个 1 级
    useCatalogStore().foodsMap = new Map([
      [501, { id: 501, name: '鲍鱼', level: 5, odds: 100, coin: 1, type: null }],
      [101, { id: 101, name: '大米', level: 1, odds: 70, coin: 1, type: null }],
    ]);
    const w = mountIt(today);
    expect(w.find('[data-testid="bless-name"]').text()).toBe('心想事成');
    expect(w.find('[data-testid="bless-reward"]').text()).toBe('自选 5 级食材 ×1');
    // 界面改版 P10：点“共飨”先弹出选食材面板（原来是下拉框），只列星愿等级范围里的
    await w.find('[data-testid="feast"]').trigger('click');
    expect(endpoints.townFeast).not.toHaveBeenCalled();
    expect(w.findAll('[data-testid^="feast-food-"]').map((o) => o.text())).toEqual(['鲍鱼']);
    expect(w.find('[data-testid="feast-ok"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="feast-food-501"]').trigger('click');
    expect(w.get('[data-testid="feast-food-501"]').attributes('aria-checked')).toBe('true');
    expect(w.find('[data-testid="feast-ok"]').attributes('disabled')).toBeUndefined();
    await w.find('[data-testid="feast-ok"]').trigger('click');
    await flushPromises();
    expect(endpoints.townFeast).toHaveBeenCalledWith(501);
    expect(w.find('[data-testid="feast-ok"]').exists()).toBe(false);
  });

  it('活跃度不够时共飨按钮灰掉并写明差多少', () => {
    const w = mountIt(
      townData({
        bless: {
          today: blessData({ type: 3, num: 200000, levels: null }),
          restName: '甲',
          hasLamp: true,
          activation: 30,
          feasted: false,
        },
      }),
    );
    expect(w.find('[data-testid="feast"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="feast-block"]').text()).toBe('今天活跃度 30, 要 120 才能领');
    expect(w.find('[data-testid="bless-reward"]').text()).toBe('银币 200,000 (持有神灯多领 10%)');
  });

  it('雷神锤：选类型用银币，或用钻石；冷却中全部灰掉', async () => {
    vi.mocked(endpoints.townHammer).mockResolvedValue({
      from: 1,
      to: 13,
      gift: { goodsId: 19, num: 1 },
      cooldownUntil: '2026-09-30T10:00:00.000Z',
    });
    const w = mountIt(townData());
    // 界面改版 P10：点“换天气”弹出面板，一类天气一行，选一行再确认
    expect(w.find('[data-testid="hammer-2"]').exists()).toBe(false);
    await w.find('[data-testid="hammer-open"]').trigger('click');
    expect(w.get('[data-testid="hammer-ok"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="hammer-ok"]').text()).toBe('先选一种天气');
    await w.find('[data-testid="hammer-2"]').trigger('click');
    expect(endpoints.townHammer).not.toHaveBeenCalled();
    expect(w.get('[data-testid="hammer-2"]').attributes('aria-checked')).toBe('true');
    expect(w.get('[data-testid="hammer-ok"]').text()).toBe('换成雨类 · 100,000');
    await w.find('[data-testid="hammer-ok"]').trigger('click');
    await flushPromises();
    expect(endpoints.townHammer).toHaveBeenCalledWith({ mode: 'coin', type: 2 });
    // 换完面板关掉
    expect(w.find('[data-testid="hammer-ok"]').exists()).toBe(false);
    await w.find('[data-testid="hammer-open"]').trigger('click');
    await w.find('[data-testid="hammer-diamond"]').trigger('click');
    expect(w.get('[data-testid="hammer-ok"]').text()).toBe('召唤特殊天气 · 8 钻');
    await w.find('[data-testid="hammer-ok"]').trigger('click');
    await flushPromises();
    expect(endpoints.townHammer).toHaveBeenLastCalledWith({ mode: 'diamond' });
    const cool = mountIt(
      townData({
        hammer: {
          has: true,
          readyAt: '2026-09-30T10:00:00.000Z',
          townReadyAt: null,
          coin: 100000,
          diamond: 8,
        },
      }),
    );
    // 冷却中不给打开面板，写明冷却到几点
    expect(cool.find('[data-testid="hammer-open"]').exists()).toBe(false);
    expect(cool.get('[data-testid="hammer-block"]').text()).toMatch(/^冷却到 \d{2}:\d{2}$/);
    // 没有锤子：写明要持有
    const none = mountIt(
      townData({ hammer: { has: false, readyAt: null, townReadyAt: null, coin: 100000, diamond: 8 } }),
    );
    expect(none.find('[data-testid="hammer-open"]').exists()).toBe(false);
    expect(none.get('[data-testid="hammer-block"]').text()).toBe('持有雷神锤才能使用');
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
      const w = mountIt(data);
      expect(w.find('[data-testid="hammer-block"]').text()).toBe('刚换过天气, 3 秒后才能再换');
      expect(w.find('[data-testid="hammer-open"]').exists()).toBe(false);
      vi.advanceTimersByTime(3000);
      await nextTick();
      expect(w.find('[data-testid="hammer-block"]').exists()).toBe(false);
      expect(w.find('[data-testid="hammer-open"]').exists()).toBe(true);
    });
  });

  it('钱包的按钮放在右侧操作区，和说明文字分开（问题记录 110）', () => {
    const w = mountIt(townData());
    // 界面改版 P10：蟹老板大卡片，按钮在说明文字外、卡片右侧
    expect(w.find('[data-testid="krab-card"] > [data-testid="shake"]').exists()).toBe(true);
    expect(w.find('.dt-mascot-text [data-testid="shake"]').exists()).toBe(false);
  });

  it('13 哥和镇长大胃锅（原来的大胃哥）搬到协会：广场居民里没有他们（问题记录 441）', () => {
    const w = mountIt(townData());
    expect(w.find('[data-testid="talk-bro13"]').exists()).toBe(false);
    expect(w.find('[data-testid="talk-bigEater"]').exists()).toBe(false);
    expect(w.find('[data-testid="mayor-row"]').exists()).toBe(false);
  });

  it('操作失败后也通知刷新：页面可能已经过时（比如别人刚许过愿、跨天了）', async () => {
    vi.mocked(endpoints.townShake).mockRejectedValue(new Error('x'));
    const w = mountIt(townData());
    await w.find('[data-testid="shake"]').trigger('click');
    await flushPromises();
    expect(w.emitted('reload')).toHaveLength(1);
  });
});

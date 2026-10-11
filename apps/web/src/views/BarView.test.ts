import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { barData } from '../components/bar/testData';
import { useToastStore } from '../stores/toast';
import { useRestaurantStore } from '../stores/restaurant';
import type { RestaurantDto } from '@dt/shared';
import BarView from './BarView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { bar: vi.fn(), townTalk: vi.fn() } }));

const stubs = {
  HiphopCard: {
    template: `<button data-testid="hiphop-tip" @click="$emit('changed')">hiphop</button>`,
    emits: ['changed'],
  },
};
const GAMES = ['fg', 'cup', 'num', 'slot', 'devil', 'memory', 'darts', 'nim', 'spice', 'deal'];

/** 酒吧首页的格子是 RouterLink：每个游戏一页 /bar/<游戏>（界面改版 P9） */
async function mountBar() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/bar', component: BarView },
      { path: '/bar/:game', component: { template: '<p>game</p>' } },
    ],
  });
  await router.push('/bar');
  const w = mount(BarView, { global: { plugins: [router], stubs } });
  await flushPromises();
  return { w, router };
}

describe('BarView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    localStorage.clear();
    vi.mocked(endpoints.bar).mockResolvedValue(barData());
  });

  it('读取后头图上显示礼券、蟹币和银币；十个游戏格子各链到自己的页面', async () => {
    vi.mocked(endpoints.bar).mockResolvedValue(barData({ coin: 12345 }));
    const { w, router } = await mountBar();
    expect(w.get('[data-testid="bar-wallet-tickets"]').text()).toBe('神秘礼券 20');
    expect(w.get('[data-testid="bar-wallet-krab"]').text()).toBe('蟹币 3');
    expect(w.get('[data-testid="bar-wallet-coin"]').text()).toBe('12,345');
    expect(w.get('[data-testid="bar-wallet-coin"]').attributes('aria-label')).toBe('银币 12,345');
    const tiles = w.findAll('[data-testid="bar-games"] a');
    expect(tiles.map((x) => x.attributes('data-testid'))).toEqual(GAMES.map((g) => `game-${g}`));
    expect(tiles.map((x) => x.attributes('href'))).toEqual(GAMES.map((g) => `/bar/${g}`));
    await w.get('[data-testid="game-slot"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/bar/slot');
  });

  it('读取失败时写明', async () => {
    vi.mocked(endpoints.bar).mockRejectedValue(new Error('network'));
    const { w } = await mountBar();
    expect(w.find('[data-testid="bar-failed"]').exists()).toBe(true);
    expect(w.find('[data-testid="bar-games"]').exists()).toBe(false);
  });

  it('酒吧顶部有吉祥物雯姐（问题记录 210）', async () => {
    const { w } = await mountBar();
    expect(w.find('[data-testid="bar-wenjie"]').text()).toContain('雯姐');
    expect(w.get('[data-testid="bar-wenjie-line"]').text()).not.toBe('');
  });

  it('和雯姐每天聊一次搬到了酒吧：聊了提示台词和奖励，重新读取；聊过的变灰（问题记录 453）', async () => {
    vi.mocked(endpoints.townTalk).mockResolvedValue({
      npc: 'wenjie',
      talk: 'wenjie',
      rewards: [{ kind: 'goods', id: 1, num: 5 }],
    });
    const { w } = await mountBar();
    // 聊天按钮在雯姐卡片右边（界面改版 P9）
    const talk = w.get('[data-testid="bar-wenjie"] [data-testid="talk-wenjie"]');
    expect(talk.text()).toBe('聊天 · 送礼券');
    await talk.trigger('click');
    await flushPromises();
    expect(endpoints.townTalk).toHaveBeenCalledWith('wenjie');
    expect(useToastStore().items.at(-1)!.text).toBe('雯姐: 用了飘柔就明显气质上来了! 获得 道具1×5');
    expect(endpoints.bar).toHaveBeenCalledTimes(2);
    vi.mocked(endpoints.bar).mockResolvedValue(barData({ wenjieTalked: true }));
    const { w: again } = await mountBar();
    expect(again.get('[data-testid="talk-wenjie"]').attributes('disabled')).toBeDefined();
  });

  it('区服关了小镇（聊天走小镇的接口）：酒吧不显示和雯姐聊天（终审）', async () => {
    useRestaurantStore().rest = { disabledFeatures: ['town'] } as unknown as RestaurantDto;
    const { w } = await mountBar();
    expect(w.find('[data-testid="bar-wenjie"]').exists()).toBe(true);
    expect(w.find('[data-testid="talk-wenjie"]').exists()).toBe(false);
  });

  it('嘻哈男孩打赏后重新读取（礼券、蟹币可能变了）', async () => {
    const { w } = await mountBar();
    await w.get('[data-testid="hiphop-tip"]').trigger('click');
    await flushPromises();
    expect(endpoints.bar).toHaveBeenCalledTimes(2);
  });

  it('十个游戏的格子按顺序写名字和花费；进行中、用完了、连胜标在角上（4C-3、最后一颗糖）', async () => {
    const d = barData({ fg: { result: 'win', times: 3 } });
    d.memory.round = { level: 1, passed: false, seq: null, leftMs: null };
    d.darts.played = d.darts.max;
    vi.mocked(endpoints.bar).mockResolvedValue(d);
    const { w } = await mountBar();
    expect(w.findAll('.dt-game-tile-name').map((x) => x.text())).toEqual([
      '划拳',
      '猜酒杯',
      '转数字',
      '老虎机',
      '魔鬼辣杯',
      '记忆调酒',
      '飞镖',
      '最后一颗糖',
      '秘制调料',
      '一掷千金',
    ]);
    const meta = (g: string) =>
      w.findAll(`[data-testid="game-${g}"] .dt-game-tile-meta`).map((x) => x.text());
    expect(meta('fg')).toEqual(['1 张礼券一局']);
    expect(meta('slot')).toEqual(['1 蟹币一次', '再 100 次必出稀有']);
    expect(meta('devil')).toEqual(['押 1~20 张 · 今天 3/20']);
    expect(meta('nim')).toEqual(['1~2 张一局 · 今天 0/10']);
    expect(meta('deal')).toEqual(['10,000 银币 · 今天 0/3']);
    expect(meta('darts')).toEqual(['今天 20/20 · 明天再来']);
    // 角标：划拳连胜、记忆调酒进行中、飞镖今天用完了；别的没有
    expect(w.get('[data-testid="game-tag-fg"]').text()).toBe('3 连胜');
    expect(w.get('[data-testid="game-tag-memory"]').text()).toBe('进行中');
    expect(w.get('[data-testid="game-memory"]').classes()).toContain('is-on');
    expect(w.get('[data-testid="game-tag-darts"]').text()).toBe('用完了');
    expect(w.get('[data-testid="game-darts"]').classes()).toContain('is-done');
    expect(w.findAll('[data-testid^="game-tag-"]')).toHaveLength(3);
  });
});

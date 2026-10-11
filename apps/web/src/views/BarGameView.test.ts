import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { barData } from '../components/bar/testData';
import { usePageTitleStore } from '../stores/pageTitle';
import type { BarGame } from '../utils/barGames';
import BarGameView from './BarGameView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { bar: vi.fn() } }));

const GAMES: BarGame[] = ['fg', 'cup', 'num', 'slot', 'devil', 'memory', 'darts', 'nim', 'spice', 'deal'];
const panel = (name: string) => ({
  props: ['data'],
  emits: ['reload'],
  template: `<button data-testid="panel" data-name="${name}" @click="$emit('reload')">${name} {{ data.tickets }}</button>`,
});
const stubs = {
  FgPanel: panel('fg'),
  CupPanel: panel('cup'),
  NumPanel: panel('num'),
  SlotPanel: panel('slot'),
  DevilPanel: panel('devil'),
  MemoryPanel: panel('memory'),
  DartsPanel: panel('darts'),
  NimPanel: panel('nim'),
  SpicePanel: panel('spice'),
  DealPanel: panel('deal'),
};
const mountGame = async (game: BarGame, withStubs = true) => {
  const w = mount(BarGameView, { props: { game }, global: withStubs ? { stubs } : {} });
  await flushPromises();
  return w;
};

describe('BarGameView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.bar).mockResolvedValue(barData({ tickets: 1234, krabCoins: 7, coin: 56789 }));
  });

  it('每个游戏一页：按 game 显示对应的面板，把概览传进去', async () => {
    for (const g of GAMES) {
      const w = await mountGame(g);
      const p = w.findAll('[data-testid="panel"]');
      expect(p, g).toHaveLength(1);
      expect(p[0]!.attributes('data-name')).toBe(g);
      expect(p[0]!.text()).toBe(g + ' 1234');
      w.unmount();
    }
  });

  it('读取失败写明，不显示面板', async () => {
    vi.mocked(endpoints.bar).mockRejectedValue(new Error('network'));
    const w = await mountGame('fg');
    expect(w.find('[data-testid="bar-failed"]').exists()).toBe(true);
    expect(w.find('[data-testid="panel"]').exists()).toBe(false);
  });

  it('面板要求刷新时重新读取', async () => {
    const w = await mountGame('memory');
    expect(endpoints.bar).toHaveBeenCalledTimes(1);
    await w.get('[data-testid="panel"]').trigger('click');
    await flushPromises();
    expect(endpoints.bar).toHaveBeenCalledTimes(2);
  });

  it('顶栏右边的余额：默认神秘礼券，老虎机是蟹币，一掷千金是银币；离开页面清掉', async () => {
    const store = usePageTitleStore();
    const fg = await mountGame('fg');
    expect(store.chip).toEqual({ art: 'res-voucher', text: '1,234', label: '神秘礼券 1,234' });
    fg.unmount();
    expect(store.chip).toBeNull();
    const slot = await mountGame('slot');
    expect(store.chip).toEqual({ art: 'res-krab', text: '7', label: '蟹币 7' });
    slot.unmount();
    const deal = await mountGame('deal');
    expect(store.chip).toEqual({ art: 'res-coin-silver', text: '56,789', label: '银币 56,789' });
    deal.unmount();
    // 数据还没读回来时不显示
    vi.mocked(endpoints.bar).mockReturnValue(new Promise(() => {}));
    mount(BarGameView, { props: { game: 'num' }, global: { stubs } });
    await flushPromises();
    expect(store.chip).toBeNull();
  });

  it('离开游戏页再回来，进行中的局按概览接着显示（终审 I2：原来是切标签保留面板状态）', async () => {
    const d = barData();
    d.nim.round = {
      table: 'novice',
      k: 3,
      pile: 12,
      left: 9,
      log: [{ who: 'me', take: 3 }],
      needFirst: false,
      coin: null,
      result: null,
      renown: 0,
      award: null,
    };
    vi.mocked(endpoints.bar).mockResolvedValue(d);
    const first = await mountGame('nim', false);
    expect(first.get('[data-testid="nim-status"] b').text()).toBe('9');
    first.unmount();
    const back = await mountGame('nim', false);
    expect(back.get('[data-testid="nim-status"] b').text()).toBe('9');
    expect(back.find('[data-testid="nim-start-novice"]').exists()).toBe(false);
  });
});

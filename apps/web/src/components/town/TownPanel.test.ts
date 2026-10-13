import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import { useToastStore } from '../../stores/toast';
import TownPanel from './TownPanel.vue';
import { townData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    townTalk: vi.fn(),
    townMayor: vi.fn(),
    townShake: vi.fn(),
    townHammer: vi.fn(),
  },
}));

/** 面板 Teleport 到 body：测试里把 teleport 桩掉（界面改版 P10） */
const mountIt = (data: ReturnType<typeof townData>) =>
  mount(TownPanel, { props: { data }, global: { stubs: { teleport: true, RouterLink: RouterLinkStub } } });

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

  it('神灯和星愿删掉了（道具减法，用户 2026-10-13）：没有星愿卡、许愿和共飨按钮', () => {
    const w = mountIt(townData());
    for (const id of ['bless-card', 'bless-none', 'wish', 'feast'])
      expect(w.find('[data-testid="' + id + '"]').exists()).toBe(false);
  });

  it('改天气（天气改版）：雷神锤换成一行入口，写现在的天气，点了去天气页用司天罗盘、晴雨签', () => {
    const w = mountIt(townData());
    const row = w.getComponent(RouterLinkStub);
    expect(row.props('to')).toBe('/weather');
    expect(row.text()).toContain('现在是 晴 · 司天罗盘、晴雨签在天气页用');
    expect(w.find('[data-testid="hammer-open"]').exists()).toBe(false);
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

  it('操作失败后也通知刷新：页面可能已经过时（比如跨天了）', async () => {
    vi.mocked(endpoints.townShake).mockRejectedValue(new Error('x'));
    const w = mountIt(townData());
    await w.find('[data-testid="shake"]').trigger('click');
    await flushPromises();
    expect(w.emitted('reload')).toHaveLength(1);
  });
});

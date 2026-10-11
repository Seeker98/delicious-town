import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { exchangeData, townData } from '../components/town/testData';
import SocietyNpcView, { type SocietyNpc } from './SocietyNpcView.vue';
import { usePageTitleStore } from '../stores/pageTitle';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    town: vi.fn(),
    townExchange: vi.fn(),
    townTalk: vi.fn(),
    townMayor: vi.fn(),
    lessons: vi.fn(),
    mc: vi.fn(),
    overview: vi.fn(),
  },
}));

async function mountAt(npc: SocietyNpc) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/society/:npc', component: SocietyNpcView, props: true }],
  });
  await router.push(`/society/${npc}`);
  const w = mount(SocietyNpcView, { props: { npc }, global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('协会里的 NPC 页（问题记录 441、443）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.town).mockResolvedValue(townData());
    vi.mocked(endpoints.townExchange).mockResolvedValue(exchangeData());
    vi.mocked(endpoints.lessons).mockResolvedValue({ mine: null, items: [] } as never);
    vi.mocked(endpoints.mc).mockResolvedValue({ learned: [], remnants: [] } as never);
    vi.mocked(endpoints.overview).mockResolvedValue({ disabledFeatures: [] } as never);
  });

  it('镇长大胃锅：每天聊天送食材种子（原来的大胃哥）、“告诉镇长嘻哈男孩在哪”、兑换稀有道具；不显示食材券，底下指到 13 哥和卡门', async () => {
    const w = await mountAt('mayor');
    expect(w.get('[data-testid="npc-mayor"]').text()).toContain('镇长大胃锅');
    // 顶栏标题写“NPC 名 · 功能”（界面改版 P2b）
    expect(usePageTitleStore().title).toBe('镇长大胃锅 · 稀有道具兑换');
    // 聊天按钮放进 NPC 大头像卡右边（界面改版 P10：只有按钮，不再写每天送什么）
    expect(w.get('[data-testid="npc-mayor"]').get('[data-testid="talk-bigEater"]').text()).toBe('聊天');
    expect(w.find('[data-testid="mayor-row"]').exists()).toBe(true);
    expect(
      w
        .get('[data-testid="mayor-tickets-hint"]')
        .findAll('a')
        .map((a) => a.attributes('href')),
    ).toEqual(['/society/bro13', '/society/carmen']);
    expect(w.findAll('[data-testid^="ex-row-"]').length).toBeGreaterThan(0);
    expect(w.find('[data-testid="lt-level-1"]').exists()).toBe(false);
    expect(w.find('[data-testid="mt-grid"]').exists()).toBe(false);
  });

  it('13 哥：每天聊天送喇叭，食材兑换券换食材；不显示稀有道具和神秘食材券', async () => {
    const w = await mountAt('bro13');
    expect(w.get('[data-testid="npc-bro13"]').text()).toContain('13 哥');
    expect(w.find('[data-testid="talk-bro13"]').exists()).toBe(true);
    expect(w.find('[data-testid="lt-level-1"]').exists()).toBe(true);
    expect(w.find('[data-testid^="ex-row-"]').exists()).toBe(false);
    expect(w.find('[data-testid="mt-grid"]').exists()).toBe(false);
  });

  it('卡门：神秘食材兑换券换神秘食材；没领过见面礼时有“见面礼”，领过就没有（问题记录 441）', async () => {
    const w = await mountAt('carmen');
    expect(w.get('[data-testid="npc-carmen"]').text()).toContain('卡门');
    expect(w.find('[data-testid="mt-grid"]').exists()).toBe(true);
    expect(w.find('[data-testid="lt-level-1"]').exists()).toBe(false);
    expect(w.find('[data-testid^="ex-row-"]').exists()).toBe(false);
    // 见面礼是 NPC 卡右边的实心按钮（界面改版 P10）
    const gift = w.get('[data-testid="npc-carmen"]').get('[data-testid="talk-carmen"]');
    expect(gift.text()).toBe('领见面礼');
    expect(gift.classes()).toContain('btn-primary');
    vi.mocked(endpoints.town).mockResolvedValue(townData({ bigEaterGift: true }));
    const got = await mountAt('carmen');
    expect(got.find('[data-testid="talk-carmen"]').exists()).toBe(false);
  });

  it('今天聊过了：NPC 卡右边写绿色小标签，不放灰掉的按钮（界面改版 P10）', async () => {
    vi.mocked(endpoints.town).mockResolvedValue(
      townData({ talked: { bigEater: true, wenjie: false, bro13: true, carmen: false } }),
    );
    for (const [npc, key] of [
      ['mayor', 'bigEater'],
      ['bro13', 'bro13'],
    ] as const) {
      const tag = (await mountAt(npc)).get(`[data-testid="talk-${key}"]`);
      expect(tag.element.tagName).toBe('SPAN');
      expect(tag.classes()).toContain('dt-tag-ok');
      expect(tag.text()).toBe('今天聊过了');
    }
  });

  it('点聊天调接口，然后重读广场数据', async () => {
    vi.mocked(endpoints.townTalk).mockResolvedValue({ talk: 'hi', rewards: [] } as never);
    const w = await mountAt('bro13');
    expect(endpoints.town).toHaveBeenCalledTimes(1);
    await w.get('[data-testid="talk-bro13"]').trigger('click');
    await flushPromises();
    expect(endpoints.townTalk).toHaveBeenCalledWith('bro13');
    expect(endpoints.town).toHaveBeenCalledTimes(2);
  });

  it('教室页不请求广场数据', async () => {
    await mountAt('classroom');
    expect(endpoints.town).not.toHaveBeenCalled();
  });

  it('教室', async () => {
    const w = await mountAt('classroom');
    expect(usePageTitleStore().title).toBe('教室');
    expect(w.find('[data-testid="classroom-panel"]').exists()).toBe(true);
  });

  it('直接从链接进来、区服关了这个功能：先读餐厅数据，不请求功能接口，写“暂未开放”（240-2 backlog ①a）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({ disabledFeatures: ['mysterious'] } as never);
    const w = await mountAt('classroom');
    expect(endpoints.overview).toHaveBeenCalled();
    expect(endpoints.lessons).not.toHaveBeenCalled();
    expect(w.find('[data-testid="npc-off"]').exists()).toBe(true);
  });

  it('餐厅数据读失败：写读取失败、带重试，重试成功后显示（backlog 第 ⑤ 批）', async () => {
    vi.mocked(endpoints.overview).mockRejectedValueOnce(new Error('net'));
    const w = await mountAt('classroom');
    expect(w.find('[data-testid="npc-rest-failed"]').exists()).toBe(true);
    await w.get('[data-testid="npc-rest-retry"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="npc-rest-failed"]').exists()).toBe(false);
    expect(w.find('[data-testid="classroom-panel"]').exists()).toBe(true);
  });

  it('餐厅数据还没回来：不挂功能面板，也不请求功能接口（质量期 ⑤ 终审，原来在广场的基金标签）', async () => {
    vi.mocked(endpoints.overview).mockReturnValue(new Promise(() => {}));
    const w = await mountAt('classroom');
    expect(w.find('[data-testid="classroom-panel"]').exists()).toBe(false);
    expect(endpoints.lessons).not.toHaveBeenCalled();
  });

  it('区服关了广场：镇长、13 哥、卡门页都不请求广场和兑换接口', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({ disabledFeatures: ['town'] } as never);
    for (const npc of ['mayor', 'bro13', 'carmen'] as const) {
      const w = await mountAt(npc);
      expect(w.find('[data-testid="npc-off"]').exists()).toBe(true);
    }
    expect(endpoints.town).not.toHaveBeenCalled();
    expect(endpoints.townExchange).not.toHaveBeenCalled();
  });

  it('读广场数据失败：写读取失败、带重试', async () => {
    vi.mocked(endpoints.town).mockRejectedValueOnce(new Error('net'));
    const w = await mountAt('bro13');
    expect(w.find('[data-testid="talk-bro13"]').exists()).toBe(false);
    await w.get('[data-testid="npc-town-retry"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="talk-bro13"]').exists()).toBe(true);
  });
});

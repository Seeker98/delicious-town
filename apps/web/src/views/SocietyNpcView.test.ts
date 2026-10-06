import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { exchangeData, townData } from '../components/town/testData';
import SocietyNpcView, { type SocietyNpc } from './SocietyNpcView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    town: vi.fn(),
    townExchange: vi.fn(),
    townTalk: vi.fn(),
    townMayor: vi.fn(),
    lessons: vi.fn(),
    mc: vi.fn(),
    fund: vi.fn(),
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
    vi.mocked(endpoints.fund).mockResolvedValue({
      days: 7,
      returnRate: 0.9,
      earlyRate: 0.7,
      coin: 0,
      deposit: null,
      tiers: [],
    });
  });

  it('镇长大胃锅：兑换稀有道具，还有“告诉镇长嘻哈男孩在哪”；不显示食材券', async () => {
    const w = await mountAt('mayor');
    expect(w.get('[data-testid="npc-mayor"]').text()).toContain('镇长大胃锅');
    expect(w.find('[data-testid="mayor-row"]').exists()).toBe(true);
    expect(w.findAll('[data-testid^="ex-row-"]').length).toBeGreaterThan(0);
    expect(w.find('[data-testid="lt-level"]').exists()).toBe(false);
    expect(w.find('[data-testid="mt-food"]').exists()).toBe(false);
  });

  it('13 哥：每天聊天送喇叭，食材兑换券换食材；不显示稀有道具和神秘食材券', async () => {
    const w = await mountAt('bro13');
    expect(w.get('[data-testid="npc-bro13"]').text()).toContain('13 哥');
    expect(w.find('[data-testid="talk-bro13"]').exists()).toBe(true);
    expect(w.find('[data-testid="lt-level"]').exists()).toBe(true);
    expect(w.find('[data-testid^="ex-row-"]').exists()).toBe(false);
    expect(w.find('[data-testid="mt-food"]').exists()).toBe(false);
  });

  it('卡门：神秘食材兑换券换神秘食材', async () => {
    const w = await mountAt('carmen');
    expect(w.get('[data-testid="npc-carmen"]').text()).toContain('卡门');
    expect(w.find('[data-testid="mt-food"]').exists()).toBe(true);
    expect(w.find('[data-testid="lt-level"]').exists()).toBe(false);
    expect(w.find('[data-testid^="ex-row-"]').exists()).toBe(false);
    expect(endpoints.town).not.toHaveBeenCalled();
  });

  it('盖乐瑞：小镇发展基金', async () => {
    const w = await mountAt('fund');
    expect(w.get('[data-testid="npc-gary"]').text()).toContain('盖乐瑞');
    expect(w.find('[data-testid="fund-panel"]').exists()).toBe(true);
  });

  it('教室', async () => {
    const w = await mountAt('classroom');
    expect(w.find('h5').text()).toBe('教室');
    expect(w.find('[data-testid="classroom-panel"]').exists()).toBe(true);
  });

  it('直接从链接进来、区服关了这个功能：先读餐厅数据，不请求功能接口，写“暂未开放”（240-2 backlog ①a）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({ disabledFeatures: ['fund'] } as never);
    const w = await mountAt('fund');
    expect(endpoints.overview).toHaveBeenCalled();
    expect(endpoints.fund).not.toHaveBeenCalled();
    expect(w.find('[data-testid="npc-off"]').exists()).toBe(true);
  });

  it('餐厅数据读失败：写读取失败、带重试，重试成功后显示（backlog 第 ⑤ 批）', async () => {
    vi.mocked(endpoints.overview).mockRejectedValueOnce(new Error('net'));
    const w = await mountAt('fund');
    expect(w.find('[data-testid="npc-rest-failed"]').exists()).toBe(true);
    await w.get('[data-testid="npc-rest-retry"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="npc-rest-failed"]').exists()).toBe(false);
    expect(w.find('[data-testid="fund-panel"]').exists()).toBe(true);
  });
});

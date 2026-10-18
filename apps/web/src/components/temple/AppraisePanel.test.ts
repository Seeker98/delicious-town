import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McOverviewDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useCatalogStore } from '../../stores/catalog';
import AppraisePanel from './AppraisePanel.vue';

vi.mock('../../api/endpoints', () => ({ endpoints: { mc: vi.fn(), mcAppraise: vi.fn() } }));

const overview: McOverviewDto = {
  star: 1,
  learned: [],
  remnants: [],
  current: null,
  saleRate: null,
  fragments: [0, 0, 0, 0, 0, 0],
  fragmentPerRemnant: 3,
  recipes: 2,
  tools: [
    {
      goodsId: 163,
      num: 0,
      min: 1,
      max: 6,
      rate: 0.28,
      perNum: 1,
      shopCoin: 90000,
      blackDiamond: 8,
      award: true,
      champion: false,
    },
    {
      goodsId: 165,
      num: 5,
      min: 3,
      max: 5,
      rate: 1,
      perNum: 2,
      shopCoin: null,
      blackDiamond: 30,
      award: true,
      champion: true,
    },
  ],
  cookies: 0,
  cookNums: [1],
  jobCard: null,
  seasonTable: [],
  season: {
    open: true,
    minStar: 1,
    weatherId: 11,
    roads: [1, 2],
    until: '2026-10-12T09:00:00.000Z',
    next: { at: '2026-10-12T09:00:00.000Z', type: 2, p: 0.58 },
  },
};

/** 数量面板用 Teleport 挂到 body 上：测试里把 teleport 桩掉，面板内容就留在 wrapper 里（同 ShopView.test） */
const mountPanel = () => mount(AppraisePanel, { global: { stubs: { teleport: true } } });

describe('AppraisePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
      mysterious: [{ id: 1, name: '秘·仿膳饽饽', level: 4, road: 1, nutritive: 31, coin: 1, foods: [] }],
    } as never);
    vi.mocked(endpoints.mc).mockResolvedValue(structuredClone(overview));
    vi.mocked(endpoints.mcAppraise).mockResolvedValue({
      results: [
        { ok: true, mcId: 1, num: 2 },
        { ok: false, text: '这只是一堆厕纸而已' },
      ],
    });
  });

  it('道具一行一种，点哪行鉴定哪种；次数不超过 神秘食谱和道具的持有数；显示结果', async () => {
    const w = mountPanel();
    await flushPromises();
    expect(w.find('[data-testid="tool-163"]').exists()).toBe(true);
    expect(w.find('[data-testid="tool-165"]').text()).toContain('持有 5');
    expect(w.find('[data-testid="recipes"]').text()).toContain('2');
    // 没点之前不弹面板
    expect(w.find('[data-testid="qty-ok"]').exists()).toBe(false);
    await w.find('[data-testid="appraise-open-165"]').trigger('click');
    await w.find('[data-testid="times"]').setValue('9');
    await w.find('[data-testid="qty-ok"]').trigger('click');
    await flushPromises();
    expect(endpoints.mcAppraise).toHaveBeenCalledWith(165, 2);
    // 鉴定完面板关掉
    expect(w.find('[data-testid="qty-ok"]').exists()).toBe(false);
    const rows = w.findAll('[data-testid="results"] > *');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain('秘·仿膳饽饽 残卷 ×2');
    expect(rows[0]!.text()).toContain('4 级');
    expect(rows[1]!.text()).toContain('这只是一堆厕纸而已');
  });
});

describe('AppraisePanel：按钮灰掉时写明原因（问题记录：鉴定按钮有时是灰色的）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('没有神秘食谱时提示每次鉴定要消耗 1 个', async () => {
    vi.mocked(endpoints.mc).mockResolvedValue({ ...structuredClone(overview), recipes: 0 });
    const w = mountPanel();
    await flushPromises();
    await w.find('[data-testid="appraise-open-165"]').trigger('click');
    expect(w.find('[data-testid="qty-ok"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="qty-reason"]').text()).toContain('没有神秘食谱');
  });

  it('选中的鉴定道具没有了时提示；有货时不显示提示', async () => {
    vi.mocked(endpoints.mc).mockResolvedValue(structuredClone(overview));
    const w = mountPanel();
    await flushPromises();
    await w.find('[data-testid="appraise-open-165"]').trigger('click');
    expect(w.find('[data-testid="qty-reason"]').exists()).toBe(false);
    expect(w.find('[data-testid="qty-ok"]').attributes('disabled')).toBeUndefined();
    await w.find('[data-testid="appraise-open-163"]').trigger('click');
    expect(w.find('[data-testid="qty-reason"]').text()).toContain('没有这个鉴定道具');
    expect(w.find('[data-testid="qty-ok"]').attributes('disabled')).toBeDefined();
  });

  it('写出选中的鉴定道具怎么获得（问题记录 415）', async () => {
    const w = mountPanel();
    await flushPromises();
    // 165：不在商店卖
    await w.find('[data-testid="appraise-open-165"]').trigger('click');
    expect(w.find('[data-testid="tool-how"]').text()).toBe(
      '获得: 黑市 30 钻、厨塔和酒吧等的随机奖励、昨日特色菜榜前 4 名',
    );
    await w.find('[data-testid="appraise-open-163"]').trigger('click');
    const how = '银币商店 90,000、黑市 8 钻、厨塔和酒吧等的随机奖励';
    expect(w.find('[data-testid="tool-how"]').text()).toBe(`获得: ${how}`);
    // 没有的道具在列表行里也写明怎么获得
    expect(w.find('[data-testid="tool-163"]').text()).toContain(`持有 0 · ${how}`);
  });
});

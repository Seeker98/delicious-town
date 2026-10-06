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
      guardian: true,
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
      guardian: false,
    },
  ],
  cookies: 0,
  cookNums: [1],
  starBook: true,
};

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
        { ok: true, mcId: 1, num: 2, blessed: true },
        { ok: false, text: '这只是一堆厕纸而已' },
      ],
    });
  });

  it('默认选有货的道具；次数不超过 神秘食谱和道具的持有数；显示结果', async () => {
    const w = mount(AppraisePanel);
    await flushPromises();
    expect((w.find('[data-testid="tool"]').element as HTMLSelectElement).value).toBe('165');
    expect(w.find('[data-testid="no-retry"]').exists()).toBe(true);
    await w.find('[data-testid="times"]').setValue('9');
    await w.find('[data-testid="appraise"]').trigger('click');
    await flushPromises();
    expect(endpoints.mcAppraise).toHaveBeenCalledWith(165, 2, false);
    const text = w.find('[data-testid="results"]').text();
    expect(text).toContain('秘·仿膳饽饽 残卷 ×2（星神眷恋）');
    expect(text).toContain('这只是一堆厕纸而已');
  });
});

describe('AppraisePanel：按钮灰掉时写明原因（问题记录：鉴定按钮有时是灰色的）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('没有神秘食谱时提示每次鉴定要消耗 1 个', async () => {
    vi.mocked(endpoints.mc).mockResolvedValue({ ...structuredClone(overview), recipes: 0 });
    const w = mount(AppraisePanel);
    await flushPromises();
    expect(w.find('[data-testid="appraise"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="appraise-block"]').text()).toContain('没有神秘食谱');
  });

  it('选中的鉴定道具没有了时提示；有货时不显示提示', async () => {
    vi.mocked(endpoints.mc).mockResolvedValue(structuredClone(overview));
    const w = mount(AppraisePanel);
    await flushPromises();
    expect(w.find('[data-testid="appraise-block"]').exists()).toBe(false);
    await w.find('[data-testid="tool"]').setValue('163');
    expect(w.find('[data-testid="appraise-block"]').text()).toContain('没有这个鉴定道具');
  });

  it('写出选中的鉴定道具怎么获得（问题记录 415）', async () => {
    const w = mount(AppraisePanel);
    await flushPromises();
    // 默认选有货的 165：不在商店卖
    expect(w.find('[data-testid="tool-how"]').text()).toBe(
      '获得：黑市 30 钻、厨塔和酒吧等的随机奖励、昨日特色菜冠军',
    );
    await w.find('[data-testid="tool"]').setValue(163);
    expect(w.find('[data-testid="tool-how"]').text()).toBe(
      '获得：银币商店 90,000、黑市 8 钻、厨塔和酒吧等的随机奖励、神殿守护兽暴击掉落',
    );
  });
});

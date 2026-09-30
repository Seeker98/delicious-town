import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McOverviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import TempleView from './TempleView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { mc: vi.fn(), mcAppraise: vi.fn() } }));

const overview: McOverviewDto = {
  star: 1,
  learned: [],
  remnants: [],
  current: null,
  recipes: 2,
  tools: [
    { goodsId: 163, num: 0, min: 1, max: 6, rate: 0.28, perNum: 1 },
    { goodsId: 165, num: 5, min: 3, max: 5, rate: 1, perNum: 2 },
  ],
  cookies: 0,
  cookNums: [1],
  starBook: true,
};

describe('TempleView', () => {
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
    const w = mount(TempleView);
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

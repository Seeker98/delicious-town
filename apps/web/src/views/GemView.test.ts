import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GemsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useToastStore } from '../stores/toast';
import GemView from './GemView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { gems: vi.fn(), gemLevelUp: vi.fn() } }));

const attrs = { cook: 1, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 };
const data: GemsDto = {
  items: [
    { goodsId: 44, num: 5, level: 1, nextId: 286, rate: 0.77, attrs },
    { goodsId: 341, num: 1, level: 6, nextId: null, rate: 0, attrs },
  ],
  luckRate: 0.17,
  strength: 100,
};

describe('GemView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.gems).mockResolvedValue(structuredClone(data));
    vi.mocked(endpoints.gemLevelUp).mockResolvedValue({ success: 1, lucky: 0, fail: 1, exp: 1000 });
  });

  it('自己的体力单独一行写“我的体力: N”，不接在规则说明后面（问题记录 532：原来末尾一句“体力 N。”看不懂）', async () => {
    vi.mocked(endpoints.gems).mockResolvedValue({ ...structuredClone(data), strength: 1234 });
    const w = mount(GemView);
    await flushPromises();
    expect(w.get('[data-testid="gem-strength"]').text()).toBe('我的体力: 1,234');
    expect(w.get('[data-testid="gem-intro"]').text()).not.toContain('体力 1');
    expect(w.get('[data-testid="gem-intro"]').text()).toMatch(/经验。$/);
  });

  it('组数不超过 持有/2；最高阶不能升；结果提示成功、失败和经验', async () => {
    const w = mount(GemView);
    await flushPromises();
    expect(w.text()).toContain('77.0%');
    expect(w.find('[data-testid="levelup-341"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="levelup-num-44"]').setValue('9');
    await w.find('[data-testid="levelup-44"]').trigger('click');
    await flushPromises();
    expect(endpoints.gemLevelUp).toHaveBeenCalledWith(44, 2);
    expect(
      useToastStore().items.some((x) => x.text.includes('成功 1') && x.text.includes('经验 1,000')),
    ).toBe(true);
  });
});

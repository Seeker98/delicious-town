import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { useRestaurantStore } from '../stores/restaurant';
import SocietyStarView from './SocietyStarView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { starNeed: vi.fn(), starUp: vi.fn(), overview: vi.fn() } }));

describe('SocietyStarView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('条件都满足时可以升星', async () => {
    vi.mocked(endpoints.starNeed).mockResolvedValue({
      star: 0,
      nextStar: 1,
      available: true,
      ok: true,
      award: { goods: [{ id: 117, num: 1 }] },
      checks: [{ key: 'level', need: 13, have: 13, ok: true }],
    });
    vi.mocked(endpoints.starUp).mockResolvedValue({ star: 1 });
    // 食谱页记住的下一星要求升星后作废（backlog 384 审查）
    useRestaurantStore().starNeed = { key: '7:0', value: { star: 1, need: 15 } };
    const w = mount(SocietyStarView);
    await flushPromises();
    await w.find('[data-testid="star-up"]').trigger('click');
    await flushPromises();
    expect(endpoints.starUp).toHaveBeenCalled();
    expect(useRestaurantStore().starNeed).toBeNull();
    // 星级也重读
    expect(endpoints.overview).toHaveBeenCalled();
  });

  it('条件不满足时按钮禁用；未开放的星级给出说明', async () => {
    vi.mocked(endpoints.starNeed).mockResolvedValue({
      star: 7,
      nextStar: 8,
      available: false,
      ok: false,
      award: null,
      checks: [],
    });
    const w = mount(SocietyStarView);
    await flushPromises();
    expect(w.find('[data-testid="star-up"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="star-reason"]').text()).toBe('8 星暂未开放');
  });

  it('条件不够时按钮灰掉，下面红字写第一项不够的差多少；条件清单不够的排前（界面改版 P10）', async () => {
    vi.mocked(endpoints.starNeed).mockResolvedValue({
      star: 2,
      nextStar: 3,
      available: true,
      ok: false,
      award: null,
      checks: [
        { key: 'level', need: 20, have: 25, ok: true },
        { key: 'cookbooks', need: 30, have: 28, ok: false },
      ],
    });
    const w = mount(SocietyStarView);
    await flushPromises();
    expect(w.get('[data-testid="star-up"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="star-reason"]').text()).toBe('已学食谱还差 2');
    expect(w.text()).toContain('还差 1 项');
    expect(
      w
        .findAll('[data-testid="need-checks"] > [data-testid^="need-"]')
        .map((r) => r.attributes('data-testid')),
    ).toEqual(['need-cookbooks', 'need-level']);
  });

  it('最高星：写已经是最高星级，没有按钮下的原因', async () => {
    vi.mocked(endpoints.starNeed).mockResolvedValue({
      star: 9,
      nextStar: null,
      available: true,
      ok: false,
      award: null,
      checks: [],
    });
    const w = mount(SocietyStarView);
    await flushPromises();
    expect(w.get('[data-testid="star-max"]').text()).toBe('已经是最高星级');
    expect(w.find('[data-testid="star-reason"]').exists()).toBe(false);
  });
});

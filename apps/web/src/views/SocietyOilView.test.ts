import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OilNeedDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { usePageTitleStore } from '../stores/pageTitle';
import SocietyOilView from './SocietyOilView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { oilNeed: vi.fn(), oilExpand: vi.fn() } }));

const need = (patch: Partial<OilNeedDto> = {}): OilNeedDto => ({
  oilLevel: 3,
  oilMax: 6_000,
  nextLevel: 4,
  nextOilMax: 8_000,
  checks: [
    { key: 'level', need: 10, have: 12, ok: true },
    { key: 'coin', need: 50_000, have: 20_000, ok: false },
  ],
  ok: false,
  ...patch,
});

describe('油壶扩容（界面改版 P10）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('对比卡写现在和扩容后；条件不够时按钮灰掉、下面红字写差多少', async () => {
    vi.mocked(endpoints.oilNeed).mockResolvedValue(need());
    const w = mount(SocietyOilView);
    await flushPromises();
    expect(usePageTitleStore().title).toBe('油壶扩容');
    const hero = w.get('[data-testid="oil-hero"]').text();
    expect(hero).toContain('3 级');
    expect(hero).toContain('上限 6,000');
    expect(hero).toContain('4 级');
    expect(hero).toContain('上限 8,000');
    expect(w.text()).toContain('还差 1 项');
    expect(w.findAll('[data-testid="need-checks"] [data-testid^="need-"]')).toHaveLength(2);
    expect(w.get('[data-testid="oil-up"]').text()).toBe('扩容到 4 级');
    expect(w.get('[data-testid="oil-up"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="oil-reason"]').text()).toBe('银币还差 30,000');
  });

  it('条件都够了可以扩容，扩完重读', async () => {
    vi.mocked(endpoints.oilNeed).mockResolvedValue(
      need({ ok: true, checks: [{ key: 'coin', need: 1, have: 2, ok: true }] }),
    );
    vi.mocked(endpoints.oilExpand).mockResolvedValue(undefined as never);
    const w = mount(SocietyOilView);
    await flushPromises();
    expect(w.text()).toContain('都够了');
    expect(w.find('[data-testid="oil-reason"]').exists()).toBe(false);
    await w.get('[data-testid="oil-up"]').trigger('click');
    await flushPromises();
    expect(endpoints.oilExpand).toHaveBeenCalled();
    expect(endpoints.oilNeed).toHaveBeenCalledTimes(2);
  });

  it('最高级：不写条件和按钮，写已经是最高级', async () => {
    vi.mocked(endpoints.oilNeed).mockResolvedValue(need({ nextLevel: null, nextOilMax: null, checks: [] }));
    const w = mount(SocietyOilView);
    await flushPromises();
    expect(w.get('[data-testid="oil-max"]').text()).toBe('已经是最高级');
    expect(w.find('[data-testid="oil-up"]').exists()).toBe(false);
  });

  it('读取失败写明，带重试', async () => {
    vi.mocked(endpoints.oilNeed).mockRejectedValueOnce(new Error('x')).mockResolvedValue(need());
    const w = mount(SocietyOilView);
    await flushPromises();
    expect(w.text()).toContain('读取失败');
    await w.get('button').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="oil-hero"]').exists()).toBe(true);
  });
});

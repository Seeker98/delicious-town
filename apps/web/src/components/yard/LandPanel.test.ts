import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import LandPanel from './LandPanel.vue';
import { landData, plantData, yardData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    yard: vi.fn(),
    yardExpand: vi.fn(),
    yardPlant: vi.fn(),
    yardWater: vi.fn(),
    yardFeed: vi.fn(),
    yardWeed: vi.fn(),
    yardDeworm: vi.fn(),
    yardRemove: vi.fn(),
    yardReap: vi.fn(),
  },
}));

async function mountWith(data = yardData()) {
  vi.mocked(endpoints.yard).mockResolvedValue(data);
  const w = mount(LandPanel);
  await flushPromises();
  return w;
}

describe('LandPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    for (const f of [
      endpoints.yardExpand,
      endpoints.yardPlant,
      endpoints.yardWater,
      endpoints.yardFeed,
      endpoints.yardWeed,
      endpoints.yardDeworm,
      endpoints.yardRemove,
      endpoints.yardReap,
    ]) {
      vi.mocked(f).mockResolvedValue({} as never);
    }
  });

  it('9 格：已开垦的地可以播种；下一块显示开垦价；其他未开垦', async () => {
    const w = await mountWith();
    expect(w.find('[data-testid="land-1"]').text()).toContain('1 号地');
    expect(w.find('[data-testid="expand"]').text()).toContain('200000');
    expect(w.find('[data-testid="land-3"]').text()).toContain('未开垦');
    await w.find('[data-testid="sow-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.yardPlant).toHaveBeenCalledWith(1, 1);
    await w.find('[data-testid="expand"]').trigger('click');
    await flushPromises();
    expect(endpoints.yardExpand).toHaveBeenCalled();
  });

  it('银币不够时开垦灰掉并写明原因；没有种子时播种灰掉', async () => {
    const w = await mountWith(yardData({ coin: 100, seeds: [] }));
    expect(w.find('[data-testid="expand"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="expand-block"]').text()).toContain('银币不够');
    expect(w.find('[data-testid="sow-1"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="land-1"]').text()).toContain('没有种子');
  });

  it('有虫时浇水灰掉并写明"先除虫"；点除虫调接口', async () => {
    const w = await mountWith(
      yardData({ lands: [landData(1, plantData({ worm: 1, canWater: true, minutes: 0 }))] }),
    );
    const land = w.find('[data-testid="land-1"]');
    expect(land.find('[data-testid="plant-water"]').attributes('disabled')).toBeDefined();
    expect(land.find('[data-testid="plant-block"]').text()).toBe('有虫，先除虫');
    await land.find('[data-testid="plant-deworm"]').trigger('click');
    await flushPromises();
    expect(endpoints.yardDeworm).toHaveBeenCalledWith(7);
  });

  it('收获期点收获；生长期施肥用选中的肥料；铲除要确认', async () => {
    const w = await mountWith(
      yardData({
        lands: [landData(1, plantData({ stage: 4, minutes: 600 })), landData(2, plantData({ id: 8 }))],
      }),
    );
    await w.find('[data-testid="land-1"] [data-testid="plant-reap"]').trigger('click');
    await flushPromises();
    expect(endpoints.yardReap).toHaveBeenCalledWith(7);
    await w.find('[data-testid="land-2"] [data-testid="plant-feed"]').trigger('click');
    await flushPromises();
    expect(endpoints.yardFeed).toHaveBeenCalledWith(8, 427);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await w.find('[data-testid="land-2"] [data-testid="plant-remove"]').trigger('click');
    expect(endpoints.yardRemove).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await w.find('[data-testid="land-2"] [data-testid="plant-remove"]').trigger('click');
    await flushPromises();
    expect(endpoints.yardRemove).toHaveBeenCalledWith(8);
    confirm.mockRestore();
  });
});

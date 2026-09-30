import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { AttrsDto, EquipDto, EquipOverviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useToastStore } from '../stores/toast';
import EquipView from './EquipView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    equipOverview: vi.fn(),
    equipList: vi.fn(),
    equipWear: vi.fn(),
    equipUnwear: vi.fn(),
    equipUnwearAll: vi.fn(),
    equipBatch: vi.fn(),
    equipPresetSave: vi.fn(),
    equipPresetApply: vi.fn(),
    equipPresetDelete: vi.fn(),
  },
}));

const attrs = (patch: Partial<AttrsDto> = {}): AttrsDto => ({
  cook: 0,
  cutting: 0,
  fire: 0,
  season: 0,
  creatives: 0,
  luck: 0,
  ...patch,
});
const piece = (patch: Partial<EquipDto> = {}): EquipDto => ({
  id: 1,
  goodsId: 30,
  part: 1,
  suitId: 0,
  minLevel: 0,
  stress: 0,
  curHole: 0,
  maxHole: 0,
  locked: false,
  worn: false,
  inPresets: [],
  base: attrs({ cook: 3 }),
  boost: attrs(),
  gem: attrs(),
  total: attrs({ cook: 3 }),
  gems: [],
  salvage: 1,
  sellPrice: 42000,
  ...patch,
});
const overview = (patch: Partial<EquipOverviewDto> = {}): EquipOverviewDto => ({
  worn: [piece({ worn: true, stress: 2 }), null, null, null, null],
  suits: [
    {
      suitId: 100,
      name: '真爱套装',
      count: 3,
      maxNum: 5,
      tiers: [
        { need: 3, desc: '上座率+5%, 挑剔率+3%', active: true },
        { need: 5, desc: '最终银币+5%, 幸运+52', active: false },
      ],
    },
  ],
  attrs: { points: attrs({ cook: 4 }), gear: attrs({ cook: 3 }), total: attrs({ cook: 7 }), power: 7 },
  presets: [{ id: 9, name: '日常', parts: [1, null, null, null, null] }],
  count: 3,
  level: 5,
  ...patch,
});

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: EquipView }],
  });
  const w = mount(EquipView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('EquipView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.equipOverview).mockResolvedValue(overview());
    vi.mocked(endpoints.equipList).mockResolvedValue([
      piece({ id: 2, goodsId: 47, minLevel: 13 }),
      piece({ id: 3, goodsId: 30 }),
    ]);
    vi.mocked(endpoints.equipWear).mockResolvedValue({});
    vi.mocked(endpoints.equipBatch).mockResolvedValue({ count: 1, essence: 1, coin: 0 });
    vi.mocked(endpoints.equipPresetSave).mockResolvedValue({ id: 10 });
    vi.mocked(endpoints.equipPresetApply).mockResolvedValue({ skipped: [3] });
  });

  it('显示属性、厨力、5 个部位和套装档位', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="power"]').text()).toBe('7');
    expect(w.find('[data-testid="slot-1"]').text()).toContain('+2');
    expect(w.find('[data-testid="slot-2"]').text()).toContain('空');
    expect(w.text()).toContain('真爱套装（3/5）');
    expect(w.text()).toContain('上座率+5%, 挑剔率+3%');
  });

  it('点部位列出厨具；等级不够的不能穿；点穿戴调用接口', async () => {
    const w = await mountView();
    await w.find('[data-testid="slot-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipList).toHaveBeenCalledWith(1);
    const tooHigh = w.find('[data-testid="wear-2"]');
    expect(tooHigh.attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('需要 13 级');
    await w.find('[data-testid="wear-3"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipWear).toHaveBeenCalledWith(3);
  });

  it('预设：保存当前、套用（提示留空的部位）', async () => {
    const w = await mountView();
    await w.find('[data-testid="open-presets"]').trigger('click');
    await w.find('[data-testid="preset-name"]').setValue('打架');
    await w.find('[data-testid="preset-save"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipPresetSave).toHaveBeenCalledWith('打架');
    await w.find('[data-testid="preset-apply-9"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipPresetApply).toHaveBeenCalledWith(9);
    expect(useToastStore().items.some((x) => x.text.includes('锅'))).toBe(true);
  });

  it('一键处理：默认只选干净的厨具，显示合计，确认后调用接口', async () => {
    vi.mocked(endpoints.equipList).mockResolvedValue([
      piece({ id: 4, salvage: 2 }),
      piece({ id: 5, locked: true }),
      piece({ id: 6, stress: 1 }),
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await mountView();
    await w.find('[data-testid="open-batch"]').trigger('click');
    await flushPromises();
    expect(w.findAll('[data-testid^="batch-item-"]')).toHaveLength(1);
    expect(w.find('[data-testid="batch-total"]').text()).toContain('2');
    await w.find('[data-testid="batch-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipBatch).toHaveBeenCalledWith([4], 'salvage');
  });
});

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { AttrsDto, EquipDetailDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useToastStore } from '../stores/toast';
import EquipDetailView from './EquipDetailView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    equipDetail: vi.fn(),
    equipStress: vi.fn(),
    equipRollback: vi.fn(),
    equipLock: vi.fn(),
    equipSalvage: vi.fn(),
    equipSell: vi.fn(),
    equipDrill: vi.fn(),
    equipInlay: vi.fn(),
    equipUngem: vi.fn(),
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
const detail = (patch: Partial<EquipDetailDto['equip']> = {}): EquipDetailDto => ({
  equip: {
    id: 7,
    goodsId: 56,
    part: 3,
    suitId: 5,
    minLevel: 13,
    stress: 2,
    curHole: 2,
    maxHole: 3,
    locked: false,
    worn: false,
    inPresets: [],
    base: attrs({ fire: 12 }),
    boost: attrs({ fire: 3 }),
    gem: attrs({ cook: 1 }),
    total: attrs({ fire: 15, cook: 1 }),
    gems: [{ id: 55, goodsId: 44, level: 1, attrs: attrs({ cook: 1 }) }],
    salvage: 36,
    sellPrice: 350000,
    ...patch,
  },
  rate: { base: 0.64, luck: 0.01, weather: 0, floor: 0.02, total: 0.67 },
  cost: { essence: 12, coin: 120000 },
  history: [
    {
      stress: 2,
      success: true,
      attr: 'fire',
      val: 3,
      lucky: false,
      floor: false,
      stone: false,
      at: '2026-09-30T00:00:00.000Z',
    },
  ],
  have: { essence: 30, stone: 1, drill: 1 },
  backItems: [{ goodsId: 225, num: 1, back: 1 }],
  gems: [{ goodsId: 44, num: 2, level: 1 }],
  ungemCoinPerLevel: 10000,
});

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/rest/equip/:id', component: EquipDetailView },
      { path: '/:p(.*)*', component: { template: '<p/>' } },
    ],
  });
  await router.push('/rest/equip/7');
  const w = mount({ template: '<RouterView />' }, { global: { plugins: [router] } });
  await flushPromises();
  return { w, router };
}

describe('EquipDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.equipDetail).mockResolvedValue(detail());
    vi.mocked(endpoints.equipStress).mockResolvedValue({
      success: true,
      lucky: false,
      floor: false,
      attr: 'fire',
      val: 4,
      stress: 3,
    });
    for (const f of [
      'equipRollback',
      'equipLock',
      'equipSalvage',
      'equipSell',
      'equipDrill',
      'equipInlay',
      'equipUngem',
    ] as const)
      vi.mocked(endpoints[f]).mockResolvedValue({} as never);
  });

  it('显示属性分项、成功率、花费；勾强化石强化，提示结果', async () => {
    const { w } = await mountView();
    // 标题里 +x 和部位之间要有间隔（问题记录）：模板换行处的空白会被 Vue 去掉，靠 ms-1
    expect(w.find('h5 small').classes()).toContain('ms-1');
    expect(w.text()).toContain('67.0%');
    expect(w.text()).toContain('精华 ×12');
    await w.find('[data-testid="stone"]').setValue(true);
    await w.find('[data-testid="stress-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipStress).toHaveBeenCalledWith(7, true);
    expect(useToastStore().items.some((x) => x.text.includes('强化成功 +3'))).toBe(true);
  });

  it('回退、打孔、镶嵌、摘除调用对应接口', async () => {
    const { w } = await mountView();
    await w.find('[data-testid="rollback-go"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="drill-go"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="ungem-55"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipRollback).toHaveBeenCalledWith(7, 225);
    expect(endpoints.equipDrill).toHaveBeenCalledWith(7);
    expect(endpoints.equipUngem).toHaveBeenCalledWith(55);
    expect(w.find('[data-testid="hole-count"]').text()).toContain('1/2');
    await w.find('[data-testid="inlay-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipInlay).toHaveBeenCalledWith(7, 44);
  });

  it('有宝石时分解和出售按钮禁用；干净的厨具确认后分解并回到厨具页', async () => {
    const { w: dirty } = await mountView();
    expect(dirty.find('[data-testid="salvage-go"]').attributes('disabled')).toBeDefined();
    vi.mocked(endpoints.equipDetail).mockResolvedValue(detail({ gems: [], gem: attrs() }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { w, router } = await mountView();
    await w.find('[data-testid="salvage-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipSalvage).toHaveBeenCalledWith(7);
    expect(router.currentRoute.value.path).toBe('/rest/equip');
  });
});

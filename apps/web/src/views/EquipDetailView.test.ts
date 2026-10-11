import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { AttrsDto, EquipDetailDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { usePageTitleStore } from '../stores/pageTitle';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { useConfirmStore } from '../stores/confirm';
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
    name: null,
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
  next: { gain: 2, total: 9 },
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
  // 底部面板（宝石）用 Teleport：测试里原地渲染
  const w = mount(
    { template: '<RouterView />' },
    { global: { plugins: [router], stubs: { teleport: true } } },
  );
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
    expect(w.text()).toContain('67.0%');
    expect(w.text()).toContain('精华 ×12');
    await w.find('[data-testid="stone"]').setValue(true);
    await w.find('[data-testid="stress-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipStress).toHaveBeenCalledWith(7, true);
    expect(useToastStore().items.some((x) => x.text.includes('强化成功 +3'))).toBe(true);
  });

  it('属性每项一根三段横条（基础、强化、宝石），右边合计，下面写加法；只列有数的属性（问题记录 530；界面改版 P7）', async () => {
    const { w } = await mountView();
    const rows = w.findAll('[data-testid^="attr-row-"]');
    // 夹具里只有火候（基础 12、强化 3）和厨艺（宝石 1）有数
    expect(rows.map((x) => x.attributes('data-testid'))).toEqual(['attr-row-cook', 'attr-row-fire']);
    const fire = w.get('[data-testid="attr-row-fire"]');
    expect(fire.get('.dt-attr-bar-total').text()).toBe('15');
    expect(fire.get('.dt-attr-bar-sum').text()).toBe('12 + 3');
    expect(fire.get('.is-a').attributes('style')).toContain('width: 80%');
    expect(fire.get('[role="img"]').attributes('aria-label')).toBe('火候 15 (基础 12 + 强化 3 + 宝石 0)');
    expect(w.get('[data-testid="attr-row-cook"] .dt-attr-bar-sum').text()).toBe('0 + 0 + 1');
    expect(w.find('[data-testid="no-attrs"]').exists()).toBe(false);
  });

  it('全是 0 时写一句“没有属性加成”，不列表格；不能镶宝石的写一句“这件不能镶宝石”（问题记录 530）', async () => {
    const zero = detail({
      base: attrs(),
      boost: attrs(),
      gem: attrs(),
      total: attrs(),
      gems: [],
      curHole: 0,
      maxHole: 0,
    });
    vi.mocked(endpoints.equipDetail).mockResolvedValue(zero);
    const { w } = await mountView();
    expect(w.get('[data-testid="no-attrs"]').text()).toBe('没有属性加成');
    expect(w.findAll('[data-testid^="attr-row-"]')).toHaveLength(0);
    expect(w.get('[data-testid="no-gems"]').text()).toBe('这件不能镶宝石');
    expect(w.find('[data-testid="hole-count"]').exists()).toBe(false);
  });

  it('回退、打孔、镶嵌、摘除调用对应接口', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { w } = await mountView();
    await w.find('[data-testid="rollback-go"]').trigger('click');
    await flushPromises();
    await w.find('[data-testid="drill-go"]').trigger('click');
    await flushPromises();
    // 界面改版 P7：点宝石弹出面板再摘；点空孔弹出面板再镶
    await w.find('[data-testid="gem-55"]').trigger('click');
    await w.find('[data-testid="ungem-55"]').trigger('click');
    await flushPromises();
    expect(endpoints.equipRollback).toHaveBeenCalledWith(7, 225);
    expect(endpoints.equipDrill).toHaveBeenCalledWith(7);
    expect(endpoints.equipUngem).toHaveBeenCalledWith(55);
    expect(w.find('[data-testid="hole-count"]').text()).toBe('1 / 2 孔 · 最多 3 孔');
    await w.find('[data-testid="hole-empty"]').trigger('click');
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

  it('标题下单独一行写部位和等级要求，再显示厨具说明（问题记录 130、134）', async () => {
    useCatalogStore().apply({
      version: 'x',
      goods: [{ id: 56, name: '沉默之度玛的静谧之镬', desc: '随机增加25点属性。度玛教徒弟从不开口。' }],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
    } as never);
    const { w } = await mountView();
    expect(usePageTitleStore().title).toBe('沉默之度玛的静谧之镬 +2');
    // 界面改版 P7：名字下面一排小标签
    expect(w.findAll('[data-testid="equip-meta"] .dt-tag').map((x) => x.text())).toEqual([
      '+2',
      '锅',
      '13 级可穿',
    ]);
    expect(w.find('[data-testid="equip-desc"]').text()).toBe('随机增加25点属性。度玛教徒弟从不开口。');
  });

  it('回退要先确认；取消就不回退（问题记录 128）', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { w } = await mountView();
    await w.find('[data-testid="rollback-go"]').trigger('click');
    await flushPromises();
    expect(ask.mock.calls[0]![0]).toContain('回退 1 级');
    expect(endpoints.equipRollback).not.toHaveBeenCalled();
  });

  it('摘除要花银币时先确认并写明花多少；免费时直接摘（问题记录 128）', async () => {
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { w } = await mountView();
    await w.find('[data-testid="gem-55"]').trigger('click');
    await w.find('[data-testid="ungem-55"]').trigger('click');
    await flushPromises();
    expect(ask.mock.calls[0]![0]).toContain('10,000 银币');
    expect(endpoints.equipUngem).not.toHaveBeenCalled();
    ask.mockClear();
    vi.mocked(endpoints.equipDetail).mockResolvedValue({ ...detail(), ungemCoinPerLevel: 0 });
    const { w: free } = await mountView();
    expect(free.text()).toContain('现在摘除免费');
    await free.find('[data-testid="gem-55"]').trigger('click');
    await free.find('[data-testid="ungem-55"]').trigger('click');
    await flushPromises();
    expect(ask).not.toHaveBeenCalled();
    expect(endpoints.equipUngem).toHaveBeenCalledWith(55);
  });

  it('回退道具的级数超过已强化的级数时，确认框按实际能退的写，并说明多的作废（终审）', async () => {
    vi.mocked(endpoints.equipDetail).mockResolvedValue({
      ...detail({ stress: 2 }),
      backItems: [{ goodsId: 226, num: 1, back: 3 }],
    });
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { w } = await mountView();
    await w.find('[data-testid="rollback-go"]').trigger('click');
    expect(ask.mock.calls[0]![0]).toContain('回退 2 级');
    expect(ask.mock.calls[0]![0]).toContain('多出的 1 级作废');
  });

  it('命名帽子的标题用显示名', async () => {
    vi.mocked(endpoints.equipDetail).mockResolvedValue(
      detail({ goodsId: 641, name: '玉•大橘之帽', stress: 0 }),
    );
    await mountView();
    expect(usePageTitleStore().title).toBe('玉•大橘之帽');
  });

  it('写明强化成功后属性总和到多少；满级不显示（问题记录 120）', async () => {
    const { w } = await mountView();
    // P7 用户反馈：加多少是标题行，到多少、不含宝石是下面一行灰字
    expect(w.find('[data-testid="stress-next"]').text()).toBe('成功后属性总和 +2');
    expect(w.find('[data-testid="stress-next-total"]').text()).toBe('到 9 (不含宝石)');
    expect(w.find('[data-testid="stress-next-total"]').classes()).toContain('dt-meta');
    vi.mocked(endpoints.equipDetail).mockResolvedValue({ ...detail(), rate: null, next: null });
    const { w: w2 } = await mountView();
    expect(w2.find('[data-testid="stress-next"]').exists()).toBe(false);
  });

  it('分解走确认面板，标成危险操作；强化、宝石两块各一张卡片（界面改版 P3）', async () => {
    vi.mocked(endpoints.equipDetail).mockResolvedValue(detail({ gems: [], gem: attrs() }));
    const spy = vi.spyOn(window, 'confirm');
    const store = useConfirmStore();
    store.hosts = 1;
    const { w } = await mountView();
    expect(w.get('[data-testid="stress-go"]').element.closest('.dt-card')).not.toBeNull();
    await w.get('[data-testid="salvage-go"]').trigger('click');
    await flushPromises();
    expect(spy).not.toHaveBeenCalled();
    expect(store.current?.danger).toBe(true);
    store.answer(false);
    await flushPromises();
    expect(endpoints.equipSalvage).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('强化过就一直有回退这一行；没有归元石、神秘水晶时写明、按钮灰掉（P7 用户反馈）', async () => {
    vi.mocked(endpoints.equipDetail).mockResolvedValue({ ...detail(), backItems: [] });
    const { w } = await mountView();
    expect(w.find('[data-testid="rollback-row"]').exists()).toBe(true);
    expect(w.get('[data-testid="rollback-none"]').text()).toContain('不能回退');
    expect(w.get('[data-testid="rollback-go"]').attributes('disabled')).toBeDefined();
    vi.mocked(endpoints.equipDetail).mockResolvedValue({ ...detail({ stress: 0 }), backItems: [] });
    const { w: fresh } = await mountView();
    expect(fresh.find('[data-testid="rollback-row"]').exists()).toBe(false);
  });

  it('镶着的宝石按种类画颜色，右下角写阶数（P7 用户反馈：原来都是一张图）', async () => {
    vi.mocked(endpoints.equipDetail).mockResolvedValue(
      detail({ gems: [{ id: 55, goodsId: 50104, level: 4, attrs: attrs({ cook: 1 }) }] }),
    );
    const { w } = await mountView();
    const gem = w.get('[data-testid="gem-55"]');
    expect(gem.get('.dt-hole-lv').text()).toBe('4');
    expect(gem.get('use').attributes('href')).toContain('#goods-jade-ruby');
  });
});

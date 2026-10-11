import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { AttrsDto, EquipDto, EquipOverviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useConfirmStore } from '../stores/confirm';
import { useToastStore } from '../stores/toast';
import EquipView from './EquipView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    equipOverview: vi.fn(),
    overview: vi.fn(),
    allocate: vi.fn(),
    equipList: vi.fn(),
    equipWear: vi.fn(),
    equipUnwear: vi.fn(),
    equipUnwearAll: vi.fn(),
    equipBatch: vi.fn(),
    equipPresetSave: vi.fn(),
    equipPresetApply: vi.fn(),
    equipPresetDelete: vi.fn(),
    gems: vi.fn(),
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
  name: null,
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
  income: { coinRate: 0.012, expRate: 0.0075, mcGoldRate: 0.009 },
  duelPower: { attack: 9, defend: 8 },
  presets: [{ id: 9, name: '日常', parts: [1, null, null, null, null] }],
  count: 3,
  level: 5,
  ...patch,
});

async function mountView(path = '/') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: EquipView }],
  });
  await router.push(path);
  // 底部面板传送到 body，测试里原地渲染（界面改版 P3）
  const w = mount(EquipView, { global: { plugins: [router], stubs: { teleport: true } } });
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

  it('属性不再是表格，每项一根横条（界面改版 P7）：深紫加点、浅紫厨具，按最高的合计算长度；右边合计，下面写加法', async () => {
    const w = await mountView();
    const box = w.get('[data-testid="attr-table"]');
    expect(box.find('table').exists()).toBe(false);
    expect(box.findAll('.dt-attr-bar')).toHaveLength(6);
    const cook = w.get('[data-testid="attr-cook"]');
    expect(cook.get('.is-a').attributes('style')).toContain('width: 57.14');
    expect(cook.get('.is-b').attributes('style')).toContain('width: 42.85');
    expect(cook.get('.dt-attr-bar-total').text()).toBe('7');
    expect(cook.get('.dt-attr-bar-sum').text()).toBe('4 + 3');
    expect(cook.get('[role="img"]').attributes('aria-label')).toBe('厨艺 7 (加点 4 + 厨具 3)');
  });

  it('显示属性、厨力、5 个部位和套装档位', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="power"]').text()).toBe('7');
    expect(w.find('[data-testid="slot-1"]').text()).toContain('+2');
    expect(w.find('[data-testid="slot-2"]').text()).toContain('空');
    const suit = w.get('[data-testid="suit"]');
    expect(suit.text()).toContain('真爱套装');
    expect(suit.text()).toContain('3 / 5 件');
    expect(suit.text()).toContain('上座率+5%, 挑剔率+3%');
    // 生效的一档打勾，没生效的不打
    expect(suit.findAll('.dt-equip-tier.is-on')).toHaveLength(1);
    // 赛厨时的厨力（问题记录 417）：顶部三个数字里的后两个
    expect(w.get('[data-testid="power-line"]').text()).toContain('赛厨进攻9');
    expect(w.get('[data-testid="power-line"]').text()).toContain('赛厨防守8');
    // 厨具收益加成（问题记录 411）：三个数字
    const income = w.get('[data-testid="gear-income"]').text();
    for (const s of ['最终银币+1.2%', '最终经验+0.75%', '特色菜金牌+0.9%']) expect(income).toContain(s);
  });

  it('部位和操作按钮在最上面，属性表在下面；厨力等三行只写数，说明收在“这些数怎么算”里（问题记录 530）', async () => {
    const w = await mountView();
    const html = w.html();
    expect(html.indexOf('data-testid="slot-1"')).toBeLessThan(html.indexOf('data-testid="attr-table"'));
    expect(html.indexOf('data-testid="open-presets"')).toBeLessThan(html.indexOf('data-testid="attr-table"'));
    expect(w.get('[data-testid="duel-power"]').text()).toBe('赛厨进攻9');
    expect(w.get('[data-testid="power-line"]').text()).not.toContain('五项之和');
    const notes = w.get('[data-testid="equip-notes"]');
    expect(notes.element.tagName).toBe('DETAILS');
    expect((notes.element as HTMLDetailsElement).open).toBe(false);
    expect(notes.text()).toContain('厨力、加成这些数怎么算');
    expect(notes.text()).toContain('五项之和');
    expect(notes.text()).toContain('厨塔页显示的是进攻');
    expect(notes.text()).toContain('幸运不算');
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
  it('厨具页可以加点：有剩余点数时显示输入，加点后刷新属性表（问题记录：加点在餐厅信息里很难找）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({
      attrLeft: 3,
      attrs: { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0 },
    } as never);
    vi.mocked(endpoints.allocate).mockResolvedValue({} as never);
    const w = await mountView();
    // 标题在顶栏（界面改版 P2a）；件数留在标题行的位置
    expect(w.get('[data-testid="equip-count"]').text()).toContain('件');
    expect(w.text()).toContain('赛厨的胜负看评委按色香味形养打分');
    // 界面改版 P7：属性卡片底下一行“3 点还没加”，点“加点”弹出面板
    expect(w.get('#attr-points').text()).toContain('3 点还没加');
    await w.get('[data-testid="open-points"]').trigger('click');
    expect(w.get('[data-testid="attr-left"]').element.closest('[role="dialog"]')).not.toBeNull();
    expect(w.find('[data-testid="attr-left"]').text()).toBe('还剩 3 点');
    await w.find('[data-testid="add-cook"]').setValue('2');
    await w.find('[data-testid="allocate"]').trigger('click');
    await flushPromises();
    expect(endpoints.allocate).toHaveBeenCalledWith({ cook: 2, cutting: 0, fire: 0 });
    expect(endpoints.equipOverview).toHaveBeenCalledTimes(2);
  });

  it('加点面板一项一行写明是哪一项；写出加完以后的合计（含厨具）（问题记录：不知道加的哪三个；界面改版 P7）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({
      attrLeft: 3,
      attrs: { cook: 20, cutting: 5, fire: 0, season: 0, creatives: 0 },
    } as never);
    vi.mocked(endpoints.equipOverview).mockResolvedValue(
      overview({
        attrs: {
          points: attrs({ cook: 20 }),
          gear: attrs({ cook: 7 }),
          total: attrs({ cook: 27, cutting: 5 }),
          power: 7,
        },
      }),
    );
    const w = await mountView();
    await w.get('[data-testid="open-points"]').trigger('click');
    expect(w.findAll('[data-testid^="label-"]').map((x) => x.text())).toEqual(['厨艺', '刀工', '火候']);
    // 界面改版 P3：步进器默认 0（每格上方写了是哪一项，原来留空的理由不在了）
    expect((w.find('[data-testid="add-cook"]').element as HTMLInputElement).value).toBe('0');
    await w.find('[data-testid="add-cook"]').setValue('2');
    expect(w.find('[data-testid="preview-cook"]').text()).toBe('27 → 29');
    expect(w.find('[data-testid="preview-cutting"]').text()).toBe('5');
  });

  it('每格最多填剩下的点数，超了自动退回；剩余点数跟着输入减少；“全加”把剩下的都填进这一格（问题记录 557）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({
      attrLeft: 10,
      attrs: { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0 },
    } as never);
    const w = await mountView();
    await w.get('[data-testid="open-points"]').trigger('click');
    const input = (k: string) => w.find(`[data-testid="add-${k}"]`).element as HTMLInputElement;
    await w.find('[data-testid="add-cook"]').setValue('99');
    expect(input('cook').value).toBe('10');
    await w.find('[data-testid="add-cook"]').setValue('7');
    expect(w.find('[data-testid="attr-left"]').text()).toBe('还剩 3 点');
    await w.find('[data-testid="add-cutting"]').setValue('8');
    expect(input('cutting').value).toBe('3');
    expect(w.find('[data-testid="attr-left"]').text()).toBe('还剩 0 点');
    // 步进器里清空在失焦时才算 0（界面改版 P3）
    await w.find('[data-testid="add-cutting"]').setValue('');
    await w.find('[data-testid="add-cutting"]').trigger('blur');
    await w.find('[data-testid="all-fire"]').trigger('click');
    expect(input('fire').value).toBe('3');
    expect(w.find('[data-testid="allocate"]').text()).toBe('加 10 点');
    expect(w.find('[data-testid="allocate"]').attributes('disabled')).toBeUndefined();
  });

  it('加点请求还没回来时“全加”也点不了（backlog 1010）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({
      attrLeft: 10,
      attrs: { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0 },
    } as never);
    let finish!: () => void;
    vi.mocked(endpoints.allocate).mockReturnValue(new Promise((r) => (finish = () => r({} as never))));
    const w = await mountView();
    await w.get('[data-testid="open-points"]').trigger('click');
    await w.find('[data-testid="add-cook"]').setValue('2');
    await w.find('[data-testid="allocate"]').trigger('click');
    expect(w.find('[data-testid="all-fire"]').attributes('disabled')).toBeDefined();
    finish();
    await flushPromises();
  });

  it('没有剩余点数时不显示加点输入', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({
      attrLeft: 0,
      attrs: { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0 },
    } as never);
    const w = await mountView();
    expect(w.find('[data-testid="add-cook"]').exists()).toBe(false);
  });
  it('清空一个输入框按 0 算，不会把数字拼成字符串（审查）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({
      attrLeft: 30,
      attrs: { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0 },
    } as never);
    vi.mocked(endpoints.allocate).mockResolvedValue({} as never);
    const w = await mountView();
    await w.get('[data-testid="open-points"]').trigger('click');
    await w.find('[data-testid="add-cook"]').setValue('');
    await w.find('[data-testid="add-cutting"]').setValue('1');
    expect(w.find('[data-testid="allocate"]').text()).toBe('加 1 点');
    await w.find('[data-testid="allocate"]').trigger('click');
    await flushPromises();
    expect(endpoints.allocate).toHaveBeenCalledWith({ cook: 0, cutting: 1, fire: 0 });
  });

  it('两个标签：装备、宝石；?tab=gem 打开宝石，不再有宝石按钮（界面改版 P2b）', async () => {
    vi.mocked(endpoints.gems).mockResolvedValue({ items: [], luckRate: 0.17, strength: 10 });
    const w = await mountView('/rest/equip?tab=gem');
    expect(w.findAll('[role="tab"]').map((x) => x.text())).toEqual(['装备', '宝石']);
    expect(w.find('[data-testid="gem-intro"]').exists()).toBe(true);
    expect(w.find('[data-testid="slot-1"]').exists()).toBe(false);
    const eq = await mountView('/rest/equip');
    expect(eq.find('[data-testid="slot-1"]').exists()).toBe(true);
    expect(eq.find('a[href="/rest/gem"]').exists()).toBe(false);
  });

  it('部位格子配图（铲、刀、锅、瓶、帽）；加点是步进器（界面改版 P3）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({
      attrLeft: 3,
      attrs: { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0 },
    } as never);
    const w = await mountView();
    const art = (p: number) => w.get(`[data-testid="slot-${p}"] use`).attributes('href')?.split('#')[1];
    expect([1, 2, 3, 4, 5].map(art)).toEqual([
      'slot-spatula',
      'slot-knife',
      'slot-pot',
      'slot-bottle',
      'slot-hat',
    ]);
    await w.get('[data-testid="open-points"]').trigger('click');
    expect(w.get('[data-testid="add-cook"]').element.closest('.dt-stepper')).not.toBeNull();
  });

  it('从餐厅信息“去加点”过来（#attr-points）直接打开加点面板；没有点可加时不打开（界面改版 P7）', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue({
      attrLeft: 3,
      attrs: { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0 },
    } as never);
    const w = await mountView('/rest/equip#attr-points');
    expect(w.find('[data-testid="attr-points-body"]').exists()).toBe(true);
    vi.mocked(endpoints.overview).mockResolvedValue({
      attrLeft: 0,
      attrs: { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0 },
    } as never);
    const none = await mountView('/rest/equip#attr-points');
    expect(none.find('[data-testid="attr-points-body"]').exists()).toBe(false);
  });

  it('穿戴中一个部位一行，名字写全不截成“…”；点一行弹出这个部位的厨具，穿着的排最前（界面改版 P7）', async () => {
    const w = await mountView();
    expect(w.get('[data-testid="slot-1"]').classes()).toContain('dt-row');
    await w.get('[data-testid="slot-1"]').trigger('click');
    await flushPromises();
    const dlg = w.get('[role="dialog"]');
    expect(dlg.text()).toContain('铲');
    expect(dlg.find('a[href="/rest/equip/3"]').exists()).toBe(true);
  });

  it('预设、一键处理放进底部面板；一键处理走确认面板，标成危险操作（界面改版 P3）', async () => {
    vi.mocked(endpoints.equipList).mockResolvedValue([piece({ id: 4, salvage: 2 })]);
    const spy = vi.spyOn(window, 'confirm');
    const store = useConfirmStore();
    store.hosts = 1;
    const w = await mountView();
    expect(w.find('[data-testid="sheet-presets"]').exists()).toBe(false);
    await w.get('[data-testid="open-presets"]').trigger('click');
    expect(w.get('[data-testid="sheet-presets"]').element.closest('[role="dialog"]')).not.toBeNull();
    await w.get('[data-testid="open-batch"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="sheet-presets"]').exists()).toBe(false);
    expect(w.get('[data-testid="sheet-batch"]').element.closest('[role="dialog"]')).not.toBeNull();
    await w.get('[data-testid="batch-go"]').trigger('click');
    await flushPromises();
    expect(spy).not.toHaveBeenCalled();
    expect(store.current?.danger).toBe(true);
    store.answer(true);
    await flushPromises();
    expect(endpoints.equipBatch).toHaveBeenCalledWith([4], 'salvage');
    spy.mockRestore();
  });

  it('一件厨具都没有时，部位下面是空状态，写去哪里获得（界面改版 P3）', async () => {
    vi.mocked(endpoints.equipOverview).mockResolvedValue(overview({ count: 0 }));
    const w = await mountView();
    const empty = w.get('[data-testid="equip-empty"]');
    expect(empty.get('use').attributes('href')).toContain('#empty-equip');
    expect(empty.get('a').attributes('href')).toBe('/temple');
  });
});
